---
id: 3
type: story
title: "Skill dipadatkan dan sidebar webapp selaras DESIGN.md"
parent: epic-g1-inti-lengkap
covers: [R5]
after: [2]
hitl: false
risk: medium
---

# Skill dipadatkan dan sidebar webapp selaras DESIGN.md

## Description

Sesi baru (C7) memadatkan core, polish, landing, mobile, dan webapp (menghapus duplikasi lintas skill, tanpa mengubah perilaku yang diajarkan) tanpa mengubah batas di tests/skills.test.ts, lalu mengubah sidebar webapp 240 → 248 sesuai DESIGN.md; dibuktikan dengan seri latihan polish P7–P9 memakai ulang run pen.dev (--reuse-pendev, tanpa run pen.dev baru).

## Requirements

Verify: tests/skills.test.ts dan tests/skills-c7.test.ts lulus dengan sisa ruang token tercatat per skill; bench/polish-<k>.md menunjukkan P7–P9 tetap Setara/Lebih baik dengan gerbang waktu/emoji/gate; verify.sh lulus.

## References

- parent — _bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md

## Notes

- Anggaran: maks 2 iterasi seri polish, ≤ $12 (sisa anggaran seri $12,16).
