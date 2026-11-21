---
title: 'Aplikasi 4: tambah dan hapus layer manual dari kanvas'
type: 'feature'
created: '2026-11-21'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/design/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Layer hanya bisa ditambah oleh agen. Desain kini punya tool sisip di toolbar kanvas (Frame, Rectangle, Ellipse, Text, Image, Icon) dan tombol "+" di header Layers dengan menu "Add layer".

**Approach:** Viewer menyisipkan layer lewat `POST /execute` yang sudah ada, dari sesinya sendiri (`client: 'lakar-viewer'`), dengan kode `add(...)` yang dibangkitkan klien. History, activity, dan `layout_check` berjalan seperti untuk agen. Gambar diunggah lewat route aset baru.

## Boundaries & Constraints

**Always:**
- **Toolbar dan menu.**
  - Tool di toolbar: Select (V), Hand (H), Frame (F), Rectangle (R), Ellipse (O), Text (T), Image (Shift+Ctrl/Cmd+K), Icon (I).
  - Menu "+" di header Layers berisi tipe yang sama.
  - Tool aktif memakai varian `active`. Sesudah satu sisipan, tool kembali ke Select.
- **Klik di board** dengan tool aktif menyisipkan node di board itu (`position:'absolute'`, x/y = posisi klik dalam koordinat board). Ukuran default:
  - Frame 200×200 (`layout:'none'`)
  - Rectangle 200×120, fill `#D9D9D9`
  - Ellipse 120×120, fill `#D9D9D9`
  - Text "Text" Inter 16, color `#111111`
  - Icon `lucide:star` 24
- **Frame di luar board:** klik di area kanvas kosong dengan tool Frame membuat board baru 400×300 (`screen:'app'`, fill putih) di posisi klik.
- **Menu "+"** menyisipkan ke board terpilih (atau board pertama) di posisi `place`/kiri atas + 40px.
- **Image:** pemilih file (png/jpeg/webp/gif, maks 20 MB) → `POST /viewer/assets` (byte mentah; validasi magic bytes lewat `writeAsset`/`rasterType` yang ada) → `{assetId, width, height}` → rect dengan fill image `fit:'cover'`, lebar maks 400 dan rasio dijaga.
- **Icon** membuka pemilih ikon (cari lewat route `/icons/search` yang ada; hasil berupa grid) sebelum disisipkan.
- **Delete / Backspace** pada node terpilih (bukan saat fokus di input) → `remove(id)` lewat execute. Board terhapus juga boleh.
- Deskripsi execute selalu 3–8 kata, misalnya "Insert rectangle into Desktop board".
- Sesudah execute, viewer memuat ulang dokumen sendiri (event dari klien sendiri diabaikan) lalu memilih node baru.
- Gagal (`SCHEMA_INVALID`/`RENDER_FAILED`) → toast berisi pesan dan hint; dokumen tidak berubah (rollback execute).
- Tool edit nonaktif saat pratinjau versi lama (batch 3) dan saat offline.
- Teks UI berbahasa Inggris; spec dan komentar berbahasa Indonesia.

**Never:**
- Drag/resize/edit properti node di kanvas atau Inspect. Ini batch berikutnya, bukan sekarang.
- Undo/redo.
- Mengubah `/execute` atau tool MCP.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rectangle di board | tool R, klik (120,80) di board Desktop | rect baru x120 y80 200×120, terpilih, rev+1 | N/A |
| Frame di kanvas kosong | tool F, klik area kosong | board baru 400×300 di posisi klik | N/A |
| Upload gambar | PNG 1200×800 | aset tersimpan; rect 400×267 fill image | bukan gambar → 400 `SCHEMA_INVALID`; > 20 MB → 413 |
| Delete | node terpilih + tombol Delete | node hilang, rev+1 | N/A |
| Pratinjau versi | mode pratinjau | tool sisip nonaktif | N/A |
| Execute gagal | render gagal | toast; dokumen tetap | N/A |

</frozen-after-approval>

## Code Map

- `packages/exec/src/api.ts` -- API sandbox: `add`, `remove`, `place`, `find` (:84-128). Tipe node: `board|frame|text|rect|ellipse|path|icon`; image = rect dengan `fills:[{type:'image', assetId, fit}]` (`schema/src/nodes.ts`). Anak board/flow butuh `position:'absolute'` agar x/y berlaku.
- `packages/daemon/src/assets.ts` -- `writeAsset(dataDir, bytes)` (:46), `rasterType`, `imageSize`. Route upload baru masuk `files.ts` (batch 1); fastify butuh content-type parser untuk byte mentah (`application/octet-stream`, image/*), dengan bodyLimit 20 MB khusus route ini.
- `packages/viewer/src/api.ts` -- `#withDoc` (:165-204); tambah `execute(slug, code, description)` dan `uploadAsset(file)`.
- `packages/viewer/src/Canvas.tsx` -- toolbar `tool` (:110, :353-367), kamera `{x,y,z}` (:108), board `[data-board]`. Koordinat board = `(clientX - rect.left - cam.x)/z - board.x`.
- `packages/viewer/src/Viewer.tsx` -- `loadDoc`, `select`, `selectedId`, header Layers di `LayerTree`.
- Buat `codegen.ts` (fungsi murni: kode `add` per tipe, JSON.stringify untuk nilai) + test.

## Tasks & Acceptance

**Execution:**
- [ ] daemon `POST /viewer/assets` + test.
- [ ] viewer: tool, menu "+", pemilih ikon, upload, delete, `codegen.ts` + test.

**Acceptance Criteria:**
- Given Viewer dengan board, when pilih Rectangle lalu klik di board, then persegi muncul di posisi klik, terpilih di Layers, dan entri history baru tercatat.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm build && pnpm exec vitest run packages/viewer packages/daemon/src/files.test.ts` -- hijau.
