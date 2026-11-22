---
type: epic
title: "Agen dan manusia bekerja di canvas yang sama"
parent: initiative-lakar-paper
covers: [R2]
after: [epic-editor-canvas]
refined: false
risk: medium
---

# Agen dan manusia bekerja di canvas yang sama

## Description

Agen di harness membaca seleksi pengguna, melihat perubahan manual, dan menulis ke dokumen yang sama, dengan perubahan tampil live di kedua sisi. Termasuk alur seperti membuat varian responsif dari frame yang dipilih dan cek konsistensi. Dibangun di atas `get_selection` dari initiative-lakar story 3.1.

## Outcome

Fatmuh bisa memilih bagian desain lalu meminta agen mengerjakan pekerjaan berulang di atasnya, dan melihat hasilnya langsung.

## Done when

- Pengguna memilih frame, meminta varian responsif di harness, dan hasilnya muncul live di canvas serta tercatat di History.
- Edit manual yang terjadi saat agen bekerja tidak hilang (konflik `baseRev` ditangani).
- Desain state baru (mis. agen membaca seleksi) ada di pen sebelum dikodekan.
- Fitur ini ada di installer desktop rilis.

## Boundaries

- Milik initiative-lakar story 3.1: tool `get_selection` dasar.

## References

- parent — _bmad-output/initiative-lakar-paper/initiative-lakar-paper.md, Requirements R2; Constraints C1–C6
- design — design/lakar-ui.pen (terenkripsi, hanya lewat Pencil) dan design/README.md
- prasyarat — _bmad-output/initiative-lakar/tickets/epic-b-lihat-arahkan/tickets/tickets.toml, entry 1 (`get_selection`)

## Notes

- Waits on epic-editor-canvas because: seleksi, edit manual, dan History editor.
- Waits on initiative-lakar story 3.1 because: tool `get_selection` dasar dibangun di sana.
- Decision: 2026-11-22 — story pertama epic ini adalah desain UI/UX/motion yang belum ada di `design/lakar-ui.pen` (hitl, disetujui Fatmuh). Story kode mengikuti desain itu lewat MCP pencil (C6).
