---
type: epic
title: "Celah fitur dari riset open-pencil ditutup"
parent: initiative-lakar-paper
covers: [R1, R2, R3, R5, R6]
after: []
refined: true
risk: medium
---

# Celah fitur dari riset open-pencil ditutup

## Description

Riset `research-open-pencil-features-for-lakar` (deepen 2026-11-23, inventaris 348 item) menemukan bahwa loop inti agen Lakar sudah setara open-pencil. Sisa celahnya kecil-kecil: metadata tool MCP, satu aturan `layout_check`, beberapa aturan skill, ergonomi editor, flex wrap, Copy as PNG, impor dari URL, token DTCG, dan updater desktop. Epic ini membangun semua butir berlabel Adopsi dari bagian 6 laporan itu.

## Outcome

Agen melakukan lebih sedikit kesalahan layout dan bisa dijalankan dengan izin baca otomatis. Fatmuh mengedit dengan snapping dan pengukur jarak, membawa halaman web dan token DTCG ke Lakar, dan menerima update aplikasi tanpa memasang ulang installer.

## Done when

- Desain semua UI baru epic ini ada di `design/lakar-ui.pen` (dark dan light) dan disetujui.
- Setiap tool MCP punya anotasi `readOnlyHint`/`destructiveHint` yang sesuai efeknya.
- `layout_check` melaporkan saudara yang tumpang-tindih tanpa sengaja dan teks yang meluap dari frame, dan golden set tetap 0 error.
- Skill memuat aturan pakai ulang komponen dan aturan verifikasi baru tanpa melewati batas ukuran skill.
- Viewer punya snapping dengan smart guide, pengukur jarak Alt+hover, serta zoom 100% dan zoom ke seleksi.
- Frame mendukung flex wrap di skema, render, codegen, dan panel Design.
- Copy as PNG, impor halaman dari URL, dan impor/ekspor token DTCG berjalan dari viewer dan MCP.
- Aplikasi desktop memeriksa dan memasang update dari GitHub Release yang ditandatangani.
- Semua fitur di atas ada di installer desktop rilis.

## Boundaries

- Di luar: butir berlabel Pertimbangkan dan Lewati di laporan riset (komentar di layer, rich text, behaviours, formula variabel, ekspor PDF/SVG, dan lainnya).
- Di luar: mengubah bentuk respons, pesan error, atau perilaku route dan tool lama. Hanya field opsional dan tool/route baru (C5, AGENTS.md).

## References

- parent — _bmad-output/initiative-lakar-paper/initiative-lakar-paper.md, Requirements R1–R3, R5, R6; Constraints C1–C6
- research — _bmad-output/initiative-lakar-paper/research-open-pencil-features-for-lakar/research-open-pencil-features-for-lakar.md, bagian 4 dan 6 (butir 6, 9, 14–21)
- inventory — _bmad-output/initiative-lakar-paper/research-open-pencil-features-for-lakar/inventaris-lengkap.md
- design — design/lakar-ui.pen (terenkripsi, hanya lewat Pencil) dan design/README.md

## Notes

- Decision: 2026-11-23 — epic dibuat dan dipecah menjadi 10 story atas delegasi Fatmuh ("kamu yang lakuin semua, saya terima jadi"). Persetujuan desain story 1 juga didelegasikan.
- Decision: 2026-11-23 — urutan: story tanpa UI (2, 3, 4) berjalan paralel dengan desain (1); story ber-UI (5–10) menunggu desain.
- Decision: 2026-11-23 — kebijakan jaringan impor URL (story 8): daemon mengambil halaman hanya atas permintaan eksplisit (aksi pengguna atau panggilan tool agen), hanya `http`/`https`, menolak alamat loopback, link-local, dan jaringan privat (anti-SSRF), tidak menjalankan skrip halaman, dengan batas waktu dan ukuran. Importer HTML yang ada tetap tanpa jaringan untuk paste biasa.
- Decision: 2026-11-23 — kunci tanda tangan updater (story 10) dibuat oleh agen, disimpan sebagai secret GitHub repo, dan salinan cadangannya disimpan di mesin Fatmuh; kuncinya tidak pernah dicetak ke log atau di-commit.
