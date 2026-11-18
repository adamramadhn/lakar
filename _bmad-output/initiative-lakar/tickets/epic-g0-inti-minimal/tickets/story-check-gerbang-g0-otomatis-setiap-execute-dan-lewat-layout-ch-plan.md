---
title: 'Check gerbang G0 otomatis setiap execute dan lewat layout_check'
type: feature
ticket: '11'
created: '2026-11-18'
status: built
baseline_revision: '9c9e8c086bb011d44469ca85a55cfc5f34d82831'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-ikon-lucide-dan-simple-icons-lewat-nama-kanonik-plan.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `packages/check` masih kosong. Execute meng-commit tanpa render, jadi agen tidak tahu ada emoji, teks kecil, anak terpotong, ukuran board salah, atau konten tertutup tab bar sampai juri melihat PNG. Tool `layout_check` juga belum ada, padahal gerbang G0 adalah "0 error gerbang" (AD-8, DESIGN.md Lampiran A).

**Approach:** Aturan G0 ditulis sebagai fungsi murni di `packages/check`. Masukannya dokumen ter-resolve dan `BoardMeasure` dari render (story 7). Setelah snippet sukses, daemon merender board yang tersentuh pada salinan kerja lewat `RenderPort.measure`, menjalankan check sekali, lalu commit. Temuan dan bounds ikut dikembalikan di respons. `POST /layout-check` dan tool MCP `layout_check` menjalankan aturan yang sama pada board penuh.

## Boundaries & Constraints

**Always:**
- **Bentuk temuan AD-8:** `{level:'error'|'warning', rule, nodeId, nodeName, detail, expected}`. Tipe `Finding` dan tabel `G0_RULES` (id, level, gate, judul) berada di `@lakar/schema`, sehingga dipakai bersama check, daemon, MCP, dan bench. Ringkasan `{error, warning, gate}` dengan `gate` = jumlah temuan dari aturan ber-gate.
- **Definisi operasional aturan.** Teks memakai `content` apa adanya. Bounds memakai `BoardMeasure` (relatif terhadap board, float). Toleransi 0,5 px. Satu temuan per node per aturan.
  - **LC-01a · error · gerbang · emoji.** Content dipecah per grapheme (`Intl.Segmenter('und',{granularity:'grapheme'})`). Grapheme `g` dengan base = code point pertama dihitung emoji bila base ∉ {©, ®, ™} DAN salah satu syarat berikut terpenuhi:
    - ada code point `\p{Emoji_Presentation}` (termasuk regional indicator/bendera dan modifier warna kulit);
    - `g` memuat U+FE0F dan base `\p{Emoji}` (❤️, ☺️, ▶️, ↔️, `1️`, `#️`);
    - `g` memuat U+20E3 dengan base `[0-9#*]` (keycap, dengan atau tanpa VS16);
    - `g` memuat U+200D dan ada code point `\p{Extended_Pictographic}` (urutan ZWJ).
    - Contoh positif: `Halo 👋`, `✅ Lunas`, `⭐ 4,9`, `❤️`, `1️⃣ Pilih`, `🇮🇩`, `👩‍💻`, `👋🏽`, `▶️ Putar`.
    - Contoh negatif: `© 2026 Kopi`, `Merek®`, `Kopi™`, `©️` (dikecualikan, tetapi tetap ditolak oleh FONT_MISSING karena U+FE0F di luar font), `#1 di Jakarta`, `Langkah 3*`, `Rp 25.000`, `❤` tanpa VS16 (bukan emoji; tidak tercakup font sehingga kena FONT_MISSING), `★`, `✔`.
  - **LC-01b · error · gerbang · glyph Unicode sebagai ikon.** Daftarnya persis DESIGN.md: `★☆✓✔✗→←↑↓↗↘▶◀•`. Ambil grapheme non-spasi pertama dari content, lalu buang U+FE0E. Temuan muncul bila base grapheme itu ada di daftar dan grapheme itu bukan emoji LC-01a (kalau emoji, hanya LC-01a yang dilaporkan). Teks yang hanya berisi glyph daftar dan spasi tertangkap oleh aturan ini.
    - Contoh positif: `★★★★★`, `☆ 4,9`, `  ✓ Gratis ongkir`, `• Kopi susu`, `→`, `▶ Putar`.
    - Contoh negatif: `Lihat semua →`, `Jakarta → Bandung`, `Naik 12% ↑`, `4,9 ★`. Contoh terakhir lolos LC-01b, tetapi ★ di luar cakupan font sehingga tetap ditolak oleh FONT_MISSING.
  - **LC-02a · error · gerbang · terpotong.** Clip ancestor P adalah board (selalu clip) atau frame `clip:true` terdekat. Node N dengan luas > 0 melanggar bila bounds-nya keluar dari bounds P lebih dari 0,5 px di salah satu sisi.
    - Yang dilaporkan hanya node terluar: keturunan node yang sudah dilaporkan tidak diuji lagi terhadap P yang sama, tetapi tetap diuji terhadap clip ancestor yang lebih dalam.
    - Pengecualian dihitung pada node di path dari P (inklusif) sampai parent N (inklusif):
      - frame bernama `Crop /` yang termasuk 2 Crop pertama di board (urutan dokumen) membebaskan semua sumbu; Crop ke-3 dan seterusnya tidak membebaskan, dan detail menyebut "maks 2";
      - frame bernama `Scroll /` membebaskan sumbu vertikal;
      - node dengan `rotation ≠ 0` membebaskan semua sumbu.
    - Positif: anak 260 di dalam frame clip 200 (keluar 60 di kanan). Negatif: keluar 0,4 px, mockup di dalam `Crop / Hero`, isi `Scroll / Konten` yang tergeser `scrollY`.
  - **LC-05 · error · gerbang · font < 12.** Text node dengan `size` ter-resolve < 12 dan content yang tidak kosong setelah trim. Tidak ada pengecualian nama (12px mutlak). Contoh: 11 dan 11,5 → temuan; 12 → lolos.
  - **LC-12 · warning · board.** Aturan ini hanya untuk board yang diperiksa:
    - (a) **Ukuran:** ukuran terukur dibandingkan dengan `expectedSize`. Kalau `expectedSize` tidak ada, dipakai default per `screen`: mobile 390×844; app lebar 1440, tinggi 900 atau 1024; landing lebar 1440. Untuk landing hanya lebar yang dibandingkan, karena tingginya bebas.
    - (b) **Tabrakan:** bounds model board beririsan (luas > 0) dengan board lain di halaman yang sama. Detail menyebut nama dan ID board lain; expected menyarankan `place(w,h)`.
    - (c) **Tanpa clip:** tidak bisa terjadi karena skema mengunci `clip: true`, jadi tidak diimplementasikan.
    - Level-nya warning, sesuai Lampiran A, sehingga tidak dihitung di `gate`.
  - **LC-20 · error · gerbang · konten tertutup bar bawah.** Node bernama `Overlay /` (O) dianggap bar bawah bila `board.height − (O.y+O.height) ≤ 48` dan `O.width ≥ 0,5 × board.width`. Badge dan elemen kecil tidak terhitung.
    - Wadah C ditentukan begini:
      - setiap frame `Scroll /` di luar subtree Overlay yang rentang horizontalnya beririsan dengan O;
      - kalau tidak ada, frame anak flow langsung dari board dengan luas terbesar, selain Overlay, `Status bar…`, dan `Home indicator…`;
      - kalau tidak ada juga, board itu sendiri.
    - "Konten terakhir" adalah anak flow langsung C (bukan absolute, bukan Overlay, bukan Status bar atau Home indicator, luas > 0) yang bottom-nya paling besar.
    - Aturan hanya dievaluasi pada posisi akhir, yaitu bila `C.scrollY > 0` atau konten terakhir terlihat utuh (bottom ≤ batas bawah terlihat C + 0,5).
    - Pelanggaran terjadi bila `bottom > O.y − 8 + 0,5`. Temuan ditaruh pada C. Detail menyebut nama dan y konten terakhir serta y Overlay; expected berisi "berakhir ≤ y(O)−8; tambah padding bawah pada C".
- **Commit vs tolak:**
  - Temuan apa pun, termasuk error gerbang, tidak pernah menolak commit. Commit tetap terjadi dan temuan dikembalikan (AD-8: "menjalankan check sekali, lalu commit").
  - Error render dokumen pada board tersentuh (FONT_MISSING untuk keluarga tak terdaftar atau glyph tak tercakup yang bukan temuan LC-01a/b, aset NOT_FOUND, ICON_UNKNOWN) dan RENDER_FAILED membuat transaksi tidak ditulis (rollback). Respons membawa `editId` seperti error execute lain, dan hint menyebut "dokumen tidak di-commit".
  - Glyph yang sudah menjadi temuan LC-01a/b dikirim sebagai `allowGlyphs` ke render. Akibatnya board tetap terukur dan agen menerima temuan LC, bukan FONT_MISSING. Screenshot tetap FONT_MISSING untuk glyph itu (AD-6).
- **Board tersentuh:** board di dokumen baru yang tidak ada di dokumen lama, atau yang JSON `resolveTokens`-nya berbeda dari dokumen lama. Perubahan token ikut terdeteksi. Snippet tanpa op sukses tidak memicu render atau check, dan respons tidak memuat `check`/`bounds`.
- **Respons execute (HTTP):**
  - Field tambahan: `check: {boards:[id], summary:{error,warning,gate}, findings}`, dengan findings lengkap (urut error lalu warning, lalu urutan dokumen).
  - `bounds: {<id>: [x,y,w,h]}` dibulatkan ke bilangan bulat, relatif terhadap board. Isinya board tersentuh, node yang dibuat, lalu node yang propertinya, parent, atau indeksnya berubah. Maksimal 60 entri, ditambah `boundsTruncated: n` bila terpotong.
- **`POST /layout-check {boardId?}`:**
  - Tanpa `boardId`, semua board dokumen aktif diperiksa.
  - Respons: `{docId, rev, boards:[{id,name,summary}], summary, findings}` lengkap.
  - Board tidak ada → NOT_FOUND. Error render → kode yang sama seperti screenshot.
- **MCP:**
  - Tool `layout_check {boardId?}`.
  - Untuk execute dan layout_check, temuan diformat sebagai baris Lampiran A: `error·gerbang · LC-05 · Caption (Ab12Cd34) · size 11px · ≥ 12`, didahului satu baris ringkasan.
  - Batas baris: 20 untuk execute dan 60 untuk layout_check, ditambah `… n temuan lagi (layout_check untuk daftar penuh)`.
  - Field lain execute tetap dikirim sebagai JSON.
- **Anggaran waktu:** render + check per execute dengan 1 board tersentuh berisi ±150 node, pada halaman Chromium hangat: p50 ≤ 300 ms, p95 ≤ 800 ms. Pure rules ≤ 20 ms untuk 500 node. Kalau terlampaui, optimasi di render (memo FontFace per halaman) atau di adaptor, bukan dengan melewati check.
  - Alasannya: sesi A sekitar 30 execute menambah kurang lebih 9 dtk. Jatah 1,5× pen.dev adalah 250 dtk untuk A (167 dtk) dan 197 dtk untuk B (131 dtk).
- C7: teks check, temuan, hint, dan deskripsi MCP hanya memakai bahasa aturan produk (DESIGN.md). Teks golden set, juri, rubrik, skor, Lampiran B, dan pen.dev tidak boleh muncul.
- C9:
  - Node dipanggil lewat `/opt/node-26/bin/node` dan `/opt/node-26/bin/pnpm`.
  - Tidak ada dependensi baru.
  - Chromium dan daemon yang dinyalakan tes dimatikan lagi.
  - Service, port tetap, dan `~/.cache/ms-playwright` tidak disentuh.
- Arah spine: `check → schema, ports` saja (tanpa impor render atau daemon). Render tetap murni browser (AD-6).

**Never:**
- Aturan selain enam aturan G0 (LC-02b/03/04/06–11/13–19/21/22 milik G1).
- Pool render dan `status` (story 12), skill/`api.md` (13), atau bench (14/16).
- Menolak commit karena temuan, atau melewati check secara diam-diam.
- Memperluas daftar LC-01b di luar DESIGN.md.
- Membaca `design/` atau `golden-set.md`.
- Mengubah kontrak `{ok,data|error}` atau enum kode AD-11.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fixture enam aturan | Board mobile 390×800 tanpa expectedSize. Isinya teks `Halo 👋`, `★★★★★`, size 11, `© 2026 Kopi` 12px, frame clip 200 dengan anak 260, wrapper `Konten` (anak terakhir berakhir > 728), dan `Overlay / Tab bar` absolute y 736 h 64 | execute commit (rev +1) dan `check.findings` berisi tepat 6 temuan: LC-01a, LC-01b, LC-05, LC-02a, LC-12, LC-20. `layout_check` memberi 6 temuan yang sama. `©` bukan temuan | — |
| Bersih | Board 390×844 tanpa pelanggaran | `summary {0,0,0}`, `findings []`, bounds memuat board + node baru | — |
| Snippet baca-saja | `get(id)` saja | tanpa render; respons tanpa `check`/`bounds` | — |
| setTokens | ubah token yang dipakai 2 board | kedua board dirender dan diperiksa | — |
| Keluarga tak terdaftar / `⌘` / `❤` | execute | rollback, rev tetap, file tidak berubah | 422 `FONT_MISSING` + editId; perbaikan lewat edits langsung commit |
| Chromium mati saat check | execute | rollback | 503 `RENDER_FAILED` retryable + editId |
| Scroll akhir | dua board (`duplicate`); board akhir `scrollY` > 0 dengan anak terakhir di bawah tab bar | LC-20 pada board akhir; board awal (anak terakhir terpotong, scrollY 0) tidak terkena | — |
| Crop ke-3 | 3 frame `Crop /` clip, semua isinya keluar | 2 pertama bebas; Crop ke-3 → LC-02a "maks 2" | — |
| layout_check board tak ada | `{boardId:'Zzzzzzzz'}` | — | 404 `NOT_FOUND` + hint |

</intent-contract>

## Code Map

- `packages/schema/src/findings.ts` (baru; diekspor `index.ts`) -- tipe `Finding`, `FindingLevel`, `G0RuleId`, `G0_RULES` (id → {level, gate, title}), `FindingSummary`, `summarizeFindings(f[])`, dan `findingLine(f)`. Format `findingLine`: `<level>[·gerbang] · <rule> · <nodeName> (<nodeId>) · <detail> · <expected>`. Murni.
- `packages/ports/src/index.ts` -- pindahkan atau definisikan `BoardMeasure`, `NodeBounds`, `TextMeasure` di sini, lalu `render/src/measure.ts` me-re-export lewat `import type`. `RenderPort.measure(doc, boardId, opts?: {allowGlyphs?: readonly number[]}): Promise<BoardMeasure>` dengan error yang sama seperti screenshot.
- `packages/render/src/{index,fonts,measure}.ts` -- `renderBoard` opsi `allowGlyphs?: readonly number[]`. Code point itu dilewati di langkah `uncoveredGlyphs` (1b); selain itu tetap FONT_MISSING. Tetap browser-pure (`test/browser-pure.test.ts`). Tambahkan tes: emoji yang di-allow terukur, yang tidak di-allow menghasilkan FONT_MISSING.
- `packages/check/src/`:
  - `glyphs.ts`: `isEmojiGrapheme`, `emojiIn(content)`, `leadingIconGlyph(content)`, `LC01B_GLYPHS`.
  - `rules.ts`: satu fungsi per aturan.
  - `touched.ts`: `touchedBoards(before, after)`, `changedNodeIds(before, after, boardIds)`, keduanya atas dokumen ter-resolve.
  - `index.ts`: `glyphScan(board) → {findings, allowGlyphs}`, `checkBoard({doc, boardId, measure}) → Finding[]` (semua aturan, urutan stabil), `boundsOf(measure, ids, cap)`.
  - `package.json`: script `test` mengikuti pola daemon (`vitest run --root ../.. packages/check/`).
  - Masukan measure bertipe struktural dari ports.
- `packages/check/src/*.test.ts` -- tes murni dengan `BoardMeasure` sintetis untuk setiap baris contoh positif/negatif di atas. Termasuk fixture enam aturan yang memberi tepat 6 ID yang benar, kasus Crop ke-3, Scroll vertikal, rotasi, node terluar saja, LC-20 posisi awal/akhir, LC-12 landing (tinggi bebas) dan app 900/1024, `touchedBoards` (token, move, add, baca-saja = []), dan benchmark mikro 500 node ≤ 20 ms (asersi longgar 100 ms).
- `packages/daemon/src/chromium.ts` -- refactor `screenshot` menjadi `#renderOnPage(doc, boardId, allowGlyphs)` bersama, ditambah `measure()`, dengan pemetaan error yang sama. `RENDER_PAGE_HTML`: `__lakarRender(doc, boardId, fonts, icons, allowGlyphs)`.
- `packages/daemon/src/check.ts` (baru) -- `runCheck(render, resolved, boardIds) → {boards, findings, measures}`. Isinya berurutan per board: `glyphScan`, lalu `render.measure` dengan allowGlyphs, lalu `checkBoard`.
- `packages/daemon/src/server.ts`:
  - `/execute`: setelah `transact` dan sebelum `store.commit`, bila `entry !== null` hitung touched, lalu `runCheck`. Error LakarError dari `runCheck` dilempar lewat `failWith` (rollback, karena belum ditulis). `checkMs` dicatat. Respons ditambah `check` dan `bounds`.
  - Baru: `POST /layout-check` (zod strict `{boardId?}`). `docs.get(slug)` dibaca tanpa lock (immutable).
- `packages/daemon/src/sessions.ts` -- `ExecuteLogEntry` mendapat `checkMs?` dan `summary?` (bahan status story 12).
- `packages/daemon/src/index.test.ts`:
  - Fixture enam aturan lewat execute dan `/layout-check` dengan Chromium asli.
  - Kasus rollback FONT_MISSING (`⌘`, keluarga asing) dengan rev tetap dan file utuh.
  - Kasus baca-saja tanpa check, dan setTokens yang memeriksa 2 board.
  - Latensi: 12 update pada board ±150 node; dari `d.sessions.require(s).log[].checkMs`, cetak p50/p95 dan pastikan p50 ≤ 600 ms (2× anggaran, mencegah flaky).
  - Sesuaikan tes lama yang meng-commit dokumen tak bisa dirender (FONT_MISSING, aset hilang): sekarang error terjadi saat execute, atau dokumen ditulis langsung ke store untuk menguji jalur screenshot.
- `packages/mcp/src/{server,client,index.test}.ts`:
  - Tool `layout_check`, formatter baris temuan (memakai `findingLine`/`G0_RULES` dari schema) untuk execute dan layout_check, dengan batas baris.
  - `EXECUTE_DESCRIPTION` ditambah `check`/`bounds` dan sebutan "temuan tidak membatalkan commit; perbaiki lalu execute lagi".
  - Tes fake daemon.
- `tests/check-c7.test.ts` (baru) -- memindai `packages/check/src/*.ts` (non-tes), `packages/schema/src/findings.ts`, dan `packages/mcp/src/server.ts`. Tidak boleh ada `/golden|juri|rubrik|Lampiran B|skor|pen\.dev|benchmark/i`.
- Read-only: `packages/core` (CommitResult tetap; diff dilakukan di check), `packages/render/src/layout.ts`, `packages/exec`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/schema/src/{findings,index}.ts` + tes -- tipe Finding, G0_RULES, ringkasan, dan baris -- kontrak AD-8 bersama.
- [x] `packages/ports/src/index.ts`, `packages/render/src/{index,fonts,measure}.ts` + tes -- `RenderPort.measure`, `allowGlyphs` -- check perlu bounds walau ada emoji.
- [x] `packages/check/**` + tes -- enam aturan, glyph, touched/changed, bounds, benchmark mikro -- inti R5.
- [x] `packages/daemon/src/{chromium,check,server,sessions,index.test}.ts` -- measure, pipeline execute, `/layout-check`, latensi, penyesuaian tes lama -- AD-8.
- [x] `packages/mcp/src/{server,client,index.test}.ts`, `tests/execute-description.test.ts` -- tool `layout_check`, format ringkas -- permukaan agen.
- [x] `tests/check-c7.test.ts` -- penjaga C7.

**Acceptance Criteria:**
- Given daemon dengan Chromium asli, when fixture enam aturan dibuat lewat execute, then respons 200, rev +1, dan `check.findings` berisi tepat 6 temuan dengan ID LC-01a, LC-01b, LC-02a, LC-05, LC-12, LC-20, `summary.gate` = 5, dan tidak ada temuan untuk node `©`.
- Given dokumen fixture itu, when `layout_check` dipanggil lewat MCP (fake daemon meneruskan respons `/layout-check` asli yang sama), then output memuat 6 baris temuan dengan ID yang sama dan satu baris ringkasan.
- Given snippet yang memakai `⌘` di teks, when execute, then 422 FONT_MISSING dengan editId, rev dan file tidak berubah, dan `execute({editId, edits})` yang mengganti glyph itu menghasilkan commit.
- Given 12 execute update pada board ±150 node, when latensi check dibaca dari log sesi, then p50 ≤ 600 ms (target anggaran p50 ≤ 300 / p95 ≤ 800 ms; angka nyata dicatat di Auto Run Result).
- Given `pnpm test` penuh, then lulus dengan 0 skip, termasuk arah dependensi, browser-pure render, dan penjaga C7.

## Implementation Notes

- `BoardMeasure`/`NodeBounds`/`TextMeasure` + `MeasureOptions` kini di `@lakar/ports`; `render/src/measure.ts` me-re-export lewat `import type`/`export type`. `uncoveredGlyphs(board, faces, allowGlyphs?)`.
- `allowGlyphs` per board (code point, sesuai port): code point grapheme temuan LC-01a/LC-01b (grapheme terdepan; bila teks hanya glyph daftar + spasi, semua glyph-nya), DIKURANGI code point yang juga muncul di grapheme bukan temuan di teks mana pun pada board itu. Akibatnya `❤️ Favorit` + `Suka ❤`, `▶️` + `©️`, atau `★★★★★` + `4,9 ★` di satu board → FONT_MISSING + rollback (bukan commit diam-diam); agen menerima FONT_MISSING, bukan temuan LC, untuk kombinasi itu (patch review).
- LC-20: "batas bawah terlihat C" = min(bottom C, bottom frame clip leluhur, tinggi board) (patch review).
- LC-12: ukuran dan tabrakan digabung jadi SATU temuan per board (detail/expected dipisah `; `), sesuai "satu temuan per node per aturan".
- LC-20: nama dicocokkan dengan awalan (`Overlay /`, `Scroll /`, `Crop /`, `Status bar`, `Home indicator`). Wadah fallback = frame anak flow board dengan luas terukur terbesar.
- Execute: sebelum `runCheck`, ref ikon board tersentuh divalidasi `icons.canonical` (dokumen lama berisi ikon tak dikenal → ICON_UNKNOWN + 3 saran, rollback). Error render saat check → hint ditambah "dokumen tidak di-commit (…)" + hint perbaikan editId. Snippet dengan op sukses tetapi tanpa board tersentuh (mis. hapus board) → `check {boards:[]}` + `bounds {}`.
- Urutan `bounds`: board tersentuh, `created[]`, lalu `changedNodeIds` (dedupe); id tanpa ukuran dilewati; board = `[0,0,w,h]`.
- MCP: `formatExecute`/`formatLayoutCheck` (diekspor). Baris sisa memakai teks plan untuk keduanya. `ICON_SEARCH_DESCRIPTION` "urut skor" → "urut relevansi" (penjaga C7 memindai `mcp/src/server.ts`).
- Kriteria MCP "fake daemon meneruskan respons asli": `packages/mcp/src/index.test.ts` menjalankan `daemon/dist/main.js` (proses terpisah, LAKAR_PORT=0, dimatikan SIGTERM) di balik proxy HTTP yang meneruskan respons apa adanya — tanpa impor daemon (arah spine tetap).
- `packages/schema` dan `packages/check` mendapat script `test` (pola paket lain). `tests/check-c7.test.ts` juga memindai `daemon/src/check.ts`.
- Tes lama disesuaikan: FONT_MISSING (varian hilang, Roboto, `→`) dan aset hilang kini gagal di execute (422/404 + editId, file tetap); RenderPort tiruan mendapat `measure`.

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 3 findings — high 0, medium 2, low 1, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` allowGlyphs per board meloloskan glyph tak tercakup di luar temuan (`❤️` + `Suka ❤`, VS16 `©️`) sehingga commit lalu screenshot FONT_MISSING — terverifikasi di `fonts.ts` (`allow.has(cp)` per board). Fix: `glyphScan` mengurangi code point yang muncul di grapheme bukan temuan; tes unit baru (❤, ©️, 4,9 ★).
  - `[medium]` `[patch]` LC-20 memakai bottom C tak terpotong; wrapper hug yang melewati board (posisi awal) salah dianggap posisi akhir → LC-20 palsu — terverifikasi di `rules.ts` (`bottom(cr)`). Fix: batas bawah terlihat = min(C, frame clip leluhur, board); tes unit baru.
  - `[low]` `[reject]` Tes MCP integrasi menjalankan `daemon/dist/main.js` yang mungkin basi/tidak ada bila `pnpm test` tanpa build — konvensi repo yang sudah ada (`daemon/src/index.test.ts`, `store.test.ts` juga memakai dist; Verification menjalankan build dulu); fix butuh orkestrasi build tambahan, bukan koreksi langsung.

## Design Notes

- **Mengapa commit tetap terjadi:** AD-8 menempatkan check sebelum commit sebagai *pelapor*. Board sering melanggar sementara selama dibangun (`[WIP]`, scroll akhir belum dibuat). Kalau ditolak, agen kehilangan snippet besar dan terdorong menulis potongan kecil yang lambat (waktu ≤ 1,5×). Gerbang dinilai di akhir lewat `layout_check` (Done when: 0 error gerbang). Sebaliknya, dokumen yang tidak bisa dirender tidak boleh ter-commit. Invariannya: "setiap revisi tersimpan sudah dirender dan dicek". editId menjaga kerja agen tetap ada.
- **allowGlyphs:** tanpa allowGlyphs, emoji pada board membuat render gagal FONT_MISSING sebelum check sempat berjalan, sehingga LC-01a tidak pernah muncul. Pengukuran memakai font fallback hanya untuk geometri dan tidak pernah dipakai untuk PNG.
- **LC-12 tetap warning:** level ini mengikuti Lampiran A (diikat oleh AD-8). Detail ukuran ditulis tegas ("ukuran board harus persis …"). Penilaian ukuran board di akhir putaran milik bench (story 14/16).
- Contoh baris MCP execute:
  ```
  check board Kd8sPq2m: 2 error (2 gerbang), 1 warning
  error·gerbang · LC-01a · Sapaan (Ab12Cd34) · emoji "👋" U+1F44B di "Halo 👋" · hapus emoji; ikon pakai node icon (icon_search)
  warning · LC-12 · Home · mobile (Kd8sPq2m) · ukuran 390×800 · 390×844
  ```

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm build` -- expected: exit 0
- `cd /root/lakar && /opt/node-26/bin/pnpm --filter @lakar/check test` -- expected: exit 0, 0 skip; tes fixture enam aturan dan contoh ©/digit/ZWJ/flag/keycap lulus
- `cd /root/lakar && /opt/node-26/bin/pnpm --filter @lakar/schema --filter @lakar/render --filter @lakar/daemon --filter @lakar/mcp test` -- expected: exit 0, 0 skip; log p50/p95 latensi check tercetak
- `cd /root/lakar && /opt/node-26/bin/pnpm test` -- expected: exit 0, 0 skip
- `pgrep -af 'lakar.*(daemon|chrome)|headless_shell'; ss -ltn | grep -c ':7466 '` -- expected: tidak ada proses Lakar tersisa, 0
- `cd /root/lakar && bash tools/node26/verify.sh` -- expected: exit 0 (snapshot C9 identik)

**Manual checks (if no CLI):**
- Baca output MCP `layout_check` dari tes: baris ringkas, tanpa kata golden/juri/rubrik/skor.

## Auto Run Result

- **Status:** built.
- **Ringkasan:** `packages/check` berisi enam aturan G0 murni (LC-01a/01b/02a/05/12/20), `glyphScan` (allowGlyphs), `touchedBoards`/`changedNodeIds`, `boundsOf`, `checkBoard`. Tipe `Finding`/`G0_RULES`/`summarizeFindings`/`findingLine` di `@lakar/schema`. `RenderPort.measure` + `allowGlyphs` di render. Daemon: execute merender board tersentuh pada salinan kerja lalu check sekali sebelum commit (temuan tidak menolak commit; error render → rollback + editId, hint "dokumen tidak di-commit"), respons `check` + `bounds`; `POST /layout-check`; log sesi `checkMs`/`summary`. MCP: tool `layout_check`, format baris ringkas (20/60 baris).
- **File:**
  - `packages/schema/src/findings{,.test}.ts`, `index.ts`, `package.json` — kontrak temuan AD-8 bersama + script test.
  - `packages/ports/src/index.ts` — `BoardMeasure`/`NodeBounds`/`TextMeasure`/`MeasureOptions`, `RenderPort.measure`.
  - `packages/render/src/{index,fonts,measure}.ts`, `test/{harness,text.test}.ts` — opsi `allowGlyphs` + tes.
  - `packages/check/src/{glyphs,tree,rules,touched,index,index.test}.ts`, `package.json` — aturan, touched, bounds, tes murni + benchmark mikro.
  - `packages/daemon/src/{check,chromium,server,sessions,index.test}.ts` — pipeline check execute, `/layout-check`, measure Chromium, log, tes Chromium asli + latensi.
  - `packages/mcp/src/{server,index,index.test}.ts` — tool `layout_check`, formatter, tes fake + lakard asli via proxy.
  - `tests/check-c7.test.ts`, `tests/execute-description.test.ts` — penjaga C7 dan deskripsi execute.
- **Review (quick):** 3 temuan — 2 patch (medium: allowGlyphs lintas node; LC-20 batas terlihat), 0 defer, 1 reject (low: tes MCP bergantung dist, konvensi repo).
- **Follow-up review:** `true` (2 patch medium pada pass pertama). Risiko belum terverifikasi: perilaku deny-set allowGlyphs pada board campuran (emoji + glyph sama di luar temuan) hanya diuji unit murni, belum lewat execute Chromium asli; LC-20 batas-terlihat baru juga hanya unit.
- **Latensi nyata (1 board 152 node, 12 execute update, Chromium hangat):** p50 56,5–60,6 ms, p95 72,5–78,5 ms (3 run; anggaran p50 ≤ 300 / p95 ≤ 800). Aturan murni 500 node: 7,4 ms (anggaran ≤ 20 ms).
- **Verifikasi:** `pnpm build` exit 0; check 61, schema 94, render 33, daemon 80, mcp 13 lulus, 0 skip; `pnpm test` 32 file / 544 tes lulus, 0 skip (arah dependensi, browser-pure, C7); tidak ada proses daemon/Chromium Lakar tersisa (`[headless_shell] <defunct>` milik `node app.js` PID 1931892 sejak 17 Nov, bukan Lakar), port 7466: 0; `tools/node26/verify.sh` exit 0; `scripts/tracer-e2e.sh` 1× LULUS ($0,20; execute menampilkan "check board …: 0 error (0 gerbang), 0 warning").
- **Risiko residual:** emoji diukur dengan font fallback sistem (geometri saja); board campuran glyph kini FONT_MISSING (agen tidak mendapat temuan LC untuk kombinasi itu); tes MCP integrasi butuh `pnpm build` lebih dulu.
