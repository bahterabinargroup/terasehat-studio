-- ============================================================================
-- TERASEHAT PIPELINE — CLOUDFLARE D1 SCHEMA
-- Mencakup: Seller Center Data, ScrapeCreators (TikTok/Shop/Ads Lib),
-- Ranking Top-to-Bottom, Self-Learning Winning DNA, Script (Check by Human),
-- Creative Guide, dan Daily Checklist Tim Konten Manusia.
-- ============================================================================

CREATE TABLE IF NOT EXISTS store_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  store_name TEXT DEFAULT 'Terasehat',
  tiktok_handle TEXT DEFAULT 'terasehat',
  followers INTEGER DEFAULT 0,
  total_gmv_idr INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  ad_spend_idr INTEGER DEFAULT 0,
  overall_roas REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contents_ads (
  id TEXT PRIMARY KEY,
  script_code TEXT,
  creative_name TEXT,
  title TEXT NOT NULL,
  creator_name TEXT DEFAULT 'Tim Internal',
  published_at TEXT,
  duration_s REAL DEFAULT 0,
  -- Metrik TikTok Organik (via ScrapeCreators)
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  er_pct REAL DEFAULT 0,
  outlier_score REAL DEFAULT 1.0,
  -- Metrik Seller Center (Tokopedia / TikTok Shop Ads & Keranjang Kuning)
  gmv_idr INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,
  ad_spend_idr INTEGER DEFAULT 0,
  roas REAL DEFAULT 0,
  ctr_pct REAL DEFAULT 0,
  -- Transkrip & Self-Learning Scoring
  hook_3s TEXT,
  transcript_full TEXT,
  total_score INTEGER DEFAULT 0,
  rank_tier TEXT DEFAULT 'POTENSIAL', -- WINNING | POTENSIAL | BONCOS
  claude_evaluation TEXT,
  video_url TEXT,
  source TEXT,              -- tiktok_scrape | seller_center | gmv_max
  ads_period TEXT,
  product_impressions INTEGER DEFAULT 0,
  product_clicks INTEGER DEFAULT 0,
  ad_cvr_pct REAL DEFAULT 0,
  hold_2s_pct REAL DEFAULT 0,   -- % penonton iklan bertahan 2 detik (kekuatan hook)
  hold_6s_pct REAL DEFAULT 0,
  completion_pct REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS winning_dna (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- WINNING_PATTERN | ANTI_PATTERN | ALGORITHM_NOTE
  title TEXT NOT NULL,
  formula_hook TEXT,
  best_duration TEXT,
  visual_guideline TEXT,
  evidence_summary TEXT,
  confidence_score INTEGER DEFAULT 85,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scripts_briefs (
  script_code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  product_focus TEXT DEFAULT 'Produk Unggulan Terasehat',
  based_on_dna TEXT,
  hook_options_json TEXT, -- Array 3 opsi kalimat 0-3 detik
  body_script TEXT,
  cta_script TEXT,
  creative_guide TEXT, -- Panduan syuting & visual buat tim manusia
  human_status TEXT DEFAULT 'waiting_check', -- waiting_check | approved | revision | filming | published
  human_notes TEXT,
  assigned_creator TEXT DEFAULT 'Tim Konten',
  creative_name TEXT,
  format TEXT DEFAULT 'VID',
  account TEXT,
  visual_guide_json TEXT, -- [{"waktu":"00.00 – 00.03","visual":"..."}]
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_checklists (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  task_title TEXT NOT NULL,
  pic_name TEXT DEFAULT 'Tim Konten',
  related_script_code TEXT,
  category TEXT DEFAULT 'PRODUKSI', -- RISET | SCRIPT | PRODUKSI | UPLOAD | EVALUASI
  is_done INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS competitor_radar (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL, -- TIKTOK_ADS_LIB | TIKTOK_SHOP | TIKTOK_ORGANIC | CREATOR_EMAIL
  brand_or_creator TEXT,
  contact_email TEXT,
  title_or_hook TEXT,
  metrics_summary TEXT,
  ai_takeaway TEXT,
  ref_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
