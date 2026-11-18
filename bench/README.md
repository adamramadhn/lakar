# @lakar/bench

Harness benchmark Lakar vs pen.dev: baseline pen.dev, putaran A/B (agen `claude -p` per alat), juri buta 3×,
dan laporan `bench/round-<id>.md|json`, `bench/score-<prompt>.md|json`.

- **AD terkait:** AD-13 (protokol beku, C7: teks juri tanpa nama alat/istilah internal).
- **Arah dependensi:** `bench → schema` saja (klien HTTP lakard sendiri, tanpa mengimpor mcp/daemon).

## Perintah

```bash
/opt/node-26/bin/node bench/dist/cli.js pendev-baseline [--dry-run]
/opt/node-26/bin/node bench/dist/cli.js round --round <uji-k|n> [--dry-run] [--resume]
/opt/node-26/bin/node bench/dist/cli.js rejudge --from <uji-k|n> --label <slug> [--resume] [--dry-run]
/opt/node-26/bin/node bench/dist/cli.js rubric-snapshot [--version <v>]
/opt/node-26/bin/node bench/dist/cli.js practice --iter <k> [--only P1,P3] [--reuse-pendev <j>] [--resume] [--dry-run]
```

## Rubrik juri (v2) dan snapshot

Rubrik juri dibangun saat runtime dari DESIGN.md Lampiran B dan kriteria golden A/B (keduanya di-exclude git).
Riwayatnya disimpan tracked di `bench/rubric/`:

- `rubric-snapshot` menulis `bench/rubric/v<ver>/{lampiran-b.md, golden-kriteria.md, judge-text-A.md, judge-text-B.md}`
  secara eksklusif (dir sudah ada dan identik → no-op; berbeda → error, naikkan versi) dan memperbarui
  `bench/rubric/rubric.json` `{version, date, judgeTextSha256:{A,B}, sourceSha256}`. Versi dibaca dari baris
  `Versi rubrik: <v> (<tanggal>)` di Lampiran B; `--version` hanya untuk v1 (belum ada baris versi).
- Rubrik v2: delapan kriteria juri (R1, R2, R4, R5, R6, R8, R9 kekayaan informasi & detail, R10 polesan warna &
  komponen), skor maks 16. Aturan keputusan v2 (`decide`): T = total median, D = R9 + R10; Kalah-daya-tarik
  (D_L ≤ D_P − 2 atau R9/R10 0 vs 2) dinetralkan menjadi Setara hanya bila pen.dev melanggar brief mengikat
  (`boardSizeProblems` frame pen.dev, atau median R1 pen.dev = 0); Lebih baik butuh T_L ≥ T_P + 3 dan D_L ≥ D_P.
  Juri tidak melihat aturan keputusan.
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
runner, pembungkus (`bench/protocol/wrapper.txt`, read-only), dan juri rubrik v2.1 yang sama dengan `round`.
**Latihan bukan gerbang G0**: keputusan G0 hanya dari putaran resmi A/B. Hasilnya dipakai untuk mengiterasi skill.

- **Prompt beku:** sha256 `prompts.json` dikunci di `bench/src/practice/prompts.ts` (`PRACTICE_PROMPTS_SHA256`);
  loader menolak isi lain. Tes `tests/practice-prompts.test.ts`: sha, tanpa n-gram 6 kata prompt A–E (kalimat penutup baku
  dibuang), tanpa frasa Kriteria/Prosedur/Risiko golden atau token terlarang, nama produk tidak ada di golden-set.
  `tests/skills-c7.test.ts` memperlakukan teks dan nama produk latihan sebagai sumber/token terlarang untuk skill.
- **Juri:** teks juri dibangun tanpa kriteria golden (`buildJudgeTextWith(design, undefined, prompt)`: bagian kriteria
  diganti satu kalimat netral). Preflight mewajibkan rubrik `rubric.json` = 2.1 = baris versi Lampiran B dan sha
  Lampiran B = snapshot, lalu penjaga bocor + C7 juri (target `c7Targets` + prompt latihan hasil render).
- **Run:** per prompt pen.dev (lewat `runOne`, dokumen baru terverifikasi) lalu Lakar; satu run per alat per prompt per
  iterasi (C8). Sebelum run, dokumen Lakar bench lain (`runs/rounds` + `runs/practice`) diarsip dan lakard **selalu**
  di-restart, lalu `startedAt` wajib > mtime `packages/*/dist` terbaru. `frozen.json` mencatat HEAD, porcelain, sha skill,
  sha dist, versi claude/pen.dev, sha prompt dan teks juri.
- **Keputusan:** strip → juri 3× → `aggregateScores` → `decide` v2 dengan `lakarGate` memakai wall pen.dev prompt yang
  sama sebagai baseline waktu (≤ 1,5×) dan ukuran dari spesifikasi prompt (`boardSizeProblemsFor`). Iterasi lulus bila
  Lakar Setara/Lebih baik di ≥ 3 dari 4 prompt dan di setiap prompt waktu ≤ 1,5 × pen.dev, emoji Lakar (a)/(b)/(c) = 0,
  layout_check gate = 0.
- **`--reuse-pendev <j>`:** run pen.dev iterasi j dipakai apa adanya (tercatat di laporan, biayanya tidak dihitung ulang);
  iterasi sumber tidak lengkap → Abort sebelum spawn. Mode ini tidak menjalankan pen.dev, jadi preflight tidak mewajibkan
  service pen-desktop aktif (penjaga md5 `.pen` tetap berjalan). `--resume` hanya mengulang run `aborted`/`invalid`.
- **Anggaran:** iterasi maks 6 (iterasi 4–6 dibuka Adam 2026-11-18); biaya kumulatif (dari `bench/practice-<j>.json`) + perkiraan sisa > $57,80 → Abort.
- **Keluaran:** `bench/practice-<k>.md|json` (tracked), strip Lakar `bench/practice/<k>/<P>-lakar.png` (tracked,
  eksklusif), artefak mentah dan strip/`.pen` pen.dev lokal di `bench/runs/practice/<k>/` (EULA). Log iterasi skill:
  `bench/practice/LOG.md`.

## Batasan

- `bench/protocol/*` (hash protokol) dan `bench/mcp/pencil.json` beku; teks juri dan argv agen/juri dari
  `round --dry-run` tidak boleh berubah tanpa keputusan baru.
- Perilaku proses `claude` (spawn, argumen, env) dan perhitungan skor/emoji/metrik adalah bagian dari hasil;
  refactor tidak boleh mengubahnya.
- Artefak run di `bench/runs/` (gitignored). Fixture transkrip tes ada di `tests/support/stream.ts`.

## Putaran resmi

ID angka polos (`--round 1`, …) adalah putaran resmi; `uji-<k>` adalah putaran uji dan tidak memakai cek di bawah.
Sebelum run apa pun, putaran resmi di-abort bila `officialFreezeProblems` menemukan masalah: `git status --porcelain`
kode produk + harness (`packages tools scripts bench/src bench/protocol bench/mcp bench/package.json package.json
pnpm-lock.yaml .mcp.json`) tidak kosong; protocolHash, model, Claude Code, atau pen.dev desktop ≠
`bench/baseline-pendev.json`; `fonts.missing` tidak kosong atau pool belum siap; atau, sesudah restart lakard yang
wajib (juga saat arsip kosong), `startedAt` lakard tidak lebih baru dari file `packages/*/dist` terbaru. `--dry-run`
hanya mencetak hasil cek dan rencana restart. Kode di-commit sebelum putaran agar SHA beku memuat produk dan harness.
Laporan memuat keputusan G0 sementara (`decideG0`), evaluasi arah bila belum lolos, dan bagian "Konfirmasi Adam" yang
hanya diisi Adam. Strip Lakar disalin ke `bench/round-<n>/<prompt>-lakar.png` (tracked, eksklusif); strip dan `.pen`
pen.dev tetap lokal di `bench/runs/rounds/<n>/` (EULA, tidak di-commit).

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm --filter @lakar/bench test   # = vitest run --root .. bench/
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
