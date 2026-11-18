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
| P3 | 238.9 / 129.9 dtk (**1,84**) | 11–16 | 3–4 | Kalah (gerbang waktu) | 4 screenshot + `layout_check` + 5 execute (alur akhir dilanggar), 3 `photo_search` gagal; hero dirakit dari ikon (slop "ilustrasi dari path"); angka rating 4,7 bersaing dengan judul |
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

### Hasil iterasi 3 (`bench/practice-3.md`, HEAD `43f0cc5`, pen.dev dipakai ulang dari iterasi 2)

| Prompt | Waktu Lakar / pen.dev | T L–P | D L–P | Keputusan | Kelemahan Lakar menurut bukti juri |
|---|---|---|---|---|---|
| P1 | 286.5 / 219.5 dtk (1,31) | 10–12 | 3–4 | Kalah (T < P − 1) | R1 0/0/0: foto hero dan mentor yang diminta tidak ada; R5/R10 visual lemah; 1 warna tanpa makna (R4) |
| P2 | 125.6 / 147.7 dtk (0,85) | 12–14 | 3–3 | Kalah (T < P − 1) | sampul/avatar inisial tanpa artwork (R5 1); tanpa langkah khas yang menonjol (R8 1); hijau hanya sekali (R10 1) |
| P3 | 155.0 / 129.9 dtk (1,19) | 15–15 | 4–4 | Setara | – (alur akhir v3 menurunkan waktu dari 1,84× ke 1,19×) |
| P4 | 225.8 / 231.5 dtk (0,98) | 14–12 | 4–4 | Setara | – |

- 2 dari 4 Setara/Lebih baik → **belum lulus**. Waktu ≤ 1,5×, emoji 0, gate 0 di keempat prompt.
- Catatan derau juri: strip pen.dev P2 identik dengan iterasi 2 (dipakai ulang), tetapi T pen.dev naik 12 → 14.
- Biaya iterasi 3: $7,32; kumulatif **$27,80** dari $30.

## Status: HALT `blocked` (3 iterasi, belum lulus)

Sesuai plan §Iterasi butir 4, tidak ada iterasi ke-4 (juga sisa anggaran $2,20 < perkiraan iterasi). Ringkasan:

- Lulus per iterasi: 1/4 (iter 1, P4 pen.dev gagal), 3/4 tetapi P3 1,84× (iter 2), 2/4 (iter 3).
- Yang terbukti membaik: R9 Lakar 2 hampir di semua prompt (kaya informasi), R10 naik ke 2 di P3/P4 iterasi 3
  (permukaan berlapis, warna kedua bermakna, badge bernada), waktu dalam gerbang di iterasi 3, nol emoji/gate.
- Penghambat utama yang bukan skill: **foto stok tidak tersedia sepanjang latihan.** Openverse (penyedia aktif tanpa
  key Pexels) menjawab 504 atau > 8 dtk untuk hampir semua kueri (cek terakhir: 200 setelah 21 dtk), sehingga setiap
  prompt yang meminta foto (P1 hero + mentor, P2 foto profil/sampul, P3 foto hidangan) kehilangan R1/R5/R10 terhadap
  pen.dev yang punya gambar sendiri. Ini mengenai A dan B putaran resmi dengan cara yang sama.
- Butuh keputusan Adam: (a) key Pexels (bila tersedia) atau penyedia foto lain/timeout Openverse lebih panjang di
  luar story ini; (b) apakah iterasi skill dilanjutkan dengan anggaran baru; (c) penilaian PNG
  `bench/practice/<k>/<P>-lakar.png` vs `bench/runs/practice/<k>/<P>-pendev.png`.

## Blokir dibuka (2026-11-18, keputusan Adam)

Penyedia foto utama kini Wikimedia Commons (`wikimedia:<pageid>`, commit da36b22); anggaran tambahan ≤ $30 untuk
maksimal 3 iterasi lagi (4–6; batas kumulatif $57,80); semua iterasi 4–6 memakai `--reuse-pendev 2` (pen.dev tidak
dijalankan ulang). Harness: `MAX_ITER` 6, `BUDGET_USD` 57,8, preflight mode reuse tidak mewajibkan service pen-desktop
aktif (penjaga md5 `.pen` tetap). Prompt beku dan aturan juri/keputusan v2.1 tidak berubah.

## Iterasi 4: skill v4

Perubahan (prinsip umum, dari bukti iterasi 3 lintas prompt):

- **Foto benar-benar dipakai.** Foto wajib untuk isi nyata (orang, tempat, makanan, produk, media) di hero, sampul,
  kartu konten, avatar. Satu pencarian `limit:12` mengisi semua slot sejenis (maks 2 pencarian paralel bersama
  `open_doc`, tanpa pengulangan). Kueri 2–3 kata benda Inggris yang visual (tempat/objek/suasana); orang = kueri potret
  stok umum, bukan nama/jabatan/rapat. Pilih foto berwarna, kontemporer, subjek jelas, berbeda per butir. Alasan: R1/R5/R10
  di P1/P2 jatuh karena foto yang diminta tidak ada (sampul/avatar inisial dibaca placeholder); Wikimedia kini andal
  (diuji: hasil relevan untuk makanan, tempat, objek, dan potret stok CC0).
- **Koleksi cerah dan bermakna, bukan redup.** Aturan v2 "koleksi memakai nada redup" dicabut. Tile/kategori tanpa foto
  memakai bidang cerah `C.data` dengan teks kontras, nada = kategori tertulis; bukan kusam, bukan pelangi acak. Fokus
  dijaga lewat ukuran/posisi. Alasan: juri menyebut "tile mix kusam" (P2 R10).
- **Pendamping dan status berulang.** `acc2` dan warna status masing-masing muncul di ≥ 2 bagian dengan makna sama.
  Alasan: "hijau hanya muncul sekali" (P2 R10).
- **Tanpa potongan/luberan.** Kartu berteks tinggi `hug` (baris `align:'stretch'`), lebar isi bar = persen × lebar induk;
  kritik diri screenshot memeriksa teks terpotong, bar meluber, dan slot foto kosong. Alasan: kartu mentor terpotong dan
  bar meluber di P1 (R10).
- Pengganti saat pencarian gagal: tidak lagi inisial di area foto besar.
- `core.md` dipadatkan agar ≤ 4000 token (3999); detail jenis layar ke `landing.md` (foto hero/potret mentor) dan
  `mobile.md` (sampul/tile/thumbnail foto, avatar foto).

Skill: `core.md` `39be8af8dcb0ad25`, `landing.md` `f0049a9b76822eea`, `mobile.md` `0e06e3ff150f7560` (HEAD `bdd7d04`).

### Iterasi 4 dihentikan (2026-11-18, sebelum juri): unduhan foto Wikimedia ditolak 429

- Run: P1 Lakar `success` (272,0 dtk = 1,24× pen.dev, $1,79), P2 Lakar `success` (140,0 dtk = 0,95×, $0,87), P3 Lakar
  dihentikan di tengah run (belum ada `run.json`; biaya tidak tercatat, perkiraan < $0,30), P4 dan juri belum
  dijalankan. Belum ada `bench/practice-4.md`. Terpakai iterasi 4 ≈ $2,66 (+ P3 parsial); kumulatif ≈ $30,5–30,8.
- Skill v4 bekerja sesuai niat: agen memanggil `photo_search` paralel bersama `open_doc` dengan `limit:12`, memilih
  foto untuk hero, mentor, sampul, dan avatar. Pencarian (API `commons.wikimedia.org`) berhasil.
- **Penghambat (bukan skill):** setiap **unduhan** gambar ke `upload.wikimedia.org` dari daemon dijawab
  `HTTP 429 Too many requests` (`retry-after: 120`), untuk file asli maupun thumbnail 1280/1920/3840. Di P1 hanya 2
  foto yang sempat terimpor; agen menghabiskan 6 execute gagal (waktu + biaya). Di P2 semua foto gagal → sampul inisial.
- Diagnosis (diuji dengan `curl` dan `SafeNet` daemon, URL sama): HTTP/1.1 + User-Agent tanpa info kontak
  (`Lakar/0.1 (internal design tool)`, juga `curl/8.5.0`) → 429; User-Agent yang memuat URL kontak → 200; HTTP/2 → 200.
  Kebijakan User-Agent Wikimedia meminta info kontak (URL atau email) untuk klien otomatis; klien tanpa kontak
  dibatasi keras. Pada story 1.18 batas ini belum terpicu (volume kecil).
- Tidak diakali: mengisi URL/email kontak palsu atau mengganti protokol hanya untuk lolos pembatas sama dengan
  mengakali rate limit (dilarang plan 1.18), dan info kontak asli adalah data Adam (tidak boleh diisi tanpa izin).
  Iterasi dihentikan agar anggaran tidak terbuang pada run tanpa foto.
- **Butuh keputusan Adam:** info kontak untuk User-Agent Lakar (URL repo/proyek atau email operasional) yang boleh
  dikirim ke Wikimedia, atau penyedia foto lain. Sesudah itu: lanjutkan iterasi 4 (`--resume` hanya mengulang P3; P1/P2
  tetap dengan foto gagal) atau mulai iterasi 5 baru (`--iter 5 --reuse-pendev 2`, disarankan; sisa iterasi 5–6,
  sisa anggaran ≈ $27).
