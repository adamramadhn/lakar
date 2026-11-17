---
type: epic
title: "G0: inti A minimal lolos gerbang A dan B"
parent: initiative-lakar
covers: [R1, R2, R3, R4, R5, R6, R7, R8]
sources: []
companions:
  - _bmad-output/initiative-lakar/architecture-lakar-core/architecture-lakar-core.md
  - _bmad-output/initiative-lakar/ux-lakar/DESIGN.md
  - _bmad-output/initiative-lakar/ux-lakar/golden-set.md
after: []
refined: true
risk: high
---

# G0: inti A minimal lolos gerbang A dan B

## Description

Epic ini membangun inti A minimal sesuai spine arsitektur: schema, core, render, exec, icons, check (subset G0), daemon, mcp, skill, dan harness bench. Hasilnya Claude Code bisa mendesain prompt A (landing) dan B (mobile) di Lakar. Satu putaran benchmark lalu memutuskan G0 terhadap pen.dev. Epic dibuka dengan upgrade mesin ke Node 26 LTS.

## Outcome

Adam tahu apakah arah editor sendiri layak: prompt A dan B setara atau lebih baik dari pen.dev, nol emoji, dan waktu ≤ 1,5×, atau arah dievaluasi ulang.

## Requirements

- R1 (parent R1): agen membuat dan mengubah desain di dokumen `<slug>.lakar.json` lewat `execute` di MCP. Mutasi hanya berlangsung lewat transaksi operasi atomik dengan riwayat. Dokumen tervalidasi skema Lakar berversi (AD-1–AD-4, AD-7, AD-11, AD-15–AD-17).
- R2 (parent R2): node `frame` mendukung layout `none | row | column`, `gap`, `padding`, `align`, `justify`, dan sizing `fixed | hug | fill` + min/max. Skema menolak `x/y` pada node flow (AD-5, AD-15).
- R3 (parent R3, bagian G0: render dan PNG; canvas B memakainya di epic B): satu modul render memetakan dokumen yang sudah di-resolve ke DOM. Screenshot dan ekspor PNG (skala 1, maks 2) untuk board atau node berjalan lewat pool Chromium hangat. Font hilang menghasilkan `FONT_MISSING` (AD-5, AD-6, AD-10, AD-18).
- R4 (parent R4): node `icon` (Lucide, Simple Icons) memakai nama kanonik. `icon_search` mengembalikan hasil, dan nama tak dikenal menghasilkan `ICON_UNKNOWN` dengan 3 saran (AD-9).
- R5 (parent R5, bagian G0): aturan LC-01a, LC-01b, LC-02a, LC-05, LC-12, dan LC-20 berjalan otomatis setiap `execute` dan lewat tool `layout_check`, dengan bentuk temuan AD-8. Aturan lain menyusul di G1.
- R6 (parent R6, bagian G0): `read_skill` menyajikan `core.md`, `landing.md`, `mobile.md`, `icons.md`, dan `api.md` (dihasilkan dari `api.ts`). Contoh di skill dites terhadap API. `webapp.md` menyusul di G1 (AD-12).
- R7 (parent R7, bagian G0): harness bench menjalankan prompt A dan B di Lakar dan pen.dev sesuai golden-set §Prosedur. Isinya baseline pen.dev median 3 run, PNG skala 1, strip mobile, juri 3× buta, dan laporan putaran (AD-13).
- R8 (parent R8): keputusan G0 tercatat di `bench/round-<n>.md` dan sudah dikonfirmasi Adam.
- R9 (architecture §Stack, §Deployment): `lakard` berjalan di Node 26 LTS sebagai systemd user service yang bind ke 127.0.0.1. Rilis memakai `pnpm build` dan instal chromium-headless-shell.

## Constraints

- C1, C2, C3, C5, C6, C7, dan C8 dari inisiatif berlaku penuh.
- C4: kalau G0 gagal, epic G1 tidak dimulai sampai arah dievaluasi.
- Stack mengikuti architecture §Stack (versi terpin). TypeScript 7 dipakai tanpa alat yang butuh API TS programatik.

## Done when

- Node 26 LTS aktif di mesin, dan `pnpm build` + `vitest` lulus untuk semua paket.
- Dari sesi Claude Code baru, prompt A dan B menghasilkan board di Lakar dengan PNG, dan `layout_check` G0 menghasilkan 0 error gerbang.
- `lakard` berjalan sebagai systemd user service dan `status` melaporkan versi, pool, dan font hilang.
- `bench/round-1.md` berisi baseline pen.dev (median 3 run), hasil Lakar, skor juri, dan keputusan A dan B, sudah dikonfirmasi Adam.

## Boundaries

- Milik G1: LC-02b, LC-03, LC-04, LC-06–LC-11, LC-13–LC-19, LC-21, LC-22, `webapp.md`, foto stok, prompt C/D/E, dan desain target golden set di Lakar.
- Milik B: UI canvas, WebSocket progres, dan seleksi.
- Must not change: modul render tetap bisa dimuat di browser biasa tanpa API Node (AD-6), karena epic B memakainya.
- Must not change: kontrak respons `{ok, data | error}` dan enum kode error (AD-11) yang nanti dipakai G1 dan B.

## References

- parent — _bmad-output/initiative-lakar/initiative-lakar.md, Requirements
- architecture — _bmad-output/initiative-lakar/architecture-lakar-core/architecture-lakar-core.md (AD-1–AD-18, §Stack, §Structural Seed, §Deployment)
- design — _bmad-output/initiative-lakar/ux-lakar/DESIGN.md (§Turunan, §Proses anti-slop, Lampiran A dan B)
- design — _bmad-output/initiative-lakar/ux-lakar/golden-set.md (prompt A dan B, §Prosedur)

## Notes

- Decision: 2026-11-17 — tracer bullet adalah story 3 (Claude Code → MCP → `execute` → core → render → PNG). Upgrade Node (1) dan scaffold (2) mendahuluinya: Node sesuai arahan Adam, dan scaffold dipisah karena tracer sudah berisiko tinggi.
- Decision: 2026-11-17 — story kedua setelah tracer yang paling tidak pasti adalah baseline waktu pen.dev (story 4). Ambang 1,5× bergantung pada baseline ini, dan baseline A sekarang hanya 1 run.
- Decision: 2026-11-17 — epic G0 di-refine dari baris inisiatif + spine arsitektur tanpa run UX/arsitektur tambahan, karena spine sudah final untuk G0.
- Decision: 2026-11-17 — story 9 menunggu 8, dan story 11 menunggu 10. Alasannya bukan kebutuhan fungsi: pasangan itu sama-sama mengubah `packages/daemon` (aset/font vs sesi/store, ikon vs pipeline check), jadi diurutkan agar tidak bentrok.
- Decision: 2026-11-17 — penulisan file dokumen dan riwayat ada di daemon (story 9), bukan di core, sesuai spine (core tanpa IO).
- Decision: 2026-11-17 — putaran G0 hanya berisi prompt A dan B (forge §Kriteria sukses G0). Aturan "satu putaran = kelima prompt" berlaku mulai G1.
- Decision: 2026-11-17 — gerbang G0 tidak menghitung R3/R7, karena aturan sumbernya (LC-03/06/07/11/13/14/17/18/21) milik G1. G0 memakai error gerbang, ukuran board, dan waktu.
- Decision: 2026-11-17 — waktu diukur sesuai AD-13 (lihat Notes inisiatif). Story 4 tidak lagi tertahan.
- Decision: 2026-11-17 — epic G0 tetap satu dengan 16 story, tidak dipecah menjadi inti dan bench. Keduanya baru bernilai bersama untuk memutuskan gerbang. Keputusan diserahkan Adam ke Sofia.
