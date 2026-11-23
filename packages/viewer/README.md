# @lakar/viewer

Viewer baca-saja Lakar (Viewer B slice 1): Dashboard (Recents) dan Viewer (Layers, canvas PNG per board,
Inspect, Checks). Vite + React + TS, disajikan `lakard` di `http://127.0.0.1:<port>/app/` (hanya loopback, AD-14).

- **Visual:** `design/lakar-ui.pen` bagian 01–03; token di `src/tokens.css`, dark/light ikut `prefers-color-scheme`.
- **Data:** `GET /viewer/docs`, `GET /viewer/docs/:slug`, lalu sesi sendiri (`POST /sessions`, `client: 'lakar-viewer'`)
  untuk `/docs/open` (hanya slug dari daftar), `/screenshot`, `/inspect`, `/layout-check`. Tidak ada aksi tulis.
- **Arah dependensi:** `viewer → schema` (tipe dan `G0_RULES`).
- Activity, History, cursor agen, dan Export belum ada di slice ini.

## Build dan dev

```bash
pnpm build                          # root: tsc -b lalu build viewer ke packages/viewer/dist
pnpm --filter @lakar/viewer dev     # Vite dev server, proxy ke lakard (LAKARD_URL, default 127.0.0.1:7466)
```

## Tes DOM

Tes komponen viewer berjalan di proyek vitest `viewer-dom` (jsdom, `vitest.config.ts` paket ini); tes logika murni
(`*.test.ts`) tetap di proyek `node` root. `pnpm test` di root menjalankan keduanya dan men-typecheck tes DOM lewat
`tsconfig.test.json`. Latar dan matriks kasus: `_bmad-output/implementation-artifacts/spec-viewer-dom-harness.md`.

```bash
npx vitest run --project viewer-dom                          # semua tes DOM viewer (dari root repo)
npx vitest run --project viewer-dom src/App.dom.test.tsx
```

Cara menulis tes baru:

- Beri nama `src/<Komponen>.dom.test.tsx`. `src/test/setup.ts` sudah memasang matcher jest-dom, stub per tes, dan
  `cleanup`.
- Render dengan `renderUi(<Komponen … />)` dari `src/test/dom.tsx`; hasilnya membawa `user` (`@testing-library/user-event`).
  Viewer tidak punya provider React; `api` dan `activityHub` adalah singleton modul yang diisolasi per file tes.
- Data lakard: daftarkan route dengan `dom().daemon.on('GET', '/viewer/docs/demo', () => ({ doc }))` (kembalikan
  `data`; `throw fail('CONFLICT', 409)` untuk error AD-11). Route tanpa handler membalas 404 `NOT_FOUND`. Periksa
  request lewat `dom().daemon.find('PUT', '/viewer/focus')` (`body`, `headers`, `keepalive`).
- Stream `/viewer/events`: `stream.hello({ sessions, recent })`, `stream.event('call', { call })`, `stream.drop()`
  (hub menyambung ulang sesudah 1 dtk). Event di `recent` memakai `nextSeq()` supaya urutan seq cocok.
- API browser: `reducedMotion(true)` / `setMedia(fn)` untuk `matchMedia`; `dom().animate` mencatat `Element.animate`
  (elemen ada di `mock.contexts`). `ResizeObserver`, pointer capture, `scrollIntoView`, `CSS.escape`, dan
  `URL.createObjectURL` sudah di-stub.
- Dokumen kecil siap pakai di `src/test/fixtures.ts` (`makeDoc(rev, extra)`, board `Board001`, frame `Card0001`).
  Board live benar-benar di-mount ke shadow root; tunggu node-nya dengan `waitFor`.
- Uji perilaku yang terlihat (peran, label, kelas, request), bukan state internal komponen.
