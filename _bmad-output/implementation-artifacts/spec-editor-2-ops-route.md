---
title: 'Route ops viewer dan undo dengan op invers (epic editor-canvas story 2)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: 'ef77c882a425a1122e8aec6db037be261246babc'
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

**Problem:** Viewer menulis dokumen dengan menyusun kode JavaScript untuk `/execute` (`codegen.ts`), dan undo hapus memakai restore rev yang ikut menghapus perubahan agen di antaranya. Editor canvas (story 3–6) butuh jalur tulis berbasis data: satu gestur = satu commit, dan undo/redo sebagai commit baru (AD-7, AD-8).

**Approach:** Core mendapat lapisan op JSON (`applyOps`) di atas `Transaction` yang sama dengan `execute`, ditambah op core `insert` (sisip ulang subtree dengan ID aslinya) dan `inverse` di setiap `CommitResult`. Daemon menambah `POST /viewer/docs/:slug/ops` yang menjalankan daftar op sebagai satu transaksi semua-atau-tidak dan mengembalikan op invers; viewer mendapat metode klien bertipe `applyOps` tanpa perubahan UI.

## Boundaries & Constraints

**Always:**
- Satu permintaan ops yang sukses = satu `rev` baru + satu entri riwayat (`sessionId` dan `client` = `lakar-viewer`) + snapshot, lewat `store.commit` di bawah `docLocks` slug (AD-2).
- Op divalidasi oleh `Transaction` core (pesan, kode, hint sama dengan `execute`); op gagal → rollback penuh, file/riwayat/memori tidak berubah, error op pertama dikembalikan dengan prefiks `ops[i] `.
- Op dialamati dengan ID dan diterapkan pada `rev` terbaru; tidak ada `baseRev` (AD-7).
- `inverse` diterapkan sebagai permintaan ops berikutnya mengembalikan `pages`, `tokens`, dan `tokenModes` persis seperti sebelum commit (ID node sama).
- Route berada di bawah `/viewer/*`, kena guard Origin yang sudah ada; sukses memancarkan event `change` `{kind:'edit', slug, rev, boards, origin}`.
- Bentuk respons AD-11 `{ok:true, data}` / `{ok:false, error}`.

**Never:**
- Tidak mengubah route, tool MCP, respons, atau sandbox `execute` yang ada (op `insert` tidak diekspos ke sandbox di story ini).
- Tidak mengubah UI viewer, `codegen.ts`, atau undo viewer yang ada.
- Tidak menjalankan render/check di route ops (pratinjau DOM di viewer; check tetap milik `execute`/`layout_check`).
- Viewer tidak boleh mengimpor `@lakar/core`; tipe op tinggal di `@lakar/schema`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Banyak op satu commit | `{ops:[update A, move B, add C ref:"c", update "@c"]}` | 200 `{slug, rev: r+1, created:[C], inverse:[…], refs:{c: idC}}`; satu entri riwayat `opsSummary` `add×1, move×1, update×2` | — |
| Op tengah gagal | op ke-2 `update` ID tak ada | 404 `NOT_FOUND`, pesan `ops[1] update: node … tidak ada`; rev, file, riwayat, `docs` memori tetap | rollback penuh |
| Undo | kirim `inverse` dari respons sebelumnya | rev+1; dokumen (pages/tokens/tokenModes) sama dengan sebelum commit asal; respons membawa `inverse` baru (= redo) | — |
| Redo | kirim `inverse` dari respons undo | dokumen sama dengan sesudah commit asal, ID node yang dihapus-lalu-disisip sama | — |
| Undo basi | inverse berisi `update X`, X sudah dihapus agen | 404 `NOT_FOUND`, tanpa commit | viewer membuang entri undo (story 6) |
| Remove lalu undo | `remove` frame berisi anak | inverse `insert{parentId, node utuh, index}` mengembalikan subtree di posisi semula | — |
| insert bentrok | `insert` node yang ID-nya (atau ID turunannya) sudah ada | 409 `CONFLICT` | rollback |
| Token | `setTokens` / `setTokenModes` | inverse `setTokens{nama: def lama | null}` / `setTokenModes(lama | null)` | TOKEN_UNKNOWN 422 saat commit |
| Body salah | `ops` bukan array, kosong, > 1000, op tak dikenal, kunci asing, `description` > 200 | 400 `SCHEMA_INVALID` | — |
| Ref tak dikenal | `"@x"` tanpa op `ref:"x"` sebelumnya, atau `ref` ganda | 400 `SCHEMA_INVALID` | rollback |
| Ikon tak dikenal | `add` node icon dengan nama di luar katalog | 422 `ICON_UNKNOWN` | tanpa commit |
| Dokumen tak ada / slug salah | slug belum ada / pola salah | 404 `NOT_FOUND` / 400 `SCHEMA_INVALID` | — |
| Origin asing | header `origin: https://evil.example` | 403 `SCHEMA_INVALID` | tanpa commit |

</intent-contract>

## Code Map

- `packages/core/src/transaction.ts` -- `Transaction` + `beginTransaction`; tempat op `insert`, catatan invers per op, dan `CommitResult.inverse`.
- `packages/core/src/ids.ts` -- `IdAllocator`; perlu `reserve(id)` agar ID yang disisip ulang tidak dialokasikan lagi.
- `packages/core/src/tree.ts` -- `locate`, `indexNodes`, `subtree` untuk posisi lama dan diff.
- `packages/core/src/index.ts` -- ekspor publik core.
- `packages/schema/src/index.ts`, `packages/schema/src/nodes.ts` -- tempat tipe `DocOp` baru (`ops.ts`) bersama skema node.
- `packages/daemon/src/files.ts`, `packages/daemon/src/pages.ts` -- pola route tulis `/viewer/*`, `notify`/`change`, `historyEntry`.
- `packages/daemon/src/server.ts` -- guard Origin (onRequest), `iconRefs` + `icons.canonical` di `/execute`, pendaftaran route.
- `packages/daemon/src/events.ts` -- `ActivityBus.change`, `VIEWER_CLIENT`, `originOf`.
- `packages/viewer/src/api.ts`, `packages/viewer/src/api.test.ts` -- klien viewer (`#write`, `request`) dan tes fetch palsu.

## Tasks & Acceptance

**Execution:**
- `packages/schema/src/ops.ts` -- baru: tipe `DocOp` (union `add|update|replace|move|duplicate|remove|insert|setTokens|setTokenModes`) dan `OPS_MAX = 1000`; ekspor dari `index.ts` -- tipe dibagi core, daemon, viewer.
- `packages/core/src/ids.ts` -- tambah `reserve(id)` -- ID yang disisip ulang tidak boleh dialokasikan lagi di transaksi yang sama.
- `packages/core/src/transaction.ts` -- tambah op `insert(parentId, node, index?)` (node tersimpan utuh, divalidasi `BoardNode`/`ChildNode`; parent = ID halaman/board/frame atau `null` = halaman pertama; ID bentrok dengan dokumen kerja atau ganda di subtree → `CONFLICT`; index 0..n); catat invers tiap op sukses; `commit` mengembalikan `inverse` (urutan terbalik, didahului `update` pemulih untuk node yang di-detach inferensi token) -- AD-8.
- `packages/core/src/ops.ts` -- baru: `applyOps(tx, ops)` memvalidasi bentuk tiap op (kunci ketat), menerjemahkan `@ref` di `id`/`parentId`, memanggil op `Transaction`, membungkus error dengan prefiks `ops[i] ` (kode/hint tetap); mengembalikan `refs` -- satu bentuk op untuk route.
- `packages/core/src/index.ts` -- ekspor `applyOps` dan tipe terkait.
- `packages/core/src/ops.test.ts` -- baru: matriks invers per jenis op (termasuk kombinasi, frame dengan anak, board di halaman kedua, token datar baru yang men-detach ref, tokenModes), round-trip undo→redo, error bentuk op, ref, `insert` bentrok.
- `packages/daemon/src/ops.ts` -- baru: `registerOpsRoutes` untuk `POST /viewer/docs/:slug/ops` (body `{ops, description?}`), commit di bawah kunci slug, cek ikon pada board tersentuh, riwayat `lakar-viewer`, respons `{slug, rev, created, inverse, refs}`, event `change` `edit`.
- `packages/daemon/src/server.ts` -- daftarkan `registerOpsRoutes` dengan `docs`, `store`, `docLocks`, `activity`, `icons`.
- `packages/daemon/src/ops.test.ts` -- baru: matriks I/O route (satu rev + satu entri riwayat, rollback, undo/redo lewat route, undo basi, Origin 403, event `change`, ikon, body salah).
- `packages/viewer/src/api.ts` -- tambah tipe `OpsResult` dan metode `applyOps(slug, ops, description?)` lewat antrean tulis (`#write`, invalidasi slug).
- `packages/viewer/src/api.test.ts` -- tes path, method, body, dan ApiError untuk `applyOps`.

**Acceptance Criteria:**
- Given dokumen r5, when viewer mengirim tiga op valid ke `/viewer/docs/:slug/ops`, then dokumen menjadi r6, riwayat bertambah tepat satu entri dengan `client:'lakar-viewer'`, dan snapshot r6 ada.
- Given respons ops A, when `data.inverse` dikirim ke route yang sama, then isi dokumen sama dengan sebelum A (kecuali `rev`), dan `inverse` respons itu bila dikirim lagi menghasilkan isi sesudah A.
- Given jendela viewer mengirim ops dengan header `x-lakar-origin`, when commit sukses, then pelanggan `subscribeAll` menerima `change` `{kind:'edit', slug, rev, boards, origin}`.
- Given `/execute` dan semua route lama, when tes daemon/mcp yang ada dijalankan, then bentuk respons dan perilaku tidak berubah.

## Spec Change Log

## Review Triage Log

### 2026-11-22 - Review pass
- verdicts: 24 findings - high 0, medium 0, low 15, false 9, maybe-false 0
- findings:
  - `low` `reject` (blind) ID dihapus bisa dialokasikan ulang lalu invers basi mengenai node lain - Nyata secara teori, tetapi allocator memilih acak dari 62^8 ID; peluang sangat kecil dalam pemakaian sehari-hari, dan perbaikannya (ID terpakai dari riwayat atau sidik jari node) menambah mekanisme baru.
  - `low` `reject` (blind) `insert` memindai seluruh dokumen per op (O(ops × nodes)) - `collectIds` per insert; 1000 × beberapa ribu node tetap milidetik. Perbaikan (set hidup per transaksi yang harus ikut add/remove) menambah state.
  - `low` `patch` (blind) `setTokens` menghasilkan invers walau tidak ada perubahan - Diperbaiki: invers hanya untuk nama yang nilainya berubah (`sameValue` sebelum/sesudah) di `transaction.ts`; tes "op tanpa efek" di `ops.test.ts`.
  - `low` `patch` (blind) `move` ke posisi yang sama tetap menghasilkan invers - Diperbaiki: invers dilewati bila wadah dan indeks akhir sama; tes "op tanpa efek".
  - `low` `reject` (blind) permintaan tanpa efek tetap membuat commit/rev - Perilaku yang diminta AD-7 ("satu permintaan menjadi satu commit") dan verify ticket; viewer tidak mengirim gestur tanpa perubahan (story 4).
  - `false` `reject` (blind) route ops tidak memperbarui CheckLedger sehingga check lama tampil sebagai terkini - `CheckLedger.forDoc` mensyaratkan `e.rev === doc.rev`; sesudah commit ops rev berubah sehingga kolom Checks kosong, bukan basi, dan `record` memulai catatan baru bila ada rev tanpa check di antaranya.
  - `low` `reject` (blind) hint ICON_UNKNOWN tidak menyebut "tidak di-commit" seperti `/execute` - Kosmetik; setiap error route ops berarti tanpa commit menurut kontrak semua-atau-tidak, dan `NOT_COMMITTED` di `/execute` khusus kegagalan render check.
  - `false` `reject` (blind) `insert` memakai skema node tersimpan sehingga zod membuang kunci/mengisi default - Skema node `.strict()` (kunci asing ditolak, bukan dibuang) dan `nodes.ts` tidak punya `.default`/`.transform`; node invers berasal dari node tersimpan yang sudah ternormalisasi, ikon dicek route.
  - `low` `patch` (blind) invers `replace` hanya dites rect → ellipse - Ditambah tes round-trip replace board, frame berisi anak (anak tetap), dan node absolut di frame layout none.
  - `low` `patch` (blind) `ApplyOpsResult.ids` dihitung lalu dibuang; klien tanpa `ref` tidak tahu ID baru - `ids` dihapus dari `core/src/ops.ts`; `OpsResult` di `viewer/src/api.ts` mendokumentasikan bahwa ID baru per op diketahui lewat `ref`/`refs`.
  - `low` `patch` (blind) tes core kurang untuk insert board ke halaman, `reserve`, token dua kali, tokenModes dari tidak ada - Ditambah empat tes di `core/src/ops.test.ts` (reserve dengan random deterministik, digabung dengan temuan vgap reserve).
  - `low` `patch` (blind) tes daemon tidak mencakup cabang muat-dingin dan `change` tanpa origin - Ditambah tes daemon baru di dataDir yang sama (digabung dengan temuan vgap muat-dingin) dan asersi event tanpa `origin`.
  - `false` `reject` (blind) spec berstatus in-review tetapi bagian review kosong - Status waktu itu `in-progress`; log review memang diisi di langkah ini. Perbaikannya mengedit spec build ini.
  - `low` `patch` (blind) `created` bisa berisi node yang disisip ulang, tidak terdokumentasi di tipe - Komentar `OpsResult` kini menyebut `created` termasuk subtree hasil `insert` (undo hapus) dengan ID lama.
  - `low` `patch` (edge) ref `"__proto__"` hilang karena setter prototipe - `refs` kini `Object.create(null)`; tes ref `__proto__`.
  - `false` `reject` (edge) `applyOps` viewer dengan description kosong ditolak 400 - Penolakan keras adalah kontrak route (description 1–200); pemanggil viewer (story 4–6) mengirim teks tetap, dan error dikembalikan sebagai ApiError tanpa perubahan dokumen.
  - `false` `reject` (edge) error saat commit (TOKEN_UNKNOWN) tanpa prefiks `ops[i]` - Matriks spec memisahkan "TOKEN_UNKNOWN 422 saat commit" dari error op; error commit tidak milik satu op.
  - `low` `patch` (vgap) cabang dokumen di disk yang belum dimuat tidak dites - Ditambah tes: tutup app, `buildServer` baru di dataDir yang sama, satu `update` → 200, rev+1, file tertulis, event `change`.
  - `low` `patch` (vgap) `IdAllocator.reserve` tidak pernah dijalankan tes - Ditambah tes random deterministik: insert ID yang akan dihasilkan allocator, lalu `add` mendapat ID lain.
  - `false` `reject` (intent D1) tumpukan undo per jendela dan pembuangan entri basi tidak ada di viewer - Di luar story ini menurut ticket (story 4–6) dan instruksi orkestrator "viewer UI does NOT change"; route sudah menolak invers basi tanpa commit.
  - `false` `reject` (intent D2) pratinjau lokal selama gestur tidak ada - Milik story 4 (seleksi, geser, ubah ukuran).
  - `false` `reject` (intent D3) op gagal juga karena validasi, bukan hanya NOT_FOUND - AD-7 mewajibkan "bentuk dan validasi yang sama dengan op Transaction"; kalimat "hanya gagal bila id tidak ada" kontras dengan penolakan `baseRev`, yang memang tidak ada.
  - `false` `reject` (intent D4) `insert` dan `@ref` memperluas kosakata op - AD-2 menyuruh kemampuan tulis baru dimulai sebagai op core; keputusan dan penundaan ekspos ke `execute` tercatat di Design Notes dan deferred-work.
  - `low` `reject` (intent D5) invers `replace` memulihkan node utuh sehingga edit agen pada node itu di antaranya tertimpa - `replace` sendiri mengganti semua properti, jadi invers penuh adalah kebalikan alaminya; edit agen pada node yang baru diganti pengguna jarang, dan perbaikannya menambah cabang (update diff untuk tipe sama) yang menyimpang dari Design Notes.

## Design Notes

- **Bentuk op** (`@lakar/schema` `DocOp`, kunci ketat): `{op:'add', parentId, node, ref?}`, `{op:'update', id, patch}`, `{op:'replace', id, node}`, `{op:'move', id, parentId, index?}`, `{op:'duplicate', id, patch?, ref?}`, `{op:'remove', id}`, `{op:'insert', parentId, node, index?}`, `{op:'setTokens', tokens}`, `{op:'setTokenModes', modes}`. Isi `node`/`patch`/`tokens`/`modes` divalidasi `Transaction` seperti di `execute`.
- **ID untuk add/duplicate:** ID baru dialokasikan core. Op berikutnya di permintaan yang sama mengalamatinya dengan `"@<ref>"` di `id`/`parentId` (`ref` pola `[A-Za-z0-9_-]{1,32}`; `@` tidak sah di ID, jadi tak ambigu). Respons `refs` memetakan ref → ID. Invers add/duplicate = `remove(ID baru)`, jadi invers selalu ID konkret.
- **Op `insert`** adalah op core baru (AD-2: kemampuan tulis baru dimulai sebagai op core) karena invers `remove` harus mengembalikan ID asli; tanpa itu redo/undo berantai dan referensi agen putus. Ekspos ke sandbox `execute` ditunda (agen tidak memakai undo, AD-8) — dicatat di `deferred-work.md`.
- **Invers per op** dihitung terhadap salinan kerja tepat sebelum op: `update` → `update` berisi kunci yang berubah saja (nilai lama, atau `null` bila dulu tidak ada), supaya undo tidak menimpa properti lain yang diubah agen; `replace` → `replace(id, properti lama)`; `move` → `move(id, parent lama | null, index lama)`; `remove` → `insert(parent lama | ID halaman, node utuh, index lama)`; `setTokens` → `setTokens{nama: def lama bertipe | null}`; `setTokenModes` → `setTokenModes(lama | null)`. Update tanpa perubahan tidak menghasilkan invers. Commit: `inverse = [pemulih detach…, ...invers op terbalik]`.
- **Detach inferensi token:** token datar baru yang tipenya diinferensi saat commit bisa men-detach ref di node lain; invers diawali `update` yang mengembalikan properti node itu sebelum inferensi.
- `tokens: {}` dianggap setara dengan `tokens` absen (setTokens selalu menulis objek). Perbandingan "keadaan sebelumnya" di tes menormalkan ini.
- **Respons:** `{slug, rev, created, inverse, refs}`; `created` sama dengan `execute` (`{id, name, path}`, termasuk node dari `insert`). `inverse` bisa kosong (semua op tanpa efek); viewer tidak mendorongnya ke tumpukan undo.
- **Riwayat:** `description` opsional (trim, 1–200 karakter), default `Edited in app`; `opsSummary` dari core (`update×2, move×1`). `sessionId` dan `client` = `lakar-viewer`.
- **Batas:** 1–1000 op per permintaan; body tetap batas default 1 MB.
- **Ikon:** route tidak memakai kanonikalisasi sandbox; ikon di board tersentuh dicek `icons.canonical` (seperti `/execute` untuk dokumen lama) → `ICON_UNKNOWN` tanpa commit. Viewer wajib mengirim nama kanonik + `version`.
- **Event:** hanya `change` `edit` (seperti `execute` sesi viewer), `boards` = `touchedBoards` sebelum/sesudah, `origin` dari `x-lakar-origin`.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses tanpa error tsc.
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: tanpa error.
- `npx -y pnpm@12.21.0 exec vitest run packages/core packages/daemon/src/ops.test.ts packages/viewer/src/api.test.ts tests/dependency-direction.test.ts` -- expected: semua lulus.
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru di luar `%TEMP%\lakar-fail-base.txt`.

## Auto Run Result

- **Ringkasan:** route `POST /viewer/docs/:slug/ops` menjalankan daftar op JSON sebagai satu commit semua-atau-tidak (satu rev, satu entri riwayat `lakar-viewer`, snapshot, event `change` `edit`) dan mengembalikan `inverse` dari core untuk undo/redo sebagai commit baru. Core mendapat op `insert` (sisip ulang dengan ID asli), catatan invers per op, dan `applyOps` dengan ref lokal `@ref`. Viewer mendapat `applyOps` bertipe tanpa perubahan UI.
- **File:**
  - `packages/schema/src/ops.ts` (baru), `index.ts` -- tipe `DocOp`, `OPS_MAX`, pola ref.
  - `packages/core/src/transaction.ts` -- op `insert`, invers per op, `CommitResult.inverse`, pemulih detach token.
  - `packages/core/src/ids.ts` -- `IdAllocator.reserve`.
  - `packages/core/src/ops.ts` (baru), `index.ts` -- `applyOps` (bentuk op, `@ref`, prefiks `ops[i]`).
  - `packages/core/src/ops.test.ts` (baru), `transaction.test.ts` -- matriks invers dan error; ekspektasi `inverse: []`.
  - `packages/daemon/src/ops.ts` (baru), `server.ts` -- route ops dan pendaftarannya.
  - `packages/daemon/src/ops.test.ts` (baru) -- matriks I/O route termasuk muat-dingin.
  - `packages/viewer/src/api.ts`, `api.test.ts` -- `OpsResult` + `applyOps`.
  - `_bmad-output/implementation-artifacts/deferred-work.md` -- ekspos `insert` ke `execute` ditunda.
- **Review:** 24 temuan (low 15, false 9). Patch (10 baris, semua low): invers kosong untuk `setTokens`/`move` tanpa efek, `refs` tanpa prototipe, `ids` mati dihapus + dokumentasi `OpsResult`, tes replace/insert board/reserve/token ganda/tokenModes/muat-dingin/origin absen. Defer: tidak ada. Reject: 14 (alasan per baris di Review Triage Log), termasuk penggunaan ulang ID (peluang acak sangat kecil), pemindaian `insert`, commit tanpa efek (diminta AD-7), invers `replace` penuh, dan lima divergensi intent yang berada di luar story atau sudah diputuskan di Design Notes.
- **Follow-up review:** `false` -- patch pass pertama: high 0, medium 0, low 10.
- **Verifikasi:** `pnpm build` sukses; `tsc -p tsconfig.test.json` tanpa error; vitest terarah (core, daemon ops, viewer api, dependency-direction) 198/198 lulus; `pnpm test` penuh 52 gagal / 1430 lulus, nol kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`; snapshot bench yang berubah CRLF saja dikembalikan.
- **Risiko sisa:** `insert` belum ada di sandbox `execute` (deferred-work); route hanya memeriksa keberadaan nama ikon di katalog, bukan kanonikalisasi alias; ID yang dihapus secara teori bisa dialokasikan ulang sehingga invers basi mengenai node lain (peluang acak sangat kecil).
