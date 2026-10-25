---
title: "LLM lokal: spesifikasi laptop dan PC minimum untuk menjalankannya"
description: "RAM, VRAM, dan bandwidth memori menentukan apakah laptop atau PC Anda sanggup menjalankan LLM lokal. Ini spesifikasi minimum yang realistis."
status: published
slug: llm-lokal-spesifikasi-minimum-laptop-pc
category: laptops
tags:
  - laptops
  - local-llm
  - ai
pubDate: 2026-10-21
updatedDate: 2026-10-21T09:00:00.000Z
coverUrl: /media/6e77f5cd-4820-489a-a442-27fb426f9fbb.jpg
coverAlt: Komputer desktop dengan kartu grafis, pendingin besar, dan pencahayaan RGB di dalam casing kaca.
focusKeyword: LLM lokal
targetIntent: informational
noindex: false
affiliate: false
faq:
  - question: Apakah RAM 8 GB cukup untuk menjalankan LLM lokal?
    answer: Untuk model 7-8 miliar parameter dengan kuantisasi 4-bit, 8 GB terlalu ketat karena sistem operasi dan aplikasi lain sudah memakai sebagian besar memori. 16 GB adalah titik awal yang realistis, sedangkan model 3-4 miliar parameter masih bisa berjalan di 8 GB dengan kualitas terbatas.
  - question: Apakah GPU wajib untuk menjalankan LLM lokal?
    answer: Tidak wajib. CPU modern dengan instruksi AVX2 bisa menjalankan model 7-8 miliar parameter, tetapi kecepatannya biasanya hanya beberapa token per detik. GPU dengan 8 GB VRAM atau lebih membuat pengalaman jauh lebih nyaman, terutama untuk prompt panjang dan context besar.
  - question: Berapa VRAM yang dibutuhkan untuk model 70 miliar parameter?
    answer: Pada kuantisasi 4-bit, bobot model 70 miliar parameter memakan sekitar 40 GB. Anda membutuhkan GPU dengan 48 GB VRAM atau lebih, atau RAM sistem 64 GB bila menjalankan model sepenuhnya di CPU. Laptop biasa tidak praktis untuk kelas ini.
  - question: Apakah NPU 40 TOPS bisa menggantikan VRAM?
    answer: Tidak untuk model besar. NPU pada laptop Copilot+ dirancang untuk model kecil dan tugas latar belakang. Model 7-8 miliar parameter tetap lebih nyaman dijalankan di GPU dengan VRAM cukup atau di memori terpadu Apple Silicon.
  - question: Apakah context length memengaruhi kebutuhan memori?
    answer: Ya. KV cache tumbuh seiring panjang context. Context 32 ribu atau 128 ribu token bisa menambah beberapa GB memori di luar bobot model. Jika kehabisan memori, turunkan context length sebelum menurunkan kuantisasi.
---

Menjalankan LLM di laptop sendiri terdengar seperti pekerjaan untuk workstation mahal. Kenyataannya, model 7-8 miliar parameter dengan kuantisasi 4-bit bisa berjalan di laptop 16 GB RAM, hanya lebih lambat. Yang menentukan bukan merek atau harga laptop, melainkan berapa banyak memori yang bisa dipakai model dan seberapa cepat memori itu memasok bobot model.

Artikel ini membahas batas nyata tersebut: berapa RAM dan VRAM yang dibutuhkan untuk setiap kelas model, mengapa bandwidth memori lebih penting daripada jumlah inti CPU, dan spesifikasi minimum yang masuk akal untuk laptop maupun PC desktop pada 2026.

## Memori adalah batas pertama

Model bahasa adalah kumpulan bobot yang harus dibaca berulang kali saat menghasilkan setiap token. Bobot itu disimpan dalam file, lalu dimuat ke memori. Rumus kasar untuk memperkirakan ukurannya:

**GB bobot ≈ jumlah parameter (miliar) × bit per bobot ÷ 8**

Model 8 miliar parameter pada 4-bit kira-kira memakai 4 GB untuk bobotnya. Ditambah KV cache, buffer runtime, dan ruang untuk sistem operasi, kebutuhan totalnya biasanya 1-3 GB lebih besar. Model 14 miliar parameter pada 4-bit berada di sekitar 8-9 GB, dan model 70 miliar parameter di sekitar 40 GB.

Angka itu menjelaskan mengapa 8 GB RAM terasa sesak: sistem operasi, browser, dan aplikasi lain sudah memakai 4-6 GB sebelum model dijalankan. Memori virtual atau swap bisa menampung sisanya, tetapi kecepatannya turun drastis karena bobot harus dibaca dari SSD.

| Kelas model (Q4) | Perkiraan bobot | RAM minimum | VRAM atau unified memory | Catatan |
| --- | --- | --- | --- | --- |
| 3-4B | 2-3 GB | 8 GB | 6 GB | Jalan di laptop tipis, kualitas terbatas |
| 7-8B | 4-5 GB | 16 GB | 8 GB | Titik manis untuk kebanyakan orang |
| 13-14B | 8-9 GB | 24 GB | 12 GB | CPU-only terasa lambat |
| 30-34B | 18-20 GB | 32 GB | 24 GB | Desktop atau workstation |
| 70B | 38-42 GB | 64 GB | 48 GB | Bukan untuk laptop biasa |

Tabel ini adalah perkiraan untuk kuantisasi 4-bit dengan context sedang. Model dengan arsitektur MoE bisa berbeda: hanya sebagian parameter aktif saat inference, tetapi seluruh bobot tetap harus muat di memori.

## RAM, VRAM, dan unified memory bukan hal yang sama

RAM sistem bisa menjalankan model lewat CPU. Ini yang dilakukan llama.cpp dan Ollama secara default ketika GPU tidak tersedia atau VRAM tidak cukup. Masalahnya bukan kapasitas, melainkan bandwidth. DDR5 dual-channel 5600 MT/s memasok sekitar 90 GB/s, sedangkan GPU menengah bisa dua sampai sepuluh kali lebih cepat.

VRAM GPU adalah jalur tercepat. Selama bobot dan KV cache muat di VRAM, GPU membaca memori jauh lebih cepat dan menghasilkan token lebih banyak per detik. Ketika VRAM habis, driver akan memindahkan sebagian data ke RAM sistem. Sebagian orang menyebutnya shared GPU memory. Kinerjanya tidak hancur seketika, tetapi turun cukup jauh dan sering disertai stutter.

Apple Silicon memakai pendekatan berbeda: CPU dan GPU berbagi satu kolam unified memory. Model yang muat di memori terpadu bisa dijalankan dengan Metal tanpa menyalin bobot ke VRAM terpisah. Namun macOS tidak memberikan seluruh RAM ke GPU. Ada batas working set yang direkomendasikan, dan batas itu bisa disesuaikan, jadi 16 GB bukan berarti 16 GB penuh untuk model. Untuk kelas 7-8B, 16 GB adalah titik awal; 24-32 GB jauh lebih nyaman untuk 14B dan context panjang.

![Die GPU NVIDIA TU102 milik GeForce RTX 2080 Ti di bawah pembesaran mikroskop.](/media/4e186b89-3d55-442a-8f90-1783fee7a415.jpg)

*Foto: FritzchensFritz, CC0 1.0, via [Flickr](https://www.flickr.com/photos/130561288@N04/46166646961).*

## Spesifikasi minimum laptop

Untuk laptop, ada tiga tingkat yang masuk akal.

**Laptop 16 GB RAM tanpa GPU diskret.** Ini minimum realistis untuk model 7-8B Q4. Pilih CPU modern dengan sedikitnya enam inti dan dukungan AVX2, SSD NVMe dengan 20-30 GB ruang kosong, dan pastikan RAM tidak disolder 8 GB. Kecepatan CPU-only biasanya berkisar beberapa token per detik. Prompt panjang terasa lambat karena fase prefill jauh lebih berat daripada generasi token.

**Laptop dengan GPU 8 GB VRAM.** Kartu kelas RTX 4060 atau 5060 laptop membuat model 7-8B Q4 berjalan nyaman, termasuk context 8-16 ribu token. Model 14B Q4 masih bisa dicoba, tetapi context harus dikurangi dan sebagian lapisan mungkin meluber ke RAM.

**Laptop dengan GPU 12-16 GB VRAM.** Ini kelas yang cocok untuk 14B Q4 dengan context panjang, atau 8B pada kuantisasi lebih tinggi. Model 30B ke atas tetap tidak praktis karena bobotnya saja sudah 18-20 GB.

Dua hal sering diabaikan. Pertama, laptop yang menjalankan LLM secara terus-menerus akan throttling karena panas; daya dan pendinginan menentukan apakah kecepatan awal bertahan setelah sepuluh menit. Kedua, NPU 40 TOPS pada laptop Copilot+ bukan pengganti VRAM. NPU berguna untuk model kecil dan tugas latar belakang, bukan untuk model 8B dengan context besar.

![Laptop terbuka di meja dengan beberapa perangkat terhubung.](/media/7a22b6c9-dc6e-4734-b460-a0de9fb2defb.jpg)

*Foto: Andrew Hayward, CC BY-SA 2.0, via [Flickr](https://www.flickr.com/photos/40279435@N00/10905743).*

## Spesifikasi minimum PC desktop

Desktop memberi ruang untuk komponen yang lebih besar dan pendinginan yang lebih baik. Konfigurasi minimumnya:

- **16 GB RAM + GPU 8 GB.** Cukup untuk 7-8B Q4. Ini titik masuk termurah yang masih terasa responsif.
- **32 GB RAM + GPU 12-16 GB.** Nyaman untuk 14B Q4. Model 30B bisa dijalankan dengan offload sebagian ke CPU, tetapi kecepatannya turun.
- **64 GB RAM + GPU 24 GB.** Cocok untuk 30-34B Q4. Model 70B Q4 masih membutuhkan 48 GB VRAM atau lebih; dengan 24 GB, sebagian besar lapisan harus berjalan di CPU dan hasilnya sangat lambat.
- **64-128 GB RAM tanpa GPU besar.** Masih bisa menjalankan 70B Q4 di CPU, tetapi kecepatannya biasanya hanya satu sampai tiga token per detik. Ini pilihan untuk eksperimen, bukan untuk bekerja seharian.

Untuk desktop dengan GPU kelas menengah, PSU 650-750 watt sudah memadai. Pastikan casing punya aliran udara yang baik karena GPU akan berada di beban penuh selama inference berlangsung. Model yang berjalan di CPU juga menghasilkan panas, meskipun lebih sedikit.

![Mac mini M2 di atas meja kayu.](/media/de8a482b-5e59-4b8a-9c7b-0cf50d87da7b.jpg)

*Foto: yto, CC BY 2.0, via [Flickr](https://www.flickr.com/photos/27983255@N00/53719781797).*

## Bandwidth memori menentukan kecepatan

Saat menghasilkan token, GPU membaca seluruh bobot model untuk setiap token. Karena itu, kecepatan generasi sangat bergantung pada bandwidth memori, bukan hanya jumlah core. Perkiraan kasar untuk batch satu:

**token per detik ≈ bandwidth memori ÷ ukuran model dalam byte**

RTX 4090 memiliki bandwidth sekitar 1.008 GB/s. Untuk model 8B Q4 yang berukuran sekitar 5 GB, batas teoretisnya sekitar 200 token per detik. Angka nyata lebih rendah karena overhead, KV cache, dan efisiensi kernel, tetapi urutan besarnya memberi gambaran. DDR5 dual-channel sekitar 90 GB/s memberi batas teoretis sekitar 18 token per detik untuk model yang sama, dan CPU-only sering berada di bawah itu. Apple M4 Pro dengan bandwidth 273 GB/s berada di antaranya.

Fase prefill, yaitu saat model membaca prompt panjang, lebih bergantung pada daya komputasi daripada bandwidth. Inilah sebabnya GPU tetap terasa jauh lebih cepat ketika Anda menempelkan dokumen panjang, meskipun kecepatan generasi tokennya tidak terlalu berbeda.

## Kuantisasi: 4-bit adalah titik awal

Kuantisasi mengurangi jumlah bit per bobot. Format GGUF yang dipakai llama.cpp, Ollama, dan LM Studio menyediakan beberapa tingkat. Q4_K_M adalah titik awal yang paling sering direkomendasikan karena keseimbangan antara ukuran dan kualitas. Q5 dan Q6 sedikit lebih besar dengan penurunan kualitas yang lebih kecil, sedangkan Q8 mendekati kualitas asli tetapi memakan memori jauh lebih banyak. Di bawah Q3, kualitas biasanya mulai terasa menurun, terutama untuk tugas penalaran dan kode.

Kuantisasi tidak mengurangi KV cache. Cache itu dihitung dari jumlah lapisan, jumlah head, dimensi, dan panjang context. Model dengan 32 ribu token context bisa menambah beberapa GB di luar bobot. Jika memori habis, mengurangi context length biasanya lebih baik daripada memaksa kuantisasi yang lebih rendah.

## Storage, termal, dan daya

Sisakan ruang SSD. File model 7-8B Q4 berukuran 4-6 GB, model 14B sekitar 8-10 GB, dan model 70B sekitar 40 GB. SSD NVMe membuat pemuatan awal jauh lebih cepat, tetapi setelah model berada di memori, SSD tidak lagi menentukan kecepatan token. Sisakan setidaknya 20 persen ruang kosong agar sistem tidak melambat.

Pada laptop, pantau suhu dan frekuensi setelah beberapa menit. Banyak laptop gaming mengalami penurunan performa setelah 10-15 menit karena batas daya. Pada desktop, pastikan ventilasi tidak tertutup dan pertimbangkan undervolt GPU untuk menjaga suhu tetap rendah tanpa kehilangan banyak performa.

## Checklist sebelum membeli

- RAM 16 GB adalah minimum untuk 7-8B Q4; 32 GB lebih nyaman untuk 14B dan context panjang.
- VRAM 8 GB adalah minimum praktis untuk GPU; 12-16 GB adalah titik nyaman.
- Cek bandwidth memori, bukan hanya kapasitas VRAM.
- Sisakan 30-50 GB SSD untuk model dan cache.
- Hindari laptop dengan RAM 8 GB yang disolder.
- Pastikan laptop punya ruang pendinginan yang layak untuk beban terus-menerus.
- Uji dengan model kecil lebih dulu, lalu ukur token per detik sebelum membeli perangkat yang lebih besar.

## Kesimpulan

Untuk kebanyakan orang, laptop 16 GB RAM sudah cukup untuk mencoba LLM lokal pada kelas 7-8B dengan kuantisasi 4-bit. Jika ingin pengalaman yang nyaman, laptop atau desktop dengan GPU 8-12 GB VRAM adalah titik manis. Model 14B membutuhkan 12-16 GB VRAM atau 24-32 GB RAM, sedangkan 30B ke atas sudah masuk wilayah desktop dan workstation. Model 70B bukan target yang realistis untuk laptop biasa.

Mulai dari model kecil, ukur kecepatan dan kualitasnya, lalu naikkan ukuran model hanya jika memori masih tersisa. Menambah RAM atau VRAM tanpa memahami bandwidth sering kali hanya menambah biaya, bukan kecepatan.

## Sumber dan bacaan lanjutan

- llama.cpp, dokumentasi GGUF, kuantisasi, dan backend CPU/GPU: https://github.com/ggml-org/llama.cpp
- Hugging Face, panduan kuantisasi model: https://huggingface.co/docs/transformers/main/en/quantization/overview
- Kwon et al., Efficient Memory Management for Large Language Model Serving with PagedAttention, untuk penjelasan KV cache: https://arxiv.org/abs/2309.06180
- Dettmers et al., LLM.int8: 8-bit Matrix Multiplication for Transformers at Scale: https://arxiv.org/abs/2210.17323
- NVIDIA, spesifikasi GeForce RTX 4090, termasuk bandwidth memori 1008 GB/s: https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/
- Apple Newsroom, pengenalan M4 Pro dan M4 Max, termasuk bandwidth memori 273 GB/s: https://www.apple.com/newsroom/2024/10/apple-introduces-m4-pro-and-m4-max/
- Apple Developer, Metal recommendedMaxWorkingSetSize, untuk batas working set GPU di unified memory: https://developer.apple.com/documentation/metal/mtldevice/recommendedmaxworkingsetsize
- Ollama, dokumentasi model dan penggunaan memori: https://docs.ollama.com/
- LM Studio, dokumentasi menjalankan model secara lokal: https://lmstudio.ai/docs
- JEDEC, standar DDR5 (JESD79-5), untuk perhitungan bandwidth memori sistem: https://www.jedec.org/standards-documents/docs/jesd79-5c

## Panduan terkait

- [How to read a product spec sheet without being fooled](/blog/how-to-read-a-product-spec-sheet-without-being-fooled/)
- [How to choose a laptop stand for daily use](/blog/how-to-choose-a-laptop-stand-for-daily-use/)
- [How to choose a USB-C docking station for a laptop](/blog/how-to-choose-a-usb-c-docking-station-for-a-laptop/)
