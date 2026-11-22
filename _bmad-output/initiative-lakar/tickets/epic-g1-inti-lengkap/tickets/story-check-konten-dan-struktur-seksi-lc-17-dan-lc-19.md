---
id: 6
type: story
title: "Check konten dan struktur seksi: LC-17 dan LC-19"
parent: epic-g1-inti-lengkap
covers: [R1]
after: [5]
hitl: false
risk: medium
---

# Check konten dan struktur seksi: LC-17 dan LC-19

## Description

Menerapkan struktur seksi mirip (Jaccard multiset tipe + ukuran font ≥ 0,9 antarpasangan Seksi /) dan frasa terlarang per bahasa per kata utuh dari daftar DESIGN.md (kecuali Input / dan Label); daftar aturan berjalan di Lampiran A diperbarui.

## Requirements

Verify: pnpm --filter @lakar/check test lulus dengan fixture positif/negatif; pemindaian arsip bench dilaporkan; verify.sh lulus.

## References

- parent — _bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md
