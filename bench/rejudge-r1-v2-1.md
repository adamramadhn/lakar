# Penilaian ulang juri `r1-v2-1` (sumber: putaran 1)

Status: **lengkap**. Tanggal: 2026-11-18T06:51:59.340Z.

Strip PNG putaran sumber dinilai ulang dengan rubrik juri saat ini. Tidak ada agen desain yang dijalankan: status run dan gerbang Lakar diambil dari laporan sumber. Keputusan di bawah adalah keluaran juri dan aturan keputusan, menunggu tinjauan Adam.

## Sumber dan versi

- Sumber: `bench/round-1.json` (keputusan Adam dari `bench/round-1.md`)
- Strip A: Lakar `bench/runs/rounds/1/A-lakar.png`, pen.dev `bench/runs/rounds/1/A-pendev.png`
- Strip B: Lakar `bench/runs/rounds/1/B-lakar.png`, pen.dev `bench/runs/rounds/1/B-pendev.png`
- Model juri: `claude-opus-5-5`; Claude Code: 2.1.325 (Claude Code); git HEAD: `9ee43d45187cefdceb74865cb7c301ccd53e1387`
- Versi rubrik: 2 (`bench/rubric/rubric.json`: versi 2, sama)
- sha256 teks juri A: `cd273805584f3f3627efadfdf88e47b6b9299a8c021a9c133bf3f94179b09925`
- sha256 teks juri B: `6d9049502db51cd1a7829dd835aeccb07b3d7123eb3da8db9196c6e19eef01df`
- Argv juri: `claude -p --input-format stream-json --output-format stream-json --verbose --model claude-opus-5-5 --tools "" --strict-mcp-config --mcp-config bench/runs/rejudge/r1-v2-1/mcp-empty.json --disable-slash-commands --no-session-persistence`
- Artefak mentah (gitignored): `bench/runs/rejudge/r1-v2-1/` (teks juri, pemetaan X/Y, transkrip per ulangan)

## Ringkasan

| Prompt | T Lakar (maks 16) | T pen.dev | D Lakar (maks 4) | D pen.dev | Keputusan v2 | Keputusan sumber | Keputusan Adam | Pelanggaran brief pen.dev |
|---|---|---|---|---|---|---|---|---|
| A | 15 | 12 | 4 | 4 | **Lebih baik** | Lebih baik (T 9 vs 6) | Kalah | tidak ada |
| B | 12 | 13 | 2 | 4 | **Setara** | Lebih baik (T 10 vs 6) | Setara | ukuran: board z57aTa 390×1109 ≠ 390×844; median R1 pen.dev = 0 |

## Kalibrasi

Ambang lulus (ditetapkan sebelum run): **tidak lulus**.

- Syarat: 6/6 ulangan valid; A ∈ {Kalah, Setara} dengan D pen.dev > D Lakar; B = Setara dengan D pen.dev ≥ D Lakar dan pelanggaran brief pen.dev terdeteksi; bukti R9/R10 tidak kosong.
- Tidak terpenuhi: A: keputusan Lebih baik ∉ {Kalah, Setara}
- Tidak terpenuhi: A: D pen.dev 4 tidak > D Lakar 4
- R9/R10 dengan rentang > 1 (ditandai untuk Adam, tidak menggagalkan): tidak ada

## Prompt A

- Gerbang Lakar (dari sumber): lolos
- Brief mengikat pen.dev (ukuran frame): sesuai
- Keputusan v2: **Lebih baik**. Alasan: lolos gerbang, total 15 ≥ 12 + 3, daya tarik 4 ≥ 4.
- Kalah-daya-tarik: tidak ada; Kalah-lain: tidak ada; R Lakar 0 vs pen.dev 2: tidak ada
- Pelanggaran brief pen.dev: tidak ada
- Keputusan sumber: Lebih baik (lolos gerbang, total 9 ≥ 6 + 2); keputusan Adam: Kalah

### Skor (ulangan valid 3 dari 3)

| Kriteria | Alat | Ulangan 1 | Ulangan 2 | Ulangan 3 | Median (rentang) |
|---|---|---|---|---|---|
| R1 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R1 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R2 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R2 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R4 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R4 | pen.dev | 1 | 1 | 2 | 1 (rentang 1) |
| R5 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R5 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R6 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R6 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R8 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R8 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R9 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R9 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R10 | Lakar | 2 | 2 | 1 | 2 (rentang 1) |
| R10 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| **T** | Lakar |  |  |  | **15** |
| **T** | pen.dev |  |  |  | **12** |
| **D = R9 + R10** | Lakar |  |  |  | **4** |
| **D = R9 + R10** | pen.dev |  |  |  | **4** |
| Slop | Lakar |  |  |  | 0 (rentang 0) |
| Slop | pen.dev |  |  |  | 2 (rentang 1) |

### Bukti R9/R10 per ulangan

**R9 Lakar**

- Ulangan 1 (skor 2): Angka diberi konteks pembanding/periode ('+12,4% dari Oktober', 'Margin 34,4%', '1–18 November · semua cabang', 'Tersinkron 2 menit lalu'). Transaksi punya arah masuk/keluar dan waktu. Fitur punya metrik ('Rata-rata 6 detik per transaksi', 'Pengingat terjadwal 08.00 WIB'). Testimoni memuat hasil terukur. Pricing ditutup catatan PPN, opsi tahunan, dan metode bayar. Padat namun terbaca.
- Ulangan 2 (skor 2): Angka diberi konteks: '+12,4% dari Oktober', 'Margin 34,4%', 'Tersinkron 2 menit lalu', '1–18 November · semua cabang', 'Rata-rata 6 detik per transaksi', 'Pengingat terjadwal 08.00 WIB', '4,8 dari 1.127 ulasan'. Daftar transaksi memiliki variasi masuk/keluar beserta waktu. Catatan pembayaran tahunan dan QRIS ada di bawah pricing. Padat tetapi terbaca.
- Ulangan 3 (skor 2): Angka diberi konteks: '+12,4% dari Oktober', 'Margin 34,4%', periode '1–18 November · semua cabang', status 'Tersinkron 2 menit lalu' (bagian 1). Transaksi memakai metadata waktu dan arah. Fitur memiliki penanda 'Rata-rata 6 detik per transaksi' dan 'Pengingat terjadwal 08.00 WIB'. Rating '4,8 dari 1.127 ulasan', catatan PPN dan pembayaran di bagian harga. Padat tetapi tetap terbaca.

**R10 Lakar**

- Ulangan 1 (skor 2): Permukaan berlapis: hero ber-tint hijau, kartu fitur utama abu terang berisi tabel putih, testimoni gelap dengan avatar inisial ber-tint hijau, kartu tier tengah ber-tint hijau. Chip/badge berwarna terdefinisi ('Tersinkron', 'Paling dipilih', label 'PEMBUKUAN UNTUK UMKM INDONESIA'). Bar chart dengan bar aktif yang ditonjolkan. Ikon dalam wadah tint seragam.
- Ulangan 2 (skor 2): Permukaan berlapis: hero mint, kartu fitur besar abu dengan tabel putih di dalamnya, seksi testimoni gelap dengan kartu bernuansa, dan tier tengah ber-tint hijau. Komponen berwarna terdefinisi: chip 'Tersinkron', badge 'Paling dipilih', avatar inisial hijau. Chart menyorot satu batang hijau tua di antara batang mint. Hijau terang dipakai bermakna pada metrik testimoni.
- Ulangan 3 (skor 1): Ada permukaan berlapis: hero ber-tint hijau, seksi testimoni gelap, wadah ikon ber-tint, chip status sinkron, dan badge 'Paling dipilih'. Namun warna kedua bermakna hampir tidak ada, hanya kuning bintang. Pengeluaran tidak dibedakan warnanya, avatar testimoni hanya inisial polos, dan footer serta kartu harga samping polos netral. Polesan hanya di sebagian elemen.

**R9 pen.dev**

- Ulangan 1 (skor 2): Angka di mockup diberi tren berupa chip +12,4%/+8,1%/-3,2% dan '4 invoice', rentang tanggal '1–18 Nov 2026'. Transaksi memiliki metadata (Tunai · 09:12, QRIS · Kemarin). Grafik memakai legenda Masuk/Keluar per minggu M1–M8. Kartu fitur punya sub-poin centang. Stat testimoni berlabel, pricing memiliki deskripsi tier. Padat tetapi tetap terbaca.
- Ulangan 2 (skor 2): Mockup kaya konteks: rentang tanggal '1–18 Nov 2026', badge tren +12,4%/+8,1%/-3,2%, badge status oranye '4 invoice', dan metadata transaksi 'Tunai · 09:12' / 'QRIS · Kemarin'. Kartu fitur memiliki sub-daftar check. Pricing punya deskripsi target per tier. Testimoni disertai metrik '4,9/5 Rating Play Store'. Tetap terbaca.
- Ulangan 3 (skor 2): Kartu ringkasan mockup memakai chip tren '+12,4%', '+8,1%', '-3,2%' dan status '4 invoice'. Legenda grafik Masuk/Keluar per minggu M1–M8. Transaksi memiliki metadata metode dan waktu ('Tunai · 09:12', 'QRIS · Kemarin'). Kartu fitur memiliki sub-daftar check. Statistik testimoni berlabel, dan pricing menyebut detail seperti watermark, SPT, dan 24/7. Padat tetapi terbaca.

**R10 pen.dev**

- Ulangan 1 (skor 2): Permukaan berlapis: hero ber-tint hijau, testimoni hijau gelap dengan kartu kutipan hijau solid, kartu tier tengah gelap, CTA penutup hijau di atas footer gelap. Chip berwarna bermakna di mockup (hijau tren, oranye piutang), badge 'Baru' dan 'Paling Populer'. Avatar berupa foto. Bar chart dua nada terintegrasi.
- Ulangan 2 (skor 2): Permukaan berlapis: hero ber-tint mint, kartu fitur abu kehijauan, seksi testimoni hijau gelap dengan kartu hijau solid, kartu harga tengah gelap, dan CTA penutup hijau bergradasi halus. Badge terdefinisi ('Baru', 'Paling Populer', chip tren, chip oranye piutang). Foto avatar asli dan chart batang dua seri yang matang.
- Ulangan 3 (skor 2): Permukaan berlapis: hero ber-tint hijau, mockup dalam bingkai ber-tint dengan bayangan, seksi testimoni hijau gelap dengan kartu hijau solid, kartu harga tengah gelap, banner CTA hijau di atas footer gelap. Chip tren hijau dan chip oranye piutang terdefinisi, grafik dua seri, foto avatar menyatu.

### Bukti kriteria lain per ulangan

**Lakar**

- R1, ulangan 1 (skor 2): Bagian lengkap dan berurutan: navbar (bagian 1), hero dengan headline, subjudul, 2 CTA dan mockup dashboard (bagian 1–2), fitur 3 kartu bento (bagian 2), testimoni dark (bagian 3), pricing 3 tier dengan tengah 'Tumbuh' ditonjolkan (bagian 3–4), footer (bagian 4–5). Tanpa CTA penutup, yang memang opsional. Lebar 1440px, aksen hijau, berbahasa Indonesia.
- R1, ulangan 2 (skor 2): Semua bagian hadir dan urut: navbar (bagian 1 atas); hero dengan badge, headline, subjudul, 2 CTA, dan mockup dashboard (bagian 1–2); 3 kartu fitur dalam layout bento (bagian 2); testimoni berlatar gelap (bagian 3); pricing 3 tier (bagian 4); footer (bagian 4–5). Lebar 1440px, aksen hijau, seluruh copy berbahasa Indonesia.
- R1, ulangan 3 (skor 2): Ketujuh bagian hadir dan berurutan: navbar (bagian 1, atas), hero dengan headline, subjudul, 2 CTA, dan mockup dashboard (bagian 1–2), 3 kartu fitur dalam pola bento (bagian 2), testimoni (bagian 3), pricing 3 tier dengan tier tengah 'Tumbuh' ditonjolkan (bagian 4), footer (bagian 4–5). Lebar 1440px, berbahasa Indonesia, aksen hijau, mode terang dengan seksi testimoni gelap.
- R2, ulangan 1 (skor 2): Headline 'Tutup buku 5 menit tiap malam, laba rugi langsung siap' berukuran display, 2 baris, berisi klaim hasil terukur, tanpa yatim (bagian 1). Skala turun tegas ke subjudul dan judul seksi. CTA primer hijau 'Coba gratis 14 hari' dan sekunder outline 'Lihat demo 3 menit'.
- R2, ulangan 2 (skor 2): Headline 'Tutup buku 5 menit tiap malam, laba rugi langsung siap' (bagian 1 tengah) berukuran display, 2 baris, berisi klaim hasil terukur, tanpa kata yatim. Skalanya tegas dibanding H2 seksi (bagian 2 'Semua angka usaha…'). CTA primer hijau 'Coba gratis 14 hari' dan CTA sekunder outline 'Lihat demo 3 menit'.
- R2, ulangan 3 (skor 2): Headline display 'Tutup buku 5 menit tiap malam, laba rugi langsung siap' terdiri dari 2 baris, berisi klaim hasil, dan tidak menyisakan kata yatim (bagian 1, tengah). Lompatan skala tegas: headline ±64px, subjudul ±18px, judul seksi ±32px. CTA primer hijau 'Coba gratis 14 hari' dan sekunder outline 'Lihat demo 3 menit'. Judul seksi fitur, testimoni, dan harga juga tanpa kata yatim.
- R4, ulangan 1 (skor 2): Hijau sekitar #15803D dipakai konsisten untuk tombol, ikon, nilai positif, dan bar aktif grafik (bagian 1). Teks putih di atas tombol hijau dan badge 'Paling dipilih'. Ritme seksi: hero tint terang, fitur putih, testimoni gelap, pricing putih, footer abu terang. Kuning hanya dipakai untuk rating bintang. Tidak ada teks yang terlihat gagal kontras.
- R4, ulangan 2 (skor 2): Hijau aksen tampak sekitar #15803D dan dipakai konsisten untuk tombol primer, ikon check, nilai positif (+Rp 1.284.000, Laba bersih Rp 14.810.000), serta border tier tengah. Teks di atas aksen putih. Ritme seksi: hero mint, fitur putih, testimoni hampir hitam, harga putih, footer abu terang. Bintang kuning bermakna rating. Tidak ada teks yang terlihat gagal kontras.
- R4, ulangan 3 (skor 2): Hijau tua dipakai konsisten untuk tombol primer (navbar, hero, tier tengah), angka positif mockup, link 'Unduh PDF', dan ikon check. Tombol hijau berteks putih. Warna tambahan hanya kuning untuk bintang rating (bagian 3, kiri), dan pemakaiannya bermakna. Ritme terang→gelap (testimoni)→terang→abu (footer). Tidak ada teks yang tampak gagal kontras.
- R5, ulangan 1 (skor 2): Ikon Lucide-style seragam: fitur file-chart/smartphone/bell-ring dalam wadah persegi ber-tint hijau berukuran sama (bagian 2), timer/clock di metrik fitur, ikon check di pricing, star terisi untuk rating (bagian 3), sparkles di badge, shield-check di catatan pembayaran. Tanpa emoji. Mockup hero relevan dan dibangun dari shape/teks.
- R5, ulangan 2 (skor 2): Satu gaya ikon Lucide outline. Ikon fitur (file-chart, smartphone, bell-ring) berada dalam kotak tint hijau berukuran seragam (bagian 2). Ikon lain konsisten: arah transaksi di mockup, timer/clock pada catatan fitur, sparkles di badge harga, shield-check di catatan harga, ikon sosial footer. Bintang rating berupa ikon star terisi (bagian 3 kiri). Tanpa emoji, termasuk di mockup. Visual utama, yaitu mockup dashboard, relevan.
- R5, ulangan 3 (skor 2): Ikon fitur bergaya Lucide outline (file-chart, smartphone, bell-ring) berada dalam wadah persegi membulat ber-tint hijau yang seragam (bagian 2). Ikon sidebar mockup, check, star, dan sosial footer memakai satu gaya garis. Mockup hero dibangun dari teks dan shape nyata. Tidak ada emoji, termasuk di mockup.
- R6, ulangan 1 (skor 1): Kriteria golden lolos. Mockup: Pemasukan Rp 48,2 jt − Pengeluaran Rp 31,6 jt = Laba bersih Rp 16,6 jt, margin 34,4% konsisten (bagian 1). Tabel laba rugi juga tepat: 42.870.000 − 23.150.000 − 4.910.000 = 14.810.000 (bagian 2). Testimoni lengkap dengan nama, usaha, dan kota (Rina Anggraini – Yogyakarta, Hendra Wijaya – Medan, Dewi Lestari – Surabaya) plus ikon star. Ada 1 inkonsistensi: kartu Pengeluaran memakai ikon tren turun tetapi teksnya '+3,1% dari Oktober' (bagian 1).
- R6, ulangan 2 (skor 1): Angka kriteria golden terpenuhi: mockup menampilkan Pemasukan Rp 48,2 jt − Pengeluaran Rp 31,6 jt = Laba bersih Rp 16,6 jt, margin 34,4% konsisten, dan tabel laba rugi Oktober 42.870.000 − 23.150.000 − 4.910.000 = 14.810.000 benar. Testimoni lengkap dengan nama, usaha, dan kota (Yogyakarta, Medan, Surabaya). Satu inkonsistensi: kartu Pengeluaran memakai ikon tren menurun tetapi labelnya '+3,1% dari Oktober' (bagian 1 mockup tengah).
- R6, ulangan 3 (skor 1): Angka mockup konsisten: Pemasukan 48,2jt − Pengeluaran 31,6jt = Laba bersih 16,6jt, margin 34,4% benar (bagian 1). Tabel laba rugi juga konsisten: 42.870.000 − 23.150.000 − 4.910.000 = 14.810.000 (bagian 2). Testimoni lengkap dengan nama, usaha, dan kota (Yogyakarta, Medan, Surabaya), rating memakai ikon star. Ada 1 inkonsistensi: kartu Pengeluaran menulis '+3,1% dari Oktober' tetapi memakai ikon tren turun (bagian 1, kartu tengah mockup).
- R8, ulangan 1 (skor 2): Tier tengah 'Tumbuh' ditonjolkan dengan satu cara utama (latar tint hijau dan border hijau) plus badge 'Paling dipilih'. CTA tengah primer hijau, tier lain outline. Harga Rp 79.000 / bulan, setara nilai Rp 79rb/bulan. Fitur memakai check (bagian 4). Tidak ada pelanggaran slop. Langkah khas: fitur bento asimetris dengan kartu besar berisi tabel laba rugi nyata, dan kartu testimoni utama dengan metrik hasil '4 jam hemat waktu tiap minggu'.
- R8, ulangan 2 (skor 2): Tier tengah 'Tumbuh' (bagian 4) ditonjolkan dengan kartu ber-tint dan border hijau, memakai badge 'Paling dipilih', CTA primer hijau, sementara tier lain memakai tombol outline. Harga Rp 79.000/bulan (setara Rp 79rb/bulan) dan fitur ditandai check. Tidak ada pelanggaran slop. Langkah khas yang bisa ditunjuk: bento fitur dengan kartu besar yang memuat tabel laba rugi nyata (bagian 2 kiri), dan testimoni utama dengan metrik '4 jam hemat waktu tiap minggu' (bagian 3).
- R8, ulangan 3 (skor 2): Tier tengah 'Tumbuh' ditonjolkan dengan border hijau + tint, ditambah badge 'Paling dipilih'. CTA tengah primer, dua tier lain outline. Harga Rp 79.000/bulan, fitur memakai check (bagian 4). Tidak ada pelanggaran checklist slop. Keputusan komposisi khas yang bisa ditunjuk: grid fitur bento dengan kartu besar berisi tabel laba rugi nyata (bagian 2), serta testimoni asimetris dengan kutipan besar dan metrik '4 jam hemat waktu tiap minggu' (bagian 3).

**pen.dev**

- R1, ulangan 1 (skor 2): Bagian lengkap dan berurutan: navbar (bagian 1 atas), hero dengan headline, subjudul, 2 CTA dan mockup dashboard (bagian 1–2), 3 kartu fitur 'FITUR UTAMA' (bagian 2), testimoni dark (bagian 3), pricing 3 tier dengan tengah 'Bisnis' ditonjolkan (bagian 4), CTA penutup opsional dan footer (bagian 5). Lebar 1440px, aksen hijau, seluruh copy berbahasa Indonesia.
- R1, ulangan 2 (skor 2): Semua bagian hadir dan urut: navbar (logo Kasku, menu, Masuk/Coba Gratis) di bagian 1 atas; hero dengan headline, subjudul, 2 CTA, dan mockup dashboard di bagian 1–2; 3 kartu fitur di bagian 2; testimoni berlatar gelap di bagian 3; pricing 3 tier di bagian 4; CTA penutup (opsional) dan footer di bagian 5. Lebar 1440px, aksen hijau, seluruh copy berbahasa Indonesia.
- R1, ulangan 3 (skor 2): Semua bagian hadir dan berurutan: navbar (bagian 1), hero dengan headline, subjudul, 2 CTA, dan mockup (bagian 1–2), 3 kartu fitur (bagian 2), testimoni (bagian 3), pricing 3 tier dengan tengah 'Bisnis' ditonjolkan (bagian 4), CTA penutup yang opsional, footer (bagian 5). Lebar 1440px, berbahasa Indonesia, aksen hijau, ada ritme terang/gelap.
- R2, ulangan 1 (skor 2): Headline hero 'Pembukuan rapi, usaha makin tenang.' berukuran display, 2 baris, berisi klaim hasil, tanpa kata yatim (bagian 1 tengah). Lompatan skala tegas ke subjudul abu-abu. CTA primer hijau 'Mulai Gratis 30 Hari' dan sekunder outline 'Lihat Demo'. Judul seksi ('Semua yang dibutuhkan…', 'Harga jujur…') jelas lebih kecil dari headline.
- R2, ulangan 2 (skor 2): Headline 'Pembukuan rapi, usaha makin tenang.' (bagian 1 tengah) berukuran display, 2 baris, berisi klaim hasil, dan baris kedua dua kata sehingga tidak yatim. Skalanya jauh di atas H2 seksi seperti 'Semua yang dibutuhkan…' (bagian 2). CTA primer hijau 'Mulai Gratis 30 Hari' dan CTA sekunder outline 'Lihat Demo'.
- R2, ulangan 3 (skor 2): Headline display 'Pembukuan rapi, usaha makin tenang.' terdiri dari 2 baris, berisi klaim hasil, dan tidak menyisakan kata yatim (bagian 1, tengah). Skala tegas: headline ±72px tebal, subjudul ±18px. CTA primer hijau 'Mulai Gratis 30 Hari' dan sekunder outline 'Lihat Demo'. Judul seksi tanpa kata yatim.
- R4, ulangan 1 (skor 1): Ritme terang/gelap ada: hero ber-tint terang, fitur putih, testimoni hijau gelap, pricing terang, footer gelap. Teks putih di atas tombol hijau. Namun hijau aksen tampak lebih kebiruan (sekitar #0F7B4A), bukan #15803D, di tombol 'Coba Gratis', ikon fitur, dan kartu kutipan (bagian 3). Satu teks lemah: metadata 'Pemilik Dapur Sari, Yogyakarta' hijau muda kecil di atas kartu hijau (bagian 3 kiri bawah).
- R4, ulangan 2 (skor 1): Ritme terang/gelap antar-seksi baik: hero mint, fitur putih, testimoni hijau sangat gelap, harga terang, footer gelap. Teks di atas hijau putih (tombol, kartu testimoni besar, CTA penutup). Namun hijau aksen tombol dan ikon cenderung emerald kebiruan (sekitar #0F7B4A), bukan #15803D, sehingga satu kriteria golden gagal. Label legenda 'Keluar' mint pucat pada chart mockup (bagian 1 kanan bawah) juga lemah.
- R4, ulangan 3 (skor 2): Hijau konsisten pada tombol primer, bar 'Masuk' di grafik, ikon fitur, dan tombol tier tengah. Teks putih di atas hijau. Warna tambahan bermakna: chip oranye '4 invoice' untuk status piutang (bagian 1, kartu Piutang) dan kuning untuk bintang rating. Ritme terang→gelap hijau (testimoni)→terang→gelap (CTA/footer). Tidak ada teks yang tampak gagal kontras.
- R5, ulangan 1 (skor 1): Ikon bergaya line seragam: sidebar mockup, ikon fitur zap/file-check/chart dalam wadah persegi hijau 48px (bagian 2), check di daftar, star outline di testimoni, ikon sosial di footer. Visual hero berupa mockup dashboard yang relevan. Ada 1 emoji dekoratif tangan melambai di sapaan mockup 'Halo, Toko Bu Sari 👋' (bagian 1), padahal golden melarang emoji termasuk di sapaan.
- R5, ulangan 2 (skor 1): Ikon bergaya Lucide outline konsisten di sidebar mockup, check list, dan sosial footer. Ikon fitur (zap, file-check, chart) berada dalam kotak hijau solid yang seragam. Namun ada emoji tangan melambai di sapaan mockup 'Halo, Toko Bu Sari 👋' (bagian 1, mockup kiri atas), sehingga kriteria golden 'tanpa emoji di sapaan' gagal. Bintang rating berupa ikon star outline kuning.
- R5, ulangan 3 (skor 1): Ikon fitur bergaya Lucide (zap, file-check, chart) berada dalam wadah hijau solid yang seragam (bagian 2), dan foto avatar testimoni relevan (bagian 3). Namun ada 1 emoji dekoratif 👋 di sapaan mockup 'Halo, Toko Bu Sari' (bagian 1, area utama mockup). Ini melanggar kriteria golden 4.
- R6, ulangan 1 (skor 1): Kriteria golden mockup gagal: kartu menampilkan Saldo Kas, Pemasukan Rp32.180.000, Pengeluaran Rp14.900.000 dan Piutang, tanpa kartu Laba, sehingga persamaan Pemasukan − Pengeluaran = Laba tidak ditunjukkan (bagian 1). Testimoni lolos: nama, usaha, kota (Sari Wulandari – Dapur Sari, Yogyakarta; Budi Santoso – Surabaya; Rina Hapsari – Bandung) dengan ikon star (bagian 3). Copy lain spesifik (SAK EMKM, KUR, QRIS).
- R6, ulangan 2 (skor 1): Mockup (bagian 1) menampilkan Pemasukan Rp32.180.000 dan Pengeluaran Rp14.900.000, tetapi tidak ada nilai Laba. Kartu yang ada adalah Saldo Kas Rp48.250.000 dan Piutang, jadi relasi Pemasukan − Pengeluaran = Laba tidak ditunjukkan: kriteria golden gagal. Testimoni memenuhi syarat: nama, peran/usaha, kota (Sari Wulandari, Dapur Sari, Yogyakarta; Budi Santoso, Surabaya; Rina Hapsari, Bandung) dan bintang ikon. Copy lainnya spesifik (KUR, SAK EMKM, QRIS).
- R6, ulangan 3 (skor 1): Kriteria golden 3 gagal: mockup hanya menampilkan Saldo Kas, Pemasukan Rp32.180.000, Pengeluaran Rp14.900.000, dan Piutang, tanpa angka Laba sehingga persamaan Pemasukan − Pengeluaran = Laba tidak ditampilkan (bagian 1). Testimoni lengkap dengan nama, peran, dan kota (Yogyakarta, Surabaya, Bandung), rating memakai ikon star (bagian 3).
- R8, ulangan 1 (skor 1): Kriteria golden pricing gagal: harga tier tengah 'Rp99rb /bulan' (bagian 4), bukan Rp 79rb/bulan. Bagian lain dari kriteria itu terpenuhi: tier tengah ditonjolkan dengan kartu gelap terangkat plus badge 'Paling Populer', CTA tengah primer hijau, tier lain outline, fitur memakai check. Ada 1 pelanggaran slop non-emoji: statistik bulat '12.000+ UMKM aktif' dan 'Rp2,1T' (bagian 3). Langkah khas yang bisa ditunjuk: komposisi testimoni asimetris dengan satu kutipan besar berkartu hijau plus dua kartu bertumpuk.
- R8, ulangan 2 (skor 1): Tier tengah 'Bisnis' (bagian 4) ditonjolkan dengan satu cara utama (kartu gelap, sedikit lebih tinggi), memakai badge 'Paling Populer' dan CTA primer hijau, sementara tier lain memakai tombol outline. Fitur ditandai ikon check. Namun harganya 'Rp99rb/bulan', bukan Rp 79rb/bulan, sehingga satu kriteria golden gagal. Ada 1 pelanggaran slop (statistik bulat). Langkah khas yang bisa ditunjuk: testimoni bento dengan kartu kutipan hijau besar plus deret statistik (bagian 3).
- R8, ulangan 3 (skor 1): Tier tengah ditonjolkan dengan kartu gelap terangkat + badge 'Paling Populer'. CTA tengah primer, dua tier lain outline, fitur memakai check (bagian 4). Namun harga tengah 'Rp99rb/bulan' tidak sesuai Rp 79rb/bulan, jadi 1 kriteria golden gagal. Ada 1 pelanggaran slop di luar emoji: statistik bulat '12.000+ UMKM aktif', 'Rp2,1T', '2.000+ pemilik'. Langkah khas yang bisa ditunjuk: kartu testimoni utama hijau solid yang asimetris (bagian 3).

### Pemetaan X/Y per ulangan (dibuka setelah penilaian)

| Ulangan | Desain X | Desain Y | Status | Biaya |
|---|---|---|---|---|
| 1 | pen.dev | Lakar | ok | $0.34 |
| 2 | pen.dev | Lakar | ok | $0.33 |
| 3 | Lakar | pen.dev | ok | $0.34 |

## Prompt B

- Gerbang Lakar (dari sumber): lolos
- Brief mengikat pen.dev (ukuran frame): board z57aTa 390×1109 ≠ 390×844
- Keputusan v2: **Setara**. Alasan: daya tarik D 2 ≤ 4 − 2, tetapi pen.dev melanggar brief mengikat (ukuran: board z57aTa 390×1109 ≠ 390×844; median R1 pen.dev = 0); veto daya tarik dinetralkan, tidak naik ke Lebih baik.
- Kalah-daya-tarik: daya tarik D 2 ≤ 4 − 2; Kalah-lain: tidak ada; R Lakar 0 vs pen.dev 2: tidak ada
- Pelanggaran brief pen.dev: ukuran: board z57aTa 390×1109 ≠ 390×844; median R1 pen.dev = 0
- Keputusan sumber: Lebih baik (lolos gerbang, total 10 ≥ 6 + 2); keputusan Adam: Setara

### Skor (ulangan valid 3 dari 3)

| Kriteria | Alat | Ulangan 1 | Ulangan 2 | Ulangan 3 | Median (rentang) |
|---|---|---|---|---|---|
| R1 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R1 | pen.dev | 0 | 0 | 0 | 0 (rentang 0) |
| R2 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R2 | pen.dev | 1 | 2 | 2 | 2 (rentang 1) |
| R4 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R4 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R5 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R5 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R6 | Lakar | 1 | 2 | 2 | 2 (rentang 1) |
| R6 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R8 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R8 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R9 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R9 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R10 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R10 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| **T** | Lakar |  |  |  | **12** |
| **T** | pen.dev |  |  |  | **13** |
| **D = R9 + R10** | Lakar |  |  |  | **2** |
| **D = R9 + R10** | pen.dev |  |  |  | **4** |
| Slop | Lakar |  |  |  | 0 (rentang 0) |
| Slop | pen.dev |  |  |  | 0 (rentang 0) |

### Bukti R9/R10 per ulangan

**R9 Lakar**

- Ulangan 1 (skor 1): Angka ringkasan punya sasaran, dan jadwal punya status 'Selesai'/'Berikutnya' plus '6 gerakan'. Namun tidak ada persen, tren, atau streak. Kartu program hanya berisi durasi dan level tanpa rating atau visual, sehingga konteks hanya ada di sebagian bagian.
- Ulangan 2 (skor 1): Ring punya target dan satuan, jadwal punya waktu/durasi/status ('Selesai', chip 'Berikutnya'), program punya durasi dan level. Namun tidak ada persen, tren, atau streak, dan kartu program tipis (tanpa rating atau visual), sehingga konteks hanya di sebagian bagian.
- Ulangan 3 (skor 1): Angka ringkasan diberi target dan satuan. Jadwal menunjukkan status 'Selesai' dan chip 'Berikutnya' beserta jumlah gerakan. Namun kartu program hanya memuat durasi dan level tanpa rating atau penanda lain, tidak ada persentase total atau streak, dan hanya ada 2 item jadwal.

**R10 Lakar**

- Ulangan 1 (skor 1): Polesan hanya di sebagian elemen: kartu jadwal berikutnya ber-tint dengan chip 'Berikutnya' dan tombol oranye. Kartu program dan kartu selesai berupa netral polos dengan ikon abu, tanpa foto atau ilustrasi.
- Ulangan 2 (skor 1): Polesan hanya di sebagian elemen: kartu 'Kekuatan tubuh atas' ber-tint dengan border oranye, tile ikon oranye, chip 'Berikutnya', tab bar mengambang. Kartu ringkasan, jadwal pertama, dan kedua kartu program sebagian besar netral abu polos tanpa visual pendukung.
- Ulangan 3 (skor 1): Polesan hanya ada di sebagian elemen: kartu 'Berikutnya' ber-tint dan bertepi oranye, chip 'Berikutnya', serta avatar ber-tint. Kartu program dan kartu jadwal selesai berupa surface netral polos dengan ikon kecil, tanpa foto atau visual pendukung.

**R9 pen.dev**

- Ulangan 1 (skor 2): Angka diberi sasaran dan persen harian, badge streak '12 hari', rating bintang 4.8/4.9 di kartu, level (Pemula/Menengah), dan durasi. Jadwal memperlihatkan variasi status (selesai / berikutnya / mendatang) dengan jam dan metadata. Tampilan padat tetapi tetap terbaca.
- Ulangan 2 (skor 2): Angka diberi konteks: target per metrik, persen agregat 74%, streak 12 hari. Jadwal menunjukkan variasi status (selesai, BERIKUTNYA, akan datang) beserta jam, durasi, dan level. Kartu program punya rating 4.8/4.9, durasi, dan level berwarna. Padat tetapi tetap terbaca.
- Ulangan 3 (skor 2): Angka diberi target dan satuan, ditambah persentase harian dan streak 12 hari. Jadwal memperlihatkan tiga status berbeda dengan jam, durasi/jarak, dan level. Kartu program memuat durasi, level berwarna, dan rating bintang. Notifikasi diberi dot. Padat tetapi tetap terbaca.

**R10 pen.dev**

- Ulangan 1 (skor 2): Permukaan berlapis: kartu jadwal berikutnya ber-tint oranye, badge '12 hari' dan chip 'BERIKUTNYA' ber-tint, pill tab aktif ber-tint. Warna seri ring terdefinisi, titik legenda berwarna, foto matang, dan badge rating mengambang di atas foto.
- Ulangan 2 (skor 2): Permukaan berlapis: kartu berikutnya ber-tint oranye, pill tab aktif ber-tint, chip streak ber-tint. Warna seri ring (oranye/kuning/merah) konsisten dengan dot legenda. Chip 'BERIKUTNYA', badge rating di atas foto, dot notifikasi pada bel. Foto dan ikon matang dan menyatu.
- Ulangan 3 (skor 2): Permukaan berlapis: kartu 'BERIKUTNYA' ber-tint oranye, badge streak dan pill tab aktif bernuansa oranye gelap, chip 'BERIKUTNYA' terdefinisi. Ring tiga warna rapi. Foto program matang dengan overlay rating. Tab bar mengambang dengan sudut membulat.

### Bukti kriteria lain per ulangan

**Lakar**

- R1, ulangan 1 (skor 2): Artboard 390×844 dengan status bar 09:41 dan home indicator di bawah tab bar. Semua seksi ada: sapaan + avatar inisial 'DA', ringkasan dengan ring, jadwal 2 item (Lari pagi 5 km dengan circle-check 'Selesai', Kekuatan tubuh atas dengan tombol 'Mulai latihan' berikon play), 2 kartu program, dan tab bar 4 item (Beranda aktif oranye). Mode gelap, aksen oranye, seluruh teks berbahasa Indonesia.
- R1, ulangan 2 (skor 2): Artboard 390×844 dengan status bar 09:41 (±54px) di atas dan home indicator di bawah. Semua seksi ada: sapaan + avatar 'DA', kartu ringkasan dengan ring, jadwal 2 item ('Lari pagi 5 km' selesai dengan ikon circle-check; 'Kekuatan tubuh atas' dengan tombol 'Mulai latihan' ber-ikon play), 2 kartu program, tab bar 4 item (Beranda/Latihan/Statistik/Profil) dengan Beranda aktif berwarna oranye. Mode gelap, aksen oranye, seluruh copy Bahasa Indonesia.
- R1, ulangan 3 (skor 2): Artboard 390×844, status bar 09:41 di atas, dan home indicator di bawah tab bar (y≈827). Semua bagian ada: sapaan+avatar, ringkasan dengan ring, jadwal 2 item, 2 kartu program, dan tab bar 4 item (Beranda aktif berwarna oranye). Mode gelap, aksen oranye, seluruh copy berbahasa Indonesia.
- R2, ulangan 1 (skor 1): Fokus pada kartu ring ringkasan di atas, tetapi sapaan 'Selamat pagi, Dimas' setara ukurannya dengan judul seksi 'Jadwal latihan hari ini' dan 'Program untukmu' (skala datar). Tombol oranye penuh 'Mulai latihan' di tengah layar ikut bersaing merebut perhatian.
- R2, ulangan 2 (skor 1): Sapaan 'Selamat pagi, Dimas' (atas kiri) cukup tebal, tetapi skalanya hampir sama dengan angka ring '6.842' dan judul seksi 'Jadwal latihan hari ini' / 'Program untukmu' (~20px). Tombol oranye penuh 'Mulai latihan' ikut bersaing sebagai fokus. Fokus ada, tetapi lompatan skala kurang tegas.
- R2, ulangan 3 (skor 1): Ring dan angka di kartu ringkasan (y≈137–287) menjadi fokus, tetapi bersaing dengan tombol oranye penuh lebar 'Mulai latihan' (y≈492–536). Judul seksi 'Jadwal latihan hari ini' dan 'Program untukmu' (±18–20px) juga hampir setara dengan sapaan, sehingga lompatan skalanya kurang tegas.
- R4, ulangan 1 (skor 2): Oranye dipakai konsisten untuk aksi/aktif/seri utama: 'Kalender', 'Lihat semua', tombol 'Mulai latihan' dengan teks gelap, border kartu berikutnya, tab Beranda, ring luar. Nuansa oranye-peach di ring membedakan seri. Teks muted abu (metadata, tab tidak aktif) tampak terbaca di surface gelap.
- R4, ulangan 2 (skor 2): Oranye dipakai konsisten untuk ring utama, CTA 'Mulai latihan' (teks/ikon gelap di atas oranye), link 'Kalender'/'Lihat semua', centang selesai, chip 'Berikutnya', dan tab aktif. Seri ring memakai nuansa oranye-peach saja, tanpa warna liar. Teks muted ('06:30 · 32 menit · Selesai', '/ 10.000', label tab) tampak terbaca di surface gelap.
- R4, ulangan 3 (skor 2): Oranye dipakai untuk aksi dan status aktif: tombol 'Mulai latihan' dengan teks/ikon gelap di atasnya, 'Kalender', 'Lihat semua', centang selesai, dan tab Beranda. Ring memakai gradasi oranye–peach–krem sebagai seri. Teks muted seperti '06:30 · 32 menit · Selesai' dan label tab terbaca di atas surface gelap.
- R5, ulangan 1 (skor 2): Tanggal 'Rabu, 18 November' di atas sapaan tebal, avatar inisial 'DA' di kiri atas, tanpa emoji. Ikon garis satu gaya dan berukuran seragam (sepatu, dumbbell, api, figur yoga, ikon tab). Visual utama berupa ring progres yang relevan.
- R5, ulangan 2 (skor 2): Ikon satu gaya outline dengan ukuran seragam: jejak kaki, dumbbell, api, figur yoga, bel, dan ikon tab. Visual utama berupa ring progres di kartu ringkasan, relevan. Avatar inisial 'DA' di kiri atas. Tidak ada emoji.
- R5, ulangan 3 (skor 2): Avatar inisial 'DA' di kiri atas (y≈50–95). Tanggal di atas sapaan tebal 'Selamat pagi, Dimas', tanpa emoji. Ikon bergaya garis seragam: sepatu, dumbbell, api, figur yoga, dan tab. Visual utama berupa ring progres yang relevan. Tidak ada emoji.
- R6, ulangan 1 (skor 1): Legenda nilai/target ada: 6.842/10.000, 384/600 kkal, 27/45 mnt. Namun busur ring tengah dan dalam (peach) tampak hampir penuh (~85%), padahal kalori 64% dan menit aktif 60%. Ada satu inkonsistensi busur vs angka.
- R6, ulangan 2 (skor 2): Legenda nilai/target spesifik: 6.842/10.000, 384/600 kkal, 27/45 mnt. Busur ring (luar ±70%, dalam lebih pendek) kira-kira cocok dengan rasio 68/64/60%. Copy spesifik ('HIIT Bakar Lemak · 4 minggu · Menengah', '18:30 · 45 menit · 6 gerakan'), tanpa kontradiksi.
- R6, ulangan 3 (skor 2): Legenda nilai/target konsisten: 6.842/10.000, 384/600 kkal, 27/45 mnt. Busur ring sebanding (luar ±68%, dalam lebih pendek). Copy spesifik: 'Lari pagi 5 km', 'Kekuatan tubuh atas · 6 gerakan', 'HIIT Bakar Lemak · 4 minggu · Menengah'.
- R8, ulangan 1 (skor 1): Dua kartu program 'HIIT Bakar Lemak' dan 'Yoga Mobilitas' (bawah) berpola identik: ikon abu dalam kotak + judul + meta, sehingga tidak berbeda secara visual (kriteria golden 5 gagal). Langkah khas tetap ada: CTA lebar penuh tertanam di kartu jadwal berikutnya. Tidak ada pelanggaran slop.
- R8, ulangan 2 (skor 1): Kriteria golden 5 gagal: dua kartu program (bawah) berstruktur identik (tile ikon + judul + meta) dan hanya berbeda ikon, sehingga nyaris tidak bisa dibedakan secara visual. Tidak ada pelanggaran slop. Langkah khas yang ada: kartu sesi berikutnya ber-border oranye dengan CTA lebar penuh tertanam, dan tab bar mengambang.
- R8, ulangan 3 (skor 1): Kriteria golden 5 gagal: kedua kartu program (y≈612–705) identik secara visual, sama-sama berupa kotak ikon abu ditambah judul dan metadata, hanya ikonnya yang berbeda. Tidak ada pelanggaran checklist slop. Langkah khas tetap ada: kartu 'Berikutnya' dengan tombol CTA penuh lebar di dalamnya.

**pen.dev**

- R1, ulangan 1 (skor 0): Artboard memanjang sekitar 390×1109 px, bukan 844 (ukuran mengikat salah), dan home indicator tidak terlihat di bawah tab bar. Seksi lain lengkap: status bar 09:41 di atas, sapaan + avatar, kartu ringkasan dengan ring, jadwal 3 item (Lari pagi santai dengan circle-check, Upper body strength dengan tombol play, Yoga peregangan), 2 kartu rekomendasi, dan tab bar 4 item (Beranda aktif dalam pill oranye gelap). Judul 'Upper body strength' juga berbahasa Inggris.
- R1, ulangan 2 (skor 0): Ukuran mengikat salah: artboard memanjang jauh melewati 844px (tab bar berada di sekitar y≈1075 pada strip ±1109px). Ada juga copy berbahasa Inggris 'Upper body strength' pada item jadwal kedua, melanggar ketentuan Bahasa Indonesia. Seksi lain lengkap: 3 item jadwal dengan check dan play, 2 kartu rekomendasi, tab bar 4 item dengan Beranda aktif.
- R1, ulangan 3 (skor 0): Ukuran mengikat salah: artboard memanjang sekitar 390×1109 (tab bar berada di y≈1040–1100), bukan 844. Home indicator tidak terlihat di bawah tab bar. Ada copy berbahasa Inggris 'Upper body strength' pada kartu jadwal kedua (y≈617). Bagian konten sendiri lengkap: sapaan+avatar, ring, 3 jadwal, 2 kartu program, dan tab bar 4 item.
- R2, ulangan 1 (skor 1): Fokus ada pada kartu 'Ringkasan hari ini' (ring konsentris di kiri-tengah atas), tetapi bersaing dengan sapaan 'Selamat pagi, Rani' (tebal, kiri atas) yang ukurannya hampir sama dengan angka '6.842'. Lompatan skala ke judul seksi dan metadata cukup tegas, dan tidak ada judul yatim.
- R2, ulangan 2 (skor 2): Kartu ringkasan dengan ring tiga lapis besar (±140px) menjadi fokus tunggal di sepertiga atas. Angka 6.842/412/38 tebal dan lebih besar dari label, dan judul seksi jelas di atas isi. Setiap judul seksi diikuti kontennya (tidak ada judul yatim).
- R2, ulangan 3 (skor 2): Titik fokus tunggal ada di kartu Ringkasan (y≈150–415): tiga ring besar dengan angka 6.842/412/38 berukuran tebal ±20px. Skalanya melompat tegas: sapaan ±22 bold, judul seksi ±17 semibold, metadata ±12 abu. Setiap judul seksi diikuti kontennya, tidak ada judul yatim.
- R4, ulangan 1 (skor 1): Oranye dipakai konsisten untuk aksi dan status aktif: 'Lihat semua', 'Jelajahi', border kartu 'BERIKUTNYA', tombol play, tab Beranda. Ikon gelap di atas oranye (ikon dumbbell, play). Warna ring oranye/kuning/merah bermakna per metrik. Ada satu teks lemah: item selesai 'Lari pagi santai / 07:00 / 5 km · 32 mnt' (kartu jadwal pertama) diredupkan sehingga kontrasnya tampak di bawah 4.5:1.
- R4, ulangan 2 (skor 1): Aksen oranye konsisten untuk CTA play, tile ikon aktif, link 'Lihat semua'/'Jelajahi', level 'Pemula'/'Menengah', dan pill tab aktif. Kuning dan merah ring bermakna sebagai seri kategori. Satu teks lemah: label tab tidak aktif 'Latihan'/'Progres'/'Profil' (bawah) kecil dan abu redup, tampak di bawah 4.5:1.
- R4, ulangan 3 (skor 1): Oranye dipakai konsisten untuk aksi dan status aktif: 'Lihat semua', 'Jelajahi', tombol play, kartu 'BERIKUTNYA', dan tab Beranda. Kuning dan merah di ring bermakna sebagai seri kategori (kalori, menit aktif). Ikon di atas oranye berwarna gelap. Satu teks lemah: metadata item selesai '07:00' dan '5 km · 32 mnt' (y≈503–545) diredupkan hingga kontrasnya tampak di bawah 4.5:1.
- R5, ulangan 1 (skor 2): Tanggal 'Rabu, 18 November' di atas sapaan tebal, avatar foto di kiri atas, tanpa emoji tangan. Ikon garis satu gaya dengan ukuran seragam: lonceng, sepatu, dumbbell, bunga, chevron, ikon tab, api di badge '12 hari'. Foto kartu program relevan (lari malam, latihan kekuatan).
- R5, ulangan 2 (skor 2): Ikon outline seragam: jejak kaki, dumbbell, bunga, play, chevron, bintang rating, api streak, ikon tab. Visual utama relevan: ring progres dan dua foto program (pelari di jalan, pria latihan B/W). Avatar foto di kiri atas. Tanpa emoji.
- R5, ulangan 3 (skor 2): Avatar foto di kiri atas (x≈20–68, y≈70–118). Tanggal 'Rabu, 18 November' di atas sapaan 'Selamat pagi, Rani' yang tebal, tanpa emoji tangan. Ikon bergaya garis seragam: lonceng, sepatu, dumbbell, bunga yoga, chevron, dan tab. Foto atlet di kedua kartu program relevan. Tidak ada emoji.
- R6, ulangan 1 (skor 2): Legenda nilai/target: 6.842/10.000, 412/600 kkal, 38/45 mnt. Rata-rata (68%+69%+84%)/3 ≈ 74% cocok dengan subjudul '74% dari target harian'. Panjang busur ring kira-kira proporsional. Copy spesifik: 'Bakar Lemak 21 Hari', '5 km · 32 mnt', 'Menengah'.
- R6, ulangan 2 (skor 2): '74% dari target harian' konsisten dengan rata-rata 6.842/10.000 (68%), 412/600 (69%), dan 38/45 (84%). Panjang busur kira-kira sesuai. Copy spesifik ('Bakar Lemak 21 Hari · 3 minggu · Pemula', '20:30 Yoga peregangan · 20 mnt'). Masalah bahasa sudah dihitung di R1.
- R6, ulangan 3 (skor 2): Legenda nilai/target ditulis spesifik: 6.842/10.000, 412/600 kkal, 38/45 mnt. '74% dari target harian' konsisten dengan rata-rata 68%, 69%, dan 84%. Panjang busur sebanding dengan angkanya: ring dalam (merah) yang terpanjang. Copy spesifik: 'Bakar Lemak 21 Hari', '3 minggu · Pemula', rating 4.8/4.9.
- R8, ulangan 1 (skor 2): Dua kartu program jelas berbeda: foto berwarna jalanan vs foto hitam-putih, dengan level berbeda. Langkah khas yang bisa ditunjuk: item jadwal berikutnya disorot dengan border oranye dan badge 'BERIKUTNYA' di tengah daftar, serta ring tiga lapis dengan ikon petir di pusat. Tidak ada pelanggaran checklist slop.
- R8, ulangan 2 (skor 2): Tidak ada pelanggaran slop. Dua kartu rekomendasi jelas berbeda: foto berwarna di kiri, foto hitam-putih di kanan. Langkah khas: timeline jadwal dengan item selesai diredupkan, item berikutnya ber-border oranye dengan tombol play bulat, serta chip streak '12 hari' di kartu ringkasan.
- R8, ulangan 3 (skor 2): Tidak ada pelanggaran slop. Kedua kartu program jelas berbeda: foto berwarna (lari malam) dan foto monokrom (kekuatan), dengan level berbeda. Keputusan khas yang bisa ditunjuk: jadwal bertiga status (selesai diredupkan, 'BERIKUTNYA' bertepi dan ber-tint oranye dengan tombol play bulat, mendatang dengan chevron), ditambah badge streak '12 hari' di kartu ringkasan.

### Pemetaan X/Y per ulangan (dibuka setelah penilaian)

| Ulangan | Desain X | Desain Y | Status | Biaya |
|---|---|---|---|---|
| 1 | pen.dev | Lakar | ok | $0.16 |
| 2 | Lakar | pen.dev | ok | $0.15 |
| 3 | pen.dev | Lakar | ok | $0.16 |

## Biaya

Biaya juri total: $1.47 (A $1.01, B $0.47). Tidak ada biaya agen desain.
