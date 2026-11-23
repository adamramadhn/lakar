---
title: 'Agen mendesain di dokumen yang terbuka di viewer'
type: feature
ticket: ''
created: '2026-11-23'
status: built
baseline_revision: 'bd00776e78878817ca81febd005b26f7e5dda07e'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/research-agent-canvas-references.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `open_doc` wajib slug dan membuat dokumen bila belum ada, sementara daemon tidak tahu dokumen mana yang terbuka di viewer. Agen mengarang slug dan bekerja di file baru, sehingga pengguna yang menatap file lain tidak melihat apa pun secara live. Prompt sesingkat "buatkan landing page menggunakan lakar" harus cukup untuk menjalankan alur lengkap, seperti di Pencil dan Paper.

**Approach:** Viewer melaporkan dokumen yang difokuskan ke daemon (di memori, seperti seleksi AD-9). `open_doc` tanpa slug memakai dokumen itu. Bila tidak ada dokumen terbuka, daemon membuat dokumen baru dan meminta viewer membuka tabnya. Dokumen dipaku per sesi MCP, setiap respons tulis membawa `target`, dan tool `list_documents` ditambahkan. Instruksi server MCP serta skill `core` mengarahkan agen ke dokumen terbuka dan ke board yang terpilih atau masih kosong.

## Boundaries & Constraints

**Always:**
- Kompatibel mundur (AD-4). `open_doc {slug}` tetap membuka atau membuat seperti dulu. Respons hanya boleh bertambah field. Kode error lama tetap.
- Route baru di bawah `/viewer/*`, dilindungi guard Origin global.
- Fokus dan pin sesi hanya di memori daemon. Keduanya tidak ditulis ke dokumen atau riwayat.
- Viewer memakai `request()` dan `activityHub` yang ada, tanpa `EventSource` baru. Permintaan "buka tab" dikirim lewat stream `/viewer/events`.
- Komentar dan spec berbahasa Indonesia. Teks UI dan commit berbahasa Inggris.

**Never:**
- `execute` dan `list_boards` tanpa `open_doc` tidak diberi fallback diam-diam. Hanya hint error yang diperbarui.
- Pin sesi tidak berpindah diam-diam saat pengguna ganti tab. Pin hanya berubah lewat `open_doc`.
- Tidak ada perubahan skema dokumen, UI baru, atau desain Pencil baru.
- Batas ukuran skill di `tests/skills.test.ts` tidak dinaikkan.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dokumen viewer | `open_doc {}` saat viewer membuka `untitled` | Sesi dipaku ke `untitled`; respons `{docId, slug, rev, created:false, source:'viewer'}` | — |
| Tidak ada dokumen terbuka, aplikasi jalan | `open_doc {name?}`; viewer di Dashboard | Dokumen baru dibuat (slug dari `name`, atau default), event meminta viewer membuka tabnya, `source:'created'` | — |
| Aplikasi tidak jalan | `open_doc {}`, tidak ada viewer terhubung | Dokumen baru dibuat, `source:'created'`, `viewerOpen:false` + hint "buka aplikasi Lakar" | — |
| Slug eksplisit | `open_doc {slug:'x'}` | Perilaku lama, `source:'slug'` | — |
| Pin sesi | Setelah `open_doc`, pengguna pindah tab ke `b` | `execute` tetap di dokumen terpaku; `target` menyebut dokumen itu | Dokumen terpaku dihapus atau di-archive → NO_ACTIVE_DOC dengan hint `open_doc` |
| Dua jendela | A fokus `a`, lalu B fokus `b` | Fokus terakhir menang | — |
| Tab ditutup | Pemilik fokus kembali ke Dashboard | Entri jendela itu hilang; jendela lain tetap | — |
| File berubah | Dokumen fokus di-rename, archive, atau delete | Rename → slug baru; archive/delete → entri hilang | — |
| Daemon restart | Stream reconnect | Viewer mengirim ulang fokus | Gagal kirim ditelan |
| list_documents | Kapan saja | `{documents:[{slug, name, rev, open, focused}], focused}` | — |
| get_selection | Tanpa slug, sesi belum `open_doc` | Fokus dipakai sebelum `selections.latest()` | NO_ACTIVE_DOC bila semua kosong |

</frozen-after-approval>

## Code Map

- `packages/daemon/src/selection.ts` -- pola acuan `SelectionStore` (origin owner, `onFileChange`) dan route PUT. Fallback `get_selection` di ~183.
- `packages/daemon/src/server.ts` -- `/docs/open` di 353-377 (`OpenBody` baris 101 masih wajib slug; create-if-missing lewat `createDocument()` + `store.write`). `activeDoc()` di 290-297 dan cek ulang di 443 berisi hint "panggil open_doc {slug}". Wiring `onChange` di 696/711. Map kode error ke HTTP di sekitar 61. Guard Origin global di 264-279.
- `packages/daemon/src/sessions.ts:27-42,106,123,128` -- bentuk sesi (`activeSlug` = pin), `retarget` saat rename/archive/delete, `peek`/`require`.
- `packages/daemon/src/code-export.ts:53` -- hint NO_ACTIVE_DOC yang sama.
- `packages/daemon/src/events.ts` -- `TOOL_ROUTES` 31-45 (tambahkan route `list_documents`); slug event running untuk `open_doc` di 374 diambil dari body; event done 270-272 memakai `data.slug`; hello di 198. Tempat event baru "buka tab" untuk viewer.
- `packages/viewer/src/App.tsx:45-120,185` -- tab, `closeTab`, `<Viewer key=slug>` remount per tab. Event "buka tab" ditangani di sini (tambah tab + navigasi `#/d/<slug>`).
- `packages/viewer/src/selectionSync.ts` + `Viewer.tsx:601-613` -- pola reporter (debounce, `resend` saat `onReconnect`, `dispose`). Hook `visibilitychange` di `Viewer.tsx:392`. `activity.ts` = `activityHub`.
- `packages/viewer/src/api.ts:27-34,144,537` -- origin per jendela, `request()`, `putSelection`. Tambah `putFocus`.
- `packages/mcp/src/server.ts` -- `SERVER_INSTRUCTIONS` di 156, `open_doc` 427-436, `get_selection` 542-549; `client.ts:114` (sesi baru setelah 401 tidak punya pin).
- `packages/skills/skills/core.md:7-8` -- alur kerja. Anggaran ketat (core sekitar 87 token sisa; muatan landing sekitar 14 token sisa di CRLF), jadi tambahan harus diimbangi pemangkasan.
- Tes acuan: `packages/daemon/src/selection.test.ts`, `files.test.ts:141-148,275`, `events.test.ts:133,248,361`, `packages/mcp/src/index.test.ts:181,277,493-581`, `packages/mcp/src/selection-flow.test.ts`, `tests/skills.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/focus.ts` (baru) -- `FocusStore` per origin (`set(origin, slug|null)`, `current()`, `isOpen(slug)`, `onFileChange`) + route `PUT /viewer/focus {slug|null}` (slug divalidasi, dokumen harus ada → 404, tanpa sesi).
- [x] `packages/daemon/src/server.ts` -- wiring; `OpenBody` menjadi `{slug?, name?}`. Tanpa slug: fokus → pakai; tidak ada → buat dokumen baru dan pancarkan event "buka tab" bila ada viewer terhubung. Respons ditambah `source`, `target`, dan `viewerOpen`. Respons `execute` ditambah `target {slug, name, boardIds}`. Hint NO_ACTIVE_DOC di semua tempat menyebut `open_doc` tanpa slug.
- [x] Route `list_documents` (POST bersesi seperti tool lain) -- dokumen aktif (non-archive) + status `open`/`focused`.
- [x] `packages/daemon/src/selection.ts` + `events.ts` -- fallback fokus untuk `get_selection`; slug event `open_doc` tanpa slug; event "buka tab"; mapping tool `list_documents`.
- [x] `packages/viewer/src/focusSync.ts` (baru) + `api.ts` + `Viewer.tsx` + `App.tsx` -- reporter fokus (mount, `focus` jendela, `visibilitychange`, `onReconnect`, `null` saat unmount); penanganan event "buka tab". Logika murni dites di `focusSync.test.ts`.
- [x] `packages/mcp/src/server.ts` -- `open_doc` `{slug?, name?}`, tool `list_documents`, `SERVER_INSTRUCTIONS` baru: prompt singkat → read_skill → `open_doc` tanpa slug → `get_selection` → bangun di board terpilih atau kosong (ubah ukuran dan nama) → review → export; `open_doc {slug}` hanya bila pengguna minta file tertentu atau file baru.
- [x] `packages/skills/skills/core.md` -- alur memakai `open_doc` tanpa slug; tetap di bawah batas.
- [x] Tes -- `focus.test.ts` (matriks I/O), `selection.test.ts`, `events.test.ts`, `files.test.ts` (open_doc lama tak berubah), `packages/mcp/src/index.test.ts` (skema, tool list, instruksi), `focusSync.test.ts`.

**Acceptance Criteria:**
- Given aplikasi membuka dokumen X, when pengguna menulis "buatkan landing page menggunakan lakar", then agen membangun di X dan perubahannya tampil live tanpa file baru.
- Given aplikasi di Dashboard, when prompt yang sama dijalankan, then dokumen baru terbuka sendiri sebagai tab dan terbangun live.
- Given klien lama memanggil `open_doc {slug}`, when dokumen belum ada, then dokumen dibuat dan respons memuat semua field lama.

## Implementation Notes

- Route `list_documents` = `POST /viewer/documents` (bersesi, kena guard Origin). Respons menambah `updatedAt` per dokumen dan `active` (pin sesi) di samping field spec.
- Reporter fokus dipasang di `App.tsx`, bukan `Viewer.tsx`: App tahu juga saat jendela di Dashboard (lapor `null`), jadi `lastOrigin` (tujuan event `openTab`) ikut terbarui. Pemicu: route berubah, `focus` jendela, `visibilitychange`, `onReconnect`, `pagehide` (null) / `pageshow` dari bfcache.
- Event stream baru bernama `openTab` (bukan `open`, yang bentrok dengan event bawaan EventSource). Viewer membuka tab bila `origin` kosong atau sama dengan jendelanya.
- "Viewer terhubung" = jumlah stream `/viewer/events` terbuka (`ActivityBus.viewerCount`), bukan jumlah pelanggan bus.
- Dokumen dari `open_doc` tanpa slug dibuat kosong (rev 0, tanpa board) seperti `open_doc {slug}`; slug dialokasikan di bawah kunci `#files` dengan aturan bebas-termasuk-arsip yang sama dengan New file (`freeSlugFor` diekspor dari `files.ts`). Event `change create` hanya untuk jalur ini; `open_doc {slug}` tetap tanpa event seperti dulu.
- Hint NO_ACTIVE_DOC dipusatkan di `NO_ACTIVE_DOC_HINT` (`sessions.ts`).
- Anggaran skill: muatan landing tepat 9.600 token di CRLF (9.476 di LF); tambahan alur di `core.md` diimbangi pemangkasan kecil (prelude `Object.assign`, spasi daftar jenis layar, contoh `photo_search`, daftar asal ID).
- Tes lama yang memakai `toEqual` persis pada respons `open_doc`/`execute` diperbarui untuk field tambahan (`events.test.ts`, `index.test.ts`, `history-restore.test.ts`).

## Plan Change Log

- **2026-11-23, review quick #1–#2:**
  - **Temuan:** entri fokus hanya dilepas lewat PUT `pagehide`, yang tanpa `keepalive` sering batal. Origin jendela juga acak setiap reload, sehingga fokus basi tersangkut selamanya. Akibatnya AC2 ("Dashboard → dokumen baru") gagal setelah reload, dan `openTab` bisa dikirim ke origin jendela yang sudah ditutup.
  - **Amandemen Design Notes:** umur entri fokus diikat ke stream `/viewer/events` jendela itu (viewer mengirim origin-nya sebagai query `?origin=` saat menyambung). Stream putus → entri origin itu dibuang. Tujuan `openTab` hanya origin yang stream-nya masih terbuka; kalau tidak ada, tanpa origin.
  - **Penyimpangan workflow:** perbaikan diterapkan sebagai patch pada kode yang ada, tanpa revert, karena cakupannya lokal (focus.ts, events.ts, activity.ts, api.ts).
  - **KEEP:** semua perilaku lain beserta tesnya tetap.

## Review Triage Log

**Pass 1 (quick):** high 1, medium 5, low 2, false 1, ditolak 1.

| # | Temuan | Verdict | Rute | Bukti |
|---|---|---|---|---|
| 1 | Entri fokus dari jendela yang ditutup atau di-reload tidak pernah kedaluwarsa | high | bad_plan → patch | `request()` tanpa `keepalive`; `ORIGIN` acak per load (`api.ts:30`); tidak ada ikatan entri ↔ stream |
| 2 | `openTab` ke origin jendela yang baru ditutup | medium | patch (satu akar dengan #1) | `set(origin, null)` memperbarui `#lastOrigin` |
| 3 | PUT fokus bisa tiba tidak berurutan | medium | patch | `#push` mengirim PUT paralel tanpa antrean |
| 4 | `Object.assign(C\|FONT,…)` di `core.md` valid tapi tanpa efek | medium | patch | `C\|FONT` → 0, override arketipe hilang diam-diam |
| 5 | Hint NO_ACTIVE_DOC setelah daemon restart memindah agen ke dokumen lain | medium | patch | `client.ts:114` membuat sesi baru tanpa pin; hint menyuruh `open_doc {}` |
| 6 | `name` divalidasi walau `slug` diberikan (input lama ditolak, AD-4) | medium | patch | Dulu kunci lain diabaikan |
| 7 | Dokumen baru dari `open_doc {}` mewarisi keanggotaan folder file yang dihapus dari luar | low | ditolak | Sangat jarang; perbaikan butuh plumbing `FolderStore` ke server.ts |
| 8 | Respons `paste` tanpa `target` (Intent: setiap respons tulis) | low | patch | `paste.ts:247` |
| 9 | Activity (`callTitle`) dan Connections (`MCP_TOOLS`) belum mengenal `list_documents` | low | patch | `activity.ts:313`, `harnesses.ts:15` |
| 10 | `files.test.ts` tidak diperbarui | false | ditolak | Perilaku lama `open_doc {slug}` dites di `focus.test.ts` ("slug eksplisit … field lama") |

## Design Notes

Fokus disimpan per origin jendela, bukan satu nilai global. Dengan dua jendela, menutup tab di satu jendela tidak boleh menghapus fokus jendela lain. `current()` mengembalikan entri yang terakhir berubah, sama seperti `SelectionStore.latest()`.

Pin sesi adalah `session.activeSlug` yang sudah ada: `open_doc` menyetelnya, `retarget` menjaga rename/archive/delete. Pola ini mengikuti open-pencil, di mana sesi tetap di dokumen terakhirnya walaupun pengguna pindah tab (lihat `research-agent-canvas-references.md`).

Event "buka tab" hanya permintaan. Viewer membuka tab di jendela yang terakhir fokus. Tanpa viewer terhubung, respons memberi `viewerOpen:false`.

Umur entri fokus mengikuti stream `/viewer/events` jendelanya (amandemen review #1–#2). Viewer menyambung ke `/viewer/events?origin=<ORIGIN>`. Saat stream itu tertutup, daemon membuang entri fokus origin tersebut, dan `lastOrigin` hanya menunjuk origin yang stream-nya masih terbuka. PUT `pagehide` tetap dikirim, dengan `keepalive`, sebagai jalur cepat.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 test` -- expected: hijau, kecuali kegagalan khas Windows yang sudah dikenal (AGENTS.md); CI Linux acuan.

**Manual checks (if no CLI):**
- Daemon lokal (msedge) + viewer: buka dokumen, lalu jalankan MCP `open_doc {}` → dokumen itu. Kembali ke Dashboard → `open_doc {}` membuat dokumen dan viewer membuka tabnya.
