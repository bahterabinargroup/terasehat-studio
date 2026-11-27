# Langkah Jadwal Cloud Claude Brain

Dijalankan otomatis oleh routine Claude Code di cloud jam **06:00, 12:00, 18:00, 21:00 WIB**
(cron UTC `0 23,5,11,14 * * *`). Laptop owner tidak perlu nyala.

Routine memberi dua nilai di prompt-nya: `DASHBOARD_URL` dan `PIPELINE_SECRET`.
Jangan pernah menulis `PIPELINE_SECRET` ke file di repo, commit, atau output akhir.

**Multi toko.** Daftar toko ada di `agent/stores.json` (TS Terasehat, NB Nutri Balance, TH Terahealth).
Data tiap toko HARUS terpisah: setiap kiriman ke dashboard wajib membawa `store_code` toko itu.
Jangan pernah mengirim data scrape satu toko dengan `store_code` toko lain.

## Langkah

1. **Tarik data TikTok terbaru** untuk setiap akun di `tiktok_handles` tiap toko (`agent/stores.json`). Disimpan ke toko itu saja:
   ```bash
   python3 -c "import json;[print(s['code'],h) for s in json.load(open('agent/stores.json'))['stores'] for h in s['tiktok_handles']]" |
   while read code h; do
     curl -sS -X POST "$DASHBOARD_URL/api/scrape" \
       -H "content-type: application/json" -H "x-pipeline-secret: $PIPELINE_SECRET" \
       -d "{\"handle\":\"$h\",\"region\":\"ID\",\"store_code\":\"$code\"}" -o "/tmp/scrape_$h.json" -w "$code $h %{http_code}\n"
   done
   ```
   Kalau ada yang gagal, lanjut saja dan catat di laporan akhir.

1b. **Tarik laporan iklan GMV Max per video** — HANYA di jadwal 06:00 WIB (cek: `date -u +%H` = `23`),
   atau kalau prompt routine bilang "paksa iklan". Di jam lain lewati langkah ini.
   Pakai connector **TikTok for Business** (tool `tool_execute`).
   Jalankan untuk TIAP toko di `agent/stores.json` yang `ads`-nya tidak null; ID akun iklan ada di file yang ditunjuk `ads`
   (sekarang hanya NB → `agent/ads_config.json`). Toko dengan `ads: null` dilewati.
   Tanggal akhir = kemarin (zona WIB). Format `YYYY-MM-DD`.
   **Jendela waktu yang ditarik** (dashboard punya pilihan periode):
   - Setiap hari: **7**, **10**, dan **30** hari.
   - Hanya hari Senin (WIB) atau kalau prompt bilang "paksa semua periode": tambah **90** dan **180** hari.
   Jendela N hari = dari (kemarin − N + 1) sampai kemarin.
   - **Setiap hari juga: bulan berjalan** (filter "per bulan" di dashboard) = dari tanggal 1 bulan milik *kemarin*
     sampai kemarin. Contoh kemarin 2026-11-23 → `2026-11-01..2026-11-23`. Tanggal 1 tiap bulan otomatis
     menutup bulan sebelumnya secara penuh. Tarik dengan cara yang sama seperti jendela lain (`page_size: 50`),
     simpan ke `/tmp/ads_KODE_M.json` dengan `"month": "YYYY-MM"` (bukan `window_days`), dan kirim
     **sebelum** jendela 7 hari.

   1. Sekali saja: `tool_execute` → `tool_name: "gmv_max_campaign_get"`, params
      `{"advertiser_id": ADV, "filtering": {"gmv_max_promotion_types": ["PRODUCT_GMV_MAX"]}, "page_size": 100,
        "fields": ["campaign_id","campaign_name","operation_status"]}` → semua `campaign_id`.
      Lalu `gmv_max_report_get` untuk jendela TERPANJANG yang ditarik hari ini, params
      `{"advertiser_id": ADV, "store_ids": [STORE], "start_date": S, "end_date": E,
        "dimensions": ["campaign_id","item_group_id"], "metrics": ["cost"], "page_size": 100,
        "filtering": {"campaign_ids": [semua campaign_id]}}`.
      Kumpulkan `campaign_id` dan `item_group_id` yang `cost` > 0 (dipakai untuk semua jendela).
   2. Untuk TIAP jendela: `tool_execute` → `gmv_max_report_get` dengan tanggal jendela itu,
      `"dimensions": ["item_id"]`, `"filtering": {"campaign_ids": [...], "item_group_ids": [...]}`,
      `"sort_field": "cost"`, `"page_size": 50` (untuk jendela 90 dan 180 pakai `"page_size": 100`),
      `"metrics": ["cost","gross_revenue","roi","orders","product_impressions","product_clicks","ad_click_rate",
      "ad_conversion_rate","ad_video_view_rate_2s","ad_video_view_rate_6s","ad_video_view_rate_p100",
      "creative_delivery_status"]`.
   2b. **Akun pemilik video** — hanya untuk jendela 7 hari, dan hanya untuk `item_id` yang di dashboard
      (`/tmp/state_pre.json`, ambil dulu: `curl -sS "$DASHBOARD_URL/api/state" -H "x-pipeline-secret: $PIPELINE_SECRET" -o /tmp/state_pre.json`)
      belum punya `account_type`. Ambil identitas sekali:
      `tool_execute` → `gmv_max_identity_get` params
      `{"advertiser_id": ADV, "store_id": STORE, "store_authorized_bc_id": BC}` → `identity_list`.
      Lalu untuk tiap `item_id` itu, `tool_execute` → `gmv_max_video_get` params
      `{"advertiser_id": ADV, "store_id": STORE, "store_authorized_bc_id": BC, "need_auth_code_video": true,
        "identity_list": [semua identitas dari identity_list, field identity_type/identity_id/store_id/identity_authorized_bc_id],
        "keyword": item_id, "page_size": 1}`.
      Dari `item_list[0]` ambil `identity_info.display_name` → `tt_account_name`, `text` → `caption`,
      `video_info.duration` → `duration_s`. `account_type` dari `identity_list` (gmv_max_identity_get):
      `tts_tt_identity_source` = `TT_OFFICIAL` → `"OFFICIAL"` (akun utama); `TT_MARKETING` atau `identity_type` = `BC_AUTH_TT`
      → `"MARKETING"` (akun pemasaran internal). Identitas lain, atau `item_list` kosong → `"AFFILIATE"` (kreator luar).
      Dashboard juga mencocokkan ulang dengan daftar akun toko (tabel `store_accounts`), jadi kalau ragu kirim saja apa adanya.
   3. Untuk TIAP jendela tulis `/tmp/ads_KODE_N.json` = `{"store_code": "KODE", "period": "S..E", "window_days": N, "items": [ {"item_id": ...,
      <semua metrik di atas>, "tt_account_name"?, "account_type"?, "caption"?, "duration_s"?} ]}`
      (buang baris `item_id` = `-1`, itu kartu produk). **Salin SEMUA baris dari laporan, jangan diringkas.** Baris dengan `item_id` sama (video di beberapa kampanye) kirim apa adanya, dashboard yang menjumlahkan. Kirim **jendela 7 hari paling akhir**
      (karena dia yang menandai iklan yang sudah tidak tayang):
      ```bash
      KODE=NB   # ulangi untuk tiap toko yang punya akun iklan
      for N in 180 90 30 M 10 7; do [ -f /tmp/ads_${KODE}_$N.json ] && curl -sS -X POST "$DASHBOARD_URL/api/ads-sync" \
        -H "content-type: application/json" -H "x-pipeline-secret: $PIPELINE_SECRET" \
        --data-binary @/tmp/ads_${KODE}_$N.json -w " $KODE $N %{http_code}\n"; done
      ```
   Kalau connector tidak tersedia atau error izin, lewati dan catat di laporan akhir.

1c. **Pantau budget iklan** — jalankan di SETIAP jadwal (bukan cuma 06:00), biar peringatan "budget mau habis" di dashboard selalu baru.
   Pakai connector TikTok for Business, untuk TIAP toko yang `ads`-nya tidak null. `T` = tanggal hari ini (WIB), format `YYYY-MM-DD`.
   1. `gmv_max_campaign_get` (params sama seperti 1b.1). Ambil kampanye dengan `operation_status` = `"ENABLE"`.
      Kalau langkah 1b sudah jalan di jadwal ini, pakai hasil yang sama.
   2. Untuk tiap kampanye aktif: `tool_execute` → `campaign_gmv_max_info_get` params `{"advertiser_id": ADV, "campaign_id": ID}`.
      `daily_budget` = `auto_budget.current_budget` kalau `auto_budget_enabled` true, selain itu `budget`.
      `auto_budget` = `auto_budget_enabled`, `max_budget` = `auto_budget.maximum_budget` (0 kalau tidak ada).
   3. Spend hari ini per kampanye: `gmv_max_report_get` params `{"advertiser_id": ADV, "store_ids": [STORE],
      "start_date": T, "end_date": T, "dimensions": ["campaign_id"], "metrics": ["cost","gross_revenue"], "page_size": 100,
      "filtering": {"campaign_ids": [semua kampanye aktif]}}`.
   4. Spend total akun per hari (14 hari terakhir sampai T): `gmv_max_report_get` dengan
      `"dimensions": ["advertiser_id","stat_time_day"]`, `"metrics": ["cost","gross_revenue"]`,
      `"filtering": {"campaign_ids": [SEMUA campaign_id, termasuk yang mati]}`.
   5. Tulis `/tmp/budget_KODE.json` = `{"store_code": "KODE", "stat_date": T, "campaigns": [{"campaign_id", "campaign_name", "operation_status",
      "daily_budget", "auto_budget", "max_budget", "spend_today", "revenue_today"}], "daily": [{"date": "YYYY-MM-DD", "cost", "gross_revenue"}]}`,
      lalu kirim:
      ```bash
      curl -sS -X POST "$DASHBOARD_URL/api/budget-sync" -H "content-type: application/json" \
        -H "x-pipeline-secret: $PIPELINE_SECRET" --data-binary @/tmp/budget_NB.json
      ```
   Di laporan akhir sebut kampanye yang spend-nya sudah ≥ 80% budget harian.

1d. **Lengkapi nama akun, caption, dan tanggal video** (gratis, dibaca dashboard dari halaman TikTok). Jalankan tiap jadwal:
   ```bash
   curl -sS -X POST "$DASHBOARD_URL/api/enrich" -H "content-type: application/json" \
     -H "x-pipeline-secret: $PIPELINE_SECRET" -d '{"limit":30}'
   ```

2. **Ambil data dashboard, lalu ringkas PER TOKO:**
   ```bash
   curl -sS "$DASHBOARD_URL/api/state" -H "x-pipeline-secret: $PIPELINE_SECRET" -o /tmp/state.json
   for code in $(python3 -c "import json;print(' '.join(s['code'] for s in json.load(open('agent/stores.json'))['stores']))"); do
     python3 agent/summarize_state.py /tmp/state.json $code > /tmp/summary_$code.json
   done
   ```
   Toko yang `jumlah_konten`-nya 0 dilewati (belum ada data, jangan mengarang).

3. **Untuk TIAP toko yang ada datanya**, kerjakan langkah 3–5 terpisah.
   **Baca** `agent/PROMPT_BRAIN_CLAUDE.md`, `CREATIVE_GUIDE_CAROUSEL.md`, dan `/tmp/summary_KODE.json`.
   Pakai `nomor_trs_berikutnya` untuk kode creative baru. Nomor TRS dipakai bersama semua toko, jadi setelah satu toko
   memakai nomor, toko berikutnya lanjut dari nomor sesudahnya. Kode AKUN di `creative_name` = kode toko.

4. **Tulis hasil** toko itu ke `/tmp/brain_out_KODE.json` (wajib ada `"store_code": "KODE"`), lalu cek valid:
   ```bash
   python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert d.get('store_code'); print('json ok', d['store_code'])" /tmp/brain_out_KODE.json
   ```

5. **Kirim ke dashboard:**
   ```bash
   curl -sS -X POST "$DASHBOARD_URL/api/brain-sync" \
     -H "content-type: application/json" -H "x-pipeline-secret: $PIPELINE_SECRET" \
     --data-binary @/tmp/brain_out_KODE.json
   ```
   Respons harus `"ok": true`. Batas Visual Guide baru (maksimal 2, dan tidak ada yang baru kalau `jumlah_waiting_check` ≥ 6) berlaku per toko.

6. **Jangan** commit, push, atau mengubah file di repo.

7. **Laporan akhir** (singkat, dipisah per toko): status scrape, status iklan (jumlah video iklan terkirim atau "dilewati"), status budget (kampanye yang hampir habis), jumlah DNA / Visual Guide / evaluasi / checklist / rekomendasi radar yang terkirim, dan error kalau ada.
