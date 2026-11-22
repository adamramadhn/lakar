---
type: epic
title: "Model dokumen Lakar siap untuk editor, token, komponen, dan kode"
parent: initiative-lakar-paper
covers: []
after: []
refined: false
risk: high
---

# Model dokumen Lakar siap untuk editor, token, komponen, dan kode

## Description

Keputusan arsitektur tentang model dokumen: tetap skema JSON Lakar yang diperluas, atau bergeser ke HTML/CSS-native. Juga cara skema menampung token, komponen/instance/slot, grid, path vektor, dan ekspor kode, dengan migrasi `schemaVersion` dari dokumen yang ada.

## Outcome

Semua epic sesudahnya membangun di atas satu model dokumen yang sudah diputuskan, tanpa mengubah dasar di tengah jalan.

## Done when

- Spine arsitektur (`bmad-architecture`) mencatat keputusan model dokumen, skema token/komponen/vektor, dan strategi ekspor kode.
- Dokumen lama bermigrasi ke `schemaVersion` baru, dibuktikan dengan tes migrasi atas arsip dokumen yang ada (termasuk dokumen bench lama).
- Route dan tool MCP lama tetap lolos tesnya di CI Linux (C5).

## Boundaries

- Di luar: UI. Epic ini tidak menambah layar.
- Milik epic 2–7: implementasi fitur di atas model ini.

## References

- parent — _bmad-output/initiative-lakar-paper/initiative-lakar-paper.md, Requirements; Constraints C1–C6
- design — design/lakar-ui.pen (terenkripsi, hanya lewat Pencil) dan design/README.md
- architecture — tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md (companion yang diadopsi; AD-1 sampai AD-17, ID stabil)

## Notes

- Decision: 2026-11-22 — epic pembuka. Open question model dokumen inisiatif dijawab di sini lewat `bmad-architecture`, dan epic 2–8 menunggu keputusannya.
- Decision: 2026-11-22 — spine architecture-model-dokumen disetujui Fatmuh.
  - Model dokumen: JSON Lakar bertipe dengan semantik CSS (AD-1).
  - Route dan tool lama: kompatibilitas mundur menggantikan pembekuan (AD-4). Untuk Done when, "lolos tesnya" berarti tes route dan tool lama tetap hijau, dan asersi teks pesan error boleh diperbarui di PR yang sama.
- Open question: korpus dokumen v1/v2, termasuk dokumen bench lama, belum ada di repo (data dir lokal dan VPS). Story migrasi pertama mengumpulkan dan menyamarkannya ke `tests/fixtures/docs/` (AD-3).
