---
title: 'Transaksi operasi atomik dengan riwayat dan penyimpanan aman'
type: feature
ticket: '6'
created: '2026-11-17'
status: built
baseline_revision: 'eac37d12d0c9613f0a60bd585b60067b748324c5'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/architecture-lakar-core/architecture-lakar-core.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `packages/core` baru punya `add` (tracer/story 5). AD-4 menuntut tujuh operasi `add | update | replace | move | duplicate | remove | setTokens` di atas salinan copy-on-write, kunci per dokumen, commit/rollback penuh, entri riwayat, dan kerangka migrasi (AD-2). `created[].path` saat ini string `Board/Anak` yang ambigu karena nama DESIGN.md memuat ` / `.

**Approach:** Lengkapi `Transaction` di core (murni, tanpa IO) dengan enam op baru yang masing-masing atomik, helper `transact` (error tak tertangkap → rollback), `DocumentLocks` (kunci async per dokumen, dipindah dari daemon), dan `migrateDocument`. Addressing op hanya lewat ID; `path` menjadi list nama. Daemon hanya disesuaikan untuk memakai helper core; penyimpanan file tetap di daemon (story 9).

## Boundaries & Constraints

**Always:**
- Core tanpa IO dan tanpa impor runtime selain `@lakar/schema` (tes arah dependensi tetap lulus). Dokumen asli **tidak pernah** dimutasi; semua op bekerja di `structuredClone`.
- Setiap op atomik sendiri: semua validasi (zod + struktur) selesai sebelum salinan kerja diubah. Op gagal yang ditangkap snippet meninggalkan salinan kerja persis seperti sebelum op itu (AD-4: error tertangkap tidak membatalkan transaksi).
- Addressing semua op hanya via ID 8 karakter. Tidak ada op yang menerima path/nama.
- Error memakai `LakarError` dengan kode AD-11 + `hint` yang mengajari perbaikan: ID tak ada → `NOT_FOUND`; bentuk/struktur salah → `SCHEMA_INVALID`; ref token tak dikenal saat commit → `TOKEN_UNKNOWN`; `schemaVersion` lebih baru dari yang didukung → `VERSION_MISMATCH`. Enum dan kontrak `{ok,data|error}` tidak diubah.
- Node: `/opt/node-26/bin/node`, `/opt/node-26/bin/pnpm`. Tidak ada dependensi baru.

**Never:**
- IO di core (fs, waktu sistem tanpa injeksi, jaringan). Penulisan dokumen/riwayat atomik dan write-back hasil migrasi tetap di daemon (story 9).
- Menambah op ke `packages/exec/src/api.ts` / sandbox (story 9 memilikinya) atau mengubah deskripsi op di skill. Render/check/ikon.
- Membaca `design/` atau `ux-lakar/golden-set.md`; rubrik golden set tidak masuk teks apa pun (C7). Menyentuh service, port, cache global (C9).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| update merge | `update(id,{gap:12,padding:null})` | properti di-merge dangkal; `null` menghapus kunci opsional; hasil divalidasi skema tipe node | — |
| update terlarang | patch berisi `type`/`id`/`children`, atau `x` pada node flow, atau hapus field wajib | salinan kerja tidak berubah | `SCHEMA_INVALID` (hint: ganti tipe → `replace`; x/y → `XY_HINT`) |
| replace | `replace(frameId,{type:'rect',name:'R'})` saat frame tanpa anak | ID & posisi tetap, semua properti lama diganti | — |
| replace buang subtree | frame beranak → tipe daun | ditolak (tidak menghapus anak diam-diam) | `SCHEMA_INVALID` + hint pindah/hapus anak dulu |
| replace board | board → non-board, atau anak → board | ditolak | `SCHEMA_INVALID` |
| move | `move(id,parentId,index?)` | node pindah ke board/frame pada index (default akhir); `null` = halaman, khusus board (reorder) | — |
| move ilegal | ke diri/keturunan sendiri, ke daun, board ke frame, anak ke halaman, index bukan integer 0..len | ditolak, tidak berubah | `SCHEMA_INVALID` |
| duplicate | `duplicate(id, patch?)` pada frame beranak / board | salinan dalam subtree dengan ID baru semua, disisipkan tepat setelah asal; `patch` di-merge ke akar salinan (aturan `update`); mengembalikan ID akar baru | — |
| remove | `remove(id)` | node + subtree hilang; op berikutnya pada ID itu → `NOT_FOUND` | `NOT_FOUND` bila ID tak ada |
| setTokens | `setTokens({'colors.a':'#111111','spacing.2':null})` | merge ke `doc.tokens` (dibuat bila tak ada); `null` menghapus | nama/nilai tak valid → `SCHEMA_INVALID`, seluruh map ditolak |
| token terhapus masih dirujuk | `setTokens({'colors.a':null})` sementara node merujuknya | commit gagal, transaksi tertutup, dokumen utuh | `TOKEN_UNKNOWN` |
| error tak tertangkap | body `transact` melempar setelah beberapa op | rollback penuh; dokumen asli utuh; tidak ada entri riwayat; error dilempar ulang | kode error asli |
| error tertangkap | body menangkap `add` gagal lalu lanjut | commit berisi op yang sukses saja | — |
| commit | ≥1 op sukses | `rev+1`, satu entri `{rev,sessionId,description,opsSummary,at}`; `opsSummary` mis. `add×3, update×1` | — |
| commit kosong | tidak ada op sukses | dokumen asli dikembalikan, rev tetap, `entry: null` | — |
| created | dua node bernama sama; node dibuat lalu dihapus/dipindah/di-rename dalam transaksi yang sama | `created` = list (urutan pembuatan) node baru yang **masih ada** saat commit; `path` = list nama dari board ke node, dihitung dari dokumen akhir | — |
| migrasi | `schemaVersion` = versi kini / lebih lama dengan rantai tersedia / lebih baru / tak ada | apa adanya / dimigrasi berurutan n→n+1 lalu divalidasi / ditolak / ditolak | `VERSION_MISMATCH` (lebih baru atau langkah hilang), `SCHEMA_INVALID` (bukan objek / versi bukan integer ≥1) |
| kunci | dua `locks.run('a',…)` bersamaan; `run('b',…)` paralel; fn melempar | 'a' berurutan FIFO; 'b' tidak menunggu 'a'; kunci dilepas setelah error | — |

</intent-contract>

## Code Map

- `packages/core/src/index.ts` -- `IdAllocator`, `collectIds`, `createDocument`, `parseDocument`, `findNode` (prefix path string `/` → ganti jadi path list), `beginTransaction` (hanya `add`), `CommitResult`. Pola dipertahankan: `host.structuredClone`/`host.crypto` (core dikompilasi tanpa lib DOM/@types/node), `live()` menutup transaksi, commit memanggil `resolveTokens(w)` (validasi token AD-16) **sebelum** rev dinaikkan. `add` sudah menolak parent daun dan board bukan di halaman — pertahankan perilaku + pesannya (tes yang ada memeriksa pesan memuat tipe). Boleh dipecah ke `src/{ids,tree,transaction,locks,migrate}.ts` dengan re-export dari `index.ts`.
- `packages/core/src/index.test.ts` -- tes yang ada (pola `fixedNow`, `boardIn`, `expect.unreachable()`); harapan `path` string berubah menjadi list. Tes baru boleh di file `src/*.test.ts` lain.
- `packages/core/package.json` -- belum punya script `test`; tambahkan `"test": "vitest run --root ../.. packages/core/"` (atau setara yang terbukti jalan) agar `pnpm --filter @lakar/core test` berfungsi.
- `packages/schema/src/nodes.ts:340-360` -- `LakarDocument` (schemaVersion literal 1, tokens opsional), `HistoryEntry`, `CreatedEntry` (`path: string` → `path: string[]`). `NodeInput` (discriminatedUnion input tanpa id/children), `Tokens`/`TokenName`/`TokenValue`, `zodToLakarError`, `SCHEMA_VERSION`. Ubah hanya tipe `CreatedEntry`.
- `packages/schema/src/tokens.ts` -- `resolveTokens(doc)` melempar `TOKEN_UNKNOWN`/`SCHEMA_INVALID`; read-only.
- `packages/daemon/src/mutex.ts` -- `KeyedMutex` pindah ke core sebagai `DocumentLocks`; `Mutex` tetap di daemon (dipakai `chromium.ts`, diganti pool di story 12).
- `packages/daemon/src/server.ts:118-139` (`/execute`) -- pakai `DocumentLocks` dari core + `transact` (snippet `{ok:false}` → lempar `run.error` di dalam body → rollback). Bila `entry === null`: jangan tulis file/riwayat, kembalikan rev sekarang dan `created: []`. `store.write` + `appendHistory` tetap di daemon. `/docs/open` tetap memakai kunci yang sama.
- `packages/daemon/src/store.ts` -- `parseDocument` dari core; perilaku tetap (migrasi terjadi di dalam `parseDocument`).
- `packages/daemon/src/index.test.ts:131-145,221-235` -- harapan `path` string → list. Tambah satu tes HTTP: snippet tanpa mutasi (`'1+1'`) → ok, rev tetap, file & riwayat tidak berubah.
- `packages/mcp/src/server.ts:56` -- teks `created:[{id,name,path}]` → jelaskan `path` = list nama board→node, addressing via `id`. `packages/mcp/src/index.test.ts:35` -- fixture `path` jadi list.
- `packages/exec/src/{api,index}.ts` -- read-only (hanya memanggil `tx.add`); harus tetap terkompilasi.
- `tests/dependency-direction.ts` -- read-only; harus tetap lulus.

## Tasks & Acceptance

**Execution:**
- [x] `packages/schema/src/nodes.ts` -- `CreatedEntry.path: string[]` -- addressing tidak ambigu.
- [x] `packages/core/src/` -- `Transaction` mendapat `update(id, patch)`, `replace(id, node)`, `move(id, parentId|null, index?)`, `duplicate(id, patch?): string`, `remove(id)`, `setTokens(map)` sesuai matriks; validasi lewat skema schema (gabungkan patch → input tanpa `id`/`children` → `NodeInput.safeParse`, `zodToLakarError`); `opsSummary` menghitung op sukses per jenis dalam urutan pertama dipakai; `created` dihitung saat commit dari dokumen akhir; commit kosong → `{doc: dokumen asli, entry: null, created: []}`. Ekspor `transact(doc, opts & {description}, body)` (async, body sinkron/async; lempar → rollback + lempar ulang; sukses → commit, kembalikan `{value, ...CommitResult}`), `DocumentLocks` (`run(key, fn)` FIFO per kunci, lepas saat error), `migrateDocument(raw, {migrations?, target?})` + registri `MIGRATIONS` (kosong, kunci n = langkah n→n+1, tidak memutasi input), dan `parseDocument` = migrasi lalu validasi.
- [x] `packages/core/src/*.test.ts` + `package.json` -- tes setiap baris matriks (termasuk atomisitas op gagal yang ditangkap: salinan kerja identik sebelum/sesudah), migrasi rantai 1→2→3 dengan registri injeksi, dan kunci. Bukti verify tiket: error tak tertangkap → dokumen utuh tanpa entri; commit → rev+1 + tepat satu entri; `created` list dengan nama ganda.
- [x] `packages/daemon/src/{server,mutex}.ts` + `index.test.ts` -- sesuai Code Map.
- [x] `packages/mcp/src/{server,index.test}.ts` -- teks/fixture `path` list.

**Acceptance Criteria:**
- Given build selesai, when `pnpm --filter @lakar/core test`, then lulus dan mencakup: error tak tertangkap mengembalikan dokumen utuh tanpa entri riwayat, commit menambah rev dan tepat satu entri riwayat, serta `created` berupa list yang mempertahankan nama ganda.
- Given `lakard` uji (port 0), when `POST /execute` sukses, then `created[].path` berupa list nama; when snippet tanpa mutasi, then `{ok:true}`, rev tetap, file dokumen dan riwayat tidak berubah.
- Given selesai, when `pnpm test` dan `verify.sh`, then lulus, termasuk arah dependensi (core tanpa IO) dan tes Chromium daemon, 0 skip.

## Implementation Notes

- Core dipecah: `src/{host,ids,tree,locks,migrate,transaction}.ts`, `index.ts` me-re-export + `createDocument`. Core tidak mengimpor `zod` (validasi `setTokens` memakai `TokenName`/`TokenValue` dari schema).
- Alamat yang bukan ID 8 karakter (nama, path, angka) → `SCHEMA_INVALID` + hint ID; ID 8 karakter yang tak ada → `NOT_FOUND`. Berlaku juga untuk `add(parentId)` (sebelumnya `NOT_FOUND`).
- `created` dari `duplicate` memuat seluruh node baru subtree salinan (pre-order), bukan hanya akarnya.
- `move(board, null)` me-reorder di halaman tempat board berada; `index` = posisi akhir (0..len, len tanpa node yang dipindah).
- Atomisitas op gagal diuji dengan membandingkan commit transaksi "setup + op gagal (ditangkap)" vs "setup saja" dengan sumber acak sama (Transaction tidak mengekspos salinan kerja).

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 3 findings — high 0, medium 1, low 2, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` `DocStore.read` membungkus ulang `VERSION_MISMATCH` dari `parseDocument` (kini memigrasi) sebagai "file dokumen … rusak" dengan hint "pulihkan dari cadangan", sehingga agen diarahkan memulihkan cadangan untuk dokumen versi lebih baru — dikonfirmasi di `store.ts:39-45`. Diperbaiki: `VERSION_MISMATCH` diteruskan apa adanya; tes daemon baru (file `schemaVersion: 2` lewat `/docs/open` → `VERSION_MISMATCH` + hint perbarui, tanpa "rusak").
  - `[low]` `[reject]` Kunci `__proto__` dalam patch `update`/`duplicate` mengganti prototipe objek merge alih-alih ditolak sebagai kunci asing — benar (properti warisan tetap divalidasi skema, jadi tidak ada data tak valid yang tersimpan), tetapi agen hampir tidak mungkin mengirim `__proto__` dan perbaikannya menambah guard; ditolak sesuai aturan triase.
  - `[low]` `[patch]` `hasChildren` diimpor tetapi tidak dipakai di `transaction.ts` dan diekspor tanpa pemanggil di `tree.ts` — dikonfirmasi. Dihapus.

## Design Notes

- **update vs replace:** `update` = merge dangkal (tipe tetap); `replace` = semua properti diganti, boleh ganti tipe, ID + posisi tetap. Anak dipertahankan bila tipe baru kontainer (frame/board); tipe daun pada node beranak ditolak supaya subtree tidak terhapus diam-diam. `null` dalam patch = hapus kunci (JSON tidak punya `undefined`; QuickJS `dump` membuang `undefined`).
- **Commit kosong:** transaksi tanpa op sukses tidak menghasilkan revisi atau entri (setara rollback tanpa perubahan). Ini tafsiran AD-4 agar snippet baca-saja (story 9) tidak mengotori riwayat atau memicu `CONFLICT` `baseRev` B.
- **Path:** `['Home', 'Hero / Card', 'Judul']`, bukan `'Home/Hero / Card/Judul'`. ID tetap satu-satunya alamat op; path hanya untuk dibaca.
- **Migrasi:** `migrateDocument` hanya memeriksa `schemaVersion` dan menjalankan rantai; validasi penuh tetap oleh `LakarDocument`. Hasil langkah yang `schemaVersion`-nya bukan n+1 → `Error` (bug migrasi, bukan input agen).

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm build` -- expected: exit 0
- `cd /root/lakar && /opt/node-26/bin/pnpm --filter @lakar/core test` -- expected: exit 0, semua tes core lulus
- `cd /root/lakar && /opt/node-26/bin/pnpm test` -- expected: exit 0, 0 skip, arah dependensi dan tes Chromium daemon lulus
- `pgrep -af 'lakar.*(daemon|chrome)|headless_shell' ; ss -ltnp | grep -c 7466` -- expected: tidak ada proses Lakar tersisa, port bebas (0)
- `cd /root/lakar && bash tools/node26/verify.sh` -- expected: exit 0

## Auto Run Result

- **Status:** built.
- **Ringkasan:** `packages/core` kini punya ketujuh op AD-4 (`add`, `update`, `replace`, `move`, `duplicate`, `remove`, `setTokens`) di atas salinan copy-on-write. Setiap op atomik sendiri (op gagal yang ditangkap snippet tidak meninggalkan jejak). Ada juga `transact` (error tak tertangkap → rollback penuh + lempar ulang), `DocumentLocks` (kunci async FIFO per dokumen, dipindah dari daemon), `migrateDocument` + registri `MIGRATIONS` (kosong), dan `parseDocument` = migrasi lalu validasi. Commit tanpa op sukses tidak membuat revisi (`entry: null`). `created` dihitung saat commit dari dokumen akhir. Addressing op hanya via ID; `CreatedEntry.path` kini list nama (`['Home','Hero / Card','Judul']`), sehingga ambiguitas ` / ` warisan tracer selesai.
- **File:**
  - `packages/schema/src/nodes.ts`: `CreatedEntry.path: string[]`;
  - `packages/core/src/{host,ids,tree,locks,migrate,transaction,index}.ts`: op, transaksi, kunci, migrasi;
  - `packages/core/src/{index,transaction,migrate,locks}.test.ts`, `packages/core/package.json` (script `test`);
  - `packages/daemon/src/server.ts`: `/execute` lewat `transact` + `DocumentLocks`, snippet tanpa mutasi tidak menulis file/riwayat;
  - `packages/daemon/src/mutex.ts`: `KeyedMutex` dihapus (`Mutex` tetap untuk Chromium);
  - `packages/daemon/src/store.ts`: `VERSION_MISMATCH` diteruskan apa adanya;
  - `packages/daemon/src/index.test.ts`: path list, tes snippet tanpa mutasi, tes dokumen versi lebih baru;
  - `packages/mcp/src/{server,index.test}.ts`: teks/fixture path list.
- **Review (quick):** 3 temuan — 2 patch (medium 1, low 1), 0 defer, 1 reject (`__proto__` dalam patch: tidak realistis bagi agen, perbaikan menambah guard).
- **Follow-up review:** `false` — hanya satu medium yang di-patch, tanpa high.
- **Verifikasi:** `pnpm build` exit 0; `pnpm --filter @lakar/core test` 91 lulus; `pnpm test` 24 file / 310 tes lulus, 0 skip (termasuk Chromium daemon dan arah dependensi); tidak ada proses daemon/Chromium Lakar tersisa, port 7466 bebas (proses `[headless_shell] <defunct>` milik `node app.js` PID 1931892 sejak 17 Nov, bukan Lakar); `tools/node26/verify.sh` exit 0, snapshot C9 identik.
- **Risiko residual:**
  - Op baru belum terekspos di sandbox `execute` (`api.ts`) — milik story 9; sampai itu snippet hanya bisa `add`.
  - Write-back dokumen hasil migrasi ke disk milik story 9 (registri masih kosong, jadi belum berdampak).
  - Commit kosong tanpa revisi adalah tafsiran AD-4 (lihat Design Notes); story 9/B harus mengikuti `entry: null`.
  - `created` dari `duplicate` board besar memuat seluruh subtree (respons panjang).
  - Alamat non-ID kini `SCHEMA_INVALID` (sebelumnya `NOT_FOUND` untuk `add(parentId)`).
