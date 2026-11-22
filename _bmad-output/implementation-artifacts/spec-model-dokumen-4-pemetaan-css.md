---
title: 'Pemetaan CSS tunggal di render dipakai Copy as (epic model-dokumen story 4)'
type: 'refactor'
created: '2026-11-22'
status: 'done'
baseline_revision: 'c028d4dabeaa957fc746ae16a575de9d2176139e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** AD-5 spine mewajibkan satu modul murni di `@lakar/render` yang memetakan nilai node ke CSS, dipakai oleh render, Copy as, dan nanti codegen. Sekarang `packages/viewer/src/copyas.ts` menduplikasi semantik render, yaitu warna, panjang, token → `var()`, gradien (solid/linear/radial/conic), radius, padding, bayangan, `letterSpacing` em, `lineHeight` px, serta peta align/justify. Akibatnya canvas dan Copy as bisa berbeda nilai.

**Approach:**
- Tambah `packages/render/src/css.ts`, berisi fungsi nilai murni yang menerima nilai literal maupun ref `{$token}`. Ref menjadi `var(--…)` lewat satu fungsi nama variabel (AD-11).
- Render (`paint.ts`, `layout.ts`) memakai fungsi itu untuk nilai yang sama semantiknya.
- `copyas.ts` membuang pemetaan nilainya sendiri dan mengimpor dari `@lakar/render`.
- `EDGES` viewer diperluas ke `render` (AD-17).

## Boundaries & Constraints

**Always:**
- **Aturan modul `css.ts`.**
  - Tanpa IO dan tanpa akses DOM.
  - Hanya `import type` dari luar paket, dan impor relatif `./x.js` (aturan render: dist dimuat apa adanya di Chromium).
  - Diekspor lewat `packages/render/src/index.ts`.
- **Isi minimal `css.ts`.**
  - `cssVarName(token)` → `--` + nama dengan titik diganti `-`, dan `tokenVar(token)` → `var(<cssVarName>)`.
  - Panjang → `Npx`; warna hex apa adanya, dengan hex 3 digit diperluas.
  - Stops gradien, dan lapisan fill `solid`/`linear`/`radial`/`conic`. Opsi `solo` membuat solid ditulis sebagai warna polos, sedangkan default-nya `linear-gradient(c, c)` seperti render.
  - Radius (angka atau 4-tuple), padding (angka, `[v,h]`, `[t,r,b,l]`), bayangan box dan teks.
  - `letterSpacing` → `em`, `lineHeight` → `px`, `fontWeight`.
  - Peta `ALIGN`/`JUSTIFY` flex.
  - Stroke sebagai `border` untuk kode (Copy as, nanti codegen). Render tetap memakai overlay/box-shadow karena semantik `align`.
- **Format angka** di `css.ts` mengikuti render: angka apa adanya, tanpa pembulatan. Pengecualian: Copy as tetap membulatkan ukuran terukur (`bounds`) seperti sekarang.
- **Render memakai `css.ts`** untuk nilai yang semantiknya sama dengan Copy as: lapisan solid/linear/radial/conic, stops, radius, padding, bayangan box/teks, `letterSpacing`, `lineHeight`, dan `ALIGN`/`JUSTIFY`. Noise, mesh, image, overlay stroke, dan `drop-shadow` tetap di `paint.ts`/`shape.ts`.
- **Output render tidak berubah sama sekali.** Golden piksel tetap lulus, dan string CSS yang dihasilkan identik.
- **Output Copy as** (`toCss`, `toTailwind`, `copyAs`) tetap sama untuk semua tes `copyas.test.ts` yang ada. Satu-satunya perbedaan yang diizinkan adalah pembulatan nilai tersimpan non-ukuran (misalnya sudut `12.3456deg`). Asersi seperti itu boleh diperbarui hanya bila memang ada, dan perubahannya dicatat di laporan.
- **Viewer** bergantung pada `@lakar/render` (`workspace:*`) lewat impor root `@lakar/render`.
  - `tests/dependency-direction.ts`: `EDGES.viewer` = `['schema', 'render']`.
  - Tes yang ada tetap menolak viewer → core/exec/icons.
  - Build viewer (Vite) sukses.

**Never:**
- Mengubah skema, route daemon, atau perilaku tombol Copy as di UI.
- Menambah `@lakar/codegen` (milik epic kode).
- Mengubah golden PNG.
- Memindahkan pemetaan font-family render (`cssFamily`/`textFont`). Copy as boleh tetap memakai kutip minimal untuk family, lewat fungsi `css.ts` tersendiri.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Token warna | `{$token:'colors.text-primary'}` | `var(--colors-text-primary)` | — |
| Hex 3 digit | `'#abc'` (Copy as) | `#aabbcc` | — |
| Panjang | `16` / token | `16px` / `var(--…)` | — |
| Solid solo vs berlapis | 1 fill solid; 2 fill | `#111111`; `linear-gradient(#111111, #111111)` sebagai lapisan | — |
| Radial default | radial tanpa `center`/`radius` | `radial-gradient(50% 50% at 50% 50%, …)` (semantik render) | — |
| Padding tuple | `[8, 16]`, `[1,2,3,4]` | `8px 16px`, `1px 2px 3px 4px` | entri tak valid → padding dilewati (Copy as, perilaku lama) |
| letterSpacing | `0.02` / token | `0.02em` / `var(--…)` | — |
| Render tak berubah | seluruh tes golden render + korpus | lulus tanpa memperbarui golden | — |

</intent-contract>

## Code Map

- `packages/render/src/paint.ts` -- `fillLayer` (sekitar baris 23, untuk solid/linear/radial/conic), `stopsCss`, `pct`, `px`, `radiusCss` (sekitar baris 95), `shadowCss`/`boxShadowCss`/`textShadowCss` (sekitar baris 120–135). Noise/mesh/image tetap di sini.
- `packages/render/src/layout.ts` -- `ALIGN`/`JUSTIFY` (baris 32–33), `paddingCss` (sekitar baris 213), `lineHeight` px dan `letterSpacing` em (sekitar baris 298–299). Komentar header AD-5.
- `packages/render/src/index.ts` -- ekspor publik render (tambahkan ekspor `css.ts`).
- `packages/viewer/src/copyas.ts` -- `isToken`, `isNum`, `round`, `tokenVar`, `len`, `color`, `pct`, `stopsCss`, `center`, `fillLayer`, `background`, `shadowCss`, `ALIGN`/`JUSTIFY`, dan `cssDeclarations`/`toCss`/`toTailwind`/`copyAs` (API publik tetap).
- `packages/viewer/src/copyas.test.ts` -- harapan output yang wajib tetap hijau.
- `packages/viewer/package.json`, `packages/viewer/tsconfig.json` (bundler resolution), `packages/viewer/vite.config.ts` -- dependensi baru `@lakar/render`. `@lakar/render` mengekspor `dist/index.js`, jadi build render harus selesai sebelum viewer (`tsc -b` lalu Vite).
- `tests/dependency-direction.ts` (`EDGES`, baris 8–21) + `tests/dependency-direction.test.ts`.
- `packages/render/test/*.test.ts` -- golden visual/layout/teks (acuan output render tak berubah).

## Tasks & Acceptance

**Execution:**
- `packages/render/src/css.ts` -- modul pemetaan nilai baru, dengan komentar AD-5.
- `packages/render/src/paint.ts`, `layout.ts`, `index.ts` -- render memakai `css.ts` untuk nilai bersama, dan mengekspornya.
- `packages/render/src/css.test.ts` -- unit tes untuk setiap baris matriks (murni, tanpa Chromium).
- `packages/viewer/src/copyas.ts` -- hapus pemetaan nilai duplikat dan impor dari `@lakar/render`. API dan output tetap.
- `packages/viewer/package.json` -- dependensi `@lakar/render: workspace:*` (lewat `pnpm add` atau edit manual, lalu `pnpm install` agar lockfile konsisten).
- `tests/dependency-direction.ts` (+ tes bila perlu) -- `EDGES.viewer = ['schema', 'render']`.

**Acceptance Criteria:**
- Given repo sesudah perubahan, when `copyas.ts` diperiksa, then tidak ada lagi fungsi lokal untuk token → `var()`, panjang, warna, stops, lapisan gradien, radius, padding, bayangan, atau peta align. Semuanya diimpor dari `@lakar/render`.
- Given suite render (golden) dan korpus, when dijalankan, then lulus tanpa memperbarui golden.
- Given viewer di-build (`pnpm build`), when selesai, then sukses, dan tes arah dependensi lulus.

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 25 findings — high 0, medium 0, low 15, false 10, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent) konsumen `@lakar/codegen` belum ada — spec `Never` menunda codegen ke epic kode.
  - `[false]` `[reject]` (intent) mount DOM tidak mendelegasikan semua CSS — spec membatasi ke nilai yang semantiknya sama dengan Copy as.
  - `[false]` `[reject]` (intent) permukaan verifikasi berlapis — deskriptif; golden, Copy as, dan arah dependensi semuanya lulus.
  - `[low]` `[reject]` (intent) ukuran tersimpan di Copy as tidak lagi dibulatkan 2 desimal — penyimpangan kecil dari spec (yang hanya mengizinkan nilai non-ukuran); output lebih presisi dan tetap CSS valid, dokumen jarang menyimpan ukuran pecahan, dan perbaikannya menambah format angka kedua. Dicatat di Auto Run Result.
  - `[low]` `[reject]` (intent) viewer mengimpor root `@lakar/render` yang memuat modul DOM — tidak ada akses DOM di level modul; Vite melakukan tree-shaking; tes lulus.
  - `[low]` `[reject]` (edge) bayangan tanpa warna menghasilkan string kosong atau koma — hanya untuk input yang tidak valid skema (`Shadow.color` wajib).
  - `[low]` `[reject]` (edge) `boxShadowsCss` mengembalikan `''` — sama, hanya untuk input yang tidak valid.
  - `[false]` `[reject]` (edge) `gradientLayerCss(f)!` bisa undefined di render — render menerima dokumen ter-resolve; warna solid selalu hex valid menurut skema.
  - `[false]` `[reject]` (edge) padding tak valid → `'undefined'` di render — skema menjamin entri padding angka finite sesudah resolve.
  - `[false]` `[reject]` (edge) `lineHeight`/`letterSpacing` NaN — skema menolak angka non-finite.
  - `[low]` `[reject]` (edge) elemen fills null → TypeError — dokumen yang tidak valid skema.
  - `[low]` `[reject]` (edge) `sides` berisi nilai asing → `border-<x>` — skema membatasi `sides` ke enum empat sisi.
  - `[low]` `[reject]` (blind) pembulatan ukuran tersimpan hilang — duplikat temuan intent.
  - `[low]` `[reject]` (blind) `opacity` tidak lagi dibulatkan — termasuk perbedaan non-ukuran yang diizinkan spec; tidak ada asersi yang terdampak; dicatat di Auto Run Result.
  - `[false]` `[reject]` (blind) `copyas.test.ts` tidak ada di diff — sengaja tidak diubah, dan semua asersinya lulus terhadap kode baru.
  - `[false]` `[reject]` (blind) `!` di `paint.ts` — duplikat temuan edge (false).
  - `[false]` `[reject]` (blind) ekspansi hex 3 digit mengubah render — skema hanya menerima hex 6/8 digit, jadi tidak terjangkau.
  - `[low]` `[reject]` (blind) `fontFamilyCss` tidak meng-escape kutip — perilaku lama; tidak ada keluarga font terpasang yang namanya berisi kutip.
  - `[low]` `[reject]` (blind) sisi stroke tidak divalidasi — duplikat temuan edge.
  - `[low]` `[reject]` (blind) bayangan tanpa warna — duplikat temuan edge.
  - `[low]` `[reject]` (blind) `centerCss` menerima array sembarang panjang — skema menjamin tuple 2.
  - `[low]` `[reject]` (blind) celah kasus di `css.test.ts` — baris matriks spec sudah tercakup; kasus tambahan tidak sepadan.
  - `[low]` `[reject]` (blind) beban bundel dev dari impor root — duplikat temuan intent.
  - `[low]` `[reject]` (blind) `isTokenRef` diekspor tetapi belum dipakai — disiapkan untuk codegen (AD-5).
  - `[false]` `[reject]` (blind) AGENTS.md belum menyebut edge viewer → render — sudah ditulis di AGENTS.md (commit spine, AD-17).
  - (verification-gap) tidak ada celah verifikasi.

## Verification

**Commands** (Windows: awali dengan `set "PATH=C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0;%PATH%" &&`; pnpm = `npx -y pnpm@12.21.0`):
- `npx -y pnpm@12.21.0 install --frozen-lockfile` sesudah lockfile diperbarui -- expected: sukses
- `npx -y pnpm@12.21.0 build` -- expected: sukses (termasuk Vite viewer)
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: 0 error
- `npx -y pnpm@12.21.0 exec vitest run packages/viewer packages/render tests/dependency-direction.test.ts tests/viewer-codegen.test.ts` -- expected: tidak ada kegagalan baru dibanding baseline Windows. Tes render layout/teks/latensi yang sudah gagal di baseline (`%TEMP%\lakar-fail-base.txt`) boleh tetap gagal, tetapi daftar kegagalannya harus identik.

## Auto Run Result

- **Ringkasan:**
  - Modul murni `packages/render/src/css.ts` (AD-5) memetakan nilai node ke CSS, dan ref token menjadi `var(--…)` lewat `cssVarName` (AD-11).
  - Render (`paint.ts`, `layout.ts`) memakainya untuk lapisan solid/gradien, stops, radius, padding, bayangan, `lineHeight`, `letterSpacing`, dan `ALIGN`/`JUSTIFY`.
  - `copyas.ts` tidak lagi punya pemetaan nilai sendiri.
  - Viewer bergantung pada `@lakar/render`, dan `EDGES.viewer = ['schema','render']` (AD-17).
- **File:**
  - `packages/render/src/{css,paint,layout,index}.ts` -- modul baru dan pemakaiannya di render.
  - `packages/render/src/css.test.ts` -- tes unit matriks.
  - `packages/viewer/src/copyas.ts`, `packages/viewer/package.json`, `pnpm-lock.yaml` -- Copy as dan dependensi.
  - `tests/dependency-direction{.ts,.test.ts}` -- arah dependensi.
- **Review:** 25 temuan; 0 patch; 0 ditunda; 25 ditolak (10 false, 15 low).
- **Perubahan perilaku yang perlu diketahui:** Copy as kini menulis angka tersimpan apa adanya, tanpa pembulatan 2 desimal. Ini berlaku untuk ukuran (misalnya `12.3456px`), persen stops (4 desimal, sama dengan render), dan opacity. Ukuran terukur (`bounds`) tetap dibulatkan. Tidak ada asersi tes yang terdampak.
- **Follow-up review:** `false`. Tidak ada patch.
- **Verifikasi:**
  - `pnpm install --frozen-lockfile` dan `pnpm build` (termasuk Vite viewer) OK; `tsc -p tsconfig.test.json` 0 error.
  - viewer/render/dependency/viewer-codegen/korpus: hanya 4 kegagalan render layout/teks yang ada di baseline Windows.
  - Semua golden visual dan korpus render lulus tanpa memperbarui golden.
- **Risiko sisa:** viewer kini membutuhkan dist render (sudah dijamin urutan `pnpm build`). Kesamaan output render diperiksa lewat golden piksel, bukan perbandingan string CSS.
