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

7. **Laporan akhir** (singkat): status scrape, jumlah DNA / Visual Guide / evaluasi / checklist yang terkirim, dan error kalau ada.
