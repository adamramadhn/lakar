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
claims_verified: 17
claims_unverified: 12
deepened: '2026-11-23 (inventaris lengkap, open-pencil 1814dcb)'
---

# Riset kompetitif: fitur dan MCP open-pencil untuk Lakar

**Keputusan yang dilayani:** fitur dan tool MCP open-pencil mana yang masuk backlog Lakar, diberi label adopsi, pertimbangkan, atau lewati.

## Ringkasan eksekutif

> **Pembaruan deepen 2026-11-23.** Deepen menambah inventaris lengkap 348 item (bagian 4). Butir Adopsi 1–3 run pertama dan Grid sudah dibangun di Lakar (lihat bagian 6), sehingga loop inti agen Lakar kini setara open-pencil. Skill open-pencil tidak berisi panduan estetika [58]; skill Lakar punya panduan itu (konteks keputusan, bukan temuan riset). Adopsi berikutnya kecil-kecil:
> - anotasi tool MCP [42];
> - `layout_check` untuk tumpang-tindih dan teks meluap [43];
> - aturan skill pakai ulang komponen dan verifikasi mode [44][45];
> - snapping dan pengukur jarak di viewer [46][59];
> - flex wrap;
> - impor dari URL [50];
> - token DTCG [52];
> - updater desktop [53].

### Riwayat: ringkasan run pertama (sebelum deepen)

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

## 4. Inventaris lengkap

*Deepen 2026-11-23.* Sumbernya open-pencil `master` `1814dcb`, dua commit lebih baru dari run pertama, ditambah `gh`. Setiap item dicatat satu baris, dengan bukti `path:line` dari kedua repo. Tabel lengkap ada di [inventaris-lengkap.md](inventaris-lengkap.md) (348 baris). Kolom status Lakar berasal dari kode Lakar `main` `e41ff57` sebagai konteks keputusan, bukan temuan riset.

| Irisan | Baris | Ada | Sebagian | Belum | Lain | Adopsi | Pertimbangkan | Lewati |
|---|---|---|---|---|---|---|---|---|
| A. Tool MCP dan lapisan MCP | 142 | 52 | 46 | 42 | 2 | 2 | 36 | 104 |
| B. Skill | 97 | 41 | 30 | 23 | 3 | 7 | 21 | 69 |
| C. Mesin dan editor | 67 | 14 | 22 | 27 | 4 | 5 | 27 | 19 |
| D. Format dan otomasi | 42 | 4 | 12 | 22 | 4 | 5 | 16 | 21 |
| **Total** | **348** | **111** | **110** | **114** | **13** | **19** | **100** | **213** |

"Lain" = `beda` (pendekatan berbeda: eksekusi tool dan renderer) atau `belum dicek`. Di irisan C, 16 baris yang sudah setara sengaja dibiarkan tanpa label.

**A. Tool MCP.** Registry open-pencil berisi 109 tool (25 inti + 84 tambahan). Tiga di antaranya disembunyikan dari MCP, dan server MCP menambah 12–13 tool miliknya sendiri [57].
- **Loop inti agen sudah setara.** Lakar punya diff visual berbasis rev, undo per sesi, `fix_check` yang memisahkan perbaikan aman dari saran, dan batch edit dengan rollback. Di open-pencil, padanannya `diff_pixels`, `undo`/`redo` dan `lint_fix` [1][3][4].
- **Undo Lakar lebih bersih.** Undo di open-pencil mengenali langkah agen dari label "Agent:" yang dipakai semua otomasi (MCP dan CLI), jadi tidak per sesi [60], dan menolak bila langkah teratas milik pengguna [3]. Bug-nya juga masih terbuka: edit pengguna yang dibuat saat edit agen menunggu ikut masuk ke langkah undo agen (#883) [61].
- **Arsitektur eksekusinya berbeda.** Server MCP open-pencil tidak menjalankan tool sendiri. Setiap panggilan diteruskan ke aplikasi yang sedang terbuka dan gagal dengan `APP_NOT_CONNECTED` bila tidak ada aplikasi yang terhubung dalam 10 detik [54]. Bug WebView macet di bawah edit MCP masih terbuka (#975, dilaporkan di v0.15.1) [55]. `lakard` menjalankan tool tanpa aplikasi.
- **Dua celah yang murah ditutup:**
  - anotasi `readOnlyHint`/`destructiveHint` di setiap tool. open-pencil menurunkannya dari efek tool, sedangkan 19 tool Lakar tidak punya anotasi sama sekali [42];
  - deteksi tumpang-tindih antar-saudara dan teks yang meluap dari frame (`analyze_overlaps`). Ini perluasan LC-02a/LC-20 Lakar [43].

**B. Skill.** Skill open-pencil terdiri dari satu `SKILL.md` dan satu reference yang dihasilkan otomatis. Isinya manual API ditambah aturan kebenaran layout. **Tidak ada panduan estetika** (arketipe, daftar slop, pertanyaan kritik) [58]. Skill Lakar punya panduan itu, jadi untuk kualitas desain Lakar unggul (inferensi dari konteks keputusan). Celah Lakar ada di aturan kebenaran yang sempit:
- pakai ulang komponen lokal sebelum membuat ulang, dan ubah isi instance lewat properti, bukan override [44]. Helper prelude Lakar justru membuat salinan yang tidak terhubung;
- setelah mode tema berganti, cek geometri, bukan hanya warna, karena layout me-resolve variabel di mode saat layer dibuat [45];
- stress test juga mencakup edit master komponen dan mode tema [45];
- `between` tidak bisa menciptakan ruang di wadah hug, sizing `fill` harus diteruskan lewat setiap wadah perantara, dan selisih ukuran tidak boleh ditambal dengan tinggi tebakan, clipping, atau saudara yang diposisikan manual [45].

**C. Mesin dan editor.** Celah termurah ada di ergonomi editor. Snapping dengan smart guide (`computeSnap`), pengukur jarak Alt+hover, zoom 100% dan zoom ke seleksi, serta sebagian shortcut standar belum ada di viewer Lakar [46][59]. Semuanya bisa diimplementasikan di viewer tanpa mengubah skema. Flex wrap belum ada di skema Lakar. Fitur ini dipakai agen untuk daftar tag dan grid kartu, dan memetakan 1:1 ke `flex-wrap`, tetapi butuh `schemaVersion` baru.

Celah model yang cocok dengan semantik CSS Lakar:
- rich text per karakter [48];
- formula variabel yang diekspor sebagai `calc()` (hanya formula angka) [49];
- kondisi mode yang diekspor sebagai CSS: `prefers-*`, lebar viewport/kontainer, atribut data [49].

Behaviours (16 jenis kontrol dengan enam state) tetap pembeda terbesar open-pencil [16][47]. Prototyping tidak ada di open-pencil, hanya di roadmap, jadi bukan celah. Matriks kompatibilitas Figma mereka bertanggal 2026-10-27 dan sudah ketinggalan dari kode di setidaknya satu tempat (tool Scale). Sekitar selusin baris C hanya bersandar pada dokumen itu.

**D. Format dan otomasi.** open-pencil mendaftarkan 13 adapter IO: `.fig` baca/tulis, `.pen` baca saja, draw.io, Mermaid, PNG/JPG/WebP, SVG, PDF, PPTX, JSX, Tailwind JSX, dan HTML [56]. Lakar mengekspor PNG 1×/2× dan kode React+Tailwind/CSS.

Paste HTML Lakar sudah setara impor HTML mereka: halaman Chromium terisolasi dengan JS dan jaringan dimatikan. Yang belum ada:
- **Impor dari URL.** Rilis v0.17.0 (2026-11-22) [50].
- **Token DTCG.** Rilis v0.16.0 (2026-10-14) [52]. Lakar sudah punya CSS variables dan tema Tailwind.
- **Updater otomatis desktop.** open-pencil menerbitkan `latest.json` bertanda tangan [53].
- **Copy as PNG.**

Ekspor PDF dinilai berbeda oleh dua irisan. A melabelinya Lewati karena alasan MCP; D melabelinya Adopsi karena Lakar sudah merender dengan Chromium, sehingga jalur print-to-PDF tampak murah, meski belum diverifikasi. PDF open-pencil memakai backend PDF Skia dengan font tertanam yang bisa dicari [51]. Chat AI bawaan, Cloud, kolaborasi P2P, `.fig`/Kiwi, dan eval scripting tidak cocok untuk Lakar: alat lokal satu pengguna yang digerakkan agen eksternal lewat MCP.

## 5. Wawasan lintas dimensi

- **Mereka paling banyak berinvestasi di fidelitas Figma dan Cloud, tetapi pengguna paling banyak mengeluhkan koneksi dan stabilitas agen.** Celah ini terbuka untuk Lakar: agen yang selalu terhubung, tidak membekukan app, dan undo yang tidak tercampur.
- **Mereka memecah kompatibilitas di setiap rilis minor** [19]. Agen yang menyimpan ID atau nama tool akan rusak. AD-4 Lakar (route, tool, dan input lama tetap berlaku) adalah keunggulan yang bisa dikomunikasikan.
- **Arah agen mereka (loop render→compare, lint dengan autofix, diff yang bisa ditinjau) masih berupa rencana atau hanya tersedia di chat bawaan** [2][23]. Lakar bisa lebih dulu menyediakannya untuk agen eksternal lewat MCP.

- **Deepen 2026-11-23: celahnya bergeser dari loop agen ke editor dan model.** Lakar sudah setara di tool verifikasi dan undo [1][3][4]; open-pencil masih punya bug kepemilikan undo [61]. Sisa celah ada di ergonomi editor untuk manusia [46][59] dan fitur model (rich text, formula, kondisi mode, wrap) [48][49]. Pembeda Lakar adalah kualitas hasil [58] dan keandalan eksekusi tanpa aplikasi. Tool open-pencil sebaliknya bergantung pada aplikasi yang terhubung [54] dan masih punya bug WebView macet [55].

## 6. Rekomendasi

*Diperbarui pada deepen 2026-11-23.* Kolom "Lakar sekarang" berasal dari pembacaan kode Lakar `main` `e41ff57` sebagai konteks keputusan, bukan temuan riset. Run pertama membaca `221b668`.

**Sudah ada di Lakar.** Rekomendasi dari run pertama yang kini sudah dibangun:

| # | Kandidat (run pertama) | Lakar sekarang | Dasar |
|---|---|---|---|
| 1 | Diff visual sebelum/sesudah | Ada: diff visual berbasis rev di `packages/mcp` | high [1] |
| 2 | Undo milik agen lewat MCP | Ada: undo per sesi, lebih sempit dari open-pencil | high [3][60][61] |
| 3 | Autofix untuk temuan `layout_check` | Ada: `fix_check` (perbaikan aman dan saran) | high [4] |
| 10 | CSS Grid di skema | Ada: grid auto layout | high [28] |

**Backlog.** Nomor di kolom # adalah ID stabil kandidat (1–13 dari run pertama, 14 ke atas dari deepen), bukan urutan prioritas. Urutan baris di tabel ini yang menunjukkan prioritas.

| # | Kandidat | Label | Lakar sekarang | Dasar keyakinan |
|---|---|---|---|---|
| 14 | Anotasi `readOnlyHint`/`destructiveHint` di semua tool MCP (turunan dari efek tool) | **Adopsi** (naik dari #8) | 19 tool tanpa anotasi | high [42]. Manfaat belum terbukti: belum dicek apakah Claude Code atau Codex menyetujui otomatis berdasarkan anotasi ini |
| 15 | `layout_check` menangkap tumpang-tindih antar-saudara dan teks yang meluap dari frame | **Adopsi** | Sebagian: LC-02a (terpotong), LC-20 (zona bawah) | high [43] |
| 16 | Aturan skill: pakai ulang komponen sebelum membuat ulang; ubah instance lewat properti | **Adopsi** | Belum ada aturan pakai ulang; prelude membuat salinan tak terhubung | high [44] |
| 17 | Aturan verifikasi skill: geometri setelah ganti mode, stress test edit master dan mode, `between` di wadah hug, `fill` lewat wadah perantara, larangan menambal sizing | **Adopsi** | Sebagian, tersebar di `layout`, `review`, `break-ui` | medium [45] (satu sumber, dibaca peneliti) |
| 18 | Ergonomi viewer: snapping + smart guide, ukur jarak Alt+hover, zoom 100%/ke seleksi, sebagian shortcut standar | **Adopsi** | Belum ada snapping atau pengukur | high [46]; medium [59] untuk ukur jarak, zoom, shortcut (dokumen) |
| 19 | Flex wrap di skema (`flex-wrap` + `row-gap`) | **Adopsi** | Belum; butuh `schemaVersion` dan migrasi | medium (inventaris C, tidak di-spot-check) |
| 6 | Impor halaman dari URL, dengan kebijakan jaringan eksplisit | **Adopsi** (naik) | Paste HTML ada; jaringan sengaja diblokir | high [50] |
| 9 | Impor/ekspor token DTCG | **Adopsi** (naik) | Token bertipe + mode + CSS variables/Tailwind | high [52] |
| 20 | Updater otomatis desktop (Tauri updater, rilis bertanda tangan) | **Adopsi** | Belum ada plugin updater | medium [53] (tidak di-spot-check) |
| 21 | Copy as PNG | **Adopsi** (murah) | Copy as JSON; ekspor PNG ada | medium (inventaris D) |
| 22 | Ekspor PDF | Pertimbangkan | Belum | disputed antar-irisan; murah lewat Chromium belum diverifikasi [51] |
| 4 | Komentar di layer + balas/selesaikan sebagai antrean kerja agen | Pertimbangkan (tinggi) | Belum ada | high [6][35] |
| 23 | Rich text per karakter (gaya per rentang) | Pertimbangkan (tinggi) | Belum; butuh perubahan skema | medium [48] |
| 12 | Behaviours (komponen jadi kontrol hidup dengan state) | Pertimbangkan (besar) (naik dari Lewati) | Komponen, instance, props, dan slot sudah ada; behaviours belum | high [16] |
| 24 | Formula variabel (angka → `calc()`) dan kondisi mode → CSS | Pertimbangkan | Mode tema ada; formula dan kondisi belum | medium [49] |
| 25 | Tool halaman untuk agen; mode tema per frame | Pertimbangkan | Sebagian | medium (inventaris A) |
| 5 | `arrange`: rapikan node yang tumpang-tindih | Pertimbangkan | Sebagian | high [7] |
| 7 | Deteksi kandidat komponen (`analyze_clusters`) | Pertimbangkan | Belum | high [10] |
| 26 | Ekspor SVG | Pertimbangkan | Belum; mahal untuk renderer HTML/CSS | medium (inventaris D) |
| 11 | Kursor per subagen | Pertimbangkan | Kursor per sesi | high [26] |
| 13 | `.fig`, Cloud, multiplayer P2P, board FigJam/Mermaid/draw.io, chat AI bawaan, eval scripting, renderer CanvasKit | Lewati | - | high [12][13][14][15][56] |
| 27 | Prototyping | Lewati | - | high (open-pencil sendiri belum punya; hanya roadmap) |

Butir 14–17 dan 21 adalah perubahan kecil yang bisa langsung jadi story. Butir 18–19 cocok sebagai satu epic "ergonomi editor". Butir 6, 9, dan 20 masing-masing satu story, ditambah keputusan kebijakan jaringan untuk butir 6.

## 7. Pertanyaan terbuka

Dua pertanyaan run pertama sudah terjawab oleh deepen: daftar aturan lint [4] dan kepemilikan undo [3][60] (lihat bagian 4.A).

Masih terbuka:
- **Apakah Claude Code dan Codex memakai `readOnlyHint`** untuk menyetujui otomatis? Ini menentukan manfaat butir 14. Cara menjawabnya: baca dokumentasi kedua harness atau uji langsung.
- **Biaya ekspor PDF lewat Chromium** (butir 22). Ini butuh spike kecil di `lakard`.
- **Kebijakan jaringan untuk impor URL** (butir 6). Importer Lakar sengaja memblokir jaringan, dan open-pencil desktop menjalankan skrip halaman di jendela privat tersembunyi. Keputusan ini milik arsitektur, bukan riset.
- **Baris yang belum terverifikasi.** Sekitar selusin baris irisan C hanya bersandar pada matriks kompatibilitas Figma bertanggal 2026-10-27. Ada juga 11 baris `belum dicek` di sisi Lakar. Keduanya bisa ditutup dengan satu putaran deepen terarah.
- **Keluhan pengguna di luar GitHub.** Discord dan ulasan pihak ketiga masih belum dibaca.

## 8. Lampiran sumber

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

Sumber [42]–[61] dari deepen 2026-11-23: clone `open-pencil/open-pencil` @ `1814dcb` (shallow) dan `gh`, diakses 2026-11-23.

| # | Klaim | Penerbit | Tgl terbit | Diakses | Keyakinan |
|---|---|---|---|---|---|
| [42] | Anotasi readOnlyHint/destructiveHint dari efek tool | [open-pencil repo · mcp/tool/registration.ts](https://github.com/open-pencil/open-pencil/blob/1814dcb/packages/mcp/src/tool/registration.ts#L103-L108) | 2026-11-23 | 2026-11-23 | high |
| [43] | analyze_overlaps: konten menutupi footer, teks meluap, saudara tumpang-tindih | [open-pencil repo · analyze/overlaps](https://github.com/open-pencil/open-pencil/blob/1814dcb/packages/core/src/tools/analyze/overlaps/index.ts#L333-L338) | 2026-11-23 | 2026-11-23 | high |
| [44] | Skill: pakai ulang komponen; ubah instance lewat properti | [open-pencil repo · design-authoring.md](https://github.com/open-pencil/open-pencil/blob/1814dcb/skills/open-pencil/references/design-authoring.md#L55-L56) | 2026-11-23 | 2026-11-23 | high |
| [45] | Skill: aturan between/fill (L12-13), larangan menambal sizing (L57), geometri setelah ganti mode (L46), stress test (L80) | [open-pencil repo · design-authoring.md](https://github.com/open-pencil/open-pencil/blob/1814dcb/skills/open-pencil/references/design-authoring.md#L12-L80) | 2026-11-23 | 2026-11-23 | medium |
| [46] | Snapping (computeSnap), smart guide, rulers | [open-pencil repo · scene-graph/snap.ts](https://github.com/open-pencil/open-pencil/blob/1814dcb/packages/scene-graph/src/snap.ts#L28) | 2026-11-23 | 2026-11-23 | high |
| [47] | Behaviours: daftar jenis kontrol | [open-pencil repo · behaviours/kinds.ts](https://github.com/open-pencil/open-pencil/blob/1814dcb/packages/scene-graph/src/behaviours/kinds.ts#L3-L34) | 2026-11-23 | 2026-11-23 | high |
| [48] | Rich text: style runs per karakter | [open-pencil repo · text/style-runs.ts](https://github.com/open-pencil/open-pencil/blob/1814dcb/packages/core/src/text/style-runs.ts#L7) | 2026-11-23 | 2026-11-23 | medium |
| [49] | Formula variabel dan kondisi mode → CSS | [open-pencil docs · variables.md](https://github.com/open-pencil/open-pencil/blob/1814dcb/packages/docs/user-guide/variables.md#L33-L62) | 2026-11-23 | 2026-11-23 | medium |
| [50] | Open from URL (v0.17.0) | [open-pencil · GitHub release v0.17.0](https://github.com/open-pencil/open-pencil/releases/tag/v0.17.0) | 2026-11-22 | 2026-11-23 | high |
| [51] | Ekspor PDF dengan backend PDF Skia (v0.17.0) | [open-pencil · GitHub release v0.17.0](https://github.com/open-pencil/open-pencil/releases/tag/v0.17.0) | 2026-11-22 | 2026-11-23 | high |
| [52] | Impor/ekspor token W3C DTCG (v0.16.0) | [open-pencil · GitHub release v0.16.0](https://github.com/open-pencil/open-pencil/releases/tag/v0.16.0) | 2026-10-14 | 2026-11-23 | high |
| [53] | Updater desktop dengan latest.json bertanda tangan | [open-pencil repo · desktop/tauri.conf.json](https://github.com/open-pencil/open-pencil/blob/1814dcb/desktop/tauri.conf.json#L112-L117) | 2026-11-23 | 2026-11-23 | medium |
| [54] | Server MCP meneruskan tool ke aplikasi; APP_NOT_CONNECTED setelah 10 s | [open-pencil repo · mcp/server.ts](https://github.com/open-pencil/open-pencil/blob/1814dcb/packages/mcp/src/server.ts#L116-L119) | 2026-11-23 | 2026-11-23 | medium |
| [55] | Bug terbuka: WebView macet di bawah edit MCP (#975) | [GitHub issue #975](https://github.com/open-pencil/open-pencil/issues/975) | 2026-10-08 | 2026-11-23 | high |
| [56] | 13 adapter IO (fig, pen, drawio, mermaid, png, jpg, webp, svg, pdf, pptx, jsx, tailwind-jsx, html) | [open-pencil repo · core/io/formats.ts](https://github.com/open-pencil/open-pencil/blob/1814dcb/packages/core/src/io/formats.ts#L425-L439) | 2026-11-23 | 2026-11-23 | medium |
| [57] | Registry 109 tool (25 inti + 84 tambahan); 3 disembunyikan dari MCP | [open-pencil repo · tools/registry](https://github.com/open-pencil/open-pencil/blob/1814dcb/packages/core/src/tools/registry/index.ts#L10) | 2026-11-23 | 2026-11-23 | medium |
| [58] | Skill tanpa panduan estetika (dibaca utuh) | [open-pencil repo · skills/open-pencil](https://github.com/open-pencil/open-pencil/blob/1814dcb/skills/open-pencil/SKILL.md) | 2026-11-23 | 2026-11-23 | medium |
| [59] | Ukur jarak Alt+hover; zoom 100%/fit/seleksi; shortcut zoom | [open-pencil docs · figma-compatibility.md](https://github.com/open-pencil/open-pencil/blob/1814dcb/packages/docs/reference/figma-compatibility.md#L19-L56) | 2026-10-27 | 2026-11-23 | medium |
| [60] | Label undo "Agent:" untuk semua langkah otomasi (MCP, CLI) | [open-pencil repo · automation/execution/editor.ts](https://github.com/open-pencil/open-pencil/blob/1814dcb/src/app/automation/execution/editor.ts#L10-L19) | 2026-11-23 | 2026-11-23 | high |
| [61] | Bug terbuka: edit pengguna masuk ke langkah undo agen (#883) | [GitHub issue #883](https://github.com/open-pencil/open-pencil/issues/883) | 2026-10-04 | 2026-11-23 | high |

## 9. Peta kedaluwarsa

Dihasilkan oleh `recon_kit.py staleness`. Jendela kedaluwarsa: fitur 3 bulan, arah pengembangan 6 bulan, suara pengguna 12 bulan.

| Klaim | Kelas | Terbit | Cek ulang |
|---|---|---|---|
| [3] Undo khusus agen | fitur | 2026-10-10 | 2027-01-10 |
| [52] Token DTCG (v0.16.0) | fitur | 2026-10-14 | 2027-01-14 |
| [50] Open from URL (v0.17.0) | fitur | 2026-11-22 | 2027-02-22 |
| [51] Ekspor PDF Skia (v0.17.0) | fitur | 2026-11-22 | 2027-02-22 |
| [1] diff_pixels/apply_patch | fitur | 2026-11-23 | 2027-02-23 |
| [4] lint_fix | fitur | 2026-11-23 | 2027-02-23 |
| [16] Behaviours | fitur | 2026-11-23 | 2027-02-23 |
| [42] Anotasi tool MCP | fitur | 2026-11-23 | 2027-02-23 |
| [43] analyze_overlaps | fitur | 2026-11-23 | 2027-02-23 |
| [44] Aturan skill pakai ulang komponen | fitur | 2026-11-23 | 2027-02-23 |
| [46] Snapping (computeSnap) | fitur | 2026-11-23 | 2027-02-23 |
| [17] Keluhan koneksi agen | suara pengguna | 2026-04-30 | 2027-04-30 |
| [2] Loop agen di roadmap | arah | 2026-11-22 | 2027-05-22 |
| [13] Investasi Cloud | arah | 2026-11-22 | 2027-05-22 |
| [19] Breaking change tiap minor | arah | 2026-11-22 | 2027-05-22 |
| [18] Bug stabilitas MCP | suara pengguna | 2026-10-04 | 2027-10-04 |
| [55] Bug terbuka #975 dan #883 | suara pengguna | 2026-10-04 | 2027-10-04 |

Cek ulang paling awal jatuh pada **2027-01-10**. Saat itu jalankan Refresh pada folder ini.

Catatan metode:
- Klaim berstatus verified dibaca ulang langsung oleh lead di sumber primernya (kode/dokumen open-pencil atau `gh`). Sumbernya tetap satu penerbit, yaitu proyek itu sendiri.
- Tiga klaim lain tetap bersumber tunggal: [13], [18], [19].
- Red team tidak dijalankan.
- Deepen 2026-11-23: klaim [42]–[44], [46], [47], [50]–[52], dan [55] dibaca ulang lead langsung di kode open-pencil atau lewat `gh` (verified, tetap satu penerbit). Klaim [45], [48], [49], [53], [54], [56]–[58] bersumber tunggal dari digest (unverified). Satu catatan digest D dibatalkan saat spot-check: menu Copy as di `DesignPanel.tsx` yang hanya menawarkan JSON ternyata disengaja (`DesignPanel.tsx:122`: CSS/Tailwind per node digantikan dialog Export code, JSON dipertahankan untuk debug). [59]–[61] ditambahkan setelah cek sitasi semantik (48 tempat: 40 didukung, 8 sebagian, 1 tidak); [60] dan [61] dibaca ulang lead.
