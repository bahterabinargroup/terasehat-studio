// Aksi dari dashboard: Approve / Revisi / Tayang untuk Visual Guide, centang Daily Checklist, dan isi saldo iklan.
// Tiap aksi dicek: user hanya boleh mengubah data toko yang boleh dia lihat.
import { canSeeStore } from "../../lib/auth.js";
import { cleanCraft, buildCraftPrompt } from "../../lib/craft.js";

const SCRIPT_STATUSES = ["waiting_check", "approved", "revision", "filming", "published"];
const forbidden = () => Response.json({ ok: false, error: "Kamu tidak punya akses ke toko ini" }, { status: 403 });

export async function onRequestPost({ request, env, data }) {
  try {
    const b = await request.json().catch(() => ({}));
    const user = data.user;

    if (b.type === "script_status") {
      if (!SCRIPT_STATUSES.includes(b.status)) return Response.json({ ok: false, error: "status tidak valid" }, { status: 400 });
      const row = await env.DB.prepare("SELECT store_code FROM scripts_briefs WHERE script_code = ?1").bind(String(b.script_code || "")).first();
      if (!row) return Response.json({ ok: false, error: "Visual Guide tidak ada" }, { status: 404 });
      if (!canSeeStore(user, row.store_code)) return forbidden();
      await env.DB.prepare(
        "UPDATE scripts_briefs SET human_status = ?1, human_notes = COALESCE(?2, human_notes) WHERE script_code = ?3"
      ).bind(b.status, b.notes ?? null, String(b.script_code || "")).run();
      return Response.json({ ok: true });
    }

    // Craft Prompt: simpan pilihan arahan, langsung susun draf prompt. Claude menyempurnakannya di jadwal berikutnya.
    if (b.type === "craft_save") {
      const g = await env.DB.prepare("SELECT * FROM scripts_briefs WHERE script_code = ?1").bind(String(b.script_code || "")).first();
      if (!g) return Response.json({ ok: false, error: "Visual Guide tidak ada" }, { status: 404 });
      if (!canSeeStore(user, g.store_code)) return forbidden();
      const craft = cleanCraft(b.craft || {});
      const dna = g.based_on_dna
        ? await env.DB.prepare("SELECT id, formula_hook, visual_guideline FROM winning_dna WHERE id = ?1").bind(g.based_on_dna).first()
        : null;
      const prompt = buildCraftPrompt(g, craft, dna);
      await env.DB.prepare(
        "UPDATE scripts_briefs SET craft_json = ?1, craft_prompt = ?2, craft_status = 'draft', craft_updated_at = datetime('now') WHERE script_code = ?3"
      ).bind(JSON.stringify(craft), prompt, g.script_code).run();
      return Response.json({ ok: true, craft, prompt, craft_status: "draft" });
    }

    if (b.type === "checklist") {
      const row = await env.DB.prepare("SELECT store_code FROM daily_checklists WHERE id = ?1").bind(String(b.id || "")).first();
      if (!row) return Response.json({ ok: false, error: "Checklist tidak ada" }, { status: 404 });
      if (!canSeeStore(user, row.store_code)) return forbidden();
      await env.DB.prepare(
        "UPDATE daily_checklists SET is_done = ?1, updated_at = datetime('now') WHERE id = ?2"
      ).bind(b.is_done ? 1 : 0, String(b.id || "")).run();
      return Response.json({ ok: true });
    }

    // Saldo akun iklan per toko diisi manual (API TikTok tidak memberikan saldo GMV Max).
    // Dashboard menguranginya otomatis dengan spend harian sejak tanggal diisi.
    if (b.type === "ads_balance") {
      const store = String(b.store_code || "").toUpperCase();
      if (!store) return Response.json({ ok: false, error: "store_code wajib" }, { status: 400 });
      if (!canSeeStore(user, store)) return forbidden();
      const bal = Number(b.balance_idr);
      if (!Number.isFinite(bal) || bal < 0) return Response.json({ ok: false, error: "saldo tidak valid" }, { status: 400 });
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const row = await env.DB.prepare("SELECT cost FROM ads_daily_spend WHERE store_code = ?1 AND date = ?2").bind(store, today).first();
      const warn = Number(b.warn_days) > 0 ? Number(b.warn_days) : 3;
      await env.DB.prepare(`
        INSERT OR REPLACE INTO ads_balance (store_code, balance_idr, set_date, spend_at_set, warn_days, set_at)
        VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
      `).bind(store, bal, today, row ? Number(row.cost) || 0 : 0, warn).run();
      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: "type tidak dikenal" }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
