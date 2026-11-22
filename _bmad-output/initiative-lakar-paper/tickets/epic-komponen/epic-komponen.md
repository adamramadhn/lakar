---
type: epic
title: "Komponen dengan instance, override, props, dan slot"
parent: initiative-lakar-paper
covers: [R4]
after: [epic-token-tema]
refined: true
risk: medium
---

# Komponen dengan instance, override, props, dan slot

## Description

Komponen master dan instance, dengan override, props, dan slot. Perubahan master menyebar ke instance, dan komponen bisa memakai token.

## Outcome

Fatmuh membangun sistem desain yang bisa dipakai ulang, dan agen memakainya.

## Done when

- Desain panel komponen, props, dan slot ada di pen dan disetujui.
- Mengubah master memperbarui semua instance tanpa menimpa override.
- Agen membuat dan memakai instance komponen lewat MCP.
- Fitur ini ada di installer desktop rilis.

## Boundaries

- Milik epic 6: komponen di ekspor kode. Komponen kode dari codebase di luar epic ini.

## References

- parent — _bmad-output/initiative-lakar-paper/initiative-lakar-paper.md, Requirements R4; Constraints C1–C6
- design — design/lakar-ui.pen (terenkripsi, hanya lewat Pencil) dan design/README.md

## Notes

- Waits on epic-token-tema because: token yang dipakai komponen.
- Decision: 2026-11-22 — story pertama epic ini adalah desain UI/UX/motion yang belum ada di `design/lakar-ui.pen` (hitl, disetujui Fatmuh). Story kode mengikuti desain itu lewat MCP pencil (C6).
- Decision: 2026-11-22 — epic dipecah menjadi 5 story (tickets/tickets.toml) atas delegasi Fatmuh.
