---
title: 'Check luapan non-teks (LC-02c) dan konten terpotong rata (LC-31 diperluas)'
type: feature
ticket: '15'
created: '2026-11-19'
status: built
baseline_revision: 'e5e4bcc87ca3a1572b7dc48a04bfdf06ee882047'
route: full
route_source: auto
risk: high
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/tickets/story-check-luapan-non-teks-dan-konten-terpotong-di-tepi-board.md'
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/tickets/story-check-struktural-lc-13-14-15-16-21-22-plan.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `layout_check` meloloskan kartu KPI P8 polish-4 (`Kartu / Pengiriman`: `Batang mini` masuk padding kanan, sisa 4,5px vs kiri 24px) karena LC-02b hanya menilai teks, dan meloloskan tabel `Pesanan keluar` P8 (baris terakhir rata di tepi bawah kartu ber-clip, padding bawah 0 vs atas 20) karena LC-31 hanya menilai luapan > 1px di tepi clip yang rata dengan seksi/board.

**Approach:** Aturan baru LC-02c (error · gerbang) untuk luapan non-teks ke padding/tepi wadah tampak, dan LC-31 diperluas dengan dua kasus rata (kartu rata tepi bawah board/seksi; daftar/tabel rata tepi bawah wadahnya tanpa ruang bawah). Definisi ditentukan dari pindaian 120 dokumen arsip (lihat Design Notes), dibuktikan dengan fixture minimal turunan P8 dan dokumen asli, lalu pemindaian ulang arsip dengan 0 positif palsu error.

## Boundaries & Constraints

**Always:**
- Bentuk temuan AD-8; detail ≤ 120 karakter; error tidak dibatasi; aturan murni di `rules.ts`, dijalankan di `checkBoard` (execute + `layout_check`).
- Positif palsu diperbaiki di definisi umum, bukan pengecualian per dokumen/board. Temuan LC-31 lama (12 board arsip) identik per dokumen; aturan lain identik dengan `after2.json`.
- C9: hanya `/opt/node-26/bin/pnpm`/`node`; tanpa npx, paket global, PATH/profil, port tetap, container. Restart hanya `systemctl --user restart lakard`. Akhiri `tools/node26/verify.sh`.
- Commit di `g1` (tanpa ganti branch/push/merge), akhiran `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Never:**
- Jangan ubah `packages/skills/**` (C7); contoh skill yang memicu aturan baru → `PENDING_2_10` dengan pencocokan persis (aturan + nama node + awal detail).
- Jangan panggil MCP pencil, sentuh `.pen`, jalankan `claude -p`/run bench, tampilkan key Unsplash, sunting tangan `bench/*-<k>.md` hasil harness, atau tinggalkan proses daemon sementara.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| LC-02c P8 minimal | kartu fill+stroke padding 24, lebar 232; baris `Nilai` fill (row, space-between) berisi `Angka` (teks 40 + satuan) + `Batang mini` 7×8 gap 4 | error LC-02c pada `Batang mini`: luapan kanan ±19px, sisa ±5px ke tepi kartu | — |
| LC-02c dok asli | `bench/runs/practice-polish/4/P8-lakar/doc/lumbung-dashboard.lakar.json` | ≥ 1 error LC-02c `Batang mini` (eanIYqDM); `Badge / +7,9%…` (luapan 2px, sisa 22px) tidak | — |
| LC-02c tumpah | anak flow melewati tepi kartu ber-cat (sisa < 0), induk langsung kartu | error | — |
| LC-02c negatif | luapan kecil sisa ≥ min(8, padding/2) (mis. 2px ke padding 24); induk tanpa cat dan tanpa leluhur ber-cat; `Overlay /`/`Crop /` (node/leluhur); rotasi; induk gap negatif; sumbu vertikal di `Scroll /`/`scrollY`; anak absolut; node yang kena LC-02a; teks | tidak ada LC-02c | — |
| LC-02c bersarang | frame meluap beserta anaknya | satu temuan (node terluar) | — |
| LC-31 rata board | kartu ber-cat berisi teks (lebar < 90% board, tidak mulai dari tepi atas clip) berakhir rata (−2..+1px) di tepi bawah board/seksi | error LC-31 | — |
| LC-31 rata negatif | sidebar penuh tinggi, footer/tab bar selebar ≥ 90% board, kartu dengan margin bawah ≥ 3px | tidak ada | — |
| LC-31 daftar rata | kartu `layout:'column'` ber-cat, ≥ 2 anak flow terakhir berupa baris ber-cat berisi teks, baris terakhir rata (≤ 2px) tepi bawah kartu, ruang atas ≥ 8 | error LC-31 pada baris terakhir (P8 `Baris / Pasar Induk…`) | — |
| LC-31 daftar negatif | daftar bergaris tanpa ruang atas (atas 0, bawah 0), kartu dengan padding bawah, baris terakhir tak ber-cat | tidak ada | — |
| LC-31 lama | luapan > 1px di clip rata seksi (mockup hero) | sama seperti sebelum story | — |

</intent-contract>

## Code Map

- `packages/schema/src/findings.ts` -- tambah `'LC-02c': { level:'error', gate:true, title:'non-teks meluap dari isi wadah' }` setelah LC-02b; judul LC-31 → `konten terpotong rata di tepi bawah`. `findings.test.ts` daftar ID.
- `packages/check/src/rules.ts` -- `lc02c(ctx)` baru di dekat `lc02b` (pakai `paddingOf`, `isFlowChild`, `paintedCard`, `ancestors`, `named`, `rotated`, `overflow`, `SIDES`, `levelOf`); perluas `lc31(ctx, skip)` (cabang rata board/seksi + cabang daftar rata). `paintedCard` didefinisikan di bagian LC-31 — pindahkan ke atas bila perlu (tanpa ubah perilaku).
- `packages/check/src/index.ts` -- `checkBoard`: `...lc02c(ctx)` setelah LC-02b dengan `skip` = id LC-02a (cut); `RULE_ORDER` + `'LC-02c'`; ekspor `lc02c` + konstanta.
- `packages/check/src/index.test.ts` -- fixture positif/negatif tiap baris matriks (helper `runAll()`/`docOf` yang ada; `run()` menyaring aturan G1 — pastikan LC-02c tidak ikut tersaring atau fixture G0 lama tidak patah).
- Tes dokumen asli P8: tes di paket check tidak punya renderer; tambahkan tes daemon (pola `packages/daemon/src/index.test.ts`, browser nyata, `describe.skipIf(!browserInstalled)`) yang membuka salinan dokumen P8 dan mengharapkan LC-02c `Batang mini` + LC-31 `Baris / Pasar Induk Cipinang Kios 14B`.
- `packages/mcp/src/server.ts` `LAYOUT_CHECK_DESCRIPTION` -- frasa LC-02c dan LC-31 diperluas; sesuaikan `tests/execute-description.test.ts` bila mencocokkan teks.
- `packages/daemon/src/skills-examples.test.ts` `PENDING_2_10` -- hanya bila contoh skill memicu aturan baru.
- `bench/src/round/*` -- tidak diubah (gerbang dihitung dari `G0_RULES`); jalankan tesnya.
- `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` Lampiran A (baris ~475–511, di-exclude git) -- baris LC-02c baru, LC-31 diperluas, kalimat aturan berjalan; salin sebelum ubah ke scratchpad.
- `bench/practice/LOG.md` -- §2.15 pemindaian arsip (pola §2.4).
- Scratchpad (`/tmp/claude-0/-root-lakar/28ec6272-7bb0-49b1-9470-ffa46c6812fb/scratchpad/`): `archcheck.mjs` (daemon dist sementara, `--shots`), `docs.txt` (120 dok), `after2.json` (baseline HEAD), `measures.json` + `proto.mjs`/`proto31.mjs` (prototipe tanpa render), `shots.mjs`, crop di `shots15/`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/schema/src/findings.ts`, `findings.test.ts` -- LC-02c + judul LC-31.
- [x] `packages/check/src/rules.ts`, `index.ts` -- `lc02c`, `lc31` diperluas, urutan/ekspor.
- [x] `packages/check/src/index.test.ts` -- fixture matriks, termasuk P8 minimal (kartu KPI + tabel) dan kasus negatif sidebar/footer/kartu ber-margin.
- [x] Tes daemon dokumen asli P8 (salinan fixture di direktori fixture tes, bukan path bench langsung bila tes lain melakukannya demikian).
- [x] `packages/mcp/src/server.ts` + tes deskripsi.
- [x] Build, pindaian arsip `archcheck.mjs /root/lakar <after15.json> --shots LC-02c,LC-31 $(cat docs.txt)`; bandingkan dengan `after2.json` per aturan; buka crop setiap error LC-02c/LC-31 baru; positif palsu → perbaiki definisi umum, ulang. Catat tabel di LOG.md §2.15 + Implementation Notes (jumlah dokumen gagal gerbang sebelum/sesudah + contoh).
- [x] `skills-examples.test.ts` -- jalankan; bila contoh skill memicu LC-02c/LC-31, tambah `PENDING_2_10` persis dan catat untuk 2.10/2.16.
- [x] DESIGN.md Lampiran A di disk.
- [x] `pnpm build`, `pnpm test`, `systemctl --user restart lakard`, `tools/node26/verify.sh`, commit.

**Acceptance Criteria:**
- Given build sesudah story, when `/opt/node-26/bin/pnpm --filter @lakar/check test`, then fixture positif/negatif LC-02c dan LC-31 (termasuk P8 minimal) lulus.
- Given lakard/daemon tes dengan dokumen P8 polish-4 asli, when `layout_check`, then muncul `error·gerbang · LC-02c · Batang mini` dan `error·gerbang · LC-31 · Baris / Pasar Induk Cipinang Kios 14B`.
- Given arsip 120 dokumen, when dipindai ulang, then setiap error LC-02c/LC-31 baru terverifikasi cacat nyata lewat crop (0 positif palsu), aturan lain identik dengan `after2.json`, dan kenaikan jumlah dokumen gagal gerbang tercatat.
- Given DESIGN.md, when Lampiran A dibaca, then ada baris LC-02c, LC-31 diperluas, dan LC-02c tercantum di kalimat aturan berjalan.

## Implementation Notes

- Checkpoint plan 2026-11-19 (orkestrator, didelegasikan Adam): plan disetujui. Definisi (c) daftar rata = sesuai maksud Adam, pertahankan. Kasus (b) cukup fixture sintetis; catat "belum ada contoh arsip". Ambang LC-02c sisa < min(8, padding/2) diterima; laporkan kasus batas sisa 8–12px (crop + angka) di LOG.md §2.15 dan Implementation Notes.
- **Skema:** `LC-02c` (error · gerbang, `non-teks meluap dari isi wadah`) setelah LC-02b; judul LC-31 → `konten terpotong rata di tepi bawah`.
- **Check:** `lc02c(ctx, skip)` di `rules.ts` sesuai Design Notes (konstanta `BOX_OVERFLOW_MIN` 1, `BOX_CLEARANCE_MAX` 8); `paintedCard` dipindah ke helper bersama (perilaku sama). `lc31` = (a) lama tanpa perubahan detail, (b) rata −2..+1 dengan lebar < 90% board dan mulai > 2px di bawah tepi atas clip (detail `rata di tepi bawah <seksi> tanpa ruang bawah (sisa n px)`), (c) `flushListRow` (`LIST_TOP_MIN` 8, bukan di `Crop /`; detail `baris terakhir rata di tepi bawah <kartu> (bawah n px, atas n px)`). `checkBoard` menjalankan `lc02c(ctx, cut)` setelah LC-02b; `RULE_ORDER` + ekspor.
- **Tes:** `packages/check/src/index.test.ts` dua describe baru (LC-02c: P8 minimal, tumpah, ambang padding/2, bersarang, 11 negatif; LC-31: rata board, rata seksi ber-clip, negatif sidebar/footer/margin 3, daftar rata P8 minimal, negatif daftar). `run()` tidak menyaring LC-02c dan fixture G0 lama tetap lulus. Tes daemon dokumen asli: salinan `packages/daemon/test/fixtures/p8-polish-4-lumbung.lakar.json` (bench/runs di-ignore git) → `error·gerbang · LC-02c · Batang mini`, `error·gerbang · LC-31 · Baris / Pasar Induk Cipinang Kios 14B`. `tests/execute-description.test.ts` + 1 tes deskripsi `layout_check`.
- **Pindaian arsip** (`after15.json`, 120 dok, 0 gagal): aturan lain identik dengan `after2.json` per dokumen; LC-31 lama identik. LC-02c 32 temuan / 14 dok, LC-31 baru 2 (P8 daftar rata, 2 salinan), (b) 0 = belum ada contoh arsip. Dokumen gagal gerbang 74 → 80. Semua kasus unik diperiksa lewat crop wadah: cacat nyata, 0 positif palsu. Kasus batas sisa 8–12 (tidak dilaporkan): Bayu Hasibuan 9/24, Ruang tunggu 10/24, `Info / Porsi` 10,9/12, tiga kasus 12. Tabel di `bench/practice/LOG.md` §2.15.
- **Skill:** `skills-examples.test.ts` lulus tanpa entri `PENDING_2_10` baru (contoh skill tidak memicu LC-02c/LC-31).
- **Verifikasi:** `pnpm build` lulus; `pnpm test` 1033/1034 (gagal hanya latensi `visual.test.ts` saat paralel; lulus sendiri); lakard di-restart; `verify.sh` semua OK, Node sistem v22.23.5. DESIGN.md Lampiran A di disk (cadangan scratchpad `DESIGN.before15.md`).

## Plan Change Log

## Review Triage Log

## Design Notes

**LC-02c (error · gerbang).** Node `n` non-teks (frame, rect, ellipse, path, icon; gambar = frame/rect ber-fill image) yang anak flow induk `P`. `W` = leluhur terdekat (mulai `P`) yang ber-cat (`paintedCard`: fill tak transparan, stroke, bayangan luar); setiap node dari `n` sampai anak `W` harus anak flow (rantai flow), dan board bukan `W`. Temuan di sisi `s` bila (1) `n` melewati content box `P` (bounds − padding) > 1px (asal luapan), (2) `n` melewati content box `W` > 1px, dan (3) sisa jarak `n` ke tepi `W` di sisi `s` < min(8, padding `W` di sisi `s` / 2) (negatif = tumpah keluar). Pengecualian: `n` atau leluhur `Overlay /`/`Crop /`, rotasi di rantai, induk gap negatif, sisi atas/bawah bila ada leluhur `Scroll /` atau `scrollY` > 0, node yang kena LC-02a. Hanya node terluar (keturunan node yang sudah dilaporkan dilewati).
- Mengapa syarat sisa jarak dibutuhkan (data prototipe, 30 kasus unik tanpa syarat): luapan 1,1–2,5px ke padding 12–24 (sisa 11–22px) tak terlihat (mis. badge `Karung keluar` P8, `Info / Porsi`); sisa 12–20px ke padding 20–24 terlihat wajar (crop `Bahan hampir habis`, `Pengingat WhatsApp`). Semua sisa < 8 terverifikasi cacat: KPI P8 4,5; badge testimoni 6; konten di tepi 0; tumpah −2 s.d. −31 (bar `Status alumni` keluar kartu 31px). Ambang ≥ 8 terdekat: 9/24 (`Bayu Hasibuan`, sempit tapi tidak dipilih agar 0 positif palsu). Batas padding/2 menjaga wadah ber-padding kecil (8) dari luapan 2px.
- Kenapa `W` bukan selalu induk langsung: di P8 induk `Batang mini` adalah `Nilai` tanpa cat; wadah tampak = kartu. Syarat (1)+(2) menahan kasus induk tanpa cat yang memang tidak meluap.

**LC-31 diperluas.** Tetap: node terluar, bukan `Scroll /`/`Overlay /`/rotasi/LC-02a. (a) Lama: frame ber-cat berisi teks melewati tepi bawah clip terdekat > 1px dengan clip rata seksi/board. (b) Rata board/seksi: sama, tetapi tepi bawah node rata (−2 ≤ luapan ≤ 1) dengan tepi clip, node lebar < 90% board dan tidak mulai dari tepi atas clip (bukan sidebar/footer/tab bar/panel penuh). (c) Daftar rata: frame ber-cat `layout:'column'` yang dua anak flow terakhirnya frame ber-cat berisi teks (baris), baris terakhir berakhir ≤ 2px dari tepi bawah frame, sedangkan anak flow pertama mulai ≥ 8px dari tepi atasnya (ruang atas ada, ruang bawah tidak). Temuan pada baris terakhir.
- Data prototipe: (b) 51 kandidat rata di tepi board semuanya sidebar penuh tinggi atau footer selebar board → 0 temuan setelah pengecualian. (c) 15 kandidat; 14 daftar bergaris simetris (atas 0, bawah 0: FAQ, tabel risiko, fitur) → bukan temuan; 1 = P8 `Pesanan keluar` (atas 20, bawah 0).
- Catatan untuk Adam: tabel P8 tidak menyentuh board (kartu berakhir y 868, board 900, `Area kerja` padding 32); cacatnya baris terakhir rata di tepi bawah kartu ber-clip tanpa ruang bawah. Kasus (b) adalah varian "rata board" yang diminta, tetapi arsip tidak memuat contohnya (fixture sintetis).

**Dampak perkiraan (prototipe):** LC-02c di 14 dok (≈ 6 dok baru gagal gerbang; base 74/120 gagal gerbang); LC-31 +2 dok P8 (salinan bench + `~/.local/share/lakar/docs`). Angka pasti dari pindaian daemon.

## Verification

**Commands:**
- `/opt/node-26/bin/pnpm build` -- expected: lulus.
- `/opt/node-26/bin/pnpm --filter @lakar/check test` dan `--filter @lakar/schema test` -- expected: lulus.
- `/opt/node-26/bin/pnpm test` -- expected: lulus (kecuali latensi `visual.test.ts` saat paralel; ulang sendiri).
- `/opt/node-26/bin/node <scratchpad>/archcheck.mjs /root/lakar <scratchpad>/after15.json --shots LC-02c,LC-31 $(cat <scratchpad>/docs.txt)` -- expected: 120 dok, 0 gagal, error baru = cacat nyata tercatat, aturan lain sama dengan `after2.json`.
- `tools/node26/verify.sh` -- expected: semua OK, Node sistem v22.

**Manual checks (if no CLI):**
- Crop di `<scratchpad>/shots/` untuk setiap error LC-02c/LC-31 baru.
