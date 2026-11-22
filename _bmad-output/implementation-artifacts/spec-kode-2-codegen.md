---
title: 'Paket @lakar/codegen: frame/board ke React + Tailwind atau React + CSS (epic kode story 2)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: 'd0aa9b6d74d8de61ae200649c0854182222fea6c'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Codegen menulis semua elemen sebagai div karena skema v5 belum punya tag semantik (AD-1), jadi allowlist tag HTML belum dipakai.
    evidence: |-
      Ticket epic kode story 2 menyebut "tag semantik node", tetapi node tersimpan v5 tidak punya kunci tag; menambahkannya butuh kenaikan schemaVersion (AD-3), pemetaan render/codegen, korpus, dan UI. Review c2 (intent).
    location: >-
      packages/schema/src/nodes.ts (shape node); packages/codegen/src/tree.ts (child)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Desain belum bisa dibawa ke kode selain lewat Copy as per node, yang tidak tahu konteks parent (sizing fill/hug, absolute, gap negatif, scroll) sehingga hasilnya tidak sama dengan canvas. AD-16 meminta satu generator murni `@lakar/codegen`, dan AD-5 meminta pemetaan node → deklarasi CSS ditulis sekali di `@lakar/render` lalu dipakai mount DOM dan codegen. Sekarang aturan sizing, frame, teks, efek, stroke, dan SVG ikon/bentuk masih ditulis langsung ke `CSSStyleDeclaration` di `layout.ts`/`paint.ts`/`shape.ts`/`icon.ts`, jadi codegen tidak bisa memakainya.

**Approach:**
- Pindahkan aturan tersebut ke fungsi murni di `packages/render/src/css.ts` yang mengembalikan `CssDecl[]` (dan spesifikasi elemen SVG murni). Render menerapkan deklarasi itu ke DOM dengan urutan dan nilai yang sama, jadi output render tidak berubah.
- Paket baru `packages/codegen` (deps `@lakar/schema` + `@lakar/render`) menerima dokumen tersimpan (AD-10), memanggil `expandInstances` (instance di-inline untuk sekarang), menyusun pohon elemen dari fungsi `css.ts`, lalu menulis TSX + modul CSS atau TSX + kelas Tailwind, ditambah `tokens.css` (`:root` + `[data-theme="<mode>"]`) dan `theme.css` Tailwind v4.

## Boundaries & Constraints

**Always:**
- **Paket `@lakar/codegen`** di `packages/codegen` (ESM, `exports` → `dist/index.js`, `tsc -b` lewat referensi di `tsconfig.json` root). Murni: tanpa IO, tanpa DOM, hanya bergantung pada `@lakar/schema` dan `@lakar/render` (impor root). `tests/dependency-direction.ts`: `EDGES.codegen = ['schema', 'render']`, `codegen` dan `render` ada di `IO_FORBIDDEN`, `EDGES.viewer` dan `EDGES.daemon` mendapat `codegen` (AD-17). Viewer dan daemon belum memakainya (story 5).
- **API publik:**
  - `generateCode(doc, { nodeId, target, componentName?, icons?, assetBase? })` → `{ files: CodegenFile[], warnings: CodegenWarning[] }`. `target`: `'react-css' | 'react-tailwind'`. `nodeId`: id tersimpan board atau node anak (termasuk instance). `CodegenFile = { path, contents }`. `CodegenWarning = { code, nodeId, message }` (pesan Inggris).
  - `tokensCss(doc)` → teks `tokens.css`; `tailwindThemeCss(doc)` → teks `theme.css`.
  - `declToTailwind(prop, value)` → satu kelas Tailwind untuk satu deklarasi (dipakai generator dan tes).
- **File keluaran** (urutan tetap): `react-css` → `<Name>.tsx`, `<Name>.module.css`, `tokens.css`; `react-tailwind` → `<Name>.tsx`, `tokens.css`, `theme.css`. `<Name>` = `componentName` atau PascalCase dari nama node (ASCII; kosong/angka di depan → awalan `Frame`).
- **Deklarasi per elemen berasal dari `css.ts`** (AD-5) dengan urutan render: deklarasi milik node (board/frame/teks/box), paint (background, radius, box-shadow), tata letak anak terhadap parent (box-sizing, margin, posisi/sizing, min/max), lalu efek. Ref token tetap `var(--…)` dari `tokenVar` (AD-11), sama dengan Copy as. Nilai yang butuh hitung dari token (setengah lebar stroke `center`) memakai `calc(var(--x) / 2)`.
- **Render tetap identik:** `layout.ts`, `paint.ts`, `shape.ts`, `icon.ts` memakai fungsi baru; golden piksel, korpus, dan tes browser-pure render lulus tanpa memperbarui golden. `css.ts` tetap mematuhi aturan render (hanya `import type` dari luar paket, impor relatif `./x.js`).
- **Akar ekspor:** board → elemen board (posisi relative, ukuran tetap, clip, kolom flex, latar `#FFFFFF` bila tanpa fill). Node anak → diperlakukan sebagai anak flow kolom (seperti anak langsung board); `position:absolute` dan x/y akar diabaikan. Akar mendapat `data-theme="<mode>"` bila `themeMode` board yang memuatnya ada dan bukan mode default.
- **Stroke box** bagian dalam → pseudo-elemen `::after` (CSS) / varian `after:` (Tailwind) dengan deklarasi overlay render; bagian luar → `box-shadow` seperti render. Bentuk (path, ellipse busur) → div pembungkus + lapisan fill ber-mask + `<svg>` stroke; ikon → `<svg>` dari glyph `icons` (render `iconSvgSpec`).
- **Tailwind (v4):** utilitas hanya bila utilitas itu menghasilkan properti dan nilai yang persis sama (mis. `w-[120px]`, `flex`, `items-center`, `p-[8px_16px]`, `text-[color:var(--x)]`); selain itu properti arbitrer `[prop:value]`. Nilai arbitrer: `_` → `\_`, spasi → `_`, `"` → `'`. Deklarasi yang nilainya memuat `url(` ditulis ke prop `style` React (aman dari pemindai kelas Tailwind).
- **CSS module:** satu kelas per elemen, nama camelCase unik dari nama layer (deterministik, urutan pohon; bentrok → sufiks angka).
- **Token:** `tokens.css` memuat semua token dokumen (urutan tersimpan). `:root` = nilai mode default (`modes[default] ?? value`); tiap mode lain → `[data-theme="m"]` berisi token yang nilainya berbeda dari `:root`. Nilai: color hex apa adanya, panjang (`radius|spacing|container|breakpoint|fontSize|lineHeight`) → `px`, `fontWeight` angka, `fontFamily` → `fontFamilyCss`, `letterSpacing` → `em` (fungsi `tokenValueCss` di `css.ts`). Bisa diimpor ulang oleh `parseCssVariables` menjadi token yang sama.
- **Tema Tailwind:** `@import "./tokens.css";` lalu `@theme inline { … }` dengan namespace `color→--color-`, `radius→--radius-`, `spacing→--spacing-`, `container→--container-`, `breakpoint→--breakpoint-`, `fontFamily→--font-`, `fontWeight→--font-weight-`, `fontSize→--text-`, `lineHeight→--leading-`, `letterSpacing→--tracking-`; kunci = nama token tanpa segmen pertama (titik → `-`); bentrok dalam satu namespace, atau sama dengan variabel token itu sendiri (siklik, mis. `radius.md` → `--radius-md`), → nama penuh; nilai `var(--<token>)`.
- **Deterministik:** input sama → byte sama; tidak ada waktu, acak, atau penghitung global (id SVG clip/mask per ekspor: `<name>-stroke-<n>`).
- **Warning** (bukan error): `mesh-fill` (fill mesh dilewati), `icon-glyph-missing` (ikon tanpa glyph → div kosong berukuran), `token-var-collision` (dua token dengan variabel CSS sama).

**Never:**
- Mengubah skema (`tag` semantik belum ada di skema; semua elemen `div`, SVG untuk ikon/bentuk), route/tool daemon, viewer, atau Copy as.
- Komponen/master sebagai komponen React terpisah, props, slot (story 3); uji paritas piksel (story 4); UI dan tool MCP (story 5).
- Salinan kedua aturan sizing/teks/efek/stroke di codegen, atau `resolveTokens` di codegen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Board CSS | board 400×300, frame kolom gap 8 padding 16 fill token | `.tsx` + `.module.css` + `tokens.css`; kelas frame `display: flex; flex-direction: column; gap: 8px; padding: 16px; background-color: var(--colors-bg)` | - |
| Board Tailwind | board yang sama | kelas `flex flex-col gap-[8px] p-[16px] bg-[color:var(--colors-bg)] …`; `theme.css` | - |
| Sizing anak | anak `width:'fill'` di parent row | `flex: 1 1 0px; min-width: 0` (sama render) | - |
| Absolute | anak `position:absolute x:10 y:20` hug | `position: absolute; left: 10px; top: 20px; flex: 0 0 auto; width: max-content; height: max-content` | - |
| Gap negatif | row gap -4, 3 anak flow | anak ke-2 dan ke-3 `margin-left: -4px`; parent tanpa `gap` | - |
| Teks | teks multi-baris `wrap:auto` dengan `{`/`<` | `white-space: pre`; konten sebagai ekspresi JSX string literal | - |
| Stroke inside | rect stroke 2 inside | `::after` dengan `border-top/right/bottom/left: 2px solid …` | - |
| Stroke token center | stroke width token | luar `0 0 0 calc(var(--w) / 2) c` | - |
| Instance | frame berisi instance master | isi master di-inline lewat `expandInstances` | - |
| Mode | board `themeMode:'dark'`, `tokenModes:['light','dark']` | akar `data-theme="dark"`; `tokens.css` punya `:root` dan `[data-theme="dark"]` | - |
| Mesh | fill mesh | lapisan dilewati, lapisan lain tetap | warning `mesh-fill` |
| Ikon tanpa glyph | `icons` tidak diberikan | div berukuran kosong | warning `icon-glyph-missing` |
| Node tak ada | `nodeId` asing | - | `LakarError('NOT_FOUND')` |
| Determinisme | panggilan dua kali | byte identik | - |

</intent-contract>

## Code Map

- `packages/render/src/css.ts` -- pemetaan nilai AD-5; ditambah fungsi deklarasi node (sizing anak, frame, board, teks, efek, paint box, overlay stroke, lapisan fill/background kode, nilai token) dan spesifikasi SVG.
- `packages/render/src/layout.ts` -- `renderChild`/`applyFlowSizing`/`applyGridItem`/`applyAbsolute`/`applyMinMax`/`renderFrame`/`renderText`/`mountBoardNode`: diganti penerapan deklarasi `css.ts`.
- `packages/render/src/paint.ts` -- `fillLayer` (image), `boxShadowCss`/`outerStrokeShadows`/`strokeSplit`, `strokeOverlay`, `applyEffects`, `dropShadowFilters`: memakai `css.ts`.
- `packages/render/src/shape.ts` -- `maskImage`/`fillLayer`/`strokeSvg`: ditambah `shapeFillLayerDecls`, `svgPaint`, `strokeSvgSpec` (murni) dan `buildSvg` (DOM dari spec).
- `packages/render/src/icon.ts` -- `iconSvgSpec` (murni) dipakai `renderIconElement`.
- `packages/render/src/index.ts` -- ekspor fungsi baru.
- `packages/schema/src/components.ts` -- `expandInstances` (dipakai codegen, AD-10).
- `tests/dependency-direction.ts`, `tests/dependency-direction.test.ts` -- EDGES/IO_FORBIDDEN.
- `tests/resolve-document.test.ts` -- penjaga AD-10; `packages/codegen` dikecualikan untuk `expandInstances` saja.
- `tests/fixtures/docs/v1..v5` + `packages/core/src/migrate.ts` -- korpus untuk golden codegen.
- `packages/viewer/src/copyas.ts` -- acuan var() token yang sama (tidak diubah).
- `packages/render/src/css-vars.ts` -- `parseCssVariables` untuk uji pulang-pergi `tokens.css`.

## Tasks & Acceptance

**Execution:**
- `packages/render/src/css.ts` -- tambah `childLayoutDecls`, `negativeGapDecl`, `boardDecls`, `frameDecls`, `textDecls`, `effectDecls`, `dropShadowFilterList`, `boxPaintDecls`/`boxShadowWithStrokeCss`, `strokeOverlayDecls`, `fillLayerCss`/`fillsBlendModeCss`/`codeBackgroundDecls`, `tokenValueCss`, tipe `SvgSpec` -- satu pemetaan untuk render dan codegen. Spesifikasi SVG murni ada di sebelah geometrinya: `shape.ts` (`shapeFillLayerDecls`, `strokeSvgSpec`) dan `icon.ts` (`iconSvgSpec`).
- `packages/render/src/{layout,paint,shape,icon,index}.ts` -- render menerapkan deklarasi/spec tersebut; ekspor publik.
- `packages/render/src/css-decls.test.ts` -- unit tes fungsi baru (murni).
- `packages/codegen/{package.json,tsconfig.json,README.md}` -- paket baru; `tsconfig.json` root mendapat referensi; `pnpm install` memperbarui lockfile.
- `packages/codegen/src/{index,tree,names,emit,tailwind,tokens}.ts` -- generator (pohon elemen, penulis TSX/modul CSS, kelas Tailwind, file token).
- `packages/codegen/src/codegen.test.ts` -- unit tes matriks (murni).
- `tests/codegen.test.ts` -- golden korpus (v1..v5 dimigrasi, kedua target, `toMatchFileSnapshot` di `tests/fixtures/codegen/`), determinisme, kesamaan deklarasi per properti dengan `css.ts`, var() sama dengan Copy as, pulang-pergi `tokens.css` lewat `parseCssVariables`, dan typecheck TSX (tsc pada direktori sementara dengan `@types/react` milik viewer).
- `tests/dependency-direction.ts`, `tests/dependency-direction.test.ts`, `tests/resolve-document.test.ts` -- aturan AD-17/AD-10.

**Acceptance Criteria:**
- Given korpus terbaru dimigrasi, when `generateCode` dijalankan dua kali untuk setiap board dan kedua target, then hasilnya byte identik dan sama dengan golden di `tests/fixtures/codegen/`.
- Given hasil `react-css`, when tiap aturan kelas dibandingkan dengan deklarasi `css.ts` untuk node yang sama, then setiap properti dan nilainya sama; given hasil `react-tailwind`, then setiap kelas sama dengan `declToTailwind` dari deklarasi yang sama.
- Given node dengan fill ref token, when diekspor dan di-Copy as, then keduanya memuat `var(--nama)` yang sama.
- Given file TSX hasil ekspor, when di-typecheck `tsc` (strict, `jsx: react-jsx`), then 0 error.
- Given `tokens.css` hasil ekspor, when diimpor `parseCssVariables` ke dokumen yang sama, then token, tipe, nilai, dan mode sama.
- Given repo, when `tests/dependency-direction.test.ts` dan suite render dijalankan, then lulus tanpa memperbarui golden render.

## Spec Change Log

## Review Triage Log

### 2026-11-22 - Review pass
- verdicts: 32 findings - high 0, medium 7, low 19, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) id clip/mask SVG bentrok bila dua ekspor bernama sama dipasang di satu halaman - id kini `<nama>-<idNode>-stroke` (`tree.ts` shapeChildren), unik antar node/komponen; dua render komponen yang sama memakai geometri identik sehingga `url(#…)` ke salinan pertama menghasilkan piksel sama. Tes unit diperbarui.
  - `[medium]` `[patch]` (blind) tes Copy as lolos trivial untuk Tailwind karena `theme.css` memuat semua var - tes kini per node di semua dokumen korpus: var() dari `copyAs` harus ada di deklarasi elemen node itu dan di `.tsx`/`.module.css` (file token tidak ikut).
  - `[medium]` `[patch]` (blind) glyph ikon diambil dari pohon tersimpan sehingga golden v5 mengunci warning `icon-glyph-missing` palsu untuk ikon override instance - `glyphsOf` di tes kini menelusuri dokumen hasil `expandInstances`; golden diregenerasi tanpa warning palsu. Helper ikon untuk pemanggil dicatat sebagai risiko sisa story 5.
  - `[medium]` `[patch]` (blind) tes kesamaan per properti melewatkan paint, `::after`, margin gap negatif, filter, transform - tes kini memakai oracle independen dari fungsi css.ts (frame/teks/rect/ellipse/path/ikon, `boxPaintDecls`, `strokeOverlayDecls`, gap negatif, `effectDecls` dengan scrollY dan drop-shadow) dan membandingkan persis dengan pohon, modul CSS (termasuk `::after`), dan kelas/`style` Tailwind.
  - `[low]` `[patch]` (blind) kode ekspor bergantung pada aset `/assets/` dan font tanpa catatan - README `@lakar/codegen` kini menyebut gambar (`assetBase`) dan font yang harus disediakan proyek tujuan; penyalinan aset/font milik dialog ekspor story 5.
  - `[low]` `[reject]` (blind) nilai tak tervalidasi (sides asing/ganda, warna drop-shadow kosong, `svgPaint` none, x/y tak valid) - hanya untuk dokumen yang melanggar skema (`StrokeSide` enum tanpa duplikat, `Shadow.color` wajib, x/y `Px`); codegen menerima dokumen tersimpan yang sudah divalidasi daemon; guard menambah cabang.
  - `[false]` `[reject]` (blind) `strokeWidth` ikon ber-token jatuh ke 2 - skema ikon `strokeWidth: Positive.optional()` tidak menerima `{$token}` (nodes.ts iconShape), jadi kasus ini tidak terjangkau.
  - `[low]` `[patch]` (blind) escaping arbitrer Tailwind merusak family berapostrof (`'O'Reilly_Sans'`) - `needsInlineStyle` kini mengirim nilai berkutip tunggal atau berkarakter `&{}<>` ke prop `style`; tes `O'Reilly Sans`. Kutip ganda di dalam nama family adalah perilaku `fontFamilyCss` lama (ditolak di spec model-dokumen-4).
  - `[low]` `[reject]` (blind) kunci tema Tailwind hasil fallback bisa bentrok lagi (`radius.md` vs `x.radius-md`) - butuh dua token dengan pola nama yang jarang; perbaikan menambah loop disambiguasi.
  - `[false]` `[reject]` (blind) scrollY diekspor sebagai transform statis tanpa warning; root kehilangan absolute/grid - transform `translateY(-scrollY)` adalah semantik canvas (render), dan ekspor wajib sama dengan canvas (AD-6, R5); akar node anak tanpa posisi adalah keputusan spec (Always).
  - `[low]` `[reject]` (blind) mode default tidak dipin sehingga ancestor `[data-theme]` di aplikasi host ikut mengubahnya; nama mode tidak di-escape - board tanpa mode non-default mengikuti tema host (perilaku wajar untuk token); pin butuh blok `[data-theme=default]` dan cabang baru. Nama mode dibatasi `MODE_NAME_PATTERN` `[a-z0-9-]`, jadi tidak perlu escape.
  - `[false]` `[reject]` (blind) golden `letter-spacing: -0.8em` mencurigakan - `letterSpacing` selalu em sejak v1 (api.md "letterSpacing? (em)"); nilai berasal dari fixture v1 lama dan codegen memetakannya persis seperti canvas.
  - `[low]` `[reject]` (blind) tes typecheck bergantung pada `packages/viewer/node_modules/@types/react` dan tidak mengompilasi Tailwind - viewer memang devDependency `@types/react` (pnpm workspace stabil); kompilasi Tailwind dan uji paritas adalah lingkup story 4 (ticket entry 4).
  - `[low]` `[reject]` (blind) cacat dokumen spec (`\n` literal, `negativeGapDecl`, change log kosong, `deferred: []`) - perbaikannya mengedit spec build ini; format `\n` Design Notes tetap dirapikan saat finalisasi dan `deferred` diisi lewat jalur defer.
  - `[low]` `[patch]` (blind) warning `token-var-collision` memakai `nodeId: ''` - `CodegenWarning.nodeId` kini opsional dan tidak diisi untuk peringatan tingkat dokumen; tes baru.
  - `[false]` `[reject]` (edge) gap token bernilai negatif → `gap: var()` tidak sah - slot gap memakai token `spacing` yang skemanya `Size` (≥ 0), jadi nilai token gap tidak bisa negatif.
  - `[low]` `[reject]` (edge) mode default bocor dari ancestor - sama dengan baris blind mode default.
  - `[low]` `[patch]` (edge) dua node berbeda dengan nama ekspor sama memakai id clip/mask yang sama - diperbaiki bersama baris blind id SVG (id memuat id node).
  - `[low]` `[reject]` (edge) kunci tema bentrok sesudah fallback - sama dengan baris blind kunci tema.
  - `[low]` `[patch]` (edge) className dengan `&{}<>` jatuh ke ekspresi JSON sehingga `\_` menjadi `\\_` bagi pemindai Tailwind - nilai seperti itu kini ke prop `style` (sama dengan baris blind escaping), jadi className selalu atribut polos.
  - `[low]` `[reject]` (edge) target tak dikenal diam-diam menjadi Tailwind - tipe `CodegenTarget` membatasi pemanggil TypeScript; validasi input daemon/MCP milik story 5; guard menambah cabang.
  - `[low]` `[reject]` (edge) spec menyebut `negativeGapDecl` yang tidak ada - perbaikannya mengedit spec; perilakunya ada di `childLayoutDecls(…, { negativeGap })` dan didokumentasikan di Auto Run Result.
  - `[low]` `[reject]` (edge) matriks menyebut `margin-left` sedangkan kode menulis `margin: 0 0 0 -4px` - perbaikannya mengedit spec; nilai computed sama dan Design Notes mencatat bentuk shorthand.
  - `[low]` `[patch]` (edge) `tabular-nums` Tailwind v4 menulis nilai komposit, bukan `tabular-nums` persis - dihapus dari peta kata kunci; kini `[font-variant-numeric:tabular-nums]` (tes `declToTailwind`).
  - `[medium]` `[patch]` (vgap) opsi `assetBase` tidak pernah diuji ujung ke ujung - tes `generateCode` dengan `assetBase: './img/'` untuk kedua target (modul CSS dan `style` Tailwind).
  - `[low]` `[reject]` (vgap) bullet Design Notes berisi `\n` literal - perbaikannya mengedit spec; dirapikan saat finalisasi (sama dengan baris blind cacat spec).
  - `[false]` `[reject]` (intent) instance di-inline, bukan pemakaian komponen - intent memecah AD-16: ticket entry 3 (`after = [2]`) memiliki "master → komponen, instance → pemakaian"; story 2 sengaja sementara.
  - `[medium]` `[defer]` (intent) tanpa tag semantik - skema v5 belum punya `tag` (AD-1 butuh kenaikan schemaVersion, AD-3); dicatat di `deferred` dan `deferred-work.md`.
  - `[medium]` `[patch]` (intent) kesamaan per properti dicek parsial terhadap fungsi baru - digabung dengan baris blind tes per properti (oracle lengkap); kesamaan dengan render lama dikunci golden piksel render yang lulus tanpa diperbarui.
  - `[medium]` `[patch]` (intent) kesamaan var() Copy as hanya tingkat set dan satu dokumen - digabung dengan baris blind tes Copy as (per node, semua dokumen).
  - `[low]` `[reject]` (intent) tema Tailwind v4 (`--breakpoint-*`) bukan kosakata v3 `screens`, dan kelas tidak memakai utilitas tema - `--breakpoint-*` adalah padanan v4 dari screens dan memuat semua kategori ticket; kelas sengaja memakai `var(--token)` agar sama dengan Copy as (verify ticket).
  - `[false]` `[reject]` (intent) refactor render di luar paket dan Copy as tidak dipindah ke fungsi node - AD-5 mewajibkan mount DOM memakai modul tunggal; Copy as per node akan digantikan dialog ekspor (ticket entry 5 "menggantikan Copy as per node"), dan nilai Copy as sudah dari css.ts.

## Design Notes

- **Instance di-inline (keputusan).** Codegen memanggil `expandInstances` (diizinkan AD-10) dan menulis isi instance seperti node biasa. Story 3 mengganti ini dengan komponen React; karena pohon codegen sudah berbasis node ter-ekspansi, story 3 cukup memotong subpohon instance menjadi pemakaian komponen.
- **Tanpa `tag`.** Skema v5 belum punya `tag` (AD-1 mengizinkannya, tetapi butuh kenaikan versi). Semua elemen `div` seperti render; allowlist tag ditambahkan bersama skemanya nanti (dicatat di `deferred-work.md`).
- **Tailwind v4 + arbitrer.** Nilai tetap persis sama dengan `css.ts`, jadi utilitas skala Tailwind (mis. `p-4`) tidak dipakai; token tersedia sebagai utilitas tema lewat `theme.css`, tetapi kelas memakai `var(--token)` agar sama dengan Copy as.
- **Stroke ::after.** Overlay render adalah anak terakhir absolute inset 0; `::after` absolute pada elemen relative punya kotak dan urutan lukis yang sama.
- **Render dipindah ke deklarasi.** `layout.ts`/`paint.ts`/`shape.ts`/`icon.ts` kini hanya membuat elemen dan menerapkan `CssDecl[]`/`SvgSpec` dari fungsi murni. Satu-satunya perubahan string render: gap negatif ditulis `margin: 0 0 0 g` (dulu `margin: 0` + `margin-left: g`), nilai computed sama; golden piksel lulus tanpa diperbarui.
- **Tema Tailwind siklik.** Token yang namanya sudah berbentuk namespace Tailwind (`radius.md`, `text.lg`, `spacing.gap`) akan menghasilkan `--radius-md: var(--radius-md)` (siklik, tidak sah); kuncinya memakai nama penuh (`--radius-radius-md`).
- **Bentrok variabel token** (deferred spec-token-2): codegen melaporkan warning `token-var-collision`; penolakan saat commit tetap di luar story ini.
- **Satu lapisan solid → `background-color`** (kode idiomatik); berlapis → `background` dengan lapisan yang sama dengan render. Secara piksel sama.
- Contoh (react-css):

```tsx
import styles from './Card.module.css';

export function Card() {
  return (
    <div className={styles.card}>
      <div className={styles.title}>Hello</div>
    </div>
  );
}
```

## Verification

**Commands** (Windows: awali `set "PATH=C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0;%PATH%" &&`; pnpm = `npx -y pnpm@12.21.0`):
- `npx -y pnpm@12.21.0 install` -- expected: lockfile memuat `packages/codegen`
- `npx -y pnpm@12.21.0 build` -- expected: sukses (termasuk codegen dan Vite viewer)
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: 0 error
- `npx -y pnpm@12.21.0 exec vitest run packages/codegen packages/render packages/viewer tests/codegen.test.ts tests/dependency-direction.test.ts tests/resolve-document.test.ts tests/doc-corpus.test.ts` -- expected: tidak ada kegagalan baru dibanding baseline Windows (`%TEMP%\lakar-fail-base.txt`)

## Auto Run Result

- **Ringkasan:**
  - Paket murni baru `@lakar/codegen` (AD-16/AD-17) mengubah board atau node tersimpan menjadi berkas berikut:
    - React + CSS module: `<Name>.tsx`, `<Name>.module.css`, `tokens.css`;
    - React + Tailwind v4: `<Name>.tsx`, `tokens.css`, `theme.css`.
  - Token ditulis sebagai `var(--…)` (AD-11). `tokens.css` berisi `:root` ditambah `[data-theme="<mode>"]`, dan bisa diimpor ulang oleh `parseCssVariables`.
  - Instance di-inline lewat `expandInstances`. Komponen React menjadi pekerjaan story 3.
  - Aturan node (sizing, frame, teks, efek, paint, stroke, latar) dipindah ke deklarasi murni di `@lakar/render` `css.ts`, sehingga render dan codegen memakai satu pemetaan (AD-5). Spesifikasi SVG murni ada di `shape.ts`/`icon.ts`. Render tidak berubah: golden piksel lulus tanpa diperbarui.
- **File:**
  - `packages/render/src/{css,layout,paint,shape,icon,index}.ts` -- deklarasi node murni dan render yang menerapkannya.
  - `packages/render/src/css-decls.test.ts` -- tes unit deklarasi dan spesifikasi SVG.
  - `packages/codegen/**` -- paket baru:
    - kode: `tree`, `emit`, `tailwind`, `tokens`, `names`, `index`;
    - tes unit: `codegen.test.ts`;
    - `README.md`.
  - `tests/codegen.test.ts`, `tests/fixtures/codegen/*.txt` -- tes korpus:
    - golden kedua target;
    - oracle per properti dari css.ts;
    - var() Copy as per node;
    - pulang-pergi token;
    - typecheck TSX.
  - `.gitattributes` -- golden codegen selalu LF.
  - `tests/dependency-direction{.ts,.test.ts}`, `tests/resolve-document.test.ts`, `tsconfig.json`, `pnpm-lock.yaml` -- EDGES/IO_FORBIDDEN, pengecualian AD-10 untuk codegen, dan build.
  - `_bmad-output/implementation-artifacts/deferred-work.md` -- tag semantik.
- **Review:** 32 temuan (medium 7, low 19, false 6).
  - **9 entri patch:**
    - id clip/mask SVG kini `<nama>-<idNode>-stroke`;
    - tes Copy as per node tanpa file token;
    - glyph tes dari dokumen ter-ekspansi, dan golden v5 tanpa warning palsu;
    - oracle per properti lengkap (paint, `::after`, gap negatif, efek);
    - catatan aset/font di README;
    - nilai Tailwind dengan `'&{}<>` dipindah ke prop `style`;
    - `CodegenWarning.nodeId` opsional;
    - `tabular-nums` menjadi properti arbitrer;
    - tes `assetBase`.
  - **1 ditunda:** tag semantik (skema v5).
  - **Ditolak** (alasan per baris ada di Review Triage Log):
    - guard nilai di luar skema;
    - `strokeWidth` ikon ber-token (skema tidak mengizinkan);
    - fallback kunci tema yang bentrok;
    - scrollY statis (sama dengan canvas);
    - pin mode default;
    - golden letter-spacing (semantik em);
    - kerapuhan typecheck dan kompilasi Tailwind (story 4);
    - cacat dokumen spec;
    - gap token negatif (skema ≥ 0);
    - target tak dikenal;
    - klaim spec `negativeGapDecl`/`margin-left`;
    - instance di-inline (story 3);
    - kosakata tema v4;
    - Copy as tidak dipindah (story 5).
- **Penyimpangan dari teks intent:**
  - Id SVG kini `<nama>-<idNode>-stroke`, bukan `<name>-stroke-<n>`. Masih deterministik per ekspor.
  - Nilai Tailwind berkutip tunggal atau berkarakter `&{}<>` juga ditulis ke prop `style`, selain `url(`.
  - Gap negatif ditulis sebagai shorthand `margin: 0 0 0 g` lewat `childLayoutDecls(…, {negativeGap})`. Tidak ada fungsi `negativeGapDecl`.
- **Follow-up review:** `true`. Patch per verdict: medium 4, low 5. Risiko yang belum terverifikasi: kelas Tailwind belum pernah dikompilasi Tailwind, sehingga urutan pasangan shorthand/longhand dalam satu elemen (`gap` + `column-gap`, `background` + `[background-blend-mode:…]`) dan validitas kelas arbitrer baru akan diuji di story 4. Tidak ada perilaku UI yang perlu di-smoke.
- **Verifikasi:**
  - `pnpm install --frozen-lockfile`, `pnpm build` (termasuk Vite viewer), dan `tsc -p tsconfig.test.json` OK, 0 error.
  - vitest codegen/render/viewer/codegen-korpus/dependency/resolve/doc-corpus: 703 lulus. Hanya 4 kegagalan render layout/teks yang ada di baseline Windows.
  - Suite penuh pada Fase A tidak menambah kegagalan baru dibanding baseline.
- **Risiko sisa:**
  - Pemanggil story 5 harus mengumpulkan glyph ikon dari dokumen ter-ekspansi, seperti `glyphsOf` di tes.
  - Aset gambar dan font harus disalin oleh dialog ekspor.
  - Tailwind belum dikompilasi (story 4).
