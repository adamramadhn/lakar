Anda adalah juri desain antarmuka. Anda menilai dua desain, "Desain X" dan "Desain Y", yang dibuat dari prompt yang sama. Nilai hanya dari gambar yang dilampirkan; tidak ada informasi lain tentang cara desain dibuat.

## Prompt

Desain layar checkout aplikasi mobile (390x844) untuk "Singgah", aplikasi pemesanan penginapan. Isi: header dengan tombol kembali dan indikator langkah (2 dari 3), ringkasan kamar dengan foto, tanggal check-in dan check-out, jumlah tamu dengan stepper, form data pemesan (nama, email, nomor HP) dengan satu field dalam keadaan error, pilihan metode pembayaran, rincian harga, dan tombol bayar yang tetap di bawah. Mode terang, aksen teal. Bahasa Indonesia. Kualitas setara desainer produk senior: hierarki tipografi jelas, spacing konsisten (grid 8px), kontras baik, auto/flex layout.

## Aturan skor

Setiap kriteria golden set dipetakan ke satu R. **Rn = 2** bila (a) semua kriteria golden yang dipetakan ke Rn terpenuhi **dan** (b) deskripsi kolom 2 terpenuhi. **Rn = 1** bila tepat satu kriteria golden gagal **atau** deskripsi kolom 1 terpenuhi. **Rn = 0** untuk kasus lain. R9 dan R10 tidak memetakan kriteria golden; skornya hanya dari deskripsi kolom.

| # | Kriteria | 2 | 1 | 0 |
|---|---|---|---|---|
| R1 | Kelengkapan prompt | semua bagian, mode, aksen, bahasa, dan ukuran mengikat sesuai (lebar tepat; untuk layar mobile, tinggi ≥ yang diminta sah karena satu artboard panjang bergulir) | 1 hal minor salah (urutan, 1 seksi ekstra di luar aturan) | ada bagian hilang atau ukuran mengikat salah (lebar lain, atau layar mobile lebih pendek dari yang diminta) |
| R2 | Hierarki tipografi | satu titik fokus yang ditunjuk juri, lompatan skala tegas, tidak ada judul yatim | fokus ada tapi bersaing dengan 1 elemen, atau 1 judul yatim | tidak ada fokus, ukuran datar |
| R4 | Warna & kontras | aksen dipakai konsisten untuk aksi/aktif/seri utama; warna tambahan hanya bila bermakna (status, kategori, arah perubahan); tidak ada teks yang terlihat gagal kontras | 1 pemakaian warna tanpa makna atau 1 teks lemah | warna berceceran tanpa makna, atau ≥ 2 teks gagal kontras |
| R5 | Ikon & aset | satu gaya ikon, ukuran seragam, visual utama (hero/grafik/foto) relevan, tanpa emoji | 1 ikon tidak konsisten, 1 emoji dekoratif (mis. di sapaan), atau visual utama lemah | emoji/glyph sebagai ikon UI, ≥ 2 emoji, atau visual utama hilang/kosong |
| R6 | Konten | copy spesifik, angka konsisten (kriteria angka golden terpenuhi) | 1 inkonsistensi atau 1 frasa generik | lorem, kontradiksi ≥ 2, atau copy generik dominan |
| R8 | Karakter | 0 pelanggaran checklist slop (selain emoji, yang dihitung di R5) + ada keputusan komposisi khas **yang bisa ditunjuk juri dari PNG** | 1–2 pelanggaran, atau tidak ada langkah khas | ≥ 3 pelanggaran |
| R9 | Kekayaan informasi & detail | angka diberi konteks (pembanding, sasaran, tren, satuan, periode); daftar menunjukkan variasi status/kategori; detail sekunder yang berguna (metadata, label kecil, penanda) ada di sebagian besar bagian; padat tetapi tetap terbaca | konteks atau variasi hanya di sebagian bagian; banyak angka/item berdiri tanpa makna tambahan | hanya isi minimum yang diminta: angka telanjang, item seragam; atau terlalu padat sampai tidak terbaca |
| R10 | Polesan warna & komponen | semua unsur berikut ada: permukaan berlapis (bidang ber-tint warna utama, nuansa gelap/terang, bukan hanya netral polos); warna kedua bermakna (selain aksen dan netral) dipakai konsisten di lebih dari satu bagian; badge/chip/indikator berwarna dan terdefinisi; ikon dan visual (foto, grafik, gambar) matang dan menyatu | polesan hanya di sebagian elemen, komponen sebagian besar polos, atau salah satu unsur kolom 2 tidak ada (mis. hanya satu aksen di atas netral tanpa warna kedua bermakna) | datar: satu warna di atas netral polos hampir di seluruh desain, komponen hanya teks/garis, visual pendukung hilang atau tampak kasar |

Setiap pelanggaran hanya dihitung di **satu** R. Kesalahan (kontras, ikon tidak konsisten, angka salah) dinilai di R4/R5/R6; R9 dan R10 menilai ada atau tidaknya kekayaan dan polesan.

## Kriteria golden untuk prompt ini

1. [R1] Header: `arrow-left` ( 44–48), judul, `step-indicator` 2/3. Header dan bilah bayar tetap saat digulir.
2. [R1] Isi melebihi 844 → satu artboard panjang selebar 390 (tinggi mengikuti konten, minimal 844), header di atas dan bilah bayar menempel di bawah artboard; bukan dua artboard atau strip gabungan.
3. [R5] Kartu kamar: foto yang sesuai isi (atau  berlabel), nama, tipe, rating ikon `star`.
4. [R6] Tanggal check-in/out (`calendar`): hari cocok dengan kalender dan jumlah malam benar. [R1] Stepper tamu `minus`/`plus` 44.
5. [R1] Form: label di atas, field 48, satu field error (border danger + `circle-alert` + pesan spesifik).
6. [R8] Metode bayar sebagai `radio-card` (QRIS, VA, Kartu), satu terpilih. Logo pembayaran ditulis sebagai teks.
7. [R6] Harga × malam + pajak + biaya = total, sama dengan total di bilah bawah. [R4] Tombol Bayar 56 teal + teks/ikon di atas aksen `#FFFFFF`.

## Bukti

Setiap skor wajib disertai bukti (elemen + lokasi). "Mirip target" bukan bukti.

## Checklist slop (dipakai untuk R8)

1. Gradien ungu-biru atau mesh di hero tanpa alasan brand.
2. Tiga kartu identik dengan ikon di lingkaran sebagai pola utama halaman.
3. Kartu di dalam kartu di dalam kartu.
4. Headline generik ("Solusi terbaik untuk bisnis Anda", "Revolusi …").
5. Statistik bulat dan berlebihan ("10x lebih cepat", "1 juta+ pengguna") yang tidak diberikan prompt.
6. Emoji atau glyph Unicode sebagai ikon.
7. Latar krem/beige/off-white hangat.
8. Glassmorphism/blur di mana-mana (blur hanya untuk bar yang mengambang).
9. Semua teks rata tengah.
10. Tombol generik ("Klik di sini", "Submit", "Pelajari lebih lanjut") di setiap kartu.
11. Ilustrasi atau maskot dari path manual.
12. Placeholder abu-abu kosong tanpa label di tempat yang seharusnya berisi konten.

**Frasa terlarang** (per bahasa, dicocokkan per kata utuh):
- **id:** "solusi terbaik", "revolusioner", "tingkatkan produktivitas", "pelajari lebih lanjut", "klik di sini", "lorem ipsum", "judul fitur".
- **en:** "learn more", "click here", "unlock", "seamless", "next-level", "game changer", "empower your".

## Gambar

Setiap desain dikirim sebagai potongan vertikal berurutan berlabel "Desain X, bagian i dari n" (lebar penuh, skala asli), ditambah satu gambar "overview" seluruh desain yang diperkecil. Bila desain terdiri dari beberapa artboard, artboard-artboard itu ditumpuk vertikal menjadi satu strip. Area abu-abu polos (#808080) di luar artboard dan jarak antar-artboard adalah latar netral penilaian, bukan bagian desain.

## Format jawaban

Nilai kedua desain secara terpisah dengan rubrik di atas (skor 0, 1, atau 2 per kriteria; setiap skor wajib disertai bukti yang menunjuk elemen dan lokasinya di gambar). `slop.jumlah` = banyaknya pelanggaran checklist slop yang terlihat dan `slop.butir` berisi tepat satu entri per pelanggaran. `emoji` = jumlah emoji yang terlihat di desain. `fokus` = titik fokus yang Anda tunjuk untuk R2.

Kembalikan HANYA satu objek JSON valid (tanpa teks lain, tanpa blok kode) dengan bentuk persis berikut, tanpa kunci tambahan:

{
  "X": {
    "R1": {"skor": 0|1|2, "bukti": "elemen + lokasi"},
    "R2": {"skor": 0|1|2, "bukti": "..."},
    "R4": {"skor": 0|1|2, "bukti": "..."},
    "R5": {"skor": 0|1|2, "bukti": "..."},
    "R6": {"skor": 0|1|2, "bukti": "..."},
    "R8": {"skor": 0|1|2, "bukti": "..."},
    "R9": {"skor": 0|1|2, "bukti": "..."},
    "R10": {"skor": 0|1|2, "bukti": "..."},
    "slop": {"jumlah": <bilangan bulat ≥ 0>, "butir": ["<nomor checklist>: <bukti elemen + lokasi>", ...]},
    "emoji": <jumlah emoji yang terlihat, bilangan bulat ≥ 0>,
    "fokus": "<titik fokus yang Anda tunjuk: elemen + lokasi>"
  },
  "Y": { ...bentuk yang sama... }
}