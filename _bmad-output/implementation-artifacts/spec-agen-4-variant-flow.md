---
title: 'Alur varian responsif dan cek konsistensi dari seleksi (epic agen-di-canvas story 4)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: '3478c5bbe6f4201a7f715bf7a116da3ee3db3911'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: []
deferred:
  - summary: >-
      Cek konsistensi literal di skill selection hanya membandingkan dengan node sejawat bertoken, bukan dengan nilai token dokumen.
    evidence: |-
      Sandbox execute belum bisa membaca nilai token (API baca token = epic token-tema story 2). Literal yang nilainya sama dengan token tanpa sejawat bertoken tidak terlapor. Usul: bandingkan nilai literal dengan nilai token mode aktif sesudah API itu ada.
    location: >-
      packages/skills/skills/selection.md (blok baca saja, literal)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Agen sudah bisa membaca seleksi (`get_selection`, story 2) dan commit-nya tampil live (story 3), tetapi tidak ada panduan skill yang mengajarkan alur kerja atas seleksi, dan tidak ada tes yang membuktikan alur ujung ke ujung (seleksi viewer → MCP → execute → event live → History) seperti tuntutan Done-when epic.

**Approach:** Skill baru `selection` (`packages/skills/skills/selection.md`) berisi alur dasar seleksi, alur varian responsif (board terpisah per lebar, AD-13) dengan contoh teruji, dan alur cek konsistensi baca-saja dengan contoh teruji; `core.md` dan deskripsi tool MCP menunjuk ke skill itu. Tes integrasi lakard asli + server MCP menjalankan contoh skill terhadap dokumen fixture.

## Boundaries & Constraints

**Always:**
- Alur dasar di skill: `get_selection` → (kosong → minta pengguna memilih, berhenti; `missing` diabaikan) → `open_doc {slug}` bila bukan dokumen aktif (get_selection tidak mengganti dokumen aktif) → alamati lewat `nodes[].id` → tulis hanya lewat `execute`, node sumber tidak diubah, edit hanya node yang perlu (op berlaku di rev terbaru, AD-7).
- Varian = board terpisah per lebar; default 390 dan 768; satu execute untuk semua node terpilih dan semua lebar; board terpilih → `duplicate` board, frame terpilih → board baru berisi salinan frame (fills board asal); nama `<sumber> / <w>`, `place(w, h, {near: board asal})`, `screen` mobile (< 600), selain itu `screen` sumber (sumber mobile → app), `expectedSize` = ukuran board; tinggi awal = luas sama dengan board asal (maks 4000) lalu dipangkas di execute perbaikan.
- Penyesuaian per lebar di contoh: lebar angka > 80% lebar → `'fill'`; elemen padding horizontal angka dipotong (mobile 20, tablet 40; token utuh); < 600: row > 2 anak → column + align stretch, grid → satu kolom, `gridColumn`/`gridRow` dilepas; teks > 32 (mobile) / > 48 (tablet) → 32/40 atau 48/56.
- Sesudah execute: baca `check` di respons (setara `layout_check` board tersentuh), satu execute perbaikan (temuan + pangkas tinggi lewat `inspect {id, depth:1}`), laporkan id/nama/ukuran varian dan sisa temuan.
- Cek konsistensi = snippet tanpa op mutasi (rev tetap, tanpa check), hasil di `data.value`: node seleksi didedupe; `literal` (node dengan prefiks nama induk + nama + properti sama memakai `{$token}`, node ini literal → usul token itu), `nearColors` (`{colors, nodes}`; hex dinormalkan ke 8 digit, alpha sama, selisih kanal maksimum 1–8), `uneven` (saudara frame dengan layout sama di induk sama, `gap`/`columnGap`/`rowGap`/`padding` berbeda), `offGrid` (jarak bukan kelipatan 4 selain 2 dan 6). Perbaikan hanya bila diminta.
- Contoh `js` di skill dijalankan tes nyata (render + check Chromium) terhadap fixture; blok baris pertama `// baca saja` wajib tanpa op mutasi.
- Batas ukuran skill `selection`: prosa ≤ 1200, total ≤ 2600 token (`estimateTokens`); `core` tetap ≤ 4000.
- Bahasa skill/spec/komentar Indonesia.

**Never:**
- Tidak mengubah route, bentuk respons, kode error, atau nama tool lama (AD-4); hanya menambah nama skill dan teks deskripsi.
- Tidak menambah fungsi API `execute` (mis. baca seleksi/token di sandbox) dan tidak menambah UI viewer.
- Tidak menyimpan varian sebagai media query atau properti responsif dalam satu board (AD-13).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Varian board | seleksi = board 1440x900 fixture; execute contoh | 2 board baru `… / 390` (mobile) dan `… / 768` (screen sumber `landing`), `expectedSize` sesuai, padding kartu bertoken tetap token, check 0 error / 0 warning; sumber tidak berubah | — |
| Varian frame | seleksi = frame `Seksi / Hero` + `Seksi / Fitur` | 4 board baru `<frame> / <w>`, fills board asal, satu anak salinan frame ber-id baru `width:'fill'` | — |
| Edit manual di tengah | pengguna `update hero {gap:32}` lewat route ops sesudah get_selection | commit agen di rev berikutnya; sumber dan varian memuat gap 32; History: commit agen di atas commit viewer | — |
| Event live | pelanggan `/viewer/events` | `change` edit (manual), `call` execute `done` dengan rev, slug, board varian, created; `call` get_selection dengan target board | — |
| Cek konsistensi | seleksi = `Seksi / Fitur` fixture | `literal` = judul kartu 3 `#0F766E` → `colors.accent`; `nearColors` = `#475467FF`/`#475569FF` + 3 node; seleksi board penuh: `literal` tetap hanya judul kartu 3; `uneven` gap kartu 2 (10); `offGrid` = kartu 2; rev tetap | — |
| Seleksi kosong / slug lain | `addresses: []` / slug bukan dokumen aktif | skill: minta pengguna memilih lalu berhenti / `open_doc {slug}` dulu | — |
| Skill tak dikenal | `read_skill {name:'dashboard'}` | tetap NOT_FOUND dengan daftar yang kini memuat `selection` | — |

</intent-contract>

## Code Map

- `packages/skills/src/index.ts` -- `SKILL_NAMES` tertutup (daftar `read_skill`, `/skills/read`).
- `packages/skills/skills/*.md` -- isi skill; `core.md` hampir di batas 4000 token.
- `tests/skills.test.ts` -- batas token per skill, struktur blok.
- `packages/daemon/src/skills-examples.test.ts` -- menjalankan setiap blok `js` skill di daemon nyata.
- `packages/mcp/src/server.ts` -- `READ_SKILL_DESCRIPTION`, `GET_SELECTION_DESCRIPTION`, schema `read_skill`.
- `packages/mcp/src/index.test.ts` -- daftar skill, deskripsi, integrasi lakard asli.
- `packages/daemon/src/selection.ts`, `events.ts`, `viewer.ts`, `ops.ts` -- route seleksi, event SSE, History, route ops (dipakai tes, tidak diubah).
- `packages/core/src/transaction.ts` -- `duplicate` (board di halaman, salinan tepat setelah sumber).
- `tests/skills-c7.test.ts`, `packages/daemon/src/pool.test.ts`, `packages/skills/src/index.test.ts` -- daftar file/nama skill.

## Tasks & Acceptance

**Execution:**
- [x] `packages/skills/skills/selection.md` -- baru: alur dasar, varian responsif + contoh `js`, cek konsistensi + contoh `// baca saja` -- panduan agen (Done-when epic).
- [x] `packages/skills/src/index.ts`, `packages/skills/src/index.test.ts`, `packages/skills/README.md` -- tambah `selection` ke `SKILL_NAMES` dan daftar.
- [x] `packages/skills/skills/core.md` -- satu kalimat penunjuk ke `selection` di "Struktur dan nama".
- [x] `packages/mcp/src/server.ts`, `packages/mcp/src/index.test.ts` -- `READ_SKILL_DESCRIPTION` (kapan membaca `selection`, daftar nama), schema `read_skill`, `GET_SELECTION_DESCRIPTION` menunjuk `read_skill selection`; tes daftar skill dan teks.
- [x] `tests/support/selection-fixture.ts` -- baru: snippet fixture board landing dengan ketidakkonsistenan tertanam, `withSelection`, `READ_ONLY_MARK`.
- [x] `packages/daemon/src/skills-examples.test.ts` -- selection.md dijalankan atas fixture (SEL diganti id board); blok `// baca saja` wajib tanpa mutasi.
- [x] `packages/mcp/src/selection-flow.test.ts` -- baru: integrasi lakard asli + MCP untuk semua baris matriks (varian board/frame, edit manual, event, History, cek konsistensi).
- [x] `tests/skills.test.ts`, `tests/skills-c7.test.ts`, `packages/daemon/src/pool.test.ts` -- batas `selection`, daftar file/nama skill.

**Acceptance Criteria:**
- Given viewer mengirim seleksi board lewat `PUT /viewer/docs/:slug/selection`, when agen memanggil `get_selection`, `read_skill selection`, `open_doc`, lalu `execute` contoh varian, then dokumen memuat board 390 dan 768 baru, pelanggan `/viewer/events` menerima `call` execute `done` ber-rev untuk board itu, dan History mencatat commit `lakar-mcp`.
- Given pengguna mengedit node lewat route ops sesudah agen membaca seleksi, when agen commit varian, then edit pengguna tetap ada di sumber dan ikut di varian.
- Given agen menjalankan contoh cek konsistensi atas frame terpilih, when execute selesai, then rev tidak bertambah dan `data.value` melaporkan temuan fixture.
- Given CI Linux, when `tests/skills.test.ts` berjalan, then batas `selection` dan `core` hijau.

## Spec Change Log

### 2026-11-22 - Review pass 1 (intent_gap diputuskan atas delegasi "terima jadi")
- Pemicu: blind (seleksi ganda diabaikan, `screen:'app'` paksa untuk 768, `literal` positif palsu per nama), edge (padding bertoken → NaN, columnGap/rowGap, gridRow, alpha FF, seleksi tumpang tindih).
- Diubah (di dalam `<intent-contract>`, keputusan delegasi): Always varian = satu execute untuk semua node terpilih dan semua lebar; `screen` < 600 mobile, ≥ 600 = screen sumber (mobile → app); penyesuaian: hanya elemen padding horizontal angka yang dipangkas (token utuh), `gridRow` ikut dilepas; konsistensi: kunci sejawat `literal` = prefiks nama induk + nama + properti, `nearColors` membawa node dan menormalkan alpha, `uneven`/`offGrid` mencakup `columnGap`/`rowGap`, node didedupe; baris matriks varian board (768 = landing) dan varian frame (dua frame).
- Keadaan buruk yang dihindari: seleksi ganda diam-diam hilang; execute varian gagal di dokumen ber-token spacing; usul token salah untuk judul yang bukan sejawat.
- KEEP: alur dasar skill, tinggi awal lega + pangkas, check dari respons execute, contoh teruji di skills-examples dan selection-flow, fixture dengan ketidakkonsistenan tertanam.

## Review Triage Log

### 2026-11-22 - Review pass
- verdicts: 41 findings - high 0, medium 5, low 28, false 8, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) contoh varian hanya memakai `SEL[0]`, seleksi lain diabaikan - contoh kini `for (const id of SEL)`; prosa "semua node terpilih"; tes selection-flow menjalankan varian atas dua frame (hero + fitur → 4 board).
  - `[low]` `[reject]` (blind) frame terpilih mendapat tinggi dari board induk - disengaja (Design Notes "Tinggi varian"): tinggi lega dipangkas di execute perbaikan; memakai bounds butuh data di luar sandbox (id saja di SEL).
  - `[low]` `[intent_gap]` (blind) varian 768 dipaksa `screen:'app'` - Diputuskan (delegasi): < 600 → `mobile`, ≥ 600 → `screen` board sumber (sumber mobile → `app`), supaya profil check varian tablet sama dengan sumbernya; `expectedSize` menutup LC-12. Diterapkan + tes `landing`.
  - `[false]` `[reject]` (blind) `cap()` rusak untuk padding 3 nilai - skema `Padding` (packages/schema/src/nodes.ts:328) hanya n | [v,h] | [t,r,b,l]; 3 nilai ditolak SCHEMA_INVALID sebelum tersimpan.
  - `[low]` `[patch]` (blind) `nearColors` tanpa node - entri kini `{colors:[a,c], nodes:[id…]}`; tes memeriksa 3 node.
  - `[false]` `[reject]` (blind) "nilai mayoritas" tidak dihitung - `uneven` mendaftar nilai tiap saudara; prosa meminta agen menyamakan ke nilai terbanyak dari daftar itu (kini "nilai terbanyak"); bagian saudara di luar seleksi = cakupan seleksi yang disengaja.
  - `[medium]` `[patch]` (blind) `literal` per nama saja → positif palsu pada seleksi board (judul hero `#101828` diusul `colors.accent`) - kunci sejawat kini prefiks nama induk + nama + properti; tes cek konsistensi seluruh board hanya melaporkan judul kartu 3.
  - `[low]` `[patch]` (blind) cek fixture skills-examples tanpa `gate:0` - ditambah.
  - `[low]` `[patch]` (blind) komentar urutan board yang tidak diuji - komentar dihapus; regex id 8 karakter dipertahankan (bentuk ID dikunci spine).
  - `[low]` `[reject]` (blind) describe `inputSchema` read_skill tanpa tes - hanya teks bantuan untuk agen; nama salah tidak memengaruhi perilaku (daemon memvalidasi), dan isi diperbarui lengkap di diff ini.
  - `[low]` `[patch]` (blind) RegExp yang hanya meng-escape kurung - diganti `endsWith`.
  - `[low]` `[patch]` (blind) helper SSE rapuh - `res.ok`/body dicek; data multi-baris tidak terjadi (daemon menulis satu baris `JSON.stringify`), timer 200 ms tertinggal tidak berdampak (selesai sendiri).
  - `[low]` `[patch]` (blind) batas baru tidak di DESIGN.md - DESIGN.md tidak ada di repo; komentar batas di tests/skills.test.ts kini menyebut spec ini sebagai sumber batas `selection`.
  - `[low]` `[defer]` (blind) deferred-work tidak dicatat - pertajaman `literal` terhadap nilai token dicatat di frontmatter dan deferred-work.md; HANDOVER diperbarui orkestrator di akhir epic (lakar-progress).
  - `[low]` `[reject]` (blind) Verification hanya untuk Windows - perbaikannya mengedit spec build ini (aturan: tolak); CI Linux tetap acuan di AGENTS.md.
  - `[low]` `[patch]` (edge) `addresses` tidak kosong tetapi semua `missing` → `get(undefined)` - prosa kini "`nodes` kosong → berhenti"; contoh berulang per id sehingga SEL kosong tidak memanggil `get`.
  - `[medium]` `[patch]` (edge) seleksi ganda diabaikan - satu akar dengan baris blind pertama; diperbaiki di sana.
  - `[low]` `[patch]` (edge) node seleksi dihapus sebelum execute → NOT_FOUND tanpa langkah pulih - prosa: NOT_FOUND pada id seleksi → `get_selection` lagi.
  - `[medium]` `[patch]` (edge) padding bertoken membuat `cap` menghasilkan NaN - `cap` kini melewati token utuh dan elemen token, hanya angka horizontal yang dipangkas; fixture memakai `[{$token:'spacing.card'}, 24]` dan tes memeriksa hasilnya.
  - `[low]` `[reject]` (edge) frame kecil → board tinggi - sama dengan baris tinggi frame di atas.
  - `[low]` `[reject]` (edge) jalan ulang membuat varian kembar - keputusan agen/pengguna; nama dan id dilaporkan, perbaikan butuh cabang baru.
  - `[low]` `[reject]` (edge) row 2 anak lebar di 390 - heuristik; luapan tertangkap check (LC-02b/LC-11) dan diperbaiki di execute perbaikan sesuai alur.
  - `[low]` `[patch]` (edge) `gridRow` eksplisit tumpang tindih sesudah satu kolom - `gridRow` juga dilepas di < 600.
  - `[low]` `[patch]` (edge) seleksi induk + turunan menggandakan node - `all` didedupe per id.
  - `[low]` `[reject]` (edge) padding setara beda bentuk (24 vs [24,24,24,24]) dilaporkan `uneven` - jarang, hanya laporan (bukan mutasi) yang ditinjau agen; normalisasi menambah cabang.
  - `[low]` `[patch]` (edge) `columnGap`/`rowGap` grid tidak diperiksa - masuk `uneven`, `offGrid`, dan pemakaian `literal`.
  - `[false]` `[reject]` (edge) hex pendek `#FFF` - skema `HexColor` (nodes.ts:31) hanya #RRGGBB/#RRGGBBAA; bagian #RRGGBB vs #RRGGBBFF digabung ke baris alpha di bawah.
  - `[low]` `[patch]` (edge) `/viewer/events` non-200 → pesan menyesatkan - satu akar dengan baris helper SSE blind.
  - `[false]` `[reject]` (edge) SSE CRLF/multi-baris/bukan JSON - daemon (events.ts `write`) menulis `event: …\ndata: <JSON satu baris>\n\n`.
  - `[low]` `[patch]` (edge) `agent.close()` di luar finally - dipindah ke finally.
  - `[low]` `[patch]` (edge) fixture tanpa `gate:0` - satu akar dengan baris blind; diperbaiki.
  - `[false]` `[reject]` (edge) blok tanpa baris SEL membuat tes berhenti - `withSelection` melempar pesan jelas; gagal keras pada kontrak contoh skill adalah perilaku yang benar.
  - `[low]` `[patch]` (edge, klaim) tes tidak mencakup baris "Skill tak dikenal" - tes lakard asli (index.test.ts) kini memeriksa pesan NOT_FOUND memuat `selection`; baris "Seleksi kosong" adalah prosa skill (diperiksa tes ukuran/struktur, bukan perilaku).
  - `[low]` `[patch]` (edge, klaim) alpha `''` vs `FF` dianggap beda - hex dinormalisasi ke 8 digit sebelum dibandingkan.
  - `[medium]` `[patch]` (vgap other) contoh varian hanya `SEL[0]` - satu akar dengan baris blind pertama.
  - `[low]` `[intent_gap]` (intent 1) verify menyebut event `change`, tes memeriksa `call` - Diputuskan (delegasi, AD-9/story 3): commit agen tetap lewat event `call` execute `done` ber-rev yang dipakai viewer (`revChange`); menambah `change` untuk commit agen membuat viewer memuat ulang dua kali. Tanpa perubahan kode.
  - `[low]` `[patch]` (intent 2) `layout_check` tidak dipakai di jalur normal - skill tetap memakai `check` di respons (core melarang panggilan terpisah); tes kini juga memanggil tool `layout_check` atas varian dan memeriksa 0 error / 0 warning.
  - `[false]` `[reject]` (intent 3) "live di canvas" berhenti di SSE - mount ulang canvas dari event `call` adalah story 3 (`revChange`, liveChanges teruji + smoke msedge); story 4 = alur agen + integrasi (tiket verify).
  - `[false]` `[reject]` (intent 4) edit bersamaan / baseRev - AD-7: tidak ada baseRev; gestur bersamaan ditangani story 3; tes ini membuktikan op agen diterapkan di rev terbaru tanpa menimpa edit manual.
  - `[false]` `[reject]` (intent 5) agen skrip, bukan harness nyata - tiket verify menyebut "agen uji"; harness nyata di luar tes otomatis.
  - `[low]` `[defer]` (intent 6) `literal` = heuristik sejawat, bukan nilai token - butuh API baca token (epic token story 2); dicatat di deferred.

## Design Notes

- **Skill baru, bukan core.** `core.md` tinggal ±30 token dari batas 4000 dan dibaca di setiap tugas; alur seleksi hanya relevan bila pengguna merujuk seleksi, jadi dimuat sesuai kebutuhan (`read_skill selection`), dengan penunjuk satu kalimat di core dan di deskripsi `read_skill`/`get_selection`. Nama tool tetap; daftar nama skill bertambah (AD-4: hanya menambah).
- **`layout_check` dalam alur.** Tiket menulis "execute → layout_check"; core melarang `layout_check` terpisah karena respons execute sudah memuat check board tersentuh. Diputuskan: skill memakai `check` di respons execute (setara `layout_check`) dan `layout_check` hanya bila temuan > 20 baris (batas baris execute MCP).
- **"Event change" di verify.** Commit agen tidak dipancarkan sebagai event `change` (itu untuk tulis aplikasi); viewer me-mount ulang dari event `call` execute `done` ber-rev (story 3, `revChange`). Tes memeriksa `call` itu untuk commit agen dan `change` `edit` untuk edit manual.
- **Konsistensi tanpa nilai token.** Sandbox belum bisa membaca nilai token (API baca token = epic token story 2), jadi `literal` memakai node sejenis (prefiks nama induk + nama + properti sama) yang memakai token sebagai acuan. Bisa dipertajam setelah API baca token ada.
- **Tinggi varian.** Board tidak bisa `hug` dan sandbox tidak mengukur, maka tinggi awal sengaja lega (luas sama) supaya check tidak memotong isi, lalu dipangkas di execute perbaikan dari `inspect`.
- **Tanpa UI.** Story ini tidak punya state desain baru di `lakar-ui.pen` (bagian 06 sudah dipenuhi story 3: Agent Commit Row, Just changed, badge seleksi).
- **Tes di `packages/mcp`.** Butuh `@modelcontextprotocol/client` (devDep mcp); daemon diimpor lewat path relatif (`tests/dependency-direction` hanya memeriksa specifier paket).

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: tanpa error.
- `npx -y pnpm@12.21.0 exec vitest run packages/mcp packages/skills packages/daemon/src/skills-examples.test.ts packages/daemon/src/pool.test.ts tests/skills.test.ts tests/skills-c7.test.ts tests/dependency-direction.test.ts` -- expected: hijau kecuali baseline Windows (core/landing CRLF, api.md, skills-c7 sumber, pool config, photo api.md).
- `npx -y pnpm@12.21.0 test` -- expected: tidak ada kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`.

## Auto Run Result

- **Ringkasan:** skill baru `selection` (alur seleksi, varian responsif per lebar sebagai board terpisah, cek konsistensi baca-saja) dengan contoh teruji; penunjuk di `core.md` dan deskripsi `read_skill`/`get_selection`; tes integrasi lakard asli + MCP untuk alur get_selection → execute → event → History.
- **File:** `packages/skills/skills/selection.md` (skill baru), `packages/skills/src/index.ts` (+ `selection`), `packages/skills/skills/core.md` (penunjuk), `packages/mcp/src/server.ts` (deskripsi), `tests/support/selection-fixture.ts` (fixture), `packages/mcp/src/selection-flow.test.ts` (integrasi), `packages/daemon/src/skills-examples.test.ts` (contoh selection atas fixture, blok baca saja), daftar/ batas skill di `tests/skills.test.ts`, `tests/skills-c7.test.ts`, `packages/skills/src/index.test.ts`, `packages/skills/README.md`, `packages/daemon/src/pool.test.ts`, `packages/mcp/src/index.test.ts`; `deferred-work.md`.
- **Review:** 41 temuan; patch 22 baris (5 baris medium dalam 3 akar: seleksi ganda ×3 baris, `literal` positif palsu, padding bertoken; sisanya low), 2 intent_gap diputuskan (screen varian ≥ 600 = screen sumber; event `call` untuk commit agen), 2 defer (`literal` vs nilai token, sama akar), ditolak 15: 8 false dan 7 low (tinggi frame ×2, describe schema, Verification Windows, varian kembar, row 2 anak, padding beda bentuk, dll. - alasan per baris di log).
- **Follow-up review:** `false`. Entri medium yang di-patch dihitung per akar: seleksi ganda (1 akar), `literal` sejawat, padding bertoken = 3 entri medium; ketiganya kini dieksekusi tes nyata (selection-flow: dua frame, seleksi board penuh, padding token) dan contoh skill lulus check 0/0/0, jadi tidak ada risiko perilaku yang belum terverifikasi. Tidak ada UI yang berubah (smoke msedge tidak berlaku).
- **Verifikasi:** build OK; `tsc -p tsconfig.test.json` OK; vitest selection-flow + skills-examples selection hijau; tes penuh tanpa kegagalan baru dibanding baseline Windows.
- **Risiko sisa:** tinggi varian awal lega bergantung pada execute perbaikan agen; heuristik penyesuaian lebar (row > 2 anak, 80% lebar) bisa butuh perbaikan dari temuan check; `literal` belum membandingkan nilai token.
