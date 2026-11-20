-- Multi toko + multi user (owner, spv, adv).
CREATE TABLE IF NOT EXISTS stores (
  code TEXT PRIMARY KEY,            -- kode singkat, juga dipakai di nama creative (TS, NB, TH)
  name TEXT NOT NULL,
  tiktok_handles TEXT DEFAULT '[]', -- JSON array akun TikTok organik milik toko ini
  advertiser_id TEXT,               -- akun iklan TikTok (GMV Max), kosong = belum tersambung
  store_id TEXT,                    -- ID toko TikTok Shop
  sort INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO stores (code, name, tiktok_handles, advertiser_id, store_id, sort) VALUES
  ('TS', 'Terasehat', '["terasehat2"]', NULL, NULL, 1),
  ('NB', 'Nutri Balance', '[]', '7638476636924723208', '7494641420763498126', 2),
  ('TH', 'Terahealth', '[]', NULL, NULL, 3);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,               -- owner | spv | adv
  stores TEXT DEFAULT '',           -- kode toko dipisah koma (adv). owner/spv lihat semua
  pass_hash TEXT,
  pass_salt TEXT,
  must_change INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1,
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

ALTER TABLE contents_ads ADD COLUMN store_code TEXT;
ALTER TABLE ads_period_metrics ADD COLUMN store_code TEXT;
ALTER TABLE winning_dna ADD COLUMN store_code TEXT;
ALTER TABLE scripts_briefs ADD COLUMN store_code TEXT;
ALTER TABLE daily_checklists ADD COLUMN store_code TEXT;
ALTER TABLE competitor_radar ADD COLUMN store_code TEXT;
ALTER TABLE ads_budget ADD COLUMN store_code TEXT;

-- Spend harian & saldo sekarang per toko.
CREATE TABLE ads_daily_spend_new (
  store_code TEXT NOT NULL, date TEXT NOT NULL, cost REAL DEFAULT 0, gross_revenue REAL DEFAULT 0, updated_at TEXT,
  PRIMARY KEY (store_code, date)
);
INSERT INTO ads_daily_spend_new (store_code, date, cost, gross_revenue, updated_at) SELECT 'NB', date, cost, gross_revenue, updated_at FROM ads_daily_spend;
DROP TABLE ads_daily_spend;
ALTER TABLE ads_daily_spend_new RENAME TO ads_daily_spend;

DROP TABLE IF EXISTS ads_balance;
CREATE TABLE ads_balance (
  store_code TEXT PRIMARY KEY, balance_idr REAL DEFAULT 0, set_date TEXT, spend_at_set REAL DEFAULT 0,
  warn_days REAL DEFAULT 3, set_at TEXT
);

-- Data lama: organik @terasehat2 = Terasehat, semua data iklan GMV Max & Seller Center = Nutri Balance.
UPDATE contents_ads SET store_code = CASE WHEN creator_name = '@terasehat2' AND COALESCE(source, 'tiktok_scrape') != 'gmv_max' THEN 'TS' ELSE 'NB' END;
UPDATE ads_period_metrics SET store_code = 'NB';
UPDATE ads_budget SET store_code = 'NB';
UPDATE scripts_briefs SET store_code = 'TS';
UPDATE winning_dna SET store_code = CASE WHEN id IN ('DNA-04','DNA-05','DNA-06','DNA-07','DNA-08') THEN 'NB' ELSE 'TS' END;
UPDATE daily_checklists SET store_code = CASE WHEN task_title LIKE '%iklan%' OR task_title LIKE '%budget%' OR task_title LIKE '%Seller Center%'
  OR task_title LIKE '%halaman produk%' OR task_title LIKE '%TRS019%' OR related_script_code LIKE 'AD-%' THEN 'NB' ELSE 'TS' END;
UPDATE competitor_radar SET store_code = 'TS';
