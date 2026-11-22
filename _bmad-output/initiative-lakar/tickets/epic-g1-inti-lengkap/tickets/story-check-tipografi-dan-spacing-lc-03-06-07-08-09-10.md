---
id: 5
type: story
title: "Check tipografi dan spacing: LC-03, 06, 07, 08, 09, 10"
parent: epic-g1-inti-lengkap
covers: [R1]
after: [4]
hitl: false
risk: medium
---

# Check tipografi dan spacing: LC-03, 06, 07, 08, 09, 10

## Description

Menerapkan teks tetap berisiko meluber, paragraf di bawah minimum, spacing di luar himpunan, font di luar skala atau triple tak cocok, > 2 keluarga font, dan target sentuh < 44 di board mobile, membaca token dan skala dari sumber yang sama dengan skill; daftar aturan berjalan di Lampiran A diperbarui.

## Requirements

Verify: pnpm --filter @lakar/check test lulus dengan fixture positif/negatif tiap aturan; laporan pemindaian arsip bench mencatat jumlah warning per aturan beserta contohnya; verify.sh lulus.

## References

- parent — _bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md
