---
type: epic
title: "Token dan tema dikelola dan dipakai di seluruh desain"
parent: initiative-lakar-paper
covers: [R3]
after: [epic-editor-canvas]
refined: true
risk: medium
---

# Token dan tema dikelola dan dipakai di seluruh desain

## Description

Panel Theme untuk token warna, radius, spacing, container, breakpoint, font family, font weight, font size, line height, dan letter spacing, beserta mode tema. Token dipilih dan dilepas dari panel properti. Agen bisa membuat token dari desain atau dari CSS variables.

## Outcome

Fatmuh menjaga desain konsisten: mengubah satu nilai mengubah semua pemakainya.

## Done when

- Desain panel Theme dan pemilih token ada di pen dan disetujui.
- Mengubah satu token mengubah semua node pemakainya di canvas.
- Mode tema (mis. dark/light) mengganti nilai token di canvas.
- Agen membuat token dari CSS variables lewat MCP.
- Fitur ini ada di installer desktop rilis.

## Boundaries

- Milik epic 6: token di ekspor kode.

## References

- parent — _bmad-output/initiative-lakar-paper/initiative-lakar-paper.md, Requirements R3; Constraints C1–C6
- design — design/lakar-ui.pen (terenkripsi, hanya lewat Pencil) dan design/README.md

## Notes

- Waits on epic-editor-canvas because: panel properti yang bisa diedit.
- Decision: 2026-11-22 — story pertama epic ini adalah desain UI/UX/motion yang belum ada di `design/lakar-ui.pen` (hitl, disetujui Fatmuh). Story kode mengikuti desain itu lewat MCP pencil (C6).
- Decision: 2026-11-22 — epic dipecah menjadi 4 story (tickets/tickets.toml) atas delegasi Fatmuh.
