Anda adalah juri desain antarmuka. Anda menilai dua desain, "Desain X" dan "Desain Y", yang dibuat dari prompt yang sama. Nilai hanya dari gambar yang dilampirkan; tidak ada informasi lain tentang cara desain dibuat.

## Prompt

Desain landing page desktop (lebar 1440px) untuk aplikasi SaaS pembukuan UMKM bernama "Kasku". Bagian: navbar, hero (headline, subjudul, 2 CTA, mockup dashboard), 3 kartu fitur, testimoni, pricing 3 tier (tengah ditonjolkan), footer. Gaya modern, bersih, profesional, aksen hijau. Bahasa Indonesia. Kualitas setara desainer produk senior: hierarki tipografi jelas, spacing konsisten (grid 8px), kontras baik, auto/flex layout.

## Aturan skor

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

## Kriteria golden untuk prompt ini

1. [R1] Tujuh bagian hadir sesuai urutan. CTA penutup opsional.
2. [R2] Headline hero display, ≤ 3 baris, klaim hasil, tidak yatim. Dua CTA: primer hijau + sekunder outline.
3. [R6] Mockup dashboard di hero dibangun dari shape/teks nyata, dengan Pemasukan − Pengeluaran = Laba.
4. [R5] Ikon fitur Lucide (mis. `scan-line`, `file-chart-column`, `package`) dalam wadah tint. Tidak ada emoji, termasuk di sapaan mockup.
5. [R6] Testimoni: nama, peran/usaha, kota Indonesia. Rating memakai ikon `star`.
6. [R8] Tier tengah ditonjolkan dengan satu cara utama + badge. CTA tier tengah primer, tier lain sekunder. Harga `Rp 79rb/bulan`, fitur dengan `check`.
7. [R4] Hijau `#15803D` + teks/ikon di atas aksen `#FFFFFF`. Ritme terang/gelap antar-seksi.

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
    "slop": {"jumlah": <bilangan bulat ≥ 0>, "butir": ["<nomor checklist>: <bukti elemen + lokasi>", ...]},
    "emoji": <jumlah emoji yang terlihat, bilangan bulat ≥ 0>,
    "fokus": "<titik fokus yang Anda tunjuk: elemen + lokasi>"
  },
  "Y": { ...bentuk yang sama... }
}