---
type: epic
title: "G1: inti A lengkap lolos golden set"
parent: initiative-lakar
covers: [R5, R6, R7, R9, R11, R12]
after: [epic-g0-inti-minimal]
refined: true
risk: high
---

# G1: inti A lengkap lolos golden set

## Description

Epic ini melengkapi inti A setelah G0 lulus: seluruh aturan `layout_check` Lampiran A, skill `webapp.md`, desain target golden set yang dibangun ulang di Lakar, dan putaran benchmark A–E. Foto stok lokal sudah tersedia dari G0 (story 1.18); G1 membuktikannya di prompt D.

## Outcome

Adam punya bukti bahwa Lakar setara atau lebih baik dari pen.dev di seluruh golden set (≥ 4/5, ≥ 1 lebih baik), cukup untuk memulai B.

## Done when

- Semua aturan Lampiran A berjalan, dan kelima desain target golden set di Lakar lolos dengan 0 error dan LC-17/18/19 = 0.
- Baseline pen.dev untuk C, D, dan E diukur (median 3 run) dengan runner G0.
- Prompt D menghasilkan foto relevan dari aset lokal (mekanisme foto milik G0, story 1.18).
- `bench/round-<n>.md` untuk A–E memutuskan G1, dan Adam sudah mengonfirmasi.
- Rilis berjalan di service `lakard` di VPS.

## Requirements

- R1 (parent R5; DESIGN.md Lampiran A): `layout_check` menjalankan semua aturan Lampiran A, termasuk LC-03, LC-06–10, LC-13–17, LC-19, LC-21, dan LC-22 yang belum ada di G0. Terbukti bila setiap aturan punya fixture positif dan negatif, dan aturan berlevel error tidak memberi temuan pada arsip dokumen Lakar bench (`bench/runs/**/*.lakar.json`) kecuali cacat nyata yang tercatat.
- R2 (parent R5; DESIGN.md §Ambang kontras): LC-04 menegakkan seluruh tabel Ambang kontras: ambang teks besar sama di DESIGN.md dan kode, stroke kontrol (`Input /`, `Radio /`, `Checkbox /`) dan ikon tanpa label ≥ 3:1, dan warning scrim untuk teks di atas foto/gradien/efek. Terbukti bila fixture tiap baris tabel lulus dan arsip bench tidak memberi positif palsu error.
- R3 (parent R11): kelima desain target golden set (A–E) dibangun ulang di Lakar dan menjadi tes regresi `layout_check`: 0 error, LC-17/18/19 = 0. Terbukti bila tes regresi memuat kelima dokumen dan Adam menyetujui PNG-nya.
- R4 (parent R7; Decision 2026-11-19): harness bench menjalankan dan menilai prompt A–E dengan runner, pembungkus, dan pengukuran waktu AD-13 yang sama, dengan rubrik v2.3 (golden B1: lebar 390, tinggi ≥ 844; D2: satu board panjang) yang di-snapshot sebelum putaran resmi. Terbukti bila `rubric-snapshot` mencatat v2.3 dan sha teks juri A–E, dan `round --dry-run` lulus untuk A–E.
- R5 (parent R6; Decision 2026-11-19): skill dipadatkan sebelum revisi apa pun tanpa menaikkan batas token `tests/skills.test.ts`, lalu direvisi untuk pola G1 (sidebar webapp sesuai DESIGN.md, form/checkout mobile, tabel + panel detail). Terbukti lewat run latihan dengan prompt non-A–E, dan tanpa rubrik/kriteria golden di skill (C7).
- R6 (parent R12): prompt D menghasilkan kartu kamar dengan foto relevan lewat rantai Unsplash → Wikimedia → Openverse (aset jarak jauh, AD-10). Terbukti di PNG putaran resmi D.
- R7 (parent R7, R9): baseline pen.dev C, D, E diukur (median 3 run, runner G0), lalu putaran resmi A–E memutuskan G1: ≥ 4/5 Setara atau lebih baik, ≥ 1 Lebih baik, nol emoji, waktu ≤ 1,5× median baseline. Terbukti oleh `bench/round-<n>.md` dengan Konfirmasi Adam.
- R8 (initiative Done when, `lakard`): rilis G1 berjalan di service `lakard` di VPS dan Claude Code memakainya lewat MCP. Terbukti oleh `status` lakard yang menunjukkan versi rilis G1 dan `tools/node26/verify.sh` lulus.

## Constraints

- C7, C8, C9 dan keputusan AD-13 dari initiative berlaku untuk setiap story. Setiap story diakhiri `tools/node26/verify.sh`. Restart lakard hanya lewat `systemctl --user restart lakard`.
- pen.dev hanya lewat MCP pencil (`pen-newdoc.sh` + `get_app_state`), `.pen` yang ada tidak ditimpa, pen-desktop di-restart setelah setiap seri, dan batas paket tidak diakali.
- Key Unsplash tidak pernah ditampilkan, dicatat, atau di-commit. Kuota demo 50 req/jam.

## Boundaries

- Milik G0: inti minimal, harness bench, baseline A/B, juri terkalibrasi, foto stok lokal (pencarian, impor, atribusi), dan revisi skill putaran perbaikan.
- Milik B: UI canvas.

## References

- parent — _bmad-output/initiative-lakar/initiative-lakar.md, Requirements
- architecture — _bmad-output/initiative-lakar/architecture-lakar-core/architecture-lakar-core.md (AD-8, AD-10, AD-12, §Deferred)

## Notes

- Waits on epic-g0-inti-minimal because: G0 harus lulus (C4), dan daemon, check, skill, serta bench dipakai ulang. Setelah putaran 1 gagal, G1 baru dimulai bila bench/round-2.md lolos dan dikonfirmasi Adam.
- Gambar AI di luar inisiatif (Boundaries inisiatif, D). Penyedia foto stok diputuskan di G0 story 1.18.
- Decision: 2026-11-18 — foto stok lokal pindah dari G1 ke G0 (keputusan Adam setelah putaran 1 gagal; bench/round-1.md §Evaluasi arah). G1 tetap memiliki bukti foto relevan di prompt D (R12).
- Decision: 2026-11-19 — masukan dari penutupan G0:
  - `webapp.md` sudah dibangun di G0 (story 1.24), jadi G1 cukup mengujinya di prompt dashboard.
  - Foto prompt D memakai rantai Unsplash → Wikimedia → Openverse. Foto Unsplash adalah aset jarak jauh, bukan aset lokal (AD-10).
  - Batas token skill hampir penuh: `landing.md` prosa 1500/1500 dan `core.md` 3967/4000. Setiap revisi skill di G1 harus diawali pemadatan teks (menghapus duplikasi core/polish/landing) tanpa menaikkan batas, dan dibuktikan lewat run latihan.
  - Batas paket pen.dev yang tercapai pada 2026-11-19 menghalangi run pen.dev baru (putaran A–E) sampai periode tagihan berikutnya atau sampai paket di-upgrade. Ini dicek sebelum G1 menjadwalkan putaran.
- Decision: 2026-11-19 — perubahan kriteria golden B1 (lebar 390, tinggi ≥ 844) dan D2 (pola dua board → satu board panjang) mengubah sha teks juri. Karena itu keduanya ditunda dan dikerjakan bersamaan sebagai rubrik v2.3 (snapshot `rubric-snapshot` + versi Lampiran B) sebelum putaran resmi berikutnya. Rubrik v2.2 tetap sah sampai saat itu. DESIGN.md (Lampiran A, pola mobile, skill per jenis layar) sudah disinkronkan pada 2026-11-19. Sisa ketidaksesuaian: tabel Ambang kontras (18,66px/600 vs kode 19px/700, stroke kontrol/ikon/scrim belum dicek), sidebar webapp 240 vs DESIGN.md 248, dan LC yang belum diterapkan (LC-03, 06–10, 13–17, 19, 21, 22), yang termasuk cakupan G1.
- Decision: 2026-11-19 — epic di-refine dari cakupan Adam (sesi G1): aturan LC sisa, golden set dibangun ulang, rubrik v2.3, sisa DESIGN.md, pemadatan skill, baseline C/D/E + putaran A–E, rilis lakard.
- Decision: 2026-11-19 — pen.dev terblokir batas paket (dicek lewat `get_app_state` 2026-11-19). Story yang butuh run pen.dev baru (revisi skill dengan prompt latihan baru, baseline C/D/E, putaran resmi) diurut paling belakang agar story lain tidak menunggu.
- Decision: 2026-11-19 — tracer bullet = story 1 (+2): jalur bench A–E dari prompt sampai keputusan G1, dibuktikan tanpa pen.dev lewat dry-run dan rejudge. Story pertama yang paling tidak pasti setelahnya: LC-04 lengkap (story 7, aturan gerbang).
- Decision: 2026-11-19 — refactor sweep (12) dan rilis (13) sengaja menunggu story pen.dev (10, 11) agar sweep mencakup revisi skill; konsekuensinya keduanya ikut tertahan batas paket pen.dev. Putaran resmi (14) diperlakukan sebagai verifikasi penutup epic.
- Decision: 2026-11-19 — golden set dibangun di dua story (8: A, B, D; 9: C, E + persetujuan Adam) karena lima desain terlalu besar untuk satu sesi.
- Decision: 2026-11-19 — Adam menyetujui breakdown 14 story ("setuju semua") beserta empat keputusan: (1) hash protokol bench per prompt, baseline A/B G0 tetap sah; (2) bila versi pen.dev atau Claude Code berubah, baseline A–E diukur ulang (story 11) dan dilaporkan dulu; (3) teks besar = ≥ 24px atau ≥ 18,66px dengan berat ≥ 700; (4) golden set Lakar di G1 hanya regresi `layout_check`, tidak masuk teks atau input juri.
- Decision: 2026-11-19 — plan_checkpoint dan done_checkpoint diputuskan orkestrator (Adam). Tetap berhenti untuk C9, status blocked, langkah hitl, dan konfirmasi putaran resmi.
- Decision: 2026-11-19 — Adam menambah story 15 (LC-02c luapan non-teks + LC-31 diperluas ke tabel/kartu di tepi board) setelah kartu KPI P8 polish-4 lolos layout_check meski grafik masuk padding kanan.
- Decision: 2026-11-19 — usulan fondasi komponen ala shadcn/ui (UI library) untuk revisi skill dibatalkan sepenuhnya oleh Adam, bukan ditunda; jangan diusulkan lagi tanpa permintaan Adam. Gantinya story 16: skill desain bawaan per domain dengan cakupan setara built-in design skills pen.dev, teks ditulis sendiri (C1). Bukti transkrip bench: agen pen.dev tidak memakai UI library maupun `get_style` di P7–P9 dan A/B.

