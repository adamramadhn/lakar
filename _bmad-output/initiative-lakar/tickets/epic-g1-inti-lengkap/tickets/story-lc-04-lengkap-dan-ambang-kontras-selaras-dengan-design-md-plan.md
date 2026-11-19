---
title: 'LC-04 lengkap: ambang kontras satu sumber, batas kontrol, ikon tanpa label, scrim'
type: feature
ticket: '7'
created: '2026-11-19'
status: in-progress
baseline_revision: '091d5ad9b279c6de33657cb28a4a9af73ffd1442'
route: full
route_source: auto
risk: high
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/tickets/story-lc-04-lengkap-dan-ambang-kontras-selaras-dengan-design-md.md'
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/tickets/story-check-luapan-non-teks-dan-konten-terpotong-di-tepi-board-plan.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Ambang teks besar berbeda antara DESIGN.md (§Ambang kontras: ≥ 18,66px berat ≥ 600; Lampiran A: ≥ 19px berat ≥ 700) dan kode (`isLargeText`: 19/700), dan LC-04 belum menegakkan tiga baris tabel Ambang kontras: batas kontrol (`Input /`, `Radio /`, `Checkbox /`) ≥ 3:1, ikon tanpa label teks ≥ 3:1, dan scrim untuk teks di atas foto/gradien/efek. Placeholder ≥ 24px saat ini dinilai 3:1, padahal tabel 4.5:1.

**Approach:** Ambang jadi satu modul data `@lakar/schema` (`contrast-rules.ts`, keputusan Adam: teks besar = ≥ 24px, atau ≥ 18,66px dengan berat ≥ 700) yang dijaga tes kesesuaian terhadap DESIGN.md (dilewati bila tidak ada). Mesin latar efektif LC-04 diekstrak menjadi fungsi bersama untuk persegi target (ink teks, bounds ikon, bounds kontrol) lalu dipakai tiga sub-cek baru di bawah ID LC-04; definisi dikalibrasi dari prototipe arsip 120 dokumen (Design Notes), dibuktikan fixture tiap baris tabel, lalu pemindaian arsip + crop setiap error baru.

## Boundaries & Constraints

**Always:**
- Satu ID `LC-04` (katalog tetap `error · gerbang`); level per temuan: latar solid → error·gerbang, latar komposit (gradien/opacity/blend/backdrop blur) → warning; scrim selalu warning. Bentuk temuan AD-8, detail ≤ 120 (`clip120`), warning dibatasi 3 per aturan per board (`capWarnings`).
- Temuan LC-04 teks lama identik per dokumen dengan `after6.json` (kecuali teks 18,66–19px tebal yang berubah ambang, dicatat); aturan lain identik. Positif palsu error diperbaiki di definisi umum, bukan pengecualian per dokumen/board; setiap error baru di arsip diperiksa lewat crop.
- Angka ambang hanya di `packages/schema/src/contrast-rules.ts`; `rules.ts` dan deskripsi MCP mengimpornya.
- C9: hanya `/opt/node-26/bin/pnpm`/`node`; tanpa npx, paket global, PATH/profil, port tetap, container. Restart hanya `systemctl --user restart lakard`. Akhiri `tools/node26/verify.sh`. Dokumen uji di lakard dihapus setelahnya.
- Commit di `g1` (tanpa ganti branch/push/merge), akhiran `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Never:**
- Jangan ubah `packages/skills/**` (C7); contoh skill yang memicu → `PENDING_2_10` (`packages/daemon/src/skills-examples.test.ts`) dengan pencocokan persis (aturan + nama node + awal detail). `polish.md` ("≥ 19 tebal", "ikon") dicatat untuk revisi skill, tidak diubah.
- Jangan panggil MCP pencil, sentuh `.pen`, jalankan `claude -p`/run bench, tampilkan key Unsplash, sunting tangan `bench/*-<k>.md`, atau tinggalkan proses.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Teks kecil | 16px #949494 di #FFF (3,03:1) | error·gerbang LC-04 (≥ 4.5) | — |
| Teks besar ukuran | 24px 400 #949494 di #FFF | tidak ada; 23px → error | — |
| Teks besar tebal | 18,66px 700 #949494 → tidak ada; 18,66px 600 dan 18px 700 → error | — | — |
| Placeholder | layer `Placeholder` 24px #949494 di #FFF | error (4.5:1, bukan 3:1) | — |
| Batas kontrol gagal | `Input / Cari` fill #FFF stroke #D0D5DD di board #FFF | error·gerbang `batas kontrol 1.47:1 (#D0D5DD di atas #FFFFFF)` | — |
| Batas kontrol lulus | stroke `border-input` #7D8798; atau tanpa stroke dengan fill ≥ 3:1 terhadap latar (checkbox terisi aksen); atau tanpa cat sendiri tetapi keturunan frame/rect/ellipse bercat ≥ 3:1 | tidak ada | — |
| Kontrol tanpa batas | `Input /` tanpa stroke, fill #F6F7F9 di #FFF, keturunan tak bercat | error `batas kontrol 1.07:1` (fill) | — |
| Kontrol di latar komposit | kontrol di atas gradien/opacity < 1 | warning (perkiraan) | latar gambar/noise/mesh → dilewati |
| Ikon tanpa label gagal | `IconButton / Tutup` tanpa teks berisi ikon #D0D5DD di #FFF; baris `Bintang` 5 ikon #F5B700 tanpa teks di baris itu | error·gerbang `ikon tanpa label 1.47:1 …` (per ikon) | — |
| Ikon berlabel | ikon + teks di `Button /`/`Tab /`/`Input /`; ikon di wadah tint dengan judul di kartu; ikon `simple-icons`; ikon di `Status bar`/`Home indicator` | tidak ada | — |
| Scrim tidak ada | teks di frame ber-fill image/noise/mesh, gradien multi-hue, atau di atas node blur ≥ 24 | warning `scrim: teks di atas foto tanpa scrim (fill solid ≥ 0,5)` | — |
| Scrim ada | di antara lapisan sibuk dan teks ada fill solid alpha×opacity ≥ 0,5 yang memuat ink (ellipse: keempat sudut ink di dalam elips) | tidak ada; kontras tetap tak tentu | — |
| Gradien satu hue | teks di gradien tint satu hue | tidak ada scrim warning; kontras stop terburuk (perilaku lama) | — |
| Tes ambang | DESIGN.md (bila ada) tabel Ambang kontras + baris LC-04 Lampiran A | angka = `contrast-rules.ts` | DESIGN.md tidak ada → `skipIf` |

</intent-contract>

## Code Map

- `packages/schema/src/contrast-rules.ts` (baru) + `export *` di `index.ts` -- `CONTRAST_MIN` {text 4.5, large 3, nonText 3, placeholder 4.5}, `LARGE_TEXT` {size 24, boldSize 18.66, boldWeight 700}, `SCRIM_MIN_ALPHA` 0.5, `CONTROL_PREFIXES` ['Input /','Radio /','Checkbox /'], fungsi murni `isLargeText`.
- `tests/contrast-rules.test.ts` (baru, pola `tests/design-tokens.test.ts`/`tests/content-rules.test.ts`) -- parse tabel §Ambang kontras dan sel Cara cek LC-04 (`describe.skipIf(!existsSync(DESIGN))`): 24, 18,66, 700, 4.5, 3, 0,5 = modul.
- `packages/check/src/rules.ts` ~974–1130 -- `CONTRAST_MIN`/`CONTRAST_MIN_LARGE`/`isLargeText` diganti impor schema (ekspor ulang nama lama bila diimpor di tempat lain: cek `grep`). Ekstrak `backdrop(ctx, rect, order, exclude)` → `{cands, warn} | {skip:'image'|'partial'|'cover'|'many'}` dari badan `lc04` tanpa ubah perilaku teks; tambah `controlIssues`, `iconIssues`, `scrimIssues` dipanggil dari `lc04`. Pakai `multiHue`/`EFFECT_BLUR_MIN` (LC-21; pindahkan ke atas bila perlu), `visibleRect`, `ancestors`, `descendants`, `named`, `clip120`, `quote`, `levelOf`.
- `packages/check/src/index.ts` -- ekspor konstanta baru bila perlu; `RULE_ORDER` tidak berubah.
- `packages/check/src/index.test.ts` -- describe LC-04 baru: fixture setiap baris matriks via `runAll()`; fixture LC-04 lama tetap.
- `packages/mcp/src/server.ts` `LAYOUT_CHECK_DESCRIPTION` (+ `tests/execute-description.test.ts`) -- ambang diinterpolasi dari schema; sebut batas kontrol, ikon tanpa label, scrim.
- `packages/daemon/src/skills-examples.test.ts` `PENDING_2_10` -- diperkirakan `webapp.md` `Input / Outlet` (stroke `C.line2` #D0D5DD = 1,47:1) → entri persis.
- `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` (di-exclude git; cadangan `<scratchpad>/DESIGN.before7.md`) -- tabel Ambang kontras (600 → 700, kalimat baris 1 dirapikan), baris LC-04 Lampiran A (19 → 18,66; cara cek kontrol/ikon/scrim/placeholder; hapus "Stroke kontrol dan ikon belum dicek").
- `bench/practice/LOG.md` -- §2.7 pemindaian arsip (pola §2.15).
- Scratchpad `/tmp/claude-0/-root-lakar/28ec6272-7bb0-49b1-9470-ffa46c6812fb/scratchpad/`: `archcheck.mjs` (`--shots LC-04`), `docs.txt`, baseline `after6.json`, `cmp6.mjs` (salin → `cmp7.mjs`), `measures.json` + prototipe `s7/ctl.mjs`, `s7/icons.mjs`, `s7/scrim2.mjs`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/schema/src/contrast-rules.ts`, `index.ts`, `tests/contrast-rules.test.ts` -- modul ambang + tes kesesuaian DESIGN.md.
- [x] `packages/check/src/rules.ts` -- impor ambang, ekstrak `backdrop`, sub-cek kontrol/ikon/scrim, placeholder 4.5 -- sesuai Design Notes.
- [x] `packages/check/src/index.test.ts` -- fixture setiap baris matriks.
- [x] `packages/mcp/src/server.ts` + tes deskripsi.
- [x] `pnpm build`; `skills-examples.test.ts` → `PENDING_2_10` persis bila contoh skill memicu.
- [x] Pindaian arsip `archcheck.mjs /root/lakar <scratchpad>/after7.json --shots LC-04 $(cat docs.txt)` dari `/root/lakar`; `cmp7.mjs after6.json after7.json` (LC-04 dipisah per sub-cek via awalan detail); buka crop setiap error baru (kasus unik); positif palsu → perbaiki definisi umum, ulang. Catat LOG.md §2.7 + Implementation Notes (gagal gerbang 80 → n).
- [x] DESIGN.md di disk (cadangan dulu).
- [x] `pnpm build`, `pnpm test`, restart lakard, uji `execute` (dok uji: input #D0D5DD, IconButton pucat, teks di foto tanpa scrim), hapus dok uji, `verify.sh`, commit.

**Acceptance Criteria:**
- Given build sesudah story, when `/opt/node-26/bin/pnpm --filter @lakar/check test`, `--filter @lakar/schema test`, dan `vitest run tests/contrast-rules.test.ts`, then fixture tiap baris matriks dan tes kesesuaian ambang lulus.
- Given lakard yang di-restart, when `execute` membuat board dengan `Input /` ber-stroke #D0D5DD, `IconButton /` berikon #D0D5DD, dan teks di atas `Image /` tanpa scrim, then respons memuat dua `error·gerbang · LC-04` (batas kontrol, ikon tanpa label) dan satu `warning · LC-04` scrim.
- Given arsip 120 dokumen, when dipindai, then temuan LC-04 teks lama dan aturan lain identik dengan `after6.json`, setiap error LC-04 baru terverifikasi cacat nyata lewat crop (0 positif palsu tersisa), dan perubahan dokumen gagal gerbang (80 → n) tercatat di LOG.md §2.7.
- Given DESIGN.md, when tabel Ambang kontras dan baris LC-04 Lampiran A dibaca, then keduanya memakai 24 / 18,66 / 700 dan Cara cek tanpa catatan "belum dicek".

## Implementation Notes

- Checkpoint plan 2026-11-19 (orkestrator, didelegasikan Adam): plan disetujui. Baris bintang rating tanpa teks di baris/komponen yang sama = cacat nyata (WCAG 1.4.11); definisi ketat "ikon tanpa label" dipertahankan. Detail/expected temuan ikon memberi saran konkret (warna ≥ 3:1 terhadap latar, mis. amber gelap, atau teks nilai rating di baris itu). Dokumen arsip yang gagal karena bintang dicatat terpisah di LOG.md §2.7 dan laporan. Contoh skill yang memicu → `PENDING_2_10`. Placeholder selalu 4.5:1 disetujui.
- **Skema:** `packages/schema/src/contrast-rules.ts` (`CONTRAST_MIN` {text 4.5, large 3, nonText 3, placeholder 4.5}, `LARGE_TEXT` 24 / 18,66 / 700, `DEFAULT_TEXT_WEIGHT`, `SCRIM_MIN_ALPHA` 0,5, `CONTROL_PREFIXES`, `PLACEHOLDER_LAYER`, `isLargeText`, `textContrastMin`); `export *` di `index.ts`. `tests/contrast-rules.test.ts` mencocokkan tabel Ambang kontras + baris LC-04 Lampiran A (skipIf tanpa DESIGN.md).
- **Check:** `rules.ts` — `CONTRAST_MIN`/`CONTRAST_MIN_LARGE`/`isLargeText` lokal dihapus (tidak diimpor di tempat lain); `index.ts` mengekspor ulang `CONTRAST_MIN`, `isLargeText`, `LARGE_TEXT` dari schema. `backdrop(ctx, painters, rect, order, ancIds, exclude)` diekstrak dari `lc04` (teks identik di arsip), `pathAlpha`, `worstOver`; sub-cek `controlIssues`, `iconIssues`, `scrimIssues` dipanggil dari `lc04`.
- **Perbaikan definisi (2 putaran kalibrasi):** (1) deretan ikon saja (anak lain hanya ikon) berlabel bila di leluhur pertama dengan konten bukan-ikon ada teks nilai pendek bersebelahan (anak langsung, berangka, ≤ 40 karakter, `ICON_GROUP_LABEL_MAX`) — bintang yang dikelompokkan di frame sendiri di samping "4,8 dari 312 ulasan" / "4,8" + "1.284 ulasan" (Mejaku, Dapur Wening) adalah positif palsu di pindaian pertama; bintang testimoni/ulasan tanpa nilai tetap temuan. (2) Teks di `Status bar`/`Home indicator` dilewati scrim (jam di atas foto/efek), sama dengan pengecualian ikon.
- **Tes:** `index.test.ts` describe "LC-04 lengkap" (14 tes: setiap baris matriks + deretan ikon berlabel nilai + Status bar); fixture lama "teks di atas foto" kini mengharapkan hanya warning scrim. `tests/execute-description.test.ts` + 1 tes LC-04. `skills-examples.test.ts` `PENDING_2_10`: scrim mesh (landing `Overline`/`Headline`/`Subjudul`, mobile `Label`/`Nilai`/`Teks`, api `Judul`), webapp `Input / Outlet` 1.35:1 (#D0D5DD di atas #F3F6F5, bukan #FFF seperti perkiraan plan), icons `Bintang 1–5` 1.8:1.
- **Pindaian arsip** (`after7b.json`, 120 dok, 157 board, 0 gagal): aturan lain identik dengan `after6.json`; LC-04 teks identik (619 = 619, tidak ada teks 18,66–19 tebal/placeholder ≥ 24 di arsip). Batas kontrol 5 / 5 dok, ikon tanpa label 62 / 8 dok (semua baris bintang tanpa nilai), scrim 34 / 14 dok (+92 "serupa"; Lintas Arus, Senyap, Siaru). Gagal gerbang **80 → 86** (bintang: 4 dok; batas kontrol: 2 dok Lumbung). Crop setiap kasus unik: cacat nyata, 0 positif palsu tersisa. LOG.md §2.7.
- **DESIGN.md** (di disk, cadangan `<scratchpad>/DESIGN.before7.md`): tabel Ambang kontras (teks biasa / teks besar 24 / 18,66 / 700, placeholder berapa pun ukurannya); baris LC-04 Lampiran A (judul + level scrim, 18,66/700, placeholder, cara cek batas kontrol/ikon tanpa label/scrim, "belum dicek" dihapus).
- **Verifikasi:** `pnpm build` lulus; check 225/225, schema 125/125, bench 213/213; `vitest tests/contrast-rules.test.ts tests/execute-description.test.ts` 26/26; `pnpm test` 1098/1099 (gagal hanya latensi `visual.test.ts` saat paralel; lulus sendiri 18/18). lakard di-restart; `execute` dok uji → `error·gerbang · LC-04` batas kontrol 1.47:1, `error·gerbang · LC-04` ikon tanpa label 1.47:1, `warning · LC-04` scrim foto; dok uji dihapus, lakard di-restart. `verify.sh` semua OK, Node sistem v22.23.5.
- **Risiko sisa:** warning scrim ikut cap 3 per aturan per board bersama warning kontras LC-04 (di arsip tidak menggeser warning teks lama, tetapi bisa di dokumen lain); mesh "zona tenang" tetap memicu warning scrim (tidak bisa dibedakan tanpa piksel); label deretan ikon bisa terlalu longgar (teks berangka pendek di sebelah deretan ikon sosial dianggap label); `polish.md` masih "≥ 19 tebal" (C7, untuk revisi skill).

## Plan Change Log

## Review Triage Log

## Design Notes

**Ambang (sumber `contrast-rules.ts`).** Teks 4.5:1; teks besar (≥ 24, atau ≥ 18,66 dengan berat ≥ 700; berat default 400) 3:1; layer bernama tepat `Placeholder` selalu 4.5:1; batas kontrol dan ikon tanpa label 3:1; scrim = fill solid dengan alpha warna × opacity jalur ≥ 0,5.

**Latar efektif bersama.** `backdrop(ctx, rect, order, exclude)` = algoritma LC-04 sekarang dengan persegi target umum: lapisan = node bercat sebelum `order` yang beririsan `rect` (leluhur, atau memuat penuh; sebagian/ellipse/path → tak tentu), kecuali id di `exclude`; penutup sesudah `order` → tak tentu; gambar/noise/mesh → tak tentu; gradien/opacity/blend/backdrop blur → `warn`. Teks memanggilnya dengan ink (hasil identik).

**Batas kontrol.** Kandidat: frame terlihat bernama `Input /`, `Radio /`, `Checkbox /`, hanya yang terluar (kontrol bersarang dilewati). Latar = `backdrop` pada bounds kontrol, `exclude` = kontrol + keturunannya. Cat batas = stroke (warna × opacity) dan fill solid kontrol; bila kontrol tidak punya stroke maupun fill tak transparan, pakai keturunan frame/rect/ellipse bercat (bukan teks/ikon). Rasio = maksimum atas cat batas, masing-masing dikomposit di atas setiap kandidat latar (terburuk per cat). Rasio < 3 → temuan pada kontrol; tanpa cat batas sama sekali → temuan `tanpa batas terlihat`. Data arsip: 25 kontrol, semua `Input /` ber-stroke di kontrol itu sendiri; perkiraan gagal: stroke #D0D5DD (lumbung-gudang ×2, dentara-2611 ×2) dan `Input / Cari` fill #F6F7F9 tanpa stroke (pustaka-kampus).

**Ikon tanpa label.** Ikon terlihat, bukan `simple-icons` (logo), bukan di `Status bar`/`Home indicator`. Bila ada leluhur komponen (`Button /`, `IconButton /`, `Tab /`, `Link /`, `Chip /`, `Badge /`, `Input /`, `Radio /`, `Checkbox /`, `Stepper /`): berlabel ⇔ komponen terdekat memuat teks terlihat tidak kosong. Bila tidak: naik dari ikon sampai leluhur pertama yang punya anak lain berisi konten (teks, ikon, path, node bercat, atau frame berisi itu); berlabel ⇔ leluhur itu memuat teks terlihat. Warna = `color` (default #000000) × opacity jalur, dibandingkan dengan `backdrop` bounds ikon. Data arsip (prototipe): 3810 ikon UI, 547 tanpa label, 99 gagal di 10 dok — semuanya baris bintang rating (#F5B700 1,8:1, #D99A1E 2,1–2,4:1, #E0A21B 1,9:1); non-bintang 0. Varian "kelompok ikon transparan" (bintang dinilai berlabel bila kartunya punya teks) memberi 0 dan ditolak karena membebaskan baris ikon sosial/rating sepenuhnya.

**Scrim (warning).** Untuk teks terlihat: lapisan di bawah ink (board + node bercat sebelum teks yang beririsan ink) dicari lapisan sibuk teratas = fill image/noise/mesh, fill gradien multi-hue (definisi LC-21 `multiHue`), atau node `blur` ≥ 24 yang bukan scrim. Scrim = lapisan di atas lapisan sibuk dan di bawah teks dengan fill solid alpha × opacity jalur ≥ 0,5 yang memuat ink (ellipse: keempat sudut ink di dalam elips; path tidak dihitung). Tanpa scrim → warning `scrim: teks di atas <foto|gradien|efek> tanpa scrim`. Gradien satu hue tidak memicu (kontras stop terburuk sudah dinilai). Prototipe: 450 teks di atas lapisan sibuk, 312 berscrim; tanpa scrim di ±13 dok (lintas-arus, senyap, dapur-wening, siaru) — warning, maks 3 per board bersama warning LC-04 lain.

**Urutan detail** agar sub-cek bisa dipisah di pindaian: teks = detail lama (`kontras …`), `batas kontrol …`, `ikon tanpa label …`, `scrim: …`. Expected: `≥ 3:1 terhadap latar: stroke border-input (#7D8798) atau fill kontrol yang kontras`, `≥ 3:1 terhadap latar, atau beri label teks`, `taruh scrim fill solid opacity ≥ 0,5 di antara gambar/efek dan teks, atau pindah ke zona tenang`.

**Batas iterasi.** Maks 2 putaran kalibrasi definisi lewat pemindaian arsip; maks 3 putaran perbaikan review.

## Verification

**Commands:**
- `/opt/node-26/bin/pnpm build` -- expected: lulus.
- `/opt/node-26/bin/pnpm --filter @lakar/check test`, `--filter @lakar/schema test`, `--filter @lakar/bench test` -- expected: lulus.
- `/opt/node-26/bin/pnpm exec vitest run tests/contrast-rules.test.ts tests/execute-description.test.ts` -- expected: lulus.
- `/opt/node-26/bin/pnpm test` -- expected: lulus (kecuali latensi `visual.test.ts`/kinerja 500 node saat paralel; ulang sendiri).
- (dari `/root/lakar`) `/opt/node-26/bin/node <scratchpad>/archcheck.mjs /root/lakar <scratchpad>/after7.json --shots LC-04 $(cat <scratchpad>/docs.txt)` -- expected: 120 dok, 0 gagal; error baru = cacat nyata tercatat.
- `tools/node26/verify.sh` -- expected: semua OK, Node sistem v22.

**Manual checks (if no CLI):**
- Crop `<scratchpad>/shots/LC-04-*` untuk setiap error LC-04 baru (kasus unik).
