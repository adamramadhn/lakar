---
id: 1
type: story
title: "Harness bench menjalankan dan memutuskan A–E"
parent: epic-g1-inti-lengkap
covers: [R4, R7]
after: []
hitl: false
risk: high
---

# Harness bench menjalankan dan memutuskan A–E

## Description

Memperluas bench dari A/B ke A–E: PromptId, prompts.json/protocol.json, penjaga C7, aturan ukuran mengikat per prompt (C/E app persis, D mobile lebar 390 tinggi ≥ 844), pendev-baseline per prompt, dan decideG1 (≥ 4/5 Setara/Lebih baik, ≥ 1 Lebih baik, nol emoji, waktu ≤ 1,5× median baseline); kecocokan baseline A/B G0 dengan protokol baru ditangani sesuai keputusan Adam (hash protokol per prompt atau ukur ulang A/B).

## Requirements

Verify: pnpm --filter @lakar/bench test lulus termasuk decideG1 dan aturan ukuran C/D/E; round --dry-run dan pendev-baseline --dry-run mencetak rencana A–E tanpa masalah pembekuan selain teks juri C–E yang belum di-snapshot; verify.sh lulus.

## References

- parent — _bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md

## Notes

- Keputusan Adam 2026-11-19: hash protokol per prompt (pembungkus + config + teks prompt itu) agar baseline A/B G0 tetap sah; bila versi pen.dev atau Claude Code berubah, baseline A–E diukur ulang di story 11.
