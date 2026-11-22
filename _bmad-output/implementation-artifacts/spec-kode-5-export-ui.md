---
title: 'Ekspor kode dan impor token di viewer dan MCP (epic kode story 5)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: 'cf01434f17cadf9967fffa53cb6df76265af4364'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Impor tokens.css ke dokumen tanpa token itu tidak selalu mengembalikan nama/tipe yang sama (nama dengan '-' di segmen, px tanpa petunjuk nama).
    evidence: |-
      cssVarName tidak injektif dan CSS variables tidak membawa tipe. Impor ulang ke dokumen asal identik; ke dokumen kosong mode, variabel, nilai, dan tokens.css hasil ekspor ulang identik (tests/code-export.test.ts).
    location: >-
      packages/render/src/css-vars.ts tokenNameFor/inferType; packages/codegen/src/tokens.ts tokensCss
    severity: low
  - summary: >-
      Pemetaan selektor → mode di dialog impor baca-saja (desain menggambar Select).
    evidence: |-
      Pemetaan mode deterministik dari parser spec-token-2; remap butuh opsi parser baru (modeMap).
    location: >-
      packages/viewer/src/TokensCss.tsx ImportCssDialog; packages/render/src/css-vars.ts
    severity: low
  - summary: >-
      Wiring komponen dialog Export code, popover Copy tokens, dan dialog impor tanpa tes otomatis.
    evidence: |-
      Viewer belum punya harness tes komponen/DOM (pra-ada); logika murni dites, UI diverifikasi smoke msedge.
    location: >-
      packages/viewer/src/CodeExportDialog.tsx; packages/viewer/src/TokensCss.tsx
    severity: low
  - summary: >-
      Instance yang override-nya tidak bisa dinyatakan sebagai prop diekspor sebagai salinan inline (statis) dari master, padahal AD-16 melarang master sebagai salinan statis.
    evidence: |-
      Review c5 (intent). Fallback inline milik story 3 (warning instance-inlined), bukan story ini. Di fixture landing, InsLDxB2 (override fill + stroke inside pada akar) di-inline, sehingga perubahan padding master mengubah berkas utama (tests/code-export.test.ts). Usul: override akar seperti stroke ditulis sebagai kelas pemakai, atau prop className/style per elemen dalam.
    location: >-
      packages/codegen/src/components.ts (cek pemakaian / fallback inline)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `@lakar/codegen` (story 2–4) belum bisa dipakai pengguna maupun agen. Viewer masih punya Copy as CSS/Tailwind per node yang tidak tahu konteks parent. Panel Theme belum punya Copy tokens as CSS dan impor CSS variables (ditunda dari spec-token-3). Agen tidak punya tool untuk mengambil kode.

**Approach:**
- Dialog **Export code** di viewer (desain 09: lK7Y5/tC8HF Tailwind, u7OIu/GlSzh CSS) memanggil `@lakar/codegen` langsung (AD-16/AD-17). Isinya: target, opsi, daftar file, pratinjau berwarna, Copy file, dan Download .zip.
- Tool MCP baru **`export_code`** → route baru `POST /viewer/export-code` (sesi). Daemon memanggil generator dan resolusi glyph yang sama, sehingga file identik dengan viewer.
- Panel Theme mendapat **Copy tokens as CSS** (popover w6iQk/SpvBC) dan **Import CSS variables** (dialog wvCMu/ngHGS). Impor memakai `parseCssVariables` dari `@lakar/render` dan commit lewat route ops (`setTokenModes` + `setTokens`), sama dengan `importCssVariables` di execute.

## Boundaries & Constraints

**Always:**
- **Satu generator.** Viewer dan daemon sama-sama memanggil `iconRefs` lalu `generateCode` dengan opsi yang sama. Glyph ikon diambil dari dokumen ter-ekspansi (`iconRefs`, catatan spec-kode-2) dan di-resolve dari katalog yang sama: daemon `icons.glyph`, viewer `GET /viewer/render-deps` (route itu juga memanggil `icons.glyph`). Ikon tanpa glyph tetap menjadi warning `icon-glyph-missing`, bukan error.
- **Opsi codegen baru, aditif.** Opsi lama tidak berubah artinya dan golden lama tetap byte-identik.
  - `tokens?: boolean`, default `true`. `false` membuang `tokens.css`. `theme.css` (Tailwind) tetap ada.
  - `typescript?: boolean`, default `true`. `false` menghasilkan berkas `.jsx` tanpa `import type`, tanpa blok `export type <X>Props`, dan tanpa anotasi `: <X>Props`. Hanya itu bedanya dengan TSX.
- **`export_code`** (`{id?, target?, components?, tokens?, typescript?}`):
  - `target` adalah `react-tailwind` (default) atau `react-css`. Nilai lain → `SCHEMA_INVALID`.
  - Dokumen aktif sesi tanpa `open_doc` → `NO_ACTIVE_DOC`. Tanpa `id` → board pertama. `id` tidak ada → `NOT_FOUND`.
  - Respons `{docId, slug, rev, id, name, target, files:[{path, contents, bytes}], warnings}`.
  - Teks MCP: blok pertama JSON ringkas (tanpa `contents`), lalu satu blok per file `----- <path> -----\n<contents>`.
  - Tool dan route lama tidak berubah (AD-4). `TOOL_ROUTES` mendapat `'/viewer/export-code': 'export_code'` agar tampil di Activity.
- **Dialog Export code** (viewer, modal 1040×680):
  - Header: ikon code-xml, "Export code", lalu "<nama> · <Board|Frame|Component|Instance|…> · rev N".
  - Kolom Options 300px:
    - Target segmented "React + Tailwind" | "React + CSS" (default Tailwind).
    - Tiga checkbox, semuanya default aktif: "Components as separate files", "Include tokens file", "TypeScript".
    - Daftar Files dengan jumlah dan ukuran total. `components/` tampil sebagai baris folder, dengan file komponen menjorok di bawahnya.
  - Pratinjau: tab file aktif, meta (mis. "TSX · Tailwind v4", "CSS Modules"), tombol copy ikon, lalu kode bernomor baris dengan pewarnaan token.
  - Footer: catatan "Same output as the export_code tool…", tombol "Copy file", dan tombol "Download .zip".
  - Dokumen sumber = dokumen terkini (`latestDoc`). Setiap rev baru menghasilkan ulang kode, dan file terpilih dipertahankan bila masih ada.
- **Pintu masuk:**
  - Popover Export mendapat tombol "Export code…" untuk board terpilih di popover.
  - Menu konteks canvas/Layers mendapat item "Export code…" untuk satu node yang diklik kanan.
  - Menu Copy di panel Design: "Copy as CSS"/"Copy as Tailwind" diganti "Export code…". "Copy as JSON" tetap.
  - Saat pratinjau versi, semua pintu masuk disembunyikan atau nonaktif.
- **Zip:** metode store (tanpa kompresi), CRC-32, nama UTF-8, dan tanggal tetap 1980-01-01, sehingga byte-nya deterministik. Nama unduhan `<Name>-<target>.zip`. Unduhan memakai helper `download` yang sama dengan Export PNG (desktop: `on_download` Tauri).
- **Copy tokens as CSS:**
  - Tombol di header Theme membuka popover 360px dengan segmented "CSS variables" (`tokensCss(doc)`) | "Tailwind theme" (`tailwindThemeCss(doc)`), snippet berwarna yang bisa di-scroll, hint `<token pertama> → --<var>`, dan tombol Copy ("Copied" 1,5 dtk).
  - Teks yang disalin identik byte dengan `tokens.css`/`theme.css` hasil ekspor.
  - Tombol nonaktif bila dokumen tanpa token.
- **Import CSS variables:**
  - Dialog 1000×680. Sumber "Paste CSS" (textarea) | "Choose file" (`.css`, chip nama + ukuran, pratinjau baca-saja).
  - Pratinjau langsung (tanpa commit):
    - Modes: selektor → mode, baca-saja.
    - Tabel Variable / Token / Type / satu kolom per mode / Status (New, Update, Skipped beserta detail).
    - Ringkasan "N new · N update · N skipped".
  - Tombol "Import N tokens" melakukan satu `commitOps` (satu rev, History "Import N tokens from CSS", bisa di-undo). Isinya `setTokenModes` (bila `tokenModes` ≠ null) lalu satu `setTokens` berisi definisi bertipe, sama dengan `importCssVariables`.
  - Batas 256 K karakter, sama dengan execute. Tanpa entri → tombol nonaktif dengan pesan.
  - Baca-saja (offline/pratinjau) → tombol Import disembunyikan.
- Teks UI Inggris, komentar Indonesia, warna dari token CSS viewer. Modal memakai `Modal` yang ada. Logika murni ada di modul murni ber-tes.

**Never:**
- Mengubah skema, core, op, route/tool lama, atau bentuk respons lama.
- Viewer mengimpor core/exec/icons, memakai `execute`, membuka `EventSource` baru, atau memanggil daemon untuk codegen.
- Salinan kedua generator, parser CSS, atau aturan glyph di viewer/daemon. Kompresi zip atau dependensi baru.
- Remap mode impor (Select di desain), sinkron dua arah kode → canvas (di luar epic).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ekspor board Tailwind | board dengan instance + token, default | `Main.tsx`, `components/*.tsx`, `tokens.css`, `theme.css` | - |
| Ekspor CSS | target React + CSS | tambah `*.module.css` per berkas | - |
| Tanpa token file | `tokens:false` | tanpa `tokens.css`; Tailwind tetap `theme.css` | - |
| JavaScript | `typescript:false` | `.jsx`; tanpa `import type`/`Props` | - |
| Viewer = MCP | board sama, opsi sama | `files` identik byte | - |
| Ubah token | nilai `colors.brand` diganti | hanya `tokens.css` berbeda | - |
| Ubah master | padding master diganti | hanya `components/<Master>.*` berbeda | - |
| Ikon tak dikenal | glyph tidak ada di katalog | file tetap ada | warning `icon-glyph-missing` |
| MCP target salah | `target:'vue'` | - | `SCHEMA_INVALID` |
| MCP id asing | `id:'Nope0000'` | - | `NOT_FOUND` |
| MCP tanpa dokumen | sesi tanpa open_doc | - | `NO_ACTIVE_DOC` |
| Zip | 3 file | zip store valid, CRC cocok, urutan file sama | - |
| Copy tokens | dokumen 2 mode | teks = `tokensCss(doc)` | clipboard gagal → diam |
| Impor pulang-pergi | `tokensCss(doc)` diimpor ulang ke dokumen asal | semua Update; token, tipe, nilai, mode, dan `tokenModes` identik | - |
| Impor ke dokumen kosong | `tokensCss(doc)` ke dokumen tanpa token | `tokenModes`, variabel, dan nilai per mode sama; `tokens.css` ekspor ulang identik byte; nama tanpa `-` identik | nama ber-`-`/tipe ambigu: lihat deferred |
| Impor gabung | `--colors-bg` sudah ada | status Update, ref tetap | - |
| Impor skip | `--shadow-card: 0 8px 24px #0003` | baris Skipped + detail | - |
| Impor kosong | CSS tanpa variabel sah | tombol nonaktif, pesan "No CSS variables to import" | - |
| Impor terlalu besar | > 256 K karakter | tombol nonaktif, pesan ukuran | - |

</intent-contract>

## Code Map

- `packages/codegen/src/index.ts`, `jsx.ts` -- `generateCode`/`generateInline`/`writeComponent`; opsi baru `tokens`, `typescript`.
- `packages/codegen/src/codegen.test.ts`, `components.test.ts` -- unit tes opsi.
- `packages/daemon/src/code-export.ts` (baru) -- route `POST /viewer/export-code` (sesi, dokumen aktif).
- `packages/daemon/src/server.ts` -- registrasi route; `packages/daemon/src/events.ts` -- `TOOL_ROUTES`, `targetOf`.
- `packages/daemon/package.json`, `tsconfig.json` -- dependensi `@lakar/codegen`.
- `packages/mcp/src/server.ts` -- tool `export_code` + formatter.
- `packages/viewer/src/codeExport.ts` (baru) -- model murni: baris file, ukuran, meta, ikon, nama zip, pewarnaan, ekspor dengan pengambil glyph.
- `packages/viewer/src/zip.ts` (baru) -- penulis zip store murni.
- `packages/viewer/src/cssImport.ts` (baru) -- rencana impor murni (baris, mode, ringkasan, op).
- `packages/viewer/src/CodeExportDialog.tsx`, `TokensCss.tsx` (baru: `CopyTokensPopover`, `ImportCssDialog`), `ThemePanel.tsx` (tombol header + popover), `ExportPopover.tsx`, `EditMenu.tsx`, `DesignPanel.tsx`, `Canvas.tsx`, `Viewer.tsx` -- UI dan pintu masuk.
- `packages/viewer/src/icons.tsx`, `app.css` -- ikon Lucide baru, gaya `.code-*`, `.css-import-*`, `.tokens-pop`.
- `packages/viewer/src/harnesses.ts`, `activity.ts` -- daftar tool + judul Activity.
- `packages/viewer/package.json` -- dependensi `@lakar/codegen`.
- `tests/code-export.test.ts` (baru) -- ujung ke ujung daemon ↔ viewer, ubah token/master, impor pulang-pergi lewat core.

## Tasks & Acceptance

**Execution:**
- `packages/codegen/src/{index,jsx}.ts` -- tambah `tokens`, `typescript` -- opsi dialog desain 09 di generator tunggal.
- `packages/codegen/src/codegen.test.ts` -- tes `tokens:false`, `typescript:false` (komponen dan inline), dan default identik.
- `packages/daemon/src/code-export.ts`, `server.ts`, `events.ts`, `package.json`, `tsconfig.json` -- route sesi `export_code`.
- `packages/daemon/src/code-export.test.ts` -- error matriks (target, id, tanpa dokumen) + bentuk respons.
- `packages/mcp/src/server.ts`, `index.test.ts` -- tool `export_code` (daftar 13 tool, penerusan body, format blok).
- `packages/viewer/src/{codeExport,zip,cssImport}.ts` + `*.test.ts` -- logika murni dan tes.
- `packages/viewer/src/{CodeExportDialog,TokensCss}.tsx`, `ThemePanel.tsx`, `ExportPopover.tsx`, `EditMenu.tsx`, `DesignPanel.tsx`, `Canvas.tsx`, `Viewer.tsx`, `icons.tsx`, `app.css`, `harnesses.ts`, `activity.ts`, `package.json` -- UI.
- `tests/code-export.test.ts` -- identik viewer/MCP, ubah token/master, pulang-pergi impor.

**Acceptance Criteria:**
- Given board dengan instance dan token, when diekspor lewat dialog viewer (fungsi ekspor viewer + render-deps) dan lewat `POST /viewer/export-code` dengan opsi yang sama, then `files` identik byte untuk kedua target.
- Given dokumen bertoken, when teks Copy tokens as CSS diimpor ulang lewat dialog impor, then semua baris berstatus Update dan token, tipe, nilai, mode, serta `tokenModes` identik; ke dokumen tanpa token, `tokens.css` hasil ekspor ulangnya identik byte.
- Given satu token atau master diubah, when diekspor ulang, then perubahan token hanya mengubah `tokens.css`; perubahan master mengubah berkas komponen master (dan salinan inline instance yang di-inline, warning `instance-inlined`), sedangkan baris pemanggilan `<Master …/>` tetap.
- Given viewer dibuka, when menu konteks node → Export code…, then dialog tampil dengan file, pratinjau, Copy file menyalin isi file aktif, dan Download .zip mengunduh zip berisi semua file.
- Given panel Theme, when Import CSS variables → tempel CSS → Import N tokens, then satu rev baru tercatat dan Ctrl+Z mengembalikan token.

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 42 findings — high 0, medium 6, low 33, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) Galat impor dibuang dan dialog tetap tertutup — `onImport` kini mengembalikan `Promise<string|undefined>`: galat build atau commit gagal tampil di footer (`role=alert`), dialog hanya ditutup sesudah commit sukses, tombol nonaktif saat sibuk (`TokensCss.tsx`, `Viewer.tsx`).
  - `[low]` `[reject]` (blind) `tokens:false` meninggalkan var() tanpa tokens.css dan header tetap meminta tokens.css — memang disengaja (Design Notes: tokens.css diimpor sekali di aplikasi); menambah catatan/warning menambah cabang dan permukaan.
  - `[medium]` `[patch]` (blind) `selectorsOf` menafsir ulang selektor dengan regex sendiri (melanggar Never "salinan kedua parser") — selektor kini diturunkan dari hasil `parseCssVariables` (mode default + mode yang membawa nilai di entri); tes baru di `cssImport.test.ts`.
  - `[false]` `[reject]` (blind) `docs.get(slug)!` 500 bila dokumen aktif dihapus/diganti nama — `Sessions` mengalihkan/menghapus `activeSlug` sesi pada rename/hapus (`sessions.ts:105-113`), jadi slug aktif tanpa dokumen jatuh ke NO_ACTIVE_DOC; pola sama dengan `/export`.
  - `[false]` `[reject]` (blind) Id komposit asing tidak menjadi NOT_FOUND — codegen melempar `LakarError('NOT_FOUND')` (`tree.ts:191`) yang dipetakan ke 404; kini dikunci tes komposit di `code-export.test.ts`.
  - `[low]` `[patch]` (blind) Board pertama berbeda dengan `export` — kini `pages[0]?.children[0]?.id`, aturan yang sama dengan `firstBoardId` `/export`/`/screenshot` (`code-export.ts`).
  - `[low]` `[patch]` (blind) Guard Origin route baru tidak dites — tes: lintas origin → 403, tanpa Origin → 200 (`code-export.test.ts`).
  - `[low]` `[reject]` (blind) Keluaran `export_code` tanpa batas ukuran — board dengan banyak master jarang; batas/filter menambah parameter publik.
  - `[low]` `[reject]` (blind) `SERVER_INSTRUCTIONS` tidak menyebut export_code — deskripsi tool sudah menjelaskannya; instruksi server dibaca semua sesi (biaya token) untuk fitur opsional.
  - `[low]` `[reject]` (blind) Dialog menghasilkan ulang tiap rev tanpa debounce/cache glyph — codegen murni cepat (fixture landing < 50 ms) dan render-deps ringan; cache menambah state.
  - `[low]` `[patch]` (blind) State dialog bertahan melewati pratinjau versi — efek `preview` kini menutup Export code dan Import CSS (`Viewer.tsx`).
  - `[low]` `[reject]` (blind) Node sumber hilang saat dialog terbuka → galat generik — jarang (modal menutupi canvas; hanya agen yang menghapus), galat sudah tampil di pratinjau; cabang pesan khusus menambah kompleksitas.
  - `[low]` `[patch]` (blind) ARIA daftar Files tidak sah (div folder di `listbox`) — role listbox/option dihapus, file aktif ditandai `aria-current`; navigasi panah radiogroup mengikuti pola segmented yang sudah ada (ExportPopover).
  - `[low]` `[reject]` (blind) Popover Copy tokens tanpa manajemen fokus — sama dengan popover Export yang ada; perbaikan menambah logika fokus.
  - `[low]` `[patch]` (blind) Berkas yang sama tidak bisa dipilih lagi dan berkas besar dibaca penuh dulu — `value` input dikosongkan sesudah pilih, `f.size > 256K×4` ditolak sebelum dibaca, snippet tidak dirender di atas batas (`TokensCss.tsx`).
  - `[low]` `[patch]` (blind) Helper ganda (`TOK_CLASS`, label mode) — `TOK_CLASS` diekspor dari `codeExport.ts`, label mode memakai `modeLabel` themeModel di `cssImport.ts` dan `TokensCss.tsx`.
  - `[low]` `[reject]` (blind) Pewarnaan per baris tidak menangani komentar multi-baris — berkas hasil ekspor tidak memuat komentar multi-baris; hanya kosmetik pada pratinjau sumber impor.
  - `[false]` `[reject]` (blind) `isColor` hanya hex besar 6/8 digit — parser menormalkan semua warna ke `#RRGGBB`/`#RRGGBBAA` huruf besar (spec-token-2 konversi nilai), jadi nilai lain tidak sampai ke tabel.
  - `[low]` `[reject]` (blind) Code Map/Tasks spec menyebut `codegen.test.ts` padahal tes di `components.test.ts` — perbaikannya mengedit spec build ini.
  - `[low]` `[reject]` (blind) Cabang Copy as CSS/Tailwind tersisa — `copyas.ts` sengaja dipertahankan sebagai acuan var() `tests/codegen.test.ts` (Design Notes); `copy()` generik per format.
  - `[low]` `[patch]` (blind) Tombol menu Copy tanpa `disabled` — kini `disabled={!node && !onExportCode}`; `primary` selalu ada saat panel tampil (targets tak kosong).
  - `[low]` `[reject]` (blind) Penulis ZIP tanpa cek > 65535 berkas / > 4 GB — tidak terjangkau untuk ekspor kode teks; guard menambah cabang.
  - `[low]` `[patch]` (edge) Dialog muncul lagi sesudah pratinjau — digabung dengan baris blind pratinjau.
  - `[medium]` `[patch]` (edge) `build` → `{error}` membuat dialog tertutup tanpa umpan balik — digabung dengan baris blind galat impor.
  - `[low]` `[patch]` (edge) render-deps gagal (offline) menggagalkan seluruh ekspor — `fetchGlyphs` menangkap galat → tanpa glyph, codegen menulis `icon-glyph-missing`.
  - `[low]` `[patch]` (edge) Berkas CSS sangat besar dibaca dan diwarnai — digabung dengan baris blind input berkas.
  - `[low]` `[patch]` (edge) Memilih ulang berkas yang sama tidak memicu onChange — digabung dengan baris blind input berkas.
  - `[low]` `[patch]` (edge) Board pertama berbeda dengan export/screenshot — digabung dengan baris blind board pertama.
  - `[low]` `[reject]` (edge) `name` untuk alamat komposit = alamat mentah — nama efektif butuh `expandInstances` di daemon (dijaga AD-10 `tests/resolve-document.test.ts`); id tetap benar.
  - `[low]` `[patch]` (edge) Tombol menu Copy tampak aktif tanpa aksi saat pratinjau — digabung dengan baris blind `disabled`.
  - `[low]` `[reject]` (edge) Popover Copy tokens tetap terbuka bila semua token dihapus — jarang (agen/undo menghapus semua token saat popover terbuka), isinya tetap benar (CSS kosong).
  - `[low]` `[reject]` (edge) Target salah lewat MCP memberi galat validasi SDK, bukan SCHEMA_INVALID — konsisten dengan tool lama (mis. `scale` int di `export`); pesan SDK menyebut nilai yang sah.
  - `[low]` `[patch]` (vgap) Jalur alamat komposit route tidak dites — tes baru: komposit isi instance → 200 = `generateCode`, `name` = alamat; komposit asing → 404 NOT_FOUND.
  - `[low]` `[patch]` (vgap) `callTitle` export_code tanpa asersi — dua asersi baru di `activity.test.ts`.
  - `[low]` `[patch]` (vgap) Board pertama berbeda dengan tool export — digabung dengan baris blind board pertama.
  - `[low]` `[reject]` (intent) "Lewat viewer" dites di fungsi murni, bukan dialog/zip — harness DOM viewer belum ada (pra-ada, deferred Fase A); dialog memanggil `exportCode` yang sama dan zip dites terpisah; smoke msedge memverifikasi dialog.
  - `[low]` `[patch]` (intent) "Lewat export_code" dites di route, bukan keluaran tool — `tests/code-export.test.ts` kini memformat respons daemon asli dengan `formatExportCode` dan membandingkan blok berkas tool dengan keluaran viewer.
  - `[low]` `[reject]` (intent) Kesamaan token panel Theme dengan ekspor hanya dijamin konstruksi — popover memanggil `tokensCss` yang sama; uji komponen butuh harness DOM (pra-ada).
  - `[medium]` `[intent_gap]` (intent) Impor ke dokumen kosong tidak membuat token yang sama (R3b) — diputuskan ("terima jadi") memakai spine: AD-11 menetapkan satu fungsi nama variabel yang juga dipakai impor, dan verify ticket "mengimpornya ulang" dibaca sebagai impor ulang ke dokumen (R3a, identik, dites). Kehilangan nama ber-`-`/tipe ambigu sudah dicatat deferred; tanpa perubahan kode.
  - `[medium]` `[defer]` (intent) Ubah master mengubah salinan inline instance (AD-16 salinan statis) — fallback inline milik story 3 (pra-ada); dicatat di `deferred` dan `deferred-work.md`.
  - `[low]` `[reject]` (intent) Fidelitas desain (Select mode, pintu masuk, warnings) — desain dibaca lewat MCP pencil (C6); Select mode sudah deferred, pintu masuk dan warnings dicatat di Design Notes.
  - `[medium]` `[patch]` (intent) Pemetaan selektor dihitung regex kedua — digabung dengan baris blind `selectorsOf`.

## Design Notes

- **Pintu masuk (keputusan).** Desain 09 hanya menggambar dialognya. Pintu masuknya dipilih begini:
  - popover Export, karena ekspor board ada di sana;
  - menu konteks, untuk frame/node apa pun;
  - menu Copy panel Design, yang menggantikan Copy as CSS/Tailwind sesuai ticket "menggantikan Copy as per node".
  - Copy as JSON tetap ada, karena bukan kode CSS dan dipakai untuk debug.
  - `copyas.ts` tetap ada sebagai modul acuan tes var() (tests/codegen.test.ts).
- **Opsi TypeScript dan Include tokens file** masuk ke codegen, bukan ke viewer. Dengan begitu `export_code` dan dialog tetap identik (AD-16). Tanpa token file, `theme.css` tetap ada karena utilitas Tailwind memerlukannya. Header kode sudah meminta tokens.css diimpor sekali di aplikasi.
- **Modes di dialog impor baca-saja.** Desain menggambar Select per selektor. Parser (spec-token-2) sudah menentukan pemetaan mode secara deterministik, dan remap butuh aturan gabung baru. Select ditampilkan sebagai label mode tujuan (gaya Select Field nonaktif). Dicatat sebagai deferred.
- **Warnings codegen** tidak punya tempat di desain. Warnings tampil sebagai daftar kecil "N warnings" (ikon alert, `--warning`) di bawah daftar Files, dengan gaya teks muted yang sama.
- **Pewarnaan kode:** keyword `--accent`, string `--agent`, selektor CSS `--success`, properti CSS/atribut JSX `--codex`, komentar `--text-muted`, tanda baca `--text-secondary`, lainnya `--text-primary` (desain 09). Tokenizer regex sederhana per baris (murni), tidak memvalidasi sintaks.
- **Dialog impor dirender Viewer, bukan di dalam panel Theme.** Modal di-portal ke body masih menerima event React gestur Canvas (pohon React), sedangkan pengecualian `.canvas-overlay-ui` diperiksa lewat DOM, sehingga klik tombol di modal tertelan gestur canvas (ditemukan saat smoke). Panel Theme hanya membuka dialog (`onImportCss`); commit tetap satu `commitOps`.
- **Pulang-pergi token.** Impor ulang `tokens.css` ke dokumen asal identik, karena token bernama sama dipakai lebih dulu (status Update). Ke dokumen tanpa token itu, nama ber-`-` dan tipe px tanpa petunjuk tidak bisa dipulihkan, karena `cssVarName` tidak injektif dan CSS tidak membawa tipe. `tokens.css` hasil ekspor ulangnya tetap identik byte. Dicatat sebagai deferred.
- **Ubah master dan instance inline.** Instance yang override-nya tidak bisa dinyatakan sebagai prop di-inline (story 3), jadi salinan inline-nya di berkas utama ikut berubah. Pemanggilan `<Master …/>` tidak berubah.
- **Route `export_code` di `/viewer/*`** mengikuti AD-4 (route baru di bawah `/viewer/*`) dan `get_selection` (`POST /viewer/selection`, sesi). Klien MCP tidak mengirim Origin, jadi guard Origin tidak menolaknya.

## Verification

**Commands** (Windows: awali `set "PATH=C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0;%PATH%" &&`; pnpm = `npx -y pnpm@12.21.0`):
- `npx -y pnpm@12.21.0 install` -- expected: lockfile memuat dependensi codegen untuk viewer dan daemon
- `npx -y pnpm@12.21.0 build` -- expected: sukses
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: 0 error
- `npx -y pnpm@12.21.0 exec vitest run packages/codegen packages/viewer packages/mcp packages/daemon/src/code-export.test.ts tests/code-export.test.ts tests/codegen.test.ts tests/dependency-direction.test.ts` -- expected: lulus
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`

**Manual checks:**
- Smoke playwright-core msedge terhadap daemon lokal (data sementara):
  - menu konteks → Export code… → ganti target/opsi, file aktif berubah, Copy file, Download .zip;
  - Theme → Copy tokens as CSS (kedua format);
  - Import CSS variables → paste → Import → rev +1 → Ctrl+Z.

## Auto Run Result

- **Ringkasan:**
  - Dialog Export code di viewer (desain 09) memanggil `@lakar/codegen` langsung:
    - target React + Tailwind atau React + CSS;
    - opsi komponen, token, dan TypeScript;
    - daftar file, pratinjau berwarna, Copy file, dan Download .zip (store, deterministik).
  - Pintu masuk: popover Export, menu konteks canvas/Layers, dan menu Copy panel Design. Copy as CSS/Tailwind diganti; JSON tetap.
  - Tool MCP baru `export_code` lewat `POST /viewer/export-code` (sesi) memanggil generator dan glyph katalog yang sama, sehingga berkasnya identik byte (dites ujung ke ujung).
  - Panel Theme mendapat Copy tokens as CSS (`tokens.css`/`theme.css` identik dengan ekspor) dan Import CSS variables (parser epic token, satu commit, bisa di-undo).
  - Codegen mendapat opsi `tokens` dan `typescript`.
- **File:**
  - `packages/codegen/src/{index,jsx}.ts`, `README.md`, `components.test.ts` -- opsi `tokens`/`typescript` dan tesnya.
  - `packages/daemon/src/code-export.ts` (+ tes), `server.ts`, `events.ts`, `package.json`, `tsconfig.json` -- route `export_code`, Activity, dependensi codegen.
  - `packages/mcp/src/{server,index}.ts`, `index.test.ts` -- tool `export_code` + formatter.
  - `packages/viewer/src/{codeExport,cssImport,zip}.ts` (+ tes) -- model murni ekspor, impor, dan zip.
  - `packages/viewer/src/{CodeExportDialog,TokensCss}.tsx` -- dialog Export code, popover Copy tokens, dialog Import CSS.
  - `packages/viewer/src/{Viewer,Canvas,ExportPopover,EditMenu,DesignPanel,ThemePanel,icons,activity,harnesses}.tsx|ts`, `app.css`, `activity.test.ts`, `package.json` -- pintu masuk, ikon, gaya, dan Activity.
  - `tests/code-export.test.ts` -- viewer = export_code (blok tool), ubah token/master, pulang-pergi impor.
  - `_bmad-output/implementation-artifacts/deferred-work.md` -- 4 entri.
- **Review:** 42 temuan (medium 6, low 33, false 3).
  - **Patch** (13 entri):
    - galat impor tampil dan dialog hanya tertutup sesudah sukses;
    - selektor dari hasil parser;
    - board pertama sama dengan `export`;
    - tes guard Origin;
    - dialog ditutup saat pratinjau;
    - ARIA daftar Files;
    - input berkas (pilih ulang, cek ukuran sebelum baca);
    - helper `TOK_CLASS`/`modeLabel` tunggal;
    - `disabled` tombol menu Copy;
    - glyph offline → warning;
    - tes alamat komposit;
    - tes `callTitle`;
    - e2e memakai `formatExportCode`.
  - **intent_gap** (diputuskan, tanpa kode): pulang-pergi token = impor ulang ke dokumen (AD-11).
  - **Defer:** salinan inline instance (story 3).
  - **Ditolak**, dengan alasan per baris di Review Triage Log:
    - header `tokens:false`;
    - `docs.get` (false);
    - id komposit (false);
    - batas ukuran keluaran;
    - `SERVER_INSTRUCTIONS`;
    - debounce;
    - node hilang;
    - fokus popover;
    - komentar multi-baris;
    - `isColor` (false);
    - edit spec;
    - `copyas.ts` sisa;
    - batas zip;
    - nama komposit;
    - popover tanpa token;
    - galat SDK;
    - tiga celah permukaan UI tanpa harness;
    - fidelitas desain.
- **Follow-up review:** `false`. Patch per verdict entri: medium 2 (galat impor, selektor parser), low 11. Kedua patch medium menyangkut perilaku UI dan sudah diverifikasi ulang lewat smoke msedge pada kode yang sudah dipatch:
  - impor 1 token menaikkan rev +1 lalu dialog tertutup;
  - Modes menampilkan `:root → Light · default | [data-theme="dark"] → Dark` dari hasil parser;
  - daftar Files `aria-current` berpindah;
  - tidak ada error JS.
- **Verifikasi:**
  - `pnpm build`, `tsc -p tsconfig.test.json`, dan `tsc -p packages/viewer` OK.
  - Suite terarah: 43 file / 682 tes lulus.
  - `pnpm test`: 53 gagal, semuanya baseline Windows (`%TEMP%\lakar-fail-base.txt`), tanpa kegagalan baru. Snapshot bench yang berubah CRLF dikembalikan.
  - Smoke msedge Fase A: tiga pintu masuk, Copy file, zip `PK`, Copy tokens untuk kedua format, Import + Ctrl+Z.
  - Smoke ulang Fase B di atas.
- **Risiko sisa:**
  - Impor `tokens.css` ke dokumen tanpa token itu tidak memulihkan nama ber-`-` dan tipe px ambigu (deferred).
  - Select mode impor masih baca-saja (deferred).
  - Wiring UI tanpa tes komponen (deferred).
  - Instance yang di-inline menyalin master secara statis (deferred, story 3).
