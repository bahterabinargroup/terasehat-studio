// Semua data dashboard dalam satu panggilan, sudah dibatasi ke toko yang boleh dilihat user.
import { storeList, publicUser } from "../../lib/auth.js";
import { maybeSyncSales } from "../../lib/sales.js";
import { maybeScanCompetitors } from "../../lib/radar.js";

export async function onRequestGet({ env, data, waitUntil }) {
  try {
    // Omzet toko dari sheet diperbarui di belakang layar (paling sering tiap 30 menit).
    if (waitUntil) waitUntil(maybeSyncSales(env).catch(() => null));
    // Akun kompetitor yang dipantau ditarik paling sering 1x per 20 jam.
    if (waitUntil) waitUntil(maybeScanCompetitors(env).catch(() => null));
    const allowed = storeList(data.user); // null = semua toko
    const where = (col = "store_code") => allowed === null ? "" : `WHERE ${col} IN (${allowed.map(() => "?").join(",") || "''"})`;
    const q = (sql) => { const st = env.DB.prepare(sql); return allowed && allowed.length ? st.bind(...allowed) : st; };

    const isOwner = ["owner", "system"].includes(data.user.role);
    const [stores, accounts, ads, dna, scripts, checklist, radar, adsPeriod, budget, daily, balance, sales, sources, synced, comps] = await Promise.all([
      q(`SELECT code, name, tiktok_handles, advertiser_id, store_id, sort FROM stores ${where("code")} ORDER BY sort`).all(),
      q(`SELECT handle, store_code, kind, display_name FROM store_accounts ${where()} ORDER BY store_code, kind, handle`).all(),
      q(`SELECT * FROM contents_ads ${where()} ORDER BY total_score DESC, gmv_idr DESC`).all(),
      q(`SELECT * FROM winning_dna ${where()} ORDER BY confidence_score DESC`).all(),
      q(`SELECT * FROM scripts_briefs ${where()} ORDER BY created_at DESC`).all(),
      q(`SELECT * FROM daily_checklists ${where()} ORDER BY date DESC, is_done ASC, id ASC LIMIT 200`).all(),
      q(`SELECT * FROM competitor_radar ${where()} ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 300`).all(),
      q(`SELECT * FROM ads_period_metrics ${where()}`).all(),
      q(`SELECT * FROM ads_budget ${where()} ORDER BY spend_today DESC`).all(),
      q(`SELECT * FROM ads_daily_spend ${where()} ORDER BY date DESC LIMIT 400`).all(),
      q(`SELECT * FROM ads_balance ${where()}`).all(),
      q(`SELECT store_code, date, omzet, orders, qty FROM store_sales_daily ${where()} ORDER BY date DESC LIMIT 1500`).all(),
      isOwner ? env.DB.prepare("SELECT month, sheet_id, updated_at FROM sales_sources ORDER BY month DESC").all() : Promise.resolve({ results: [] }),
      env.DB.prepare("SELECT value FROM app_meta WHERE key = 'sales_synced_at'").first(),
      q(`SELECT id, store_code, handle, name, last_scan_at, last_error FROM competitors ${where()} ORDER BY store_code, handle`).all(),
    ]);

    return Response.json({
      ok: true,
      mode: "d1_live",
      user: publicUser(data.user),
      stores: (stores.results || []).map((s) => ({ ...s, tiktok_handles: JSON.parse(s.tiktok_handles || "[]") })),
      store_accounts: accounts.results || [],
      contents_ads: ads.results || [],
      winning_dna: dna.results || [],
      scripts_briefs: scripts.results || [],
      daily_checklists: checklist.results || [],
      competitor_radar: radar.results || [],
      ads_period_metrics: adsPeriod.results || [],
      ads_budget: budget.results || [],
      ads_daily_spend: daily.results || [],
      ads_balance: balance.results || [],
      store_sales_daily: sales.results || [],
      sales_sources: sources.results || [],
      sales_synced_at: synced ? synced.value : null,
      competitors: comps.results || [],
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
