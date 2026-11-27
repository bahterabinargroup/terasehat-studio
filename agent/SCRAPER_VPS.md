# Brief untuk Bot Scraper (VPS)

Bot ini membaca data dari akun TikTok Ads yang belum bisa ditarik lewat API, lalu mengirimkannya ke dashboard Terasehat.
Bot tidak perlu bicara langsung dengan Claude. Titik temunya adalah API dashboard. Data yang dikirim bot dibaca oleh dashboard dan oleh jadwal Claude Brain pada jalan berikutnya.

```
[Bot VPS: browser login akun TH] --+
[Bot VPS: browser login akun TS] --+--> POST https://terasehat-studio.pages.dev/api/... --> D1 --> Dashboard + Claude Brain
```

## 1. Aturan wajib

1. **Hanya membaca.** Jangan pernah klik tombol yang mengubah sesuatu, seperti edit, aktifkan atau matikan kampanye, ubah budget, top up, hapus, atau kirim. Akun iklan bisa mengeluarkan uang.
2. **Satu akun, satu toko.** Data dari akun TH hanya dikirim dengan `store_code: "TH"`, dan data dari akun TS hanya dengan `"TS"`. Jangan pernah tertukar.
3. **NB jangan dikirim.** NB sudah ditarik lewat API resmi. Kalau bot juga mengirim NB, data keduanya saling menimpa.
4. **Login dilakukan manusia.** Pemilik akun (Alam untuk TH, Alfian untuk TS) login sendiri di browser bot, termasuk OTP-nya. Jangan simpan password atau OTP di bot.
   - Kalau sesi habis atau muncul halaman login/OTP, berhenti dan kabari owner. Jangan coba login otomatis.
5. **Jangan kirim data uji ke produksi.** Run pertama cukup tulis JSON ke file (dry-run) dan serahkan ke owner untuk dicek. Setelah formatnya benar, baru POST.
6. **Secret hanya di environment VPS.** Simpan sebagai variabel `PIPELINE_SECRET`. Jangan ditaruh di kode, di log, atau di chat.

## 2. Cara mengirim

- Base URL: `https://terasehat-studio.pages.dev`
- Setiap request memakai header:
  - `Content-Type: application/json`
  - `x-pipeline-secret: $PIPELINE_SECRET`
- Semua uang dalam **Rupiah, angka polos**, **tanpa PPN**, persis seperti angka yang tampil di TikTok. Contoh: `1250000`, bukan "Rp1,25 jt".
- Persentase ditulis sebagai angka. 2,5% ditulis `2.5`.
- Tanggal memakai **WIB**, format `YYYY-MM-DD`.
- Respons sukses berisi `{"ok": true, ...}`. Kalau `ok` bernilai false, catat `error` lalu lanjutkan ke toko berikutnya.

## 3. Data yang dibutuhkan, urut prioritas

### P1. Spend dan GMV harian akun (paling penting)

Ini yang mengisi kartu "GMV iklan" dan "Biaya iklan". Sumbernya Ads Manager → GMV Max: total akun per hari untuk 14 hari terakhir. Data hari ini boleh ikut, karena nilainya akan ditimpa pada run berikutnya.

Kampanye diambil dari daftar kampanye GMV Max, dengan budget harian dan spend hari ini. Kalau tidak terbaca, kirim `campaigns: []`.

`POST /api/budget-sync`

```json
{
  "store_code": "TH",
  "stat_date": "2026-11-26",
  "campaigns": [
    { "campaign_id": "1234567890", "campaign_name": "GMV Max - Produk A", "operation_status": "ENABLE",
      "daily_budget": 500000, "auto_budget": false, "max_budget": 0,
      "spend_today": 213000, "revenue_today": 845000 }
  ],
  "daily": [
    { "date": "2026-11-25", "cost": 480000, "gross_revenue": 1900000 },
    { "date": "2026-11-24", "cost": 455000, "gross_revenue": 1720000 }
  ]
}
```

Catatan: `operation_status` diisi `ENABLE` atau `DISABLE`. Daftar kampanye untuk toko ini selalu diganti utuh setiap kali dikirim.

### P2. Saldo akun iklan

API TikTok tidak menyediakan saldo, jadi ini nilai tambah terbesar dari bot. Saldo dibaca dari halaman Payment / Balance di Ads Manager.

`POST /api/update`

```json
{ "type": "ads_balance", "store_code": "TH", "balance_idr": 2350000, "warn_days": 3 }
```

### P3. Performa per video (GMV Max)

Data ini dipakai untuk ranking video WINNING / POTENSIAL / BONCOS. Sumbernya laporan GMV Max per creative/video.

`item_id` adalah **ID video TikTok**, yaitu angka di link `tiktok.com/@akun/video/<ID>`.

Kirim satu request per jendela waktu:
- 7 hari: `window_days: 7`
- 30 hari: `window_days: 30`
- Bulan berjalan: `"month": "2026-11"`, tanpa `window_days`

Jendela 10, 90, dan 180 hari opsional.

`POST /api/ads-sync`

```json
{
  "store_code": "TH",
  "period": "2026-11-19..2026-11-25",
  "window_days": 7,
  "items": [
    { "item_id": "7571234567890123456", "cost": 350000, "gross_revenue": 1400000, "roi": 4.0, "orders": 12,
      "product_impressions": 25000, "product_clicks": 640, "ad_click_rate": 2.56, "ad_conversion_rate": 1.9,
      "ad_video_view_rate_2s": 38.5, "ad_video_view_rate_6s": 21.0, "ad_video_view_rate_p100": 6.2,
      "creative_delivery_status": "DELIVERING", "tt_account_name": "nama_akun_tiktok",
      "account_type": "AFFILIATE", "caption": "teks caption video", "duration_s": 32 }
  ]
}
```

- Wajib: `item_id`, `cost`, `gross_revenue`, `orders`.
- Kolom lain diisi kalau terbaca di layar. Kalau tidak, boleh dihilangkan.
- `account_type`: `OFFICIAL` untuk akun toko sendiri, `MARKETING` untuk akun marketing toko, `AFFILIATE` untuk kreator luar.
- Maksimal 200 video per request.

## 4. Jadwal

Bot jalan sekitar 30 menit sebelum jadwal Claude Brain, supaya Brain langsung memakai data terbaru:

| Bot jalan (WIB) | Brain jalan (WIB) |
|---|---|
| 05:30 | 06:00 |
| 11:30 | 12:00 |
| 17:30 | 18:00 |
| 20:30 | 21:00 |

Urutan per toko: P1, lalu P2, lalu P3.
Untuk mengurangi risiko flag, beri jeda antar halaman dan jangan buka lebih dari satu akun bersamaan di IP yang sama.

## 5. Contoh kirim (dari VPS)

```bash
curl -s -X POST https://terasehat-studio.pages.dev/api/budget-sync \
  -H "Content-Type: application/json" \
  -H "x-pipeline-secret: $PIPELINE_SECRET" \
  --data @th_budget.json
```

## 6. Laporan setiap run

Setelah selesai, bot mencatat ringkasan per toko berisi:
- jumlah hari, kampanye, dan video yang terkirim;
- saldo;
- error, kalau ada.

Kalau ada toko yang gagal karena sesi login habis, kabari owner hari itu juga. Datanya tidak akan masuk sampai pemilik akun login ulang.
