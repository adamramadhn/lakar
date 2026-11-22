---
title: 'Skill dipadatkan dan sidebar webapp selaras DESIGN.md'
type: refactor
ticket: 3
created: '2026-11-19'
status: built
baseline_revision: '725a282f0f86e5b8145ecaba1b3fa12e0e5fefde'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/packages/skills/README.md', '{project-root}/bench/README.md']
warnings: ['oversized']
deferred:
  - summary: >-
      Patch review skill (5 frasa kata baseline dipulihkan) tidak di-bench ulang; seri iterasi 4 menguji ac4961c.
    evidence: |-
      Patch hanya mengembalikan kata baseline 725a282 (sudah diuji di polish-3); story 2.4 merevisi skill dan menjalankan latihan lagi.
    location: >-
      packages/skills/skills/{core,landing,mobile,polish}.md
    severity: low
  - summary: >-
      Output practice --dry-run mencetak teks prompt latihan (argv agen); builder yang merevisi skill bisa melihatnya (C7).
    evidence: |-
      Dry-run iterasi 4 menampilkan argv Lakar berisi prompt P7-P9; builder 2.3 melihatnya setelah skill di-commit.
    location: >-
      bench/src/practice/main.ts (argvFor dengan prompt hasil render)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Batas token skill hampir penuh (core 3967/4000, landing prosa 1500/1500), sehingga revisi G1 (story 2.4) tidak punya ruang; aturan yang sama ditulis berulang di core/polish/landing/mobile/webapp. Sidebar `webapp.md` 240 tidak sesuai DESIGN.md §Web app/dashboard (248).

**Approach:** Sesi baru (C7) memadatkan kelima skill: setiap aturan lintas skill tinggal di satu tempat (core atau polish), skill jenis layar hanya menyimpan yang khas layarnya, prosa dirapatkan; perilaku yang diajarkan dan contoh kode tetap. Sidebar webapp 240 → 248 (prosa + contoh). Bukti: seri latihan polish iterasi 4 memakai ulang pen.dev iterasi 1 (`--reuse-pendev 1`, tanpa run pen.dev baru).

## Boundaries & Constraints

**Always:**
- `LIMITS` di `tests/skills.test.ts` tidak berubah; `tests/skills.test.ts`, `tests/skills-c7.test.ts`, dan contoh skill 0/0/0 (`packages/daemon/src/skills-examples.test.ts`) lulus.
- Setiap aturan yang dihapus dari satu skill masih diajarkan di skill lain yang dibaca di giliran yang sama (core + polish + jenis layar), atau di kode contoh. Hanya kalimat yang benar-benar duplikat atau dirapatkan.
- C7 ketat: tidak membaca Lampiran B, golden-set, `bench/rubric/**`, teks juri, prompts A–E/latihan, round/score/rejudge. Tidak ada rubrik/kriteria/nama produk prompt di skill.
- C8: satu run per alat per prompt per iterasi; tidak memilih run terbaik. C9: `/opt/node-26/bin/{node,pnpm}`, `/usr/bin/node` tetap v22.
- Seri: `--reuse-pendev 1` (iterasi 3 tidak punya run pen.dev P7 sah; polish-3 memakai iterasi 1 untuk P7–P9). Maks iterasi 4 dan 5, ≤ $12 total, kumulatif ≤ $30,24.
- Restart lakard hanya `systemctl --user restart lakard` (atau oleh harness). Key Unsplash tidak dicetak/dicatat.

**Never:**
- Menaikkan batas token, menghapus/mengubah perilaku kode contoh (kecuali sidebar 248 dan penyesuaian layout yang diperlukan), memanggil MCP pencil/pen.dev, restart pen-desktop, mengubah penjaga harness (rubrik, budget, C7).
- Revisi pola G1 lain (form/checkout, tabel + panel detail, warna delta menurut makna) — milik story 2.4.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Batas token | skill dipadatkan | core total ≤ ~3570 (≥ 10% ruang), landing prosa ≤ ~1350; semua ≤ LIMITS | Kurang hemat → padatkan lagi, bukan naikkan batas |
| Contoh webapp | sidebar 248 | blok js 0 error/0 gate/0 warning | Luber → sesuaikan lebar tetap lain di contoh |
| Seri iterasi 4 | `practice --series polish --iter 4 --reuse-pendev 1` | P7–P9 Setara/Lebih baik, rasio ≤ 1,5, emoji 0, gate 0 | Gagal → analisis pemadatan vs derau; iterasi 5 hanya bila pemadatan penyebabnya |
| Harness menolak | preflight rubrik/dry-run gagal | dicatat; penyesuaian sah tanpa melonggarkan penjaga | Tidak sah → blocked |

</intent-contract>

## Code Map

- `packages/skills/skills/core.md` -- alur, prelude (blok js `// prelude`, tidak diubah), prinsip, proses, arketipe, token, struktur/nama, komponen, anti-pattern. Baris `Font terpasang` dites terhadap registry: format `Nama 100–900` tetap.
- `packages/skills/skills/polish.md` -- tempat tunggal aturan polesan (struktur/jarak, komponen, tipografi, warna/kontras, kekayaan, slop, kritik diri). Ruang: total 2207/3200 → penerima aturan lintas layar (mis. resep bidang efek bersama, overline/"·", sorotan).
- `packages/skills/skills/landing.md` -- prosa 1500/1500, total 3486/3500; 3 blok js (hero, bento, update tinggi).
- `packages/skills/skills/mobile.md` -- prosa 1369, total 3176; 1 blok js (390×1114).
- `packages/skills/skills/webapp.md` -- prosa 930, total 2825; sidebar `width:240` di contoh dan "Sidebar 240" di prosa.
- `tests/skills.test.ts` -- `LIMITS` (read-only), struktur blok, font.
- `tests/skills-c7.test.ts` -- penjaga C7 (read-only).
- `packages/daemon/src/skills-examples.test.ts` -- contoh js 0/0/0 (`LAKAR_SKILL_PNG_DIR` untuk PNG).
- `bench/dist/cli.js practice` -- seri polish; laporan `bench/polish-4.md|json`, strip `bench/practice/polish/4/`.
- `bench/practice/LOG.md` -- log iterasi skill (tambah entri story 2.3).
- `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` §Web app/dashboard (baris ~352) -- sidebar 248 (hanya bagian ini dibaca).

Duplikasi yang ditemukan (sasaran pemadatan): bidang efek (core token + landing + mobile → satu resep di polish, khas layar tetap), kontras 4,5:1 (polish ↔ landing/mobile), overline maks 2 + "·" maks 2 (landing/mobile/polish slop), sorotan terang/gelap (core elevasi ↔ mobile), rating/avatar/logo/wadah ikon (core komponen ↔ landing/mobile), Badge md/arg ke-6 (core ↔ polish ↔ landing), keadaan daftar (core prinsip 5 ↔ mobile), foto `limit:12`/berbeda per butir/tile kategori (core ↔ mobile/landing), seri `C.data` + legenda (core ↔ mobile/webapp), kartu satu tinggi (dua kali di polish + landing), glow (dua kali di polish), alur execute mobile/webapp ↔ core langkah 3/6, kritik diri (core alur 6 ↔ proses 6 ↔ polish), pointer `webapp`/frasa terlarang/foto gagal di core.

## Tasks & Acceptance

**Execution:**
- [x] `packages/skills/skills/*.md` -- ukur token sebelum (script di scratchpad memakai `estimateTokens`/`splitCode`) -- baseline tabel.
- [x] `packages/skills/skills/polish.md` -- terima aturan lintas layar (resep bidang efek bersama, overline/"·", kartu satu tinggi sekali, glow sekali), rapatkan prosa -- satu tempat.
- [x] `packages/skills/skills/core.md` -- hapus duplikat internal dan pointer, rapatkan token/komponen/alur; prelude dan baris font tetap -- ≥ 10% ruang total.
- [x] `packages/skills/skills/landing.md` -- buang duplikat (kontras, overline, rating, logo, wadah ikon, arg ke-6, stretch, resep efek umum), rapatkan; kode tetap -- ≥ 10% ruang prosa.
- [x] `packages/skills/skills/mobile.md` -- buang duplikat (sorotan, foto, tile kategori, seri, overline, resep efek umum, alur), rapatkan; kode tetap.
- [x] `packages/skills/skills/webapp.md` -- sidebar 248 (prosa + contoh `width:248`), buang duplikat (delta/seri/alur), rapatkan.
- [x] Tes: `tests/skills.test.ts`, `tests/skills-c7.test.ts`, contoh skill (PNG webapp diperiksa visual), lalu `pnpm build` + suite penuh.
- [x] Commit skill di branch `g1` (tanpa push/merge/ganti branch; pesan diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); dry-run seri, lalu `practice --series polish --iter 4 --reuse-pendev 1`; iterasi 5 hanya bila iterasi 4 gagal karena pemadatan.
- [x] `bench/practice/LOG.md` + `bench/polish-4.md` (bagian catatan story 2.3: token sebelum/sesudah, perbandingan polish-3) -- commit.
- [x] `tools/node26/verify.sh`; tidak ada proses tertinggal (RAM terbatas).

**Acceptance Criteria:**
- Given skill sesudah pemadatan, when `pnpm exec vitest run tests/skills.test.ts tests/skills-c7.test.ts` dijalankan, then lulus dengan LIMITS tak berubah, core total ≤ 3600 dan landing prosa ≤ 1350, dan tabel token sebelum/sesudah per skill tercatat di plan dan LOG.
- Given `webapp.md`, when dibaca, then prosa menyebut sidebar 248 dan contoh memakai `width:248`, dan contohnya lulus 0/0/0 terhadap daemon nyata dengan PNG tanpa luberan.
- Given `bench/polish-4.md`, when dibaca, then P7, P8, P9 masing-masing Setara/Lebih baik, rasio waktu ≤ 1,5, emoji 0, gate 0, pen.dev dipakai ulang dari iterasi 1, dan biaya kumulatif ≤ $30,24.
- Given akhir story, when `tools/node26/verify.sh` dijalankan, then lulus dan `/usr/bin/node` v22.

## Implementation Notes

Token (`estimateTokens`, total / prosa), sebelum (baseline `725a282`) → sesudah (commit `ac4961c`):

| Skill | Batas | Sebelum | Sesudah | Ruang sesudah |
|---|---|---|---|---|
| core | total 4000 | 3967 / 3251 | 3571 / 2855 | 10,7% total |
| polish | 3000 / 3200 | 2207 / 1818 | 2454 / 2064 | penerima aturan lintas layar (+247) |
| landing | 1500 / 3500 | 3486 / 1500 | 3073 / 1087 | 27,5% prosa |
| mobile | 1500 / 3500 | 3176 / 1369 | 2900 / 1093 | 27,1% prosa |
| webapp | 1500 / 3500 | 2825 / 930 | 2735 / 840 | 44% prosa |
| jumlah 5 skill | | 15661 | 14733 | −928 |

- Dipindah ke `polish` (satu tempat): seksi baru **Bidang efek** (resep mesh → struktur → noise → cahaya gelap, zona tenang, kontras, cuplikan = panel solid, tanpa permintaan = bidang polos); overline maks 2 + meta maks 2 "·" (Tipografi); arg ke-6 Badge di permukaan gelap (Komponen); kartu satu tinggi digabung ke satu butir Struktur; glow hanya di Tanda slop.
- `core`: pointer `webapp`, "Frasa terlarang: lihat polish", "pencarian foto gagal", radius konsentris/ritme (pointer polish) dihapus; netral terang dan status merujuk `C` prelude (nilai hex identik); `title-lg`/`title` hanya di mobile/webapp; resep efek → "Efek ekspresif: `polish`". Prelude dan baris `Font terpasang` byte-identik.
- `landing`: kontras, overline/"·", rating, logo/wadah ikon, arg ke-6, stretch tier, `limit:12`/potret, empat lapis efek umum dibuang (diajarkan core/polish); tinggal 12–24 garis aliran, `Crop /` anak pertama, ≥ ⅔ lebar, gema tipis, `conic`.
- `mobile`: sorotan terang/gelap (core elevasi), foto `limit:12`/beda per butir, tile kategori (core koleksi), seri `C.data` (core), overline, resep efek umum, alur ganda dibuang; tinggal onboarding/sampul/kartu sorotan + gelombang/cincin `ellipse`; keadaan daftar khas mobile (selesai `circle-check` success, mendatang chevron) tetap.
- `webapp`: sidebar 240 → 248 (prosa + contoh `width:248`, DESIGN.md §Web app/dashboard); delta warna/ikon arah dan seri/legenda merujuk core; alur dua langkah satu baris. PNG contoh diperiksa visual: tanpa luberan, 0/0/0.
- Kode contoh tidak diubah selain `width:248`.

Lanjutan (sesi utama, sesudah subagen implementasi berhenti):
- Subagen implementasi mengakhiri gilirannya saat seri berjalan di background, sehingga proses harness ikut mati (±27 dtk, P7 Lakar baru membaca skill dan `open_doc`). Sesi utama menyimpan percobaan itu (`bench/runs/aborted-killed/`, harness juga memindahnya ke `P7-lakar.prev-20261119T033213Z`) lalu menjalankan `practice --series polish --iter 4 --reuse-pendev 1 --resume`. Resume hanya mengulang run aborted, sesuai README, tanpa perbedaan versi beku.
- Peta reuse: `1` (bukan `P7=3,...`), karena iterasi 3 tidak punya pen.dev P7 sah. Polish-3 memakai iterasi 1.
- Hasil `bench/polish-4.md`: lulus. P7 Setara 15–14 (89,0/97,5 dtk), P8 Setara 16–16 (153,6/213,6), P9 Lebih baik 15–12 (204,5/161,9). Emoji 0, gate 0, $4,50, kumulatif $22,58/$30,24.
- Patch review (commit `b89bb64`) diterapkan sesudah seri selesai, karena lakard membaca skill dari disk saat run. Token akhir: core 3576/2861, polish 2453/2064, landing 3085/1099, mobile 2904/1096, webapp 2735/840.
- LOG §2.3 dan bagian "Catatan story 2.3" di `bench/polish-4.md` ditulis.

## Plan Change Log

## Review Triage Log

### 2026-11-19 — Review pass
- verdicts: 8 findings — high 0, medium 1, low 4, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` core proses 6 kehilangan "Screenshot vs 12 anti-pattern" — dipulihkan: "Screenshot vs 12 anti-pattern + kritik diri."
  - `[low]` `[patch]` landing bidang efek hanya menyebut garis aliran (kontur/kisi/partikel dan aturan `Crop /` untuknya hilang) — dipulihkan: "struktur (12–24 garis aliran/gelombang, kontur, atau kisi/partikel) di `Crop /` …"
  - `[low]` `[patch]` mobile bidang efek menghilangkan partikel dan menambah "hanya" — dipulihkan: "di onboarding, sampul, atau kartu sorotan; … cincin `ellipse`, atau partikel."
  - `[low]` `[patch]` mobile ring "busur berurutan" adalah instruksi baru — diganti "satu busur per seri" (setara teks asli; warna `C.data` tetap di core).
  - `[low]` `[patch]` polish "·" menyempit ke baris meta — dipulihkan: "Maks 2 "·" per baris."
  - `[false]` `[reject]` LOG tanpa entri 2.3 — pekerjaan masih berjalan saat review; LOG §2.3 kini ditulis (commit b89bb64).
  - `[false]` `[reject]` `bench/polish-4.md` belum ada — seri masih berjalan saat review; laporan kini ada dan lulus.
  - `[false]` `[reject]` verify.sh belum dijalankan — dijalankan di akhir dan lulus (lihat Auto Run Result).
- Patch diterapkan sendiri oleh sesi utama, bukan oleh subagen implementasi. Subagen itu berhenti sambil menunggu task background yang sudah mati, dan skill tidak boleh diubah sebelum seri selesai.

## Design Notes

Pemadatan = memindah, bukan menghapus. Contoh: resep bidang efek umum (mesh dasar → struktur bermakna berulang → noise ≤ 0,08 → gelap: satu cahaya merek blur ≥ 40 opacity ≤ 35%; teks di zona tenang, kontras ≥ 4,5:1) ditulis sekali di polish; landing hanya menyimpan "12–24 garis aliran, `Crop /` absolut seukuran bidang anak pertama, ≥ ⅔ lebar, gema tipis di seksi lain, conic"; mobile hanya "onboarding/sampul/kartu sorotan, cincin `ellipse`, bukan di tombol". Core cukup menyebut "efek ekspresif: `polish`".

## Verification

**Commands:**
- `/opt/node-26/bin/pnpm exec vitest run tests/skills.test.ts tests/skills-c7.test.ts` -- expected: lulus
- `/opt/node-26/bin/pnpm build && LAKAR_SKILL_PNG_DIR=<scratchpad>/png /opt/node-26/bin/pnpm exec vitest run packages/daemon/src/skills-examples.test.ts` -- expected: 7 skill 0/0/0
- `/opt/node-26/bin/pnpm test` -- expected: lulus (kecuali flake latensi `packages/render/test/visual.test.ts` yang diketahui)
- `/opt/node-26/bin/node bench/dist/cli.js practice --series polish --iter 4 --reuse-pendev 1 --dry-run` -- expected: preflight lulus, perkiraan ≤ $12
- `tools/node26/verify.sh` -- expected: lulus

## Auto Run Result

- **Status:** built. Commit `ac4961c` (pemadatan + sidebar 248) dan `b89bb64` (patch review + seri polish iterasi 4), ditambah commit plan.
- **Ringkasan:** lima skill dipadatkan. Aturan lintas layar kini ditulis sekali di polish/core (resep bidang efek, overline/"·", Badge arg ke-6, kartu satu tinggi, glow); skill jenis layar hanya menyimpan yang khas. `LIMITS` tidak berubah. Sidebar webapp 240 → 248 (prosa + contoh).
- **File:** `packages/skills/skills/{core,polish,landing,mobile,webapp}.md` (skill); `bench/polish-4.md|json` dan `bench/practice/polish/4/*.png` (laporan + strip Lakar); `bench/practice/LOG.md` (§2.3).
- **Token sebelum → sesudah (total/prosa):** core 3967/3251 → 3576/2861 (ruang 424 = 10,6%); polish 2207/1818 → 2453/2064; landing 3486/1500 → 3085/1099 (ruang prosa 401 = 26,7%); mobile 3176/1369 → 2904/1096; webapp 2825/930 → 2735/840.
- **Review:** 5 patch (1 medium, 4 low), 0 deferred dari review, dan 3 ditolak (false: pekerjaan masih berjalan saat review). Deferred plan: patch tanpa bench ulang (low), dry-run mencetak prompt latihan (medium, C7).
- **Follow-up review:** false. Patch hanya 1 medium, tidak ada high.
- **Verifikasi:** `tests/skills.test.ts` + `tests/skills-c7.test.ts` lulus (29). Contoh skill 7/7 0/0/0, dan PNG webapp 248 diperiksa. `pnpm test`: 984/985; satu-satunya gagal adalah flake latensi `packages/render/test/visual.test.ts`, yang lulus 18/18 saat dijalankan ulang sendiri. Seri polish iterasi 4 lulus. `tools/node26/verify.sh` semua OK, snapshot C9 identik, `/usr/bin/node` v22.23.5.
- **Risiko sisa:** P7 turun dari Lebih baik ke Setara. PNG pen.dev sama, sehingga selisih ini kemungkinan variasi juri dan perubahan rubrik 2.2 → 2.3. Patch review belum di-bench.

