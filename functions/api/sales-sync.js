// Sinkron omzet total toko dari sheet "Dashboard Mitra - Bahtera". Hanya owner atau jadwal cloud.
// POST {}                                   → sinkron bulan ini + bulan lalu
// POST { months: ["2026-10", "2026-09"] }   → sinkron bulan tertentu
// POST { month: "2026-12", sheet_url }      → simpan link sheet bulan itu lalu sinkron
import { syncSales } from "../../lib/sales.js";

export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json().catch(() => ({}));
    let months = Array.isArray(b.months) ? b.months.filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) : [];
    if (b.month || b.sheet_url) {
      const month = String(b.month || "");
      const id = (String(b.sheet_url || "").match(/\/d\/([a-zA-Z0-9_-]{20,})/) || [])[1] || (/^[a-zA-Z0-9_-]{20,}$/.test(b.sheet_url) ? b.sheet_url : "");
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !id) {
        return Response.json({ ok: false, error: "Isi bulan (YYYY-MM) dan link Google Sheet yang benar" }, { status: 400 });
      }
      await env.DB.prepare("INSERT OR REPLACE INTO sales_sources (month, sheet_id, updated_at) VALUES (?1, ?2, datetime('now'))").bind(month, id).run();
      months = [month];
    }
    const result = await syncSales(env, months);
    const failed = result.filter((r) => r.error);
    return Response.json({ ok: failed.length < result.length, result, error: failed.map((r) => `${r.month}: ${r.error}`).join("; ") || undefined }, { status: failed.length && failed.length === result.length ? 502 : 200 });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
