# Langkah Jadwal Cloud Claude Brain

Dijalankan otomatis oleh routine Claude Code di cloud jam **06:00, 12:00, 18:00, 21:00 WIB**
(cron UTC `0 23,5,11,14 * * *`). Laptop owner tidak perlu nyala.

Routine memberi dua nilai di prompt-nya: `DASHBOARD_URL` dan `PIPELINE_SECRET`.
Jangan pernah menulis `PIPELINE_SECRET` ke file di repo, commit, atau output akhir.

## Langkah

1. **Tarik data TikTok terbaru** untuk setiap akun di `agent/accounts.json` (sekaligus disimpan ke database oleh dashboard):
   ```bash
   for h in $(python3 -c "import json;print(' '.join(a['handle'] for a in json.load(open('agent/accounts.json'))['accounts']))"); do
     curl -sS -X POST "$DASHBOARD_URL/api/scrape" \
       -H "content-type: application/json" -H "x-pipeline-secret: $PIPELINE_SECRET" \
       -d "{\"handle\":\"$h\",\"region\":\"ID\"}" -o "/tmp/scrape_$h.json" -w "$h %{http_code}\n"
   done
   ```
   Kalau ada yang gagal, lanjut saja dan catat di laporan akhir.

1b. **Tarik laporan iklan GMV Max per video** — HANYA di jadwal 06:00 WIB (cek: `date -u +%H` = `23`),
   atau kalau prompt routine bilang "paksa iklan". Di jam lain lewati langkah ini.
   Pakai connector **TikTok for Business** (tool `tool_execute`). ID ada di `agent/ads_config.json`.
   Tanggal akhir = kemarin (zona WIB). Format `YYYY-MM-DD`.
   **Jendela waktu yang ditarik** (dashboard punya pilihan periode):
   - Setiap hari: **7**, **10**, dan **30** hari.
   - Hanya hari Senin (WIB) atau kalau prompt bilang "paksa semua periode": tambah **90** dan **180** hari.
   Jendela N hari = dari (kemarin − N + 1) sampai kemarin.

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
      `video_info.duration` → `duration_s`. `account_type` = `"OFFICIAL"` kalau `identity_info.identity_id`
      = `official_identity_id` di `agent/ads_config.json`, selain itu `"AFFILIATE"`.
      Kalau `item_list` kosong: `account_type: "AFFILIATE"` (kreator afiliasi luar). Nama akunnya nanti diisi langkah 1d.
   3. Untuk TIAP jendela tulis `/tmp/ads_N.json` = `{"period": "S..E", "window_days": N, "items": [ {"item_id": ...,
      <semua metrik di atas>, "tt_account_name"?, "account_type"?, "caption"?, "duration_s"?} ]}`
      (buang baris `item_id` = `-1`, itu kartu produk). **Salin SEMUA baris dari laporan, jangan diringkas.** Baris dengan `item_id` sama (video di beberapa kampanye) kirim apa adanya, dashboard yang menjumlahkan. Kirim **jendela 7 hari paling akhir**
      (karena dia yang menandai iklan yang sudah tidak tayang):
      ```bash
      for N in 180 90 30 10 7; do [ -f /tmp/ads_$N.json ] && curl -sS -X POST "$DASHBOARD_URL/api/ads-sync" \
        -H "content-type: application/json" -H "x-pipeline-secret: $PIPELINE_SECRET" \
        --data-binary @/tmp/ads_$N.json -w " $N %{http_code}\n"; done
      ```
   Kalau connector tidak tersedia atau error izin, lewati dan catat di laporan akhir.

1c. **Pantau budget iklan** — jalankan di SETIAP jadwal (bukan cuma 06:00), biar peringatan "budget mau habis" di dashboard selalu baru.
   Pakai connector TikTok for Business. `T` = tanggal hari ini (WIB), format `YYYY-MM-DD`.
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
   5. Tulis `/tmp/budget.json` = `{"stat_date": T, "campaigns": [{"campaign_id", "campaign_name", "operation_status",
      "daily_budget", "auto_budget", "max_budget", "spend_today", "revenue_today"}], "daily": [{"date": "YYYY-MM-DD", "cost", "gross_revenue"}]}`,
      lalu kirim:
      ```bash
      curl -sS -X POST "$DASHBOARD_URL/api/budget-sync" -H "content-type: application/json" \
        -H "x-pipeline-secret: $PIPELINE_SECRET" --data-binary @/tmp/budget.json
      ```
   Di laporan akhir sebut kampanye yang spend-nya sudah ≥ 80% budget harian.

1d. **Lengkapi nama akun, caption, dan tanggal video** (gratis, dibaca dashboard dari halaman TikTok). Jalankan tiap jadwal:
   ```bash
   curl -sS -X POST "$DASHBOARD_URL/api/enrich" -H "content-type: application/json" \
     -H "x-pipeline-secret: $PIPELINE_SECRET" -d '{"limit":30}'
   ```

2. **Ambil data dashboard lalu ringkas:**
   ```bash
   curl -sS "$DASHBOARD_URL/api/state" -H "x-pipeline-secret: $PIPELINE_SECRET" -o /tmp/state.json
   python3 agent/summarize_state.py /tmp/state.json > /tmp/summary.json
   ```

3. **Baca** `agent/PROMPT_BRAIN_CLAUDE.md`, `CREATIVE_GUIDE_CAROUSEL.md`, dan `/tmp/summary.json`.
   Pakai `nomor_trs_berikutnya` dari summary untuk kode creative baru.

4. **Tulis hasil** sesuai format di `PROMPT_BRAIN_CLAUDE.md` ke `/tmp/brain_out.json`, lalu cek valid:
   ```bash
   python3 -c "import json; json.load(open('/tmp/brain_out.json')); print('json ok')"
   ```

5. **Kirim ke dashboard:**
   ```bash
   curl -sS -X POST "$DASHBOARD_URL/api/brain-sync" \
     -H "content-type: application/json" -H "x-pipeline-secret: $PIPELINE_SECRET" \
     --data-binary @/tmp/brain_out.json
   ```
   Respons harus `"ok": true`.

6. **Jangan** commit, push, atau mengubah file di repo.

7. **Laporan akhir** (singkat): status scrape, status iklan (jumlah video iklan terkirim atau "dilewati"), status budget (kampanye yang hampir habis), jumlah DNA / Visual Guide / evaluasi / checklist yang terkirim, dan error kalau ada.
