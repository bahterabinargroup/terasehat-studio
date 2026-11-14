// Aksi dari dashboard: Approve / Revisi / Tayang untuk Visual Guide, dan centang Daily Checklist.
const SCRIPT_STATUSES = ["waiting_check", "approved", "revision", "filming", "published"];

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const b = await request.json().catch(() => ({}));

    if (b.type === "script_status") {
      if (!SCRIPT_STATUSES.includes(b.status)) {
        return Response.json({ ok: false, error: "status tidak valid" }, { status: 400 });
      }
      await env.DB.prepare(
        "UPDATE scripts_briefs SET human_status = ?1, human_notes = COALESCE(?2, human_notes) WHERE script_code = ?3"
      ).bind(b.status, b.notes ?? null, String(b.script_code || "")).run();
      return Response.json({ ok: true });
    }

    if (b.type === "checklist") {
      await env.DB.prepare(
        "UPDATE daily_checklists SET is_done = ?1, updated_at = datetime('now') WHERE id = ?2"
      ).bind(b.is_done ? 1 : 0, String(b.id || "")).run();
      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: "type tidak dikenal" }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
