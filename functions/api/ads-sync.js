// Endpoint penerima laporan iklan GMV Max per video (TikTok for Business).
// Dikirim oleh jadwal cloud Claude Brain. item_id = ID postingan TikTok, jadi otomatis
// nyambung ke video yang sudah di-scrape (contents_ads.id = aweme_id).
//
// Body: { period: "2026-11-07..2026-11-13", items: [{ item_id, cost, gross_revenue, roi, orders,
//         product_impressions, product_clicks, ad_click_rate, ad_conversion_rate,
//         ad_video_view_rate_2s, ad_video_view_rate_6s, ad_video_view_rate_p100 }] }

const n = (v) => Number(v || 0) || 0;

export function adsScore(it, avgRev) {
  const cost = n(it.cost), rev = n(it.gross_revenue), roi = cost > 0 ? rev / cost : 0;
  const conf = Math.min(1, cost / 50000); // iklan dengan biaya kecil belum bisa dinilai penuh
  const pts =
    Math.min(40, roi * 10) +                                   // ROI (bobot terbesar)
    Math.min(20, avgRev > 0 ? (rev / avgRev) * 10 : 0) +       // omzet dibanding rata-rata
    Math.min(20, (n(it.ad_video_view_rate_2s) / 40) * 20) +    // hook 2 detik
    Math.min(10, n(it.ad_click_rate) * 2) +                    // klik produk
    Math.min(10, n(it.ad_conversion_rate));                    // klik jadi order
  const score = Math.max(1, Math.min(100, Math.round(pts * conf)));
  return { score, tier: score >= 75 ? "WINNING" : score >= 45 ? "POTENSIAL" : "BONCOS", roi: Math.round(roi * 100) / 100 };
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const items = (body.items || []).filter((x) => x && x.item_id && String(x.item_id) !== "-1").slice(0, 200);
    if (!items.length) return Response.json({ ok: false, error: "items kosong" }, { status: 400 });
    const period = String(body.period || "");
    const avgRev = items.reduce((s, x) => s + n(x.gross_revenue), 0) / items.length;

    const stmts = items.map((it) => {
      const { score, tier, roi } = adsScore(it, avgRev);
      const id = String(it.item_id);
      return env.DB.prepare(`
        INSERT INTO contents_ads
          (id, script_code, title, creator_name, published_at, gmv_idr, orders, ad_spend_idr, roas, ctr_pct,
           ad_cvr_pct, product_impressions, product_clicks, hold_2s_pct, hold_6s_pct, completion_pct,
           total_score, rank_tier, video_url, source, ads_period, updated_at)
        VALUES (?1, ?2, ?3, '-', '', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, 'gmv_max', ?18, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          gmv_idr = excluded.gmv_idr, orders = excluded.orders, ad_spend_idr = excluded.ad_spend_idr,
          roas = excluded.roas, ctr_pct = excluded.ctr_pct, ad_cvr_pct = excluded.ad_cvr_pct,
          product_impressions = excluded.product_impressions, product_clicks = excluded.product_clicks,
          hold_2s_pct = excluded.hold_2s_pct, hold_6s_pct = excluded.hold_6s_pct, completion_pct = excluded.completion_pct,
          total_score = CASE WHEN excluded.ad_spend_idr >= 20000 THEN excluded.total_score ELSE contents_ads.total_score END,
          rank_tier = CASE WHEN excluded.ad_spend_idr >= 20000 THEN excluded.rank_tier ELSE contents_ads.rank_tier END,
          ads_period = excluded.ads_period, updated_at = datetime('now')
      `).bind(
        id, "AD-" + id.slice(-4), "[ADS] Video " + id, n(it.gross_revenue), n(it.orders), n(it.cost), roi,
        n(it.ad_click_rate), n(it.ad_conversion_rate), n(it.product_impressions), n(it.product_clicks),
        n(it.ad_video_view_rate_2s), n(it.ad_video_view_rate_6s), n(it.ad_video_view_rate_p100),
        score, tier, `https://www.tiktok.com/@/video/${id}`, period
      );
    });
    for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40));

    return Response.json({ ok: true, count: items.length, period });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
