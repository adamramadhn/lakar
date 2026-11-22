---
id: 7
type: story
title: "LC-04 lengkap dan ambang kontras selaras dengan DESIGN.md"
parent: epic-g1-inti-lengkap
covers: [R2]
after: [6]
hitl: false
risk: high
---

# LC-04 lengkap dan ambang kontras selaras dengan DESIGN.md

## Description

Menyamakan ambang teks besar di tabel Ambang kontras, baris LC-04, dan kode, menambah cek stroke kontrol (Input /, Radio /, Checkbox /) dan ikon tanpa label ≥ 3:1 serta warning scrim untuk teks di atas foto/gradien/efek, dan menghapus catatan 'belum dicek' di Lampiran A; LC-04 aturan gerbang, jadi positif palsu pada arsip bench dianggap cacat.

## Requirements

Verify: Fixture tiap baris tabel Ambang kontras lulus; pemindaian arsip bench tidak menambah error LC-04 kecuali cacat nyata yang dicatat; DESIGN.md dan kode memakai angka yang sama; verify.sh lulus.

## References

- parent — _bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md

## Notes

- Keputusan Adam 2026-11-19: teks besar = ≥ 24px, atau ≥ 18,66px dengan berat ≥ 700 (WCAG 14pt bold); DESIGN.md 600 → 700, kode 19 → 18,66.
