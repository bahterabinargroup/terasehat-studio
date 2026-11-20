-- Ekosistem akun tiap toko: Akun Utama (OFFICIAL), Akun Pemasaran (MARKETING). Video dari akun lain = Afiliasi (AFFILIATE, pihak luar).
CREATE TABLE IF NOT EXISTS store_accounts (
  handle TEXT PRIMARY KEY,          -- username TikTok tanpa @, huruf kecil
  store_code TEXT NOT NULL,
  kind TEXT NOT NULL,               -- OFFICIAL | MARKETING
  display_name TEXT,
  identity_id TEXT,                 -- ID identitas TikTok (dari GMV Max), kalau ada
  created_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO store_accounts (handle, store_code, kind, display_name, identity_id) VALUES
  ('terasehat2', 'TS', 'OFFICIAL', 'TeraSehat', NULL),
  ('nutribalance.1', 'NB', 'OFFICIAL', 'Nutri Balance', '7638468570237764629'),
  ('solusisehat62', 'NB', 'MARKETING', 'Solusi Sehat', '6942753739355128834'),
  ('wellness_kuy', 'NB', 'MARKETING', 'wellness_kuy', '7688552758361883656'),
  ('ruangnalar96', 'NB', 'MARKETING', 'Makan Sehat', '92cf1ad6-d5a9-55f1-9e5c-d1918f707a04');

-- Label ulang semua konten: akun terdaftar ikut jenisnya, label lama OWN dihapus, sisanya afiliasi.
UPDATE contents_ads SET account_type = COALESCE(
  (SELECT sa.kind FROM store_accounts sa WHERE sa.store_code = contents_ads.store_code AND '@' || sa.handle = lower(contents_ads.creator_name)),
  CASE WHEN account_type = 'OFFICIAL' THEN 'OFFICIAL' ELSE 'AFFILIATE' END);
