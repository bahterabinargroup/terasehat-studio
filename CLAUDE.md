# CLAUDE.md — Konteks & Instruksi Sistem Terasehat Pipeline

> **PERHATIAN UNTUK AGENT CLAUDE (CLAUDE CODE / COWORK DI LAPTOP OWNER):**
> Saat owner memintamu "bedah folder ini" atau "jalankan/setup pipeline Terasehat", baca seluruh dokumen ini dan `PANDUAN_LENGKAP_TERASEHAT.md` terlebih dahulu.
> Kamu adalah **"AI Agent: Claude (Brain)"** di dalam arsitektur **Terasehat Content & Ads Intelligence Pipeline**.

---

## 1. Gambaran Besar Sistem (Sesuai Diagram Arsitektur Terasehat)

Sistem ini adalah **Closed-Loop Content & Ads Pipeline** untuk brand/toko **Terasehat** (TikTok & Tokopedia/TikTok Shop Seller Center) yang mengadopsi arsitektur **Zen Studio**:
* **Tidak memproduksi video AI (bukan Google Flow).** Produksi video dilakukan **manual oleh Tim Content Creator (Manusia)**.
* **Dashboard Pipeline (Cloudflare Pages + D1):** Menjadi pusat kendali untuk melihat laporan data, ranking performa iklan/konten, panduan kreatif (*Creative Guide*), naskah (*Script - Check by human*), dan *Daily Checklist* tim konten.
* **AI Agent: Claude (Brain):** Berjalan dari laptop owner (menggunakan langganan **Claude Pro**) untuk mengevaluasi data performa (*Self-Learning*), menemukan pola kemenangan (*Find Winning DNA & Algorithm*), dan menyiapkan *Brief + Script + Evaluasi* siklus berikutnya.

```
[Data Tokopedia / TikTok Shop Seller Center] ──┐
                                               ├──► [Dashboard Pipeline (Cloudflare + D1)]
[ScrapeCreators API: TikTok, Shop, Ads Lib] ───┘             │         ▲
                                                             ▼         │ (Push DNA & Script)
                                                    [AI Agent: Claude (Brain)]
                                                             │
                                                             ▼
                                              [Brief & Report di Dashboard:]
                                              • Script (Check by Human)
                                              • Daily Checklist
                                              • Guide Creative
                                              • Evaluasi & Review
                                                             │
                                                             ▼
                                              [Create Manual by Team Content Creator (Manusia)]
                                                             │
                                                             ▼
                                              [Output (ADS) Result — Take from Seller Center]
                                                             │
                                                             ▼
                                              [Self-Learning & Evaluate (Claude):]
                                              • Ranking / Scoring ADS Top-to-Bottom
                                              • Find Winning DNA & Algorithm
                                              └──────────────► (Kembali ke Dashboard Pipeline)
```

---

## 2. Aturan Hemat Kuota `Claude Pro` (WAJIB DIPATUHI AGENT)

Karena laptop owner menggunakan langganan **Claude Pro** (memiliki batas kuota pesan per 5 jam):
1. **Jangan pernah memproses ribuan baris CSV mentah langsung di dalam prompt Claude.**
   * Biarkan kode JavaScript di `functions/api/seller-center.js` dan script lokal `agent/garap-terasehat.sh` yang menghitung angka matematika (*ROAS, GMV, CTR, Engagement Rate, Outlier Score, dan pengurutan Ranking Top-to-Bottom*).
2. **Claude hanya menerima ringkasan matang (Top 5 Winner vs Bottom 5 Boncos/Flop + Transkripnya).**
   * Tugas Claude murni bagian kognitif tingkat tinggi:
     1. Membedah **kenapa** 5 konten teratas menghasilkan penjualan/views tinggi dan kenapa 5 konten terbawah gagal (*Self-Learning*).
     2. Meng-update **Winning DNA & Rumus Algoritma Terasehat**.
     3. Menulis **3–5 Script Baru** (status awal: `waiting_human_check`), **Creative Guide**, dan **Daily Checklist** untuk tim kreator manusia.
3. **Jadwal Eksekusi Ideal:** Cukup dijalankan **2x sehari (09:00 & 21:00 WIB)** atau saat owner menekan tombol sinkronisasi.

---

## 3. Peta File di Dalam Folder `terasehat-studio/`

```
terasehat-studio/
├── CLAUDE.md                        # Instruksi utama untuk Agent Claude di laptop owner
├── PANDUAN_LENGKAP_TERASEHAT.md     # Guide lengkap dari A-Z (Arsitektur, Setup, SOP Tim, Dokumentasi API)
├── package.json                     # Konfigurasi npm & perintah deploy Wrangler
├── wrangler.toml                    # Konfigurasi Cloudflare Pages & Database D1 (terasehat-db)
├── schema.sql                       # Skema 7 tabel database Cloudflare D1
├── .env.example                     # Contoh konfigurasi API Key & URL
├── setup-laptop-owner.sh            # Script otomatis setup Cloudflare D1 + Deploy pertama kali
├── agent/
│   ├── garap-terasehat.sh           # Worker lokal (Cron 09:00 & 21:00 WIB) penghubung Cloudflare <-> Claude Pro
│   └── PROMPT_BRAIN_CLAUDE.md       # Template prompt standar saat Claude mengevaluasi DNA & membuat Script
├── functions/
│   └── api/
│       ├── state.js                 # Endpoint GET/POST seluruh state dashboard dari Cloudflare D1
│       ├── scrape.js                # Endpoint penarik data ScrapeCreators (TikTok, TikTok Shop, Ads Library)
│       ├── seller-center.js         # Endpoint import/sync laporan Tokopedia & TikTok Shop Seller Center + Auto-Scoring
│       └── brain-sync.js            # Endpoint pertukaran data antara Dashboard Cloudflare & Claude di laptop owner
└── public/
    ├── index.html                   # Shell utama Web Dashboard Terasehat (Gaya Obsidian Zen Studio)
    ├── app.css                      # Desain sistem Obsidian (#151515, aksen ungu/hijau/kuning/merah)
    ├── seed-data.js                 # Data awal simulasi Terasehat (langsung jalan walau D1 baru dibuat)
    └── app.js                       # Aplikasi SPA lengkap dengan 6 modul sesuai diagram Gambar 2
```

---

## 4. Apa yang Harus Dilakukan Claude Saat Owner Membuka Folder Ini Pertama Kali

Jika owner berkata *"Bedah folder ini"* atau *"Bantu jalankan sistem ini di laptopku"*:
1. **Jelaskan dengan bahasa santai & ringkas** bahwa seluruh komponen dari diagram *Terasehat Pipeline* sudah siap di folder ini (mulai dari penarik data ScrapeCreators, pengolah data Seller Center, tabel Ranking Top-to-Bottom, memori Self-Learning Winning DNA, hingga modul Script *Check by human* & *Daily Checklist*).
2. **Cek kesiapan laptop owner:**
   * Apakah `node` & `npx` sudah ter-install (`node -v`).
   * Apakah `wrangler` sudah login ke akun Cloudflare owner (`npx wrangler whoami`).
   * Apakah file `.env` sudah diisi dengan `SCRAPECREATORS_API_KEY`.
3. **Pandu atau jalankan `./setup-laptop-owner.sh`** untuk membuat database D1 `terasehat-db`, menjalankan migrasi `schema.sql`, dan men-deploy dashboard ke Cloudflare Pages milik owner.
