---
title: 'Putaran G0 dijalankan dan diputuskan'
type: feature
ticket: '16'
created: '2026-11-18'
status: done
baseline_revision: 'd0b71a63a8284a0b04448be31af615c45bdb0e35'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-bench-menjalankan-lakar-menilai-dengan-juri-buta-dan-menulis-plan.md'
warnings: [oversized]
deferred:
  - summary: >-
      `bench/score-{A,B}.{md,json}` tidak memuat ID putaran, sehingga putaran resmi menimpa bukti juri uji-1 dan `bench/round-uji-1.md` kini menunjuk ke bukti putaran 1.
    evidence: |-
      Nama file `score-<prompt>` tetap sejak story 14 (pra-ada, bukan dari diff ini); diff `bench/score-A.json` mengubah `"round": "uji-1"` menjadi `"round": "1"`. Bukti uji-1 tetap ada di riwayat git (commit 6a73c23/dcd6464).
    location: >-
      bench/src/round/main.ts (penulisan score-<id>), bench/round-uji-1.md:51
    severity: low
---

<intent-contract>

## Intent

**Problem:** G0 belum diputuskan. Harness putaran (story 14) sudah teruji lewat `uji-1`, tetapi:
- belum ada putaran resmi di HEAD yang dibekukan;
- laporan belum memuat keputusan G0, evaluasi arah, PNG untuk Adam, dan bagian konfirmasi Adam;
- pembekuan belum ketat: porcelain hanya `packages tools .mcp.json`, lakard tidak wajib di-restart dari build beku, dan versi claude/pen.dev/model tidak dibandingkan dengan baseline.

**Approach:** Ada dua fase.
1. Kode ($0, bench saja): pengetatan pembekuan untuk putaran resmi (ID angka), bagian laporan baru, salin strip PNG Lakar, lalu tes. Kode di-commit **sebelum** run berbayar, agar SHA beku memuat produk dan harness sekaligus.
2. Mesin: build di HEAD beku, lalu satu kali `pnpm bench:round -- --round 1`. Hasilnya `bench/round-1.md` dengan keputusan **sementara** dan bagian "Konfirmasi Adam" berstatus menunggu. Story selesai `built` dengan catatan hitl. Orkestrator yang meminta dan mencatat konfirmasi Adam.

## Boundaries & Constraints

**Always:**
- **Jumlah run:** 1 run per alat per prompt (golden-set §Prosedur 3; Notes epic: putaran G0 hanya A dan B). Jadi ada 4 run desain (urutan A-pendev, A-lakar, B-pendev, B-lakar) dan juri 3× per prompt (6 ulangan).
  - C8: tidak ada run tambahan atau run ulang untuk memilih hasil.
  - `--resume` hanya menjalankan run yang belum final menurut `isFinalRun` story 14 (`aborted`, atau init invalid sebelum agen bekerja). Run `failed` dinilai apa adanya.
  - Hasil `uji-1` tidak digabung ke putaran resmi. Di laporan hanya disebut sebagai konteks.
- **Yang dibekukan.** Semua dicatat di `frozen.json` dan bagian "Versi beku" round md:
  - SHA `git rev-parse HEAD` lengkap dan `git status --porcelain` penuh (file plan untracked/terubah boleh ada).
  - protocolHash = `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d` = `baseline-pendev.json`.
  - Model `claude-opus-5-5`, versi `claude`, pen.dev desktop, dan MCP `pencil`.
  - lakard `version`/`schemaVersion`/pid/startedAt, Node lakard (`status.node`), Chromium (`pool.browserVersion`), versi `playwright-core`.
  - Font: `status.fonts.families`, `missing` (wajib `[]`), dan versi paket `@fontsource/*` dari `packages/daemon/package.json`.
  - Ikon (`status.icons`), sha256 tiap `packages/skills/skills/*.md`, `G0_RULES`, sha256 `packages/check/dist`, dan sha256 per `packages/*/dist`.
  - Juri: model dan argv.
- **Cek pembekuan putaran resmi** (fungsi murni `officialFreezeProblems`, hanya untuk ID angka). Setiap masalah → `Abort` sebelum run apa pun. `--dry-run` mencetak masalahnya tanpa abort. Syaratnya:
  - (a) `git status --porcelain -- packages tools scripts bench/src bench/protocol bench/mcp bench/package.json package.json pnpm-lock.yaml .mcp.json` kosong;
  - (b) protocolHash, model, `claudeVersion`, dan pen.dev desktop sama dengan `baseline-pendev.json` (`2.1.325`, `1.2.23`). Bila berbeda, putaran abort. Claude/pen tidak di-upgrade/downgrade (C9);
  - (c) lakard selalu di-restart oleh harness sebelum run (juga saat rencana arsip kosong), lewat `restartUserUnit` + `waitLakard` yang ada. Sesudah itu `startedAt` lakard harus lebih baru dari mtime file terbaru di `packages/*/dist`, sebagai bukti lakard memuat build saat ini;
  - (d) `fonts.missing` kosong dan `pool.ready ≥ 1`.
- **Keputusan per prompt** tidak berubah: `decide` di `score.ts` (DESIGN.md Lampiran B). Gerbang G0 = `layout_check` gate 0 ∧ ukuran board (A lebar 1440, B 390×844) ∧ waktu ≤ 1,5 × median baseline (A 167,3 dtk, B 131,3 dtk). R3/R7 tidak dihitung (Notes epic). Biaya hanya dilaporkan (C8).
- **Keputusan G0** (fungsi murni `decideG0`), sementara sampai Adam mengonfirmasi:
  - putaran `dibatalkan` → `tidak dapat diputuskan`;
  - ada prompt `Kalah` → `gagal`;
  - A dan B sama-sama ∈ {Setara, Lebih baik} → `lolos`;
  - selebihnya (`tidak dapat dinilai`) → `tidak dapat diputuskan`.
- **Isi wajib `bench/round-1.md`:** semua bagian story 14 (waktu, biaya, rasio, gerbang, emoji a/b/c, reconnect, skor median/rentang, keputusan A dan B, versi beku, protokol, penjaga `.pen`), ditambah bagian baru:
  - `## Keputusan G0 (sementara, menunggu konfirmasi Adam)`: hasil `decideG0`, alasan per prompt, baseline median waktu dan biaya pen.dev, dan baris C4 ("G1 tidak dimulai sebelum G0 lolos dan dikonfirmasi Adam").
  - `## Evaluasi arah` (hanya bila `gagal`/`tidak dapat diputuskan`):
    - fakta per prompt: alasan gerbang, total, R dengan Lakar 0 vs pen.dev 2, rasio waktu;
    - C4: G1 tidak dimulai;
    - opsi yang menunggu keputusan Adam: perbaiki lalu putaran resmi baru `--round 2` untuk A dan B (bukan mengulang run, C8), atau evaluasi ulang arah editor sendiri.
  - `## PNG untuk Adam`: path strip keempat run, beserta status commit masing-masing.
  - `## Konfirmasi Adam`: tabel per prompt (keputusan sementara | kriteria rentang > 1 | keputusan Adam | koreksi skor) dan baris "Keputusan G0 final". Semua sel Adam berisi `menunggu konfirmasi Adam`, dan status bagiannya **menunggu konfirmasi Adam**. Agen tidak pernah mengisinya.
- **PNG:**
  - Strip Lakar (`bench/runs/rounds/<n>/<p>-lakar.png`) disalin harness ke `bench/round-<n>/<p>-lakar.png` (tracked, di-commit). Penyalinan eksklusif; saat resume dilewati bila sha256 sama.
  - Strip dan `.pen` pen.dev **tidak** di-commit (EULA). Keduanya tetap lokal di `bench/runs/rounds/<n>/<p>-pendev.png` dan `bench/runs/rounds/<n>/<p>-pendev/` (gitignored).
- **pen.dev:**
  - hanya MCP `pencil` (`bench/mcp/pencil.json`, `--allowedTools mcp__pencil`, `validateInit`);
  - `runOne` story 4 (`pen-newdoc.sh` + verifikasi dokumen aktif baru & kosong sebelum tiap run, salin `.pen` eksklusif);
  - penjaga md5 `.pen` lama sebelum/sesudah putaran.
- C7 agen dan juri lulus (preflight). C9: hanya `/opt/node-26/bin`. Restart hanya unit `lakard` (`restartUserUnit` menolak `pen-*`). Snapshot `~/.claude.json` mcpServers, `settings.json`, dan `ActiveEnterTimestamp` pen-* identik sebelum dan sesudah. `verify.sh` dijalankan setelah lakard siap.

**Never:**
- Mengubah `packages/*`, `bench/protocol/*`, `bench/mcp/*`, `bench/baseline-pendev.*`, `.mcp.json`, `~/.claude*`, service `pen-*`, versi claude/pen, atau `.git/info/exclude`.
- Mengubah `decide`, gerbang, juri, teks juri, emoji, atau argv agen. Kode baru hanya menambah cek pembekuan, bagian laporan, dan penyalinan PNG Lakar.
- Membuka `~/.pencil/session-desktop.json`, membaca `.pen` dengan Read/Grep, memakai pen-headless/`pen` CLI, atau menimpa `.pen` yang ada.
- Menjalankan run berbayar kedua untuk prompt/alat yang sama. Menjalankan putaran resmi kedua (`--round 2`) tanpa keputusan Adam.
- Mengisi "Konfirmasi Adam" atau menulis keputusan G0 final atas nama Adam. Memulai pekerjaan G1. Commit PNG/`.pen` pen.dev. Push/merge.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Putaran resmi normal | `--round 1`, tree kode bersih, versi = baseline | restart lakard, 4 run, 6 juri, round-1.md + 2 PNG Lakar di `bench/round-1/` | exit 0 |
| Kode kotor | `bench/src/x.ts` diubah | abort sebelum restart/run | exit 1 |
| Claude berubah | `claude --version` ≠ 2.1.325 | abort dengan alasan baseline tak sebanding | exit 1 → HALT blocked |
| pen desktop berubah | ≠ 1.2.23 | abort | exit 1 |
| lakard basi | startedAt < mtime dist terbaru (sesudah restart) | abort | exit 1 |
| Font hilang | `fonts.missing` ≠ [] | abort | exit 1 |
| Putaran uji | `--round uji-2` | cek resmi dilewati, perilaku story 14 | — |
| Dry-run resmi | `--round 1 --dry-run` | cetak hasil cek pembekuan + rencana restart, tanpa restart/run | exit 0 |
| G0 lolos | A Lebih baik, B Setara | `lolos`, tanpa bagian Evaluasi arah | — |
| G0 gagal | B Kalah | `gagal` + Evaluasi arah dengan alasan B | — |
| Tak dapat diputuskan | A Setara, B `tidak dapat dinilai` / putaran `dibatalkan` | `tidak dapat diputuskan` + Evaluasi arah | — |
| Konfirmasi | md apa pun | bagian Konfirmasi Adam berstatus menunggu, tanpa isi keputusan Adam | — |
| PNG resume | `bench/round-1/A-lakar.png` ada dan identik | dilewati | beda isi → abort (tidak menimpa) |

</intent-contract>

## Code Map

- `bench/src/round/main.ts` -- `roundMain`:
  - porcelain (baris ~290) dan `if (dryRun) return 0` (~311);
  - arsip + `restartUserUnit(LAKARD_UNIT)` + `waitLakard` (~313-325);
  - `frozenNow` (~341) dan `frozen.json` (`wx`);
  - `writeStrip` (~246);
  - `report` (~526).

  Tambahkan: `isOfficialRound(round)` (`/^[1-9]\d*$/`), cek pembekuan resmi sebelum `dryRun` return (cetak) dan sebelum arsip (abort), restart wajib untuk putaran resmi (gabungkan dengan cabang arsip, satu restart saja), field `FrozenVersions` baru, salin PNG Lakar, dan `g0` di report.
- `bench/src/round/score.ts` -- `Decision`, `decide` (~76-100). Tambah `decideG0(results, roundStatus)` murni. `decide` tidak diubah.
- `bench/src/round/report.ts` --
  - `FrozenVersions` (~37): tambah field opsional `porcelainAll`, `lakard.node`, `playwright`, `fonts`, `distSha`, `baseline` (claude/pen/model);
  - `RoundReport`: tambah `g0`, `pngs`;
  - `renderRoundMarkdown` (~81): sisipkan Keputusan G0 setelah Ringkasan, lalu Evaluasi arah, PNG untuk Adam, dan Konfirmasi Adam sebelum "Versi beku".

  Konstanta `PROVISIONAL` dipakai ulang. Untuk putaran uji, bagian G0 tetap dirender (berlabel sementara). `round-uji-1.md` tidak diregenerasi.
- `bench/src/sys.ts` -- `git`, `sha256Dir`, `restartUserUnit`, `isActive`. Tambah helper mtime terbaru di dir (rekursif) bila belum ada.
- `bench/src/pendev/run.ts` (`penDesktopVersion`, `runOne`), `bench/src/lakar/{archive,lakard-client,run}.ts` -- dipakai apa adanya.
- `bench/baseline-pendev.json` -- `claudeVersion`, `model`, `toolVersions['pen.dev desktop (X-AppImage-Version)']`, dan `protocolHash`. Hanya dibaca.
- `bench/src/round/round.test.ts` -- tes murni + snapshot md. Snapshot diperbarui untuk bagian baru.
- `bench/README.md` -- satu paragraf tentang putaran resmi (cek pembekuan, PNG Lakar tracked, PNG pen.dev lokal).
- `/root/.config/systemd/user/lakard.service` -- `ExecStart=/opt/node-26/bin/node /root/lakar/packages/daemon/dist/main.js`. Tidak diubah.

## Tasks & Acceptance

**Execution:**
- [x] `bench/src/round/score.ts` (+ tes) -- `decideG0` sesuai Boundaries -- keputusan G0 murni dan teruji.
- [x] `bench/src/round/main.ts`, `bench/src/sys.ts` (+ tes) -- `officialFreezeProblems` murni (input: porcelain kode, versi sekarang vs baseline, startedAt vs mtime dist, fonts, pool), restart wajib untuk putaran resmi, field beku baru, dan salin PNG Lakar eksklusif -- pembekuan dapat dibuktikan.
- [x] `bench/src/round/report.ts` (+ snapshot) -- bagian Keputusan G0, Evaluasi arah, PNG untuk Adam, Konfirmasi Adam (menunggu), dan versi beku tambahan -- isi wajib round md.
- [x] `bench/README.md` -- dokumentasi putaran resmi.
- [x] Mesin, fase 1:
  - `pnpm build && pnpm test` hijau;
  - `--round 1 --dry-run` tanpa masalah selain porcelain (yang wajar sebelum commit);
  - commit kode bench saja (`bench/src`, `bench/README.md`, tanpa plan) dengan pesan `G0 1.16: pembekuan putaran resmi + keputusan G0 di laporan`.
- [x] Mesin, fase 2:
  - `pnpm build` di HEAD itu;
  - `--round 1 --dry-run` bersih;
  - snapshot C9 sebelum;
  - `pnpm bench:round -- --round 1` sekali;
  - snapshot sesudah;
  - Read keempat strip;
  - tunggu lakard siap, lalu `verify.sh`.
- [x] Bila G0 `gagal`/`tidak dapat diputuskan`: tambahkan `### Catatan implementer` di bawah "Evaluasi arah" di `bench/round-1.md` (setelah generasi terakhir), berisi kesan dari strip dan dugaan penyebab berbukti. Isinya bukan keputusan.

**Acceptance Criteria:**
- Given HEAD beku dan build baru, when `node bench/dist/cli.js round --round 1 --dry-run`, then tercetak SHA HEAD, porcelain kode kosong, versi claude/pen/model = baseline, rencana restart lakard, protocolHash `907cb36f…`, dan C7 lulus. Tidak ada run, restart, atau `bench/round-1.md`.
- Given putaran selesai, when membuka `bench/round-1.md`, then ada versi beku (SHA, model, claude, pen, Chromium, font, ikon, protocolHash, sha skill), waktu, biaya, skor median/rentang, jumlah emoji (a/b/c), keputusan A dan B, keputusan G0 sementara, dan "Konfirmasi Adam" berstatus menunggu.
- Given putaran selesai, when `git status --porcelain`, then `bench/round-1/{A,B}-lakar.png` tampil sebagai file baru, dan tidak ada PNG/`.pen` pen.dev atau `bench/runs` yang tampil.
- Given putaran selesai, when snapshot C9 dibandingkan, then md5 `.pen` lama, mcpServers, `settings.json`, dan `ActiveEnterTimestamp` pen-* identik; `verify.sh` exit 0; lakard active.

## Implementation Notes

**Fase 1 (kode, commit `6e793fd` "G0 1.16: pembekuan putaran resmi + keputusan G0 di laporan"):**
- `score.ts`: `decideG0` + `G0_PROMPTS`; `decide` tidak diubah.
- `main.ts`: `officialFreezeProblems` (murni), `claudeSemver`, `copyPngExclusive`, `isOfficialRound`/`OFFICIAL_CODE_PATHS` (di `report.ts`). Putaran resmi: cek (a)(b)(d) sebelum arsip/restart (dry-run hanya mencetak), restart lakard wajib (satu restart, digabung dengan cabang arsip), lalu cek (c)+(d) sesudah restart → Abort. Field beku baru: `porcelainCode`, `porcelainAll`, `lakard.node`, `playwright`, `fonts{families,missing,packages}`, `distSha`, `baseline`; ikut `frozenDrift`.
- Salinan PNG Lakar yang isinya beda → `fatal` (putaran `dibatalkan`, juri tidak jalan, laporan + penjaga `.pen` tetap ditulis), bukan throw, agar laporan run berbayar tidak hilang.
- `sys.ts`: `newestMtimeMs`, `gitPorcelain` (spasi kolom status dipertahankan; dipakai juga untuk porcelain story 14).
- `lakard-client.ts`: field opsional `node` di `LakardStatus`.
- `report.ts`: bagian Keputusan G0 (setelah Ringkasan), Evaluasi arah (hanya bila belum lolos), PNG untuk Adam, Konfirmasi Adam (`AWAITING_ADAM`), versi beku tambahan; `RoundPrompt.baselineCostUsd`.
- Tes: 692 lulus, 0 skip (tambahan: decideG0, officialFreezeProblems, mtime, salin eksklusif, urutan bagian + Konfirmasi tidak diisi, snapshot resmi).

**Fase 2 (putaran resmi `1`, HEAD `6e793fd`, exit 0, `lengkap`):**
- Dry-run sebelum run: porcelain kode kosong, claude 2.1.325 / pen 1.2.23 / model = baseline, protocolHash `907cb36f…`, C7 lulus, rencana restart. lakard di-restart (startedAt 05:33:23Z > dist 05:14:16Z).
- A: Lakar 160,2 dtk / $1,10 vs pen.dev 170,0 dtk / $0,89; Lakar/baseline 0,96. Gerbang lolos. Juri 9 vs 6 → Lebih baik.
- B: Lakar 95,5 dtk / $0,52 vs pen.dev 117,8 dtk / $0,60; Lakar/baseline 0,73. Gerbang lolos (390×844). Juri 10 vs 6 → Lebih baik.
- G0 sementara: **lolos**; Konfirmasi Adam menunggu. Tidak ada kriteria rentang > 1. Juri 6/6 ok. Reconnect 0. Emoji (a): pen.dev A 1 (👋), lainnya 0.
- Biaya ≈ run $3,10 + juri ≈ $1,5.
- C9: md5 31 `.pen` lama identik (2 dokumen pen baru), mcpServers/settings.json/ActiveEnterTimestamp pen-* identik, `verify.sh` exit 0, lakard active. `git status`: `bench/round-1.{md,json}`, `bench/round-1/{A,B}-lakar.png` baru, `bench/score-{A,B}.*` berubah; tidak ada `bench/runs`/PNG/`.pen` pen.dev.

**Kesan dari keempat strip (Read):**
- A-Lakar: rapi, aksen hijau konsisten, mockup dashboard utuh (tidak terpotong seperti uji-1), kartu fitur asimetris (1 besar + tabel laba rugi, 2 kecil), testimoni gelap, pricing tengah ditonjolkan. Tanpa emoji.
- A-pen.dev: juga berkualitas; 👋 di sapaan mockup, baris statistik bulat (12.000+, Rp2,1T), 3 kartu fitur identik. Skor 6 vs 9 terasa agak keras untuk pen.dev, tetapi arah keputusannya masuk akal.
- B-Lakar: bersih, ring konsentris, jadwal 2 item, kartu program berupa ikon tanpa foto, tab bar 4. Pas 390×844.
- B-pen.dev: lebih kaya (foto avatar/stok, 3 jadwal, streak), tetapi board 390×1109 (melebihi 844, alasan R1 = 0 menurut juri). Lebih baik untuk Lakar wajar dari sisi kepatuhan ukuran; secara visual pen.dev lebih kaya — perlu dilihat Adam.
- Kosmetik: `packages/check/dist` tercetak dua kali di Versi beku (`checkDist` + `distSha`). Diperbaiki saat review (renderer melewati `check` di loop `distSha`); baris duplikat di `bench/round-1.md` dihapus langsung (keluaran identik dengan renderer terpatch untuk data yang sama), tanpa `--resume` agar lakard dan run berbayar tidak tersentuh.
- Orkestrator juga melihat keempat strip: setuju dengan kesan di atas. A: kedua alat setingkat landing SaaS profesional; Lakar lebih variatif (kartu fitur asimetris, tabel laba rugi), pen.dev rapi tapi kartu fitur seragam + 👋. B: Lakar padat dan pas 844; pen.dev lebih kaya (foto, 3 jadwal, streak) tetapi melebihi tinggi board dan memakai teks Inggris ("Upper body strength").

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 6 findings — high 0, medium 0, low 4, false 1, maybe-false 0 (1 ditolak karena perbaikannya mengedit plan)
- findings:
  - `[low]` `[defer]` `bench/score-{A,B}` menimpa bukti juri uji-1; `round-uji-1.md` menunjuk ke bukti putaran 1 — pra-ada sejak story 14 (nama file tanpa ID putaran), bukan disebabkan diff ini; bukti uji-1 ada di riwayat git. Dicatat di `deferred`.
  - `[low]` `[patch]` `packages/check/dist` dicetak dua kali di Versi beku — `report.ts` kini melewati `check` di loop `distSha`, snapshot diperbarui, baris duplikat di `bench/round-1.md` dihapus; build + 692 tes hijau.
  - `[low]` `[reject]` `frozenDrift` melaporkan drift palsu saat `--resume` putaran dengan `frozen.json` lama (field baru, format porcelain) — hanya terjadi bila putaran pra-1.16 (uji-1) di-resume, yang tidak direncanakan; `frozen.json` putaran 1 ditulis kode baru. Perbaikan menambah cabang.
  - `[false]` `[reject]` Salin PNG beda isi tidak "abort" sesuai matriks — `fatal` membuat status `dibatalkan` → exit 1 tanpa menimpa file (tes "dibatalkan exit 1"); hasil yang diminta matriks (abort, tidak menimpa) terpenuhi, laporan tambahan hanya menjaga bukti run berbayar.
  - `[low]` `[reject]` `--resume` putaran resmi tetap me-restart lakard dan menjalankan cek pembekuan — restart lakard diizinkan; cek porcelain sesuai Design Notes (patch di-commit sebelum regenerasi); abort bila claude/pen berubah adalah perilaku konservatif yang dikehendaki C8/C9. Kecil kemungkinan dialami; perbaikan menambah cabang.
  - `[low]` `[reject]` Auto Run Result di plan masih menyebut ready-for-dev — perbaikannya mengedit plan (ditulis ulang saat finalisasi).

## Design Notes

- **Kenapa 1 run per alat per prompt, bukan 3 (reliabilitas vs biaya):**
  - Prosedur golden set menetapkan 1 run, dan C8 melarang memilih hasil. Menambah run akan mengubah prosedur setelah melihat `uji-1`, padahal baseline 3 run hanya untuk waktu pen.dev.
  - Biaya 1 run ≈ $4,5–6 (uji-1 $4,56: run $3,05 + juri $1,51), wall ±20–30 menit. Dengan 3 run per alat, biaya menjadi ±$12–15.
  - Margin waktu besar (uji-1 0,78/0,71 vs ambang 1,5), jadi waktu bukan risiko utama. Risiko utamanya skor B yang tipis (uji-1 8 vs 8, ambang Setara −1). Reliabilitas skor ditangani juri 3× + median dan koreksi Adam pada rentang > 1, bukan dengan run tambahan.
- **Kenapa commit kode sebelum run:** di `uji-1`, HEAD yang tercatat tidak memuat harness (risiko residual story 14). Dengan commit sebelum run, SHA beku menjelaskan produk dan harness sekaligus. Patch review sesudah putaran hanya boleh menyentuh rendering laporan. Laporan diregenerasi dengan `--resume` tanpa run berbayar; `frozenDrift` mencatat HEAD yang berbeda, dan `### Catatan implementer` ditulis ulang.
- **Kenapa restart lakard wajib:** rencana arsip kosong (dokumen `uji-1` sudah diarsip, `~/.local/share/lakar/docs` kosong), jadi tanpa restart wajib lakard bisa tetap memakai proses dari build lama.

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm build && /opt/node-26/bin/pnpm test` -- expected: exit 0, 0 skip.
- `cd /root/lakar && /opt/node-26/bin/node bench/dist/cli.js round --round 1 --dry-run` -- expected: exit 0 sesuai AC 1 (sesudah commit: porcelain kode kosong).
- `cd /root/lakar && git rev-parse HEAD && git status --porcelain` -- expected: HEAD = commit 1.16 fase 1; hanya file plan yang tampil.
- Sebelum putaran: `find /opt/pen /root/comprice /root/lakar/design /root/.pencil/documents -name '*.pen' -exec md5sum {} + | sort > "$SCRATCH/pen-before.txt"` (`$SCRATCH` = scratchpad sesi); `jq -S .mcpServers ~/.claude.json`; `md5sum ~/.claude/settings.json`; `systemctl show -p ActiveEnterTimestamp pen-desktop pen-vnc pen-novnc pen-web pen-mcp-http` (unit sistem, bukan `--user`) -- expected: tercatat.
- `cd /root/lakar && /opt/node-26/bin/pnpm bench:round -- --round 1` -- expected: exit 0, `bench/round-1.{md,json}`, `bench/score-{A,B}.{md,json}`, `bench/round-1/{A,B}-lakar.png`.
- Setelah putaran: ulangi snapshot -- expected: identik (hanya dokumen pen baru di `~/.pencil/documents`).
- `cd /root/lakar && grep -c 'menunggu konfirmasi Adam' bench/round-1.md && git status --porcelain | grep -cE 'bench/runs|pendev.*\.png|\.pen$'` -- expected: ≥ 1; 0.
- `until curl -sf 127.0.0.1:7466/status | grep -q '"ready":[1-9]'; do sleep 1; done` (maks 90 dtk), lalu `cd /root/lakar && bash tools/node26/verify.sh; systemctl --user is-active lakard` -- expected: exit 0; active.

**Manual checks:**
- Read `bench/runs/rounds/1/{A,B}-{lakar,pendev}.png`, cocokkan dengan skor juri, lalu catat kesan di Implementation Notes.
- Pastikan "Konfirmasi Adam" di `bench/round-1.md` tidak berisi keputusan Adam.

## Auto Run Result

- Status: **built** (2026-11-18). hitl: keputusan G0 **sementara lolos**, menunggu konfirmasi Adam di `bench/round-1.md` (bagian "Konfirmasi Adam" tidak diisi agen). G1 tidak dimulai.
- Ringkasan: fase 1 menambah pembekuan ketat putaran resmi (`officialFreezeProblems`, restart lakard wajib, versi beku tambahan), `decideG0`, bagian laporan baru (Keputusan G0, Evaluasi arah, PNG untuk Adam, Konfirmasi Adam), dan salinan strip Lakar ke `bench/round-<n>/` — commit `6e793fdfa576d1f2c9ef4bf7637c15b9421eccdf`. Fase 2: satu putaran resmi `--round 1` di HEAD itu, exit 0, status `lengkap`. A: Lakar 160,2 dtk/$1,10 vs pen.dev 170,0 dtk/$0,89, rasio baseline 0,96, gerbang lolos, juri 9 vs 6 → Lebih baik. B: Lakar 95,5 dtk/$0,52 vs pen.dev 117,8 dtk/$0,60, rasio 0,73, gerbang lolos (390×844), juri 10 vs 6 → Lebih baik. Juri $1,46.
- File: `bench/src/round/main.ts` (cek pembekuan resmi, restart wajib, versi beku, salin PNG, g0/pngs); `bench/src/round/score.ts` (`decideG0`); `bench/src/round/report.ts` (bagian laporan baru, tanpa duplikat `check/dist`); `bench/src/sys.ts` (`newestMtimeMs`, `gitPorcelain`); `bench/src/lakar/lakard-client.ts` (`node`); `bench/src/round/round.test.ts` + snapshot; `bench/README.md`; keluaran `bench/round-1.{md,json}`, `bench/round-1/{A,B}-lakar.png`, `bench/score-{A,B}.{md,json}`.
- Review (quick): 6 temuan — 1 patch (low), 1 defer (low, pra-ada), 4 ditolak (alasan di Review Triage Log).
- Follow-up review: `false` (hanya 1 patch low).
- Verifikasi: build + test hijau (692, 0 skip) sebelum dan sesudah patch; dry-run resmi bersih sebelum run; snapshot C9 sebelum/sesudah identik (31 `.pen` lama tak berubah, 2 dokumen pen baru); `grep -c 'menunggu konfirmasi Adam'` = 11; tidak ada `bench/runs`/PNG/`.pen` pen.dev di status git; `verify.sh` exit 0; lakard active. Keempat strip dilihat (Read).
- Risiko residual: B — pen.dev lebih kaya secara visual tetapi board 390×1109 (R1 = 0); keputusan B sensitif terhadap penilaian ukuran oleh juri, layak dicek Adam. Skor A pen.dev 6 terasa agak keras. 1 run per alat (sesuai prosedur) berarti variansi run tidak terukur. Baris duplikat di `bench/round-1.md` dihapus manual (bukan regenerasi `--resume`).
