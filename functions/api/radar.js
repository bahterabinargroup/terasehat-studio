// Radar Kompetitor.
// POST { action: "save", id?, store_code, source, brand_or_creator, handle, title_or_hook, views, likes, shares, followers,
//        ai_takeaway, ref_url, contact_email }                 → tambah / edit catatan (tombol + Tambah / Edit)
// POST { action: "delete", id }
// POST { action: "watch_add", store_code, handle, name? }       → pantau akun kompetitor (ditarik otomatis 1x sehari)
// POST { action: "watch_remove", id }
// POST { action: "scan", id? }                                  → tarik sekarang (owner / jadwal cloud)
import { canSeeStore } from "../../lib/auth.js";
import { scanCompetitors } from "../../lib/radar.js";

const SOURCES = ["ORGANIC", "ADS", "PRODUCT", "CREATOR"];
const int = (v) => Math.max(0, Math.round(Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0));
const str = (v, n) => String(v ?? "").trim().slice(0, n);
const bad = (error, status = 400) => Response.json({ ok: false, error }, { status });

export async function onRequestPost({ request, env, data }) {
  try {
    const user = data.user;
    const b = await request.json().catch(() => ({}));
    const storeOk = async (code) => {
      const row = await env.DB.prepare("SELECT code FROM stores WHERE code = ?1").bind(code).first();
      return row && canSeeStore(user, code);
    };

    if (b.action === "save") {
      const store = str(b.store_code, 10).toUpperCase();
      if (!(await storeOk(store))) return bad("Toko tidak ada atau bukan tokomu", 403);
      const brand = str(b.brand_or_creator, 120);
      if (!brand) return bad("Nama brand / kreator wajib diisi");
      const source = SOURCES.includes(b.source) ? b.source : "ORGANIC";
      const handle = str(b.handle, 40).replace(/^@/, "").toLowerCase();
      const ref = str(b.ref_url, 500);
      if (ref && !/^https?:\/\//i.test(ref)) return bad("Link sumber harus diawali https://");
      let id = str(b.id, 80);
      if (id) {
        const cur = await env.DB.prepare("SELECT store_code FROM competitor_radar WHERE id = ?1").bind(id).first();
        if (!cur) return bad("Catatan tidak ditemukan", 404);
        if (!canSeeStore(user, cur.store_code)) return bad("Bukan tokomu", 403);
      } else {
        id = "R-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      }
      await env.DB.prepare(`
        INSERT INTO competitor_radar (id, source, brand_or_creator, handle, title_or_hook, metrics_summary, ai_takeaway, ref_url,
          contact_email, views, likes, shares, followers, store_code, added_by, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET source = excluded.source, brand_or_creator = excluded.brand_or_creator, handle = excluded.handle,
          title_or_hook = excluded.title_or_hook, ai_takeaway = excluded.ai_takeaway, ref_url = excluded.ref_url,
          contact_email = excluded.contact_email, views = excluded.views, likes = excluded.likes, shares = excluded.shares,
          followers = excluded.followers, store_code = excluded.store_code, updated_at = datetime('now')
      `).bind(id, source, brand, handle, str(b.title_or_hook, 300), str(b.ai_takeaway, 1500), ref, str(b.contact_email, 120),
        int(b.views), int(b.likes), int(b.shares), int(b.followers), store, str(user.name || user.username, 60)).run();
      return Response.json({ ok: true, id });
    }

    if (b.action === "delete") {
      const cur = await env.DB.prepare("SELECT store_code FROM competitor_radar WHERE id = ?1").bind(str(b.id, 80)).first();
      if (!cur) return bad("Catatan tidak ditemukan", 404);
      if (!canSeeStore(user, cur.store_code)) return bad("Bukan tokomu", 403);
      await env.DB.prepare("DELETE FROM competitor_radar WHERE id = ?1").bind(str(b.id, 80)).run();
      return Response.json({ ok: true });
    }

    if (b.action === "watch_add") {
      const store = str(b.store_code, 10).toUpperCase();
      if (!(await storeOk(store))) return bad("Toko tidak ada atau bukan tokomu", 403);
      const handle = str(b.handle, 60).replace(/^.*tiktok\.com\/@/i, "").replace(/^@/, "").split(/[/?]/)[0].toLowerCase();
      if (!/^[a-z0-9._]{2,40}$/.test(handle)) return bad("Username TikTok tidak valid");
      const res = await env.DB.prepare("INSERT OR IGNORE INTO competitors (store_code, handle, name) VALUES (?1, ?2, ?3)")
        .bind(store, handle, str(b.name, 80)).run();
      if (!(res.meta && res.meta.changes)) return bad(`@${handle} sudah dipantau untuk toko ini`);
      const row = await env.DB.prepare("SELECT id FROM competitors WHERE store_code = ?1 AND handle = ?2").bind(store, handle).first();
      // Langsung tarik sekali supaya hasilnya kelihatan tanpa menunggu jadwal.
      const scan = await scanCompetitors(env, { id: row.id });
      return Response.json({ ok: true, scan: scan[0] });
    }

    if (b.action === "watch_remove") {
      const cur = await env.DB.prepare("SELECT store_code FROM competitors WHERE id = ?1").bind(Number(b.id)).first();
      if (!cur) return bad("Tidak ditemukan", 404);
      if (!canSeeStore(user, cur.store_code)) return bad("Bukan tokomu", 403);
      await env.DB.prepare("DELETE FROM competitors WHERE id = ?1").bind(Number(b.id)).run();
      return Response.json({ ok: true });
    }

    if (b.action === "scan") {
      if (!["owner", "system"].includes(user.role)) return bad("Hanya owner", 403);
      return Response.json({ ok: true, result: await scanCompetitors(env, b.id ? { id: Number(b.id) } : {}) });
    }

    return bad("action tidak dikenal");
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
