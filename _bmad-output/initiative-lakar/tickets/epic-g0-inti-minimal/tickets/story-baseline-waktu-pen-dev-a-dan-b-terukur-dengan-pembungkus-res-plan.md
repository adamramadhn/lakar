---
title: 'Baseline waktu pen.dev A dan B terukur dengan pembungkus resmi'
type: feature
ticket: '4'
created: '2026-11-17'
status: built
baseline_revision: 'a1a75938038489a97b07237a4dab43c7074dd032'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/tools/node26/README.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Gerbang G0 (waktu Lakar ≤ 1,5× pen.dev) butuh baseline pen.dev yang diukur simetris (AD-13). Saat ini A hanya punya 1 run (86 dtk / $0,88) dan B belum pernah diukur. Belum ada runner `claude -p`, pembungkus prompt resmi, atau pengukur waktu yang bisa dipakai ulang story 14 (bench Lakar + juri buta).

**Approach:** Isi paket `bench` dengan modul generik: protokol (pembungkus + teks prompt, dibekukan dengan hash), runner `claude -p --output-format stream-json` yang memberi cap waktu tiap baris, dan parser metrik. Tambahkan adaptor pen.dev:
- dokumen baru lewat `pen-newdoc.sh` + verifikasi;
- klien MCP `pencil` milik harness untuk `get_app_state`/`save`/`execute` (Get, Export) setelah `result`;
- salin `.pen` eksklusif dan PNG skala 1.

Satu perintah CLI menjalankan 6 run (A,B berselang, 3 sukses per prompt), lalu menulis `bench/baseline-pendev.md` + `bench/baseline-pendev.json`.

## Boundaries & Constraints

**Always:**
- **Waktu (AD-13):** `wall_ms` = cap waktu monoton saat baris event `result` diterima − cap waktu baris stdout pertama (event pertama). Baris diberi cap waktu saat tiba. Transkrip mentah ditulis byte-identik ke `stream.jsonl`, dan cap waktu ditulis di `timing.json` terpisah.
- **Dari `result`, dicatat:** `total_cost_usd`, `duration_ms`, `duration_api_ms`, `num_turns`, `is_error`, `subtype`, kunci `modelUsage`.
- **Dari `system/init`, dicatat:** `model`, `claude_code_version`, `cwd`, `mcp_servers`, `tools`.
- **Diagnostik saja (bukan waktu gerbang):** offset `tool_use` pertama → `tool_result` terakhir (golden-set §Prosedur 3), jumlah tool call, dan overhead spawn→event pertama.
- **Argumen `claude -p` identik untuk semua alat.** Hanya `--mcp-config` dan `--allowedTools` yang berbeda:
  - `-p <prompt hasil render>` `--model claude-opus-5-5` `--output-format stream-json --verbose`
  - `--strict-mcp-config --mcp-config <file>` `--allowedTools mcp__<server>`
  - `--tools ""` `--disable-slash-commands` `--no-session-persistence`
  - Tanpa `--effort` (pengaturan user tidak mengisi `effortLevel`, jadi default berlaku dan dicatat). Tanpa `--system-prompt`/`--append-system-prompt`.
  - cwd = direktori tmp kosong baru di luar `/root/lakar`, dihapus setelah run. Tanpa cwd itu, auto-memory project dan CLAUDE.md, yang menunjuk ke golden set, ikut termuat.
- **Model dipin `claude-opus-5-5`** (model sesi saat ini = "Opus 5.5" di golden-set) untuk kedua alat. Nilai ini ada di `bench/protocol/protocol.json` dan dipakai ulang story 14.
- **`bench/mcp/pencil.json`** berisi tepat `{"mcpServers":{"pencil":{"type":"stdio","command":"/opt/pen/squashfs-root/resources/app.asar.unpacked/out/mcp-server-linux-arm64","args":["--app","desktop","--agent","claudeCodeCLI"],"env":{}}}}`. Isinya persis entri di `~/.claude.json`, tanpa `pen-headless`. Preflight membandingkan isinya dengan `~/.claude.json` (hanya baca) dan abort bila beda.
- **Validasi event `init` per run.** Run dibatalkan sebagai `invalid` bila salah satu ini terjadi:
  - `mcp_servers` ≠ `[pencil]` (status `connected`);
  - ada tool yang tidak berawalan `mcp__pencil__`;
  - `cwd` berada di bawah `/root/lakar`.
- **C7:**
  - Pembungkus (`bench/protocol/wrapper.txt`) hanya berisi instruksi netral dan placeholder `{{PROMPT}}`. Contoh isi: mode benchmark tanpa interaksi, jangan bertanya, kerjakan di dokumen baru yang kosong dengan tool desain yang tersedia, akhiri dengan "selesai".
  - Pembungkus tidak menyebut nama alat, menyimpan, atau ekspor.
  - `bench/protocol/prompts.json` berisi teks prompt A dan B, disalin persis dari blockquote **Prompt:** di `golden-set.md` §A/§B. Hanya blockquote itu yang disalin. Kriteria, tag, dan §Prosedur tidak disalin ke file mana pun di `bench/`.
- **Penjaga C7** (fungsi murni `checkC7(rendered, goldenSetText)`) dipakai tes dan preflight runner. Hasilnya gagal bila salah satu ini terjadi:
  - (a) prompt di `prompts.json` ≠ blockquote golden-set;
  - (b) teks hasil render berisi n-gram 6 kata dari butir "Kriteria target" A/B, §Prosedur, atau §Risiko;
  - (c) teks hasil render berisi `[R1]`–`[R8]`, `[G]`, `layout_check`, `rubrik`, `juri`, `kriteria`, `golden`, atau `DESIGN.md`.
- **Hash protokol.** `sha256(wrapper.txt + prompts.json + protocol.json)` dicatat di md dan json. Story 14 menolak jalan bila hash berbeda tanpa putaran baru.
- **Sebelum SETIAP run pen.dev, urutannya:**
  1. Snapshot `~/.pencil/documents/*/*.pen`.
  2. `bash /root/pen-vps-kit/pen-newdoc.sh`, lalu parse baris `Dokumen baru aktif:`.
  3. Klien MCP harness memanggil `get_app_state`. URI harus sama dengan hasil parse, berbeda dari URI run sebelumnya, tidak termasuk dokumen di snapshot (termasuk `1e55d426-…/untitled.pen` yang berisi golden set), dan `execute` Get top-level harus mengembalikan 0 frame.
  4. Klien harness ditutup, lalu `claude -p` dijalankan.
  - Satu cek gagal → run `aborted` tanpa memanggil claude, dan seluruh seri berhenti (exit ≠ 0).
- **Setelah `result` (di luar waktu), harness:**
  1. Memanggil `save {uri}`.
  2. Menyalin file URI ke `bench/runs/pendev/<runId>/design.pen` dengan `COPYFILE_EXCL`. Tujuan harus di bawah `bench/runs/` dan belum ada.
  3. Mencatat frame top-level: `Get((n,c)=>{c.skipChildren();Print(n.id,"|",n.name,"|",n.width,"|",n.height)})`.
  4. Memanggil `Export([ids],"png","<run>/png")`.
  5. Memverifikasi IHDR tiap PNG: lebar/tinggi = ukuran frame (skala 1). Bila Export memakai skala lain, cari parameter skala di dokumentasi `execute` pen.dev (`read_skill`) dan catat di Implementation Notes.
- **Run berurutan, A dan B berselang:** A1 B1 A2 B2 A3 B3.
  - Run gagal (`is_error`, `subtype` ≠ `success`, tanpa `result`, timeout 1800 s, exit ≠ 0, atau 0 frame) dicatat `failed` dan tidak masuk median. Seri lanjut sampai 3 sukses per prompt, maksimal 4 percobaan per prompt.
  - Kalau sukses masih < 3, md tetap ditulis dengan status `tidak lengkap` dan CLI exit 2. Run tidak dipilih-pilih (C8).
- Node hanya lewat `/opt/node-26/bin/node` dan `/opt/node-26/bin/pnpm`. Versi dependensi terpin eksak: `@modelcontextprotocol/client` 2.4.0, `@types/node` 26.6.6. `bench` menambah `"types":["node"]`. Arah dependensi tetap `bench→schema`.

**Never:**
- Jangan ubah `~/.claude.json`, `~/.claude/settings.json`, `claude mcp add`, service `pen-*` (jangan restart/stop), atau `.pen` yang ada (`/opt/pen/**`, `/root/comprice/**`, `design/lakar-golden-set.pen`, dan dokumen lama `~/.pencil/documents`). Jangan pakai `pen-headless` atau `pen` CLI untuk run yang diukur.
- Jangan baca/tulis `.pen` dengan Read/Grep. Akses hanya lewat MCP atau salinan byte.
- Tidak ada teks kriteria/rubrik di `bench/protocol/`, `bench/mcp/`, argumen claude, atau transkrip input. Jangan membaca `design/`.
- Di luar cakupan: run Lakar, strip mobile vertikal, juri, `round-<n>.md`, dan `score-<id>.md` (story 14).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Metrik normal | fixture stream: init, assistant tool_use×2, user tool_result×2, result success | `wall_ms` = t(result) − t(baris 1); cost/turns/model/durasi terbaca; offset tool pertama/terakhir | — |
| Tanpa result | fixture terpotong | run `failed`, `reason:'no_result'` | tidak masuk median |
| result error | `is_error:true` atau `subtype:'error_max_turns'` | `failed` | tidak masuk median |
| Init melanggar | `mcp_servers` berisi `lakar`/`pen-headless`, tool `Read`, atau cwd `/root/lakar` | `invalid` | seri berhenti |
| Baris non-JSON | stderr/baris rusak di stdout | baris disimpan mentah dan diabaikan oleh parser | — |
| Median | [90,120,100] / dua sukses saja | 100 / status `tidak lengkap` | exit 2 |
| C7 bocor | wrapper diberi "`Tujuh bagian hadir sesuai urutan`" atau `[R6]` | `checkC7` gagal dan menyebut frasanya | preflight abort sebelum run |
| Prompt bergeser | `prompts.json` A beda 1 karakter dari golden-set | `checkC7` gagal (a) | abort |
| Newdoc gagal | URI sama dengan sebelumnya, URI dokumen golden, URI kosong, atau frame > 0 | run `aborted`, claude tidak dipanggil | seri berhenti, exit ≠ 0 |
| Tujuan salin | `design.pen` sudah ada, atau path di luar `bench/runs/` | ditolak | error, file sumber tak disentuh |
| PNG bukan skala 1 | IHDR 2880 untuk frame 1440 | run ditandai `png_scale_mismatch` | md mencatat, perlu perbaikan |

</intent-contract>

## Code Map

- `bench/package.json`, `bench/tsconfig.json`, `bench/src/index.ts` -- kerangka kosong dari 1.2. Ganti `index.ts` dengan ekspor modul. Tambah dependensi dan `"types":["node"]`.
- `scripts/tracer-e2e.sh` -- pola pemanggilan `claude -p --strict-mcp-config --mcp-config … --allowedTools … --output-format stream-json --verbose` dan stdout→jsonl. Hanya baca.
- `scripts/tracer-check.mjs` -- contoh parse stream-json (tool_use/tool_result). Bisa dirujuk untuk bentuk event.
- `packages/mcp/package.json` -- `@modelcontextprotocol/client` 2.4.0 sudah ada di lockfile. Pakai `Client` + `StdioClientTransport` dengan cara yang sama.
- `tests/dependency-direction.ts` -- `bench` hanya boleh `@lakar/schema`. Pustaka eksternal bebas karena bench bukan paket non-IO.
- `/root/pen-vps-kit/pen-newdoc.sh` -- membuka dokumen baru lewat `xdotool ctrl+shift+n` (DISPLAY :99) dan mencetak baris `Dokumen baru aktif: <baris URI dari get_app_state>`. Hanya dijalankan, tidak diubah.
- `/opt/pen/pen_mcp.py` `list_frames`/`tool_pen_to_code` -- snippet `execute` terbukti: `Get((n,c)=>{c.skipChildren();Print(...)})` dan `Export([ids],"png",dir)` (menulis `<id>.png`). Hanya acuan.
- Tool MCP `pencil`:
  - `save {uri}` hanya menyimpan ke URI dokumen itu sendiri, tidak ada "save as". Karena itu `.pen` baru dibuat lewat salinan file.
  - `execute {uri, description, input}`
  - `get_app_state {}`
- Versi (2026-11-17): claude 2.1.325, pen desktop 1.2.23 (`X-AppImage-Version`; dicatat juga `serverInfo.version` dari `initialize` MCP), Electron 44.9.3.
- `_bmad-output/initiative-lakar/ux-lakar/golden-set.md` -- dikecualikan dari git (`.git/info/exclude`). Dibaca hanya oleh `checkC7` (tes + preflight) dan oleh implementer untuk menyalin dua blockquote prompt.
- `.gitignore` -- tambah `bench/runs/`.
- `tools/node26/verify.sh` -- bukti C9. Hanya baca.

## Tasks & Acceptance

**Execution:**
- [x] `bench/protocol/wrapper.txt`, `bench/protocol/prompts.json`, `bench/protocol/protocol.json` -- pembungkus netral, prompt A/B persis, dan `{model:"claude-opus-5-5", timeoutMs:1800000, runsPerPrompt:3, maxAttemptsPerPrompt:4, claudeArgs:[...flag bersama]}` -- satu sumber yang dipakai ulang story 14.
- [x] `bench/mcp/pencil.json` -- konfigurasi strict seperti di Boundaries.
- [x] `bench/src/protocol.ts` -- `loadProtocol()`, `renderPrompt(id)`, `protocolHash()`, `checkC7(rendered, goldenText)`, dan `extractGoldenPrompt(goldenText, id)`.
- [x] `bench/src/stream-metrics.ts` -- fungsi murni: daftar `{t, line}` → `RunMetrics` (wall, cost, durasi, turns, model, versi, info init, offset tool, status, alasan) + `validateInit()`.
- [x] `bench/src/claude-runner.ts` -- `runClaude({prompt, mcpConfig, allowedTools, protocol, outDir})`: `buildArgs()` murni yang diekspor, spawn `claude` di cwd tmp, cap waktu `performance.now()` per baris, tulis `stream.jsonl`/`stderr.txt`/`timing.json`, timeout → kill. Tidak tahu apa pun tentang pen.dev.
- [x] `bench/src/stats.ts` -- median, min, maks.
- [x] `bench/src/pendev/pencil-client.ts` -- klien MCP stdio harness: `appState()` (parse URI), `listTopFrames(uri)`, `save(uri)`, `exportPng(uri, ids, dir)`, `close()`, plus versi server.
- [x] `bench/src/pendev/newdoc.ts` -- jalankan `pen-newdoc.sh`, parse output, lalu `verifyNewDoc({uri, prevUris, snapshot, frames})` murni.
- [x] `bench/src/pendev/artifacts.ts` -- `assertSafeDestination()` murni, salin eksklusif, dan baca IHDR PNG (24 byte, tanpa dependensi daemon).
- [x] `bench/src/report.ts` -- render `baseline-pendev.md` dan `.json`. Isinya:
  - tanggal, `protocolHash`, versi model (pin + `modelUsage`), versi claude, versi pen (desktop + MCP server), dan effort default;
  - isi pembungkus kata per kata, plus teks prompt A/B;
  - argumen claude;
  - tabel per run: runId, prompt, status, wall dtk, `duration_ms`, biaya, turns, tool call, jumlah frame, ukuran transkrip, path `.pen`/PNG;
  - median dan rentang waktu serta biaya per prompt, run gagal, dan catatan pengukuran (AD-13; offset tool hanya diagnostik).
- [x] `bench/src/cli.ts` + skrip root `bench:pendev` (`node bench/dist/cli.js pendev-baseline`) -- preflight (C7, pencil.json vs `~/.claude.json`, `which claude`, service `pen-desktop` aktif), lalu seri berselang, lalu laporan. `--dry-run` hanya mencetak argv, prompt hasil render, dan hash, tanpa newdoc atau claude.
- [x] `bench/src/*.test.ts` -- fixture stream untuk setiap baris matriks, `buildArgs` (flag bersama, tanpa `--system-prompt`, `-p` = hasil render), `checkC7` (lulus pada protokol nyata; gagal pada injeksi; skip dengan pesan bila golden-set.md tidak ada), `verifyNewDoc`, `assertSafeDestination`, IHDR, median, dan snapshot render md.
- [x] `.gitignore` -- `bench/runs/` (transkrip berisi screenshot base64 dan bisa berukuran MB, `.pen`, PNG). Yang di-commit hanya `baseline-pendev.md`/`.json`.
- [x] `bench/baseline-pendev.md`, `bench/baseline-pendev.json` -- hasil seri nyata (setelah persetujuan Adam).

**Acceptance Criteria:**
- Given build selesai, when `/opt/node-26/bin/node bench/dist/cli.js pendev-baseline --dry-run`, then argv dicetak dan memuat `--model claude-opus-5-5 --strict-mcp-config --tools "" --output-format stream-json`. Prompt A/B hasil render lolos `checkC7`. Tidak ada dokumen pen baru dan tidak ada proses claude.
- Given Adam menyetujui biaya, when `/opt/node-26/bin/pnpm bench:pendev`, then `bench/baseline-pendev.md` berisi 3 run sukses plus median waktu dan biaya untuk A dan B, versi model, claude, dan pen, serta isi pembungkus. `bench/runs/pendev/<runId>/` berisi `stream.jsonl`, `timing.json`, `design.pen`, dan `png/*.png` dengan IHDR = ukuran frame.
- Given seri selesai, when membandingkan md5 semua `.pen` yang sudah ada sebelum seri, isi `jq .mcpServers ~/.claude.json`, md5 `~/.claude/settings.json`, dan `ActiveEnterTimestamp` service `pen-*`, then semuanya identik dengan catatan sebelum seri.
- Given seri selesai, when `git status --porcelain`, then `bench/runs/` tidak muncul.

## Langkah HITL (butuh Adam)

1. **plan_checkpoint, sebelum implementasi:** Adam menyetujui hal-hal berikut:
   - 6–8 panggilan `claude -p` Opus 5.5 berbayar. Perkiraan sekitar $6–10, berdasarkan run A $0,88, dengan total ±15–30 menit.
   - 6–8 dokumen baru di canvas pen-desktop, yang tampak di VNC.
   - Model dipin ke `claude-opus-5-5`.
   - Isi `wrapper.txt`.
2. **done_checkpoint:** Adam memeriksa `baseline-pendev.md` dan beberapa PNG.

## Implementation Notes

**Amandemen orkestrator (2026-11-17, berlaku untuk implementasi; intent-contract tidak diubah):**
- HITL plan_checkpoint dianggap disetujui (Adam menyerahkan keputusan ke orkestrator): 6–8 run `claude -p` berbayar (~$6–10), dokumen pen.dev baru per run, pin `--model claude-opus-5-5`, dan isi `wrapper.txt` sesuai plan. Seri `bench:pendev` sungguhan dijalankan sebagai bagian Verification.
- Proses `claude -p` dijalankan dengan env `ENABLE_TOOL_SEARCH=false` (simetris untuk semua alat; ditetapkan di runner generik / `protocol.json`, bukan di adaptor pen.dev) agar tool MCP dimuat langsung dan tidak bergantung pada `ToolSearch` yang dimatikan `--tools ""`. Ini menggantikan cadangan "`--tools ToolSearch`" di Design Notes.
- Runner memvalidasi event `system/init`: daftar `tools` wajib memuat tool MCP alat yang diuji (untuk pen.dev: minimal satu `mcp__pencil__*`, dan `mcp__pencil__execute`). Bila tidak, run dibatalkan sebagai gagal-setup (`invalid`, tidak dihitung, tidak masuk median) dan seri berhenti dengan pesan jelas. Proses claude dihentikan segera setelah init invalid terdeteksi.
- Sebelum seri penuh, lakukan satu run uji kecil/murah (mis. prompt netral singkat lewat runner yang sama, di dokumen baru hasil `pen-newdoc.sh`) untuk membuktikan init memuat tool `mcp__pencil__*`; catat biayanya di sini dan jangan masukkan ke baseline.
- Aturan keras: hanya MCP `pencil` (bukan pen-headless); sebelum setiap run `pen-newdoc.sh` + verifikasi `get_app_state` dokumen baru & kosong; dokumen golden `~/.pencil/documents/1e55d426-3895-4cef-8d4b-52763be3aff4/untitled.pen` tidak boleh aktif saat agen berjalan dan tidak boleh diubah; jangan timpa `.pen` yang ada; jangan buka `~/.pencil/session-desktop.json` (kredensial) — versi pen diambil dari sumber lain; C9: bukti `bash tools/node26/verify.sh` exit 0 di akhir.

**Catatan implementasi (2026-11-17):**
- **Skala Export:** `execute.md` (`read_skill {path:"execute.md"}`) menulis `ExportOptions.scale` default 2. Harness memakai `Export([ids],"png",<dir>,{scale:1})`; dicoba di dokumen smoke (frame 390×844 → IHDR 390×844).
- **Ukuran frame:** `n.height` frame top-level bisa `null` (fit content), jadi snippet harness mencetak `n.width/n.height` *dan* `ctx.bounds.width/height`; IHDR dibandingkan dengan bounds.
- **`pen-newdoc.sh` tidak mencetak URI:** skrip mengirim initialize + tools/call lalu menutup stdin sekaligus; server `pencil` keluar sebelum menjawab tools/call (direproduksi tanpa xdotool: stdout hanya respons initialize). Dokumen baru tetap terbuat. Skrip tidak diubah; `verifyNewDoc` memakai URI dari `get_app_state` harness bila baris `Dokumen baru aktif:` tidak ada, dengan syarat tambahan file `.pen`-nya muncul sesudah newdoc dan tidak ada di snapshot sebelumnya. Asal URI dicatat per run (`uriSource`).
- **Env claude:** sesi pemanggil mewarisi `CLAUDE_EFFORT=medium` dan variabel `CLAUDE_CODE_*`. Runner membuang variabel berawalan `CLAUDE`/`AI_AGENT` (`protocol.json` `envScrubPrefixes`) agar effort default benar-benar berlaku, lalu menambah `ENABLE_TOOL_SEARCH=false`.
- **C7 (b):** selain n-gram 6 kata, kalimat utuh 5 kata dari sumber terlarang juga dilarang (agar "Tujuh bagian hadir sesuai urutan" di matriks tertangkap).
- **Run uji (smoke):** `node bench/dist/cli.js pendev-smoke` (prompt netral "panggil get_app_state"), dokumen baru `3b6f7180-…`. Init: `mcp_servers=[pencil connected]`, 6 tool `mcp__pencil__*` termasuk `execute`, model `claude-opus-5-5`. Biaya **$0.0587**, tidak masuk baseline. Percobaan smoke pertama dibatalkan sebelum claude (URI newdoc kosong → perbaikan di atas), biaya $0; dokumen kosong `53a59be3-…` tertinggal di `~/.pencil/documents`.

- **Seri pertama terhenti (harness crash, bukan kegagalan run):** seri `20261117T230029Z` menyelesaikan A1 (193,2 dtk / $0,90), B1 (135,0 dtk / $0,62), A2 (154,6 dtk / $0,79), semuanya sukses dengan IHDR = ukuran frame. Sebelum B2 (sebelum claude dipanggil), `execute` Get pada dokumen baru `1f1bc524-…` melempar "you are probably referencing the wrong .pen file" (dokumen belum siap tepat setelah ctrl+shift+n), dan exception itu tidak tertangkap sehingga laporan tidak ditulis. Perbaikan: verifikasi newdoc diulang sampai 15× berjeda 1 dtk; error harness per run dicatat sebagai `aborted` dan laporan tetap ditulis. Agar tidak memilih-milih run (C8), ketiga run itu **tidak** dicampur ke baseline; seri baru penuh dijalankan dari awal. Artefaknya disimpan di `bench/runs/pendev-seri-terhenti/` (biaya $2,31 di luar baseline).

- **Seri baseline `20261117T231042Z` (exit 0, `lengkap`):** A median 167,3 dtk (153,2–172,1) / $0,84; B median 131,3 dtk (97,6–179,3) / $0,64; 6/6 sukses, IHDR = ukuran frame di semua run. B3 membuat board 390×1024 (bukan 844), dicatat apa adanya. Pemeriksaan sesudah seri: semua `.pen` lama identik (md5), hanya dokumen baru di `~/.pencil/documents` yang bertambah; `jq .mcpServers`, md5 `settings.json`, dan `ActiveEnterTimestamp` service `pen-*` identik; `bench/runs` tidak muncul di `git status`; `tools/node26/verify.sh` exit 0. Total biaya claude sesi ini ≈ $6,8 (smoke $0,06 + seri terhenti $2,31 + baseline $4,41).

- **Verifikasi orkestrator (step-03):** audit matriks menemukan baris "Median / dua sukses → tidak lengkap, exit 2", "Init melanggar/Newdoc gagal → seri berhenti", dan "PNG bukan skala 1 → png_scale_mismatch" hanya terimplementasi di `cli.ts` tanpa tes. Logika itu dipindah ke `bench/src/series.ts` murni (`needsRun`, `isFatal`, `seriesOutcome`, `pngScaleMismatch`) + `series.test.ts`, dan `report.test.ts` memeriksa `png_scale_mismatch` tercetak di md. `checkC7` kini gagal (b) bila golden-set tidak memberi sumber terlarang sama sekali (tidak lulus kosong). File protokol tidak berubah; hash tetap `907cb36f…`. Seri tidak diulang (perilaku runtime identik).

## Plan Change Log

- 2026-11-17: fallback URI `get_app_state` di `verifyNewDoc` (pen-newdoc.sh tidak mencetak URI); `envScrubPrefixes` di `protocol.json`; perintah `pendev-smoke` tambahan di CLI.

## Review Triage Log

### 2026-11-17 — Review pass
- verdicts: 10 findings — high 0, medium 2, low 6, false 1, maybe-false 0 (1 low ditolak)
- findings:
  - `[medium]` `[patch]` Retry newdoc hanya saat exception; bila get_app_state masih melaporkan dokumen lama, run langsung `aborted` dan seri berhenti — loop kini juga mengulang selama `verifyNewDoc` punya problems (maks 15×), alasan abort = problems terakhir.
  - `[medium]` `[patch]` `PencilClient.connect`/`close` fase pasca-result di luar try → metrik terukur (wall, biaya, turns) hilang dan seri berhenti — connect dipindah ke dalam try, close gagal dicatat & diabaikan; run tetap menyimpan metrik dan ditandai `failed` (`post:`).
  - `[false]` `[reject]` Tanpa event `system/init` dianggap `invalid` (fatal), bukan `failed` — sengaja: amandemen orkestrator mensyaratkan init memuat tool `mcp__pencil__*`; tanpa init syarat itu tidak terpenuhi = gagal-setup, jadi menghentikan seri sesuai kontrak.
  - `[low]` `[patch]` Jalur reject `runClaude` (spawn error) membocorkan cwd tmp, stream, dan timer 30 menit; cek forbiddenCwdRoot setelah mkdtemp meninggalkan dir — try/finally untuk clearTimeout, tutup stream, rmSync(cwd); dir dihapus sebelum throw.
  - `[low]` `[patch]` stderr server pencil di-`pipe` tanpa dibaca (risiko pipe penuh → hang) — diganti `'ignore'`.
  - `[low]` `[reject]` `pendev-baseline` berikutnya selalu menimpa `baseline-pendev.md` yang sudah di-commit — plan mewajibkan md ditulis juga saat tidak lengkap; versi ter-commit tetap ada di git dan perubahan tampak di diff; guard per-seri menambah kompleksitas untuk kasus jarang.
  - `[low]` `[patch]` Baris effort di laporan meng-hard-code "settings.json tanpa effortLevel" — `userEffortLevel()` membaca `~/.claude/settings.json` hanya-baca dan mencatat nilai sebenarnya.
  - `[low]` `[patch]` Preflight hanya membandingkan entri `pencil`; server tambahan di `bench/mcp/pencil.json` lolos — preflight kini abort kecuali kunci `mcpServers` tepat `['pencil']`.
  - `[low]` `[patch]` `bench:pendev` tanpa guard `assert-node.mjs` dan shebang `#!/usr/bin/env node` bisa memakai Node 22 — skrip diberi guard, shebang `#!/opt/node-26/bin/node`.
  - `[low]` `[patch]` `checkC7` dengan peta prompts kosong melewati cek (a) diam-diam — kini melaporkan problem (a); tes ditambah.

## Design Notes

- **Simpan di luar waktu, oleh harness.** Pembungkus harus identik untuk kedua alat, jadi instruksi "simpan" khusus pen.dev tidak boleh ditambahkan. Lakar menulis file di setiap `execute` (biayanya sudah termasuk di latensi tool Lakar), sedangkan pen.dev menahan dokumen di app. `save` + salin setelah `result` hanya membuat baseline pen.dev sedikit lebih cepat, sehingga gerbang 1,5× jadi lebih ketat bagi Lakar. Jadi bias ini konservatif dan dicatat di md. Kalau agen memanggil `save` sendiri, itu tetap sah dan masuk waktu, seperti pemakaian normal.
- **Ekspor lewat app desktop yang sama**, dengan renderer yang juga dilihat agen. Cadangannya, bila Export di desktop menolak path absolut: `pen interactive -i design.pen -o <run>/export-tmp.pen` dengan snippet yang sama, pola `pen_to_code`. Cadangan ini dipakai hanya di luar waktu dan dicatat.
- **Tool MCP yang ditunda (deferred):** bila event `init` run pertama tidak memuat `mcp__pencil__execute` karena tool MCP butuh `ToolSearch`, ubah `--tools ""` → `--tools ToolSearch` di `protocol.json` (berlaku untuk kedua alat), izinkan `ToolSearch` di `validateInit`, buang run itu sebagai `invalid`, dan catat di Implementation Notes serta md.
- **Penggunaan ulang di story 14:** `protocol`, `claude-runner`, `stream-metrics`, `stats`, dan bagian generik `report` tidak bergantung pada pen.dev. Story 14 menambah `lakar/` (mcp config `.mcp.json`, `mcp__lakar`) dengan argumen yang sama.

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm install && /opt/node-26/bin/pnpm build && /opt/node-26/bin/pnpm test` -- expected: exit 0. Tes bench lulus. `checkC7` jalan (tidak skip) di mesin ini.
- `cd /root/lakar && /opt/node-26/bin/node bench/dist/cli.js pendev-baseline --dry-run` -- expected: exit 0, argv sesuai AC.
- Sebelum seri: `find /opt/pen /root/comprice /root/lakar/design /root/.pencil/documents -name '*.pen' -exec md5sum {} + | sort > "$SCRATCH/pen-before.txt"`, `jq -S .mcpServers ~/.claude.json > "$SCRATCH/mcp-before.json"`, `md5sum ~/.claude/settings.json`, dan `systemctl show -p ActiveEnterTimestamp pen-desktop pen-vnc pen-novnc pen-web pen-mcp-http` -- expected: tercatat.
- `cd /root/lakar && /opt/node-26/bin/pnpm bench:pendev` (hanya setelah persetujuan HITL 1) -- expected: exit 0, md dan json terbentuk.
- Setelah seri: ulangi `find … md5sum` lalu `join` dengan `pen-before.txt`. Expected: semua baris lama identik. Baris baru hanya dokumen `~/.pencil/documents/<uuid baru>` dan `bench/runs/**`. `jq`, `md5sum`, dan `systemctl show` identik.
- `cd /root/lakar && git status --porcelain | grep -c 'bench/runs'` -- expected: 0.
- `cd /root/lakar && bash tools/node26/verify.sh` -- expected: exit 0.

**Manual checks:**
- Adam membuka `bench/baseline-pendev.md` dan 1 PNG A + 1 PNG B. Expected: board 1440 lebar / 390×844, dan angka median masuk akal dibanding run lama (86 dtk).

## Auto Run Result

- **Status: built** (2026-11-17). Implementasi oleh subagen (route full), review `quick` (pinned), 8 patch diterapkan, 2 temuan ditolak, 0 defer.
- **Ringkasan:** paket `bench` berisi protokol beku (wrapper/prompts/protocol.json, hash `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d`), runner `claude -p` generik dengan cap waktu per baris (AD-13), parser metrik + validasi init, adaptor pen.dev (newdoc+verifikasi, klien MCP harness, salin eksklusif, Export PNG skala 1, IHDR), laporan md/json, CLI `pendev-baseline [--dry-run]`/`pendev-smoke`, dan `bench:pendev`.
- **Baseline nyata (seri `20261117T231042Z`, lengkap, 6/6 sukses):** A median 167,3 dtk (153,2–172,1), biaya median $0,84; B median 131,3 dtk (97,6–179,3), $0,64. Model `claude-opus-5-5`, Claude Code 2.1.325, pen.dev desktop 1.2.23, MCP server pencil 1.0.0. Semua IHDR = ukuran frame. B3 = 390×1024.
- **File:** `bench/protocol/*` (protokol beku), `bench/mcp/pencil.json` (config strict), `bench/src/{protocol,stream-metrics,claude-runner,stats,report,series,cli,index}.ts` (+ tes, snapshot), `bench/src/pendev/{pencil-client,newdoc,artifacts}.ts` (+ tes), `bench/baseline-pendev.{md,json}` (hasil), `bench/package.json`/`tsconfig.json` (dependensi terpin, types node), `package.json` (`bench:pendev`), `.gitignore` (`bench/runs/`), `pnpm-lock.yaml`.
- **Verifikasi:** `pnpm install && pnpm build && pnpm test` exit 0 (20 file, 156 tes, tanpa skip; checkC7 jalan); `--dry-run` exit 0, argv memuat `--model claude-opus-5-5 --strict-mcp-config --tools "" --output-format stream-json`, C7 lulus; seri `bench:pendev` exit 0 (dijalankan subagen sebelum patch review); sesudah seri: md5 semua `.pen` lama identik (hanya 12 dokumen baru di `~/.pencil/documents`), `jq .mcpServers ~/.claude.json` identik, md5 `settings.json` identik, `ActiveEnterTimestamp` pen-* identik; `git status | grep -c bench/runs` = 0; `tools/node26/verify.sh` exit 0. Audit matriks: semua baris punya tes yang jalan dan lulus.
- **Follow-up review: true** — 2 temuan medium di-patch (retry newdoc saat problems, fase pasca-result tidak membuang metrik). Risiko yang belum terverifikasi: kedua jalur itu belum dijalankan dalam seri berbayar nyata setelah patch (baseline dibuat sebelum patch; perilaku jalur sukses tidak berubah). Patch per verdict: medium 2, low 6.
- **Residual risk:** total biaya sesi ≈ $6,78 (smoke $0,06 + seri terhenti $2,31 + baseline $4,41; 9 run berbayar + smoke, di atas rencana 6–8 run); 12 dokumen pen baru tertinggal di `~/.pencil/documents` dan kanvas aktif kini dokumen run terakhir; `pen-newdoc.sh` tidak mencetak URI (URI diambil dari get_app_state + bukti file baru); baris effort di md ditulis sebelum patch (teks lama, isinya tetap benar); HITL done_checkpoint (Adam memeriksa md + PNG) masih terbuka.
