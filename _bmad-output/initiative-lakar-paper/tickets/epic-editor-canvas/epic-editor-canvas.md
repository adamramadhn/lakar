---
type: epic
title: "Pengguna mengedit desain langsung di canvas"
parent: initiative-lakar-paper
covers: [R1]
after: [epic-model-dokumen]
refined: false
risk: high
---

# Pengguna mengedit desain langsung di canvas

## Description

Editor canvas penuh: pilih dan multi-select, geser, ubah ukuran, edit teks inline, group, duplikat, hapus, align, undo/redo, shortcut, serta panel properti yang bisa diedit (fill, stroke, radius, efek, tipografi, auto-layout flex/grid). Inspect baca-saja yang sekarang berubah menjadi panel properti.

## Outcome

Fatmuh bisa membuat dan merapikan desain sendiri tanpa agen, seperti di editor desain profesional.

## Done when

- Desain panel properti, handle seleksi, dan state editor ada di `design/lakar-ui.pen` dan disetujui Fatmuh.
- Satu landing page lengkap dibuat dari kosong tanpa agen, lalu diekspor PNG.
- Setiap edit manual tercatat di History dan bisa di-undo/redo.
- Fitur ini ada di installer desktop rilis.

## Boundaries

- Milik epic 4: token. Milik epic 5: komponen. Milik epic 7: pen tool dan paste.
- Milik epic 3: sinkron live dengan agen.

## References

- parent — _bmad-output/initiative-lakar-paper/initiative-lakar-paper.md, Requirements R1; Constraints C1–C6
- design — design/lakar-ui.pen (terenkripsi, hanya lewat Pencil) dan design/README.md

## Notes

- Waits on epic-model-dokumen because: keputusan model dokumen dan migrasi schemaVersion.
- Decision: 2026-11-22 — story pertama epic ini adalah desain UI/UX/motion yang belum ada di `design/lakar-ui.pen` (hitl, disetujui Fatmuh). Story kode mengikuti desain itu lewat MCP pencil (C6).
