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

### Hasil iterasi 1 (`bench/practice-1.md`, HEAD `bf5462d`)

| Prompt | Waktu Lakar / pen.dev | T L–P | D L–P | Keputusan | Kelemahan Lakar menurut bukti juri |
|---|---|---|---|---|---|
| P1 | 265.9 / 227.4 dtk (1,17) | 13–14 | 3–4 | Kalah (R5 0 vs 2) | foto hero dan mentor = placeholder ikon + label "Foto …" → visual utama dinilai hilang |
| P2 | 175.2 / 179.0 dtk (0,98) | 12–15 | 3–3 | Kalah (T < P − 1) | avatar inisial, sampul tanpa artwork; tile mix sebagian tertutup mini player; tile ungu jenuh bersaing dengan fokus |
| P3 | 159.8 / 130.8 dtk (1,22) | 13–12 | 3–2 | Setara | hero placeholder ikon (R5 1) |
| P4 | 252.1 / 191.3 dtk (1,32) | – | – | tidak dapat dinilai | run pen.dev `failed` di pasca-run harness ("referencing the wrong .pen file", 0 frame); tidak diulang (C8) |

- Emoji Lakar (a)/(b)/(c) = 0 di P1–P3; layout_check gate 0 di keempat prompt; waktu ≤ 1,5× di keempat prompt.
- R9 Lakar = 2 di P1–P3 (prinsip kaya informasi bekerja). R10 Lakar = 1 di semua prompt: permukaan berlapis, warna
  kedua, dan badge diakui juri, tetapi "visual matang" gagal karena tidak ada foto.
- Penyebab utama: **Openverse tidak tersedia** selama iterasi (setiap `photo_search` → NOT_FOUND untuk kata kunci panjang
  atau EXEC_ERROR timeout 8 dtk; `curl` langsung: 504 setelah 9 dtk). Agen juga melanggar batas 2 pencarian (4–6
  panggilan, mengganti kata kunci setelah gagal), menambah waktu.
- Biaya iterasi 1: $9,92 (pen.dev $3,47, Lakar $4,29, juri $2,16); kumulatif $9,92.

## Iterasi 2: skill v2

Pakai ulang pen.dev iterasi 1 tidak mungkin (P4 pen.dev `failed` → `--reuse-pendev 1` Abort sebelum spawn, sesuai
plan), jadi iterasi 2 menjalankan pen.dev baru untuk keempat prompt. Perubahan (prinsip umum, dikelompokkan dari bukti
lintas prompt, bukan per prompt):

- **Disiplin pencarian foto:** satu giliran bersama `open_doc`, maks 2 panggilan per desain, 1–3 kata benda Inggris
  tanpa `orientation`; kosong/error → langsung visual pengganti, tidak mengganti kata kunci atau mengulang. Alasan:
  4–6 panggilan gagal per run (waktu terbuang, melanggar batas plan).
- **Visual pengganti tampak selesai, bukan placeholder:** tanpa label "Foto …" dan tanpa ikon kecil di bidang kosong;
  hero = komposisi produk (mockup UI, kartu data bertumpuk), sampul/thumbnail = bidang bernada berbeda per item +
  judul tipografis tebal + ikon besar transparan, avatar = inisial bernada berbeda per orang. Alasan: R5/R10 di P1–P3
  menghukum placeholder sebagai "visual hilang".
- **Bidang jenuh hanya untuk fokus:** koleksi (tile, sampul) memakai nada redup agar tidak bersaing dengan fokus utama
  (R2 P2).
- **Bagian yang diminta tampil utuh (mobile):** tidak ada bagian yang terpotong atau tertutup overlay di board pertama;
  ringkas isi bila tidak muat (R1/R2 P2).
- Teks core dipadatkan agar tetap ≤ 4000 token (tanpa mengubah aturan lain).

Skill: `core.md` `5bee1a4981adba9f`, `landing.md` `3daa5de39ffc37ac`, `mobile.md` `d3c210ef78fab03d`.

### Hasil iterasi 2 (`bench/practice-2.md`, HEAD `6057545`)

| Prompt | Waktu Lakar / pen.dev | T L–P | D L–P | Keputusan | Kelemahan Lakar menurut bukti juri |
|---|---|---|---|---|---|
| P1 | 265.7 / 219.5 dtk (1,21) | 12–12 | 3–4 | Setara | foto hero/mentor yang diminta tidak ada (R1 0–1); satu judul yatim |
| P2 | 142.9 / 147.7 dtk (0,97) | 11–12 | 3–2 | Setara | skala tipografi agak datar; tanpa artwork (R5/R10 1) |
| P3 | 238.9 / 129.9 dtk (**1,84**) | 11–16 | 3–4 | Kalah (gerbang waktu) | 4 screenshot +  + 5 execute (alur akhir dilanggar), 3 `photo_search` gagal; hero dirakit dari ikon (slop "ilustrasi dari path"); angka rating 4,7 bersaing dengan judul |
| P4 | 187.6 / 231.5 dtk (0,81) | 16–12 | 4–4 | Lebih baik | – |

- 3 dari 4 Setara/Lebih baik, emoji 0, gate 0, tetapi P3 waktu 1,84× → **belum lulus**.
- Openverse masih tidak tersedia (semua `photo_search` timeout 8 dtk / NOT_FOUND).
- Biaya iterasi 2: $10,55; kumulatif $20,48.

## Iterasi 3: skill v3

Perkiraan iterasi 3 dengan `--reuse-pendev 2`: $7,60 → $28,08 ≤ $30 (boleh). Perubahan (prinsip umum):

- **Alur akhir tepat:** satu screenshot → satu execute perbaikan → export, tanpa screenshot atau `layout_check`
  tambahan. Alasan: putaran kritik diri berulang membuat P3 1,84× (gerbang waktu).
- **Visual pengganti tanpa ilustrasi rakitan:** sampul/thumbnail/hero isi = bidang bernada + tipografi tebal (judul,
  angka); tidak merakit ilustrasi dari ikon/bentuk (dibaca juri sebagai maskot dari path, R8) dan tanpa ikon besar
  transparan (dicabut dari v2).
- **Satu elemen terbesar:** angka sekunder (rating, nilai ringkas) tidak lebih besar dari judul layar (R2 P3; skala
  datar P2).

Skill: `core.md` `c74a5de318365869`, `landing.md` `3daa5de39ffc37ac`, `mobile.md` `d3c210ef78fab03d`.
