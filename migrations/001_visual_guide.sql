-- Visual Guide per detik + nama creative standar (TRS146-NB-YOUMILK-VID-DD-H1)
ALTER TABLE scripts_briefs ADD COLUMN creative_name TEXT;
ALTER TABLE scripts_briefs ADD COLUMN format TEXT DEFAULT 'VID';
ALTER TABLE scripts_briefs ADD COLUMN account TEXT;
ALTER TABLE scripts_briefs ADD COLUMN visual_guide_json TEXT;
ALTER TABLE contents_ads ADD COLUMN creative_name TEXT;
