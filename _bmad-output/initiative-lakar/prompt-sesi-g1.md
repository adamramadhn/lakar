Mulai epic G1 Lakar di /root/lakar. Buat branch `g1` dari `main` (main = G0 selesai, f2a064e+). Jangan push. Jangan merge ke main sampai saya putuskan.

Baca dulu:
- memori proyek (MEMORY.md, terutama lakar-g0-status, g0-build-delegated-checkpoints, vps-shared-no-side-effects, pendev-live-canvas-rules);
- epic `_bmad-output/initiative-lakar/tickets/epic-g1-inti-lengkap/epic-g1-inti-lengkap.md`, termasuk Decision 2026-11-19 tentang masukan dari G0;
- `_bmad-output/initiative-lakar/initiative-lakar.md`;
- spine arsitektur `_bmad-output/initiative-lakar/architecture-lakar-core/architecture-lakar-core.md` (AD-8, AD-10, AD-12, AD-15);
- `_bmad-output/initiative-lakar/ux-lakar/DESIGN.md` Lampiran A dan `golden-set.md`;
- `bench/README.md` dan `bench/round-2.md`.

Status awal:
- G0 lolos dan selesai. Story 1–24 berstatus `built`, round-2 A Setara / B Setara, dan seri polish iterasi 3 lulus. Branch `g0` sudah di-merge ke main.
- Sudah ada dari G0: skill core/polish/landing/mobile/webapp; layout_check dengan LC-01–05, 11, 12, 18, 20, 23–31 (lihat Lampiran A); foto Unsplash → Wikimedia → Openverse; juri rubrik v2.2.
- Batas paket pen.dev periode tagihan ini SUDAH TERCAPAI pada 2026-11-19. Run pen.dev baru (baseline C/D/E median 3 run, putaran A–E) baru bisa jalan setelah periode tagihan baru atau upgrade paket. Cek dulu lewat MCP pencil (get_app_state) sebelum menjadwalkan run pen.dev. Kalau masih terblokir, kerjakan dulu bagian yang tidak butuh pen.dev, lalu laporkan.

Tugas:
1. Epic G1 masih `refined: false` dan belum punya tiket. Pecah epic menjadi story lewat bmad-agent-po (Sofia): tickets.toml + story file, dengan urutan `after`, `plan_checkpoint`/`done_checkpoint`/`hitl`, dan risiko. Tunjukkan daftar story ke saya untuk disetujui sebelum build. Cakupan minimal menurut epic dan catatan G0:
   a. Aturan Lampiran A yang belum diterapkan: LC-03, 06–10, 13–17, 19, 21, 22. Masing-masing perlu fixture positif dan negatif, dan aturan error tidak boleh memberi positif palsu pada arsip dokumen bench (pola story 1.23/1.24).
   b. Kelima desain target golden set dibangun ulang di Lakar dan lolos 0 error, LC-17/18/19 = 0.
   c. Rubrik v2.3: kriteria golden B1 (lebar 390, tinggi ≥ 844) dan D2 (pola dua board diganti satu board panjang) diubah bersamaan, lalu rubric-snapshot. Catat versi dan sha. Ini harus selesai sebelum putaran resmi berikutnya. Rubrik v2.2 tetap sah sampai saat itu.
   d. Sisa ketidaksesuaian DESIGN.md: ambang kontras (18,66px/600 vs kode 19px/700; stroke kontrol, ikon, dan scrim teks di atas foto belum dicek) dan lebar sidebar webapp (240 vs 248).
   e. Pemadatan skill sebelum revisi skill apa pun. landing.md prosa 1500/1500 dan core.md 3967/4000. Batas token tidak dinaikkan, dan hasil pemadatan dibuktikan lewat run latihan.
   f. Baseline pen.dev C, D, E (median 3 run, runner G0) dan putaran resmi A–E. Keputusan G1 menurut epic: ≥ 4/5 Setara atau lebih baik dan ≥ 1 Lebih baik. Prompt D harus menghasilkan foto relevan.
   g. Rilis berjalan di service lakard di VPS.
2. Setelah saya menyetujui daftar story, bangun berurutan dengan bmad-build-auto, satu subagent per story. Keputusan plan_checkpoint dan done_checkpoint saya serahkan ke orkestrator. Berhenti untuk C9, status blocked, bagian hitl, dan konfirmasi putaran resmi. Bagian Konfirmasi Adam diisi dari jawaban saya, bukan oleh agen.
3. Anggaran: tidak kaku. Pakai seperlunya untuk hasil maksimal, tetapi jangan terlalu longgar. Tetapkan batas yang masuk akal di setiap plan (iterasi dan $), lalu catat biaya kumulatif.
4. Laporan ke saya per tonggak:
   - tabel per prompt (skor T/D, keputusan, waktu, biaya);
   - path PNG kedua alat, dengan penilaian visual jujurmu dari PNG yang kamu buka sendiri;
   - follow-up.

Syarat tetap:
- C9: tidak berdampak ke aplikasi lain di VPS. /usr/bin/node tetap v22, dan Node 26 hanya lewat /opt/node-26. Tanpa npx, paket global, perubahan PATH/profil, port baru, atau container lain. Jalankan tools/node26/verify.sh di akhir setiap story. Restart lakard dengan `systemctl --user restart lakard`.
- C7: rubrik, kriteria juri/golden, prompt A–E, dan prompt latihan tidak boleh masuk skill. Perbaikan skill setelah membaca Lampiran B dilakukan oleh sesi baru.
- C8: satu run per alat per prompt per iterasi, tanpa memilih run terbaik.
- Waktu benchmark diukur sesuai AD-13.
- pen.dev:
  - hanya lewat MCP pencil (pen-newdoc.sh + get_app_state);
  - jangan timpa .pen yang sudah ada, dan jangan buka ~/.pencil/session-desktop.json;
  - restart pen-desktop setelah setiap seri;
  - jangan mengakali batas paket.
  Penpot tidak dipakai.
- Unsplash:
  - key ada di ~/.config/lakar/unsplash-access-key, jangan pernah ditampilkan, dicatat, atau di-commit;
  - utm_source = lakar_design_agent_internal (sudah diatur di ~/.config/lakar/config.toml);
  - kuota demo 50 req/jam;
  - risiko kepatuhan cache render tercatat di AD-10.
- Secret baru hanya lewat request_secret (delivery: file) dan disimpan di ~/.config/lakar dengan mode 600.
- RAM VPS terbatas, jadi lepaskan resource yang tidak dipakai.
- Sebelum kode UI HTML/React/Tailwind, jalankan /baseline-ui.
- Jawab dalam Bahasa Indonesia.
