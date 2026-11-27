// Endpoint penerima hasil Claude Brain (jadwal cloud 06:00, 12:00, 18:00, 21:00 WIB).
// Format: lihat agent/PROMPT_BRAIN_CLAUDE.md

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return Response.json({ ok: false, error: "Body bukan JSON yang valid." }, { status: 400 });
    }
    // Satu kiriman = hasil Brain untuk satu toko.
    const store = String(payload.store_code || "").toUpperCase();
    if (!store) return Response.json({ ok: false, error: "store_code wajib (kode toko, contoh TS)" }, { status: 400 });
    const dnaList = payload.winning_dna_updates || [];
    const guideList = payload.visual_guides || [];
    const evalList = payload.content_evaluations || [];
    const checkList = payload.daily_checklists || [];
    const radarList = payload.radar_takeaways || [];
    const craftList = payload.craft_prompts || [];
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // tanggal WIB
    let guidesInserted = 0;

    for (const d of dnaList) {
      // ID DNA dipakai bersama semua toko. Kalau ID ini sudah dipakai toko lain, beri awalan kode toko.
      let dnaId = String(d.id || ("DNA-" + Date.now()));
      const owner = await env.DB.prepare("SELECT store_code FROM winning_dna WHERE id = ?1").bind(dnaId).first();
      if (owner && owner.store_code && owner.store_code !== store) dnaId = store + "-" + dnaId;
      await env.DB.prepare(`
        INSERT OR REPLACE INTO winning_dna
        (id, category, title, formula_hook, best_duration, visual_guideline, evidence_summary, confidence_score, store_code, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
      `).bind(
        dnaId,
        d.category || "WINNING_PATTERN",
        d.title || "",
        d.formula_hook || "",
        d.best_duration || "",
        d.visual_guideline || "",
        d.evidence_summary || "",
        Number(d.confidence_score || 0),
        store
      ).run();
    }

    // Visual Guide baru. Kode yang sudah ada tidak ditimpa (biar status Approve/Revisi aman).
    for (const g of guideList) {
      if (!g.script_code) continue;
      const res = await env.DB.prepare(`
        INSERT INTO scripts_briefs
        (script_code, creative_name, title, product_focus, account, format, based_on_dna,
         visual_guide_json, creative_guide, human_status, assigned_creator, store_code, target_account)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'waiting_check', ?10, ?11, ?12)
        ON CONFLICT(script_code) DO NOTHING
      `).bind(
        String(g.script_code).toUpperCase(),
        g.creative_name || "",
        g.title || "",
        g.product_focus || "",
        g.account || "",
        g.format || "VID",
        g.based_on_dna || "",
        JSON.stringify(Array.isArray(g.segments) ? g.segments : []),
        g.notes || "",
        g.assigned_creator || "Tim Konten",
        store,
        ["OFFICIAL", "MARKETING"].includes(g.target_akun) ? g.target_akun : null
      ).run();
      guidesInserted += (res.meta && res.meta.changes) || 0;
    }

    for (const e of evalList) {
      if (!e.id) continue;
      await env.DB.prepare(
        "UPDATE contents_ads SET claude_evaluation = ?1, updated_at = datetime('now') WHERE id = ?2 AND store_code = ?3"
      ).bind(e.claude_evaluation || "", String(e.id), store).run();
    }

    for (const c of checkList) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO daily_checklists
        (id, date, task_title, pic_name, related_script_code, category, is_done, store_code)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)
      `).bind(
        today + "-" + store + "-" + String(c.id || Math.random().toString(36).slice(2, 7)),
        today,
        c.task_title || "",
        c.pic_name || "Tim Konten",
        c.related_script_code || "",
        c.category || "PRODUKSI",
        store
      ).run();
    }

    // Rekomendasi Claude untuk catatan Radar Kompetitor toko ini.
    let radarUpdated = 0;
    for (const r of radarList) {
      if (!r || !r.id || !r.ai_takeaway) continue;
      const res = await env.DB.prepare("UPDATE competitor_radar SET ai_takeaway = ?1, updated_at = datetime('now') WHERE id = ?2 AND store_code = ?3")
        .bind(String(r.ai_takeaway).slice(0, 1500), String(r.id), store).run();
      radarUpdated += (res.meta && res.meta.changes) || 0;
    }

    // Prompt video yang disempurnakan Claude dari pilihan Craft Prompt tim.
    let craftUpdated = 0;
    for (const c of craftList) {
      if (!c || !c.script_code || !c.prompt) continue;
      const res = await env.DB.prepare(
        "UPDATE scripts_briefs SET craft_prompt = ?1, craft_status = 'claude', craft_updated_at = datetime('now') WHERE script_code = ?2 AND store_code = ?3 AND craft_json IS NOT NULL"
      ).bind(String(c.prompt).slice(0, 6000), String(c.script_code).toUpperCase(), store).run();
      craftUpdated += (res.meta && res.meta.changes) || 0;
    }

    return Response.json({
      ok: true,
      store_code: store,
      updated: { dna: dnaList.length, visual_guides: guidesInserted, evaluations: evalList.length, checklists: checkList.length, radar: radarUpdated, craft_prompts: craftUpdated }
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
