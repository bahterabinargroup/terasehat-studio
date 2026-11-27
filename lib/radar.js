// Tarik video kompetitor yang dipantau (tabel competitors) lewat ScrapeCreators.
// Per akun: 1 kredit. Dari 10 video terbaru, 2 dengan views terbanyak masuk Radar.
// Rekomendasi (ai_takeaway) diisi Claude Brain di jadwal berikutnya.

const num = (v) => Number(v || 0) || 0;

export async function scanCompetitor(env, comp) {
  const apiKey = env.SCRAPECREATORS_API_KEY;
  if (!apiKey) throw new Error("SCRAPECREATORS_API_KEY belum diset");
  const res = await fetch(`https://api.scrapecreators.com/v3/tiktok/profile/videos?handle=${encodeURIComponent(comp.handle)}&region=ID&sort_by=latest`,
    { headers: { "x-api-key": apiKey, "User-Agent": "Mozilla/5.0" } });
  const j = await res.json().catch(() => ({}));
  const list = j.aweme_list || [];
  if (!res.ok || !list.length) throw new Error(j.message || j.error || `Akun @${comp.handle} tidak ditemukan atau belum ada video`);

  const top = list.map((v) => ({ v, views: num(v.statistics && v.statistics.play_count) }))
    .sort((a, b) => b.views - a.views).slice(0, 2);
  const stmts = top.map(({ v }) => {
    const st = v.statistics || {};
    const author = v.author || {};
    const desc = String(v.desc || "").trim();
    const hook = desc.split("#")[0].trim().slice(0, 200) || "(tanpa caption)";
    return env.DB.prepare(`
      INSERT INTO competitor_radar (id, source, brand_or_creator, handle, title_or_hook, metrics_summary, ai_takeaway, ref_url,
        views, likes, shares, followers, store_code, added_by, created_at, updated_at)
      VALUES (?1, 'ORGANIC', ?2, ?3, ?4, '', '', ?5, ?6, ?7, ?8, ?9, ?10, 'Otomatis', datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET views = excluded.views, likes = excluded.likes, shares = excluded.shares,
        followers = CASE WHEN excluded.followers > 0 THEN excluded.followers ELSE competitor_radar.followers END,
        updated_at = datetime('now')
    `).bind(`AUTO-${comp.store_code}-${v.aweme_id}`, comp.name || author.nickname || comp.handle, comp.handle, hook,
      `https://www.tiktok.com/@${comp.handle}/video/${v.aweme_id}`,
      num(st.play_count), num(st.digg_count), num(st.share_count), num(author.follower_count), comp.store_code);
  });
  stmts.push(env.DB.prepare("UPDATE competitors SET last_scan_at = datetime('now'), last_error = NULL WHERE id = ?1").bind(comp.id));
  await env.DB.batch(stmts);
  return top.length;
}

export async function scanCompetitors(env, filter = {}) {
  let sql = "SELECT * FROM competitors", args = [];
  if (filter.id) { sql += " WHERE id = ?1"; args = [filter.id]; }
  const rows = (await env.DB.prepare(sql).bind(...args).all()).results || [];
  const out = [];
  for (const c of rows) {
    try { out.push({ handle: c.handle, store_code: c.store_code, videos: await scanCompetitor(env, c) }); }
    catch (e) {
      await env.DB.prepare("UPDATE competitors SET last_scan_at = datetime('now'), last_error = ?2 WHERE id = ?1").bind(c.id, String(e.message).slice(0, 200)).run();
      out.push({ handle: c.handle, store_code: c.store_code, error: e.message });
    }
  }
  return out;
}

// Dipanggil saat dashboard/jadwal membuka /api/state: paling sering 1x per 20 jam.
export async function maybeScanCompetitors(env) {
  const row = await env.DB.prepare("SELECT value FROM app_meta WHERE key = 'radar_scanned_at'").first();
  if (row && Date.now() - Date.parse(row.value.replace(" ", "T") + "Z") < 20 * 3600e3) return null;
  await env.DB.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('radar_scanned_at', datetime('now'))").run();
  return scanCompetitors(env);
}
