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
   Periode: 7 hari terakhir sampai kemarin (zona WIB), format `YYYY-MM-DD`.
   1. `tool_execute` → `tool_name: "gmv_max_campaign_get"`, params
      `{"advertiser_id": ADV, "filtering": {"gmv_max_promotion_types": ["PRODUCT_GMV_MAX"]}, "page_size": 100,
        "fields": ["campaign_id","campaign_name","operation_status"]}` → semua `campaign_id`.
      Lalu `gmv_max_report_get` params
      `{"advertiser_id": ADV, "store_ids": [STORE], "start_date": S, "end_date": E,
        "dimensions": ["campaign_id","item_group_id"], "metrics": ["cost"], "page_size": 100,
        "filtering": {"campaign_ids": [semua campaign_id]}}`.
      Kumpulkan `campaign_id` dan `item_group_id` yang `cost` > 0.
   2. `tool_execute` → `gmv_max_report_get` dengan `"dimensions": ["item_id"]`,
      `"filtering": {"campaign_ids": [...], "item_group_ids": [...]}`, `"sort_field": "cost"`, `"page_size": 50`,
      `"metrics": ["cost","gross_revenue","roi","orders","product_impressions","product_clicks","ad_click_rate",
      "ad_conversion_rate","ad_video_view_rate_2s","ad_video_view_rate_6s","ad_video_view_rate_p100"]`.
   2b. **Cari akun pemilik tiap video** (buat filter afiliasi). Ambil identitas sekali:
      `tool_execute` → `gmv_max_identity_get` params
      `{"advertiser_id": ADV, "store_id": STORE, "store_authorized_bc_id": BC}` → `identity_list`.
      Lalu untuk tiap `item_id` dari langkah 2 (maks 50), `tool_execute` → `gmv_max_video_get` params
      `{"advertiser_id": ADV, "store_id": STORE, "store_authorized_bc_id": BC, "need_auth_code_video": true,
        "identity_list": [semua identitas dari identity_list, field identity_type/identity_id/store_id/identity_authorized_bc_id],
        "keyword": item_id, "page_size": 1}`.
      Dari `item_list[0]` ambil `identity_info.display_name` → `tt_account_name`, `text` → `caption`,
      `video_info.duration` → `duration_s`. `account_type` = `"OFFICIAL"` kalau `identity_info.identity_id`
      = `official_identity_id` di `agent/ads_config.json`, selain itu `"AFFILIATE"`.
      **Cek SEMUA item_id satu per satu, jangan berhenti walau beberapa pertama kosong.**
      Kalau video tidak ketemu (`item_list` kosong), itu video kreator afiliasi dari luar yang ikut
      diiklankan GMV Max: isi `account_type: "AFFILIATE"` dan biarkan `tt_account_name`, `caption`,
      `duration_s` kosong.
   3. Tulis `/tmp/ads.json` = `{"period": "S..E", "items": [ {"item_id": ..., <semua metrik di atas>,
      "tt_account_name": ..., "account_type": ..., "caption": ..., "duration_s": ...} ]}`
      (buang baris `item_id` = `-1`, itu kartu produk, bukan video). Lalu kirim:
      ```bash
      curl -sS -X POST "$DASHBOARD_URL/api/ads-sync" \
        -H "content-type: application/json" -H "x-pipeline-secret: $PIPELINE_SECRET" \
        --data-binary @/tmp/ads.json
      ```
   Kalau connector tidak tersedia atau error izin, lewati dan catat di laporan akhir.

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

7. **Laporan akhir** (singkat): status scrape, status iklan (jumlah video iklan terkirim atau "dilewati"), jumlah DNA / Visual Guide / evaluasi / checklist yang terkirim, dan error kalau ada.
