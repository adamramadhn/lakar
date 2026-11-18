# Log latihan skill (story 19)

Latihan mengiterasi skill Lakar (`core.md`, `landing.md`, `mobile.md`) terhadap empat prompt non-A–E. Latihan bukan
gerbang G0: keputusan G0 hanya dari putaran resmi A/B (story 21).

## Pembekuan prompt (2026-11-18, sebelum skill diubah dan sebelum run apa pun)

- `bench/practice/prompts.json` sha256 `582c5d117b05c93dff3b2335d0eb55f24b499e261ebc453c65eaaf32a453a1da`
  (= `PRACTICE_PROMPTS_SHA256` di `bench/src/practice/prompts.ts`). Loader menolak isi lain.
- Teks dari plan story 19 (Design Notes), dengan dua perubahan kata (bukan makna) yang diizinkan plan sebelum
  iterasi 1, karena penjaga n-gram 6 kata (b) menemukan tumpang tindih dengan prompt golden:
  - P2: "tab bar 4 ikon. Mode gelap, aksen …" → "tab bar berisi 4 ikon. Mode gelap, aksen …"
    (n-gram "tab bar 4 ikon mode gelap" dan "bar 4 ikon mode gelap aksen" sama dengan prompt B).
  - P3: "tombol mulai memasak yang tetap di bawah. Mode terang" → "… yang tetap di bagian bawah. Mode terang"
    (n-gram "yang tetap di bawah mode terang" dan "tetap di bawah mode terang aksen" sama dengan prompt D).
- Sesudah perubahan: 0 n-gram 6 kata sama dengan prompt A–E (kalimat penutup baku dibuang), 0 frasa
  Kriteria/Prosedur/Risiko golden, 0 token terlarang, nama produk tidak ada di golden-set (`tests/practice-prompts.test.ts`).
- Mulai sekarang prompt tidak diubah. Setiap iterasi mencatat sha `prompts.json` di `frozen.json`.

## Iterasi 1: skill v1 dari diagnosis (sebelum run apa pun)

Skill: `core.md` `97b295de0a084ee5`, `landing.md` `3daa5de39ffc37ac`, `mobile.md` `d6baefe94e5498a2` (sha256, 16 heksadesimal awal).
Diubah sebagai prinsip umum (berlaku untuk jenis layar apa pun), dari diagnosis putaran 1:

- **Peran warna menggantikan "satu aksen".** Aksen tetap memimpin aksi, state aktif, tautan, seri utama; tiga peran sah
  lain: bidang merek (`field` tint muda / `deep` aksen tua) untuk latar seksi dan kartu sorotan, satu warna pendamping
  `acc2` dengan satu makna tetap, dan warna status untuk arah dan keadaan. Uji baru: setiap warna non-netral bisa disebut
  maknanya; maks 2 hue non-status. Alasan: aturan lama dijalankan harfiah → satu aksen di atas abu polos (datar).
- **Gelap bernuansa merek.** Netral gelap digeser 4–8% ke hue aksen, tiga lapis (dasar/kartu/terangkat), status gelap.
  Alasan: abu murni + "seksi gelap untuk ritme" menghasilkan permukaan polos.
- **Kaya informasi, miskin hiasan** (menggantikan "Reduksi", prinsip dan langkah proses): angka kunci berpembanding +
  arah berwarna status; daftar memperlihatkan keadaan (selesai/berikutnya/mendatang/terkunci); seri data bernada `C.data`
  dengan legenda bernada sama. Alasan: reduksi harfiah membuang konteks yang justru isi.
- **Komponen:** helper `Badge(p, label, tone, icon?)` bernada (accent/success/warning/danger/neutral/extra) di prelude
  (+4 baris prelude); wadah ikon solid aksen untuk butir ditekankan; rating `star` filled `acc2`; kartu sorotan =
  bidang tint + bayangan md (terang) / lapis raised (gelap); avatar foto orang, inisial cadangan.
- **Foto:** untuk isi nyata (orang/tempat/makanan/produk), bukan ikon fitur; CC0/PDM → Pexels → CC BY; kata kunci
  Inggris; maks 2 `photo_search` paralel sebelum execute pertama; gagal sekali → blok pengganti; kredit tidak tampil di
  UI kecuali diminta (atribusi di metadata aset) dan disebut di ringkasan akhir. Teks foto di `api.ts`/`api.md` dan
  `PHOTO_SEARCH_DESCRIPTION`/deskripsi execute diselaraskan (contoh `photo` tanpa node kredit).
- **Layar app desktop:** satu baris struktur di core (board persis ukuran, sidebar, header, grid kartu), karena belum
  ada skill jenis layar app (milik G1).
- `landing.md`/`mobile.md`: prinsip per jenis layar (hero di bidang merek atau foto nyata, ritme latar seksi, kartu
  orang tidak kembar, pilihan/tier dengan keadaan; list dengan keadaan, ring multi-seri, pil tab aktif, mode gelap
  bernuansa merek). Contoh teruji (Biji Pagi, Tutur) memperagakan badge bernada, baris berkeadaan, bidang merek, kartu
  ditekankan, ring bersegmen; lulus 0 error/warning/gerbang.
