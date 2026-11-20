// Endpoint penerima laporan iklan GMV Max per video (TikTok for Business).
// Dikirim oleh jadwal cloud Claude Brain. item_id = ID postingan TikTok, jadi otomatis
// nyambung ke video yang sudah di-scrape (contents_ads.id = aweme_id).
//
// Body: { store_code: "NB", period: "2026-11-07..2026-11-13", window_days?: 7 | 10 | 30 | 90 | 180, items: [{ item_id, cost, gross_revenue, roi, orders,
//         product_impressions, product_clicks, ad_click_rate, ad_conversion_rate,
//         ad_video_view_rate_2s, ad_video_view_rate_6s, ad_video_view_rate_p100,
//         creative_delivery_status?, tt_account_name?, account_type? (OFFICIAL | MARKETING | AFFILIATE), caption?, duration_s? }] }

import { classifyAccounts } from "../../lib/accounts.js";

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

// Satu video bisa tayang di beberapa kampanye, jadi laporan item_id bisa berisi baris dobel.
// Angka dijumlah; persentase dirata-rata tertimbang (CTR per tayangan produk, CVR per klik, retensi per biaya).
export function mergeDuplicates(rows) {
  const map = new Map();
  for (const r of rows) {
    const id = String(r.item_id);
    if (!map.has(id)) { map.set(id, [r]); continue; }
    map.get(id).push(r);
  }
  return [...map.values()].map((g) => {
    if (g.length === 1) return g[0];
    const sum = (k) => g.reduce((s, x) => s + n(x[k]), 0);
    const wavg = (k, w) => { const tw = sum(w); return tw > 0 ? Math.round(g.reduce((s, x) => s + n(x[k]) * n(x[w]), 0) / tw * 100) / 100 : n(g[0][k]); };
    const cost = sum("cost"), rev = sum("gross_revenue");
    const active = g.map((x) => x.creative_delivery_status).find((st) => ["DELIVERING", "LEARNING", "IN_QUEUE"].includes(st));
    return {
      ...g.find((x) => x.tt_account_name || x.caption) || g[0],
      item_id: g[0].item_id, cost, gross_revenue: rev, roi: cost > 0 ? Math.round(rev / cost * 100) / 100 : 0,
      orders: sum("orders"), product_impressions: sum("product_impressions"), product_clicks: sum("product_clicks"),
      ad_click_rate: wavg("ad_click_rate", "product_impressions"), ad_conversion_rate: wavg("ad_conversion_rate", "product_clicks"),
      ad_video_view_rate_2s: wavg("ad_video_view_rate_2s", "cost"), ad_video_view_rate_6s: wavg("ad_video_view_rate_6s", "cost"),
      ad_video_view_rate_p100: wavg("ad_video_view_rate_p100", "cost"),
      creative_delivery_status: active || g[0].creative_delivery_status,
    };
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const items = mergeDuplicates((body.items || []).filter((x) => x && x.item_id && String(x.item_id) !== "-1")).slice(0, 200);
    if (!items.length) return Response.json({ ok: false, error: "items kosong" }, { status: 400 });
    const period = String(body.period || "");
    const store = String(body.store_code || "").toUpperCase();
    if (!store) return Response.json({ ok: false, error: "store_code wajib (kode toko, contoh NB)" }, { status: 400 });
    const windowDays = [7, 10, 30, 90, 180].includes(Number(body.window_days)) ? Number(body.window_days) : 7;
    const avgRev = items.reduce((s, x) => s + n(x.gross_revenue), 0) / items.length;

    // Simpan metrik per jendela waktu (dipakai pilihan periode di dashboard).
    const periodStmts = items.map((it) => {
      const { score, tier, roi } = adsScore(it, avgRev);
      return env.DB.prepare(`
        INSERT OR REPLACE INTO ads_period_metrics
          (item_id, window_days, period, cost, gross_revenue, roi, orders, product_impressions, product_clicks,
           ad_click_rate, ad_conversion_rate, hold_2s_pct, hold_6s_pct, completion_pct, score, tier, store_code, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, datetime('now'))
      `).bind(String(it.item_id), windowDays, period, n(it.cost), n(it.gross_revenue), roi, n(it.orders),
        n(it.product_impressions), n(it.product_clicks), n(it.ad_click_rate), n(it.ad_conversion_rate),
        n(it.ad_video_view_rate_2s), n(it.ad_video_view_rate_6s), n(it.ad_video_view_rate_p100), score, tier, store);
    });
    for (let i = 0; i < periodStmts.length; i += 40) await env.DB.batch(periodStmts.slice(i, i + 40));

    // Jendela selain 7 hari cuma memastikan videonya ada di daftar konten; angka 7 hari tidak ditimpa.
    if (windowDays !== 7) {
      const ins = items.map((it) => {
        const id = String(it.item_id);
        return env.DB.prepare(`
          INSERT OR IGNORE INTO contents_ads (id, account_type, script_code, title, creator_name, published_at, duration_s,
            total_score, rank_tier, video_url, source, delivery_status, store_code, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, 1, 'BONCOS', ?7, 'gmv_max', ?8, ?9, datetime('now'))
        `).bind(id, ["OFFICIAL", "MARKETING", "AFFILIATE"].includes(it.account_type) ? it.account_type : "AFFILIATE",
          "AD-" + id.slice(-4), "[ADS] " + (String(it.caption || "").split("#")[0].trim().slice(0, 90) || "Video " + id),
          it.tt_account_name ? "@" + String(it.tt_account_name).replace(/^@/, "") : "-", n(it.duration_s),
          `https://www.tiktok.com/@_/video/${id}`, it.creative_delivery_status ? String(it.creative_delivery_status) : "NOT_IN_REPORT", store);
      });
      for (let i = 0; i < ins.length; i += 40) await env.DB.batch(ins.slice(i, i + 40));
      await classifyAccounts(env, store);
      return Response.json({ ok: true, store_code: store, count: items.length, period, window_days: windowDays });
    }

    const stmts = items.map((it) => {
      const { score, tier, roi } = adsScore(it, avgRev);
      const id = String(it.item_id);
      return env.DB.prepare(`
        INSERT INTO contents_ads
          (id, account_type, script_code, title, creator_name, published_at, duration_s, hook_3s, gmv_idr, orders, ad_spend_idr, roas, ctr_pct,
           ad_cvr_pct, product_impressions, product_clicks, hold_2s_pct, hold_6s_pct, completion_pct,
           total_score, rank_tier, video_url, source, ads_period, delivery_status, store_code, updated_at)
        VALUES (?1, ?19, ?2, ?3, ?20, '', ?21, ?22, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, 'gmv_max', ?18, ?23, ?24, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          gmv_idr = excluded.gmv_idr, orders = excluded.orders, ad_spend_idr = excluded.ad_spend_idr,
          roas = excluded.roas, ctr_pct = excluded.ctr_pct, ad_cvr_pct = excluded.ad_cvr_pct,
          product_impressions = excluded.product_impressions, product_clicks = excluded.product_clicks,
          hold_2s_pct = excluded.hold_2s_pct, hold_6s_pct = excluded.hold_6s_pct, completion_pct = excluded.completion_pct,
          total_score = CASE WHEN excluded.ad_spend_idr >= 20000 THEN excluded.total_score ELSE contents_ads.total_score END,
          rank_tier = CASE WHEN excluded.ad_spend_idr >= 20000 THEN excluded.rank_tier ELSE contents_ads.rank_tier END,
          ads_period = excluded.ads_period,
          delivery_status = COALESCE(excluded.delivery_status, contents_ads.delivery_status),
          account_type = COALESCE(excluded.account_type, contents_ads.account_type),
          creator_name = CASE WHEN contents_ads.creator_name IN ('-', '') OR contents_ads.creator_name IS NULL THEN excluded.creator_name ELSE contents_ads.creator_name END,
          title = CASE WHEN contents_ads.source = 'gmv_max' AND excluded.title != contents_ads.title AND excluded.hook_3s != '' THEN excluded.title ELSE contents_ads.title END,
          hook_3s = CASE WHEN COALESCE(contents_ads.hook_3s, '') = '' THEN excluded.hook_3s ELSE contents_ads.hook_3s END,
          duration_s = CASE WHEN COALESCE(contents_ads.duration_s, 0) = 0 THEN excluded.duration_s ELSE contents_ads.duration_s END,
          store_code = COALESCE(contents_ads.store_code, excluded.store_code),
          updated_at = datetime('now')
      `).bind(
        id, "AD-" + id.slice(-4), "[ADS] " + (String(it.caption || "").split("#")[0].trim().slice(0, 90) || "Video " + id), n(it.gross_revenue), n(it.orders), n(it.cost), roi,
        n(it.ad_click_rate), n(it.ad_conversion_rate), n(it.product_impressions), n(it.product_clicks),
        n(it.ad_video_view_rate_2s), n(it.ad_video_view_rate_6s), n(it.ad_video_view_rate_p100),
        score, tier, `https://www.tiktok.com/@_/video/${id}`, period,
        ["OFFICIAL", "MARKETING", "AFFILIATE"].includes(it.account_type) ? it.account_type : null,
        it.tt_account_name ? "@" + String(it.tt_account_name).replace(/^@/, "") : "-",
        n(it.duration_s), String(it.caption || "").slice(0, 300),
        it.creative_delivery_status ? String(it.creative_delivery_status) : null, store
      );
    });
    for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40));
    // Video iklan yang tidak muncul di laporan terbaru dianggap sudah tidak tayang.
    if (items.some((x) => x.creative_delivery_status)) {
      const ids = items.map((x) => String(x.item_id));
      await env.DB.prepare(
        `UPDATE contents_ads SET delivery_status = 'NOT_IN_REPORT' WHERE source = 'gmv_max' AND store_code = ? AND id NOT IN (${ids.map(() => "?").join(",")})`
      ).bind(store, ...ids).run();
    }

    await classifyAccounts(env, store);
    return Response.json({ ok: true, store_code: store, count: items.length, period, window_days: windowDays });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
