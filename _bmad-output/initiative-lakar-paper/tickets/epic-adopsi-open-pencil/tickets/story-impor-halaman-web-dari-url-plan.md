---
title: 'Impor halaman web dari URL'
type: feature
ticket: '8'
created: '2026-12-20'
status: built
baseline_revision: '9ece3808caa82247ce5e81b7071771405b68379c'
route: full
route_source: auto
risk: high
review: thorough
review_source: auto
lenses_ran: [security-ssrf, general]
review_loop_iteration: 1
followup_review_recommended: false
context:
  - packages/daemon/src/photos/net.ts
  - packages/daemon/src/paste.ts
  - design/README.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Viewer dan agen belum bisa mengimpor halaman web langsung dari URL; hanya paste HTML mentah yang tersedia.

**Approach:** Modul fetch `url-fetch.ts` (anti-SSRF, reuse `photos/net.ts`) + route baru `/viewer/docs/:slug/import-url` dan `/viewer/import-url` yang membuat board berisi hasil `snapshotHtml`+`importHtml`; tool MCP `import_url`; dialog "Import from URL" di viewer sesuai desain section 11.

## Boundaries & Constraints

**Always:** hanya skema `http`/`https`; tolak loopback/link-local/privat (literal IP + hasil DNS via `lookup` + tiap redirect); tanpa kredensial di URL; timeout 15s; body ≤10MB; redirect ≤3 hop; `javaScriptEnabled:false` tetap; semua tulis lewat ops core dalam satu transaksi (undo = satu `inverse`); route lama/tool lama tidak berubah; komentar & spec Indonesia, teks UI Inggris.

**Never:** fetch tanpa permintaan eksplisit; mengubah `paste`/schema `PasteBody`; menyimpan HTML/CSS mentah di dokumen; membuka EventSource baru di viewer; mengeksekusi script/halaman di luar snapshotter terisolasi.

## I/O & Edge-Case Matrix

| Scenario | Input | Output | Error |
|----------|-------|--------|-------|
| HAPPY | `url: https://example.com` → HTML | board baru berisi layer hasil import; `{boardId, nodeId, report, page:{url,finalUrl,title}}` | — |
| SCHEME | `ftp://`/`file://`/`javascript:` URL | — | `SCHEMA_INVALID` 400 (non-retryable) |
| SSRF_LITERAL | `http://127.0.0.1`, `10.x`, `192.168.x`, `169.254.x`, `[::1]`, IPv4-mapped | — | `SCHEMA_INVALID` 400, pesan alamat non-publik |
| SSRF_DNS | host publik resolves ke IP privat | — | `SCHEMA_INVALID` 400 |
| REDIRECT | → URL privat/non-http atau >3 hop | — | `SCHEMA_INVALID` 400 |
| TIMEOUT | server tidak merespons 15s | — | `EXEC_ERROR` retryable |
| SIZE | body >10MB | — | `SCHEMA_INVALID`/`EXEC_ERROR` "terlalu besar" |
| NOT_HTML | content-type bukan html/xhtml | — | `EXEC_ERROR`/`SCHEMA_INVALID` "bukan HTML" |
| HTTP_ERR | 4xx/5xx | — | `EXEC_ERROR` status ikut pesan, retryable untuk 5xx/429 |

</intent-contract>

## Code Map

- `packages/daemon/src/photos/net.ts` — reuse `isBlockedIp`, `NetError`, `USER_AGENT`, pola `lookup`+transport injeksi (`HttpTransport`, `ResolveFn`)
- `packages/daemon/src/url-fetch.ts` — BARU: `checkPageUrl` + `fetchPageHtml` (loop redirect, streaming cap, ekstrak `<title>`)
- `packages/daemon/src/url-import.ts` — BARU: `UrlImportBody`, `registerUrlImportRoutes`, `commitUrlImport` (ops `add` board + `pasteOps` child)
- `packages/daemon/src/paste.ts` — ekstrak/export helper HTML import (`snapshotHtml`→`importHtml`→`Imported`) + export `pasteOps` bila perlu
- `packages/daemon/src/server.ts` — daftarkan `registerUrlImportRoutes`
- `packages/mcp/src/server.ts` — tool `import_url`; `packages/mcp/src/annotations.ts` — `TOOL_EFFECTS['import_url']='write'`; `packages/mcp/src/index.ts` — `TOOL_ROUTES['/viewer/import-url']`
- `packages/viewer/src/api.ts` — `importUrl(slug, body)` via `#write`
- `packages/viewer/src/ImportUrlDialog.tsx` + `importUrl.ts` — BARU: dialog & helper (preset 1440/768/375)
- `packages/viewer/src/AddLayer.tsx`, `EditMenu.tsx`, `Viewer.tsx` — entri menu "Import from URL…" + wiring dialog/toast/undo
- Tes baru: `url-fetch.test.ts`, `url-import.test.ts`, `ImportUrlDialog.dom.test.tsx`

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/url-fetch.ts` — `checkPageUrl(raw)`: parse URL, tolak non-http(s)/kredensial/IP literal blocked; `fetchPageHtml(raw, opts)`: hop loop redirect≤3 (revalidate tiap hop), headers UA+`accept-encoding: identity`, lookup `isBlockedIp`, streaming cap 10MB, charset decode, ekstrak title; opts `resolve`/`transportHttp`/`transportHttps` untuk tes — inti anti-SSRF
- [x] `packages/daemon/src/url-fetch.test.ts` — unit: semua baris I/O matrix via transport/resolver palsu
- [x] `packages/daemon/src/paste.ts` — ekstrak `importHtmlPage(opts, html, width, name)` dari cabang HTML `importContent`; export `pasteOps`/`countNodes` bila belum — reuse tanpa ubah perilaku
- [x] `packages/daemon/src/url-import.ts` — `registerUrlImportRoutes(app, opts)` (`opts.page` injeksi `PageFetch`); dua route; fetch di luar lock; ops `[add board(ref 'import'), ...pasteOps(node,{id:'@import'})]`; board `screen` default dari width (≥1024 landing, ≥600 app, else mobile), height=`imported.height`, posisi default kanan board terakhir +80; error `NetError`→mapping LakarError; `RENDER_FAILED` bila tanpa snapshotter — route utama
- [x] `packages/daemon/src/url-import.test.ts` — route: happy (fetch+snapshot palsu), SSRF literal/skema, page salah, route sesi MCP, inverse undo
- [x] `packages/daemon/src/server.ts` — `registerUrlImportRoutes(app, {...shared, html: snapshotter()})` — wiring
- [x] `packages/mcp/src/{annotations,index,server}.ts` — `import_url` write-tool: `url` wajib, `pageId`/`width`/`name`/`screen`/`x`/`y`/`description` opsional → `/viewer/import-url`; `targetOf` pakai `url` — akses agen
- [x] `packages/viewer/src/{importUrl.ts,ImportUrlDialog.tsx}` — dialog per desain 11: Page address, preset Desktop 1440/Tablet 768/Mobile 375, catatan "Public http(s) only · 15s · 10MB", Cancel/Import page; busy→langkah "Fetched page → Rendered → Converting to layers"; error→danger+Try again — UI utama
- [x] `packages/viewer/src/api.ts` — `importUrl` via `#write` + types — akses daemon
- [x] `packages/viewer/src/{AddLayer,EditMenu,Viewer}.tsx` — item "Import from URL…" (ikon `link2`) di menu Add layer & context menu; state dialog; sukses→`recordCommit` inverse + pilih board + `loadDoc` + toast — wiring
- [x] `packages/viewer/src/ImportUrlDialog.dom.test.tsx` — DOM: buka dari "+", validasi, POST body `{url,pageId,width,screen}`, progress/error/Try again, sukses→board terpilih — verifikasi dialog

**Acceptance Criteria:**
- Given daemon dengan render+HTML importer, when POST `/viewer/docs/:slug/import-url` `{url, width:1440}` ke URL publik valid, then dokumen bertambah satu board (width 1440) berisi layer hasil halaman, satu rev, satu entri riwayat, inverse mengembalikan dokumen.
- Given URL loopback/privat/skema non-http(s), when route dipanggil, then 400 `SCHEMA_INVALID` dan `fetch` transport tidak pernah dipanggil untuk literal.
- Given server lambat/body besar/redirect jahat, when fetch berjalan, then timeout 15s / cap 10MB / validasi ulang tiap hop berlaku.
- Given viewer terbuka, when "+"/context menu → "Import from URL…" → isi URL → Import, then POST terkirim, progress tampil, board baru terpilih, toast sukses muncul; error tampil danger + Try again.
- Given paste HTML biasa, when Ctrl+V text/html, then tidak ada request jaringan eksternal apa pun (pipeline lama utuh).
- Given agen MCP, when memanggil `import_url`, then board+layer terbuat via `/viewer/import-url`; tool `paste` dan anotasi lama tidak berubah.

## Implementation Notes

- `checkPageUrl` melepas kurung IPv6 (`[::1]`) sebelum `isIP`/`isBlockedIp` — `url.hostname` mempertahankan kurung, dan bentuk `::ffff:` hex dianggap non-publik oleh `isBlockedIp`.
- `guardedLookup` membungkus `Resolver` — IP literal lewat lookup koneksi juga difilter (lapis kedua); transport tes memaksa `protocol:'http:'`+port server lokal.
- `importHtmlPage` mengangkat `HtmlImportError` → `SCHEMA_INVALID` dan menolak pohon > `OPS_MAX - 1` node.
- Entry point UI = menu "+" Add layer ("Import page from URL…", ikon `link`), bukan EditMenu — EditMenu berlaku untuk seleksi layer, impor adalah aksi level page. `EditMenu.tsx` tidak diubah.
- `importPage` (Viewer): guard `editableRef`/`editing.current`, `editing.current--` di `finally`; sukses → `recordCommit` inverse, pilih `boardId`, `PasteToast` judul "Imported N layers from <host>".
- Tes pemetaan error route memakai satu daemon dengan `impl` fetch yang diganti per kasus (menghindari 6× build server → timeout 5 s di suite penuh Windows).
- Dialog: `Modal` dari `NewFileDialog.tsx` (tanpa prop `locked` — Escape/scrim dijaga `tryClose` saat `busy||submitting`).

## Plan Change Log

## Review Triage Log

Dua review subagen paralel, keduanya verdict **SHIP** tanpa blocker.

**Lensa security-SSRF (SHIP).** Temuan dan tindakan:
- FIXED — validasi dokumen/`pageId` dipindah SEBELUM fetch jaringan di `commitUrlImport` (sebelumnya target tak valid tetap memicu request).
- FIXED — target Activity `import_url` diremang lewat `urlTarget()` di `events.ts`: hanya `host+pathname`, query/fragment/kredensial (signed URL) tidak bocor.
- FIXED — regex charset dikelompokkan `charset\s*=\s*"?(?:latin1|iso-8859-1|windows-1252)` (alternasi sebelumnya melebar).
- FIXED — regex `<title(?:\s[^>]*)?>` (tidak lagi cocok `<titlex>`); karakter kontrol dibuang; tes literal SSRF ditambah (desimal/hex/short IPv4, IPv6 zone-id).
- ACCEPTED (low) — `file:`/data URL di header `Link`/`refresh` tidak diikuti karena redirect hanya lewat `Location` HTTP; tidak ada cookies/header auth terkirim.

**Lensa umum (SHIP).** Temuan dan tindakan:
- FIXED — heading dialog: `.modal-text` `<h2>Import from URL</h2>` + copy penjelas (konvensi modal sibling).
- FIXED — radiogroup preset: roving `tabIndex` + arrow-key memindah pilihan/fokus + Enter submit (pola `presetKey` `NewFileDialog`).
- FIXED — markup progres valid: spinner dibungkus `<li>` di dalam `<ol>`.
- FIXED — label undo toast: `PasteToastState.undoLabel` → "Undo import" untuk impor (bukan hardcode "Undo paste").
- FIXED — tes `api.importUrl` (mirroring `api.paste`) + `importUrl.test.ts` (validPageUrl/importToastTitle/preset); komentar header `api.ts` menyebut route paste/import-url.
- FIXED — dialog impor ikut ditutup saat masuk pratinjau versi; pesan error lokal read-only diperjelas.
- DEFERRED — tes DOM level Viewer untuk alur menu "+" → dialog → sukses (cakupan sudah ada di dom.test dialog + api test; integrasi Viewer diserahkan ke e2e bila dibutuhkan).

## Design Notes

- Board vs paste-into-board: desain section 11 = salinan dialog New file dengan "Board width" → hasilnya board baru di page, bukan child board terpilih (keputusan dicatat karena ambigu di tiket).
- Port: izinkan semua port pada host publik (blok IP tetap berlaku); pembatasan port SafeNet (443) khusus allowlist API-key, tidak relevan di sini.
- Board height = tinggi konten hasil snapshot; root dipin (0,0) via `pasteOps(node,{id:'@import'}, {x:0,y:0})`.
- Fetch di luar docLock (I/O panjang); commit di dalam lock, sama dengan pola `commitPaste`.

## Verification

**Commands:**
- `set "PATH=%TEMP%\lakar-pnpm;%LOCALAPPDATA%\nvm\v26.5.0;%PATH%"` sebelum pnpm
- `pnpm --filter @lakar/daemon test -- url-fetch url-import` — expected: semua tes baru hijau
- `pnpm --filter @lakar/viewer test -- ImportUrlDialog` — expected: tes DOM hijau
- `pnpm build` — expected: sukses
- `set LAKAR_C7_ALLOW_MISSING_SOURCES=1 && pnpm test` — expected: tidak ada kegagalan baru vs baseline Windows

**Results (Windows, Node 26.5.0):**
- `pnpm build`: sukses (tsc -b + vite); `tsc -p tsconfig.test.json` + `tsconfig.test.json` viewer: bersih.
- `url-fetch.test.ts` + `url-import.test.ts`: 13/13 hijau; `ImportUrlDialog.dom.test.tsx` 6/6; `importUrl.test.ts` + `api.test.ts` 25/25; `annotations.test.ts` + `index.test.ts` (mcp) 35/35 — termasuk asersi 20 tool dan forwarding `import_url`.
- `pnpm test` penuh: 81 gagal / 2850 lolos / 20 skip — semua kelas kegagalan Windows baseline yang diketahui (timeout hook Chromium, SIGTERM/SIGKILL, kunci foto 644, hash CRLF skill/bench/judge, ENOTEMPTY temp dir, timeout 5 s di bawah beban). Dua timeout sempat menyentuh tes baru/sesama-paste di bawah beban penuh; `url-import` diperbaiki (satu daemon + fetch yang bisa ditukar) dan keduanya hijau saat dijalankan fokus.
- Paste HTML biasa tetap bebas jaringan: route paste tidak menerima `pageFetch` (jaminan struktural); laporan snapshot memuat `requests` terblokir; `calls` di tes sesi hanya berisi URL eksplisit.
