# Penilaian ulang juri `r1-v2-2` (sumber: putaran 1)

Status: **lengkap**. Tanggal: 2026-11-18T06:59:57.206Z.

Strip PNG putaran sumber dinilai ulang dengan rubrik juri saat ini. Tidak ada agen desain yang dijalankan: status run dan gerbang Lakar diambil dari laporan sumber. Keputusan di bawah adalah keluaran juri dan aturan keputusan, menunggu tinjauan Adam.

## Sumber dan versi

- Sumber: `bench/round-1.json` (keputusan Adam dari `bench/round-1.md`)
- Strip A: Lakar `bench/runs/rounds/1/A-lakar.png`, pen.dev `bench/runs/rounds/1/A-pendev.png`
- Strip B: Lakar `bench/runs/rounds/1/B-lakar.png`, pen.dev `bench/runs/rounds/1/B-pendev.png`
- Model juri: `claude-opus-5-5`; Claude Code: 2.1.325 (Claude Code); git HEAD: `9ee43d45187cefdceb74865cb7c301ccd53e1387`
- Versi rubrik: 2.1 (`bench/rubric/rubric.json`: versi 2.1, sama)
- sha256 teks juri A: `f6d68640c1d174c57b4604087d7bd495cceb538236aa22a074f8033466d6faad`
- sha256 teks juri B: `7c1727857d1061128aa17673ce7a751093860f2009fe3867c276708b6ba2545e`
- Argv juri: `claude -p --input-format stream-json --output-format stream-json --verbose --model claude-opus-5-5 --tools "" --strict-mcp-config --mcp-config bench/runs/rejudge/r1-v2-2/mcp-empty.json --disable-slash-commands --no-session-persistence`
- Artefak mentah (gitignored): `bench/runs/rejudge/r1-v2-2/` (teks juri, pemetaan X/Y, transkrip per ulangan)

## Ringkasan

| Prompt | T Lakar (maks 16) | T pen.dev | D Lakar (maks 4) | D pen.dev | Keputusan v2.1 | Keputusan sumber | Keputusan Adam | Pelanggaran brief pen.dev |
|---|---|---|---|---|---|---|---|---|
| A | 14 | 12 | 3 | 4 | **Setara** | Lebih baik (T 9 vs 6) | Kalah | tidak ada |
| B | 12 | 12 | 2 | 3 | **Setara** | Lebih baik (T 10 vs 6) | Setara | ukuran: board z57aTa 390×1109 ≠ 390×844; median R1 pen.dev = 0 |

## Kalibrasi

Ambang lulus (ditetapkan sebelum run): **lulus**.

- Syarat: 6/6 ulangan valid; A ∈ {Kalah, Setara} dengan D pen.dev > D Lakar; B = Setara dengan D pen.dev ≥ D Lakar dan pelanggaran brief pen.dev terdeteksi; bukti R9/R10 tidak kosong.
- R9/R10 dengan rentang > 1 (ditandai untuk Adam, tidak menggagalkan): tidak ada

## Prompt A

- Gerbang Lakar (dari sumber): lolos
- Brief mengikat pen.dev (ukuran frame): sesuai
- Keputusan v2.1: **Setara**. Alasan: lolos gerbang, total 14 vs 12, daya tarik 3 vs 4, tanpa alasan Kalah.
- Kalah-daya-tarik: tidak ada; Kalah-lain: tidak ada; R Lakar 0 vs pen.dev 2: tidak ada
- Pelanggaran brief pen.dev: tidak ada
- Keputusan sumber: Lebih baik (lolos gerbang, total 9 ≥ 6 + 2); keputusan Adam: Kalah

### Skor (ulangan valid 3 dari 3)

| Kriteria | Alat | Ulangan 1 | Ulangan 2 | Ulangan 3 | Median (rentang) |
|---|---|---|---|---|---|
| R1 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R1 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R2 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R2 | pen.dev | 1 | 2 | 2 | 2 (rentang 1) |
| R4 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R4 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R5 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R5 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R6 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R6 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R8 | Lakar | 2 | 2 | 1 | 2 (rentang 1) |
| R8 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R9 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R9 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R10 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R10 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| **T** | Lakar |  |  |  | **14** |
| **T** | pen.dev |  |  |  | **12** |
| **D = R9 + R10** | Lakar |  |  |  | **3** |
| **D = R9 + R10** | pen.dev |  |  |  | **4** |
| Slop | Lakar |  |  |  | 0 (rentang 0) |
| Slop | pen.dev |  |  |  | 1 (rentang 1) |

### Bukti R9/R10 per ulangan

**R9 Lakar**

- Ulangan 1 (skor 2): Angka diberi konteks: '+12,4% dari Oktober', 'Margin 34,4%', 'Tersinkron 2 menit lalu', timestamp transaksi, legenda 'Rp juta' pada grafik. Transaksi masuk/keluar dibedakan dengan ikon arah dan warna. Kartu fitur memuat metadata 'Rata-rata 6 detik per transaksi' dan 'Pengingat terjadwal 08.00 WIB'. Ada '4,8 dari 1.127 ulasan' dan '4 jam hemat waktu'. Catatan harga menjelaskan pembayaran tahunan dan QRIS. Padat tetapi tetap terbaca.
- Ulangan 2 (skor 2): KPI memiliki pembanding 'dari Oktober' dan 'Margin 34,4%'. Status 'Tersinkron 2 menit lalu' dan '1–18 November · semua cabang'. Transaksi memakai arah masuk/keluar dengan waktu. Kartu fitur memuat metrik 'Rata-rata 6 detik per transaksi' dan 'Pengingat terjadwal 08.00 WIB'. Rating '4,8 dari 1.127 ulasan'. Catatan pembayaran tahunan/QRIS di bawah pricing dan alamat di footer.
- Ulangan 3 (skor 2): Angka diberi konteks: KPI mockup dengan pembanding '+12,4% dari Oktober' dan 'Margin 34,4%', label periode '1–18 November · semua cabang', status 'Tersinkron 2 menit lalu', transaksi dengan waktu dan arah masuk/keluar. Kartu fitur punya metadata 'Rata-rata 6 detik per transaksi' dan 'Pengingat terjadwal 08.00 WIB'. Rating '4,8 dari 1.127 ulasan'. Pricing dilengkapi catatan PPN dan metode bayar (QRIS, transfer, kartu kredit).

**R10 Lakar**

- Ulangan 1 (skor 1): Permukaan berlapis ada: hero bertint mint, kartu fitur abu, seksi testimoni gelap, kartu harga tengah bertint hijau. Chip 'Tersinkron', badge 'Paling dipilih', dan avatar inisial terdefinisi. Namun tidak ada warna kedua bermakna yang konsisten lintas seksi: kuning hanya muncul pada bintang di testimoni, dan nilai keluar di mockup (−Rp 412.500) tetap hitam.
- Ulangan 2 (skor 1): Permukaan berlapis ada: hero ber-tint mint, kartu fitur besar abu ber-tint, wadah ikon hijau muda, seksi testimoni gelap, tier tengah ber-tint hijau. Badge berwarna juga ada ('Paling dipilih', 'Tersinkron'). Namun warna kedua bermakna (kuning) hanya muncul di bintang testimoni dan tidak dipakai di bagian lain. Nilai pengeluaran tetap netral, sehingga satu unsur kolom 2 tidak terpenuhi.
- Ulangan 3 (skor 1): Ada permukaan berlapis: gradien tint hijau di hero, kartu fitur abu, seksi testimoni gelap, dan kartu tier tengah ber-tint. Badge terdefinisi ('Paling dipilih', 'Tersinkron', eyebrow hero). Namun tidak ada warna kedua bermakna yang dipakai di lebih dari satu bagian; kuning hanya muncul pada bintang di bagian 3, dan nilai pengeluaran tetap netral.

**R9 pen.dev**

- Ulangan 1 (skor 2): Mockup memuat chip tren (+12,4%, +8,1%, −3,2%), chip status '4 invoice', metadata transaksi ('Tunai · 09:12', 'QRIS · Kemarin', '#INV-1042'), dan grafik dua seri Masuk/Keluar. Kartu fitur punya sub-poin berikon check. Testimoni dilengkapi strip statistik berlabel. Kartu harga punya deskripsi target. CTA penutup memuat detail migrasi dari Excel. Padat tetapi terbaca.
- Ulangan 2 (skor 2): Mockup memuat delta badge (+12,4%, +8,1%, −3,2%), status '4 invoice', rentang '1–18 Nov 2026', dan transaksi dengan metadata 'Tunai · 09:12' / 'QRIS · Kemarin'. Grafik punya legenda Masuk/Keluar. Kartu fitur memiliki sub-daftar check. Header testimoni memuat statistik berlabel. Tiap tier memiliki deskripsi target. Footer memuat keterangan PSE Kominfo.
- Ulangan 3 (skor 2): KPI mockup memakai chip tren (+12,4%, +8,1%, -3,2%) dan status '4 invoice' pada Piutang. Filter tanggal '1–18 Nov 2026', grafik dengan legenda Masuk/Keluar dan label M1–M8, transaksi dengan metode dan waktu ('Tunai · 09:12', 'QRIS · Kemarin'). Kartu fitur punya sub-poin check. Testimoni dilengkapi strip statistik, footer berisi link 'Status Layanan'.

**R10 pen.dev**

- Ulangan 1 (skor 2): Permukaan berlapis kuat: hero bertint mint, frame mockup bertint, seksi testimoni hijau tua, kartu kutipan hijau penuh, kartu harga tengah gelap, dan band CTA hijau (bagian 1–5). Warna kedua bermakna (amber/oranye) muncul di chip '4 invoice' pada mockup dan bintang rating di testimoni. Badge 'Baru', 'Paling Populer', dan chip tren terdefinisi. Foto avatar dan grafik tampak matang dan menyatu.
- Ulangan 2 (skor 2): Permukaan berlapis: hero ber-tint hijau, kartu fitur ber-tint, seksi testimoni hijau gelap dengan kartu hijau solid, tier tengah gelap, banner CTA hijau. Warna kedua amber bermakna muncul di badge piutang '4 invoice' (mockup) dan bintang rating (testimoni). Badge 'Baru', 'Paling Populer', dan chip delta berwarna. Ikon Lucide, grafik batang, dan foto avatar matang serta menyatu.
- Ulangan 3 (skor 2): Permukaan berlapis: tint hijau di hero, frame mockup ber-tint, seksi testimoni hijau gelap, kartu testimoni hijau solid, pricing tengah gelap, dan banner CTA hijau di atas footer gelap. Warna kedua bermakna berupa amber, dipakai pada badge status '4 invoice' di mockup (bagian 1) dan bintang rating (bagian 3). Chip tren dan badge 'Baru' serta 'Paling Populer' terdefinisi. Foto avatar dan ikon terlihat menyatu.

### Bukti kriteria lain per ulangan

**Lakar**

- R1, ulangan 1 (skor 2): Semua bagian hadir berurutan pada artboard 1440px: navbar (logo Kasku, 4 tautan, Masuk + 'Coba gratis 14 hari') di atas bagian 1; hero dengan badge, headline, subjudul, 2 CTA, dan mockup dashboard di bagian 1–2; fitur 'FITUR' bagian 2; testimoni berlatar gelap bagian 3; harga 3 tier bagian 3–4; footer 4 kolom bagian 4–5. Aksen hijau, mode terang dengan satu seksi gelap, seluruh copy berbahasa Indonesia.
- R1, ulangan 2 (skor 2): Urutan lengkap pada lebar 1440px: navbar (bagian 1), hero dengan headline, subjudul, CTA 'Coba gratis 14 hari' + 'Lihat demo 3 menit' dan mockup dashboard (bagian 1–2), 3 fitur dalam tata letak bento (bagian 2), testimoni gelap (bagian 3), pricing 3 tier dengan 'Tumbuh' ditonjolkan (bagian 4), footer (bagian 4–5). Aksen hijau dan bahasa Indonesia.
- R1, ulangan 3 (skor 2): Semua bagian hadir berurutan: navbar (bagian 1 atas), hero dengan headline, subjudul, 2 CTA, dan mockup dashboard (bagian 1–2), 3 kartu fitur dalam layout bento (bagian 2), testimoni gelap (bagian 3), pricing 3 tier (bagian 4), footer (bagian 4–5). Lebar 1440px, mode terang, aksen hijau, seluruh copy berbahasa Indonesia. Tidak ada CTA penutup (opsional).
- R2, ulangan 1 (skor 2): Headline hero 'Tutup buku 5 menit tiap malam, laba rugi langsung siap' (bagian 1, tengah) berukuran display, 2 baris, berisi klaim hasil, tanpa kata yatim. Lompatan skala tegas dari headline ke H2 seksi ('Semua angka usaha di satu tempat…', 'Mereka sudah berhenti rekap…', 'Mulai gratis, naik paket…') lalu ke body. Tidak ada judul yatim. CTA 'Coba gratis 14 hari' hijau solid berdampingan dengan 'Lihat demo 3 menit' outline.
- R2, ulangan 2 (skor 2): Headline display 'Tutup buku 5 menit tiap malam, laba rugi langsung siap' (bagian 1) dua baris, berisi klaim hasil terukur, baris kedua tidak yatim. Skalanya jauh di atas H2 seksi dan subjudul. CTA primer hijau 'Coba gratis 14 hari' dan sekunder outline 'Lihat demo 3 menit'.
- R2, ulangan 3 (skor 2): Headline display 'Tutup buku 5 menit tiap malam, laba rugi langsung siap' (bagian 1 tengah) terdiri dari 2 baris, berisi klaim hasil, dan tidak menyisakan kata yatim. Lompatan skala tegas ke subjudul dan eyebrow. CTA 'Coba gratis 14 hari' primer hijau, 'Lihat demo 3 menit' sekunder outline. Judul seksi (Fitur, Testimoni, Harga) jelas lebih kecil dari headline.
- R4, ulangan 1 (skor 2): Hijau ±#15803D dipakai konsisten pada CTA navbar/hero, nilai positif mockup (+Rp 1.284.000), bar aktif grafik, ikon fitur, CTA tier tengah, dan ikon check; teks putih di atas tombol hijau. Kuning hanya untuk bintang rating (bagian 3), jadi bermakna. Ritme terang/gelap jelas: hero mint → fitur putih → testimoni hitam → harga putih → footer abu terang. Tidak ada teks yang terlihat gagal kontras.
- R4, ulangan 2 (skor 2): Hijau mendekati #15803D konsisten pada CTA, badge, nav aktif, nilai positif, dan batang grafik yang disorot (hari terpilih hijau tua, lainnya mint). Teks pada tombol hijau putih. Ritme terang→gelap (testimoni)→terang (harga)→abu (footer) ada. Kuning hanya untuk bintang rating. Tidak tampak teks yang gagal kontras.
- R4, ulangan 3 (skor 2): Hijau ~#15803D dipakai konsisten untuk CTA navbar dan hero, item sidebar aktif, bar grafik terpilih, nilai positif transaksi, badge 'Paling dipilih', dan check pricing. Teks pada tombol hijau putih. Ritme terang/gelap terbentuk lewat seksi testimoni gelap di bagian 3. Kuning hanya dipakai untuk bintang rating (bermakna). Tidak terlihat teks gagal kontras; teks abu di atas gelap pada bagian 3 masih terbaca.
- R5, ulangan 1 (skor 2): Ikon garis bergaya Lucide seragam: sidebar mockup, ikon fitur (file-chart, smartphone, bell-ring) dalam wadah kotak membulat 48px hijau-muda yang sama (bagian 2), bintang rating berupa ikon star (bagian 3), check di daftar harga, dan ikon sosial di footer. Visual utama berupa mockup dashboard yang relevan. Tidak ada emoji, termasuk di header mockup 'Toko Bu Sari'.
- R5, ulangan 2 (skor 2): Ikon Lucide outline seragam: sidebar, ikon fitur file-chart/smartphone/bell-ring dalam wadah persegi ber-tint hijau seragam (bagian 2), panah transaksi, check pricing, ikon star terisi di rating (bagian 3), sparkles di badge, sosial footer. Avatar inisial rapi. Mockup hero nyata dan relevan. Tidak ada emoji.
- R5, ulangan 3 (skor 2): Ikon bergaya Lucide outline seragam: sidebar mockup, ikon fitur (file-chart, smartphone, bell-ring) dalam wadah kotak membulat ber-tint hijau dengan ukuran sama (bagian 2), check di pricing, ikon sosial di footer. Rating memakai ikon star (bagian 3 kiri). Mockup dashboard hero dibangun dari shape dan teks nyata. Tanpa emoji, termasuk di header mockup 'Toko Bu Sari'.
- R6, ulangan 1 (skor 1): Kriteria golden terpenuhi. Mockup: Rp 48,2jt − Rp 31,6jt = Rp 16,6jt, margin 34,4% benar. Tabel laba rugi di bagian 2: 42.870.000 − 23.150.000 − 4.910.000 = 14.810.000 benar. Testimoni mencantumkan nama, usaha, dan kota (Yogyakarta, Medan, Surabaya). Ada satu inkonsistensi: kartu Pengeluaran di mockup (bagian 1) menulis '+3,1% dari Oktober' tetapi memakai ikon panah tren turun.
- R6, ulangan 2 (skor 1): Mockup memenuhi rumus: Pemasukan Rp 48,2 jt − Pengeluaran Rp 31,6 jt = Laba bersih Rp 16,6 jt, dengan margin 34,4% yang benar. Tabel laba rugi juga cocok: 42.870.000 − 23.150.000 − 4.910.000 = 14.810.000. Testimoni lengkap dengan nama, usaha, dan kota. Ada 1 inkonsistensi: kartu Pengeluaran menampilkan '+3,1% dari Oktober' dengan ikon tren turun (bagian 1, kartu KPI tengah).
- R6, ulangan 3 (skor 1): Mockup hero konsisten: Pemasukan Rp 48,2jt − Pengeluaran Rp 31,6jt = Laba bersih Rp 16,6jt, margin 34,4% benar. Tabel laba rugi Oktober juga konsisten: 42.870.000 − 23.150.000 − 4.910.000 = 14.810.000. Testimoni lengkap dengan nama, usaha, dan kota (Yogyakarta, Medan, Surabaya). Satu inkonsistensi: kartu Pengeluaran (bagian 1) menulis '+3,1% dari Oktober' dengan ikon tren turun.
- R8, ulangan 1 (skor 2): Tier tengah 'Tumbuh' ditonjolkan dengan border dan tint hijau plus badge 'Paling dipilih'. CTA tengah primer, dua tier lain outline. Harga Rp 79.000 /bulan setara Rp 79rb/bulan, fitur memakai check (bagian 4). 0 pelanggaran slop. Keputusan komposisi khas yang bisa ditunjuk: fitur disusun sebagai bento asimetris dengan kartu besar berisi tabel laba rugi nyata (bagian 2), dan testimoni berkomposisi judul kiri plus kutipan unggulan bermetrik '4 jam hemat waktu tiap minggu' (bagian 3).
- R8, ulangan 2 (skor 2): Tier 'Tumbuh' ditonjolkan dengan border dan tint hijau, ditambah badge 'Paling dipilih'. CTA tengah primer hijau, tier lain outline. Harga Rp 79.000/bulan sesuai nilai golden. Fitur memakai check. Tidak ada pelanggaran slop. Langkah khas: bento fitur dengan kartu besar berisi tabel 'Laba rugi · Oktober 2026' nyata, serta metrik '4 jam hemat waktu tiap minggu' pada testimoni utama.
- R8, ulangan 3 (skor 1): Tier tengah 'Tumbuh' ditonjolkan dengan border, tint hijau, dan bayangan, plus badge 'Paling dipilih'. CTA tengah primer, tier lain outline, fitur memakai check (bagian 4). Satu kriteria golden gagal: harga ditulis 'Rp 79.000 / bulan', bukan 'Rp 79rb/bulan'. Tidak ada pelanggaran slop. Keputusan komposisi khas yang bisa ditunjuk: fitur bento dengan kartu besar berisi tabel laba rugi nyata, dan testimoni utama dengan metrik '4 jam hemat waktu tiap minggu'.

**pen.dev**

- R1, ulangan 1 (skor 2): Bagian lengkap dan berurutan pada artboard 1440px: navbar (bagian 1 atas); hero dengan badge 'Baru', headline, subjudul, 2 CTA, dan mockup (bagian 1–2); 3 kartu 'FITUR UTAMA' (bagian 2); testimoni hijau gelap (bagian 3); harga 3 tier (bagian 4); CTA penutup opsional dan footer (bagian 5). Aksen hijau, berbahasa Indonesia.
- R1, ulangan 2 (skor 2): Urutan lengkap dan benar pada lebar 1440px: navbar (bagian 1 atas), hero dengan headline, subjudul, CTA 'Mulai Gratis 30 Hari' + 'Lihat Demo' dan mockup dashboard (bagian 1–2), 3 kartu fitur 'FITUR UTAMA' (bagian 2), testimoni berlatar gelap (bagian 3), pricing 3 tier dengan 'Bisnis' ditonjolkan (bagian 4), CTA penutup opsional dan footer (bagian 5). Aksen hijau dan seluruh copy berbahasa Indonesia.
- R1, ulangan 3 (skor 2): Semua bagian hadir berurutan: navbar, hero dengan headline, subjudul, 2 CTA, dan mockup (bagian 1–2), 3 kartu fitur (bagian 2), testimoni (bagian 3), pricing 3 tier (bagian 4), CTA penutup opsional dan footer (bagian 5). Lebar 1440px, aksen hijau, Bahasa Indonesia.
- R2, ulangan 1 (skor 1): Fokus jelas pada headline hero 'Pembukuan rapi, usaha makin tenang.' (bagian 1, 2 baris display), dengan CTA hijau 'Mulai Gratis 30 Hari' dan 'Lihat Demo' outline. Namun judul CTA penutup 'Siap merapikan keuangan usaha / Anda?' (bagian 5) menyisakan satu kata yatim 'Anda?' di baris kedua.
- R2, ulangan 2 (skor 2): Headline display 'Pembukuan rapi, usaha makin tenang.' (bagian 1, tengah) dua baris dengan baris kedua 'makin tenang.' sehingga tidak yatim. Skalanya jauh di atas H2 seksi (~44px) dan subjudul (~18px). CTA primer hijau 'Mulai Gratis 30 Hari' dan sekunder outline 'Lihat Demo'. Harga 'Rp99rb' berada di seksi lain sehingga tidak bersaing.
- R2, ulangan 3 (skor 2): Headline display 'Pembukuan rapi, usaha makin tenang.' (bagian 1 tengah) terdiri dari 2 baris dengan klaim hasil emosional dan tanpa kata yatim. Lompatan skala tegas ke subjudul. 'Mulai Gratis 30 Hari' primer hijau, 'Lihat Demo' sekunder outline. Judul seksi lebih kecil, sehingga titik fokus tunggal.
- R4, ulangan 1 (skor 1): Aksen hijau dipakai konsisten untuk CTA, chip tren, ikon fitur, dan tier tengah. Oranye pada chip '4 invoice' dan kuning pada bintang bermakna. Satu kriteria golden gagal: hijau tampak zamrud kebiruan (sekitar #107C4A), bukan #15803D. Ada juga teks lemah: peran/kota 'Pemilik Dapur Sari, Yogyakarta' berwarna hijau pucat di atas kartu hijau (bagian 3 kiri bawah).
- R4, ulangan 2 (skor 1): Aksen hijau konsisten pada CTA, ikon fitur, nav aktif, dan seri 'Masuk' di grafik. Teks di atas hijau putih. Ritme terang→gelap (testimoni)→terang (harga)→gelap (CTA/footer) ada. Amber di badge '4 invoice' dan bintang bermakna. Satu teks lemah: peran 'Pemilik Dapur Sari, Yogyakarta' abu muda kecil di atas kartu hijau besar (bagian 3 kiri bawah) kontrasnya rendah.
- R4, ulangan 3 (skor 1): Aksen hijau dipakai konsisten untuk CTA, sidebar aktif, seri 'Masuk' di grafik, check, dan nilai positif. Teks pada tombol hijau putih. Ritme terang/gelap kuat: testimoni gelap, pricing terang, footer gelap. Satu kriteria golden gagal: hijau yang terlihat lebih kebiruan/gelap (~#0F7B4A), bukan #15803D. Selain itu, teks peran 'Pemilik Dapur Sari, Yogyakarta' di atas kartu hijau (bagian 3 kiri bawah) kontrasnya lemah.
- R5, ulangan 1 (skor 1): Ikon garis bergaya Lucide konsisten di sidebar, transaksi, dan ikon fitur (zap, file-check, chart) dalam kotak hijau seragam. Foto avatar testimoni relevan. Namun sapaan mockup 'Halo, Toko Bu Sari 👋' (bagian 1) memakai emoji tangan melambai, sehingga kriteria golden 'tanpa emoji di sapaan' gagal. Bintang rating juga berupa outline kosong (bagian 3).
- R5, ulangan 2 (skor 1): Ikon Lucide outline seragam: sidebar mockup, ikon fitur zap/file-check/chart dalam wadah persegi hijau seragam (bagian 2), check list, sosial footer. Visual hero berupa mockup nyata dan avatar foto relevan. Kriteria golden gagal karena ada emoji tangan melambai di sapaan 'Halo, Toko Bu Sari 👋' (bagian 1, mockup atas).
- R5, ulangan 3 (skor 1): Ikon fitur bergaya Lucide (zap, file-check, chart-column) dalam wadah kotak hijau seragam (bagian 2). Avatar foto di testimoni, ikon star outline di bagian 3, mockup hero relevan dan dibangun dari shape nyata. Namun ada 1 emoji dekoratif 👋 pada sapaan mockup 'Halo, Toko Bu Sari' (bagian 1), yang dilarang kriteria golden.
- R6, ulangan 1 (skor 1): Kriteria golden mockup gagal: kartu ringkasan hanya Saldo Kas, Pemasukan Rp32.180.000, Pengeluaran Rp14.900.000, dan Piutang, tanpa Laba sehingga persamaan Pemasukan − Pengeluaran = Laba tidak ditampilkan (bagian 1). Testimoni memenuhi nama, usaha, dan kota (Yogyakarta, Surabaya, Bandung). Ada inkonsistensi kecil: grafik 'Arus Kas Mingguan' M1–M8 untuk periode 1–18 Nov 2026.
- R6, ulangan 2 (skor 1): Mockup dibangun dari teks/shape nyata, tetapi kartu KPI berisi Saldo Kas, Pemasukan Rp32.180.000, Pengeluaran Rp14.900.000, dan Piutang tanpa kartu Laba. Persamaan Pemasukan − Pengeluaran = Laba tidak ditampilkan, sehingga satu kriteria golden gagal. Testimoni lengkap dengan nama, usaha, dan kota (Yogyakarta, Surabaya, Bandung) serta bintang. Copy spesifik (KUR, SAK EMKM, QRIS) dan uji coba 30 hari konsisten di hero, harga, dan CTA.
- R6, ulangan 3 (skor 1): Testimoni lengkap dengan nama, peran, dan kota (Yogyakarta, Surabaya, Bandung) serta ikon star. Klaim uji coba 30 hari konsisten antara hero, pricing, dan CTA penutup. Satu kriteria golden gagal: mockup hero menampilkan Saldo Kas, Pemasukan Rp32.180.000, Pengeluaran Rp14.900.000, dan Piutang, tetapi tidak ada kartu Laba, sehingga persamaan Pemasukan − Pengeluaran = Laba tidak ditunjukkan.
- R8, ulangan 1 (skor 1): Tier tengah 'Bisnis' ditonjolkan dengan latar gelap, elevasi, dan badge 'Paling Populer'. CTA tengah primer, tier lain outline, fitur memakai check (bagian 4). Namun kriteria golden harga gagal: tertulis Rp99rb/bulan, bukan Rp 79rb/bulan. Ada 2 pelanggaran slop: tiga kartu fitur identik dan statistik bulat. Keputusan khas yang bisa ditunjuk: kartu testimoni unggulan hijau penuh di samping dua kartu gelap (bagian 3).
- R8, ulangan 2 (skor 1): Tier tengah 'Bisnis' ditonjolkan dengan latar gelap dan elevasi, ditambah badge 'Paling Populer'. CTA tengah primer, tier lain outline, fitur memakai check. Kriteria golden harga gagal: tertulis 'Rp99rb/bulan', bukan 'Rp 79rb/bulan' (bagian 4). Ada 1 pelanggaran slop (statistik bulat). Langkah khas: testimoni asimetris dengan kartu kutipan hijau besar di kiri dan dua kartu gelap bertumpuk di kanan (bagian 3).
- R8, ulangan 3 (skor 1): Tier tengah 'Bisnis' ditonjolkan dengan satu cara utama (kartu gelap dan terangkat) plus badge 'Paling Populer'. CTA tengah primer, tier lain outline, fitur memakai check (bagian 4). Satu kriteria golden gagal: harga 'Rp99rb/bulan', bukan 'Rp 79rb/bulan'. Ada 1 pelanggaran slop: statistik bulat yang tidak diberikan prompt. Langkah khas yang bisa ditunjuk: testimoni utama berupa blok hijau besar di samping dua kartu gelap.

### Pemetaan X/Y per ulangan (dibuka setelah penilaian)

| Ulangan | Desain X | Desain Y | Status | Biaya |
|---|---|---|---|---|
| 1 | Lakar | pen.dev | ok | $0.40 |
| 2 | pen.dev | Lakar | ok | $0.34 |
| 3 | Lakar | pen.dev | ok | $0.33 |

## Prompt B

- Gerbang Lakar (dari sumber): lolos
- Brief mengikat pen.dev (ukuran frame): board z57aTa 390×1109 ≠ 390×844
- Keputusan v2.1: **Setara**. Alasan: lolos gerbang, total 12 vs 12, daya tarik 2 vs 3, tanpa alasan Kalah.
- Kalah-daya-tarik: tidak ada; Kalah-lain: tidak ada; R Lakar 0 vs pen.dev 2: tidak ada
- Pelanggaran brief pen.dev: ukuran: board z57aTa 390×1109 ≠ 390×844; median R1 pen.dev = 0
- Keputusan sumber: Lebih baik (lolos gerbang, total 10 ≥ 6 + 2); keputusan Adam: Setara

### Skor (ulangan valid 3 dari 3)

| Kriteria | Alat | Ulangan 1 | Ulangan 2 | Ulangan 3 | Median (rentang) |
|---|---|---|---|---|---|
| R1 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R1 | pen.dev | 0 | 0 | 0 | 0 (rentang 0) |
| R2 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R2 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R4 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R4 | pen.dev | 1 | 2 | 2 | 2 (rentang 1) |
| R5 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R5 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R6 | Lakar | 2 | 2 | 1 | 2 (rentang 1) |
| R6 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R8 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R8 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R9 | Lakar | 1 | 1 | 2 | 1 (rentang 1) |
| R9 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R10 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R10 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| **T** | Lakar |  |  |  | **12** |
| **T** | pen.dev |  |  |  | **12** |
| **D = R9 + R10** | Lakar |  |  |  | **2** |
| **D = R9 + R10** | pen.dev |  |  |  | **3** |
| Slop | Lakar |  |  |  | 0 (rentang 0) |
| Slop | pen.dev |  |  |  | 0 (rentang 0) |

### Bukti R9/R10 per ulangan

**R9 Lakar**

- Ulangan 1 (skor 1): Angka ringkasan diberi target dan satuan, jadwal memuat jam, durasi, dan status, kartu program memuat durasi dan level. Namun tidak ada persen, tren, streak, atau pembanding, dan kartu program miskin detail.
- Ulangan 2 (skor 1): Ring punya sasaran, dan jadwal punya jam, durasi, jumlah gerakan, serta status 'Selesai'/'Berikutnya'. Namun tidak ada persen total, streak, atau tren. Kartu program minim, hanya durasi dan level tanpa rating atau gambar, sehingga konteks hanya di sebagian bagian.
- Ulangan 3 (skor 2): Angka disertai target dan satuan. Jadwal menunjukkan status Selesai vs Berikutnya dengan jam, durasi, dan jumlah gerakan. Kartu program punya durasi dan level. Konteks sekunder ada di sebagian besar bagian, meski tanpa persen total, streak, atau rating.

**R10 Lakar**

- Ulangan 1 (skor 1): Ada surface berlapis (kartu berikutnya ber-tint oranye) dan badge 'Berikutnya'. Namun palet hampir seluruhnya oranye di atas netral tanpa warna kedua yang bermakna, dan kartu program polos tanpa visual.
- Ulangan 2 (skor 1): Ada tint oranye pada kartu item berikutnya (border dan latar kecokelatan), badge 'Berikutnya', dan avatar 'DA'. Namun tidak ada warna kedua bermakna selain varian oranye dan netral. Kartu program polos dengan tile ikon abu tanpa visual pendukung.
- Ulangan 3 (skor 1): Ada permukaan ber-tint (kartu berikutnya berborder oranye, chip 'Berikutnya', avatar ber-tint). Namun hanya satu keluarga aksen oranye di atas netral tanpa warna kedua yang bermakna, dan kartu program polos tanpa foto atau gambar.

**R9 pen.dev**

- Ulangan 1 (skor 2): Ringkasan diberi target, persen harian, dan streak 12 hari. Jadwal punya 3 status (selesai dengan circle-check, berikutnya dengan play, mendatang dengan chevron) beserta jam, durasi, dan level. Kartu program memuat rating 4.8/4.9, durasi, dan level. Padat tetapi terbaca.
- Ulangan 2 (skor 2): Angka punya sasaran ('/ 10.000', '/ 600 kkal', '/ 45 mnt'), persen gabungan 74%, dan badge streak '12 hari'. Jadwal memuat jam, jarak/durasi, level, serta status selesai/berikutnya/mendatang. Kartu program memuat rating 4.8/4.9, durasi minggu, dan level. Padat tetapi tetap terbaca.
- Ulangan 3 (skor 2): Angka diberi target dan persen total, plus streak '12 hari'. Jadwal memuat variasi status (selesai/berikutnya/mendatang) dengan jam, durasi, jarak, dan level. Kartu program punya rating 4.8/4.9, durasi, dan level berwarna. Ada titik notifikasi di lonceng.

**R10 pen.dev**

- Ulangan 1 (skor 1): Ada surface ber-tint (baris berikutnya, chip streak, pill tab aktif), badge berwarna, dan foto yang menyatu. Namun warna kedua yang bermakna (kuning/merah) hanya muncul di ring dan tidak konsisten di bagian lain.
- Ulangan 2 (skor 1): Ada permukaan ber-tint (badge streak cokelat-oranye, tab aktif ber-pill oranye gelap, item berikutnya ber-border oranye), foto matang, dan ring berlapis. Namun warna kedua bermakna (kuning/merah kategori) hanya muncul di seksi ringkasan, tidak dipakai konsisten di bagian lain.
- Ulangan 3 (skor 1): Permukaan berlapis ada: kartu berikutnya ber-tint dengan border oranye, pill tab aktif ber-tint, badge streak ber-tint. Chip 'BERIKUTNYA' dan foto matang. Namun warna kedua (kuning/merah) hanya muncul di satu bagian (ring dan legenda ringkasan), tidak konsisten di lebih dari satu bagian.

### Bukti kriteria lain per ulangan

**Lakar**

- R1, ulangan 1 (skor 2): Artboard 390×844 dengan status bar 09:41 di atas dan home indicator di bawah. Semua bagian ada: sapaan + avatar 'DA', kartu 'Ringkasan hari ini' dengan ring, 'Jadwal latihan hari ini' (item 'Lari pagi 5 km' Selesai dengan circle-check, item 'Kekuatan tubuh atas' dengan tombol play 'Mulai latihan'), 2 kartu 'Program untukmu', tab bar 4 item (Beranda/Latihan/Statistik/Profil) dengan Beranda aktif oranye. Mode gelap, aksen oranye, Bahasa Indonesia.
- R1, ulangan 2 (skor 2): Artboard 390×844. Status bar 09:41 di atas, home indicator di bawah tab bar. Semua seksi ada: sapaan + avatar 'DA', ringkasan dengan ring, jadwal 2 item (selesai dengan circle-check, berikutnya dengan tombol 'Mulai latihan' + ikon play), 2 kartu program, tab bar 4 item (house/dumbbell/chart/user) dengan 'Beranda' aktif oranye. Mode gelap, aksen oranye, bahasa Indonesia.
- R1, ulangan 3 (skor 2): Artboard 390×844 dengan status bar 09:41 dan home indicator di bawah tab bar, jadi golden 1 terpenuhi. Golden 4 terpenuhi: 'Lari pagi 5 km' memakai circle-check dan 'Selesai', item berikutnya punya tombol 'Mulai latihan' dengan ikon play. Golden 6 terpenuhi: tab bar 4 item (Beranda/Latihan/Statistik/Profil, ikon house/dumbbell/chart-column/user) dengan Beranda aktif oranye. Mode gelap, aksen oranye, dan seluruh copy berbahasa Indonesia.
- R2, ulangan 1 (skor 1): Fokus ada di angka ringkasan (6.842 tebal besar) di kartu ring. Namun judul seksi 'Jadwal latihan hari ini' dan 'Program untukmu' (~20px) hampir setara dengan sapaan 'Selamat pagi, Dimas', sehingga lompatan skala antara sapaan dan judul seksi kurang tegas.
- R2, ulangan 2 (skor 1): Fokus pada ring di kartu ringkasan (y≈137–287), tetapi bersaing dengan sapaan 'Selamat pagi, Dimas'. Judul seksi 'Jadwal latihan hari ini' dan 'Program untukmu' berukuran hampir sama dengan sapaan, sehingga lompatan skala kurang tegas. Label 'Ringkasan hari ini' kecil.
- R2, ulangan 3 (skor 1): Fokus pada ring di kartu ringkasan, tetapi bersaing dengan judul seksi 'Jadwal latihan hari ini' dan 'Program untukmu'. Kedua judul itu berukuran hampir sama dengan sapaan 'Selamat pagi, Dimas', sementara judul 'Ringkasan hari ini' di dalam kartu justru kecil.
- R4, ulangan 1 (skor 2): Oranye dipakai konsisten untuk tab aktif, link 'Kalender'/'Lihat semua', tombol 'Mulai latihan', badge 'Berikutnya', border kartu berikutnya, dan ring. Seri ring memakai tint oranye yang bermakna per metrik. Teks dan ikon di atas tombol oranye berwarna gelap. Teks muted (metadata jadwal, label tab tidak aktif) cukup terang di surface gelap.
- R4, ulangan 2 (skor 2): Oranye konsisten pada tombol 'Mulai latihan' (teks/ikon gelap di atas oranye), tautan 'Kalender'/'Lihat semua', badge 'Berikutnya', tab aktif, dan check selesai. Seri ring memakai tint oranye/peach/krem yang bermakna sebagai kategori. Teks muted '06:30 · 32 menit · Selesai' terbaca di surface gelap.
- R4, ulangan 3 (skor 2): Oranye konsisten untuk tombol 'Mulai latihan' (teks dan ikon gelap di atas oranye), link 'Kalender'/'Lihat semua', chip 'Berikutnya', tab aktif, dan seri ring. Turunan krem/oranye muda dipakai sebagai seri ring dan legenda. Teks muted abu ('06:30 · 32 menit · Selesai', '/ 10.000') terbaca di surface gelap.
- R5, ulangan 1 (skor 2): Ikon outline satu gaya (lonceng, jejak kaki, dumbbell, api, figur yoga, ikon tab house/dumbbell/chart/user) dengan ukuran seragam. Avatar inisial 'DA'. Visual utama berupa ring konsentris yang relevan. Tanpa emoji di sapaan.
- R5, ulangan 2 (skor 2): Avatar inisial 'DA' di kiri atas dengan tanggal 'Rabu, 18 November' di atas sapaan tebal, tanpa emoji. Ikon outline seragam: sepatu, dumbel, api, figur yoga, bel, dan ikon tab. Ring menjadi visual utama yang relevan.
- R5, ulangan 3 (skor 2): Golden 2 terpenuhi: tanggal 'Rabu, 18 November' di atas sapaan bold, avatar inisial 'DA' di kiri atas, tanpa emoji. Ikon outline seragam (lonceng, sepatu, dumbbell, api, figur, play, ikon tab). Ring progres menjadi visual utama yang relevan.
- R6, ulangan 1 (skor 2): Copy spesifik: 'Lari pagi 5 km · 06:30 · 32 menit · Selesai', '18:30 · 45 menit · 6 gerakan', 'HIIT Bakar Lemak 4 minggu · Menengah'. Legenda nilai/target ada (6.842/10.000, 384/600 kkal, 27/45 mnt). Panjang busur kira-kira sesuai rasio 60–68%.
- R6, ulangan 2 (skor 2): Angka spesifik dan konsisten: 6.842/10.000, 384/600 kkal, 27/45 mnt. Busur ring kira-kira proporsional dengan nilai. Copy spesifik: 'Lari pagi 5 km', 'Kekuatan tubuh atas · 6 gerakan', 'HIIT Bakar Lemak · 4 minggu · Menengah'. Tidak ada kontradiksi.
- R6, ulangan 3 (skor 1): Legenda nilai/target lengkap (6.842/10.000, 384/600 kkal, 27/45 mnt). Namun busur luar Langkah tampak sekitar 80–85%, padahal seharusnya 68%, dan ketiga busur tampak hampir sama panjang walaupun angkanya 68/64/60%. Copy spesifik ('6 gerakan', 'HIIT Bakar Lemak').
- R8, ulangan 1 (skor 1): Kriteria golden 5 gagal: kartu 'HIIT Bakar Lemak' dan 'Yoga Mobilitas' (bawah) identik secara visual dan hanya berbeda ikon. Tidak ada pelanggaran slop. Ada keputusan komposisi khas: kartu jadwal berikutnya diberi outline oranye dengan tombol 'Mulai latihan' selebar penuh.
- R8, ulangan 2 (skor 1): Kriteria golden 5 gagal: kedua kartu program (y≈612–705) identik secara visual, hanya ikon api vs figur yoga dalam tile yang sama tanpa pembeda warna atau gambar. Tidak ada pelanggaran slop. Langkah khas: tombol oranye lebar penuh 'Mulai latihan' di dalam kartu item berikutnya.
- R8, ulangan 3 (skor 1): Golden 5 gagal: kartu 'HIIT Bakar Lemak' dan 'Yoga Mobilitas' di bawah identik secara visual (kotak ikon, judul, metadata) dan hanya berbeda ikon. Tidak ada pelanggaran slop. Ada langkah khas berupa kartu berikutnya yang diperluas dengan CTA lebar penuh.

**pen.dev**

- R1, ulangan 1 (skor 0): Ukuran mengikat salah: artboard sekitar 390×1109, lebih tinggi dari 844 (konten berlanjut sampai tab bar di y≈1080). Bagian lain lengkap: sapaan + avatar foto, ring, 3 item jadwal, 2 kartu rekomendasi, tab bar 4 item.
- R1, ulangan 2 (skor 0): Ukuran mengikat salah. Artboard 390 lebar tetapi tinggi sekitar 1109px, bukan 844. Home indicator tidak ada di bawah tab bar. Status bar 09:41 ada di atas. Semua seksi ada: sapaan, ring, jadwal 3 item, 2 kartu program, tab bar 4. Ada copy berbahasa Inggris 'Upper body strength' di item jadwal ke-2.
- R1, ulangan 3 (skor 0): Artboard tingginya sekitar 1109 px (overview), bukan 844, dan tidak ada home indicator di bawah tab bar, jadi golden 1 gagal dan ukuran mengikat salah. Status bar 09:41, semua seksi (sapaan, ringkasan, jadwal, 2 rekomendasi, tab bar 4 item), mode gelap, dan aksen oranye ada. Golden 4 terpenuhi: 'Lari pagi santai' memakai circle-check dan item 'BERIKUTNYA' punya tombol play. Golden 6 terpenuhi: tab Beranda aktif dengan pill ber-tint. Catatan bahasa: judul 'Upper body strength' berbahasa Inggris di kartu jadwal kedua.
- R2, ulangan 1 (skor 2): Fokus tunggal di kartu 'Ringkasan hari ini': ring besar dengan angka tebal 6.842/412/38. Sapaan 22px bold di atasnya, judul seksi lebih kecil (~17px), metadata kecil abu-abu. Lompatan skala tegas dan tidak ada judul yatim.
- R2, ulangan 2 (skor 2): Kartu 'Ringkasan hari ini' (y≈150–415) menjadi fokus dengan ring konsentris besar dan angka tebal '6.842', '412', '38'. Lompatan skala tegas: sapaan 22 bold, judul seksi ±18 semibold, metadata 12–13 abu. Setiap judul seksi diikuti kontennya.
- R2, ulangan 3 (skor 2): Fokus ada pada ring konsentris di kartu 'Ringkasan hari ini', dengan angka tebal besar 6.842/412/38 di sebelah kanan. Skala melompat tegas: sapaan bold sekitar 22 px, judul seksi semibold, metadata kecil abu. Setiap judul seksi punya konten, jadi tidak ada judul yatim.
- R4, ulangan 1 (skor 1): Aksen oranye konsisten (tab aktif, tombol play, badge BERIKUTNYA, link 'Lihat semua'/'Jelajahi'). Warna kuning dan merah di ring bermakna per metrik. Satu teks lemah: label tab tidak aktif 'Latihan/Progres/Profil' dan teks item selesai 'Lari pagi santai' yang diredupkan tampak kurang kontras di surface gelap.
- R4, ulangan 2 (skor 2): Oranye konsisten untuk tautan 'Lihat semua'/'Jelajahi', tombol play, item 'BERIKUTNYA', tab aktif 'Beranda', dan level program. Kuning dan merah hanya dipakai sebagai kategori seri ring dengan dot legenda yang cocok. Ikon play dan dumbel di atas oranye berwarna gelap (≈#1A0F05). Teks muted '5 km · 32 mnt' dan '/ 10.000' terbaca di surface gelap.
- R4, ulangan 3 (skor 2): Oranye konsisten untuk aksi dan status aktif: link 'Lihat semua'/'Jelajahi', kartu jadwal berikutnya berborder oranye, tombol play, tab aktif, dan badge streak. Kuning dan merah hanya dipakai sebagai kategori seri ring dan titik legenda, jadi bermakna. Ikon play dan dumbbell di atas oranye berwarna gelap. Teks muted abu ('/ 10.000', '5 km · 32 mnt') terbaca di surface gelap.
- R5, ulangan 1 (skor 2): Ikon outline seragam (jejak kaki, dumbbell, bunga, chevron, play, bintang, api, ikon tab). Avatar foto. Foto program (pelari, pria latihan) relevan dan matang. Tanpa emoji; ikon api di chip '12 hari' adalah ikon garis, bukan emoji.
- R5, ulangan 2 (skor 2): Avatar foto di kiri atas dengan tanggal 'Rabu, 18 November' di atas sapaan tebal 'Selamat pagi, Rani', tanpa emoji. Ikon satu gaya outline: sepatu, dumbel, bunga, bel, dan ikon tab. Foto pelari dan petinju di kartu program relevan.
- R5, ulangan 3 (skor 2): Golden 2 terpenuhi: tanggal 'Rabu, 18 November' di atas sapaan bold 'Selamat pagi, Rani', avatar foto di kiri atas, tanpa emoji. Ikon outline seragam (lonceng, sepatu, dumbbell, bunga, check, play, chevron, ikon tab). Foto pelari dan foto latihan kekuatan di kartu rekomendasi relevan.
- R6, ulangan 1 (skor 1): Angka konsisten: '74% dari target harian' sama dengan rata-rata 68% (6.842/10.000), 69% (412/600), dan 84% (38/45), dan busur ring sesuai. Satu inkonsistensi bahasa: judul 'Upper body strength' berbahasa Inggris di aplikasi berbahasa Indonesia (item jadwal tengah).
- R6, ulangan 2 (skor 1): Angka konsisten: 6.842/10.000 (68%), 412/600 (69%), 38/45 (84%), rata-rata 74% sesuai '74% dari target harian'. Busur ring kira-kira proporsional. Ada satu inkonsistensi copy: judul 'Upper body strength' berbahasa Inggris di antara copy Indonesia ('Lari pagi santai', 'Yoga peregangan').
- R6, ulangan 3 (skor 1): Golden 3 terpenuhi sebagian: legenda nilai/target ada (6.842/10.000, 412/600 kkal, 38/45 mnt) dan '74% dari target harian' cocok dengan rata-rata 68/69/84%. Namun panjang busur tidak jelas sesuai angka: busur luar Langkah tampak sekitar 80%, padahal seharusnya 68%, dan ring dalam Menit aktif (84%) tidak tampak paling penuh.
- R8, ulangan 1 (skor 2): 0 pelanggaran slop. Dua kartu program dibedakan dengan foto berbeda, rating, dan level. Keputusan khas yang terlihat: baris 'BERIKUTNYA' disorot dengan outline oranye, ikon oranye solid, dan tombol play bulat, serta chip streak '12 hari' di kartu ringkasan.
- R8, ulangan 2 (skor 2): Tidak ada pelanggaran slop. Kedua kartu program jelas berbeda: foto berwarna pelari di bata merah vs foto hitam-putih petinju. Langkah khas yang bisa ditunjuk: item jadwal 'Berikutnya' (y≈572–660) diberi border oranye, tile ikon oranye solid, dan tombol play bulat, sedangkan item selesai diredupkan.
- R8, ulangan 3 (skor 2): Golden 5 terpenuhi: dua kartu program dibedakan oleh foto berbeda (pelari di jalan vs pria berlatih hitam-putih) dan level berbeda. Tidak ada pelanggaran slop. Langkah khas yang bisa ditunjuk: jadwal tiga status (selesai diredupkan, berikutnya disorot border oranye dengan chip dan tombol play, mendatang dengan chevron), serta ikon petir di pusat ring.

### Pemetaan X/Y per ulangan (dibuka setelah penilaian)

| Ulangan | Desain X | Desain Y | Status | Biaya |
|---|---|---|---|---|
| 1 | Lakar | pen.dev | ok | $0.15 |
| 2 | pen.dev | Lakar | ok | $0.17 |
| 3 | pen.dev | Lakar | ok | $0.18 |

## Biaya

Biaya juri total: $1.56 (A $1.06, B $0.50). Tidak ada biaya agen desain.
