---
type: initiative
title: "Lakar: agen desain UI dengan editor dan format dokumen sendiri"
parent: none
sources:
  - _bmad-output/initiative-lakar/forge-lakar-canvas/forge-lakar-canvas.md
  - _bmad-output/initiative-lakar/ux-lakar/golden-set.md
  - _bmad-output/initiative-lakar/ux-lakar/DESIGN.md
companions:
  - _bmad-output/initiative-lakar/architecture-lakar-core/architecture-lakar-core.md
  - _bmad-output/initiative-lakar/ux-lakar/DESIGN.md
  - _bmad-output/initiative-lakar/ux-lakar/golden-set.md
after: []
risk: high
---

# Lakar: agen desain UI dengan editor dan format dokumen sendiri

## Description

Lakar adalah agen desain UI untuk pemakaian pribadi dan tim internal. Lakar punya editor/canvas sendiri dengan format dokumen JSON miliknya, tanpa Penpot. Inisiatif ini membangun inti agen A tanpa UI dan mengukurnya terhadap pen.dev lewat golden set. Gerbangnya G0 (inti minimal), lalu G1 (A lengkap). Setelah G1 lulus, B dibangun: UI untuk melihat hasil dan mengarahkan agen. Sumbernya forge-lakar-canvas (HARDENED). Dua sumber pendukung juga dipakai: standar hasil DESIGN.md dan golden-set.md.

## Outcome

Adam bisa meminta desain UI dari Claude Code dan mendapat hasil setara atau lebih baik dari pen.dev, dengan format dokumen milik sendiri. Ukurannya gerbang G0 dan G1 forge-lakar-canvas: golden set ≥ 4/5 setara atau lebih baik, ≥ 1 lebih baik, nol emoji, waktu ≤ 1,5× pen.dev.

## Requirements

- R1 (forge §Keputusan terkunci, A): agen membuat dan mengubah desain di dokumen JSON milik Lakar lewat API `execute` yang diekspos MCP. Terbukti bila Claude Code menghasilkan board di `<slug>.lakar.json` yang lolos validasi skema Lakar, tanpa Penpot atau pen.dev.
- R2 (forge §Keputusan terkunci, A: layout flex): desain memakai auto-layout flex (row/column, gap, padding, align, sizing hug/fill/fixed). Terbukti bila hasil render mengikuti properti layout tanpa koordinat manual pada node flow.
- R3 (forge §Keputusan terkunci, A: renderer canvas + PNG; arahan arsitektur): setiap board atau node bisa dirender ke PNG oleh satu renderer. Renderer yang sama nanti dipakai canvas B. Terbukti bila screenshot/ekspor PNG skala 1 dan 2 tersedia dan B memakai modul render yang sama.
- R4 (forge §Keputusan terkunci, A: ikon; golden-set kriteria [R5]): agen menaruh ikon dari pustaka ikon berdasarkan nama dan bisa mencari ikon. Terbukti bila ikon Lucide/Simple Icons tampil di PNG, nama yang tidak dikenal ditolak dengan saran, dan hasil berisi nol emoji.
- R5 (forge §Keputusan terkunci: aturan `layout_check`; DESIGN.md Lampiran A): agen menerima temuan `layout_check` otomatis setiap `execute` dan bisa memintanya untuk satu board penuh. G0 memakai subset gerbang minimal, G1 memakai seluruh Lampiran A. Terbukti bila board yang melanggar menghasilkan temuan dengan ID aturan Lampiran A.
- R6 (DESIGN.md §Turunan dokumen ini): agen membaca skill turunan DESIGN.md (core, landing, mobile, webapp, icons, api). Skill memuat aturan perilaku dari EXPERIENCE.md dan tidak memuat rubrik. Terbukti bila `read_skill` mengembalikan skill tersebut dan contoh kodenya lolos tes terhadap API.
- R7 (golden-set §Prosedur menjalankan benchmark; DESIGN.md Lampiran B): harness benchmark menjalankan prompt golden set di Lakar dan pen.dev dengan pengukuran simetris. Hasilnya keputusan per prompt (setara/lebih baik/kalah) beserta waktu, biaya, skor R1–R8, hasil `layout_check`, dan jumlah emoji. Terbukti bila `bench/round-<n>.md` dan `bench/score-<id>.md` terbentuk dari satu perintah per putaran.
- R8 (forge §Kriteria sukses G0): gerbang G0 diputuskan setelah inti A minimal. Lulus bila prompt A dan B setara atau lebih baik dari pen.dev, nol emoji, dan waktu ≤ 1,5× median baseline pen.dev. Gagal berarti arah dievaluasi sebelum lanjut.
- R9 (forge §Kriteria sukses G1): gerbang G1 diputuskan setelah A lengkap. Lulus bila golden set ≥ 4/5 setara atau lebih baik, ≥ 1 lebih baik, nol emoji, dan waktu ≤ 1,5×.
- R10 (forge §Keputusan terkunci, B): pengguna melihat dan mengarahkan agen dari canvas Lakar: pan/zoom, seleksi sebagai konteks agen, panel prompt, progres live, dan riwayat. Terbukti bila Adam memilih node di canvas, memberi prompt, lalu melihat perubahan muncul live dan tercatat di riwayat.
- R11 (golden-set §Provenance; DESIGN.md Lampiran A, uji regresi): desain target golden set dibangun ulang di Lakar. Desain ini dipakai sebagai regresi `layout_check` (0 error, LC-17/18/19 = 0) dan sebagai jangkar kalibrasi skor 2 bagi juri.
- R12 (golden-set prompt D kriteria 3; DESIGN.md §Components Gambar): agen menaruh foto yang sesuai isi sebagai fill gambar dari aset lokal. Terbukti bila prompt D menghasilkan kartu kamar dengan foto relevan, dan render tidak bergantung pada jaringan.

## Constraints

- C1 (forge §Keputusan terkunci alasan 3; §Risiko EULA): skema, nama API, dan teks skill ditulis sendiri, tidak meniru `.pen` atau `execute` pen.dev secara harfiah.
- C2 (forge §Keputusan terkunci, Pemakaian): untuk pemakaian pribadi atau tim internal, non-komersial. v1 hanya lokal tanpa autentikasi. Membuka akses ke tim mewajibkan token terlebih dahulu.
- C3 (forge §Keputusan terkunci, Prioritas): kalau kualitas hasil desain bertukar dengan kecepatan membangun, kualitas yang menang.
- C4 (forge §Keputusan terkunci, Urutan dan Kriteria sukses): urutannya A tanpa UI → benchmark → B. B dimulai hanya setelah G1 lulus. Kalau G0 gagal, pekerjaan lanjutan berhenti sampai arah dievaluasi.
- C5 (forge §Ditolak): tidak ada ketergantungan pada Penpot dalam bentuk apa pun, baik bungkus, embed, MVP batu loncatan, maupun jalur paralel.
- C6 (golden-set §Provenance): frame target golden set dari pen.dev hanya arsip internal. Frame itu tidak dipakai sebagai jangkar juri, data, atau bahan skill.
- C7 (DESIGN.md Lampiran B; golden-set): rubrik dan kriteria golden set tidak pernah dibaca agen.
- C8 (golden-set §Prosedur; DESIGN.md Lampiran B, Gerbang): waktu dan biaya kedua alat diukur dengan cara yang sama. Biaya hanya dilaporkan, bukan ambang. Satu putaran mencakup semua prompt dan tidak memilih run terbaik.
- C9 (keputusan Adam 2026-11-17): setiap langkah yang menyentuh mesin bersama tidak boleh berdampak ke aplikasi lain di VPS. Yang termasuk: runtime, paket global, service, port, Docker, dan file `.pen`. Pilih cara yang terisolasi, dan buktikan aplikasi lain tetap berjalan.

## Done when

- `bench/round-<n>.md` untuk G0 menunjukkan prompt A dan B setara atau lebih baik, nol emoji, dan waktu ≤ 1,5× baseline. Adam sudah mengonfirmasi skornya.
- `bench/round-<n>.md` untuk G1 menunjukkan ≥ 4/5 prompt setara atau lebih baik, ≥ 1 lebih baik, nol emoji, dan waktu ≤ 1,5×. Adam sudah mengonfirmasi.
- `lakard` berjalan sebagai systemd user service di VPS, dan Claude Code memakai Lakar lewat MCP tanpa Penpot terpasang.
- Adam mengarahkan agen dari canvas B: memilih node, memberi prompt, dan melihat progres live serta riwayat.
- Kelima desain target golden set yang dibangun di Lakar lolos `layout_check` dengan 0 error dan LC-17/18/19 = 0.

## Boundaries

- Di luar: C (edit manual) dan D (komponen/instance, variabel/tema, gambar AI, ekspor kode). Keduanya inisiatif berikutnya lewat `schemaVersion` baru.
- Di luar: multi-user, autentikasi, kolaborasi, dan pemakaian komersial.
- Di luar: Penpot (http://127.0.0.1:9101) dan bridge/tab Penpot dari EXPERIENCE.md.
- Touch point: pen.dev — hanya untuk menjalankan baseline benchmark; owner: epic-g0-inti-minimal (A, B), epic-g1-inti-lengkap (C, D, E).
- Touch point: Claude Code (`claude -p`) — klien MCP dan sumber waktu/biaya benchmark; owner: epic-g0-inti-minimal.
- Touch point: Fontsource dan penyedia foto — impor sekali ke aset lokal; owner: epic-g0-inti-minimal (font), epic-g1-inti-lengkap (foto).
- Jalur tracer lintas epic: prompt di Claude Code → MCP → `lakard execute` → core → render → `layout_check` → PNG → juri bench → keputusan gerbang, lalu canvas B memakai render dan daemon yang sama.

## References

- forge — _bmad-output/initiative-lakar/forge-lakar-canvas/forge-lakar-canvas.md, §Keputusan terkunci, §Ditolak, §Risiko yang diterima
- architecture — _bmad-output/initiative-lakar/architecture-lakar-core/architecture-lakar-core.md (spine, AD-1–AD-18, Stack, Structural Seed)
- design — _bmad-output/initiative-lakar/ux-lakar/DESIGN.md, Lampiran A (`layout_check`), Lampiran B (rubrik)
- design — _bmad-output/initiative-lakar/ux-lakar/golden-set.md (prompt A–E, Prosedur)

## Notes

- Source conflict: cara ukur waktu — golden-set §Prosedur langkah 3 (panggilan tool pertama sampai terakhir) vs architecture AD-13 (event pertama sampai `result` stream-json).
- Decision: 2026-11-17 — waktu benchmark diukur sesuai AD-13, dari event pertama sampai `result` stream-json, untuk kedua alat. Langkah 3 golden-set tidak dipakai untuk waktu. Keputusan diserahkan Adam ke Sofia.
- Open question: penyedia foto stok dan AI image (architecture §Deferred, sebelum G1). Yang menunggu: epic G1.
- Open question: spesifikasi UX untuk UI B belum ada, karena EXPERIENCE.md superseded. Yang menunggu: epic B (run `bmad-ux` setelah G1).
- Decision: 2026-11-17 — baseline waktu pen.dev untuk A diukur ulang (median 3 run) dan untuk B diukur pertama kali di epic G0.
- Decision: 2026-11-17 — ukuran board yang salah membuat hasil gagal otomatis di bench (Lampiran B, Gerbang), meskipun LC-12 berlevel warning.
- Decision: 2026-11-17 — putaran G0 hanya berisi A dan B, dan gerbang G0 tidak menghitung R3/R7 (aturan sumbernya milik G1). Detail ada di epic G0.
- Decision: 2026-11-17 — epic dibagi per gerbang: G0, lalu G1, lalu B (arahan Adam).
- Decision: 2026-11-17 — story pertama G0 menyiapkan Node 26 LTS (arahan Adam). Node 26 dipasang berdampingan khusus Lakar, sementara `/usr/bin/node` tetap v22 karena dipakai pen, n8n-mcp, dan aplikasi lain. Docker tidak dipakai: menambah latensi MCP stdio dan bertentangan dengan spine (systemd).
- Decision: 2026-11-17 — tidak ada epic platform-baseline terpisah. Upgrade Node dan scaffold menjadi story pertama epic G0.
