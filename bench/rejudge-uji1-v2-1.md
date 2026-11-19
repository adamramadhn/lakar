# Penilaian ulang juri `uji1-v2-1` (sumber: putaran uji-1)

Status: **lengkap**. Tanggal: 2026-11-18T06:52:51.848Z.

Strip PNG putaran sumber dinilai ulang dengan rubrik juri saat ini. Tidak ada agen desain yang dijalankan: status run dan gerbang Lakar diambil dari laporan sumber. Keputusan di bawah adalah keluaran juri dan aturan keputusan, menunggu tinjauan Adam.

## Sumber dan versi

- Sumber: `bench/round-uji-1.json` (keputusan Adam dari `bench/round-uji-1.md`)
- Strip A: Lakar `bench/runs/rounds/uji-1/A-lakar.png`, pen.dev `bench/runs/rounds/uji-1/A-pendev.png`
- Strip B: Lakar `bench/runs/rounds/uji-1/B-lakar.png`, pen.dev `bench/runs/rounds/uji-1/B-pendev.png`
- Model juri: `claude-opus-5-5`; Claude Code: 2.1.325 (Claude Code); git HEAD: `9ee43d45187cefdceb74865cb7c301ccd53e1387`
- Versi rubrik: 2 (`bench/rubric/rubric.json`: versi 2, sama)
- sha256 teks juri A: `cd273805584f3f3627efadfdf88e47b6b9299a8c021a9c133bf3f94179b09925`
- sha256 teks juri B: `6d9049502db51cd1a7829dd835aeccb07b3d7123eb3da8db9196c6e19eef01df`
- Argv juri: `claude -p --input-format stream-json --output-format stream-json --verbose --model claude-opus-5-5 --tools "" --strict-mcp-config --mcp-config bench/runs/rejudge/uji1-v2-1/mcp-empty.json --disable-slash-commands --no-session-persistence`
- Artefak mentah (gitignored): `bench/runs/rejudge/uji1-v2-1/` (teks juri, pemetaan X/Y, transkrip per ulangan)

## Ringkasan

| Prompt | T Lakar (maks 16) | T pen.dev | D Lakar (maks 4) | D pen.dev | Keputusan v2 | Keputusan sumber | Keputusan Adam | Pelanggaran brief pen.dev |
|---|---|---|---|---|---|---|---|---|
| A | 15 | 12 | 4 | 4 | **Lebih baik** | Lebih baik (T 10 vs 6) | – | tidak ada |
| B | 12 | 14 | 3 | 4 | **Kalah** | Setara (T 8 vs 8) | – | tidak ada |

## Kalibrasi

putaran uji-1 = hold-out; hanya dilaporkan (tanpa ambang lulus).
- R9/R10 dengan rentang > 1 (ditandai untuk Adam, tidak menggagalkan): tidak ada

## Prompt A

- Gerbang Lakar (dari sumber): lolos
- Brief mengikat pen.dev (ukuran frame): sesuai
- Keputusan v2: **Lebih baik**. Alasan: lolos gerbang, total 15 ≥ 12 + 3, daya tarik 4 ≥ 4.
- Kalah-daya-tarik: tidak ada; Kalah-lain: tidak ada; R Lakar 0 vs pen.dev 2: tidak ada
- Pelanggaran brief pen.dev: tidak ada
- Keputusan sumber: Lebih baik (lolos gerbang, total 10 ≥ 6 + 2); keputusan Adam: –

### Skor (ulangan valid 3 dari 3)

| Kriteria | Alat | Ulangan 1 | Ulangan 2 | Ulangan 3 | Median (rentang) |
|---|---|---|---|---|---|
| R1 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R1 | pen.dev | 1 | 2 | 1 | 1 (rentang 1) |
| R2 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R2 | pen.dev | 2 | 2 | 1 | 2 (rentang 1) |
| R4 | Lakar | 2 | 1 | 2 | 2 (rentang 1) |
| R4 | pen.dev | 2 | 1 | 1 | 1 (rentang 1) |
| R5 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R5 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R6 | Lakar | 2 | 1 | 2 | 2 (rentang 1) |
| R6 | pen.dev | 2 | 2 | 1 | 2 (rentang 1) |
| R8 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R8 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R9 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R9 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R10 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R10 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| **T** | Lakar |  |  |  | **15** |
| **T** | pen.dev |  |  |  | **12** |
| **D = R9 + R10** | Lakar |  |  |  | **4** |
| **D = R9 + R10** | pen.dev |  |  |  | **4** |
| Slop | Lakar |  |  |  | 0 (rentang 0) |
| Slop | pen.dev |  |  |  | 1 (rentang 2) **periksa Adam** |

### Bukti R9/R10 per ulangan

**R9 Lakar**

- Ulangan 1 (skor 2): KPI mockup diberi pembanding ('+12,4% dari Oktober', '+36,4% dari Oktober'), metadata 'Diperbarui 17.42 WIB · 3 kasir aktif', rentang '1–18 Nov 2026', grafik 7 hari dengan legenda, dan transaksi dengan jam. Kartu fitur memuat hasil terukur ('Lunas rata-rata 9 hari lebih cepat', 'Peringatan di bawah 10 unit'). Rating diberi konteks '4,8 dari 1.932 ulasan di Play Store'. Pricing diberi catatan 'Harga belum termasuk PPN. Bayar tahunan, gratis 2 bulan.'
- Ulangan 2 (skor 2): KPI diberi pembanding '+12,4% dari Oktober'. Mockup menampilkan metadata 'Diperbarui 17.42 WIB · 3 kasir aktif' dan rentang '1–18 Nov 2026', serta transaksi dengan jam. Kartu fitur punya penanda hasil 'Lunas rata-rata 9 hari lebih cepat' dan 'Peringatan di bawah 10 unit'. Rating ditulis '4,8 dari 1.932 ulasan di Play Store'. Pricing diberi catatan PPN dan diskon tahunan.
- Ulangan 3 (skor 2): Angka diberi konteks pembanding dan periode: 'dari Oktober', '1–18 Nov 2026', 'Diperbarui 17.42 WIB · 3 kasir aktif'. Daftar transaksi menunjukkan variasi masuk/keluar dengan jam dan warna. Kartu fitur memuat metrik hasil ('Lunas rata-rata 9 hari lebih cepat', 'Peringatan di bawah 10 unit'). Rating diberi sumber '4,8 dari 1.932 ulasan di Play Store'. Harga disertai catatan 'Harga belum termasuk PPN. Bayar tahunan, gratis 2 bulan.' Padat tetapi tetap terbaca.

**R10 Lakar**

- Ulangan 1 (skor 2): Permukaannya berlapis: hero dengan gradien mint, kartu 'Laba bersih' ber-tint dengan border hijau, kartu fitur besar abu ber-tint dengan tabel putih di dalamnya, ikon fitur dalam wadah hijau muda, seksi testimoni gelap dengan avatar ber-tint hijau, dan kartu pricing tengah hijau gelap dengan CTA hijau terang (bagian 1–4). Badge berwarna terdefinisi: 'Baru: laporan pajak…' dan 'Paling populer'. Grafik dua nada terlihat matang.
- Ulangan 2 (skor 2): Permukaan berlapis: hero ber-tint hijau, kartu fitur besar abu dengan tabel putih di dalamnya, seksi testimoni gelap, dan kartu tier tengah hijau gelap. Kartu 'Laba bersih' ber-tint hijau. Chip 'Baru' dan badge 'Paling populer' terdefinisi. Wadah ikon ber-tint, avatar inisial, dan grafik batang hijau/abu menyatu dengan desain.
- Ulangan 3 (skor 2): Permukaannya berlapis: gradien tint hijau di hero, kartu 'Laba bersih' ber-tint hijau dengan border hijau, wadah ikon ber-tint, kartu fitur besar berlatar abu, seksi testimoni gelap, dan kartu harga tengah hijau gelap dengan bayangan. Komponennya matang: badge 'Baru' dan 'Paling populer', legend grafik, chip tanggal, avatar inisial ber-tint, dan ikon sosial di footer. Mockup menyatu dengan desain.

**R9 pen.dev**

- Ulangan 1 (skor 2): KPI mockup diberi delta persentase (+12,4%, +3,1%, +18,9%, +8,2%), periode 'Nov 2026', dan grafik 6 bulan dengan legenda. Daftar transaksi memuat metadata waktu dan metode ('Hari ini · Tunai', 'Kemarin · QRIS'). Kartu fitur punya sub-poin bertanda check; testimoni utama memiliki metrik; tiap tier pricing diberi deskripsi target pengguna. Padat tetapi tetap terbaca.
- Ulangan 2 (skor 2): KPI mockup diberi tren (+12,4%, +18,9%) dan periode (Nov 2026). Transaksi punya metadata 'Hari ini · Tunai' dan nominal bertanda +/−. Grafik 6 bulan berlegenda. Kartu fitur punya sub-daftar check. Testimoni menampilkan metrik waktu dihemat. Setiap tier pricing punya deskripsi segmen. Desain padat tetapi tetap terbaca.
- Ulangan 3 (skor 2): Mockup memuat badge tren per KPI, kartu 'Saldo Kas', dan transaksi dengan metadata waktu dan metode ('Hari ini · Tunai', 'Kemarin · QRIS'). Kartu fitur punya sub-daftar check ('Scan struk dengan kamera', 'Format standar SAK EMKM'). Statistik memakai satuan ('/ bulan', 'rata-rata setup awal'). Testimoni diberi metrik '16 jam dihemat setiap bulan'. Tiap tier punya deskripsi target pengguna. Padat dan terbaca.

**R10 pen.dev**

- Ulangan 1 (skor 2): Permukaannya berlapis: hero ber-tint mint, frame mockup hijau pucat, seksi testimoni hijau gelap dengan kartu berlapis, kartu pricing tengah gelap, dan banner CTA hijau (bagian 1–5). Badge berwarna terdefinisi: 'Baru', 'Paling Populer', serta badge delta hijau dan merah. Ikon fitur berada di wadah hijau solid, avatar inisial ber-tint, dan grafik bar dua nada terlihat matang.
- Ulangan 2 (skor 2): Permukaan berlapis: hero ber-tint hijau, seksi testimoni hijau sangat gelap, pricing abu terang, dan banner CTA hijau solid. Ada chip 'Baru', badge tren hijau/merah di KPI, dan badge 'Paling Populer'. Ikon fitur berada di wadah hijau, avatar inisial ber-tint, dan grafik batang dua nuansa hijau menyatu dengan desain.
- Ulangan 3 (skor 2): Permukaannya berlapis: hero ber-tint hijau, bingkai mockup ber-tint hijau dengan bayangan, kartu fitur ber-tint, seksi testimoni hijau gelap dengan kartu hijau lebih terang, kartu harga tengah hijau gelap yang terangkat, dan band CTA hijau solid (bagian 5). Komponennya matang: badge 'Baru' dan 'Paling Populer', chip tren berwarna, ikon check dalam lingkaran ber-tint, ikon sosial berbingkai, dan tombol 'Catat Transaksi' di mockup.

### Bukti kriteria lain per ulangan

**Lakar**

- R1, ulangan 1 (skor 2): Ketujuh bagian lengkap dan berurutan tanpa seksi ekstra: navbar (bagian 1), hero dengan headline, subjudul, 2 CTA, dan mockup dashboard (bagian 1–2), 3 fitur dalam layout bento (bagian 2), testimoni gelap (bagian 3), pricing 3 tier dengan tier tengah ditonjolkan (bagian 3–4), dan footer (bagian 4–5). Lebar desktop, aksen hijau, dan Bahasa Indonesia sesuai.
- R1, ulangan 2 (skor 2): Navbar (bagian 1), lalu hero dengan headline, subjudul, CTA 'Coba gratis 14 hari' + 'Lihat demo 2 menit' dan mockup dashboard. Setelahnya 3 fitur dalam layout bento (bagian 2), testimoni berlatar gelap (bagian 3), pricing 3 tier dengan tier tengah 'Usaha' ditonjolkan (bagian 3–4), dan footer (bagian 4–5). Urutan sesuai, bahasa Indonesia, aksen hijau, lebar 1440.
- R1, ulangan 3 (skor 2): Semua tujuh bagian ada dan urutannya benar. Navbar (logo Kasku, menu, Masuk + 'Coba gratis 14 hari') ada di bagian 1 atas. Hero dengan headline, subjudul, 2 CTA, dan mockup dashboard 'Ringkasan November 2026' ada di bagian 1. Fitur (3 kartu) ada di bagian 2. Testimoni ada di bagian 3. Harga 3 tier ada di bagian 3–4. Footer ada di bagian 4–5. Lebar 1440px, aksen hijau, mode terang dengan seksi gelap, seluruh copy berbahasa Indonesia. Tidak ada seksi ekstra.
- R2, ulangan 1 (skor 2): Headline display 2 baris di tengah bagian 1: 'Tahu untung bersih usahamu setiap sore, tanpa buka Excel'. Isinya klaim hasil dan tidak ada kata yatim. Lompatan skala tegas ke subjudul dan ke H2 seksi. CTA primer hijau 'Coba gratis 14 hari' berdampingan dengan CTA sekunder outline 'Lihat demo 2 menit'. H2 'Pembukuan rapi tanpa perlu paham akuntansi' muat satu baris (bagian 2).
- R2, ulangan 2 (skor 2): Headline 'Tahu untung bersih usahamu setiap sore, tanpa buka Excel' (bagian 1) berukuran display, 2 baris, berisi klaim hasil, dan tidak ada kata yatim. Lompatan skala ke subjudul dan judul seksi jelas. CTA primer hijau solid berdampingan dengan CTA sekunder outline berikon play.
- R2, ulangan 3 (skor 2): Headline display 'Tahu untung bersih usahamu setiap sore, tanpa buka Excel' (bagian 1, tengah) terdiri dari 2 baris dan berisi klaim hasil. Skalanya jauh di atas subjudul 18px dan judul seksi ±32px. Tidak ada kata yatim; baris kedua judul testimoni 'tetap rapi' berisi 2 kata. CTA primer 'Coba gratis 14 hari →' berwarna hijau solid, CTA sekunder 'Lihat demo 2 menit' berupa outline.
- R4, ulangan 1 (skor 2): Hijau tua dipakai konsisten untuk tombol primer, item navigasi aktif, bar 'Masuk', border kartu 'Laba bersih', dan nominal positif (bagian 1–2); teks di atas aksen putih. Warna tambahan bermakna: oranye-merah '+3,1% dari Oktober' pada Pengeluaran menandai arah buruk, bintang kuning untuk rating (bagian 3), dan bar abu untuk 'Keluar'. Ritme terang–gelap: hero ber-tint, fitur putih, testimoni gelap, pricing terang. Tidak ada teks yang tampak gagal kontras.
- R4, ulangan 2 (skor 1): Hijau dipakai konsisten untuk CTA, seri 'Masuk' di grafik, kartu 'Laba bersih' yang ber-border hijau, dan check. Oranye pada tren Pengeluaran bermakna. Ritme terang/gelap ada: hero tint, fitur putih, testimoni gelap, pricing abu terang, footer putih. Satu kriteria golden gagal: CTA 'Coba gratis 14 hari' dan badge 'Paling populer' di tier Usaha (bagian 4) memakai hijau terang dengan teks gelap, bukan #15803D + teks putih.
- R4, ulangan 3 (skor 2): Hijau tua dipakai konsisten di CTA navbar/hero (teks putih), item aktif sidebar, batang 'Masuk' grafik, nominal positif, dan label seksi. Warna tambahan bermakna: oranye untuk tren pengeluaran '+3,1% dari Oktober' (arah buruk) dan bintang kuning untuk rating (bagian 3). Ritme seksi: hero ber-tint hijau → fitur putih → testimoni gelap → harga abu terang → footer putih. Tidak terlihat teks gagal kontras.
- R5, ulangan 1 (skor 2): Ikon garis seragam: sidebar mockup, panah transaksi, dan ikon fitur bar-chart/message-circle/package dalam wadah persegi ber-tint hijau seragam (bagian 2). Pricing memakai check, testimoni memakai star dan quote, footer memakai ikon sosial. Tidak ada emoji; sapaan mockup 'Ringkasan November 2026' bersih. Visual utama berupa dashboard yang relevan.
- R5, ulangan 2 (skor 2): Ikon garis Lucide seragam: sidebar mockup, panah transaksi, ikon fitur bar-chart/message-circle/package dalam wadah persegi ber-tint hijau berukuran sama (bagian 2), check di pricing, dan ikon star di testimoni. Tidak ada emoji, sapaan mockup hanya 'Toko Bu Ratna'. Mockup dashboard relevan.
- R5, ulangan 3 (skor 2): Ikon bergaya Lucide outline dengan satu gaya: chart, message-circle, dan package di fitur (bagian 2) dalam wadah persegi ber-tint hijau berukuran seragam; calendar, play-circle, dan check di hero; layout-grid, arrows, package, users, file, dan settings di sidebar mockup. Bintang rating berupa ikon. Visual utama adalah mockup dashboard nyata yang relevan. Tidak ada emoji, termasuk di header mockup 'Toko Bu Ratna'.
- R6, ulangan 1 (skor 2): Mockup: Pemasukan Rp 48,2 jt − Pengeluaran Rp 31,7 jt = Laba bersih Rp 16,5 jt (bagian 1), dan aritmetikanya benar. Angka ini konsisten dengan tabel laba rugi di kartu fitur: 48.200.000 − 22.900.000 − 8.800.000 = 16.500.000 (bagian 2). Testimoni lengkap dengan nama, usaha, dan kota: 'Ratna Wulandari · Katering Dapur Bu Ratna · Semarang', 'Dedi Kurniawan · … · Garut', 'Maria Sitanggang · … · Medan' (bagian 3); rating memakai ikon bintang. Masa trial 14 hari konsisten di semua tempat.
- R6, ulangan 2 (skor 1): Angka konsisten: Pemasukan Rp 48,2 jt − Pengeluaran Rp 31,7 jt = Laba bersih Rp 16,5 jt (bagian 1), dan tabel di kartu fitur 48,2 − 22,9 − 8,8 = 16,5 jt (bagian 2). Testimoni lengkap dengan nama, usaha, dan kota (Semarang, Garut, Medan). Ada 1 inkonsistensi: kartu Pengeluaran menampilkan ikon panah turun (trending-down) bersama nilai '+3,1% dari Oktober' (bagian 1).
- R6, ulangan 3 (skor 2): Angka di mockup konsisten: Pemasukan Rp 48,2 jt − Pengeluaran Rp 31,7 jt = Laba bersih Rp 16,5 jt (bagian 1). Tabel fitur ikut konsisten: Rp 48.200.000 − 22.900.000 − 8.800.000 = Rp 16.500.000 (bagian 2). Tren +12,4% / +3,1% / +36,4% juga konsisten secara matematis. Testimoni memuat nama, usaha, dan kota: Ratna Wulandari · Katering Dapur Bu Ratna · Semarang; Dedi Kurniawan · Garut; Maria Sitanggang · Medan. Rating memakai ikon bintang. Copy-nya spesifik, misalnya 'Pengingat sopan terkirim otomatis H-1 jatuh tempo'.
- R8, ulangan 1 (skor 1): Tidak ada pelanggaran slop. Ada komposisi khas yang bisa ditunjuk: fitur bento asimetris dengan tabel laba rugi hidup di kartu besar (bagian 2). Tier tengah 'Usaha' ditonjolkan dengan kartu hijau gelap, badge 'Paling populer', CTA primer, tier lain memakai tombol outline, dan fitur bertanda check (bagian 4). Satu kriteria golden gagal: harga ditulis 'Rp 79.000 / bulan', bukan format 'Rp 79rb/bulan'.
- R8, ulangan 2 (skor 1): Tidak ada pelanggaran slop. Ada langkah khas yang bisa ditunjuk: bento fitur dengan kartu besar berisi tabel laba rugi nyata (bagian 2). Tier tengah berlatar hijau gelap dengan badge, CTA-nya primer dan tier lain outline. Namun satu kriteria golden 6 gagal: harga ditulis 'Rp 79.000 / bulan' (bagian 4), bukan 'Rp 79rb/bulan'.
- R8, ulangan 3 (skor 1): Tidak ada pelanggaran slop. Ada keputusan komposisi khas: fitur disusun bento (kartu besar berisi tabel laba rugi nyata + 2 kartu kecil) dan testimoni utama memuat metrik '6 jam dihemat tiap minggu' (bagian 2–3). Tier tengah 'Usaha' ditonjolkan lewat isian hijau gelap, badge 'Paling populer', dan CTA hijau terang, sedangkan tier lain memakai CTA outline dan fitur ber-check. Namun harga tertulis 'Rp 79.000 / bulan', bukan format golden 'Rp 79rb/bulan' (bagian 4). Satu kriteria golden gagal, jadi skornya 1.

**pen.dev**

- R1, ulangan 1 (skor 1): Semua bagian wajib hadir dan berurutan: navbar (bagian 1 atas), hero dengan headline, subjudul, 2 CTA, dan mockup dashboard (bagian 1–2), 3 kartu fitur (bagian 2–3), testimoni gelap (bagian 3–4), pricing 3 tier (bagian 4–5), CTA penutup hijau yang opsional (bagian 5), dan footer (bagian 5–6). Lebar desktop, aksen hijau, dan Bahasa Indonesia sesuai. Ada satu seksi ekstra di luar aturan: strip statistik 'Dipercaya 25.000+ UMKM … 25.000+ / Rp4,8 T / 4,9/5 / 2 menit' di bawah mockup (bagian 2 atas).
- R1, ulangan 2 (skor 2): Bagian 1–6: navbar (logo, Fitur/Harga/Testimoni/Bantuan, Masuk + Coba Gratis), lalu hero dengan headline, subjudul, CTA 'Mulai Gratis 30 Hari' + 'Lihat Demo' dan mockup dashboard. Setelahnya 3 kartu fitur (bagian 2–3), testimoni berlatar gelap (bagian 3–4), pricing 3 tier dengan tier tengah 'Bisnis' ditonjolkan (bagian 4–5), CTA penutup hijau yang opsional, dan footer (bagian 5–6). Urutan sesuai, bahasa Indonesia, aksen hijau, lebar 1440. Strip statistik (bagian 2 atas) masih berada di bidang tint hero, jadi dihitung bagian dari hero, bukan seksi ekstra.
- R1, ulangan 3 (skor 1): Tujuh bagian wajib hadir dan urutannya benar: navbar, hero + mockup, fitur, testimoni, harga, CTA penutup (opsional), footer. Ada 1 seksi ekstra di luar aturan, yaitu strip statistik 'Dipercaya 25.000+ UMKM / 25.000+ / Rp4,8 T / 4,9/5 / 2 menit' di antara hero dan fitur (bagian 2), yang dipisah garis dari seksi fitur. Lebar, aksen hijau, dan bahasa sesuai.
- R2, ulangan 1 (skor 2): Headline hero display 3 baris berada di tengah atas bagian 1: 'Pembukuan rapi, usaha tenang. Fokus jualan, biar Kasku yang mencatat.' Isinya klaim hasil dan tidak ada kata yatim. Lompatan skala tegas ke subjudul abu-abu dan ke H2 seksi seperti 'Semua yang usaha Anda butuhkan…' (bagian 2). CTA primer hijau 'Mulai Gratis 30 Hari' berdampingan dengan CTA sekunder outline 'Lihat Demo' (bagian 1). H2 lain tidak memiliki baris yatim.
- R2, ulangan 2 (skor 2): Headline hero 'Pembukuan rapi, usaha tenang. Fokus jualan, biar Kasku yang mencatat.' (bagian 1, tengah) berukuran display, 3 baris, berisi klaim hasil, dan tidak ada kata yatim. Lompatan skala ke subjudul dan judul seksi (~44px) tegas. CTA primer hijau solid 'Mulai Gratis 30 Hari' berdampingan dengan CTA sekunder outline 'Lihat Demo'.
- R2, ulangan 3 (skor 1): Titik fokusnya jelas: headline display 3 baris 'Pembukuan rapi, usaha tenang. Fokus jualan, biar Kasku yang mencatat.' (bagian 1). CTA primer hijau 'Mulai Gratis 30 Hari' dan CTA sekunder outline 'Lihat Demo' sudah tepat. Namun ada judul yatim: judul CTA penutup 'Siap merapikan keuangan usaha / Anda?' menyisakan satu kata 'Anda?' di baris kedua (bagian 5).
- R4, ulangan 1 (skor 2): Hijau tua dipakai konsisten untuk tombol primer (navbar 'Coba Gratis', hero CTA), bar 'Masuk' pada grafik, ikon fitur, dan nominal transaksi positif (bagian 1–2); teks di atas aksen putih. Warna tambahan bermakna: badge merah '+3,1%' pada Pengeluaran menandai arah buruk, dan bintang kuning untuk rating (bagian 3). Ritme terang–gelap jelas: hero mint, fitur putih, testimoni hijau gelap, pricing terang, CTA hijau. Tidak ada teks yang tampak gagal kontras.
- R4, ulangan 2 (skor 1): Hijau tua dipakai konsisten untuk CTA navbar, CTA hero, ikon fitur, dan seri 'Masuk' di grafik. Merah +3,1% pada Pengeluaran dan bintang kuning bermakna. Ritme terang/gelap ada: hero tint, fitur putih, testimoni hijau gelap, pricing terang, CTA hijau. Satu kriteria golden gagal: CTA 'Coba Gratis 30 Hari' dan badge 'Paling Populer' di tier Bisnis (bagian 4) memakai hijau terang berbeda dengan teks gelap, bukan #15803D + teks putih.
- R4, ulangan 3 (skor 1): Hijau dipakai konsisten di CTA, item aktif, batang 'Masuk', badge tren, dan band CTA penutup. Merah pada '+3,1%' pengeluaran bermakna, begitu juga bintang kuning. Ritme terang/gelap ada: hero tint → fitur putih → testimoni hijau gelap → harga terang → CTA hijau. Kekurangannya ada 1 teks lemah: label kecil 'dihemat setiap bulan' di bawah '16 jam' dan peran 'Pemilik Lapis Bu Sari, Surabaya' tampil sangat redup di atas hijau gelap (bagian 3–4).
- R5, ulangan 1 (skor 1): Ikon garis seragam: sidebar mockup, ikon transaksi, ikon fitur zap/pie-chart/boxes dalam wadah persegi hijau seragam (bagian 2), check pada daftar, dan ikon sosial di footer. Visual utama berupa mockup dashboard yang relevan. Namun ada glyph tangan melambai pada sapaan 'Halo, Toko Bu Sari 👋' di header mockup (bagian 1 bawah), sehingga kriteria golden 'tanpa emoji termasuk di sapaan' gagal.
- R5, ulangan 2 (skor 1): Ikon garis bergaya Lucide konsisten: sidebar mockup, ikon transaksi, check, dan ikon fitur zap/pie-chart/boxes dalam wadah persegi hijau yang seragam (bagian 2). Mockup dashboard relevan. Namun ada emoji 👋 di sapaan mockup 'Halo, Toko Bu Sari 👋' (bagian 1 bawah), yang melanggar kriteria golden 4.
- R5, ulangan 3 (skor 1): Ada 1 emoji dekoratif 👋 di sapaan mockup 'Halo, Toko Bu Sari 👋' (bagian 1). Ini melanggar golden 'tanpa emoji, termasuk di sapaan'. Selain itu ikon bergaya Lucide seragam: zap, pie-chart, dan boxes di fitur dalam wadah hijau solid berukuran sama; ikon transaksi dan sidebar konsisten. Visual utama berupa mockup dashboard yang relevan.
- R6, ulangan 1 (skor 2): Mockup memakai teks dan shape nyata: Pemasukan Rp48,2 jt − Pengeluaran Rp21,7 jt = Laba Bersih Rp26,5 jt (bagian 1), dan aritmetikanya benar. Testimoni lengkap dengan nama, usaha, dan kota: 'Sari Rahayu – Pemilik Lapis Bu Sari, Surabaya', 'Dimas Pratama – Kopi Senja, Yogyakarta', 'Ayu Nirmala – Batik Ayu Store, Pekalongan' (bagian 3–4); rating memakai ikon bintang. Copy spesifik (SAK EMKM, KUR, QRIS, GoFood) dan masa trial 30 hari konsisten di hero, pricing, dan CTA.
- R6, ulangan 2 (skor 2): Kartu KPI mockup: Pemasukan Rp48,2 jt − Pengeluaran Rp21,7 jt = Laba Bersih Rp26,5 jt, konsisten. Testimoni lengkap dengan nama, usaha, dan kota: Sari Rahayu – Lapis Bu Sari, Surabaya; Dimas Pratama – Kopi Senja, Yogyakarta; Ayu Nirmala – Batik Ayu Store, Pekalongan. Rating memakai ikon star. Copy spesifik (SAK EMKM, KUR, QRIS, GoFood). Masa uji '30 hari' konsisten di hero, pricing, dan CTA penutup.
- R6, ulangan 3 (skor 1): Mockup memenuhi rumus Pemasukan Rp48,2 jt − Pengeluaran Rp21,7 jt = Laba Bersih Rp26,5 jt (bagian 1). Testimoni lengkap dengan nama, usaha, dan kota (Sari Rahayu Surabaya, Dimas Pratama Yogyakarta, Ayu Nirmala Pekalongan) dan rating berupa ikon bintang. Ada 1 inkonsistensi: tren +12,4% pemasukan dan +3,1% pengeluaran menghasilkan kenaikan laba ±21%, tetapi badge laba bersih menulis '+18,9%' (bagian 1).
- R8, ulangan 1 (skor 1): Ada 1 pelanggaran slop: strip statistik bulat '25.000+ UMKM aktif / Rp4,8 T' (bagian 2 atas). Pricing memenuhi golden: tier tengah 'Bisnis' ditonjolkan dengan kartu hijau gelap yang terangkat, diberi badge 'Paling Populer', CTA primer 'Coba Gratis 30 Hari', tier lain memakai tombol outline, harga 'Rp79rb /bulan', dan fitur bertanda check (bagian 4–5). Ada juga komposisi khas: testimoni asimetris dengan kartu besar dan metrik '16 jam dihemat setiap bulan' (bagian 3).
- R8, ulangan 2 (skor 1): Kriteria golden 6 terpenuhi: tier tengah 'Bisnis' berlatar hijau gelap, terangkat, dengan badge 'Paling Populer'. CTA-nya primer sedangkan tier lain outline, harga 'Rp79rb/bulan', dan fitur memakai check. Ada langkah khas yang bisa ditunjuk: testimoni asimetris dengan kutipan besar dan metrik '16 jam dihemat setiap bulan' (bagian 3). Namun ada 1 pelanggaran slop: strip statistik bulat '25.000+', 'Rp4,8 T', '2 menit' (bagian 2 atas).
- R8, ulangan 3 (skor 1): Kriteria golden harga terpenuhi. Tier tengah 'Bisnis' berisian hijau gelap, dinaikkan lebih tinggi, dan diberi badge 'Paling Populer', dengan harga 'Rp79rb/bulan', CTA primer hijau, tier lain outline, dan fitur ber-check (bagian 4–5). Namun ada 2 pelanggaran slop di luar emoji: (2) tiga kartu fitur identik dengan ikon dalam wadah sebagai pola seksi fitur (bagian 2–3), dan (5) statistik bulat '25.000+ UMKM aktif', 'Rp4,8 T' yang tidak diberikan prompt (bagian 2).

### Pemetaan X/Y per ulangan (dibuka setelah penilaian)

| Ulangan | Desain X | Desain Y | Status | Biaya |
|---|---|---|---|---|
| 1 | pen.dev | Lakar | ok | $0.35 |
| 2 | pen.dev | Lakar | ok | $0.34 |
| 3 | Lakar | pen.dev | ok | $0.38 |

## Prompt B

- Gerbang Lakar (dari sumber): lolos
- Brief mengikat pen.dev (ukuran frame): sesuai
- Keputusan v2: **Kalah**. Alasan: total 12 < 14 − 1.
- Kalah-daya-tarik: tidak ada; Kalah-lain: total 12 < 14 − 1; R Lakar 0 vs pen.dev 2: tidak ada
- Pelanggaran brief pen.dev: tidak ada
- Keputusan sumber: Setara (lolos gerbang, total 8 ≥ 8 − 1, tanpa R Lakar 0 vs pen.dev 2); keputusan Adam: –

### Skor (ulangan valid 3 dari 3)

| Kriteria | Alat | Ulangan 1 | Ulangan 2 | Ulangan 3 | Median (rentang) |
|---|---|---|---|---|---|
| R1 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R1 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R2 | Lakar | 1 | 2 | 1 | 1 (rentang 1) |
| R2 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R4 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R4 | pen.dev | 2 | 1 | 2 | 2 (rentang 1) |
| R5 | Lakar | 2 | 2 | 1 | 2 (rentang 1) |
| R5 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R6 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R6 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R8 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R8 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R9 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R9 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R10 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R10 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| **T** | Lakar |  |  |  | **12** |
| **T** | pen.dev |  |  |  | **14** |
| **D = R9 + R10** | Lakar |  |  |  | **3** |
| **D = R9 + R10** | pen.dev |  |  |  | **4** |
| Slop | Lakar |  |  |  | 0 (rentang 0) |
| Slop | pen.dev |  |  |  | 0 (rentang 0) |

### Bukti R9/R10 per ulangan

**R9 Lakar**

- Ulangan 1 (skor 2): Angka diberi target, satuan, dan agregat 'Rata-rata 71%'. Jadwal menunjukkan status selesai vs berikutnya dengan jam · durasi · keterangan. Kartu program memuat chip level (Pemula/Menengah) serta frekuensi × durasi.
- Ulangan 2 (skor 2): Setiap angka diberi target dan satuan (/10.000, /600 kkal, /30 mnt) plus rata-rata persen. Jadwal memuat jam, durasi, jumlah gerakan, dan status ('selesai' vs tombol Mulai). Kartu program punya badge level (Pemula/Menengah) serta frekuensi dan durasi. Padat tetapi tetap terbaca.
- Ulangan 3 (skor 2): Angka diberi target, satuan, dan agregat 'Rata-rata 71%'. Jadwal memperlihatkan status selesai vs berikutnya dengan jam dan durasi. Kartu program punya chip level (Pemula/Menengah), frekuensi, dan durasi. Hampir semua bagian memiliki detail sekunder.

**R10 Lakar**

- Ulangan 1 (skor 1): Ada tile ikon ber-tint, chip level, dan tombol oranye. Namun kartu program hanya berisi bidang cokelat polos dengan ikon kecil tanpa foto atau ilustrasi matang. Kartu jadwal, kartu ringkasan, dan tab bar sebagian besar netral polos, sehingga polesan hanya ada di sebagian elemen.
- Ulangan 2 (skor 1): Ada lapisan permukaan: tile ikon ber-tint oranye pada item aktif (x≈32, y≈480), header kartu program ber-tint cokelat, dan badge Pemula/Menengah yang terdefinisi. Tetapi visual kartu program hanya bidang gradien kosong dengan ikon kecil (tanpa foto atau gambar), dan tidak ada warna kedua yang bermakna, jadi polesan hanya sebagian.
- Ulangan 3 (skor 1): Ada polesan berupa tile ikon bertint oranye di item jadwal, avatar bertint, chip level, dan tombol oranye. Namun banner kartu program hanya gradien polos dan sebagian besar permukaan adalah kartu netral abu gelap. Visual pendukung (foto/grafik) di seksi program belum matang.

**R9 pen.dev**

- Ulangan 1 (skor 2): Setiap angka diberi target dan satuan (/10.000, /600 kkal, /30 mnt). Jadwal menunjukkan variasi status (selesai, berikutnya, mendatang) dengan metadata jam · durasi · kategori, plus penghitung '1 dari 3 selesai'. Kartu program memiliki badge, durasi, dan level. Titik notifikasi pada lonceng.
- Ulangan 2 (skor 2): Angka diberi target dan satuan, header jadwal memuat progres '1 dari 3 selesai', dan item jadwal punya kategori (Kardio/Pemulihan) serta tiga status berbeda (selesai, aktif, mendatang). Kartu program punya badge, durasi, dan level; lonceng punya titik notifikasi. Padat tetapi terbaca.
- Ulangan 3 (skor 2): Setiap angka punya target dan satuan. Jadwal menunjukkan tiga status (selesai/check, berikutnya/Mulai, akan datang/chevron) dengan jam, durasi, dan kategori. Ada penghitung '1 dari 3 selesai', titik notifikasi di lonceng, serta badge dan metadata durasi/level di kartu program. Padat tetapi tetap terbaca.

**R10 pen.dev**

- Ulangan 1 (skor 2): Permukaan berlapis: kartu oranye penuh, tile ikon ber-tint oranye gelap, pill aktif ber-tint di tab bar, dan lingkaran centang ber-tint. Badge terdefinisi ('PALING POPULER', 'BARU'). Foto kartu program dengan gradien gelap menyatu dengan tema.
- Ulangan 2 (skor 2): Permukaan berlapis: kartu full oranye, tile ikon ber-tint oranye, lingkaran check ber-tint, dan pill tab aktif ber-tint cokelat-oranye. Badge 'PALING POPULER' dan 'BARU' terdefinisi. Foto program menyatu lewat overlay gelap, dan ring tiga nada oranye tampak matang.
- Ulangan 3 (skor 2): Permukaan berlapis: kartu oranye penuh, tile ikon bertint oranye, dan pill aktif bertint di tab 'Beranda'. Ring tiga nuansa oranye selaras dengan titik legenda. Badge berwarna terdefinisi ('BARU' oranye, 'PALING POPULER' gelap). Foto kartu program menyatu dengan gradien gelap.

### Bukti kriteria lain per ulangan

**Lakar**

- R1, ulangan 1 (skor 1): Artboard 390×844 dengan status bar 09:41 dan home indicator di bawah (y≈828). Semua bagian ada: sapaan dan avatar inisial 'RA', ring ringkasan, jadwal, 2 kartu program, dan tab bar 4 item (house, dumbbell, chart-column, user) dengan Beranda aktif oranye. Mode gelap, aksen oranye, bahasa Indonesia. Satu kriteria golden gagal: tombol 'Mulai' pada 'Kekuatan tubuh atas' (y≈490) tidak memiliki ikon play.
- R1, ulangan 2 (skor 1): Artboard 390×844 dengan status bar 09:41 di atas dan home indicator di bawah tab bar. Sapaan, ringkasan dengan ring, jadwal, 2 kartu program, dan tab bar 4 ikon semuanya ada; mode gelap, aksen oranye, bahasa Indonesia. Satu kriteria golden gagal: item jadwal berikutnya 'Kekuatan tubuh atas' (y≈505) memakai tombol 'Mulai' tanpa ikon play, sedangkan item selesai 'Lari pagi 5 km' sudah benar memakai circle-check di kanan.
- R1, ulangan 3 (skor 1): Artboard 390×844 dengan status bar 09:41 dan home indicator di bawah tab bar. Semua bagian ada, mode gelap, aksen oranye, Bahasa Indonesia, dan tab bar 4 ikon dengan 'Beranda' aktif oranye. Satu kriteria golden gagal: tombol 'Mulai' pada item 'Kekuatan tubuh atas' tidak memakai ikon play.
- R2, ulangan 1 (skor 1): Sapaan 'Halo, Rani' tebal dengan tanggal di atas. Namun judul kartu 'Ringkasan hari ini' kecil, dan angka 6.842/380/24 hanya sedikit lebih besar dari label, sehingga kartu ring kurang dominan. Tombol oranye 'Mulai' (y≈470–520) bersaing sebagai titik fokus.
- R2, ulangan 2 (skor 2): Kartu ringkasan (y≈137–323) dengan tiga ring konsentris dan angka tebal 6.842/380/24 menjadi fokus yang jelas. Lompatan skala tegas: sapaan 'Halo, Rani' tebal di atas tanggal kecil, judul seksi 'Jadwal hari ini' dan 'Program untukmu' sekitar 20px, lalu metadata abu kecil. Setiap judul seksi diikuti kontennya, tidak ada judul yatim.
- R2, ulangan 3 (skor 1): Titik fokus ada pada ring di kartu ringkasan. Namun angka legenda (6.842, 380, 24) berukuran sedang, sementara judul seksi 'Jadwal hari ini' dan 'Program untukmu' hampir sebesar sapaan 'Halo, Rani'. Lompatan skala kurang tegas dan fokus bersaing dengan judul-judul seksi.
- R4, ulangan 1 (skor 2): Oranye konsisten untuk aksi (Kalender, Lihat semua, tombol Mulai), tab aktif, ikon status selesai, dan seri ring. Teks 'Mulai' gelap di atas oranye. Teks muted '06:00 · 32 menit · selesai' dan '/ 10.000' terbaca di surface gelap.
- R4, ulangan 2 (skor 2): Oranye dipakai konsisten untuk elemen utama: seri ring, tautan 'Kalender'/'Lihat semua', tombol 'Mulai' dengan teks gelap di atas oranye, ikon check, dan tab aktif 'Beranda'. Warna tambahan hanya tint oranye (oranye muda, krem) untuk membedakan seri ring. Teks muted (/ 10.000, metadata jadwal, label tab nonaktif) masih terbaca di surface gelap.
- R4, ulangan 3 (skor 2): Oranye dipakai konsisten untuk link ('Kalender', 'Lihat semua', 'Rata-rata 71%'), tombol 'Mulai' dengan teks gelap, tab aktif, check selesai, dan seri ring utama. Nuansa oranye/krem pada ring membedakan seri. Teks muted ('/ 10.000', '06:00 · 32 menit · selesai') masih terbaca di surface gelap.
- R5, ulangan 1 (skor 2): Ikon garis satu gaya: jejak kaki, dumbel, sepeda, gelombang, lonceng, dan ikon tab. Ring konsentris dengan ikon api di tengah relevan sebagai visual utama. Tanggal di atas sapaan, avatar inisial di kiri atas, tanpa emoji.
- R5, ulangan 2 (skor 2): Ikon bergaya garis seragam: lonceng, footprints, dumbbell, sepeda, pulse, dan keempat ikon tab. Avatar inisial 'RA' di kiri atas, tanpa emoji. Visual utama berupa ring progres dengan ikon api di tengah, relevan dengan isi.
- R5, ulangan 3 (skor 1): Ikon line seragam (sepatu, dumbbell, sepeda, pulse, tab house/dumbbell/chart/user) dan tanpa emoji. Avatar berupa inisial 'RA' bertint. Visual kartu program lemah: banner hanya bidang gradien cokelat kosong dengan satu ikon kecil di pojok, tanpa foto atau ilustrasi bermakna.
- R6, ulangan 1 (skor 2): Copy spesifik ('Lari pagi 5 km 06:00 · 32 menit · selesai', 'Kardio 21 hari 4×/minggu · 25 mnt'). Nilai/target konsisten: 6.842/10.000, 380/600 kkal, 24/30 mnt. 'Rata-rata 71%' cocok dengan (68+63+80)/3 ≈ 71.
- R6, ulangan 2 (skor 2): Angka konsisten: 6.842/10.000 (68%), 380/600 kkal (63%), dan 24/30 mnt (80%) menghasilkan rata-rata ±71%, cocok dengan label 'Rata-rata 71%' di kanan atas kartu. Busur ring kira-kira sebanding dengan nilainya. Copy spesifik: 'Lari pagi 5 km · 06:00 · 32 menit · selesai', 'Kardio 21 hari 4×/minggu · 25 mnt'.
- R6, ulangan 3 (skor 2): Legenda nilai/target: 6.842/10.000, 380/600 kkal, 24/30 mnt. 'Rata-rata 71%' cocok dengan rata-rata 68%, 63%, dan 80%. Busur terlihat sebanding dengan angka. Copy spesifik, misalnya 'Lari pagi 5 km 06:00 · 32 menit · selesai' dan 'Kardio 21 hari 4×/minggu · 25 mnt'.
- R8, ulangan 1 (skor 1): Tidak ada pelanggaran slop, tetapi kriteria golden kartu program yang bisa dibedakan gagal. 'Kardio 21 hari' dan 'Core & mobilitas' (y≈600–725) memakai area ber-tint cokelat yang sama dan tata letak identik; keduanya hanya berbeda teks chip dan ikon kecil. Tidak ada langkah komposisi khas yang menonjol.
- R8, ulangan 2 (skor 1): Tidak ada pelanggaran checklist slop. Namun dua kartu program (y≈598–730) nyaris identik: header cokelat-gelap yang sama, hanya badge dan ikon kecil yang berbeda (sepeda vs pulse), sehingga kriteria golden 'dua kartu yang bisa dibedakan secara visual' tidak terpenuhi dengan tegas. Keputusan komposisi khas yang bisa ditunjuk: label 'Rata-rata 71%' di header kartu ring dan tab bar mengambang.
- R8, ulangan 3 (skor 1): Tidak ada pelanggaran checklist slop. Namun kriteria golden 5 gagal: dua kartu program (bawah) berstruktur identik (banner gradien, chip level, ikon kecil, judul, metadata) dan hanya beda teks serta ikon, sehingga tidak berbeda secara visual. Juga tidak ada keputusan komposisi khas yang menonjol.

**pen.dev**

- R1, ulangan 1 (skor 1): Artboard 390×844 dengan status bar 9:41 di atas. Semua bagian ada: sapaan dan avatar di kiri atas, ringkasan dengan ring, jadwal 3 item, 2 kartu rekomendasi, dan tab bar 4 item (house, dumbbell, chart-column, user) dengan Beranda aktif berupa pill ber-tint. Mode gelap, aksen oranye, bahasa Indonesia. Item selesai memakai centang dalam lingkaran, dan item berikutnya punya tombol 'Mulai' dengan ikon play. Satu kriteria golden gagal: tidak ada home indicator di bawah tab bar (y≈834–844 kosong).
- R1, ulangan 2 (skor 1): Status bar 9:41 ada dan semua bagian lengkap: sapaan dengan avatar, ringkasan ring, jadwal 3 item (selesai dengan check, berikutnya dengan 'Mulai' berikon play, mendatang dengan chevron), 2 kartu program, dan tab bar 4 item dengan Beranda aktif. Mode gelap, aksen oranye, bahasa Indonesia. Satu kriteria golden gagal: home indicator tidak terlihat di bawah tab bar (y≈776–834), dan bagian bawah kartu program terpotong oleh tab bar.
- R1, ulangan 3 (skor 1): Artboard 390×844 dengan status bar 9:41 di atas. Semua bagian ada: sapaan dan avatar (kiri atas), ringkasan dengan ring (tengah atas), jadwal 3 item (tengah), 2 kartu rekomendasi (bawah), tab bar 4 item. Mode gelap, aksen oranye, Bahasa Indonesia. Satu kriteria golden gagal: tidak ada home indicator di bawah tab bar; area bawah artboard (y≈835–844) kosong.
- R2, ulangan 1 (skor 1): Sapaan 'Selamat pagi, Rina' tebal dengan tanggal kecil di atasnya, dan angka 7.412/372/24 tebal besar dengan target kecil, jadi lompatan skala jelas. Namun kartu jadwal oranye penuh 'Kekuatan tubuh atas' (y≈450–515) bersaing kuat dengan kartu ring ringkasan (y≈155–330) sebagai titik fokus.
- R2, ulangan 2 (skor 1): Ada fokus yang jelas, tetapi dua elemen bersaing: kartu jadwal 'Kekuatan tubuh atas' yang full oranye (y≈465–518) dan ring besar dengan angka 7.412/372/24 (y≈155–330). Jarak antara sapaan 'Selamat pagi, Rina' dan judul 'Ringkasan hari ini' juga terlalu rapat. Judul seksi tidak ada yang yatim.
- R2, ulangan 3 (skor 1): Skala jelas: sapaan 'Selamat pagi, Rina' tebal di kiri atas, angka besar '7.412' di ringkasan, judul seksi sedang, metadata kecil. Namun kartu jadwal 'Kekuatan tubuh atas' yang berlatar oranye penuh (tengah) bersaing kuat dengan ring ringkasan sebagai titik fokus.
- R4, ulangan 1 (skor 2): Oranye dipakai konsisten untuk aksi (Detail, Lihat semua, Mulai), status aktif (tab Beranda, titik notifikasi), dan seri utama ring. Tiga nada oranye/krem pada ring bermakna sebagai seri. Teks di kartu oranye berwarna gelap (~#1A0F05). Tombol Mulai gelap dengan teks oranye. Teks muted '/ 10.000', '07:00 · 30 mnt · Kardio', dan label tab tidak aktif terbaca di surface gelap.
- R4, ulangan 2 (skor 1): Aksen oranye konsisten pada ring, kartu aktif, 'Detail'/'Lihat semua', badge 'BARU', titik notifikasi, dan pill tab aktif. Teks di atas kartu oranye berwarna gelap, sesuai golden. Satu teks lemah: label tab nonaktif 'Latihan', 'Progres', 'Profil' (y≈818) berwarna abu sangat redup, tampak di bawah 4.5:1.
- R4, ulangan 3 (skor 2): Oranye konsisten untuk aksi dan status aktif: link 'Detail' dan 'Lihat semua', kartu sesi berikutnya, tab 'Beranda' aktif, ring langkah. Teks di atas kartu oranye gelap (≈#1A0F05), dan tombol 'Mulai' gelap dengan teks oranye. Turunan oranye pada ring dan legenda membedakan seri. Teks muted ('/ 10.000', metadata jadwal) masih terbaca di surface gelap.
- R5, ulangan 1 (skor 2): Ikon garis satu gaya dengan ukuran seragam: jejak kaki, dumbel, daun, lonceng, api di pusat ring, dan ikon tab. Visual utama relevan: ring tiga konsentris dan foto lari/gym di kartu program. Sapaan memiliki tanggal di atasnya dan avatar foto di kiri atas, tanpa emoji.
- R5, ulangan 2 (skor 2): Ikon garis seragam: footprints, dumbbell, daun, play, chevron, lonceng, dan ikon tab. Avatar ilustrasi di kiri atas, tanpa emoji. Visual utama kuat dan relevan: ring progres dengan ikon api, serta foto pelari dan gym di kartu program.
- R5, ulangan 3 (skor 2): Ikon line seragam di jadwal (sepatu, dumbbell, daun), lonceng, dan tab bar (house, dumbbell, chart-column, user). Tombol 'Mulai' memakai ikon play, item selesai memakai check dalam lingkaran. Ada avatar ilustrasi di kiri atas, foto relevan (lari, gym) di kartu program, dan tanpa emoji.
- R6, ulangan 1 (skor 2): Copy spesifik ('Lari interval pagi 07:00 · 30 mnt · Kardio', 'Lari 5K Pemula 4 minggu · Pemula'). Nilai/target konsisten: 7.412/10.000, 372/600 kkal, 24/30 mnt. Panjang busur ring kira-kira sesuai rasio (≈74%/62%/80%). '1 dari 3 selesai' cocok dengan satu item bercentang.
- R6, ulangan 2 (skor 2): 7.412/10.000 (74%), 372/600 kkal (62%), dan 24/30 mnt (80%) sebanding dengan panjang busur ring. Label '1 dari 3 selesai' cocok dengan satu item yang tercentang dari tiga item jadwal. Copy spesifik: 'Lari interval pagi · Kardio', 'Yoga peregangan · Pemulihan', 'HIIT Bakar Lemak'.
- R6, ulangan 3 (skor 2): Legenda nilai/target: 7.412/10.000, 372/600 kkal, 24/30 mnt. Busur cocok dengan angka: luar ≈74%, tengah ≈62%, dalam ≈80%. Label '1 dari 3 selesai' konsisten dengan satu item yang dicentang. Copy spesifik, misalnya 'Lari interval pagi 07:00 · 30 mnt · Kardio' dan 'HIIT Bakar Lemak 20 mnt · Menengah'.
- R8, ulangan 1 (skor 2): Tidak ada pelanggaran slop. Keputusan komposisi khas: sesi berikutnya ditonjolkan sebagai kartu oranye penuh dengan tombol gelap 'Mulai' (y≈450–515), dibedakan dari item selesai yang diredupkan dan item mendatang ber-chevron. Dua kartu program berbeda secara visual: foto berbeda serta badge 'PALING POPULER' gelap vs 'BARU' oranye.
- R8, ulangan 2 (skor 2): Tidak ada pelanggaran checklist slop. Dua kartu program jelas berbeda karena foto berbeda (pelari vs gym) dan badge berbeda ('PALING POPULER' abu vs 'BARU' oranye). Keputusan komposisi khas: item jadwal berikutnya ditonjolkan sebagai kartu full oranye dengan tombol gelap 'Mulai' (y≈465–518).
- R8, ulangan 3 (skor 2): Tidak ada pelanggaran slop. Langkah khas yang bisa ditunjuk: sesi berikutnya disorot sebagai kartu oranye penuh di tengah daftar jadwal, dan kartu program memakai foto full-bleed dengan badge berbeda ('PALING POPULER' vs 'BARU'). Dua kartu program berbeda secara visual.

### Pemetaan X/Y per ulangan (dibuka setelah penilaian)

| Ulangan | Desain X | Desain Y | Status | Biaya |
|---|---|---|---|---|
| 1 | pen.dev | Lakar | ok | $0.18 |
| 2 | Lakar | pen.dev | ok | $0.18 |
| 3 | pen.dev | Lakar | ok | $0.16 |

## Biaya

Biaya juri total: $1.60 (A $1.08, B $0.52). Tidak ada biaya agen desain.
