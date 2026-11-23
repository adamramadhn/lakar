---
title: "Autofix temuan check: data fix terstruktur + tool fix_check"
type: feature
ticket: ''
created: '2026-11-23'
status: built
baseline_revision: 'c79cad9'
route: full
route_source: pinned
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/research-open-pencil-features-for-lakar/research-open-pencil-features-for-lakar.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-board-height-fit.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-board-hug-height.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic "loop verifikasi agen", spec 1 dari 3 (dua lainnya: tool diff visual dan undo agen, dikerjakan paralel). Temuan `layout_check`/`execute` hanya membawa teks `expected`. Agen harus menerjemahkan setiap temuan menjadi snippet perbaikan sendiri, termasuk yang sepenuhnya mekanis (tinggi pas board landing yang angkanya sudah dihitung LC-12, `...` → `…`). Akibatnya execute perbaikan tambahan, token, dan kesalahan salin angka. open-pencil (rekomendasi #3 riset open-pencil; digest mcp-r1-1 butir 7–8) memberi `lint` fix aman + saran penilaian, `lint_fix` menerapkan fix aman, dan `suggestions:true` menerapkan saran pertama lalu melaporkan yang diterapkan dan yang tersisa.

**Approach:** Temuan check mendapat field opsional `fix: {label, ops}` (fix aman) dan `suggestions: [{label, ops}]` (saran), keduanya op core (`DocOp` `update`/`remove`) dengan alamat node ter-resolve. Tool MCP baru `fix_check {boardId?, codes?, suggestions?, dryRun?}` → `POST /viewer/fix-check`: check penuh tanpa batas per aturan, rencana fix (satu nilai per properti), buang fix basi/terikat token/ditolak core, terapkan semua sebagai SATU transaksi (satu rev = satu langkah undo), render + check ulang, commit (kecuali dryRun), lalu kembalikan `{applied, skipped, remaining, newFindings}`.

## Boundaries & Constraints

**Always:**
- AD-4: field `fix`/`suggestions` aditif; `detail`, `expected`, level, kode aturan, urutan, batas 3 warning per aturan di layout_check/execute, `findingLine`, dan output MCP layout_check/execute tidak berubah. Tes deep-equal yang kini melihat field baru diperbarui di PR ini. Route baru di bawah `/viewer/*`.
- Semua tulis lewat op core (`applyOps` dalam `transact`), satu rev + satu entri riwayat (`Apply check fixes`) per panggilan yang menerapkan sesuatu.
- Stale-safe: fix diterapkan hanya bila target op masih ada dan properti yang di-patch (remove: seluruh node) sama dengan saat check; selain itu `skipped` `stale`.
- Semantik `[WIP] `, `height:'hug'`, dan `expectedSize` dijaga: fix hanya ada bila aturannya menyala (tinggi pas landing sudah melewati `[WIP] ` dan hug); board hug tidak pernah diberi tinggi angka lewat saran.
- Properti yang tersimpan sebagai ref token tidak ditimpa angka (`skipped` `token`).
- Jejak file bersama kecil: `packages/mcp/src/server.ts` = satu import + satu blok pemanggilan + satu kalimat instruksi; skill review satu baris dengan pemangkasan setara (LOAD_LIMIT 9600 tidak dinaikkan).
- Teks spec/komentar Indonesia; label fix (tampil di UI/hasil tool), commit, PR Inggris.

**Never:**
- Aturan baru atau perubahan ambang/teks temuan (contoh brief "bulatkan geometri subpiksel" dan "ikat warna mentah ke token" tidak punya aturan di check; lihat Design Notes).
- Menerapkan saran tanpa `suggestions:true`, atau lebih dari satu fix per properti per panggilan.
- UI viewer baru tanpa desain Pencil lebih dulu (tombol Fix ditunda).

## Klasifikasi aturan

`safe` = deterministik dan menjaga maksud (diterapkan default). `suggestion` = masuk akal tetapi butuh penilaian (hanya dengan `suggestions:true`; saran pertama diterapkan). `none` = tanpa data fix. Kode di `AUTOFIX` (`packages/check/src/fixes.ts`); tes memastikan temuan tidak membawa jenis fix di luar kelasnya.

| Aturan | Hint `expected` saat ini (ringkas) | Fix konkret diketahui aturan? | Kelas | Data fix |
|---|---|---|---|---|
| LC-01a emoji | hapus emoji; ikon pakai node icon | ya (grapheme emoji) | suggestion | `content` tanpa emoji (kosong → tanpa saran); ikon pengganti tetap keputusan agen |
| LC-01b glyph ikon | hapus glyph; pakai node icon (lucide X) | ya (glyph terdepan) | suggestion | `content` tanpa glyph terdepan; teks yang isinya hanya glyph → tanpa saran |
| LC-02a terpotong clip | (sisi + px) | tidak | none | perlu penilaian tata letak |
| LC-02b teks meluap | (sisi + px) | tidak | none | — |
| LC-02c non-teks meluap | (sisa padding) | tidak | none | — |
| LC-03 teks berisiko meluber | wrap:'wrap' dengan lebar fill/angka | sebagian | suggestion | hanya kasus wrap fixed ≥ 2 baris: `{wrap:'wrap', width:'fill'}` (lebar angka/fill dipertahankan) |
| LC-04 kontras | rasio minimum | tidak | none | pilihan warna = keputusan desain |
| LC-05 teks < 12 | ≥ 12 | ya | suggestion | `{size:12, lineHeight:16}` (menggeser tata letak) |
| LC-06 paragraf kecil | ≥ 16/14px (token) | ya | suggestion | `{size:min, lineHeight:token}` |
| LC-07 spacing di luar token | himpunan token | ya (nilai terdekat) | suggestion | gap/padding/ukuran komponen ke nilai terdekat (seri → lebih besar); padding bawah 34 tetap |
| LC-08 skala tipe | skala TY | ya | suggestion | ukuran ke skala terdekat + line-height token; line-height saja → token terdekat; KPI → size × 1,2 |
| LC-09 > 2 keluarga font | ≤ 2 keluarga | tidak | none | — |
| LC-10 target sentuh | ≥ 44×44 | ya (ukuran terukur) | suggestion | frame: `minWidth/minHeight 44` pada sumbu yang kurang (bar/tab bisa berubah tinggi, jadi bukan safe) |
| LC-11 tumpang tindih | — | tidak | none | — |
| LC-12 board | tinggi pas `update(board,{height:N})`, ukuran layar, place | ya | **mixed** | **safe**: tinggi pas landing selesai (non-hug, non-`[WIP] `) bila tidak ada node absolut terlihat yang melewati tinggi baru (ada → saran, review 33-2). Saran: tinggi pas mobile + node absolut di bawah isi ikut naik; ukuran ke expectedSize/layar (hug: tanpa tinggi); tabrakan → geser ke kanan semua board (+80) |
| LC-13 nama default | nama bermakna | tidak | none | penamaan butuh konteks |
| LC-14 absolut di flex | jadikan flow atau Overlay / | ya | suggestion | 1) rename `Overlay / <nama>` (tampilan tetap), 2) `{position:null,x:null,y:null}` |
| LC-15 > 1 pustaka ikon | satu pustaka | tidak | none | — |
| LC-16 ikon digambar | pakai node icon | tidak | none | — |
| LC-17 seksi mirip | variasikan komposisi | tidak | none | — |
| LC-18 kartu bersarang | satu lapis | tidak | none | — |
| LC-19 frasa terlarang | ganti dengan klaim spesifik | tidak | none | penulisan |
| LC-20 tertutup bar bawah | — | tidak | none | — |
| LC-21 struktur | hapus spacer; satu lapis padding; … | sebagian | suggestion | spacer kosong → `remove`; padding ganda mobile → padding kiri/kanan dalam 0; radius > 3 nilai, teks baris tabel, bidang efek → tanpa saran |
| LC-22 jumlah konvensi (info) | — | tidak | none | — |
| LC-23 celah < 8 | gap Row ≥ 8 | sebagian | suggestion | `gap:8` pada Row hanya bila gap Row sendiri < 8 |
| LC-24 proporsi badge | Badge sm/md | tidak | none | — |
| LC-25 radius konsentris | dalam = luar − padding | ya | suggestion | radius dalam = luar − padding, atau radius luar = dalam + padding |
| LC-26 ritme judul | gap kelompok | tidak | none | — |
| LC-27 > 6 ukuran huruf | satukan peran | tidak | none | — |
| LC-28 baris > 80 karakter | persempit lebar | ya (perkiraan) | suggestion | `maxWidth` (lebar angka → `width`) = size × 37,5 dibulatkan 8 (16px → 600) |
| LC-29 bobot tipis kecil | ≥ 400 | ya | **safe** | `{weight:400}` |
| LC-30 tanda baca | en dash rentang, … | ya | **mixed** | **safe**: rentang angka tanpa spasi (`09.00-17.00`) → `–`, `...` → `…`, hanya teks non-mono. Saran: rentang berspasi (`10 - 5` bisa pengurangan) dan teks mono (kode) — review 33-3 |
| LC-31 rata tepi bawah | padding bawah ≥ 64 | tidak | none | — |
| LC-32 instance basi | reset override / sunting master | tidak | none | ditunda (lihat deferred) |
| LC-33 skeleton tersisa | Build atau remove | tidak | none | isi seksi = pekerjaan agen |
| FONT_MISSING (kode error render, bukan temuan) | daftarkan font / ganti karakter | tidak | none | — |

Ringkas: 36 aturan → 1 safe (LC-29), 2 mixed (LC-12: tinggi pas landing tanpa node absolut terpotong; LC-30: rentang tanpa spasi + elipsis di teks non-mono), 13 suggestion, 20 none; FONT_MISSING none.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default | `fix_check {}` | Semua fix aman semua board → satu rev, satu entri riwayat `Apply check fixes`, satu langkah undo agen (hook `AgentSteps.onAgentWrite`); `applied` (kind `fix`), `remaining` (temuan lama tersisa, dibatasi seperti layout_check), `newFindings` | — |
| Undo / visual_diff | `fix_check` lalu `undo` / `visual_diff {}` | undo membatalkan semua fix sekaligus; dasar visual_diff = rev sebelum fix_check. dryRun tidak dicatat | undo ditolak bila ada edit lain sesudahnya (aturan undo agen) |
| Tanpa fix aman | hanya saran/none | `applied:[]`, tanpa commit, rev tetap | — |
| Saran | `{suggestions:true}` | + saran pertama temuan tanpa fix aman (kind `suggestion`) | — |
| Filter | `{codes:['LC-30'], boardId}` | Hanya aturan/board itu | kode tak dikenal → SCHEMA_INVALID; board tak ada → NOT_FOUND |
| dryRun | `{dryRun:true}` | Fix diterapkan di salinan, render + check ulang, tanpa commit (rev, file, riwayat tetap) | — |
| Bentrok | dua fix menyentuh properti sama / update node yang dihapus | Fix pertama (urutan temuan: error dulu) menang; sisanya `skipped` `conflict` | — |
| Basi | dokumen berubah antara check dan kunci (tulis lain saat render) | Setiap fix yang targetnya ada di board yang berubah (JSON ter-resolve, termasuk token) atau hilang → `skipped` `stale`; fix di board lain tetap diterapkan | — |
| Token | properti yang di-patch tersimpan `{$token}` | `skipped` `token` (ubah token atau bind) | — |
| Ditolak core | op fix gagal validasi | `skipped` `invalid` (kode + pesan); sisanya tetap satu transaksi | — |
| Isi instance | temuan pada `I/…` | update komposit = override instance; master tidak disentuh | — |
| Render gagal | FONT_MISSING dsb. saat check ulang | Tidak di-commit, error apa adanya | sama dengan execute |
| Banyak warning | > 3 per aturan per board | fix_check melihat semua (check tanpa batas); output tetap dibatasi | — |
| Board `[WIP] ` / hug | landing | Tanpa fix tinggi pas (aturan tidak menyala) | — |
| Tanpa dokumen aktif | sesi baru | — | NO_ACTIVE_DOC |

</frozen-after-approval>

## Code Map

- `packages/schema/src/findings.ts` -- `FindingFix`, `Finding.fix?`, `Finding.suggestions?`.
- `packages/check/src/fixes.ts` -- pembangun patch (`patchFix`, `nearestOf`, `mapPadding`, `scaleLineHeight`, `snapSpacing`), `planFixes`, `staleFixes`, `resolvedIndex`, `findingKey`, tabel `AUTOFIX`.
- `packages/check/src/rules.ts` -- `finding(…, extra)`; data fix di LC-01a/b, 03, 05, 06, 07, 08, 10, 12, 14, 21, 23, 25, 28, 29, 30; `punctuated`.
- `packages/check/src/index.ts` -- `checkBoard({cap})` (false = tanpa batas per aturan); ekspor.
- `packages/daemon/src/check.ts` -- `runCheck(…, {cap})`, `byBoard`.
- `packages/daemon/src/fix-check.ts` -- route `POST /viewer/fix-check`, `tokenBoundKey`; check ulang hanya board yang berubah; hook `agentSteps.onAgentWrite` sesudah commit.
- `packages/daemon/src/server.ts` -- registrasi route (1 baris + import).
- `packages/daemon/src/events.ts` -- `TOOL_ROUTES['/viewer/fix-check'] = 'fix_check'` (Activity + muat ulang viewer lewat rev).
- `packages/mcp/src/fix-check.ts` -- deskripsi, `formatFixCheck`, `registerFixCheckTool`; `server.ts` import + satu pemanggilan + satu kalimat SERVER_INSTRUCTIONS.
- `packages/viewer/src/harnesses.ts`, `activity.ts` -- nama tool di Connections, judul baris Activity "Fix check findings".
- `packages/skills/skills/review.md` -- langkah 3: `fix_check` lalu satu execute perbaikan (pemangkasan setara di langkah 1–2).

## Tasks & Acceptance

- [x] Data fix aditif di temuan + tabel klasifikasi (`AUTOFIX`).
- [x] `planFixes` (pilih, bentrok, duplikat) dan `staleFixes` murni di check.
- [x] Route `/viewer/fix-check`: check tanpa batas → saring basi/token/invalid → satu transaksi → check ulang → commit/dryRun.
- [x] Tool MCP `fix_check` + kalimat instruksi + Activity + Connections.
- [x] Skill review satu baris, anggaran tidak naik (review.md 1492 → 1484 karakter).
- [x] Tes: `packages/check/src/fixes.test.ts` (fix per aturan, kelas AUTOFIX, cap, planFixes, staleFixes), `packages/daemon/src/fix-check.test.ts` (dryRun, satu rev + satu entri riwayat, saran, codes, stale saat tulis bersamaan, error input, Activity, tokenBoundKey), `packages/mcp/src/fix-check.test.ts` (registrasi, skema, body, format, error), `tests/skills.test.ts` (baris review), tes lama LC-12 dan daftar tool diperbarui.
- [x] `pnpm build` hijau; `pnpm test`: kegagalan sisa hanya yang khas Windows/lingkungan (foto, SIGTERM/SIGKILL, CRLF skill, api.md, pool config, Chromium render/bench, juri C7).
- [x] Smoke daemon lokal (msedge): board landing 1440×1400 dengan LC-05/08/12/29/30 → dryRun (rev 1 tetap) → apply (rev 2: tinggi 245, bobot 400, `09.00–17.00 …`) → `suggestions:true` (rev 3: size 12/16, line-height 20). Riwayat: dua entri `Apply check fixes`.

## Design Notes

- **Kenapa sedikit yang safe.** Hampir semua aturan Lakar menilai hasil tata letak; mengubah ukuran/spacing menggeser isi dan bisa memicu LC-02a/LC-12 lain (terlihat di smoke: saran size 12 pada board yang baru dipaskan tingginya menghasilkan LC-02a 7 px sebagai `newFindings`). Hanya LC-29, LC-30, dan tinggi pas landing yang menjaga maksud tanpa penilaian. Contoh brief "bulatkan geometri subpiksel" dan "ikat warna mentah yang sama dengan token" tidak punya aturan check; menambah aturan mengubah output check (AD-4), jadi ditunda.
- **Satu rev.** Setiap fix divalidasi berurutan di salinan memori (`transact` tanpa store); yang lolos digabung lalu diterapkan sekali pada dokumen saat ini, sehingga satu entri riwayat (= satu langkah undo untuk spec undo agen) dan gabungan pasti valid.
- **Stale.** Check (render) berjalan di luar kunci; di bawah kunci, bila rev berubah, properti yang di-patch dibandingkan antara dokumen ter-resolve saat check dan sekarang (`staleFixes`).
- **Line-height ikut ukuran.** Smoke pertama: saran `size:12` tanpa line-height menghasilkan LC-08 baru (line-height bawaan 15). Saran ukuran kini selalu membawa line-height token skala.
- **Output MCP.** `layout_check`/`execute` tetap; agen tahu adanya fix lewat instruksi server dan skill review. `fix_check` menulis baris `diterapkan`/`dilewati`/`sisa … · saran: …`/`baru`.
- **Viewer.** Tombol "Fix" per temuan di tab Checks ditunda: butuh desain Pencil dulu dan route viewer ber-slug dengan `inverse` untuk undo viewer.

## Triage review (quick, mandiri)

- Diperbaiki: saran ukuran teks tanpa line-height → LC-08 baru (smoke); kini selalu line-height token.
- Diperbaiki: ringkasan board saat tidak ada yang diterapkan memakai hitungan tanpa batas → dihitung ulang dari temuan terbatas.
- Diterima: saran yang menumbuhkan isi bisa memicu LC-02a di board bertinggi angka; dilaporkan di `newFindings`, agen memutuskan (deferred).
- Diterima → dibereskan saat merge #31/#32: komentar kepala `server.ts` kini 19 tool.

### Review independen PR #33 (sesudah merge #31 undo agen dan #32 visual_diff)

- **Merge:** `TOOL_ROUTES` memuat `/viewer/fix-check` bersama undo/redo/visual-diff; `finish()` menjaga kasus undo/redo + `layout_check`/`fix_check`; viewer `MCP_TOOLS`/`callTitle` memuat semua kasus; tes daftar tool MCP 19 nama.
- **X1 (high) → diperbaiki:** fix_check memanggil hook tulis agen tunggal `AgentSteps.onAgentWrite(session, docId, rev sebelum, rev baru, committed.inverse, 'Apply check fixes')` sesudah commit (tidak pada dryRun). `undo` membatalkan fix_check; `visual_diff {}` sesudah fix_check berdasar rev sebelum fix_check. Tes di `fix-check.test.ts`.
- **33-1 (medium) → diperbaiki:** cek basi per board, bukan per properti: rev berubah sejak check → setiap fix yang targetnya di board yang berubah (`staleFixes`, JSON board ter-resolve) atau hilang = `stale`. Tes: seksi ditambah selama render → LC-29/LC-30 stale, tanpa commit; board lain berubah → fix tetap.
- **33-2 (medium) → diperbaiki:** tinggi pas LC-12 landing jadi saran (bukan fix aman) bila node absolut terlihat (atau di dalam node absolut) melewati tinggi baru. Tes check.
- **33-3 (medium) → diperbaiki:** LC-30 fix aman hanya untuk rentang angka tanpa spasi dan elipsis di teks non-mono; rentang berspasi (`10 - 5`) dan teks mono = saran. LC-30 kini `mixed`. Tes check.
- **33-4 (low) → diperbaiki:** di bawah kunci hanya board yang berubah sejak check (atau semua board bila fix mengubah board itu sendiri, karena tabrakan LC-12) yang dirender ulang; board lain memakai hasil check awal. Tes menghitung render.
- **Panduan gabungan:** SERVER_INSTRUCTIONS satu alur: check di respons execute → fix_check → perbaikan editId/update → screenshot + zoom → execute perbaikan → visual_diff → export; undo untuk langkah sendiri (execute/paste/fix_check), lalu kalimat opsional. review.md langkah 3: `fix_check` → execute perbaikan → `visual_diff`; dibayar pemangkasan di pertanyaan 2/5 dan daftar slop (1480 → 1477 karakter).
