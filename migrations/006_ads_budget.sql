-- Pantauan budget iklan GMV Max: budget harian per kampanye aktif, spend per hari, dan saldo akun (diisi manual).
CREATE TABLE IF NOT EXISTS ads_budget (
  campaign_id TEXT PRIMARY KEY,
  campaign_name TEXT,
  operation_status TEXT,
  daily_budget REAL DEFAULT 0,
  auto_budget INTEGER DEFAULT 0,
  max_budget REAL DEFAULT 0,
  spend_today REAL DEFAULT 0,
  revenue_today REAL DEFAULT 0,
  stat_date TEXT,
  checked_at TEXT
);
CREATE TABLE IF NOT EXISTS ads_daily_spend (
  date TEXT PRIMARY KEY,
  cost REAL DEFAULT 0,
  gross_revenue REAL DEFAULT 0,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS ads_balance (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  balance_idr REAL DEFAULT 0,
  set_date TEXT,
  spend_at_set REAL DEFAULT 0,
  warn_days REAL DEFAULT 3,
  set_at TEXT
);
