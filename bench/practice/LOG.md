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

### Perbaikan orkestrator setelah iterasi 4 (commit fada52e)

- Respons 429 Wikimedia sendiri meminta "use thumbnail images in sizes listed on https://w.wiki/GHai". Uji ulang: file
  asli dan thumbnail lewat host `upload.wikimedia.org` → 429; thumbnail bucket standar lewat host `thumb.wikimedia.org`
  (1280/1920/3840) → 200 dengan UA yang sama (HTTP/1.1, tanpa kontak).
- Perbaikan sesuai arahan Wikimedia (bukan mengakali batas, UA tetap tanpa data pribadi): `wikimediaImportUrl` selalu
  memakai thumbnail bucket standar dari path pratinjau `thumb.wikimedia.org` (maks 3840 JPEG/WebP, 1920 PNG); file asli
  tidak pernah diunduh. Uji langsung lewat `PhotoService` hasil build: 3/3 foto `wikimedia:` terimpor (1920 px).
- Iterasi 4 tercatat `aborted` (tidak dijuri). Lanjut iterasi 5 baru `--iter 5 --reuse-pendev 2`; iterasi 6 terakhir.

## Iterasi 5: skill v4 (tanpa perubahan), foto Wikimedia berfungsi — **lulus**

Perubahan skill: tidak ada. Skill v4 (iterasi 4) belum pernah dijuri karena iterasi 4 dihentikan oleh kegagalan unduhan
foto, jadi iterasi 5 menguji v4 apa adanya dengan impor Wikimedia lewat thumbnail standar (commit fada52e). Alasan: hanya
infrastruktur foto yang berubah sejak iterasi 4; mengubah skill sebelum v4 dinilai berarti menebak tanpa bukti.

Harness (commit 0747216): biaya kumulatif kini menghitung iterasi tanpa laporan dari `run.json`/`rep.json` tersimpan,
sehingga iterasi 4 ($2,66 = P1 $1,79 + P2 $0,87) ikut terhitung. P3 parsial iterasi 4 tidak punya catatan biaya
(perkiraan < $0,30) dan tidak terhitung.

Skill: `core.md` `39be8af8dcb0ad25`, `landing.md` `f0049a9b76822eea`, `mobile.md` `0e06e3ff150f7560` (HEAD `0747216`).
Run: `practice --iter 5 --reuse-pendev 2`. Prompt sha di frozen.json = `582c5d11…` (beku).

| Prompt | Rasio waktu | T Lakar / pen.dev | D Lakar / pen.dev | Emoji | Gate | Keputusan |
|---|---|---|---|---|---|---|
| P1 | 1,22× | 15 / 13 | 4 / 4 | 0/0/0 | 0 | Setara |
| P2 | 1,01× | 13 / 12 | 3 / 3 | 0/0/0 | 0 | Setara |
| P3 | 1,26× | 14 / 15 | 3 / 4 | 0/0/0 | 0 | Setara |
| P4 | 1,29× | 15 / 12 | 4 / 4 | 0/0/0 | 0 | Lebih baik |

- Foto: impor Wikimedia berhasil (tanpa 429). Foto hero/mentor (P1), foto hidangan + avatar pengulas (P3), avatar
  dokter (P4). Satu pencarian NOT_FOUND di P1 tidak diulang. Tidak ada teks kredit/atribusi di UI dokumen Lakar.
- Kelemahan yang tersisa (catatan untuk story berikut, bukan diperbaiki di sini): P2 sampul episode masih monogram
  dan permukaan gelap netral tanpa tint aksen (R10 = 1); P3 permukaan putih berbingkai dengan warna kedua hanya di satu
  bagian (R10 = 1).
- Penjaga `.pen`: berubah 0, hilang 0. lakard active.
- Biaya iterasi 5: $7,35 (Lakar $4,39, juri $2,96); kumulatif **$37,81** dari $57,80.

## Status: **lulus** di iterasi 5 (4 dari 4 Setara/Lebih baik)

Iterasi 6 tidak dijalankan. Menunggu Adam melihat PNG (done_checkpoint): Lakar `bench/practice/5/<P>-lakar.png`,
pen.dev lokal `bench/runs/practice/2/<P>-pendev.png`.

## Iterasi 6: skill v5 (validasi skill akhir setelah review)

Review (lensa quick) atas iterasi 5 menemukan beberapa contoh/rincian skill v4 yang terlalu dekat dengan prompt latihan
(contoh kueri foto bertema makanan/musik, "angkatan", "mentor", "tile 2 × 3", "pemutar"). Walau lolos penjaga C7, ini
melanggar semangat "tanpa tambalan per prompt". Perubahan v5 (bukan perbaikan mutu, hanya menetralkan):

- Contoh kueri foto diganti domain contoh skill sendiri (kopi/roti); orang = "testimoni, tim, profil"; pricing "tier atau
  slot jadwal" dengan keadaan "sisa kuota, tanggal, habis/tersedia"; bilah menempel "keranjang, proses berjalan"; "tile
  lebih kecil" tanpa ukuran grid.
- Bug prelude: `Badge` dengan nada tak dikenal (mis. `info`) jatuh ke aksen, bukan `undefined`.

Iterasi 6 (`--reuse-pendev 2`) menguji skill akhir ini agar hasil yang dilaporkan berasal dari skill yang di-commit.
Skill: `core.md` 8f2fe336bcb1c7dc, `landing.md` b953c1b2bae4a8d4, `mobile.md` 38aa49528f9c464f.

### Hasil iterasi 6 (`bench/practice-6.md`, HEAD `07ab5c6`, pen.dev dipakai ulang dari iterasi 2)

| Prompt | Waktu Lakar / pen.dev | T L–P | D L–P | Keputusan | Catatan |
|---|---|---|---|---|---|
| P1 | 216,1 / 219,5 dtk (0,98) | 14–12 | 4–4 | Setara | foto hero + 3 mentor + avatar alumni |
| P2 | 121,9 / 147,7 dtk (0,83) | 13–13 | 3–3 | Setara | thumbnail episode kini foto; tile satu keluarga ungu |
| P3 | 222,2 / 129,9 dtk (**1,71**) | 14–14 | 3–4 | Kalah (gerbang waktu) | proses: 1 SCHEMA_INVALID + 2 screenshot + 6 execute (board gulir dibangun terpisah); iterasi 5 P3 = 1,26× dengan alur 4 execute |
| P4 | 271,0 / 231,5 dtk (1,17) | 15–11 | 4–4 | Lebih baik | – |

- 3 dari 4 Setara/Lebih baik, emoji 0, gate 0, tetapi P3 waktu 1,71× → **belum lulus** (AC: waktu ≤ 1,5× di keempat
  prompt). Perubahan v5 tidak menyentuh alur proses mobile; kelambatan P3 berasal dari variasi proses agen (galat skema
  + putaran screenshot tambahan), bukan foto (2 pencarian paralel, 0 galat foto).
- Biaya iterasi 6: $7,37; kumulatif **$45,18** dari $57,80.

## Status: HALT `blocked` (iterasi 6 = batas, belum lulus)

- Iterasi 5 (skill v4) lulus 4/4; iterasi 6 (skill v5 = v4 yang dinetralkan setelah review + perbaikan `Badge`) 3/4 dengan
  gerbang waktu P3 gagal. Tidak ada iterasi ke-7 (batas Adam).
- Butuh keputusan Adam: (a) menerima hasil iterasi 5 sebagai bukti lulus walau skill akhir v5 hanya teruji di iterasi 6
  (gagal hanya karena waktu P3), atau (b) dana/iterasi tambahan untuk mengukur ulang v5 dan/atau mengencangkan disiplin
  alur akhir mobile; serta (c) tinjauan PNG.

## Iterasi 7 (konfirmasi): skill v6 — prinsip mobile, keragaman hue koleksi, disiplin alur akhir

Dibuka Adam 2026-11-18 setelah HALT iterasi 6: satu iterasi konfirmasi, `--reuse-pendev 2` (pen.dev tidak dijalankan),
anggaran iterasi ≤ $10 (batas kumulatif $55,18; `MAX_ITER` 7). Check LC-20 kini menandai konten terpotong/tertutup zona
bawah dan judul seksi yatim sebagai error gerbang (commit db1df37).

Harness: `MAX_ITER` 7, `BUDGET_USD` 55,18 (+ tes); README diperbarui.

Perubahan skill v6 (prinsip umum, berlaku untuk layar apa pun):

- **Layar pertama mobile padat dan selesai rapi** (`mobile.md`). Alasan: di iterasi 6 layar pertama berakhir dengan judul
  seksi yang isinya tertutup bilah bawah dan kartu terpotong (kini LC-20). Prinsip: header satu blok ≤ 64 (baris konteks
  hanya bila ruang tersisa), visual puncak ≤ ±280, anggaran tinggi dihitung sebelum menulis kode terhadap y atas zona
  bawah, butir terakhir berakhir ≥ 8 di atas zona, seksi yang tidak muat mulai utuh di balik zona atau di board posisi
  akhir; layar panjang diputuskan saat merencanakan, `scrollY` posisi akhir jatuh di awal seksi/butir.
- **Keragaman hue koleksi** (`core.md` Prinsip 5, peran warna; `mobile.md` tile). Alasan: tile koleksi tanpa foto di
  iterasi 6 menjadi gradasi satu hue (aturan lama "satu keluarga"). Prinsip: satu hue per kategori (4–6 hue serasi,
  terang/jenuh setara), kesatuan dari bentuk/ikon/tipografi; palet kategori dihitung sebagai satu peran sehingga batas
  "maks 2 hue non-status" berlaku di luar palet itu.
- **Disiplin alur akhir** (`core.md` langkah 6, `mobile.md` §Alur execute). Alasan: P3 iterasi 6 = 1,71× karena galat
  skema (`layout` pada board), board posisi akhir dibangun setelah screenshot, `inspect` dan screenshot tambahan
  (6 execute). Prinsip: semua board (termasuk posisi akhir) di execute pertama; temuan `check` diperbaiki sekaligus dalam
  satu execute; satu screenshot per board → satu execute perbaikan semua temuan → export; tanpa `inspect`/screenshot
  tambahan; board sudah kolom (tanpa `layout`). Biasanya 2, maks 3 execute.
- Penghematan token `core.md` (3994/4000): kalimat yang mengulang prelude dihapus (`F`/`Row`, padding/radius tombol,
  `place` pada revisi), kalimat pengganti foto dipadatkan.

Skill: `core.md` 38e5bdecbeb86cfd, `landing.md` b953c1b2bae4a8d4 (tidak berubah), `mobile.md` 292380fd57fe8f8a.
Verifikasi sebelum run: build OK, 793/793 tes (48 file; termasuk C7, batas token, contoh skill 0 error/warning/gate),
api.md sama, protocolHash 907cb36f…edb85d, bench/protocol & bench/rubric tidak berubah sejak 97ec581, lakard active.

### Hasil iterasi 7 (`bench/practice-7.md`, HEAD `d82dbcf`, pen.dev dipakai ulang dari iterasi 2): **dibatalkan**

| Prompt | Waktu Lakar / pen.dev | Rasio | Gate | Emoji (a/b) | Keputusan | Catatan |
|---|---|---|---|---|---|---|
| P1 | 239,6 / 219,5 dtk | 1,09 | 0 | 0/0 | tidak dinilai | 5 execute + 1 FONT_MISSING (`≤`) + 1 `inspect` |
| P2 | 132,2 / 147,7 dtk | 0,89 | 0 | 0/0 | tidak dinilai | dua board dibangun di execute pertama; tile koleksi kini 6 hue berbeda; 5 execute (3 perapatan berurutan) |
| P3 | 150,5 / 129,9 dtk | 1,16 | – | 0/– | Kalah (run `invalid`) | `dokumen lama: dapur-wening-resep sudah ada sebelum run` |
| P4 | – | – | – | – | tidak dijalankan | iterasi berhenti setelah P3 |

- Penyebab: dokumen `dapur-wening-resep` (172 byte, 12:25 UTC) tertinggal dari run P3 iterasi 4 yang dihentikan. Run itu
  tidak punya `run.json`, sehingga `benchLakarSlugs` (yang membaca slug dari `run.json`) tidak mengarsipkannya. Agen
  iterasi 7 kebetulan memilih slug yang sama → `invalid` (`dokumen lama`).
- Run `invalid` karena `dokumen lama` bersifat final menurut `isFinalRun` (agen sudah bekerja penuh; C8: tidak diulang untuk
  memilih hasil), jadi `--resume` tidak boleh mengulang P3. Juri tidak dijalankan untuk prompt mana pun. Iterasi 8 tidak
  diizinkan.
- Kesan dari PNG P2 (tanpa juri, bukan keputusan): keragaman hue koleksi tercapai; layar pertama memuat semua bagian dan
  board posisi akhir rapi; masih ada sisa butir daftar yang terlihat di celah antara tab bar mengambang dan home indicator
  (tidak ditandai LC-20).
- Disiplin alur akhir belum tercapai penuh: P2 3 execute perapatan berurutan setelah execute pertama, P3 2 SCHEMA_INVALID
  + `layout_check` terpisah, P1 `inspect` tambahan; waktu tetap ≤ 1,16×.
- Penjaga `.pen`: 41 file, berubah 0, hilang 0. lakard active.
- Biaya iterasi 7: $2,91 (Lakar saja); kumulatif **$48,09** dari $55,18.

## Status: HALT `blocked` (iterasi 7 = iterasi konfirmasi terakhir, dibatalkan karena run P3 `invalid`)

- Butuh keputusan Adam: (a) izin satu run ulang P3 iterasi 7 (atau iterasi 8) setelah dokumen sisa iterasi 4 diarsip —
  menyimpang dari aturan C8 `isFinalRun`, walau penyebabnya kegagalan setup harness, bukan pemilihan hasil; anggaran
  sisa $7,09 cukup untuk P3 + P4 + juri 4 prompt (perkiraan $5,10); (b) perbaikan harness: `benchLakarSlugs` juga membaca
  slug `open_doc` dari `stream.jsonl` run tanpa `run.json` (run yang dihentikan), agar sisa seperti ini selalu diarsip.
- Catatan: dokumen `dapur-wening-resep` sekarang tercatat di `run.json` P3 iterasi 7, jadi arsip berikutnya akan
  memindahkannya otomatis.

### Catatan review iterasi 7 (2026-11-18)

- Review quick: prelude `core.md` memakai warna yang sama untuk pendamping (`acc2`, seri data ketiga) dan status warning
  (`#B45309`), sehingga badge `extra` = `warning`. Diganti `#CA8A04` (prinsip: pendamping dan status = peran berbeda, warna
  berbeda). core.md sha 6ce0eace7c3f255c; belum diuji di run latihan (tidak ada iterasi lagi).
- Ditunda: arsip dokumen run tanpa `run.json` (penyebab pembatalan iterasi 7); celah LC-20 di bawah tab bar mengambang.
