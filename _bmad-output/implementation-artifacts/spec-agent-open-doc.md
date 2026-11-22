---
title: 'Agen mendesain di dokumen yang terbuka di viewer'
type: feature
ticket: ''
created: '2026-11-23'
status: ready-for-dev
baseline_revision: '20b913c918d08ee23a362c0b311af8efa256185e'
route: full
route_source: auto
risk: medium
review: ''
review_source: ''
lenses_ran: []
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
- [ ] `packages/daemon/src/focus.ts` (baru) -- `FocusStore` per origin (`set(origin, slug|null)`, `current()`, `isOpen(slug)`, `onFileChange`) + route `PUT /viewer/focus {slug|null}` (slug divalidasi, dokumen harus ada → 404, tanpa sesi).
- [ ] `packages/daemon/src/server.ts` -- wiring; `OpenBody` menjadi `{slug?, name?}`. Tanpa slug: fokus → pakai; tidak ada → buat dokumen baru dan pancarkan event "buka tab" bila ada viewer terhubung. Respons ditambah `source`, `target`, dan `viewerOpen`. Respons `execute` ditambah `target {slug, name, boardIds}`. Hint NO_ACTIVE_DOC di semua tempat menyebut `open_doc` tanpa slug.
- [ ] Route `list_documents` (POST bersesi seperti tool lain) -- dokumen aktif (non-archive) + status `open`/`focused`.
- [ ] `packages/daemon/src/selection.ts` + `events.ts` -- fallback fokus untuk `get_selection`; slug event `open_doc` tanpa slug; event "buka tab"; mapping tool `list_documents`.
- [ ] `packages/viewer/src/focusSync.ts` (baru) + `api.ts` + `Viewer.tsx` + `App.tsx` -- reporter fokus (mount, `focus` jendela, `visibilitychange`, `onReconnect`, `null` saat unmount); penanganan event "buka tab". Logika murni dites di `focusSync.test.ts`.
- [ ] `packages/mcp/src/server.ts` -- `open_doc` `{slug?, name?}`, tool `list_documents`, `SERVER_INSTRUCTIONS` baru: prompt singkat → read_skill → `open_doc` tanpa slug → `get_selection` → bangun di board terpilih atau kosong (ubah ukuran dan nama) → review → export; `open_doc {slug}` hanya bila pengguna minta file tertentu atau file baru.
- [ ] `packages/skills/skills/core.md` -- alur memakai `open_doc` tanpa slug; tetap di bawah batas.
- [ ] Tes -- `focus.test.ts` (matriks I/O), `selection.test.ts`, `events.test.ts`, `files.test.ts` (open_doc lama tak berubah), `packages/mcp/src/index.test.ts` (skema, tool list, instruksi), `focusSync.test.ts`.

**Acceptance Criteria:**
- Given aplikasi membuka dokumen X, when pengguna menulis "buatkan landing page menggunakan lakar", then agen membangun di X dan perubahannya tampil live tanpa file baru.
- Given aplikasi di Dashboard, when prompt yang sama dijalankan, then dokumen baru terbuka sendiri sebagai tab dan terbangun live.
- Given klien lama memanggil `open_doc {slug}`, when dokumen belum ada, then dokumen dibuat dan respons memuat semua field lama.

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

Fokus disimpan per origin jendela, bukan satu nilai global. Dengan dua jendela, menutup tab di satu jendela tidak boleh menghapus fokus jendela lain. `current()` mengembalikan entri yang terakhir berubah, sama seperti `SelectionStore.latest()`.

Pin sesi adalah `session.activeSlug` yang sudah ada: `open_doc` menyetelnya, `retarget` menjaga rename/archive/delete. Pola ini mengikuti open-pencil, di mana sesi tetap di dokumen terakhirnya walaupun pengguna pindah tab (lihat `research-agent-canvas-references.md`).

Event "buka tab" hanya permintaan. Viewer membuka tab di jendela yang terakhir fokus. Tanpa viewer terhubung, respons memberi `viewerOpen:false`.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 test` -- expected: hijau, kecuali kegagalan khas Windows yang sudah dikenal (AGENTS.md); CI Linux acuan.

**Manual checks (if no CLI):**
- Daemon lokal (msedge) + viewer: buka dokumen, lalu jalankan MCP `open_doc {}` → dokumen itu. Kembali ke Dashboard → `open_doc {}` membuat dokumen dan viewer membuka tabnya.
