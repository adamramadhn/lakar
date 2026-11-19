---
id: 10
type: story
title: "Skill direvisi untuk pola G1 dan diuji dengan prompt latihan baru"
parent: epic-g1-inti-lengkap
covers: [R5, R6]
after: [1, 3, 7, 16]
hitl: true
risk: high
---

# Skill direvisi untuk pola G1 dan diuji dengan prompt latihan baru

## Description

Sesi baru (C7) merevisi skill yang sudah dipadatkan untuk pola form/checkout mobile (stepper, field error, radio-card, bilah aksi tetap), tabel + panel detail gelap, dan foto relevan per konteks, lalu mengujinya dengan seri latihan hold-out baru (prompt bukan A–E, sha beku, penjaga n-gram) melawan run pen.dev baru; langkah Adam: memastikan paket pen.dev aktif kembali sebelum seri dijalankan.

## Requirements

Verify: tests/skills.test.ts dan skills-c7 lulus tanpa menaikkan batas; seri latihan G1 lulus (setiap prompt Setara/Lebih baik, waktu ≤ 1,5× pen.dev, emoji 0, gate 0) dalam anggaran; verify.sh lulus.

## References

- parent — _bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md

## Notes

- Butuh run pen.dev baru; menunggu batas paket pen.dev.
- Anggaran: maks 3 iterasi, ≤ $30.
