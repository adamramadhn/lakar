---
title: 'Skill lebih kaya diuji dengan prompt latihan'
type: feature
ticket: '19'
created: '2026-11-18'
status: built
baseline_revision: '97ec58176a5e8d7abf19dddc6f7d6ac79266cc85'
route: full
route_source: auto
risk: high
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/bench/round-1.md'
  - '{project-root}/bench/README.md'
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-juri-bench-terkalibrasi-terhadap-penilaian-adam-plan.md'
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-agen-mencari-dan-memakai-foto-stok-lokal-plan.md'
warnings: [oversized]
deferred:
  - summary: >-
      benchLakarSlugs tidak mengarsipkan dokumen Lakar dari run yang dihentikan tanpa run.json, sehingga run berikutnya invalid (dokumen lama) dan final.
    evidence: |-
      Iterasi 7 P3: dokumen dapur-wening-resep sisa P3 iterasi 4 (dihentikan, tanpa run.json) membuat run invalid; isFinalRun memperlakukannya final dan practice berhenti. Perbaikan: baca slug open_doc dari stream.jsonl (findCommittedSlug) bila run.json tidak ada, termasuk dir .prev-*.
    location: >-
      bench/src/lakar/archive.ts:19
    severity: medium
  - summary: >-
      LC-20 tidak menandai konten yang tampak di celah antara tab bar mengambang dan tepi bawah board (di balik home indicator).
    evidence: |-
      PNG P2 iterasi 7 (bench/practice/7/P2-lakar.png) menampilkan butir daftar terpotong di y 810-844; layout-check gate 0. bottomZone mengecualikan Home indicator dan cut hanya memeriksa unit yang mulai di atas tepi atas zona.
    location: >-
      packages/check/src/rules.ts (lc20)
    severity: medium
  - summary: >-
      LC-20 tidak memeriksa celah terbuka di antara dua bar zona bawah yang bertumpuk (mis. mini player dan tab bar mengambang), jadi konten terpotong di celah itu lolos gate.
    evidence: |-
      Iterasi 8 P2 board zsVQi7E1: Overlay / Mini player y674-738, Overlay / Tab bar y746-810; PNG menampilkan irisan butir "Kopi Pagi · Hari ini" di celah 8 px, layout-check gate 0. bottomZone menggabungkan anggota bertumpuk menjadi satu blok; sub-cek gap hanya memeriksa di bawah floor (anggota terbawah), dan cut menganggap unit yang mulai di bawah zone.top sudah tertutup penuh.
    location: >-
      packages/check/src/rules.ts:463
    severity: medium
  - summary: >-
      Prinsip v7 "daftar layar pertama ≥ 3 butir utuh" tidak dipatuhi agen di P2 iterasi 8 (0 butir utuh di board pertama); thumbnail episode masih bidang warna dan avatar header inisial.
    evidence: |-
      bench/practice/8/P2-lakar.png board pertama; dicatat di bench/practice/LOG.md iterasi 8. Perbaikan butuh iterasi skill lain, yang tidak diizinkan (tidak ada iterasi ke-9).
    location: >-
      packages/skills/skills/mobile.md
    severity: medium
  - summary: >-
      Batasan intent-contract "alur 2–4 execute besar (mobile 1–2)" dilanggar di iterasi lulus: P1 9 execute + inspect, P4 7 execute, walau skill v7 membatasi landing 4 / app 3.
    evidence: |-
      bench/runs/practice/8/P1-lakar/stream.jsonl (execute 9, inspect 1), P4-lakar (execute 7); waktu tetap ≤ 1,01× sehingga gerbang waktu lolos. Penegakan (mis. batas execute di daemon/MCP) di luar story ini; dicatat di LOG.md.
    location: >-
      packages/skills/skills/core.md:9
    severity: medium
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

Catatan orkestrator lanjutan 2026-11-18 (iterasi 4–6; menggantikan butir "Iterasi maks 3; anggaran ≤ $30 … Jangan iterasi ke-4" di atas, lihat Plan Change Log):
- Iterasi maks **6**; anggaran kumulatif ≤ **$57,80** ($27,80 iter 1–3 + $30 baru). Sesuaikan `MAX_ITER`/`BUDGET_USD` di `bench/src/practice/main.ts` + tes. Jangan iterasi ke-7, jangan melewati anggaran (harness Abort sebelum spawn bila perkiraan melewati sisa).
- Iterasi 4, 5, 6 semuanya `practice --iter <k> --reuse-pendev 2`. pen.dev TIDAK dijalankan, di-restart, atau disentuh (RAM VPS terbatas). Bila preflight practice menuntut pen.dev hidup walau reuse, perbaiki harness agar mode reuse tidak memerlukannya (penjaga md5 `.pen` tetap berjalan).
- Aturan keputusan/juri v2.1 dan prompt beku (sha 582c5d11…) tidak diubah. LOG.md satu entri per iterasi (sha skill, perubahan sebagai prinsip, alasan, hasil per prompt, biaya). Commit per iterasi seperti iter 1–3.
- Arah perbaikan skill (dari pengamatan iterasi 3; prinsip umum, bukan tambalan per prompt): foto kini andal (Wikimedia Commons, `wikimedia:<pageid>`) — skill harus membuat agen benar-benar memakai foto di tempat yang pantas (hero, kartu konten, sampul, makanan/tempat/produk); kueri konkret dan visual dalam bahasa Inggris; hindari subjek yang hasilnya buruk (potret orang spesifik/rapat kantor → pilih tempat/objek/suasana, atau visual pengganti yang selesai, bukan inisial di area foto besar); maksimal ~2 pencarian, tidak mengulang pencarian gagal; warna tile/komponen lebih cerah dan bermakna (bukan kusam); cegah cacat konten terpotong/meluber (kritik diri via screenshot sebelum selesai, tetap dalam alur akhir yang ringkas). `core.md` sudah 3996/4000 token: pindahkan detail ke landing.md/mobile.md atau padatkan. C7: skill tidak memuat rubrik, prompt A/B, atau teks prompt latihan; tes penjaga harus lulus.
- RAM terbatas: jangan jalankan vitest/Chromium bersamaan dengan run practice; matikan proses sementara segera. Node selalu `/opt/node-26/bin` absolut. `systemctl --user restart lakard` setelah build skill dan pastikan active. `bash tools/node26/verify.sh` exit 0 (PATH bawaan).
- Run practice panjang: jalankan foreground dengan timeout maksimal atau background + polling sampai selesai dalam giliran yang sama; jangan pernah mengakhiri giliran untuk menunggu.
- Iterasi 6 belum lulus → berhenti, tulis status di LOG, laporkan (orkestrator HALT `blocked`).

Catatan orkestrator lanjutan 2026-11-18 (iterasi 7, konfirmasi; menggantikan butir "Iterasi maks 6 … Jangan iterasi ke-7" dan "Iterasi 6 belum lulus → berhenti" di atas, lihat Plan Change Log):
- Satu iterasi konfirmasi saja: iterasi **7**, `practice --iter 7 --reuse-pendev 2` (pen.dev tidak dijalankan/disentuh). Anggaran iterasi 7 ≤ **$10** → batas kumulatif ≤ **$55,18** ($45,18 iter 1–6 + $10). Sesuaikan `MAX_ITER` 7 / `BUDGET_USD` 55,18 di `bench/src/practice/main.ts` + tes. Tidak ada iterasi ke-8.
- Skill v6 (prinsip umum, kata sendiri, C7; tanpa rubrik/prompt A/B/teks prompt latihan/nama produk): (a) layar pertama mobile padat dan selesai rapi — header/sapaan hemat ruang, informasi penting termuat sebelum zona bawah, tidak berakhir dengan judul seksi yang isinya tertutup atau kartu terpotong; konten lebih panjang → pola gulir yang benar dengan posisi akhir bersih; (b) warna dalam satu koleksi (tile/kategori/mix) beragam hue yang bermakna dan harmonis, bukan gradasi satu hue; (c) disiplin alur akhir: sedikit execute besar, tanpa putaran screenshot berlebih, temuan LC-20 diperbaiki dalam satu execute. `core.md` ≤ 4000 token; detail mobile di `mobile.md`.
- LC-20 kini error gerbang untuk konten terpotong/tertutup zona bawah (commit db1df37; plan `plan-1-11-lc20-zona-bawah-struktural.md`).
- Iterasi 7 belum lulus → HALT `blocked` dengan LOG.

Catatan orkestrator lanjutan 2026-11-18 (iterasi 8, ulang penuh iterasi 7; menggantikan butir "Tidak ada iterasi ke-8" dan "Iterasi 7 belum lulus → HALT" di atas, lihat Plan Change Log):
- Iterasi 7 dibatalkan karena cacat harness (dokumen sisa run terhenti tidak diarsip → P3 `invalid`, juri tidak jalan, P4 tidak dijalankan), bukan karena hasil desain. Pengecualian C8: iterasi 7 diulang **penuh** sebagai iterasi **8** (keempat prompt + juri), `practice --iter 8 --reuse-pendev 2` (pen.dev tidak dijalankan/disentuh). Alasan ini dicatat di LOG.md.
- Anggaran iterasi 8 ≤ **$10** → batas kumulatif = kumulatif sebelum iterasi 8 + $10; `MAX_ITER` 8 / `BUDGET_USD` disesuaikan di `bench/src/practice/main.ts` + tes. Tidak ada iterasi ke-9.
- Sebelum run: `--dry-run` harus menunjukkan dokumen sisa run terhenti diarsip (perbaikan arsip commit cb88e3e; plan `plan-1-19-arsip-run-terhenti-dan-lc20-tab-bar-mengambang.md`; LC-20 tab bar mengambang ikut diperbaiki).
- Skill v7 (prinsip umum, kata sendiri, C7; tanpa rubrik/prompt A/B/teks prompt latihan/nama produk latihan): layar pertama mobile tanpa duplikasi konten (item yang sama tidak muncul dua kali, mis. di kartu "lanjut" dan di player/bilah); daftar/thumbnail konten nyata memakai foto bila tersedia, bukan bidang warna polos; cukup banyak item agar layar terasa hidup tanpa terpotong; disiplin execute: maks 3 execute, tanpa `inspect` di langkah akhir, temuan diperbaiki dalam satu execute. `core.md` ≤ 4000 token; detail mobile di `mobile.md`.
- Iterasi 8 belum lulus → HALT `blocked` dengan LOG.

## Plan Change Log

- 2026-11-18 — Blokir dibuka atas keputusan Adam (setelah HALT `blocked` iterasi 3, $27,80 terpakai):
  (1) penyedia foto diganti: Wikimedia Commons kini penyedia utama (commit da36b22; plan
  `plan-1-18-wikimedia-commons-penyedia-foto-utama.md`: ref `wikimedia:<pageid>`, pencarian ~2 dtk, relevansi baik
  untuk makanan/tempat/produk, lemah untuk orang/kantor, rate limit rendah bila banyak pencarian beruntun);
  (2) anggaran tambahan ≤ $30 untuk maksimal 3 iterasi lagi (iterasi 4, 5, 6) → batas iterasi menjadi 6 dan anggaran
  kumulatif menjadi ≤ $57,80 ($27,80 terpakai + $30); konstanta harness `MAX_ITER`/`BUDGET_USD` disesuaikan;
  (3) pen.dev TIDAK dijalankan ulang: iterasi 4–6 semua memakai `--reuse-pendev 2` (RAM VPS terbatas).
  Intent-contract, prompt latihan (sha 582c5d11…), dan aturan keputusan/juri v2.1 tidak diubah. Bila iterasi 6 belum
  lulus → HALT `blocked` dengan LOG; tidak ada iterasi ke-7.
- 2026-11-18 — Iterasi 4 dihentikan implementer: semua unduhan `upload.wikimedia.org` (file asli) HTTP 429. Diagnosis
  orkestrator: respons 429 Wikimedia sendiri berbunyi "use thumbnail images in sizes listed on https://w.wiki/GHai";
  thumbnail bucket standar di `thumb.wikimedia.org` (1280/1920/3840) menjawab 200 dengan UA yang sama, file asli dan
  thumbnail lewat `upload.wikimedia.org` menjawab 429. Keputusan: impor Wikimedia **selalu** memakai thumbnail bucket
  standar (`wikimediaImportUrl`, maks 3840 JPEG/WebP, 1920 PNG), tidak pernah file asli — mengikuti arahan Wikimedia, bukan
  mengakali batas; UA tetap tanpa kontak (tanpa data pribadi). Perubahan kecil di kode 1.18
  (`packages/daemon/src/photos/providers.ts` + tes). Iterasi 4 tercatat `aborted` (tidak dijuri, P3 tidak selesai, P4
  tidak dijalankan; biayanya tetap dihitung kumulatif); iterasi berikutnya = iterasi 5 baru dengan `--reuse-pendev 2`
  (bukan `--resume` iterasi 4, karena P1/P2 iterasi 4 rusak oleh kegagalan infrastruktur foto). Sisa: iterasi 5 dan 6.
- 2026-11-18 — Blokir dibuka atas keputusan Adam (setelah HALT `blocked` iterasi 6: 3/4, P3 waktu 1,71×; kumulatif
  $45,18): (1) check LC-20 diperluas (commit db1df37; plan `plan-1-11-lc20-zona-bawah-struktural.md`) sehingga konten
  terpotong/tertutup zona bawah (tab bar, mini player, bilah aksi) menjadi error gerbang di setiap execute;
  (2) skill v6 menambah prinsip mobile (layar pertama padat dan selesai rapi, keragaman hue koleksi, disiplin alur akhir);
  (3) SATU iterasi konfirmasi (iterasi 7) dengan anggaran ≤ $10 (batas kumulatif $55,18; `MAX_ITER` 7) dan
  `--reuse-pendev 2` (tanpa run pen.dev; RAM terbatas). Intent-contract, prompt latihan (sha 582c5d11…), dan aturan
  keputusan/juri v2.1 tidak diubah. Bila iterasi 7 belum lulus → HALT `blocked` dengan LOG; tidak ada iterasi ke-8.
- 2026-11-18 — Blokir dibuka atas keputusan Adam (setelah HALT `blocked` iterasi 7 yang dibatalkan karena cacat harness:
  P3 `invalid` akibat dokumen sisa run terhenti iterasi 4, P4 tidak dijalankan, juri tidak berjalan): (1) arsip run
  terhenti dan LC-20 tab bar mengambang diperbaiki (commit cb88e3e; plan
  `plan-1-19-arsip-run-terhenti-dan-lc20-tab-bar-mengambang.md`); (2) skill v7 menambah prinsip mobile (layar pertama
  tanpa duplikasi konten, thumbnail konten nyata berfoto, cukup banyak item tanpa terpotong) dan disiplin execute (maks 3,
  tanpa `inspect` di akhir, perbaikan dalam satu execute); (3) iterasi 7 diulang PENUH sebagai iterasi 8 (keempat prompt +
  juri) — pengecualian C8 karena run sebelumnya batal akibat cacat harness, bukan pemilihan hasil; anggaran iterasi 8
  ≤ $10, `--reuse-pendev 2` (tanpa run pen.dev). Intent-contract, prompt latihan (sha 582c5d11…), dan aturan
  keputusan/juri v2.1 tidak diubah. Bila iterasi 8 belum lulus → HALT `blocked` dengan LOG; tidak ada iterasi ke-9.

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 7 findings — high 0, medium 2, low 5, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Rincian skill v4 mirip prompt latihan (contoh kueri foto makanan/musik, "angkatan", "mentor", "tile 2 × 3", "pemutar"), melanggar Never "tanpa tambalan per prompt" walau lolos penjaga C7 — dinetralkan di skill v5 (07ab5c6): kueri contoh domain kopi/roti, "testimoni, tim, profil", "tier atau slot jadwal", "keranjang, proses berjalan", "tile lebih kecil"; diuji ulang di iterasi 6. `sidebar/header` app desktop dan "alur bertahap" dibiarkan (pola umum).
  - `[low]` `[reject]` Biaya run `aborted` yang diulang `--resume` (`.prev-*`) dan P3 parsial iterasi 4 tidak masuk kumulatif — jarang (resume belum pernah dipakai di iter 4–6), selisih < $0,30 tercatat di LOG; perbaikan butuh cabang penjumlahan baru.
  - `[low]` `[reject]` Impor Wikimedia bisa lebih kecil dari asli (lebar 800–959 → 500 px) — konsekuensi wajib arahan Wikimedia (asli → 429, ukuran non-standar → 400); slot potret 240–320 px tetap tercakup; parameter `url`/`size` tak terpakai bersifat kosmetik. Dicatat sebagai risiko sisa.
  - `[low]` `[patch]` Plan 1.18 masih menyebut impor file asli — entri Plan Change Log ditambahkan di plan 1.18 (07ab5c6).
  - `[low]` `[patch]` Nama tes/komentar usang (`maks 3`, "URL impor: asli", fixture "impor URL asli") — diperbarui (07ab5c6).
  - `[medium]` `[patch]` Prelude `Badge` dengan nada tak dikenal (mis. `info`) menghasilkan `undefined` — fallback `??C.acc` (07ab5c6); core.md tetap ≤ 4000 token (tes lulus).
  - `[low]` `[reject]` Baris mode gelap `mobile.md:5` berbentuk kode setengah prosa — P2 gelap dirender tanpa galat execute di keenam iterasi; agen membacanya sebagai panduan, bukan salinan.

### 2026-11-18 — Review pass (iterasi 7, skill v6)
- verdicts: 7 findings — high 1, medium 3, low 3, false 0, maybe-false 0
- findings:
  - `[high]` `[reject]` AC iterasi terakhir tidak terpenuhi (iterasi 7 dibatalkan: P1/P2 tidak dijuri, P3 `invalid`, P4 tidak dijalankan; v6 belum pernah dijuri; Setara P3 iterasi 5 ditolong `decide` karena board pen.dev iterasi 2 390×1656 ≠ 390×844) — benar, tetapi tidak bisa dipatch tanpa iterasi ke-8 yang dilarang; ini kondisi HALT `blocked` (keputusan Adam). Netralisasi P3 lewat aturan `decide` dicatat sebagai risiko sisa (aturan keputusan tidak boleh diubah).
  - `[medium]` `[defer]` `benchLakarSlugs` (`bench/src/lakar/archive.ts`) hanya membaca slug dari `run.json`, jadi dokumen dari run yang dihentikan tanpa `run.json` tidak diarsip → run berikutnya `invalid` `dokumen lama` (final menurut `isFinalRun`) — penyebab langsung pembatalan iterasi 7; kode dari 1.14 (dcd6464), bukan perubahan story ini. Perbaikan: fallback `findCommittedSlug` dari `stream.jsonl` (+ dir `.prev-*`). Sebelum putaran resmi (story 21).
  - `[medium]` `[patch]` Prelude `core.md`: `acc2` dan `data[2]` = `#B45309` = `warn`, sehingga `Badge` `extra` dan `warning` identik dan pendamping tak bisa dibedakan dari status — `acc2`/`data[2]` diganti `#CA8A04` (emas, rating/pencapaian); `warn` tetap. Belum diuji di run latihan (tidak ada iterasi lagi); build, 793/793 tes, api.md, token core lulus.
  - `[low]` `[reject]` Contoh teruji `mobile.md` tanpa avatar dan selalu memakai baris tanggal, berbeda dari aturan header hemat ruang — prosa membolehkan baris konteks bila ruang tersisa dan avatar foto butuh aset foto di contoh yang diuji offline; perbaikan lebih dari koreksi langsung (fixture foto), dampak kecil (P2 iterasi 7 tetap memakai avatar).
  - `[medium]` `[defer]` LC-20 tidak memeriksa celah di bawah tab bar mengambang (y 810–844, di balik home indicator transparan): butir daftar yang tampak di sana tidak ditandai — terlihat di PNG P2 iterasi 7; kode check 1.11 (db1df37), bukan story ini.
  - `[low]` `[reject]` `landing.md` masih memuat pola pricing/jadwal (tier/slot, kuota), alur bertahap, dan foto suasana hero yang mirip P1 — pola landing umum yang berlaku untuk banyak produk; "alur bertahap" sudah diputuskan dibiarkan di review sebelumnya (carried); penjaga n-gram C7 lulus.
  - `[low]` `[reject]` Biaya run tanpa `run.json`/`.prev-*` tidak masuk anggaran dan `readJson` bisa melempar pada `run.json` setengah tertulis — carried (biaya `.prev-*`, selisih < $0,30, ditolak di review sebelumnya); `run.json` setengah tertulis belum pernah terjadi (ditulis sekali di akhir run).

### 2026-11-18 — Review pass (iterasi 8, skill v7)
- verdicts: 4 findings — high 0, medium 3, low 0, false 1, maybe-false 0
- catatan: diff ditulis sejak baseline 97ec581 tanpa PNG dan tanpa `bench/practice-*.json` (data hasil yang sama dengan `.md`), agar dapat dibaca lens.
- findings:
  - `[medium]` `[defer]` LC-20 tidak memeriksa celah di antara dua bar zona bawah bertumpuk (`packages/check/src/rules.ts` `gap`/`bottomZone`); P2 iterasi 8 board `zsVQi7E1` memperlihatkan irisan butir di celah 8 px mini player–tab bar dengan gate 0 — terverifikasi di PNG dan kode (sub-cek gap hanya memeriksa di bawah floor). Kode dari plan perbaikan terpisah (cb88e3e); memperbaikinya tidak dapat diuji ulang di latihan (tidak ada iterasi ke-9) dan akan mengubah gate P2 menjadi gagal (P2 → Kalah; iterasi tetap 3/4 ≥ 3). Ditangguhkan ke `deferred`, dicatat di LOG.md.
  - `[medium]` `[defer]` P2 iterasi 8 tidak mematuhi prinsip v7 "≥ 3 butir utuh di layar pertama" (0 butir utuh), thumbnail episode bidang warna, avatar inisial — benar (dilihat di PNG); perilaku agen, tidak bisa dipatch tanpa iterasi skill baru. Catatan jujur ditambahkan ke `bench/practice/LOG.md` iterasi 8; ditangguhkan.
  - `[medium]` `[defer]` Batasan "alur 2–4 execute besar (mobile 1–2)" dilanggar P1 (9 execute + `inspect`) dan P4 (7 execute) — terverifikasi dari stream.jsonl; AC waktu tetap terpenuhi. Catatan ditambahkan ke LOG.md; penegakan di luar story ini; ditangguhkan.
  - `[false]` `[reject]` Frontmatter `deferred:` usang (arsip run terhenti dan celah di bawah tab bar mengambang sudah diperbaiki di cb88e3e) — perbaikannya mengubah plan build ini sendiri (aturan triage: ditolak); status perbaikan tercatat di Plan Change Log dan Auto Run Result.

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

### Lanjutan iterasi 4–6 (2026-11-18): **blocked** lagi di iterasi 4

- Harness: `MAX_ITER` 6, `BUDGET_USD` 57,8 (+ tes), preflight mode `--reuse-pendev` tidak mewajibkan pen-desktop aktif; README diperbarui (commit bdd7d04).
- Skill v4 (prinsip umum): foto dipakai untuk isi nyata dengan satu pencarian `limit:12` per jenis slot dan kueri visual Inggris (orang = kueri potret stok); koleksi cerah bermakna dari `C.data` (aturan "nada redup" dicabut); pendamping/status muncul di ≥ 2 bagian; tanpa potongan/luberan (kartu `hug`, bar = persen × induk, kritik diri memeriksa). `core.md` 3999/4000 token. Build OK, 781/781 tes (48 file), C7 lulus, api.md sama.
- Iterasi 4 (`--reuse-pendev 2`) dihentikan setelah P1/P2 Lakar (P3 parsial, tanpa juri; ≈ $2,7, kumulatif ≈ $30,5–30,8): setiap unduhan `upload.wikimedia.org` dari daemon dijawab HTTP 429 (HTTP/1.1 + User-Agent tanpa kontak; UA berkontak atau HTTP/2 → 200). Tidak diakali (kontak palsu/ganti protokol = mengakali rate limit; kontak asli = data Adam). Detail: `bench/practice/LOG.md`.
- Butuh keputusan Adam: info kontak User-Agent untuk Wikimedia (atau penyedia lain), lalu iterasi 5 baru (`practice --iter 5 --reuse-pendev 2`). Verifikasi: protocolHash 907cb36f…, bench/protocol & bench/rubric bersih, `round --dry-run` sha = rubric.json, lakard active, verify.sh exit 0.

### Lanjutan iterasi 5 (2026-11-18): **lulus** — menunggu done_checkpoint (Adam melihat PNG)

- Harness: biaya kumulatif menghitung iterasi tanpa laporan dari run/juri tersimpan (iter 4 $2,66 terhitung; commit 0747216, + tes).
- Iterasi 5 (`practice --iter 5 --reuse-pendev 2`, skill v4 tanpa perubahan, foto Wikimedia lewat thumbnail standar):
  P1 Setara (1,22×), P2 Setara (1,01×), P3 Setara (1,26×), P4 Lebih baik (1,29×). Emoji Lakar 0, gate 0 di keempatnya.
  Biaya $7,35; kumulatif $37,81 dari $57,80. Iterasi 6 tidak dijalankan.
- Verifikasi: build OK, 781/781 tes (48 file, sebelum run), api.md sama, protocolHash 907cb36f…edb85d, bench/protocol &
  bench/rubric tidak berubah, `round --dry-run` sha = rubric.json, penjaga .pen berubah/hilang 0, lakard active, verify.sh exit 0.
- Laporan: bench/practice-5.md; PNG Lakar bench/practice/5/; PNG pen.dev lokal bench/runs/practice/2/. LOG: bench/practice/LOG.md.

### Hasil akhir lanjutan (2026-11-18): **blocked** — iterasi 6 (batas) belum lulus

Blocking condition: iterasi 6 (iterasi terakhir yang diizinkan) belum lulus: 3/4 Setara/Lebih baik tetapi P3 waktu 1,71× pen.dev (> 1,5×). Iterasi 5 (skill v4) lulus 4/4, tetapi review menemukan rincian v4 yang mirip prompt latihan; skill akhir v5 (dinetralkan) diuji di iterasi 6 dan gagal hanya pada gerbang waktu P3. Butuh keputusan Adam: terima iterasi 5 + v5, atau dana/iterasi tambahan; plus tinjauan PNG.

- Ringkasan perubahan: harness `MAX_ITER` 6 / `BUDGET_USD` 57,8 / preflight reuse tanpa pen-desktop (bdd7d04); biaya kumulatif menghitung iterasi tanpa laporan (0747216); impor Wikimedia selalu thumbnail bucket standar (fada52e); skill v4 (foto dipakai, koleksi cerah bermakna, tanpa potongan) lalu v5 (netralisasi + `Badge`).
- File: `bench/src/practice/main.ts` (+tes) batas/biaya; `bench/src/pendev/run.ts` preflight reuse; `bench/README.md`; `packages/daemon/src/photos/providers.ts` (+`photos.test.ts`, `tests/support/photos.ts`) URL impor; `packages/skills/skills/{core,landing,mobile}.md` skill v4/v5; `bench/practice/LOG.md`; `bench/practice-5.*`, `bench/practice-6.*`, `bench/practice/{5,6}/*.png`; plan 1.18 (catatan).
- Iterasi: 4 dihentikan (unduhan Wikimedia 429, $2,66, tanpa juri); 5 lulus 4/4 ($7,35); 6 3/4, P3 waktu 1,71× ($7,37). Kumulatif $45,18 dari $57,80 (tambahan $17,38 dari $30).
- Review quick: 7 temuan — 4 patch (2 medium, 2 low), 0 defer, 3 reject (alasan di Review Triage Log). `followup_review_recommended: true`: 2 medium di-patch; risiko yang belum diverifikasi: skill v5 hanya satu run per prompt, dan kode harness biaya (0747216) hanya dilihat satu lensa quick.
- Verifikasi: build OK; 781/781 tes (48 file) setelah patch; api.md tanpa beda; protocolHash 907cb36f…edb85d; bench/protocol & bench/rubric tidak berubah sejak 97ec581; `round --dry-run` sha = rubric.json; `practice --dry-run` OK; penjaga `.pen` 41 file tidak berubah/hilang; lakard active; `tools/node26/verify.sh` exit 0. PNG iterasi 5 dan 6 dilihat orkestrator.
- Risiko sisa: variasi run-ke-run (P3 1,26× → 1,71× pada prompt sama); impor Wikimedia kecil untuk gambar < 960 px; potret Wikimedia tidak seragam gaya; biaya run `.prev-*` tidak dihitung.


### Lanjutan iterasi 7 (2026-11-18): **blocked** — iterasi konfirmasi dibatalkan (run P3 `invalid`)

Blocking condition: iterasi 7 (terakhir yang diizinkan) dibatalkan harness setelah P3: `P3-lakar invalid: dokumen lama:
dapur-wening-resep sudah ada sebelum run`. Dokumen itu sisa run P3 iterasi 4 yang dihentikan (tanpa `run.json`, jadi tidak
diarsip `benchLakarSlugs`). Run `invalid` karena dokumen lama final menurut `isFinalRun` (C8), sehingga `--resume` tidak
mengulangnya; juri tidak berjalan; P4 tidak dijalankan. Butuh keputusan Adam: izin run ulang P3/P4 + juri (sisa anggaran
$7,09, perkiraan $5,10) dan/atau perbaikan harness pengarsipan run tanpa `run.json`.

- Harness: `MAX_ITER` 7, `BUDGET_USD` 55,18 (+ tes), README (commit d82dbcf).
- Skill v6 (commit d82dbcf): `mobile.md` layar pertama padat dan selesai rapi (header ≤ 64, visual puncak ≤ ±280, anggaran
  tinggi terhadap zona bawah, seksi tidak muat mulai utuh di balik zona/board akhir, board akhir dibangun di execute
  pertama, `scrollY` di awal seksi), §Alur execute (perbaiki semua temuan sekaligus, maks 3 execute), board tanpa
  `layout`; `core.md` koleksi satu hue per kategori (palet kategori = satu peran), langkah 6 satu screenshot per board +
  satu execute perbaikan semua temuan, tanpa `inspect`. core 3994/4000, mobile prosa 1481/1500.
- Iterasi 7 (`--reuse-pendev 2`): P1 1,09× gate 0, P2 0,89× gate 0, P3 1,16× (invalid), P4 tidak dijalankan; emoji (a)/(b) 0.
  Biaya $2,91; kumulatif $48,09 dari $55,18.
- Verifikasi: build OK; 793/793 tes (48 file) sebelum run; api.md tanpa beda; protocolHash 907cb36f…edb85d; bench/protocol &
  bench/rubric tidak berubah sejak 97ec581; `round --dry-run` sha = rubric.json; `practice --dry-run` OK; penjaga `.pen`
  41 file berubah/hilang 0; lakard active; `tools/node26/verify.sh` exit 0.
- Laporan: bench/practice-7.md; PNG Lakar bench/practice/7/P1,P2; LOG bench/practice/LOG.md.

- Review quick (iterasi 7): 7 temuan — 1 patch medium (`acc2`/`data[2]` prelude `#CA8A04`, beda dari `warn`), 2 defer
  medium (arsip run tanpa `run.json`; celah LC-20 di bawah tab bar mengambang), 4 reject (1 high = kondisi HALT, 3 low).
  `followup_review_recommended: false` (hanya 1 medium di-patch). Skill akhir = v6 + patch warna (core.md sha 6ce0eace7c3f255c);
  patch itu belum diuji di run latihan.
- Verifikasi orkestrator setelah patch: build OK; 793/793 tes (48 file); api.md tanpa beda; protocolHash 907cb36f…edb85d;
  bench/protocol & bench/rubric bersih sejak 97ec581; `round --dry-run` rubric.json: sama; `practice --dry-run` OK;
  lakard di-restart dan active; `tools/node26/verify.sh` exit 0.
- PNG dilihat orkestrator: P1 Lakar vs pen.dev setara secara kasar (struktur lengkap, foto mentor/hero, harga dan jadwal
  kaya status; potret testimoni besar kurang serasi). P2 Lakar: tile koleksi kini 6 hue berbeda (sasaran tercapai), tetapi
  layar pertama hanya memuat 1 episode, kartu "lanjutkan" dan mini player menampilkan episode yang sama, thumbnail episode
  berupa bidang warna berteks (pen.dev memakai foto, 4 episode terlihat), dan ada butir terpotong di bawah tab bar.
  Kesan: P2 kemungkinan di bawah pen.dev.
- Risiko sisa: v6 belum pernah dijuri; Setara P3 bergantung pada board pen.dev iterasi 2 yang salah ukuran; variasi
  run-ke-run tinggi; disiplin execute (P1 `inspect`, P2 3 execute perapatan) belum tercapai.

### Lanjutan iterasi 8 (2026-11-18): **lulus** — menunggu done_checkpoint (Adam melihat PNG)

- Harness: `MAX_ITER` 8, `BUDGET_USD` 58,09 ($48,09 iter 1–7 + $10) + tes; README (commit 70a2a5e). `--dry-run` menunjukkan
  dokumen sisa run P3 iterasi 4 (terhenti) ikut diarsip; run nyata mengarsipkannya sebelum restart lakard.
- Skill v7 (commit 70a2a5e): `mobile.md` tanpa duplikasi butir di satu layar (bilah yang menempel vs kartu sorotan/daftar),
  foto untuk sampul/thumbnail konten nyata (bidang warna hanya bila pencarian gagal atau tile kategori abstrak), daftar
  layar pertama ≥ 3 butir utuh (rapatkan dulu), §Alur execute maks 3 tanpa `inspect`; `core.md` langkah 3 (mobile/app
  maks 3, landing maks 4 execute termasuk perbaikan), langkah 6 tanpa `inspect`, sisa non-error → ringkasan, foto
  + thumbnail daftar. core 3999/4000, mobile prosa 1481/1500.
- Iterasi 8 (`practice --iter 8 --reuse-pendev 2`): P1 Setara (1,01×), P2 Setara (1,20×), P3 Setara (1,08×), P4 Setara
  (0,96×); emoji Lakar 0, gate 0 di keempatnya → lulus 4/4. Biaya $6,85; kumulatif $54,94 dari $58,09.
- Verifikasi: build OK; 801/801 tes (48 file) sebelum run; api.md tanpa beda; protocolHash 907cb36f…edb85d;
  bench/protocol & bench/rubric tidak berubah sejak 97ec581; `round --dry-run` rubric.json: sama; frozen.json prompt sha
  = `PRACTICE_PROMPTS_SHA256`; penjaga `.pen` 41 file berubah/hilang 0; lakard active; `tools/node26/verify.sh` exit 0.
- Laporan: bench/practice-8.md; PNG Lakar bench/practice/8/; PNG pen.dev lokal bench/runs/practice/2/; LOG bench/practice/LOG.md.
- Risiko sisa: semua Setara dengan selisih T 1–2 (tidak ada Lebih baik); disiplin execute belum tercapai di P1 (9 execute
  + `inspect`) dan P4 (7 execute); thumbnail episode P2 masih bidang warna dan avatar header inisial; di board pertama P2
  sepotong butir daftar tampak di celah antara mini player dan tab bar tetapi LC-20 tidak menandainya (gate 0); Setara P3
  tetap bergantung pada board pen.dev iterasi 2; satu run per prompt (variasi run-ke-run tinggi).
- Review step-04 (quick, iterasi 8): 4 temuan — 0 patch, 3 defer (LC-20 celah antara bar bertumpuk; P2 layar pertama
  tanpa butir utuh; disiplin execute P1/P4), 1 ditolak (frontmatter `deferred` usang: perbaikan = edit plan sendiri).
  Catatan jujur ditambahkan ke `bench/practice/LOG.md`. Follow-up review: tidak (0 patch).
- Verifikasi orkestrator setelah review: build OK; 801/801 tes (48 file); api.md tanpa beda; protocolHash
  907cb36f…edb85d; bench/protocol & bench/rubric bersih sejak 97ec581; `round --dry-run` rubric.json: sama; lakard
  di-restart dan active; `tools/node26/verify.sh` exit 0.
- PNG dilihat orkestrator (Lakar iterasi 8 vs pen.dev iterasi 2): P1 setara (Lakar konten lebih kaya — mockup kode,
  jadwal berstatus, kartu harga; pen.dev hero foto lebih hidup; foto mentor Lakar acak/kurang cocok dengan jabatan).
  P2 di bawah pen.dev: layar pertama tanpa butir episode utuh, irisan terpotong di celah bar, avatar inisial, thumbnail
  episode bidang warna; tile mix berfoto dan tanpa duplikasi kartu/bilah sudah tercapai. P3 Lakar lebih rapi dari board
  pertama pen.dev (pen.dev memotong daftar bahan tepat di bawah tab; board kedua pen.dev salah ukuran 390×1656). P4
  setara (kartu KPI dan jadwal per dokter kaya; jadwal terpotong di bawah tanpa penanda gulir).
- Status akhir: `built` (menunggu done_checkpoint: Adam melihat PNG).
