## Lampiran B — Rubrik benchmark

Versi rubrik: 2.3 (2026-11-19)

Rubrik ini **tidak dibaca agen**. Ada sepuluh kriteria; delapan dinilai juri dari PNG untuk perbandingan dengan pen.dev (skor maks 16). R3 dan R7 dicek mekanis sebagai kualitas teknis Lakar. Setelah itu ada gerbang dan keputusan per prompt. Snapshot setiap versi rubrik (Lampiran B, kriteria golden, dan teks juri beserta sha256-nya) disimpan tracked di `bench/rubric/`.

### Kriteria perbandingan (Lakar vs pen.dev, dari PNG, skor maks 16)

Setiap kriteria golden set dipetakan ke satu R. **Rn = 2** bila (a) semua kriteria golden yang dipetakan ke Rn terpenuhi **dan** (b) deskripsi kolom 2 terpenuhi. **Rn = 1** bila tepat satu kriteria golden gagal **atau** deskripsi kolom 1 terpenuhi. **Rn = 0** untuk kasus lain. R9 dan R10 tidak memetakan kriteria golden; skornya hanya dari deskripsi kolom.

| # | Kriteria | 2 | 1 | 0 |
|---|---|---|---|---|
| R1 | Kelengkapan prompt | semua bagian, mode, aksen, bahasa, dan ukuran mengikat sesuai (lebar tepat; untuk layar mobile, tinggi ≥ yang diminta sah karena satu board panjang bergulir) | 1 hal minor salah (urutan, 1 seksi ekstra di luar aturan) | ada bagian hilang atau ukuran mengikat salah (lebar lain, atau layar mobile lebih pendek dari yang diminta) |
| R2 | Hierarki tipografi | satu titik fokus yang ditunjuk juri, lompatan skala tegas, tidak ada judul yatim | fokus ada tapi bersaing dengan 1 elemen, atau 1 judul yatim | tidak ada fokus, ukuran datar |
| R4 | Warna & kontras | aksen dipakai konsisten untuk aksi/aktif/seri utama; warna tambahan hanya bila bermakna (status, kategori, arah perubahan); tidak ada teks yang terlihat gagal kontras | 1 pemakaian warna tanpa makna atau 1 teks lemah | warna berceceran tanpa makna, atau ≥ 2 teks gagal kontras |
| R5 | Ikon & aset | satu gaya ikon, ukuran seragam, visual utama (hero/grafik/foto) relevan, tanpa emoji | 1 ikon tidak konsisten, 1 emoji dekoratif (mis. di sapaan), atau visual utama lemah | emoji/glyph sebagai ikon UI, ≥ 2 emoji, atau visual utama hilang/kosong |
| R6 | Konten | copy spesifik, angka konsisten (kriteria angka golden terpenuhi) | 1 inkonsistensi atau 1 frasa generik | lorem, kontradiksi ≥ 2, atau copy generik dominan |
| R8 | Karakter | 0 pelanggaran checklist slop (selain emoji, yang dihitung di R5) + ada keputusan komposisi khas **yang bisa ditunjuk juri dari PNG** | 1–2 pelanggaran, atau tidak ada langkah khas | ≥ 3 pelanggaran |
| R9 | Kekayaan informasi & detail | angka diberi konteks (pembanding, sasaran, tren, satuan, periode); daftar menunjukkan variasi status/kategori; detail sekunder yang berguna (metadata, label kecil, penanda) ada di sebagian besar bagian; padat tetapi tetap terbaca | konteks atau variasi hanya di sebagian bagian; banyak angka/item berdiri tanpa makna tambahan | hanya isi minimum yang diminta: angka telanjang, item seragam; atau terlalu padat sampai tidak terbaca |
| R10 | Polesan warna & komponen | semua unsur berikut ada: permukaan berlapis (bidang ber-tint warna utama, nuansa gelap/terang, bukan hanya netral polos); warna kedua bermakna (selain aksen dan netral) dipakai konsisten di lebih dari satu bagian; badge/chip/indikator berwarna dan terdefinisi; ikon dan visual (foto, grafik, gambar) matang dan menyatu | polesan hanya di sebagian elemen, komponen sebagian besar polos, atau salah satu unsur kolom 2 tidak ada (mis. hanya satu aksen di atas netral tanpa warna kedua bermakna) | datar: satu warna di atas netral polos hampir di seluruh desain, komponen hanya teks/garis, visual pendukung hilang atau tampak kasar |

Setiap pelanggaran hanya dihitung di **satu** R. Kesalahan (kontras, ikon tidak konsisten, angka salah) dinilai di R4/R5/R6; R9 dan R10 menilai ada atau tidaknya kekayaan dan polesan.

### Kualitas teknis Lakar (bukan perbandingan, dicek mekanis)

Pen.dev tidak dilint (EULA melarang ekstraksi dari output).

| # | Kriteria | 2 | 1 | 0 |
|---|---|---|---|---|
| R3 | Spacing & perataan | LC-07 = 0, LC-11 = 0, LC-06 = 0 | ≤ 5 temuan | > 5 |
| R7 | Kerapian teknis | 0 error non-gerbang, ≤ 3 warning struktural (LC-03/13/14/17/18/21) | ≤ 2 error non-gerbang yang dianulir Adam sebagai false positive, atau ≤ 8 warning | selebihnya |

### Gerbang Lakar (gagal otomatis)

- ada error berlevel `gerbang` di Lampiran A, atau ukuran board salah;
- R3 = 0 atau R7 = 0;
- waktu > 1,5 × median baseline pen.dev pada prompt yang sama (forge-lakar-canvas).

### Keputusan per prompt

T = total 8 median juri (maks 16); D = R9 + R10 ("daya tarik", maks 4); L = Lakar, P = pen.dev.

1. Run Lakar gagal atau gerbang Lakar gagal → **Kalah**.
2. Run pen.dev gagal atau tidak ada ulangan juri yang valid → tidak dapat dinilai.
3. Alasan Kalah. *Kalah-daya-tarik:* D_L ≤ D_P − 2, atau R9/R10 dengan Lakar 0 sementara pen.dev 2. *Kalah-lain:* T_L < T_P − 1, atau ada R1–R8 dengan Lakar 0 sementara pen.dev 2.
4. Ada alasan Kalah → **Kalah**. Kecuali bila **hanya** ada Kalah-daya-tarik **dan** pen.dev melanggar brief mengikat (ukuran frame pen.dev salah menurut aturan ukuran R1: lebar lain, atau layar mobile lebih pendek dari yang diminta; atau median R1 pen.dev = 0) → **Setara**.
5. Tidak Kalah, T_L ≥ T_P + 3, **dan** D_L ≥ D_P → **Lebih baik**. Selebihnya → **Setara**.

Alasan aturan:
- **Kriteria umum, bukan isi A/B.** R9/R10 menilai sifat yang terlihat di desain apa pun (konteks angka, variasi status, lapisan permukaan, warna bermakna). Adam menyebut keduanya kurang di A (landing) maupun B (mobile).
- **R4 direvisi.** R4 lama ("aksen hanya untuk aksi") menghukum warna kedua yang bermakna, padahal Adam menilainya sebagai kematangan. Tanpa revisi, R4 dan R10 saling meniadakan.
- **Sumbu daya tarik dengan veto gap ≥ 2.** Adam menolak "unggul struktur/copy" sebagai penebus desain datar: kepatuhan tidak menebus kedataran. Ini perluasan veto yang sudah ada (0 vs 2 pada satu R) ke sumbu yang menurut Adam paling menentukan. Gap 1 dianggap derau median.
- **Lebih baik mensyaratkan D_L ≥ D_P.** Klaim "lebih baik dari pen.dev" tidak boleh hanya berasal dari kepatuhan.
- **Ambang +3/−1.** +2 dari maks 12 diskalakan ke maks 16 menjadi ≈ +2,7, lalu dibulatkan ke +3. −1 tetap satu langkah skor sebagai toleransi derau; satuan langkahnya tidak berubah.
- **Gerbang Lakar tetap keras.** Kepatuhan brief adalah janji produk Lakar, dicek mekanis, dan tidak bergantung pada juri.
- **Pelanggaran brief pembanding hanya menetralkan veto daya tarik** dan tidak membuat Lakar Lebih baik. Keunggulan daya tarik yang diraih di luar batas mengikat bukan keunggulan sah (lebar lain atau bahasa lain = brief dilanggar). Board mobile yang lebih tinggi dari yang diminta adalah satu layar bergulir yang sah, bukan ruang konten tambahan: aturan ukuran yang sama berlaku untuk Lakar dan pembanding. Meski begitu, kesalahan pembanding bukan prestasi Lakar: Kalah karena kualitas lain tetap Kalah.
- **Audit golden.** Kriteria golden tidak mewajibkan gaya yang tidak diminta prompt (mis. avatar inisial, satu kartu aksen, wadah tint). Kriteria seperti itu mencerminkan batas Lakar G0, bukan permintaan brief, dan menghukum alternatif yang lebih kaya.

- **G0:** prompt A dan B setara atau lebih baik. **G1 (lulus inti A):** ≥ 4 dari 5 prompt setara atau lebih baik **dan** ≥ 1 lebih baik.

### Prosedur juri

- Juri LLM menerima rubrik ini, kedua PNG (urutan diacak, nama alat disembunyikan), teks prompt, dan kriteria golden. Juri **tidak** menerima ringkasan agen.
- Setiap skor wajib disertai bukti (elemen + lokasi). "Mirip target" bukan bukti.
- Juri dijalankan 3× dengan urutan berbeda. Yang dipakai adalah median per kriteria. Kriteria dengan rentang > 1 wajib diperiksa Adam. Adam mengonfirmasi atau mengoreksi semua skor.
- **Jangkar visual:** PNG desain target yang dibangun ulang di Lakar boleh ditampilkan hanya untuk kalibrasi skor 2. Frame pen.dev tidak dipakai (arsip, EULA).
- **Normalisasi bentuk:** hasil mobile yang terdiri dari beberapa board, atau satu board panjang, digabung menjadi satu strip vertikal untuk kedua alat sebelum dinilai.
- **Laporan:** skor per R, total T dan daya tarik D kedua alat, "jumlah slop" kedua alat, waktu, biaya, versi rubrik, dan sha256 teks juri per prompt (sama dengan `bench/rubric/rubric.json`; putaran resmi di-abort bila berbeda).
- Juri tidak menerima aturan keputusan per prompt maupun skor putaran lain.
