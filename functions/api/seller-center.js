import { classifyAccounts } from "../../lib/accounts.js";

// Endpoint Pengolah Data Tokopedia & TikTok Shop Seller Center (Output ADS Result)
// Menghitung Ranking Top-to-Bottom & Total Score otomatis di Cloudflare (0 Token AI)

export function computeAdScore(item, avgGmv, avgViews) {
  const roas = Number(item.roas || (item.ad_spend_idr > 0 ? item.gmv_idr / item.ad_spend_idr : 0));
  const gmvRatio = avgGmv > 0 ? (Number(item.gmv_idr || 0) / avgGmv) : 1;
  const viewRatio = avgViews > 0 ? (Number(item.views || 0) / avgViews) : 1;
  const ctr = Number(item.ctr_pct || 0);
  const er = Number(item.er_pct || 0);

  // Bobot 50% Seller Center (ROAS + GMV) + 50% Sinyal Algoritma TikTok (Views + CTR + ER)
  const roasPts = Math.min(30, roas * 8.5);
  const gmvPts = Math.min(20, gmvRatio * 10);
  const viewPts = Math.min(20, viewRatio * 10);
  const ctrPts = Math.min(15, ctr * 5);
  const erPts = Math.min(15, er * 2.2);

  const totalScore = Math.max(5, Math.min(100, Math.round(roasPts + gmvPts + viewPts + ctrPts + erPts)));
  const rankTier = totalScore >= 75 ? "WINNING" : (totalScore >= 45 ? "POTENSIAL" : "BONCOS");
  return { totalScore, rankTier, roas: Math.round(roas * 100) / 100 };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const rows = body.items || [];
    const store = String(body.store_code || "").toUpperCase();
    if (!store) return Response.json({ ok: false, error: "store_code wajib (kode toko)" }, { status: 400 });
    if (!rows.length) {
      return Response.json({ ok: false, error: "Data Seller Center kosong." }, { status: 400 });
    }

    const avgGmv = rows.reduce((a, b) => a + Number(b.gmv_idr || 0), 0) / rows.length;
    const avgViews = rows.reduce((a, b) => a + Number(b.views || 0), 0) / rows.length;

    const scored = rows.map(r => {
      const { totalScore, rankTier, roas } = computeAdScore(r, avgGmv, avgViews);
      return { ...r, roas, total_score: totalScore, rank_tier: rankTier };
    }).sort((a, b) => b.total_score - a.total_score);

    if (env.DB) {
      for (const it of scored) {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO contents_ads
          (id, account_type, script_code, title, creator_name, published_at, duration_s, views, likes, comments, shares, saves, er_pct, outlier_score, gmv_idr, orders, ad_spend_idr, roas, ctr_pct, hook_3s, total_score, rank_tier, claude_evaluation, store_code, source)
          VALUES (?1, ?23, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?24, 'seller_center')
        `).bind(
          String(it.id),
          it.script_code || "",
          it.title || "Konten Terasehat",
          it.creator_name || "Tim Konten",
          it.published_at || new Date().toISOString().slice(0, 10),
          Number(it.duration_s || 45),
          Number(it.views || 0),
          Number(it.likes || 0),
          Number(it.comments || 0),
          Number(it.shares || 0),
          Number(it.saves || 0),
          Number(it.er_pct || 0),
          Number(it.outlier_score || 1),
          Number(it.gmv_idr || 0),
          Number(it.orders || 0),
          Number(it.ad_spend_idr || 0),
          Number(it.roas || 0),
          Number(it.ctr_pct || 0),
          it.hook_3s || "",
          Number(it.total_score || 0),
          it.rank_tier || "POTENSIAL",
          it.claude_evaluation || "",
          it.account_type || null,
          store
        ).run();
      }
      await classifyAccounts(env, store);
    }

    return Response.json({ ok: true, count: scored.length, ranked: scored });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
