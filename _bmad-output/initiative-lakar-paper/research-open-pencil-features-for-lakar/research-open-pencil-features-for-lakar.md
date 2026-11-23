---
title: 'competitive research: open-pencil features and MCP worth adopting in Lakar'
type: 'competitive'
topic: 'open-pencil features and MCP worth adopting in Lakar'
decision: 'Which open-pencil features and MCP tools should enter the Lakar backlog, ranked adopt / consider / skip'
source: 'native run'
status: complete
preset: 'standard'
validation: 'normal'
created: '2026-11-23'
updated: '2026-11-23'
claims_verified: 6
claims_unverified: 3
---

# Riset kompetitif: fitur dan MCP open-pencil untuk Lakar

**Keputusan yang dilayani:** fitur dan tool MCP open-pencil mana yang masuk backlog Lakar, diberi label adopsi, pertimbangkan, atau lewati.

## Ringkasan eksekutif

Ada tiga hal yang benar-benar menaikkan kualitas desain agen di open-pencil. Ketiganya belum dimiliki Lakar. **Adopsi:**

1. **Loop verifikasi visual.**
   - `diff_pixels` merender dua node dan mengembalikan overlay piksel yang berubah beserta rasio dan wilayahnya, "untuk memastikan edit hanya menyentuh area yang dimaksud" [1].
   - `apply_patch` atomik dan dijaga terhadap state basi [1].
   - Roadmap mereka menjadikan loop "inspect → act → render/measure → compare → iterate" sebagai arah resmi agen [2].
   - Lakar punya `screenshot` dan `layout_check`, tetapi tidak punya pembanding sebelum/sesudah.
2. **Undo milik agen lewat MCP.** `undo`/`redo` hanya membatalkan langkah agen dan menolak menyentuh edit pengguna [3]. Lakar punya undo di viewer, tetapi agen belum bisa membatalkan langkahnya sendiri.
3. **Lint yang bisa memperbaiki sendiri.**
   - `lint_fix` menerapkan perbaikan aman, misalnya mengikat warna ke variabel dan membulatkan geometri [4].
   - Dengan `suggestions:true`, perbaikan yang butuh penilaian juga diterapkan [4].
   - `describe` punya sekitar 20 detektor heuristik desain [5].
   - `layout_check` Lakar memberi hint, tetapi tidak menerapkan apa pun.

**Pertimbangkan:**
- komentar dan status di layer sebagai kanal review agen [6];
- `arrange` untuk merapikan tumpang-tindih [7];
- impor halaman dari URL [8];
- token DTCG [9];
- `analyze_clusters` untuk kandidat komponen [10];
- anotasi tool `readOnlyHint`/`destructiveHint` [11].

**Lewati untuk sekarang:**
- fidelitas `.fig`/Figma, investasi terdalam mereka [12];
- Cloud berbayar [13];
- multiplayer P2P [14];
- board FigJam dan Mermaid/draw.io [15];
- behaviours. Ini yang paling khas, tetapi butuh model komponen interaktif [16].

**Peringatan terbesar.** Keluhan pengguna teratas open-pencil adalah agen gagal terhubung ke aplikasi desktop: issue #240 punya 16 komentar, dan masalah serupa muncul di Windows dan Linux [17]. Keluhan berikutnya adalah stabilitas di bawah beban edit MCP [18]. Bagi Lakar, keandalan koneksi MCP dan instalasi (seperti perbaikan installer `v0.1.4`) lebih bernilai daripada menambah tool. Mereka juga memecah kompatibilitas di setiap rilis minor, termasuk mengganti nama tool MCP dan ID layer [19]. Aturan AD-4 Lakar adalah pembeda yang nyata.

## 1. Permukaan MCP dan alur agen

open-pencil mendeklarasikan sekitar 115 tool di core, ditambah tool siklus dokumen, undo/redo, dan setting di lapisan MCP [20]. Lakar punya 16 tool. Bedanya bukan sekadar jumlah. Lakar memakai satu `execute` (JS di QuickJS) untuk hampir semua tulis, sedangkan open-pencil memakai `render` (JSX) plus puluhan tool `set_*`.

- **Baca dan edit dalam bahasa yang sama.**
  - `get_jsx` mengembalikan JSX dalam sintaks yang diterima `render`.
  - Pohon panjang diringkas menjadi `keepChildren` plus ID untuk dibaca berikutnya. `render` dengan `replace_id` lalu mengedit di tempat tanpa mengubah ID [21].
  - Ini permukaan agen yang paling banyak dites di sana, dengan sekitar 30 file tes masing-masing [22].
  - Lakar: `inspect` mengembalikan JSON, dan edit lewat `update`/`replace` di `execute`. Fungsinya setara, tetapi bentuk baca dan tulisnya tidak simetris.
- **Diff dan patch.**
  - `diff_nodes` dan `preview_patch` menghasilkan patch atribut.
  - `apply_patch` dijalankan semua-atau-tidak-sama-sekali dengan pemeriksaan nilai lama, plus `dryRun` [1].
  - `diff_changes` membandingkan seluruh run dengan state awal, tetapi hanya tersedia untuk chat bawaan, tidak untuk MCP eksternal [23].
- **Analisis tanpa render.**
  - `lint` dan `lint_fix` [4], serta detektor `describe` seperti radius bersarang, tombol tanpa padding horizontal, border tak terlihat, dan kontras rendah [5].
  - `analyze_overlaps` (sekitar 960 baris), `analyze_spacing`, dan `analyze_clusters` [10].
  - Banyak di antaranya tumpang-tindih dengan aturan LC Lakar. Yang belum dimiliki Lakar adalah **aplikasi perbaikan otomatis** dan **deteksi kandidat komponen**.
- **Aturan skill** [24]:
  - jangan ubah seleksi atau viewport pengguna;
  - gunakan Hug untuk halaman panjang alih-alih menebak tinggi;
  - perbaiki overflow dari sumbernya, bukan dengan memotong;
  - jumlah node dan `describe` tidak membuktikan hasil visual; ekspor lalu bandingkan.

  Lakar sudah mengikuti aturan Hug sejak `v0.1.2` dan Follow agent sejak `v0.1.3`.
- **Sesi multi-agen.**
  - Setiap sesi MCP punya identitas, target dokumen sendiri, kursor, dan callsign [25].
  - Subagen Claude Code mendapat kursor masing-masing [26].
  - Tidak ditemukan locking antar-agen; konsistensi bergantung pada tool atomik dan target per sesi [27].
  - Lakar sudah setara untuk target per sesi (#20) dan kursor per agen (#21). Kursor per subagen belum ada.
- **Mode cakupan seleksi.** `OPENPENCIL_MCP_SCOPE=selection` membatasi server ke tool baca pada seleksi pengguna [11].

## 2. Fitur editor dan canvas

- **Layout.** Memakai Taffy (Rust/WASM) untuk flexbox dan **CSS Grid** (`fr`/`px`/`auto`, span), min/max yang bisa diikat ke variabel, dan constraints [28]. Alasan yang mereka tulis: menyerahkan layout ke mesin yang sudah teruji, bukan kode buatan sendiri [29]. Lakar merender lewat CSS di Chromium, jadi Grid bisa didapat lewat skema, tanpa mesin baru.
- **Komponen.**
  - Varian multidimensi yang sparse dan properti text/boolean/instance-swap/slot dengan batas item [30].
  - Library dengan revisi immutable [31].
  - **Behaviours** mengikat komponen ke kontrol hidup (switch, slider, tabs, dan lain-lain), dan pratinjaunya berjalan di atas canvas. Fitur ini menggantikan prototyping, yang belum ada sama sekali di sana [16].
- **Variabel.**
  - Empat tipe, mode dengan kondisi CSS (`data-theme`, `prefers-*`, `@media`/`@container`), dan formula yang menjadi `calc()` [32].
  - Impor dan ekspor DTCG, plus tema Tokens Studio [9].
  - Lakar sudah punya token bertipe dengan mode, plus impor CSS variables dan ekspor `tokens.css`. DTCG dan kondisi mode selain tema belum ada.
- **Format.**
  - `.fig` adalah kelas satu: baca/tulis penuh dan clipboard dua arah dengan Figma [12].
  - `.pen` hanya bisa dibaca [33].
  - Impor HTML/URL memakai Blitz (Stylo, Taffy, Parley) menjadi auto layout yang bisa diedit [8].
  - Ekspor PDF, PPTX, dan draw.io; codegen ke JSX/HTML/Vue/React/Storybook [34].
- **Kolaborasi.** Multiplayer P2P (WebRTC, Yjs) [14], komentar yang ditambatkan ke layer [6], dan status seperti Ready for dev [35].
- **Investasi.** Core sekitar 118 ribu LOC dengan 917 file tes. Fidelitas `.fig` adalah kelompok tes terpadat, sedangkan Mermaid, draw.io, dan `.pen` tipis (sekitar 0,6–3 ribu LOC) [36].

## 3. Arah pengembangan dan suara pengguna

- **Arah.**
  - Rilis 0.17.0 (2026-11-22) adalah rilis "Cloud + boards" [13].
  - Sebagian besar dari 60 PR yang terakhir di-merge adalah Cloud: billing, seat, sign-in [37].
  - Fokus roadmap: fidelitas `.fig`, mobile, presentasi, dan "setiap operasi baca/tulis/ekspor/diff/validasi bisa dijangkau lewat UI, CLI, MCP, dan SDK" [2].
  - Bagian roadmap untuk agen: loop inspect→compare, diff pohon node yang ramah Git, dan lint dengan bukti expected/actual plus autofix aman [2].
- **Suara pengguna** (sinyalnya tipis: reaksi issue paling banyak 2, jadi peringkat diambil dari jumlah komentar):
  1. Koneksi agen ke aplikasi gagal [17].
  2. MCP membekukan app pada CPU 100% dan kehilangan pekerjaan yang belum disimpan, heap korup, dan undo tercampur dengan edit pengguna [18].
  3. Fidelitas impor Figma [38].
  4. Memori pada file besar [39].
  5. Default editor yang membingungkan AI, misalnya teks auto-height [40].
- **Traksi.** Sekitar 10 ribu bintang dalam 9 bulan, tetapi satu maintainer menulis 3.456 commit dari 87 kontributor [41].

## Wawasan lintas dimensi

- **Mereka paling banyak berinvestasi di fidelitas Figma dan Cloud, tetapi pengguna paling banyak mengeluhkan koneksi dan stabilitas agen.** Celah ini terbuka untuk Lakar: agen yang selalu terhubung, tidak membekukan app, dan undo yang tidak tercampur.
- **Mereka memecah kompatibilitas di setiap rilis minor** [19]. Agen yang menyimpan ID atau nama tool akan rusak. AD-4 Lakar (route, tool, dan input lama tetap berlaku) adalah keunggulan yang bisa dikomunikasikan.
- **Arah agen mereka (loop render→compare, lint dengan autofix, diff yang bisa ditinjau) masih berupa rencana atau hanya tersedia di chat bawaan** [2][23]. Lakar bisa lebih dulu menyediakannya untuk agen eksternal lewat MCP.

## Rekomendasi

Kolom "Lakar sekarang" berasal dari pembacaan kode Lakar per `221b668` sebagai konteks keputusan, bukan sebagai temuan riset.

| # | Kandidat | Label | Lakar sekarang | Dasar keyakinan |
|---|---|---|---|---|
| 1 | Tool `diff` visual (sebelum/sesudah per board atau node: overlay, rasio, wilayah) + langkah "compare" di skill `review` | **Adopsi** | `screenshot` saja; diff piksel hanya ada di harness tes render | high [1][2] |
| 2 | `undo`/`redo` untuk agen lewat MCP yang menolak membatalkan edit pengguna | **Adopsi** | Undo hanya di viewer (op invers, AD-8) | high [3] |
| 3 | Autofix untuk temuan `layout_check`: perbaikan aman otomatis, saran sebagai opsi | **Adopsi** | Hanya hint | high [4] |
| 4 | Komentar di layer + status (Draft/Review/Ready) sebagai kanal review agen ↔ pengguna | Pertimbangkan | Tidak ada | high [6][35] |
| 5 | `arrange`: rapikan node dan board yang tumpang-tindih | Pertimbangkan | `place()` menghindari tabrakan hanya untuk board baru | high [7] |
| 6 | Impor dari URL (perluasan `paste` HTML) | Pertimbangkan | Ada paste HTML/SVG; URL belum | high [8] |
| 7 | Deteksi kandidat komponen (`analyze_clusters`) | Pertimbangkan | Tidak ada | high [10] |
| 8 | Anotasi `readOnlyHint`/`destructiveHint` di tool MCP | Pertimbangkan (murah) | Tidak ada | high [11] |
| 9 | Impor/ekspor token DTCG; mode dengan kondisi `prefers-*`/`@media` | Pertimbangkan | Token + mode tema + CSS variables | high [9][32] |
| 10 | CSS Grid di skema | Pertimbangkan | Flex saja | high [28] |
| 11 | Kursor per subagen | Pertimbangkan | Kursor per sesi | high [26] |
| 12 | Behaviours / prototyping | Lewati (sekarang) | — | high [16] |
| 13 | `.fig` baca/tulis, Cloud, P2P multiplayer, board FigJam, Mermaid/draw.io | Lewati | — | high [12][13][14][15] |

Tiket bisa diambil dari butir 1–3. Ketiganya cocok sebagai satu epic "loop verifikasi agen" di `initiative-lakar-paper`, dengan spec BMAD masing-masing.

## Pertanyaan terbuka

- **Daftar aturan lint dan ambangnya.** Isi `packages/core/src/lint/rules/*` belum dibaca, padahal dibutuhkan untuk memetakan butir 3 ke aturan LC Lakar. Cukup satu putaran Deepen.
- **Cara open-pencil memutuskan bahwa langkah teratas adalah milik pengguna** (kode undo di sisi aplikasi). Dibutuhkan untuk desain butir 2.
- **Keluhan nyata pengguna yang belum tertangkap.** Discord proyek dan ulasan pihak ketiga belum dibaca utuh.

## Lampiran sumber

Semua sumber repo berasal dari clone `open-pencil/open-pencil` @ `68f8cad`. Clone ini shallow, jadi tanggal file adalah tanggal HEAD, bukan tanggal perubahan terakhir. Semua diakses 2026-11-23. Rincian per klaim ada di `digests/`.

| # | Klaim | Penerbit | Tgl terbit | Diakses | Keyakinan |
|---|---|---|---|---|---|
| [1] | diff_nodes/preview_patch/apply_patch/diff_pixels | [open-pencil repo · core/src/tools/analyze/diff](https://github.com/open-pencil/open-pencil/tree/68f8cad/packages/core/src/tools/analyze/diff) | 2026-11-23 | 2026-11-23 | high |
| [2] | Roadmap: fokus dan alur kerja agen | [open-pencil docs · roadmap.md](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/docs/development/roadmap.md) | 2026-11-22 | 2026-11-23 | high |
| [3] | Undo/redo hanya untuk langkah agen | [open-pencil · SKILL.md L316, L343; PR #1059](https://github.com/open-pencil/open-pencil/pull/1059) | 2026-10-10 | 2026-11-23 | high |
| [4] | lint/lint_fix | [open-pencil repo · tools/analyze/lint.ts](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/core/src/tools/analyze/lint.ts) | 2026-11-23 | 2026-11-23 | high |
| [5] | Detektor `describe` | [open-pencil repo · tools/describe/issues.ts](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/core/src/tools/describe/issues.ts) | 2026-11-23 | 2026-11-23 | high |
| [6] | Komentar sebagai kanal review | [open-pencil · SKILL.md L204–223](https://github.com/open-pencil/open-pencil/blob/68f8cad/skills/open-pencil/SKILL.md) | 2026-11-23 | 2026-11-23 | high |
| [7] | `arrange` 10 mode | [open-pencil repo · tools/structure/arrange.ts](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/core/src/tools/structure/arrange.ts) | 2026-11-23 | 2026-11-23 | high |
| [8] | Impor HTML/URL lewat Blitz | [open-pencil · html-engine README; rilis v0.17.0](https://github.com/open-pencil/open-pencil/releases/tag/v0.17.0) | 2026-11-22 | 2026-11-23 | high |
| [9] | DTCG + Tokens Studio | [open-pencil docs · variables.md L85–96](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/docs/user-guide/variables.md) | 2026-11-23 | 2026-11-23 | high |
| [10] | analyze_overlaps/clusters/spacing | [open-pencil repo · tools/analyze](https://github.com/open-pencil/open-pencil/tree/68f8cad/packages/core/src/tools/analyze) | 2026-11-23 | 2026-11-23 | high |
| [11] | Anotasi tool + cakupan seleksi | [open-pencil repo · mcp/src/tool/scope.ts; PR #732](https://github.com/open-pencil/open-pencil/pull/732) | 2026-10-07 | 2026-11-23 | high |
| [12] | `.fig` kelas satu | [open-pencil docs · figma-compatibility.md](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/docs/reference/figma-compatibility.md) | 2026-10-27 | 2026-11-23 | high |
| [13] | 0.17.0 Cloud + boards | [GitHub release v0.17.0](https://github.com/open-pencil/open-pencil/releases/tag/v0.17.0) | 2026-11-22 | 2026-11-23 | high |
| [14] | Multiplayer P2P | [open-pencil docs · collaboration.md](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/docs/user-guide/collaboration.md) | 2026-11-23 | 2026-11-23 | high |
| [15] | Board FigJam, Mermaid, draw.io | [GitHub release v0.17.0](https://github.com/open-pencil/open-pencil/releases/tag/v0.17.0) | 2026-11-22 | 2026-11-23 | high |
| [16] | Behaviours; prototyping tidak ada | [open-pencil docs · components.md L46–60](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/docs/user-guide/components.md) | 2026-11-23 | 2026-11-23 | high |
| [17] | Keluhan koneksi agen (#240, #589, #2250, Disc. #196) | [GitHub issue #240](https://github.com/open-pencil/open-pencil/issues/240) | 2026-04-30 | 2026-11-23 | high |
| [18] | Stabilitas di bawah MCP (#975, #976, #883) | [GitHub issue #975](https://github.com/open-pencil/open-pencil/issues/975) | 2026-10-04 | 2026-11-23 | high |
| [19] | Breaking change tiap minor | [GitHub releases v0.14.0–v0.17.0](https://github.com/open-pencil/open-pencil/releases) | 2026-08-11 | 2026-11-23 | high |
| [20] | Inventaris sekitar 115 tool | [open-pencil repo · mcp/src/tool/registration.ts](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/mcp/src/tool/registration.ts) | 2026-11-23 | 2026-11-23 | high |
| [21] | Round-trip get_jsx ↔ render | [open-pencil repo · tools/read/jsx.ts](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/core/src/tools/read/jsx.ts) | 2026-11-23 | 2026-11-23 | high |
| [22] | Jumlah tes per permukaan | [open-pencil repo · listing tes HEAD](https://github.com/open-pencil/open-pencil/tree/68f8cad) | 2026-11-23 | 2026-11-23 | medium |
| [23] | diff_changes tidak tersedia untuk MCP | [open-pencil repo · analyze/diff/changes.ts](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/core/src/tools/analyze/diff/changes.ts) | 2026-11-23 | 2026-11-23 | high |
| [24] | Aturan skill (Hug, seleksi, verifikasi) | [open-pencil · design-authoring.md](https://github.com/open-pencil/open-pencil/blob/68f8cad/skills/open-pencil/references/design-authoring.md) | 2026-11-23 | 2026-11-23 | high |
| [25] | Identitas sesi + target dokumen | [open-pencil repo · mcp/src/server/sessions.ts](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/mcp/src/server/sessions.ts) | 2026-11-23 | 2026-11-23 | high |
| [26] | Kursor per subagen | [GitHub PR #2033](https://github.com/open-pencil/open-pencil/pull/2033) | 2026-11-12 | 2026-11-23 | high |
| [27] | Tidak ada locking antar-agen | [open-pencil repo · mcp/src/tool/registration.ts](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/mcp/src/tool/registration.ts) | 2026-11-23 | 2026-11-23 | medium |
| [28] | Taffy flex + Grid | [open-pencil docs · auto-layout.md](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/docs/user-guide/auto-layout.md) | 2026-11-23 | 2026-11-23 | high |
| [29] | Alasan memilih Taffy | [open-pencil docs · comparison.md](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/docs/overview/comparison.md) | 2026-11-23 | 2026-11-23 | high |
| [30] | Varian, properti, slot | [open-pencil docs · components.md L16–44](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/docs/user-guide/components.md) | 2026-11-23 | 2026-11-23 | high |
| [31] | Library dengan revisi immutable | [open-pencil docs · components.md L62–107](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/docs/user-guide/components.md) | 2026-11-23 | 2026-11-23 | high |
| [32] | Variabel, mode, formula | [open-pencil docs · variables.md L16–83](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/docs/user-guide/variables.md) | 2026-11-23 | 2026-11-23 | high |
| [33] | `.pen` hanya baca | [open-pencil docs · file-format.md](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/docs/reference/file-format.md) | 2026-11-23 | 2026-11-23 | high |
| [34] | Ekspor dan codegen | [open-pencil docs · exporting.md; README](https://github.com/open-pencil/open-pencil/blob/68f8cad/packages/docs/user-guide/exporting.md) | 2026-11-23 | 2026-11-23 | high |
| [35] | Status layer | [GitHub release v0.17.0](https://github.com/open-pencil/open-pencil/releases/tag/v0.17.0) | 2026-11-22 | 2026-11-23 | high |
| [36] | LOC dan tes per paket | [open-pencil repo · hitungan HEAD](https://github.com/open-pencil/open-pencil/tree/68f8cad) | 2026-11-23 | 2026-11-23 | medium |
| [37] | 60 PR terakhir didominasi Cloud | [GitHub PR #2306](https://github.com/open-pencil/open-pencil/pull/2306) | 2026-11-23 | 2026-11-23 | high |
| [38] | Keluhan impor Figma (#102, #69, #578) | [GitHub issue #578](https://github.com/open-pencil/open-pencil/issues/578) | 2026-08 | 2026-11-23 | high |
| [39] | Memori pada file besar (#255, #580, #587) | [GitHub issue #255](https://github.com/open-pencil/open-pencil/issues/255) | 2026-05-10 | 2026-11-23 | medium |
| [40] | Default editor yang membingungkan AI (#941) | [GitHub issue #941](https://github.com/open-pencil/open-pencil/issues/941) | 2026-10-07 | 2026-11-23 | medium |
| [41] | Traksi dan kontributor | [GitHub repo stats](https://github.com/open-pencil/open-pencil) | 2026-11-23 | 2026-11-23 | high |

## Peta kedaluwarsa

Dihasilkan oleh `recon_kit.py staleness`. Jendela kedaluwarsa: fitur 3 bulan, arah pengembangan 6 bulan, suara pengguna 12 bulan.

| Klaim | Kelas | Terbit | Cek ulang |
|---|---|---|---|
| [3] Undo khusus agen | fitur | 2026-10-10 | 2027-01-10 |
| [1] diff_pixels/apply_patch | fitur | 2026-11-23 | 2027-02-23 |
| [4] lint_fix | fitur | 2026-11-23 | 2027-02-23 |
| [16] Behaviours | fitur | 2026-11-23 | 2027-02-23 |
| [17] Keluhan koneksi agen | suara pengguna | 2026-04-30 | 2027-04-30 |
| [2] Loop agen di roadmap | arah | 2026-11-22 | 2027-05-22 |
| [13] Investasi Cloud | arah | 2026-11-22 | 2027-05-22 |
| [19] Breaking change tiap minor | arah | 2026-11-22 | 2027-05-22 |
| [18] Bug stabilitas MCP | suara pengguna | 2026-10-04 | 2027-10-04 |

Cek ulang paling awal jatuh pada **2027-01-10**. Saat itu jalankan Refresh pada folder ini.

Catatan metode:
- Klaim berstatus verified dibaca ulang langsung oleh lead di sumber primernya (kode/dokumen open-pencil atau `gh`). Sumbernya tetap satu penerbit, yaitu proyek itu sendiri.
- Tiga klaim lain tetap bersumber tunggal: [13], [18], [19].
- Red team tidak dijalankan.
