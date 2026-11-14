// Endpoint penerima hasil Claude Brain (jadwal cloud 06:00, 12:00, 18:00, 21:00 WIB).
// Format: lihat agent/PROMPT_BRAIN_CLAUDE.md

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return Response.json({ ok: false, error: "Body bukan JSON yang valid." }, { status: 400 });
    }
    const dnaList = payload.winning_dna_updates || [];
    const guideList = payload.visual_guides || [];
    const evalList = payload.content_evaluations || [];
    const checkList = payload.daily_checklists || [];
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // tanggal WIB
    let guidesInserted = 0;

    for (const d of dnaList) {
      await env.DB.prepare(`
        INSERT OR REPLACE INTO winning_dna
        (id, category, title, formula_hook, best_duration, visual_guideline, evidence_summary, confidence_score, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))
      `).bind(
        String(d.id || ("DNA-" + Date.now())),
        d.category || "WINNING_PATTERN",
        d.title || "",
        d.formula_hook || "",
        d.best_duration || "",
        d.visual_guideline || "",
        d.evidence_summary || "",
        Number(d.confidence_score || 0)
      ).run();
    }

    // Visual Guide baru. Kode yang sudah ada tidak ditimpa (biar status Approve/Revisi aman).
    for (const g of guideList) {
      if (!g.script_code) continue;
      const res = await env.DB.prepare(`
        INSERT INTO scripts_briefs
        (script_code, creative_name, title, product_focus, account, format, based_on_dna,
         visual_guide_json, creative_guide, human_status, assigned_creator)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'waiting_check', ?10)
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
        g.assigned_creator || "Tim Konten"
      ).run();
      guidesInserted += (res.meta && res.meta.changes) || 0;
    }

    for (const e of evalList) {
      if (!e.id) continue;
      await env.DB.prepare(
        "UPDATE contents_ads SET claude_evaluation = ?1, updated_at = datetime('now') WHERE id = ?2"
      ).bind(e.claude_evaluation || "", String(e.id)).run();
    }

    for (const c of checkList) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO daily_checklists
        (id, date, task_title, pic_name, related_script_code, category, is_done)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)
      `).bind(
        today + "-" + String(c.id || Math.random().toString(36).slice(2, 7)),
        today,
        c.task_title || "",
        c.pic_name || "Tim Konten",
        c.related_script_code || "",
        c.category || "PRODUKSI"
      ).run();
    }

    return Response.json({
      ok: true,
      updated: { dna: dnaList.length, visual_guides: guidesInserted, evaluations: evalList.length, checklists: checkList.length }
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
