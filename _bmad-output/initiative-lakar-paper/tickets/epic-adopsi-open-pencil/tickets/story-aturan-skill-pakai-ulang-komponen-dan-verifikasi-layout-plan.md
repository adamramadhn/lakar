---
title: 'Aturan skill: pakai ulang komponen dan verifikasi layout'
type: feature
ticket: '4'
created: '2026-11-23'
status: built
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

Ukuran akhir (LF): core 2.279, layout 576/600, review 490/550, selection 2.499/2.600 (prosa 1.007/1.200), break-ui 1.774/1.800; muat landing 9.426, mobile 9.046, webapp 9.142 dari 9.600. Checkout CRLF Windows juga lulus (break-ui 1.794, muat landing 9.553). Draf pertama melewati batas (layout 623, break-ui 1.806, muat landing 9.621 CRLF), jadi aturannya dipadatkan; angka batas tidak diubah. Contoh `props` memakai `{...get(i).props,…}` karena `update` merge dangkal: props parsial akan mengembalikan prop lain ke default. Snapshot bench yang hanya berubah CRLF di-revert.

## Plan Change Log

## Review Triage Log

### 2026-11-23 — Review pass
- verdicts: 5 findings — high 0, medium 1, low 2, false 2, maybe-false 0
- findings:
  - `[false]` `[reject]` break-ui.md melewati batas 1.800 token — diukur: 1.774 (LF) / 1.794 (CRLF), tes batas lulus.
  - `[medium]` `[patch]` review.md langkah 4 "Ganti `themeMode` →" terbaca sebagai perintah mengganti mode board pengguna (efek samping, tanpa cek mode ada) — kalimat diubah jadi pemicu: "Sesudah `themeMode` board diganti: …"; regex tes ikut.
  - `[low]` `[patch]` review.md langkah 4 tidak menyebut mode mana/syarat ≥ 2 mode — akar sama dengan temuan di atas; dengan kalimat pemicu, langkah hanya berlaku sesudah ada penggantian mode.
  - `[low]` `[patch]` break-ui.md aturan 6: salinan mode tema tanpa `place`/nama bisa menumpuk di atas sumber — ditambah rujukan "salinan (Alur 2)" (duplicate + place + nama); regex tes ikut.
  - `[false]` `[reject]` muat per layar dan selection belum terverifikasi — diukur: muat landing 9.426/9.600, selection 2.499/2.600 (prosa 1.007/1.200); tes lulus.

## Auto Run Result

- Ringkasan: aturan story 8.4 (R2) ditambahkan dengan kata-kata sendiri (C1) ke skill tujuan, tanpa menaikkan batas ukuran dan tanpa blok kode baru.
- File:
  - `packages/skills/skills/core.md`: pakai ulang master sebagai instance, isi lewat `props`, override hanya tanpa prop.
  - `packages/skills/skills/selection.md`: isi instance terpilih lewat `props` dulu, override hanya untuk properti tanpa prop.
  - `packages/skills/skills/layout.md`: `space-between`/`fill` di wadah hug, rantai `fill` lewat perantara, larangan tambal ukuran.
  - `packages/skills/skills/review.md`: langkah 4, cek geometri sesudah `themeMode` diganti.
  - `packages/skills/skills/break-ui.md`: aturan 6 (salinan per mode tema) dan 7 (master: props instance, cek semua board pemakai).
  - `tests/skills.test.ts`: tes bahwa setiap aturan ada di skill yang tepat.
- Review: 3 patch (1 medium, 2 low), 0 defer, 2 ditolak (`false`, terbantah oleh pengukuran).
- Follow-up review: `false` (1 medium dipatch, tanpa high).
- Verifikasi: `tests/skills.test.ts` + `packages/skills/` + `skills-examples.test.ts` lulus kecuali 3 kegagalan baseline Windows (judul `\r`, `api.md` basi CRLF, contoh `api.md`). `pnpm test` penuh: 68 gagal; 58 di antaranya juga gagal di baseline `origin/main` pada file yang sama, dan 10 sisanya (daemon/perf: agent-undo, history-restore, fix-check, pages, paste, visual-diff, check perf, port) lulus saat diulang dengan perubahan ini, jadi itu flake beban. Typecheck (`tsc -p tsconfig.test.json`, viewer) lulus.
- Risiko sisa: aturan berupa teks, jadi dampaknya pada perilaku agen belum diukur bench; batas muat landing tinggal sekitar 174 token (LF).

## Verification

**Commands:**
- `npx vitest run tests/skills.test.ts packages/skills/` -- expected: semua lulus kecuali 2 kegagalan CRLF Windows yang sudah ada di baseline (judul `\r`, `api.md` basi)
- `npx vitest run packages/daemon/src/skills-examples.test.ts` -- expected: hasil sama dengan baseline
- `pnpm test` (dengan `LAKAR_C7_ALLOW_MISSING_SOURCES=1`) -- expected: tidak ada kegagalan baru dibanding baseline Windows
