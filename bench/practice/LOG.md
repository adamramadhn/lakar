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
