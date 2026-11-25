// Tarik omzet total toko per hari dari sheet "Dashboard Mitra - Bahtera" (tab ORDER TIKTOK).
// Sheet bisa dibaca lewat link, jadi Cloudflare membacanya langsung (tanpa Claude, tanpa kuota).
// Rumus sama dengan sheet: SUM(total_transaksi) untuk Jenis Order = "Real", per Nama Toko per tanggal pesanan.
//   Kolom: BJ = Nama Toko, BN = Jenis Order, BP = Tanggal Pesanan, BM = total_transaksi, BQ = Quantity.

const QUERY = "select BJ, BP, sum(BM), count(BM), sum(BQ) where BN = 'Real' group by BJ, BP";

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// "2026-11-1" (kolom bertipe tanggal) atau "31/10/2026" (teks) → "2026-10-31".
export function normDate(s) {
  s = String(s || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

const num = (v) => Number(String(v || "0").replace(/[^\d.-]/g, "")) || 0;

export async function syncSalesMonth(env, month, sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent("ORDER TIKTOK")}&tq=${encodeURIComponent(QUERY)}`;
  const res = await fetch(url, { cf: { cacheTtl: 0 } });
  const text = await res.text();
  if (!res.ok || !/text\/csv/.test(res.headers.get("content-type") || "")) {
    throw new Error(`Sheet ${month} tidak bisa dibaca (HTTP ${res.status}). Pastikan aksesnya "siapa saja yang punya link".`);
  }
  const stores = (await env.DB.prepare("SELECT code, sheet_store_name FROM stores WHERE sheet_store_name IS NOT NULL").all()).results || [];
  const byName = Object.fromEntries(stores.map((s) => [s.sheet_store_name.trim().toLowerCase(), s.code]));

  const agg = {};
  for (const r of parseCsv(text).slice(1)) {
    const code = byName[String(r[0] || "").trim().toLowerCase()];
    const date = normDate(r[1]);
    if (!code || !date || date.slice(0, 7) !== month) continue; // sheet bulan ini kadang memuat tanggal bulan lain
    const k = code + "|" + date;
    const a = (agg[k] = agg[k] || { code, date, omzet: 0, orders: 0, qty: 0 });
    a.omzet += num(r[2]); a.orders += num(r[3]); a.qty += num(r[4]);
  }
  const rows = Object.values(agg);
  const stmts = [];
  // Hapus dulu data bulan ini supaya hari yang pesanannya batal semua ikut terkoreksi.
  for (const s of stores) stmts.push(env.DB.prepare("DELETE FROM store_sales_daily WHERE store_code = ?1 AND substr(date, 1, 7) = ?2").bind(s.code, month));
  for (const a of rows) {
    stmts.push(env.DB.prepare(`INSERT OR REPLACE INTO store_sales_daily (store_code, date, omzet, orders, qty, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`).bind(a.code, a.date, a.omzet, a.orders, a.qty));
  }
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return { month, days: rows.length, omzet: rows.reduce((s, a) => s + a.omzet, 0) };
}

// months: daftar "YYYY-MM"; kosong = bulan ini dan bulan lalu (WIB).
export async function syncSales(env, months) {
  const now = new Date(Date.now() + 7 * 3600e3);
  const cur = now.toISOString().slice(0, 7);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const want = months && months.length ? months : [cur, prev];
  const src = (await env.DB.prepare("SELECT month, sheet_id FROM sales_sources").all()).results || [];
  const out = [];
  for (const m of want) {
    const s = src.find((x) => x.month === m);
    if (!s) { out.push({ month: m, error: "link sheet bulan ini belum diisi" }); continue; }
    try { out.push(await syncSalesMonth(env, m, s.sheet_id)); }
    catch (e) { out.push({ month: m, error: e.message }); }
  }
  await env.DB.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sales_synced_at', datetime('now'))").run();
  return out;
}

// Dipanggil saat dashboard dibuka: sinkron di belakang layar kalau terakhir sinkron > 30 menit lalu.
export async function maybeSyncSales(env) {
  const row = await env.DB.prepare("SELECT value FROM app_meta WHERE key = 'sales_synced_at'").first();
  if (row && Date.parse(row.value.replace(" ", "T") + "Z") > Date.now() - 30 * 60e3) return null;
  // Tandai dulu supaya beberapa orang yang buka dashboard bersamaan tidak memicu sinkron dobel.
  await env.DB.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sales_synced_at', datetime('now'))").run();
  return syncSales(env);
}
