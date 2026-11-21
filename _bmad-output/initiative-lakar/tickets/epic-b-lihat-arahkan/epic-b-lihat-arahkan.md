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
- design — design/README.md dan design/lakar-ui.pen (eksplorasi visual UI B di pen.dev, 2026-11-21; masukan untuk `bmad-ux`, bukan spesifikasi final)

## Notes

- Waits on epic-g1-inti-lengkap because: G1 harus lulus (C4).
- Open question: spesifikasi UX canvas B belum ada. Run `bmad-ux` setelah G1.
- Note: 2026-11-21 — eksplorasi visual UI B sudah dibuat di pen.dev (`design/lakar-ui.pen`, ringkasan di `design/README.md`). Isinya mencakup Dashboard, Viewer (Activity, Inspect, Checks, History), state waiting/offline/error, Connections, komponen, token, dan spesifikasi motion untuk desktop, tablet, dan mobile, dark dan light. Ini memenuhi sebagian Done-when "UI didesain di pen.dev"; spesifikasi final tetap lewat `bmad-ux` setelah G1.
- Open question: konflik model interaksi. Description, Done-when, dan R10 menyebut "panel prompt" dan "Adam … memberi prompt". Eksplorasi desain 2026-11-21 memakai model viewer tanpa kotak prompt: prompt diberikan di harness terpisah (Claude Code, Codex, klien ACP lain), dan Lakar hanya menampilkan hasil, aktivitas tool call live, temuan `layout_check`, dan riwayat; seleksi di canvas tetap menjadi konteks agen. Menunggu keputusan Adam: pertahankan panel prompt, atau ubah R10 dan Done-when ke model viewer.
- Open question: celah API daemon yang dibutuhkan desain viewer (detail di `design/README.md` §Celah teknis): seleksi sebagai konteks agen (tool baru, mis. `get_selection`), stream event live per tool call beserta node target, identitas harness per sesi, riwayat versi dan Restore, format error `execute` yang ramah pengguna (AD-11), operasi file dari viewer (rename, delete, export PNG), dan health check daemon. Perlu dipetakan ke arsitektur sebelum epic B di-refine.
