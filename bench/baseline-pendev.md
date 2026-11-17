# Baseline waktu pen.dev

Status: **lengkap** (target 3 run sukses per prompt).

## Ringkasan

| Prompt | Sukses / percobaan | Waktu median (dtk) | Rentang waktu (dtk) | Biaya median | Rentang biaya |
|---|---|---|---|---|---|
| A | 3 / 3 | 167.3 | 153.2–172.1 | $0.84 | $0.77–$0.84 |
| B | 3 / 3 | 131.3 | 97.6–179.3 | $0.64 | $0.52–$0.80 |

## Versi dan protokol

- Tanggal: 2026-11-17T23:27:28.982Z
- Hash protokol (sha256 wrapper.txt + prompts.json + protocol.json): `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d`
- Model (pin `--model`): `claude-opus-5-5`; kunci `modelUsage`: `claude-opus-5-5`
- Claude Code: 2.1.325
- pen.dev desktop (X-AppImage-Version): 1.2.23
- pen.dev MCP server (initialize serverInfo): pencil 1.0.0
- Effort: default (tanpa `--effort`; `~/.claude/settings.json` tanpa `effortLevel`; CLAUDE_EFFORT pemanggil dibuang)
- Env proses claude: `ENABLE_TOOL_SEARCH=false`; dibuang dari env pemanggil: `AI_AGENT`, `CLAUDECODE`, `CLAUDE_AGENT_SDK_VERSION`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_EFFORT`, `CLAUDE_PID`

### Argumen claude

```
claude -p '<prompt hasil render>' --model claude-opus-5-5 --strict-mcp-config --tools "" --output-format stream-json --verbose --disable-slash-commands --no-session-persistence --mcp-config bench/mcp/pencil.json --allowedTools mcp__pencil
```

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

## Run

| Run | Prompt | Status | Wall (dtk) | duration_ms | Biaya | Turns | Tool call | Frame | Transkrip | .pen / PNG |
|---|---|---|---|---|---|---|---|---|---|---|
| 20261117T231042Z-A1 | A | success | 172.1 | 172154 | $0.84 | 18 | 17 | 1440×4255 | 928 KB | `bench/runs/pendev/20261117T231042Z-A1/design.pen`<br>`bench/runs/pendev/20261117T231042Z-A1/png/x8OXb.png` |
| 20261117T231042Z-B1 | B | success | 131.3 | 131461 | $0.64 | 16 | 15 | 390×844 | 766 KB | `bench/runs/pendev/20261117T231042Z-B1/design.pen`<br>`bench/runs/pendev/20261117T231042Z-B1/png/E7FqG.png` |
| 20261117T231042Z-A2 | A | success | 167.3 | 167353 | $0.84 | 17 | 16 | 1440×5001 | 844 KB | `bench/runs/pendev/20261117T231042Z-A2/design.pen`<br>`bench/runs/pendev/20261117T231042Z-A2/png/UCa6A.png` |
| 20261117T231042Z-B2 | B | success | 179.3 | 179379 | $0.80 | 18 | 17 | 390×844 | 1128 KB | `bench/runs/pendev/20261117T231042Z-B2/design.pen`<br>`bench/runs/pendev/20261117T231042Z-B2/png/hpMIy.png` |
| 20261117T231042Z-A3 | A | success | 153.2 | 153221 | $0.77 | 13 | 12 | 1440×4767 | 744 KB | `bench/runs/pendev/20261117T231042Z-A3/design.pen`<br>`bench/runs/pendev/20261117T231042Z-A3/png/TDR2A.png` |
| 20261117T231042Z-B3 | B | success | 97.6 | 97679 | $0.52 | 12 | 11 | 390×1024 | 776 KB | `bench/runs/pendev/20261117T231042Z-B3/design.pen`<br>`bench/runs/pendev/20261117T231042Z-B3/png/ZzPnW.png` |

### Diagnostik (bukan waktu gerbang)

| Run | spawn → event pertama (dtk) | tool_use pertama (dtk) | tool_result terakhir (dtk) |
|---|---|---|---|
| 20261117T231042Z-A1 | 0.8 | 1.6 | 161.2 |
| 20261117T231042Z-B1 | 0.9 | 1.4 | 120.1 |
| 20261117T231042Z-A2 | 0.9 | 1.3 | 156.7 |
| 20261117T231042Z-B2 | 0.9 | 1.1 | 167.3 |
| 20261117T231042Z-A3 | 0.9 | 1.5 | 142.7 |
| 20261117T231042Z-B3 | 0.9 | 1.2 | 88.1 |

## Run gagal / tidak dihitung

- tidak ada

## Catatan pengukuran

- Waktu gerbang (AD-13): `wall` = cap waktu monotonic saat baris event `result` diterima − cap waktu event stdout pertama. Setiap baris diberi cap waktu saat tiba; transkrip mentah byte-identik di `stream.jsonl`, cap waktu di `timing.json`.
- Offset `tool_use` pertama → `tool_result` terakhir dan spawn → event pertama hanya diagnostik, bukan waktu gerbang.
- Run gagal (is_error, subtype ≠ success, tanpa result, timeout, exit ≠ 0, 0 frame) tidak masuk median. Run tidak dipilih-pilih (C8): urutan berselang A1 B1 A2 B2 …, maksimal percobaan per prompt dari protocol.json.
- `save`, salinan `.pen` (COPYFILE_EXCL), daftar frame, dan Export PNG dilakukan harness setelah `result`, di luar waktu. pen.dev menahan dokumen di app, sedangkan Lakar menulis file di setiap execute; bias ini membuat baseline pen.dev sedikit lebih cepat, jadi konservatif bagi gerbang 1,5×.
- Export memakai `{scale:1}` (default pen.dev = 2, lihat `ExportOptions.scale` di execute.md dari read_skill). Ukuran frame diambil dari `ctx.bounds` karena `height` frame bisa null (fit content).
- Setiap run memakai dokumen baru (`pen-newdoc.sh`) yang diverifikasi klien MCP harness: URI sama dengan get_app_state, berbeda dari run sebelumnya, tidak ada sebelum newdoc, bukan dokumen golden, 0 node top-level.
- cwd claude = direktori tmp kosong baru di luar repo (dihapus setelah run). Env proses claude: variabel berawalan CLAUDE*/AI_AGENT* dari sesi pemanggil dibuang (mis. CLAUDE_EFFORT), lalu `ENABLE_TOOL_SEARCH=false` ditambahkan agar tool MCP dimuat langsung walau `--tools ""` (simetris untuk semua alat).
- Event init divalidasi per run: hanya server MCP `pencil` (connected), semua tool berawalan `mcp__pencil__`, `mcp__pencil__execute` ada, cwd di luar repo. Pelanggaran = `invalid`, seri berhenti.
