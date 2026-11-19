# @lakar/bench

Harness benchmark Lakar vs pen.dev: baseline pen.dev per prompt, putaran A–E (agen `claude -p` per alat), juri buta 3×,
dan laporan `bench/round-<id>.md|json`, `bench/score-<prompt>.md|json` (putaran resmi ≥ 2:
`bench/round-<n>/score-<prompt>.md|json`).

- **AD terkait:** AD-13 (protokol beku, C7: teks juri tanpa nama alat/istilah internal).
- **Arah dependensi:** `bench → schema` saja (klien HTTP lakard sendiri, tanpa mengimpor mcp/daemon).

## Perintah

```bash
/opt/node-26/bin/node bench/dist/cli.js pendev-baseline [--prompts X,Y] [--dry-run]
/opt/node-26/bin/node bench/dist/cli.js round --round <uji-k|n> [--dry-run] [--resume]
/opt/node-26/bin/node bench/dist/cli.js rejudge --from <uji-k|n> --label <slug> [--resume] [--dry-run]
/opt/node-26/bin/node bench/dist/cli.js rubric-snapshot [--version <v>]
/opt/node-26/bin/node bench/dist/cli.js practice [--series practice|effects|polish] --iter <k> [--only P1,P3] [--reuse-pendev <j>|P8=1,P9=1] [--resume] [--dry-run]
```

## Protokol A–E dan hash per prompt

`bench/protocol/` memuat pembungkus, prompt golden A–E (`prompts.json` = blockquote golden-set persis, C7 (a)), dan config
(`protocol.json`, `promptIds` A–E). Penjaga baseline memakai **hash per prompt** (`promptHash`): sha256 JSON kanonik (kunci
terurut) `{scheme: "lakar-bench-prompt/1", wrapper, config (protocol.json tanpa promptIds), prompt}`. Menambah prompt tidak
mengubah hash prompt lain; mengubah teks satu prompt hanya mengubah hash prompt itu; mengubah pembungkus atau field config lain
mengubah semuanya. `protocolHash` (byte ketiga file) tetap dicatat sebagai info. `bench/mcp/pencil.json` tidak ikut hash
(versi alat dicek terpisah).

- **Migrasi G0:** `bench/protocol/legacy/907cb36f/` = snapshot beku protokol G0 (`git show 925c66d:bench/protocol/*`).
  `bench/baseline-pendev.json` menambah `promptHashes {A, B}` (dihitung kode dari snapshot itu) dan `promptHashMigration
  {fromProtocolHash, legacyDir, date}`; field lain tidak disentuh. Tes membuktikan `protocolHash(legacy)` = `907cb36f…`,
  pembungkus/prompt legacy = isi baseline lama, dan hash per prompt A/B dari legacy = dari protokol baru = yang tercatat.
- **Baseline per prompt** (`bench/src/baselines.ts`): indeks `bench/baseline-pendev.json` + `bench/baseline-pendev-<IDS>-<tanggal>.json`.
  Prompt yang dicakup beberapa file memakai `date` terbaru; yang lain dicatat tergantikan. Prompt dengan sukses < `runsPerPrompt`
  tidak dipakai. File tanpa `promptHashes` = masalah (tanpa fallback ke hash utuh).
- **`pendev-baseline [--prompts X,Y] [--dry-run]`:** default = prompt tanpa baseline sah (belum diukur, atau hash prompt, model,
  Claude Code, pen.dev desktop ≠ baseline). Seri berselang hanya prompt terpilih (C1 D1 E1 C2 …; `seriesOutcome` dengan prompt
  terpilih). Keluaran eksklusif `bench/baseline-pendev-<IDS>-<YYYY-MM-DD>.{md,json}` dengan `promptHashes` (sudah ada → exit 64,
  juga saat dry-run); `bench/baseline-pendev.{md,json}` G0 tidak pernah ditimpa. `--dry-run` mencetak status baseline, hash, dan
  argv per prompt tanpa spawn.
- **Ukuran mengikat C–E** (`GOLDEN_BOARD_SPECS`): C 1440×1024 dan E 1440×900 persis; D lebar 390 dengan tinggi ≥ 844
  (`heightMode: 'min'`, apa pun versi rubrik). A/B tetap mengikuti `sizeRuleFor`.

## Rubrik juri (v2) dan snapshot

Rubrik juri dibangun saat runtime dari DESIGN.md Lampiran B dan kriteria golden prompt protokol (`promptIds`, kini A–E;
keduanya di-exclude git). Rubrik saat ini **v2.3** (story 2.2, 2026-11-19): golden B1 = board lebar 390 dan tinggi ≥ 844
(bukan persis 390×844); D2 = satu board panjang selebar 390 (tinggi mengikuti konten, min 844), header di atas dan bilah
bayar menempel di bawah, bukan dua board/strip gabungan. Snapshot v1–v2.2 hanya memuat teks juri A/B dan tidak diubah.
Riwayatnya disimpan tracked di `bench/rubric/`:

- `rubric-snapshot` menulis `bench/rubric/v<ver>/{lampiran-b.md, golden-kriteria.md, judge-text-<id>.md}` untuk setiap
  `promptIds` protokol (v2.3: A–E) secara eksklusif (dir sudah ada dan identik → no-op; berbeda → error, naikkan versi) dan
  memperbarui `bench/rubric/rubric.json` `{version, date, judgeTextSha256:{A..E}, sourceSha256}`. Versi dibaca dari baris
  `Versi rubrik: <v> (<tanggal>)` di Lampiran B; `--version` hanya untuk v1 (belum ada baris versi).
- Rubrik v2: delapan kriteria juri (R1, R2, R4, R5, R6, R8, R9 kekayaan informasi & detail, R10 polesan warna &
  komponen), skor maks 16. Aturan keputusan v2 (`decide`): T = total median, D = R9 + R10; Kalah-daya-tarik
  (D_L ≤ D_P − 2 atau R9/R10 0 vs 2) dinetralkan menjadi Setara hanya bila pen.dev melanggar brief mengikat
  (`boardSizeProblems` frame pen.dev, atau median R1 pen.dev = 0); Lebih baik butuh T_L ≥ T_P + 3 dan D_L ≥ D_P.
  Juri tidak melihat aturan keputusan.
- **Aturan ukuran mengikat (story 24):** `sizeRuleFor(<versi rubrik beku run>)`. Rubrik < 2.2 (atau tak diketahui) =
  persis. Rubrik ≥ 2.2 = untuk spesifikasi layar mobile (tinggi tetap, lebar ≤ 480) lebar sama dan tinggi ≥ yang diminta
  (satu board panjang bergulir sah); landing tetap hanya lebar, app tetap persis. Aturan yang sama dipakai untuk gerbang
  Lakar dan pelanggaran brief pen.dev (simetris). Golden B1/D2 v2.3 sejalan dengan aturan ini (tes `lakar.test.ts`); gerbang
  ukuran tidak menghitung jumlah board, jadi D2 (satu board panjang) dinilai juri lewat R1. Versi diambil dari
  `frozen.json` run (putaran: `judge.rubricVersion`, latihan: `rubric.version`; `rejudge`: versi beku putaran sumber), jadi
  laporan lama yang di-render ulang tidak bergeser.
- **Penjaga sha:** setiap laporan `round`/`rejudge` mencatat versi rubrik dan sha256 teks juri per prompt; teks juri
  juga disalin ke `<run>/judge/<prompt>/judge-text.md`. Putaran resmi di-abort (`officialFreezeProblems`) dan
  `rejudge` menolak berjalan bila sha teks juri saat ini ≠ `bench/rubric/rubric.json` (DESIGN.md/golden-set.md
  diubah tanpa `rubric-snapshot`).

## Penilaian ulang (`rejudge`)

Menilai ulang strip PNG putaran yang sudah ada (`bench/round-<from>.json` + `bench/runs/rounds/<from>/*.png`) dengan
rubrik saat ini, tanpa agen desain: hanya `claude -p` juri (3 ulangan per prompt, label X/Y acak `crypto`, buta seperti
`round`), tanpa lakard, tanpa pen.dev, tanpa menyentuh `.pen`. Status run dan gerbang Lakar diambil dari sumber.

- Preflight sebelum spawn: strip dan laporan sumber ada (pesan menyebut path), teks juri lulus penjaga bocor + C7,
  sha = `rubric.json`. `--dry-run` mencetak teks juri, sha, dan argv tanpa spawn.
- Label yang sudah ada (`bench/runs/rejudge/<label>/` atau `bench/rejudge-<label>.md`) ditolak (exit 64);
  `--resume` memakai ulang ulangan `ok`.
- Keluaran mentah gitignored di `bench/runs/rejudge/<label>/`; laporan tracked `bench/rejudge-<label>.md|json`
  (sumber, model, Claude Code, HEAD, versi rubrik, sha per prompt, skor median + rentang, T dan D, keputusan v2 vs
  keputusan sumber vs keputusan Adam, bukti R9/R10 per ulangan, pelanggaran brief pen.dev, biaya). Untuk `--from 1`
  laporan juga menilai ambang lulus kalibrasi yang ditetapkan sebelum run; putaran lain = hold-out, hanya dilaporkan.

## Latihan skill (`practice`)

Latihan menguji revisi skill Lakar pada empat prompt latihan (`bench/practice/prompts.json`, P1–P4, bukan A–E) dengan
runner, pembungkus (`bench/protocol/wrapper.txt`, read-only), dan juri rubrik saat ini yang sama dengan `round`.
**Latihan bukan gerbang G0**: keputusan G0 hanya dari putaran resmi A/B. Hasilnya dipakai untuk mengiterasi skill.

- **Prompt beku:** sha256 `prompts.json` dikunci di `bench/src/practice/prompts.ts` (`PRACTICE_PROMPTS_SHA256`);
  loader menolak isi lain. Tes `tests/practice-prompts.test.ts`: sha, tanpa n-gram 6 kata prompt A–E (kalimat penutup baku
  dibuang), tanpa frasa Kriteria/Prosedur/Risiko golden atau token terlarang, nama produk tidak ada di golden-set.
  `tests/skills-c7.test.ts` memperlakukan teks dan nama produk latihan sebagai sumber/token terlarang untuk skill.
- **Juri:** teks juri dibangun tanpa kriteria golden (`buildJudgeTextWith(design, undefined, prompt)`: bagian kriteria
  diganti satu kalimat netral). Preflight mewajibkan rubrik `rubric.json` (≥ 2.1, versi dicatat di `frozen.json`) = baris versi Lampiran B dan sha
  Lampiran B = snapshot, lalu penjaga bocor + C7 juri (target `c7Targets` + prompt latihan hasil render).
- **Run:** per prompt pen.dev (lewat `runOne`, dokumen baru terverifikasi) lalu Lakar; satu run per alat per prompt per
  iterasi (C8). Sebelum run, dokumen Lakar bench lain (`runs/rounds` + `runs/practice`) diarsip dan lakard **selalu**
  di-restart, lalu `startedAt` wajib > mtime `packages/*/dist` terbaru. `frozen.json` mencatat HEAD, porcelain, sha skill,
  sha dist, versi claude/pen.dev, sha prompt dan teks juri.
- **Keputusan:** strip → juri 3× → `aggregateScores` → `decide` v2 dengan `lakarGate` memakai wall pen.dev prompt yang
  sama sebagai baseline waktu (≤ 1,5×) dan ukuran dari spesifikasi prompt (`boardSizeProblemsFor`). Iterasi lulus bila
  Lakar Setara/Lebih baik di ≥ 3 dari 4 prompt dan di setiap prompt waktu ≤ 1,5 × pen.dev, emoji Lakar (a)/(b)/(c) = 0,
  layout_check gate = 0.
- **`--reuse-pendev <j>` atau `--reuse-pendev P8=1,P9=1`:** run pen.dev iterasi j dipakai apa adanya untuk semua prompt,
  atau per prompt menurut peta (tercatat per prompt di laporan, biayanya tidak dihitung ulang); prompt di luar peta
  menjalankan pen.dev baru. Iterasi sumber tidak lengkap → Abort sebelum spawn. Bila semua prompt memakai ulang, preflight
  tidak mewajibkan service pen-desktop aktif; bila ada pen.dev baru, preflight pen-desktop dan restart pen-desktop sesudah
  seri berlaku (penjaga md5 `.pen` selalu berjalan). `--resume` hanya mengulang run `aborted`/`invalid`.
- **Anggaran:** iterasi maks 8 (iterasi 4–6, iterasi konfirmasi 7, lalu iterasi 8 = ulang penuh iterasi 7 yang batal karena
  cacat harness; dibuka Adam 2026-11-18); biaya kumulatif (dari `bench/practice-<j>.json`) + perkiraan sisa > $58,09 → Abort.
- **Keluaran:** `bench/practice-<k>.md|json` (tracked), strip Lakar `bench/practice/<k>/<P>-lakar.png` (tracked,
  eksklusif), artefak mentah dan strip/`.pen` pen.dev lokal di `bench/runs/practice/<k>/` (EULA). Log iterasi skill:
  `bench/practice/LOG.md`.
- Arsip slug Lakar sebelum run (semua seri dan `round`) memindai `runs/rounds`, `runs/practice`, `runs/practice-effects`, dan `runs/practice-polish`.

### Seri efek (`practice --series effects`, story 22)

Seri latihan kedua untuk efek visual (gradien conic, grain/noise, mesh): dua prompt beku `bench/practice/effects/prompts.json`
(P5 landing gelap berlatar efek, P6 onboarding mobile gelap bergradasi; sha `EFFECT_PROMPTS_SHA256`, loader dan tes yang
sama, penjaga n-gram juga terhadap P1–P4). Runner, pembungkus, juri v2.1, `decide`, C8, `--reuse-pendev`, dan penjaga
md5 `.pen` sama dengan seri `practice`; tanpa `--series` perilaku seri P1–P4 tidak berubah.

- **Config seri** (`SERIES` di `bench/src/practice/main.ts`): maks 3 iterasi, anggaran kumulatif seri $15 (dari
  `bench/effects-<j>.json`), lulus bila P5 **dan** P6 Setara/Lebih baik dengan gerbang waktu/emoji/gate yang sama.
- **Keluaran:** `bench/effects-<k>.md|json` (tracked), strip Lakar `bench/practice/effects/<k>/<P>-lakar.png` (tracked),
  artefak mentah dan strip/`.pen` pen.dev lokal di `bench/runs/practice-effects/<k>/` (EULA). Iterasi > 1 memuat tabel
  Lakar iterasi 1 (sebelum perubahan) vs sesudah.
- **Restart pen-desktop** (izin Adam): sekali per iterasi yang menjalankan pen.dev, sesudah run pen.dev terakhir dan
  sebelum juri (`restartPenDesktopAfterSeries`, `bench/src/sys.ts`): `systemctl restart pen-desktop`, tunggu `is-active`
  dan satu panggilan baca MCP pencil (`get_app_state`) berhasil, maks 120 dtk. Hasil dan durasi tercatat di laporan;
  gagal → laporan ditandai, juri tetap jalan. Tidak pernah saat `--reuse-pendev` atau `--dry-run`.

### Seri polish (`practice --series polish`, story 23)

Seri ketiga untuk disiplin spacing dan komponen: tiga prompt hold-out beku `bench/practice/polish/prompts.json` (P7 mobile
terang, P8 dashboard 1440×900, P9 landing; sha `POLISH_PROMPTS_SHA256`, penjaga n-gram juga terhadap P1–P6). Config:
maks 5 iterasi, anggaran kumulatif $30,24 (`bench/polish-<j>.json`; story 23 $15 + story 24 $17,50 sesudah iterasi 2),
perkiraan biaya per prompt pen.dev $0,6 / Lakar $1,15 / juri $0,8, semua prompt wajib Setara/Lebih baik. Iterasi 1 =
baseline skill/check lama (pen.dev + Lakar + juri); iterasi 2 = sesudah story 23 dengan `--reuse-pendev 1` (C8);
iterasi 3–5 = story 24 (`--reuse-pendev P8=1,P9=1`: P7 pen.dev baru). Laporan memuat tabel iterasi 1 vs sesudah; iterasi
≥ 3 menambah versi rubrik per iterasi dan wall pen.dev iterasi 1 vs sekarang. Run di `bench/runs/practice-polish/<k>/`,
strip Lakar `bench/practice/polish/<k>/`.

## Batasan

- `bench/protocol/*` (hash per prompt; snapshot `legacy/`) dan `bench/mcp/pencil.json` beku; teks juri dan argv agen/juri dari
  `round --dry-run` tidak boleh berubah tanpa keputusan baru. Menambah prompt hanya lewat `prompts.json` + `promptIds`.
- Perilaku proses `claude` (spawn, argumen, env) dan perhitungan skor/emoji/metrik adalah bagian dari hasil;
  refactor tidak boleh mengubahnya.
- Artefak run di `bench/runs/` (gitignored). Fixture transkrip tes ada di `tests/support/stream.ts`.

## Putaran resmi

Satu putaran = semua `promptIds` protokol (A–E): urutan run per prompt pen.dev lalu Lakar (10 run), lalu juri 3× per prompt.
Semua putaran non-dry-run (uji dan resmi) di-abort sebelum run bila ada prompt tanpa baseline sah per hash (belum diukur, hash
prompt ≠ baseline, file baseline tanpa `promptHashes`); `--dry-run` hanya mencetaknya.

ID angka polos (`--round 1`, …) adalah putaran resmi; `uji-<k>` adalah putaran uji dan tidak memakai cek di bawah.
Sebelum run apa pun, putaran resmi di-abort bila `officialFreezeProblems` menemukan masalah: `git status --porcelain`
kode produk + harness (`packages tools scripts bench/src bench/protocol bench/mcp bench/package.json package.json
pnpm-lock.yaml .mcp.json`) tidak kosong; per prompt: baseline belum ada, atau hash prompt, model, Claude Code, atau pen.dev
desktop ≠ baseline terbaru yang mencakup prompt itu (Claude Code/pen.dev berubah → pembekuan gagal sampai baseline diukur ulang); `fonts.missing` tidak kosong atau pool belum siap; sha256 teks juri ≠
`bench/rubric/rubric.json`; `schemaVersion` lakard ≠ `SCHEMA_VERSION` bench (f); penyedia foto `/status.photos` bukan
`unsplash` (g; key Unsplash terpasang, plan 1.24); atau, sesudah restart lakard yang wajib (juga saat arsip kosong), `startedAt` lakard tidak lebih baru
dari file `packages/*/dist` terbaru. Sesudah restart, harness menjalankan satu probe rate limit foto (`POST
/photos/search` kueri netral lewat sesi baru): penyedia harus `unsplash`, ≥ 1 hasil, dan `fallbackReason` tidak
diawali `unsplash-`. Probe gagal → abort sebelum `frozen.json` dan run, tanpa retry otomatis. Penyedia, key, dan hasil
probe dicatat di Versi beku. `--dry-run` hanya mencetak hasil cek serta rencana probe dan restart. Kode di-commit sebelum putaran agar SHA beku memuat produk dan harness.
Laporan memuat keputusan sementara, evaluasi arah bila belum lolos, dan bagian "Konfirmasi Adam" yang hanya diisi Adam.
Putaran A/B lama (G0) memakai `decideG0` dan dirender ulang tanpa perubahan. Putaran A–E (G1) memakai bagian **Keputusan G1**
(`decideG1`) menggantikan bagian G0:

- **Gerbang Lakar G1** = gerbang G0 (layout_check gate = 0, ukuran, waktu ≤ 1,5 × median baseline prompt itu) + R3/R7 mekanis
  (`technicalScores`, Lampiran B §Kualitas teknis) dari temuan `layout_check` final board Lakar per ID aturan. R3 = 2 bila
  LC-07, LC-11, LC-06 semuanya 0; 1 bila totalnya ≤ 5; 0 bila > 5. R7 = 2 bila 0 error non-gerbang (aturan bukan gerbang
  menurut katalog `@lakar/schema`) dan ≤ 3 warning struktural (LC-03/13/14/17/18/21); 1 bila ≤ 2 error non-gerbang dan ≤ 8
  warning struktural (error non-gerbang > 0 ditandai "periksa Adam: false positive?"); 0 selebihnya. Aturan yang belum ada = 0
  temuan. R3 = 0 atau R7 = 0 → gerbang gagal (prompt Kalah). Putaran A/B dan latihan tidak menghitung R3/R7.
- **`decideG1`:** dibatalkan → tidak dapat diputuskan; lolos bila ≥ 4 dari A–E Setara/Lebih baik, ≥ 1 Lebih baik, emoji Lakar
  (a) input agen, (b) LC-01a + LC-01b, (c) median juri = 0, dan rasio waktu ≤ 1,5 di semua prompt; gagal bila ada emoji > 0,
  rasio > 1,5, atau jumlah itu tidak bisa tercapai lagi walau prompt yang belum pasti berakhir Lebih baik (mis. 2 Kalah);
  selebihnya (prompt hilang/tidak dapat dinilai yang masih bisa mengubah hasil, waktu/emoji tak terukur) → tidak dapat diputuskan.
- `rejudge` membangun dan mengecek sha teks juri hanya untuk prompt putaran sumber (A/B untuk putaran G0); sejak v2.3
  (story 2.2) teks juri A–E sudah di-snapshot. `rejudge` tetap memakai aturan ukuran versi beku putaran sumber untuk
  pelanggaran brief pen.dev (mis. round-2 = v2.1 → persis). Putaran A–E resmi tetap mewajibkan sha teks juri A–E = `bench/rubric/rubric.json`. Strip Lakar disalin ke `bench/round-<n>/<prompt>-lakar.png` (tracked, eksklusif); strip dan `.pen`
pen.dev tetap lokal di `bench/runs/rounds/<n>/` (EULA, tidak di-commit).
Putaran resmi ≥ 2 menulis skor ke `bench/round-<n>/score-<prompt>.md|json` agar bukti juri putaran 1
(`bench/score-<prompt>.*`, dirujuk `bench/round-1.md`) tidak tertimpa. Laporan juga memuat rasio wall pen.dev putaran
ini/median baseline sebagai indikator drift (bukan gerbang).

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm --filter @lakar/bench test   # = vitest run --root .. bench/
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
