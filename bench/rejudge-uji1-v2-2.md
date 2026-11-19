# Penilaian ulang juri `uji1-v2-2` (sumber: putaran uji-1)

Status: **lengkap**. Tanggal: 2026-11-18T06:59:15.402Z.

Strip PNG putaran sumber dinilai ulang dengan rubrik juri saat ini. Tidak ada agen desain yang dijalankan: status run dan gerbang Lakar diambil dari laporan sumber. Keputusan di bawah adalah keluaran juri dan aturan keputusan, menunggu tinjauan Adam.

## Sumber dan versi

- Sumber: `bench/round-uji-1.json` (keputusan Adam dari `bench/round-uji-1.md`)
- Strip A: Lakar `bench/runs/rounds/uji-1/A-lakar.png`, pen.dev `bench/runs/rounds/uji-1/A-pendev.png`
- Strip B: Lakar `bench/runs/rounds/uji-1/B-lakar.png`, pen.dev `bench/runs/rounds/uji-1/B-pendev.png`
- Model juri: `claude-opus-5-5`; Claude Code: 2.1.325 (Claude Code); git HEAD: `9ee43d45187cefdceb74865cb7c301ccd53e1387`
- Versi rubrik: 2.1 (`bench/rubric/rubric.json`: versi 2.1, sama)
- sha256 teks juri A: `f6d68640c1d174c57b4604087d7bd495cceb538236aa22a074f8033466d6faad`
- sha256 teks juri B: `7c1727857d1061128aa17673ce7a751093860f2009fe3867c276708b6ba2545e`
- Argv juri: `claude -p --input-format stream-json --output-format stream-json --verbose --model claude-opus-5-5 --tools "" --strict-mcp-config --mcp-config bench/runs/rejudge/uji1-v2-2/mcp-empty.json --disable-slash-commands --no-session-persistence`
- Artefak mentah (gitignored): `bench/runs/rejudge/uji1-v2-2/` (teks juri, pemetaan X/Y, transkrip per ulangan)

## Ringkasan

| Prompt | T Lakar (maks 16) | T pen.dev | D Lakar (maks 4) | D pen.dev | Keputusan v2.1 | Keputusan sumber | Keputusan Adam | Pelanggaran brief pen.dev |
|---|---|---|---|---|---|---|---|---|
| A | 15 | 10 | 3 | 3 | **Lebih baik** | Lebih baik (T 10 vs 6) | – | tidak ada |
| B | 12 | 12 | 3 | 3 | **Setara** | Setara (T 8 vs 8) | – | tidak ada |

## Kalibrasi

putaran uji-1 = hold-out; hanya dilaporkan (tanpa ambang lulus).
- R9/R10 dengan rentang > 1 (ditandai untuk Adam, tidak menggagalkan): tidak ada

## Prompt A

- Gerbang Lakar (dari sumber): lolos
- Brief mengikat pen.dev (ukuran frame): sesuai
- Keputusan v2.1: **Lebih baik**. Alasan: lolos gerbang, total 15 ≥ 10 + 3, daya tarik 3 ≥ 3.
- Kalah-daya-tarik: tidak ada; Kalah-lain: tidak ada; R Lakar 0 vs pen.dev 2: tidak ada
- Pelanggaran brief pen.dev: tidak ada
- Keputusan sumber: Lebih baik (lolos gerbang, total 10 ≥ 6 + 2); keputusan Adam: –

### Skor (ulangan valid 3 dari 3)

| Kriteria | Alat | Ulangan 1 | Ulangan 2 | Ulangan 3 | Median (rentang) |
|---|---|---|---|---|---|
| R1 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R1 | pen.dev | 1 | 2 | 1 | 1 (rentang 1) |
| R2 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R2 | pen.dev | 1 | 1 | 2 | 1 (rentang 1) |
| R4 | Lakar | 2 | 1 | 2 | 2 (rentang 1) |
| R4 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R5 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R5 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R6 | Lakar | 1 | 2 | 2 | 2 (rentang 1) |
| R6 | pen.dev | 2 | 2 | 1 | 2 (rentang 1) |
| R8 | Lakar | 1 | 2 | 2 | 2 (rentang 1) |
| R8 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R9 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R9 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R10 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R10 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| **T** | Lakar |  |  |  | **15** |
| **T** | pen.dev |  |  |  | **10** |
| **D = R9 + R10** | Lakar |  |  |  | **3** |
| **D = R9 + R10** | pen.dev |  |  |  | **3** |
| Slop | Lakar |  |  |  | 0 (rentang 0) |
| Slop | pen.dev |  |  |  | 1 (rentang 0) |

### Bukti R9/R10 per ulangan

**R9 Lakar**

- Ulangan 1 (skor 2): KPI diberi pembanding ('+12,4% dari Oktober'); mockup memuat metadata 'Diperbarui 17.42 WIB · 3 kasir aktif' dan rentang '1–18 Nov 2026'; transaksi punya jam dan arah. Kartu fitur memiliki baris hasil hijau ('Lunas rata-rata 9 hari lebih cepat', 'Peringatan di bawah 10 unit'). Rating diberi konteks '4,8 dari 1.932 ulasan di Play Store', testimoni memuat metrik '6 jam dihemat tiap minggu', dan pricing memiliki footnote PPN/tahunan.
- Ulangan 2 (skor 2): Konteks kaya: 'Diperbarui 17.42 WIB · 3 kasir aktif', rentang '1–18 Nov 2026', delta 'dari Oktober', jam pada transaksi, metrik di fitur ('Lunas rata-rata 9 hari lebih cepat', 'Peringatan di bawah 10 unit'), testimoni dengan angka (Rp 7,4 jt → Rp 2,1 jt; KUR Rp 50 jt), dan catatan pricing (PPN, gratis 2 bulan untuk tahunan).
- Ulangan 3 (skor 2): Angka diberi konteks: tren dengan periode ('+12,4% dari Oktober'), 'Diperbarui 17.42 WIB · 3 kasir aktif', rentang tanggal '1–18 Nov 2026', serta transaksi dengan jam dan arah masuk/keluar (bagian 1). Kartu fitur punya metrik hasil ('Lunas rata-rata 9 hari lebih cepat', 'Peringatan di bawah 10 unit'). Rating '4,8 dari 1.932 ulasan di Play Store'. Ada catatan PPN dan diskon tahunan di bawah pricing. Padat tetapi tetap terbaca.

**R10 Lakar**

- Ulangan 1 (skor 1): Permukaan berlapis sudah ada: hero gradien tint hijau, seksi testimoni gelap, kartu fitur besar abu ber-tint, kartu 'Laba bersih' ber-tint hijau, chip 'Baru' dan 'Paling populer'. Namun belum ada warna kedua bermakna yang dipakai lintas seksi: oranye hanya muncul di KPI mockup dan kuning hanya di bintang testimoni.
- Ulangan 2 (skor 1): Ada hero ber-tint hijau, kartu Laba bersih ber-tint dengan border hijau, wadah ikon ber-tint, dan kartu pricing tengah hijau gelap. Namun seksi testimoni gelap bernuansa netral (bukan tint warna utama), dan warna kedua bermakna hanya muncul terbatas (oranye di satu KPI mockup, kuning di bintang). Badge berwarna juga sedikit ('Baru', 'Paling populer').
- Ulangan 3 (skor 1): Permukaan berlapis ada: hero ber-tint hijau, kartu fitur abu, testimoni gelap, kartu pricing hijau tua. Badge berwarna ada ('Baru: laporan pajak…', 'Paling populer'). Namun warna kedua yang bermakna tidak dipakai lintas seksi: oranye hanya di mockup hero dan kuning hanya di rating testimoni.

**R9 pen.dev**

- Ulangan 1 (skor 2): KPI mockup diberi tren persen; transaksi punya metadata ('Hari ini · Tunai', 'Kemarin · QRIS') dan tanda +/−; grafik 6 bulan memiliki legenda. Kartu fitur memiliki sub-checklist. Testimoni utama memuat metrik '16 jam dihemat setiap bulan'. Statistik diberi satuan ('transaksi tercatat / bulan'), dan pricing menyertakan deskripsi target tiap tier.
- Ulangan 2 (skor 2): Angka diberi konteks: KPI mockup dengan chip delta, periode 'Nov 2026', transaksi dengan metadata 'Hari ini · Tunai' / 'Kemarin · QRIS', chart 6 bulan dengan legenda. Kartu fitur punya sub-bullet ber-check. Testimoni utama memuat metrik hasil. Tiap tier punya deskripsi segmen. Satuan statistik jelas ('transaksi tercatat / bulan'). Padat tetapi terbaca.
- Ulangan 3 (skor 2): Transaksi mockup dilengkapi metadata waktu dan metode ('Hari ini · Tunai', 'Kemarin · QRIS', bagian 2). Kartu KPI diberi badge persentase, dan ada kartu Saldo Kas tambahan. Kartu fitur dilengkapi sub-checklist ('Format standar SAK EMKM'). Testimoni utama memuat metrik '16 jam dihemat'. Strip statistik memakai satuan. Detail sekunder ada di hampir semua seksi.

**R10 pen.dev**

- Ulangan 1 (skor 1): Permukaan berlapis sudah ada: hero ber-tint hijau, seksi testimoni hijau gelap, banner CTA hijau penuh, kartu fitur ber-tint, serta chip 'Baru', 'Paling Populer' dan pill persen. Namun belum ada warna kedua bermakna yang dipakai lintas seksi: merah hanya muncul di pill mockup dan kuning hanya di bintang testimoni.
- Ulangan 2 (skor 1): Permukaan berlapis ada: hero ber-tint hijau, seksi testimoni hijau gelap, banner CTA hijau. Badge/chip juga ada ('Baru', 'Paling Populer', chip delta). Namun warna kedua bermakna tidak konsisten lintas bagian: merah hanya di satu chip mockup, kuning hanya di bintang testimoni.
- Ulangan 3 (skor 1): Permukaan berlapis ada: hero ber-tint hijau, bingkai mockup hijau muda, testimoni hijau gelap, banner CTA hijau. Chip berwarna terdefinisi ada ('Baru', badge persentase KPI, 'Paling Populer'). Namun warna kedua yang bermakna (merah badge pengeluaran, kuning bintang) masing-masing hanya muncul di satu seksi, tidak konsisten lintas seksi.

### Bukti kriteria lain per ulangan

**Lakar**

- R1, ulangan 1 (skor 2): Navbar, hero (badge, headline, subjudul, 2 CTA, mockup dashboard), fitur 3 kartu dalam layout bento, testimoni gelap, pricing 3 tier dengan tengah ditonjolkan, dan footer hadir berurutan tanpa seksi ekstra. Lebar desktop, aksen hijau, berbahasa Indonesia.
- R1, ulangan 2 (skor 2): Bagian lengkap dan berurutan: navbar (bagian 1), hero dengan headline, subjudul, 2 CTA dan mockup dashboard (bagian 1–2), 3 kartu fitur dalam layout bento (bagian 2), testimoni gelap (bagian 3), pricing 3 tier (bagian 3–4), footer (bagian 4–5). Lebar 1440, aksen hijau, seluruh copy berbahasa Indonesia.
- R1, ulangan 3 (skor 2): Urutan seksi lengkap dan benar: navbar (bagian 1 atas); hero dengan headline, subjudul, CTA 'Coba gratis 14 hari' + 'Lihat demo 2 menit' dan mockup dashboard 'Ringkasan November 2026' (bagian 1–2); 3 kartu fitur dalam susunan bento (bagian 2); testimoni (bagian 3); pricing 3 tier Mulai/Usaha/Cabang (bagian 3–4); footer (bagian 4–5). Lebar 1440px, mode terang dengan seksi gelap, aksen hijau, seluruh copy berbahasa Indonesia. Tidak ada seksi ekstra.
- R2, ulangan 1 (skor 2): Headline hero 2 baris display 'Tahu untung bersih usahamu setiap sore, tanpa buka Excel' (bagian 1) berisi klaim hasil tanpa kata yatim, dengan lompatan skala tegas ke subjudul. CTA 'Coba gratis 14 hari' hijau primer + 'Lihat demo 2 menit' outline. Judul seksi tidak menyisakan kata tunggal.
- R2, ulangan 2 (skor 2): Satu fokus tegas: headline hero 'Tahu untung bersih usahamu setiap sore, tanpa buka Excel' (2 baris, display, klaim hasil, tanpa kata yatim). Lompatan skala tegas ke H2 seksi. CTA primer hijau 'Coba gratis 14 hari' dan sekunder outline 'Lihat demo 2 menit'. Tidak ada judul yatim.
- R2, ulangan 3 (skor 2): Satu titik fokus jelas: headline display 2 baris 'Tahu untung bersih usahamu setiap sore, tanpa buka Excel' (bagian 1, tengah). Headline berupa klaim hasil dan tidak yatim. Lompatan skala tegas ke H2 seksi ('Pembukuan rapi tanpa perlu paham akuntansi', bagian 2) lalu ke body. CTA primer hijau solid dan CTA sekunder outline. Tidak ada judul yatim.
- R4, ulangan 1 (skor 2): Hijau dipakai konsisten untuk tombol, seri 'Masuk', nilai positif dan kartu Laba bersih yang di-highlight. Oranye pada '+3,1% dari Oktober' Pengeluaran bermakna arah biaya; abu untuk seri 'Keluar'; kuning untuk bintang rating. Ritme terang → gelap (testimoni) → terang (pricing). Teks meta di seksi gelap dan footnote PPN tetap terbaca.
- R4, ulangan 2 (skor 1): Hijau dipakai konsisten untuk aksi, KPI laba aktif, chart dan eyebrow, dengan teks putih pada tombol hijau di navbar dan hero. Oranye pada '+3,1% dari Oktober' Pengeluaran bermakna arah perubahan. Ritme terang/gelap ada: hero tint, fitur putih, testimoni gelap, pricing abu terang. Golden gagal: CTA tier tengah 'Coba gratis 14 hari' (bagian 4) memakai hijau terang dengan teks gelap, bukan #FFFFFF.
- R4, ulangan 3 (skor 2): Hijau tua (≈#15803D) dipakai konsisten untuk tombol primer, item nav aktif mockup, seri 'Masuk' grafik, dan check pricing. Teks/ikon di atas hijau berwarna putih. Warna tambahan bermakna: oranye untuk tren pengeluaran '+3,1% dari Oktober' (bagian 1) dan kuning untuk bintang rating (bagian 3). Ritme terang/gelap jelas: hero ber-tint hijau → fitur putih → testimoni gelap → pricing abu terang → footer putih. Tidak terlihat teks yang gagal kontras.
- R5, ulangan 1 (skor 2): Ikon bergaya Lucide seragam: bar-chart, message-circle dan package dalam wadah kotak ber-tint sama (bagian 2); ikon sidebar mockup, check pricing, ikon kutip hijau dan sparkles di badge konsisten. Mockup dashboard relevan dan dibangun dari teks/shape nyata. Tidak ada emoji.
- R5, ulangan 2 (skor 2): Ikon Lucide line seragam: sidebar mockup, panah transaksi, ikon fitur bar-chart/message-circle/package dalam wadah persegi ber-tint seragam (bagian 2), check di pricing, star di testimoni. Mockup relevan dan dibangun dari teks nyata. Tidak ada emoji, termasuk di header mockup 'Toko Bu Ratna'.
- R5, ulangan 3 (skor 2): Ikon fitur bergaya Lucide (bar-chart, message-circle, package) dalam wadah kotak ber-tint hijau yang seragam (bagian 2). Ikon sidebar mockup, check, star, dan ikon sosial footer memakai satu gaya garis. Visual utama berupa mockup dashboard yang relevan. Tidak ada emoji, termasuk di mockup ('Toko Bu Ratna').
- R6, ulangan 1 (skor 1): Angka konsisten: Rp 48,2 jt − Rp 31,7 jt = Rp 16,5 jt, dan tabel laba rugi di kartu fitur (48.200.000 − 22.900.000 − 8.800.000 = 16.500.000) cocok. Testimoni memuat nama + usaha + kota (Semarang, Garut, Medan) dan ada ikon bintang. Satu inkonsistensi: KPI Pengeluaran '+3,1% dari Oktober' memakai ikon panah trending-down padahal nilainya naik (bagian 1).
- R6, ulangan 2 (skor 2): Mockup konsisten: Rp 48,2 jt − Rp 31,7 jt = Rp 16,5 jt (bagian 1). Tabel laba rugi di fitur cocok: 48.200.000 − 22.900.000 − 8.800.000 = 16.500.000. Testimoni lengkap dengan nama, usaha dan kota (Ratna Wulandari – Katering Dapur Bu Ratna · Semarang; Dedi Kurniawan – Garut; Maria Sitanggang – Medan), dengan rating ikon star '4,8 dari 1.932 ulasan'. Tier tengah Rp 79.000 / bulan. Copy spesifik (KUR, HPP, H-1 jatuh tempo).
- R6, ulangan 3 (skor 2): Mockup dibangun dari shape/teks nyata: Pemasukan Rp 48,2 jt − Pengeluaran Rp 31,7 jt = Laba Rp 16,5 jt (bagian 1). Angka konsisten dengan tabel di kartu fitur: 48,2 jt − 22,9 jt − 8,8 jt = 16,5 jt, dan 22,9 + 8,8 = 31,7 (bagian 2). Testimoni lengkap nama, usaha, dan kota ('Dedi Kurniawan, Toko Kelontong Berkah · Garut', bagian 3). Rating memakai ikon star. Copy spesifik ('KUR Rp 50 jt', 'H-1 jatuh tempo').
- R8, ulangan 1 (skor 1): Tidak ada pelanggaran slop. Ada langkah khas berupa fitur bento dengan kartu besar berisi tabel laba rugi nyata (bagian 2). Tier 'Usaha' ditonjolkan dengan latar gelap + badge 'Paling populer', CTA primer, tier lain outline, fitur memakai check. Namun golden 6 gagal: harga ditulis 'Rp 79.000 / bulan', bukan 'Rp 79rb/bulan' (bagian 4).
- R8, ulangan 2 (skor 2): Tidak ada pelanggaran slop: angka spesifik ('Dipakai 12.846 UMKM'), latar abu dingin, rata kiri dominan, tanpa frasa terlarang. Tier tengah ditonjolkan dengan latar hijau gelap, badge 'Paling populer', CTA primer, tier lain outline, dan fitur ber-check. Ada langkah khas: kartu fitur bento besar yang menanam tabel laba rugi nyata (bagian 2) dan rating agregat di kanan heading testimoni.
- R8, ulangan 3 (skor 2): Tier tengah 'Usaha' ditonjolkan dengan satu cara utama (isi hijau gelap) ditambah badge 'Paling populer'. CTA tier tengah primer, dua tier lain outline sekunder. Harga Rp 79.000 / bulan setara Rp 79rb/bulan. Semua fitur memakai check (bagian 4). Tidak ada pelanggaran slop. Keputusan komposisi khas yang bisa ditunjuk: kartu fitur bento besar berisi tabel laba rugi nyata (bagian 2), dan testimoni utama besar dengan metrik '6 jam dihemat tiap minggu' (bagian 3).

**pen.dev**

- R1, ulangan 1 (skor 1): Navbar, hero, mockup, 3 kartu fitur, testimoni (seksi gelap), pricing, CTA penutup hijau dan footer hadir berurutan. Ada satu seksi ekstra di luar aturan: strip statistik di bawah mockup ('25.000+ UMKM aktif', 'Rp4,8 T', '4,9/5', '2 menit') di bagian 2 atas.
- R1, ulangan 2 (skor 2): Bagian lengkap dan berurutan: navbar (bagian 1 atas), hero dengan headline, subjudul, 2 CTA dan mockup dashboard (bagian 1–2), 3 kartu fitur (bagian 2–3), testimoni (bagian 3–4), pricing 3 tier (bagian 4–5), CTA penutup opsional dan footer (bagian 5–6). Strip statistik di bawah mockup menempel pada hero sebagai bukti sosial, bukan seksi terpisah. Lebar 1440, aksen hijau, seluruh copy berbahasa Indonesia.
- R1, ulangan 3 (skor 1): Semua bagian wajib hadir berurutan: navbar, hero + mockup, 3 kartu fitur, testimoni, pricing, footer. CTA penutup hijau (bagian 5) termasuk opsional. Ada satu seksi ekstra di luar aturan: strip statistik '25.000+ / Rp4,8 T / 4,9/5 / 2 menit' di bawah hero (bagian 2 atas).
- R2, ulangan 1 (skor 1): Headline hero 3 baris display ('Pembukuan rapi, usaha tenang. Fokus jualan, biar Kasku yang mencatat.') berisi klaim hasil dan tidak yatim. CTA primer hijau 'Mulai Gratis 30 Hari' + sekunder outline 'Lihat Demo'. Namun judul CTA penutup 'Siap merapikan keuangan usaha / Anda?' (bagian 5) menyisakan satu kata yatim 'Anda?' di baris kedua.
- R2, ulangan 2 (skor 1): Fokus jelas pada headline hero 'Pembukuan rapi, usaha tenang…' (3 baris, display, klaim hasil). CTA primer hijau 'Mulai Gratis 30 Hari' dan sekunder outline 'Lihat Demo' sesuai golden. Namun judul banner CTA penutup 'Siap merapikan keuangan usaha / Anda?' (bagian 5) menyisakan satu kata yatim 'Anda?' di baris kedua.
- R2, ulangan 3 (skor 2): Fokus tunggal: headline display 3 baris 'Pembukuan rapi, usaha tenang. Fokus jualan, biar Kasku yang mencatat.' (bagian 1). Headline ≤ 3 baris, berupa klaim hasil, dan tidak yatim. Lompatan skala tegas ke H2 seksi. CTA primer hijau 'Mulai Gratis 30 Hari' dan CTA sekunder outline 'Lihat Demo'. Tidak ada judul yatim.
- R4, ulangan 1 (skor 1): Hijau tua dipakai konsisten untuk tombol, ikon fitur, batang 'Masuk' dan badge positif. Merah pada pill '+3,1%' Pengeluaran bermakna; kuning bintang untuk rating. Ritme terang/gelap ada (hero tint → putih → testimoni gelap → pricing terang). Satu teks lemah: keterangan abu redup 'dihemat setiap bulan' dan meta 'Pemilik Lapis Bu Sari, Surabaya' di kartu testimoni besar (bagian 3–4) kontrasnya rendah di atas hijau gelap.
- R4, ulangan 2 (skor 1): Hijau tua konsisten untuk aksi, logo, chart dan eyebrow. Merah pada '+3,1%' Pengeluaran bermakna arah perubahan, dan bintang kuning bermakna rating. Ritme terang/gelap ada: hero ber-tint, testimoni hijau gelap, pricing terang, banner hijau. Golden gagal: CTA tier tengah 'Coba Gratis 30 Hari' (bagian 4) memakai hijau terang dengan teks gelap, bukan teks #FFFFFF di atas aksen.
- R4, ulangan 3 (skor 1): Hijau dipakai konsisten untuk aksi, nav aktif, dan seri grafik. Teks di atas hijau putih. Merah di badge '+3,1%' pengeluaran bermakna (arah perubahan). Ritme terang/gelap jelas: testimoni hijau gelap, CTA banner hijau. Ada satu teks lemah: peran/kota dan 'dihemat setiap bulan' berwarna hijau keabu-abuan redup di atas hijau gelap (bagian 3 bawah / bagian 4 atas).
- R5, ulangan 1 (skor 1): Ikon fitur bergaya Lucide (zap, pie-chart, boxes) dalam wadah kotak hijau seragam (bagian 2), dan ikon sidebar/transaksi mockup konsisten. Golden 4 gagal: ada emoji 👋 di sapaan mockup 'Halo, Toko Bu Sari' (bagian 1 bawah).
- R5, ulangan 2 (skor 1): Ikon Lucide line seragam: sidebar mockup, ikon fitur zap/pie-chart/boxes dalam wadah persegi hijau seragam (bagian 2), check, star, dan sosial footer. Visual utama mockup relevan. Ada 1 emoji dekoratif 👋 di sapaan mockup 'Halo, Toko Bu Sari' (bagian 1), yang melanggar golden.
- R5, ulangan 3 (skor 1): Ikon fitur Lucide (zap, pie-chart, boxes) dalam kotak hijau solid yang seragam (bagian 2), dan ikon transaksi/sidebar bergaya konsisten. Namun ada 1 emoji dekoratif 👋 pada sapaan mockup 'Halo, Toko Bu Sari' (bagian 1). Kriteria golden secara eksplisit melarang emoji di sapaan.
- R6, ulangan 1 (skor 2): Kartu KPI mockup: Pemasukan Rp48,2 jt − Pengeluaran Rp21,7 jt = Laba Bersih Rp26,5 jt (benar). Testimoni lengkap nama + usaha + kota (Sari Rahayu – Lapis Bu Sari, Surabaya; Dimas Pratama – Kopi Senja, Yogyakarta; Ayu Nirmala – Batik Ayu Store, Pekalongan), rating memakai ikon bintang. Copy spesifik (SAK EMKM, KUR, QRIS, GoFood). Trial 30 hari konsisten antara hero dan pricing.
- R6, ulangan 2 (skor 2): Angka mockup konsisten: Pemasukan Rp48,2 jt − Pengeluaran Rp21,7 jt = Laba Bersih Rp26,5 jt (bagian 1). Testimoni lengkap dengan nama, usaha dan kota (Sari Rahayu – Lapis Bu Sari, Surabaya; Dimas Pratama – Kopi Senja, Yogyakarta; Ayu Nirmala – Batik Ayu Store, Pekalongan), dengan rating ikon star. Tier tengah Rp79rb/bulan. Copy spesifik: SAK EMKM, KUR, QRIS, Tokopedia & Shopee.
- R6, ulangan 3 (skor 1): Persamaan mockup benar: Rp48,2 jt − Rp21,7 jt = Rp26,5 jt (bagian 1). Testimoni lengkap nama, usaha, dan kota ('Dimas Pratama, Kopi Senja, Yogyakarta'), dengan rating ikon star. Ada satu inkonsistensi istilah: judul kartu 'Stok & hutang terkendali', padahal isinya membahas penagihan 'piutang via WhatsApp' (bagian 2–3).
- R8, ulangan 1 (skor 1): Golden 6 terpenuhi: tier 'Bisnis' ditonjolkan dengan latar gelap + badge 'Paling Populer', CTA hijau primer sementara tier lain outline, harga 'Rp79rb /bulan', fitur memakai ikon check. Ada langkah khas: testimoni asimetris dengan kutipan besar + metrik '16 jam'. Namun ada 1 pelanggaran slop: statistik bulat berlebihan '25.000+ UMKM aktif' / 'Rp4,8 T' yang tidak diberikan prompt.
- R8, ulangan 2 (skor 1): Tier tengah ditonjolkan dengan latar gelap terangkat, badge 'Paling Populer', CTA primer, tier lain outline, dan fitur ber-check, sesuai golden. Ada langkah khas: grid testimoni asimetris (kutipan besar + metrik '16 jam dihemat setiap bulan') dan kartu pricing bertangga. Ada 1 pelanggaran slop: statistik bulat yang tidak diminta prompt di strip bawah hero.
- R8, ulangan 3 (skor 1): Tier 'Bisnis' memakai isi hijau gelap + badge 'Paling Populer', harga 'Rp79rb /bulan', CTA tengah primer dengan tier lain outline, dan check pada fitur (bagian 4–5). Ada 1 pelanggaran slop: statistik bulat/berlebihan yang tidak diberikan prompt ('25.000+ UMKM aktif', 'Rp4,8 T transaksi tercatat / bulan', bagian 2).

### Pemetaan X/Y per ulangan (dibuka setelah penilaian)

| Ulangan | Desain X | Desain Y | Status | Biaya |
|---|---|---|---|---|
| 1 | pen.dev | Lakar | ok | $0.35 |
| 2 | pen.dev | Lakar | ok | $0.33 |
| 3 | Lakar | pen.dev | ok | $0.36 |

## Prompt B

- Gerbang Lakar (dari sumber): lolos
- Brief mengikat pen.dev (ukuran frame): sesuai
- Keputusan v2.1: **Setara**. Alasan: lolos gerbang, total 12 vs 12, daya tarik 3 vs 3, tanpa alasan Kalah.
- Kalah-daya-tarik: tidak ada; Kalah-lain: tidak ada; R Lakar 0 vs pen.dev 2: tidak ada
- Pelanggaran brief pen.dev: tidak ada
- Keputusan sumber: Setara (lolos gerbang, total 8 ≥ 8 − 1, tanpa R Lakar 0 vs pen.dev 2); keputusan Adam: –

### Skor (ulangan valid 3 dari 3)

| Kriteria | Alat | Ulangan 1 | Ulangan 2 | Ulangan 3 | Median (rentang) |
|---|---|---|---|---|---|
| R1 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R1 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R2 | Lakar | 1 | 2 | 1 | 1 (rentang 1) |
| R2 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R4 | Lakar | 2 | 1 | 2 | 2 (rentang 1) |
| R4 | pen.dev | 2 | 1 | 1 | 1 (rentang 1) |
| R5 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R5 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R6 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R6 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R8 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R8 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R9 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R9 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R10 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R10 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| **T** | Lakar |  |  |  | **12** |
| **T** | pen.dev |  |  |  | **12** |
| **D = R9 + R10** | Lakar |  |  |  | **3** |
| **D = R9 + R10** | pen.dev |  |  |  | **3** |
| Slop | Lakar |  |  |  | 0 (rentang 0) |
| Slop | pen.dev |  |  |  | 0 (rentang 0) |

### Bukti R9/R10 per ulangan

**R9 Lakar**

- Ulangan 1 (skor 2): Angka diberi target, satuan, dan agregat 'Rata-rata 71%'. Jadwal memuat jam, durasi, jarak, jumlah gerakan, dan status selesai versus berikutnya. Kartu program memuat chip level 'Pemula' dan 'Menengah' serta frekuensi dan durasi. Tautan 'Kalender' tersedia.
- Ulangan 2 (skor 2): Angka diberi target dan satuan (/10.000, /600 kkal, /30 mnt) plus 'Rata-rata 71%'. Item jadwal memuat jam, durasi, dan status ('selesai' vs '6 gerakan' + Mulai). Kartu program memuat badge level 'Pemula'/'Menengah' dan frekuensi. Padat tapi tetap terbaca.
- Ulangan 3 (skor 2): Setiap angka punya target dan satuan ('/ 600 kkal', '/ 30 mnt') ditambah rata-rata 71%. Item jadwal memuat jam, durasi, dan status ('selesai', '6 gerakan'). Kartu program memuat level (Pemula/Menengah) dan frekuensi. Tata letak padat namun tetap terbaca.

**R10 Lakar**

- Ulangan 1 (skor 1): Ada tile ikon ber-tint oranye, banner program ber-tint coklat-oranye, dan chip level. Namun permukaan sebagian besar netral polos, banner program hanya gradasi tanpa visual matang, dan tidak ada warna kedua yang bermakna di luar oranye.
- Ulangan 2 (skor 1): Ada thumbnail program ber-tint oranye gelap dan badge level. Namun kartu jadwal dan ringkasan berwarna netral abu gelap polos. Tidak ada warna kedua yang bermakna; seluruhnya varian oranye. Visual program hanya ikon kecil di bidang kosong.
- Ulangan 3 (skor 1): Ada tint coklat-oranye di header kartu program dan di latar ikon dumbbell jadwal, serta badge level. Namun tidak ada warna kedua bermakna selain nuansa oranye di atas netral, dan visual program hanya berupa ikon kecil di atas bidang gradien yang kosong.

**R9 pen.dev**

- Ulangan 1 (skor 2): Angka diberi target dan satuan. Jadwal memuat jam, durasi, kategori, dan jumlah gerakan dengan variasi status selesai, berikutnya, dan akan datang. Ada penghitung '1 dari 3 selesai', badge di kartu program, metadata '4 minggu · Pemula' dan '20 mnt · Menengah', serta titik notifikasi pada lonceng.
- Ulangan 2 (skor 2): Angka diberi target dan satuan. Jadwal menampilkan tiga status (selesai/check, berikutnya/Mulai, mendatang/chevron), kategori ('Kardio', 'Pemulihan'), jam, dan durasi. Header seksi memuat progres '1 dari 3 selesai'. Kartu program memuat badge, durasi, dan level. Ada dot notifikasi pada bel.
- Ulangan 3 (skor 2): Angka disertai target dan satuan. Jadwal memuat status progres '1 dari 3 selesai' dan variasi status: selesai, aktif, dan mendatang dengan chevron. Item punya kategori ('Kardio', 'Pemulihan'). Ada badge program, metadata durasi dan level, serta titik notifikasi di lonceng.

**R10 pen.dev**

- Ulangan 1 (skor 1): Permukaannya berlapis: kartu abu gelap, tile ikon ber-tint oranye, dan kartu oranye penuh. Ada badge berwarna dan foto yang menyatu. Namun tidak ada warna kedua yang bermakna; seluruh warna hanya nuansa oranye di atas netral.
- Ulangan 2 (skor 1): Ada permukaan berlapis: kartu oranye penuh, latar ikon ber-tint oranye gelap, lingkaran check ber-tint, dan foto program dengan overlay. Badge berwarna terdefinisi dengan jelas. Namun tidak ada warna kedua yang bermakna selain keluarga oranye dan netral.
- Ulangan 3 (skor 1): Permukaan berlapis hadir: kartu oranye, latar ikon ber-tint, foto dengan overlay, badge berwarna, dan tab aktif dengan pill coklat. Namun tidak ada warna kedua bermakna di luar nuansa oranye dan netral.

### Bukti kriteria lain per ulangan

**Lakar**

- R1, ulangan 1 (skor 1): Artboard 390×844, status bar '09:41', dan home indicator putih di bawah tab bar. Mode gelap, aksen oranye, bahasa Indonesia, semua seksi ada. Satu kriteria golden gagal: tombol 'Mulai' pada 'Kekuatan tubuh atas' (kanan, y≈490) tanpa ikon play. Item selesai sudah memakai ikon centang dalam lingkaran. Tab bar 4 item dengan tab aktif 'Beranda' oranye.
- R1, ulangan 2 (skor 1): Artboard 390×844 dengan status bar 09:41 di atas dan home indicator di bawah. Semua bagian ada: sapaan + avatar 'RA', kartu 'Ringkasan hari ini', 'Jadwal hari ini' 2 item, 'Program untukmu' 2 kartu, dan tab bar 4 item (Beranda aktif oranye). Mode gelap, aksen oranye, Bahasa Indonesia. Satu kriteria golden gagal: tombol 'Mulai' di item 'Kekuatan tubuh atas' (tengah) tidak punya ikon play.
- R1, ulangan 3 (skor 1): Artboard 390×844 dengan status bar 09:41 (atas) dan home indicator (bawah). Semua seksi ada: sapaan, ringkasan dengan ring, jadwal, 2 kartu program, tab bar 4 item (Beranda aktif oranye). Mode gelap, aksen oranye, bahasa Indonesia. Satu kriteria golden gagal: tombol 'Mulai' pada item 'Kekuatan tubuh atas' (tengah) tidak memiliki ikon play.
- R2, ulangan 1 (skor 1): Fokus pada kartu ring 'Ringkasan hari ini' (y≈137–322). Angka metrik ('6.842', '380', '24') kecil, setara teks label. Judul seksi 'Jadwal hari ini' dan 'Program untukmu' berukuran hampir sama dengan sapaan 'Halo, Rani', sehingga lompatan skala kurang tegas dan fokus bersaing dengan judul seksi.
- R2, ulangan 2 (skor 2): Fokus tunggal pada ring konsentris oranye di kartu ringkasan (kiri atas). Ada lompatan skala yang tegas: sapaan 'Halo, Rani' tebal besar, judul seksi ±20px, angka '6.842' tebal, lalu metadata kecil abu. Setiap judul seksi diikuti kontennya.
- R2, ulangan 3 (skor 1): Ring tiga lapis di kartu 'Ringkasan hari ini' (atas) menjadi fokus. Namun sapaan 'Halo, Rani' (~22px) hampir sama besar dengan judul seksi 'Jadwal hari ini' dan 'Program untukmu' (~20px), sehingga lompatan skala tidak tegas dan judul bersaing dengan fokus.
- R4, ulangan 1 (skor 2): Oranye konsisten untuk aksi dan status: 'Rata-rata 71%', 'Kalender', 'Lihat semua', tombol 'Mulai' dengan teks gelap, centang selesai, tab aktif, dan seri ring. Tidak ada warna tanpa makna. Teks muted abu-abu ('/ 10.000', '06:00 · 32 menit · selesai') terbaca di surface gelap.
- R4, ulangan 2 (skor 1): Oranye dipakai konsisten untuk tautan 'Kalender'/'Lihat semua', 'Rata-rata 71%', tab aktif, dan seri ring. Teks muted metadata terbaca. Namun label 'Mulai' di atas tombol oranye (item jadwal kedua) berwarna terang, bukan gelap #1A0F05.
- R4, ulangan 3 (skor 2): Oranye konsisten untuk aksi dan status aktif: tombol 'Mulai', link 'Kalender' dan 'Lihat semua', tab Beranda, centang selesai. Teks gelap di atas tombol oranye. Tiga nuansa oranye/krem pada ring dan legenda menandai seri (langkah, kalori, menit). Teks muted '/ 10.000' dan '06:00 · 32 menit' terbaca di surface gelap.
- R5, ulangan 1 (skor 2): Ikon garis satu gaya dan berukuran seragam: jejak kaki, dumbel, lonceng, sepeda, pulse, dan ikon tab. Ring berpusat ikon api sebagai visual utama. Avatar inisial 'RA' di kiri atas, tanggal di atas sapaan 'Halo, Rani', tanpa emoji.
- R5, ulangan 2 (skor 2): Semua ikon outline dengan gaya seragam: bel, sepatu, dumbbell, sepeda, pulse, dan ikon tab. Ada avatar inisial 'RA'. Tanggal 'Rabu, 18 November' di atas sapaan tebal. Visual utama berupa ring progres yang relevan. Tanpa emoji.
- R5, ulangan 3 (skor 2): Ikon outline satu gaya dan ukuran seragam: lonceng, sepatu, dumbbell, sepeda, pulse, dan ikon tab bar. Avatar inisial 'RA' di kiri atas. Tanggal 'Rabu, 18 November' di atas sapaan tebal. Visual utama berupa ring progres yang relevan. Tanpa emoji.
- R6, ulangan 1 (skor 2): Legenda nilai/target: 6.842/10.000, 380/600 kkal, 24/30 mnt. 'Rata-rata 71%' konsisten dengan rata-rata (68+63+80)/3 ≈ 71. Status 'selesai' cocok dengan ikon centang. Copy spesifik, misalnya 'Lari pagi 5 km', 'Kardio 21 hari', '4×/minggu · 25 mnt'.
- R6, ulangan 2 (skor 2): Nilai/target konsisten: 6.842/10.000, 380/600 kkal, 24/30 mnt. 'Rata-rata 71%' cocok dengan rata-rata (68+63+80)/3≈71. Copy spesifik ('Lari pagi 5 km', '4×/minggu · 25 mnt'). Tidak ada lorem.
- R6, ulangan 3 (skor 2): 6.842/10.000 (68%), 380/600 kkal (63%), dan 24/30 mnt (80%) menghasilkan 'Rata-rata 71%' yang tepat. Panjang busur ring kira-kira sesuai. Copy spesifik: 'Lari pagi 5 km', '6 gerakan', '4×/minggu · 25 mnt'.
- R8, ulangan 1 (skor 1): Kriteria golden 5 gagal: dua kartu program (y≈598–730) berstruktur identik, yaitu banner coklat bergradasi, chip level, dan ikon kecil kanan bawah. Keduanya hanya berbeda teks dan ikon, sehingga tidak bisa dibedakan secara visual. Tidak ada pelanggaran checklist slop.
- R8, ulangan 2 (skor 1): Tidak ada pelanggaran checklist slop. Namun dua kartu program (bawah) hampir identik: thumbnail cokelat ber-tint yang sama dengan badge dan satu ikon kecil, hanya beda ikon/teks. Kriteria golden 'kartu bisa dibedakan secara visual' lemah. Komposisi khas terbatas pada tab bar mengambang.
- R8, ulangan 3 (skor 1): Tidak ada pelanggaran checklist slop. Namun dua kartu program (bawah) nyaris identik: blok header coklat ber-tint yang sama dengan badge di kiri dan ikon kecil di kanan, hanya teks dan ikonnya yang berbeda. Kriteria golden kartu yang dibedakan secara visual gagal, dan tidak ada langkah komposisi yang khas.

**pen.dev**

- R1, ulangan 1 (skor 1): Artboard 390×844, status bar '9:41' di atas, mode gelap, aksen oranye, bahasa Indonesia. Semua seksi ada: sapaan+avatar, ringkasan dengan ring, jadwal 3 item, 2 kartu rekomendasi, tab bar 4 ikon. Satu kriteria golden gagal: tidak terlihat home indicator di bawah tab bar mengambang (y≈776–840). Jadwal sudah memenuhi: 'Lari interval pagi' selesai dengan ikon centang dalam lingkaran, 'Kekuatan tubuh atas' dengan tombol '▷ Mulai'. Tab bar Beranda/Latihan/Progres/Profil dengan item aktif berlatar oranye gelap.
- R1, ulangan 2 (skor 1): Artboard 390×844 dengan status bar 9:41. Semua bagian ada: sapaan + avatar, ringkasan dengan ring, jadwal 3 item, 2 kartu rekomendasi, tab bar 4 item (Beranda aktif dengan pill oranye gelap). Mode gelap, aksen oranye, Bahasa Indonesia. Satu kriteria golden gagal: home indicator tidak terlihat di bawah karena tab bar mengambang menempati dasar artboard.
- R1, ulangan 3 (skor 1): Artboard 390×844 dengan status bar 9:41. Semua seksi ada: sapaan, ringkasan dengan ring, jadwal 3 item (selesai dengan centang, 'Mulai' dengan ikon play), 2 kartu rekomendasi, tab bar 4 item dengan Beranda aktif. Mode gelap, aksen oranye, bahasa Indonesia. Satu kriteria golden gagal: home indicator tidak terlihat di bawah tab bar.
- R2, ulangan 1 (skor 1): Fokus ada pada ring ringkasan dengan angka besar '7.412', '372', '24' (kiri-tengah atas). Fokus ini bersaing dengan kartu jadwal oranye penuh 'Kekuatan tubuh atas' (tengah, y≈450–515) yang paling menonjol secara warna. Lompatan skala lainnya tegas: sapaan tebal, judul seksi, lalu meta abu-abu.
- R2, ulangan 2 (skor 1): Ring progres di kartu ringkasan bersaing kuat dengan kartu jadwal 'Kekuatan tubuh atas' berlatar oranye penuh (tengah). Selain itu, sapaan 'Selamat pagi, Rina' dan judul seksi berukuran hampir sama, dengan jarak rapat di bawah sapaan.
- R2, ulangan 3 (skor 1): Ring di kartu 'Ringkasan hari ini' bersaing dengan kartu jadwal 'Kekuatan tubuh atas' yang berwarna oranye penuh (tengah). Kartu oranye itu menarik mata sama kuat atau lebih kuat dari ring, sehingga fokus terbagi.
- R4, ulangan 1 (skor 2): Oranye dipakai konsisten untuk aksi dan status: tautan 'Detail' dan 'Lihat semua', kartu berikutnya, tab aktif, dan seri ring. Teks di atas oranye berwarna gelap; tombol 'Mulai' berlatar coklat-hitam dengan teks oranye. Gradasi oranye-krem pada ring memetakan tiga metrik. Teks muted abu-abu ('/ 10.000', meta jadwal) masih terbaca di surface gelap.
- R4, ulangan 2 (skor 1): Aksen oranye konsisten untuk item aktif/berikutnya, tab aktif, 'Detail'/'Lihat semua', dan badge 'BARU'. Teks dan tombol 'Mulai' di atas oranye memakai cokelat gelap ±#1A0F05. Namun label tab tidak aktif ('Latihan', 'Progres', 'Profil') di bawah berwarna abu redup dengan kontras lemah.
- R4, ulangan 3 (skor 1): Aksen oranye konsisten: kartu aktif, link 'Detail' dan 'Lihat semua', tab Beranda, badge 'BARU'. Teks gelap di atas kartu oranye. Satu teks lemah: label tab tidak aktif 'Latihan', 'Progres', dan 'Profil' (bawah) tampak sangat redup, sehingga syarat teks muted ≥4.5:1 meragukan.
- R5, ulangan 1 (skor 2): Ikon garis satu gaya dan berukuran seragam: jejak kaki, dumbel, daun, lonceng, chevron, dan ikon tab. Ring berpusat ikon api. Kartu program memakai foto lari dan gym yang relevan. Sapaan 'Selamat pagi, Rina' tebal dengan tanggal 'Rabu, 18 November' di atasnya, avatar foto di kiri atas, tanpa emoji.
- R5, ulangan 2 (skor 2): Ikon outline seragam: sepatu, dumbbell, daun, chevron, bel dengan dot notifikasi, dan ikon tab. Tombol 'Mulai' memakai ikon play. Avatar ilustrasi di kiri atas. Foto relevan di kartu program (pelari, gym). Tanpa emoji.
- R5, ulangan 3 (skor 2): Ikon outline seragam: sepatu, dumbbell, daun, play, chevron, dan ikon tab. Avatar ilustrasi di kiri atas dengan tanggal di atas sapaan tebal 'Selamat pagi, Rina'. Kartu program memakai foto lari dan gym yang relevan. Tanpa emoji.
- R6, ulangan 1 (skor 2): Legenda menampilkan nilai/target: 7.412/10.000, 372/600 kkal, 24/30 mnt. Busur konsentris kira-kira sebanding: menit aktif terpanjang 80%, langkah 74%, kalori 62%. '1 dari 3 selesai' cocok dengan satu item bercentang. Copy spesifik, misalnya '17:30 · 45 mnt · 6 gerakan' dan 'Lari 5K Pemula'.
- R6, ulangan 2 (skor 2): Nilai/target konsisten: 7.412/10.000, 372/600 kkal, 24/30 mnt. Penanda '1 dari 3 selesai' cocok dengan satu item tercentang di antara tiga item. Copy spesifik ('Lari interval pagi', 'HIIT Bakar Lemak', '4 minggu · Pemula').
- R6, ulangan 3 (skor 2): 7.412/10.000, 372/600 kkal, dan 24/30 mnt sesuai dengan panjang busur ring. Label '1 dari 3 selesai' cocok dengan satu item bercentang. Copy spesifik: 'Lari interval pagi', 'HIIT Bakar Lemak', '4 minggu · Pemula'.
- R8, ulangan 1 (skor 2): Tidak ada pelanggaran slop. Keputusan komposisi khas yang bisa ditunjuk: item jadwal berikutnya dijadikan kartu oranye penuh dengan tombol gelap di tengah layar, sehingga timeline punya tiga status visual. Dua kartu program berbeda: foto berbeda, badge 'PALING POPULER' gelap dan 'BARU' oranye.
- R8, ulangan 2 (skor 2): Tidak ada pelanggaran checklist slop. Ada langkah komposisi khas: item jadwal berikutnya dijadikan kartu oranye penuh dengan tombol 'Mulai' gelap (tengah). Kartu program dibedakan oleh foto berbeda dan badge berbeda ('PALING POPULER' gelap vs 'BARU' oranye).
- R8, ulangan 3 (skor 2): Tidak ada pelanggaran checklist slop. Ada keputusan komposisi khas: sesi berikutnya ditonjolkan sebagai kartu oranye penuh dengan tombol gelap 'Mulai' (tengah). Dua kartu program dibedakan jelas oleh foto yang berbeda serta badge 'PALING POPULER' dan 'BARU'.

### Pemetaan X/Y per ulangan (dibuka setelah penilaian)

| Ulangan | Desain X | Desain Y | Status | Biaya |
|---|---|---|---|---|
| 1 | pen.dev | Lakar | ok | $0.16 |
| 2 | Lakar | pen.dev | ok | $0.16 |
| 3 | Lakar | pen.dev | ok | $0.16 |

## Biaya

Biaya juri total: $1.52 (A $1.04, B $0.48). Tidak ada biaya agen desain.
