---
type: epic
title: "Paste HTML/SVG dan edit vektor"
parent: initiative-lakar-paper
covers: [R6, R7]
after: [epic-editor-canvas]
refined: false
risk: medium
---

# Paste HTML/SVG dan edit vektor

## Description

HTML dan SVG yang di-paste menjadi layer yang bisa diedit. Pen tool dan edit titik path vektor dengan atribut SVG yang terjaga.

## Outcome

Fatmuh membawa potongan desain yang sudah ada dan menggambar bentuk sendiri di canvas.

## Done when

- Desain pen tool dan edit titik ada di pen dan disetujui.
- Potongan HTML dan SVG contoh menjadi layer dengan struktur dan gaya terjaga.
- Ikon SVG diimpor, diedit titiknya, lalu diekspor kembali tanpa kehilangan atribut.
- Fitur ini ada di installer desktop rilis.

## Boundaries

- Di luar: paste dari Figma dan ekstensi Snapshot.

## References

- parent — _bmad-output/initiative-lakar-paper/initiative-lakar-paper.md, Requirements R6, R7; Constraints C1–C6
- design — design/lakar-ui.pen (terenkripsi, hanya lewat Pencil) dan design/README.md

## Notes

- Waits on epic-editor-canvas because: editor canvas dan panel properti.
- Decision: 2026-11-22 — story pertama epic ini adalah desain UI/UX/motion yang belum ada di `design/lakar-ui.pen` (hitl, disetujui Fatmuh). Story kode mengikuti desain itu lewat MCP pencil (C6).
