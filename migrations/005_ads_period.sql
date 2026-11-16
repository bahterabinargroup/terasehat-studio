-- Metrik iklan GMV Max per jendela waktu (7, 10, 30, 90, 180 hari) biar dashboard bisa pilih periode.
CREATE TABLE IF NOT EXISTS ads_period_metrics (
  item_id TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  period TEXT,
  cost REAL DEFAULT 0,
  gross_revenue REAL DEFAULT 0,
  roi REAL DEFAULT 0,
  orders INTEGER DEFAULT 0,
  product_impressions INTEGER DEFAULT 0,
  product_clicks INTEGER DEFAULT 0,
  ad_click_rate REAL DEFAULT 0,
  ad_conversion_rate REAL DEFAULT 0,
  hold_2s_pct REAL DEFAULT 0,
  hold_6s_pct REAL DEFAULT 0,
  completion_pct REAL DEFAULT 0,
  score INTEGER DEFAULT 0,
  tier TEXT,
  updated_at TEXT,
  PRIMARY KEY (item_id, window_days)
);
ALTER TABLE contents_ads ADD COLUMN enriched_at TEXT;
