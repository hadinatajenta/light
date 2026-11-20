# Laporan malam 21 November 2026: Light Scripts

## Ringkasan
- Semua perbaikan teknis dan konten yang bisa dikerjakan agent sudah selesai dan live.
- Riset monetisasi dan riset keyword selesai. Hasilnya ada di `docs/monetization-research.md` dan `docs/content-calendar.md`.
- Desain ulang sudah jadi, tapi **belum live**. Kodenya ada di branch `feat/redesign-preview` dan menunggu persetujuan Anda.
- Target $200 per bulan **realistis dalam 60–90 hari, dengan syarat**: penulis rutin menerbitkan 1–2 artikel per minggu yang berisi foto dan ukuran sendiri, dan pendapatan utama di awal datang dari **affiliate**, bukan AdSense.

## Yang sudah live di produksi
| Pekerjaan | Hasil |
|---|---|
| Kartu sosial otomatis `/og/<slug>.png` | Gambar 1200×630 dengan foto cover, scrim hitam, kicker teal, dan judul. Dipakai otomatis saat link dibagikan ke Facebook, Threads, atau WhatsApp. |
| Judul ulang 35 artikel | Memakai kata yang benar-benar dicari orang (data Google Autocomplete). Formatnya bervariasi, hanya 3 judul yang diawali "How to". Tidak ada klaim "tested". Deskripsi meta juga ditulis ulang. Sudah dikirim ke IndexNow. |
| Perbaikan layout | Tabel tidak lagi terpotong. Layout desktop seimbang. Label kategori rapi. Klaim "hands-on testing" palsu di hero dihapus. |
| Akses crawler | Googlebot, AdSense, Bingbot, ChatGPT (OAI-SearchBot dan GPTBot), Perplexity, dan Claude semuanya mendapat respons 200. |
| Commit | `cc09753`, `0de1fe3`, dan dokumen laporan ini, semuanya di `main`. |

## Temuan penting
1. **AdSense tidak bisa diakses dari akun hadinatajenta122@gmail.com.**
   - Akun penerbit `pub-2315999793389333` terdaftar di akun Google lain.
   - Di Gmail ada 3 email "Tindakan diperlukan: Permohonan AdSense Anda" (15 Okt, 29 Okt, 5 Nov). Jadi permohonan **ditolak tiga kali**, bukan "sedang ditinjau".
   - Penyebab paling mungkin: konten tipis atau massal, yaitu masalah yang sudah kita bereskan.
   - **Saran: jangan ajukan ulang dulu.** Tunggu 6–8 minggu dan 8–16 artikel berfoto asli.
2. **Bing Webmaster Tools belum terdaftar.**
   - Login otomatis diblokir, jadi saya tidak bisa mendaftarkannya.
   - **Langkah Anda, 2 menit:** buka bing.com/webmasters, login dengan Google, pilih *Import from Google Search Console*, lalu pilih lightscripts.com.
   - Ini penting karena pencarian ChatGPT memakai indeks Bing.
3. **Ada deploy yang bukan dari saya** pada 01:34 WIB, versi `373d10e4`, dari akun Anda lewat `wrangler versions upload`.
   - Isinya sama dengan kode terbaru, jadi tidak ada yang rusak.
   - Kemungkinan dari sesi opencode atau Claude lain yang aktif di laptop. Sebaiknya pastikan tidak ada dua agent yang men-deploy bersamaan.
4. **Cover lama yang berisi teks terlihat samar di belakang kartu sosial.**
   - Sesuai keputusan Anda, cover lama dibiarkan dulu.
   - Begitu penulis punya foto bersih, cover artikel utama sebaiknya diganti lebih dulu.

## Hitungan uang (dari `docs/monetization-research.md`)
| Model | Pendapatan per 1.000 pageview | Pageview per bulan untuk $200 |
|---|---|---|
| AdSense saja | sekitar $8 | sekitar 25.000 |
| Affiliate saja | sekitar $13 | sekitar 15.000 |
| AdSense + affiliate | sekitar $21 | sekitar 9.400 (±310 per hari) |
| Journey (Mediavine) + affiliate | sekitar $29 | sekitar 6.800 |

**Program affiliate yang bisa langsung didaftarkan dari Indonesia:**
- UGREEN (8–15%), Anker (8%), Keychron (5%, bayar via PayPal), Secretlab (sampai 12%), Logitech (4–10%), dan FlexiSpot (4–12%), lewat jaringan Impact, Awin, atau CJ.
- Pembayarannya lewat Payoneer atau PayPal.
- **Amazon Associates** baru didaftarkan setelah ada sekitar 50–100 klik per minggu, karena akun baru wajib menghasilkan 3 penjualan dalam 180 hari.

Catatan: halaman disclosure affiliate wajib ada sebelum link affiliate pertama dipasang. Itu bisa saya buat saat Anda siap.

## Rencana konten (dari `docs/content-calendar.md`)
- **7 kelompok topik.** Peluang terbesar: **meja kecil dan meja kos**, **monitor light bar**, dan **masalah monitor arm** (meja berbibir, meja kaca, arm yang turun sendiri). Untuk query ini, yang menempati halaman 1 Google masih Reddit atau blog tipis.
- **18 artikel untuk 12 minggu**, masing-masing dengan daftar foto dan pengukuran yang harus dilakukan. Modal alat ukur sekitar $50 (watt meter, lux meter, meteran), dan per artikel butuh barang seharga $0–$120.
- **5 artikel lama yang bisa langsung diperluas**, misalnya kode error standing desk E01/E04, dan cara mengatasi teks terlalu kecil di monitor 4K pada Mac.
- **Pinterest** cocok untuk 5 artikel visual. Aturan promosi tiap subreddit Reddit sudah dicatat. Aturan utamanya: posting foto dan data, jangan posting link.

## Desain ulang: menunggu keputusan Anda
- Branch `feat/redesign-preview` (commit `ed30131`). Saya juga sudah menghapus link mati dan bahasan off-niche dari halaman author.
- **Perubahannya:**
  - judul dan UI memakai Instrument Sans tebal;
  - search Ctrl+K di header;
  - hero berisi satu artikel unggulan dengan gambar yang memudar ke latar;
  - daftar "Start here" berbentuk tabel ranking dengan tab;
  - daftar isi artikel lebih tenang;
  - kontras teks lebih tinggi.

  Warna krem, logo, dan aksen teal tetap dipertahankan.
- **Screenshot** desktop dan mobile untuk homepage, artikel, dan halaman topik ada di folder scratchpad `design/redesign/`.
- **Untuk mengaktifkan:** cukup bilang "merge desain", lalu saya merge, test, dan deploy.

## Yang perlu Anda lakukan
1. Daftar **Bing Webmaster Tools** (2 menit, langkahnya di atas).
2. Lihat **desain ulang**, lalu putuskan merge atau revisi.
3. Siapkan **akun Payoneer** dan daftar ke 3–4 program affiliate (UGREEN, Anker, Keychron, Logitech) setelah ada beberapa artikel berfoto asli. Saya bisa membantu mengisi formulirnya.
4. Teruskan `docs/writer-brief.md` dan `docs/content-calendar.md` ke penulis. Artikel pertama yang disarankan: **"How Big Is a Dorm Desk? Dimensions and Fit"** dan **"Clamp-On Dorm Desk Extenders Without Drilling"**.
5. Jangan ajukan AdSense ulang sebelum awal Januari.
