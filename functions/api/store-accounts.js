// Daftar akun TikTok milik tiap toko (Akun Utama / Akun Pemasaran). Hanya owner yang boleh ubah.
// POST { action: "add", store_code, handle, kind: "OFFICIAL"|"MARKETING", display_name? }
// POST { action: "remove", handle }
import { classifyAccounts } from "../../lib/accounts.js";

export async function onRequestPost({ request, env, data }) {
  try {
    if (!["owner", "system"].includes(data.user.role)) return Response.json({ ok: false, error: "Hanya owner" }, { status: 403 });
    const b = await request.json().catch(() => ({}));
    const handle = String(b.handle || "").trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9._]{2,40}$/.test(handle)) return Response.json({ ok: false, error: "Username TikTok tidak valid" }, { status: 400 });

    if (b.action === "add") {
      const store = String(b.store_code || "").toUpperCase();
      if (!["OFFICIAL", "MARKETING"].includes(b.kind)) return Response.json({ ok: false, error: "Jenis akun tidak valid" }, { status: 400 });
      const ok = await env.DB.prepare("SELECT code FROM stores WHERE code = ?1").bind(store).first();
      if (!ok) return Response.json({ ok: false, error: "Toko tidak ada" }, { status: 400 });
      await env.DB.prepare(`INSERT OR REPLACE INTO store_accounts (handle, store_code, kind, display_name) VALUES (?1, ?2, ?3, ?4)`)
        .bind(handle, store, b.kind, String(b.display_name || "")).run();
      await classifyAccounts(env, store);
      return Response.json({ ok: true });
    }
    if (b.action === "remove") {
      const row = await env.DB.prepare("SELECT store_code FROM store_accounts WHERE handle = ?1").bind(handle).first();
      await env.DB.prepare("DELETE FROM store_accounts WHERE handle = ?1").bind(handle).run();
      if (row) await classifyAccounts(env, row.store_code);
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false, error: "action tidak dikenal" }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
