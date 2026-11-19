---
title: 'Skill G0 dibaca agen lewat read_skill'
type: feature
ticket: '13'
created: '2026-11-18'
status: built
baseline_revision: 'fb9fd08579df2e0269c78117dbb0884d264653ad'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-pool-render-hangat-tool-mcp-v1-lengkap-dan-lakard-sebagai-se-plan.md'
  - '{project-root}/packages/exec/src/api.ts'
  - '{project-root}/packages/mcp/src/server.ts'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `read_skill` (story 12) sudah ada tetapi `packages/skills/skills/` kosong: agen desain tidak punya panduan proses, gaya, struktur board, maupun referensi API selain deskripsi tool. Skill ini yang paling menentukan mutu dan waktu hasil Lakar (target: waktu ≤ 1,5× baseline median 167 dtk landing / 131 dtk mobile, visual setara atau lebih baik).

**Approach:** Tulis `core.md`, `landing.md`, `mobile.md`, `icons.md` dari DESIGN.md (§Turunan) + aturan perilaku EXPERIENCE.md, dan hasilkan `api.md` dari `packages/exec/src/api.ts`. Skill mengajarkan proses efisien (sedikit `execute` besar terstruktur memakai prelude helper ringkas) dan pola visual konkret. Setiap blok kode dijalankan di tes terhadap daemon nyata (0 error, 0 warning); penjaga C7 memastikan tidak ada kriteria/rubrik/prompt yang bocor.

## Boundaries & Constraints

**Always:**
- **Sumber isi:** `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` baris 1–489 SAJA (frontmatter token, Brand & Style, Proses anti-slop, Arketipe, Colors, Typography, Layout, Struktur, Konvensi nama, Pola landing/mobile, Elevation, Shapes, Components, Ikon, Do/Don't, Anti-pattern, Lampiran A sebagai pengetahuan) + EXPERIENCE.md §Component Patterns, kolom Perlakuan §State Patterns, §Interaction Primitives (baris 35–90). Tulis ulang dengan kata sendiri, padat, imperatif, bahasa Indonesia. Jangan menyalin teks/panduan pen.dev.
- **C7 (keras):** implementer TIDAK membuka `ux-lakar/golden-set.md`, `ux-lakar/review-rubric.md`, DESIGN.md §Lampiran B (baris ≥ 490), `bench/protocol/prompts.json`, `design/*.pen`. Skill tidak memuat kata rubrik/juri/kriteria/golden/skor/benchmark/pen.dev/pencil/"Lampiran B", label `R1`–`R8`, nama produk prompt bench (`Kasku`, `Gerak`), dan contoh di EXPERIENCE.md yang menyebut produk itu. Contoh produk di skill = produk fiktif umum yang berbeda per contoh (mis. kopi, klinik, kursus).
- **Isi skill (urutan prioritas):**
  - `core.md` (≤ 4.000 token total, termasuk kode): (1) **alur kerja cepat** — `read_skill core` + skill jenis layar (+ `api` hanya bila perlu); rencanakan konten & langkah khas di kepala lalu langsung `open_doc`; bangun dengan 2–4 `execute` besar (landing: board + token + 2–3 seksi per execute; mobile: 1–2 execute), setiap execute diawali prelude, simpan ID penting di `keep`; baca `check` di respons execute (itulah layout_check per seksi — jangan panggil layout_check terpisah per seksi); perbaiki error dengan `execute({editId, edits})` atau `update` pada node yang ada (jangan hapus lalu bangun ulang; maks 3 percobaan per error, lalu berhenti dengan board tetap `[WIP] `); akhir: 1 `screenshot` untuk kritik diri → 1 execute perbaikan + lepas prefiks `[WIP] ` → `export` PNG → ringkasan. Jangan bertanya di mode tanpa interaksi. (2) prinsip & proses anti-slop 6 langkah dengan artefak blok `proses:`; (3) kontrak ringkasan (board+ukuran, arketipe, hasil check + alasan tiap warning, path PNG, waktu, `proses:`); (4) arketipe (tabel 5 baris: font/netral/radius/elevasi); (5) token ringkas: palet netral terang/gelap + aksen + on-accent, skala tipografi (size/lineHeight/weight/letterSpacing dalam **em**), spacing grid 8, radius, elevasi; (6) konvensi nama board `[WIP] Produk / Layar · <landing|app|mobile> · <Arketipe>` dan prefiks layer (`Seksi /`, `Overlay /`, `Crop /`, `Scroll /`, `Ekstra /`, `Button /`, `Input /`, `Tab /`, `KPI / Nilai`, `Display /`, …); (7) 12 anti-pattern + frasa terlarang id/en (dibahasakan ulang); (8) fakta teknis dari carry-notes: karakter di luar latin/latin-ext di teks (→ ✓ ★ emoji, dsb.) → FONT_MISSING/LC-01 → pakai node `icon`; nama ikon di field `icon` (bukan `name`); alamat op hanya ID 8 karakter; 8 keluarga font tersedia (Inter default, Plus Jakarta Sans, JetBrains Mono, Manrope, IBM Plex Mono, Bricolage Grotesque, DM Sans, DM Mono — cek weight tersedia lewat `curl` ke registry/`status` sebelum menulis skala). Angka yang dicek mesin (ambang LC) tidak diulang.
  - **Prelude** (satu blok di `core.md`, baris pertama `// prelude`): helper ≤ ~25 baris yang membuat snippet pendek — mis. `F(parent,name,props)` frame, `T(parent,name,content,role,props)` teks dengan preset peran skala tipografi (display/h1/h2/h3/h4/body-lg/body/body-sm/label/caption/overline) + keluarga heading/body, `I(parent,icon,size,color,props)` ikon lucide, `Btn(...)` tombol primer/sekunder bernama `Button / …`, plus objek palet `C` dan `FONT` yang diganti per arketipe. Helper hanya memanggil fungsi API publik.
  - `landing.md` dan `mobile.md`: prosa (di luar blok kode) ≤ 1.500 token; total file ≤ 3.500 token. Isi: pola struktur board (landing 1440 × bebas: wrapper column, navbar 72, hero ≥ 640 dengan visual menyatu, header seksi, ritme antar-seksi, kartu fitur, testimoni, pricing, CTA penutup, footer; mobile 390 × 844: status bar 54, satu wrapper ber-padding 20, header, kartu/list, tab bar `Overlay /` atau bilah bawah, home indicator 34, pola layar panjang dua board) + **contoh kode teruji** yang memakai prelude: landing = board + navbar + hero + satu seksi fitur dengan ritme (bukan 3 kartu identik); mobile = layar beranda lengkap dengan status bar, header, kartu ringkasan, ring dari ellipse arc, list, tab bar mengambang. Contoh harus terlihat seperti kerja desainer produk senior (hierarki tegas, ruang lega, satu aksen) — periksa PNG-nya sendiri.
  - `icons.md`: cara cari (`icon_search`/`iconSearch`), aturan pustaka (lucide UI, simple-icons khusus logo brand, satu pustaka UI per board), ukuran 16/20/24/32 + stroke 2, ikon dalam wadah tint 24/48, `filled:true` untuk bintang rating, tabel ~80 konsep → nama kanonik lucide 1.74 terpasang (setiap nama di tabel diverifikasi ada di katalog lewat tes), alias lama → kanonik, logo pembayaran lokal sebagai teks/badge.
  - `api.md`: DIHASILKAN dari `api.ts` (AD-12) — fungsi `API` (signature, doc, returns, errors, contoh), `API_GLOBALS`, plus referensi node/properti yang dipindah/ditambahkan ke `api.ts` sebagai data terstruktur ber-contoh: katalog 7 tipe + properti, sizing fixed/hug/fill + min/max, default wrap teks, padding bentuk, `position:'absolute'` + x/y, cat (fills[0] lapisan terbawah; sudut linear ala CSS 0 = atas searah jarum jam; radial radius relatif box default 0.5), stroke, radius, shadow/blur ala CSS box-shadow, rotasi searah jarum jam, keterbatasan (spread/inner shadow/stroke sides tidak didukung pada ellipse arc & path; path tanpa width/height memakai viewBox), token `{$token}`, bentuk respons execute + `check`/`bounds`, `editId/edits`, kode error. Doc "Urut skor" diganti "urut relevansi".
- **Contoh teruji:** setiap blok ```js di kelima file dijalankan lewat HTTP daemon nyata (`startDaemon` + Chromium, pola `packages/daemon/src/index.test.ts`): satu dokumen + sesi baru per file skill; blok dijalankan berurutan (boleh memakai `keep` dari blok sebelumnya); blok yang baris pertamanya `// pakai prelude` dijalankan dengan blok prelude `core.md` di depannya; setiap blok wajib sukses dengan `check.summary` error 0, gate 0, warning 0. Blok `api.md` masing-masing di dokumen kosong baru. Blok non-eksekusi memakai pagar ```text. Tidak ada blok yang dilewati.
- MCP: `McpServer` diberi `instructions` singkat (mulai dengan `read_skill core` lalu skill jenis layar; bangun lewat sedikit execute besar) bila SDK mendukung; `READ_SKILL_DESCRIPTION` menyarankan urutan baca. Tetap lolos `tests/check-c7.test.ts` dan `tests/execute-description.test.ts`.
- C9: Node via `/opt/node-26/bin/{node,pnpm}`; tanpa dependensi baru; tanpa apt/npm global/Docker/`~/.cache/ms-playwright`/Penpot/konfigurasi Claude global; jangan sentuh chrome-headless-shell aplikasi lain; service lakard tetap berjalan (restart hanya `systemctl --user restart lakard` setelah build, pastikan active). `.git/info/exclude` tidak diubah. Arah dependensi tetap (`skills` tanpa dependensi @lakar).

**Never:**
- Membaca/menyalin kriteria golden set, rubrik, prompt bench, atau teks pen.dev; menyebut prompt bench secara spesifik.
- `webapp.md` (G1), aturan check baru, perubahan kontrak/enum AD-11, skip tes diam-diam.
- Push, merge, tag git.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Daftar skill | MCP `read_skill` tanpa name | kelima nama `available:true` | — |
| Baca skill | `read_skill {name}` untuk tiap nama | isi Markdown file itu | nama lain → NOT_FOUND (perilaku lama) |
| Contoh skill | setiap blok ```js | execute sukses, error 0 / gate 0 / warning 0 | gagal → tes menyebut file + nomor blok + temuan |
| api.md basi | `api.ts` berubah tanpa regenerasi | tes drift gagal dengan perintah regenerasi | — |
| Bocor C7 | skill memuat n-gram 6 kata dari Kriteria target/§Prosedur/§Risiko golden-set, Lampiran B DESIGN.md, atau prompts.json, atau token terlarang | tes gagal menyebut frasa + file | file sumber tidak ada → tes GAGAL kecuali env `LAKAR_C7_ALLOW_MISSING_SOURCES=1` (eksplisit, dicetak) |
| Batas token | core > 4.000; prosa landing/mobile > 1.500 atau total > 3.500 | tes gagal menyebut angka | — |
| Nama ikon | setiap nama di tabel `icons.md` | ada di katalog lucide/simple-icons terpasang | nama tak ada → tes gagal |

</intent-contract>

## Code Map

- `packages/skills/skills/{core,landing,mobile,icons,api}.md` -- baru; dibaca `readSkill` (`packages/skills/src/index.ts`, `SKILLS_DIR`), sudah di luar dist.
- `packages/skills/src/index.ts` -- tambah `estimateTokens(text)` = `Math.ceil(text.length / 3.2)` (perkiraan konservatif, terdokumentasi) dan `splitCode(md)` (blok ```js vs prosa) bila berguna untuk tes; tanpa dependensi @lakar.
- `packages/exec/src/api.ts` -- sumber tunggal API: ubah "Urut skor" → "urut relevansi" (JSDoc + doc); tambah data dokumentasi node/properti/respons ber-contoh (mis. `API_REFERENCE`); boleh file baru `packages/exec/src/api-md.ts` yang mengekspor `renderApiMarkdown(): string` (murni, tanpa IO), diekspor dari `packages/exec/src/index.ts`.
- `scripts/gen-skill-api.mjs` (baru) -- impor `packages/exec/dist` → tulis `packages/skills/skills/api.md`; dijalankan setelah `pnpm build`.
- `bench/src/protocol.ts` -- `forbiddenSources`, `words`, `NGRAM`, `MIN_SENTENCE_WORDS`, `extractGoldenPrompt` sudah ada; ekspor `forbiddenPhrases` (sekarang privat) untuk dipakai ulang. Jangan ubah perilaku checkC7 (tes bench harus tetap lulus).
- `tests/skills-c7.test.ts` (baru) -- penjaga C7 skill: sumber = forbiddenSources(golden-set, ['A','B']) + teks DESIGN.md dari `## Lampiran B` sampai akhir + kedua prompt `bench/protocol/prompts.json`; token terlarang `/rubrik|\bjuri\b|kriteria|golden|\bskor|benchmark|pen\.dev|pencil|Lampiran B/i`, `/\bR[1-8]\b/`, `/\bKasku\b|\bGerak\b/`. Termasuk tes negatif (teks sintetis berisi satu n-gram sumber → terdeteksi) agar penjaga terbukti hidup. Tes ini boleh membaca file terlarang (penjaga), implementer tidak mencetak isinya.
- `tests/skills.test.ts` (baru) -- batas token, drift `api.md` == `renderApiMarkdown()`, nama ikon tabel `icons.md` ada di katalog (`@lakar/icons` `IconCatalog`), struktur (prelude ada, semua blok ```js/```text).
- `packages/daemon/src/skills-examples.test.ts` (baru) -- jalankan semua blok skill lewat `startDaemon` (port 0, dataDir tmp, `browsersPath` seperti `index.test.ts`; skip bila Chromium tidak terpasang HANYA dengan peringatan yang sama seperti index.test.ts) sesuai aturan Contoh teruji; tulis PNG tiap board contoh ke dir tmp bila env `LAKAR_SKILL_PNG_DIR` diset (untuk pemeriksaan visual).
- `packages/mcp/src/server.ts` (+ `index.test.ts`) -- `instructions`, `READ_SKILL_DESCRIPTION`; tes integrasi MCP yang ada (daemon `dist/main.js`, `LAKAR_PORT=0`): `read_skill` tanpa name → 5 available; tiap nama → isi diawali judul Markdown.
- Referensi perilaku: `packages/render/src/layout.ts` (default sizing/wrap teks, `textWrap`), `packages/daemon/src/fonts.ts` (weight tersedia), `packages/check/src/rules.ts` (LC yang aktif di G0), `packages/schema/src/nodes.ts` (skema properti).
- Penjaga yang harus tetap hijau: `tests/check-c7.test.ts`, `tests/execute-description.test.ts`, `tests/dependency-direction.test.ts`, `bench/src/protocol.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/exec/src/{api,api-md,index}.ts` -- data referensi node/properti/respons + `renderApiMarkdown()`; "urut relevansi" -- sumber api.md (AD-12).
- [x] `scripts/gen-skill-api.mjs`, `packages/skills/skills/api.md` -- generator + hasil.
- [x] `packages/skills/skills/{core,landing,mobile,icons}.md`, `packages/skills/src/index.ts` -- isi skill + `estimateTokens`.
- [x] `bench/src/protocol.ts`, `tests/skills-c7.test.ts`, `tests/skills.test.ts` -- penjaga C7, batas token, drift, ikon.
- [x] `packages/daemon/src/skills-examples.test.ts` -- semua contoh dijalankan terhadap daemon nyata.
- [x] `packages/mcp/src/{server,index.test}.ts` -- instructions + read_skill 5 skill.
- [x] Mesin: `pnpm build`, regenerasi api.md, `systemctl --user restart lakard` (pastikan active, `/status` versi 0.1.0, pool ready 2).
- [x] Smoke test (satu run): lihat Verification.

**Acceptance Criteria:**
- Given service lakard terbaru, when tool MCP `read_skill` dipanggil tanpa name lalu dengan tiap nama, then kelima skill tersedia dan isinya sama dengan file di `packages/skills/skills/`.
- Given `pnpm test`, then semua contoh skill dijalankan terhadap daemon nyata dengan 0 error/0 warning, penjaga C7 skill + batas token + drift api.md lulus, 0 skip.
- Given `grep -niE 'rubrik|juri|kriteria|golden|skor|\bR[1-8]\b' packages/skills/skills/*.md`, then kosong.
- Given satu run `claude -p` umum (mobile, bukan prompt bench) dengan `--strict-mcp-config --mcp-config /root/lakar/.mcp.json`, then transkrip memperlihatkan `read_skill` dibaca sebelum execute pertama, board akhir 0 error gerbang, dan PNG hasilnya diperiksa secara visual.

## Implementation Notes

- `API_REFERENCE` (8 bagian: katalog node, sizing, padding/posisi, cat/stroke/radius, efek, token, respons execute, kode error) di `api.ts`; `renderApiMarkdown()` di `api-md.ts` (diekspor `@lakar/exec`); `scripts/gen-skill-api.mjs` menulis `api.md` dari dist. "Urut skor" → "Urut relevansi" (JSDoc + doc).
- Prelude `core.md`: `C`, `FONT`, `TY` (15 peran, letterSpacing em), `F` (kolom), `Row`, `T`, `I`, `Btn`, `fill`, `line`; ganti arketipe dengan `Object.assign(C|FONT, …)` setelah prelude (helper membaca nilai saat dipanggil). Blok prelude sendiri dijalankan di tes (sukses, tanpa op mutasi → tanpa check); blok lain wajib check 0/0/0.
- Contoh: landing "Biji Pagi" (Jernih, 3 blok: board+navbar+hero dengan `Crop / Dasbor`; seksi bento; execute penutup tinggi 1780 + lepas `[WIP] `), mobile "Tutur" (Ramah, kursus bahasa: status bar, header, kartu ring 3/5 = 216°, list 4 item, tab bar `Overlay /`, home indicator), icons (wadah tint, bintang terisi, logo brand, iconSearch). PNG diperiksa visual.
- `icons.md`: 117 konsep → nama kanonik lucide 1.74 (mis. `circle-exclamation-point`, `triangle-exclamation-point`, `circle-question-mark`, `building-complex`, `trash`, `pen`); `pencil` dihindari karena token C7 terlarang. LinkedIn tidak ada di simple-icons 16.38.
- Weight font tidak bisa dicek agen lewat `status` (hanya keluarga); `core.md` mencantumkan rentang weight per keluarga, dikunci tes terhadap `FontRegistry`.
- `bench/src/protocol.ts`: hanya `forbiddenPhrases` diekspor (perilaku checkC7 tetap). Tes MCP tidak mengimpor `@lakar/skills` (arah dependensi mcp → schema); membaca file skill langsung.
- Token (chars/3.2): core 3.255; landing 2.593 (prosa 862); mobile 1.851 (prosa 739).
- Smoke test (1 run, `claude -p` mobile peminjaman buku perpustakaan kampus, wrapper netral, `--tools ""`): 55,6 dtk, $0,40, 8 turn; urutan `read_skill core` → `read_skill mobile` → `open_doc` → 2 execute (execute 1: error LC-20 konten tertutup tab bar; execute 2 memperbaiki + lepas `[WIP] `, 0/0) → screenshot → export; ringkasan memuat `proses:` lengkap tetapi tidak menyebut waktu total. Temuan → skill: `mobile.md` anggaran tinggi ±680 di atas tab bar; `core.md` placeholder gambar = tint, bukan blok warna-warni (sampul buku berwarna-warni di hasil).

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 7 findings — high 0, medium 0, low 7, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` `tests/skills-c7.test.ts`: dengan `LAKAR_C7_ALLOW_MISSING_SOURCES=1` dan SEMUA sumber hilang, tes "penjaga hidup" tetap gagal (phrases kosong) — patch: cek n-gram hanya bila `phrases.size > 0`, selain itu wajib `ALLOW_MISSING` (penerapan oleh orkestrator; re-engage implementer tidak sinkron).
  - `[low]` `[reject]` `loadProtocol()` melempar bila `wrapper.txt`/`protocol.json` hilang sebelum penanganan sumber hilang — kedua file di-commit dan dikunci hash protokol; perbaikan menambah cabang.
  - `[low]` `[patch]` `api.ts` API_REFERENCE menulis 5000 op / 2 detik sebagai angka mati — patch: `DEFAULT_TIMEOUT_MS` dipindah ke `api.ts` (diimpor `index.ts`), teks memakai `${MAX_OPS}` dan `${DEFAULT_TIMEOUT_MS/1000}`; api.md diregenerasi. "maks 60" bounds milik daemon (arah dependensi melarang impor) dibiarkan.
  - `[low]` `[patch]` `core.md` mengulang batas mesin "Crop maks 2" — patch: angka dihapus.
  - `[low]` `[patch]` `core.md` tint 8% vs badge "tint 10%" membingungkan — patch: badge = tint aksen alpha `1A`.
  - `[low]` `[patch]` contoh landing menamai headline 48 `Display / Headline` padahal `Display /` khusus 72/80 — patch: nama `Headline`.
  - `[low]` `[patch]` `estimateTokens` menghitung code point, plan menyebut `text.length` — patch: `text.length` (unit UTF-16, ≥ code point, lebih konservatif); tes diperbarui.

## Design Notes

- **Batas token:** DESIGN.md §Turunan membatasi core ≤ 4k dan skill jenis layar ≤ 1,5k. Contoh kode teruji wajib (AD-12), jadi untuk landing/mobile batas 1,5k berlaku pada prosa; total file dibatasi 3,5k agar tetap ringan. core dibatasi total (termasuk prelude). Estimator `chars/3.2` sengaja konservatif untuk teks Indonesia + kode.
- **Kenapa prelude:** waktu agen didominasi token keluaran. Helper preset tipografi/warna memangkas tiap snippet ~50% dan sekaligus memaksa skala token. `keep` hanya JSON, jadi helper diulang di awal tiap execute (pendek).
- **Kenapa contoh lewat daemon, bukan sandbox exec saja:** syarat "0 error gerbang" butuh render + check nyata (LC-01/02a/05/20, FONT_MISSING).
- Sketsa prelude (implementer menyempurnakan & mengujinya):
  ```text
  // prelude
  const C={bg:'#FFFFFF',sub:'#F6F7F9',line:'#E4E7EC',t1:'#101828',t2:'#475467',t3:'#667085',acc:'#2563EB',on:'#FFFFFF'};
  const FONT={h:'Plus Jakarta Sans',b:'Inter'};
  const TY={h1:{size:40,lineHeight:48,weight:700,letterSpacing:-0.015,family:FONT.h}, body:{size:16,lineHeight:24,weight:400,family:FONT.b}, …};
  const F=(p,name,o={})=>add(p,{type:'frame',name,...o});
  const T=(p,name,content,r='body',o={})=>add(p,{type:'text',name,content,color:C.t1,...TY[r],...o});
  const I=(p,icon,size=20,color=C.t2,o={})=>add(p,{type:'icon',lib:'lucide',icon,size,color,...o});
  ```

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm build && /opt/node-26/bin/node scripts/gen-skill-api.mjs && git diff --exit-code packages/skills/skills/api.md` -- expected: exit 0 (api.md sudah mutakhir)
- `cd /root/lakar && /opt/node-26/bin/pnpm test` -- expected: exit 0, 0 skip (termasuk skills-examples, skills-c7, skills, check-c7, execute-description, protocol)
- `cd /root/lakar && grep -niE 'rubrik|juri|kriteria|golden|skor|benchmark|pen\.dev|\bR[1-8]\b|kasku' packages/skills/skills/*.md` -- expected: tidak ada keluaran
- `systemctl --user restart lakard && systemctl --user is-active lakard && curl -s 127.0.0.1:7466/status` -- expected: active, pool ready 2
- `cd /root/lakar && bash tools/node26/verify.sh` -- expected: exit 0

**Manual checks (if no CLI):**
- Jalankan tes contoh dengan `LAKAR_SKILL_PNG_DIR=<scratch>` lalu lihat PNG contoh landing dan mobile (Read gambar): hierarki jelas, satu aksen, tidak ada teks terpotong/yatim, ritme seksi tidak monoton. Perbaiki skill bila jelek.
- Smoke test SATU run (anggaran gabungan story ≤ $1): `cd <scratch> && claude -p "<prompt mobile umum, mis. layar beranda aplikasi peminjaman buku perpustakaan kampus 390×844>" --strict-mcp-config --mcp-config /root/lakar/.mcp.json --tools "" --max-budget-usd 0.6 --output-format stream-json --verbose` dengan pembungkus netral setara `bench/protocol/wrapper.txt`. Catat waktu, biaya, jumlah execute, apakah read_skill dibaca dulu, ringkasan `proses:`, 0 error gerbang; `export` PNG lalu lihat. Temuan → perbaiki skill; implementer TIDAK menjalankan run kedua (sisa anggaran dipakai orkestrator story untuk verifikasi).

## Auto Run Result

- **Status:** built.
- **Ringkasan:** lima skill G0 di `packages/skills/skills/`: `core.md` (alur kerja cepat 2–4 execute besar + prelude helper F/Row/T/I/Btn + palet/tipografi, prinsip, proses anti-slop + blok `proses:`, kontrak ringkasan, arketipe + weight font terpasang, token ringkas, konvensi nama, komponen, 12 anti-pattern + frasa terlarang, fakta teknis), `landing.md` (struktur + 3 blok teruji), `mobile.md` (struktur, anggaran tinggi, layar panjang + 1 blok teruji), `icons.md` (117 konsep → nama kanonik lucide 1.74, alias, logo brand), `api.md` dihasilkan dari `api.ts` (`API_REFERENCE` + `renderApiMarkdown()` + `scripts/gen-skill-api.mjs`). MCP `instructions` + urutan baca di deskripsi `read_skill`.
- **File:** `packages/skills/skills/*.md` (baru); `packages/skills/src/{index,index.test}.ts` (`estimateTokens`, `splitCode`); `packages/exec/src/{api,api-md,index}.ts`; `scripts/gen-skill-api.mjs`; `bench/src/protocol.ts` (ekspor `forbiddenPhrases`); `tests/{skills,skills-c7}.test.ts`; `packages/daemon/src/skills-examples.test.ts`; `packages/mcp/src/{server,index,index.test}.ts`.
- **Review (quick):** 7 temuan — 6 patch (low), 0 defer, 1 reject (alasan di Review Triage Log).
- **Follow-up review:** `false` (patched: high 0, medium 0, low 6).
- **Verifikasi:** `pnpm build` exit 0; regenerasi api.md identik (tes drift); `pnpm test` 37 file / 608 tes lulus, 0 skip (semua blok js skill dijalankan di daemon nyata: 0 error/0 gerbang/0 warning); grep istilah terlarang di skill kosong; `systemctl --user restart lakard` → active, pool ready 2, service menyajikan isi skill terbaru; `tools/node26/verify.sh` exit 0. PNG contoh landing/mobile diperiksa visual.
- **Smoke test 2 (orkestrator, landing umum "laundry antar-jemput" 1440, wrapper netral, `--allowedTools mcp__lakar`):** 88 dtk, $0,62 (dihentikan `--max-budget-usd 0.5` saat `export`; run pertama tanpa `--allowedTools` ditolak izin, $0,05). Urutan: read_skill core + landing → open_doc → execute 1 (navbar, hero, cara kerja) → execute 2 SCHEMA_INVALID (padding pada teks) → perbaikan via editId/edits (harga, testimoni, footer) → export. layout_check 0/0/0, 1440×4400. Visual: kuat (hero dengan mockup pesanan menyatu, langkah bernomor 2 kolom, pricing tier unggulan gelap, testimoni asimetris, footer gelap). Kekurangan: agen melewatkan screenshot + execute penutup → headline hero yatim ("kamar"), judul pricing terpenggal ("antar-/jemput"), ±400 px kosong di bawah, prefiks `[WIP] ` sudah lepas. Patch skill: langkah 6 `core.md` dipertegas (wajib walau check bersih; check tidak melihat yatim/ruang kosong).
- **Biaya smoke total story:** $0,40 + $0,05 + $0,62 ≈ $1,07 (sedikit di atas $1 karena batas anggaran claude dicek per turn).
- **Risiko residual:** estimator token kasar (chars/3.2); contoh landing memakai tinggi akhir 1780 tetap (tes gagal bila render berubah); agen bisa tetap melewatkan langkah akhir walau dipertegas (belum diuji ulang); judul yatim tidak dicek mesin di G0; `status` tidak melaporkan weight font; dokumen uji `pustaka-kampus-beranda`, `lapak-cuci-landing` di `~/.local/share/lakar`.

