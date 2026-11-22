---
title: 'Skema dokumen v1 lengkap dengan token dan kode error'
type: feature
ticket: '5'
created: '2026-11-17'
status: done
baseline_revision: '2a14bf299428385bcf99d52a007b6f303f8ee0f2'
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

**Problem:** `packages/schema` baru berisi irisan tracer (board/frame/text, story 3). Story 6–11 butuh katalog node v1 tertutup (AD-15), properti visual bersama, metadata board, token sebagai referensi dengan `resolveTokens` (AD-16), dan JSON Schema (AD-2) sebagai satu sumber kebenaran.

**Approach:** Kembangkan `packages/schema/src` (bukan duplikasi) menjadi skema v1 lengkap. Lalu sesuaikan konsumen (`core`, `render`, `exec`, `daemon`, `mcp`) seperlunya agar tetap terkompilasi dan berperilaku benar untuk tipe baru. Bukti akhir ada di level skema dan di permukaan HTTP `execute`.

## Boundaries & Constraints

**Always:**
- `SCHEMA_VERSION` tetap `1`, karena v1 belum dirilis. Dokumen tracer yang sudah tersimpan (board tanpa `clip`/`fills`, dokumen tanpa `tokens`) tetap ter-parse.
- Kontrak `{ok, data|error}`, `ApiResult`, `LakarError`, dan enum `ErrorCode` (12 kode AD-11, urutan tetap) tidak diubah.
- Semua objek `.strict()`: kunci asing ditolak `SCHEMA_INVALID`. Tipe di luar katalog (`board | frame | text | rect | ellipse | path | icon`) juga ditolak `SCHEMA_INVALID`, dengan hint yang menyebut katalog.
- `x/y` hanya boleh pada board dan pada node anak ber-`position:'absolute'` (berlaku untuk **semua** tipe anak). Hint tetap `XY_HINT`.
- Warna `#RRGGBB[AA]` atau `{$token}`. Selain itu ditolak dengan hint warna.
- `render` tetap hanya memakai `import type` dari schema (AD-6), dan tes arah dependensi tetap lulus. Token di-resolve **daemon** sebelum dokumen dikirim ke render.
- Node: `/opt/node-26/bin/node`, `/opt/node-26/bin/pnpm`. Tidak ada dependensi baru.

**Never:**
- Render properti visual, sizing hug/fill, font, atau tipe node baru dengan benar (story 7/8). Op selain `add` dan `setTokens` (story 6). Validasi/konversi ikon terhadap pustaka (story 10). Check (story 11).
- Membaca `design/` atau `ux-lakar/golden-set.md`. Rubrik atau kriteria golden set tidak masuk teks skema, deskripsi tool, atau hint (C7).
- Menyentuh service, port, atau cache global (C9).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Node valid per tipe | contoh `frame`, `text`, `rect`, `ellipse`, `path`, `icon`, board | `NodeInput` lolos. Lewat `execute` → `created` berisi semua node | — |
| x/y pada node flow | `{type:'rect',name:'R',x:4}` | ditolak | `SCHEMA_INVALID` + `XY_HINT` |
| x/y absolute | `{type:'ellipse',…,position:'absolute',x:4,y:4}` | lolos | — |
| Warna non-hex | `color:'red'`, `fills:[{type:'solid',color:'rgba(0,0,0,1)'}]` | ditolak | `SCHEMA_INVALID` + hint warna |
| Tipe asing | `{type:'image'}`, `{type:'group'}` | ditolak | `SCHEMA_INVALID` + hint katalog |
| Referensi token | `color:{$token:'colors.text-primary'}`, token ada | tersimpan apa adanya. `resolveTokens` mengganti dengan nilai | — |
| Token tidak dikenal | ref ke nama tanpa definisi | `resolveTokens` gagal. Commit core gagal, transaksi tertutup, dan dokumen tidak berubah | `TOKEN_UNKNOWN` + nama + saran |
| Token salah tipe | token `16` dipakai di slot warna | `resolveTokens` gagal | `SCHEMA_INVALID` menyebut path dan token |
| Ellipse/path tidak valid | `inner:1.5`, `sweepDeg:400`, `viewBox:[0,0,0,24]`, `d:''` | ditolak | `SCHEMA_INVALID` |
| Dokumen tracer lama | file story 3 (tanpa clip/tokens) | `LakarDocument` lolos | — |

</intent-contract>

## Code Map

- `packages/schema/src/index.ts` -- satu-satunya sumber skema. Pertahankan ekspor yang dipakai paket lain: `ErrorCode`, `ApiErrorBody`, `ApiResult`, `LakarError`, `ID_PATTERN`, `SLUG_PATTERN`, `Id`, `Slug`, `HexColor`, `XY_HINT`, `NodeInput`, `BoardNode`/`ChildNode`/`FrameNode`/`TextNode`, `Page`, `LakarDocument`, `HistoryEntry`, `CreatedEntry`, `zodToLakarError`, dan `SCHEMA_VERSION`. Pola tracer yang dipertahankan: shape objek + `.strict()` + `superRefine(xyOnlyWhenAbsolute)`, rekursi `children` lewat getter, dan anotasi `z.ZodType<T>`. Boleh dipecah menjadi beberapa file `src/*.ts` dengan re-export dari `index.ts`.
- `packages/schema/src/index.test.ts` -- tes matriks tracer. Perbarui baris `tipe asing rect` (kini valid) dan `family ditolak` (kini valid).
- `packages/core/src/index.ts` -- `add` mengandaikan hanya frame yang punya `children` dan text adalah daun. Generalisasi: anak baru `frame` → `{...input,id,children:[]}`, tipe daun lain → `{...input,id}`, dan parent daun mana pun ditolak. `collectIds`/`findNode` memakai `'children' in n` (tetap benar). `createDocument` menambah `tokens: {}`. `commit` memvalidasi referensi token lewat helper schema: tidak dikenal → tutup transaksi lalu lempar `TOKEN_UNKNOWN`.
- `packages/render/src/index.ts` -- konsumen `import type`. Ganti tipe ke `Resolved*` dari schema. Padding tuple dipetakan. Width/height angka dipetakan. Untuk `hug`/`fill`, tulis komentar `[story 7]`. Tipe daun baru menjadi `div` ber-`data-lakar-id` dengan ukuran numeriknya (`[sementara: story 8/10]`). Board `fills` solid pertama menjadi background (default `#FFFFFF`).
- `packages/daemon/src/server.ts` (`/screenshot`) -- panggil `resolveTokens(doc)` sebelum `render.screenshot`. `RenderPort<…>` di `chromium.ts` memakai tipe dokumen resolved.
- `packages/exec/src/api.ts` -- teks `doc`/`signature` `add` menyebut katalog. Tanpa perubahan perilaku.
- `packages/mcp/src/server.ts:44-50` -- deskripsi tool `execute` menuliskan skema tracer secara manual. Perbarui ringkas ke katalog v1 (tanpa rubrik).
- `packages/daemon/src/index.test.ts` -- pola tes integrasi HTTP (port 0, data dir tmp). Tambahkan kasus `execute` di sini.
- `tests/dependency-direction.ts` -- read-only. Harus tetap lulus.

## Tasks & Acceptance

**Execution:**
- [x] `packages/schema/src/` -- Primitif: `TokenName` (`^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$`, ≤64), `TokenRef {$token}` strict, `tok(s)` = `s | TokenRef`, `Color = tok(HexColor)`. Properti visual bersama: `fills[]` (`solid{color}`, `linear{angle,stops≥2}`, `radial{center?:[0..1,0..1],radius?>0,stops≥2}`, `image{assetId:/^[a-f0-9]{64}$/,fit:cover|contain|fill|tile}`; stop `{offset 0..1,color}`), `stroke{color,width≥0,align:inside|center|outside,sides?:unique nonempty top|right|bottom|left[]}`, `radius` (angka ≥0 atau 4-tuple), `shadows[]{type?:drop|inner,x,y,blur≥0,spread?,color}`, `opacity` 0..1, `blend` (enum mix-blend-mode CSS), `blur≥0`, `backdropBlur≥0`, `rotation` derajat. Sizing `width/height: tok(number≥0) | 'hug' | 'fill'` + `min/maxWidth/Height`. Tiap node anak punya `position?:'absolute'`, `x?`, `y?`. `frame` = layout/gap (boleh negatif)/padding (angka, `[v,h]`, atau `[t,r,b,l]`)/align/justify/sizing/clip/`scrollY≥0` + visual + children. `text` = `content`, `family?`, `weight?` (100–900 kelipatan 100), `style?:normal|italic`, `size`, `lineHeight?` px, `letterSpacing?` em, `align?:left|center|right|justify`, `wrap?:auto|wrap|fixed`, `numeric?:proportional|tabular`, `color?`, sizing, dan efek (opacity/blend/blur/backdropBlur/rotation/shadows), tanpa fills/stroke/radius. `rect` = sizing + visual. `ellipse` = sizing + visual tanpa radius + `startDeg?`, `sweepDeg?` (−360..360), `inner?` [0,1). `path` = `d` nonempty + `viewBox` 4-tuple (w,h>0) + sizing + visual tanpa radius. `icon` = `lib:lucide|simple-icons`, `name` (`^[a-z0-9][a-z0-9-]*$`), `version?`, `size`, `color?`, `strokeWidth?>0`, `filled?` + efek. Board = tracer + `expectedSize?{width,height}` + `clip?: true` + `fills?`. Dokumen = `tokens?: record(TokenName, number|string nonempty)`. Ekspor juga tipe `Resolved<T>`, `ResolvedDocument`, `NODE_TYPES`, `resolveTokens(doc)`, `findTokenRefs(value)`, dan `jsonSchemas()` (`z.toJSONSchema` untuk `LakarDocument` dan `NodeInput`). `zodToLakarError`: hint katalog untuk discriminator tak valid, hint warna untuk issue warna, dan `XY_HINT` tetap diprioritaskan.
- [x] `packages/schema/src/*.test.ts` -- satu contoh valid per tipe (+ board, + dokumen lengkap dengan tokens), dan penolakan `SCHEMA_INVALID` untuk setiap baris matriks. `resolveTokens`: berhasil, `TOKEN_UNKNOWN` (semua nama dilaporkan), salah tipe → `SCHEMA_INVALID`, dan input tidak dimutasi. `jsonSchemas()`: memuat ketujuh tipe, `additionalProperties:false`, dan bentuk `$token`. Dokumen tracer lama tetap lolos.
- [x] `packages/core/src/index.ts` + test -- perubahan sesuai Code Map. Tes: `add` tiap tipe daun, anak ke daun ditolak, dan commit dengan token tak dikenal → `TOKEN_UNKNOWN`, `open===false`, dokumen asli utuh.
- [x] `packages/render/src/index.ts` -- sesuai Code Map. Tetap tanpa impor runtime non-relatif.
- [x] `packages/daemon/src/{server,chromium}.ts` + `index.test.ts` -- resolve sebelum render. Tes HTTP `execute`: (a) snippet berisi ketujuh tipe → `created` 7 entri dan file tersimpan; (b) warna non-hex, x/y flow, dan tipe asing → HTTP 400 `SCHEMA_INVALID`, rev tetap; (c) ref token tak dikenal → `TOKEN_UNKNOWN`, rev tetap.
- [x] `packages/exec/src/api.ts`, `packages/mcp/src/server.ts` -- teks katalog.

**Acceptance Criteria:**
- Given build selesai, when `pnpm exec vitest run packages/schema` dijalankan, then contoh valid per tipe node lolos, dan x/y flow, warna non-hex, serta tipe di luar katalog ditolak `SCHEMA_INVALID` dengan hint yang sesuai.
- Given `lakard` uji (port 0), when `POST /execute` dengan snippet ketujuh tipe, then `{ok:true}` dan `created` berisi 7 entri. When snippet melanggar skema, then `{ok:false,error:{code:'SCHEMA_INVALID'}}` dan rev tidak berubah.
- Given dokumen dengan ref token, when screenshot, then render menerima nilai ter-resolve. Given tokens kosong, when commit, then `TOKEN_UNKNOWN`.
- Given selesai, when `pnpm test` (semua paket) dan `verify.sh`, then lulus, termasuk tes Chromium dan arah dependensi.

## Implementation Notes

- Schema dipecah: `errors.ts` (AD-11), `nodes.ts` (primitif, token, visual, katalog, dokumen, `zodToLakarError`), `tokens.ts` (`Resolved<T>`, `findTokenRefs`, `assertTokensKnown`, `resolveTokens`, `suggestTokens`), `index.ts` (re-export + `jsonSchemas()`).
- `ChildNode` tersimpan memakai `discriminatedUnion` (opsi di-cast karena `FrameNode` dianotasi `ZodType<T>`) agar issue menunjuk path terdalam; ini yang membuat `resolveTokens` bisa menyebut path slot salah tipe.
- Commit core memanggil `resolveTokens(w)` (koreksi orkestrator, semula `assertTokensKnown`): ref tak dikenal → `TOKEN_UNKNOWN`, token salah tipe → `SCHEMA_INVALID`, keduanya saat commit, sehingga dokumen tersimpan selalu bisa di-resolve. Tes core baru: token salah tipe → `SCHEMA_INVALID`, transaksi tertutup, dokumen asli utuh.
- `XY_HINT` kini berbunyi "...tambahkan position:\"absolute\" pada node..." (bukan "pada frame") karena berlaku untuk semua tipe anak.
- Ikon (koreksi orkestrator): plan menaruh nama ikon kanonik di `name`, padahal `name` adalah nama layer wajib (AD-3) dan DESIGN.md menetapkan nama layer default `Icon / <pustaka> / <nama>`. Nama kanonik dipindah ke field `icon` (`^[a-z0-9][a-z0-9-]*$`), dan `name` kembali bebas. Penyimpangan dari tulisan literal AD-9 (`{lib, name, ...}`) dicatat di sini dan di Plan Change Log. Story 10 (alias → kanonik, `ICON_UNKNOWN`) bekerja pada field `icon`.

## Plan Change Log

- 2026-11-17 (orkestrator, sebelum review): node `icon` menyimpan nama ikon kanonik di field `icon`, bukan di `name`. Pemicunya: laporan implementer bahwa `name` sekaligus menjadi nama layer (AD-3), sehingga nama layer DESIGN.md `Icon / lucide / search` ditolak. Keadaan buruk yang dihindari: nama layer ikon dipaksa sama dengan slug ikon. KEEP: regex slug kanonik, `lib`, `version`, `size`, `color`, `strokeWidth`, dan `filled` tetap.
- 2026-11-17 (orkestrator): commit core memvalidasi token dengan `resolveTokens` (ref tak dikenal dan salah tipe), bukan hanya `assertTokensKnown`.

## Review Triage Log

### 2026-11-17 — Review pass
- verdicts: 5 findings — high 0, medium 1, low 4, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` `zodToLakarError` memberi CATALOG_HINT untuk tipe fill tak dikenal (`Fill` juga discriminatedUnion pada `type`), sehingga agen diarahkan ke katalog node — dikonfirmasi: kondisi hanya mengecek `path.at(-1)==='type'`. Diperbaiki: `catalogIssue` hanya untuk discriminator yang `options`-nya memuat tipe node. Tes v1 baru: fill `gradient` → SCHEMA_INVALID tanpa CATALOG_HINT.
  - `[low]` `[patch]` `xyIssue` menghitung `unrecognized_keys` x/y di dalam cabang union, sehingga `{$token:'a',x:1}` atau x liar di expectedSize/fill/stroke mendapat XY_HINT — dikonfirmasi (walkIssues menelusuri cabang union). Diperbaiki dengan menghapus klausa itu; x/y flow tetap terdeteksi lewat refinement XY_HINT. Tes v1 baru untuk kasus token.
  - `[low]` `[patch]` Hint `add(null, non-board)` di core masih "frame/text" — dikonfirmasi. Diperbaiki menjadi daftar enam tipe anak.
  - `[low]` `[patch]` Deskripsi tool MCP `execute` menempatkan efek hanya di bawah frame/rect/ellipse/path, padahal skema mengizinkannya di text/icon — dikonfirmasi (`effectShape` di textShape/iconShape). Diperbaiki: baris "Efek" untuk semua node anak, sedangkan "Cat" (fills/stroke/radius) dipisah.
  - `[low]` `[patch]` Tes daemon katalog bergantung urutan (klaim ENOENT) dan tidak memeriksa status HTTP TOKEN_UNKNOWN — bagian ENOENT keliru, karena `/docs/open` sudah menulis file di beforeAll (server.ts `store.write` saat dokumen dibuat). Bagian status valid dan diperbaiki dengan `expect(r.status).toBe(422)`.

## Design Notes

- **Token:** peta datar dengan nama bertitik (`colors.accent-blue`, `spacing.3`, `rounded.md`, `type.body.size`), cocok dengan grup frontmatter DESIGN.md. Nilai `number | string`, dan tidak ada token komposit. `resolveTokens` mengganti ref secara generik, lalu mem-parse ulang hasilnya dengan skema yang sama. Cabang non-token di setiap slot `tok()` sekaligus menjadi cek tipe. Karena itu tidak ada daftar slot kedua yang bisa menyimpang.
- **`Resolved<T>`:** tipe mapped rekursif yang menghapus cabang `TokenRef`. Satu set skema saja, tanpa varian "resolved" kedua.
- **Board `clip`:** literal `true` opsional (AD-15: board selalu clip). Ketiadaannya berarti true, sehingga dokumen tracer tetap valid.
- **`setTokens`:** op-nya milik story 6. Sampai itu, `tokens` hanya terisi lewat file. Commit menolak ref tak dikenal sejak sekarang (AD-16).

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm build` -- expected: exit 0
- `cd /root/lakar && /opt/node-26/bin/pnpm exec vitest run packages/schema` -- expected: semua tes schema lulus
- `cd /root/lakar && /opt/node-26/bin/pnpm test` -- expected: exit 0, 0 skip, tes Chromium daemon jalan, dan arah dependensi lulus
- `pgrep -f 'lakar.*(daemon|chrome)' ; ss -ltnp | grep -c 7466` -- expected: tidak ada proses dan port bebas
- `cd /root/lakar && bash tools/node26/verify.sh` -- expected: exit 0

## Auto Run Result

- **Status:** built.
- **Ringkasan:** `packages/schema` dikembangkan dari irisan tracer menjadi skema v1 lengkap:
  - katalog node tertutup AD-15 (board, frame, text, rect, ellipse, path, icon);
  - properti visual bersama (fills solid/linear/radial/image, stroke, radius, shadows, opacity, blend, blur, backdropBlur, rotation);
  - sizing angka|hug|fill + min/max, padding tuple, dan `position:'absolute'` untuk semua node anak;
  - board `expectedSize`/`clip`/`fills`, dokumen `tokens`, `{$token}` + `resolveTokens`/`findTokenRefs`/`Resolved<T>` (AD-16);
  - `jsonSchemas()` via `z.toJSONSchema()`, serta enum AD-11 dan kontrak `{ok,data|error}` yang tidak berubah.

  Konsumen ikut disesuaikan:
  - core: `add` untuk semua tipe daun, dan commit memvalidasi token (TOKEN_UNKNOWN / SCHEMA_INVALID);
  - render: tipe `Resolved*`, padding tuple, ukuran numerik, latar dari fill board, dan placeholder ber-ukuran untuk tipe baru (render penuh di story 7/8/10);
  - daemon: resolve token sebelum render;
  - exec/mcp: teks katalog.
- **File:**
  - `packages/schema/src/{errors,nodes,tokens,index}.ts`: skema, error, dan token;
  - `packages/schema/src/{index,v1}.test.ts`: matriks validasi;
  - `packages/core/src/index{,.test}.ts`: add tipe daun, validasi token saat commit;
  - `packages/render/src/index.ts`: tipe resolved dan placeholder;
  - `packages/daemon/src/{server,chromium}.ts` + `index.test.ts`: resolve sebelum render, tes HTTP katalog v1;
  - `packages/exec/src/api.ts`, `packages/mcp/src/server.ts`: teks katalog.
- **Review (quick):** 5 temuan, semuanya patch (medium 1, low 4), 0 defer, 0 reject. Bagian ENOENT pada temuan ke-5 keliru, tetapi bagian statusnya valid.
- **Follow-up review:** `false`. Hanya satu medium yang di-patch, tanpa high.
- **Verifikasi:**
  - `pnpm build` exit 0;
  - `vitest run packages/schema`: 91 lulus;
  - `pnpm test`: 21 file / 237 tes lulus, 0 skip, termasuk tes Chromium daemon (PNG katalog dengan latar fill board) dan arah dependensi;
  - tidak ada proses daemon/Chromium Lakar tersisa, dan port 7466 bebas. Proses `[headless_shell] <defunct>` yang terlihat milik aplikasi lain (`node app.js`, mulai 10:52), bukan Lakar;
  - `tools/node26/verify.sh` exit 0, snapshot C9 identik.
- **Penyimpangan:**
  - Node `icon` menyimpan nama kanonik di field `icon`, bukan `name` (bentrok AD-9 vs AD-3; lihat Plan Change Log). Story 10 bekerja pada field `icon`.
  - Commit core memvalidasi tipe token (lebih ketat dari plan awal).
- **Risiko residual:**
  - Render belum memetakan properti visual, hug/fill, font, maupun tipe baru (placeholder kosong ber-ukuran) sampai story 7/8/10. Screenshot dokumen v1 belum mencerminkan desain.
  - `setTokens` belum ada (story 6), jadi token hanya bisa diisi lewat file.
  - Path `created` memakai `/` sebagai pemisah, padahal nama DESIGN.md juga memakai ` / ` (ambigu, sudah ada sejak tracer).
  - Format `assetId` (sha256 hex 64) adalah asumsi sebelum store aset dibangun.

