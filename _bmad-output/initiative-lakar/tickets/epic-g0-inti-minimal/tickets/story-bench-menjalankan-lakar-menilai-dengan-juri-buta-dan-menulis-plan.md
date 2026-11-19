---
title: 'Bench menjalankan Lakar, menilai dengan juri buta, dan menulis laporan putaran'
type: feature
ticket: '14'
created: '2026-11-18'
status: built
baseline_revision: 'd7cf5794575f02b4ab198b1ed0e8a44f4ee2b587'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-baseline-waktu-pen-dev-a-dan-b-terukur-dengan-pembungkus-res-plan.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Gerbang G0 butuh satu putaran benchmark A dan B: Lakar vs pen.dev, waktu simetris (AD-13), PNG skala 1, strip mobile, `layout_check` Lakar, emoji, juri LLM 3× buta, dan laporan. Story 4 baru membuat baseline pen.dev. Belum ada run Lakar, normalisasi PNG, juri, skor, atau laporan putaran.

**Approach:** Perluas paket `bench` (pakai ulang protokol beku, `claude-runner`, `stream-metrics`, `stats`, adaptor pen.dev story 4):
- adaptor Lakar (HTTP ke lakard 127.0.0.1:7466, di luar waktu);
- normalisasi PNG murni (strip vertikal, tanpa metadata, tile);
- juri buta lewat `claude -p` stream-json dengan gambar;
- laporan `score-<id>.md` dan `round-<n>.md`.

Satu perintah `round` menjalankan putaran uji `uji-1` (A,B × Lakar,pen.dev = 4 run desain + juri 3× per prompt). Biaya ≈ $5–8 disetujui orkestrator.

## Boundaries & Constraints

**Always:**
- **Protokol beku:** preflight memakai `loadProtocol()` + `checkProtocolC7` story 4. Putaran ditolak bila `protocol.hash` ≠ `protocolHash` di `bench/baseline-pendev.json` (`907cb36f…`). Argumen claude agen = `buildArgs` yang sama untuk kedua alat. Yang berbeda hanya:
  - Lakar: `--mcp-config /root/lakar/.mcp.json`, `--allowedTools mcp__lakar`;
  - pen.dev: `bench/mcp/pencil.json`, `mcp__pencil`.
- Untuk kedua alat: model `claude-opus-5-5`, `--strict-mcp-config`, `--tools ""`, env `ENABLE_TOOL_SEARCH=false`, scrub `CLAUDE*`/`AI_AGENT*`, cwd tmp di luar repo.
- **Validasi init Lakar:** hanya server `lakar` connected, semua tool berawalan `mcp__lakar__`, wajib `mcp__lakar__execute`, cwd di luar repo. Pelanggaran → `invalid`.
- **Waktu (AD-13):** `wallMs` dari `computeMetrics` (event pertama → `result`), sama untuk kedua alat. Offset tool hanya diagnostik.
  - Rasio dilaporkan: Lakar/pen.dev pada putaran ini, dan Lakar/median baseline (A 167,3 dtk; B 131,3 dtk, dibaca dari `baseline-pendev.json`).
  - Gerbang waktu memakai baseline: Lakar ≤ 1,5 × median baseline.
- **pen.dev:** jalur run satu-satunya adalah `runOne` story 4, dipindah dari `cli.ts` ke modul yang diekspor dan dipakai `pendev-baseline` maupun `round` (bukan salinan). Tetap berlaku: `pen-newdoc.sh` + verifikasi dokumen baru & kosong, retry 15×, salin `.pen` eksklusif, Export `{scale:1}`, IHDR.
  - Tambahan per putaran: md5 semua `.pen` lama di `~/.pencil/documents`, `/root/lakar/design`, `/root/comprice`, `/opt/pen` sebelum dan sesudah putaran dibandingkan. Hasilnya ditulis di round md.
  - Bila ada yang berubah, putaran berstatus `dibatalkan` dan exit ≠ 0.
- **Lakar per run:**
  1. Preflight: `GET /status` ok, `version` = `LAKAR_VERSION`, `pool.ready ≥ 1`; `.mcp.json` berisi tepat server `lakar`. Lalu snapshot `docs/*.lakar.json` (nama, ukuran, mtime).
  2. Status reconnect dicatat sebelum dan sesudah run: `pid`, `startedAt`, `pool.recreated` lakard, dan `NRestarts` systemd user.
  3. `claude -p` dijalankan.
  4. Di luar waktu, slug diambil dari `tool_use` `mcp__lakar__open_doc` di transkrip, yaitu open_doc terakhir yang diikuti execute sukses. Slug yang dokumennya sudah ada di snapshot sebelum run → `invalid` dengan alasan `dokumen lama`.
  5. Sesi HTTP harness sendiri (`POST /sessions` dengan version) → `/docs/open` (hanya untuk slug yang filenya ada) → `/boards` → `/layout-check` → `/export {id, scale:1}` per board. PNG disalin ke dir run, IHDR = ukuran board. `.lakar.json` + history disalin eksklusif.
- **Reconnect** dilaporkan terpisah dan tidak dikurangkan dari waktu. Isinya per run:
  - Lakar: lakard restart (pid/startedAt/NRestarts berubah), halaman Chromium dibuat ulang (`recreated` naik), dan tool_result error berkode `RENDER_FAILED`, `VERSION_MISMATCH`, atau "lakard tidak menjawab".
  - pen.dev: `NRestarts`/`ActiveEnterTimestamp` `pen-desktop` berubah, dan tool_result `is_error`.
  - Ringkasnya: jumlah, ms tool_use→tool_result yang terdampak, dan cuplikan error.
- **Gerbang G0 Lakar (otomatis):**
  - `layout_check` harness: `summary.gate = 0`;
  - ukuran board: A semua board lebar 1440, B semua board 390×844;
  - waktu ≤ 1,5× baseline.
  - R3/R7 tidak dihitung di G0 (keputusan epic), dicatat di md.
- **Emoji (kedua alat), tiga angka terpisah:**
  - (a) emoji di input `tool_use` agen dari transkrip (Emoji_Presentation, atau Extended_Pictographic + VS16; `© ® ™` dikecualikan; glyph LC-01b dihitung terpisah);
  - (b) Lakar saja: temuan LC-01a/LC-01b dari `layout_check` (pen.dev tidak dilint, EULA);
  - (c) emoji terlihat menurut juri (median).
- **Normalisasi PNG (murni, tanpa dependensi):** dekode PNG 8-bit colortype 2/6 non-interlaced. Alpha dikomposit di atas latar netral yang sama (#808080). Board/frame top-level ditumpuk vertikal sesuai urutan dokumen dengan jarak 48 px #808080 (strip, untuk kedua alat dan kedua prompt). Hasil di-encode ulang RGB hanya dengan IHDR/IDAT/IEND, jadi tanpa metadata.
  - Strip ditulis ke `bench/runs/rounds/<round>/<id>-<alat>.png`.
  - Untuk juri: tile lebar penuh dengan tinggi tetap (≤ 1000 px untuk lebar > 600, ≤ 1700 px untuk lebih sempit), ditambah satu overview hasil downscale box sampai sisi panjang ≤ 1568.
- **Juri buta:**
  - Proses: `claude -p --input-format stream-json --output-format stream-json --verbose --model claude-opus-5-5 --tools "" --strict-mcp-config --mcp-config <file {"mcpServers":{}}> --disable-slash-commands --no-session-persistence`, env dan cwd tmp sama seperti agen. Runner diperluas dengan opsi stdin/argv mentah, bukan diduplikasi.
  - Init juri wajib `tools=[]` dan `mcp_servers=[]`; selain itu `invalid`.
  - Pesan: satu user message berisi teks juri + gambar base64 berlabel netral "Desain X/Y, bagian i dari n" + "overview". Tidak ada nama alat, nama file, path, ukuran byte, atau metadata.
  - Label X/Y diacak per ulangan dengan `crypto`. Dari 3 ulangan, kedua penugasan wajib muncul. Pemetaan disimpan di dir juri dan tidak dikirim ke juri.
- **Teks juri** dibangun saat runtime dari DESIGN.md Lampiran B dan golden-set.md:
  - aturan skor Rn = 2/1/0, baris tabel R1, R2, R4, R5, R6, R8, "setiap pelanggaran hanya di satu R", checklist slop 1–12 + frasa terlarang, dan butir Prosedur juri tentang bukti;
  - teks prompt (tanpa pembungkus) + "Kriteria target" prompt itu, tanpa butir/klausa `[G]`/`[T]`;
  - kata "Lakar", "pen.dev", "pencil", dan "pen" dibuang. Penjaga gagal bila teks juri masih memuatnya.
  - Juri wajib mengembalikan JSON `{X:{R1..R8 (6 kriteria):{skor 0|1|2, bukti}, slop:{jumlah, butir[]}, emoji, fokus}, Y:{…}}`, yang divalidasi ketat. Output tak valid → satu percobaan ulang untuk ulangan itu (dicatat). Masih gagal → ulangan `failed`, tidak diganti diam-diam.
- **C7:** rubrik dan kriteria hanya ada di teks juri (`bench/runs/**`, gitignored), tidak pernah di prompt agen, skill, wrapper, deskripsi/instruksi MCP, atau argumen agen. Tes penjaga:
  - frasa (n-gram 6 + kalimat pendek) dari teks juri tidak muncul di `bench/protocol/*`, `packages/skills/skills/*.md`, `packages/mcp/src/server.ts`, dan prompt agen hasil render;
  - modul agen (`claude-runner`, `lakar/*`, `pendev/*`) tidak mengimpor `judge/*`.
- **Skor:** per kriteria per alat: 3 skor, median, rentang (maks − min), dan bukti tiap ulangan. Total = jumlah median. Ditampilkan juga slop dan emoji juri (median/rentang). Rentang > 1 → ditandai "periksa Adam".
  - **Keputusan sementara** (Lampiran B):
    - Setara = lolos gerbang ∧ total Lakar ≥ total pen.dev − 1 ∧ tidak ada R dengan Lakar = 0 dan pen.dev = 2;
    - Lebih baik = lolos gerbang ∧ total Lakar ≥ total pen.dev + 2;
    - selebihnya Kalah;
    - run Lakar gagal → Kalah, run pen.dev gagal → `tidak dapat dinilai`.
  - Selalu berlabel "sementara, menunggu konfirmasi Adam".
- **Konvensi putaran:** `--round uji-<k>` untuk putaran uji. Angka polos (`1`, …) untuk putaran resmi (story 16). ID dicek dengan regex `^(uji-[1-9]\d*|[1-9]\d*)$`.
  - Keluaran: `bench/round-<round>.md` + `.json`, `bench/score-A.md`/`score-B.md` (+ `.json`; header menyebut putaran), dan artefak di `bench/runs/rounds/<round>/`.
  - Putaran yang md-nya sudah ada ditolak, kecuali `--resume`. `--resume` memakai ulang run yang sudah `success`/`failed` di dir itu dan hanya menjalankan yang belum ada. Run tidak pernah diulang untuk memilih hasil (C8).
- **Versi beku di round md:** `git rev-parse HEAD` + bukti bahwa `git status --porcelain -- packages tools .mcp.json` kosong, protocolHash, model, claude, lakard version/schemaVersion, Lucide/simple-icons (`/status`), sha256 tiap `packages/skills/skills/*.md`, `G0_RULES`, sha256 `packages/check/dist`, pen.dev desktop + MCP server, juri (model, argv). Juga dicatat: wrapper kata per kata, prompt, argv kedua alat, konvensi putaran, dan definisi waktu/reconnect.
- C9: Node hanya `/opt/node-26/bin/{node,pnpm}`; tanpa dependensi baru; arah dependensi `bench→schema` tetap. Setelah putaran, `bash tools/node26/verify.sh` exit 0 dan `systemctl --user is-active lakard` = active.

**Never:**
- Mengubah `packages/*` (produk dibekukan untuk putaran), protokol beku (`bench/protocol/*`), `bench/baseline-pendev.*`, `.mcp.json`, `~/.claude*`, service `pen-*`, atau `.git/info/exclude`.
- Membuka `~/.pencil/session-desktop.json`. Membaca `.pen` dengan Read/Grep. Memakai pen-headless/`pen` CLI. Menimpa `.pen` yang ada. Ragu dokumen pen aktif mana → run `aborted` dan putaran berhenti.
- Memberi rubrik/kriteria ke agen desain. Memberi juri ringkasan agen, transkrip, nama alat, atau metadata.
- Menulis `bench/round-1.md` (milik story 16). Push/merge. Skip tes diam-diam.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Putaran normal | `round --round uji-1` | 4 run, 6 juri, round-uji-1.md, score-A/B.md, strip PNG 4 | exit 0 |
| Hash protokol beda | wrapper diubah 1 byte | preflight abort sebelum run | exit 1 |
| Round sudah ada | `bench/round-uji-1.md` ada, tanpa `--resume` | ditolak | exit 64 |
| ID round salah | `--round round-1`, `--round 0` | ditolak | exit 64 |
| Dokumen Lakar lama | transkrip open_doc slug yang ada di snapshot | run `invalid`, alasan `dokumen lama` | putaran berhenti |
| Init Lakar salah | init berisi server `pencil` / tool `Read` | `invalid` | putaran berhenti |
| Init juri ada tool | tools ≠ [] | ulangan `invalid` | putaran berhenti, laporan tetap ditulis |
| Gerbang | gate 1 / board B 390×900 / wall > 1,5× | gerbang gagal dengan alasan → Kalah | — |
| Strip | 2 board 390×844 + RGBA transparan | PNG 390×1736, RGB, 3 chunk, alpha di atas #808080 | — |
| PNG metadata | input ber-tEXt/iTXt/pHYs | output hanya IHDR/IDAT/IEND | — |
| Juri JSON rusak | teks tanpa JSON / skor 3 / bukti kosong | 1 percobaan ulang, lalu `failed` | dicatat di score md |
| Acak | 3 ulangan | kedua penugasan X/Y muncul | — |
| Kebocoran | teks juri memuat "pen.dev"/"Lakar"/path | penjaga gagal sebelum spawn | abort |
| Keputusan | total L 9 vs P 10, tanpa 0-vs-2 | Setara; L 8 vs P 10 → Kalah; L 12 vs P 9 → Lebih baik; gerbang gagal → Kalah | — |
| Reconnect | pid lakard berubah / recreated +1 / tool_result RENDER_FAILED | dihitung & ditampilkan terpisah | — |
| .pen lama berubah | md5 beda setelah putaran | status `dibatalkan` | exit ≠ 0 |

</intent-contract>

## Code Map

- `bench/src/cli.ts` -- `runOne`, `emptyRecord`, `preflight`, dan `NOTES` pen.dev ada di sini. Pindahkan `runOne`/`emptyRecord`/preflight pen.dev ke `bench/src/pendev/run.ts` (ekspor). `pendev-baseline`/`pendev-smoke` tetap berperilaku identik. Tambah subperintah `round --round <id> [--dry-run] [--resume]`.
- `bench/src/claude-runner.ts` -- `buildArgs`, `buildEnv`, `runClaude` (cap waktu per baris, validateInit, kill, cwd tmp). Tambah opsi stdin (stream-json input) + argv mentah untuk juri. Perilaku agen tetap (tes lama hijau).
- `bench/src/stream-metrics.ts` -- `computeMetrics(lines, INIT_RULES, …)`, `validateInit`, `parseInit`. Juri butuh aturan init "tanpa server/tool" (perluas `InitRules` atau validator terpisah). Pakai ulang untuk wall/cost/turns.
- `bench/src/protocol.ts` -- `loadProtocol`, `renderPrompt`, `checkProtocolC7`, `GOLDEN_SET_PATH`, `forbiddenPhrases`/`words` (pakai ulang untuk penjaga C7 juri). Jangan ubah file `bench/protocol/*` (hash).
- `bench/src/report.ts` (`RunRecord`, `summarizeRuns`), `stats.ts` (`median`/`summarize`), `series.ts` (`pngScaleMismatch`) -- pakai ulang. `RunRecord` boleh diperluas dengan field opsional (Lakar/reconnect/emoji) tanpa mengubah snapshot baseline.
- `bench/src/pendev/{newdoc,pencil-client,artifacts}.ts` -- adaptor pen.dev. `copyExclusive`/`assertSafeDestination`/`readPngSizeFile` dipakai juga oleh Lakar.
- Baru: `bench/src/lakar/{lakard-client,run}.ts`, `bench/src/png/{codec,strip}.ts`, `bench/src/judge/{prompt,run,parse}.ts`, `bench/src/round/{emoji,reconnect,score,report}.ts` (nama boleh disesuaikan; logika keputusan/agregasi murni dan dites).
- `packages/daemon/src/server.ts` (hanya baca): `/status` (GET), `/sessions` (header sesi `x-lakar-session`, body `{client, version, schemaVersion}`), `/docs/open {slug}` (membuat bila belum ada, jadi hanya dipanggil untuk slug yang filenya ada), `/boards`, `/layout-check` → `{docId, rev, boards, summary{error, warning, gate}, findings}`, `/export {id, scale}` → `{path, width, height}`. Format error AD-11 `{ok, data|error}`. Contoh klien: `packages/mcp/src/client.ts` (jangan diimpor; bench hanya `@lakar/schema`).
- `packages/schema/src/{findings,version}.ts` -- `Finding`, `G0_RULES`, `summarizeFindings`, `LAKAR_VERSION`, `SCHEMA_VERSION` (impor dari `@lakar/schema`).
- `packages/daemon/src/png.ts` -- contoh dekoder PNG (hanya acuan; bench tidak boleh impor daemon).
- `packages/check/src/glyphs.ts` -- definisi emoji LC-01a/glyph LC-01b (acuan untuk penghitung emoji bench; samakan definisinya).
- `/root/lakar/.mcp.json` -- config MCP Lakar (`LAKAR_URL` 7466). Dipakai apa adanya.
- `~/.local/share/lakar/docs/` -- dokumen lakard (`<slug>.lakar.json`, `.history.jsonl`). Hanya dibaca/disalin. `dataDir` diambil dari `/status`.
- `_bmad-output/initiative-lakar/ux-lakar/{DESIGN.md (Lampiran B, §Anti-pattern), golden-set.md (§A, §B, §Prosedur)}` -- sumber teks juri. Di-exclude git; dibaca saat runtime/tes saja.
- `tests/check-c7.test.ts`, `tests/skills-c7.test.ts`, `tests/dependency-direction.ts` -- penjaga yang harus tetap hijau. Penjaga C7 juri baru di `tests/` atau `bench/src`.
- `package.json` root -- tambah skrip `bench:round` (`node scripts/assert-node.mjs && node bench/dist/cli.js round`).
- `tools/node26/verify.sh` -- bukti C9 (hanya dijalankan).

## Tasks & Acceptance

**Execution:**
- [x] `bench/src/pendev/run.ts`, `bench/src/cli.ts` -- pindahkan run pen.dev (runOne + preflight pen) ke modul. CLI lama tetap; `--dry-run` lama identik -- pakai ulang tanpa duplikasi.
- [x] `bench/src/claude-runner.ts` (+ tes) -- opsi stdin + argv mentah; tes juri: argv tanpa `--allowedTools`, stdin terkirim.
- [x] `bench/src/lakar/{lakard-client,run}.ts` (+ tes dengan server HTTP palsu dan transkrip fixture) -- preflight lakard, snapshot docs, run, deteksi slug/`dokumen lama`, layout_check, export, salin, ukuran board, reconnect.
- [x] `bench/src/png/{codec,strip}.ts` (+ tes) -- dekode/encode, komposit alpha, strip, tile, overview, buang metadata.
- [x] `bench/src/judge/{prompt,run,parse}.ts` (+ tes) -- teks juri dari DESIGN.md/golden-set, penjaga kebocoran, pengacakan dengan kedua penugasan, pesan stream-json, validasi init juri, parser JSON ketat + 1 retry.
- [x] `bench/src/round/{emoji,reconnect,score,report}.ts` (+ tes, snapshot md) -- emoji, reconnect, agregasi median/rentang, gerbang, keputusan, render `score-<id>.md`, `round-<n>.md`, dan json.
- [x] `bench/src/cli.ts`, `package.json` -- subperintah `round` (preflight gabungan, md5 `.pen` sebelum/sesudah, urutan run A-pendev, A-lakar, B-pendev, B-lakar, lalu juri) dan `bench:round`.
- [x] `tests/judge-c7.test.ts` (atau di bench) -- penjaga C7 juri (lihat Boundaries).
- [x] Mesin: `pnpm bench:round -- --round uji-1` dijalankan sungguhan. Hasilnya `bench/round-uji-1.{md,json}`, `bench/score-{A,B}.{md,json}`. Implementer melihat keempat strip PNG (Read) dan mencatat kesan di Implementation Notes.

**Acceptance Criteria:**
- Given build, when `node bench/dist/cli.js round --round uji-1 --dry-run`, then argv agen kedua alat (beda hanya `--mcp-config`/`--allowedTools`), argv juri (tanpa MCP/tool), hash protokol = baseline, C7 lulus, dan konvensi putaran tercetak. Tidak ada claude, newdoc, atau dokumen Lakar.
- Given putaran uji selesai, when membuka `bench/round-uji-1.md`, then per prompt tampil: waktu & biaya kedua alat, rasio Lakar/pen.dev dan Lakar/baseline, gerbang Lakar (gate, ukuran, waktu), emoji (a/b/c), reconnect, total skor median/rentang, keputusan sementara, dan versi beku.
- Given putaran selesai, when membuka `bench/score-A.md`/`score-B.md`, then 6 kriteria × 2 alat dengan 3 skor, median, rentang, dan bukti tiap ulangan, slop dan emoji juri, serta pemetaan X/Y per ulangan (dibuka setelah penilaian).
- Given putaran selesai, when md5 `.pen` lama, `jq .mcpServers ~/.claude.json`, md5 `~/.claude/settings.json`, dan `ActiveEnterTimestamp` pen-* dibandingkan dengan sebelum putaran, then identik, dan `git status --porcelain | grep -c bench/runs` = 0.

## Implementation Notes

**Catatan implementasi (2026-11-18):**
- `runOne`/`emptyRecord`/`preflight` pen.dev dipindah ke `bench/src/pendev/run.ts` (dipakai `pendev-baseline`, `pendev-smoke`, `round`); `Abort`/`log`/`stamp`/`canonical` ke `bench/src/log.ts`. `pendev-baseline --dry-run` sebelum vs sesudah refactor: stdout dan stderr identik (diff kosong).
- `claude-runner`: opsi `rawArgs` (argv mentah) + `stdin` (ditulis lalu ditutup). `InitRules.server = null` = juri (wajib `mcp_servers=[]`, `tools=[]`).
- Penjaga C7 juri memakai bagian **rahasia** teks juri (aturan skor Rn, baris tabel R1/R2/R4/R5/R6/R8, kalimat "satu R", kriteria golden, butir bukti). Teks prompt (sengaja identik dengan prompt agen) dan checklist slop + frasa terlarang (aturan produk bersama: DESIGN.md menyebut checklist dipakai agen dan juri; `core.md` memuat frasa terlarang yang sama) tidak dijadikan sumber frasa, karena kalau dijadikan sumber penjaga pasti gagal walau tidak ada kebocoran rubrik.
- Tile sempit memakai tinggi 1568 (≤ 1700, dan tidak dikecilkan API). Overview selalu dikirim, juga bila strip hanya 1 tile. Strip lebih sempit diletakkan di tengah.
- `--resume`: run `aborted`/`invalid` dipindah ke `<key>.prev-<stamp>` lalu dijalankan lagi (dicatat sebagai percobaan sebelumnya di round md). Pemetaan X/Y disimpan di `judge/<p>/assignments.json` agar resume memakai pemetaan yang sama. `parseRoundArgs` mengabaikan `--` dari `pnpm bench:round -- …`.
- Preflight putaran (bukan dry-run) abort bila `git status --porcelain -- packages tools .mcp.json` tidak kosong. Kode bench sendiri belum di-commit saat putaran, jadi HEAD yang tercatat `d7cf579` tidak memuat kode harness ini.
- R3/R7 tidak dihitung: `G0_RULES` hanya punya LC-01a/01b/02a/05/12/20.

**Putaran `uji-1` (2026-11-18, exit 0, `lengkap`):**
- A: Lakar 130,8 dtk / $0,95 vs pen.dev 167,7 dtk / $0,88. Rasio Lakar/pen.dev 0,78, Lakar/baseline 0,78. Gerbang lolos (gate 0, 1440×4116). Juri: total 10 vs 6 → **Lebih baik** (sementara).
- B: Lakar 93,9 dtk / $0,50 vs pen.dev 155,4 dtk / $0,72. Rasio 0,60, Lakar/baseline 0,71. Gerbang lolos (gate 0, 390×844). Juri: 8 vs 8 → **Setara** (sementara).
- Juri 6/6 ulangan ok tanpa percobaan ulang, biaya $1,51. Reconnect 0 di keempat run. Emoji (a): pen.dev A 1 (👋 di sapaan mockup), lainnya 0.
- Total biaya putaran ≈ $4,56 (run $3,05 + juri $1,51). Uji manual juri sebelumnya $0,02.
- Sesudah putaran: md5 29 `.pen` lama identik (hanya 2 dokumen pen.dev baru), `jq .mcpServers` identik, md5 `settings.json` identik, `ActiveEnterTimestamp` pen-* identik, `git status | grep -c bench/runs` = 0, `tools/node26/verify.sh` exit 0, lakard `active`.

**Kesan dari keempat strip (Read):**
- A-Lakar: rapi, hijau konsisten, ritme terang/gelap (testimoni gelap), ada mockup dashboard dan tabel laba rugi yang angkanya konsisten, tier tengah gelap dengan badge, tanpa emoji. Catatan: mockup dashboard terpotong di tepi bawah hero (baris "Listrik toko" terpotong). Juri tidak mengurangi skor untuk itu; perlu dilihat Adam. Tiga kartu fitur berupa satu kartu besar + dua kecil, bukan tiga kartu identik.
- A-pen.dev: berkualitas juga. Ada emoji 👋 di sapaan mockup dan baris statistik bulat (25.000+, Rp4,8T), sesuai slop yang dicatat juri. Kartu fitur 3 identik. Skor 6 terasa agak keras untuk desain ini; R1/R2 rentang 1.
- B-Lakar: bersih, ring konsentris, jadwal 2 item (selesai + Mulai), 2 kartu program, tab bar 4 dengan item aktif, home indicator. Kartu program berupa placeholder gradien dengan ikon kecil.
- B-pen.dev: lebih kaya (foto, 3 item jadwal, item aktif tab), tetapi kartu jadwal oranye penuh dan foto stok di kartu program. Setara terasa wajar.

**Verifikasi orkestrator (step-03):** audit matriks menemukan baris "Hash protokol beda", "Round sudah ada", ".pen lama berubah", "Init juri ada tool → putaran berhenti", dan "Init Lakar salah" tanpa tes yang menyentuh logika putaran (logika inline di `roundMain`). Logika dipindah ke fungsi murni `roundStartProblem` dan `roundOutcome` di `bench/src/round/main.ts`, dengan tes di `round.test.ts` (termasuk `validateInit` dengan `LAKAR_INIT_RULES`). Orkestrator juga memeriksa keempat strip PNG (Read) dan setuju dengan kesan implementer.

**Patch review (2026-11-18, diterapkan orkestrator sendiri karena re-engage implementer tidak sinkron):** klasifikasi reconnect (hanya `is_error` + pola Lakar/putus transport), keputusan `tidak dapat dinilai` bila run Lakar tidak dijalankan, `isFinalRun` (C8: `invalid` `dokumen lama` tidak diulang), baseline `.pen` dari snapshot paling awal saat resume, daftar percobaan sebelumnya tetap ada untuk run yang dipakai ulang, `png_scale_mismatch` → exit 3, dan tahap juri dibungkus try/catch. Laporan `uji-1` ditulis ulang lewat `--resume` tanpa run berbayar baru: satu-satunya perubahan isi adalah reconnect pen.dev B 1 → 0 (error snippet `Node not found` bukan reconnect).

## Plan Change Log

- 2026-11-18: sumber frasa penjaga C7 juri dibatasi ke bagian rubrik + kriteria (prompt dan checklist slop/frasa terlarang adalah aturan produk bersama, lihat Implementation Notes). Tinggi tile sempit 1568. `--resume` juga menjalankan ulang run `invalid` (setup), dicatat sebagai percobaan sebelumnya.

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 8 findings — high 0, medium 4, low 4, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Reconnect Lakar menghitung tool_result sukses yang memuat teks `RENDER_FAILED`/`VERSION_MISMATCH` (mis. `read_skill api`) — terverifikasi (`reconnect.ts` tanpa filter `is_error`). Fix: hanya `is_error` + pola Lakar/putus transport. Akar yang sama di pen.dev: setiap `is_error` (error snippet agen) terhitung reconnect (B: `Node not found`), sekarang hanya pola putus transport. Tes baru untuk kedua arah.
  - `[low]` `[patch]` pen.dev aborted → putaran berhenti sebelum Lakar → keputusan "Kalah: run Lakar gagal" — terverifikasi (`decide` dipanggil dengan `lakarRunOk=false` saat run tidak ada). Fix: run Lakar tidak ada → `tidak dapat dinilai`.
  - `[medium]` `[patch]` `--resume` mengulang run `invalid` `dokumen lama` yang agennya sudah bekerja penuh (melanggar C8) — terverifikasi. Fix: `isFinalRun` memperlakukan `dokumen lama` sebagai final (dipakai apa adanya, putaran tetap berhenti); hanya `aborted`/init invalid yang diulang. Tes.
  - `[low]` `[reject]` Run/ulangan selesai dipakai ulang tanpa `--resume` bila md belum ada (setelah crash) — terverifikasi, tetapi pemakaian ulang justru perilaku aman C8 (tidak ada run diulang); memaksa `--resume` hanya menambah guard tanpa mencegah kerugian.
  - `[medium]` `[patch]` Penjaga `.pen` saat `--resume` hanya membandingkan dengan snapshot pemanggilan terakhir — terverifikasi. Fix: `penBaseline` memakai `pen-before-*.json` paling awal. Tes.
  - `[low]` `[patch]` Percobaan sebelumnya (`.prev-*`) hilang dari laporan untuk run yang dipakai ulang — terverifikasi (`continue` sebelum pemindaian). Fix: pemindaian dipindah sebelum cabang pakai ulang.
  - `[low]` `[patch]` `pngScaleMismatch` tidak dilaporkan/ditindak di putaran — terverifikasi. Fix: `roundOutcome` memberi alasan `png_scale_mismatch: <run>` dan exit 3 (sama dengan seri baseline). Tes.
  - `[medium]` `[patch]` Exception di tahap juri (spawn, penjaga kebocoran, fs) membuang laporan dan penjaga `.pen` — terverifikasi (tanpa try/catch). Fix: tahap juri per prompt dibungkus try/catch → `fatal`, laporan + penjaga tetap jalan (status `dibatalkan`).

### 2026-11-18 — Review pass (follow-up)
- verdicts: 10 findings (8 lens quick + 2 fokus orkestrator) — high 1, medium 6, low 3, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` Run B-Lakar `invalid` `dokumen lama` menghentikan putaran sebelum juri A; keputusan A tertulis "tidak ada ulangan juri yang valid" — terverifikasi (`fatal` menahan semua juri; berhenti memang sesuai matriks "putaran berhenti", alasannya yang menyesatkan). Fix: alasan menjadi `juri tidak dijalankan: putaran dihentikan (<fatal>)` (konstanta `NO_VALID_REPS`). Akar masalahnya (slug bentrok) ditangani baris slug di bawah.
  - `[medium]` `[patch]` `decide`: run pen.dev gagal dicek sebelum gerbang Lakar, sehingga gerbang gagal + pen.dev gagal = "tidak dapat dinilai", bukan Kalah — terverifikasi. Fix: gerbang dicek sebelum pen.dev. Tes kombinasi.
  - `[medium]` `[patch]` Run final tanpa PNG (mis. Lakar `failed no_doc`) membuat putaran `tidak lengkap` exit 2 selamanya, dan `png_scale_mismatch` hilang di cabang tidak lengkap — terverifikasi. Fix: `allReps` hanya untuk prompt yang bisa dinilai (kedua strip ada); alasan mismatch juga ditulis saat tidak lengkap. Tes.
  - `[low]` `[patch]` Satu restart lakard dihitung 3 reconnect (pid+startedAt+NRestarts), satu restart pen-desktop dihitung 2 — terverifikasi. Fix: `count` = 1 per restart + 1 per halaman dibuat ulang + tool_result; `events` tetap rinci. Tes diperbarui (5 → 3; pen.dev 1).
  - `[low]` `[reject]` Teks Boundaries plan (pen.dev "tool_result is_error") tidak sama dengan kode/DEFINITIONS setelah patch pass pertama — perbaikannya hanya mengedit plan; ditolak sesuai aturan triage. DEFINITIONS di round md sudah menjelaskan aturan yang dipakai.
  - `[medium]` `[patch]` Ulangan juri `invalid`/terputus dipindah ke `rep-k.prev-*` dan dijalankan ulang tanpa jejak di laporan — terverifikasi. Fix: setiap `rep-*.prev-*` dicatat di catatan round md ("percobaan ulangan sebelumnya tidak dipakai"). Penggantian tanpa `--resume` hanya terjadi setelah crash sebelum md ditulis (md ada → wajib `--resume`).
  - `[medium]` `[patch]` `--resume` menulis versi beku (HEAD, versi claude/lakard, sha skill, tanggal) dari pemanggilan resume, bukan dari saat run — terverifikasi. Fix: `frozen.json` ditulis sekali di awal putaran (`wx`); resume memakai versi + tanggal itu dan mencatat perbedaan (`frozenDrift`, pid/startedAt lakard diabaikan). Tes.
  - `[medium]` `[patch]` Error harness sesudah `claude` berjalan (mis. tulis `metrics.json` gagal) membuat run `aborted`, lalu `--resume` menjalankan ulang run berbayar (C8) — terverifikasi (catch di `roundMain` selalu `emptyRecord` = aborted). Fix: `harnessErrorStatus` → `failed` (final) bila `stream.jsonl` ada, untuk kedua alat. Tes.
  - `[medium]` `[patch]` (fokus orkestrator 2) Teks juri memuat kosakata internal sistem desain: `{colors.accent-green}`, `on-accent`, `on-accent-orange`, `mobile-title`, `Ekstra /`, `LC-19`, dan istilah node "board" — terverifikasi dengan merender teks juri nyata (sumbernya kriteria golden-set + frontmatter DESIGN.md + teks harness, bukan transkrip/metadata; verdict dan stream juri uji-1 tidak menyebut token itu). Juri hanya menerima teks + PNG; tidak ada nama file, path, metadata PNG (dijaga `assertBarePng`), dan urutan X/Y acak. Fix: `parseDesignTokens` + `neutralizeInternalTerms` (token → nilai hex/ukuran teks, `Nama /` dan `LC-nn` dibuang, board → artboard), `tokenLeaks` + pola baru di `judgeLeaks` (abort sebelum spawn). Kriteria tetap sama maknanya. Tes unit + tes teks juri nyata.
  - `[high]` `[patch]` (fokus orkestrator 3) Putaran resmi hampir pasti `invalid` `dokumen lama`: agen memilih slug dari nama produk (`kasku-landing`, `gerak-beranda-mobile` sudah ada dari uji-1), dan lakard menyimpan salinan dokumen di memori — terverifikasi (`docs` Map di `packages/daemon/src/server.ts`). Fix di harness saja: `bench/src/lakar/archive.ts` mengambil slug `lakar.slug`/`lakar.opened` dari `run.json` putaran bench lain, memindahkan dokumen, history, dan dir export ke `bench/runs/lakar-archive/<round>-<stamp>/` (tanpa menimpa), lalu `systemctl --user restart lakard` + tunggu pid baru dan pool siap + preflight ulang, sebelum run apa pun. Dokumen non-bench tidak disentuh. Pembungkus/prompt/protokol tidak berubah (`protocolHash` tetap `907cb36f…`). `--dry-run` mencetak rencana arsip tanpa memindahkan. Tes dengan dir sementara; jalur nyata dijalankan sekali (lihat Auto Run Result).

## Design Notes

- **Kenapa juri lewat stream-json input:** sudah dicoba di mesin ini (2026-11-18): `claude -p --input-format stream-json` dengan blok `image` base64, `--tools ""`, dan mcp kosong menghasilkan init `tools=[] mcp=[]`, menjawab dengan benar, biaya $0,02. Tanpa tool Read, juri tidak bisa membaca file atau path apa pun.
- **Kenapa tile:** API mengecilkan gambar dengan sisi panjang > 1568 px. Landing 1440×5000 utuh akan jadi ±450 px lebar dan teks tak terbaca. Tile 1440×≤1000 + overview menjaga keterbacaan.
- **Satu run per alat** (golden-set §Prosedur 3, C8). Run `aborted` (sebelum claude dipanggil) boleh diulang lewat `--resume`. Run `failed` tetap dicatat dan dinilai apa adanya.
- **Bias simpan/ekspor:** sama dengan story 4. Harness Lakar mengekspor di luar waktu. Agen Lakar yang memanggil export sendiri ikut terhitung waktu (alur normal alat).

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm build && /opt/node-26/bin/pnpm test` -- expected: exit 0, 0 skip (DESIGN.md/golden-set ada di mesin).
- `cd /root/lakar && /opt/node-26/bin/node bench/dist/cli.js round --round uji-1 --dry-run` -- expected: exit 0 sesuai AC 1.
- Sebelum putaran: `find /opt/pen /root/comprice /root/lakar/design /root/.pencil/documents -name '*.pen' -exec md5sum {} + | sort > "$SCRATCH/pen-before.txt"`; `jq -S .mcpServers ~/.claude.json`; `md5sum ~/.claude/settings.json`; `systemctl show -p ActiveEnterTimestamp pen-desktop pen-vnc pen-novnc pen-web pen-mcp-http` -- expected: tercatat.
- `cd /root/lakar && /opt/node-26/bin/pnpm bench:round -- --round uji-1` -- expected: exit 0, laporan terbentuk.
- Setelah putaran: bandingkan ulang semua cek di atas -- expected: identik (hanya dokumen baru di `~/.pencil/documents`).
- `cd /root/lakar && git status --porcelain | grep -c 'bench/runs'` -- expected: 0.
- `cd /root/lakar && bash tools/node26/verify.sh; systemctl --user is-active lakard` -- expected: exit 0; active.

**Manual checks:**
- Read keempat strip `bench/runs/rounds/uji-1/{A,B}-{lakar,pendev}.png`. Cocokkan kesan dengan skor juri, lalu catat.

## Auto Run Result

- **Status: built** (2026-11-18). Route full (subagen implementer), review `quick` (pinned): 8 temuan, 7 patch (medium 4, low 3), 1 reject (low), 0 defer.
- **Ringkasan:** paket `bench` kini menjalankan putaran A/B Lakar vs pen.dev dengan satu perintah `pnpm bench:round -- --round <uji-k|n> [--dry-run] [--resume]`:
  - run pen.dev memakai ulang `runOne` story 4 (dipindah ke `pendev/run.ts`);
  - run Lakar lewat `claude -p` simetris (`.mcp.json`, `mcp__lakar`) + harness HTTP lakard di luar waktu (layout_check, export skala 1, salinan dokumen);
  - normalisasi PNG murni (strip vertikal, latar #808080, RGB tanpa metadata, tile + overview);
  - juri buta 3× (`claude -p` stream-json + gambar, tanpa tool/MCP, X/Y acak dengan kedua penugasan muncul, JSON ketat + 1 retry);
  - emoji (a/b/c), reconnect terpisah, gerbang G0 Lakar, keputusan sementara, dan laporan `round-<id>.md|json` + `score-<id>.md|json`;
  - penjaga C7 juri (`tests/judge-c7.test.ts` + preflight).
- **Putaran uji `uji-1`** (konvensi: `uji-<k>` = putaran uji, angka polos = resmi story 16):
  - A: Lakar 130,8 dtk / $0,95 vs pen.dev 167,7 dtk / $0,88. Rasio 0,78 (putaran) / 0,78 (baseline 167,3). Gerbang lolos. Juri 10 vs 6 → **Lebih baik** (sementara).
  - B: Lakar 93,9 dtk / $0,50 vs pen.dev 155,4 dtk / $0,72. Rasio 0,60 / 0,71 (baseline 131,3). Gerbang lolos. Juri 8 vs 8 → **Setara** (sementara).
  - Emoji: pen.dev A 👋 (input agen + juri), lainnya 0. Reconnect 0. Total biaya ≈ $4,56 (+ $0,02 uji juri).
- **File:**
  - `bench/src/pendev/run.ts`: run/preflight pen.dev yang dipakai bersama.
  - `bench/src/log.ts`, `bench/src/sys.ts`: util log, Abort, md5 `.pen`, systemd, git.
  - `bench/src/claude-runner.ts`: tambah `rawArgs` + `stdin`.
  - `bench/src/stream-metrics.ts`: `InitRules.server=null` untuk juri.
  - `bench/src/lakar/{lakard-client,run}.ts`: adaptor Lakar.
  - `bench/src/png/{codec,strip}.ts`: normalisasi PNG.
  - `bench/src/judge/{prompt,run,parse}.ts`: juri buta.
  - `bench/src/round/{emoji,reconnect,score,report,main}.ts`: putaran.
  - Tes baru: `*.test.ts` di folder baru, `tests/judge-c7.test.ts`.
  - `bench/src/cli.ts`: subperintah `round`. `package.json`: `bench:round`.
  - Hasil: `bench/round-uji-1.{md,json}`, `bench/score-{A,B}.{md,json}`.
- **Review:** lihat Review Triage Log. Ditolak: pemakaian ulang run selesai tanpa `--resume` (aman bagi C8, guard tambahan tanpa manfaat).
- **Follow-up review: true** — 4 medium di-patch oleh orkestrator tanpa review ulang. Risiko yang belum terverifikasi: jalur resume (`isFinalRun`, baseline `.pen` paling awal) dan try/catch tahap juri hanya diuji lewat fungsi murni/regenerasi `--resume`, belum lewat kegagalan nyata. Jumlah patch per verdict: high 0, medium 4, low 3.
- **Verifikasi:**
  - `pnpm build` exit 0. `pnpm test` 42 file / 673 tes lulus, 0 skip.
  - `round --round uji-1 --dry-run` exit 0. `--round round-1` exit 64.
  - `bench:round -- --round uji-1` exit 0 (subagen). `--resume` regenerasi exit 0 tanpa run berbayar.
  - Sesudah putaran, md5 29 `.pen` lama identik (2 dokumen pen baru). `jq .mcpServers`, md5 `settings.json`, dan `ActiveEnterTimestamp` pen-* identik dengan snapshot orkestrator sebelum implementasi.
  - `git status | grep -c bench/runs` = 0. `tools/node26/verify.sh` exit 0. lakard active.
  - Keempat strip dilihat (Read).
- **Risiko residual:**
  - HEAD yang tercatat di round md (`d7cf579`) adalah produk beku; kode harness masuk di commit story ini.
  - Teks juri memuat token internal (`{colors.accent-green}`, `mobile-title`, `Ekstra /`) yang tidak terlihat di PNG.
  - Mockup Lakar A terpotong di tepi hero tetapi tidak diturunkan juri. Skor pen.dev A 6 terasa keras. Adam perlu memeriksa.
  - pen.dev B memakai foto, Lakar G0 tanpa foto stok.
  - Slug Lakar yang sama di putaran berikut (mis. `kasku-landing`) → `invalid dokumen lama`. Story 16 perlu mengarsip/memindah dokumen bench sebelum putaran resmi.
  - PNG putaran ada di `bench/runs/` (gitignored), bukan `bench/<id>-<alat>.png`.
  - Keputusan masih sementara (HITL Adam).

### Follow-up review pass (2026-11-18)

- **Status: built.** Review `quick` (pinned) atas diff `d7cf579..` ditambah tiga fokus orkestrator. Ada 10 temuan: 9 patch (high 1, medium 6, low 2), 1 reject (low, perbaikannya hanya mengedit plan), 0 defer. Patch diterapkan orkestrator sendiri, karena implementer step-03 dari sesi sebelumnya tidak bisa di-re-engage.
- **Ringkasan perubahan:**
  - Jalur `--resume` dan C8:
    - `frozen.json` menyimpan versi beku dan tanggal awal putaran.
    - Error harness sesudah agen berjalan menjadi `failed` (final).
    - Ulangan juri `.prev` dicatat di laporan.
    - Status `tidak lengkap` hanya untuk prompt yang bisa dinilai, dan mismatch selalu dilaporkan.
  - Keputusan:
    - gerbang gagal → Kalah, walau run pen.dev juga gagal;
    - alasan "juri tidak dijalankan" bila putaran berhenti.
  - Reconnect dihitung per kejadian.
  - Kebutaan juri: istilah internal dinetralkan, penjaga kebocoran diperluas.
  - Slug: dokumen Lakar dari putaran bench lain diarsipkan, lalu lakard di-restart sebelum run.
- **Fokus 1** (resume, penjaga `.pen`, try/catch juri), ditinjau ulang:
  - `penBaseline` memakai snapshot paling awal. Benar.
  - try/catch juri menetapkan `fatal`, lalu laporan dan penjaga `.pen` tetap jalan. Benar.
  - Celah yang ditemukan dan sudah di-patch: versi beku saat resume, error harness pasca-agen, dan jejak ulangan juri.
- **File:**
  - `bench/src/lakar/archive.ts` (baru): arsip slug bench.
  - `bench/src/sys.ts`: `restartUserUnit`, yang menolak unit `pen-*`.
  - `bench/src/round/main.ts`: arsip + restart + preflight ulang, `frozen.json`/`frozenDrift`, `harnessErrorStatus`, `allReps` per prompt yang bisa dinilai, catatan ulangan `.prev`, dan alasan keputusan.
  - `bench/src/round/score.ts`: urutan gerbang, `NO_VALID_REPS`.
  - `bench/src/round/reconnect.ts`: hitungan per kejadian.
  - `bench/src/judge/prompt.ts`: `parseDesignTokens`, `neutralizeInternalTerms`, `tokenLeaks`, pola kebocoran baru, "artboard".
  - Tes: `judge/judge.test.ts`, `lakar/lakar.test.ts`, `round/round.test.ts`.
- **Verifikasi:**
  - `pnpm build` exit 0.
  - `pnpm test`: 42 file, 678 tes lulus, 0 skip.
  - `round --round 1 --dry-run` exit 0:
    - `protocolHash` = baseline `907cb36f…`, tidak berubah;
    - C7 agen dan juri lulus;
    - rencana arsip tercetak (6 entri);
    - tidak ada `bench/round-1.md`.
  - Teks juri nyata dirender ulang. Diff hanya pada istilah internal; tidak ada `{colors.`, `mobile-title`, `on-accent`, `LC-`, atau `board`.
  - Jalur arsip nyata dijalankan sekali lewat fungsi yang sama (tanpa claude, $0):
    - 6 entri (`kasku-landing`, `gerak-beranda-mobile`) dipindah ke `bench/runs/lakar-archive/verifikasi-review-20261118T044757Z/`;
    - lakard di-restart, pid 380920 → 560203, siap dalam 1,3 dtk;
    - rencana sesudahnya kosong.
  - `tools/node26/verify.sh` exit 0. lakard `active`.
  - `git status --porcelain | grep -c bench/runs` = 0.
  - Tanpa run `claude -p` berbayar.
- **Follow-up review: false.** Satu high di-patch (slug), tetapi jalurnya sudah terverifikasi nyata (arsip + restart + pool siap). Tidak ada risiko spesifik yang tersisa tanpa verifikasi. Jumlah patch per verdict: high 1, medium 6, low 2.
- **Risiko residual:**
  - Laporan `uji-1` yang sudah di-commit dibuat dengan teks juri lama (masih memuat istilah internal). Laporan itu tidak diregenerasi, karena skornya memang berasal dari teks itu.
  - Integrasi penuh arsip → run dalam satu `roundMain` baru akan teruji di putaran resmi story 16.
  - Slug agen yang bentrok dengan dokumen non-bench tetap `invalid` (disengaja).
  - PNG di `bench/runs` dibiarkan untuk story 16.

