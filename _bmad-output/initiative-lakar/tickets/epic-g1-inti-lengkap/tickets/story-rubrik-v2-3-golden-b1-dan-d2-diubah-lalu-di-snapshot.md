---
id: 2
type: story
title: "Rubrik v2.3: golden B1 dan D2 diubah lalu di-snapshot"
parent: epic-g1-inti-lengkap
covers: [R4]
after: [1]
hitl: false
risk: medium
---

# Rubrik v2.3: golden B1 dan D2 diubah lalu di-snapshot

## Description

Mengubah golden-set.md B1 (lebar 390, tinggi ≥ 844) dan D2 (satu board panjang, bukan dua board) bersamaan, menaikkan baris Versi rubrik Lampiran B ke 2.3, memperluas rubric-snapshot ke teks juri A–E, lalu menjalankan rejudge strip round-2 A/B dengan v2.3 sebagai hold-out; rubrik v2.2 tetap sah sampai snapshot ini.

## Requirements

Verify: bench/rubric/rubric.json = 2.3 dengan sha teks juri A–E dan bench/rubric/v2.3/ tercatat; round --dry-run A–E tanpa masalah pembekuan juri; bench/rejudge-r2-v2-3.md ada; verify.sh lulus.

## References

- parent — _bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md

## Notes

- Anggaran: rejudge ≤ $5, maks 2 kali.
