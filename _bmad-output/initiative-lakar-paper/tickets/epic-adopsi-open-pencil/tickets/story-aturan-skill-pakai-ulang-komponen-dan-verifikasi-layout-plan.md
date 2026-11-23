---
title: 'Aturan skill: pakai ulang komponen dan verifikasi layout'
type: feature
ticket: '4'
created: '2026-11-23'
status: in-review
baseline_revision: '01390e5ca062fc1b6f6020cd6fcdeb84bc80037e'
route: oneshot
route_source: auto
risk: low
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Skill Lakar belum mengajarkan agen memakai ulang komponen lokal (agen membangun ulang kartu/tombol yang sudah ada sebagai master, atau mengubah isi instance lewat override padahal ada prop), dan belum memuat beberapa aturan verifikasi layout: geometri sesudah ganti mode tema, `space-between` di wadah hug, rantai `fill` lewat wadah perantara, dan larangan menambal selisih ukuran. Stress test `break-ui` juga belum mencakup edit master dan mode tema (riset open-pencil, R2 epic `epic-adopsi-open-pencil`).

**Approach:** Tambah aturan pendek, ditulis sendiri (C1, tanpa menyalin teks open-pencil), ke skill yang tepat:
- `core.md` (Struktur dan nama): pakai ulang master lokal sebelum membangun ulang; isi instance lewat `props`, bukan override.
- `selection.md` (Alur dasar langkah 3): isi instance lewat `props` dulu, override hanya bila tidak ada prop.
- `layout.md` (Struktur): `space-between` tidak menciptakan ruang di wadah hug; `fill` diteruskan lewat setiap wadah perantara; selisih ukuran tidak ditambal dengan tinggi tebakan, `clip`, atau saudara yang diposisikan manual.
- `review.md`: sesudah ganti `themeMode` cek geometri, bukan hanya warna.
- `break-ui.md`: uji juga mode tema lain (salinan ber-`themeMode` lain) dan dampak edit master ke semua instance.

Batas di `tests/skills.test.ts` (`LIMITS`, `LOAD_LIMIT` 9.600) tidak dinaikkan; aturan dipadatkan agar muat. Tidak ada blok kode baru (layout/review/break-ui masuk `NO_EXAMPLES` di `packages/daemon/src/skills-examples.test.ts`, jadi wajib tanpa blok js). Tes baru di `tests/skills.test.ts` memastikan setiap aturan tercantum di skill yang tepat.

Acceptance:
- Given skill sesudah perubahan, when `tests/skills.test.ts` jalan di Linux (LF), then semua batas ukuran dan muat per jenis layar lulus tanpa menaikkan angka batas.
- Given skill sesudah perubahan, when tes aturan baru jalan, then setiap aturan ditemukan di skill tujuannya.
- Given `packages/daemon/src/skills-examples.test.ts`, when dijalankan, then tetap hijau (tidak ada blok js baru di skill `NO_EXAMPLES`; blok yang ada tidak berubah).

</intent-contract>

## Tasks & Acceptance

**Execution:**
- [x] `packages/skills/skills/core.md` -- satu butir Struktur: pakai ulang komponen -- dibaca di setiap muat
- [x] `packages/skills/skills/selection.md` -- perluas langkah 3 Alur dasar: props dulu, override bila tak ada prop
- [x] `packages/skills/skills/layout.md` -- tiga butir Struktur: between/hug, rantai fill, jangan tambal selisih
- [x] `packages/skills/skills/review.md` -- satu kalimat langkah: ganti `themeMode` → cek geometri
- [x] `packages/skills/skills/break-ui.md` -- aturan: mode tema lain + edit master
- [x] `tests/skills.test.ts` -- describe baru: aturan story 8.4 ada di skill yang tepat

## Implementation Notes

Oneshot: hanya teks skill + satu blok tes, ±40 baris.

Keputusan (delegasi Fatmuh): plan ini juga berfungsi sebagai spec BMAD story 8.4 (tidak dibuat `spec-*.md` terpisah, agar tidak dobel). Anggaran ukuran diukur dengan teks LF (acuan CI Linux); checkout Windows CRLF menambah ±1 karakter per baris dan juga harus tetap lulus. Sisa muat landing sebelum perubahan: 9.247/9.600 (LF), 9.372 (CRLF).

Fakta kode yang dipakai aturan: `update(instance,{props:{…}})` mengganti props instance (merge dangkal, `packages/core/src/components-ops.test.ts:289`); `duplicate` board tidak memetakan ulang `componentId` instance (instance salinan tetap mengikuti master sumber, `packages/core/src/transaction.ts` duplicate), jadi edit master selalu mengenai board sumber; `fill` sumbu utama = `flex: 1 1 0px` dan wadah hug = `fit-content` (`packages/render/src/css.ts`), jadi `fill` dan `space-between` di wadah hug tidak punya sisa ruang.

## Plan Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx vitest run tests/skills.test.ts packages/skills/` -- expected: semua lulus kecuali 2 kegagalan CRLF Windows yang sudah ada di baseline (judul `\r`, `api.md` basi)
- `npx vitest run packages/daemon/src/skills-examples.test.ts` -- expected: hasil sama dengan baseline
- `pnpm test` (dengan `LAKAR_C7_ALLOW_MISSING_SOURCES=1`) -- expected: tidak ada kegagalan baru dibanding baseline Windows
