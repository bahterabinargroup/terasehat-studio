-- Omzet total toko per hari, dibaca dari sheet "Dashboard Mitra - Bahtera" (tab ORDER TIKTOK).
-- Rumusnya sama dengan sheet: jumlah total_transaksi untuk Jenis Order = "Real", per Nama Toko per tanggal pesanan.
CREATE TABLE IF NOT EXISTS store_sales_daily (
  store_code TEXT NOT NULL,
  date TEXT NOT NULL,
  omzet REAL DEFAULT 0,
  orders INTEGER DEFAULT 0,
  qty INTEGER DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (store_code, date)
);

-- Sheet dibuat baru tiap bulan, jadi link-nya dicatat per bulan.
CREATE TABLE IF NOT EXISTS sales_sources (
  month TEXT PRIMARY KEY,          -- YYYY-MM
  sheet_id TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Nama toko persis seperti kolom "Nama Toko" di sheet.
ALTER TABLE stores ADD COLUMN sheet_store_name TEXT;
UPDATE stores SET sheet_store_name = 'Bahtera - TeraSehat' WHERE code = 'TS';
UPDATE stores SET sheet_store_name = 'Bahtera - Nutri Balance' WHERE code = 'NB';
UPDATE stores SET sheet_store_name = 'Bahtera - TeraHealth' WHERE code = 'TH';

INSERT OR REPLACE INTO sales_sources (month, sheet_id, updated_at) VALUES
  ('2026-11', '1sE4udzL4rRuWDw6Ap_BobkdyfmHxdNJdSJUEYmLHwlY', datetime('now')),
  ('2026-10', '18rPq5rWyBbxTiqgka5jtnRPl2R5kFj8MJkrNFpAiOYE', datetime('now')),
  ('2026-09', '1eiRbh0pSCUTDYQT8vkJEDVW0vKD79yQ3jATV5zNPCaE', datetime('now')),
  ('2026-08', '1nlZ-3n53w2YiltcSF1j0cvs5Lzgw3nuppQbU379C1vQ', datetime('now')),
  ('2026-06', '1PFPhTM-HeCE4YiQolxH4h3fL34ZtjSL6LRzYySlr8pI', datetime('now'));
