---
title: 'API execute lengkap: baca model, place, keep, dan perbaikan via editId'
type: feature
ticket: '9'
created: '2026-11-18'
status: done
baseline_revision: '0d59c8fe19b76d22350fa92a520bcbe300870e39'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-transaksi-operasi-atomik-dengan-riwayat-dan-penyimpanan-aman-plan.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Sandbox `execute` baru mengekspos `add`. AD-7 menuntut ketujuh op AD-4, pembacaan model (`get`, `find`, `children`), `place(w, h)`, `keep` per sesi, label `description` 3–8 kata, dan perbaikan snippet gagal lewat `editId` + `edits`. Penulisan dokumen tmp+rename tanpa fsync dan riwayat append polos bisa meninggalkan file/riwayat tak konsisten bila proses dibunuh.

**Approach:** `packages/exec/src/api.ts` menjadi satu-satunya sumber permukaan API (tipe ber-JSDoc + tabel runtime dengan signature, doc, contoh valid yang dites). `runSnippet` menerima konteks (transaksi + `keep`) dan mengembalikan nilai, log, `keep` baru, serta lokasi baris error. Core mendapat akses baca salinan kerja. Daemon menyimpan per sesi `keep`, snippet gagal (editId), dan log panggilan, serta menulis riwayat lalu dokumen secara atomik dengan rekonsiliasi saat buka.

## Boundaries & Constraints

**Always:**
- Kontrak `{ok, data|error}` dan enum AD-11 tidak berubah; satu-satunya tambahan adalah field opsional `editId?: string` pada `ApiErrorBody` (aditif, diwajibkan AD-7).
- Setiap error memakai kode AD-11 + `hint` yang bisa ditindaklanjuti dalam satu langkah (sebut nama fungsi/argumen, beri contoh benar). Error saat menjalankan snippet menyebut `baris L:K` + kutipan baris itu.
- Core tetap tanpa IO; exec tanpa IO. Semua op baca bekerja di salinan kerja transaksi (melihat perubahan dalam snippet yang sama) dan mengembalikan salinan (snippet tidak bisa memutasi state host).
- `keep` hanya disimpan bila execute sukses (rollback → `keep` lama tetap). Filter regex `find` dijalankan di dalam QuickJS (bisa di-interrupt), tidak pernah di host.
- Node: `/opt/node-26/bin/node`, `/opt/node-26/bin/pnpm`. Tanpa dependensi baru. Tes daemon pakai `127.0.0.1:0`, dataDir tmp; proses anak/Chromium dimatikan.

**Never:**
- Check/LC dan bounds di respons (story 11), ikon nyata (10), pool/status/systemd (12), `api.md`/skill/`read_skill` (13), `baseRev`/`CONFLICT` (B), nested `children` di `add`, worker thread untuk QuickJS.
- Membaca `design/`, `golden-set.md`, atau memasukkan rubrik ke teks apa pun (C7). Menyentuh service, port tetap, cache global (C9).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Op lengkap | snippet memakai update/replace/move/duplicate/remove/setTokens | commit, `opsSummary` sesuai, `created` benar | error core diteruskan + lokasi baris |
| Baca model | `get(id)`, `children(id)`, `children(null)`, `find({type,name,within})` | NodeView salinan: properti tersimpan (token apa adanya) + `parentId`, `path`, kontainer `childIds`; tanpa `children`; urutan dokumen; `name` string = sama persis, RegExp = cocok | ID tak ada → `NOT_FOUND`; bukan ID → `SCHEMA_INVALID`; kunci query asing → `SCHEMA_INVALID` + daftar kunci |
| View dipakai ulang | `update(id, {...get(x)})` | ditolak | `SCHEMA_INVALID` + hint: `parentId/path/childIds` hanya-baca, ambil properti yang perlu |
| place | `place(390, 844)` dok kosong / ada board / `{near, gap}` | `{x,y}` tak tumpang tindih board halaman pertama (termasuk yang dibuat di snippet ini) dengan jarak `gap` (default 80); kosong → `{0,0}`; baris atas kiri→kanan, `near` → kanan lalu bawah board itu | w/h bukan angka >0 → `SCHEMA_INVALID` |
| keep | panggilan 1 `keep.hero = add(...)`, panggilan 2 `get(keep.hero)` sesi sama | bertahan; sesi lain `keep` = `{}`; panggilan gagal → `keep` tidak berubah | bukan objek JSON / > 64 KB → `SCHEMA_INVALID`, rollback |
| Nilai & log | ekspresi terakhir; `console.log(a, {b})` | `data.value` (JSON, dihilangkan bila undefined), `data.logs` (string; maks 100 baris/16 KB, tanda dipotong) | value > 32 KB → dipotong + `valueTruncated: true` |
| description | tanpa / 2 kata / 9 kata / 3–8 kata | ditolak / ditolak / ditolak / jalan | `SCHEMA_INVALID` + contoh label; tetap memberi `editId` agar bisa dikirim ulang `{editId, description}` tanpa kode |
| Gagal → editId | snippet error (EXEC_ERROR, host error tak tertangkap, EXEC_TIMEOUT) | `error.editId`, hint menyebut cara `execute({editId, edits:[{find,replace}]})` | — |
| Perbaikan | `{editId, edits}` (description diwarisi bila tak dikirim); `edits` kosong/tak ada = jalankan ulang | edit berurutan, `find` harus muncul tepat sekali; berhasil → commit; gagal lagi → `editId` baru, `editId` lama tetap berlaku | 0 kemunculan / >1 kemunculan → `SCHEMA_INVALID` (sebut indeks edit, jumlah, perpanjang find); editId tak dikenal / sesi lain → `NOT_FOUND` (kirim `code` lengkap); `code`+`editId` bersamaan → `SCHEMA_INVALID` |
| Timeout | `while(true){}` | `EXEC_TIMEOUT` ± batas waktu; permintaan lain dijawab setelahnya; kunci dokumen lepas; execute berikutnya sukses | — |
| Batas op | > 5000 op mutasi sukses dalam satu snippet | rollback | `EXEC_ERROR` + hint pecah ke beberapa execute |
| Kill saat tulis | proses dibunuh SIGKILL kapan saja saat commit | buka ulang: dokumen JSON utuh = versi lama atau baru; riwayat tanpa baris parsial; entri riwayat terakhir `rev` = `doc.rev`; tmp sisa dibersihkan | — |
| Migrasi | file `schemaVersion` lama + rantai tersedia | dimigrasi saat buka lalu ditulis balik atomik | sesuai story 6 |

</intent-contract>

## Code Map

- `packages/exec/src/api.ts` -- ganti total. Ekspor tipe publik ber-JSDoc (`NodeView`, `FindQuery`, `PlaceOptions`, `Point`, interface `LakarApi` dengan satu metode per fungsi: `add, update, replace, move, duplicate, remove, setTokens, get, find, children, place`) dan tabel `API: { readonly [K in keyof LakarApi]: ApiFunction }` dengan `{kind: 'op'|'read', signature, doc, returns, errors: ErrorCode[], example, call(ctx, args)}`; `API_GLOBALS` (doc `keep`, `console.log`) dan konstanta batas (`MAX_OPS`, `KEEP_MAX_BYTES`, dsb.). `ctx = {tx, view(): Readonly<Doc>, countOp()}`. Contoh: string snippet mandiri pada dokumen kosong (membuat board sendiri), ditulis untuk agen. Wrapper menolak kunci `parentId/path/childIds` di patch/node dan `children` di `add` dengan hint.
- `packages/exec/src/index.ts` -- `runSnippet(code, tx, {timeoutMs, memoryBytes, keep?})` → `{ok:true, value?, valueTruncated?, logs, keep}` | `{ok:false, error}`. Prelude QuickJS (nama file `lakar-api.js`) mendefinisikan `console`, `keep`, `find` (filter RegExp di sandbox atas hasil host). Nilai/`keep` diserialisasi dengan `JSON.stringify` di dalam QuickJS. Lokasi: frame `snippet.js:L:K` pertama di `stack` (lihat contoh di Design Notes); SyntaxError punya `lineNumber`. Pertahankan mekanisme `__lakarError`, pemuatan modul per batas memori, dan penanganan OOM.
- `packages/exec/src/index.test.ts` -- harapan `Object.keys(API)` diperbarui; tambah tes per baris matriks yang relevan di level exec + tes "setiap `API[k].example` sukses di dokumen kosong lalu commit valid".
- `packages/core/src/transaction.ts` -- tambah `view(): Doc` pada `Transaction` (salinan kerja hidup, hanya-baca menurut kontrak; melempar bila tertutup). Jangan ubah semantik op. Tambah tes kecil.
- `packages/core/src/tree.ts` -- `locate`, `indexNodes`, `subtree` dipakai ulang untuk NodeView (ekspor dari `index.ts` bila perlu).
- `packages/schema/src/errors.ts` -- `ApiErrorBody.editId?: string`; `LakarError` boleh membawa `editId` opsional di `toBody()` hanya bila ada.
- `packages/daemon/src/sessions.ts` -- `Session` + `keep: Record<string, unknown>` (`{}`), `failed: Map<editId, {code, description?}>` (LRU 20), `log` (maks 200 `{at, description, ok, code?, rev}`). editId 8 karakter acak.
- `packages/daemon/src/server.ts` (`/execute`, `/docs/open`) -- body `{code?, description?, editId?, edits?}` (zod strict, pesan bantu). Alur: resolusi kode → validasi description → `transact` + `runSnippet({keep})` → commit → `store.commit` → simpan `keep`. Gagal setelah kode diketahui → simpan + `editId` di error + hint. Data sukses `{docId, rev, created, value?, valueTruncated?, logs?}`. `/docs/open` memakai `store.read` yang merekonsiliasi dan menulis balik hasil migrasi.
- `packages/daemon/src/store.ts` -- `write`: tmp → `FileHandle.sync()` → rename → fsync direktori; tmp dihapus bila gagal. `commit(slug, doc, entry)`: append riwayat (perbaiki dulu baris parsial di ekor, fsync) LALU tulis dokumen; bila tulis dokumen gagal, potong riwayat ke ukuran sebelumnya. `read`: hapus `<slug>.lakar.json.*.tmp` sisa, rekonsiliasi riwayat (buang baris parsial/rusak dan entri `rev > doc.rev`, tulis ulang atomik), tulis balik bila dimigrasi. `readHistory(slug)`. Konstruktor menerima `{migrations?}` untuk tes.
- `packages/daemon/src/config.ts` -- read-only kecuali bila perlu opsi tes.
- `packages/daemon/src/index.test.ts` -- pola `call`/`newSession`/dataDir tmp; tambah tes HTTP matriks (keep, editId, description, timeout tanpa menggantung, value/logs). `packages/daemon/src/store.test.ts` (baru) -- tes kill: anak `/opt/node-26/bin/node` (`process.execPath`) mengimpor `packages/daemon/dist/store.js`, loop commit dokumen besar (~1–2 MB) rev naik, dibunuh SIGKILL pada waktu acak ≥ 8 kali; setiap kali `read` + `readHistory` memenuhi invarian matriks.
- `packages/mcp/src/server.ts` -- deskripsi `execute` diperbarui (semua fungsi API, `keep`, `console.log`, `value`, alur `editId/edits`, description wajib 3–8 kata) + inputSchema `editId`, `edits`; `client.ts` `formatError` mencetak `editId`. `packages/mcp/src/index.test.ts` fixture.
- `tests/execute-description.test.ts` (baru) -- setiap nama di `API` (impor relatif `../packages/exec/src/api.ts`) disebut di deskripsi tool `execute` mcp.
- `packages/exec/package.json`, `packages/daemon/package.json` -- belum punya script `test`; tambahkan pola core: `"test": "vitest run --root ../.. packages/<nama>/"`.
- `scripts/tracer-e2e.sh`, `scripts/tracer-check.mjs` -- read-only kecuali harapan bentuk respons berubah.

## Tasks & Acceptance

**Execution:**
- [x] `packages/schema/src/errors.ts` -- `editId` opsional -- AD-7 di dalam kontrak AD-11.
- [x] `packages/core/src/transaction.ts` + tes -- `view()` -- baca salinan kerja.
- [x] `packages/exec/package.json`, `packages/daemon/package.json` -- script `test` -- perintah verify tiket berjalan.
- [x] `packages/exec/src/api.ts`, `index.ts` + `index.test.ts` -- API lengkap, prelude, keep/value/logs, lokasi baris, batas op, tes contoh API -- AD-7.
- [x] `packages/daemon/src/{sessions,store,server}.ts` + `index.test.ts` + `store.test.ts` -- sesi, editId, penyimpanan atomik + rekonsiliasi + write-back migrasi, tes kill -- AD-4/AD-17, R1.
- [x] `packages/mcp/src/{server,client,index.test}.ts`, `tests/execute-description.test.ts` -- permukaan agen.

**Acceptance Criteria:**
- Given build, when `pnpm --filter @lakar/exec --filter @lakar/daemon test`, then lulus 0 skip dan mencakup: snippet tanpa description ditolak, dokumen utuh setelah kill di tengah tulis, loop tak berujung → `EXEC_TIMEOUT` dan daemon tetap melayani, `edits` terhadap `editId` memperbaiki snippet gagal, `keep` bertahan antar-panggilan di sesi yang sama.
- Given setiap contoh `API[*].example`, when dijalankan di dokumen kosong, then sukses dan commit valid.
- Given `pnpm test` dan `verify.sh`, then lulus, arah dependensi lulus, tidak ada proses daemon/Chromium/anak Lakar tersisa; tracer-e2e (bila dijalankan) lulus.

## Implementation Notes

- `find` host didaftarkan sebagai `__lakar_find`/`__lakar_log` lalu dihapus dari global oleh prelude `lakar-api.js`; prelude mengembalikan fungsi `finish` yang menyerialisasi nilai akhir dan `keep` di QuickJS. Error host di snippet juga membawa `e.code`.
- Batas op: `countOp` dipanggil setelah op sukses; op ke-5001 menandai error fatal yang dikembalikan walau snippet menangkapnya.
- `place`: tanpa `near` → kanan board paling kanan, sejajar board paling atas (pasti bebas tumpang tindih); `near` → kanan board acuan, bila terhalang di bawahnya lalu geser turun melewati board penghalang. Hanya board halaman pertama.
- `children(null)` = board halaman pertama; node daun → `[]`. `find({within})` tidak memuat node `within` sendiri.
- `value` > 32 KB → string JSON terpotong + `…` dan `valueTruncated: true`. `logs` di respons HTTP = baris digabung `\n`, dihilangkan bila kosong.
- Kegagalan menerapkan `edits` (0/>1 kemunculan) tidak membuat `editId` baru (yang lama tetap berlaku); kegagalan description/eksekusi/commit membuat `editId` baru. Description tidak valid → hint `execute({editId, description})`.
- `DocStore` menerima `{migrations?, migrate?}`: registri v1 kosong dan `LakarDocument.schemaVersion` literal 1, jadi write-back migrasi dites lewat injeksi `migrate`. Rekonsiliasi juga menghapus `<slug>.history.jsonl.*.tmp`.
- Tes daemon: helper `call` mengisi description default untuk `/execute` bila kunci `description` tidak ada (tes description mengirim kunci eksplisit).

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 7 findings — high 0, medium 0, low 7, false 0, maybe-false 0
- findings:
  - `[low]` `[reject]` `store.commit` gagal karena IO (ENOSPC/EIO) di /execute tidak memberi editId (500 EXEC_ERROR internal) — benar, tetapi kegagalan disk jarang dan mengirim ulang kode tidak menolong saat disk bermasalah; perbaikan butuh cabang penanganan error non-Lakar baru.
  - `[low]` `[patch]` fsync direktori setelah rename yang melempar membuat commit memotong riwayat padahal dokumen baru sudah terpasang — diperbaiki: `syncDir` setelah rename best-effort (`.catch(() => {})`).
  - `[low]` `[patch]` append/fsync riwayat gagal setelah sebagian byte tertulis tidak dipotong balik → rev ganda pada execute berikutnya — diperbaiki: write+sync dibungkus, gagal → `truncate(before)` lalu lempar ulang.
  - `[low]` `[patch]` `applyEdits` menghitung kemunculan `find` tanpa tumpang tindih ("aa" di "aaa" = 1) — diperbaiki: scan lanjut dari `pos + 1`; asersi baru di tes daemon editId/edits.
  - `[low]` `[reject]` error batas 5000 op yang ditangkap snippet tidak membawa `baris L:K` — batas volume, lokasi tidak membantu perbaikan; menambah lokasi butuh penangkapan stack baru.
  - `[low]` `[patch]` re-export `indexNodes/isContainer/locate/subtree` di core tanpa pemakai (api.ts memakai walk sendiri karena butuh parentId) — diperbaiki: re-export dihapus.
  - `[low]` `[reject]` `find({within})` dengan ID daun mengembalikan [] tanpa error — perilaku masuk akal (daun tak punya keturunan), jarang dipakai; perbaikan menambah guard.

## Design Notes

- **Mengapa NodeView datar:** agen membaca `get(id).name`/`.gap` langsung. Field turunan (`parentId`, `path`, `childIds`) ditolak bila dikirim balik sebagai patch agar tidak ada magic; hint menjelaskan.
- **Urutan tulis riwayat-dulu:** kill di mana pun → setelah rekonsiliasi `riwayat.last.rev == doc.rev` (entri fantom dibuang, baris parsial dibuang). Dokumen-dulu tidak bisa memulihkan entri yang hilang.
- **editId:** disimpan per sesi (restart daemon = hilang → `NOT_FOUND` + hint kirim kode lengkap). `edits` gaya find/replace tepat-sekali seperti alat edit agen.
- **Event loop:** QuickJS sinkron di thread daemon; blokir dibatasi `execTimeoutMs` (2 s) via interrupt. Worker thread ditunda (risiko residual).
- Contoh lokasi: `{"name":"TypeError","message":"cannot read property 'x' of undefined","stack":"    at <eval> (snippet.js:3:2)\n"}` → `EXEC_ERROR: baris 3:2: TypeError: cannot read property 'x' of undefined\n> b.x`. Error host dari fungsi API juga membawa frame `snippet.js` pemanggil.
- Hint EXEC_ERROR per jenis: ReferenceError → daftar global tersedia (tanpa import/require/await); TypeError null/undefined → periksa ID dan `keep`; SyntaxError → JavaScript biasa, bukan TS/JSX.

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm build` -- expected: exit 0
- `cd /root/lakar && /opt/node-26/bin/pnpm --filter @lakar/exec --filter @lakar/daemon test` -- expected: exit 0, 0 skip
- `cd /root/lakar && /opt/node-26/bin/pnpm test` -- expected: exit 0, 0 skip
- `pgrep -af 'lakar.*(daemon|chrome|store)|headless_shell' ; ss -ltn | grep -c ':7466 '` -- expected: tidak ada proses Lakar tersisa (selain milik aplikasi lain yang tercatat), 0
- `cd /root/lakar && bash tools/node26/verify.sh` -- expected: exit 0
- `cd /root/lakar && bash scripts/tracer-e2e.sh` -- expected: exit 0 (satu run claude -p)

## Auto Run Result

- **Status:** built.
- **Ringkasan:** sandbox `execute` kini mengekspos ketujuh op AD-4 + `get/find/children` (NodeView datar dengan `parentId/path/childIds` hanya-baca), `place(w,h,{near,gap})`, `keep` per sesi (disimpan hanya saat sukses, maks 64 KB), `console.log` → `data.logs`, dan `data.value` (maks 32 KB). `api.ts` = satu sumber: interface `LakarApi` ber-JSDoc + tabel `API` (signature, doc, returns, errors, contoh yang dites) + `API_GLOBALS`. Error snippet membawa `baris L:K` + kutipan baris dan hint per jenis (ReferenceError, TypeError null/undefined, SyntaxError). `description` wajib 3–8 kata. Kegagalan setelah kode diketahui memberi `error.editId` (field opsional aditif di `ApiErrorBody`); perbaikan lewat `{editId, edits:[{find,replace}]}` (find tepat sekali, description diwarisi, edits kosong = jalankan ulang). Batas 5000 op mutasi per execute. Store daemon: riwayat-dulu + fsync, dokumen tmp→fsync→rename→fsync dir, rekonsiliasi saat buka (tmp sisa, baris parsial/rusak, entri rev > doc.rev), write-back migrasi.
- **File:** `packages/exec/src/{api,index}.ts` (API + sandbox), `packages/exec/src/index.test.ts`; `packages/core/src/transaction.ts` (`view()`) + tes; `packages/schema/src/errors.ts` (`editId?`); `packages/daemon/src/{server,sessions,store}.ts` (+ `store.test.ts` baru, `index.test.ts`); `packages/mcp/src/{server,client,index,index.test}.ts` (deskripsi/inputSchema execute, editId di formatError); `tests/execute-description.test.ts` (paritas API ↔ deskripsi MCP); `package.json` exec/daemon (script test).
- **Review (quick):** 7 temuan low — 4 patch, 0 defer, 3 reject (IO commit tanpa editId: jarang, butuh cabang baru; lokasi baris untuk batas op: tak membantu; `find({within: daun})` → []: wajar).
- **Follow-up review:** `false` — hanya low yang di-patch (low×4).
- **Verifikasi:** `pnpm build` exit 0; `pnpm --filter @lakar/exec --filter @lakar/daemon test` 42 + 55 lulus, 0 skip; `pnpm test` 30 file / 412 tes lulus, 0 skip; tidak ada proses daemon/Chromium/anak Lakar tersisa, port 7466 bebas (`[headless_shell] <defunct>` milik `node app.js` PID 1931892 sejak 17 Nov, bukan Lakar); `tools/node26/verify.sh` exit 0 (snapshot C9 identik); `scripts/tracer-e2e.sh` lulus sebelum patch review (1 run claude -p ≈ $0,19; patch review tidak menyentuh jalur tracer selain urutan tulis store yang dites ulang).
- **Risiko residual:** QuickJS tetap di thread utama daemon (blokir ≤ 2 s per execute; worker ditunda); `keep` per sesi (bukan per dokumen) dan editId hilang saat daemon restart; `place` hanya board halaman pertama; `description` kini wajib untuk semua klien (bench story 14 harus mengirimnya); registri migrasi masih kosong sehingga write-back hanya dites lewat injeksi; deskripsi MCP execute panjang (story 13 memindahkannya ke `api.md`).
