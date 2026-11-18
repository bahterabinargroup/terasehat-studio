export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) {
    return Response.json({ ok: true, mode: "seed_fallback", message: "D1 belum terhubung, menggunakan seed data lokal." });
  }
  try {
    const [ads, dna, scripts, checklist, radar, adsPeriod, budget, daily, balance] = await Promise.all([
      env.DB.prepare("SELECT * FROM contents_ads ORDER BY total_score DESC, gmv_idr DESC").all(),
      env.DB.prepare("SELECT * FROM winning_dna ORDER BY confidence_score DESC").all(),
      env.DB.prepare("SELECT * FROM scripts_briefs ORDER BY created_at DESC").all(),
      env.DB.prepare("SELECT * FROM daily_checklists ORDER BY date DESC, is_done ASC, id ASC LIMIT 80").all(),
      env.DB.prepare("SELECT * FROM competitor_radar ORDER BY created_at DESC").all(),
      env.DB.prepare("SELECT * FROM ads_period_metrics").all(),
      env.DB.prepare("SELECT * FROM ads_budget ORDER BY spend_today DESC").all(),
      env.DB.prepare("SELECT * FROM ads_daily_spend ORDER BY date DESC LIMIT 60").all(),
      env.DB.prepare("SELECT * FROM ads_balance").all()
    ]);

    return Response.json({
      ok: true,
      mode: "d1_live",
      contents_ads: ads.results || [],
      winning_dna: dna.results || [],
      scripts_briefs: scripts.results || [],
      daily_checklists: checklist.results || [],
      competitor_radar: radar.results || [],
      ads_period_metrics: adsPeriod.results || [],
      ads_budget: budget.results || [],
      ads_daily_spend: daily.results || [],
      ads_balance: balance.results || []
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
