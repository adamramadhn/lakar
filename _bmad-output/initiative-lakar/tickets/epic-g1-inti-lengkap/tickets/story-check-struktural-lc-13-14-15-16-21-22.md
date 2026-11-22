---
id: 4
type: story
title: "Check struktural: LC-13, 14, 15, 16, 21, 22"
parent: epic-g1-inti-lengkap
covers: [R1]
after: []
hitl: false
risk: medium
---

# Check struktural: LC-13, 14, 15, 16, 21, 22

## Description

Menerapkan nama layer default (info), absolut di dalam flex tanpa Overlay, > 1 pustaka ikon UI, ikon digambar manual (error), pemeriksaan struktural murah LC-21, dan jumlah node berkonvensi LC-22 (info) di @lakar/check, dengan fixture positif dan negatif per aturan, batas 3 warning per aturan per board, dan daftar aturan berjalan di Lampiran A diperbarui.

## Requirements

Verify: pnpm --filter @lakar/check test lulus dengan fixture positif/negatif tiap aturan; pemindaian arsip bench/runs/**/*.lakar.json memberi 0 temuan LC-16 kecuali cacat nyata yang dicatat; verify.sh lulus.

## References

- parent — _bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md
