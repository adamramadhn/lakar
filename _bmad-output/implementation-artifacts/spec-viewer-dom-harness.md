---
title: 'Harness tes DOM/komponen viewer'
type: chore
ticket: ''
created: '2026-11-23'
status: built
baseline_revision: '9307dc1'
route: quick
risk: low
review: quick
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-canvas-agent-effects.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-vektor-5-pen-tool.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-agent-open-doc.md'
---

## Intent

**Problem:** Banyak item `deferred-work.md` berbunyi "Viewer belum punya harness tes DOM": wiring komponen (efek agen di canvas, Pen tool, paste, dialog Export code, `openTab`/reporter fokus) hanya dites lewat logika murni dan smoke msedge. Regresi di wiring tidak tertangkap CI.

**Approach:** Tambah proyek vitest `viewer-dom` (jsdom) khusus `packages/viewer/src/**/*.dom.test.tsx`, helper harness (fetch per route, EventSource, stub API browser), lalu tes komponen untuk wiring berisiko tinggi yang diusulkan item ditunda. Tes lewat DOM (peran, label, kelas, request), bukan internal komponen.

## Boundaries & Constraints

**Always:**
- Tes daemon dan tes murni tetap di proyek `node` dengan environment dan kecepatan yang sama; jsdom hanya untuk `*.dom.test.tsx`.
- Dependensi tes di `devDependencies` viewer dengan versi persis; lockfile konsisten; CI menjalankan tes ini lewat `pnpm test` tanpa langkah tambahan.
- Stub di batas proses saja: `fetch` (bukan modul `api.ts`), `EventSource` (bukan `activityHub`), dan API browser yang tidak ada di jsdom. Board canvas di-mount sungguhan oleh `@lakar/render` ke shadow root.
- `tests/dependency-direction.test.ts` tetap lulus (viewer tidak mengimpor core/exec/icons).

**Never:**
- Mengubah route, tool, atau perilaku lama. Bug yang ditemukan tes diperbaiki di commit terpisah dan dicatat di sini.
- Snapshot DOM besar atau assert pada state internal React.

## I/O & Edge-Case Matrix

| Area | Kasus | Diharapkan | Tes |
|---|---|---|---|
| Fade-in agen | Execute selesai sesudah canvas dibuka, board di-mount dari rev itu | `Element.animate` pada node baru (opacity 0, blur 4px, 500ms) | `Canvas.dom.test.tsx` |
| Fade-in agen | Membuka dokumen (execute 5 dtk sebelumnya) | Tidak ada animasi | idem |
| Fade-in agen | Reconnect (`fadeEpoch` naik) | Rencana snapshot tidak diputar | idem |
| Fade-in agen | `prefers-reduced-motion: reduce` | Tidak ada animasi | idem |
| Generating | Presence working di board | Label "✦ Generating · Hero" warna sesi; selesai/pratinjau → tidak ada | idem |
| Kursor agen | Sesi hilang dari presence | Kursor mendapat kelas `exiting`, lalu dilepas | idem |
| Pen tool | Esc saat menggambar | Path batal, seleksi tetap, tidak ada `onInsert`, event tidak sampai pendengar luar | idem |
| Pen tool | Delete saat menggambar | Titik terakhir dibuang; shortcut hapus node luar tidak menerima event | idem |
| Pen tool | Enter < 2 titik / 2 titik | Tanpa request / satu commit `add` path di board | idem |
| Activity | Baris tiba sesudah panel terbuka / sudah ada / snapshot reconnect | `chunk-in` hanya untuk baris baru | `ActivityPanel.dom.test.tsx`, `Viewer.activity.dom.test.tsx` |
| Activity | Panel dibuka kosong, call pertama tiba | `chunk-in` (bug, diperbaiki) | `Viewer.activity.dom.test.tsx` |
| openTab | Event untuk jendela ini / tanpa origin / jendela lain | `location.hash` → `#/d/<slug>` / tidak berubah | `App.dom.test.tsx` |
| Fokus | Mount di Dashboard, buka dokumen, reconnect, `focus` jendela | PUT /viewer/focus `null`, `demo`, `demo` lagi; header origin | idem |
| Paste | HTML ke frame terpilih | Body `{content,parentId,kind:'html'}`, Paste Report terbuka, node baru terpilih, Pasted Tag | `Viewer.paste.dom.test.tsx` |
| Paste | SVG / tanpa seleksi / teks biasa | Toast Undo+Details / toast "Select a board or frame…" tanpa request / tidak dicegat | idem |
| Export code | Buka, TypeScript off, React + CSS, Copy, Download, Esc | File aktif dipertahankan (.tsx → .jsx), isi clipboard = pratinjau, unduhan `Hero-react-tailwind.zip`, `onClose` | `CodeExportDialog.dom.test.tsx` |

## Code Map

- `vitest.config.ts` -- dua proyek: `node` (include lama) dan `packages/viewer/vitest.config.ts`.
- `packages/viewer/vitest.config.ts` -- proyek `viewer-dom`: jsdom, `@vitejs/plugin-react`, `setupFiles: src/test/setup.ts`.
- `packages/viewer/src/test/dom.tsx` -- `FakeDaemon` (fetch per route, `requests`, `find`), `FakeEventSource` + `stream.hello/event/drop`, `nextSeq`, `setMedia`/`reducedMotion`, `installDomStubs`, `dom()`, `renderUi`.
- `packages/viewer/src/test/setup.ts` -- jest-dom, stub per tes, `cleanup` + reset global/mock/hash/localStorage.
- `packages/viewer/src/test/fixtures.ts` -- dokumen kecil (board `Board001` "Hero", frame `Card0001`, frame tambahan).
- `packages/viewer/tsconfig.json` / `tsconfig.test.json` -- tes DOM dikeluarkan dari build, di-typecheck terpisah; `package.json` root `test` memanggil `tsc -p packages/viewer/tsconfig.test.json`.
- `packages/viewer/src/ActivityPanel.tsx` -- perbaikan bug baris Activity (lihat Implementation Notes).

## Tasks & Acceptance

**Execution:**
- [x] Dependensi: `jsdom` 31.0.1, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.13, `@testing-library/jest-dom` 8.0.0 (devDependencies viewer, versi persis).
- [x] Proyek vitest + tsconfig tes + skrip `test` root.
- [x] Harness `src/test/*`.
- [x] Tes: `ActivityPanel`, `Canvas`, `App`, `Viewer.paste`, `Viewer.activity`, `CodeExportDialog` (`*.dom.test.tsx`, 29 kasus).
- [x] Perbaikan bug yang ditemukan (commit terpisah).
- [x] `packages/viewer/README.md` bagian "Tes DOM"; `deferred-work.md` ditandai.

**Acceptance Criteria:**
- Given `pnpm test`, when CI berjalan, then proyek `node` dan `viewer-dom` sama-sama dijalankan, tes lama tetap di Node.
- Given wiring yang dites dirusak (mutasi: `stopPropagation` Pen dibuang, reduced motion diabaikan), when tes dijalankan, then tes terkait gagal (diperiksa manual saat build).

## Implementation Notes

- **Pilihan jsdom, bukan happy-dom:** jsdom 31 punya `PointerEvent` dan shadow DOM yang cukup untuk `mountBoard`, dan menjadi peer opsional vitest. API yang tidak ada (`Element.animate`, pointer capture, `scrollIntoView`, `CSS.escape`, `matchMedia`, `ResizeObserver`, `URL.createObjectURL`) di-stub di `installDomStubs`.
- **Proyek vitest, bukan docblock per file:** `environmentMatchGlobs` sudah tidak ada di vitest 5; `projects` memberi environment dan `setupFiles` khusus tanpa menyentuh tes Node. Opsi CLI (`--testTimeout` CI) berlaku untuk kedua proyek.
- **Bug ditemukan (commit `fix(viewer): animate Activity rows only after the stream snapshot`):** `ActivityPanel` menganggap "belum ada call yang dikenal" sebagai "panel baru dibuka". Akibatnya (1) call pertama di panel yang dibuka kosong tidak pernah mendapat `chunk-in`, dan (2) call yang terlewat selama putus, yang datang lewat snapshot `hello` sesudah reconnect, justru dianimasikan karena `hello` dan `connected:true` tiba di render yang sama. Perbaikan: call dianggap lama pada render tersambung pertama (mount atau sesudah putus), bukan saat daftar kosong.
- Tes reconnect memakai backoff asli hub (1 dtk), tanpa timer palsu, supaya `connectActivity` tetap utuh.
- `seq` event tiruan dibagi lewat `nextSeq()`: snapshot `hello` menyetel `seq` reducer, jadi event sesudahnya harus lebih besar.

## Review Triage Log

**Pass 1 (quick, self-review diff):** low 2 patch, 0 defer.

| # | Temuan | Verdict | Rute | Bukti |
|---|---|---|---|---|
| 1 | `mounted()` lolos walau board gagal di-mount (`shadowRoot?.querySelector` → `undefined`, bukan `null`) | low | patch | Fixture awal tidak sah (x/y tanpa `position:'absolute'`) tetapi tes tetap hijau; kini `?? null` |
| 2 | Download memicu "Not implemented: navigation" jsdom dan tidak diverifikasi | low | patch | Klik `<a download>` di-spy, nama zip di-assert |

## Menulis tes DOM viewer

Lihat `packages/viewer/README.md` bagian "Tes DOM".

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 test` -- expected: hijau kecuali kegagalan khas Windows (AGENTS.md); CI Linux acuan.
- `npx vitest run --project viewer-dom` -- expected: 6 file, 29 tes lulus.
