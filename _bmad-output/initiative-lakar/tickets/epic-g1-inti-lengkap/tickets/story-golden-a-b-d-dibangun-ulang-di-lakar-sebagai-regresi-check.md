---
id: 8
type: story
title: "Golden A, B, D dibangun ulang di Lakar sebagai regresi check"
parent: epic-g1-inti-lengkap
covers: [R3]
after: [7]
hitl: false
risk: high
---

# Golden A, B, D dibangun ulang di Lakar sebagai regresi check

## Description

Membangun ulang desain target landing A dan mobile B dan D (D satu board panjang) lewat MCP Lakar sesuai kriteria golden-set.md, menyimpannya sebagai fixture regresi @lakar/check, dan memperbaiki aturan (bukan pengecualian per board) bila ada positif palsu; arsip pen.dev tidak dipakai (C6) dan isinya tidak masuk skill (C7).

## Requirements

Verify: Tes regresi memuat dokumen golden A, B, D dengan 0 error dan LC-17/18/19 = 0; PNG ada di design/golden-set-lakar/; verify.sh lulus.

## References

- parent — _bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md

## Notes

- Anggaran: sesi builder saja (tanpa claude -p); maks 3 putaran perbaikan per desain.
