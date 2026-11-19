---
type: epic
title: "G1: inti A lengkap lolos golden set"
parent: initiative-lakar
covers: [R5, R6, R7, R9, R11, R12]
after: [epic-g0-inti-minimal]
refined: false
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
