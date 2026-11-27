-- Radar Kompetitor: catatan manual (tombol + Tambah) dan akun kompetitor yang dipantau otomatis.
ALTER TABLE competitor_radar ADD COLUMN handle TEXT;
ALTER TABLE competitor_radar ADD COLUMN views INTEGER DEFAULT 0;
ALTER TABLE competitor_radar ADD COLUMN likes INTEGER DEFAULT 0;
ALTER TABLE competitor_radar ADD COLUMN shares INTEGER DEFAULT 0;
ALTER TABLE competitor_radar ADD COLUMN followers INTEGER DEFAULT 0;
ALTER TABLE competitor_radar ADD COLUMN added_by TEXT;
ALTER TABLE competitor_radar ADD COLUMN updated_at TEXT;

-- Akun TikTok kompetitor per toko. Video terlarisnya ditarik otomatis 1x sehari (1 kredit ScrapeCreators per akun).
CREATE TABLE IF NOT EXISTS competitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_code TEXT NOT NULL,
  handle TEXT NOT NULL,
  name TEXT,
  note TEXT,
  last_scan_at TEXT,
  last_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (store_code, handle)
);
