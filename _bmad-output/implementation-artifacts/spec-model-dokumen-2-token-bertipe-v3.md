---
title: 'Skema v3: token bertipe dengan mode tema dan migrasi v2 ke v3 (epic model-dokumen story 2)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: '3da0d819c922a97648dba6ae854882a1dff66e22'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
  - '{project-root}/tests/fixtures/docs/README.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Agen tidak punya API baca untuk tokens dan tokenModes dokumen, sehingga tidak bisa melihat definisi token atau daftar mode sebelum setTokenModes.
    evidence: |-
      get/find di API execute hanya mengembalikan node; tidak ada fungsi baca kepala dokumen. Celah sudah ada sebelum v3 (token datar v2 juga tidak bisa dibaca).
    location: >-
      packages/exec/src/api.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Token v2 adalah peta datar `nama â†’ string|angka` tanpa tipe dan tanpa mode. AD-11 spine mewajibkan:
- token bertipe;
- satu tabel jenis-slot â†” tipe-token yang divalidasi saat commit;
- mode tema per board;
- migrasi dokumen lama yang tidak mengubah tampilan.

AD-4 mewajibkan `setTokens` tetap menerima nilai datar lama.

**Approach:** Naikkan `SCHEMA_VERSION` ke 3.
- **Skema:** token menjadi `{type, value, modes?}`, dokumen mendapat `tokenModes?`, board mendapat `themeMode?`.
- **Validasi:** tabel slot di `@lakar/schema` dipakai `resolveTokens` untuk memvalidasi tipe dan memilih nilai mode.
- **Inferensi tipe:** satu fungsi di `@lakar/core` dipakai bersama oleh migrasi 2â†’3 dan oleh commit, untuk token yang di-set dengan nilai datar.
- **API:** op baru `setTokenModes`.
- **Korpus:** fixture v3 baru.

## Boundaries & Constraints

**Always:**
- **Tipe token tertutup.** Nilai `TOKEN_TYPES` urut: `color, radius, spacing, container, breakpoint, fontFamily, fontWeight, fontSize, lineHeight, letterSpacing`.
- **Validasi nilai per tipe**, berlaku untuk `value` dan setiap nilai di `modes`:

  | Tipe | Nilai yang valid |
  |---|---|
  | `color` | hex `#RRGGBB` atau `#RRGGBBAA` |
  | `fontFamily` | string tidak kosong |
  | `fontWeight` | integer 100â€“900, kelipatan 100 |
  | `radius`, `spacing`, `container`, `breakpoint`, `fontSize` | angka â‰¥ 0 |
  | `lineHeight` | angka > 0 |
  | `letterSpacing` | angka finite |

- **Mode.**
  - Nama mode cocok dengan `^[a-z0-9][a-z0-9-]{0,31}$`.
  - `tokenModes` berisi minimal satu nama, tanpa duplikat. Elemen pertama adalah mode default.
  - Kunci `modes` pada token, dan `themeMode` pada board, wajib ada di `tokenModes`. Bila `tokenModes` tidak ada, `modes` dan `themeMode` dilarang. Pelanggaran â†’ `SCHEMA_INVALID`, divalidasi oleh `LakarDocument`.
- **Tabel slot** (satu sumber di `@lakar/schema`). Grup panjang = `{spacing, radius, container, breakpoint}`.

  | Slot | Tipe token yang diterima |
  |---|---|
  | warna (`color` di fill solid, stops, stroke, shadow, text, icon; `colors[i]` mesh) | `color` |
  | `radius` (termasuk tuple), `gap`, `padding` (termasuk tuple), `width`/`height`/`min*`/`max*` node, `stroke.width`, `size` icon | grup panjang |
  | `size` text | `fontSize` |
  | `family` | `fontFamily` |
  | `weight` | `fontWeight` |
  | `lineHeight` | `lineHeight` |
  | `letterSpacing` | `letterSpacing` |

  Setiap slot juga punya *tipe utama*, dipakai saat inferensi:
  - `radius` â†’ `radius`;
  - `gap`, `padding`, dimensi, `stroke.width`, `size` icon â†’ `spacing`;
  - slot lain â†’ tipe satu-satunya di tabel.
- **`resolveTokens(doc, opts?: { mode?: string })`.**
  - Mode efektif per board: `opts.mode` ?? `board.themeMode` ?? `tokenModes[0]`. Nilai = `token.modes?.[mode]` ?? `token.value`.
  - Ref ke token yang tipenya tidak diterima slot â†’ `SCHEMA_INVALID`. Pesannya menyebut path slot, nama token, dan tipenya.
  - `opts.mode` yang tidak ada di `tokenModes` â†’ `SCHEMA_INVALID`.
  - Perilaku `TOKEN_UNKNOWN` tetap.
- **Inferensi tipe** (fungsi murni di core, dipakai migrasi dan commit):
  - Untuk token yang dirujuk: tipe = tipe utama yang paling sering muncul di slot yang merujuknya. Bila seri, pakai urutan `TOKEN_TYPES`.
  - Setiap ref dari slot yang tidak menerima tipe itu diganti nilai literal token (detach).
  - Untuk token yang tidak dirujuk: hex â†’ `color`, string lain â†’ `fontFamily`, angka â‰¥ 0 â†’ `spacing`, angka < 0 â†’ `letterSpacing`.
- **Migrasi `MIGRATIONS[2]`:**
  - token datar â†’ `{type, value}` lewat inferensi;
  - tanpa `tokenModes`, tanpa `modes`;
  - murni, tidak memutasi input;
  - dokumen tanpa `tokens` hanya naik versi.
- **`setTokens(map)`.** Setiap nilai di `map` diperlakukan begini:

  | Nilai di `map` | Perilaku |
  |---|---|
  | `null` | menghapus token |
  | string/angka datar, token **sudah ada** | `value` diganti; `type` dan `modes` dipertahankan |
  | string/angka datar, token **baru** | token ditandai untuk inferensi saat commit (seperti migrasi, termasuk detach) |
  | objek `{type, value, modes?}` | menggantikan token sepenuhnya |

  Satu entri salah â†’ seluruh peta ditolak `SCHEMA_INVALID` (perilaku lama).
- **Op baru `setTokenModes(modes: string[] | null)`** di `Transaction` core dan API `execute`. `null` menghapus `tokenModes`. Konsistensi diperiksa saat commit lewat validasi dokumen.
- **API `execute`:** signature `setTokens` diperluas, entri `setTokenModes` ditambah, `api.md` dibuat ulang dengan `node scripts/gen-skill-api.mjs` sesudah build. Teks skill dan deskripsi MCP tetap ringkas, dengan contoh datar lama tetap berlaku.
- **Korpus:** tambah minimal satu fixture `tests/fixtures/docs/v3/*.lakar.json`: token semua tipe, `tokenModes: ['light','dark']`, token dengan `modes`, satu board `themeMode: 'dark'`, satu board tanpa `themeMode`.
- **Tes yang ada:**
  - Tes yang menulis dokumen `schemaVersion: SCHEMA_VERSION` dengan token datar diubah memakai `schemaVersion: 2` (supaya melewati migrasi) atau bentuk bertipe.
  - Asersi `SCHEMA_VERSION` = 2 diubah menjadi 3.
  - Asersi lain tidak dilemahkan.

**Never:**
- Mengubah render, check, viewer, atau route daemon.
- Mengubah nama atau arti kode error.
- `resolveDocument` (milik story 3).
- Komponen atau instance.
- Menerima string CSS sebagai nilai token.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Migrasi warna | v2 `tokens: {'colors.a':'#111111'}`, dirujuk fill | v3 `{type:'color', value:'#111111'}`, ref tetap | â€” |
| Migrasi grup panjang | angka dirujuk 1Ã— `padding` + 1Ã— `radius` | seri â†’ `radius` (urutan TOKEN_TYPES), kedua ref tetap (satu grup) | â€” |
| Migrasi lintas grup | angka 16 dirujuk 2Ã— `size` text + 1Ã— `gap` | `fontSize`; ref `gap` di-detach menjadi `16` | â€” |
| Migrasi tak dirujuk | `'#FFF000'`, `'Inter'`, `8`, `-0.5` | `color`, `fontFamily`, `spacing`, `letterSpacing` | â€” |
| Tampilan tetap | setiap fixture v1/v2 korpus | `resolveTokens(parseDocument(raw)).pages` deep-equal dengan substitusi ref ke nilai datar lama pada raw | â€” |
| setTokens datar baru | `setTokens({'radius.md':8})` + node `radius:{$token:'radius.md'}` di snippet yang sama | commit sukses, token `type:'radius'` | â€” |
| setTokens datar ke token ada | token `{type:'color', modes:{dark:...}}`, `setTokens({'colors.a':'#222222'})` | `value` baru, `type`/`modes` tetap | â€” |
| setTokens bertipe | `{'colors.b':{type:'color', value:'#FFFFFF'}}` | tersimpan apa adanya | â€” |
| Nilai salah tipe | `{'colors.b':{type:'color', value:16}}` | ditolak, dokumen tak berubah | `SCHEMA_INVALID` |
| Slot salah | token `color` dirujuk di `padding` | commit gagal | `SCHEMA_INVALID` menyebut path, token, tipe |
| Mode board | `tokenModes:['light','dark']`, token `value:'#FFFFFF', modes:{dark:'#000000'}`, board `themeMode:'dark'` | board itu `#000000`; board tanpa `themeMode` `#FFFFFF` | â€” |
| Paksa mode | `resolveTokens(doc,{mode:'dark'})` | semua board `#000000` | mode tak dikenal â†’ `SCHEMA_INVALID` |
| Mode tak terdaftar | `modes:{sepia:...}` atau `themeMode:'sepia'` | ditolak | `SCHEMA_INVALID` |
| setTokenModes | `setTokenModes(['light','dark'])` lalu `update(board,{themeMode:'dark'})` | commit sukses | `setTokenModes(null)` saat masih dipakai â†’ `SCHEMA_INVALID` saat commit |

</intent-contract>

## Code Map

- `packages/schema/src/nodes.ts`:
  - `SCHEMA_VERSION`, `TokenValue`, `Tokens`, `TokenRef`, `tok()`, `boardShape` (tambah `themeMode`), `LakarDocument` (tambah `tokenModes`, `superRefine` mode);
  - `zodToLakarError` (hint katalog menyebut "v1": boleh dibiarkan).
- `packages/schema/src/tokens.ts`:
  - `resolveTokens`, `findTokenRefs` (memberi path ref), `assertTokensKnown`, `suggestTokens`;
  - tempat tabel slot + validasi tipe + pemilihan mode. `Resolved<T>` tetap.
- `packages/core/src/migrate.ts` -- `MIGRATIONS` (tambah kunci `2`). Kontrak langkah ada di komentar file.
- `packages/core/src/transaction.ts`:
  - `parseTokenPatch` (sekitar baris 150), op `setTokens` (sekitar baris 347);
  - `commit` memanggil `resolveTokens(w)` (sekitar baris 366), jadi inferensi token baru datar dijalankan sebelumnya;
  - `OpKind`, interface `Transaction` (tambah `setTokenModes`).
- `packages/core/src/index.ts` -- ekspor publik core.
- `packages/exec/src/api.ts`:
  - entri `setTokens` (sekitar baris 409), signature `LakarApi.setTokens` (sekitar baris 108);
  - bagian referensi "Token" (sekitar baris 689); tambah entri `setTokenModes` dengan pola entri `op` lain.
- `scripts/gen-skill-api.mjs` + `tests/skills.test.ts` -- `api.md` harus sama dengan `renderApiMarkdown()`. Ada batas ukuran skill di `tests/skills.test.ts`.
- `packages/mcp/src/server.ts` (sekitar baris 188) -- deskripsi execute menyebut `setTokens` datar. Tetap valid dan tidak wajib diubah.
- Tes yang perlu disesuaikan:
  - `packages/schema/src/index.test.ts:70`, `packages/schema/src/v2.test.ts:19,68`;
  - `packages/core/src/index.test.ts:149,167`, `packages/core/src/transaction.test.ts:383,388`;
  - `packages/daemon/src/index.test.ts:815`, `packages/daemon/src/store.test.ts:105,126`;
  - `bench/src/round/round.test.ts:499`.
- `tests/doc-corpus.test.ts`, `tests/support/doc-corpus.ts`, `tests/fixtures/docs/README.md` -- korpus story 1 (cakupan versi mewajibkan fixture v3).

## Tasks & Acceptance

**Execution:**
- `packages/schema/src/nodes.ts` -- `TOKEN_TYPES`, `TokenType`, `TokenDef`, `Tokens` baru, `ModeName`, `tokenModes`, `themeMode`, validasi mode, `SCHEMA_VERSION = 3`.
- `packages/schema/src/tokens.ts` -- tabel slot (ekspor: fungsi yang memberi tipe utama dan tipe yang diterima untuk sebuah ref beserta node pemiliknya), validasi tipe ref, mode di `resolveTokens`.
- `packages/core/src/tokens-infer.ts` (baru) + `migrate.ts` + `transaction.ts` + `index.ts` -- inferensi bersama, `MIGRATIONS[2]`, `setTokens` gaya baru, `setTokenModes`.
- `packages/exec/src/api.ts` + `packages/skills/skills/api.md` -- entri API diperbarui dan dibuat ulang.
- `tests/fixtures/docs/v3/*.lakar.json` + README korpus -- fixture v3.
- Tes:
  - `packages/schema/src/v3.test.ts` (baru) untuk validasi skema, tabel slot, dan mode;
  - `packages/core/src/migrate.test.ts` / `transaction.test.ts` untuk inferensi, migrasi, `setTokens`, dan `setTokenModes`;
  - `tests/doc-corpus.test.ts` untuk tampilan tetap.
  - Semua baris matriks dites, dan tes lama disesuaikan.

**Acceptance Criteria:**
- Given daemon dengan dokumen v2 di data dir, when dokumen dibuka (`/docs/open`), then file ditulis balik sebagai v3 dan `screenshot` tetap sukses.
- Given agen menjalankan contoh `setTokens` di `api.md`, when snippet dijalankan lewat `execute`, then sukses tanpa error.
- Given seluruh korpus v1/v2/v3, when tes korpus dan tes render korpus dijalankan, then semua lulus.

## Spec Change Log

## Review Triage Log

### 2026-11-22 — Review pass
- verdicts: 28 findings — high 0, medium 1, low 20, false 7, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent) tidak ada tes `setTokenModes`/`setTokens` bertipe lewat `execute` — `skills-examples.test.ts` menjalankan blok `api.md` (termasuk contoh `setTokens` dan `setTokenModes`) terhadap daemon nyata; di mesin ini satu-satunya blok gagal adalah `photo()` (baseline Windows).
  - `[low]` `[reject]` (intent) inferensi melewati kandidat tipe yang tidak menerima nilai — tafsiran literal membuat migrasi menghasilkan dokumen tidak valid (gagal dibuka); perluasan ini hanya aktif saat tafsiran literal tidak bisa dipenuhi, dan tampilan tetap.
  - `[false]` `[reject]` (intent) `setTokenModes` dan `opts.mode` di luar intent — keduanya diwajibkan spec (Boundaries `Always`).
  - `[false]` `[reject]` (intent) pelanggaran `setTokenModes(null)` baru tertangkap saat commit — sesuai spec ("konsistensi diperiksa saat commit").
  - `[low]` `[reject]` (edge) `resolveTokens` pada `pages` tidak berbentuk array → TypeError — semua pemanggil memberi dokumen ter-parse (`LakarDocument`); input mentah bukan kontrak fungsi ini.
  - `[false]` `[reject]` (edge) ref token di properti tingkat halaman — `Page` strict tanpa slot `tok()`, jadi ref di sana tidak pernah valid.
  - `[false]` `[reject]` (edge) `inferTokens` mengembalikan `pages` yang sama bila tidak ada detach — `migrateDocument` sudah `structuredClone` sebelum rantai migrasi; input asli tidak tersentuh (dites).
  - `[low]` `[reject]` (edge) `size` pada node tanpa `type` di raw — dokumen seperti itu gagal validasi v3 sesudah migrasi.
  - `[low]` `[reject]` (edge) `pathKey` ambigu antara indeks array dan kunci numerik — hanya untuk input yang sudah tidak valid skema.
  - `[false]` `[reject]` (edge) literal hasil detach tidak sah untuk slot → commit gagal — kegagalan `SCHEMA_INVALID` yang keras adalah perilaku benar.
  - `[low]` `[reject]` (edge) token v2 bukan string/angka diteruskan apa adanya — v2 strict tidak mengizinkannya; hasilnya tetap divalidasi skema v3.
  - `[false]` `[reject]` (edge) ref di posisi bukan slot — ditolak saat parse ulang skema; tidak ada slot `tok()` di posisi itu.
  - `[low]` `[reject]` (edge) ref tanpa slot dilewati inferensi — sama dengan baris di atas; skema menolak.
  - `[low]` `[reject]` (blind) nilai bertipe di file v2 terbawa ke v3 — hanya untuk file buatan tangan; hasilnya tetap divalidasi v3 (termasuk konsistensi mode).
  - `[low]` `[reject]` (blind) `tokenModes`/`themeMode` di input v2 dipertahankan — v2 strict menolak kunci itu; hanya file buatan tangan, dan hasilnya divalidasi v3.
  - `[low]` `[reject]` (blind) `fontSize` ≥ 0 sementara `text.size` > 0 — kontrak spec menetapkan `fontSize ≥ 0`; token 0 gagal keras saat resolve dengan pesan yang menyebut token dan nilainya.
  - `[low]` `[patch]` (blind) diagnostik resolve memakai `value` dasar, bukan nilai mode — pesan kini menyebut nilai mode efektif, ditambah tes.
  - `[low]` `[reject]` (blind) JSON Schema hasil `jsonSchemas()` tidak memuat aturan mode — zod adalah sumber validasi; JSON Schema hanya turunan dokumentasi.
  - `[low]` `[reject]` (blind) `opts.mode` belum punya pemanggil produksi — disiapkan untuk `resolveDocument` (story 3) dan ekspor (epic kode), sesuai spec.
  - `[low]` `[reject]` (blind) `/boards` tidak memuat `themeMode` — penambahan field route milik epic token; spec melarang perubahan route di story ini.
  - `[medium]` `[defer]` (blind) agen tidak bisa membaca `tokens`/`tokenModes` dokumen — celah sudah ada sebelumnya (token v2 juga tidak bisa dibaca); dicatat di `deferred`.
  - `[low]` `[reject]` (blind) `TokenTypeName` di api.ts menduplikasi `TOKEN_TYPES` — tipe dokumentasi publik API snippet; drift tertangkap typecheck bila `TokenDefinition` dipakai ke core.
  - `[low]` `[patch]` (blind) katalog board di `api.md` tanpa `themeMode` — ditambahkan.
  - `[low]` `[patch]` (blind) aturan nama mode tidak lengkap di dokumen — aturan lengkap ditulis.
  - `[low]` `[patch]` (blind) batasan nilai per tipe token tidak didokumentasikan — satu baris batasan ditambahkan ke referensi Token.
  - `[low]` `[patch]` (blind) README dan header schema masih menyebut v1 — diperbarui ke v3 (teks hint error tidak diubah).
  - `[low]` `[reject]` (blind) `modes: {}` diterima — tidak berbahaya; sama dengan tanpa `modes`.
  - `[low]` `[reject]` (blind) `tokenModeIssues` TypeError pada input rusak — duplikat temuan edge pertama.
  - (verification-gap) tidak ada celah verifikasi.

## Verification

**Commands** (Windows: awali dengan `set "PATH=C:\Users\Fatmuh\AppData\Local\nvm\v26.5.0;%PATH%" &&`; pnpm = `npx -y pnpm@12.21.0`):
- `npx -y pnpm@12.21.0 build && node scripts/gen-skill-api.mjs` -- expected: sukses, `api.md` ditulis
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: 0 error
- `npx -y pnpm@12.21.0 exec vitest run packages/schema packages/core packages/exec tests/doc-corpus.test.ts tests/skills.test.ts packages/render/test/corpus.test.ts bench/src/round` -- expected: semua lulus
- `npx -y pnpm@12.21.0 exec vitest run packages/daemon` -- expected: tidak ada kegagalan baru dibanding baseline Windows di `%TEMP%\lakar-fail-base.txt` (kegagalan foto/SIGKILL/pool/latensi/api.md-skills-examples yang sudah ada sebelumnya)

## Auto Run Result

- **Ringkasan:** skema v3.
  - Token bertipe `{type, value, modes?}`, `tokenModes` di dokumen, `themeMode` di board.
  - Tabel slot di `@lakar/schema` (`tokenSlot`, `findTokenUses`).
  - `resolveTokens(doc, {mode?})` dengan validasi tipe slot dan pemilihan mode.
  - Inferensi tipe bersama di `@lakar/core` (`tokens-infer.ts`), dipakai `MIGRATIONS[2]` dan commit.
  - `setTokens` menerima nilai datar dan bentuk bertipe; op baru `setTokenModes`.
  - Fixture korpus v3.
- **File:**
  - `packages/schema/src/{nodes,tokens,index}.ts`, `README.md` -- skema, tabel slot, resolusi.
  - `packages/core/src/{tokens-infer,migrate,transaction,index}.ts` -- inferensi, migrasi, op.
  - `packages/exec/src/api.ts`, `packages/skills/skills/api.md`, `packages/mcp/src/server.ts` -- API dan dokumentasi agen.
  - `tests/fixtures/docs/v3/tema-mode.lakar.json`, README korpus, `tests/doc-corpus.test.ts` -- korpus.
  - Tes baru `packages/schema/src/v3.test.ts`; tes core, daemon, dan bench disesuaikan.
- **Review:** 28 temuan.
  - 5 di-patch (semua low): diagnostik nilai mode, `themeMode` di katalog board, aturan nama mode, batasan nilai per tipe, teks v1 → v3.
  - 1 ditunda (medium, sudah ada sebelumnya): API baca token. Dicatat juga di `deferred-work.md`.
  - 22 ditolak (7 false, 15 low) dengan alasan di Triage Log.
- **Follow-up review:** `false`. Semua patch low.
- **Verifikasi:**
  - `pnpm build` + `gen-skill-api` OK; `tsc -p tsconfig.test.json` 0 error.
  - Suite schema/core/exec/korpus/skills/render-korpus/bench-round/mcp/execute-description/dependency-direction: 536/538. Dua yang gagal adalah batas ukuran `core.md`/`landing.md`, baseline Windows CRLF.
  - `vitest run packages/daemon`: tidak ada kegagalan baru dibanding baseline (foto, SIGTERM, SIGKILL).
- **Risiko sisa:**
  - Ref token dari grup slot lain ke token yang sudah bertipe kini ditolak (AD-11 sengaja lebih ketat daripada v2).
  - CI Linux belum dijalankan untuk story ini.
