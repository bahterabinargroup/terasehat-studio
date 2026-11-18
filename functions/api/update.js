// Aksi dari dashboard: Approve / Revisi / Tayang untuk Visual Guide, centang Daily Checklist, dan isi saldo iklan.
const SCRIPT_STATUSES = ["waiting_check", "approved", "revision", "filming", "published"];

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const b = await request.json().catch(() => ({}));

    if (b.type === "script_status") {
      if (!SCRIPT_STATUSES.includes(b.status)) {
        return Response.json({ ok: false, error: "status tidak valid" }, { status: 400 });
      }
      await env.DB.prepare(
        "UPDATE scripts_briefs SET human_status = ?1, human_notes = COALESCE(?2, human_notes) WHERE script_code = ?3"
      ).bind(b.status, b.notes ?? null, String(b.script_code || "")).run();
      return Response.json({ ok: true });
    }

    if (b.type === "checklist") {
      await env.DB.prepare(
        "UPDATE daily_checklists SET is_done = ?1, updated_at = datetime('now') WHERE id = ?2"
      ).bind(b.is_done ? 1 : 0, String(b.id || "")).run();
      return Response.json({ ok: true });
    }

    // Saldo akun iklan diisi manual (API TikTok tidak memberikan saldo GMV Max).
    // Dashboard menguranginya otomatis dengan spend harian sejak tanggal diisi.
    if (b.type === "ads_balance") {
      const bal = Number(b.balance_idr);
      if (!Number.isFinite(bal) || bal < 0) return Response.json({ ok: false, error: "saldo tidak valid" }, { status: 400 });
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const row = await env.DB.prepare("SELECT cost FROM ads_daily_spend WHERE date = ?1").bind(today).first();
      const warn = Number(b.warn_days) > 0 ? Number(b.warn_days) : 3;
      await env.DB.prepare(`
        INSERT OR REPLACE INTO ads_balance (id, balance_idr, set_date, spend_at_set, warn_days, set_at)
        VALUES (1, ?1, ?2, ?3, ?4, datetime('now'))
      `).bind(bal, today, row ? Number(row.cost) || 0 : 0, warn).run();
      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: "type tidak dikenal" }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
