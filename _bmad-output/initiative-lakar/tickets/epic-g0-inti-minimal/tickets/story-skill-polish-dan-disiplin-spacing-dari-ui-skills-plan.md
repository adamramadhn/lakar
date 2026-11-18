---
title: 'Skill polish dan disiplin spacing dari ui-skills'
type: feature
ticket: '23'
created: '2026-11-18'
status: blocked
baseline_revision: '7fce0c5b13eafef6df9ef04fa73644fe1092f6a3'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/analisis-ui-skills-polish.md'
  - '{project-root}/bench/README.md'
  - '{project-root}/bench/practice/LOG.md'
warnings: [multiple-goals, oversized]
deferred: []
blocked_at: "2026-11-18"
blocked_reason: "seri polish belum lulus: P7 Kalah karena gerbang waktu (Lakar 174,4 dtk > 1,5 × pen.dev 97,5 dtk; skor Lakar 14–12), sisa anggaran $2,26 < iterasi penuh $5,70; perlu keputusan Adam"
---

<intent-contract>

## Intent

**Problem:** Adam mengonfirmasi round-2 dengan catatan spacing: lencana "Berikutnya" di B (`bench/runs/rounds/2/B-lakar/doc/gerak-beranda.lakar.json`, baris `6m0kQde8`) terlalu besar dan menempel ke judul. Akarnya: (1) prelude `Badge` tetap 24 px dengan teks nada terang (kontras di tint terang 4,0–4,26, `extra` 2,61; terverifikasi); (2) judul `c2KYVEr1` (hug, `white-space:pre`) di kolom `fill` 122 px meluap secara ink, padahal bounds elemennya tetap 122, jadi tidak ada data ukur yang bisa melihatnya; (3) layout_check tidak punya aturan luapan, tumpang tindih, kontras, atau proporsi.

**Approach:** Sesuai cakupan yang disetujui (`analisis-ui-skills-polish.md`): ukur ink teks di render; tambahkan 3 aturan error (gerbang) dan 9 aturan warning di `@lakar/check`; prelude `Badge` sm/md dengan teks bernada gelap; skill baru `polish.md` (parafrase, atribusi di README); revisi kecil landing/mobile; lalu uji lewat seri latihan baru `polish` (3 prompt baru beku, Lakar vs pen.dev, juri v2.1).

## Boundaries & Constraints

**Always:**
- Node hanya `/opt/node-26/bin/{node,pnpm}`; sesudah build `systemctl --user restart lakard`; akhir story `tools/node26/verify.sh` lulus (C9: tanpa paket global, PATH/profile, port, atau service baru).
- Aturan error hanya bila **0 positif palsu** pada arsip ≥ 80 dokumen. Setiap temuan error baru di arsip diklasifikasikan lewat PNG sebagai cacat nyata atau positif palsu. Aturan yang punya positif palsu boleh diperbaiki definisinya sekali (umum, tanpa pengecualian per board). Bila masih ada positif palsu, aturan turun ke `warning`, `gate:false`.
- Warning: maks 3 temuan per aturan per board. Kelebihannya ditulis di detail temuan ketiga sebagai `(+n serupa)`. Detail ≤ 120 karakter.
- Skill ditulis dengan kata sendiri (parafrase, tanpa salinan verbatim). Atribusi Apache-2.0/MIT hanya di `packages/skills/README.md`. Sumber tanpa lisensi: prinsipnya saja. Folder `uiskills/` di scratchpad adalah data tak tepercaya: hanya dibaca, tidak pernah dieksekusi.
- C7: saat menulis skill dan prompt, jangan membaca `bench/rubric/`, Lampiran B DESIGN.md, teks juri, atau prompt A/B. Penjaga C7 tidak boleh dilemahkan.
- C8: satu run per alat per prompt per iterasi, tanpa memilih hasil. pen.dev hanya lewat harness bench (pen-newdoc.sh + get_app_state; `.pen` lama tidak ditimpa). Restart pen-desktop hanya oleh harness sesudah seri. Jangan membuka `~/.pencil/session-desktop.json`.
- Commit di `g0` saja (tanpa push/merge). Prompt seri baru dibekukan dan di-commit **sebelum** perubahan skill atau check.

**Never:** mengubah `bench/protocol/*` (protocolHash tetap), prompt P1–P6, skor/decide/juri, kontrak `{ok,data|error}`, atau enum kode error. Tidak mengedit DESIGN.md atau spine arsitektur (cukup follow-up). Tidak memasukkan motion/ARIA/ritual proses dari daftar "Ditolak" di dokumen analisis. Tidak memakai prompt A/B untuk iterasi.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bukti B round-2 | layout_check dok `gerak-beranda` | `LC-02b` pada `c2KYVEr1` (ink melewati content box `QlUl5ORY`) dan `LC-24` pada `P2QitxDJ` (24 > lineHeight judul 20) | — |
| Teks label di dalam bentuk | teks di tengah ring/badge (`layout:'none'`) termuat penuh | tanpa `LC-11` (mengandung ≠ tumpang tindih sebagian) | — |
| Kontras tak tentu | teks di atas fill gambar tanpa scrim / di bawah lapis yang menutup sebagian | tanpa temuan `LC-04` | lewati |
| Kontras gradien/opacity/blend | latar gradien, atau opacity < 1 / blend di jalur | `LC-04` level warning (stop terburuk) | — |
| Banjir warning | 12 teks bobot 300 berukuran 14 di satu board | 3 temuan `LC-29`; temuan ketiga berisi `(+9 serupa)` | — |
| Contoh skill | semua blok js di core/landing/mobile/icons/polish | 0 error / 0 gerbang / 0 warning (tes yang ada) | — |

</intent-contract>

## Code Map

- `packages/ports/src/*.ts` (`TextMeasure` baris 16): tambah opsional `ink?: {x,y,width,height}` relatif board. Bentuknya union rect Range dari karakter non-spasi pertama sampai terakhir; teks kosong tidak punya `ink`. Perubahannya aditif.
- `packages/render/src/measure.ts` (`measureLines`): hitung `ink` dari Range yang sama. Tetap murni DOM, bisa dimuat di browser (AD-6). Komentar `layout.ts:318` ("check G0 belum punya aturan teks meluber") perlu diperbarui.
- `packages/schema/src/findings.ts` (`G0_RULES` dan tesnya `findings.test.ts:7-10`): tambah id baru beserta level, gate, dan title. Nama `G0_RULES` dipertahankan karena dipakai bench.
- `packages/check/src/rules.ts` (pola: satu fungsi per aturan, helper `finding/num/quote`, `visibleRect`, `named`, `isFlowChild`, `descendants` di `tree.ts`), `index.ts` (`checkBoard`, `RULE_ORDER`, re-export), `index.test.ts` (pola fixture). Resolved node punya `fills`, `stroke`, `radius`, `padding`, `gap`, `opacity`, `blend`, `shadows`, `color`, dan `size/weight/lineHeight`.
- `packages/skills/src/index.ts:11` `SKILL_NAMES`: tambah `'polish'`. `/skills/read` daemon otomatis ikut. `packages/skills/README.md`: daftar skill + bagian Atribusi.
- `packages/mcp/src/server.ts:130-139` `READ_SKILL_DESCRIPTION` dan `SERVER_INSTRUCTIONS`: sebut polish. Tes `packages/mcp/src/index.test.ts:122,300` memakai teks daftar skill.
- `packages/skills/skills/core.md`: prelude `Badge` baris 38-40, alur langkah 1/6. File ini ada di batas 4000 token (`tests/skills.test.ts` `LIMITS`), jadi setiap tambahan harus diimbangi pemangkasan. `landing.md`/`mobile.md` juga dekat batas 3500.
- `packages/daemon/src/skills-examples.test.ts`: setiap blok js wajib 0 error/gerbang/warning. Ini penjaga otomatis bahwa contoh mematuhi aturan baru.
- `tests/skills.test.ts` (LIMITS), `tests/skills-c7.test.ts` (`practice` = prompt terlarang; tambahkan seri polish), `tests/practice-prompts.test.ts` (pola tes seri efek baris 71-80).
- `bench/src/practice/prompts.ts` (`EFFECT_*` sebagai pola) dan `bench/src/practice/main.ts:106-139` (`SERIES`, `COST_ESTIMATE`, `budgetProblem`). Pindaian arsip ada di `bench/src/round/main.ts:606` dan pemanggil serupa di practice: tambahkan `runs/practice-polish`.
- `bench/src/round/report.ts:180`: kalimat statis "LC-03/06/07/11/…/18/21 belum ada di G0_RULES" menjadi salah. Hitung daftarnya dari `G0_RULES`.
- Skrip arsip (scratchpad, di luar repo): `archcheck.mjs` (daemon dist sementara, port acak, dataDir salinan) dan `insp23.mjs` (inspect bounds). Arsip saat ini berisi 79 dok di `bench/runs/**` ditambah 10 dok di `~/.local/share/lakar/docs` = 89. Bandingkan dist baseline `7fce0c5` dengan dist sesudah.

## Tasks & Acceptance

**Execution:**
- [x] `bench/practice/polish/prompts.json`, `bench/src/practice/prompts.ts`, `bench/src/practice/main.ts`, `tests/practice-prompts.test.ts`, `tests/skills-c7.test.ts`, `bench/README.md`: tambah seri `polish` (lihat Design Notes) dengan prompt P7–P9, `POLISH_PROMPTS_SHA256`, `POLISH_ID=/^P[789]$/`, `maxIter 3`, `budgetUsd 15`, `passRule 'all'`, `reportPrefix 'polish'`, `runsRoot runs/practice-polish`, `pngDir practice/polish`, restart pen-desktop, `compareWithFirst: true`. Pindaian arsip juga mencakup `runs/practice-polish`. Tes: sha, id, kalimat penutup, n-gram vs A–E dan P1–P6, nama produk tidak ada di golden-set. **Commit tersendiri sebelum task lain.** Alasan: anti-overfit, sama seperti story 22.
- [x] Baseline (keputusan orkestrator 2026-11-18): build bench saja, restart lakard, lalu `practice --series polish --iter 1` dengan skill/check/render LAMA (pen.dev + Lakar lama + juri). Tunggu selesai sebelum mengubah skill, check, render, atau dist apa pun. Dikerjakan sesi orkestrasi; implementer mulai sesudahnya.
- [x] `packages/ports`, `packages/render/src/measure.ts`, `packages/render/src/index.test.ts`: tambah `ink` pada `TextMeasure`. Tes: teks hug di kolom sempit punya ink lebih lebar dari bounds; teks berspasi di ujung tidak menambah ink; teks wrap tidak melebar.
- [x] `packages/schema/src/findings.ts` (+tes) dan `packages/check/src/rules.ts`/`index.ts`/`index.test.ts`: implementasi aturan pada tabel di Design Notes. Setiap aturan punya fixture positif dan negatif, plus tes batas warning per board.
- [x] Pindaian arsip (scratchpad): sebelum dan sesudah pada ≥ 80 dokumen. Klasifikasikan setiap temuan error baru lewat PNG. Terapkan aturan turun level bila perlu. Catat jumlah per aturan dan per level di Implementation Notes dan di `bench/practice/LOG.md` §1.23. Pindaian ini selesai sebelum seri bench.
- [x] `packages/skills/skills/core.md`: `Badge(p,label,tone,icon,size='sm')`. `sm` = tinggi 20, padding [0,6], caption 12/16, `width:'hug'`, tanpa wrap. `md` = 24, padding [0,8]. Teks lencana memakai nada tinta gelap per tone, kontras ≥ 4,5 di atas tint, dan arketipe gelap tetap memakai fg terang. `acc2` dan kuning tidak dipakai untuk teks kecil. Alur langkah 1 menambah `polish`. Total tetap ≤ 4000 token: pangkas dengan memindahkan detail ke polish tanpa menghapus aturan.
- [x] `packages/skills/skills/polish.md` (baru, ≤ 3200 token total), dengan bagian a–g dari dokumen analisis yang dikelompokkan ringkas. Satu contoh js kecil boleh ada: baris daftar dengan judul `width:'fill'` dan `Badge` sm, teruji 0 temuan. Tanpa kata terlarang C7 (`skor`, `juri`, `rubrik`, nama produk prompt, `Gerak`).
- [x] `landing.md`, `mobile.md`: overline maks 2 per halaman dan hanya bila membawa informasi; batasi "·" (maks 2 per baris meta); landing memakai grid 12 kolom di 1440 (tepi 80, lebar isi 1280, gutter 24). Contoh disesuaikan agar lolos aturan baru dan tetap di bawah batas token.
- [x] `packages/skills/src/index.ts`, `packages/skills/README.md`, `tests/skills.test.ts` (`LIMITS.polish = {prose: 3000, total: 3200}`), `packages/mcp/src/server.ts` (+tes): pasang `polish`. Instruksi: "read_skill core + polish + landing/mobile di giliran yang sama".
- [x] `bench/src/round/report.ts`: daftar aturan "belum dihitung" diturunkan dari `G0_RULES`.
- [ ] Build, test, restart lakard. Seri sesudah perubahan (`--iter 2 --reuse-pendev 1`) dijalankan sesi orkestrasi sesudah review, bukan implementer. Iterasi 3 (reuse pen.dev) hanya bila ada prompt Kalah dan `budgetProblem` mengizinkan; bila tidak, HALT `blocked` dengan laporan lengkap (anggaran tidak dinaikkan). Hasil dicatat di LOG.md dan dilaporkan ke Adam beserta PNG (done_checkpoint).

**Acceptance Criteria:**
- Given build sesudah story, when `layout_check` dijalankan pada salinan `bench/runs/rounds/2/B-lakar/doc/gerak-beranda.lakar.json`, then temuan memuat `LC-02b` untuk `c2KYVEr1` dan `LC-24` untuk `P2QitxDJ`.
- Given arsip ≥ 80 dokumen, when dipindai sebelum dan sesudah, then setiap aturan berlevel error punya 0 positif palsu, jumlah temuan per aturan tercatat di LOG.md, dan aturan dengan positif palsu berlevel warning.
- Given agen MCP baru, when `read_skill` dipanggil tanpa name, then `polish` tersedia; `read_skill polish` mengembalikan isinya; deskripsi tool dan instruksi server menyebut polish.
- Given repo sesudah story, when `pnpm test` dijalankan, then semua lulus: batas token (core ≤ 4000, polish ≤ 3200), C7 skill dan prompt, contoh skill 0/0/0 terhadap daemon, serta fixture setiap aturan.
- Given seri `polish` selesai, when laporan `bench/polish-<k>.md` dibaca, then pada iterasi sesudah perubahan setiap prompt P7–P9 berstatus Setara atau Lebih baik, emoji 0, gate 0, waktu ≤ 1,5× pen.dev, biaya kumulatif ≤ $15, dan PNG tersedia untuk Adam. Bila tidak tercapai dalam anggaran, HALT `blocked` dengan laporan.

## Implementation Notes

- Sesi orkestrasi: prompt P7–P9 dibekukan (sha `b41ba79e9ca6818f388da5bd9a1718f6899a631c95ca360a8f60e48a7a2dd036`; P8/P9 diubah kalimat pembukanya sebelum beku karena n-gram 6 kata sama dengan P4/P1) dan seri `polish` dipasang di commit `0347f15`. Iterasi 1 baseline (skill/check lama) di commit `cb8a30f`: P7 Kalah karena waktu (Lakar 180,7 dtk vs pen.dev 97,5 dtk, rasio 1,85; skor 14–13), P8 Kalah (14–16), P9 Lebih baik (15–11); gerbang 0, emoji 0; $7,54, sisa $7,46 (cukup untuk tepat satu iterasi reuse ≈ $5,7).
- Konsekuensi untuk implementer: tugas mulai dari task ketiga (ports/render). Waktu adalah risiko nyata P7: polish.md tidak boleh menambah execute; `read_skill polish` dibaca paralel dengan core dan skill jenis layar di giliran yang sama; skill tidak boleh mendorong perbaikan kecil berulang. Implementer TIDAK menjalankan seri bench dan TIDAK membaca `bench/polish-1.md` maupun berkas juri/rubrik (C7).

- Implementer (2026-11-18): task ketiga s.d. kesembilan selesai; build + `pnpm test` (922/922) + restart lakard + `tools/node26/verify.sh` lulus. Task terakhir (seri `--iter 2 --reuse-pendev 1`, iterasi 3 bila perlu, laporan ke Adam) tetap untuk sesi orkestrasi. Implementer tidak menjalankan seri bench dan tidak membaca `bench/polish-1.md`, berkas juri, atau rubrik.
- Pindaian arsip (90 dok, 126 board; detail di `bench/practice/LOG.md` §1.23): sebelum = 34 error (LC-20). Sesudah: LC-20 34, LC-02b 36 (16 dok), LC-04 579 error (55 dok) + 36 warning, LC-11 0; warning LC-18 26, LC-23 42, LC-24 125, LC-25 110, LC-26 26, LC-27 30, LC-28 10, LC-29 0, LC-30 0. Dok dengan gate > 0: 16 → 65. LC-04: 579/579 latar terhitung = latar piksel (selisih kanal ≤ 1) → 0 positif palsu. LC-02b: definisi awal 92 temuan dengan positif palsu (luapan 1–4 px ke padding lega); diperbaiki sekali (sisa jarak < 4 px ke batas tampak) → 36 temuan, semua cacat nyata di crop PNG. Ketiga aturan error tetap error·gerbang.
- Bukti B round-2: `LC-02b` `c2KYVEr1` (16,5 px, sisa −4,5 px ke lencana) dan `LC-24` `P2QitxDJ` (24 > 20), plus `LC-23`.
- Skill: core 3988/4000, polish 2207/3200 (prosa 1818), landing 3500/3500, mobile 3209 (prosa 1500/1500).
- Perbaikan review: `Badge` arg ke-6 `on` (permukaan; default `C.bg`): permukaan gelap di board terang → teks/ikon `C.on` di atas `C.on`+1F (contoh teruji di `polish.md`, disebut di core dan baris pricing landing); "Pencarian gagal" dipindah dari core ke polish. Laporan putaran menurunkan daftar R3/R7 dari `frozen.g0Rules` (fallback `G0_RULES`). README bench: butir arsip slug kembali ke bagian latihan umum.

## Plan Change Log

- 2026-11-18 (implementer): tes ink ditulis di `packages/render/test/text.test.ts` (harness Chromium), bukan `packages/render/src/index.test.ts` (tanpa DOM). Vertikal ink = kotak baris (pusat kotak glyph ± line-height/2) agar teks hug tidak dianggap meluap karena content-area font > line-height.
- 2026-11-18 (implementer): LC-02b diperbaiki sekali sesudah klasifikasi PNG (lihat Implementation Notes): luapan > 1 px dari content box DAN sisa jarak < 4 px ke batas tampak terdekat (wadah ber-cat/ber-clip, board, atau saudara penghadang). Teks yang elemennya sudah dilaporkan LC-02a tidak dilaporkan lagi.
- 2026-11-18 (implementer): LC-04 level warning (gradien/opacity/blend/backdropBlur) tidak dihitung gerbang: `summarizeFindings`/`findingLine` kini menghitung gerbang hanya untuk temuan `error` dari aturan ber-gerbang (perilaku aturan lama tidak berubah karena semuanya selalu error).
- 2026-11-18 (implementer): LC-11 pengecualian "saling memuat" hanya bila pemuatnya bukan teks (ink teks yang menutup saudara tetap tabrakan). LC-24 naik maks 2 tingkat melewati pembungkus berisi badge saja (kolom status, grup badge). LC-25 dinilai per sudut, padding kedua sisi sudut 1–24 dan selisih ≤ 2; anak pill/lingkaran dilewati. LC-26 hanya bila sebelum judul ada kelompok konten (teks > 14 atau ≥ 2 teks; overline/ikon/badge tidak) dan judul bukan nilai (angka dengan ≤ 4 huruf, mis. harga). LC-30 tidak menilai "..." di teks mono (cuplikan kode).
- 2026-11-18 (implementer): frasa terlarang dipindah dari `core.md` ke `polish.md` (tidak dihapus) agar core ≤ 4000 token.

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 4 findings — high 0, medium 2, low 2, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Prelude `Badge` memilih tinta dari `C.bg` seluruh board, sehingga Badge di permukaan `C.deep` pada board terang (tier unggulan pricing, seksi deep) mendapat teks gelap di tint gelap → error gerbang LC-04 — dipatch: argumen ke-6 opsional `on` (permukaan); permukaan gelap di board terang → teks/ikon `C.on` + tint `C.on+'1F'`; disebut di core (Peran T) dan baris pricing landing; contoh polish berakhir dengan Badge di baris `C.deep` (0/0/0); core 3988/4000, landing 3500/3500.
  - `[medium]` `[patch]` `r3r7Missing` membaca `G0_RULES` hidup, sehingga laporan putaran lama yang di-render ulang (`--resume`) mengklaim LC-11/LC-18 ada — dipatch: `frozenG0Rules(r.frozen?.g0Rules)` dengan fallback ke `G0_RULES`; snapshot historis dipulihkan; tes baru.
  - `[low]` `[patch]` Butir umum "Arsip slug Lakar…" di `bench/README.md` terletak di bawah `### Seri polish` — dipindah kembali ke bagian umum latihan.
  - `[low]` `[reject]` `RANGE_HYPHEN` (LC-30) tidak menandai `Rp50-100` atau rentang tahun 4 digit — hanya warning; memperluas regex menambah risiko menandai tanggal ISO/kode; format Indonesia memakai spasi setelah `Rp` (fixture lulus), kasus jarang.

## Design Notes

**Aturan baru.** Id diambil dari katalog Lampiran A bila maknanya sama. Id baru LC-23–30 ditandai sebagai follow-up untuk ditambahkan ke Lampiran A oleh Adam/Sofia. Level awal mengikuti cakupan Adam, dan level akhir ditentukan pindaian arsip.

| Id | Level awal | Definisi ringkas |
|---|---|---|
| LC-02b | error·gerbang | Ink teks keluar dari content box induk > 1 px. Content box = bounds induk dikurangi padding; untuk anak absolut, padding box. Berlaku juga bila induk clip, karena LC-02a hanya melihat bounds elemen. Dikecualikan: leluhur `Crop /`, rotasi, `Overlay /` |
| LC-11 | error·gerbang | Saudara tumpang tindih **sebagian** (irisan ≥ 1 px di kedua sumbu, tidak saling memuat). Teks diukur dari ink-nya. Hanya pasangan yang keduanya anak flow, atau keduanya teks/berisi teks. Dikecualikan: nama `Overlay /`/`Crop /`, gap induk < 0, node tak terlihat |
| LC-04 | error·gerbang | Kontras teks setelah komposit < 4,5 (teks besar ≥ 24, atau ≥ 19 dengan bobot ≥ 700: < 3). Lapisan dihitung dari leluhur dan node sebelumnya yang memuat penuh ink teks, solid hex8 dikomposit dari board ke atas, lalu warna teks berhex8 dikomposit. Gradien (stop terburuk), opacity, blend, atau backdropBlur menurunkan level ke warning. Gambar/noise/mesh di bawah lapisan opak teratas, atau lapisan yang menutup sebagian di atasnya: lewati |
| LC-23 | warning | Celah teks ↔ `Badge /`/`Button /`/`IconButton /`/ikon ≥ 20 di Row < 8. Tidak dihitung di dalam komponen (`Button/Badge/Chip/Tab/Link/Input`) |
| LC-24 | warning | Badge di baris: tinggi > lineHeight teks terbesar saudaranya (kedalaman ≤ 2), ukuran teks badge ≥ teks itu, atau teks badge > 1 baris |
| LC-18 | warning | Kartu (fill/stroke + padding ≥ 12 + ≥ 2 anak, bukan komponen) yang ber-stroke atau berbayang di dalam kartu ber-stroke atau berbayang |
| LC-25 | warning | Radius tidak konsentris: anak menempel di sudut padding induk (≤ 1 px), induk radius > 0 dan bukan full, padding ≤ 24, dan \|Ro − (Ri + p)\| > 2 |
| LC-26 | warning | Judul (≥ 20, bobot ≥ 600, bukan `KPI /`/`Display /`) di tengah kolom dengan ruang di atas ≤ ruang di bawah |
| LC-27 | warning | Lebih dari 6 ukuran huruf berbeda per board |
| LC-28 | warning | Teks ≥ 2 baris dengan rata-rata karakter per baris > 80 |
| LC-29 | warning | Bobot < 400 pada teks < 18 |
| LC-30 | warning | `...` (pakai `…`), atau tanda hubung pada rentang angka/jam (`09.00-10.00`, `5-10`). Tanggal ISO, nomor telepon, dan kode tidak dihitung |

**Prompt seri polish (draf).** Setiap prompt diakhiri `CLOSING_SENTENCE`. Implementer boleh menyunting sebelum dibekukan, tetapi tidak sesudahnya.
- P7 `Rodaku`, mobile 390×844: beranda aplikasi bengkel motor. Isi: header dengan nama motor dan jarak tempuh, kartu servis berikutnya dengan estimasi biaya, daftar 5 riwayat servis (tanggal, bengkel, biaya, status: selesai / menunggu suku cadang / dijadwalkan), pengingat ganti oli, dan tab bar 4 ikon. Mode terang, aksen hijau.
- P8 `Lumbung`, dashboard 1440×900: sistem gudang distributor beras. Isi: sidebar, header dengan pencarian SKU dan tombol tambah pengiriman, ringkasan stok dan pengiriman dibanding minggu lalu, tabel pesanan keluar (pelanggan, jumlah karung, jadwal, status), grafik stok 14 hari per gudang, dan daftar pemasok terlambat. Mode terang, aksen biru tua.
- P9 `Mejaku`, landing 1440: aplikasi reservasi meja untuk restoran kecil. Isi: menu atas, hero dengan judul, subjudul, tombol, dan pratinjau aplikasi berisi daftar reservasi malam ini; 3 fitur; perbandingan paket harga; testimoni pemilik dengan foto; FAQ; footer. Aksen merah bata.

Ketiganya memuat baris daftar berstatus, sumber kasus "Berikutnya". Ketiganya juga baru, jadi berfungsi sebagai uji hold-out, karena P1–P4 sudah dipakai untuk menyetel skill selama 8 iterasi.

**Anggaran.** Perkiraan per prompt (dari effects-1/3): pen.dev ≈ $0,8, Lakar ≈ $1,0, juri ≈ $0,7. Iterasi 1 = baseline skill/check lama, penuh ≈ $7,5. Iterasi 2 = Lakar baru dengan reuse pen.dev iterasi 1 ≈ $5,1 (C8: satu run pen.dev per prompt). Kumulatif ≈ $12,6, batas keras $15. Iterasi 3 hampir pasti ditolak `budgetProblem`.

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm build && /opt/node-26/bin/pnpm test`: lulus semua.
- `systemctl --user restart lakard && systemctl --user is-active lakard`: `active`.
- `SCRATCH=/tmp/claude-0/-root-lakar/ff3247e7-b8d6-48ae-acb4-dd6a2a7ac61e/scratchpad /opt/node-26/bin/node /tmp/claude-0/-root-lakar/ff3247e7-b8d6-48ae-acb4-dd6a2a7ac61e/scratchpad/archcheck.mjs $(find bench/runs ~/.local/share/lakar/docs -name '*.lakar.json')`: ≥ 80 dokumen, temuan sesuai yang tercatat. Dok round-2 B memuat `LC-02b c2KYVEr1` dan `LC-24 P2QitxDJ`.
- `/opt/node-26/bin/node bench/dist/cli.js practice --series polish --iter 2 --reuse-pendev 1 --dry-run` (sesi orkestrasi): lulus preflight; run sungguhan menghasilkan `bench/polish-2.md` dengan tabel iterasi 1 vs 2.
- `tools/node26/verify.sh`: lulus (C9).

**Manual checks:**
- Untuk setiap temuan error baru di arsip, buka crop PNG-nya dan pastikan itu cacat nyata.
- Bandingkan PNG Lakar P7–P9 dengan pen.dev: lencana proporsional, judul tidak menabrak, dan tanpa emoji.

## Auto Run Result

Status: ready-for-dev — fase 1 (perencanaan saja, plan_checkpoint). Berhenti menunggu persetujuan orkestrator/Adam sebelum kode produk.

Status: blocked (2026-11-18) — kode, review, dan verifikasi selesai; Done belum terpenuhi karena seri polish belum lulus.

- **Ringkasan:** ink teks di render (`TextMeasure.ink`); aturan LC-02b/LC-04/LC-11 (error·gerbang) dan LC-18/LC-23–30 (warning, maks 3 per aturan per board); `summarizeFindings` menghitung gerbang hanya untuk temuan error; skill `polish.md` baru (2207 token) dipasang di read_skill/MCP; prelude `Badge` sm/md dengan tinta gelap + argumen permukaan gelap; revisi landing/mobile (overline, "·", grid 12); seri bench `polish` (P7–P9 beku, sha `b41ba79e…`).
- **Commit:** `0347f15` (prompt beku + seri), `cb8a30f` (iterasi 1 baseline), `444c686` (catatan plan), `bab598c` (mesin/check/skill), `f267188` (perbaikan review), `8af53c0` (iterasi 2).
- **Pindaian arsip (90 dok):** LC-04 579 error (0 positif palsu, cocok piksel), LC-02b 36 (sesudah satu perbaikan definisi; 0 positif palsu), LC-11 0; tidak ada aturan yang diturunkan. Rincian di `bench/practice/LOG.md` §1.23. Bukti B round-2: LC-02b `c2KYVEr1` + LC-24 `P2QitxDJ`.
- **Review (quick):** 4 temuan — 3 dipatch (2 medium, 1 low), 1 low ditolak (lihat Review Triage Log). Follow-up review: false (tidak ada patch high; dua medium dipatch dan diverifikasi tes + contoh skill 0/0/0).
- **Verifikasi:** `pnpm build` lulus; `pnpm test` 923/923; `systemctl --user restart lakard` active; `tools/node26/verify.sh` semua OK, snapshot C9 identik.
- **Seri polish:** iterasi 1 (lama) P7 Kalah waktu / P8 Kalah / P9 Lebih baik ($7,54); iterasi 2 (baru, reuse pen.dev) P7 Kalah waktu 1,79× (skor 14–12) / P8 Setara 15–15 / P9 Setara 14–12 ($5,20; kumulatif $12,74). Emoji 0, gerbang layout 0.
- **Blocking condition:** P7 gagal hanya gerbang waktu terhadap run pen.dev tunggal yang cepat (97,5 dtk, board 390×1177 melanggar ukuran). Sisa $2,26 tidak cukup untuk iterasi penuh; iterasi P7 saja tanpa perubahan yang menyasar waktu dianggap mengulang demi hasil (C8). Pilihan untuk Adam: terima seri dengan catatan, izinkan iterasi P7 saja (≈ $1,6) dengan anggaran tersisa, atau tetapkan baseline waktu P7 lain.
- **Risiko sisa:** LC-04 kini gerbang dan memicu di 55/90 dokumen arsip — agen bisa butuh execute perbaikan tambahan (risiko waktu); warning LC-24/LC-25 sering muncul; core/landing/mobile di batas token; Lampiran A DESIGN.md belum memuat LC-23–30 dan level baru LC-02b/04/11 (follow-up Adam/Sofia); slip `npx -y true` sekali oleh implementer (gagal, tanpa instalasi; verify C9 bersih).
