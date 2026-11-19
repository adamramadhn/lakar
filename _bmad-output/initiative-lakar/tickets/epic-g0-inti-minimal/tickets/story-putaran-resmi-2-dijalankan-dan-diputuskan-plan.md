---
title: 'Putaran resmi 2 dijalankan dan diputuskan'
type: feature
ticket: '21'
created: '2026-11-18'
status: done
baseline_revision: '313e2334d22453dd91d56082783da608447314ae'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-putaran-g0-dijalankan-dan-diputuskan-plan.md'
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-refactor-sweep-putaran-perbaikan-plan.md'
warnings: [oversized]
deferred:
  - summary: >-
      Probe foto putaran resmi ikut berjalan (dan bisa abort) pada --resume walau frozen.json dan run sudah ada.
    evidence: |-
      bench/src/round/main.ts blok restart: `if (official) { ... photoProbe = await runPhotoProbe(); }` tanpa cek resume/frozen.json; pesan Abort "belum ada run" keliru saat resume. Perbaikan (lewati probe bila frozen.json ada) mengubah harness; Design Notes 1.21 membatasi patch sesudah putaran pada rendering, jadi diterapkan sebelum putaran resmi berikutnya.
    location: >-
      bench/src/round/main.ts:650
    severity: medium
  - summary: >-
      Restart pen-desktop sesudah seri (fitur 1.20) ikut me-restart pen-vnc lewat BindsTo, sehingga ActiveEnterTimestamp pen-vnc berubah dan laporan tidak menyebutnya.
    evidence: |-
      systemctl show: pen-desktop 18:16:46Z, pen-vnc 18:16:49Z sesudah putaran 2; unit pen-vnc BindsTo=pen-desktop.service. AC 4 hanya mengecualikan pen-desktop. Perlu keputusan orkestrator/Adam: terima sebagai efek restart yang diizinkan atau ubah langkah restart.
    location: >-
      bench/src/sys.ts penDesktopRestartStep
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Putaran 1 gagal (dikonfirmasi Adam: A Kalah, B Setara). Putaran perbaikan 17–20 dan 22 sudah built: juri v2.1 + `decide` v2, foto Wikimedia, skill v9, efek skema v2, LC-20 celah antar-bar, dan restart pen-desktop sesudah seri. G0 baru bisa diputuskan lewat putaran resmi 2 di kode beku. Harness putaran 1 masih punya tiga celah untuk putaran ini:
- Pembekuan belum mencatat atau memeriksa penyedia foto dan schemaVersion 2, dan belum memeriksa rate limit Wikimedia sebelum run berbayar.
- `bench/score-{A,B}.*` akan menimpa bukti juri putaran 1, padahal `bench/round-1.md` merujuk ke file itu (deferred 1.16).
- Laporan belum menampilkan waktu pen.dev putaran ini terhadap median baseline.

**Approach:** Dua fase, sama dengan 1.16.
1. Kode bench saja ($0): tambah cek pembekuan (f) schemaVersion dan (g) probe foto, rekam keduanya di versi beku, tulis skor per putaran untuk putaran resmi ≥ 2, dan tambah baris rasio pen.dev/baseline. Tes, lalu commit kode **sebelum** run berbayar.
2. Mesin: build di HEAD beku, lalu satu kali `pnpm bench:round -- --round 2`. Hasilnya `bench/round-2.md`: keputusan per prompt (decide v2) dan keputusan G0 sementara, dengan bagian "Konfirmasi Adam" menunggu. Story selesai `built` dengan catatan hitl.

## Boundaries & Constraints

**Always:**
- **Protokol beku (sama dengan putaran 1):**
  - pembungkus dan prompt A/B: protocolHash `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d` = `bench/baseline-pendev.json`;
  - argv/env agen dan juri tidak berubah; model `claude-opus-5-5`;
  - rubrik 2.1: sha256 teks juri A `f6d68640c1d174c57b4604087d7bd495cceb538236aa22a074f8033466d6faad` dan B `7c1727857d1061128aa17673ce7a751093860f2009fe3867c276708b6ba2545e` = `bench/rubric/rubric.json` (cek (e) yang sudah ada).
- **Jumlah run:** 1 run per alat per prompt (C8, golden-set §Prosedur 3, arahan Adam). Urutan: A-pen.dev, A-Lakar, B-pen.dev, B-Lakar. Juri 3× per prompt (6 ulangan).
  - Tidak ada alasan prinsipiil untuk menyimpang. Variansi run ditangani lewat juri 3× + median dan koreksi Adam, seperti putaran 1.
  - `--resume` hanya untuk run yang belum final menurut `isFinalRun` (aborted, atau invalid sebelum agen bekerja). Run `failed` dinilai apa adanya.
  - Hasil practice, efek, dan uji tidak digabung ke putaran ini.
- **Versi dan baseline waktu:**
  - Cek (b) yang sudah ada: claude `2.1.325`, pen.dev desktop `1.2.23`, dan model harus sama dengan baseline. Per 2026-11-18 ketiganya sama, terukur saat planning.
  - Bila berbeda saat run, harness abort sebelum run apa pun dan story HALT `blocked`. Adam yang memutuskan: ukur ulang baseline atau tunda. Agen tidak mengukur ulang baseline, dan tidak meng-upgrade atau men-downgrade (C9).
  - Aturan waktu tetap sama dengan putaran 1 (AD-13, `lakarGate`): gerbang = wall Lakar ≤ 1,5 × **median baseline** pen.dev (A 167,3 dtk → batas 251,0; B 131,3 dtk → batas 197,0).
  - Wall pen.dev putaran 2 tidak menjadi gerbang. Laporan mencantumkan rasio Lakar/pen.dev putaran ini dan, sebagai baris baru, rasio pen.dev putaran ini/median baseline sebagai indikator drift.
- **Cek pembekuan resmi** (`officialFreezeProblems`, murni; setiap masalah → `Abort` sebelum run; dry-run hanya mencetak). Yang dipertahankan: (a)–(e). Yang ditambah:
  - (f) `status.schemaVersion === SCHEMA_VERSION` (2) dari `@lakar/schema`.
  - (g) `status.photos.provider === 'wikimedia'`. Ini keputusan Adam di plan 1.18 lanjutan: tanpa key Pexels.
- **Probe foto (rate limit), hanya putaran resmi dan bukan dry-run:**
  - Dijalankan sesudah restart lakard dan cek pasca-restart, sebelum `frozen.json` dan run pertama.
  - Bentuknya satu `POST /photos/search` lewat sesi `LakardClient` baru: `{query: 'mountain lake landscape', limit: 3, preview: true}`. Kueri netral ini tidak terkait A/B. Cache lakard kosong sesudah restart, jadi probe benar-benar memanggil jaringan.
  - Lulus bila `provider === 'wikimedia'`, ≥ 1 hasil, dan `fallbackReason` tidak diawali `wikimedia-` (`no-key` normal).
  - Gagal atau error → `Abort`, tanpa retry otomatis (larangan mengakali rate limit, plan 1.18). Hasil probe (query, provider, fallbackReason, jumlah, ms) dicatat di `frozen.json` → Versi beku.
- **Versi beku tambahan:**
  - `photos {provider, keyFile, probe}`; `photos.provider` ikut `frozenDrift`.
  - `lakard.schemaVersion` sudah ada. Sha skill (`skills`) sudah dicatat per file.
- **Skor per putaran:** putaran resmi ≥ 2 menulis `bench/round-<n>/score-<P>.{md,json}`, dan rujukan "Detail dan bukti" di md menunjuk ke sana. Putaran 1 dan uji-k tetap `bench/score-<P>`, sehingga bukti putaran 1 tidak tertimpa.
- **Keputusan:**
  - Per prompt: `decide` v2 apa adanya (`BETTER_MARGIN` 3, `EQUAL_TOLERANCE` 1, `APPEAL_VETO_GAP` 2).
  - G0: `decideG0` apa adanya. Nol emoji Lakar ditegakkan lewat gerbang LC-01a/b.
  - `round-2.md` memuat semua bagian 1.16: ringkasan, waktu, biaya, rasio, gerbang, emoji a/b/c, reconnect, skor median/rentang, D, keputusan A/B, Keputusan G0 sementara, Evaluasi arah bila belum lolos, PNG untuk Adam, "Konfirmasi Adam" (semua sel `menunggu konfirmasi Adam`), Versi beku, Protokol, penjaga `.pen`, dan restart pen-desktop.
- **PNG:** strip Lakar disalin ke `bench/round-2/{A,B}-lakar.png` (tracked, di-commit bersama laporan oleh orkestrator). Strip dan `.pen` pen.dev tetap lokal di `bench/runs/rounds/2/` (EULA).
- **pen.dev:**
  - hanya MCP `pencil`; `runOne` (`pen-newdoc.sh` + verifikasi dokumen aktif baru & kosong sebelum tiap run, salin `.pen` eksklusif);
  - penjaga md5 `.pen` lama sebelum/sesudah;
  - restart pen-desktop **sekali sesudah run pen.dev terakhir** (fitur 1.20; tidak di tengah run, tidak sebelum putaran), hasil di laporan.
- **RAM/C9:**
  - Sebelum run: `MemAvailable` ≥ 6 GiB dan pen-desktop active. Bila tidak terpenuhi → HALT `blocked`; tidak me-restart service lain.
  - Hanya `/opt/node-26/bin`. Restart hanya `lakard` (harness) dan pen-desktop (langkah 1.20).
  - Snapshot C9 sebelum/sesudah identik. `verify.sh` dijalankan sesudah lakard siap.
- **Positif palsu LC-20 yang sudah diketahui** (deferred 1.20: sub-cek 2 untuk baris redup di bawah scrim + bottom sheet; sub-cek 1 untuk sticky CTA bar landing di atas seksi ber-fill):
  - Bila gerbang Lakar gagal karena LC-20 dengan pola itu, keputusan mesin tetap apa adanya (mis. Kalah, sementara).
  - Implementer menulis di `### Catatan implementer`: board, sub-cek, pesan, bukti PNG (Read), dan rujukan ke entri deferred 1.20, dengan label "kemungkinan positif palsu pra-ada — untuk ditinjau orkestrator/Adam".
  - Juga dicatat bila agen memboroskan execute untuk menghindari temuan itu (dari `stream.jsonl`).
- **Foto saat run:** 429/fallback Openverse saat run Lakar dilaporkan apa adanya (C8). Catatan implementer memuat jumlah `photo_search`/`photo()` dan `fallbackReason` dari `stream.jsonl` Lakar.

**Never:**
- Mengubah `packages/*`, `bench/protocol/*`, `bench/rubric/*`, `bench/mcp/*`, `bench/baseline-pendev.*`, `bench/practice/*`, `.mcp.json`, `~/.claude*`, unit `pen-*`, versi claude/pen, atau `.git/info/exclude`/DESIGN.md.
- Mengubah `decide`, `decideG0`, `lakarGate`, LC-20/aturan check, teks juri, emoji, atau argv. Aturan juga tidak diubah sesudah melihat hasil.
- Run berbayar kedua untuk prompt/alat yang sama, memilih run terbaik, `rejudge` putaran 2, atau putaran `--round 3`.
- Mengisi "Konfirmasi Adam" atau menulis keputusan G0 final. Memulai G1. Commit PNG/`.pen` pen.dev atau `bench/runs`. Push/merge.
- Membuka `~/.pencil/session-desktop.json`, Read/Grep `.pen`, memakai pen-headless/`pen` CLI, atau menimpa `.pen` yang ada.
- Retry otomatis probe foto, atau UA berkontak.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal | `--round 2`, kode beku, versi = baseline, probe ok | restart lakard, probe, 4 run, restart pen-desktop, 6 juri, `round-2.{md,json}`, `round-2/{A,B}-lakar.png`, `round-2/score-{A,B}.*` | exit 0 |
| Versi berubah | claude ≠ 2.1.325 / pen ≠ 1.2.23 | abort sebelum restart/run | exit 1 → HALT blocked (Adam: ukur ulang baseline/tunda) |
| Skema | `/status.schemaVersion` = 1 | masalah (f), abort | exit 1 |
| Penyedia | `photos.provider` = `pexels`/hilang | masalah (g), abort | exit 1 |
| Rate limit | probe → provider `openverse`, `fallbackReason: 'wikimedia-429'` | abort sebelum `frozen.json`/run, $0 | exit 1; boleh diulang manual sekali ≥ 10 menit kemudian (belum ada run), lalu HALT blocked bila tetap gagal |
| Probe kosong/error | 0 hasil atau `EXEC_ERROR` | abort | idem |
| Dry-run | `--round 2 --dry-run` | cetak (a)–(g) + rencana probe dan restart; tanpa probe/restart/run | exit 0 |
| Skor | putaran `2` / `1` / `uji-3` | `bench/round-2/score-A.md` / `bench/score-A.md` / `bench/score-A.md` | — |
| LC-20 pola pra-ada | gerbang Lakar gagal: sub-cek 2 di bawah scrim/sheet | keputusan mesin tetap; catatan implementer berlabel peninjauan | tanpa rerun/ubah aturan |
| Waktu | wall Lakar A 260 dtk | gerbang gagal (rasio 1,55 > 1,5 × median baseline) → Kalah | apa adanya |

</intent-contract>

## Code Map

- `bench/src/round/main.ts`:
  - `OfficialFreezeInput` dan `officialFreezeProblems` (~61-110): tambah input `schemaVersion` dan `photos` (dari `/status`), lalu cek (f)/(g).
  - `freezeInput` (~525), cetakan dry-run "putaran resmi: cek pembekuan" (~561): tambah baris skema/penyedia dan rencana probe.
  - Blok restart lakard (~574-605): sesudah `post` dan `official`, jalankan probe → `Abort`.
  - `frozenNow` (~616): `photos`.
  - `frozenDrift` (~293): `photos: f.photos?.provider`.
  - `CONVENTION` (~272): kalimat putaran resmi + (f)(g), probe, dan path skor.
  - Penulisan skor (~871-874): pakai fungsi path baru.
- Tambah fungsi murni di `main.ts` (diekspor untuk tes):
  - `photoProbeProblems(res | error)`: daftar masalah dari hasil probe.
  - `scoreReportBase(round)`: `isOfficialRound(r) && Number(r) >= 2` → `bench/round-<r>/score-`, selain itu `bench/score-`.
- `bench/src/lakar/lakard-client.ts`:
  - `LakardStatus` + `photos?: {provider: string; keyFile: string; imported: number}`;
  - method `photoSearch(body)` → `POST /photos/search` (butuh sesi; pola `openDoc`). Bentuk respons: `SearchResponse` di `packages/daemon/src/photos/service.ts:355` (`provider`, `fallbackReason?`, `query`, `results[]`, `thumbnails`). Jangan impor paket daemon; ketik minimal di bench.
- `bench/src/round/report.ts`:
  - `FrozenVersions` + `photos?`; Versi beku: satu baris `Foto: penyedia …, key …, probe …`.
  - Bagian prompt (~162): baris `Rasio pen.dev putaran ini/median baseline: x` (informasi, bukan gerbang).
  - "Detail dan bukti" (~194): path dari `scoreReportBase` (teruskan path di `RoundPrompt`/`RoundReport`, jangan hitung di renderer bila tidak murni).
  - Snapshot `round/__snapshots__` diperbarui; snapshot putaran 1/uji tidak berubah kecuali baris baru.
- `bench/src/round/round.test.ts` (~454, `base`): tes (f), (g), `photoProbeProblems` (ok/no-key ok/wikimedia-429/0 hasil/error), `scoreReportBase`, dan `frozenDrift` photos.
- `bench/src/round/score.ts`: `decide`/`decideG0`/`lakarGate` hanya dibaca.
- `bench/README.md`: perbarui paragraf putaran resmi.
- `bench/src/sys.ts` (`penDesktopRestartStep`), `bench/src/pendev/run.ts` (`runOne`, `penDesktopVersion`), `bench/src/lakar/{run,archive}.ts`: dipakai apa adanya.
- Bukti status saat planning: `/status` = schemaVersion 2, `photos {provider:'wikimedia', keyFile:'absent'}`; dry-run `--round 2` di 313e233 tanpa masalah, dan arsip akan memindah `lintas-arus-landing`, `senyap-onboarding`.

## Tasks & Acceptance

**Execution:**
- [x] `bench/src/lakar/lakard-client.ts` -- `photos` di status + `photoSearch` -- bahan probe.
- [x] `bench/src/round/main.ts` (+ `round.test.ts`) -- cek (f)/(g), probe resmi + `photoProbeProblems`, `frozen.photos`, `frozenDrift`, `CONVENTION`, `scoreReportBase` -- pembekuan dan rate limit bisa dibuktikan; bukti putaran 1 aman.
- [x] `bench/src/round/report.ts` (+ snapshot) -- baris foto di Versi beku, rasio pen.dev/baseline, path skor -- isi wajib round-2.md.
- [x] `bench/README.md` -- dokumentasi.
- [x] Mesin, fase 1:
  - `pnpm build && pnpm test` hijau (sekuensial);
  - `--round 2 --dry-run` tanpa masalah selain porcelain;
  - commit kode bench saja (`bench/src`, `bench/README.md`, tanpa plan): `G0 1.21: pembekuan putaran resmi 2 (skema v2, probe foto Wikimedia, skor per putaran)`.
- [x] Mesin, fase 2:
  - `pnpm build` di HEAD itu;
  - dry-run bersih;
  - cek RAM + pen-desktop active;
  - snapshot C9 sebelum;
  - `pnpm bench:round -- --round 2` sekali;
  - snapshot sesudah;
  - Read keempat strip;
  - tunggu lakard siap, lalu `verify.sh`.
- [x] `bench/round-2.md` -- tambahkan `### Catatan implementer` di bawah Keputusan G0, atau di bawah Evaluasi arah bila ada. Isinya:
  - kesan dari strip;
  - pemakaian foto dan fallback;
  - jumlah execute per run Lakar dan batas skill;
  - temuan LC-20 pola pra-ada bila ada;
  - rasio drift pen.dev.

  Bukan keputusan.

**Acceptance Criteria:**
- Given HEAD beku dan build baru, when `node bench/dist/cli.js round --round 2 --dry-run`, then yang tercetak:
  - SHA HEAD dan porcelain kode kosong;
  - claude 2.1.325, pen 1.2.23, dan model = baseline;
  - protocolHash `907cb36f…`, rubrik 2.1 = `rubric.json`, schemaVersion 2, penyedia `wikimedia`;
  - rencana probe, restart lakard, dan restart pen-desktop;
  - "masalah: tidak ada".

  Tidak ada probe, restart, run, atau `bench/round-2.md`.
- Given putaran selesai, when membuka `bench/round-2.md`, then isinya:
  - versi beku: SHA, model, claude, pen, schemaVersion 2, sha skill, Chromium, font, ikon, foto + probe, protocolHash, versi rubrik dan sha256 teks juri;
  - waktu dan rasio terhadap baseline serta pen.dev, biaya, skor median/rentang, emoji a/b/c;
  - keputusan A dan B, keputusan G0 sementara;
  - "Konfirmasi Adam" berstatus menunggu, dengan detail skor di `bench/round-2/score-{A,B}.md`.
- Given putaran selesai, when `git status --porcelain`, then yang baru: `bench/round-2.{md,json}`, `bench/round-2/{A,B}-lakar.png`, `bench/round-2/score-{A,B}.{md,json}`. `bench/score-{A,B}.*` dan `bench/round-1*` tidak berubah. Tidak ada PNG/`.pen` pen.dev atau `bench/runs`.
- Given putaran selesai, when snapshot C9 dibandingkan, then:
  - md5 `.pen` lama, mcpServers, `settings.json`, dan `ActiveEnterTimestamp` pen-* identik, kecuali pen-desktop yang berubah tepat karena restart sesudah seri yang tercatat di laporan;
  - `verify.sh` exit 0; lakard active.

## Implementation Notes

**Fase 1 (kode, commit `1b8017131b4b5b74cb52610d511d191e5cb6e148` "G0 1.21: pembekuan putaran resmi 2 (skema v2, probe foto Wikimedia, skor per putaran)"):**
- `lakard-client.ts`: `LakardStatus.photos?`, tipe minimal `PhotoSearchResult`, dan method `photoSearch` (`POST /photos/search`, butuh sesi).
- `main.ts`:
  - `officialFreezeProblems` menambah (f) `schemaVersion === SCHEMA_VERSION` dan (g) `photos.provider === 'wikimedia'` lewat input `lakard` (Pick + `schemaVersion`, `photos`);
  - fungsi murni `photoProbeProblems`, `scoreReportBase`, serta konstanta `EXPECTED_PHOTO_PROVIDER` dan `PHOTO_PROBE`;
  - `runPhotoProbe` (sesi `LakardClient` baru, Abort tanpa retry) dijalankan sesudah cek pasca-restart dan sebelum `frozen.json`;
  - `frozen.photos {provider, keyFile, probe}`; `frozenDrift` ikut membandingkan `photos.provider`;
  - `CONVENTION` diperbarui; dry-run mencetak baris skema/penyedia dan rencana probe;
  - skor ditulis ke `scoreReportBase(round)` dengan mkdir.
- `report.ts`:
  - `RoundPrompt.scoreReport?` (tanpa field → `bench/score-<P>.md`, sehingga laporan lama tidak berubah);
  - tipe `PhotoProbe` dan `FrozenVersions.photos?`;
  - baris `Foto: penyedia …, key …, probe …`;
  - baris `Rasio pen.dev putaran ini/median baseline pen.dev: x (indikator drift, bukan gerbang)`.
- Snapshot: hanya baris rasio baru yang bertambah (3 tempat).
- Tes:
  - (f)/(g);
  - `photoProbeProblems`: ok, no-key, openverse+wikimedia-429, wikimedia-maxlag, 0 hasil, error;
  - `scoreReportBase` (2/10/1/uji-3) dan `frozenDrift` photos;
  - laporan putaran 2: baris foto, path skor, rasio drift.
- Hasil verifikasi fase 1: `pnpm build` exit 0; `pnpm test` 49 file / 869 tes lulus, 0 skip; README diperbarui.

**Fase 2 (putaran resmi `2`, HEAD `1b80171`, exit 0, `lengkap`):**
- Persiapan:
  - build di HEAD itu;
  - dry-run bersih: porcelain kode kosong, claude 2.1.325 / pen 1.2.23 / model = baseline, protocolHash `907cb36f…`, rubrik 2.1 = rubric.json, schemaVersion 2, penyedia wikimedia, rencana probe/restart, "masalah: tidak ada";
  - RAM tersedia 12911 MiB; pen-desktop active.
- Arsip `lintas-arus-landing` dan `senyap-onboarding`. lakard di-restart (pid 1682719 → 1693465). Probe foto: wikimedia, 3 hasil, 2257 ms, `no-key`.
- Run:
  - A: pen.dev 156,4 dtk / $0,84; Lakar 180,3 dtk / $1,29 (Lakar/baseline 1,08). Gerbang lolos. Juri 13 vs 13, D 4 vs 2 → **Setara**.
  - B: pen.dev 91,2 dtk / $0,52 (frame 390×1044); Lakar 130,7 dtk / $0,61 (Lakar/baseline 1,00). Gerbang lolos (2 board 390×844). Juri 13 vs 10, D 4 vs 3 → **Lebih baik**.
  - Kriteria rentang > 1: R5 Lakar B. Emoji (c) Lakar B rentang 2.
- G0 sementara: **lolos**; Konfirmasi Adam menunggu (`grep -c` = 11).
- Rasio drift pen.dev/baseline: A 0,93, B 0,69.
- Restart pen-desktop sesudah run pen.dev terakhir: berhasil, 12,6 dtk.
- Biaya: run $3,26 + juri $1,61 ≈ $4,87.
- C9:
  - 43 `.pen` lama identik (2 dokumen pen baru);
  - mcpServers dan settings.json identik;
  - ActiveEnterTimestamp pen-desktop berubah karena restart tercatat. pen-vnc ikut berubah karena `BindsTo=pen-desktop.service`, bukan karena di-restart harness. pen-novnc/pen-web/pen-mcp-http identik;
  - `verify.sh` exit 0; lakard active.
- `git status`: baru `bench/round-2.{md,json}` dan `bench/round-2/{A,B}-lakar.png`, `score-{A,B}.{md,json}`. `bench/score-*` dan `bench/round-1*` utuh. Tidak ada `bench/runs`/PNG/`.pen` pen.dev.
- Kesan strip, pemakaian foto, execute per run, LC-20, dan drift dicatat di `### Catatan implementer` di `bench/round-2.md` (di bawah Keputusan G0, karena tidak ada Evaluasi arah). Ringkasnya:
  - A-Lakar: mockup hero terpotong rata di batas hero (R5 1);
  - B-Lakar: dua board (awal + akhir gulir), garis tipis sisa kartu di board akhir;
  - B-pen.dev: melebihi 844;
  - kedua run Lakar 5 execute (melewati batas skill 4/3 meski diingatkan);
  - keluaran execute ke-1 B 53 rb karakter melebihi batas tool result;
  - tidak ada pola LC-20 pra-ada.

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 6 findings — high 0, medium 2, low 4, false 0, maybe-false 0
- findings:
  - `[medium]` `[defer]` Probe foto ikut berjalan pada `--resume` putaran resmi (blok restart `if (official)` tidak memeriksa `resume`/`frozen.json`), sehingga regenerasi laporan $0 bisa ter-abort oleh 429 dan pesan "belum ada run" keliru — terverifikasi di `bench/src/round/main.ts` (~644–651). Perbaikannya mengubah alur harness, sedangkan Design Notes membatasi patch sesudah putaran pada rendering laporan; ditunda ke pembekuan putaran berikutnya. Putaran 2 tidak butuh `--resume`.
  - `[medium]` `[defer]` AC C9: `ActiveEnterTimestamp` pen-vnc ikut berubah karena `BindsTo=pen-desktop.service` saat restart pen-desktop sesudah seri — perilaku pra-ada dari fitur 1.20 (`penDesktopRestartStep`), bukan dari diff ini; tercatat di Catatan implementer dan Implementation Notes; perlu tinjauan orkestrator/Adam (laporan bagian restart belum menyebut pen-vnc).
  - `[low]` `[reject]` Probe `preview: true` tidak mendeteksi 429 pada unduhan thumbnail (thumbnail gagal dilewati diam-diam) — benar, tetapi kriteria lulus probe di plan hanya penyedia/jumlah/fallbackReason, run nyata tanpa 429, dan perbaikan menambah cabang cek baru.
  - `[low]` `[reject]` Cek (g) lolos bila key Pexels ada tetapi invalid (`provider` tetap wikimedia) — benar secara teori; `keyFile` tercatat `absent` di Versi beku putaran ini, kejadian tak mungkin di mesin ini tanpa intervensi, dan perbaikan menambah cek baru.
  - `[low]` `[patch]` Komentar kepala `bench/src/round/report.ts` masih menyebut skor selalu `bench/score-<id>` — diperbaiki (komentar saja, menyebut `bench/round-<n>/score-<id>` untuk putaran resmi ≥ 2; tanpa perubahan perilaku).
  - `[low]` `[patch]` Catatan implementer `bench/round-2.md` tidak menyebut 👋 pada input agen pen.dev A (kolom (a) = 1) — ditambahkan: teks "Selamat pagi, Bu Sari 👋" di mockup, tidak terbaca di strip, juri (c) median 0 (dicek di `A-pendev/stream.jsonl`).

## Design Notes

- **Perkiraan biaya dan waktu:**
  - Run: A Lakar ±$1,1–1,6 (practice P1 $1,59), A pen.dev ±$0,9, B Lakar ±$0,5–0,7, B pen.dev ±$0,6.
  - Juri v2.1 ±$0,75/prompt → ±$1,5.
  - Total **±$4,5–6**; batas kerja $8. Bila angka run melampauinya, laporkan; jangan mengulang run.
  - Wall putaran ±25–40 menit (4 run ±12 menit, restart pen-desktop ±20 dtk, juri 6 ulangan), ditambah build/tes ±10 menit.
- **Risiko waktu:** skill v9 lebih kaya daripada skill putaran 1. Contohnya practice P1 landing 222 dtk vs batas A 251, dan mobile 140–178 dtk vs batas B 197. Margin B tipis. Gerbang tetap memakai median baseline, konsisten dengan putaran 1 dan Notes epic. Rasio terhadap pen.dev putaran ini hanya dilaporkan.
- **Kenapa probe di harness, bukan curl manual:** endpoint butuh sesi, dan hasil probe harus masuk versi beku laporan. Abort sebelum `frozen.json` tidak meninggalkan dir putaran berisi run, jadi percobaan ulang manual tidak melanggar C8.
- **Kenapa path skor dibedakan hanya untuk ≥ 2:** `bench/round-1.md` (dikonfirmasi Adam) merujuk `bench/score-{A,B}.md`. Menulis ulang round-1 atau memindah file lama mengubah bukti yang sudah dikonfirmasi.
- **Patch review sesudah putaran** hanya boleh menyentuh rendering laporan. Regenerasi lewat `--resume` tanpa run berbayar (`frozenDrift` mencatat HEAD berbeda), lalu Catatan implementer ditulis ulang.

## Verification

**Commands:**
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH pnpm build && PATH=/opt/node-26/bin:$PATH pnpm test` -- expected: exit 0, 0 skip (jumlah tes dicatat).
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH node bench/dist/cli.js round --round 2 --dry-run` -- expected: exit 0 sesuai AC 1.
- `cd /root/lakar && git rev-parse HEAD && git status --porcelain` -- expected: HEAD = commit fase 1; hanya file plan.
- `free -m | awk '/Mem:/{print $7}'; systemctl is-active pen-desktop` -- expected: ≥ 6144; active.
- Snapshot sebelum (`$SCRATCH` = scratchpad sesi):
  - `find /opt/pen /root/comprice /root/lakar/design /root/.pencil/documents -name '*.pen' -exec md5sum {} + | sort > "$SCRATCH/pen-before-r2.txt"`;
  - `jq -S .mcpServers ~/.claude.json`; `md5sum ~/.claude/settings.json`;
  - `systemctl show -p ActiveEnterTimestamp pen-desktop pen-vnc pen-novnc pen-web pen-mcp-http`;

  -- expected: tercatat.
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH pnpm bench:round -- --round 2` -- expected: exit 0 dan semua file AC 2/3. Exit 1 sebelum run (versi/probe/RAM) → HALT blocked dengan alasan.
- Ulangi snapshot sesudah putaran -- expected: identik (dokumen pen baru di `~/.pencil/documents`; pen-desktop ActiveEnterTimestamp berubah sesuai baris restart laporan).
- `cd /root/lakar && grep -c 'menunggu konfirmasi Adam' bench/round-2.md; git status --porcelain | grep -cE 'bench/runs|pendev.*\.png|\.pen$'; git diff --quiet -- bench/score-A.md bench/score-B.md bench/round-1.md && echo utuh` -- expected: ≥ 1; 0; `utuh`.
- `until curl -sf 127.0.0.1:7466/status | grep -q '"ready":[1-9]'; do sleep 1; done` (maks 90 dtk), lalu `cd /root/lakar && bash tools/node26/verify.sh; systemctl --user is-active lakard` -- expected: exit 0; active.

**Manual checks:**
- Read `bench/runs/rounds/2/{A,B}-{lakar,pendev}.png`, cocokkan dengan skor juri, lalu catat kesan di Catatan implementer dan Implementation Notes.
- `grep -c '"name":"mcp__lakar__photo_search"\|fallbackReason' bench/runs/rounds/2/*-lakar/stream.jsonl` dan hitung execute per run Lakar → catatan implementer.
- Pastikan "Konfirmasi Adam" tidak berisi keputusan Adam.

## Auto Run Result

- Status: **built** (2026-11-18). hitl: keputusan G0 **sementara lolos** (A Setara, B Lebih baik), "Konfirmasi Adam" di `bench/round-2.md` menunggu Adam. G1 tidak dimulai.
- Ringkasan: pembekuan putaran resmi diperluas (cek (f) schemaVersion 2, (g) penyedia foto wikimedia, probe rate limit foto sebelum run, foto+probe di Versi beku, skor per putaran ≥ 2, rasio drift pen.dev/baseline); kode beku commit `1b8017131b4b5b74cb52610d511d191e5cb6e148`; putaran resmi 2 dijalankan sekali (exit 0, `lengkap`, ≈ $4,87: run $3,26 + juri $1,61).
- File:
  - `bench/src/lakar/lakard-client.ts` — `photos` di status, `photoSearch`.
  - `bench/src/round/main.ts` — cek (f)/(g), probe, `scoreReportBase`, `frozen.photos`, drift, konvensi.
  - `bench/src/round/report.ts` (+ snapshot) — baris foto, rasio drift, path skor; komentar kepala (patch review).
  - `bench/src/round/round.test.ts` — tes (f)/(g), probe, path skor, drift, laporan putaran 2.
  - `bench/README.md` — dokumentasi putaran resmi.
  - `bench/round-2.{md,json}`, `bench/round-2/{A,B}-lakar.png`, `bench/round-2/score-{A,B}.{md,json}` — hasil putaran 2 (+ Catatan implementer).
- Review (quick, 6 temuan): 2 patch (low: komentar report.ts, catatan 👋 A pen.dev), 2 defer (medium: probe saat `--resume`; pen-vnc ikut restart via BindsTo), 2 tolak (low: 429 thumbnail tak terdeteksi probe — di luar kriteria plan, run tanpa 429; key Pexels invalid lolos (g) — keyFile absent tercatat).
- Follow-up review: `false` (tidak ada patch high/medium).
- Verifikasi: `pnpm build` + `pnpm test` 49 file / 869 tes lulus, 0 skip (sebelum dan sesudah patch); dry-run `--round 2` exit 0 "masalah: tidak ada" di HEAD beku; `grep -c 'menunggu konfirmasi Adam'` = 11; tidak ada `bench/runs`/PNG/`.pen` pen.dev di git; `bench/score-*` dan `bench/round-1*` utuh; RAM tersedia 12847 MiB, pen-desktop active; `verify.sh` exit 0, lakard active. Keempat strip dibaca (Read) oleh implementer dan orkestrator build.
- Risiko sisa:
  - rentang R5 Lakar B dan emoji (c) Lakar B (rentang 2, agen/lint 0) perlu dicek Adam;
  - agen Lakar melewati batas execute skill di kedua prompt (5 vs 4/3) meski diingatkan;
  - keluaran execute ke-1 B 53 rb karakter melebihi batas tool result;
  - pen-vnc ikut restart (BindsTo) — defer;
  - probe pada `--resume` — defer;
  - 1 run per alat, variansi run tidak terukur; pen.dev B jauh lebih cepat dari baseline (rasio 0,69).
