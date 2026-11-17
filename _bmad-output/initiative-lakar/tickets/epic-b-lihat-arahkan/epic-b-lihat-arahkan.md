---
type: epic
title: "B: Adam melihat dan mengarahkan agen dari canvas"
parent: initiative-lakar
covers: [R3, R10]
after: [epic-g1-inti-lengkap]
refined: false
risk: medium
---

# B: Adam melihat dan mengarahkan agen dari canvas

## Description

Epic ini membangun canvas web Lakar yang merender dokumen dengan modul render yang sama (AD-6). Fiturnya pan/zoom, seleksi sebagai konteks agen, panel prompt, progres live lewat WebSocket, dan riwayat. Epic dimulai setelah G1 lulus.

## Outcome

Adam bisa melihat desain tumbuh dan mengarahkan agen dengan memilih bagian di canvas, tanpa membaca JSON atau PNG terpisah.

## Done when

- Adam memilih node di canvas, memberi prompt, lalu melihat perubahan muncul live dan tercatat di riwayat.
- Canvas dan PNG benchmark dirender oleh modul render yang sama, tanpa selisih teks/font.
- UI didesain di pen.dev (MCP pencil, dokumen baru) dan dikodekan setelah `/baseline-ui`.
- UI berjalan dari service `lakard` di VPS.

## Boundaries

- Di luar: edit manual (C) dan komponen/variabel/ekspor kode (D).
- Milik G0/G1: daemon API, render, dan check.

## References

- parent — _bmad-output/initiative-lakar/initiative-lakar.md, Requirements
- architecture — _bmad-output/initiative-lakar/architecture-lakar-core/architecture-lakar-core.md (AD-1, AD-4 `baseRev`, AD-6, AD-14, AD-17, §Deferred UI B)

## Notes

- Waits on epic-g1-inti-lengkap because: G1 harus lulus (C4).
- Open question: spesifikasi UX canvas B belum ada. Run `bmad-ux` setelah G1.
