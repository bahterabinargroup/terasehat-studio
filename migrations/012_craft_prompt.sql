-- Craft Prompt per Visual Guide: pilihan arahan dari tim + prompt yang disusun (draf otomatis, lalu disempurnakan Claude Brain).
ALTER TABLE scripts_briefs ADD COLUMN craft_json TEXT;
ALTER TABLE scripts_briefs ADD COLUMN craft_prompt TEXT;
ALTER TABLE scripts_briefs ADD COLUMN craft_status TEXT; -- 'draft' = menunggu Claude, 'claude' = sudah disusun Claude
ALTER TABLE scripts_briefs ADD COLUMN craft_updated_at TEXT;
