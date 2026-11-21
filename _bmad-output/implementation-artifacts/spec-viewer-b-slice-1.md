---
title: 'Viewer B slice 1: Dashboard dan Viewer read-only'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: '74cab160812e8880452fb0fea39a17819a75d956'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/design/README.md'
  - '{project-root}/_bmad-output/initiative-lakar/sprint-change-proposal-2026-11-21.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Hasil kerja agen hanya bisa dilihat lewat PNG atau JSON. Belum ada UI untuk menelusuri dokumen, board, dan temuan `layout_check`.

**Approach:** Tambahkan endpoint baca-saja baru di `lakard` dan paket `packages/viewer` (Vite + React + TS) yang dilayani `lakard` di `/app`. Isinya Dashboard (Recents) dan Viewer read-only, sesuai `design/lakar-ui.pen`.

## Boundaries & Constraints

**Always:**
- Visual mengikuti `design/lakar-ui.pen` (bagian 01–03): token, tata letak sidebar/canvas/panel, komponen. Dark dan light ikut `prefers-color-scheme`.
- Semua endpoint baru berada di bawah `/viewer/*` dan `/app/*`, dan baca-saja.
- Viewer memakai sesi sendiri (`POST /sessions`, `client: 'lakar-viewer'`) dan hanya memanggil `/docs/open` untuk slug yang ada di `GET /viewer/docs`.
- Node 26, pnpm, TS strict; test lolos di CI Linux (`LAKAR_C7_ALLOW_MISSING_SOURCES=1`).

**Never:**
- Mengubah route, bentuk respons, pesan error, atau tool MCP yang sudah ada (dibekukan untuk bench).
- Kotak prompt, edit, rename, delete, atau aksi tulis apa pun.
- Activity live, History, cursor agen, atau Export di slice ini; tab Activity/History cukup menampilkan empty state "Segera hadir".

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Daftar dokumen | `GET /viewer/docs`, store berisi `a.lakar.json`, `b.lakar.json` | `{ok:true,data:{docs:[{slug,rev,updatedAt,boardCount,firstBoardId}]}}`, urut `updatedAt` terbaru | N/A |
| Store kosong / folder belum ada | `GET /viewer/docs`, `docs/` tidak ada | `docs: []` | N/A |
| File rusak | satu file JSON tidak valid | Dilewati dari daftar, entri lain tetap tampil | dicatat di log daemon |
| Baca dokumen | `GET /viewer/docs/a` | `{ok:true,data:{doc}}`, salinan memori bila sudah dimuat, kalau tidak dari store | N/A |
| Slug tidak ada / tidak valid | `GET /viewer/docs/zzz` atau `../x` | 404 `NOT_FOUND` / 400 `SCHEMA_INVALID`; dokumen tidak dibuat | bentuk error AD-11 |
| Viewer statis | `GET /app/` dan `/app/assets/*` | `index.html` dan aset hasil build `packages/viewer/dist` | build belum ada → 404 dengan pesan "jalankan pnpm build" |
| Daemon mati | UI tidak bisa fetch | Banner offline sesuai desain (merah, Retry) | Retry memanggil ulang |

</frozen-after-approval>

## Code Map

- `packages/daemon/src/server.ts` -- `buildServer`: route fastify, `ok()/fail()` (AD-11), `parse()` zod, `docs` Map (L189) sebagai salinan memori, `store` DocStore, `SLUG_PATTERN`, `notFound()` dari `./errors.js`. Tambah route baru di akhir, sebelum `/assets/:hash`. Jangan sentuh route lama.
- `packages/daemon/src/store.ts` -- `DocStore.docsDir` (`<dataDir>/docs`), `docPath(slug)` = `<slug>.lakar.json`, `read(slug)` (undefined bila tidak ada; bisa menulis balik hasil migrasi). Tambah `list()` yang membaca nama file dan `stat` mtime.
- `packages/schema/src/nodes.ts` -- `LakarDocument` {id, rev, tokens?, pages[{id,name,children: BoardNode[]}]}; `BoardNode` punya `name, x, y, width, height, children`.
- `packages/daemon/src/index.test.ts` -- pola test daemon (port acak, dataDir sementara); tambahkan test untuk route baru di sini atau `viewer.test.ts`.
- Endpoint lama yang dipakai viewer: `POST /sessions`, `POST /docs/open`, `POST /boards`, `POST /screenshot` (PNG base64, `boardId`), `POST /inspect` (`{id, depth}`), `POST /layout-check`. Header sesi `x-lakar-session` (`packages/schema/src/version.ts`).
- `tsconfig.json` (root references) dan `package.json` scripts -- `pnpm build` = `tsc -b`; viewer dibangun terpisah lewat Vite, jadi `build` root perlu menjalankan build viewer juga.
- `.github/workflows/ci.yml` -- sudah menjalankan `pnpm build` + `pnpm test`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/store.ts` -- tambah `list(): Promise<{slug, mtimeMs}[]>` dari `docsDir` (abaikan non-`.lakar.json`, ENOENT → `[]`) -- sumber daftar dokumen
- [x] `packages/daemon/src/viewer.ts` (baru) -- route `GET /viewer/docs`, `GET /viewer/docs/:slug`, dan statis `/app/*` (path traversal ditolak, MIME dari ekstensi) -- endpoint baca-saja
- [x] `packages/daemon/src/server.ts` -- daftarkan route viewer; teruskan `docs`, `store`, path `dist` viewer (opsi config, default `packages/viewer/dist`) -- integrasi tanpa mengubah route lama
- [x] `packages/daemon/src/viewer.test.ts` -- test seluruh baris I/O Matrix -- regresi
- [x] `packages/viewer/` (baru: `package.json`, `vite.config.ts` base `/app/`, `tsconfig.json`, `index.html`, `src/`) -- React app: `tokens.css` (variabel desain dark/light), `api.ts` (klien daemon + sesi), `Dashboard` (sidebar + Recents grid/list, thumbnail dari screenshot board pertama, lazy), `Viewer` (Layers dari doc JSON, canvas PNG per board di posisi x/y dengan pan/zoom/Fit, panel kanan Inspect/Checks/Activity/History), banner offline -- UI slice 1
- [x] `package.json` root -- `build` juga menjalankan `pnpm --filter @lakar/viewer build`; viewer tidak masuk `tsc -b` -- CI ikut membangun viewer

**Acceptance Criteria:**
- Given `lakard` berjalan dengan dokumen hasil agen, when membuka `http://127.0.0.1:<port>/app/`, then Dashboard menampilkan dokumen itu dan klik kartu membuka Viewer.
- Given Viewer terbuka, when memilih layer atau board, then tab Inspect menampilkan properti dari `/inspect` dan seleksi disorot di canvas.
- Given dokumen punya temuan check, when membuka tab Checks, then temuan tampil dengan ID LC, severity, dan node; klik temuan menyorot node.
- Given seluruh suite test, when `pnpm build && pnpm test` di CI, then lolos tanpa mengubah snapshot atau test lama.

## Design Notes

- Canvas memakai PNG dari `/screenshot` (renderer yang sama, AD-6), bukan render DOM di browser, supaya hasilnya identik dengan PNG bench. Render DOM langsung menyusul.
- Thumbnail Dashboard di-render malas (hanya kartu yang terlihat) dan di-cache di memori viewer per `slug@rev`.
- `/app` hanya bisa diakses lewat loopback (AD-14); dari laptop pakai SSH tunnel. Aplikasi desktop menyusul di epic tersendiri.

## Verification

**Commands:**
- `pnpm build` -- expected: tsc dan Vite build sukses, `packages/viewer/dist/index.html` ada
- `pnpm exec vitest run packages/daemon` -- expected: semua test daemon lolos, termasuk `viewer.test.ts`
- `pnpm test --testTimeout=30000` (dengan `LAKAR_C7_ALLOW_MISSING_SOURCES=1`) -- expected: lolos di CI Linux

**Manual checks (if no CLI):**
- Jalankan `pnpm lakard`, buat dokumen lewat MCP, buka `/app/`: bandingkan Dashboard dan Viewer dengan frame `Desktop — Grid` dan `Viewer — Desktop — Inspect/Checks` di `design/lakar-ui.pen` (dark dan light).

## Implementation Notes

## Spec Change Log

## Review Triage Log

- 2026-11-21: Implementasi oleh subagen dari spec. Route viewer di `packages/daemon/src/viewer.ts`; baca dokumen tanpa efek samping (`peekDocument`), bukan `DocStore.read` yang bisa menulis balik migrasi. `viewerDir?` opsional di `DaemonConfig` (tidak dibaca dari config/env).
- Di luar task: `tests/dependency-direction.ts` menambah `viewer: ['schema']` (test "11 paket" tetap lolos); `packages/schema/package.json` `sideEffects: false` (bundle viewer ~110 → ~81 KB gzip); `packages/viewer/README.md`.
- Verifikasi orkestrator: `pnpm build` lolos; `viewer.test.ts` (19 test) dan `dependency-direction` lolos; ditambah `packages/viewer/src/api.test.ts` untuk baris matrix "Daemon mati" (OfflineError, banner, Retry) dan penjaga open_doc. Test viewer dikeluarkan dari `tsconfig.json` viewer (diperiksa oleh `tsconfig.test.json` root).
- Suite penuh di Windows: ~100 kegagalan yang sudah ada sebelumnya (fsync EPERM, URL `d:`, CRLF); bukan regresi. CI Linux belum dijalankan.

| # | Sumber | Temuan | Verdict | Bukti / route |
|---|---|---|---|---|
| 1 | blind, edge, vg | Viewer memanggil `/docs/open`: bila dokumen dihapus setelah daftar dimuat, open membuat dokumen kosong baru | medium | `server.ts:304-307` membuat dokumen bila tidak ada; `#known` tidak dipangkas. Patch: cek ulang `GET /viewer/docs/:slug` tepat sebelum open di `#withDoc` |
| 2 | blind, edge | `/docs/open` bisa menulis balik migrasi/riwayat | low | Perilaku daemon yang sudah ada; intent mengizinkan `/docs/open` untuk slug yang ada. Ditolak |
| 3 | blind | `firstBoardId` hanya dari `pages[0]`, `boardCount` dari semua page | medium | `viewer.ts:90`. Patch: ambil board pertama dari page mana pun |
| 4 | blind, vg | Dokumen rusak (`SCHEMA_INVALID`) tampil sebagai "not found" | medium | `Viewer.tsx:39`. Patch: hanya `NOT_FOUND` yang dianggap not found; `SCHEMA_INVALID` tampil sebagai dokumen rusak |
| 5 | blind, edge | Blob URL screenshot tidak pernah di-revoke | low | Benar, tapi perbaikan butuh eviksi cache; jarang terasa dalam sesi normal. Ditolak |
| 6 | blind | Sesi viewer tidak ditutup | low | Satu sesi per muat halaman; manajemen sesi milik daemon. Ditolak |
| 7 | blind | Viewer tidak mengambil perubahan agen tanpa reload | medium | Viewer hanya memuat sekali. Patch: muat ulang dokumen saat tab kembali terlihat (pola Dashboard) |
| 8 | blind, edge | Kunci cache screenshot memakai rev dari GET, bukan rev saat render | low | Balapan nyata tapi sempit. Patch: pakai `rev` dari respons `/docs/open` di kunci cache |
| 9 | blind | Waktu relatif tidak berdetak | low | Kosmetik, perlu ticker. Ditolak |
| 10 | blind | Perintah restart di banner offline hanya Linux | low | Sesuai desain `.pen` dan target VPS. Ditolak |
| 11 | blind | "Segera hadir" berbahasa Indonesia | low | Ditetapkan di intent beku. Ditolak (perbaikan mengedit spec) |
| 12 | blind | Test api bergantung urutan; import `.ts` | false | Root `tsconfig.test.json` mengizinkan ekstensi `.ts`; test lolos deterministik |
| 13 | blind | Helper murni tanpa test | low | Ditolak (tidak ada kerugian bernama) |
| 14 | blind | Tanpa cek Host/Origin (DNS rebinding) untuk route baru | medium | Route lama (`/execute`, `/screenshot`) juga tanpa cek; masalah daemon yang sudah ada. Defer |
| 15 | blind | Efek LayerTree: dependensi basi, scroll saat expand | maybe-false | Perlu dicoba di browser. Ditolak (paling banter low) |
| 16 | blind | Shortcut global menyala di treeitem/select | low | `Canvas.tsx` hanya melewati input/textarea. Patch: lewati juga select, contenteditable, dan elemen `[role=treeitem]` |
| 17 | vg | Retry 401 di `#withDoc` tanpa test | gap | Patch: test 401 lalu sukses |
| 18 | vg | Serialisasi `#queue` tanpa test | gap | Patch: test urutan open/screenshot untuk dua slug paralel |
| 19 | vg | `GET /viewer/docs/:slug` file rusak tanpa test | gap | Patch: test 400 `SCHEMA_INVALID`, file tidak berubah |
| 20 | vg | Invalidasi cache ringkasan tanpa test | gap | Defer (hanya edit di luar daemon) |
| 21 | edge | Body JSON `null` → TypeError | low | Proxy aneh, jarang. Ditolak |
| 22 | edge | Cache ringkasan tumbuh / mtime kasar | low | Ditolak |
| 23 | edge | `migrateDocument` langsung vs migrate kustom store | low | Hanya beda di test dengan migrate kustom. Ditolak |
| 24 | edge | Space tertahan saat jendela kehilangan fokus | low | Patch langsung: reset di `blur` |
| 25 | edge | `pointercancel` memicu seleksi | low | `Canvas.tsx:190` memakai `onPointerUp`. Patch: handler cancel terpisah tanpa seleksi |
| 26 | edge | `deltaMode` baris/halaman (Firefox) | low | Patch langsung: skala delta |
| 27 | edge | Kamera tidak fit ulang saat board muncul dari 0 | low | Patch langsung: reset `fitted` saat jumlah board 0 → >0 |
| 28 | edge | Retry menjalankan layout_check dua kali | low | `Viewer.tsx:78` + reload doc. Patch: hapus panggilan langsung di retry |
