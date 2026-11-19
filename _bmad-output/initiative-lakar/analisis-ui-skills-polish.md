# Analisis ui-skills.com untuk skill `polish` (2026-11-18)

Disetujui Adam 2026-11-18 ("setuju"). Ini sumber cakupan story G0 1.23.

## Sumber dan lisensi

Registry `npx ui-skills` (150 skill) dianalisis lengkap. Sekitar 45 skill relevan untuk render statis. Sisanya motion, framework, atau tooling.

Salinan mentah ada di scratchpad sesi: `/tmp/claude-0/-root-lakar/ff3247e7-b8d6-48ae-acb4-dd6a2a7ac61e/scratchpad/uiskills/` (`all/*.md` dan `repos/`). Folder ini bisa terhapus. Bila perlu, unduh ulang dengan `npx ui-skills get <slug>` atau `git clone --depth 1`.

| Sumber | Lisensi | Cara pakai |
|---|---|---|
| pbakaus/impeccable (layout, polish, typeset, colorize, bolder, quieter, distill, craft-floor, detector) | Apache-2.0 (NOTICE.md) | Parafrase dengan atribusi |
| Leonxlnx/taste-skill | MIT | Parafrase dengan atribusi |
| raphaelsalaja/skills (alignment, color, defaults) | MIT | Parafrase dengan atribusi |
| zeke/swiss-design | MIT | Parafrase dengan atribusi |
| jakubkrehel/*, emilkowalski/*, dammyjay93, mengto/*, danilaa1, ibelick, addyosmani, dan lainnya | Tidak tercantum | Ambil prinsipnya saja, jangan salin teks |

Atribusi dicantumkan di komentar sumber skill atau di README paket skills, tidak di teks yang dibaca agen. Tidak ada teks yang disalin verbatim.

## Akar masalah kasus "Berikutnya" (B round-2)

- Prelude `Badge` di `core.md` baris 38 berukuran tetap: `height:24`, `padding:[0,8]`, teks 12.
- Judul "Kekuatan tubuh atas" ada di kolom `width:'fill'`, tetapi node teksnya tidak diberi `width:'fill'`. Teks meluap ke luar kolom dan menutup gap 12 sebelum lencana.
- layout_check tidak punya aturan luapan atau tumpang tindih tanpa clip, jadi hasilnya 0 temuan.
- Kontras teks Badge di atas tint `fg+'1F'`, menurut hitungan analis (verifikasi di story):
  - warning sekitar 4,25, success 4,27, danger 4,01, extra (`#CA8A04`) 2,61;
  - `acc2` sebagai teks di atas putih 2,94;
  - `t3` di atas `C.field` 4,34.

## Cakupan yang disetujui

### 1. Prelude dan komponen (core)

- `Badge` diberi ukuran `sm` (20, teks 11–12, padding [0,6]) dan `md` (24).
  - Di baris daftar, lencana tidak lebih tinggi dari line-height judul di sebelahnya.
  - Teks lencana tidak dibungkus.
  - Teks lencana memakai nada gelap (700/800) agar kontrasnya ≥ 4,5.
- `acc2` dan kuning tidak dipakai untuk teks kecil.

### 2. Skill baru `polish.md`

Skill ini dibaca setelah `core`, sebelum screenshot akhir. Targetnya sekitar 3.000 token, dengan isi berikut.

**a. Struktur dan spacing**
- Teks dalam Row yang juga berisi badge atau ikon memakai `width:'fill'`. Badge dan ikon memakai hug atau ukuran tetap, dan tidak pernah menyusut.
- Gap antar-saudara minimal 8.
- Inset teks di dalam wadah ber-fill atau ber-stroke minimal 8 (kartu 12–16). Untuk pill, inset horizontal minimal 6.
- Ruang di atas judul lebih besar daripada ruang judul ke isinya.
- Jeda antarkelompok minimal 2× gap di dalam kelompok.
- Satu tepi kiri bersama di dalam satu permukaan. Selisih 1–4 px terlihat sebagai salah.
- Padding simetris, kecuali tombol berikon: sisi ikon 2 px lebih kecil.
- Kepadatan dibuat bervariasi: zona kontrol rapat, zona konten lega.

**b. Komponen**
- Ukuran badge mengikuti konteks.
- Kartu tidak bersarang di dalam kartu; judulnya ditaruh di luar.
- Radius konsentris: radius luar = radius dalam + padding, dengan radius dalam minimal 6.
- Satu strategi kedalaman per board: border, bayangan, atau tonal.
- Bayangan berlapis yang semuanya jatuh ke bawah: ring alpha 1 px ditambah 2–3 lapis, blur makin besar, opasitas makin kecil (skema sudah mendukung `spread` dan banyak lapis). Bayangan tanpa offset berwarna tidak dipakai.
- Foto konten diberi outline 1 px hitam 10% (terang) atau putih 10% (gelap). Logo tidak.
- Anatomi kartu fitur: kartu > panel > fragmen produk. Panel mengisi 60–65% bagian bawah dan dipotong tepi kartu.
- Satu tinggi untuk sederet kartu.

**c. Tipografi**
- Maksimal sekitar 5 ukuran dan 2–3 bobot per board. Lompatan antarperan minimal 1,2× (mobile) atau 1,25–1,3× (desktop).
- Satu ukuran untuk setiap jenis elemen.
- Panjang baris 45–75 karakter: sekitar 520–640 px untuk 16 px, 580–700 px untuk 18 px.
- Teks yang terbungkus 3 baris atau lebih memakai line-height minimal 1,4.
- Tracking: −0,01 sampai −0,02em untuk teks ≥ 24 px; +0,05 sampai +0,08em untuk huruf kapital ≤ 14 px.
- Bobot di bawah 400 hanya untuk teks ≥ 28 px.
- Teks terang di atas latar gelap: line-height sedikit lebih besar dan naik satu tingkat bobot.
- Angka tabular wajib untuk harga, jam, hitungan, dan kolom.
- Tanda baca:
  - en dash untuk rentang ("09.00–10.00");
  - karakter "…";
  - kutip lengkung pada testimoni;
  - spasi tak-putus antara nilai dan satuan, sehingga angka tidak pernah terpisah dari satuannya.
- Paragraf tidak berakhir satu kata.
- Jangan mewarnai atau menebalkan satu kata di headline. Paling banyak sekali per halaman.

**d. Warna**
- Tidak ada teks abu-abu di atas permukaan berwarna. Teks sekunder memakai turunan hue permukaan, dengan hex eksplisit, bukan alpha.
- Kontras dihitung setelah komposit: ≥ 4,5 untuk teks biasa, ≥ 3 untuk teks besar, ikon, dan tepi field.
- Aksen sekitar 10% luas board. Aksen menandai aksi, pilihan, dan fokus, bukan judul atau deretan ikon.
- Merah hanya untuk error dan aksi destruktif. Hue status berjarak minimal 15° dari hue aksen.

**e. Kekayaan informasi**
- Metrik punya beragam ekspresi: angka hero, stat inline, sparkline, gauge, badge delta. Hindari kotak "ikon + angka besar + label" yang diulang 3×.
- Angka headline yang berubah dari waktu ke waktu menampilkan riwayat dengan titik perubahan.
- Setiap layar kerja memuat satu keadaan yang layak dilihat: peringatan, terdegradasi, atau kosong.
- Prinsip "buktikan, jangan klaim": fragmen produk ditampilkan sedang bekerja dengan data demo berfidelitas penuh.
- Hero landing menampilkan aksi kategori dalam bentuk bekerja (field pencarian, pemilih slot), bukan hanya tombol.
- Bukti ditaruh di sebelah klaimnya.
- Field kosong dihilangkan, bukan diganti "—". Angka dan tanggal tidak dipotong.

**f. Tanda slop baru**
- teks bergradien;
- garis aksen di sisi kartu lebih dari 1 px;
- glow halo tanpa offset;
- label bernomor 01/02/03 yang bukan urutan sungguhan;
- overline di setiap seksi;
- pola "bukan X, melainkan Y" dan "X. Y.";
- strip 3–4 angka di bawah hero;
- kata kebajikan (jujur, tenang, benar-benar, sederhana);
- semua kartu sama panjang;
- set nama stok;
- "·" lebih dari 3 per baris;
- nama yang sama diulang 3× atau lebih dalam satu kartu.

**g. Kritik diri sebelum selesai**
- Squint test: hierarki masih terbaca saat buram?
- Skeleton test: struktur masih bercerita tanpa teks?
- Swap test: terlihat sama dengan template biasa?

### 3. Revisi kecil `landing.md` (dan `mobile.md` bila perlu)

- Overline maksimal 2 per halaman, hanya bila membawa informasi.
- Pemakaian "·" pada meta dibatasi.
- Grid 12 kolom di 1440: tepi 80/1360, gutter 24. Blok utama mulai di garis kiri atau awal kolom.

### 4. Aturan layout_check baru

Semuanya dihitung dari pohon node dan tata letak hasil render.

**Error (gerbang):**
- teks meluap dari content box induk;
- saudara saling tumpang tindih tanpa `Overlay /` atau `Crop /`;
- kontras teks setelah komposit < 4,5 (atau < 3 untuk teks besar).

**Warning:**
- gap teks ke badge, ikon, atau tombol < 8;
- proporsi badge: tinggi > line-height judul di sebelahnya, ukuran teks badge ≥ judul, atau badge dibungkus;
- kartu bersarang;
- radius tidak konsentris;
- ritme judul (gap di atas ≤ gap di bawah);
- lebih dari 5–6 ukuran huruf per board;
- panjang baris > 80 karakter;
- bobot < 400 di bawah 18 px;
- tanda baca (`...`, tanda hubung di antara angka).

**Syarat pengujian:**
- Setiap aturan punya fixture positif dan negatif.
- Uji positif palsu dijalankan terhadap arsip dokumen bench (≥ 80 dokumen). Hanya aturan tanpa positif palsu yang dijadikan error. Sisanya warning.

### 5. Uji

- Seri latihan non-A/B (P1–P4 dan/atau prompt baru), Lakar vs pen.dev, juri v2.1.
- Anggaran ≤ $15.
- C7: skill tidak memuat rubrik atau prompt.
- C8: satu run per alat per prompt.
- pen-desktop di-restart setelah seri.
- Adam melihat PNG.

## Ditolak

- motion, hover, keyboard, ARIA, dan CSS/kode;
- ritual proses (wawancara, 5–10 varian, skor kritik);
- larangan font Inter/Plus Jakarta/700;
- larangan total overline dan kicker;
- skill minimalis (restraint "tanpa badge", distill, swiss tanpa radius);
- canvas-design poster 90% visual;
- kredit atau emoji di UI.
