---
id: 13
type: story
title: "Rilis G1 berjalan di lakard"
parent: epic-g1-inti-lengkap
covers: [R8]
after: [12]
hitl: false
risk: low
---

# Rilis G1 berjalan di lakard

## Description

Membekukan versi paket G1, build dist, restart lakard lewat systemctl --user, dan membuktikan status/versi, pool render, font, dan penyedia foto unsplash siap untuk putaran resmi, termasuk dari Claude Code lewat MCP.

## Requirements

Verify: Tool MCP status dari sesi Claude Code baru menunjukkan versi G1, schemaVersion = bench, fonts.missing kosong, photos = unsplash; tests/release.test.ts lulus; round --dry-run A–E lolos officialFreezeProblems; verify.sh lulus.

## References

- parent — _bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md
