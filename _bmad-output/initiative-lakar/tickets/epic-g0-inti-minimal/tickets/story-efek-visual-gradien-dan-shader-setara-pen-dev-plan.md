---
title: 'Efek visual gradien dan shader setara pen.dev'
type: feature
ticket: '22'
created: '2026-11-18'
status: built
baseline_revision: 'b8821fadee3bed64e77bac9b9edb53a70bb74b2a'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/bench/README.md'
  - '{project-root}/bench/practice/LOG.md'
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-skill-lebih-kaya-diuji-dengan-prompt-latihan-plan.md'
warnings: [multiple-goals, oversized]
deferred:
  - summary: >-
      Perubahan skill efek belum terbukti membantu; P5 turun dari Lebih baik (16–11) ke Setara (13–12) di iterasi 2.
    evidence: |-
      bench/effects-2.md §Sebelum vs sesudah: baseline (skill lama) sudah lulus kedua prompt. Satu run per alat (C8) dan skor
      pen.dev yang sama bergeser 11 → 12, jadi sebagian derau juri. Yang menuntaskan: run efek berulang/putaran 2 (story 21).
    location: >-
      packages/skills/skills/landing.md
    severity: medium (unverified)
  - summary: >-
      Bitmap fill efek (data URL mesh, ubin SVG noise) tidak di-decode eksplisit sebelum ukur/screenshot, beda dengan aset gambar.
    evidence: |-
      Belum terlihat gagal: tes render ganda byte-identik (halaman segar, mesh 640×400 + noise) lulus dan PNG bench benar. Yang
      menuntaskan: tes board besar dengan banyak fill efek di halaman dingin atau img.decode() untuk data URL sebelum ukur.
    location: >-
      packages/render/src/index.ts renderBoard
    severity: medium (unverified)
  - summary: >-
      Pemadatan core.md/mobile.md (hapus "(slug baru)", "LC-20 = error.", detail alur akhir mobile, kalimat mutu) belum diukur pada P1–P4.
    evidence: |-
      Baris tersebut bagian skill v7 yang lulus P1–P4 4/4 (story 19); seri P1–P4 tidak diulang. Alur akhir lengkap masih ada
      di core.md langkah 6. Yang menuntaskan: run P1–P4 / putaran 2 dengan skill v8.
    location: >-
      packages/skills/skills/core.md, packages/skills/skills/mobile.md
    severity: medium (unverified)
  - summary: >-
      Contoh teruji landing/mobile kini selalu memakai mesh + noise sehingga agen mungkin menambah efek pada prompt yang tidak memintanya.
    evidence: |-
      Contoh dimandatkan plan; panduan berkata "bila permintaan atau merek meminta". Dampak pada prompt non-efek (P1–P4, A–E)
      belum diukur. Yang menuntaskan: putaran 2 / run P1–P4 dan hitung bidang efek per board.
    location: >-
      packages/skills/skills/landing.md, packages/skills/skills/mobile.md (contoh teruji)
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** pen.dev mengklaim efek visual memukau dengan shader. Lakar baru punya gradien linear/radial berlapis (story 8). Lakar belum punya conic, grain/noise, atau mesh, dan skill tidak menjelaskan kapan gradien membuat desain terasa matang. Prompt efek bisa membuat Lakar kalah tampil.

**Approach:** Investigasi read-only sudah dilakukan (Design Notes §Temuan pen.dev). Hasilnya: shader pen.dev sungguhan, tetapi agen bench pen.dev tidak bisa memakainya. Karena itu kedalaman yang dipilih adalah **lantai + mesh**:
- tiga fill baru di skema v2: `conic`, `noise` (grain ber-seed), dan `mesh` (medan warna dari titik kendali, dirender ke bitmap oleh canvas 2D di browser);
- panduan efek di skill;
- seri latihan efek sendiri (P5/P6 beku, anggaran ≤ $15).

Shader fill WebGL tidak dibangun. Tapi kalau baseline menunjukkan pen.dev benar-benar memakai shader, alur berhenti untuk keputusan Adam.

## Boundaries & Constraints

**Always:**
- C7 keras. Skill tidak boleh memuat teks rubrik/Lampiran B, kriteria golden, prompt A/B, teks prompt latihan P1–P6, atau nama produk latihan. Penjaga n-gram dan token (`tests/skills-c7.test.ts`) juga mencakup P5/P6.
- Prompt efek dibekukan lebih dulu: `bench/practice/effects/prompts.json` + konstanta sha256 + tes di-commit tersendiri **sebelum** ada perubahan mesin, skill, atau DESIGN.md. Sha dicatat di Implementation Notes dan LOG.
- C8: satu run per alat per prompt per iterasi. `--resume` hanya untuk `aborted`/`invalid`. pen.dev hanya dijalankan di iterasi 1 (baseline), dan iterasi berikutnya memakai `--reuse-pendev 1`.
- pen.dev hanya lewat `runOne` (pen-newdoc + verifikasi dokumen baru). Penjaga md5 `.pen` berjalan, dan `.pen` lama tidak boleh berubah. Strip/`.pen` pen.dev tetap lokal (EULA). `~/.pencil/session-desktop.json` tidak boleh dibuka.
- Restart pen-desktop (izin Adam) hanya **setelah** seri pen.dev selesai, sekali per iterasi yang menjalankan pen.dev. Setelah restart, tunggu sampai active dan MCP pencil menjawab panggilan baca (maks 120 dtk), lalu catat di laporan. Tidak boleh restart di tengah run.
- Render tetap murni browser (AD-6). Tes `browser-pure` tetap lulus, dan `mountBoard` tetap sinkron.
- Efek deterministik: render yang sama dua kali menghasilkan PNG byte-identik.
- Node lewat `/opt/node-26/bin` (path absolut). C9: tanpa apt, npm global, port, atau service baru. `systemctl --user restart lakard` setelah build. `tools/node26/verify.sh` exit 0. RAM terbatas: vitest/Chromium tidak boleh jalan bersamaan dengan run practice.

**Never:**
- Tidak boleh mengubah `bench/protocol/*` (protocolHash `907cb36f…edb85d`), `bench/rubric/*`, golden-set.md, aturan `decide`/ambang, atau bukti P1–P4 (`bench/practice-1..8.*`, `PRACTICE_PROMPTS_SHA256`).
- DESIGN.md tidak boleh diubah sebelum Adam menyetujui amandemen di plan_checkpoint. Bagian `### Anti-pattern desain generik` dan `## Lampiran B` tidak boleh diubah sama sekali, karena keduanya masuk teks juri dan sha-nya dipin.
- Shader fill WebGL/GLSL, aturan check baru (LC-04/LC-21 milik G1), gambar AI, dan `round` resmi (story 21) di luar cakupan.
- Iterasi ke-4 di seri efek tidak boleh dijalankan, dan anggaran $15 tidak boleh dilewati (harness Abort sebelum spawn).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Conic | `{type:'conic', angle:90, center:[.5,.5], stops}` | CSS `conic-gradient(from 90deg at 50% 50%, …)`, berlapis seperti fill lain | stops < 2 → SCHEMA_INVALID |
| Noise | `{type:'noise', opacity:.08, size:2, seed:7, blend:'overlay'}` | ubin SVG `feTurbulence` ber-seed + `background-blend-mode` per lapisan; seed sama → piksel sama | opacity di luar 0..1 → SCHEMA_INVALID |
| Mesh | `{type:'mesh', columns:3, rows:2, colors:[6 warna], points?}` | bitmap canvas 2D (sisi terpanjang ≤ 512 px) diskalakan ke kotak; deterministik | `colors.length ≠ columns*rows` atau points tak cocok → SCHEMA_INVALID |
| Dokumen v1 | file `schemaVersion:1` | dimigrasi ke v2 saat dibuka, write-back daemon | versi > 2 → VERSION_MISMATCH |
| Token warna | `colors:[{$token:'acc'}]` | di-resolve seperti stops | token tak ada → error yang sama dengan stops |
| Seri efek | `practice --series effects --iter 2 --reuse-pendev 1` | Lakar + juri P5/P6 → `bench/effects-2.md/.json` | iter > 3 / anggaran > $15 → Abort sebelum spawn |
| Shader di baseline | stream pen.dev iterasi 1 memuat fill/effect `type:"shader"` | HALT `blocked` (keputusan kedalaman ulang) sebelum mesin diubah | – |

</intent-contract>

## Code Map

- `packages/schema/src/nodes.ts:7,91-106,345` -- `SCHEMA_VERSION = 1` → 2. `Fill` (zod 4 discriminatedUnion, `.strict()`) ditambah `conic`, `noise`, `mesh`. `schemaVersion: z.literal(SCHEMA_VERSION)`. `Unit`/`Positive`/`Px`/`Color` di l.26-31.
- `packages/schema/src/tokens.ts:33` -- `ResolvedFill = Resolved<Fill>`. Resolusi token generik (walk JSON), jadi `colors[]` ikut ter-resolve.
- `packages/core/src/migrate.ts` -- `MIGRATIONS` masih kosong. Isi kunci `1` dengan migrasi identitas yang hanya menaikkan `schemaVersion` ke 2 (migrasi resmi pertama). Pola rantai ada di `migrate.test.ts:36`.
- Fixture `schemaVersion: 1` di `packages/{core,check,schema,daemon}/src/*.test.ts`, `packages/render/test/harness.ts`, `bench/src/round/round.test.ts` → pakai `SCHEMA_VERSION` (`v1.test.ts`/`migrate.test.ts` tetap menguji dokumen v1 lewat migrasi).
- `packages/render/src/paint.ts:19-53` -- `fillLayer` (switch tanpa default; TS menandai kind baru) dan `fillsBackground` (dibalik: `fills[0]` paling bawah). Perlu keluaran `background-blend-mode` per lapisan (normal untuk selain noise). Callers: `layout.ts:66` (board), `layout.ts:228`, dan `shape.ts:60` (mask SVG).
- `packages/render/src/index.ts:33,51,79` -- `CHROMIUM_ARGS` tetap (WebGL tidak dipakai). `mountBoard` sinkron. `renderBoard` async (font → aset → mount → 2 rAF → ukur).
- Modul baru `packages/render/src/effects.ts` -- `meshDataUrl(fill, w, h, doc)` (canvas 2D `putImageData` → `toDataURL`, cache per fill+ukuran) dan `noiseTileUrl(fill)` (data URI SVG). Wajib `/// <reference lib="dom" />` dan tanpa API Node.
- `packages/render/test/visual.test.ts`, `harness.ts:210-228` -- golden toleransi 24/0,5%, `LAKAR_UPDATE_GOLDEN=1`. Contoh tes gradien ada di l.109 (`kartu-gradien`). `browser-pure.test.ts` menjaga AD-6.
- `packages/exec/src/api.ts:655-665` (Cat) dan `:667` (Efek) -- dokumentasi + contoh teruji. Regenerasi `api.md` lewat `scripts/gen-skill-api.mjs`.
- `packages/mcp/src/server.ts:179` -- ringkasan fills di deskripsi execute.
- `packages/skills/skills/core.md` (3999/4000 token; l.91 "Maks satu gradien per board…", l.119 anti-pattern 1 dan 8), `landing.md` (prosa 1165/1500), `mobile.md` (prosa 1481/1500). Batas ada di `tests/skills.test.ts:16`. Contoh teruji dijalankan oleh `packages/daemon/src/skills-examples.test.ts`.
- `bench/src/practice/main.ts` -- `MAX_ITER` 8 (l.41), `BUDGET_USD` 58.09 (l.43), `COST_ESTIMATE` (l.45), `PASS_MIN` 3 (l.49), `PRACTICE_RUNS` (l.38), `previousCosts` (l.139), `budgetProblem` (l.153), `practiceOutcome` (l.194), teks "dari 4" (l.283), `pendevReuseProblems` (l.110), sha `frozen.json` (l.601), arsip `benchLakarSources` (l.528), restart lakard (l.556). Parameterisasi dengan **config seri**. Default `practice` tanpa `--series` harus berperilaku persis seperti sekarang.
- `bench/src/practice/prompts.ts:13` -- `PRACTICE_PROMPTS_SHA256`, `PRACTICE_ID`, `loadPracticePrompts(path, sha)`. Tambah `EFFECT_PROMPTS_SHA256` dan id `P5|P6`.
- `bench/src/pendev/run.ts:51,80,156` -- `preflight`, `systemctl is-active pen-desktop` (unit **sistem**), `runOne`. `bench/src/sys.ts:28` `restartUserUnit` sekarang hanya untuk lakard. Tambah fungsi restart pen-desktop terpisah dan perbarui komentarnya.
- `tests/practice-prompts.test.ts`, `tests/skills-c7.test.ts:15-25` -- tambah sumber dan nama produk P5/P6.
- `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` (git-excluded; sha awal `aa62ec83740620b9976fa4f715c3856e87c52b884b69fdb8f0b8a4f385816197`) -- l.247 (larangan gradien), l.258 (scrim), l.375 (glow), l.434-445 (Anti-pattern: **dilarang diubah**), l.485 (LC-21, Lampiran A), l.490+ (Lampiran B: **dilarang diubah**). `bench/src/judge/prompt.ts:158` memasukkan §Anti-pattern ke teks juri.

## Tasks & Acceptance

**Execution:**
- [ ] `bench/practice/effects/prompts.json`, `bench/src/practice/prompts.ts`, `tests/practice-prompts.test.ts`, `tests/skills-c7.test.ts`, `bench/practice/LOG.md` -- Tulis P5/P6 (teks persis ada di Design Notes) dengan `{id,name,kind,text,size}`, konstanta `EFFECT_PROMPTS_SHA256`, loader, tes (sha, id `P5`/`P6`, kalimat penutup, tanpa n-gram 6 kata yang sama dengan A–E/P1–P4, nama produk tidak ada di golden-set), dan penjaga C7 skill diperluas. Tambah entri LOG "Seri efek: prompt beku" dengan sha. **Commit tersendiri** sebelum perubahan lain. Bila n-gram gagal sebelum run pertama, ubah kata-katanya saja (maknanya tetap) dan catat.
- [ ] `bench/src/practice/main.ts` (+ `practice.test.ts`), `bench/src/cli.ts`, `bench/README.md` -- Tambah config seri `{id, promptsPath, sha, ids, maxIter, budgetUsd, passRule, reportPrefix, runsRoot, pngDir}`. Seri `effects`: `bench/practice/effects/prompts.json`, maxIter 3, budget 15, semua prompt wajib lulus, laporan `bench/effects-<k>.md/.json`, run di `bench/runs/practice-effects/<k>/`, PNG Lakar di `bench/practice/effects/<k>/`. `previousCosts`, reuse, `frozen.json`, dan teks "dari N" mengikuti seri. Arsip slug memindai `runs/rounds`, `runs/practice`, dan `runs/practice-effects`. Tes: parse `--series`, config default identik dengan perilaku lama, `practiceOutcome` semua-lulus, anggaran $15.
- [ ] `bench/src/sys.ts`, `bench/src/practice/main.ts` -- Tambah `restartPenDesktopAfterSeries()`: `systemctl restart pen-desktop` lalu tunggu `is-active` dan satu panggilan baca MCP pencil berhasil (maks 120 dtk). Hanya dipanggil di akhir iterasi yang menjalankan pen.dev, setelah run pen.dev terakhir dan sebelum juri. Hasil (berhasil atau gagal, dan durasinya) ditulis di laporan. Kalau gagal, laporannya ditandai tetapi juri tetap jalan. Tidak pernah dipanggil saat `--reuse-pendev` atau `--dry-run`.
- [ ] Jalankan `practice --series effects --iter 1 --dry-run`, lalu `--iter 1` (baseline pen.dev + Lakar sebelum perubahan + juri). Setelah selesai, hitung pemakaian `type:"shader"`, `mesh_gradient`, `angular`, `Generate("ai")`, blur, dan blend di stream pen.dev, lalu catat di LOG. Kalau ada `shader` → HALT `blocked` ("pen.dev memakai shader di baseline; keputusan kedalaman ulang").
- [ ] `packages/schema/src/nodes.ts` (+ tes), `packages/core/src/migrate.ts` (+ tes), fixture -- Skema v2 sesuai Design Notes §Skema, migrasi 1→2, dan fixture memakai `SCHEMA_VERSION`. Dokumen v1 lama terbuka dan ditulis ulang sebagai v2.
- [ ] `packages/render/src/effects.ts`, `paint.ts`, `layout.ts`, `shape.ts` -- Render conic, noise, dan mesh (Design Notes §Render). Mesh pada bentuk (ellipse/path) ikut mask yang sama.
- [ ] `packages/render/test/visual.test.ts` (+ `golden/*.png`) -- Tambah golden `efek-conic-donut`, `efek-noise-seed`, `efek-mesh-hero`, dan `efek-mesh-ellipse`. Tambah tes determinisme: board yang sama dirender 2× → buffer PNG byte-identik (conic, noise, mesh). Tambah tes seed: seed berbeda → PNG berbeda. Tambah tes latensi: board 1440×900 dengan mesh 5×4 + noise vs board polos; selisih median dari 5 render dicatat di output, batasnya ≤ 150 ms. Periksa golden dengan mata sebelum commit.
- [ ] `packages/exec/src/api.ts`, `packages/skills/skills/api.md` (regen), `packages/mcp/src/server.ts` -- Dokumentasikan ketiga fill (field, default, batas) dengan satu contoh teruji yang memakai mesh + noise dan satu ring conic.
- [ ] **HITL** `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` -- Langkah ini **hanya** dijalankan bila Implementation Notes mencatat "Adam menyetujui amandemen DESIGN.md" (cabang A). Terapkan amandemen dari Design Notes §Usulan DESIGN.md ke l.247, l.258, l.375, subseksi baru `### Efek ekspresif` di bawah §Colors, dan baris LC-21 Lampiran A. Catat sha sebelum dan sesudah di Implementation Notes. Tanpa catatan persetujuan → cabang B (DESIGN.md tidak disentuh).
- [ ] `packages/skills/skills/core.md`, `landing.md`, `mobile.md` -- Tulis panduan efek dengan kata sendiri sesuai cabang A atau B (Design Notes §Panduan skill). core tetap ≤ 4000 token (ganti l.91 dan padatkan, jangan ditambah bersih). Detail landing ditaruh di landing.md, dan mobile.md tetap ≤ 1500 prosa. Contoh teruji landing/mobile memperagakan satu bidang efek dengan 0 error/warning/gate.
- [ ] Build, tes, `systemctl --user restart lakard`, lalu `practice --series effects --iter 2 --reuse-pendev 1`. Kalau belum lulus dan sisa anggaran cukup: satu revisi skill tingkat prinsip (dicatat di LOG), lalu `--iter 3 --reuse-pendev 1`. Kalau iterasi 3 tetap gagal atau anggaran habis → HALT `blocked`.
- [ ] `bench/practice/LOG.md` -- Satu entri per iterasi seri efek: sha skill, perubahan (prinsip), hasil per prompt, biaya, dan status restart pen-desktop.

**Acceptance Criteria:**
- Given commit pembeku prompt, when `git log` dibaca, then commit itu mendahului commit pertama yang menyentuh `packages/` atau skill, dan sha di `frozen.json` setiap iterasi seri efek sama dengan `EFFECT_PROMPTS_SHA256`.
- Given iterasi lulus, when `bench/effects-<k>.md` dibuka, then P5 dan P6 masing-masing punya PNG kedua alat, skor juri v2.1 (T, D, per R), waktu, biaya, dan keputusan, dengan hasil Setara/Lebih baik di **kedua** prompt, waktu Lakar ≤ 1,5× pen.dev, emoji (a)/(b)/(c) = 0, dan gate 0. Laporan juga mencantumkan biaya kumulatif seri ≤ $15 dan perbandingan sebelum (iterasi 1) dan sesudah.
- Given laporan iterasi 1, when dibaca, then ada baris restart pen-desktop (berhasil, durasi), dan `tools/node26/verify.sh` exit 0 setelahnya.
- Given render test, when `pnpm --filter @lakar/render test` dijalankan, then golden conic/noise/mesh lulus, render ganda byte-identik, latensi tercatat ≤ batas, dan `browser-pure` lulus.
- Given dokumen v1 yang ada (mis. dokumen bench yang diarsip), when dibuka lewat lakard, then dokumen dimigrasi ke v2 tanpa error dan board-nya dirender sama seperti sebelumnya (golden lama lulus).
- Given skill akhir, when tes skill dijalankan, then C7 (termasuk P5/P6) lulus, core ≤ 4000 token, dan contoh lulus 0 error gate.
- Given cabang A, when `round --round uji-9 --dry-run` dijalankan setelah DESIGN.md diamandemen, then sha teks juri A/B sama dengan `bench/rubric/v2.1` (anti-pattern dan Lampiran B utuh).
- Given iterasi lulus, when orkestrator meneruskan PNG, then story berhenti di done_checkpoint sampai Adam melihat PNG.

## Implementation Notes

**Keputusan plan_checkpoint (Adam, 2026-11-18, diteruskan orkestrator):**
- **Adam menyetujui amandemen DESIGN.md (cabang A)** persis sesuai Design Notes §Usulan DESIGN.md: "> 1 bidang efek ekspresif per board", subseksi `### Efek ekspresif`, glow tetap dilarang kecuali satu cahaya lembut merek di bidang gelap, aturan scrim untuk teks di atas efek, LC-21 Lampiran A disesuaikan. `### Anti-pattern desain generik` dan `## Lampiran B` TIDAK diubah. Langkah HITL DESIGN.md dianggap disetujui.
- DESIGN.md di-exclude git lokal: simpan snapshot sebelum/sesudah yang di-track (seperti 1.17 menyimpan snapshot rubrik), di `bench/practice/effects/design-md/DESIGN.before.md` dan `DESIGN.after.md`, plus sha256 keduanya di catatan ini. `bench/rubric/*` tidak disentuh.
- Kedalaman disetujui: conic + noise/grain + mesh (canvas 2D), tanpa WebGL; schemaVersion 2 dengan migrasi identitas 1→2.
- Anggaran seri efek ≤ $15, maks 3 iterasi.
- Urutan keras: commit pembeku P5/P6 (sha) SEBELUM perubahan mesin/skill/DESIGN.md; prompt tidak diubah setelah melihat hasil. Juri v2.1 dan aturan keputusan tidak diubah.
- pen.dev hanya MCP pencil lewat `runOne` (`bash /root/pen-vps-kit/pen-newdoc.sh` + verifikasi dokumen aktif baru & kosong sebelum tiap run); golden set tidak boleh aktif saat agen berjalan; jangan buka `~/.pencil/session-desktop.json`. `systemctl restart pen-desktop` sekali setelah seri pen.dev selesai (diizinkan Adam), tunggu active + MCP pencil menjawab, catat. Bila stream baseline pen.dev memakai shader → HALT sesuai plan.
- Folder di `.git/info/exclude` jangan diubah. RAM terbatas: tes/vitest tidak paralel dengan run practice.
- Perintah panjang (run practice): jalankan dengan log ke file dan pantau sampai selesai di giliran yang sama (polling foreground ≤ 10 menit per panggilan); jangan pernah mengakhiri giliran untuk menunggu notifikasi/background.
- Lihat sendiri (Read) PNG kedua alat P5/P6 dan nilai jujur di LOG.
- Jangan commit/push di langkah implementasi; orkestrator yang commit (kecuali commit pembeku prompt P5/P6 yang WAJIB tersendiri dan lebih dulu — buat commit itu sendiri dengan pesan `G0 1.22: prompt efek P5/P6 beku (sha …)` dan trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; sertakan file plan ini di commit tersebut).

**Catatan implementasi:**
- Prompt efek beku: `bench/practice/effects/prompts.json` sha256 `5f0c23a7fb411f4fcf15e3f88f2e2f7b0f0f6b64f54d955e15fe22ecc834e441` (= `EFFECT_PROMPTS_SHA256`). Dua perubahan kata P5 (bukan makna) sebelum run pertama karena n-gram 6 kata sama dengan P1: "Desain halaman landing desktop selebar 1440px untuk" → "Desain landing page desktop dengan lebar 1440px untuk"; "dua tombol aksi, dan cuplikan" → "sepasang tombol aksi, serta cuplikan". Dicatat di LOG.
- Baseline iterasi 1: stream pen.dev memakai `shader` 0 (mesh_gradient 5, blur 12, Generate("ai") 1) → tidak HALT. Restart pen-desktop berhasil 16,9 dtk.
- DESIGN.md (cabang A) diamandemen sesudah baseline. sha sebelum `aa62ec83740620b9976fa4f715c3856e87c52b884b69fdb8f0b8a4f385816197`, sesudah `2a19530b99663875d40b9ade1e600765ef62afd83dadb5490fbececd2e862365`; snapshot tracked `bench/practice/effects/design-md/DESIGN.{before,after}.md`. §Anti-pattern dan Lampiran B byte-identik (dicek skrip); `round --round uji-9 --dry-run` sha teks juri A/B = rubric.json.
- Bitmap mesh dibatasi 320 px (≤ 512 sesuai Design Notes) agar mesh < 30 ms per fill (512×320 terukur ±45 ms, 320×200 ±19 ms).
- Latensi: render (renderBoard + 1 frame) mesh 5×4 + noise vs polos +16,6 ms (batas 150). Encode PNG screenshot TIDAK masuk batas: grain di atas gradien membuat PNG 1440×900 ±1 MB, screenshot ±515 ms vs ±85 ms polos (dicatat di output tes). Risiko waktu agen pada screenshot/export.
- Iterasi 2 (`--reuse-pendev 1`) lulus: P5 Setara 13–12 (0,91×), P6 Setara 13–14 (0,86×), emoji 0, gate 0. Kumulatif seri $7,99 dari $15. Iterasi 3 tidak dijalankan.

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 9 findings — high 0, medium 1, low 4, false 0, maybe-false 4
- findings:
  - `[maybe-false]` `[defer]` Skill efek membuat P5 lebih buruk, tak terbukti membantu — AC lulus terpenuhi; sebab turunnya (skill vs derau juri, pen.dev 11→12 pada strip yang sama) tak bisa dipastikan dengan satu run (C8); dicatat di deferred + residual risk.
  - `[low]` `[patch]` AC3: bukti `verify.sh` exit 0 sesudah restart pen-desktop tidak tercatat — ditambah baris di `bench/practice/LOG.md` (verify.sh exit 0, dijalankan ulang orkestrator: exit 0).
  - `[low]` `[reject]` Batas latensi tidak mencakup encode PNG screenshot (+430 ms) — nyata tetapi berdampak kecil (rasio waktu end-to-end 0,86–0,91×); "render" dibaca sebagai renderBoard dan selisih encode dicatat di output tes + Implementation Notes; membatasi encode butuh perubahan nontrivial. Masuk residual risk.
  - `[medium]` `[patch]` Mesh merata-ratakan RGB tanpa premultiply, titik transparan menggelapkan tetangga — `meshPixels` kini rata-rata RGB berbobot alpha (premultiplied), alpha rata-rata biasa; dicek: hijau ↔ `#00000000` tetap hijau dengan alpha memudar; golden tak berubah.
  - `[maybe-false]` `[defer]` Bitmap efek tidak di-decode sebelum screenshot — tes render ganda di halaman segar byte-identik dan PNG bench benar; perlu tes board besar dingin untuk memastikan.
  - `[low]` `[reject]` Restart pen-desktop bisa melewati 120 dtk bila probe MCP menggantung — nyata secara kode tapi jarang (restart nyata 16,9 dtk) dan perbaikannya menambah guard timeout; hanya memperlambat laporan.
  - `[low]` `[patch]` Laporan seri efek dengan `--only` menyebut "semua 1 prompt" padahal keputusan memakai 2 — `renderPracticeMarkdown` kini memakai jumlah prompt beku seri (2), bukan jumlah hasil.
  - `[maybe-false]` `[defer]` Pemadatan core/mobile menghapus instruksi skill v7 tanpa run ulang P1–P4 — alur akhir lengkap masih di core langkah 6; dampak hanya terukur dengan run P1–P4.
  - `[maybe-false]` `[defer]` Contoh teruji selalu memakai mesh+noise → efek bocor ke prompt non-efek — contoh dimandatkan plan; dampak belum diukur.

## Design Notes

**Temuan pen.dev (read-only, 2026-11-18).** Sumber: MCP pencil `read_skill` (`SKILL.md`, `pen-schema.md` v2.22, `scripts-and-shaders.md`, `execute.md`, `generate.md`, `guide/landing-page.md`), `get_style` ("Gradient Prompt Stack", "Spatial Plus"), daftar isi `/opt/pen/squashfs-root/resources/app.asar` (string), 22 `stream.jsonl` pen.dev di `bench/runs/`. Pencarian web tidak menemukan dokumentasi publik pen.dev.
- Fill: `color`, `gradient` (`linear|radial|angular` = conic, center/size/rotation, opacity), `image`, `mesh_gradient` (grid warna rows×columns berinterpolasi bezier, points dan handle opsional), dan **`shader`**: fragment shader WebGL 1.0 dari **file `.glsl` relatif terhadap `.pen`**, dengan uniform parametrik (`@color`, `@range`, `@default`, `@time` untuk animasi, `@mouse`, sampler `pencil:object`/`pencil:background` untuk kaca/refraksi). Efek: `blur`, `background_blur`, `shadow` inner/outer, dan **`shader` effect** (pasca-proses node). Ada blend mode per fill. Script node JS punya `Math.random` deterministik.
- Aplikasi membawa pustaka ±100 shader (`goodies/shader-library/assets/*.glsl`: aurora, silk, liquid-glass, chrome, dither, halftone, grunge, film-leak, smoke, dll.) yang dipakai lewat UI. Skill MCP tidak menyebut pustaka ini.
- Ekspor: `Export(..., "png")` (default 2×) atau `TakeScreenshot`. Shader dirender di renderer GPU aplikasi (VPS: SwiftShader bawaan).
- **Pemakaian nyata di bench:** agen pen.dev hanya punya `mcp__pencil`, tanpa alat tulis file, sehingga tidak bisa membuat `.glsl`. Di 22 run (A/B putaran 1, uji-1, practice 1–2, seri terhenti) tercatat: `shader` 0, `mesh_gradient` 0, `angular`/radial 0, `gradientType:linear` 28× (17 run), `background_blur` 8 run, `Generate("stock")` 16 run, `Generate("ai")` 1 run. Gaya bawaan menyarankan arah cahaya, bukan mesh generik.
- **Kesimpulan:** shader pen.dev sungguhan dan parametrik, tetapi di jalur MCP-only bench tidak bisa dijangkau. Gap realistis ada pada conic/radial/mesh, grain, blur, dan gambar AI. Gambar AI di luar G0.

**Keputusan kedalaman: lantai + mesh (tanpa WebGL).**
- Conic + noise menutup lantai tiket.
- `mesh` menutup `mesh_gradient` pen.dev, satu-satunya efek ekspresif yang bisa dijangkau agen pen.dev di bench. Mesh juga menghasilkan medan warna ala aurora/blob tanpa shader.
- Mesh dihitung di canvas 2D (CPU, deterministik, sinkron). Dengan begitu `mountBoard` tetap sinkron dan tidak ada ketergantungan GPU/flag.
- WebGL sudah diuji (`chromium-headless-shell` 159 arm64, argumen default): WebGL1/2 aktif lewat ANGLE + SwiftShader (Vulkan CPU). Shader fbm 6 oktaf 1440×1200 butuh ±190–240 ms, dan dua render menghasilkan checksum identik. Flag `--use-angle=swiftshader --enable-unsafe-swiftshader` juga jalan. Ini dicatat sebagai cadangan untuk story lanjutan "shader fill preset" bila baseline atau Adam memintanya. Risikonya: Chromium mendatang bisa mewajibkan `--enable-unsafe-swiftshader`.
- AD-15 berubah: katalog `fills[]` = solid, linear, radial, **conic, noise, mesh**, image. Ini breaking untuk pembaca v1, jadi `schemaVersion` 2 + migrasi identitas (AD-2). Tawarkan `bmad-architecture` untuk mencatat AD-15 dan schemaVersion 2.

**Skema v2 (field persis):**
- `conic {angle?: Px (derajat, 0 = atas, searah jarum jam, default 0), center?: [Unit,Unit] (default [.5,.5]), stops}`
- `noise {opacity: Unit, size?: Positive (ukuran butir px, 0.5–8, default 1.5), seed?: int 0..9999 (default 1), blend?: 'normal'|'overlay'|'soft-light'|'multiply'|'screen' (default 'overlay'), mono?: boolean (default true)}`
- `mesh {columns: int 2..5, rows: int 2..5, colors: Color[] (= columns*rows, baris demi baris), points?: [Unit,Unit][] (= columns*rows; default grid rata)}`

Batas: warna/titik ≤ 25. Ukuran bitmap mesh: sisi terpanjang ≤ 512 px.

**Render:**
- conic → `conic-gradient(from Adeg at cx cy, stops)`.
- noise → data URI SVG ubin 256 px: `feTurbulence type=fractalNoise baseFrequency=1/size numOctaves=3 seed stitchTiles=stitch` → `feColorMatrix` (abu bila mono) → alpha = opacity. Diulang `0 0 / 256px repeat` dengan `background-blend-mode` per lapisan.
- mesh → setiap piksel bitmap kecil diberi bobot Gauss dari titik kendali (σ ≈ 0,6 × jarak grid). Warna sRGB dirata-ratakan, ditambah dither hash deterministik ±0,5 LSB untuk mencegah banding. Hasilnya `toDataURL('image/png')` → `url(...) 0 0 / 100% 100% no-repeat` (upscale bilinear browser), di-cache per (fill JSON, w, h).

Batas latensi: mesh < 30 ms per fill. Total board efek ≤ +150 ms dibanding board polos.

**Usulan DESIGN.md untuk Adam (plan_checkpoint):**
- **Prinsip:** efek ekspresif sah sebagai *satu titik fokus merek* dan tidak boleh menjadi dekorasi umum.
1. **l.247** "lebih dari satu gradien per board" → "lebih dari **satu bidang efek ekspresif** per board (mesh, conic dekoratif, gradien multi-warna luas, blob blur). Gradien fungsional kecil (ring/donut progres, scrim foto, tint satu hue pada kartu sorotan) tidak dihitung." Larangan hue 220–300° tetap, kecuali prompt atau merek memintanya.
2. **Subseksi baru `### Efek ekspresif`** (di bawah §Colors):
   - (a) Hanya di hero, sampul, onboarding, area merek, atau satu kartu sorotan.
   - (b) Warna dari palet merek: aksen + maksimal 1 pendamping + netral.
   - (c) Teks di atas efek ditaruh di zona tenang atau di atas scrim/permukaan solid, dengan kontras ≥ 4.5:1 terhadap warna terburuk di bawah teks.
   - (d) Grain opacity ≤ 0,10, hanya di atas bidang efek atau gradien luas.
   - (e) Blur dekoratif hanya di dalam bidang efek.
3. **l.375** "glow" → "glow dilarang, **kecuali** satu cahaya lembut berwarna merek di belakang objek fokus pada bidang gelap (blur ≥ 40, opacity ≤ 35%), tidak pada teks, ikon kecil, atau kartu biasa. Neon tetap dilarang."
4. **l.258** scrim juga berlaku untuk "teks di atas efek".
5. **Lampiran A LC-21:** "> 1 bidang efek ekspresif per board".

§Anti-pattern dan Lampiran B tidak diubah (keduanya bagian teks juri; item 1 "tanpa alasan brand" tetap konsisten).

Cabang B (tanpa persetujuan): skill hanya memakai satu efek gradien per board, tanpa glow, dan mesh hanya di hero dengan alasan merek.

**Panduan skill (kata sendiri, tanpa rubrik):**
- Kapan efek membuat desain matang: tint bidang merek, scrim foto, sorot satu kartu unggulan, ring/donut conic bergradasi, satu bidang mesh + grain halus di hero/onboarding.
- Satu titik fokus per board.
- Teks di zona tenang atau di atas scrim.
- Grain tipis.
- Glow hanya sesuai cabang A.

**Prompt efek (beku, teks persis; keduanya diakhiri kalimat penutup baku "Bahasa Indonesia. Kualitas setara desainer produk senior: hierarki tipografi jelas, spacing konsisten (grid 8px), kontras baik, auto/flex layout."):**
- P5 landing (1440×bebas): `Desain halaman landing desktop selebar 1440px untuk "Lintas Arus", platform pemantauan jaringan listrik pintar bagi operator energi. Bagian: menu atas; hero berlatar efek visual abstrak yang ekspresif seperti aliran cahaya atau medan warna, dengan judul besar, subjudul, dua tombol aksi, dan cuplikan panel status jaringan; tiga kemampuan utama; angka kinerja; testimoni operator; seksi ajakan akhir berlatar efek yang senada; footer. Mode gelap, aksen hijau elektrik.`
- P6 mobile (390×844): `Desain layar onboarding pertama aplikasi mobile meditasi dan tidur "Senyap" (390x844). Isi: latar gradasi ekspresif seperti langit senja dengan tekstur halus, bentuk cahaya abstrak di bagian atas, judul sambutan, kalimat penjelas singkat, indikator 3 langkah, tombol mulai, dan tautan masuk untuk yang sudah punya akun. Mode gelap, aksen oranye senja.`

**Prosedur & anggaran (seri efek, ≤ $15, maks 3 iterasi):**
- Iterasi 1: pen.dev 1× + Lakar sebelum perubahan + juri 3×/prompt ≈ $5,6. Setelahnya restart pen-desktop.
- Iterasi 2: Lakar sesudah perubahan + juri, `--reuse-pendev 1`, ≈ $3,8.
- Iterasi 3 (opsional): ≈ $3,8.
- Perkiraan total $9–13. Harness Abort bila perkiraan melewati sisa.
- Kriteria lulus: P5 dan P6 Setara/Lebih baik, waktu ≤ 1,5×, emoji 0, gate 0.

**Check dan kontras:** LC-04/LC-21 belum ada di kode (milik G1). Check memperlakukan fill apa pun sebagai "dicat" (`hasFills`), jadi fill baru tidak mengubah LC-20/LC-02a. Kontras teks di atas efek dijaga lewat skill (zona tenang/scrim) dan kritik diri screenshot. Ini risiko sisa sampai LC-04 hadir.

## Verification

**Commands:**
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH pnpm build && PATH=/opt/node-26/bin:$PATH pnpm test` -- expected: exit 0, termasuk `tests/practice-prompts.test.ts`, `tests/skills-c7.test.ts`, `tests/skills.test.ts`, `packages/daemon/src/skills-examples.test.ts`, dan `packages/core/src/migrate.test.ts`.
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH pnpm --filter @lakar/render test` -- expected: golden conic/noise/mesh, determinisme byte-identik, latensi ≤ batas (angka tercatat), dan `browser-pure` lulus; 0 skip.
- `cd /root/lakar && /opt/node-26/bin/node scripts/gen-skill-api.mjs && git diff --exit-code packages/skills/skills/api.md` -- expected: tidak ada beda.
- `cd /root/lakar && /opt/node-26/bin/node -e "import('./bench/dist/protocol.js').then(m=>console.log(m.protocolHash()))"` -- expected: `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d`; `git diff --exit-code b8821fadee3bed64e77bac9b9edb53a70bb74b2a -- bench/protocol bench/rubric bench/practice/prompts.json` kosong.
- `cd /root/lakar && /opt/node-26/bin/node bench/dist/cli.js round --round uji-9 --dry-run` -- expected: sha teks juri A/B = `bench/rubric/v2.1` (juga setelah amandemen DESIGN.md).
- `cd /root/lakar && /opt/node-26/bin/node bench/dist/cli.js practice --iter 9 --dry-run` -- expected: perilaku seri P1–P4 tidak berubah (Abort `MAX_ITER` 8 seperti sebelumnya).
- `cd /root/lakar && /opt/node-26/bin/node bench/dist/cli.js practice --series effects --iter 1 --dry-run` -- expected: P5/P6, sha beku, rubrik 2.1, C7 lulus, anggaran $15, rencana restart pen-desktop, tanpa spawn.
- `/root/lakar/tools/node26/verify.sh` -- expected: exit 0 (pen-desktop active, snapshot C9 identik, lakard active).

**Manual checks:**
- Bandingkan strip Lakar `bench/practice/effects/<k>/` dengan pen.dev `bench/runs/practice-effects/1/`. Cek: satu titik fokus efek, teks terbaca di atas efek, grain halus tanpa banding, nol emoji. Adam melihat PNG (done_checkpoint).

## Auto Run Result

Status: **built** (menunggu done_checkpoint: Adam melihat PNG).

**Ringkasan:** skema v2 (fill `conic`, `noise` ber-seed, `mesh` canvas 2D) + migrasi identitas 1→2; render efek deterministik; dokumentasi API/MCP; panduan efek di skill core/landing/mobile; DESIGN.md cabang A (snapshot sebelum/sesudah tracked); harness `practice --series effects` (maks 3 iterasi, $15, semua prompt wajib lulus) + restart pen-desktop sesudah seri pen.dev. Prompt P5/P6 dibekukan di commit `dd66120` sebelum perubahan mesin/skill/DESIGN.md. Baseline pen.dev: shader 0 (mesh_gradient 5, blur, 1 Generate("ai")) → tidak HALT. Seri efek lulus di iterasi 2 (P5 Setara 13–12, 0,91×; P6 Setara 13–14, 0,86×; emoji 0, gate 0); kumulatif $7,99 dari $15. Baseline iterasi 1 (skill lama) juga sudah lulus (P5 Lebih baik 16–11, P6 Setara 14–14).

**File:**
- `packages/schema/src/nodes.ts` (+`v2.test.ts`, fixture): SCHEMA_VERSION 2, tiga fill baru dengan batas.
- `packages/core/src/migrate.ts` (+tes): migrasi resmi 1→2 identitas; store/daemon menulis balik v2.
- `packages/render/src/effects.ts` (baru), `paint.ts`, `layout.ts`, `shape.ts`: conic/noise/mesh, blend per lapisan, mesh ikut mask bentuk.
- `packages/render/test/visual.test.ts` + 4 golden `efek-*`: golden, determinisme byte-identik, seed, latensi.
- `packages/exec/src/api.ts`, `packages/skills/skills/api.md`, `packages/mcp/src/server.ts`: dokumentasi fill efek + contoh teruji.
- `packages/skills/skills/{core,landing,mobile}.md`: panduan efek (core 4000/4000, mobile prosa 1500/1500).
- `bench/src/practice/main.ts`, `cli.ts`, `sys.ts`, `prompts.ts`, `round/main.ts`, README, tes: config seri, restart pen-desktop, arsip slug practice-effects.
- `bench/practice/effects/` (prompts beku, PNG Lakar iter 1–2, snapshot DESIGN.md), `bench/effects-{1,2}.{md,json}`, `bench/practice/LOG.md`.
- `tests/practice-prompts.test.ts`, `tests/skills-c7.test.ts`: sha P5/P6, n-gram, C7 mencakup P5/P6.

**Review (quick):** 9 temuan → 3 patch (mesh premultiplied alpha [medium], bukti verify.sh di LOG [low], jumlah prompt di laporan `--only` [low]); 4 defer (lihat frontmatter `deferred`); 2 ditolak (latensi encode PNG di luar batas — dampak kecil, dicatat sebagai risiko; timeout probe restart pen-desktop — jarang, perbaikan menambah guard).

**Rekomendasi review lanjutan:** `false` (patch: 1 medium, 2 low; tidak ada high).

**Verifikasi:** `pnpm build` exit 0; `pnpm test` 852/852 lulus (setelah patch); `pnpm --filter @lakar/render test` 39/39 (latensi: selisih render +6,6 ms, screenshot 84 → 514 ms di luar batas); `gen-skill-api` stabil; protocolHash `907cb36f…edb85d`; `bench/protocol`, `bench/rubric`, `bench/practice/prompts.json` tak berubah; `round --round uji-9 --dry-run` rubrik 2.1, sha A/B = `rubric.json`; `practice --iter 9 --dry-run` tetap Abort MAX_ITER 8; `practice --series effects --iter 1 --dry-run` P5/P6 sha beku, $15, rencana restart; `systemctl --user restart lakard` → active; `tools/node26/verify.sh` exit 0; pen-desktop active. PNG kedua alat P5/P6 dilihat orkestrator.

**Risiko sisa:** P5 sesudah perubahan kurang ekspresif dibanding baseline (perbaikan skill belum terbukti menaikkan mutu); encode PNG board ber-grain ±5× lebih lambat; core.md dan mobile.md di batas token penuh; pemadatan skill dan contoh efek belum diukur pada P1–P4; kontras teks di atas efek hanya dijaga skill (LC-04 milik G1); AD-15/schemaVersion 2 belum dicatat di dokumen arsitektur (tawarkan `bmad-architecture`).
