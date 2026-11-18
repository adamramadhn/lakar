---
title: 'Skill lebih kaya diuji dengan prompt latihan'
type: feature
ticket: '19'
created: '2026-11-18'
status: blocked
baseline_revision: '97ec58176a5e8d7abf19dddc6f7d6ac79266cc85'
route: full
route_source: auto
risk: high
review: 'none'
review_source: 'halt-blocked-before-review'
lenses_ran: []
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/bench/round-1.md'
  - '{project-root}/bench/README.md'
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-juri-bench-terkalibrasi-terhadap-penilaian-adam-plan.md'
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-agen-mencari-dan-memakai-foto-stok-lokal-plan.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Putaran 1 gagal (A Kalah, B Setara menurut Adam). Lakar patuh brief tetapi datar: aturan skill G0 tentang warna, reduksi, dan netral gelap dijalankan terlalu harfiah. Akibatnya angka tampil tanpa konteks, item daftar seragam, avatar berupa inisial, ring satu warna, dan permukaan polos. Foto stok (1.18) sudah tersedia, tetapi skill menyuruh kredit tampil di UI.

**Approach:** Revisi `core.md`, `landing.md`, `mobile.md`, dan teks foto di API/MCP berdasarkan prinsip, dengan kata sendiri. Bangun perintah harness `practice` yang menjalankan Lakar dan pen.dev pada 4 prompt latihan baru (beku sebelum run apa pun) memakai runner, pembungkus, dan juri rubrik v2.1 yang ada. Iterasi skill maksimal 3 kali dengan anggaran tetap, sampai kriteria lulus tercapai. Setelah itu Adam melihat PNG.

## Boundaries & Constraints

**Always:**
- C7 keras. Skill tidak boleh memuat teks rubrik/Lampiran B, kriteria golden, prompt A/B, teks prompt latihan, nama produk A–E atau latihan, atau deskripsi desain A/B (mis. chip streak, "dari target harian", kartu testimoni hijau). Prinsip ditulis umum dengan kata sendiri. Penjaga n-gram 6 kata dan penjaga token harus lulus.
- Anti-slop tetap berlaku: tanpa emoji atau glyph sebagai ikon, tanpa gradien ungu/mesh, tanpa dekorasi kosong, tanpa maskot dari path. Setiap warna selain netral harus punya makna yang bisa disebut.
- Efisiensi waktu tidak boleh turun: alur 2–4 execute besar (mobile 1–2) tetap. Prelude bertambah ≤ 6 baris. `photo_search` paling banyak 2 kali per desain, dipanggil paralel di awal sebelum execute pertama. Tidak ada retry berulang.
- Prompt latihan (teks di Design Notes) ditulis ke `bench/practice/prompts.json` dan dibekukan dengan sha256 di kode **sebelum** skill diubah dan sebelum run. Setelah itu prompt tidak boleh diubah.
- Satu run per alat per prompt per iterasi (C8). `--resume` hanya mengulang run `aborted`/`invalid`, tidak boleh dipakai untuk memilih hasil.
- pen.dev hanya lewat `runOne` (pen-newdoc + verifikasi dokumen baru). Penjaga md5 `.pen` lama berjalan, dan `.pen` lama tidak boleh berubah. Strip dan `.pen` pen.dev tetap lokal (EULA).
- Node 26 lewat `/opt/node-26/bin`. Node sistem dan service lain tidak disentuh (C9).

**Never:**
- Tidak boleh mengubah `bench/protocol/*` (protocolHash tetap `907cb36f…edb85d`), `bench/rubric/*`, DESIGN.md, golden-set.md, atau aturan `decide`/ambang.
- Tidak boleh menambal kasus spesifik prompt latihan di skill. Setiap perubahan iterasi harus berupa prinsip yang berlaku untuk jenis layar apa pun.
- Tidak boleh memakai prompt A–E untuk iterasi. Tidak boleh menjalankan `round` resmi (itu story 21).
- Tidak boleh membuat `webapp.md` (milik G1).
- Tidak boleh melewati anggaran tanpa berhenti (lihat Design Notes §Iterasi).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Iterasi penuh | `practice --iter 1` | 4×(pen.dev, Lakar) + juri 3×/prompt → `bench/practice-1.md/.json`; strip Lakar disalin ke `bench/practice/1/` | – |
| Pakai ulang pen.dev | `practice --iter 2 --reuse-pendev 1` | run pen.dev iterasi 1 dipakai (tercatat di laporan), Lakar + juri dijalankan baru | iter sumber tidak lengkap → Abort sebelum spawn |
| Prompt diubah | sha `prompts.json` ≠ konstanta beku | Abort, tes gagal | – |
| Rubrik bergeser | versi Lampiran B ≠ `rubric.json` (2.1) atau sha `lampiran-b` berbeda | Abort sebelum spawn | – |
| Dry run | `--dry-run` | cetak argv, teks juri per prompt (sha), cek C7, perkiraan biaya; tanpa spawn | – |
| Ukuran salah | board Lakar ≠ ukuran prompt | gerbang gagal → Kalah | – |
| Waktu | Lakar wall > 1,5 × wall pen.dev prompt sama | gerbang gagal → Kalah | – |
| Foto gagal | Openverse 504/429 | satu percobaan, lalu fallback blok `Image /` tint + ikon | tidak ada loop |

</intent-contract>

## Code Map

- `packages/skills/skills/core.md` -- ≤ 4000 token (sekarang 3513). Aturan penyebab datar: §Token "Warna: … satu aksen … bukan dekorasi/latar seksi besar", token netral gelap abu murni, Prinsip 5 + Proses 5 "Reduksi", Komponen "Avatar … inisial di tint", Badge hanya tint aksen, foto "`p.credit` … wajib tampil". Prelude (`C`, `F/Row/T/I/Btn`) disalin ke setiap execute, jadi harus tetap pendek. Detail per jenis layar boleh dipindah ke landing/mobile.
- `packages/skills/skills/landing.md`, `mobile.md` -- prosa ≤ 1500, total ≤ 3500 token. "Landing boleh 1–2 seksi gelap" (netral), ring satu warna, kartu/list seragam, dan "hanya satu tombol ber-fill aksen". Contoh teruji (Biji Pagi, Tutur) dijalankan oleh `packages/daemon/src/skills-examples.test.ts` (0 error/warning/gate).
- `packages/exec/src/api.ts:562-580` -- doc + contoh `photo` (contoh menaruh `p.credit` di UI). `api.md` dihasilkan lewat `scripts/gen-skill-api.mjs`.
- `packages/mcp/src/server.ts:163, 202-211` -- deskripsi execute (baris photo) + `PHOTO_SEARCH_DESCRIPTION` ("wajib dicantumkan untuk CC BY"). Tes `packages/mcp/src/index.test.ts:190-191` mengecek 'Photos provided by Pexels' dan `photo('<ref>')`.
- `tests/skills-c7.test.ts` -- penjaga skill. Sumbernya golden (Kriteria/Prosedur/Risiko), Lampiran B DESIGN.md, dan prompts.json. Token `\bR[1-8]\b`, Kasku/Gerak. `tests/judge-c7.test.ts` + `c7Targets` (`bench/src/round/main.ts:187`) mengecek rahasia juri v2.1 terhadap skill.
- `tests/skills.test.ts` -- batas token, api.md mutakhir, struktur (`// prelude`, `// pakai prelude`).
- `bench/src/round/main.ts` -- `roundMain` khusus A/B (ROUND_ORDER, baseline median, laporan round). **Jangan diubah perilakunya.** Reuse ekspor: `judgePrompt`, `writeJudgeTextExclusive`, `copyPngExclusive`, `loadTimedLines`, `harnessErrorStatus`, `isFinalRun`, `c7Targets`. `writeStrip`/`waitLakard` boleh diekspor.
- `bench/src/judge/prompt.ts:231` `buildJudgeText(design, golden, id, prompt)` -- memanggil `extractCriteria` (throw untuk id non-golden). Perlu varian tanpa kriteria golden. Teks A/B harus tetap byte-identik (sha = `rubric.json`).
- `bench/src/judge/rubric.ts` -- `lampiranB`, `rubricVersionOf`, `readRubricJson` (sourceSha256 `lampiran-b.md`) untuk penjaga versi rubrik pada latihan.
- `bench/src/round/score.ts` -- `lakarGate` (baselineMedianMs ← wall pen.dev prompt sama), `aggregateScores`, `decide` v2 (dipakai apa adanya).
- `bench/src/lakar/run.ts:81` `boardSizeProblems(promptId, boards)` hard-code A/B. Tambah varian berbasis spesifikasi ukuran; A/B tetap.
- `bench/src/lakar/archive.ts:17` `benchLakarSlugs(roundsRoot, current)` -- hanya memindai `runs/rounds`. Perluas ke `runs/practice` (untuk latihan dan round 21) agar slug tidak bentrok.
- `bench/src/pendev/run.ts` `preflight`, `runOne`, `emptyRecord` · `bench/src/lakar/run.ts` `runLakar` · `bench/src/round/emoji.ts` `countAgentEmoji`, `countLintEmoji` · `bench/src/sys.ts` `md5PenFiles`, `comparePenHashes`, `restartUserUnit`, `sha256`, `git` · `bench/src/protocol.ts` `loadProtocol` (wrapper), `renderWith`, `words`, `forbiddenPhrases`, `extractGoldenPrompt`.
- `bench/src/cli.ts` -- tambah subcommand `practice`. `.gitignore` sudah meng-ignore `bench/runs/`.

## Tasks & Acceptance

**Execution:**
- [ ] `bench/practice/prompts.json` + `bench/src/practice/prompts.ts` -- tulis 4 prompt latihan (teks persis di Design Notes) dengan `{id, name, kind, text, size:{width, height|null}}`. Konstanta `PRACTICE_PROMPTS_SHA256` dan loader yang menolak sha berbeda. Commit langkah ini (atau catat sha di `bench/practice/LOG.md`) sebelum skill diubah -- membekukan prompt (anti-overfit).
- [ ] `tests/practice-prompts.test.ts` -- (a) sha beku; (b) setelah kalimat penutup baku dibuang ("Bahasa Indonesia. Kualitas setara … auto/flex layout."), tidak ada n-gram 6 kata yang sama dengan prompt A–E di golden-set; (c) `checkC7`-gaya: tanpa frasa Kriteria/Prosedur/Risiko dan token terlarang; (d) nama produk tidak ada di golden-set. Bila (b) gagal sebelum run pertama, ubah kata-kata prompt (bukan maknanya), lalu catat di LOG -- diizinkan hanya sebelum iterasi 1.
- [ ] `tests/skills-c7.test.ts` -- tambah sumber: teks prompt latihan; token: `\bR(?:[1-9]|10)\b`, nama produk latihan (dari prompts.json). Tes penjaga-hidup ikut diperluas.
- [ ] `bench/src/judge/prompt.ts` -- `buildJudgeText` menerima kriteria opsional. Tanpa kriteria, bagian kriteria diganti satu kalimat netral bahwa prompt ini tidak punya kriteria khusus dan setiap R dinilai dari deskripsi kolomnya. Tes: teks A/B byte-identik dengan sebelumnya (sha `rubric.json`), varian latihan lulus `judgeLeaks` dan `judgeC7Problems`.
- [ ] `bench/src/lakar/run.ts`, `bench/src/lakar/archive.ts` -- `boardSizeProblemsFor(size, boards)` (A/B memanggilnya dengan spesifikasi lama) dan `benchLakarSlugs` multi-root (`runs/rounds` + `runs/practice`). Tes diperbarui.
- [ ] `bench/src/practice/main.ts` (+ `practice.test.ts`) -- `practice --iter <k> [--only P1,P3] [--reuse-pendev <j>] [--resume] [--dry-run]`.
  - Preflight: loader prompt beku, wrapper dari `bench/protocol/wrapper.txt` (read-only), rubrik versi = `rubric.json` (2.1) + sha `lampiran-b`, C7 juri (`c7Targets` + prompt latihan hasil render), lakard + pool siap.
  - Selalu restart lakard sesudah arsip slug, lalu wajib `startedAt` > mtime `packages/*/dist` terbaru. Catat `frozen.json`: HEAD, porcelain, sha skill per file, sha dist, versi claude/pen.dev, sha teks juri per prompt.
  - Urutan per prompt: pen.dev lalu Lakar (atau pakai ulang pen.dev iterasi j). Strip → `judgePrompt` 3× → `aggregateScores` → `decide` dengan `lakarGate({baselineMedianMs: wall pen.dev prompt itu})` dan ukuran pen.dev.
  - Emoji (a)/(b)/(c). Penjaga md5 `.pen`.
  - Laporan `bench/practice-<k>.md/.json`: tabel per prompt (waktu, rasio, biaya, gerbang, T, D, skor per R, keputusan, emoji, path PNG kedua alat), status lulus iterasi, biaya iterasi + kumulatif dari laporan sebelumnya.
  - Strip Lakar disalin (eksklusif) ke `bench/practice/<k>/<P>-lakar.png`.
  - Fungsi murni (parse arg, `practiceOutcome`, rencana reuse, biaya kumulatif) dites.
- [ ] `bench/src/cli.ts`, `bench/README.md` -- daftarkan `practice` + USAGE. README menjelaskan bahwa latihan bukan gerbang G0.
- [ ] `packages/skills/skills/core.md` -- revisi prinsip (lihat Design Notes §Diagnosis). Token peran warna di prelude, satu helper `Badge` bernada, avatar/foto, aturan foto baru, dan ringkasan akhir mencantumkan kredit foto. Tetap ≤ 4000 token: pindahkan detail jenis layar ke landing/mobile.
- [ ] `packages/skills/skills/landing.md`, `mobile.md` -- prinsip per jenis layar + contoh teruji diperbarui agar memperagakan prinsip baru. Domain contoh tetap kopi/kursus bahasa atau domain baru yang bukan A–E/latihan. Contoh lulus 0 error/warning/gate.
- [ ] `packages/exec/src/api.ts` (+ regen `api.md`), `packages/mcp/src/server.ts` -- teks foto: dahulukan CC0/PDM, kata kunci Inggris, kredit/atribusi tercatat di metadata aset dan disebut di ringkasan akhir, tidak ditampilkan di UI kecuali pengguna meminta. Contoh `photo` tanpa node kredit.
- [ ] `bench/practice/LOG.md` -- satu entri per iterasi: sha skill, apa yang diubah, prinsip/alasan, hasil per prompt, biaya.
- [ ] Jalankan iterasi sesuai Design Notes §Iterasi.

**Acceptance Criteria:**
- Given iterasi terakhir, when `bench/practice-<k>.md` dibuka, then ada 4 prompt dengan PNG kedua alat (Lakar tracked, pen.dev path lokal), skor juri v2.1 (T, D, per R), waktu, biaya, dan keputusan, dan Lakar Setara/Lebih baik di ≥ 3 dari 4.
- Given iterasi yang sama, when tabel dibaca, then di keempat prompt waktu Lakar ≤ 1,5 × waktu pen.dev, emoji Lakar (a)/(b)/(c) = 0, dan layout_check gate = 0.
- Given `bench/practice/LOG.md`, when dibaca, then setiap iterasi mencatat perubahan sebagai prinsip umum + alasan + hasil, dan `prompts.json` tidak berubah setelah iterasi 1 dimulai (sha di `frozen.json` setiap iterasi = `PRACTICE_PROMPTS_SHA256`).
- Given skill akhir, when `read_skill` membaca core/landing/mobile, then tidak ada frasa rubrik/kriteria/prompt A–B/prompt latihan (tes C7 lulus), dan contoh lulus terhadap API dengan 0 error gerbang.
- Given iterasi lulus, when orkestrator meneruskan PNG ke Adam, then story berhenti di done_checkpoint sampai Adam melihat PNG.

## Implementation Notes

Catatan orkestrator (berlaku untuk seluruh run, tambahan atas Boundaries):
- Bekukan prompt latihan dengan **commit git tersendiri** (prompts.json + prompts.ts + tes sha + LOG.md awal) **sebelum** file skill mana pun diubah. Prompt tidak diubah setelah melihat hasil.
- Aturan keputusan/juri v2.1 tidak diubah. Juri latihan tetap buta (tidak tahu alat mana Lakar/pen.dev).
- pen.dev hanya lewat MCP pencil via `runOne` (pen-newdoc.sh + verifikasi dokumen aktif baru & kosong). Jangan menimpa .pen yang ada (Comprice.pen, design/lakar-golden-set.pen, dll.); dokumen golden set tidak boleh aktif saat agen berjalan; jangan pernah membuka ~/.pencil/session-desktop.json. Ragu → hentikan run, laporkan.
- Iterasi maks 3; anggaran run berbayar total ≤ $30 (kumulatif dari laporan practice). Jangan iterasi ke-4.
- C9: Node via `/opt/node-26/bin` path absolut; tanpa apt; jangan sentuh konfigurasi Claude global, service lain, port, Docker, npm global, Penpot; `systemctl --user restart lakard` setelah build skill dan pastikan active. Folder di .git/info/exclude jangan diubah. Jangan push/merge.
- Jangan menunggu proses background lalu mengakhiri giliran: jalankan perintah panjang (practice) di foreground dengan timeout maksimal, atau background + polling sampai selesai, dalam giliran yang sama.

## Plan Change Log

## Review Triage Log

## Design Notes

**Diagnosis (aturan penyebab datar → prinsip baru, kata sendiri):**
- "Satu aksen; bukan latar seksi besar" → *peran warna*. Aksen tetap memimpin aksi dan state aktif. Selain itu palet punya tiga peran yang sah: (1) **bidang merek**: latar seksi/kartu sorotan dari tint muda atau versi tua aksen, bukan abu polos; (2) **satu warna pendamping** dengan satu makna tetap (pencapaian, peringatan, kategori), dipakai berulang supaya terbaca sebagai sistem; (3) **warna status** untuk arah perubahan dan keadaan. Uji yang menggantikan "satu aksen": setiap warna bisa disebut maknanya.
- Netral gelap abu murni + "seksi gelap untuk ritme" → **gelap bernuansa merek**: base gelap dicampur sedikit hue aksen, lalu 3 lapis permukaan (dasar, kartu, terangkat) + garis halus. Sorotan boleh memakai bidang aksen penuh.
- "Reduksi" → **kaya informasi, miskin hiasan**. Yang dihapus adalah ornamen tanpa fungsi. Konteks angka, status, dan metadata adalah isi, bukan hiasan.
- Angka telanjang → **setiap angka kunci punya pembanding** (sasaran, periode lalu, sisa, satuan) dan arah perubahan berwarna status + ikon panah.
- Item daftar seragam → **daftar memperlihatkan keadaan** (selesai, sedang/berikutnya disorot, mendatang, terkunci) dengan perlakuan berbeda dan label kecil.
- Ring/grafik satu warna → **seri data bernada berbeda** dari palet data kecil (aksen + 2 nada harmonis), dengan titik legenda yang cocok.
- Badge hanya tint aksen → helper `Badge(p, label, tone)` dengan nada accent/success/warning/danger/neutral. Chip metrik kecil boleh muncul di header kartu.
- Wadah ikon selalu tint → boleh **solid aksen + ikon terang** untuk butir yang ditekankan. Ikon `filled` untuk rating.
- Avatar inisial → **foto orang** (photo_search portrait) untuk testimoni, mentor, dan profil. Inisial hanya cadangan.
- Kedalaman: kartu sorotan di terang memakai bayangan md + tint, di gelap memakai lapis terangkat. Kartu biasa tetap border.
- Anti-slop tetap: tanpa emoji, gradien ungu, glow, kaca, dekorasi kosong, atau warna yang tidak bisa dijelaskan. Maksimal 2 hue non-status di luar netral.

**Foto:** dipakai bila konten nyata menampilkan orang, tempat, makanan, atau produk (hero/sampul, kartu konten, avatar). Tidak dipakai untuk ikon fitur atau UI abstrak. Pilih CC0/PDM bila tersedia, lalu Pexels, dan CC BY hanya bila tidak ada pilihan lain. Kata kunci bahasa Inggris yang konkret. Kredit tidak ditampilkan di UI kecuali diminta. Atribusi sudah tercatat di metadata aset (1.18) dan disebut di ringkasan akhir. Gagal satu kali → fallback.

**Prompt latihan (beku; teks persis; semua diakhiri kalimat penutup baku golden "Bahasa Indonesia. Kualitas setara desainer produk senior: hierarki tipografi jelas, spacing konsisten (grid 8px), kontras baik, auto/flex layout."):**
- P1 landing (1440×bebas, foto): `Desain halaman landing desktop selebar 1440px untuk "Rakit Kode", bootcamp pemrograman web daring bagi pemula. Bagian: menu atas, hero dengan judul besar, subjudul, dua tombol aksi, dan foto suasana belajar; alur belajar 3 tahap; profil 3 mentor dengan foto; cerita alumni beserta pekerjaan mereka sekarang; jadwal angkatan dan biaya; FAQ; footer. Gaya modern, bersemangat, tepercaya, aksen biru.`
- P2 mobile gelap (390×844): `Desain layar utama aplikasi mobile musik dan podcast "Siaru" (390x844). Isi: header dengan sapaan dan foto profil, kartu lanjutkan mendengarkan (episode terakhir dan sisa waktunya), 6 tile mix harian, daftar 4 episode baru dengan durasi dan status unduhan, mini player yang menempel di atas tab bar 4 ikon. Mode gelap, aksen ungu.`
- P3 mobile terang detail (390×844, foto): `Desain layar detail resep untuk aplikasi masak "Dapur Wening" (mobile 390x844). Isi: foto hidangan lebar di bagian atas dengan tombol kembali dan simpan, nama resep, waktu masak, porsi, tingkat kesulitan, ulasan pengguna, tab Bahan dan Langkah, daftar bahan dengan takaran dan tanda sudah disiapkan, serta tombol mulai memasak yang tetap di bawah. Mode terang, aksen merah tomat.`
- P4 dashboard web (1440×900): `Desain halaman dashboard desktop (1440x900) untuk "Dentara", sistem jadwal klinik gigi. Isi: sidebar navigasi, header berisi tanggal hari ini dan pencarian pasien, 3 kartu ringkasan (janji hari ini, pasien baru, pendapatan) dibanding minggu lalu, linimasa janji per dokter untuk hari ini, antrean pasien di ruang tunggu dengan status, dan panel bahan habis pakai yang hampir habis. Mode terang, aksen teal.`

**Iterasi & anggaran:**
1. Bekukan prompt → revisi skill v1 dari diagnosis (sebelum run apa pun) → `pnpm build`, semua tes (C7, contoh, batas token) → `practice --iter 1 --dry-run` → `practice --iter 1`. Perkiraan: pen.dev $0,6–0,9 + Lakar $0,5–1,1 + juri 3× ≈ $0,75 per prompt, jadi ≈ $8–11 dan ±45 menit.
2. Belum lulus: baca bukti juri + PNG lintas prompt, kelompokkan kelemahan per prinsip (bukan per prompt), lalu ubah skill. Catat di LOG. Lanjut `practice --iter 2 --reuse-pendev 1` (Lakar + juri ≈ $5–8).
3. Maksimal 3 iterasi. Anggaran total ≤ $30. Hentikan sebelum iterasi yang perkiraannya melewati sisa anggaran.
4. Lulus = kriteria AC di iterasi mana pun → berhenti, laporkan untuk done_checkpoint. Setelah 3 iterasi belum lulus, atau anggaran habis → HALT `blocked` dengan laporan terakhir (butuh keputusan Adam).

## Verification

**Commands:**
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH pnpm build && PATH=/opt/node-26/bin:$PATH pnpm test` -- expected: exit 0, termasuk `tests/skills-c7.test.ts`, `tests/judge-c7.test.ts`, `tests/skills.test.ts`, `tests/practice-prompts.test.ts`, `packages/daemon/src/skills-examples.test.ts` (Chromium, 0 skip), dan `packages/mcp/src/index.test.ts`.
- `cd /root/lakar && /opt/node-26/bin/node scripts/gen-skill-api.mjs && git diff --exit-code packages/skills/skills/api.md` -- expected: tidak ada beda sesudah commit.
- `cd /root/lakar && /opt/node-26/bin/node -e "import('./bench/dist/protocol.js').then(m=>console.log(m.protocolHash()))"` -- expected: `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d`; `git diff --exit-code 97ec581 -- bench/protocol bench/rubric` kosong.
- `cd /root/lakar && /opt/node-26/bin/node bench/dist/cli.js round --round uji-9 --dry-run` -- expected: teks juri A/B sha = `rubric.json` (round tidak regresi).
- `cd /root/lakar && /opt/node-26/bin/node bench/dist/cli.js practice --iter 1 --dry-run` -- expected: 4 prompt, sha beku, rubrik 2.1, C7 lulus, tanpa spawn.
- `cd /root/lakar && /opt/node-26/bin/node bench/dist/cli.js practice --iter <k> [--reuse-pendev 1]` -- expected: `bench/practice-<k>.md` memenuhi AC; penjaga `.pen`: berubah/hilang 0.
- `/root/lakar/tools/node26/verify.sh` -- expected: semua OK, snapshot C9 identik.

**Manual checks:**
- Buka strip Lakar di `bench/practice/<k>/` dan strip pen.dev di `bench/runs/practice/<k>/`. Cek bidang merek, warna pendamping, badge, konteks angka, variasi status, foto, nol emoji, dan tanpa kredit di UI. Adam melihat PNG (done_checkpoint).

## Auto Run Result

Status: **blocked**.
Blocking condition: 3 iterasi latihan selesai tanpa lulus (aturan Design Notes §Iterasi butir 4); anggaran terpakai $27,80 dari $30 (sisa tidak cukup untuk iterasi lain). Butuh keputusan Adam: penyedia foto (Openverse praktis tidak responsif sepanjang run: timeout 8 dtk/NOT_FOUND; kunci Pexels atau timeout lebih panjang ada di luar story ini), dana iterasi tambahan, dan tinjauan PNG.

- Iter 1: P1 Kalah, P2 Kalah, P3 Setara, P4 tidak dapat dinilai (run pen.dev gagal, tidak diulang, C8). $9,92.
- Iter 2 (pen.dev baru; reuse iter 1 ditolak karena P4 tidak lengkap): P1 Setara, P2 Setara, P3 Kalah (waktu 1,84×), P4 Lebih baik. $10,55.
- Iter 3 (pen.dev reuse iter 2): P1 Kalah, P2 Kalah, P3 Setara, P4 Setara. $7,32. Kumulatif $27,80.
- Emoji Lakar 0 dan gate layout_check 0 di semua iterasi. Prompt beku di d4cdd02 (sha 582c5d11…), sama di frozen.json ketiga iterasi.
- Verifikasi orkestrator: build OK, 763/763 tes (48 file), api.md tanpa beda, protocolHash 907cb36f…edb85d, bench/protocol & bench/rubric tidak berubah, practice --dry-run OK, lakard active setelah restart, verify.sh exit 0.
- Review step-04 tidak dijalankan: HALT wajib setelah 3 iterasi gagal; kode harness sudah di-commit dan perlu review di follow-up bila diteruskan.
- Laporan: bench/practice-1..3.md, bench/practice/LOG.md; PNG Lakar bench/practice/<k>/; PNG pen.dev lokal bench/runs/practice/<k>/.
