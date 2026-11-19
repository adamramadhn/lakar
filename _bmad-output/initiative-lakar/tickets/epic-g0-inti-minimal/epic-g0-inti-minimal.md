---
type: epic
title: "G0: inti A minimal lolos gerbang A dan B"
parent: initiative-lakar
covers: [R1, R2, R3, R4, R5, R6, R7, R8, R12]
sources: []
companions:
  - _bmad-output/initiative-lakar/architecture-lakar-core/architecture-lakar-core.md
  - _bmad-output/initiative-lakar/ux-lakar/DESIGN.md
  - _bmad-output/initiative-lakar/ux-lakar/golden-set.md
after: []
refined: true
risk: high
---

# G0: inti A minimal lolos gerbang A dan B

## Description

Epic ini membangun inti A minimal sesuai spine arsitektur: schema, core, render, exec, icons, check (subset G0), daemon, mcp, skill, dan harness bench. Hasilnya Claude Code bisa mendesain prompt A (landing) dan B (mobile) di Lakar. Satu putaran benchmark lalu memutuskan G0 terhadap pen.dev. Epic dibuka dengan upgrade mesin ke Node 26 LTS.

Putaran 1 gagal (A Kalah, B Setara; dikonfirmasi Adam 2026-11-18). Epic ini lalu mendapat putaran perbaikan (story 17–21): juri dikalibrasi terhadap penilaian Adam, foto stok lokal ditarik dari G1, skill direvisi agar lebih kaya, lalu putaran resmi 2 untuk A dan B. Sebelum refactor sweep dan putaran 2 ada story 22: efek visual gradien dan shader setara pen.dev (keputusan Adam 2026-11-18).

## Outcome

Adam tahu apakah arah editor sendiri layak: prompt A dan B setara atau lebih baik dari pen.dev, nol emoji, dan waktu ≤ 1,5×, atau arah dievaluasi ulang.

## Requirements

- R1 (parent R1): agen membuat dan mengubah desain di dokumen `<slug>.lakar.json` lewat `execute` di MCP. Mutasi hanya berlangsung lewat transaksi operasi atomik dengan riwayat. Dokumen tervalidasi skema Lakar berversi (AD-1–AD-4, AD-7, AD-11, AD-15–AD-17).
- R2 (parent R2): node `frame` mendukung layout `none | row | column`, `gap`, `padding`, `align`, `justify`, dan sizing `fixed | hug | fill` + min/max. Skema menolak `x/y` pada node flow (AD-5, AD-15).
- R3 (parent R3, bagian G0: render dan PNG; canvas B memakainya di epic B): satu modul render memetakan dokumen yang sudah di-resolve ke DOM. Screenshot dan ekspor PNG (skala 1, maks 2) untuk board atau node berjalan lewat pool Chromium hangat. Font hilang menghasilkan `FONT_MISSING` (AD-5, AD-6, AD-10, AD-18).
- R4 (parent R4): node `icon` (Lucide, Simple Icons) memakai nama kanonik. `icon_search` mengembalikan hasil, dan nama tak dikenal menghasilkan `ICON_UNKNOWN` dengan 3 saran (AD-9).
- R5 (parent R5, bagian G0): aturan LC-01a, LC-01b, LC-02a, LC-05, LC-12, dan LC-20 berjalan otomatis setiap `execute` dan lewat tool `layout_check`, dengan bentuk temuan AD-8. Aturan lain menyusul di G1.
- R6 (parent R6, bagian G0): `read_skill` menyajikan `core.md`, `landing.md`, `mobile.md`, `icons.md`, dan `api.md` (dihasilkan dari `api.ts`). Contoh di skill dites terhadap API. `webapp.md` menyusul di G1 (AD-12).
- R7 (parent R7, bagian G0): harness bench menjalankan prompt A dan B di Lakar dan pen.dev sesuai golden-set §Prosedur. Isinya baseline pen.dev median 3 run, PNG skala 1, strip mobile, juri 3× buta, dan laporan putaran (AD-13).
- R8 (parent R8): keputusan G0 tercatat di `bench/round-<n>.md` dan sudah dikonfirmasi Adam.
- R9 (architecture §Stack, §Deployment; C9): `lakard` berjalan di Node 26 LTS yang terpasang berdampingan dengan Node sistem, sebagai systemd user service yang bind ke 127.0.0.1. Rilis memakai `pnpm build` dan instal chromium-headless-shell.

Catatan: R10–R13 di bawah adalah ID lokal epic dan berbeda arti dari R10–R13 inisiatif. Sumber parent disebut di tiap baris.

- R10 (parent R7; bench/round-1.md §Konfirmasi Adam dan §Evaluasi arah, keputusan Adam 2026-11-18): juri bench menilai juga kekayaan informasi & detail serta polesan warna & komponen, dengan kriteria umum yang tidak menyebut isi prompt tertentu, dan tetap buta. Terbukti bila juri baru pada pasangan PNG putaran 1 memberi A → pen.dev unggul (Lakar Kalah, paling baik Setara) dan B → Setara.
- R11 (parent R12, bagian G0: cari, impor, atribusi, render offline; bukti prompt D milik G1; architecture AD-10 dan §Deferred; keputusan Adam 2026-11-18): agen mencari foto stok lewat tool Lakar. Foto Wikimedia/Openverse diimpor sekali ke asset store `<dataDir>/assets/<sha256>` lalu dipakai sebagai fill gambar, dengan sumber, pembuat, dan lisensi tercatat. Foto Unsplash (sejak story 1.24) adalah aset jarak jauh: URL hotlink, `download_location`, dan kredit tercatat di meta. Byte foto Unsplash tidak disimpan di asset store. Render tidak bergantung pada jaringan, kecuali cache render Unsplash yang dingin; dalam kasus itu render memakai placeholder warna foto bila offline (AD-10).
- R12 (parent R6; bench/round-1.md §Evaluasi arah; keputusan Adam 2026-11-18): skill mengarahkan hasil yang kaya dan berpoles, tidak datar. Isinya tint merek di bidang gelap, warna kedua semantik untuk status, chip/badge metrik, microcopy konteks, variasi status di daftar, ring/chart multi-warna, dan pemakaian foto. Anti-slop tetap berlaku, dan skill tetap tidak memuat rubrik (C7).
- R13 (parent R3 dan R6; klaim pen.dev "stunning visual effects with shaders"; keputusan Adam 2026-11-18): render Lakar menyediakan efek visual setara pen.dev, minimal conic gradient dan grain/noise di atas gradien linear/radial berlapis yang sudah ada, dan bila investigasi menunjukkan pen.dev memakai shader sungguhan, shader fill statis berupa preset parametrik yang dirender WebGL di Chromium menjadi bitmap saat render (render tetap murni browser, AD-6; skema berubah lewat versi dan migrasi, AD-1–AD-4, AD-15). Skill memberi panduan kapan gradien membuat desain matang (tint bidang merek, glow, scrim foto, sorot kartu unggulan, ring/donut bergradasi) dalam batas anti-slop. Terbukti bila pada prompt latihan efek baru (bukan A–E) Lakar Setara atau Lebih baik dari pen.dev menurut juri v2.1, dan Adam sudah melihat PNG.

## Constraints

- C1, C2, C3, C5, C6, C7, C8, dan C9 dari inisiatif berlaku penuh.
- Lakar selalu memanggil Node 26 lewat path absolut (`/opt/node-26/bin`), dan `/usr/bin/node` tidak diubah.
- C4: kalau G0 gagal, epic G1 tidak dimulai sampai arah dievaluasi. Setelah putaran 1 gagal, G1 baru dimulai bila putaran 2 lolos dan dikonfirmasi Adam.
- C7 keras untuk putaran perbaikan: rubrik juri, kriteria golden, dan prompt A/B tidak boleh masuk skill. Iterasi skill hanya memakai prompt latihan baru yang bukan A–E.
- Pembungkus dan prompt A/B tidak berubah: protocolHash tetap `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d`. Prompt latihan disimpan di luar `bench/protocol/`.
- Secret penyedia foto (bila ada) diberikan Adam lewat mekanisme secret, disimpan di `~/.config/lakar/` (mode 600). Secret tidak ditulis di chat, log, laporan, atau git.
- Stack mengikuti architecture §Stack (versi terpin). TypeScript 7 dipakai tanpa alat yang butuh API TS programatik.

## Done when

- Node 26 LTS tersedia untuk Lakar sementara Node sistem tetap v22, dan `pnpm build` + `vitest` lulus untuk semua paket.
- Dari sesi Claude Code baru, prompt A dan B menghasilkan board di Lakar dengan PNG, dan `layout_check` G0 menghasilkan 0 error gerbang.
- `lakard` berjalan sebagai systemd user service dan `status` melaporkan versi, pool, dan font hilang.
- `bench/round-1.md` berisi baseline pen.dev (median 3 run), hasil Lakar, skor juri, dan keputusan A dan B, sudah dikonfirmasi Adam (terpenuhi 2026-11-18: G0 gagal).
- Juri terkalibrasi (versi dan sha256 teks juri tercatat) memberi hasil yang sejalan dengan penilaian Adam pada PNG putaran 1.
- Agen bisa mencari, mengimpor, dan memakai foto stok lokal dengan atribusi tercatat, dan PNG tetap terbentuk tanpa jaringan.
- Pada prompt latihan efek visual (P5/P6), Lakar Setara atau Lebih baik dari pen.dev menurut juri v2.1, waktu ≤ 1,5×, nol emoji, dan 0 error gerbang. Efek baru (conic, grain/noise, dan shader fill bila dibangun) lolos golden render, dan Adam sudah melihat PNG.
- `bench/round-2.md` menunjukkan prompt A dan B setara atau lebih baik, nol emoji, dan waktu ≤ 1,5× median baseline, dengan juri terkalibrasi. Adam sudah mengonfirmasi. Tanpa ini G1 tidak dimulai.

## Boundaries

- Milik G1: LC-02b, LC-03, LC-04, LC-06–LC-11, LC-13–LC-19, LC-21, LC-22, `webapp.md`, prompt C/D/E (termasuk bukti foto relevan di prompt D), dan desain target golden set di Lakar.
- Milik G0 (putaran perbaikan): foto stok lokal (pencarian, impor, atribusi, render offline), kalibrasi juri, revisi skill, dan efek visual gradien/shader (story 22).
- Di luar G0: gambar AI (inisiatif boundaries, D).
- Milik B: UI canvas, WebSocket progres, dan seleksi.
- Must not change: modul render tetap bisa dimuat di browser biasa tanpa API Node (AD-6), karena epic B memakainya.
- Must not change: kontrak respons `{ok, data | error}` dan enum kode error (AD-11) yang nanti dipakai G1 dan B.

## References

- parent — _bmad-output/initiative-lakar/initiative-lakar.md, Requirements
- architecture — _bmad-output/initiative-lakar/architecture-lakar-core/architecture-lakar-core.md (AD-1–AD-18, §Stack, §Structural Seed, §Deployment)
- design — _bmad-output/initiative-lakar/ux-lakar/DESIGN.md (§Turunan, §Proses anti-slop, Lampiran A dan B)
- design — _bmad-output/initiative-lakar/ux-lakar/golden-set.md (prompt A dan B, §Prosedur)
- evidence — bench/round-1.md (§Konfirmasi Adam, §Evaluasi arah; commit 69e174c)

## Notes

- Decision: 2026-11-17 — tracer bullet adalah story 3 (Claude Code → MCP → `execute` → core → render → PNG). Upgrade Node (1) dan scaffold (2) mendahuluinya: Node sesuai arahan Adam, dan scaffold dipisah karena tracer sudah berisiko tinggi.
- Decision: 2026-11-17 — story kedua setelah tracer yang paling tidak pasti adalah baseline waktu pen.dev (story 4). Ambang 1,5× bergantung pada baseline ini, dan baseline A sekarang hanya 1 run.
- Decision: 2026-11-17 — epic G0 di-refine dari baris inisiatif + spine arsitektur tanpa run UX/arsitektur tambahan, karena spine sudah final untuk G0.
- Decision: 2026-11-17 — story 9 menunggu 8, dan story 11 menunggu 10. Alasannya bukan kebutuhan fungsi: pasangan itu sama-sama mengubah `packages/daemon` (aset/font vs sesi/store, ikon vs pipeline check), jadi diurutkan agar tidak bentrok.
- Decision: 2026-11-17 — penulisan file dokumen dan riwayat ada di daemon (story 9), bukan di core, sesuai spine (core tanpa IO).
- Decision: 2026-11-17 — putaran G0 hanya berisi prompt A dan B (forge §Kriteria sukses G0). Aturan "satu putaran = kelima prompt" berlaku mulai G1.
- Decision: 2026-11-17 — gerbang G0 tidak menghitung R3/R7, karena aturan sumbernya (LC-03/06/07/11/13/14/17/18/21) milik G1. G0 memakai error gerbang, ukuran board, dan waktu.
- Decision: 2026-11-17 — waktu diukur sesuai AD-13 (lihat Notes inisiatif). Story 4 tidak lagi tertahan.
- Decision: 2026-11-17 — epic G0 tetap satu dengan 16 story, tidak dipecah menjadi inti dan bench. Keduanya baru bernilai bersama untuk memutuskan gerbang. Keputusan diserahkan Adam ke Sofia.
- Decision: 2026-11-17 — G0 dibangun tanpa pendamping oleh `bmad-build-auto`, berurutan di branch `g0`. Plan direview dulu (plan_checkpoint) untuk story berisiko tinggi: 3, 4, 7, 11, 16. Eksekusi berhenti setelah selesai (done_checkpoint) di story 1 (mesin), 4 (baseline pen.dev), 12 (service), dan 16 (gerbang). Story hitl berhenti saat butuh Adam. Keputusan diserahkan Adam ke Sofia.
- Decision: 2026-11-18 — Adam mengonfirmasi putaran 1: A Kalah, B Setara, sehingga G0 gagal. pen.dev lebih matang di pewarnaan dan komponen, serta lebih kaya informasi. Lakar datar dan kaku. Juri LLM memberi skor terbalik dari penilaian Adam, jadi juri tidak terkalibrasi. Arah editor sendiri dipertahankan (Adam). Sebelum G1 ada putaran perbaikan G0 secara berurutan: kalibrasi juri (17), foto stok lokal ditarik dari G1 (18), skill lebih kaya (19), refactor sweep (20), dan putaran resmi 2 (21). G1 baru dimulai bila putaran 2 lolos dan dikonfirmasi Adam. Sumber: bench/round-1.md.
- Decision: 2026-11-18 — `after` 18 → 17 hanya untuk urutan (arahan Adam: satu-satu), bukan kebutuhan fungsi. Foto stok tidak memerlukan juri baru.
- Decision: 2026-11-18 — refactor sweep (20) tetap story terpisah dan tidak digabung ke putaran 2 (21). Putaran resmi mewajibkan kode produk dan harness beku (`git status --porcelain` kosong) sebelum run, jadi pembersihan harus selesai dan di-commit lebih dulu agar bukti putaran 2 tidak bercampur dengan perubahan kode. Cakupannya dibatasi temuan tunda dari 17–19.
- Decision: 2026-11-18 — penyedia foto default adalah Pexels. Lisensinya boleh dipakai gratis, atribusi tidak wajib (tetap dicatat), dan foto boleh diunduh lalu disimpan lokal. API key diberikan Adam lewat mekanisme secret. Unsplash ditolak karena pedoman API-nya mewajibkan hotlink URL gambar, bertentangan dengan aset lokal dan render tanpa jaringan. Openverse (tanpa key, filter CC0/PDM/CC BY) menjadi cadangan bila Adam tidak memberi key. Plan story 18 boleh mengoreksi pilihan ini dengan alasan, ditinjau di plan_checkpoint.
- Decision: 2026-11-18 — prompt latihan story 19 berjumlah 3–4, baru, dan bukan A–E (golden set C/D/E milik G1 dan tidak dipakai agar G1 tidak ikut di-overfit). Prompt disimpan di `bench/practice/`, di luar `bench/protocol/`, supaya protocolHash tetap. Target: Lakar Setara/Lebih baik pada ≥ 3 dari 4 prompt latihan (≥ 2 dari 3 bila hanya 3) menurut juri terkalibrasi, dan Adam melihat PNG.
- Decision: 2026-11-18 — kriteria juri baru ditulis umum (tanpa menyebut streak, target harian, avatar foto, atau isi A/B lainnya) agar tidak overfit ke dua contoh putaran 1. Ambang keputusan per prompt (Setara/Lebih baik/Kalah) disesuaikan dengan skala skor baru di Lampiran B dan dicatat beserta alasannya.
- Decision: 2026-11-18 — konsekuensi exclude git: `_bmad-output/initiative-lakar/ux-lakar/` (DESIGN.md Lampiran B dan golden-set.md) di-exclude git lokal (`.git/info/exclude`), sehingga perubahan rubrik tidak punya riwayat git. Story 17 mencatat versi rubrik dan sha256 teks juri yang dirender di laporan bench, dan menyimpan salinan teks juri per putaran di `bench/runs/` (gitignored, tidak terbaca agen). Bench menolak putaran resmi bila hash teks juri berbeda dari yang dicatat di story 17. Cadangan DESIGN.md ada di tangan Adam.
- Decision: 2026-11-18 — AD-10/§Deferred (penyedia foto) di spine arsitektur diputuskan oleh story 18. Spine tidak diedit Sofia. Tawarkan `bmad-architecture` untuk mencatatnya.
- Decision: 2026-11-18 — ambang keputusan baru dan teks rubrik baru ditinjau Adam di plan_checkpoint story 17, sebelum dipakai. Hold-out kalibrasi: hasil uji-1 dilihat Adam, dan prompt latihan story 19 menjadi uji lanjutan di luar dua contoh putaran 1.
- Decision: 2026-11-18 — story 19 tidak dipecah walau besar (revisi skill, run latihan di kedua alat, penilaian). Daftar story ditetapkan Adam, dan iterasi skill tanpa bukti latihan tidak berguna. Bila sesi build tidak cukup, builder memecahnya lewat REPLAN.
- Decision: 2026-11-18 — Adam menambah story 22 "Efek visual gradien dan shader setara pen.dev" ke putaran perbaikan. pen.dev mengklaim efek visual dengan shader, sedangkan Lakar hanya punya gradien linear/radial berlapis tanpa conic, grain/noise, mesh, atau shader, dan skill belum memberi panduan kapan gradien membuat desain matang. Urutan build: 19 → 22 → 20 → 21. Story 20 kini menunggu 22 juga, karena sweep membersihkan temuan tunda 22 dan putaran 2 harus memakai kode yang sudah beku. Story 21 tetap menunggu 20 (dan 19). Requirement lokal R13 ditambahkan. Flag: plan_checkpoint, done_checkpoint, hitl (Adam melihat PNG), risk high. Anggaran sekitar $10–15, dicatat di laporan latihan.
- Decision: 2026-11-18 — kedalaman story 22 ditetapkan di plan_checkpoint dari investigasi read-only pen.dev (MCP pencil, tanpa menimpa .pen) dan baseline P5/P6. Lantai: conic gradient, grain/noise, dan panduan gradien di skill. Shader fill WebGL statis hanya dibangun bila gap berasal dari shader sungguhan. Prompt efek P5/P6 baru, bukan turunan A/B, tanpa teks rubrik (C7), dan dibekukan dengan sha256 sebelum perubahan mesin/skill. Target: Setara/Lebih baik di semua prompt efek (bukan sebagian besar seperti story 19), karena jumlah promptnya hanya 1–2. PNG pen.dev baseline dipakai ulang di run ulang (C8: satu run per alat per prompt). Restart pen-desktop setelah seri pen.dev diizinkan Adam untuk melepas RAM (C9 tetap: tanpa service atau port baru).
- Decision: 2026-11-18 — story 22 tidak dipecah (investigasi, prompt, baseline, mesin, skill, run ulang). Seperti story 19, bukti latihan adalah tujuan iterasinya. Bila sesi build tidak cukup atau plan memilih shader fill, builder memecahnya lewat REPLAN (mis. shader fill sebagai story terpisah sebelum 20).
- Decision: 2026-11-18 — tipe fill baru (conic, grain/noise, dan shader fill bila dibangun) pasti mengubah katalog `fills[]` AD-15. Perubahannya lewat schemaVersion dan migrasi (AD-1–AD-4) dan dicatat di plan story 22. Spine arsitektur tidak diedit Sofia. Tawarkan `bmad-architecture` untuk memperbarui AD-15 saat plan_checkpoint story 22.
- Decision: 2026-11-18 — konflik dengan DESIGN.md: DESIGN.md melarang glow (§Shadows), lebih dari satu gradien per board (§Colors, LC-21 milik G1), dan mesh di hero tanpa alasan merek (anti-slop). Panduan skill story 22 tetap di dalam aturan itu: tint merek, scrim foto, sorot kartu unggulan, dan ring/donut bergradasi dipakai satu efek gradien dominan per board, dan mesh hanya dengan alasan merek. Glow dan lebih dari satu gradien per board baru masuk skill bila Adam menyetujui amandemen DESIGN.md di plan_checkpoint (DESIGN.md di-exclude git, jadi versinya dicatat di plan).
- Decision: 2026-11-18 — harness latihan story 19 sudah mencapai batas iterasi 8 dan memakai $54,94 dari anggaran $58,09. Story 22 memakai seri efek sendiri: set prompt efek terpisah dari P1–P4 yang ber-sha, batas iterasi sendiri, penghitung anggaran sendiri dengan batas $15 (keputusan Adam: sekitar $10–15), dan aturan lulus semua prompt efek. Bukti P1–P4 story 19 tidak diubah.
- Decision: 2026-11-19 — Adam menutup story 1.23 sebagai `built`. P7 kalah hanya karena waktu, dan tujuan spacing/polish tercapai. Story 1.24 ditambahkan untuk menangani kekurangan itu: board mobile panjang, rubrik v2.2 dengan R1 simetris, `webapp.md`, foto Unsplash, dan LC-31 mockup hero.
- Decision: 2026-11-19 — keputusan 2026-11-18 yang menolak Unsplash dibalik oleh Adam. Adam mendaftar API Unsplash, dan Access Key disimpan di `~/.config/lakar/unsplash-access-key` (mode 600). Urutan penyedia: Unsplash (bila ada key) → Wikimedia → Openverse. Konflik hotlink dengan AD-10 diselesaikan dengan aset jarak jauh + cache render lokal (AD-10). Risiko kepatuhannya tetap terbuka sampai Unsplash mengonfirmasi saat pengajuan mode produksi. `utm_source` = `unsplash_app_name` (default `lakar`).
- Decision: 2026-11-19 — batas paket pen.dev periode tagihan ini tercapai. Atas keputusan Adam, seri polish iterasi 3 memakai ulang PNG pen.dev iterasi 1 untuk P7–P9. Hasilnya: P7 Lebih baik, P8 Setara, P9 Lebih baik, dengan kumulatif $18,08. Adam menyetujui PNG, `g0` di-merge ke `main` secara lokal, dan putaran resmi 3 tidak diperlukan. G0 selesai (story 1–24 `built`).
