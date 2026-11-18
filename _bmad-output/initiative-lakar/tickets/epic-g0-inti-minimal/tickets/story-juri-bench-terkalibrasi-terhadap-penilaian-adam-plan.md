---
title: 'Juri bench terkalibrasi terhadap penilaian Adam'
type: feature
ticket: '17'
created: '2026-11-18'
status: built
baseline_revision: '9ee43d45187cefdceb74865cb7c301ccd53e1387'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/bench/round-1.md'
  - '{project-root}/bench/README.md'
  - '{project-root}/_bmad-output/initiative-lakar/ux-lakar/DESIGN.md'
  - '{project-root}/_bmad-output/initiative-lakar/ux-lakar/golden-set.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Juri putaran 1 memberi Lakar 9–10 vs pen.dev 6, padahal Adam menilai A Kalah dan B Setara (bench/round-1.md §Konfirmasi Adam). Rubrik Lampiran B menilai kepatuhan dengan bobot besar, tetapi tidak menilai kekayaan informasi dan polesan warna/komponen. R4 bahkan menghukum warna kedua yang bermakna. Aturan `decide` juga tidak mengenal pelanggaran brief oleh pen.dev.

**Approach:** Rubrik naik ke v2. Isinya dua kriteria umum baru yang dinilai dari PNG (R9 kekayaan informasi & detail, R10 polesan warna & komponen), R4 yang direvisi, dan audit kriteria golden yang mewajibkan gaya di luar prompt. `decide` mendapat sumbu "daya tarik" (R9+R10) dan pengecualian untuk pelanggaran brief oleh pembanding. Perintah `rejudge` menilai ulang pasangan PNG yang sudah ada tanpa agen. Kalibrasi 3× pada putaran 1 dan uji-1 dengan ambang lulus yang ditetapkan sebelum run. Versi rubrik dan sha256 teks juri dicatat di setiap laporan, dan snapshot rubrik disimpan tracked di `bench/rubric/`.

## Boundaries & Constraints

**Always:**
- Juri tetap buta: label X/Y diacak dengan `crypto` (kedua penugasan muncul), `judgeLeaks` + `neutralizeInternalTerms` + `tokenLeaks` berlaku untuk teks baru, PNG dikirim apa adanya (hanya IHDR/IDAT/IEND, strip + tile + overview yang sama), tanpa tool/MCP, cwd di luar repo. Juri tidak melihat aturan keputusan (`decide`) maupun skor lama.
- `bench/protocol/*` tidak disentuh: protocolHash tetap `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d` (dicek sebelum dan sesudah).
- C7: rubrik hanya untuk juri. Teks R9/R10/R4 tidak boleh ada di `packages/skills/skills/*.md`, pembungkus, prompt hasil render, atau `packages/mcp/src/server.ts`. Penjaga n-gram `judgeC7Problems` dijalankan di preflight dan di tes.
- C9: semua perintah memakai `/opt/node-26/bin/{node,pnpm}`. `rejudge` hanya men-spawn `claude -p` juri, tanpa restart lakard, tanpa pen.dev, dan tanpa menyentuh `.pen`. `tools/node26/verify.sh` exit 0 di akhir.
- Snapshot rubrik v1 (isi DESIGN.md/golden-set.md saat ini) ditulis ke `bench/rubric/v1/` **sebelum** sumber diedit.
- Setiap laporan (`round`, `rejudge`) mencatat `rubricVersion` dan `judgeTextSha256` per prompt. Putaran resmi di-abort bila sha teks juri ≠ `bench/rubric/rubric.json`.

**Never:**
- Kriteria baru yang menyebut isi prompt A/B. Kata terlarang di teks R9/R10/R4: streak, target harian, Kasku, Gerak, invoice, avatar foto, avatar, langkah, kalori, UMKM, pembukuan, kebugaran, hijau, oranye.
- Menyetel ambang atau teks agar dua contoh lolos setelah melihat skor. Aturan keputusan dibekukan saat plan disetujui Adam. Iterasi kalibrasi hanya boleh memperjelas teks kriteria (lihat Design Notes).
- Menjalankan agen desain (Lakar/pen.dev), meregenerasi `round-1.*`/`round-uji-1.*`/`score-*`, atau commit plan.
- Commit PNG atau `.pen` pen.dev (EULA).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Kalah karena daya tarik | gerbang Lakar lolos, D_L ≤ D_P − 2, pen.dev patuh brief | `Kalah`, alasan "daya tarik …" | – |
| Pembanding melanggar brief | seperti di atas, tetapi frame pen.dev ≠ ukuran mengikat **atau** R1 pen.dev median 0, dan tidak ada alasan Kalah lain | `Setara`, alasan menyebut pelanggaran brief pembanding | tidak pernah naik ke `Lebih baik` |
| Kalah lain + pelanggaran pembanding | T_L < T_P − 1, atau 0 vs 2 di R1–R8 | tetap `Kalah` | – |
| Lebih baik tanpa daya tarik | T_L ≥ T_P + 3 tetapi D_L < D_P | `Setara` | – |
| Gerbang Lakar gagal | ukuran/layout/waktu | `Kalah` (tidak berubah) | – |
| rejudge sumber tidak lengkap | strip PNG atau round json tidak ada | exit ≠ 0 sebelum spawn | pesan menyebut path |
| label rejudge sudah ada | dir `bench/runs/rejudge/<label>` ada | exit 64, tidak menimpa | `--resume` memakai ulang rep `ok` |
| teks juri bocor / C7 gagal | istilah alat/token/frasa rubrik di target | abort sebelum spawn | pesan seperti `prepareJudgeTexts` |
| putaran resmi, sha berbeda | DESIGN.md diubah setelah snapshot | `officialFreezeProblems` memuat masalah sha | abort |

</intent-contract>

## Code Map

- `bench/src/judge/prompt.ts` -- `JUDGE_CRITERIA` (tambah `R9`, `R10`), `extractRubric` (baca baris `Versi rubrik:`; baris tabel R9/R10), `JUDGE_JSON_SHAPE` (+R9, R10), `buildJudgeText` (kembalikan juga `rubricVersion`). Penetral, leak guard, dan `judgeC7Problems` dipakai ulang tanpa diubah.
- `bench/src/judge/parse.ts` -- otomatis mengikuti `JUDGE_CRITERIA`. Pastikan pesan "6 kriteria" diperbarui.
- `bench/src/judge/run.ts` -- `runJudgeRep`, `assignLabels`, `buildJudgeBlocks`, `JUDGE_REPS=3`. Dipakai ulang apa adanya.
- `bench/src/round/score.ts` -- `aggregateScores` (total = 8 median), `decide` (aturan baru, input `pendevBrief`), dan ekspor `appealAxis`/alasan terstruktur agar `report.ts` tidak menghitung ulang.
- `bench/src/round/report.ts` -- baris ~196 menghitung `zeroVsTwo` sendiri: ganti dengan alasan dari `decide`. Tambah `judge: { rubricVersion, textSha256 }` ke `RoundReport` dan render. Teks "maks 12" → dari jumlah kriteria.
- `bench/src/round/main.ts` -- `prepareJudgeTexts` (~193) juga menghitung sha256, menyalin teks ke `<roundDir>/judge/<P>/judge-text.md`, dan pengecekan sha resmi masuk ke `officialFreezeProblems` (~63). Hitung `boardSizeProblems(p, pendevRec.frames)` untuk pen.dev (~600) dan teruskan ke `decide`. Logika strip→`judgeImages` dan loop rep (~606–650) diekstrak menjadi fungsi bersama agar dipakai `rejudge`.
- `bench/src/lakar/run.ts:81` -- `boardSizeProblems` dipakai juga untuk frame pen.dev (`record.frames` punya width/height).
- `bench/src/png/{codec,strip}.ts` -- `decodePng` + `judgeImages` untuk memuat strip yang sudah ada.
- `bench/src/cli.ts` -- tambah `rejudge` dan `rubric-snapshot`.
- `bench/round-1.json`, `bench/round-uji-1.json` -- sumber gate Lakar, status run, `frames` pen.dev, dan path strip. Hanya dibaca.
- `bench/runs/rounds/{1,uji-1}/{A,B}-{lakar,pendev}.png` -- strip yang dinilai ulang. Hanya dibaca.
- `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` Lampiran B (baris ~490–537) dan `golden-set.md` A/B -- sumber, di-exclude git.
- Tidak diubah: `bench/protocol/*`, `bench/mcp/*`, `packages/**`, `round-1.*`, `round-uji-1.*`, `score-*`.

## Tasks & Acceptance

**Execution:**
- [ ] `bench/src/judge/prompt.ts`, `bench/src/cli.ts` -- perintah `rubric-snapshot`: menulis `bench/rubric/v<ver>/{lampiran-b.md, golden-kriteria.md, judge-text-A.md, judge-text-B.md}` (eksklusif; identik → no-op; berbeda → error) dan memperbarui `bench/rubric/rubric.json` `{version, date, judgeTextSha256:{A,B}, sourceSha256}`. Untuk v1 (belum ada baris versi), pakai `--version 1`. Jalankan untuk v1 **sebelum** mengedit sumber -- riwayat tracked untuk folder yang di-exclude.
- [ ] `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` -- Lampiran B ke v2 sesuai Design Notes: baris `Versi rubrik: 2 (2026-11-18)`, intro "sepuluh kriteria; delapan dinilai juri, skor maks 16", paragraf aturan skor + kalimat R9/R10, baris R4 baru, baris R9 dan R10, kalimat satu-R diperluas, dan §Keputusan per prompt baru beserta alasannya. Checklist slop dan frasa terlarang tidak berubah (dipakai skill).
- [ ] `_bmad-output/initiative-lakar/ux-lakar/golden-set.md` -- audit "kriteria golden tidak mewajibkan gaya yang tidak diminta prompt": B2 "Avatar inisial" → "Avatar"; B5 "(satu aksen, satu netral)" → "(berbeda secara visual)"; A4 "dalam wadah tint" → "dalam wadah yang seragam". Prompt tidak diubah. Lalu jalankan `rubric-snapshot` (v2).
- [ ] `bench/src/judge/{prompt,parse}.ts` -- R9/R10 di kriteria, JSON shape, dan versi. Sesuaikan penjaga `extractRubric` (tabel 8 baris).
- [ ] `bench/src/round/score.ts` -- aturan keputusan v2 (Design Notes). `DecisionInput.pendevBrief: { sizeProblems: string[] }`. Alasan dikembalikan sebagai `why` + `checks` terstruktur.
- [ ] `bench/src/round/{main,report}.ts` -- pakai `checks` dari `decide`, catat versi rubrik dan sha di laporan, salin teks juri per putaran, tambah penjaga sha resmi, dan ekstrak fungsi `judgePrompt(...)` yang dipakai bersama.
- [ ] `bench/src/rejudge.ts` (baru), `bench/src/cli.ts` -- `rejudge --from <uji-k|n> --label <slug> [--resume] [--dry-run]`. Sumber: `bench/round-<from>.json` (status run, gate Lakar, frames pen.dev, path strip) dan strip PNG. Teks juri disiapkan lewat `prepareJudgeTexts` (leak + C7), lalu 3 ulangan per prompt. Keluaran gitignored di `bench/runs/rejudge/<label>/` (judge-text, rep, mapping). Laporan tracked `bench/rejudge-<label>.md|json` berisi: sumber, model, versi Claude Code, HEAD, versi rubrik, sha per prompt, tabel kriteria (median + rentang) kedua alat, D dan T, keputusan v2 vs keputusan sumber vs keputusan Adam (bila ada di round md), bukti R9/R10 per ulangan, pelanggaran brief pen.dev, dan biaya. `--dry-run` mencetak teks, sha, dan argv tanpa spawn.
- [ ] `bench/package.json` -- `"scripts": {"test": "vitest run --root .. bench/"}` agar `pnpm --filter @lakar/bench test` berjalan.
- [ ] `bench/src/judge/judge.test.ts`, `bench/src/round/round.test.ts`, `bench/src/rejudge.test.ts` -- tes:
  - (a) matriks I/O `decide`;
  - (b) teks R9/R10/R4 dari `bench/rubric/v2/lampiran-b.md` tanpa kata terlarang di Never;
  - (c) C7: `judgeC7Problems(secret v2, c7Targets nyata)` kosong untuk skill, pembungkus, prompt render, dan server.ts;
  - (d) sha `judge-text-*.md` snapshot = `rubric.json`;
  - (e) parse menolak jawaban tanpa R9/R10;
  - (f) rejudge dengan `claude` palsu: label acak, laporan memuat versi + sha, menolak label yang sudah ada;
  - (g) protocolHash tetap `907cb36f…`.

  Snapshot md diperbarui.
- [ ] `bench/README.md` -- perintah `rejudge`/`rubric-snapshot`, rubrik v2, dan penjaga sha.
- [ ] Kalibrasi (prosedur di Design Notes) -- `rejudge --from 1 --label r1-v2-1` dan `--from uji-1 --label uji1-v2-1`. Ringkasan dicatat di Implementation Notes. Bila tidak lulus, iterasi sesuai aturan, dan setelah gagal ketiga → HALT `blocked`.

**Acceptance Criteria:**
- Given rubrik v2, when `rejudge --from 1` dijalankan (3 ulangan valid per prompt), then `bench/rejudge-r1-v2-<k>.md` menunjukkan A = Kalah (atau paling baik Setara) dengan median D pen.dev > D Lakar, dan B = Setara dengan median D pen.dev ≥ D Lakar serta pelanggaran brief pen.dev tercatat. R9/R10 kedua alat punya bukti per ulangan.
- Given `rejudge --from uji-1`, when selesai, then laporannya tersedia untuk Adam, termasuk keputusan v2 dan keputusan lama berdampingan (tanpa ambang lulus).
- Given laporan `round` atau `rejudge` mana pun, when dibuka, then laporan memuat `Versi rubrik: 2` dan sha256 teks juri A dan B, dan sha itu sama dengan `bench/rubric/rubric.json`.
- Given repo setelah perubahan, when `/opt/node-26/bin/pnpm build && /opt/node-26/bin/pnpm --filter @lakar/bench test && /opt/node-26/bin/pnpm test`, then exit 0 tanpa skip, dan protocolHash = `907cb36f…`.
- Given `git status`, when story selesai, then yang berubah hanya `bench/src/**`, `bench/rubric/**`, `bench/rejudge-*.{md,json}`, `bench/README.md`, `bench/package.json`, tanpa PNG/`.pen` pen.dev, dan `bench/protocol/` bersih.

## Implementation Notes

- Snapshot v1 ditulis sebelum sumber diedit (`rubric-snapshot --version 1` → `bench/rubric/v1/`, sha A `dde2254d…`, B `e5abfce2…`). Lalu Lampiran B v2 + audit golden (B2, B5, A4) → `bench/rubric/v2/`, dan iterasi 2 → `bench/rubric/v2.1/`. `rubric.json` sekarang menunjuk v2.1 (sha A `f6d68640…`, B `7c172785…`).
- Kode: `bench/src/judge/rubric.ts` (snapshot eksklusif, versi, penjaga sha), `bench/src/rejudge.ts` (+ tes), `judgePrompt` bersama di `round/main.ts`, `decide` v2 dengan `checks` terstruktur di `round/score.ts`, versi rubrik + sha di laporan `round`, salinan `judge-text.md` per prompt, penjaga sha di `officialFreezeProblems`. Strip lama dimuat lewat `judgeImagesFromStripPng` (`png/strip.ts`).
- **Kalibrasi iterasi 1 (rubrik 2): tidak lulus.** `bench/rejudge-r1-v2-1.md`: A = Lebih baik (T 15 vs 12, D 4 vs 4), B = Setara (D 2 vs 4, pengecualian pelanggaran brief: frame 390×1109 + median R1 pen.dev 0). Penyebabnya: juri salah baca R10 pada A Lakar. Ulangan 1 dan 2 memberi R10 = 2 walau buktinya sendiri tidak memuat warna kedua bermakna. Ulangan 3 memberi 1: "warna kedua bermakna hampir tidak ada, hanya kuning bintang … Polesan hanya di sebagian elemen". Ini kasus contoh di plan ("R10 = 2 untuk desain satu aksen"). Hold-out `bench/rejudge-uji1-v2-1.md`: A Lebih baik, B Kalah. Biaya $1,47 + $1,60.
- **Iterasi 2 (rubrik 2.1): hanya teks R10 diperjelas.** Kolom 2 menjadi "semua unsur berikut ada … warna kedua bermakna (selain aksen dan netral) dipakai konsisten di lebih dari satu bagian". Kolom 1 mendapat "atau salah satu unsur kolom 2 tidak ada (mis. hanya satu aksen di atas netral tanpa warna kedua bermakna)". Aturan keputusan, ambang, dan kriteria golden tidak diubah.
- **Hasil iterasi 2: lulus.** `bench/rejudge-r1-v2-2.md`: 6/6 ulangan valid. A = Setara (T 14 vs 12, D 3 vs 4, R10 Lakar 1/1/1 vs pen.dev 2/2/2). B = Setara (T 12 vs 12, D 2 vs 3), pelanggaran brief pen.dev tercatat. Tidak ada rentang R9/R10 > 1. Hold-out `bench/rejudge-uji1-v2-2.md` (dilaporkan saja): A Lebih baik (T 15 vs 10, D 3 vs 3), B Setara. Biaya $1,56 + $1,52. Total kalibrasi ±$6,15.
- Catatan untuk Adam: A lulus sebagai **Setara**, bukan Kalah. Gap D hanya 1, jadi veto daya tarik tidak terpicu. B Setara karena tidak ada alasan Kalah (gap D 1), bukan karena pengecualian brief, meski pelanggaran brief pen.dev tetap tercatat. Hold-out uji-1 A masih Lebih baik.

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 5 findings — high 0, medium 2, low 1, false 1, maybe-false 0 (+1 low ditolak)
- findings:
  - `[low]` `[patch]` `round --resume` putaran pra-perubahan memakai ulang rep v1 (tanpa R9/R10) → `aggregateScores` TypeError di luar try/catch — `judgePrompt` kini hanya memakai ulang rep `ok` yang verdict X/Y-nya memuat semua `JUDGE_CRITERIA`; selebihnya dijalankan ulang (tes baru di `bench/src/rejudge.test.ts`).
  - `[medium]` `[patch]` `rejudge --resume` setelah rubrik naik versi: `writeJudgeTextExclusive` melempar, lalu laporan tracked ditimpa status `dibatalkan` — `runRejudge` kini menolak (exit 1, "pakai label baru") sebelum menulis apa pun bila `judge-text.md` label berbeda dari teks saat ini; tes baru memastikan md tidak berubah.
  - `[false]` `[reject]` laporan iterasi 1 (`rejudge-*-v2-1`) mencatat versi 2 dan "sama" padahal `rubric.json` kini 2.1 — laporan adalah catatan bertanggal: saat run sha memang sama dengan `rubric.json` v2 (snapshot tetap ada di `bench/rubric/v2/`); 2.1 adalah iterasi rubrik v2 sesuai prosedur kalibrasi plan.
  - `[low]` `[reject]` pemulihan label setelah kegagalan butuh label baru, tidak didokumentasikan — kasus jarang; setelah patch di atas pesannya sendiri menyuruh memakai label baru.
  - `[medium]` `[patch]` `head` laporan rejudge tidak menandai tree kotor (kalibrasi jalan di kode belum di-commit) — `rejudgeMain` kini menambahkan "(+ perubahan bench/src atau packages belum di-commit)" bila porcelain tidak kosong. Laporan kalibrasi yang sudah ada mencatat HEAD `9ee43d4`; kode yang benar-benar dipakai adalah commit story ini (patch review sesudahnya tidak menyentuh jalur penilaian/keputusan).

## Design Notes

**Teks kriteria baru (Lampiran B v2, tabel juri):**

| # | Kriteria | 2 | 1 | 0 |
|---|---|---|---|---|
| R4 | Warna & kontras | aksen dipakai konsisten untuk aksi/aktif/seri utama; warna tambahan hanya bila bermakna (status, kategori, arah perubahan); tidak ada teks yang terlihat gagal kontras | 1 pemakaian warna tanpa makna atau 1 teks lemah | warna berceceran tanpa makna, atau ≥ 2 teks gagal kontras |
| R9 | Kekayaan informasi & detail | angka diberi konteks (pembanding, sasaran, tren, satuan, periode); daftar menunjukkan variasi status/kategori; detail sekunder yang berguna (metadata, label kecil, penanda) ada di sebagian besar bagian; padat tetapi tetap terbaca | konteks atau variasi hanya di sebagian bagian; banyak angka/item berdiri tanpa makna tambahan | hanya isi minimum yang diminta: angka telanjang, item seragam; atau terlalu padat sampai tidak terbaca |
| R10 | Polesan warna & komponen | permukaan berlapis (bidang ber-tint warna utama, nuansa gelap/terang, bukan hanya netral polos); warna kedua bermakna dipakai konsisten; badge/chip/indikator berwarna dan terdefinisi; ikon dan visual (foto, grafik, gambar) matang dan menyatu | polesan hanya di sebagian elemen, atau komponen sebagian besar polos | datar: satu warna di atas netral polos hampir di seluruh desain, komponen hanya teks/garis, visual pendukung hilang atau tampak kasar |

Kalimat tambahan aturan skor: "R9 dan R10 tidak memetakan kriteria golden; skornya hanya dari deskripsi kolom." Kalimat satu-R: "Kesalahan (kontras, ikon tidak konsisten, angka salah) dinilai di R4/R5/R6; R9 dan R10 menilai ada atau tidaknya kekayaan dan polesan."

**Aturan keputusan v2** (T = total 8 median, maks 16; D = R9 + R10, maks 4; L = Lakar, P = pen.dev):
1. Run Lakar gagal atau gerbang Lakar gagal → **Kalah** (tidak berubah).
2. Run pen.dev gagal atau tidak ada ulangan valid → tidak dapat dinilai.
3. Kalah-daya-tarik: D_L ≤ D_P − 2, atau R9/R10 Lakar 0 vs pen.dev 2. Kalah-lain: T_L < T_P − 1, atau ada R1–R8 dengan Lakar 0 vs pen.dev 2.
4. Ada alasan Kalah → **Kalah**. Kecuali bila **hanya** ada Kalah-daya-tarik **dan** pen.dev melanggar brief mengikat (`boardSizeProblems` frame pen.dev ≠ ∅, atau R1 pen.dev median 0) → **Setara**.
5. Tidak Kalah, T_L ≥ T_P + 3, **dan** D_L ≥ D_P → **Lebih baik**. Selebihnya **Setara**.

**Alasan tiap aturan (ditulis juga ke Lampiran B):**
- Kriteria umum, bukan isi A/B. Yang dinilai adalah sifat yang bisa dilihat di desain apa pun (konteks angka, variasi status, lapisan permukaan, warna bermakna). Adam menyebut keduanya kurang di A (landing) maupun B (mobile).
- R4 direvisi. R4 lama ("aksen hanya untuk aksi") menghukum warna kedua yang bermakna, padahal Adam justru menilainya sebagai kematangan. Tanpa revisi, R4 dan R10 saling meniadakan.
- Sumbu daya tarik dengan veto gap ≥ 2. Adam menolak "unggul struktur/copy" sebagai penebus desain datar ("kepatuhan tidak menebus kedataran"). Ini perluasan veto yang sudah ada (0 vs 2 pada satu R) ke sumbu yang menurut Adam paling menentukan. Gap 1 dianggap derau median.
- Lebih baik mensyaratkan D_L ≥ D_P. Klaim "lebih baik dari pen.dev" tidak boleh hanya berasal dari kepatuhan.
- Ambang +3/−1. +2/12 diskalakan ke 16 menjadi ≈ +2,7 lalu dibulatkan ke +3. −1 tetap satu langkah skor sebagai toleransi derau. Satuan langkahnya tidak berubah.
- Gerbang Lakar tetap keras. Kepatuhan brief adalah janji produk Lakar, dicek mekanis, dan tidak bergantung pada juri.
- Pelanggaran brief pembanding hanya menetralkan veto daya tarik dan tidak membuat Lakar Lebih baik. Keunggulan daya tarik yang diraih di luar batas mengikat bukan keunggulan sah: board lebih tinggi = ruang konten tambahan, bahasa lain = brief dilanggar. Meski begitu, kesalahan pembanding bukan prestasi Lakar. Kalah karena kualitas lain tetap Kalah.
- Audit golden. Kriteria yang mewajibkan gaya di luar prompt (avatar inisial, satu kartu aksen, wadah tint) mencerminkan batas Lakar G0 (belum ada foto), bukan permintaan brief, dan menghukum alternatif yang lebih kaya.

**Prosedur kalibrasi dan ambang lulus (ditetapkan sebelum run):**
- Per iterasi: `rejudge` ×2 (putaran 1 dan uji-1), masing-masing 3 ulangan (A dan B) = 12 ulangan juri.
- Lulus bila putaran 1 memenuhi AC pertama: A ∈ {Kalah, Setara} dengan D_P > D_L, B = Setara dengan pelanggaran brief pen.dev terdeteksi, 6/6 ulangan valid, dan bukti R9/R10 tidak kosong. Rentang > 1 pada R9/R10 ditandai untuk Adam, tetapi tidak menggagalkan. uji-1 hanya dilaporkan (hold-out). Uji lanjutan ada di story 19.
- Tidak lulus → iterasi ≤ 2 kali lagi (total 3). Setiap iterasi hanya boleh memperjelas kata-kata R4/R9/R10 berdasarkan bukti juri yang salah baca, misalnya juri memberi R10 = 2 untuk desain satu aksen. Versi rubrik naik (2.1, 2.2) beserta snapshot baru, dan alasan + kutipan bukti dicatat di Implementation Notes. Aturan keputusan, ambang, dan kriteria golden tidak boleh diubah. Gagal ketiga → HALT `blocked` dengan laporan ketiga iterasi, tanpa memaksa.
- Biaya. Putaran 1: $1,46 / 6 ulangan ≈ $0,25. Teks lebih panjang → ±$0,27/ulangan, jadi ±$3,3 per iterasi dan ±$10 untuk 3 iterasi. Wall ±20–30 menit per iterasi. Tidak ada biaya agen.

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/node bench/dist/cli.js rubric-snapshot --version 1` (sebelum edit sumber) -- expected: `bench/rubric/v1/*` + `rubric.json` tertulis
- `cd /root/lakar && /opt/node-26/bin/pnpm build && /opt/node-26/bin/pnpm --filter @lakar/bench test && /opt/node-26/bin/pnpm test` -- expected: exit 0, 0 skip
- `cd /root/lakar && /opt/node-26/bin/node bench/dist/cli.js rejudge --from 1 --label r1-v2-1 --dry-run` -- expected: preflight leak/C7 lulus, versi 2, sha = rubric.json, tanpa spawn
- `cd /root/lakar && /opt/node-26/bin/node bench/dist/cli.js rejudge --from 1 --label r1-v2-1 && /opt/node-26/bin/node bench/dist/cli.js rejudge --from uji-1 --label uji1-v2-1` -- expected: `bench/rejudge-r1-v2-1.md` memenuhi ambang lulus; `bench/rejudge-uji1-v2-1.md` ada
- `cd /root/lakar && /opt/node-26/bin/node -e "import('./bench/dist/protocol.js').then(m=>console.log(m.protocolHash()))"` -- expected: `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d`
- `/root/lakar/tools/node26/verify.sh` -- expected: exit 0; `git status --porcelain bench/protocol` kosong

**Manual checks:**
- Adam meninjau teks R4/R9/R10, aturan v2, dan audit golden di plan_checkpoint sebelum implementasi. Setelah kalibrasi, Adam melihat `bench/rejudge-*.md` beserta PNG di `bench/runs/rounds/{1,uji-1}/`.

## Auto Run Result

Status: built

**Ringkasan:** rubrik juri v2 → 2.1 (R4 direvisi, R9 kekayaan informasi, R10 polesan; audit golden B2/B5/A4), `decide` v2 (sumbu daya tarik D=R9+R10, veto gap ≥ 2, pengecualian pelanggaran brief pembanding, Lebih baik butuh T+3 dan D_L ≥ D_P), perintah `rubric-snapshot` dan `rejudge`, versi + sha256 teks juri di setiap laporan, penjaga sha di putaran resmi. Kalibrasi lulus di iterasi 2 dari 3 (rubrik 2.1: hanya kata-kata R10 diperjelas): putaran 1 A = Setara (T 14 vs 12, D 3 vs 4), B = Setara (T 12 vs 12, D 2 vs 3, pelanggaran brief pen.dev tercatat). Hold-out uji-1: A Lebih baik (T 15 vs 10, D 3 vs 3), B Setara. Biaya juri ±$6,15.

**File:**
- `bench/src/judge/{prompt,parse,rubric}.ts` — R9/R10, versi rubrik, snapshot eksklusif + penjaga sha.
- `bench/src/round/{score,main,report}.ts` — aturan keputusan v2 + `checks`, `judgePrompt` bersama, salinan teks juri, sha di laporan, penjaga freeze.
- `bench/src/rejudge.ts`, `bench/src/cli.ts`, `bench/src/png/strip.ts` — perintah rejudge/rubric-snapshot, muat strip PNG lama.
- `bench/src/**/*.test.ts`, snapshot — tes (a)–(g) + 2 tes patch review.
- `bench/rubric/{v1,v2,v2.1}/`, `bench/rubric/rubric.json` — riwayat rubrik tracked.
- `bench/rejudge-{r1,uji1}-v2-{1,2}.{md,json}` — laporan kalibrasi.
- `bench/README.md`, `bench/package.json` — dokumentasi, skrip tes.
- Di luar git (exclude): DESIGN.md Lampiran B v2.1, golden-set.md audit.

**Review (quick):** 3 patch (2 medium, 1 low), 0 defer, 2 ditolak (1 false: laporan iterasi 1 adalah catatan bertanggal; 1 low: pemulihan label sudah dipandu pesan error).

**Follow-up review:** true. Patch: medium 2, low 1 (≥ 2 medium). Risiko belum terverifikasi: perubahan `coversCriteria` di `judgePrompt` juga mengubah jalur `round --resume` putaran resmi, tetapi hanya dites lewat `rejudge`; jalur `round` belum punya tes resume dengan rep rubrik lama.

**Verifikasi:** `pnpm build` OK; `pnpm --filter @lakar/bench test` 143 lulus; `pnpm test` 711 lulus, 0 skip; protocolHash `907cb36f…`; `rejudge --dry-run` sha = rubric.json; `tools/node26/verify.sh` exit 0; `bench/protocol` bersih; lakard active.

**Risiko tersisa:** kalibrasi hanya pada 2 contoh (A lulus sebagai Setara, gap D 1 — di batas); hold-out uji-1 A tetap Lebih baik (juri mungkin masih murah hati pada landing Lakar); R10 2.1 diperjelas setelah melihat skor iterasi 1 (diizinkan plan, tetapi risiko overfit — diuji story 19); laporan kalibrasi mencatat HEAD baseline, bukan commit kode.
