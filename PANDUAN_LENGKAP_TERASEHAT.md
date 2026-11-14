# Panduan Lengkap Pipeline Terasehat (Tidak Ada yang Miss)

Dokumen ini adalah panduan utuh dari hulu ke hilir untuk membangun, menjalankan, dan mengoperasikan **Dashboard Pipeline Terasehat** sesuai diagram arsitektur yang telah disepakati.

---

## 1. Bedah Setiap Kotak di Diagram Arsitektur Terasehat

| No | Kotak di Diagram | Fungsi di Sistem | Cara Kerja Teknis |
| :--- | :--- | :--- | :--- |
| **1** | **Data Tokopedia / TikTok Shop Seller Center** | Sumber data performa bisnis riil (GMV/Omzet per video, pesanan terjual, biaya iklan, ROAS, CTR, konversi keranjang kuning). | Admin/Owner mengunduh laporan CSV/Excel dari Seller Center (menu *Analytics → Video Performance / Ads*) lalu *drag-and-drop* ke Dashboard (atau lewat script sinkronisasi lokal). Sistem otomatis mencocokkan ID Video / Kode Script. |
| **2** | **ScrapeCreators API** (`TikTok Ads Library`, `TikTok`, `TikTok Shop`, `Creator Emails`) | Sumber data pasar & organik publik (Views, Likes, Shares, Saves/Bookmark, Transkrip Subtitle Bahasa Indonesia otomatis, katalog produk kompetitor, iklan yang sedang *winning*, dan kontak kreator afiliasi). | Berjalan otomatis via jadwal Cron **2x sehari (09:00 & 21:00 WIB)** memanggil endpoint resmi `api.scrapecreators.com` dengan header `x-api-key`. |
| **3** | **Dashboard Pipeline (Cloudflare)** (`Nama Toko: Terasehat`) | Pusat kendali satu pintu untuk Owner, Advertiser, dan Tim Konten. | Dihosting gratis di **Cloudflare Pages + Pages Functions** dengan database **Cloudflare D1 (SQLite)**. Bisa diakses dari laptop maupun HP seluruh tim. |
| **4** | **AI Agent: Claude (Brain)** | Otak analis yang membedah hasil iklan/konten dan meracik strategi baru. | Berjalan di laptop Owner menggunakan langganan **Claude Pro** lewat script `agent/garap-terasehat.sh` (hemat kuota karena angka sudah dihitung duluan oleh Cloudflare). |
| **5** | **Brief & Report** (`Script Check by human`, `Daily Checklist`, `Guide Creative`, `Evaluasi & Review`) | Paket instruksi harian siap pakai untuk tim konten manusia. | Claude menghasilkan draft Script + panduan visual (*Creative Guide*). Owner/Leader melakukan **Check by Human** (klik tombol *Approve* / *Revisi* di dashboard). Script yang di-*approve* otomatis masuk ke daftar tugas harian tim kreator. |
| **6** | **Create Manual by Team Content Creator (Manusia)** | Eksekusi syuting & editing video oleh tim manusia (bukan video AI). | Tim konten membaca *Script* yang sudah di-*approve* + *Creative Guide*, mencentang *Daily Checklist*, lalu menyematkan **Kode Script** (misal `#TRS012`) di caption/nama iklan saat upload ke TikTok / Seller Center. |
| **7** | **Output (ADS) Result — Take from Seller Center** | Hasil nyata dari video yang sudah tayang & diiklankan. | Begitu video tayang dan menghasilkan penjualan/views di Seller Center, datanya ditarik kembali ke Dashboard. |
| **8** | **Self-Learning & Evaluate** (`Find Winning DNA`, `Ranking/Scoring ADS Top-to-Bottom`, `Find the Algorithm`) | Siklus belajar mandiri agar konten minggu depan selalu lebih tajam dari minggu lalu. | Sistem otomatis memberi skor `0–100` dan mengurutkan semua konten dari **Top ke Bottom**. Claude membandingkan transkrip & pola visual konten teratas vs terbawah untuk memperbarui **Winning DNA Terasehat**. |

---

## 2. Dokumentasi Endpoint ScrapeCreators yang Dipakai

Semua pemanggilan menggunakan header `x-api-key: <SCRAPECREATORS_API_KEY>`:

1. **TikTok Profile & Video + Transkrip Subtitle Otomatis:**
   * `GET https://api.scrapecreators.com/v1/tiktok/profile?handle=terasehat`
   * `GET https://api.scrapecreators.com/v3/tiktok/profile/videos?handle=terasehat`
   * *Catatan:* Di dalam response `/v3/tiktok/profile/videos`, ambil `aweme_list[].video.cla_info.caption_infos` untuk mengunduh file subtitle Bahasa Indonesia (`ind-ID` WebVTT) secara gratis (0 kredit tambahan).
2. **TikTok Shop (Riset Produk & Kompetitor):**
   * `GET https://api.scrapecreators.com/v1/tiktok/shop/search?query=herbal+kesehatan`
   * `GET https://api.scrapecreators.com/v1/tiktok/shop/products?url=<shop_url>`
3. **TikTok Ads Library / Commercial Content:**
   * `GET https://api.scrapecreators.com/v1/tiktok/ads/search?keyword=kesehatan`
4. **Find Creator Emails / Affiliate Scouting (Sesuai Link di Diagram):**
   * Dokumentasi: `https://docs.scrapecreators.com/v1/find-creator-emails`
   * Dipakai ketika Terasehat ingin mencari kontak email/bio kreator afiliasi kesehatan yang videonya sedang FYP untuk diajak kerja sama keranjang kuning.

---

## 3. Rumus Scoring & Ranking "Top-to-Bottom" (Self-Learning)

Supaya objektif dan tidak membuang kuota token Claude, **Cloudflare** menghitung `Total Score (0–100)` untuk setiap video/iklan dengan bobot berikut:

* **Konversi & Penjualan Seller Center (Bobot 50%):**
  * **ROAS Score (30%):** Jika `ROAS >= 3.0x` dapat nilai penuh; jika `< 1.0x` nilai rendah.
  * **GMV / Orders Score (20%):** Perbandingan omzet video tersebut terhadap rata-rata omzet per video di toko Terasehat.
* **Kualitas Algoritma & Retensi TikTok (Bobot 50%):**
  * **Outlier Views Score (20%):** `Views Video ÷ Rata-rata Views Akun`.
  * **Share & Save Ratio (20%):** `(Shares × 2 + Saves) ÷ Views` (indikator terkuat video didorong ke FYP oleh algoritma TikTok).
  * **CTR / Hook Hold (10%):** Persentase penonton yang bertahan melewati 3 detik pertama / klik keranjang kuning.

Berdasarkan `Total Score`, sistem otomatis membagi konten menjadi 3 kasta dari atas ke bawah:
1. 🟢 **TIER S / WINNING (Skor 75–100):** Wajib di-*scale* budget iklannya, dan transkrip 3 detik pertamanya diekstrak ke tabel `winning_dna`.
2. 🟡 **TIER B / POTENSIAL (Skor 45–74):** Hook atau views bagus tapi konversi keranjang kuning masih bocor (perlu perbaikan CTA / penawaran di tengah video).
3. 🔴 **TIER C / EVALUASI & BONCOS (Skor < 45):** Stop iklan, masukkan pola pembukaannya ke daftar *Anti-Pattern* (jangan diulang tim konten).

---

## 4. Sistem "Kode ID Script" (Jembatan Penting Biar Loop Nggak Putus!)

Masalah klasik tim konten adalah: ketika video sudah di-upload ke TikTok dan masuk ke laporan Seller Center, kita lupa video itu asalnya dari *Script* yang mana.

**Solusi di Dashboard Terasehat:**
1. Setiap kali Claude membuat Script baru, sistem memberi kode pendek unik: contoh **`[TRS-101]`**, **`[TRS-102]`**.
2. Saat **Tim Content Creator (Manusia)** meng-upload video tersebut ke TikTok atau memasang materi iklan di Seller Center, mereka cukup menyelipkan kode `TRS-101` di ujung caption atau nama materi iklan.
3. Saat data `Output (ADS) Result` dari Seller Center masuk ke Dashboard, sistem otomatis mendeteksi kode `TRS-101` dan langsung mengaitkan omzet Rp-nya kembali ke Script, Hook, dan nama kreator yang membuatnya!

---

## 5. Langkah Setup di Laptop Owner (Step-by-Step Tanpa Miss)

### Prasyarat di Laptop Owner:
1. Sudah ter-install **Node.js** (versi 18+).
2. Sudah punya akun **Cloudflare** (Gratis).
3. Sudah langganan **Claude Pro** dan meng-install **Claude Code CLI** (`npm install -g @anthropic-ai/claude-code` lalu login dengan perintah `claude`).

### Langkah 1: Buka Folder Ini di Claude Laptop Owner
Copy seluruh folder `terasehat-studio` ini ke laptop owner, buka terminal di dalam folder tersebut, lalu jalankan:
```bash
claude
```
Ketik ke Claude:
> *"Tolong baca CLAUDE.md dan PANDUAN_LENGKAP_TERASEHAT.md, lalu bantu aku setup dan deploy dashboard Terasehat ini ke akun Cloudflare-ku."*

### Langkah 2: Setup Otomatis (Bisa Dijalankan oleh Claude atau Manual)
1. Salin file `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
   *(Di dalamnya sudah terisi `SCRAPECREATORS_API_KEY` yang aktif).*
2. Jalankan script setup:
   ```bash
   bash setup-laptop-owner.sh
   ```
   Script ini akan otomatis:
   * Meminta login Cloudflare di browser (`npx wrangler login`).
   * Membuat database Cloudflare D1 bernama `terasehat-db`.
   * Memasukkan `database_id` ke `wrangler.toml`.
   * Menjalankan `schema.sql` untuk membuat 7 tabel di database D1.
   * Men-deploy dashboard ke Cloudflare Pages (`https://terasehat-studio.pages.dev`).

### Langkah 3: Menjalankan Otak "Claude Brain" (Otomatis 2x Sehari)
Untuk memicu evaluasi *Self-Learning* dan pembuatan *Script + Checklist* baru kapan saja dari laptop owner, jalankan:
```bash
bash agent/garap-terasehat.sh
```
Atau pasang jadwal otomatis di Mac/Linux (crontab) jam 09:00 dan 21:00 WIB:
```bash
(crontab -l 2>/dev/null; echo "0 9,21 * * * cd $(pwd) && bash agent/garap-terasehat.sh >> /tmp/terasehat-agent.log 2>&1") | crontab -
```
