// Pantauan budget iklan GMV Max, dikirim jadwal cloud Claude Brain tiap jalan.
// Body: { store_code: "NB", stat_date: "YYYY-MM-DD" (hari ini WIB),
//         campaigns: [{ campaign_id, campaign_name, operation_status, daily_budget, auto_budget?, max_budget?, spend_today, revenue_today }],
//         daily: [{ date: "YYYY-MM-DD", cost, gross_revenue }] }   // spend total akun per hari, 14 hari terakhir

const n = (v) => Number(v || 0) || 0;

export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json().catch(() => ({}));
    const statDate = String(b.stat_date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(statDate)) return Response.json({ ok: false, error: "stat_date wajib (YYYY-MM-DD)" }, { status: 400 });
    const campaigns = (b.campaigns || []).filter((c) => c && c.campaign_id);
    const daily = (b.daily || []).filter((d) => d && /^\d{4}-\d{2}-\d{2}/.test(String(d.date)));
    const store = String(b.store_code || "").toUpperCase();
    if (!store) return Response.json({ ok: false, error: "store_code wajib (kode toko, contoh NB)" }, { status: 400 });

    // Daftar kampanye selalu diganti utuh, jadi kampanye yang sudah dimatikan hilang dari pantauan.
    const stmts = [env.DB.prepare("DELETE FROM ads_budget WHERE store_code = ?1 OR store_code IS NULL").bind(store)];
    campaigns.forEach((c) => stmts.push(env.DB.prepare(`
      INSERT INTO ads_budget (campaign_id, campaign_name, operation_status, daily_budget, auto_budget, max_budget,
        spend_today, revenue_today, stat_date, store_code, checked_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))
    `).bind(String(c.campaign_id), String(c.campaign_name || ""), String(c.operation_status || "ENABLE"),
      n(c.daily_budget), c.auto_budget ? 1 : 0, n(c.max_budget), n(c.spend_today), n(c.revenue_today), statDate, store)));
    daily.forEach((d) => stmts.push(env.DB.prepare(`
      INSERT OR REPLACE INTO ads_daily_spend (store_code, date, cost, gross_revenue, updated_at) VALUES (?4, ?1, ?2, ?3, datetime('now'))
    `).bind(String(d.date).slice(0, 10), n(d.cost), n(d.gross_revenue), store)));
    for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40));

    return Response.json({ ok: true, store_code: store, campaigns: campaigns.length, days: daily.length, stat_date: statDate });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
