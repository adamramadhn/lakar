## Lampiran B — Rubrik benchmark

Rubrik ini **tidak dibaca agen**. Ada delapan kriteria. Enam dinilai juri dari PNG untuk perbandingan dengan pen.dev (skor maks 12). R3 dan R7 dicek mekanis sebagai kualitas teknis Lakar. Setelah itu ada gerbang dan keputusan per prompt.

### Kriteria perbandingan (Lakar vs pen.dev, dari PNG, skor maks 12)

Setiap kriteria golden set dipetakan ke satu R. **Rn = 2** bila (a) semua kriteria golden yang dipetakan ke Rn terpenuhi **dan** (b) deskripsi kolom 2 terpenuhi. **Rn = 1** bila tepat satu kriteria golden gagal **atau** deskripsi kolom 1 terpenuhi. **Rn = 0** untuk kasus lain.

| # | Kriteria | 2 | 1 | 0 |
|---|---|---|---|---|
| R1 | Kelengkapan prompt | semua bagian, mode, aksen, bahasa, dan ukuran mengikat sesuai | 1 hal minor salah (urutan, 1 seksi ekstra di luar aturan) | ada bagian hilang atau ukuran mengikat salah |
| R2 | Hierarki tipografi | satu titik fokus yang ditunjuk juri, lompatan skala tegas, tidak ada judul yatim | fokus ada tapi bersaing dengan 1 elemen, atau 1 judul yatim | tidak ada fokus, ukuran datar |
| R4 | Warna & kontras | aksen hanya untuk aksi/aktif/seri utama, tidak ada teks yang terlihat gagal kontras | 1 penyimpangan aksen atau 1 teks lemah | aksen berceceran, atau ≥ 2 teks gagal kontras |
| R5 | Ikon & aset | satu gaya ikon, ukuran seragam, visual utama (hero/grafik/foto) relevan, tanpa emoji | 1 ikon tidak konsisten, 1 emoji dekoratif (mis. di sapaan), atau visual utama lemah | emoji/glyph sebagai ikon UI, ≥ 2 emoji, atau visual utama hilang/kosong |
| R6 | Konten | copy spesifik, angka konsisten (kriteria angka golden terpenuhi) | 1 inkonsistensi atau 1 frasa generik | lorem, kontradiksi ≥ 2, atau copy generik dominan |
| R8 | Karakter | 0 pelanggaran checklist slop (selain emoji, yang dihitung di R5) + ada keputusan komposisi khas **yang bisa ditunjuk juri dari PNG** | 1–2 pelanggaran, atau tidak ada langkah khas | ≥ 3 pelanggaran |

Setiap pelanggaran hanya dihitung di **satu** R.

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

- **Setara:** lolos gerbang **dan** skor Lakar ≥ skor pen.dev − 1 **dan** tidak ada R dengan Lakar = 0 sementara pen.dev = 2.
- **Lebih baik:** lolos gerbang **dan** skor Lakar ≥ skor pen.dev + 2.
- **Kalah:** selebihnya.
- **G0:** prompt A dan B setara atau lebih baik. **G1 (lulus inti A):** ≥ 4 dari 5 prompt setara atau lebih baik **dan** ≥ 1 lebih baik.

### Prosedur juri

- Juri LLM menerima rubrik ini, kedua PNG (urutan diacak, nama alat disembunyikan), teks prompt, dan kriteria golden. Juri **tidak** menerima ringkasan agen.
- Setiap skor wajib disertai bukti (elemen + lokasi). "Mirip target" bukan bukti.
- Juri dijalankan 3× dengan urutan berbeda. Yang dipakai adalah median per kriteria. Kriteria dengan rentang > 1 wajib diperiksa Adam. Adam mengonfirmasi atau mengoreksi semua skor.
- **Jangkar visual:** PNG desain target yang dibangun ulang di Lakar boleh ditampilkan hanya untuk kalibrasi skor 2. Frame pen.dev tidak dipakai (arsip, EULA).
- **Normalisasi bentuk:** hasil mobile yang terdiri dari beberapa board, atau satu board panjang, digabung menjadi satu strip vertikal untuk kedua alat sebelum dinilai.
- **Laporan:** skor per R, "jumlah slop" kedua alat, waktu, dan biaya.
