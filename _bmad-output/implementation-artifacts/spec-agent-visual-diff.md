---
title: 'Visual diff agen: pastikan edit hanya mengubah area yang dimaksud'
type: feature
ticket: ''
created: '2026-11-23'
status: built
baseline_revision: 'c79cad9e50ca8234a5bdc4259775d0ac900b5e10'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
epic: 'loop verifikasi agen'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/research-open-pencil-features-for-lakar/research-open-pencil-features-for-lakar.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-app-3-history-restore.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sesudah execute perbaikan, agen hanya punya `screenshot` untuk memeriksa hasilnya. Ia tidak tahu apakah edit kecilnya ikut menggeser atau mengubah bagian lain board (teks yang reflow, kartu tetangga yang terdorong, token yang dipakai di tempat lain). Riset open-pencil (rekomendasi #1; digest `mcp-r1-1.md` butir 5, 6, 19) menunjukkan `diff_pixels`: overlay piksel berubah di atas sumber yang dipudarkan, rasio, dan wilayah, "untuk memastikan edit hanya menyentuh area yang dimaksud". `diff_changes` mereka (seluruh run vs baseline) hanya ada di chat bawaan, tidak untuk MCP eksternal.

**Approach:** Tool MCP baru `visual_diff` → route agen `POST /visual-diff`. Daemon merender board yang sama pada dua rev (snapshot History dari spec-app-3 + RenderPort yang ada), membandingkan piksel dengan `pixelmatch` (toleransi antialiasing), lalu mengembalikan overlay PNG (dikirim seperti `screenshot`), `changedRatio`, wilayah berubah dalam koordinat board, dan node paling spesifik yang bersinggungan dengan tiap wilayah. Default rev dibuat berguna: "sebelum tulis terakhir sesi ini" (atau "sebelum tulis pertama sesi" lewat `since:'session'`, setara `diff_changes`). Skill `review` mendapat satu langkah: sesudah execute perbaikan, `visual_diff`.

## Boundaries & Constraints

**Always:**
- Kompatibel mundur (AD-4): tool dan route lama tidak berubah; respons lama tidak disentuh. Route agen baru mengikuti pola MCP→daemon (`/layout-check`, `/screenshot`), bukan `/viewer/*`.
- Baca-saja: tidak ada op `core`, commit, rev, atau entri riwayat baru.
- Render lewat `RenderPort` yang sama dengan `screenshot`/`measure` (skala 1, px CSS = koordinat board). Snapshot dibaca lewat `readRevision` (spec-app-3).
- Pustaka diff kecil dan dikenal, versi dipaku persis: `pixelmatch@8.0.0` (ISC).
- Jejak minimal di berkas bersama (dua spec paralel di epic yang sama): `packages/mcp/src/server.ts` satu blok registrasi + satu konstanta deskripsi + satu kalimat `SERVER_INSTRUCTIONS`; `review.md` satu klausa yang dibayar dengan pemangkasan setara.
- Komentar/spec Bahasa Indonesia; teks UI, commit, PR Bahasa Inggris.

**Never:**
- Batas skill di `tests/skills.test.ts` (termasuk `LOAD_LIMIT` 9.600) tidak dinaikkan.
- Tidak ada perubahan skema dokumen, store, atau format snapshot.
- Tidak ada UI viewer baru (hanya judul baris Activity dan daftar tool Connections).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default sesudah perbaikan | `visual_diff {}`; sesi menulis r2 → r3 | `fromRev` 2, `toRev` = rev kini, `base:'lastWrite'`, board pertama; wilayah di sekitar node yang diubah | — |
| Seluruh sesi | `{since:'session'}` | `fromRev` = rev sebelum tulis pertama sesi (`base:'sessionStart'`) | `since` + `fromRev` → SCHEMA_INVALID |
| Sesi belum menulis | `{}` dari sesi baru | `fromRev = toRev − 1` (`base:'previousRev'`) | — |
| Rev eksplisit | `{fromRev, toRev}` | `base:'explicit'`; rev sama → 0 piksel | rev tanpa snapshot / di atas rev kini → NOT_FOUND (hint snapshot); rev negatif → SCHEMA_INVALID |
| r0 dokumen baru | `open_doc` membuat r0 tanpa snapshot | r0 dianggap kosong (tanpa board) → `missing:'from'`, rasio 1 | rev lain tanpa snapshot tetap NOT_FOUND |
| Lingkup node | `{nodeId}` | Area = gabungan bounds node di kedua rev; rasio relatif area itu | node tidak ada di kedua rev → NOT_FOUND; `boardId`+`nodeId` → SCHEMA_INVALID |
| Node hanya di satu rev | node baru/terhapus | Area = bounds di rev yang ada, `missing:'from'|'to'` | — |
| Node tak terukur | node tersembunyi tanpa bounds | Seluruh board dibandingkan + `note` | — |
| Board hug tumbuh/menyusut | ukuran PNG beda | Disejajarkan kiri-atas, kanvas = ukuran terbesar, selisih area dihitung berubah; `size {from,to}`, `sizeDelta [dw,dh]` | — |
| Board baru/terhapus | board hanya di satu rev | `missing`, `size.from` atau `size.to` = null, seluruh area berubah | board tidak ada di kedua rev → NOT_FOUND |
| Antialiasing | tepi teks/kurva bergeser subpiksel | Piksel AA tidak dihitung (deteksi pixelmatch), ambang 0,1 | — |
| Banyak perubahan | > 12 wilayah | 12 terbesar + `regionsTruncated` | — |
| Tanpa dokumen | sesi belum `open_doc` | — | NO_ACTIVE_DOC (seperti tool lain) |

</frozen-after-approval>

## Code Map

- `packages/daemon/src/visual-diff.ts` (baru) -- logika murni `diffRasters` (sejajar kiri-atas, cakupan, pixelmatch `diffMask` + `ignoreMask`), `findRegions` (grid 8 px + union-find berjarak `REGION_GAP` 24 px, lalu gabung kotak bertumpuk; maks 12), `renderOverlay`, `nodeCandidates`/`regionNodes` (node paling spesifik per wilayah, leluhur dibuang, `state` added/removed); route `POST /visual-diff`.
- `packages/daemon/src/png.ts` -- `toRgba` + `encodePng` (RGBA 8-bit) di samping dekoder yang ada.
- `packages/daemon/src/sessions.ts` -- `Session.bases` (per id dokumen: `first`/`last` = rev sebelum tulis pertama/terakhir) + `noteWrite`.
- `packages/daemon/src/server.ts` -- `noteWrite` sesudah commit execute; registrasi route (satu baris + import).
- `packages/daemon/src/paste.ts` -- `noteWrite` pada paste agen (`/viewer/paste`).
- `packages/daemon/src/events.ts` -- `TOOL_ROUTES['/visual-diff']`, target = `boardId ?? nodeId` (seperti screenshot).
- `packages/mcp/src/server.ts` -- `VISUAL_DIFF_DESCRIPTION`, blok registrasi `visual_diff` (gambar + JSON meta tanpa base64, pola `screenshot`), satu kalimat `SERVER_INSTRUCTIONS`.
- `packages/viewer/src/activity.ts`, `harnesses.ts` -- judul Activity "Compare versions of …" dan `MCP_TOOLS` Connections.
- `packages/skills/skills/review.md` -- langkah 3 + `visual_diff`, dibayar dengan memangkas contoh `gap 10 → 12 · skala`, "hero bertumpuk", "kedua" → "dua".
- Acuan: `export.ts` (`/viewer/docs/:slug/revs/:rev/screenshot`), `files.ts:readRevision`, `server.ts` `/screenshot` dan `/layout-check`, `inspect.ts:locateNode`.

## Tasks & Acceptance

**Execution:**
- [x] `pixelmatch@8.0.0` (exact) di `@lakar/daemon`.
- [x] `png.ts` -- encoder RGBA + `toRgba`.
- [x] `visual-diff.ts` -- logika murni + route; default rev dari `session.bases`; r0 tanpa snapshot = dokumen kosong.
- [x] `sessions.ts`/`server.ts`/`paste.ts` -- catat rev dasar pada tulis agen (execute, paste).
- [x] `events.ts` -- mapping tool + target Activity.
- [x] `mcp/server.ts` -- tool `visual_diff` (skema `{boardId?, nodeId?, fromRev?, toRev?, since?}`), deskripsi, satu kalimat instruksi.
- [x] Viewer -- judul Activity + daftar tool Connections.
- [x] `review.md` -- satu klausa, ukuran tidak naik (1.483 → 1.480 karakter LF).
- [x] Tes -- `packages/daemon/src/visual-diff.test.ts` (logika murni: identik, satu blok, ambang, gabung/pisah wilayah, batas wilayah, ukuran beda, raster hilang, clip, overlay + round-trip PNG, node per wilayah; route: default lastWrite/sessionStart/previousRev, lingkup node, rev sama, baca-saja, board baru, hug `sizeDelta`, r0, error), `packages/mcp/src/visual-diff.test.ts` (registrasi, deskripsi, skema, penerusan argumen, gambar + meta, error), `tests/skills.test.ts` (review menyebut `visual_diff`, dalam batas), `index.test.ts` (daftar tool 16), `activity.test.ts`, `connections.test.ts`.

**Acceptance Criteria:**
- Given agen mengubah satu teks lewat execute perbaikan, when ia memanggil `visual_diff {}`, then respons memuat satu wilayah di sekitar teks itu, `nodes` menyebut node teks itu, dan overlay menandai piksel berubah dengan merah.
- Given edit ikut mendorong kartu lain, when `visual_diff` dipanggil, then wilayah tambahan muncul dengan node kartu itu (sinyal "you also changed X").
- Given board hug bertambah tinggi, when `visual_diff`, then `sizeDelta` melaporkan selisihnya dan bagian baru dihitung berubah.

## Implementation Notes

- Nama `visual_diff` (bukan `diff`): mengikuti gaya `layout_check`/`export_code`/`icon_search` dan tidak bertabrakan dengan diff pohon node (`diff_nodes` open-pencil) bila kelak ditambahkan.
- `toRev` default = rev kini, bukan "rev sesudah tulis terakhir sesi": dalam alur normal keduanya sama, dan bila pengguna/agen lain menulis di antaranya perubahan mereka memang terlihat di canvas. `base` melaporkan dasar yang dipakai.
- Rev dasar dikunci per **id dokumen** (bukan slug) agar tahan rename. Hanya tulis agen bersesi yang tercatat (execute, paste); tulis viewer tidak menggeser dasar sesi.
- Satu render per sisi (`screenshot` + `measure` paralel, empat pekerjaan di pool). Overlay = skala 1; lingkup node memotong overlay ke area node.
- `pixelmatch` dipanggil `after` sebagai img1 sehingga overlay berbasis "sesudah"; overlay disusun sendiri (pudar 25% ke putih, merah `#E61E2D`, bingkai wilayah biru 1 px di luar kotak) karena `diffMask` dipakai juga sebagai mask wilayah.
- Smoke lokal (msedge, daemon nyata): board 390×500, ubah "Hello world" → "Hello Lakar": `changedRatio` 0,0019, satu wilayah `[102,31,73,20]` dengan node `Title`; `since:'session'` dari r0 → `missing:'from'`, rasio 1; lingkup node `Title` → area `[24,24,342,34]`. Diff ±270 ms. Smoke pertama menemukan r0 tanpa snapshot (dokumen `open_doc`) → NOT_FOUND; diperbaiki (lihat matriks).

## Review Triage Log

**Pass 1 (quick, self-review):** medium 1, low 3, ditunda 3.

| # | Temuan | Verdict | Rute | Bukti |
|---|---|---|---|---|
| 1 | `since:'session'`/`lastWrite` sesudah execute pertama di dokumen `open_doc` gagal NOT_FOUND (r0 tidak punya snapshot) | medium | patch | `openOrCreate`/`createFresh` memakai `store.write` tanpa commit; duplikat memakai commit (snapshot r0 ada) |
| 2 | Activity menampilkan nama tool mentah `visual_diff` | low | patch | `callTitle` default `c.tool` |
| 3 | Connections tidak mencantumkan tool baru | low | patch | `harnesses.ts` `MCP_TOOLS` |
| 4 | Field `png` tak terpakai di tipe `Side` | low | patch | — |
| 5 | ID komposit isi instance (`inst/node`) tidak didukung `nodeId` | low | defer | `locateNode` hanya ID biasa; lihat deferred-work |
| 6 | Overlay board landing sangat tinggi = PNG besar | low | defer | Sama dengan `screenshot` board penuh; lihat deferred-work |
| 7 | Komentar kepala `mcp/server.ts` masih "15 tool" | low | defer | Sengaja tidak disentuh (berkas bersama dengan spec paralel) |

## Design Notes

Wilayah: sel grid 8 px yang berisi piksel berubah digabung bila berjarak ≤ ⌈24/8⌉ sel (union-find, hanya tetangga "ke depan"), lalu kotak yang bertumpuk atau berjarak < 24 px digabung sampai stabil. Hasilnya satu kotak per perubahan yang terlihat sebagai satu kesatuan (satu baris teks, satu kartu), bukan satu kotak per glyph.

Node per wilayah: kandidat = node di bawah board pada kedua rev, dengan bounds terukur di rev mana pun node itu ada (node berpindah tetap tertangkap di posisi lama dan baru). Node yang menjadi leluhur node lain yang juga kena dibuang, jadi kartu hanya muncul bila tidak ada anaknya yang kena. Urut luas irisan, maks 5.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 test` -- expected: hijau di CI Linux; di Windows hanya kegagalan khas yang sudah dikenal (CRLF skill, api.md, izin key foto, SIGTERM/SIGKILL, Chromium render/bench).

**Manual checks:**
- `LAKAR_BROWSER_CHANNEL=msedge LAKAR_PORT=<port> LAKAR_DATA_DIR=<tmp> node packages/daemon/dist/main.js`, lalu sesi → `open_doc` → execute board + teks → execute ubah satu teks → `POST /visual-diff {}`: satu wilayah di teks itu, overlay merah di teks.
