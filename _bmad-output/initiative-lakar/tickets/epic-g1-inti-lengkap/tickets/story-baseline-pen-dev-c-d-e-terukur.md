---
id: 11
type: story
title: "Baseline pen.dev C, D, E terukur"
parent: epic-g1-inti-lengkap
covers: [R7]
after: [1]
hitl: true
risk: medium
---

# Baseline pen.dev C, D, E terukur

## Description

Menjalankan pendev-baseline untuk C, D, E (3 run per prompt, median waktu dan biaya, runner dan pembungkus G0) ke bench/baseline-pendev.md|json, dengan dokumen baru lewat pen-newdoc.sh dan restart pen-desktop setelah seri; langkah Adam: memastikan paket pen.dev aktif kembali.

## Requirements

Verify: bench/baseline-pendev.md berisi 3 run dan median C, D, E (dan A/B bila diukur ulang) dengan versi model, Claude Code, dan pen.dev; md5 .pen yang ada tidak berubah; verify.sh lulus.

## References

- parent — _bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md

## Notes

- Menunggu batas paket pen.dev (cek get_app_state dulu).
- Anggaran: ≤ $12 untuk C/D/E (+ ≤ $8 bila A/B diukur ulang), maks 4 percobaan per prompt (protokol).
