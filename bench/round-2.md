# Putaran 2: Lakar vs pen.dev

Status: **lengkap**. Tanggal: 2026-11-18T18:07:08.964Z.

Keputusan di laporan ini **sementara, menunggu konfirmasi Adam**.

## Ringkasan

| Prompt | Waktu Lakar (dtk) | Waktu pen.dev (dtk) | Lakar/pen.dev | Lakar/baseline | Biaya Lakar | Biaya pen.dev | Gerbang Lakar | Total Lakar (maks 16) | Total pen.dev | Daya tarik Lakar | Daya tarik pen.dev | Keputusan |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 180.3 | 156.4 | 1.15 | 1.08 | $1.29 | $0.84 | lolos | 13 | 13 | 4 | 2 | Setara (sementara, menunggu konfirmasi Adam) |
| B | 130.7 | 91.2 | 1.43 | 1.00 | $0.61 | $0.52 | lolos | 13 | 10 | 4 | 3 | Lebih baik (sementara, menunggu konfirmasi Adam) |

## Keputusan G0 (sementara, menunggu konfirmasi Adam)

Keputusan G0: **lolos** (sementara, menunggu konfirmasi Adam). Alasan: A Setara, B Lebih baik.

| Prompt | Keputusan | Alasan | Median waktu baseline pen.dev (dtk) | Median biaya baseline pen.dev |
|---|---|---|---|---|
| A | Setara | lolos gerbang, total 13 vs 13, daya tarik 4 vs 2, tanpa alasan Kalah | 167.3 | $0.84 |
| B | Lebih baik | lolos gerbang, total 13 ≥ 10 + 3, daya tarik 4 ≥ 3 | 131.3 | $0.64 |

Aturan: putaran dibatalkan → tidak dapat diputuskan; ada prompt Kalah → gagal; A dan B sama-sama Setara/Lebih baik → lolos; selebihnya → tidak dapat diputuskan. Biaya hanya dilaporkan (C8).

- C4: G1 tidak dimulai sebelum G0 lolos dan dikonfirmasi Adam.

### Catatan implementer

Catatan ini bukan keputusan; keputusan ada di tabel di atas dan di "Konfirmasi Adam".

- **Kesan dari strip** (keempat strip dibuka dengan Read):
  - A-Lakar: landing rapi dengan aksen hijau konsisten. Kartu fitur asimetris (1 besar dengan daftar transaksi, 2 kecil), testimoni dengan kotak "2 hari → 10 menit", pricing tengah gelap yang ditonjolkan, CTA penutup gelap, dan footer. Tanpa emoji. Mockup dashboard di hero terpotong rata di batas bawah hero: baris "Pasar Induk Caringin" dan grafik arus kas terpotong, lalu langsung latar putih. Ini sesuai dengan R5 Lakar 1. Tidak ada foto testimoni: agen menjalankan `photo_search`, tetapi memakai avatar inisial.
  - A-pen.dev: setingkat dengan A-Lakar. Mockup memakai chrome browser dan utuh, 3 kartu fitur seragam, blok testimoni gelap dengan statistik bulat (12.000+, 4,9/5, Rp2,1T), dan pricing 3 tier. Juri: total 13 vs 13, daya tarik 2 vs 4, slop 2 vs 0. Keputusan Setara wajar. Input tool_use agen pen.dev A memuat 1 emoji 👋 (teks "Selamat pagi, Bu Sari 👋" di mockup dashboard; kolom (a)), yang tidak terbaca di strip pada skala ini; juri (c) median 0.
  - B-Lakar: dua board 390×844, yaitu keadaan awal dan "(akhir)" sesudah gulir. Ring konsentris oranye/kuning/teal, 4 jadwal dengan butir aktif bertepi oranye, 2 kartu program berfoto Wikimedia, avatar berfoto, dan tab bar mengambang. Kekurangan kecil: di board "(akhir)", tepi bawah kartu ringkasan masih terlihat sebagai garis tipis di bawah header (±y 1010 di strip), dan lencana "Berikutnya" mepet ke judul "Kekuatan tubuh atas". Rentang R5 Lakar 2 (**periksa Adam**) dan emoji (c) Lakar rentang 2 (agen 0, lint 0) layak dicek Adam.
  - B-pen.dev: visual kaya (foto, jadwal oranye penuh, ring tebal), tetapi frame 390×1044 melebihi 844 (R1 = 0, pelanggaran brief) dan memakai 👋 di sapaan. Total 13 vs 10 → Lebih baik untuk Lakar. Selisihnya sebagian besar dari kepatuhan ukuran (R1) dan R4/R5, sama seperti pola putaran 1.
- **Foto dan fallback** (`stream.jsonl` Lakar):
  - A: 2 `photo_search`. Yang pertama `"portrait smiling woman shop owner"` (orientation square) → `NOT_FOUND` (wikimedia, openverse kosong). Yang kedua `"portrait woman"` → wikimedia, `fallbackReason: no-key`. `photo()` di kode: 0.
  - B: 2 `photo_search` (`"fitness workout gym"`, `"portrait woman unsplash"`), keduanya wikimedia, `no-key`. `photo('wikimedia:…')` di kode: 3 (avatar + 2 kartu program) di execute pertama.
  - Tidak ada 429/`wikimedia-*`/fallback Openverse saat run. Probe sebelum run: wikimedia, 3 hasil, 2257 ms, `no-key`.
- **Execute per run Lakar dan batas skill:**
  - A: 5 execute, sedangkan batas landing 4 (termasuk perbaikan). Execute ke-3 gagal `SCHEMA_INVALID` (kunci `padding` pada node teks) lalu diperbaiki lewat `editId`, dan execute ke-5 hanya perbaikan judul + tinggi board (156 karakter) meski pengingat "melewati batas skill" sudah muncul.
  - B: 5 execute, sedangkan batas mobile 3. Execute ke-1 membangun kedua board. Execute ke-2 dan ke-3 merapatkan konten karena 5 temuan LC-20 gerbang di rev 1 (kartu jadwal terpotong tab bar). Execute ke-4 dan ke-5 kosmetik (ring, lencana, lepas WIP).
  - Pengingat execute tampil sesuai desain, tetapi tidak menghentikan agen.
  - Keluaran execute ke-1 B sepanjang 53.007 karakter melebihi batas token tool result Claude Code, sehingga dialihkan ke file yang tidak bisa dibaca agen (tanpa tool). Agen pulih lewat `layout_check`/`list_boards`. Ini layak dicatat sebagai risiko ukuran keluaran execute.
- **LC-20 pola pra-ada** (deferred 1.20: scrim + bottom sheet, sticky CTA landing): tidak ditemukan. Gerbang akhir A dan B gate 0. Temuan LC-20 di rev 1 B adalah kartu daftar yang terpotong tab bar (sub-cek 2), yaitu cacat nyata yang lalu diperbaiki agen, bukan pola positif palsu. Tidak terlihat execute yang diboroskan untuk menghindari positif palsu.
- **Rasio drift pen.dev** (pen.dev putaran ini/median baseline): A 0,93, B 0,69. pen.dev B jauh lebih cepat dari baseline. Rasio Lakar/pen.dev putaran ini 1,15 (A) dan 1,43 (B), sedangkan gerbang (Lakar/median baseline) 1,08 dan 1,00, keduanya ≤ 1,5.
- **Biaya:** run $3,26 (A pen.dev $0,84, A Lakar $1,29, B pen.dev $0,52, B Lakar $0,61) + juri $1,61 ≈ **$4,87** (batas kerja $8).
- **pen-vnc:** `ActiveEnterTimestamp` pen-vnc ikut berubah (18:16:49Z) karena unit itu `BindsTo=pen-desktop.service`, sehingga ikut di-restart bersama pen-desktop (18:16:46Z, baris restart di bawah). Harness tidak me-restart pen-vnc secara langsung. Unit pen-* lain identik.

## Prompt A

### Waktu dan biaya

| Alat | Status | Wall (dtk) | duration_ms | Biaya | Turns | Tool call | Board/frame | Run |
|---|---|---|---|---|---|---|---|---|
| Lakar | success | 180.3 | 180355 | $1.29 | 13 | 12 | 1440×4620 | `bench/runs/rounds/2/A-lakar` |
| pen.dev | success | 156.4 | 156469 | $0.84 | 15 | 14 | 1440×4507 | `bench/runs/rounds/2/A-pendev` |

- Rasio Lakar/pen.dev (putaran ini): 1.15
- Rasio Lakar/median baseline pen.dev (167.3 dtk): 1.08
- Rasio pen.dev putaran ini/median baseline pen.dev: 0.93 (indikator drift, bukan gerbang)

### Gerbang G0 Lakar (otomatis)

- layout_check harness: gate = 0, error 0, warning 0 (rev 4)
- Ukuran board: Kasku / Beranda · landing · Jernih 1440×4620 → sesuai
- Waktu ≤ 1,5 × median baseline: rasio 1.08
- Hasil: **lolos**
- R3/R7 tidak dihitung di G0 (keputusan epic): aturan LC-03/06/07/11/13/14/17/18/21 belum ada di `G0_RULES`.
- Dokumen Lakar: slug `kasku-landing` (dibuka agen: kasku-landing), salinan `bench/runs/rounds/2/A-lakar/doc/kasku-landing.lakar.json`

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

Ulangan valid: 3 dari 3. Detail dan bukti: `bench/round-2/score-A.md`.

| Kriteria | Lakar | pen.dev |
|---|---|---|
| R1 | 2 (rentang 0) | 2 (rentang 0) |
| R2 | 2 (rentang 0) | 2 (rentang 0) |
| R4 | 1 (rentang 1) | 2 (rentang 1) |
| R5 | 1 (rentang 1) | 2 (rentang 0) |
| R6 | 2 (rentang 0) | 2 (rentang 0) |
| R8 | 1 (rentang 0) | 1 (rentang 0) |
| R9 | 2 (rentang 0) | 1 (rentang 0) |
| R10 | 2 (rentang 0) | 1 (rentang 0) |
| **Total (jumlah median, maks 16)** | **13** | **13** |
| **Daya tarik D = R9 + R10 (maks 4)** | **4** | **2** |
| Slop (juri) | 0 (rentang 0) | 2 (rentang 1) |

Brief mengikat pen.dev (ukuran frame): sesuai.

### Keputusan: **Setara** (sementara, menunggu konfirmasi Adam)

Alasan: lolos gerbang, total 13 vs 13, daya tarik 4 vs 2, tanpa alasan Kalah.

Strip: `bench/runs/rounds/2/A-lakar.png` (1440×4620, 1 board), `bench/runs/rounds/2/A-pendev.png` (1440×4507, 1 board)

## Prompt B

### Waktu dan biaya

| Alat | Status | Wall (dtk) | duration_ms | Biaya | Turns | Tool call | Board/frame | Run |
|---|---|---|---|---|---|---|---|---|
| Lakar | success | 130.7 | 130756 | $0.61 | 18 | 17 | 390×844, 390×844 | `bench/runs/rounds/2/B-lakar` |
| pen.dev | success | 91.2 | 91253 | $0.52 | 13 | 12 | 390×1044 | `bench/runs/rounds/2/B-pendev` |

- Rasio Lakar/pen.dev (putaran ini): 1.43
- Rasio Lakar/median baseline pen.dev (131.3 dtk): 1.00
- Rasio pen.dev putaran ini/median baseline pen.dev: 0.69 (indikator drift, bukan gerbang)

### Gerbang G0 Lakar (otomatis)

- layout_check harness: gate = 0, error 0, warning 0 (rev 5)
- Ukuran board: Gerak / Beranda · mobile · Malam 390×844, Gerak / Beranda (akhir) · mobile · Malam 390×844 → sesuai
- Waktu ≤ 1,5 × median baseline: rasio 1.00
- Hasil: **lolos**
- R3/R7 tidak dihitung di G0 (keputusan epic): aturan LC-03/06/07/11/13/14/17/18/21 belum ada di `G0_RULES`.
- Dokumen Lakar: slug `gerak-beranda` (dibuka agen: gerak-beranda), salinan `bench/runs/rounds/2/B-lakar/doc/gerak-beranda.lakar.json`

### Emoji

| Alat | (a) di input tool_use agen | glyph LC-01b di input (terpisah) | (b) LC-01a / LC-01b layout_check | (c) juri (median, rentang) |
|---|---|---|---|---|
| Lakar | 0 | 0 | 0 / 0 | 0 (rentang 2) **periksa Adam** |
| pen.dev | 1 (👋) | 0 | tidak dilint (EULA) | 1 (rentang 0) |

### Reconnect (dilaporkan terpisah, tidak dikurangkan dari waktu)

| Alat | Jumlah | ms tool_use→tool_result terdampak | Kejadian |
|---|---|---|---|
| Lakar | 0 | 0 | – |
| pen.dev | 0 | 0 | – |

### Skor juri (median 3 ulangan)

Ulangan valid: 3 dari 3. Detail dan bukti: `bench/round-2/score-B.md`.

| Kriteria | Lakar | pen.dev |
|---|---|---|
| R1 | 1 (rentang 0) | 0 (rentang 0) |
| R2 | 1 (rentang 1) | 1 (rentang 0) |
| R4 | 2 (rentang 1) | 1 (rentang 1) |
| R5 | 2 (rentang 2) **periksa Adam** | 1 (rentang 0) |
| R6 | 1 (rentang 1) | 2 (rentang 0) |
| R8 | 2 (rentang 0) | 2 (rentang 0) |
| R9 | 2 (rentang 0) | 2 (rentang 0) |
| R10 | 2 (rentang 0) | 1 (rentang 0) |
| **Total (jumlah median, maks 16)** | **13** | **10** |
| **Daya tarik D = R9 + R10 (maks 4)** | **4** | **3** |
| Slop (juri) | 0 (rentang 1) | 0 (rentang 0) |

Brief mengikat pen.dev (ukuran frame): board rgCT3 390×1044 ≠ 390×844.

### Keputusan: **Lebih baik** (sementara, menunggu konfirmasi Adam)

Alasan: lolos gerbang, total 13 ≥ 10 + 3, daya tarik 4 ≥ 3.

Strip: `bench/runs/rounds/2/B-lakar.png` (390×1736, 2 board), `bench/runs/rounds/2/B-pendev.png` (390×1044, 1 board)

Biaya juri total: $1.61.

## PNG untuk Adam

| Prompt | Alat | Strip | Status commit |
|---|---|---|---|
| A | Lakar | `bench/round-2/A-lakar.png` | tracked, di-commit bersama laporan (salinan `bench/runs/rounds/2/A-lakar.png`) |
| A | pen.dev | `bench/runs/rounds/2/A-pendev.png` | lokal, tidak di-commit (EULA); `.pen` di `bench/runs/rounds/2/A-pendev/` |
| B | Lakar | `bench/round-2/B-lakar.png` | tracked, di-commit bersama laporan (salinan `bench/runs/rounds/2/B-lakar.png`) |
| B | pen.dev | `bench/runs/rounds/2/B-pendev.png` | lokal, tidak di-commit (EULA); `.pen` di `bench/runs/rounds/2/B-pendev/` |

## Konfirmasi Adam

Status: **menunggu konfirmasi Adam**. Bagian ini hanya diisi Adam; agen tidak pernah mengisinya.

| Prompt | Keputusan sementara | Kriteria rentang > 1 | Keputusan Adam | Koreksi skor |
|---|---|---|---|---|
| A | Setara | tidak ada | menunggu konfirmasi Adam | menunggu konfirmasi Adam |
| B | Lebih baik | R5 Lakar | menunggu konfirmasi Adam | menunggu konfirmasi Adam |

Keputusan G0 final: menunggu konfirmasi Adam (sementara: lolos).

## Versi beku

- git HEAD: `1b8017131b4b5b74cb52610d511d191e5cb6e148`; `git status --porcelain -- packages tools .mcp.json`: kosong
- `git status --porcelain -- packages tools scripts bench/src bench/protocol bench/mcp bench/package.json package.json pnpm-lock.yaml .mcp.json`: kosong
- `git status --porcelain` penuh: 

```
?? _bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-putaran-resmi-2-dijalankan-dan-diputuskan-plan.md
```

- protocolHash: `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d` (baseline: `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d`, sama)
- Model agen dan juri: `claude-opus-5-5`; Claude Code: 2.1.325 (Claude Code)
- Baseline pen.dev (`bench/baseline-pendev.json`): model `claude-opus-5-5`, Claude Code 2.1.325, pen.dev desktop 1.2.23
- lakard: version 0.1.0, schemaVersion 2, pid 1693465, startedAt 2026-11-18T18:07:05.753Z, Chromium 159.0.8154.6, Node v26.13.1
- playwright-core: 1.65.1
- Font (/status): Inter, Plus Jakarta Sans, JetBrains Mono, Manrope, IBM Plex Mono, Bricolage Grotesque, DM Sans, DM Mono; missing: []; paket: @fontsource/bricolage-grotesque 5.3.0, @fontsource/dm-mono 5.3.0, @fontsource/dm-sans 5.3.0, @fontsource/ibm-plex-mono 5.3.0, @fontsource/inter 5.3.0, @fontsource/jetbrains-mono 5.3.0, @fontsource/manrope 5.3.0, @fontsource/plus-jakarta-sans 5.3.0
- Foto: penyedia wikimedia, key absent, probe `mountain lake landscape` → wikimedia, 3 hasil, 2257 ms, fallbackReason no-key
- Ikon (/status): lucide 1.74.0, simple-icons 16.38.0
- skill `api.md` sha256 `8dd023074dbc6688110c69e4e0202e14b3f22dd25a1a6805687840ca16117593`
- skill `core.md` sha256 `ef90b5bd1e8c58010444b64dabf90bf22aa247eb6aa10a0eb9914310c7d090d2`
- skill `icons.md` sha256 `967827ad79ef4be54169daf303506fb97cd73d9e848c5d6d0943dbda7af5a4c2`
- skill `landing.md` sha256 `81c67338bf28baeb1e66e8ba631304605b1d790f899b5151ef485e37322eb7ec`
- skill `mobile.md` sha256 `c3dc63658890f6137c6a90e8ce2a0d13009aaa37020acd1b7bca7428d17dbbbe`
- `G0_RULES`: `{"LC-01a":{"level":"error","gate":true,"title":"emoji di teks"},"LC-01b":{"level":"error","gate":true,"title":"glyph Unicode sebagai ikon"},"LC-02a":{"level":"error","gate":true,"title":"node terpotong clip"},"LC-05":{"level":"error","gate":true,"title":"teks lebih kecil dari 12px"},"LC-12":{"level":"warning","gate":false,"title":"ukuran atau posisi board"},"LC-20":{"level":"error","gate":true,"title":"konten tertutup bar bawah"}}`
- sha256 `packages/check/dist`: `d6e141d8aff01d9668df887da4d317e0dd0b4ae9951a927a5fd241b91ac266e2`
- sha256 `packages/core/dist`: `81e7a1b9f116cc04cd5a8784ae53fa610dba37cb7c601249ff0862e3389ce390`
- sha256 `packages/daemon/dist`: `382d74606475cc78990a5892d835df5ad76f3e04dbfa93d0d6ab10a32cc2a3a0`
- sha256 `packages/exec/dist`: `f4bcd4b411bc8810c9194e423432c93e7f2cd7d62f365338ba6e15ed6d79224e`
- sha256 `packages/icons/dist`: `d04386eeeb4daf282c0b0787ec1a8bc07abd927bccabbb4f92f03312686cc303`
- sha256 `packages/mcp/dist`: `9906b7f8ef53ef3d8ed3c236189c616af56653f76c5be2085cd0b314f9f20cdb`
- sha256 `packages/ports/dist`: `bee2b68950ff0c819d5714c8d5149d5107d76df5f53233e18da643f025d66882`
- sha256 `packages/render/dist`: `a12b8d49651fbd374ad0b15b8b273147ea2327a3db3eec31f27274f33cec13ad`
- sha256 `packages/schema/dist`: `dab15a2563993f103e7969f140e0ec07bcbecec1c400cb33bcb65543564e8cbb`
- sha256 `packages/skills/dist`: `4bac99f55ffb6c64d8640f856146563424d172e2fac427c14e7a2649f77b8c15`
- pen.dev desktop: 1.2.23; MCP server: pencil 1.0.0
- Juri: model `claude-opus-5-5`; argv `claude -p --input-format stream-json --output-format stream-json --verbose --model claude-opus-5-5 --tools "" --strict-mcp-config --mcp-config bench/runs/rounds/2/judge/mcp-empty.json --disable-slash-commands --no-session-persistence`
- Versi rubrik: 2.1
- sha256 teks juri A: `f6d68640c1d174c57b4604087d7bd495cceb538236aa22a074f8033466d6faad`
- sha256 teks juri B: `7c1727857d1061128aa17673ce7a751093860f2009fe3867c276708b6ba2545e`

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
claude -p --input-format stream-json --output-format stream-json --verbose --model claude-opus-5-5 --tools "" --strict-mcp-config --mcp-config bench/runs/rounds/2/judge/mcp-empty.json --disable-slash-commands --no-session-persistence
```

Env proses claude (agen dan juri): `ENABLE_TOOL_SEARCH=false`; dibuang dari env pemanggil: `AI_AGENT`, `CLAUDECODE`, `CLAUDE_AGENT_SDK_VERSION`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_EFFORT`, `CLAUDE_PID`

### Konvensi putaran

- ID putaran dicek dengan `^(uji-[1-9]\d*|[1-9]\d*)$`: `uji-<k>` = putaran uji, angka polos = putaran resmi (story 16).
- Satu putaran = A dan B, urutan run A-pen.dev, A-Lakar, B-pen.dev, B-Lakar, lalu juri 3× per prompt. Satu run per alat per prompt; run tidak diulang untuk memilih hasil (C8).
- Putaran yang md-nya sudah ada ditolak kecuali `--resume`. `--resume` memakai ulang run `success`/`failed` dan ulangan juri yang sudah selesai; run `aborted`/`invalid` (gagal-setup) dipindah ke `<key>.prev-<stamp>` dan dijalankan lagi, dan dicatat sebagai percobaan sebelumnya.
- Sebelum run, dokumen Lakar yang dibuat/dibuka agen di putaran bench lain (`run.json` → `lakar.slug`/`lakar.opened`; run terhenti tanpa `run.json` lewat `docs-before.json` + `lakar-docs.jsonl`/`stream.jsonl`; slug di `docs-before.json` run itu tidak dihitung) dipindah dari dataDir lakard ke `bench/runs/lakar-archive/<round>-<stamp>/`, lalu lakard di-restart (salinan dokumen di memori), agar slug pilihan agen tidak bentrok (`dokumen lama`). Dokumen non-bench tidak disentuh; pembungkus dan prompt tidak berubah.
- Versi beku dicatat sekali di awal putaran (`frozen.json`); `--resume` memakainya dan melaporkan perbedaan.
- Artefak di `bench/runs/rounds/<round>/` (gitignored): dir run per `<prompt>-<alat>`, strip `<prompt>-<alat>.png`, dan `judge/<prompt>/rep-<k>/` (pemetaan X/Y, transkrip juri).
- Putaran resmi (ID angka) dibekukan ketat sebelum run: `git status --porcelain` kode produk + harness kosong; protocolHash, model, Claude Code, dan pen.dev desktop = `bench/baseline-pendev.json`; lakard selalu di-restart dan `startedAt` harus lebih baru dari file `packages/*/dist` terbaru; font lengkap dan pool siap; sha256 teks juri = `bench/rubric/rubric.json`; `schemaVersion` lakard = bench; penyedia foto `wikimedia`. Sesudah restart lakard, satu probe `POST /photos/search` (kueri netral, tanpa retry otomatis) wajib dijawab Wikimedia dengan ≥ 1 hasil; gagal → abort sebelum `frozen.json` dan run. Strip Lakar disalin ke `bench/round-<n>/` (tracked); strip dan `.pen` pen.dev tetap lokal di `bench/runs/` (EULA). Putaran resmi ≥ 2 menulis skor ke `bench/round-<n>/score-<prompt>.md|json`; putaran 1 dan uji ke `bench/score-<prompt>.md|json`.

### Definisi waktu dan reconnect

- Waktu (AD-13): `wall` = cap waktu monotonic saat baris event `result` diterima − cap waktu event stdout pertama, sama untuk kedua alat. Offset tool_use/tool_result dan spawn → event pertama hanya diagnostik.
- Gerbang waktu memakai median baseline pen.dev (`bench/baseline-pendev.json`): Lakar ≤ 1,5 × median baseline. Rasio Lakar/pen.dev putaran ini dilaporkan saja.
- Operasi harness setelah `result` di luar waktu: pen.dev `save` + salin `.pen` + Export `{scale:1}`; Lakar sesi HTTP sendiri → `/docs/open` → `/boards` → `/layout-check` → `/export {scale:1}` per board. Agen yang memanggil save/export sendiri ikut terhitung (alur normal alat).
- Reconnect Lakar: lakard restart (pid/startedAt/`NRestarts` systemd user berubah), halaman Chromium dibuat ulang (`pool.recreated` naik), atau tool_result `is_error` berisi `RENDER_FAILED`, `VERSION_MISMATCH`, "lakard tidak menjawab", atau pola putus transport. Reconnect pen.dev: `NRestarts`/`ActiveEnterTimestamp` pen-desktop berubah, atau tool_result `is_error` berpola putus transport (not connected, disconnect, connection closed, ECONNREFUSED/ECONNRESET/EPIPE, socket hang up, MCP error -32000). Error snippet biasa bukan reconnect. Dilaporkan terpisah, tidak dikurangkan dari waktu.
- Emoji: (a) di nilai string input tool_use agen (Emoji_Presentation, atau pictographic + VS16; © ® ™ dikecualikan; glyph LC-01b dihitung terpisah), (b) temuan LC-01a/LC-01b layout_check (Lakar saja; pen.dev tidak dilint, EULA), (c) emoji terlihat menurut juri (median).
- Normalisasi PNG: board/frame top-level (urutan dokumen) dikomposit di atas #808080, ditumpuk vertikal berjarak 48 px #808080, di-encode ulang RGB hanya IHDR/IDAT/IEND. Juri menerima tile lebar penuh (tinggi ≤ 1000 untuk lebar > 600, ≤ 1568 untuk lebih sempit) + satu overview sisi panjang ≤ 1568.
- Juri: `claude -p --input-format stream-json` tanpa tool/MCP (init wajib `tools=[]`, `mcp_servers=[]`), satu pesan berisi teks juri + gambar berlabel netral; label X/Y diacak per ulangan dengan `crypto` dan kedua penugasan wajib muncul. Jawaban JSON divalidasi ketat; tidak valid → 1 percobaan ulang, lalu `failed`.

## Penjaga .pen lama

- 43 file `.pen` di-md5 sebelum putaran (`~/.pencil/documents`, `/root/lakar/design`, `/root/comprice`, `/opt/pen`).
- Berubah: tidak ada; hilang: tidak ada; baru: 2.
- `systemctl --user is-active lakard` sesudah putaran: active
- Restart pen-desktop sesudah run pen.dev terakhir: **berhasil**, durasi 12.6 dtk (pen-desktop active; MCP pencil menjawab panggilan baca).

## Catatan

- Sebelum run: dokumen Lakar buatan putaran bench lain dipindah ke `bench/runs/lakar-archive/2-20261118T180705Z` (lintas-arus-landing, senyap-onboarding), lalu lakard di-restart (pid 1682719 → 1693465) agar slug agen tidak bentrok dengan dokumen lama. Restart ini sebelum run, jadi bukan reconnect.
