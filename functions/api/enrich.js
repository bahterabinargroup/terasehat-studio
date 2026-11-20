// Lengkapi nama akun, caption, tanggal posting, durasi, dan statistik organik video
// dengan membaca halaman publik TikTok (gratis, tanpa kredit ScrapeCreators).
// Target: video iklan GMV Max yang nama akunnya belum diketahui (kebanyakan kreator afiliasi luar).
//
// POST body: { limit?: 15, ids?: ["7707334046623206676", ...], force?: false }

import { classifyAccounts } from "../../lib/accounts.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function fetchTikTokVideo(id) {
  const res = await fetch(`https://www.tiktok.com/@_/video/${id}`, {
    headers: { "User-Agent": UA, "Accept-Language": "id-ID,id;q=0.9,en;q=0.8" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const html = await res.text();
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("data video tidak ada di halaman");
  const scope = JSON.parse(m[1]).__DEFAULT_SCOPE__ || {};
  const item = scope["webapp.video-detail"] && scope["webapp.video-detail"].itemInfo && scope["webapp.video-detail"].itemInfo.itemStruct;
  if (!item || !item.author) throw new Error("video tidak ditemukan / dihapus");
  const st = item.stats || {};
  return {
    handle: item.author.uniqueId,
    nickname: item.author.nickname,
    desc: item.desc || "",
    created: item.createTime ? new Date(Number(item.createTime) * 1000).toISOString().slice(0, 10) : "",
    duration: Number((item.video && item.video.duration) || 0),
    views: Number(st.playCount || 0),
    likes: Number(st.diggCount || 0),
    comments: Number(st.commentCount || 0),
    shares: Number(st.shareCount || 0),
    saves: Number(st.collectCount || 0),
    is_carousel: !!item.imagePost,
  };
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(30, Math.max(1, Number(body.limit) || 15));
    let rows;
    if (Array.isArray(body.ids) && body.ids.length) {
      const ids = body.ids.slice(0, limit).map(String);
      rows = (await env.DB.prepare(`SELECT id, account_type FROM contents_ads WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results || [];
    } else {
      rows = (await env.DB.prepare(`
        SELECT id, account_type FROM contents_ads
        WHERE id GLOB '[0-9]*' AND (creator_name IS NULL OR creator_name IN ('-', '', '@') OR COALESCE(published_at, '') = '')
          AND (enriched_at IS NULL OR enriched_at < datetime('now', '-3 days'))
        ORDER BY ad_spend_idr DESC LIMIT ?1`).bind(limit).all()).results || [];
    }

    const done = [], failed = [];
    for (let i = 0; i < rows.length; i += 5) {
      await Promise.all(rows.slice(i, i + 5).map(async (r) => {
        try {
          const v = await fetchTikTokVideo(r.id);
          const caption = v.desc.split("#")[0].trim().slice(0, 90);
          const views = v.views;
          const er = views > 0 ? Math.round(((v.likes + v.comments + v.shares + v.saves) / views) * 10000) / 100 : 0;
          await env.DB.prepare(`
            UPDATE contents_ads SET
              creator_name = ?2,
              title = CASE WHEN title LIKE '[ADS] Video %' OR COALESCE(title, '') = '' THEN ?3 ELSE title END,
              hook_3s = CASE WHEN COALESCE(hook_3s, '') = '' THEN ?4 ELSE hook_3s END,
              published_at = CASE WHEN COALESCE(published_at, '') = '' THEN ?5 ELSE published_at END,
              duration_s = CASE WHEN COALESCE(duration_s, 0) = 0 THEN ?6 ELSE duration_s END,
              views = MAX(COALESCE(views, 0), ?7), likes = MAX(COALESCE(likes, 0), ?8), comments = MAX(COALESCE(comments, 0), ?9),
              shares = MAX(COALESCE(shares, 0), ?10), saves = MAX(COALESCE(saves, 0), ?11),
              er_pct = CASE WHEN COALESCE(er_pct, 0) = 0 THEN ?12 ELSE er_pct END,
              video_url = ?13,
              enriched_at = datetime('now')
            WHERE id = ?1
          `).bind(r.id, "@" + v.handle, "[ADS] " + (caption || "Video @" + v.handle), v.desc.slice(0, 300), v.created, v.duration,
            views, v.likes, v.comments, v.shares, v.saves, er, `https://www.tiktok.com/@${v.handle}/video/${r.id}`).run();
          done.push({ id: r.id, handle: v.handle });
        } catch (e) {
          failed.push({ id: r.id, error: e.message });
          await env.DB.prepare("UPDATE contents_ads SET enriched_at = datetime('now') WHERE id = ?1").bind(r.id).run();
        }
      }));
    }
    if (done.length) await classifyAccounts(env);
    return Response.json({ ok: true, checked: rows.length, done, failed });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
