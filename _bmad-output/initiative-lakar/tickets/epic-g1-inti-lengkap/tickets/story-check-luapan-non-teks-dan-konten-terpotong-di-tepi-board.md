---
id: 15
type: story
title: "Check luapan non-teks dan konten terpotong di tepi board"
parent: epic-g1-inti-lengkap
covers: [R1]
after: [4]
hitl: false
risk: high
---

# Check luapan non-teks dan konten terpotong di tepi board

## Description

Menambah LC-02c (error · gerbang): anak flow non-teks (frame, rect, ellipse, path, icon, gambar) melewati content box induk ber-fill/stroke > 1px di sisi mana pun, dengan pengecualian setara LC-02b; dan memperluas LC-31 dari mockup hero ke tabel dan kartu yang terpotong rata di tepi bawah board atau seksi; Lampiran A diperbarui.

## Requirements

Verify: pnpm --filter @lakar/check test lulus dengan fixture positif/negatif, termasuk kartu KPI P8 polish-4 (batang mini masuk padding kanan) dan tabel P8 yang terpotong di tepi board sebagai positif; pemindaian arsip bench memberi 0 positif palsu error (cacat nyata dicatat); verify.sh lulus.

## References

- parent — _bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md

## Notes

- Permintaan Adam 2026-11-19 setelah melihat kartu KPI P8 polish-4 (spacing kanan ±6px vs kiri 24px) yang lolos layout_check.
