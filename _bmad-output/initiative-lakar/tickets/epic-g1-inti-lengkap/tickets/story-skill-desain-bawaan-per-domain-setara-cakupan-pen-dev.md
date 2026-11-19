---
id: 16
type: story
title: "Skill desain bawaan per domain setara cakupan pen.dev"
parent: epic-g1-inti-lengkap
covers: [R5]
after: [3, 7]
hitl: true
risk: high
---

# Skill desain bawaan per domain setara cakupan pen.dev

## Description

Sesi baru (C7) menyusun skill desain bawaan Lakar per domain dengan cakupan setara daftar built-in design skills pen.dev (aksesibilitas, warna, interface, layout, tipografi, UI, penulisan, dan review antarmuka), ditulis sendiri dari DESIGN.md dan sumber publik (C1, tanpa membaca atau menyalin isi skill pen.dev), dipasang lewat read_skill dengan batas token per skill dan aturan muat yang menjaga waktu run tetap ≤ 1,5× pen.dev.

## Requirements

Verify: read_skill mengembalikan skill domain baru; tests/skills.test.ts (dengan batas untuk skill baru) dan skills-c7 lulus; seri latihan dengan run pen.dev yang dipakai ulang tidak turun dari polish-4 dan waktu Lakar tetap ≤ 1,5× pen.dev; verify.sh lulus.

## References

- parent — _bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md

## Notes

- Arahan Adam 2026-11-19: fokus ke built-in design skills, samakan dengan yang ada di pen.dev; fondasi UI library (shadcn/ui) dibatalkan.
- Anggaran: maks 2 iterasi latihan, ≤ $12.
- Arahan Adam 2026-11-19 (menyetujui usulan orkestrator, dari cacat PNG Lakar, bukan dari rubrik/golden): (1) disiplin geometri sebelum menggambar: hitung lebar konten − gap sebelum elemen lebar tetap sebaris, visual samping fill + maks, padding bawah = atas, warning spacing ikut dibereskan; (3) karakter tipografi landing: pasangan font display + teks per nada brief, satu seksi kontras dan satu momen angka besar, tanpa ruang kosong mati; (4) review diri: screenshot ulang area padat skala 2 + 6–8 pertanyaan tetap; (6) copy: angka saling konsisten, nama/lokasi Indonesia wajar, tanpa frasa generik.
- Arahan Adam 2026-11-19: Adam menilai cepat PNG setiap iterasi latihan (Setara/Kalah/Lebih baik per prompt); bila berulang berbeda dengan juri, juri dikalibrasi ulang sebelum putaran resmi.
