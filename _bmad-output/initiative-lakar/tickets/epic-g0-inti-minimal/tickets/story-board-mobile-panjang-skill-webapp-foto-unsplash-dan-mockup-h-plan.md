---
title: 'Board mobile panjang, skill webapp, foto Unsplash, dan mockup hero'
type: feature
ticket: '24'
created: '2026-11-19'
status: blocked
baseline_revision: '9b5652de1b71425b64d2855ac639328f560ab426'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/bench/README.md'
  - '{project-root}/bench/practice/LOG.md'
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-skill-polish-dan-disiplin-spacing-dari-ui-skills-plan.md'
warnings: [multiple-goals, oversized]
deferred: []
blocked_at: "2026-11-19"
blocked_reason: "seri polish iterasi 3 tidak bisa jalan: batas paket pen.dev (MCP pencil) tercapai untuk periode tagihan ini; rerun P7 pen.dev mustahil tanpa upgrade; butuh keputusan Adam (upgrade, atau pakai ulang pen.dev P7 iterasi 1)"
---

<intent-contract>

## Intent

**Problem:** Tinjauan Adam atas seri polish P7–P9 menemukan empat masalah. (a) P7 kalah waktu (Lakar 174 dtk vs pen.dev 97 dtk) karena `mobile.md` mewajibkan dua board 390×844 (layar + "(akhir)" lewat `duplicate` + `scrollY`), sedangkan pen.dev membuat satu board 390×1177. Board itu kini dihukum R1 = 0 dan gagal cek ukuran, padahal Adam menyetujui pola satu board panjang. (b) Dashboard P8 "terlalu mainstream": semua kartu putih, garis tipis, aksen biru, dan grafik garis tipis. (c) `photo_search` NOT_FOUND ×4 untuk potret di P9, dan skill melarang mengganti kata kunci. (d) Mockup hero terpotong rata di tepi bawah hero (A round-1, A round-2, P9). Skill sendiri yang menyuruh ini (`landing.md` "mockup produk di `Crop / …` terpotong tepi bawah").

**Approach:** (a) Satu board mobile panjang di skill, check (LC-12, LC-20), dan aturan ukuran bench. Aturan ukuran juri R1 dibuat simetris sebagai rubrik v2.2. (b) Skill baru `webapp.md`. (c) Tangga kata kunci otomatis di daemon dan adaptor Unsplash (hotlink lewat cache render daemon, `download_location`, kredit di metadata). Urutan penyedia: Unsplash → Wikimedia → Openverse. (d) Skill hero tanpa potongan dan aturan check baru LC-31. Semua diuji ulang lewat seri polish iterasi 3–5 dengan opsi harness baru `--reuse-pendev` per prompt.

## Boundaries & Constraints

**Always:**
- C9: Node hanya `/opt/node-26/bin/{node,pnpm}`. `/usr/bin/node` tetap v22. Tanpa `npx`, paket global, perubahan PATH/profil, port, service, atau container baru. Restart hanya `systemctl --user restart lakard`. `tools/node26/verify.sh` lulus di akhir. Cache baru disimpan di bawah `<dataDir>/cache/` (dataDir lakard yang sudah ada), bukan di git.
- Key Unsplash hanya dibaca kode daemon dari `~/.config/lakar/unsplash-access-key`, dengan syarat mode 600 dan uid daemon (logika `keyState` yang sudah ada, digeneralisasi). Key tidak pernah ditampilkan, di-`cat`/`echo`, ditulis ke log/error/status/metadata/laporan, atau di-commit. Tes memakai key palsu dan fetch tiruan tanpa jaringan. Satu tes memastikan string key palsu tidak muncul di error, status, meta, atau cache.
- User-Agent tetap `USER_AGENT` generik yang sudah ada (tanpa nama/email). Header Unsplash: `Authorization: Client-ID <key>` dan `Accept-Version: v1`.
- C7: skill (`webapp.md` dan revisi lain) ditulis dengan kata sendiri dan tidak menyebut isi prompt latihan, rubrik, atau juri. Task rubrik (R1 v2.2) dikerjakan **sesudah** semua task skill di-commit. Sesudah membaca Lampiran B, implementer tidak menyunting skill lagi. Perbaikan skill sesudahnya harus lewat sesi baru.
- Aturan check baru mengikuti pola 1.23: error·gerbang hanya bila 0 positif palsu pada arsip ≥ 90 dokumen (`bench/runs/**` + `~/.local/share/lakar/docs`). Setiap temuan error diklasifikasikan lewat crop PNG. Definisi boleh diperbaiki sekali. Bila masih ada positif palsu, aturan turun ke warning (`gate:false`).
- C8: satu run per alat per prompt per iterasi, tanpa memilih run terbaik. Setiap iterasi > 3 harus didahului perubahan skill/mesin yang tercatat di LOG.md (bukan mengulang demi hasil). pen.dev hanya lewat runner bench (MCP pencil, `pen-newdoc.sh` + `get_app_state`). `.pen` lama tidak ditimpa, `~/.pencil/session-desktop.json` tidak dibuka, dan pen-desktop di-restart oleh harness sesudah seri yang menjalankan pen.dev.
- Putaran dan seri yang sudah diputuskan tidak berubah. Aturan ukuran baru hanya aktif bila versi rubrik yang dibekukan run ≥ 2.2. Laporan lama yang di-render ulang (`--resume`, `rejudge` dari round-1/2) tetap memakai aturan tepat 390×844.
- Commit hanya di `g0` (tanpa push/merge). Sebelum kode UI HTML/React/Tailwind dijalankan `/baseline-ui` (story ini diperkirakan tidak menyentuh UI web).

**Never:** mengubah `bench/protocol/*` (protocolHash tetap), prompt P1–P9 (`POLISH_PROMPTS_SHA256` tetap), kontrak `{ok,data|error}`, atau enum kode error. Tidak menghapus `scrollY` dari skema (cukup tidak diajarkan lagi; AD-15 sebagai follow-up). Tidak menyalin byte foto Unsplash ke `<dataDir>/assets/`. Tidak melemahkan `--host-resolver-rules` Chromium (render tetap tanpa jaringan). Tidak menambah pola slop ke checklist juri (hanya ke skill). Tidak menyunting golden-set, Lampiran A, atau bagian lain DESIGN.md selain baris R1, aturan 4, alasan terkait, dan baris versi di Lampiran B. Tidak memakai prompt A/B untuk iterasi.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Kata kunci terlalu spesifik | `photo_search "restaurant owner portrait smiling"`, Unsplash kosong pada anak tangga 1 | Anak tangga 2 ("restaurant owner"), lalu 3 (kata kunci kategori atau tanpa orientation) dicoba; respons memuat `query` yang dipakai dan `tried` | Semua kosong di semua penyedia → NOT_FOUND dengan daftar yang dicoba |
| Key ada, Unsplash 401/403/429 | fetch tiruan membalas status itu | Lompat ke Wikimedia, `fallbackReason` `unsplash-401`/`unsplash-429`; tanpa mencoba anak tangga lain di Unsplash | — |
| Key tidak ada/insecure | file tidak ada atau mode 644 | Rantai Wikimedia → Openverse, `fallbackReason` `no-key`/`key-insecure`; status `keyFile` sesuai | — |
| Cache cari | kueri sama dalam TTL, termasuk sesudah restart lakard | Tanpa request API (cache disk `<dataDir>/cache/photo-search/`) | Cache rusak → dianggap miss |
| Foto Unsplash dipakai | `photo('unsplash:<id>')` di execute pertama untuk dok itu | Aset jarak jauh (meta tanpa byte di `assets/`); `download_location` dipanggil sekali per (ref, docId); render memuat `/assets/<id>` yang disajikan dari cache render | `download_location` gagal → dicatat di meta, execute tetap lanjut |
| Render offline, cache dingin | aset Unsplash, jaringan gagal | `/assets/<id>` mengembalikan placeholder PNG berwarna `color` foto; respons screenshot/export memuat catatan aditif `photos.placeholders` | Tidak hang: timeout fetch 10 dtk |
| Mobile panjang | board `screen:'mobile'` 390×1320, tab bar `Overlay /` di y = H−98 | LC-12 tanpa temuan ukuran; bench (rubrik ≥ 2.2) ukuran sesuai | Tinggi < 844 atau lebar ≠ 390 → temuan/gagal |
| Mobile panjang tidak pas | konten berakhir 200 px di atas zona bawah, atau tertutup zona | LC-12 warning "tinggi pas = N" (slack > 32); LC-20 bila tertutup | — |
| Pola lama | board mobile dengan `Scroll /` ber-`scrollY` > 0 | LC-12 warning "pola dua board usang; pakai satu board panjang" | — |
| Mockup hero terpotong | kartu ber-cat berisi teks, dipotong clip yang tepi bawahnya rata (≤ 2 px) dengan tepi bawah seksi selebar ≥ 90% board atau board | LC-31 pada kartu itu | — |
| Kartu fitur ber-`Crop /` | panel terpotong tepi kartu selebar < 90% board | tanpa LC-31 | — |

</intent-contract>

## Code Map

- `packages/skills/skills/mobile.md`: paragraf "Layar lebih panjang dari 844" (dua board, `duplicate`, `scrollY`), "Anggaran tinggi" (y 746), dan alur langkah 1 ("termasuk posisi akhir"). Prosa ada di batas 1500/1500. Contoh 390×844 lolos 0/0/0.
- `packages/skills/skills/landing.md:9,27,61-63`: hero "mockup … di `Crop / …` terpotong tepi bawah" dan contoh `Crop / Dasbor`. Total ada di batas 3500/3500.
- `packages/skills/skills/core.md:8,115`: foto ("jangan ulangi atau ganti kata kunci", "portrait woman unsplash", "CC0/PD dulu"). Total 3988/4000, jadi setiap tambahan harus diimbangi pemangkasan. `polish.md:24,53` (crop panel kartu fitur boleh tetap ada).
- `packages/skills/src/index.ts:11` `SKILL_NAMES`; `packages/skills/README.md`; `tests/skills.test.ts` `LIMITS`; `tests/skills-c7.test.ts:73` (daftar file); `packages/daemon/src/skills-examples.test.ts` (setiap blok js 0 error/gerbang/warning).
- `packages/mcp/src/server.ts:137-140` `SERVER_INSTRUCTIONS`, `READ_SKILL_DESCRIPTION`, deskripsi `photo_search` (±231), dan status foto (±115). Tesnya di `packages/mcp/src/index.test.ts:17,122,194-201,300`.
- `packages/check/src/rules.ts`: `SCREEN_SIZES`/`lc12` (152-198); `lc20`/`bottomZone` (201-650, sub-cek posisi akhir memakai `Scroll /`/`scrollY`); `lc02a` (pola walk clip, `Crop /` bebas maks 2). `index.ts` (`RULE_ORDER`), `index.test.ts` (pola fixture). `packages/schema/src/findings.ts` `G0_RULES` (+tes).
- `packages/daemon/src/photos/providers.ts`: `ProviderName`, `REF_PATTERN` (perlu `_` untuk id Unsplash), dan pola `PexelsProvider`/`mapPexels` sebagai acuan `UnsplashProvider`. `net.ts`: `DEFAULT_ALLOWLIST` (tambah `api.unsplash.com` untuk api serta `images.unsplash.com` untuk image/thumb; tolak `plus.unsplash.com`/premium), `USER_AGENT`. `service.ts`: `search` (rantai, `FallbackReason`), `Lru` cari (memori, akan dibackup disk), `keyState`, `importRefs`/`#importOne`, `resolve` (memeriksa file di `assets/`), `infoFrom`, dan `status`.
- `packages/daemon/src/assets.ts` (`AssetMeta`, `readAsset`, `writeAssetMeta`), `server.ts:153-173` (konstruksi `PhotoService`) dan `606-610` (rute `/assets/:hash`). `config.ts` (`KEYS`, `defaultPexelsKeyFile`): tambah `unsplash_key_file` / `LAKAR_UNSPLASH_KEY_FILE`.
- `packages/exec/src/api.ts:123-153,564-566`: `PHOTO_REF_PATTERN`, `PHOTO_REF_LITERAL`, dan teks `photo()`. `api.md` diregenerasi (`scripts/gen-skill-api.mjs`).
- `packages/render/src/index.ts:115-117`: aset gagal → NOT_FOUND. Render tidak diubah: placeholder disajikan daemon. `packages/daemon/src/chromium.ts:48` `DAEMON_BROWSER_ARGS` (blok jaringan; jangan diubah).
- `bench/src/lakar/run.ts:95-117` `BoardSpec`/`boardSizeProblemsFor`/`boardSizeProblems`. Pemanggilnya: `practice/main.ts:903-904`, `round/main.ts:829-835`, `rejudge.ts:363`, dan `round/score.ts` (`lakarGate`, aturan 4).
- `bench/src/practice/main.ts`: `COST_ESTIMATE` (68), `PRACTICE_RUBRIC_VERSION` (70) dan penjaga rubrik (543), `SERIES` polish (±140-155), `parseArgs`/`--reuse-pendev` (163-209), `estimateCost` (240), `pendevReuseProblems` (654), `preflight({requirePenDesktop})` (623), dan laporan "Pakai ulang pen.dev" (507).
- `bench/src/round/main.ts:86-135` `EXPECTED_PHOTO_PROVIDER='wikimedia'` dan probe foto putaran resmi.
- Rubrik: `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` Lampiran B (di-exclude git), `bench/rubric/` (snapshot lewat `cli.js rubric-snapshot`), dan `bench/rubric/rubric.json`.
- Skrip arsip 1.23 di scratchpad lama kemungkinan sudah hilang. Tulis ulang di scratchpad sesi: daemon dist sementara, port acak, salinan dataDir, dan perbandingan dist baseline `9b5652d` dengan dist sesudah.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/check/src/rules.ts`, `index.ts`, `index.test.ts`, `packages/schema/src/findings.ts` (+tes): **LC-12** mobile tanpa `expectedSize`: lebar 390, tinggi ≥ 844. Board mobile > 844 diberi warning "tinggi pas = N" bila jarak bawah isi utama ke zona bawah (atau ke tepi board bila tanpa zona) > 32 px. Board ber-`Scroll /` dengan `scrollY` > 0 diberi warning pola usang. **LC-20**: fixture board panjang. Positif: butir terakhir di bawah tab bar yang menempel di bawah board. Negatif: padding bawah cukup. Kode diubah hanya bila fixture gagal; perilaku dok lama tetap sama. **LC-31** (baru, awal error·gerbang): lihat matriks dan Design Notes. Setiap aturan punya fixture positif dan negatif.
- [ ] Pindaian arsip (scratchpad): jalankan sebelum dan sesudah pada ≥ 90 dokumen. Klasifikasikan setiap LC-31 error lewat crop PNG. Yang diharapkan positif nyata: A round-1, A round-2, dan P9 iterasi 1/2. Terapkan turun level bila perlu. Catat jumlah LC-12/LC-20/LC-31 sebelum dan sesudah di Implementation Notes dan di `bench/practice/LOG.md` §1.24.
- [ ] `packages/skills/skills/mobile.md`: ganti pola dua board. Bila isi > 844, buat SATU board 390 × H (H = jumlah tinggi seksi + padding bawah + zona, minimal 844). Status bar di atas, `Overlay / Tab bar` atau bilah aksi di y = H − 98 (atau H − 34 − tinggi bilah), home indicator di H − 34, tanpa `duplicate`, `scrollY`, atau `Scroll /`. Board dibangun dalam 1 execute. Temuan LC-12 "tinggi pas" diperbaiki dalam execute perbaikan yang sama. Contoh diubah menjadi board panjang (mis. 390 × ≥ 1000) dan tetap 0/0/0. Prosa ≤ 1500, total ≤ 3500.
- [ ] `packages/skills/skills/landing.md` (+`polish.md` bila perlu): visual hero mockup tampil utuh di dalam hero (padding bawah hero ≥ 64). Bila isinya terlalu banyak, kurangi baris; jangan dipotong. `Crop /` tidak dipakai untuk mockup hero. Contoh `Crop / Dasbor` dan kalimat "terpotong tepi hero" diganti dan lolos LC-31 0/0/0. Total ≤ 3500.
- [ ] `packages/skills/skills/webapp.md` (baru, prosa ≤ 1500, total ≤ 3500), `packages/skills/src/index.ts`, `README.md`, `tests/skills.test.ts` (`LIMITS.webapp`), `tests/skills-c7.test.ts` (daftar file), `packages/mcp/src/server.ts` (+tes): isi skill dijelaskan di Design Notes. Instruksi menjadi "read_skill core + polish + landing/mobile/webapp di giliran yang sama (paralel)", dan aplikasi desktop/dashboard → webapp. Kata khas C7 dan nama produk latihan tidak dipakai. Domain contoh bukan domain P1–P9.
- [ ] `packages/daemon/src/photos/{providers,net,service}.ts`, `assets.ts`, `config.ts`, `server.ts`, dan `photos.test.ts`: adaptor `UnsplashProvider`, rantai Unsplash (key) → Wikimedia → Openverse, tangga kata kunci, cache cari di disk, aset jarak jauh + cache render + placeholder, `download_location` sekali per (ref, docId), dan `status` (`provider`, `keyFile` Unsplash). Pexels dikeluarkan dari rantai cari; `byId` tetap untuk ref lama. Rincian di Design Notes. Tes memakai fetch tiruan untuk setiap baris matriks foto, plus tes kebocoran key.
- [ ] `packages/exec/src/api.ts`, `packages/skills/skills/api.md` (regenerasi), `core.md`, dan deskripsi `photo_search` di MCP: ref `unsplash:<id>`. Panduan kata kunci di core: 2–3 kata benda Inggris visual; orang = `<peran> portrait` (mis. "chef portrait"); daemon menyederhanakan sendiri bila kosong, jadi jangan mengulang pencarian. Ganti "CC0/PD dulu" dengan "subjek jelas, berwarna". core tetap ≤ 4000.
- [ ] Commit skill/mesin/check. Sesudah itu baru task rubrik.
- [ ] `bench/src/lakar/run.ts`, `practice/main.ts`, `round/main.ts`, `round/score.ts`, `rejudge.ts` (+tes): `boardSizeProblemsFor(spec, boards, rule)` dengan `rule = sizeRuleFor(rubricVersion)`. Bila rubrik ≥ 2.2 dan spec bertinggi tetap dengan lebar ≤ 480 (mobile), board harus selebar spec dan setinggi ≥ spec. Rubrik di bawah 2.2 tetap tepat. Aturan yang sama dipakai untuk Lakar (gerbang) dan pen.dev (aturan 4) sehingga simetris. Penjaga rubrik practice menerima versi saat ini (= `rubric.json` = baris Lampiran B, sha cocok) dan mencatatnya. Seri yang sudah selesai tidak bisa dijalankan lagi karena `maxIter`. `EXPECTED_PHOTO_PROVIDER` menjadi `unsplash` (probe: penyedia unsplash, ≥ 1 hasil, `fallbackReason` bukan `unsplash-*`). `--reuse-pendev` menerima `j` (semua prompt) atau peta `P8=1,P9=1`. Prompt di luar peta menjalankan pen.dev baru, sehingga preflight pen-desktop, penjaga md5 `.pen`, dan restart pen-desktop sesudah seri berlaku. Laporan per prompt mencatat iterasi sumber pen.dev. Seri `polish`: `maxIter 5`, `budgetUsd 30.24`, `COST_ESTIMATE` polish `{pendev 0.6, lakar 1.15, judge 0.8}`. Laporan iterasi ≥ 3 mencatat versi rubrik per iterasi di tabel "iterasi 1 vs sekarang" serta wall pen.dev P7 lama vs baru. Tes: laporan round-1/2 di-render ulang tanpa perubahan byte.
- [ ] Rubrik (task terakhir sebelum seri; cadangkan DESIGN.md ke scratchpad lebih dulu): Lampiran B → `Versi rubrik: 2.2 (2026-11-19)`. Baris R1 kolom 2/0: "ukuran mengikat" berarti lebar tepat; untuk layar mobile, tinggi ≥ yang diminta sah (satu board panjang bergulir), sedangkan tinggi lebih kecil atau lebar lain = salah. Aturan 4 dan bullet alasan "board lebih tinggi = ruang konten tambahan" disesuaikan untuk board mobile. Jalankan `cli.js rubric-snapshot` → `bench/rubric/v2.2/` + `rubric.json`. Catat versi + sha Lampiran B dan sha teks juri di plan dan LOG.md. Commit.
- [ ] Build, test, `systemctl --user restart lakard`, `tools/node26/verify.sh`. Seri (sesi orkestrasi, sesudah review): iterasi 3 `practice --series polish --iter 3 --reuse-pendev P8=1,P9=1` (P7 pen.dev baru dan Lakar P7–P9 baru). Bila ada prompt Kalah dan anggaran mengizinkan, iterasi 4/5 dijalankan dengan `--reuse-pendev P7=3,P8=1,P9=1` sesudah perubahan yang menyasar penyebabnya. Bila batas habis, HALT `blocked` dengan laporan. Hasil dicatat di LOG.md §1.24, termasuk dampak rerun pen.dev P7 terhadap perbandingan iterasi 1–2, lalu dilaporkan ke Adam beserta PNG (done_checkpoint).

**Acceptance Criteria:**
- Given agen MCP baru, when `read_skill` tanpa name, then `webapp` tersedia, dan instruksi server serta deskripsi read_skill menyebut webapp untuk aplikasi desktop/dashboard.
- Given `pnpm test`, when dijalankan, then semua tes lulus: batas token (core ≤ 4000, webapp ≤ 3500/1500, mobile/landing ≤ 3500/1500), C7 skill dan prompt, contoh skill 0/0/0 (termasuk contoh mobile panjang dan hero tanpa crop), fixture LC-12/LC-20/LC-31, dan tes foto tanpa jaringan.
- Given lakard dengan key Unsplash nyata, when `photo_search` potret dijalankan dari agen, then hasil datang dari `unsplash`, `/status` hanya melaporkan `keyFile: present`, dan `grep` isi key di repo, `bench/runs`, log journal lakard, dan `<dataDir>` tidak menemukan apa pun (dicek lewat skrip yang membaca key ke variabel, tanpa mencetaknya).
- Given dok P7 iterasi 2 (dua board), when `layout_check` dijalankan dengan build baru, then LC-12 memberi warning pola usang. Given board panjang hasil iterasi 3, then LC-12 tidak memberi temuan ukuran.
- Given rubrik 2.2, when `boardSizeProblemsFor` dipanggil untuk P7 dengan board 390×1177 (pen.dev) atau 390×1320 (Lakar), then tidak ada masalah ukuran. Dengan versi 2.1, hasilnya tetap masalah, dan laporan round-1/2 tidak berubah.
- Given seri polish iterasi 3 (dan 4/5 bila perlu), when laporan `bench/polish-<k>.md` dibaca, then P7–P9 semuanya Setara/Lebih baik, emoji 0, gerbang 0, waktu ≤ 1,5× wall pen.dev prompt yang sama (AD-13), biaya 1.24 ≤ $17,50 (kumulatif seri ≤ $30,24), dan PNG tersedia untuk Adam. Bila tidak tercapai dalam batas, HALT `blocked`.

## Implementation Notes

- Orkestrator (2026-11-19, plan disetujui, commit `2bedc7d`): (1) cache render daemon + placeholder offline disetujui sebagai bentuk hotlink, dengan syarat: URL yang tersimpan di meta adalah URL Unsplash dari API; byte foto Unsplash tidak pernah masuk `assets/` atau git; cache mengikuti Cache-Control, berbatas ukuran, dan boleh dihapus kapan saja. Catat sebagai follow-up arsitektur (AD-6/AD-10, R11) dan sebagai risiko kepatuhan yang perlu dikonfirmasi Adam. (2) `utm_source` default `lakar`, bisa dikonfigurasi (`unsplash_app_name`); Adam perlu menyamakannya dengan nama aplikasi di dashboard Unsplash. (3) Kriteria golden B tidak diubah (follow-up G1).
- Pembagian kerja: implementer mengerjakan semua task kecuali menjalankan seri bench (task terakhir hanya sampai build/test/restart lakard/verify.sh dan `--dry-run`). Seri iterasi 3–5 dijalankan sesi build sesudah review. Implementer tidak membaca `bench/polish-*.md`, berkas juri, atau rubrik sebelum task rubrik; sesudah task rubrik tidak menyunting skill. Commit di `g0` per tahap (check, skill, foto, bench, rubrik), tanpa push.
- Implementer (2026-11-19): semua task kecuali seri bench selesai. Commit: `9ab9ac2` (check), `73bfa5e` (skill + foto + catatan arsip LOG), `d416f6c` (bench), commit rubrik 2.2 sesudahnya. `pnpm build` + `pnpm test` 957/957, `api.md` mutakhir, `systemctl --user restart lakard` active (`/status` foto `unsplash`, `keyFile: present`), `tools/node26/verify.sh` semua OK (snapshot C9 identik), dry-run iterasi 3 lulus. Implementer tidak menjalankan seri, tidak membaca `bench/polish-*.md`/berkas juri, dan tidak menyunting skill sesudah membaca Lampiran B.
- Pindaian arsip (96 dok, 134 board; rincian `bench/practice/LOG.md` §1.24): LC-12 0 → 33 warning (semuanya pola dua board usang; 0 temuan ukuran/tinggi pas), LC-20 34 → 34 (identik per dok), LC-31 – → 10 error di 10 dok (5 kasus unik: A round-1, A round-2, A uji-1, P9 iterasi 2, P5 effects-3). Semua crop PNG LC-31 = cacat nyata (0 positif palsu) → LC-31 tetap error·gerbang. Dok gate > 0: 65 → 71. Aturan lain tidak berubah di satu dok pun.
- Skill: core 3967/4000, landing 3486 (prosa 1500/1500), mobile 3176 (prosa 1369), webapp 2819 (prosa 924); contoh mobile 390 × 1114, hero landing tanpa crop, dan webapp 1440 × 900 lolos 0/0/0.
- Verifikasi key nyata: `photo_search "chef portrait"` lewat lakard → `unsplash`, 3 hasil, tanpa fallbackReason; `/status` hanya `keyFile: present`; grep isi key (dibaca ke variabel, tidak dicetak) di repo (termasuk `bench/runs`), `~/.local/share/lakar`, dan journal lakard = 0.
- Rubrik 2.2: sha256 Lampiran B `4d228aa68e7c2026cbe40744b0809656cc73a49e99f17ac297cf9a9075d3b0a2`; teks juri A `e3213b0bfccaf09eaab9d317ede5b961a1081b67feaf748e2d60474bb95aa7d7`, B `e098f100c8561f809ac6c238fd701d62bd8b2777145c148e414685ec73891e06`; latihan P7 `610fe324…`, P8 `8ef484ce…`, P9 `a8ed7128…` (lengkap di LOG.md). Cadangan DESIGN.md sebelum edit: scratchpad sesi (`DESIGN.md.bak-1.24`).

## Plan Change Log

- 2026-11-19 (implementer): commit tahap skill dan foto digabung (`73bfa5e`) karena tes daemon/MCP yang sama memuat perubahan keduanya; check, bench, dan rubrik tetap commit terpisah.
- 2026-11-19 (implementer): LC-31 tidak melaporkan node (atau keturunan node) yang sudah dilaporkan LC-02a, agar satu potongan tidak dihitung dua kali di gerbang. Akibatnya kasus "terpotong board" pada wadah yang melewati board kebanyakan sudah tertangkap LC-02a; LC-31 terutama menangkap mockup di `Crop /` bebas.
- 2026-11-19 (implementer): perkiraan plan "P9 iterasi 1/2" sebagai positif LC-31 ternyata hanya iterasi 2; P9 iterasi 1 memakai foto + kartu `Overlay /` dengan padding bawah hero 96 (tidak terpotong).
- 2026-11-19 (implementer): LC-12 "tinggi pas = N" memakai N = H − sisa + 24 (jarak 24 ke zona/tepi), minimal 844; isi utama = anak flow terakhir wadah utama (turun lewat wadah transparan, seperti LC-20 sub-cek 1). Bilah aksi di `mobile.md` kini padding 16 20 di atas home indicator (y = H − 34 − tinggi), bukan padding bawah 34.
- 2026-11-19 (implementer): `rejudge` memakai versi rubrik beku putaran sumber untuk aturan ukuran (round-1/2 → persis), bukan rubrik saat ini. Re-render byte-identik diuji untuk semua laporan latihan/efek/polish tersimpan; round-1/2 diuji lewat pelanggaran ukuran tersimpan (round-1 v1 tidak bisa di-render dengan renderer saat ini, dan `round-2.md` memuat catatan implementer manual).
- 2026-11-19 (implementer): foto Unsplash — tinggi info `photo()` = lebar ≤ 2880 × rasio API (tanpa unduhan byte); rute `/assets/<id>` menyajikan aset jarak jauh dengan `cache-control: no-cache` (placeholder `no-store`); `download_location` dipanggil di daemon sebelum snippet bersama impor, gagal dicatat di meta (`downloadErrors`). `X-Ratelimit-Remaining` 0 → Unsplash dilewati 1 jam.

## Review Triage Log

### 2026-11-19 — Review pass
- verdicts: 5 findings — high 0, medium 3, low 2, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` LC-12 "tinggi pas" pada board mobile panjang tanpa zona bawah memakai tepi board sebagai batas, sehingga saran tinggi menaruh isi di bawah `Home indicator` — terverifikasi (`bottomZone` melewati `Home indicator`, limit = h). Dipatch (`4f86c29`): tanpa zona, batas = tepi atas `Home indicator`; fixture negatif + positif.
  - `[low]` `[patch]` TTL cache cari 24 jam diperbarui setiap hit memori, dan hit disk memakai `at = now` — terverifikasi. Dipatch (`4f86c29`): hit memori tidak di-set ulang, hit disk memakai `at` tersimpan; tes 23 j → 25 j miss.
  - `[medium]` `[patch]` `remaining === 0` basi memblokir Unsplash lagi pada setiap hit cache sesudah cooldown — terverifikasi (`finally` jalan juga pada hit cache). Dipatch (`4f86c29`): `remaining` di-reset sesudah blokir dipasang; tes sesudah cooldown.
  - `[medium]` `[patch]` C7: `webapp.md` memakai contoh "(terlambat, stok tipis, menunggu)" dan "vs minggu lalu" yang mirip isi prompt latihan P8 — terverifikasi lewat grep. Dipatch oleh sesi baru tanpa konteks rubrik/prompt (implementer dan sesi build sudah membaca Lampiran B): "(lewat tenggat, hampir habis, menunggu persetujuan)" dan "vs periode lalu"; tes skill/C7/contoh 36/36.
  - `[low]` `[patch]` JSDoc `firstBoardId` berpindah ke atas `imageAssetIds` (`server.ts`) — terverifikasi. Dipatch (`4f86c29`).

## Design Notes

**(a) Ukuran simetris.** Aturan R1 juri dan cek mekanis memakai satu definisi: untuk layar mobile, lebar sama dengan yang diminta dan tinggi ≥ yang diminta. Landing tetap hanya lebar, sedangkan app/dashboard tetap tepat. Dengan begitu pen.dev P7 390×1177 tidak lagi melanggar, dan Lakar boleh berbentuk sama. Konsekuensinya, "pen.dev melanggar brief" di aturan 4 tidak lagi menetralkan veto daya tarik P7. Versi dibekukan per run (`frozen.json`) dan dipakai `sizeRuleFor`, sehingga keputusan lama tetap sama.

**(b) webapp.md** (kata sendiri): kanvas 1440×900; sidebar 240 dengan item aktif berisi fill aksen (bukan sekadar tint) dan grup berlabel. Satu kartu KPI utama ber-fill warna merek/deep dengan teks terang; KPI lain di permukaan putih atau ber-tint. Latar halaman ber-tint netral-merek, bukan abu murni. Grafik bervariasi dalam satu layar: batang bertumpuk/berkelompok untuk komposisi, area bergradasi untuk tren, sparkline di KPI, dan garis tipis tunggal hanya sebagai pelengkap. Tabel: kolom angka rata kanan tabular, satuan kecil, baris bermasalah ber-tint, dan status `Badge` bertitik. Chip delta berwarna dengan ikon arah dan pembanding. Header dengan filter atau dropdown konteks. Daftar slop webapp: semua kartu putih + garis tipis + satu aksen biru; grafik garis tipis tanpa area/legenda; KPI telanjang tanpa delta; sidebar polos tanpa penanda aktif yang tegas. Satu contoh js teruji 0/0/0 berukuran ringkas (KPI utama + batang bertumpuk dari `rect`). Alur: 1–2 execute.

**(c) Foto dan AD-6/AD-10 (keputusan).** Chromium render memblokir semua host selain localhost (`DAEMON_BROWSER_ARGS`), sehingga hotlink langsung dari halaman render ditolak. Itu juga melemahkan AD-6/AD-14. Keputusannya: foto Unsplash menjadi **aset jarak jauh**. `assetId = sha256("unsplash:" + id)` (pola 64-hex sah, skema tidak berubah). Meta `assets/meta/<id>.json` berisi `remote: {provider:'unsplash', url: urls.raw + w=2880&q=80&fm=jpg&fit=max (ixid dipertahankan), downloadLocation}` dan **tanpa** byte di `assets/`. Rute `/assets/:hash` untuk aset jarak jauh dilayani lewat **cache HTTP render** `<dataDir>/cache/remote-images/` (dikunci sha url, mengikuti `Cache-Control` dengan batas 30 hari, total ≤ 256 MB LRU, boleh dihapus kapan saja). Cache ini tidak pernah diekspor, dirujuk dokumen, atau masuk git, dan setiap miss mengambil URL hotlink resmi. Cache dingin + jaringan gagal → placeholder PNG kecil berwarna `color` foto, ditambah catatan aditif di respons screenshot/export. Render module tetap murni (AD-6), dan golden render tidak memakai Unsplash, sehingga determinismenya utuh. Yang berubah adalah AD-10 ("dirujuk lokal", "unduhan hanya saat impor") dan R11 epic ("render tanpa jaringan" kini berlaku kecuali cache Unsplash dingin). **Follow-up arsitektur:** `bmad-architecture` memperbarui AD-10, §Deferred penyedia foto, dan R11/Decision epic (Unsplash sebelumnya ditolak, kini dibalik oleh Adam).
- Unsplash: `GET /search/photos?query&per_page≤12&orientation(landscape|portrait|squarish)&content_filter=high`. Hasil `premium`/`plus.unsplash.com` dibuang. Pratinjau memakai `urls.thumb`. Kredit di meta saja: `creator=user.name` dan `creatorUrl`/`sourcePageUrl` dengan `utm_source=<unsplash_app_name, default "lakar">&utm_medium=referral`. Lisensi "Unsplash License" (`https://unsplash.com/license`) dan credit "Foto: <nama> / Unsplash". Bila `X-Ratelimit-Remaining` = 0, Unsplash dilewati sampai reset (`unsplash-429`).
- Tangga kata kunci (semua penyedia, maks 3 anak tangga berbeda per penyedia): (1) kueri apa adanya; (2) dua kata isi pertama (bila ≥ 3 kata); (3) kata kategori (kata orang → `portrait`, selain itu kata isi terakhir), dan orientation dibuang di anak tangga terakhir. Urutannya: per penyedia semua anak tangga, lalu penyedia berikutnya. Error penyedia langsung lompat. Cache disk: kunci `provider|orientation|limit|query`, TTL 24 jam, maks 500 entri, di `<dataDir>/cache/photo-search/`.

**(d) LC-31 "mockup terpotong rata".** Node frame ber-cat (fill tak transparan, stroke, atau bayangan) dengan ≥ 1 teks turunan, yang bounds-nya melewati tepi bawah clip terdekat (frame `clip:true` mana pun, termasuk `Crop /`, atau board) > 1 px. Selain itu, tepi bawah clip harus rata (≤ 2 px) dengan tepi bawah leluhur seksi selebar ≥ 90% board atau dengan board. Dikecualikan: leluhur `Scroll /` (dok lama), rotasi, dan `Overlay /`. Detail: "terpotong rata Npx di tepi bawah <seksi>". Saran: "tampilkan utuh (padding bawah ≥ 64) atau kurangi isi".

**Anggaran dan iterasi.** Polish-2 (reuse): Lakar $2,98 + juri $2,22 = $5,20. Perkiraan iterasi 3 (P7 pen.dev baru ≈ $0,6, Lakar +10% untuk webapp) ≈ $6,3, dan iterasi 4/5 (reuse) ≈ $5,6. Batas 1.24: maks 3 iterasi (3–5) dan $17,50, jadi kumulatif seri ≤ $30,24. `budgetProblem` menolak iterasi bila sisa < perkiraan.

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm build && /opt/node-26/bin/pnpm test`: lulus semua.
- `/opt/node-26/bin/node scripts/gen-skill-api.mjs && git diff --exit-code packages/skills/skills/api.md`: api.md mutakhir.
- `systemctl --user restart lakard && systemctl --user is-active lakard`: `active`. `/status` foto `unsplash`, `keyFile present`.
- Skrip arsip di scratchpad pada `$(find bench/runs ~/.local/share/lakar/docs -name '*.lakar.json')`: ≥ 90 dok. Jumlah LC-12/20/31 sesuai catatan, dan LC-31 error 0 positif palsu.
- `/opt/node-26/bin/node bench/dist/cli.js practice --series polish --iter 3 --reuse-pendev P8=1,P9=1 --dry-run`: preflight lulus, rubrik 2.2, dan rencana P7 pen.dev baru + restart pen-desktop.
- `tools/node26/verify.sh`: lulus (C9).

**Manual checks:**
- Crop PNG setiap temuan LC-31 error di arsip menunjukkan kartu terpotong nyata.
- PNG iterasi 3: P7 satu board panjang dengan tab bar di bawah, P8 tidak "semua putih", dan P9 hero utuh dengan foto potret Unsplash.

## Auto Run Result

Status: ready-for-dev — fase plan saja (plan_checkpoint). Berhenti menunggu persetujuan orkestrator sebelum kode produk diubah.

- Keputusan menunggu tinjauan: aset jarak jauh Unsplash dengan cache HTTP render daemon (AD-10/R11 follow-up arsitektur), rubrik v2.2 (R1 mobile: lebar tepat, tinggi ≥ yang diminta; versioned via `sizeRuleFor`), LC-31 baru (awal error·gerbang, tunduk pindaian arsip), `--reuse-pendev` per prompt, batas 1.24 maks 3 iterasi / $17,50 (kumulatif seri ≤ $30,24).

Status: blocked (2026-11-19) — kode, review, dan verifikasi selesai; seri polish iterasi 3 tidak bisa dijalankan.

- **Ringkasan:** board mobile panjang tunggal (skill + LC-12 + fixture LC-20), aturan ukuran simetris per versi rubrik beku (`sizeRuleFor`, rubrik 2.2), skill `webapp.md`, foto Unsplash (tangga kata kunci, cache cari disk, aset jarak jauh + cache render + placeholder, `download_location` per (ref, docId), urutan Unsplash → Wikimedia → Openverse), mockup hero utuh (skill) + LC-31 (error·gerbang), `--reuse-pendev` per prompt, seri polish maks 5 / $30,24.
- **Commit:** `2bedc7d` (plan), `78481ae` (persetujuan), `9ab9ac2` (check), `73bfa5e` (skill + foto), `d416f6c` (bench), `54120a7` (rubrik 2.2 + snapshot), `4f86c29` (perbaikan review), `e14f0d1` (C7 webapp + log triase), `7c0f29c` (iterasi 3 dibatalkan).
- **Review (quick):** 5 temuan — 5 dipatch (3 medium, 2 low), 0 ditunda, 0 ditolak. Follow-up review: **true** (3 medium dipatch; risiko yang belum diverifikasi ulang: jalur cache cari/blokir Unsplash dan LC-12 tanpa zona hanya teruji dengan fixture, belum di run agen nyata).
- **Pindaian arsip (96 dok):** LC-31 10 error = 5 kasus unik (A round-1, A round-2, A uji-1, P9 iterasi 2, P5 effects-3), semua cacat nyata → tetap error·gerbang; LC-12 33 warning (pola dua board usang); LC-20 tidak berubah; dok dengan gate > 0: 65 → 71.
- **Verifikasi:** `pnpm build` lulus; `pnpm test` 959/959; api.md mutakhir; lakard active (`/status` foto `unsplash`, `keyFile present`); cek key nyata tanpa kebocoran (implementer); `tools/node26/verify.sh` semua OK, snapshot C9 identik.
- **Blocking condition:** run pen.dev P7 iterasi 3 gagal di `pen-newdoc`: MCP pencil melaporkan batas paket pen.dev periode tagihan ini tercapai (semua tool desain diblokir). Tidak ada upaya mengakali; harness berhenti sebelum Lakar/juri, biaya $0, kumulatif seri $12,74. `.pen` lama utuh (48/48). Pilihan untuk Adam: upgrade paket lalu `practice --series polish --iter 3 --reuse-pendev P8=1,P9=1 --resume`, atau ubah rencana (pakai ulang pen.dev P7 iterasi 1 = 390×1177, sah di rubrik 2.2, dengan `--reuse-pendev 1`).
- **Risiko sisa / follow-up:** kepatuhan cache render Unsplash perlu konfirmasi Adam; `utm_source` default `lakar` harus disamakan dengan nama aplikasi di dashboard Unsplash (`unsplash_app_name`); follow-up arsitektur AD-6/AD-10, §Deferred foto, R11 dan Decision epic (Unsplash), AD-15 (pola dua board/`scrollY`); DESIGN.md (pola mobile, Lampiran A LC-12/LC-31) dan kriteria golden B belum diperbarui; landing prosa 1500/1500 dan core 3967/4000 di batas token; LC-31 menambah beban gerbang.
