-- Status tayang materi iklan GMV Max (DELIVERING, LEARNING, NOT_DELIVERYING, EXCLUDED, ...)
ALTER TABLE contents_ads ADD COLUMN delivery_status TEXT;
