---
title: 'Seleksi efemeral di daemon dan tool MCP get_selection (epic agen-di-canvas story 2)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: 'c8c06605584a794ccc02a1256a4963bbc667db24'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Agen di harness tidak tahu node mana yang sedang dipilih pengguna di canvas, sehingga permintaan seperti "buat varian dari frame ini" tidak bisa dikerjakan. AD-9 menetapkan seleksi sebagai state efemeral di daemon yang dikirim viewer, disiarkan lewat `/viewer/events`, dan dibaca agen lewat tool MCP baru.

**Approach:** Daemon mendapat penyimpanan seleksi di memori per dokumen, route `PUT`/`GET /viewer/docs/:slug/selection`, event bus baru `selection`, dan route sesi `POST /viewer/selection` untuk tool MCP baru `get_selection` (slug, rev, alamat, ringkasan node: tipe, nama, board, bounds terukur). Viewer melaporkan seleksi canvas (debounce) lewat modul kecil yang bisa dites, tanpa UI baru.

## Boundaries & Constraints

**Always:**
- Seleksi hanya di memori proses daemon (Map per slug); tidak pernah ditulis ke file dokumen, `history.jsonl`, snapshot, maupun menaikkan `rev`. Restart daemon = kosong.
- Isi seleksi = daftar alamat node: ID (`[A-Za-z0-9]{8}`) atau alamat komposit AD-12 (`id/id[/id…]`), maks `SELECTION_MAX` (500), duplikat dibuang dengan urutan pertama dipertahankan. Alamat tidak dicek keberadaannya saat disimpan.
- Route tulis di bawah `/viewer/*` dan kena guard Origin yang ada (lintas-origin → 403).
- Perubahan seleksi (isi berbeda dari sebelumnya) disiarkan sebagai event SSE `selection` `{seq, type:'selection', selection:{slug, addresses, rev, origin?}}` hanya ke pelanggan `subscribeAll`; tidak masuk ring `hello`.
- Seleksi dokumen yang di-rename (slug lama), diarsipkan, atau dihapus dibersihkan dari memori.
- `get_selection` tanpa `slug` memakai dokumen aktif sesi; tanpa dokumen aktif memakai dokumen dengan seleksi yang paling akhir berubah (PUT dengan isi sama tidak dihitung); keduanya tidak ada → `NO_ACTIVE_DOC`. `rev` = rev dokumen saat dibaca.
- Penulis terakhir per dokumen menang, kecuali seleksi kosong dari jendela yang bukan pemilik seleksi tersimpan (origin berbeda): diabaikan, agar jendela yang ditutup tidak menyapu seleksi jendela lain yang masih tampil.
- Route seleksi tidak menulis apa pun ke disk: dokumen yang belum dimuat dibaca tanpa efek samping (`peekDocument`).
- Viewer: satu `PUT` per perubahan seleksi sesudah debounce 150 ms; seleksi sama dengan yang terakhir terkirim tidak dikirim ulang; stream tersambung ulang → kirim ulang seleksi terakhir; Viewer di-unmount dengan seleksi terkirim tidak kosong → kirim `[]`. Gagal kirim diabaikan diam-diam (tanpa toast), dan seleksi itu boleh dikirim lagi pada perubahan berikutnya.
- Bahasa: komentar/spec Indonesia; deskripsi tool mengikuti gaya deskripsi tool yang ada (Indonesia), teks UI Inggris.

**Never:**
- Tidak mengubah tool MCP, route, bentuk respons, atau pesan error lama (AD-4); hanya menambah.
- Tidak menambah elemen UI baru (badge seleksi dibagikan milik story 3 sesuai desain story 1); tidak menyentuh `design/lakar-ui.pen`.
- Viewer tidak membuka `EventSource` sendiri dan tidak mengimpor core/exec/icons.
- Tidak menerjemahkan alamat komposit menjadi node hasil ekspansi instance (instance belum ada di skema; alamat komposit dilaporkan `missing`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Set seleksi | `PUT /viewer/docs/kopi/selection` `{addresses:[A,B,A]}` header `x-lakar-origin: w1` | 200 `{slug, rev, addresses:[A,B]}`; event `selection` `{slug, addresses:[A,B], rev, origin:'w1'}` | — |
| Set sama | PUT isi yang sama lagi | 200, tanpa event baru | — |
| Kosongkan | `{addresses:[]}` dari jendela pemilik seleksi (origin sama) atau tanpa `x-lakar-origin` | 200 `addresses:[]`; event; entri slug dihapus dari memori | — |
| Kosong dari jendela lain | seleksi milik `w1`; `{addresses:[]}` dengan `x-lakar-origin: w2` (mis. jendela w2 ditutup) | 200 dengan seleksi `w1` tetap; tanpa event | — |
| Alamat komposit | `{addresses:['Aaaaaaaa/Bbbbbbbb']}` | diterima | — |
| Bentuk salah | alamat `'abc'`, `'A/B'`, bukan array, > 500, kunci asing | 400 `SCHEMA_INVALID` | tanpa perubahan |
| Dokumen tak ada / slug salah | slug belum ada / pola salah | 404 `NOT_FOUND` / 400 `SCHEMA_INVALID` | — |
| Origin asing | `origin: https://evil.example` | 403 | seleksi tetap |
| Baca viewer | `GET /viewer/docs/kopi/selection` | `{slug, addresses, updatedAt?}` | 404 dokumen tak ada |
| get_selection | sesi dengan dokumen aktif kopi, seleksi [frame F, board B, X hilang, komposit] | `{slug, rev, addresses, nodes:[{address, id, type, name, boardId, bounds}], missing:[X, komposit]}`; bounds relatif board (board = `[0,0,w,h]`) | — |
| Render gagal | board seleksi tidak bisa diukur | node tanpa `bounds`; `unmeasured:[{boardId, code, message}]` | tidak gagal total |
| Seleksi kosong | belum ada seleksi | `{slug, rev, addresses:[], nodes:[]}` tanpa render | — |
| Tanpa dokumen aktif | sesi belum open_doc, tidak ada seleksi di dokumen mana pun | 409 `NO_ACTIVE_DOC` | hint: pilih node di viewer atau open_doc |
| `slug` eksplisit | `{slug:'lain'}` | seleksi dokumen `lain` | slug tak ada → 404 |
| Rename/arsip/hapus | event `change` rename/archive/delete | seleksi slug lama/terkait dibuang | — |
| Restart | daemon baru | GET/get_selection → `addresses:[]` | — |

</intent-contract>

## Code Map

- `packages/daemon/src/events.ts` -- `ActivityBus` (`change` tanpa ring, `#broadcast`, `subscribeAll`), SSE `/viewer/events`, `TOOL_ROUTES` (nama tool di Activity).
- `packages/daemon/src/server.ts` -- guard Origin `onRequest`, `activeDoc`, `docs`, `render.measure`, `assertIcons`, pendaftaran route.
- `packages/daemon/src/ops.ts` -- pola route `/viewer/docs/:slug/*` (validasi slug, `store.read`, `originOf`).
- `packages/daemon/src/inspect.ts` -- `locateNode`, `boundsMap` (bounds relatif board).
- `packages/schema/src/nodes.ts` -- `ID_PATTERN`.
- `packages/mcp/src/server.ts`, `packages/mcp/src/index.test.ts` -- registrasi tool, `asText`, daemon tiruan dan tes daftar tool.
- `packages/viewer/src/api.ts` -- `request` (method), klien `api`.
- `packages/viewer/src/activity.ts` -- tipe stream, `applyEvent`, `connectActivity` (listener per jenis event), `callTitle`.
- `packages/viewer/src/Viewer.tsx` -- state `selection: string[]`, `activityHub.listen`.
- `packages/viewer/src/harnesses.ts` -- `MCP_TOOLS` (daftar di halaman Connections).

## Tasks & Acceptance

**Execution:**
- [x] `packages/schema/src/selection.ts` -- baru: `NODE_ADDRESS_PATTERN` (`^[A-Za-z0-9]{8}(/[A-Za-z0-9]{8})*$`), `SELECTION_MAX = 500`, `isNodeAddress`; ekspor dari `index.ts` -- satu definisi bentuk alamat untuk daemon dan viewer.
- [x] `packages/daemon/src/events.ts` -- tipe `DocSelection`/`SelectionEvent`, `BusEvent` mencakupnya; `ActivityBus.selection(sel)` (seq naik, hanya `subscribeAll`); SSE menulis `event: selection`; `TOOL_ROUTES['/viewer/selection'] = 'get_selection'`.
- [x] `packages/daemon/src/selection.ts` -- baru: `SelectionStore` (set/get/clear/latest/onFileChange, dedupe), fungsi murni `summarizeSelection(stored, addresses, measured)`, dan `registerSelectionRoutes` (PUT/GET `/viewer/docs/:slug/selection`, POST `/viewer/selection`).
- [x] `packages/daemon/src/server.ts` -- buat `SelectionStore` (juga `Daemon.selections`), daftarkan route dengan `docs`, `store`, `sessions`, `activity`, `render`, `assertIcons`; `registerFileRoutes` mendapat `onChange` → `selections.onFileChange`.
- [x] `packages/daemon/src/files.ts` -- opsi `onChange?(change)` dipanggil di `notify` -- seleksi slug yang di-rename/diarsipkan/dihapus dibuang tanpa pelanggan bus permanen (jumlah listener SSE di events.test.ts tetap).
- [x] `packages/daemon/src/selection.test.ts` -- baru: matriks I/O (set, dedupe, sama tanpa event, kosong, komposit, bentuk salah, 404, Origin 403, GET, get_selection dengan bounds/missing/unmeasured, slug eksplisit, fallback terbaru, NO_ACTIVE_DOC, file/history/rev tidak berubah, rename/delete membersihkan, daemon baru kosong, SSE `event: selection`).
- [x] `packages/mcp/src/server.ts` -- tool `get_selection` `{slug?}` → `POST /viewer/selection`, `GET_SELECTION_DESCRIPTION`; komentar daftar tool.
- [x] `packages/mcp/src/index.test.ts` -- daftar tool + `get_selection` (argumen diteruskan, teks JSON, error terformat).
- [x] `packages/viewer/src/api.ts` -- `request` menerima `PUT`; `putSelection(slug, addresses)` (langsung, bukan antrean tulis).
- [x] `packages/viewer/src/selectionSync.ts` -- baru: `SelectionReporter` (debounce, dedupe terkirim, `resend`, `dispose` → `[]`, timer & send dapat disuntik).
- [x] `packages/viewer/src/selectionSync.test.ts` -- baru: debounce, dedupe, resend, dispose, error diabaikan.
- [x] `packages/viewer/src/Viewer.tsx` -- pasang reporter per slug lewat `attachSelectionReporter` (selectionSync.ts, teruji): `update(selection)` tiap perubahan, `resend` pada `onReconnect`, `dispose` saat unmount.
- [x] `packages/viewer/src/activity.ts` -- tipe `SelectionEvent` di `StreamEvent`, `applyEvent` mengabaikannya (hanya seq), `connectActivity` mendengar `selection`, `callTitle` `get_selection` → "Read selection".
- [x] `packages/viewer/src/activity.test.ts`, `packages/viewer/src/api.test.ts` -- tes event `selection` diteruskan hub dan tidak mengubah Activity; `putSelection` path/method/body.
- [x] `packages/viewer/src/harnesses.ts` -- tambah `get_selection` ke `MCP_TOOLS`.

**Acceptance Criteria:**
- Given viewer membuka dokumen dan pengguna memilih node A dan B di canvas, when agen memanggil `get_selection` lewat MCP, then hasilnya memuat `addresses:[A,B]` dan ringkasan tipe, nama, dan bounds keduanya.
- Given seleksi pernah di-set, when file dokumen, `history.jsonl`, dan `rev` diperiksa, then tidak ada yang berubah; when daemon di-restart, then `get_selection` mengembalikan `addresses:[]`.
- Given pelanggan `/viewer/events`, when seleksi berubah, then pelanggan menerima `event: selection` berisi slug dan alamat; tool MCP dan route lama tetap lulus tesnya.

## Spec Change Log

### 2026-11-22 — Review pass 1 (intent_gap diputuskan atas delegasi "terima jadi")
- Pemicu: blind/edge/intent — `dispose()` jendela yang ditutup mengirim `[]` dan menyapu seleksi jendela lain pada dokumen yang sama (last writer wins).
- Diubah (di dalam `<intent-contract>`, keputusan delegasi): Always mendapat aturan "kosong dari jendela bukan pemilik diabaikan", fallback `get_selection` = perubahan terakhir (PUT isi sama tidak dihitung), `rev` = rev saat dibaca, dan route seleksi tanpa tulis disk (`peekDocument`). Matriks mendapat baris "Kosong dari jendela lain".
- Keadaan buruk yang dihindari: agen membaca seleksi kosong padahal jendela lain masih menampilkan seleksi; selection read menulis balik migrasi tanpa kunci; fallback salah dokumen saat jam sama atau resend.
- KEEP: route, event, tool, dan bentuk respons tetap; reporter debounce/resend/dispose tetap; pembersihan rename/arsip/hapus lewat `onChange` files.ts.

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 34 findings — high 0, medium 8, low 16, false 10, maybe-false 0
- findings:
  - `[medium]` `[intent_gap]` (blind) `dispose()` bisa menyapu seleksi jendela lain — Diputuskan dan diterapkan: `SelectionStore.set` mengabaikan `[]` dari origin yang bukan pemilik seleksi tersimpan (klien tanpa origin dan pemilik tetap bisa mengosongkan); tes unit di selection.test.ts; smoke msedge dua jendela lulus.
  - `[false]` `[reject]` (blind) ID dokumen lama terkirim ke slug baru saat navigasi — App.tsx:185 me-mount `Viewer` dengan `key={route.slug}`, jadi state `selection` dan reporter baru per slug; tidak ada state lama yang terbawa.
  - `[low]` `[patch]` (blind) `latest()` tie ms dan PUT tanpa perubahan menyegarkan waktu — Isi sama kini mengembalikan entri lama tanpa menyentuh waktu/urutan; `latest()` memakai urutan Map (entri berubah dipindah ke akhir), bukan perbandingan jam.
  - `[false]` `[reject]` (blind) syarat `!c.archived` di `onFileChange` terbalik — `archive` di files.ts tidak membawa `archived`; `delete` dengan `archived:true` = salinan arsip yang dihapus, dokumen aktif ber-slug sama harus tetap; komentar ditambahkan dan dipin tes (lihat baris vgap).
  - `[low]` `[reject]` (blind) `POST /viewer/selection` tanpa batas biaya ukur — Dokumen nyata punya sedikit board; ukur sama dengan `inspect` per board; batas/cache menambah mekanisme untuk kasus yang jarang ditemui.
  - `[low]` `[reject]` (blind) `summarizeSelection` dua kali — 2×N jalan pohon untuk N ≤ 500 tidak terukur; perombakan tidak memberi manfaat yang terasa.
  - `[low]` `[patch]` (blind) `ActivityBus.selection` tanpa tes unit — Ditambah tes di events.test.ts: tidak sampai ke `subscribe`, tanpa ring, field kosong dibuang, seq berbagi dengan `change`.
  - `[medium]` `[patch]` (blind) wiring Viewer tanpa tes — Dipindah ke `attachSelectionReporter` (selectionSync.ts) dan dites (awal, update, reconnect → resend, dispose → `[]` + lepas listener); Viewer tinggal memanggilnya.
  - `[low]` `[reject]` (blind) spec/dokumen kurang (GET membawa `rev`, deferred, HANDOVER, instruksi agen) — perbaikan mengedit spec build ini atau file konteks orkestrator; alur skill `get_selection` milik story 4.
  - `[false]` `[reject]` (blind) dampak bench G1 dari tool baru — AD-4 mencabut pembekuan bench dan mengizinkan tool baru; AGENTS.md hanya membekukan tool lama; tes bench lulus seperti baseline.
  - `[low]` `[reject]` (blind) viewer mengirim seleksi untuk dokumen hilang — hanya terjadi sesudah dokumen dihapus saat terbuka; 404 diabaikan; guard state menambah cabang untuk kasus jarang.
  - `[low]` `[reject]` (edge) PUT berpacu dengan arsip/hapus meninggalkan seleksi yatim — jendela waktu sangat sempit (di antara baca dokumen dan set); dampak hanya fallback 404 sampai seleksi berubah; kunci dokumen menambah ketergantungan.
  - `[low]` `[reject]` (edge) `latest()` menunjuk slug yang sudah hilang → 404 — hanya bila file dihapus dari luar aplikasi; agen tetap bisa `open_doc`/`slug`; pemulihan fallback menambah cabang.
  - `[medium]` `[patch]` (edge) `store.read` tanpa kunci bisa menulis balik migrasi/riwayat — `loadDoc` kini memakai `peekDocument` (tanpa efek samping, seperti export.ts dan viewer.ts).
  - `[low]` `[patch]` (edge) tie milidetik di `latest()` — sama dengan baris `latest()` blind (urutan Map).
  - `[low]` `[patch]` (edge) PUT identik menyegarkan `updatedAt` — sama dengan baris `latest()` blind (entri lama dikembalikan).
  - `[medium]` `[intent_gap]` (edge) dispose menyapu seleksi jendela lain — sama dengan baris dispose blind (aturan pemilik).
  - `[low]` `[patch]` (edge) `#sent` diperbarui sebelum kirim sukses — Gagal kirim kini memulihkan `#sent` sebelumnya sehingga seleksi yang sama dikirim lagi; tes selectionSync.
  - `[low]` `[reject]` (edge) PUT tumpang tindih tiba tak berurutan — debounce 150 ms membuat tumpang tindih jarang; serialisasi menambah antrean baru.
  - `[false]` `[reject]` (edge) PUT seleksi mengubah status offline global — `setOffline(true)` hanya saat fetch gagal (daemon memang tak terjangkau) dan `false` saat respons tiba; status mencerminkan keadaan nyata seperti permintaan lain.
  - `[false]` `[reject]` (edge) `findBoard` undefined tanpa catatan `unmeasured` — board ditemukan `locateNode` di dokumen tersimpan selalu ada di hasil `resolveDocument` (board tidak pernah dibuang resolve).
  - `[medium]` `[patch]` (edge) klaim: seleksi bisa menulis file — sama dengan baris `store.read` (kini `peekDocument`).
  - `[false]` `[reject]` (edge) klaim: gagal kirim tidak diam — "diam" berarti tanpa toast/error UI; banner offline mencerminkan daemon yang memang tak terjangkau.
  - `[low]` `[reject]` (edge) klaim: seleksi dokumen terarsip bisa tersisip ulang — sama dengan baris pacu PUT/arsip.
  - `[medium]` `[patch]` (vgap) wiring Viewer → reporter tidak terverifikasi — sama dengan baris wiring blind (`attachSelectionReporter` + tes).
  - `[low]` `[patch]` (vgap) cabang `!c.archived` tidak dipin — Tes `onFileChange` di selection.test.ts: delete salinan arsip mempertahankan seleksi; rename/archive/delete aktif membuang; `edit` diabaikan.
  - `[medium]` `[patch]` (intent) D1 verify end-to-end hanya unit — wiring kini teruji (baris wiring); alur viewer → daemon → `get_selection` dibuktikan smoke msedge; tes integrasi daemon + MCP sungguhan milik story 4 (verify-nya).
  - `[false]` `[reject]` (intent) D2 route tambahan — AD-4/AD-9 meminta route baru di `/viewer/*` dan tool baru; agen butuh route baca; tambahan bersifat aditif.
  - `[false]` `[reject]` (intent) D3 teks UI baru — tidak ada elemen baru; baris Activity dan daftar Connections adalah komponen lama yang menampilkan data tool baru (tanpa judul pun baris tampil sebagai `get_selection`).
  - `[medium]` `[intent_gap]` (intent) D4 jalur pengosongan tambahan — (a) sama dengan baris dispose (aturan pemilik); (b) rename/arsip/hapus: dokumen yang tidak ada lagi tidak punya seleksi yang bermakna (konsisten AD-9).
  - `[low]` `[intent_gap]` (intent) D5 arti `rev` — Diputuskan: rev dokumen saat dibaca, konsisten dengan `list_boards`/`inspect` (nama, tipe, bounds dihitung pada rev itu); keusangan terlihat dari `missing`/`updatedAt`; dicatat di Always.
  - `[false]` `[reject]` (intent) D6 alamat komposit tanpa ringkasan — skema belum punya instance, jadi tidak ada node hasil ekspansi yang bisa diringkas; Never mencatatnya.
  - `[low]` `[intent_gap]` (intent) D7 fallback dokumen vs yang ditampilkan — Diputuskan: dokumen aktif sesi menang karena `execute`/`inspect` bekerja pada dokumen aktif dan alamat harus cocok; sumber seleksi tetap satu (daemon); `slug` eksplisit tersedia.
  - `[false]` `[reject]` (intent) D8 tes MCP lama diedit — hanya ekspektasi daftar/jumlah tool yang wajib berubah saat tool ditambah; perilaku tool lama tidak disentuh.

## Design Notes

- **Route baca agen.** `POST /viewer/selection` (sesi, body `{slug?}`) dipilih karena AD-4 mewajibkan route baru di `/viewer/*`; tanpa header `Origin` (MCP) guard tidak berlaku. Didaftarkan di `TOOL_ROUTES` supaya muncul di Activity seperti tool lain (judul "Read selection" memakai komponen baris yang ada).
- **Bounds.** Diukur `render.measure` per board unik pada dokumen ter-resolve, sama dengan `inspect` (relatif board, dibulatkan). Berbeda dari `inspect`, kegagalan ukur tidak menggagalkan tool: ID tetap berguna bagi agen.
- **Alamat komposit.** Bentuk diterima sekarang (AD-12) supaya klien tidak perlu berubah saat instance hadir; sampai itu, alamat yang tidak ditemukan (termasuk komposit) dilaporkan di `missing`.
- **Seleksi per dokumen, penulis terakhir menang.** Beberapa jendela pada dokumen yang sama saling menimpa; `origin` disertakan di event agar story 3 bisa membedakan gema sendiri. Pengecualian (review pass 1): `[]` dari jendela yang bukan pemilik seleksi tersimpan diabaikan, jadi jendela yang ditutup atau pindah dokumen tidak menyapu seleksi jendela lain yang masih tampil. Tanpa field baru: pemilik = `x-lakar-origin` yang sudah dikirim viewer.
- **`rev` dan fallback (review pass 1).** `rev` = rev dokumen saat dibaca (seperti `list_boards`/`inspect`). Tanpa dokumen aktif, fallback memilih dokumen yang seleksinya terakhir *berubah* (urutan Map, bukan jam).
- **Kirim ulang saat reconnect.** Daemon restart mengosongkan seleksi (AD-9); viewer yang masih terbuka mengirim ulang seleksinya saat stream tersambung lagi, sehingga agen membaca seleksi yang sedang ditampilkan.
- **Tab/jendela ditutup.** Menutup tab browser tidak me-unmount React, jadi seleksi terakhir tetap di daemon sampai jendela lain menimpanya, dokumen di-rename/diarsipkan/dihapus, atau daemon restart. Diterima: seleksi basi hanya berisi alamat, dan `get_selection` melaporkan node yang hilang di `missing`.
- **Tanpa desain baru.** Story ini tidak menambah elemen visual; desain .pen tidak dibaca karena tidak ada UI yang dikodekan. Badge "seleksi dibagikan" ditunda ke story 3.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 exec vitest run packages/daemon/src/selection.test.ts packages/daemon/src/events.test.ts packages/mcp/src/index.test.ts packages/viewer/src` -- expected: hijau.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan di luar baseline Windows `%TEMP%\lakar-fail-base.txt`.

**Manual checks (if no CLI):**
- Smoke msedge (playwright-core) terhadap daemon lokal dengan data dir sementara: pilih node di canvas, lalu `POST /viewer/selection` (sesi) mengembalikan alamat yang sama.

## Auto Run Result

**Ringkasan.** Seleksi canvas kini dilaporkan viewer ke daemon (`PUT /viewer/docs/:slug/selection`, debounce 150 ms) dan disimpan hanya di memori per dokumen. Perubahan disiarkan sebagai event SSE `selection`. Agen membacanya lewat tool MCP baru `get_selection` (`POST /viewer/selection`): slug, rev, alamat, dan ringkasan node (tipe, nama, board, bounds terukur), plus `missing`/`unmeasured`. Route dan tool lama tidak berubah.

**File berubah.**
- `packages/schema/src/selection.ts` (baru), `index.ts` -- pola alamat node (ID/komposit) dan `SELECTION_MAX`.
- `packages/daemon/src/selection.ts` (baru) -- `SelectionStore` (aturan pemilik, urutan perubahan, `onFileChange`), `summarizeSelection`, route PUT/GET/POST seleksi (`peekDocument`).
- `packages/daemon/src/events.ts` -- event `selection` (hanya `subscribeAll`), `TOOL_ROUTES` `get_selection`.
- `packages/daemon/src/files.ts` -- kait `onChange` di `notify`.
- `packages/daemon/src/server.ts` -- `SelectionStore`, pendaftaran route, `Daemon.selections`.
- `packages/mcp/src/server.ts`, `index.ts` -- tool `get_selection` + deskripsi.
- `packages/viewer/src/selectionSync.ts` (baru) -- `SelectionReporter` + `attachSelectionReporter`.
- `packages/viewer/src/Viewer.tsx`, `api.ts`, `activity.ts`, `harnesses.ts` -- wiring reporter, `putSelection`, event `selection` di stream, judul "Read selection", daftar tool Connections.
- Tes: `packages/daemon/src/selection.test.ts` (baru), `events.test.ts`, `packages/mcp/src/index.test.ts`, `packages/viewer/src/selectionSync.test.ts` (baru), `activity.test.ts`, `api.test.ts`.

**Temuan review (34).**
- Patch (6 entri): `latest()`/PUT identik (low), tes `ActivityBus.selection` (low), wiring Viewer → `attachSelectionReporter` + tes (medium), `peekDocument` tanpa efek samping (medium), `#sent` dipulihkan saat gagal (low), tes cabang `archived` (low). Ditambah keputusan intent_gap "kosong dari jendela bukan pemilik diabaikan" (medium) yang diterapkan di kode.
- intent_gap diputuskan tanpa perubahan kode: arti `rev` (rev saat dibaca), fallback dokumen aktif menang.
- Deferred: tidak ada.
- Rejected (low): batas biaya ukur, `summarizeSelection` ganda, kekurangan spec/dokumen (edit spec/konteks; alur skill milik story 4), seleksi untuk dokumen hilang, pacu PUT vs arsip/hapus (2 baris), fallback ke slug hilang, PUT tumpang tindih. Alasan per baris ada di Review Triage Log.
- False (10): navigasi slug (Viewer di-key slug), syarat `!archived`, bench G1, offline global (2), `findBoard` undefined, route tambahan, teks UI, komposit, tes MCP lama.

**Rekomendasi review lanjutan.** Patched menurut verdict entri: high 0, medium 3 (wiring Viewer, `peekDocument`, aturan pemilik), low 4. Itu memicu `true` karena risiko perilaku UI multi-jendela belum terverifikasi. Smoke msedge diulang pada kode yang sudah dipatch dan lulus, jadi `followup_review_recommended: false`.

**Verifikasi.**
- `pnpm build` sukses; `tsc -p tsconfig.test.json` bersih.
- Vitest terarah (selection, events, files, mcp, viewer): 426/426 hijau.
- `pnpm test` penuh: 52 gagal, semua ada di baseline Windows (tidak ada kegagalan baru). Snapshot bench yang berubah CRLF saja sudah dikembalikan.
- Smoke msedge, dua jendela: jendela 2 memilih Card, jendela 1 memilih Hero → `get_selection` = [Hero] dengan bounds `[0,0,300,200]`. Jendela 2 keluar dari dokumen → seleksi tetap [Hero]. Jendela 1 keluar → []. Rev dan riwayat tidak berubah.

**Risiko tersisa.**
- Tab yang ditutup tanpa unmount meninggalkan seleksi sampai ditimpa atau daemon restart.
- Alamat komposit selalu `missing` sampai instance hadir.
- Tidak ada tes integrasi daemon + MCP sungguhan untuk alur seleksi (verify story 4).
