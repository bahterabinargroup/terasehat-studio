import { hashPassword, safeEqual, randomHex, sha256hex, sessionCookie, publicUser, SESSION_DAYS } from "../../lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json().catch(() => ({}));
    const username = String(b.username || "").trim().toLowerCase();
    const password = String(b.password || "");
    const u = username ? await env.DB.prepare("SELECT * FROM users WHERE username = ?1 AND active = 1").bind(username).first() : null;
    // Hitung hash walau user tidak ada, biar waktu respons sama.
    const { hash } = await hashPassword(password, (u && u.pass_salt) || "0000");
    if (!u || !u.pass_hash || !safeEqual(hash, u.pass_hash)) {
      return Response.json({ ok: false, error: "Username atau password salah" }, { status: 401 });
    }
    const token = randomHex(32);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
      env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, datetime('now', '+${SESSION_DAYS} days'))`)
        .bind(await sha256hex(token), u.id),
      env.DB.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?1").bind(u.id),
    ]);
    return new Response(JSON.stringify({ ok: true, user: publicUser(u) }), {
      headers: { "content-type": "application/json", "set-cookie": sessionCookie(token, SESSION_DAYS * 86400) },
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
