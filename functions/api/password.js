// Ganti password sendiri. Wajib saat login pertama (must_change).
import { hashPassword, safeEqual } from "../../lib/auth.js";

export async function onRequestPost({ request, env, data }) {
  try {
    const u = data.user;
    if (!u || !u.id) return Response.json({ ok: false, error: "Login dulu" }, { status: 401 });
    const b = await request.json().catch(() => ({}));
    const oldPw = String(b.old_password || ""), newPw = String(b.new_password || "");
    const { hash } = await hashPassword(oldPw, u.pass_salt);
    if (!safeEqual(hash, u.pass_hash)) return Response.json({ ok: false, error: "Password lama salah" }, { status: 400 });
    if (newPw.length < 8) return Response.json({ ok: false, error: "Password baru minimal 8 karakter" }, { status: 400 });
    if (newPw === oldPw) return Response.json({ ok: false, error: "Password baru harus beda" }, { status: 400 });
    const h = await hashPassword(newPw);
    await env.DB.prepare("UPDATE users SET pass_hash = ?1, pass_salt = ?2, must_change = 0 WHERE id = ?3").bind(h.hash, h.salt, u.id).run();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
