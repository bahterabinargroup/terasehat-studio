-- Metrik iklan GMV Max per video (dari TikTok for Business)
ALTER TABLE contents_ads ADD COLUMN source TEXT;
ALTER TABLE contents_ads ADD COLUMN ads_period TEXT;
ALTER TABLE contents_ads ADD COLUMN product_impressions INTEGER DEFAULT 0;
ALTER TABLE contents_ads ADD COLUMN product_clicks INTEGER DEFAULT 0;
ALTER TABLE contents_ads ADD COLUMN ad_cvr_pct REAL DEFAULT 0;
ALTER TABLE contents_ads ADD COLUMN hold_2s_pct REAL DEFAULT 0;
ALTER TABLE contents_ads ADD COLUMN hold_6s_pct REAL DEFAULT 0;
ALTER TABLE contents_ads ADD COLUMN completion_pct REAL DEFAULT 0;
