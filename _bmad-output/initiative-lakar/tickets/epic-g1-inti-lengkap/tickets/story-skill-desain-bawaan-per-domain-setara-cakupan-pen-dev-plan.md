---
title: 'Skill desain bawaan per domain setara cakupan pen.dev'
type: feature
ticket: 16
created: '2026-11-19'
status: in-progress
baseline_revision: '5e10f500e80399b98eb01d09c289952f45e331c1'
route: full
route_source: auto
risk: high
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/packages/skills/README.md', '{project-root}/bench/README.md']
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Skill Lakar saat ini dikelompokkan per jenis layar (`core`, `polish`, `landing`/`mobile`/`webapp`), bukan per domain desain. Akibatnya cakupannya tidak setara dengan daftar built-in design skills pen.dev (aksesibilitas, warna, interface, layout, tipografi, UI, penulisan, review antarmuka). Arahan Adam butir 1, 3, 4, dan 6 (disiplin geometri, karakter tipografi landing, review diri, dan copy) belum diajarkan. Contoh skill juga masih memicu temuan check G1 umum (`PENDING_2_10`).

**Approach:** Sesi baru (C7) memecah `polish` dan bagian lintas layar `core` menjadi delapan skill domain di `packages/skills/skills/`: `layout`, `typography`, `color`, `accessibility`, `ui`, `interface`, `writing`, dan `review`. Isinya dipindah tanpa duplikasi, lalu ditambah butir 1/3/4/6 dan aturan check G1 yang umum. Teks ditulis sendiri dari DESIGN.md dan sumber publik (WCAG 2.2, ui-skills). `polish` dihapus. Aturan muat (instruksi MCP + `read_skill`) dan batas token per skill ditetapkan. `screenshot` diberi `scale` 1|2. Buktinya seri polish dengan run pen.dev iterasi 1 yang dipakai ulang.

## Boundaries & Constraints

**Always:**
- C7 ketat: tidak membaca DESIGN.md Lampiran B, `golden-set.md`, `bench/rubric/**`, `judge-text*`, `bench/protocol/prompts.json`, `bench/round-*`, `score-*`, `rejudge-*`, `design/golden-set-lakar/`, fixture `packages/daemon/test/fixtures/golden/`, atau teks prompt A–E/latihan. Output `practice --dry-run` disaring (hanya baris status/masalah/biaya). Skill tanpa rubrik, kriteria golden, atau nama produk prompt.
- C1: tidak membaca/menyalin skill pen.dev, tidak memanggil MCP pencil/pen-headless; atribusi sumber publik hanya di `packages/skills/README.md`.
- Setiap aturan yang dipindah tetap diajarkan tepat sekali (core, domain, atau jenis layar). Prelude `core.md` dan baris `Font terpasang` byte-identik.
- Semua blok js skill lulus 0 error / 0 gerbang / 0 warning. `PENDING_2_10` hanya menyisakan entri `api.md`. LC-07 = 0 di semua contoh.
- C8: satu run per alat per prompt per iterasi, tanpa memilih run terbaik; pen.dev hanya dipakai ulang (`--reuse-pendev 1`). C9: tanpa daemon/port tambahan; restart hanya `systemctl --user restart lakard` (atau oleh harness); `/opt/node-26/bin/{node,pnpm}`; `/usr/bin/node` tetap v22; tanpa proses tertinggal. Key Unsplash tidak dicetak.
- Laporan `bench/polish-<k>.md|json` hanya dari harness; catatan builder masuk LOG dan plan.

**Never:**
- Fondasi UI library (shadcn/ui); motion/transitions (output statis).
- Pola G1 khusus milik 2.10: alur form/checkout mobile (stepper, radio-card, bilah aksi), tabel + panel detail gelap, foto per konteks. Di 2.16 hanya aturan komponen umum.
- Melonggarkan penjaga harness (C7, preflight rubrik, md5 `.pen`, reuse lengkap, gerbang waktu/emoji/gate). Run pen.dev baru. Restart pen-desktop. Menyunting laporan harness.
- Mengubah `api.md` (dihasilkan dari `@lakar/exec`). Entri PENDING-nya menunggu 2.10.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Daftar skill | `read_skill` tanpa nama | 14 skill: core, landing, mobile, webapp, layout, typography, color, accessibility, ui, interface, writing, review, icons, api (tanpa polish) | — |
| Nama lama | `read_skill {name:'polish'}` | NOT_FOUND + daftar tersedia | — |
| Muat per layar | instruksi MCP | core + 8 domain + 1 skill layar paralel di satu giliran; total ≤ 11.500 token per jenis layar | Lewat batas → padatkan, jangan naikkan |
| Screenshot zoom | `screenshot {nodeId, scale:2}` | PNG 2× piksel bounds node | scale lain → SCHEMA_INVALID |
| Iterasi 5 gagal | keputusan turun dari polish-4 atau rasio > 1,5 | analisis, revisi, iterasi 6 (terakhir) | biaya kumulatif story > $12 → berhenti, blocked |

</intent-contract>

## Code Map

- `packages/skills/skills/polish.md` -- dihapus. Bagiannya pindah: Struktur dan jarak → `layout`; Komponen + contoh daftar pinjaman → `ui`; Tipografi → `typography` (tanda baca → `writing`); Warna dan kontras + Bidang efek → `color` (angka ambang → `accessibility`); Kekayaan informasi → `interface`; Tanda slop visual + Kritik diri → `review`; tanda slop copy + baris `Frasa terlarang (kata utuh):` → `writing`.
- `packages/skills/skills/core.md` -- tetap memuat Alur kerja (langkah 1 = aturan muat baru, langkah 6 merujuk `review`), Prelude, Prinsip 1/2/4, Proses anti-slop, Ringkasan akhir, Arketipe, Token ringkas (tanpa paragraf "Peran warna" → `color`), Struktur dan nama, Fakta teknis. Pindah keluar: Prinsip 3 → `writing`, Prinsip 5 → `interface`, Komponen → `ui`, 12 anti-pattern → `review`.
- `packages/skills/skills/{layout,typography,color,accessibility,ui,interface,writing,review}.md` -- baru, judul `# Lakar: <domain>`.
- `packages/skills/skills/{landing,mobile,webapp,icons}.md` -- pointer `polish` → domain. Landing: momen angka besar + seksi kontras + tanpa ruang kosong mati (butir 3). Contoh diperbaiki (lihat Design Notes).
- `packages/skills/src/index.ts` `SKILL_NAMES` -- 14 nama; `README.md` -- daftar + atribusi dipindah ke file tujuan.
- `tests/skills.test.ts` `LIMITS` -- batas baru + tes total per jenis layar. `tests/skills-c7.test.ts` -- daftar file. `tests/content-rules.test.ts` + `packages/schema/src/content-rules.ts` (komentar) -- sumber frasa = `writing.md`.
- `packages/daemon/src/skills-examples.test.ts` -- `PENDING_2_10`: hapus entri landing/mobile/webapp/icons.
- `packages/daemon/src/server.ts` `ScreenshotBody` (+`scale`, l.121, `/screenshot` l.449–474; `render.screenshot(doc, id, {scale, nodeId})` sudah ada, lihat `/export` l.530) + tes daemon; `packages/daemon/src/photos/service.ts:525` hint → `interface`; `packages/daemon/src/pool.test.ts:462`.
- `packages/mcp/src/server.ts` -- `READ_SKILL_DESCRIPTION`, `SERVER_INSTRUCTIONS`, deskripsi + schema `screenshot` (`scale`), `describe` nama `read_skill`; `packages/mcp/src/index.test.ts` l.122/196–205/304/615–627.
- `bench/src/practice/main.ts` `POLISH_SERIES` -- `maxIter` 5 → 6, `budgetUsd` 30,24 → 34,58 (= $22,58 terpakai + $12 story 2.16), komentar keputusan; `bench/src/practice/practice.test.ts` l.327; `bench/README.md` §Seri polish.
- `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` (di-exclude git; cadangan di scratchpad) -- hanya §Turunan (daftar skill + batas) dan §Pola per jenis layar kalimat pembuka.
- `bench/practice/LOG.md` -- §2.16.

## Tasks & Acceptance

**Execution:**
- [x] scratchpad `tokens.mjs` -- ukur token sebelum/sesudah (`estimateTokens`/`splitCode`) -- tabel bukti.
- [x] `packages/skills/skills/*.md` -- pindahkan isi sesuai Code Map, tulis tambahan per domain (Design Notes), hapus `polish.md`, perbarui pointer -- satu tempat per aturan.
- [x] contoh `landing.md`, `mobile.md`, `webapp.md`, `icons.md` -- perbaikan PENDING (Design Notes) -- 0/0/0 tanpa pengecualian.
- [x] `packages/skills/src/index.ts`, `README.md`, tes skill, c7, content-rules, `skills-examples.test.ts` -- nama, batas, sumber frasa, PENDING.
- [x] daemon `/screenshot` + MCP `screenshot` `scale` + deskripsi/instruksi MCP + tes -- review zoom (butir 4) dan aturan muat.
- [x] `bench/src/practice/main.ts` + tes + README -- polish maks 6 iterasi, $34,58.
- [x] DESIGN.md §Turunan -- daftar skill baru.
- [x] build, tes terarah lalu `pnpm test`; PNG contoh (`LAKAR_SKILL_PNG_DIR`) diperiksa visual; commit di `g1`.
- [ ] `practice --series polish --iter 5 --reuse-pendev 1 --dry-run` (disaring) lalu run nyata; iterasi 6 hanya bila 5 turun dari polish-4 atau rasio > 1,5, dengan sisa anggaran story cukup.
- [ ] LOG §2.16 (token sebelum/sesudah per layar, tabel polish-4 vs iterasi, path PNG untuk penilaian cepat Adam) -- commit.
- [x] `tools/node26/verify.sh`; cek tidak ada proses tertinggal.

**Acceptance Criteria:**
- Given lakard sesudah restart, when `read_skill` dipanggil tanpa nama dan dengan tiap nama domain, then kedelapan skill domain tersedia, isinya sama dengan file, dan `polish` NOT_FOUND.
- Given skill baru, when `vitest run tests/skills.test.ts tests/skills-c7.test.ts tests/content-rules.test.ts` dijalankan, then lulus dengan batas per skill baru dan total per jenis layar ≤ 11.500.
- Given contoh skill, when `skills-examples.test.ts` dijalankan, then lulus 0/0/0, dan `PENDING_2_10` hanya berisi entri `api.md`.
- Given `bench/polish-5.md` (atau `-6`), when dibaca, then P7 dan P8 Setara/Lebih baik, P9 Lebih baik (tidak turun dari polish-4), rasio waktu ≤ 1,5, emoji 0, gate 0, pen.dev dipakai ulang dari iterasi 1, dan biaya story ≤ $12.
- Given akhir story, when `tools/node26/verify.sh` dijalankan, then lulus dan `/usr/bin/node` v22.

## Implementation Notes

Keputusan plan checkpoint (orkestrator, didelegasikan Adam, 2026-11-19):
1. Seri polish diperluas ke maks 6 iterasi dan anggaran kumulatif $34,58. Perubahan config dan alasannya dicatat di README, LOG, dan plan. Iterasi 6 hanya bila syarat plan terpenuhi. C8 tetap.
2. `polish.md` dihapus. Instruksi MCP, README skills, dan semua tes/rujukan `polish` diperbarui. Dipilih cara paling sederhana: `read_skill('polish')` memberi NOT_FOUND dengan pesan jelas "skill polish dipecah menjadi layout, typography, color, accessibility, ui, interface, writing, review" (bukan alias), lalu dites.
3. Token `badge.height-sm: 20px` ditambahkan di frontmatter DESIGN.md (di disk; cadangan di scratchpad), dan tes token (`tests/design-tokens.test.ts` / `packages/schema/src/design-tokens.ts` bila memetakan badge) diselaraskan.
4. Target: LC-07 = 0 dan 0 warning di semua contoh skill (selain entri `api.md` yang menunggu 2.10).
5. Seri latihan (dry-run dan run nyata) dijalankan **sesi utama**, bukan subagen implementasi. Subagen berhenti sesudah skill/kode/tes selesai dan di-commit, dan tidak pernah menjalankan proses di background.

## Plan Change Log

- 2026-11-19 (implementasi, subagen): Design Notes §Badge ("tanpa mengubah frontmatter") digantikan keputusan Implementation
  Notes 3: `badge.height-sm: 20px` ditambahkan di frontmatter DESIGN.md (cadangan sebelum: scratchpad sesi), dijaga tes baru
  di `tests/design-tokens.test.ts` (= prelude `Badge` sm 20 / md 24). DESIGN.md juga: rujukan `polish.md` di §Anti-pattern
  (sumber frasa terlarang) → `writing.md` agar tidak basi.
- Skill domain tanpa contoh (`layout`, `typography`, `color`, `accessibility`, `interface`, `writing`, `review`) diizinkan
  tanpa blok js di `skills-examples.test.ts` (`NO_EXAMPLES`, wajib 0 blok); `ui` membawa contoh daftar pinjaman.
- Elips peredam mobile memakai alpha `B3` (bukan `E6`) dan menutup semua teks kartu target (legenda seri juga di atas mesh);
  `color.md` menyebut rentang `B3`–`E6`.
- Insiden C7 kecil: satu `grep "badge"` pada DESIGN.md sempat menampilkan satu baris tabel Lampiran B (baris kriteria
  polesan warna & komponen). Tidak dipakai; isi skill terkait sudah ada sebelum story ini, dan sesudahnya semua akses DESIGN.md
  dibatasi baris < Lampiran B.

## Review Triage Log

## Design Notes

**Isi domain (baru = tambahan 2.16; selain itu dipindah):**
- `layout`: struktur/jarak polish, tabel proximity DESIGN, radius ≤ 3 nilai + konsentris. Baru (butir 1): sebelum menaruh elemen lebar tetap sebaris, hitung sisa = lebar isi − padding − gap × (n − 1); visual samping `width:'fill'` + `maxWidth`; padding bawah = atas; warning spacing dibereskan di execute perbaikan.
- `typography`: tipografi polish. Baru (butir 3): pasangan display + teks dipilih dari nada brief.
- `color`: peran warna core, warna polish, bidang efek. Teks di atas efek diletakkan di zona tenang dengan peredam yang terukur.
- `accessibility` (baru, WCAG 2.2 + §Ambang kontras): teks 4,5 / besar 3 (≥ 24, atau ≥ 18,66 tebal 700); batas kontrol `#7D8798` (gelap `#646B78`); ikon tanpa label; rating = bintang + nilai; scrim ≥ 0,5; target 44 (link teks = frame 44); minimum 12/16/14; status tidak hanya warna.
- `ui`: komponen core + polish + contoh daftar pinjaman, ditambah tabel umum (sel = frame, header 40, baris 56/44) dan form dasar (label atas, field 48, error).
- `interface`: prinsip 5 core + kekayaan informasi polish (keadaan, pembanding, bukti, foto gagal).
- `writing`: prinsip 3 core, tanda baca, slop copy, frasa terlarang. Baru (butir 6): angka saling konsisten lintas elemen, nama/lokasi Indonesia wajar dan beragam, tanpa frasa generik.
- `review`: 12 anti-pattern, tanda slop visual, kritik diri. Baru (butir 4): sesudah screenshot board, `screenshot({nodeId, scale:2})` area terpadat + 8 pertanyaan tetap, lalu satu execute perbaikan.

**Contoh (PENDING umum diselesaikan di 2.16):** webapp padding 10 → 8/12 dan `Input / Outlet` stroke `#7D8798`; mobile pil tab radius full (radius 8/20/24) dan `Link / Semua` frame tinggi 44; teks baris tabel landing/webapp dibungkus sel frame; scrim landing/mobile = elips peredam solid ber-blur di dalam `Crop /` di bawah teks; `icons.md` bintang + teks nilai. Entri `api.md` (LC-08 tanpa lineHeight, scrim) menunggu 2.10.

**Batas token (total; prosa bila ada contoh):** core 3200, layout 1000, typography 800, color 1000, accessibility 700, ui 2600/1400, interface 700, writing 900, review 900; landing/mobile/webapp tetap. Perkiraan muat per layar: landing 9.114 → ±10.900, mobile 8.933 → ±10.700, webapp 8.764 → ±10.500 (+18–20%). Prefill tambahan ±2k token yang di-cache praktis tidak menambah waktu. Biaya waktu terutama dari langkah review zoom (+10–20 dtk). Ruang terkecil ada di P9: 204,5 dtk dari batas 242,9.

**Badge 20 vs token 24:** skill tetap memakai sm 20 di baris/tabel (LC-24) dan md 24 di header. Selisih dengan DESIGN.md dicatat sebagai usulan token `badge.height-sm: 20px` untuk keputusan Adam, tanpa mengubah frontmatter.

## Verification

**Commands:**
- `/opt/node-26/bin/pnpm build && /opt/node-26/bin/pnpm exec vitest run tests/skills.test.ts tests/skills-c7.test.ts tests/content-rules.test.ts` -- expected: lulus
- `LAKAR_SKILL_PNG_DIR=<scratchpad>/png /opt/node-26/bin/pnpm exec vitest run packages/daemon/src/skills-examples.test.ts` -- expected: 0/0/0, PNG tanpa luberan
- `/opt/node-26/bin/pnpm exec vitest run packages/mcp packages/daemon bench/src/practice` -- expected: lulus
- `/opt/node-26/bin/pnpm test` -- expected: lulus (flake latensi `packages/render/test/visual.test.ts` diulang sendiri)
- `/opt/node-26/bin/node bench/dist/cli.js practice --series polish --iter 5 --reuse-pendev 1 --dry-run 2>&1 | grep -E "masalah|preflight|biaya|anggaran|reuse|Abort"` -- expected: preflight lulus, perkiraan ≤ $12
- `tools/node26/verify.sh` -- expected: lulus

## Auto Run Result

- **Status:** skill/kode/tes selesai dan di-commit di `g1` (subagen implementasi). Belum: dry-run + run nyata
  `practice --series polish --iter 5 --reuse-pendev 1` (sesi utama, Implementation Notes 5), lalu LOG §2.16 bagian seri
  (tabel polish-4 vs iterasi 5/6, path PNG). LOG §2.16 bagian pemecahan skill + token sudah ditulis.
- **Token muat per layar:** landing 9.114 → 10.728, mobile 8.933 → 10.425, webapp 8.764 → 10.186 (batas 11.500).
- **Verifikasi:** `pnpm build`; vitest terarah (skills, c7, content-rules, design-tokens, mcp, daemon, bench practice) lulus;
  `skills-examples.test.ts` 0/0/0 dengan PENDING hanya `api.md`, PNG contoh diperiksa visual; `pnpm test` lulus kecuali flake
  latensi `visual.test.ts` (lulus saat diulang sendiri); lakard di-restart (`systemctl --user restart lakard`): 14 skill
  tersedia, isi 8 domain = file, `polish` NOT_FOUND dengan pesan pemecahan; `tools/node26/verify.sh` lulus, `/usr/bin/node`
  v22.23.5, tanpa proses tes tertinggal.
