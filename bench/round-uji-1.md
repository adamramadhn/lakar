# Putaran uji-1: Lakar vs pen.dev

Status: **lengkap**. Tanggal: 2026-11-18T04:36:00.307Z.

Keputusan di laporan ini **sementara, menunggu konfirmasi Adam**.

## Ringkasan

| Prompt | Waktu Lakar (dtk) | Waktu pen.dev (dtk) | Lakar/pen.dev | Lakar/baseline | Biaya Lakar | Biaya pen.dev | Gerbang Lakar | Total Lakar | Total pen.dev | Keputusan |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 130.8 | 167.7 | 0.78 | 0.78 | $0.95 | $0.88 | lolos | 10 | 6 | Lebih baik (sementara, menunggu konfirmasi Adam) |
| B | 93.9 | 155.4 | 0.60 | 0.71 | $0.50 | $0.72 | lolos | 8 | 8 | Setara (sementara, menunggu konfirmasi Adam) |

## Prompt A

### Waktu dan biaya

| Alat | Status | Wall (dtk) | duration_ms | Biaya | Turns | Tool call | Board/frame | Run |
|---|---|---|---|---|---|---|---|---|
| Lakar | success | 130.8 | 130915 | $0.95 | 11 | 10 | 1440×4116 | `bench/runs/rounds/uji-1/A-lakar` |
| pen.dev | success | 167.7 | 167776 | $0.88 | 16 | 15 | 1440×5045 | `bench/runs/rounds/uji-1/A-pendev` |

- Rasio Lakar/pen.dev (putaran ini): 0.78
- Rasio Lakar/median baseline pen.dev (167.3 dtk): 0.78

### Gerbang G0 Lakar (otomatis)

- layout_check harness: gate = 0, error 0, warning 0 (rev 4)
- Ukuran board: Kasku / Beranda · landing · Jernih 1440×4116 → sesuai
- Waktu ≤ 1,5 × median baseline: rasio 0.78
- Hasil: **lolos**
- R3/R7 tidak dihitung di G0 (keputusan epic): aturan LC-03/06/07/11/13/14/17/18/21 belum ada di `G0_RULES`.
- Dokumen Lakar: slug `kasku-landing` (dibuka agen: kasku-landing), salinan `bench/runs/rounds/uji-1/A-lakar/doc/kasku-landing.lakar.json`

### Emoji

| Alat | (a) di input tool_use agen | glyph LC-01b di input (terpisah) | (b) LC-01a / LC-01b layout_check | (c) juri (median, rentang) |
|---|---|---|---|---|
| Lakar | 0 | 0 | 0 / 0 | 0 (rentang 0) |
| pen.dev | 1 (👋) | 0 | tidak dilint (EULA) | 1 (rentang 0) |

### Reconnect (dilaporkan terpisah, tidak dikurangkan dari waktu)

| Alat | Jumlah | ms tool_use→tool_result terdampak | Kejadian |
|---|---|---|---|
| Lakar | 0 | 0 | – |
| pen.dev | 0 | 0 | – |

### Skor juri (median 3 ulangan)

Ulangan valid: 3 dari 3. Detail dan bukti: `bench/score-A.md`.

| Kriteria | Lakar | pen.dev |
|---|---|---|
| R1 | 2 (rentang 0) | 1 (rentang 1) |
| R2 | 2 (rentang 0) | 1 (rentang 1) |
| R4 | 1 (rentang 0) | 1 (rentang 0) |
| R5 | 2 (rentang 0) | 1 (rentang 0) |
| R6 | 2 (rentang 0) | 1 (rentang 0) |
| R8 | 1 (rentang 1) | 1 (rentang 0) |
| **Total (jumlah median)** | **10** | **6** |
| Slop (juri) | 0 (rentang 0) | 1 (rentang 0) |

### Keputusan: **Lebih baik** (sementara, menunggu konfirmasi Adam)

Alasan: lolos gerbang, total 10 ≥ 6 + 2.

Strip: `bench/runs/rounds/uji-1/A-lakar.png` (1440×4116, 1 board), `bench/runs/rounds/uji-1/A-pendev.png` (1440×5045, 1 board)

## Prompt B

### Waktu dan biaya

| Alat | Status | Wall (dtk) | duration_ms | Biaya | Turns | Tool call | Board/frame | Run |
|---|---|---|---|---|---|---|---|---|
| Lakar | success | 93.9 | 93943 | $0.50 | 10 | 9 | 390×844 | `bench/runs/rounds/uji-1/B-lakar` |
| pen.dev | success | 155.4 | 155486 | $0.72 | 17 | 16 | 390×844 | `bench/runs/rounds/uji-1/B-pendev` |

- Rasio Lakar/pen.dev (putaran ini): 0.60
- Rasio Lakar/median baseline pen.dev (131.3 dtk): 0.71

### Gerbang G0 Lakar (otomatis)

- layout_check harness: gate = 0, error 0, warning 0 (rev 3)
- Ukuran board: Gerak / Beranda · mobile · Malam 390×844 → sesuai
- Waktu ≤ 1,5 × median baseline: rasio 0.71
- Hasil: **lolos**
- R3/R7 tidak dihitung di G0 (keputusan epic): aturan LC-03/06/07/11/13/14/17/18/21 belum ada di `G0_RULES`.
- Dokumen Lakar: slug `gerak-beranda-mobile` (dibuka agen: gerak-beranda-mobile), salinan `bench/runs/rounds/uji-1/B-lakar/doc/gerak-beranda-mobile.lakar.json`

### Emoji

| Alat | (a) di input tool_use agen | glyph LC-01b di input (terpisah) | (b) LC-01a / LC-01b layout_check | (c) juri (median, rentang) |
|---|---|---|---|---|
| Lakar | 0 | 0 | 0 / 0 | 0 (rentang 0) |
| pen.dev | 1 (👋) | 0 | tidak dilint (EULA) | 0 (rentang 0) |

### Reconnect (dilaporkan terpisah, tidak dikurangkan dari waktu)

| Alat | Jumlah | ms tool_use→tool_result terdampak | Kejadian |
|---|---|---|---|
| Lakar | 0 | 0 | – |
| pen.dev | 0 | 0 | – |

### Skor juri (median 3 ulangan)

Ulangan valid: 3 dari 3. Detail dan bukti: `bench/score-B.md`.

| Kriteria | Lakar | pen.dev |
|---|---|---|
| R1 | 1 (rentang 0) | 1 (rentang 0) |
| R2 | 1 (rentang 0) | 1 (rentang 0) |
| R4 | 1 (rentang 0) | 1 (rentang 1) |
| R5 | 2 (rentang 0) | 1 (rentang 0) |
| R6 | 2 (rentang 1) | 2 (rentang 0) |
| R8 | 1 (rentang 0) | 2 (rentang 0) |
| **Total (jumlah median)** | **8** | **8** |
| Slop (juri) | 0 (rentang 0) | 0 (rentang 0) |

### Keputusan: **Setara** (sementara, menunggu konfirmasi Adam)

Alasan: lolos gerbang, total 8 ≥ 8 − 1, tanpa R Lakar 0 vs pen.dev 2.

Strip: `bench/runs/rounds/uji-1/B-lakar.png` (390×844, 1 board), `bench/runs/rounds/uji-1/B-pendev.png` (390×844, 1 board)

Biaya juri total: $1.51.

## Versi beku

- git HEAD: `d7cf5794575f02b4ab198b1ed0e8a44f4ee2b587`; `git status --porcelain -- packages tools .mcp.json`: kosong
- protocolHash: `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d` (baseline: `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d`, sama)
- Model agen dan juri: `claude-opus-5-5`; Claude Code: 2.1.325 (Claude Code)
- lakard: version 0.1.0, schemaVersion 1, pid 380920, startedAt 2026-11-18T03:41:02.852Z, Chromium 159.0.8154.6
- Ikon (/status): lucide 1.74.0, simple-icons 16.38.0
- skill `api.md` sha256 `57f0050cae3435f0879f1b70789be3edfe099598a0e9ed8d934fae5828f35bbe`
- skill `core.md` sha256 `41afcc82d16bc2775828025f4f3695cabe6da18ff9251542131929e2ac3b38c4`
- skill `icons.md` sha256 `967827ad79ef4be54169daf303506fb97cd73d9e848c5d6d0943dbda7af5a4c2`
- skill `landing.md` sha256 `d2aacbbd8ca54d2dd84799d912e4215e8f8c4c778ba69377bc627f31090268c8`
- skill `mobile.md` sha256 `3d1a316ecde945c4103a00db746fdc019d2b8f90e248cd13b2e7285bc0923e49`
- `G0_RULES`: `{"LC-01a":{"level":"error","gate":true,"title":"emoji di teks"},"LC-01b":{"level":"error","gate":true,"title":"glyph Unicode sebagai ikon"},"LC-02a":{"level":"error","gate":true,"title":"node terpotong clip"},"LC-05":{"level":"error","gate":true,"title":"teks lebih kecil dari 12px"},"LC-12":{"level":"warning","gate":false,"title":"ukuran atau posisi board"},"LC-20":{"level":"error","gate":true,"title":"konten tertutup bar bawah"}}`
- sha256 `packages/check/dist`: `2b210e3a7d0c7fab93fce90753fd89b21227f4eee79445b7ecd8104ea9e33eca`
- pen.dev desktop: 1.2.23; MCP server: pencil 1.0.0
- Juri: model `claude-opus-5-5`; argv `claude -p --input-format stream-json --output-format stream-json --verbose --model claude-opus-5-5 --tools "" --strict-mcp-config --mcp-config bench/runs/rounds/uji-1/judge/mcp-empty.json --disable-slash-commands --no-session-persistence`

## Protokol

### Pembungkus (bench/protocol/wrapper.txt, kata per kata)

```
Mode benchmark tanpa interaksi: tidak ada pengguna yang bisa menjawab pertanyaan atau memberi konfirmasi. Jangan bertanya; ambil keputusan sendiri dan kerjakan tugas sampai tuntas.
Kerjakan di dokumen baru yang kosong dengan tool desain yang tersedia.
Setelah tugas tuntas, akhiri jawabanmu dengan satu kata: selesai.

Tugas:
{{PROMPT}}
```

### Prompt A

```
Desain landing page desktop (lebar 1440px) untuk aplikasi SaaS pembukuan UMKM bernama "Kasku". Bagian: navbar, hero (headline, subjudul, 2 CTA, mockup dashboard), 3 kartu fitur, testimoni, pricing 3 tier (tengah ditonjolkan), footer. Gaya modern, bersih, profesional, aksen hijau. Bahasa Indonesia. Kualitas setara desainer produk senior: hierarki tipografi jelas, spacing konsisten (grid 8px), kontras baik, auto/flex layout.
```

### Prompt B

```
Desain layar beranda aplikasi mobile (390x844) untuk aplikasi kebugaran "Gerak". Isi: sapaan + avatar, ringkasan hari ini (langkah, kalori, menit aktif) dengan ring progress, jadwal latihan hari ini, 2 kartu rekomendasi program, bottom tab bar 4 ikon. Mode gelap, aksen oranye. Bahasa Indonesia. Kualitas setara desainer produk senior: hierarki tipografi jelas, spacing konsisten (grid 8px), kontras baik, auto/flex layout.
```

### Argumen claude

Lakar:

```
claude -p '<prompt hasil render>' --model claude-opus-5-5 --strict-mcp-config --tools "" --output-format stream-json --verbose --disable-slash-commands --no-session-persistence --mcp-config .mcp.json --allowedTools mcp__lakar
```

pen.dev:

```
claude -p '<prompt hasil render>' --model claude-opus-5-5 --strict-mcp-config --tools "" --output-format stream-json --verbose --disable-slash-commands --no-session-persistence --mcp-config bench/mcp/pencil.json --allowedTools mcp__pencil
```

Juri:

```
claude -p --input-format stream-json --output-format stream-json --verbose --model claude-opus-5-5 --tools "" --strict-mcp-config --mcp-config bench/runs/rounds/uji-1/judge/mcp-empty.json --disable-slash-commands --no-session-persistence
```

Env proses claude (agen dan juri): `ENABLE_TOOL_SEARCH=false`; dibuang dari env pemanggil: `AI_AGENT`, `CLAUDECODE`, `CLAUDE_AGENT_SDK_VERSION`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_EFFORT`, `CLAUDE_PID`

### Konvensi putaran

- ID putaran dicek dengan `^(uji-[1-9]\d*|[1-9]\d*)$`: `uji-<k>` = putaran uji, angka polos = putaran resmi (story 16).
- Satu putaran = A dan B, urutan run A-pen.dev, A-Lakar, B-pen.dev, B-Lakar, lalu juri 3× per prompt. Satu run per alat per prompt; run tidak diulang untuk memilih hasil (C8).
- Putaran yang md-nya sudah ada ditolak kecuali `--resume`. `--resume` memakai ulang run `success`/`failed` dan ulangan juri yang sudah selesai; run `aborted`/`invalid` (gagal-setup) dipindah ke `<key>.prev-<stamp>` dan dijalankan lagi, dan dicatat sebagai percobaan sebelumnya.
- Artefak di `bench/runs/rounds/<round>/` (gitignored): dir run per `<prompt>-<alat>`, strip `<prompt>-<alat>.png`, dan `judge/<prompt>/rep-<k>/` (pemetaan X/Y, transkrip juri).

### Definisi waktu dan reconnect

- Waktu (AD-13): `wall` = cap waktu monotonic saat baris event `result` diterima − cap waktu event stdout pertama, sama untuk kedua alat. Offset tool_use/tool_result dan spawn → event pertama hanya diagnostik.
- Gerbang waktu memakai median baseline pen.dev (`bench/baseline-pendev.json`): Lakar ≤ 1,5 × median baseline. Rasio Lakar/pen.dev putaran ini dilaporkan saja.
- Operasi harness setelah `result` di luar waktu: pen.dev `save` + salin `.pen` + Export `{scale:1}`; Lakar sesi HTTP sendiri → `/docs/open` → `/boards` → `/layout-check` → `/export {scale:1}` per board. Agen yang memanggil save/export sendiri ikut terhitung (alur normal alat).
- Reconnect Lakar: lakard restart (pid/startedAt/`NRestarts` systemd user berubah), halaman Chromium dibuat ulang (`pool.recreated` naik), atau tool_result `is_error` berisi `RENDER_FAILED`, `VERSION_MISMATCH`, "lakard tidak menjawab", atau pola putus transport. Reconnect pen.dev: `NRestarts`/`ActiveEnterTimestamp` pen-desktop berubah, atau tool_result `is_error` berpola putus transport (not connected, disconnect, connection closed, ECONNREFUSED/ECONNRESET/EPIPE, socket hang up, MCP error -32000). Error snippet biasa bukan reconnect. Dilaporkan terpisah, tidak dikurangkan dari waktu.
- Emoji: (a) di nilai string input tool_use agen (Emoji_Presentation, atau pictographic + VS16; © ® ™ dikecualikan; glyph LC-01b dihitung terpisah), (b) temuan LC-01a/LC-01b layout_check (Lakar saja; pen.dev tidak dilint, EULA), (c) emoji terlihat menurut juri (median).
- Normalisasi PNG: board/frame top-level (urutan dokumen) dikomposit di atas #808080, ditumpuk vertikal berjarak 48 px #808080, di-encode ulang RGB hanya IHDR/IDAT/IEND. Juri menerima tile lebar penuh (tinggi ≤ 1000 untuk lebar > 600, ≤ 1568 untuk lebih sempit) + satu overview sisi panjang ≤ 1568.
- Juri: `claude -p --input-format stream-json` tanpa tool/MCP (init wajib `tools=[]`, `mcp_servers=[]`), satu pesan berisi teks juri + gambar berlabel netral; label X/Y diacak per ulangan dengan `crypto` dan kedua penugasan wajib muncul. Jawaban JSON divalidasi ketat; tidak valid → 1 percobaan ulang, lalu `failed`.

## Penjaga .pen lama

- 29 file `.pen` di-md5 sebelum putaran (`~/.pencil/documents`, `/root/lakar/design`, `/root/comprice`, `/opt/pen`).
- Berubah: tidak ada; hilang: tidak ada; baru: 2.
- `systemctl --user is-active lakard` sesudah putaran: active
