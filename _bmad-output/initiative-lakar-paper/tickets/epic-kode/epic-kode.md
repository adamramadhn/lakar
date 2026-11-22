---
type: epic
title: "Desain dibawa ke kode dan token dibawa dari kode"
parent: initiative-lakar-paper
covers: [R5]
after: [epic-token-tema, epic-komponen]
refined: true
risk: high
---

# Desain dibawa ke kode dan token dibawa dari kode

## Description

Frame diekspor ke komponen React dengan Tailwind atau CSS idiomatik yang memakai token dan komponen, lalu dirender sama dengan canvas. Token diimpor dari CSS variables codebase. Ini menggantikan Copy as CSS/Tailwind per node yang sekarang.

## Outcome

Fatmuh membawa desain ke codebase tanpa menerjemahkan ulang secara manual.

## Done when

- Desain panel/dialog ekspor kode ada di pen dan disetujui.
- Komponen hasil ekspor dirender di browser sama dengan canvas, di bawah ambang selisih piksel yang ditetapkan epic.
- Token hasil ekspor sama dengan token di panel Theme, dan impor CSS variables membuat token yang sama.
- Fitur ini ada di installer desktop rilis.

## Boundaries

- Di luar: sinkron dua arah komponen kode dari codebase ke canvas.

## References

- parent — _bmad-output/initiative-lakar-paper/initiative-lakar-paper.md, Requirements R5; Constraints C1–C6
- design — design/lakar-ui.pen (terenkripsi, hanya lewat Pencil) dan design/README.md

## Notes

- Waits on epic-token-tema because: token untuk diekspor.
- Waits on epic-komponen because: komponen untuk diekspor.
- Decision: 2026-11-22 — story pertama epic ini adalah desain UI/UX/motion yang belum ada di `design/lakar-ui.pen` (hitl, disetujui Fatmuh). Story kode mengikuti desain itu lewat MCP pencil (C6).
- Decision: 2026-11-22 — epic dipecah menjadi 5 story (tickets/tickets.toml) atas delegasi Fatmuh.
