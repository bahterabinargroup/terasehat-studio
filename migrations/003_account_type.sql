-- Jenis akun pemilik konten: OWN (@terasehat2), OFFICIAL (akun resmi toko Nutri Balance), AFFILIATE (afiliasi / akun pemasaran / kreator)
ALTER TABLE contents_ads ADD COLUMN account_type TEXT;
UPDATE contents_ads SET account_type = 'AFFILIATE' WHERE id LIKE 'SC-%';
UPDATE contents_ads SET account_type = 'OWN' WHERE creator_name = '@terasehat2';
