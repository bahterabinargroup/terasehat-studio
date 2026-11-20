// Kelola user dashboard. Hanya owner.
// POST { action: "create", username, name, role, stores } -> password sementara (sekali tampil)
// POST { action: "update", id, name?, role?, stores?, active? }
// POST { action: "reset", id } -> password sementara baru
import { hashPassword, randomHex } from "../../lib/auth.js";

const ROLES = ["owner", "spv", "adv"];
const tempPassword = () => randomHex(5); // 10 karakter, wajib diganti saat login pertama

function cleanStores(s) {
  return (Array.isArray(s) ? s : String(s || "").split(",")).map((x) => String(x).trim().toUpperCase()).filter(Boolean).join(",");
}

export async function onRequestGet({ env, data }) {
  if (!["owner", "system"].includes(data.user.role)) return Response.json({ ok: false, error: "Hanya owner" }, { status: 403 });
  const rows = (await env.DB.prepare("SELECT id, username, name, role, stores, must_change, active, last_login, created_at FROM users ORDER BY role, name").all()).results || [];
  return Response.json({ ok: true, users: rows });
}

export async function onRequestPost({ request, env, data }) {
  try {
    if (!["owner", "system"].includes(data.user.role)) return Response.json({ ok: false, error: "Hanya owner" }, { status: 403 });
    const b = await request.json().catch(() => ({}));

    if (b.action === "create") {
      const username = String(b.username || "").trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return Response.json({ ok: false, error: "Username 3-30 huruf kecil/angka" }, { status: 400 });
      if (!ROLES.includes(b.role)) return Response.json({ ok: false, error: "Peran tidak valid" }, { status: 400 });
      const pw = b.password && String(b.password).length >= 8 ? String(b.password) : tempPassword();
      const h = await hashPassword(pw);
      await env.DB.prepare(`INSERT INTO users (username, name, role, stores, pass_hash, pass_salt, must_change) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)`)
        .bind(username, String(b.name || username), b.role, b.role === "adv" ? cleanStores(b.stores) : "", h.hash, h.salt).run();
      return Response.json({ ok: true, username, temp_password: pw });
    }

    const id = Number(b.id);
    const target = id ? await env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first() : null;
    if (!target) return Response.json({ ok: false, error: "User tidak ada" }, { status: 404 });

    if (b.action === "reset") {
      const pw = tempPassword();
      const h = await hashPassword(pw);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET pass_hash = ?1, pass_salt = ?2, must_change = 1 WHERE id = ?3").bind(h.hash, h.salt, id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(id),
      ]);
      return Response.json({ ok: true, username: target.username, temp_password: pw });
    }

    if (b.action === "update") {
      if (id === data.user.id && (b.active === false || (b.role && b.role !== "owner"))) {
        return Response.json({ ok: false, error: "Tidak bisa menonaktifkan atau menurunkan peran akun sendiri" }, { status: 400 });
      }
      const role = ROLES.includes(b.role) ? b.role : target.role;
      const stores = b.stores !== undefined ? cleanStores(b.stores) : target.stores;
      const active = b.active === undefined ? target.active : (b.active ? 1 : 0);
      const stmts = [env.DB.prepare("UPDATE users SET name = ?1, role = ?2, stores = ?3, active = ?4 WHERE id = ?5")
        .bind(String(b.name || target.name), role, role === "adv" ? stores : "", active, id)];
      if (!active) stmts.push(env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(id));
      await env.DB.batch(stmts);
      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: "action tidak dikenal" }, { status: 400 });
  } catch (err) {
    const msg = /UNIQUE/.test(err.message) ? "Username sudah dipakai" : err.message;
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
