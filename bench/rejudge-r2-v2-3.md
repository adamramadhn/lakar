# Penilaian ulang juri `r2-v2-3` (sumber: putaran 2)

Status: **lengkap**. Tanggal: 2026-11-19T03:15:38.969Z.

Strip PNG putaran sumber dinilai ulang dengan rubrik juri saat ini. Tidak ada agen desain yang dijalankan: status run dan gerbang Lakar diambil dari laporan sumber. Keputusan di bawah adalah keluaran juri dan aturan keputusan, menunggu tinjauan Adam.

## Sumber dan versi

- Sumber: `bench/round-2.json` (keputusan Adam dari `bench/round-2.md`)
- Strip A: Lakar `bench/runs/rounds/2/A-lakar.png`, pen.dev `bench/runs/rounds/2/A-pendev.png`
- Strip B: Lakar `bench/runs/rounds/2/B-lakar.png`, pen.dev `bench/runs/rounds/2/B-pendev.png`
- Model juri: `claude-opus-5-5`; Claude Code: 2.1.325 (Claude Code); git HEAD: `9d5632f84dc6a615ed076f2b3310ce8250c13a18`
- Versi rubrik: 2.3 (`bench/rubric/rubric.json`: versi 2.3, sama)
- sha256 teks juri A: `e3213b0bfccaf09eaab9d317ede5b961a1081b67feaf748e2d60474bb95aa7d7`
- sha256 teks juri B: `63d86a4231c30be0458b988b8ebed27d9a00410077314033fc420cf46f013655`
- Argv juri: `claude -p --input-format stream-json --output-format stream-json --verbose --model claude-opus-5-5 --tools "" --strict-mcp-config --mcp-config bench/runs/rejudge/r2-v2-3/mcp-empty.json --disable-slash-commands --no-session-persistence`
- Artefak mentah (gitignored): `bench/runs/rejudge/r2-v2-3/` (teks juri, pemetaan X/Y, transkrip per ulangan)

## Ringkasan

| Prompt | T Lakar (maks 16) | T pen.dev | D Lakar (maks 4) | D pen.dev | Keputusan v2.3 | Keputusan sumber | Keputusan Adam | Pelanggaran brief pen.dev |
|---|---|---|---|---|---|---|---|---|
| A | 13 | 12 | 4 | 2 | **Setara** | Setara (T 13 vs 13) | Setara | tidak ada |
| B | 12 | 11 | 4 | 3 | **Setara** | Lebih baik (T 13 vs 10) | Setara (diturunkan dari Lebih baik) | ukuran: board rgCT3 390×1044 ≠ 390×844 |

## Kalibrasi

putaran 2 = hold-out; hanya dilaporkan (tanpa ambang lulus).
- R9/R10 dengan rentang > 1 (ditandai untuk Adam, tidak menggagalkan): tidak ada

## Prompt A

- Gerbang Lakar (dari sumber): lolos
- Brief mengikat pen.dev (ukuran frame): sesuai
- Keputusan v2.3: **Setara**. Alasan: lolos gerbang, total 13 vs 12, daya tarik 4 vs 2, tanpa alasan Kalah.
- Kalah-daya-tarik: tidak ada; Kalah-lain: tidak ada; R Lakar 0 vs pen.dev 2: tidak ada
- Pelanggaran brief pen.dev: tidak ada
- Keputusan sumber: Setara (lolos gerbang, total 13 vs 13, daya tarik 4 vs 2, tanpa alasan Kalah); keputusan Adam: Setara

### Skor (ulangan valid 3 dari 3)

| Kriteria | Alat | Ulangan 1 | Ulangan 2 | Ulangan 3 | Median (rentang) |
|---|---|---|---|---|---|
| R1 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R1 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R2 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R2 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R4 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R4 | pen.dev | 2 | 2 | 1 | 2 (rentang 1) |
| R5 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R5 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R6 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R6 | pen.dev | 1 | 2 | 1 | 1 (rentang 1) |
| R8 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R8 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R9 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R9 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R10 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R10 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| **T** | Lakar |  |  |  | **13** |
| **T** | pen.dev |  |  |  | **12** |
| **D = R9 + R10** | Lakar |  |  |  | **4** |
| **D = R9 + R10** | pen.dev |  |  |  | **2** |
| Slop | Lakar |  |  |  | 0 (rentang 0) |
| Slop | pen.dev |  |  |  | 2 (rentang 1) |

### Bukti R9/R10 per ulangan

**R9 Lakar**

- Ulangan 1 (skor 2): Angka diberi konteks: '+12,4% vs Oktober', 'Margin 34,4% · sasaran 30%', 'Tutup buku: 12 hari lagi', dan 'Diperbarui 08.42'. Daftar menunjukkan variasi status: transaksi berstatus Lunas/Piutang 3 hari dan kategori 'Pendapatan usaha'/'Beban utilitas'/'Perlu ditinjau'. Detail sekunder ada di sebagian besar seksi: '4,8 dari 2.316 ulasan', 'Dipilih 64% pengguna baru', 'Cocok bila omzet < Rp 30 jt/bulan', baris jaminan pricing, dan status layanan di footer.
- Ulangan 2 (skor 2): Angka diberi konteks: '+12,4% vs Oktober', 'Margin 34,4% · sasaran 30%', 'Tutup buku: 12 hari lagi', 'Diperbarui 08.42', dan 'Dipilih 64% pengguna baru'. Daftar menunjukkan variasi status dan kategori: chip Lunas/Piutang 3 hari, tag Pendapatan usaha/Beban utilitas/Perlu ditinjau. Label kecil ada di hampir semua bagian (badge metrik fitur, catatan kaki tiap tier, baris garansi, status layanan di footer), dan tetap terbaca.
- Ulangan 3 (skor 2): Angka diberi konteks: '+12,4% vs Oktober', 'Margin 34,4% · sasaran 30%', 'Tutup buku: 12 hari lagi' (bagian 1). Daftar menunjukkan variasi status: Lunas, Piutang 3 hari, Pendapatan usaha, Beban utilitas, Perlu ditinjau. Detail sekunder ada di hampir semua bagian: 'Dipilih 64% pengguna baru' dan 'Cocok bila omzet < Rp 30 jt/bulan' di pricing, baris garansi, serta status layanan di footer. Padat tetapi tetap terbaca.

**R10 Lakar**

- Ulangan 1 (skor 2): Permukaan berlapis lengkap: hero dan testimoni ber-tint hijau, kartu Laba bersih, tier tengah, dan CTA penutup berwarna hijau gelap, ditambah kartu fitur besar ber-tint. Warna kedua bermakna (oranye untuk pengeluaran/piutang/perlu ditinjau) dipakai di mockup hero dan kartu fitur. Chip dan badge berwarna terdefinisi (Lunas, Piutang 3 hari, Hemat 16%, Paling populer). Grafik batang dan avatar inisial tampak matang.
- Ulangan 2 (skor 2): Permukaan berlapis: hero dan testimoni ber-tint mint, kartu Laba bersih hijau gelap, kartu fitur ber-tint, tier tengah dan CTA penutup gelap. Warna kedua bermakna (oranye untuk status/peringatan) dipakai di lebih dari satu bagian, yaitu mockup dan fitur. Badge dan chip berwarna terdefinisi (Hemat 16%, Paling populer, tag kategori). Ikon dan visual matang serta menyatu dengan desain.
- Ulangan 3 (skor 2): Permukaan berlapis: hero dan testimoni ber-tint hijau, kartu Laba bersih dan tier tengah hijau gelap, CTA penutup gelap. Warna kedua bermakna (oranye/amber untuk pengeluaran, piutang, perlu ditinjau, dan bintang) muncul di hero, fitur, dan testimoni. Badge/chip berwarna terdefinisi: kategori, 'Hemat 16%', 'Paling populer', 'Lunas'. Ikon dan mockup matang dan menyatu.

**R9 pen.dev**

- Ulangan 1 (skor 1): Sebagian angka diberi konteks: subjudul mockup menyebut periode November 2026, transaksi punya waktu dan arah ('Hari ini, 09:12', 'Kemarin'), dan footer kartu fitur memuat detail ('Hemat 6 jam / minggu'). Namun badge delta di kartu KPI tidak menyebut pembanding, testimoni tanpa angka hasil, dan pricing hanya berisi daftar fitur tanpa metadata. Status transaksi juga hanya dua jenis (masuk/keluar).
- Ulangan 2 (skor 1): Ada detail sekunder: badge persentase di kartu KPI, metadata waktu transaksi ('Hari ini, 09:12', '16 Nov'), baris metrik di kaki kartu fitur ('Hemat 6 jam / minggu'), statistik 4,9/5 dan Rp2,1T, serta deskripsi tiap tier. Namun persentase KPI tidak diberi pembanding atau periode, daftar transaksi hanya memuat variasi masuk/keluar tanpa status, dan pricing tidak punya metadata tambahan. Kekayaan hanya di sebagian bagian.
- Ulangan 3 (skor 1): Ada detail sekunder di sebagian bagian: badge delta pada kartu KPI, transaksi masuk/keluar dengan tanggal (bagian 2 atas), baris metadata di bawah tiap kartu fitur ('Hemat 6 jam / minggu'), serta statistik 4,9/5 dan Rp2,1T berlabel. Namun delta tidak menyebut periode pembanding, dan seksi pricing hanya berisi daftar fitur seragam tanpa catatan konteks.

**R10 pen.dev**

- Ulangan 1 (skor 1): Permukaan berlapis ada: hero ber-tint, seksi testimoni gelap dengan kartu hijau, dan tier tengah gelap. Badge delta dan chip 'Baru'/'Paling Populer' terdefinisi. Namun warna kedua bermakna tidak dipakai lintas seksi: merah hanya muncul di satu badge mockup, dan kuning hanya pada bintang testimoni. Kartu fitur dan pricing juga sebagian besar polos.
- Ulangan 2 (skor 1): Permukaan berlapis sudah ada: hero ber-tint mint, seksi testimoni gelap, blok testimoni hijau, dan kartu pricing gelap. Badge hijau di KPI dan 'Paling Populer' juga terdefinisi. Namun tidak ada warna kedua bermakna yang dipakai di lebih dari satu bagian: merah hanya pada satu badge mockup, kuning hanya pada bintang testimoni. Akibatnya polesan didominasi satu aksen di atas netral.
- Ulangan 3 (skor 1): Permukaan berlapis sudah ada: hero ber-tint hijau, seksi testimoni gelap dengan kartu hijau, kartu pricing gelap. Badge 'Baru', delta, dan 'Paling Populer' terdefinisi. Namun tidak ada warna kedua bermakna yang konsisten lintas seksi: merah hanya muncul di mockup dan kuning hanya di bintang testimoni. Selebihnya desain didominasi satu aksen di atas netral.

### Bukti kriteria lain per ulangan

**Lakar**

- R1, ulangan 1 (skor 2): Artboard lebar 1440px. Urutan seksi lengkap: navbar (atas), hero dengan headline, subjudul, CTA 'Coba gratis 14 hari' + 'Lihat demo 3 menit', dan mockup dashboard (bagian 1–2), 3 fitur bento (bagian 2), testimoni (bagian 3), pricing 3 tier dengan tengah 'Tumbuh' ditonjolkan (bagian 4), CTA penutup hijau gelap yang opsional, lalu footer (bagian 5). Aksen hijau dan seluruh teks berbahasa Indonesia.
- R1, ulangan 2 (skor 2): Lebar 1440px. Ketujuh bagian hadir berurutan: navbar → hero dengan badge, headline, subjudul, 2 CTA, dan mockup (bagian 1) → fitur (bagian 2) → testimoni (bagian 3) → pricing 3 tier (bagian 4) → CTA penutup gelap (opsional, diizinkan) → footer (bagian 5). Mode terang dengan aksen hijau, seluruh copy berbahasa Indonesia.
- R1, ulangan 3 (skor 2): Urutan bagian benar: navbar (bagian 1 atas), hero dengan headline, subjudul, 2 CTA dan mockup dashboard (bagian 1), fitur berupa 3 kartu dalam layout bento 1 besar + 2 kecil (bagian 2), testimoni (bagian 3), pricing 3 tier (bagian 3–4), CTA penutup opsional (bagian 4–5), footer (bagian 5). Lebar 1440px, aksen hijau, seluruh copy berbahasa Indonesia.
- R2, ulangan 1 (skor 2): Headline hero 'Tahu laba usahamu setiap hari, tanpa menyalin buku kas' ditulis display 2 baris, berupa klaim hasil, dan baris terakhir tidak yatim. Skalanya jauh di atas judul seksi (~32px) dan body. CTA primer hijau solid, sekunder outline putih. Tidak ada judul yatim di seksi lain.
- R2, ulangan 2 (skor 2): Headline hero 'Tahu laba usahamu setiap hari, tanpa menyalin buku kas' berukuran display, terdiri dari 2 baris, berisi klaim hasil, dan tidak menyisakan kata yatim (bagian 1 tengah). CTA primer hijau 'Coba gratis 14 hari' berdampingan dengan CTA sekunder outline 'Lihat demo 3 menit'. Hierarki ke judul seksi ('Pembukuan yang berjalan sendiri…', 'Mereka berhenti menebak laba usahanya') dan ke body jelas.
- R2, ulangan 3 (skor 2): Headline 'Tahu laba usahamu setiap hari, tanpa menyalin buku kas' berukuran display, 2 baris, berisi klaim hasil, tanpa kata yatim (bagian 1 tengah). Skala turun tegas ke subjudul dan ke H2 seksi. CTA primer 'Coba gratis 14 hari' hijau solid, CTA sekunder 'Lihat demo 3 menit' outline.
- R4, ulangan 1 (skor 1): Hijau tua dengan teks putih dipakai konsisten di navbar dan CTA hero. Ritme seksi terang/gelap baik: tint hijau → putih → tint → putih → hijau gelap → putih. Oranye bermakna untuk pengeluaran, piutang, dan 'Perlu ditinjau'. Satu penyimpangan: CTA tier 'Tumbuh' dan CTA penutup (bagian 4–5) memakai hijau terang (~#4ADE80) dengan teks gelap, padahal kriteria meminta aksen #15803D dengan teks putih. Ini menambah varian hijau kedua untuk aksi utama.
- R4, ulangan 2 (skor 1): Hijau dipakai konsisten untuk aksi dan keadaan aktif, dan oranye dipakai bermakna untuk status (Pengeluaran +3,1%, 'Piutang 3 hari', 'Perlu ditinjau'). Ritme terang/gelap ada: mint → putih → mint → putih → CTA gelap → footer. Namun avatar testimoni BH berwarna biru dan NL berwarna oranye hanya dekoratif, tanpa makna (bagian 3).
- R4, ulangan 3 (skor 1): Hijau sesuai #15803D dengan teks putih pada tombol hero. Ada ritme terang/gelap: hero tint → fitur putih → testimoni tint → pricing putih → CTA hijau gelap → footer putih. Oranye bermakna untuk pengeluaran, piutang, dan 'Perlu ditinjau'. Namun avatar 'BH' biru dan 'NL' oranye pada testimoni (bagian 3) memakai warna tanpa makna kategori: 1 pemakaian warna tanpa makna.
- R5, ulangan 1 (skor 1): Ikon bergaya garis Lucide konsisten (refresh-cw, message-circle, file-chart, check, star, shield), dan mockup dibangun dari shape dan teks nyata. Tidak ada emoji, termasuk di mockup. Namun wadah ikon fitur tidak seragam: kartu besar 'Transaksi tercatat otomatis' memakai kotak hijau solid dengan ikon putih, sedangkan 'Tagih piutang' dan 'Laporan siap bank' memakai kotak tint pucat dengan ikon hijau (bagian 2).
- R5, ulangan 2 (skor 1): Ikon bergaya Lucide konsisten, bintang rating berupa ikon star terisi, tidak ada emoji, dan mockup dashboard relevan. Namun kriteria golden 4 gagal: wadah ikon fitur tidak seragam. Ikon refresh di kartu besar memakai kotak hijau solid, sedangkan ikon chat dan file-chart memakai kotak mint muda (bagian 2). Selain itu, bagian bawah mockup terpotong tepi seksi sehingga baris 'Pasar Induk Caringin' terpotong (bagian 2 atas).
- R5, ulangan 3 (skor 1): Ikon Lucide konsisten: refresh-cw, message-circle, file-chart, star terisi, check, ikon trust bar, dan sosial footer. Visual utama berupa mockup dashboard dari shape nyata. Tidak ada emoji. Namun wadah ikon fitur tidak seragam: ikon pada kartu besar memakai kotak hijau solid dengan ikon putih, sedangkan dua kartu kanan memakai kotak tint muda dengan ikon hijau (bagian 2). Golden 'wadah seragam' gagal.
- R6, ulangan 1 (skor 2): Hitungan mockup benar: Pemasukan Rp 48,2 jt − Pengeluaran Rp 31,6 jt = Laba bersih Rp 16,6 jt, dan margin 34,4% juga benar (16,6/48,2). Setiap testimoni mencantumkan nama, usaha/peran, dan kota (Sari Rahmawati · Dapur Sari Rasa · Bandung; Bayu Hartono · Kopi Teduh · Yogyakarta; Nur Laila · Laila Hijab · Makassar). Rating memakai ikon star dengan angka 4,8/5. Angka saling konsisten: 'Hemat 16%' sama dengan hemat 2 bulan, dan '10 menit, bukan 2 hari' muncul di hero dan testimoni. Copy spesifik (KUR, SAK EMKM, PPh Final 0,5%).
- R6, ulangan 2 (skor 2): Angka di mockup konsisten: Pemasukan Rp 48,2jt − Pengeluaran Rp 31,6jt = Laba bersih Rp 16,6jt, dan margin 34,4% juga benar (bagian 1). Klaim '10 menit, bukan 2 hari' konsisten di hero, testimoni, dan CTA penutup. 'Dapur Sari Rasa' konsisten antara mockup dan testimoni. 'Hemat 2 bulan' sesuai dengan 'Hemat 16%'. Testimoni memuat nama, usaha, dan kota (Bandung, Yogyakarta, Makassar), dengan rating ikon star 4,8/5 dari 2.316 ulasan. Copy sangat spesifik: PPh Final 0,5%, mutasi BCA/BRI, Moka/Majoo.
- R6, ulangan 3 (skor 2): Mockup konsisten: Pemasukan Rp 48,2jt − Pengeluaran Rp 31,6jt = Laba bersih Rp 16,6jt, dan Margin 34,4% = 16,6/48,2 (bagian 1). Testimoni memuat nama, peran, usaha, dan kota: Sari Rahmawati, Pemilik Dapur Sari Rasa · katering · Bandung (cocok dengan mockup); Bayu Hartono, Yogyakarta; Nur Laila, Makassar. Rating memakai ikon star 4,8/5. Angka saling konsisten: '10 menit' di hero dan testimoni; 'Hemat 16%' setara 2 bulan dari 12.
- R8, ulangan 1 (skor 1): Tier tengah 'Tumbuh' ditonjolkan dengan satu cara utama (isi hijau gelap) plus badge 'Paling populer'. CTA tengah primer, dua tier lain outline, dan fitur memakai ikon check. Namun harga tier tengah 'Rp 129.000/bulan' tidak sesuai kriteria 'Rp 79rb/bulan' (bagian 4). Tidak ada pelanggaran checklist slop. Langkah khas terlihat: grid fitur bento dengan tabel transaksi berkategori di dalam kartu besar, dan testimoni utama dengan perbandingan '2 hari → 10 menit'.
- R8, ulangan 2 (skor 1): Kriteria golden 6 gagal pada harga: tier tengah 'Rp 129.000/bulan', bukan Rp 79rb/bulan. Unsur lain tier tengah sudah terpenuhi: kartu hijau gelap + badge 'Paling populer', CTA primer, tier lain outline, dan fitur memakai check (bagian 4). Tidak terlihat pelanggaran slop. Langkah khas yang bisa ditunjuk: fitur berformat bento asimetris dengan daftar transaksi berkategori di dalamnya (bagian 2), dan blok sebelum/sesudah '2 hari → 10 menit' di testimoni (bagian 3).
- R8, ulangan 3 (skor 1): Langkah khas yang bisa ditunjuk: bento fitur dengan tabel kategorisasi transaksi nyata di dalam kartu besar (bagian 2), dan blok perbandingan '2 hari → 10 menit' di testimoni (bagian 3). Tier tengah 'Tumbuh' ditonjolkan dengan kartu hijau gelap + badge 'Paling populer' + CTA primer, sementara tier lain memakai CTA outline dan fitur ber-check. Tidak ada pelanggaran slop. Namun harga 'Rp 129.000 /bulan', bukan Rp 79rb/bulan (golden gagal).

**pen.dev**

- R1, ulangan 1 (skor 2): Artboard lebar 1440px. Urutan seksi lengkap: navbar, hero dengan headline, subjudul, CTA 'Mulai Gratis 30 Hari' + 'Lihat Demo', dan mockup dashboard dalam bingkai browser (bagian 1–2), 3 kartu fitur (bagian 2), testimoni (bagian 3), pricing 3 tier dengan tengah 'Bisnis' ditonjolkan (bagian 4), lalu footer (bagian 5). Aksen hijau dan seluruh teks berbahasa Indonesia.
- R1, ulangan 2 (skor 2): Lebar 1440px. Ketujuh bagian hadir berurutan: navbar (logo Kasku, menu Fitur/Harga/Testimoni/Bantuan, Masuk + Coba Gratis) → hero (badge, headline, subjudul, 2 CTA, mockup dashboard bagian 1–2) → 3 kartu fitur (bagian 2) → testimoni gelap (bagian 3) → pricing 3 tier (bagian 4) → footer (bagian 5). Mode terang dengan aksen hijau, seluruh copy berbahasa Indonesia.
- R1, ulangan 3 (skor 2): Tujuh bagian hadir dan berurutan: navbar (logo Kasku, menu Fitur/Harga/Testimoni/Bantuan, Masuk + Coba Gratis) di bagian 1 atas; hero dengan headline, subjudul, 2 CTA dan mockup dashboard browser di bagian 1–2; 3 kartu fitur di bagian 2 bawah; testimoni berlatar gelap di bagian 3; pricing 3 tier di bagian 4; footer 4 kolom di bagian 5. Lebar 1440px, aksen hijau, seluruh copy berbahasa Indonesia.
- R2, ulangan 1 (skor 2): Headline hero 'Pembukuan usaha beres, Anda fokus berjualan.' ditulis display tebal 2 baris, berupa klaim hasil, dan tidak yatim. Lompatan skala tegas terhadap judul seksi dan body. CTA primer hijau solid dengan panah, sekunder outline putih 'Lihat Demo'.
- R2, ulangan 2 (skor 2): Headline hero 'Pembukuan usaha beres, Anda fokus berjualan.' berukuran display bold, terdiri dari 2 baris, berisi klaim hasil, dan tidak menyisakan kata yatim (bagian 1 tengah). Lompatan skala ke subjudul abu-abu tegas. CTA primer hijau solid 'Mulai Gratis 30 Hari' berdampingan dengan CTA sekunder outline 'Lihat Demo'. Judul seksi 'Semua yang dibutuhkan usaha Anda, dalam satu aplikasi.' dan 'Harga jujur yang tumbuh bersama usaha Anda.' terpecah rapi tanpa kata yatim.
- R2, ulangan 3 (skor 2): Headline hero 'Pembukuan usaha beres, Anda fokus berjualan.' berukuran display, terdiri dari 2 baris, berisi klaim hasil, dan tidak ada kata yatim (bagian 1 tengah). Skala turun tegas ke subjudul abu dan ke H2 seksi seperti 'Semua yang dibutuhkan usaha…' (bagian 2). CTA primer 'Mulai Gratis 30 Hari' berwarna hijau solid, CTA sekunder 'Lihat Demo' berbentuk outline putih.
- R4, ulangan 1 (skor 2): Aksen hijau dengan teks putih dipakai konsisten di navbar, CTA hero, 'Catat Transaksi', dan CTA tier Bisnis. Ritme seksi terang/gelap jelas: hero tint hijau → fitur putih → testimoni gelap → pricing abu terang → footer putih. Warna tambahan bermakna: merah untuk pengeluaran (+3,1%) dan kuning untuk bintang rating. Tidak ada teks yang terlihat gagal kontras; metadata abu di seksi gelap masih terbaca.
- R4, ulangan 2 (skor 2): Hijau dipakai konsisten untuk aksi dan keadaan aktif: tombol Coba Gratis/Mulai Gratis/Catat Transaksi, menu Ringkasan yang aktif, batang 'Masuk' di grafik, dan CTA tier Bisnis. Teks di atas hijau berwarna putih. Merah hanya muncul di badge +3,1% Pengeluaran (arah perubahan), kuning hanya di bintang rating (bermakna). Ritme terang/gelap antar-seksi ada: hero mint → fitur putih → testimoni gelap → harga abu terang → footer putih. Tidak terlihat teks yang gagal kontras.
- R4, ulangan 3 (skor 1): Aksen hijau dipakai konsisten untuk tombol, ikon fitur, check, dan kartu testimoni unggulan. Teks putih di atas hijau. Ada ritme terang/gelap antar-seksi: hero ber-tint → fitur putih → testimoni gelap (bagian 3) → pricing terang → footer putih. Merah pada '+3,1%' Pengeluaran dan kuning bintang bermakna. Namun hijau aksen (tombol 'Coba Gratis', bagian 1 kanan atas) terlihat condong teal/sea-green, tidak sesuai #15803D. Satu kriteria golden R4 gagal.
- R5, ulangan 1 (skor 2): Ikon bergaya garis Lucide konsisten di sidebar mockup, arah transaksi, check, dan sosial footer. Ikon fitur (receipt, bar-chart, boxes) berada dalam kotak hijau solid yang seragam (bagian 2). Mockup dibangun dari shape nyata dan relevan, dan sapaan 'Selamat pagi, Bu Sari' tanpa emoji. Bintang rating di testimoni berupa ikon star outline yang konsisten dengan gaya ikon lain.
- R5, ulangan 2 (skor 2): Seluruh ikon bergaya garis Lucide: sidebar mockup, ikon panah transaksi, ikon fitur (struk-dolar, grafik batang, boxes) dalam wadah kotak hijau seragam 48px (bagian 2), bintang outline di testimoni, check di pricing, dan ikon sosial di footer. Visual utama berupa mockup dashboard nyata yang relevan (kartu KPI, grafik Arus Kas 6 Bulan, Transaksi Terbaru). Tidak ada emoji; sapaan 'Selamat pagi, Bu Sari' juga tanpa emoji.
- R5, ulangan 3 (skor 2): Ikon bergaya garis ala Lucide konsisten: sidebar mockup, ikon fitur receipt/chart/boxes dalam kotak hijau seragam 48px (bagian 2), bintang outline pada testimoni (bagian 3), check pada pricing, ikon sosial footer. Visual utama berupa mockup dashboard relevan dan dibangun dari shape/teks nyata. Tidak ada emoji, termasuk pada sapaan 'Selamat pagi, Bu Sari'.
- R6, ulangan 1 (skor 1): Hitungan dasar mockup benar: Pemasukan Rp48,2jt − Pengeluaran Rp21,7jt = Laba Bersih Rp26,5jt. Testimoni lengkap dengan nama, usaha, dan kota (Kopi Bu Sari, Yogyakarta; Toko Batik Laras, Pekalongan; Katering Dapur Ibu, Surabaya), dan nama usaha testimoni utama cocok dengan mockup. Satu inkonsistensi: badge Laba '+18,9%' tidak cocok dengan pemasukan +12,4% dan pengeluaran +3,1%. Dari kedua delta itu laba sebelumnya ≈ Rp21,8jt, sehingga kenaikannya ≈ +21%.
- R6, ulangan 2 (skor 2): Angka di mockup konsisten: Pemasukan Rp48,2jt − Pengeluaran Rp21,7jt = Laba Bersih Rp26,5jt (bagian 1). Copy spesifik: QRIS, SAK EMKM, KUR, GoFood, 'Beli biji kopi'. Testimoni memuat nama, usaha, dan kota (Sari Wulandari – Kopi Bu Sari, Yogyakarta; Rizky Pratama – Toko Batik Laras, Pekalongan; Dewi Anggraini – Katering Dapur Ibu, Surabaya), dengan rating ikon star. Nama 'Kopi Bu Sari' konsisten antara mockup dan testimoni. Masa coba '30 hari' konsisten antara hero dan pricing.
- R6, ulangan 3 (skor 1): Mockup konsisten secara nominal: Pemasukan Rp48,2jt − Pengeluaran Rp21,7jt = Laba Rp26,5jt (bagian 1 bawah). Testimoni memuat nama, usaha, dan kota (Sari Wulandari – Kopi Bu Sari, Yogyakarta; Rizky Pratama – Toko Batik Laras, Pekalongan; Dewi Anggraini – Katering Dapur Ibu, Surabaya) dan rating memakai ikon star. Satu inkonsistensi: dari delta +12,4% dan +3,1%, laba bulan lalu ≈ Rp21,6jt, sehingga kenaikan laba ≈ +22%, bukan '+18,9%' seperti di kartu Laba Bersih.
- R8, ulangan 1 (skor 1): Tier tengah 'Bisnis' ditonjolkan dengan isi gelap plus badge 'Paling Populer'. CTA tengah primer hijau, dua tier lain outline, dan fitur memakai check. Namun harga 'Rp99rb / bulan' tidak sesuai kriteria 'Rp 79rb/bulan' (bagian 4). Ada 2 pelanggaran slop (judul fitur generik dan statistik bulat). Langkah khas terlihat: seksi testimoni gelap dengan kutipan utama besar di kartu hijau di samping dua kartu kecil.
- R8, ulangan 2 (skor 1): Kriteria golden 6 gagal pada harga: tier tengah tertulis 'Rp99rb / bulan', bukan Rp 79rb/bulan. Unsur lain tier tengah sudah terpenuhi: ditonjolkan dengan kartu gelap terangkat ditambah badge 'Paling Populer', CTA primer hijau, tier lain outline, dan fitur memakai check (bagian 4). Ada 2 pelanggaran slop (lihat daftar slop). Langkah khas yang bisa ditunjuk: testimoni utama dalam blok hijau besar di samping dua kartu gelap (bagian 3).
- R8, ulangan 3 (skor 1): Ada langkah khas yang bisa ditunjuk: testimoni asimetris dengan kartu hijau besar di kiri dan 2 kartu bertumpuk di kanan di atas seksi gelap (bagian 3). Tier tengah 'Bisnis' ditonjolkan dengan kartu gelap + badge 'Paling Populer' + CTA primer hijau, sementara tier lain memakai CTA outline dan fitur ber-check. Namun harga tier tengah 'Rp99rb / bulan', bukan Rp 79rb/bulan (golden gagal), dan ada 1 pelanggaran slop (statistik '12.000+').

### Pemetaan X/Y per ulangan (dibuka setelah penilaian)

| Ulangan | Desain X | Desain Y | Status | Biaya |
|---|---|---|---|---|
| 1 | Lakar | pen.dev | ok | $0.37 |
| 2 | pen.dev | Lakar | ok | $0.36 |
| 3 | pen.dev | Lakar | ok | $0.36 |

## Prompt B

- Gerbang Lakar (dari sumber): lolos
- Brief mengikat pen.dev (ukuran frame): board rgCT3 390×1044 ≠ 390×844
- Keputusan v2.3: **Setara**. Alasan: lolos gerbang, total 12 vs 11, daya tarik 4 vs 3, tanpa alasan Kalah.
- Kalah-daya-tarik: tidak ada; Kalah-lain: tidak ada; R Lakar 0 vs pen.dev 2: tidak ada
- Pelanggaran brief pen.dev: ukuran: board rgCT3 390×1044 ≠ 390×844
- Keputusan sumber: Lebih baik (lolos gerbang, total 13 ≥ 10 + 3, daya tarik 4 ≥ 3); keputusan Adam: Setara (diturunkan dari Lebih baik)

### Skor (ulangan valid 3 dari 3)

| Kriteria | Alat | Ulangan 1 | Ulangan 2 | Ulangan 3 | Median (rentang) |
|---|---|---|---|---|---|
| R1 | Lakar | 1 | 1 | 1 | 1 (rentang 0) |
| R1 | pen.dev | 0 | 1 | 1 | 1 (rentang 1) |
| R2 | Lakar | 2 | 1 | 2 | 2 (rentang 1) |
| R2 | pen.dev | 1 | 1 | 2 | 1 (rentang 1) |
| R4 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R4 | pen.dev | 0 | 1 | 1 | 1 (rentang 1) |
| R5 | Lakar | 0 | 0 | 2 | 0 (rentang 2) **periksa Adam** |
| R5 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| R6 | Lakar | 1 | 1 | 2 | 1 (rentang 1) |
| R6 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R8 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R8 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R9 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R9 | pen.dev | 2 | 2 | 2 | 2 (rentang 0) |
| R10 | Lakar | 2 | 2 | 2 | 2 (rentang 0) |
| R10 | pen.dev | 1 | 1 | 1 | 1 (rentang 0) |
| **T** | Lakar |  |  |  | **12** |
| **T** | pen.dev |  |  |  | **11** |
| **D = R9 + R10** | Lakar |  |  |  | **4** |
| **D = R9 + R10** | pen.dev |  |  |  | **3** |
| Slop | Lakar |  |  |  | 1 (rentang 1) |
| Slop | pen.dev |  |  |  | 0 (rentang 1) |

### Bukti R9/R10 per ulangan

**R9 Lakar**

- Ulangan 1 (skor 2): Angka diberi konteks: target per metrik, tren vs kemarin, streak 'Hari ke-12 beruntun'. Jadwal memuat variasi status (selesai, berikutnya, mendatang) beserta metadata jarak, durasi, kalori, dan alat. Kartu program menampilkan level, durasi, frekuensi, rating, dan jumlah peserta. Padat tetapi tetap terbaca.
- Ulangan 2 (skor 2): Angka punya target, satuan, dan tren pembanding kemarin. Streak 'Hari ke-12 beruntun'. Jadwal punya variasi status (2 selesai, 1 berikutnya, 1 mendatang) dan metadata kkal/alat/pemulihan. Kartu program memuat durasi, frekuensi, rating, dan jumlah peserta.
- Ulangan 3 (skor 2): Angka diberi konteks: target per metrik, streak 'Hari ke-12 beruntun', dan pembanding '+1.206 langkah vs kemarin di jam yang sama'. Jadwal menunjukkan variasi status (selesai, berikutnya, nanti dengan chevron) dan metadata jarak/durasi/kkal/alat. Kartu program memuat durasi, frekuensi, rating, dan jumlah peserta.

**R10 Lakar**

- Ulangan 1 (skor 2): Permukaan berlapis: kartu ringkasan dan item berikutnya ber-tint coklat-oranye, tab aktif ber-tint oranye, tile ikon gelap. Warna kedua bermakna dipakai di lebih dari satu bagian: hijau untuk check jadwal dan panah tren di ringkasan. Chip berwarna terdefinisi: 'Hari ke-12 beruntun', 'Berikutnya', 'Pemula'/'Menengah'. Foto program dan grafik ring tampak matang dan menyatu.
- Ulangan 2 (skor 2): Permukaan gelap ber-tint coklat hangat berlapis, kartu ringkasan lebih terang, item berikutnya ber-tint oranye dengan border. Warna kedua bermakna dipakai di lebih dari satu bagian: hijau/teal di ring, centang selesai, dan panah tren. Badge berwarna (streak, 'Berikutnya', Pemula/Menengah). Foto dan ring tampak matang.
- Ulangan 3 (skor 2): Permukaan berlapis bernuansa coklat hangat: kartu ringkasan ber-tint, item berikutnya ber-tint oranye, dan kotak ikon bulan ber-tint. Warna kedua bermakna (hijau status/tren) muncul di ring card dan jadwal, ditambah teal dan kuning sebagai seri. Badge dan chip terdefinisi: 'Berikutnya', 'Pemula', 'Menengah', streak. Foto dan ring matang, tab bar mengambang dengan pill aktif.

**R9 pen.dev**

- Ulangan 1 (skor 2): Target pada setiap metrik, chip streak '12 hari', label status per item jadwal (Selesai/Berikut/Nanti), tingkat kesulitan (Mudah/Sedang), serta level, durasi, dan frekuensi di kartu program. Belum ada tren atau pembanding dan rating program, tetapi detail sekunder hadir di sebagian besar bagian.
- Ulangan 2 (skor 2): Angka diberi target dan satuan (/10.000, /650 kkal, /45 mnt). Badge streak '12 hari'. Jadwal menunjukkan variasi status (Selesai/Berikut/Nanti), durasi, dan tingkat kesulitan ('Mudah', 'Sedang'). Kartu program punya badge level dan metadata durasi/frekuensi. Padat tetapi terbaca.
- Ulangan 3 (skor 2): Ada target per metrik, chip streak '12 hari', label status per item jadwal ('Selesai', 'Berikut', 'Nanti'), tingkat kesulitan ('Mudah', 'Sedang'), serta durasi dan frekuensi pada kartu program. Konteks pembanding atau tren tidak ada, tetapi sebagian besar bagian tetap memiliki detail sekunder.

**R10 pen.dev**

- Ulangan 1 (skor 1): Kartu memakai abu gelap netral polos tanpa tint warna utama, kecuali satu pita oranye. Tidak ada warna kedua bermakna: seri ring hanya gradasi oranye-krem, check memakai oranye. Chip (streak, Pemula/Menengah) dan foto cukup matang, tetapi satu unsur kolom 2 (warna kedua bermakna) tidak ada.
- Ulangan 2 (skor 1): Komponen cukup terpoles: badge streak ber-tint oranye, kotak ikon, foto dengan badge, tab aktif berupa pil ber-tint. Namun permukaan sebagian besar abu-abu netral polos, dan tidak ada warna kedua bermakna; ring hanya memakai gradasi oranye/krem. Satu unsur kolom 2 tidak ada.
- Ulangan 3 (skor 1): Permukaan memakai abu netral polos (#1C1C1E-an) tanpa tint warna utama, kecuali kartu oranye penuh. Tidak ada warna kedua bermakna: ring, check, dan chip semuanya oranye atau turunannya. Badge, chip, dan foto cukup matang, tetapi satu unsur kolom 2 (warna kedua bermakna) tidak ada.

### Bukti kriteria lain per ulangan

**Lakar**

- R1, ulangan 1 (skor 1): Kedua artboard lebar 390 dengan tinggi ≥ 844. Status bar (07:12) dan home indicator ada di bawah tab bar pada kedua artboard. Semua bagian ada: sapaan, avatar, ring ringkasan, jadwal 4 item, 2 kartu program (artboard kedua sebagai keadaan gulir), dan tab bar 4 item (house, dumbbell, chart-column, user) dengan Beranda aktif ber-tint oranye. Mode gelap, aksen oranye, Bahasa Indonesia. Satu kriteria golden gagal: item berikutnya 'Kekuatan tubuh atas' (17:30, tengah jadwal) hanya diberi chip 'Berikutnya', tanpa aksi primer 'Mulai'/play.
- R1, ulangan 2 (skor 1): Dua artboard 390x844 (layar awal dan keadaan tergulir), masing-masing dengan status bar 07:12 dan home indicator, jadi golden 1 terpenuhi. Tab bar 4 item Beranda/Latihan/Progres/Profil dengan Beranda aktif (golden 6). Mode gelap, aksen oranye, bahasa Indonesia, dan 2 kartu rekomendasi ada di artboard kedua. Golden 4 gagal: item berikutnya 'Kekuatan tubuh atas' (17:30) hanya diberi badge 'Berikutnya', tanpa aksi primer 'Mulai'/play.
- R1, ulangan 3 (skor 1): Lebar 390 dengan dua artboard sekitar 844: keadaan awal dan keadaan setelah digulir. Status bar (07:12) dan home indicator ada di bawah tab bar pada kedua artboard. Semua bagian lengkap: sapaan + avatar, ring ringkasan, jadwal 4 item, 2 kartu rekomendasi (artboard 2), dan tab bar 4 ikon (Beranda aktif). Mode gelap, aksen oranye, Bahasa Indonesia. Satu kriteria golden gagal: item berikutnya 'Kekuatan tubuh atas' (17:30) hanya diberi badge 'Berikutnya', tanpa aksi primer 'Mulai'/play. Dua item selesai sudah memakai circle-check hijau.
- R2, ulangan 1 (skor 2): Kartu ringkasan dengan tiga ring konsentris dan angka besar '7.482' menjadi fokus tunggal di atas-tengah. Skala bertingkat tegas: sapaan 'Pagi, …' tebal ±22px dengan tanggal kecil abu di atasnya, judul seksi ±20px ('Ringkasan hari ini', 'Jadwal latihan hari ini', 'Rekomendasi program'), judul item ±15px, metadata ±13px. Setiap judul seksi diikuti kontennya.
- R2, ulangan 2 (skor 1): Fokus ada di kartu ring ringkasan dengan angka tebal 7.482/412/38. Namun lompatan skala lemah: sapaan 'Pagi, Nadia' hampir sama besar dengan judul seksi 'Ringkasan hari ini' dan 'Jadwal latihan hari ini', sehingga sapaan bersaing dengan judul seksi.
- R2, ulangan 3 (skor 2): Fokus tunggal ada di kartu ringkasan: ring konsentris dan angka besar '7.482' (sekitar 26px bold) di kanan ring. Lompatan skala tegas antara sapaan 'Pagi, Nadia' (22px bold), judul seksi ('Ringkasan hari ini', 'Jadwal latihan hari ini', 'Rekomendasi program'), judul item, dan metadata muted. Setiap judul seksi diikuti kontennya, jadi tidak ada judul yatim.
- R4, ulangan 1 (skor 2): Oranye dipakai untuk tab aktif, link 'Kalender'/'Lihat semua', border item berikutnya, chip streak, dan seri langkah. Warna tambahan bermakna: kuning = kalori, teal = menit aktif, hijau = status selesai dan tren naik (+1.206). Ikon dumbel di tile oranye berwarna gelap (on-accent). Teks muted abu (metadata jadwal, '/ 10.000') terbaca cukup di surface gelap.
- R4, ulangan 2 (skor 2): Oranye dipakai untuk aksi dan status aktif: tab aktif, border item berikutnya, link 'Kalender'/'Lihat semua', badge streak. Ikon dumbel gelap di atas kotak oranye (golden 7). Warna tambahan bermakna: kuning dan teal sebagai seri kalori dan menit pada ring, hijau untuk centang selesai dan panah tren naik. Tidak ada teks yang terlihat gagal kontras.
- R4, ulangan 3 (skor 2): Oranye konsisten dipakai untuk aksi dan keadaan aktif: link 'Kalender'/'Lihat semua', border item berikutnya, tab Beranda aktif, ring langkah, dan chip 'Hari ke-12 beruntun'. Ikon dumbel di kotak oranye (17:30) berwarna gelap. Warna tambahan bermakna: kuning untuk seri kalori, teal untuk seri menit aktif, hijau untuk status selesai (circle-check) dan tren naik (+1.206). Teks muted abu terang di surface coklat gelap tetap terbaca.
- R5, ulangan 1 (skor 0): Ikon UI bergaya garis seragam (sepatu, mobilitas, dumbel, bulan, check, chevron, tab bar). Sapaan punya tanggal di atasnya dan avatar foto di kiri atas tanpa emoji tangan. Namun rating pada kedua kartu program memakai emoji bintang '⭐ 4,8' dan '⭐ 4,7' (bawah kartu, artboard 2) sebagai ikon UI, yaitu 2 emoji.
- R5, ulangan 2 (skor 0): Ikon garis jadwal dan tab bar seragam, dan foto program relevan. Namun rating di kedua kartu program memakai emoji bintang kuning berwarna ('⭐ 4,8' dan '⭐ 4,7', artboard kedua bagian bawah), yaitu 2 emoji yang berfungsi sebagai ikon UI.
- R5, ulangan 3 (skor 2): Tanggal 'Rabu, 18 November' di atas sapaan 'Pagi, Nadia' yang tebal, avatar foto dengan cincin oranye di kiri atas, tanpa emoji tangan. Ikon bergaya outline seragam pada jadwal (sepatu, matras, dumbel, bulan), lonceng, dan tab bar (house, dumbbell, chart-column, user). Foto latihan di dua kartu program relevan. Bintang rating berupa ikon, bukan emoji.
- R6, ulangan 1 (skor 1): Copy spesifik: 'Lari pagi zona 2 · 5,2 km · 32 mnt · 318 kkal', '+1.206 langkah vs kemarin di jam yang sama', '4 minggu · 3x/minggu · 2.418 peserta'. Legenda nilai/target lengkap (7.482/10.000, 412/600 kkal, 38/45 mnt) dan busur kira-kira sebanding dengan nilainya. Ada satu inkonsistensi: status bar menunjukkan 07:12, tetapi item 12:15 'Mobilitas pinggul' sudah bercentang selesai.
- R6, ulangan 2 (skor 1): Copy spesifik ('Lari pagi zona 2', '5,2 km · 32 mnt · 318 kkal', 'Mobilitas pinggul'). Legenda nilai/target ada dan busur tampak cocok (75%/69%/84%). Ada satu inkonsistensi: dua sesi yang sudah selesai berjumlah 32 + 15 = 47 mnt, tetapi menit aktif tertulis 38 / 45 mnt.
- R6, ulangan 3 (skor 2): Busur cocok dengan angka: 7.482/10.000 (~75%) pada busur oranye luar, 412/600 kkal (~69%) pada busur kuning, 38/45 mnt (~84%) pada busur teal. Legenda menampilkan nilai/target. Copy spesifik, misalnya 'Lari pagi zona 2 · 5,2 km · 32 mnt · 318 kkal', 'Mobilitas pinggul · tanpa alat', dan '4,8 · 2.418 peserta'. Tidak ada kontradiksi.
- R8, ulangan 1 (skor 2): Satu-satunya pelanggaran slop adalah emoji bintang, yang dihitung di R5. Keputusan komposisi khas yang terlihat di PNG: kolom jam monospace di kiri jadwal, item berikutnya ditandai border oranye dan tile ikon oranye, tab bar mengambang berbentuk pil, dan ring konsentris tiga warna. Dua kartu program dibedakan oleh foto dan label level (Pemula vs Menengah).
- R8, ulangan 2 (skor 2): Tidak ada pelanggaran checklist slop selain emoji (dihitung di R5). Keputusan khas yang bisa ditunjuk: kolom jam monospace di jadwal, baris tren '+1.206 langkah vs kemarin di jam yang sama' di bawah ring, dan header lengket pada artboard tergulir. Dua kartu program dibedakan oleh foto dan badge level.
- R8, ulangan 3 (skor 2): Tidak ada pelanggaran checklist slop. Dua kartu program dibedakan oleh foto berbeda serta badge 'Pemula' dan 'Menengah'. Keputusan komposisi khas: kolom jam monospace di kiri setiap item jadwal sebagai timeline, item berikutnya ditandai border oranye dengan ikon terisi, dan header menempel saat digulir (artboard 2).

**pen.dev**

- R1, ulangan 1 (skor 0): Artboard lebar 390, tinggi ±1044 (sah), status bar 9:41 ada; mode gelap, aksen oranye, Bahasa Indonesia; semua bagian ada dan tab bar 4 item (house, dumbbell, chart-column, user) dengan Beranda aktif. Dua kriteria golden gagal: (1) tidak terlihat home indicator di bawah tab bar; (2) item berikutnya 'Peregangan' (12.30, tengah) hanya punya tombol play tanpa label aksi 'Mulai'.
- R1, ulangan 2 (skor 1): Artboard lebar 390 dan tinggi sekitar 1044 (≥844). Status bar 9:41 ada di atas. Semua bagian prompt ada: sapaan dan avatar, ringkasan dengan ring, jadwal 3 item, 2 kartu rekomendasi, tab bar 4 ikon. Mode gelap, aksen oranye, bahasa Indonesia. Kriteria golden 1 gagal: tidak ada home indicator di bawah tab bar. Kriteria golden 4 terpenuhi (07.00 'Selesai' dengan centang, 12.30 'Berikut' dengan tombol play) dan golden 6 terpenuhi (Beranda/Latihan/Statistik/Profil, Beranda aktif dengan pil oranye). Tepat satu golden gagal.
- R1, ulangan 3 (skor 1): Lebar 390, tinggi sekitar 1044 (≥ 844), status bar 9:41 ada. Semua bagian lengkap: sapaan + avatar, ring, jadwal 3 item, 2 kartu 'Rekomendasi untukmu', tab bar 4 ikon. Mode gelap, aksen oranye, Bahasa Indonesia. Jadwal sesuai: 'Lari pagi' selesai dengan check dalam lingkaran, 'Peregangan' berikutnya dengan tombol play bulat. Satu kriteria golden gagal: tidak ada home indicator di bawah tab bar (bawah artboard).
- R2, ulangan 1 (skor 1): Fokus yang dimaksud adalah kartu ring dengan angka '7.842' (atas). Namun item jadwal 'Peregangan' yang diisi penuh oranye di tengah layar bersaing kuat sebagai titik paling mencolok. Skala lainnya tegas: sapaan besar tebal, judul seksi ±18px, metadata kecil.
- R2, ulangan 2 (skor 1): Fokus ada di kartu 'Ringkasan hari ini' (ring konsentris dan angka 7.842 yang tebal). Namun kartu jadwal 'Peregangan' yang berlatar oranye penuh di tengah halaman bersaing kuat sebagai titik fokus kedua. Sapaan 'Halo, Adam' besar dan tebal dengan tanggal kecil di atasnya, skalanya jelas.
- R2, ulangan 3 (skor 2): Titik fokus jelas: kartu jadwal 'Peregangan' (12.30) yang terisi oranye penuh di tengah layar, didukung ring card di atasnya. Skala tegas antara sapaan 'Halo, Adam' (sekitar 26px bold), angka metrik '7.842', judul seksi, dan metadata kecil. Tidak ada judul yatim.
- R4, ulangan 1 (skor 0): Item berikutnya berlatar oranye penuh memakai teks putih: '12.30', 'Berikut', 'Peregangan', '10 mnt · Mudah' (tengah layar). Itu ≥ 2 teks dengan kontras di bawah 4.5:1, dan teks di atas aksen tidak memakai warna gelap #1A0F05 seperti yang diminta golden.
- R4, ulangan 2 (skor 1): Aksen oranye konsisten: kartu jadwal berikutnya, tab aktif, link 'Lihat semua'/'Jelajahi', badge streak. Teks dan ikon gelap di atas oranye ('12.30', 'Peregangan', tombol play gelap), jadi golden 7 terpenuhi. Ada satu teks lemah: baris selesai 'Lari pagi' dan '5 km · 32 mnt' di kartu jadwal pertama diredupkan, abu-abu gelap di atas surface gelap.
- R4, ulangan 3 (skor 1): Aksen oranye konsisten pada item berikutnya (teks dan ikon gelap di atas oranye), tab aktif, link 'Lihat semua'/'Jelajahi', dan ring. Satu teks lemah: baris selesai 'Lari pagi' beserta metadata '5 km · 32 mnt' dan label 'Selesai' diredupkan menjadi abu gelap di atas kartu gelap sehingga kontrasnya terlihat kurang.
- R5, ulangan 1 (skor 1): Ikon bergaya garis seragam (sepatu, figur, dumbel, check, play, chevron, petir di pusat ring, tab bar). Avatar foto di kanan atas dan tanggal di atas sapaan. Namun ada 1 emoji tangan melambai 👋 dekoratif di sapaan (kiri atas), yang juga menggagalkan kriteria golden sapaan.
- R5, ulangan 2 (skor 1): Ikon garis seragam di tab bar dan jadwal (sepatu, orang, dumbel), lonceng, chevron. Foto gym dan foto jalan kota relevan untuk 'Kuat 30 Hari' dan 'Lari 5K Pertama'. Ada glyph tangan melambai di sebelah 'Halo, Adam' (kiri atas), sehingga golden 2 ('tanpa emoji tangan') gagal.
- R5, ulangan 3 (skor 1): Ada satu emoji tangan melambai '👋' di sapaan 'Halo, Adam' (kiri atas), sehingga kriteria golden 'tanpa emoji tangan' gagal. Tanggal di atas sapaan dan avatar foto di kanan atas tersedia. Ikon jadwal dan tab bar bergaya outline seragam. Foto kartu program relevan (gym, lari kota).
- R6, ulangan 1 (skor 2): Legenda nilai/target lengkap: 7.842/10.000, 486/650 kkal, 32/45 mnt. Busur ketiga ring masing-masing sekitar 70–78%, cocok dengan angkanya. Status jadwal konsisten dengan jam 9:41 (07.00 Selesai, 12.30 Berikut, 18.00 Nanti). Copy spesifik: 'Lari 5K Pertama · 6 minggu · 3x/minggu', 'HIIT Kardio · 25 mnt · Sedang'.
- R6, ulangan 2 (skor 2): Copy spesifik: 'Lari pagi 5 km · 32 mnt', 'Kuat 30 Hari 4 minggu · 20 mnt/hari'. Angka konsisten: menit aktif 32/45 sama dengan 32 mnt dari satu sesi yang selesai. Legenda nilai/target ada untuk langkah 7.842/10.000, kalori 486/650 kkal, menit 32/45 mnt. Busur di tiga ring tampak sebanding (sekitar 70–78%).
- R6, ulangan 3 (skor 2): Busur cocok dengan angka: 7.842/10.000 (~78%), 486/650 kkal (~75%), dan 32/45 mnt (~71%) pada tiga ring konsentris. Legenda menampilkan nilai/target. Angka konsisten antarbagian: 'Lari pagi 5 km · 32 mnt' cocok dengan menit aktif 32. Copy spesifik, misalnya 'Kuat 30 Hari · 20 mnt/hari' dan 'Lari 5K Pertama · 3x/minggu'.
- R8, ulangan 1 (skor 2): Tidak ada pelanggaran checklist slop di luar emoji (dihitung di R5). Langkah khas yang bisa ditunjuk: item 'berikutnya' dibuat sebagai pita oranye penuh dengan tombol play bulat gelap, dan kolom jam plus label status dipisah garis vertikal. Dua kartu program dibedakan oleh foto gym vs jalan kota dan level Pemula vs Menengah.
- R8, ulangan 2 (skor 2): Tidak ada pelanggaran checklist slop selain emoji (dihitung di R5). Langkah komposisi khas yang bisa ditunjuk: jadwal bergaya timeline dengan kolom jam dan status terpisah garis vertikal, dan item berikutnya ditonjolkan sebagai bar oranye penuh dengan tombol play bulat gelap. Dua kartu program dibedakan oleh foto dan badge Pemula/Menengah.
- R8, ulangan 3 (skor 2): Tidak ada pelanggaran checklist slop; emoji sapaan sudah dihitung di R5. Dua kartu program dibedakan oleh foto berbeda serta badge 'Pemula' dan 'Menengah'. Keputusan komposisi khas: item berikutnya diisi oranye penuh dengan tombol play gelap, dan kolom jam dengan label status dipisah garis vertikal di setiap item jadwal.

### Pemetaan X/Y per ulangan (dibuka setelah penilaian)

| Ulangan | Desain X | Desain Y | Status | Biaya |
|---|---|---|---|---|
| 1 | Lakar | pen.dev | ok | $0.20 |
| 2 | pen.dev | Lakar | ok | $0.19 |
| 3 | Lakar | pen.dev | ok | $0.18 |

## Biaya

Biaya juri total: $1.66 (A $1.09, B $0.57). Tidak ada biaya agen desain.
