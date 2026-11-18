---
title: 'Refactor sweep putaran perbaikan (sebelum putaran resmi 2)'
type: refactor
ticket: '20'
created: '2026-11-18'
status: built
baseline_revision: 'cacfc296d6d5de4af58df0adb66d667acb7bc8d6'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/initiative-lakar/plan-1-19-arsip-run-terhenti-dan-lc20-tab-bar-mengambang.md'
warnings: [multiple-goals, oversized]
deferred:
  - summary: >-
      Optimasi screenshot board ber-grain (butir 6) tidak dikerjakan; screenshot PNG board efek ±516 ms vs polos 84 ms.
    evidence: |-
      Biaya ada di encode PNG piksel berentropi tinggi, bukan di rasterisasi ubin noise (JPEG q90 board yang sama 57–63 ms
      vs PNG 514–519 ms). Rasterisasi ubin ke PNG tidak mengubah piksel keluaran; mengubah piksel melanggar golden
      efek-noise-seed. Dampak waktu end-to-end kecil (rasio 0,86–1,10× di seri efek).
    location: >-
      packages/render/src/effects.ts (noiseTileUrl), packages/daemon screenshot/encode PNG
    severity: low
  - summary: >-
      Belum terbukti bahwa decode bitmap efek lewat Image terpisah membuat lapisan background-image board sudah ter-decode saat ukur/screenshot.
    evidence: |-
      decodeDataUrls men-decode objek Image terpisah ber-URL sama; reuse decode oleh lapisan CSS diasumsikan (cache gambar
      Chromium per URL), tes hanya memeriksa decoded 3. Belum pernah terlihat gagal (render ganda byte-identik, PNG bench benar).
      Yang menuntaskan: tes halaman dingin dengan board besar banyak fill efek, screenshot langsung sesudah renderBoard dan
      bandingkan dengan render hangat.
    location: >-
      packages/render/src/index.ts renderBoard, packages/render/src/assets.ts decodeDataUrls
    severity: medium (unverified)
  - summary: >-
      Prinsip skill "daftar layar pertama ≥ 3 butir utuh" tidak dipatuhi agen di P2 iterasi 8 (deferred 1.19) — perilaku agen, butuh iterasi skill.
    evidence: |-
      Perubahan skill di sweep ini dibatasi butir 2 dan 6 (keputusan Adam); pengukuran hanya lewat putaran 2 (story 21).
    location: >-
      packages/skills/skills/mobile.md
    severity: medium
  - summary: >-
      Dampak skill efek (v9) dan pemadatan core/mobile pada prompt non-efek belum diukur (deferred 1.22: P5 turun lalu naik, pemadatan, kebocoran efek).
    evidence: |-
      Sweep hanya menambah komentar gating pada contoh efek; tidak ada run P1–P4. Yang menuntaskan: putaran 2 (story 21),
      hitung bidang efek per board pada A/B.
    location: >-
      packages/skills/skills/core.md, landing.md, mobile.md
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Story 1.21 (putaran resmi 2) membekukan kode, tetapi plan 1.17–1.19, 1.22 dan plan perbaikan lanjutan masih meninggalkan temuan tunda yang memengaruhi hasil putaran. Pertama, LC-20 meloloskan konten yang mengintip di celah antara dua bar bawah bertumpuk (P2 iterasi 8). Kedua, anak frame `layout:'none'` dengan x/y tanpa `position` ditolak sehingga agen memboroskan execute. Ketiga, agen melampaui batas execute skill tanpa pengingat. Keempat, pen.dev menahan RAM sesudah seri bench. Kelima, `round --resume` belum dites dengan hasil juri rubrik lama. Keenam, bitmap efek tidak di-decode sebelum screenshot, dan contoh efek di skill bisa bocor ke prompt non-efek.

**Approach:** Ada tujuh butir wajib dari keputusan Adam (carry-notes orkestrator):
1. Sub-cek LC-20 baru untuk celah antar-bar bertumpuk.
2. Normalisasi `position:'absolute'` di core untuk anak frame `layout:'none'` yang membawa x/y.
3. Pengingat jumlah execute sesi di output MCP `execute`.
4. Restart pen-desktop sekali sesudah seri pen.dev pada seri `practice` dan `round`, dengan probe yang dibatasi waktu.
5. Tes `round --resume` dengan hasil juri rubrik lama, beserta penolakan dini bila teks juri berubah.
6. Decode bitmap efek sebelum ukur/screenshot, optimasi screenshot grain bila mudah, dan komentar gating di contoh efek skill.
7. Follow-up arsitektur dicatat di plan ini saja.

Setiap butir yang tidak bisa diselesaikan dicatat di `deferred` beserta alasannya.

## Boundaries & Constraints

**Always:**
- Node selalu lewat `/opt/node-26/bin` (path absolut). Tes dijalankan sekuensial karena RAM terbatas.
- Kontrak `{ok, data|error}` dan enum kode error AD-11 tidak berubah.
- Severity LC-20 tetap `error` gerbang. Semua fixture dan tes LC-20 lama tetap lulus tanpa ekspektasinya diubah.
- Contoh skill tetap 0 error/0 gerbang/0 warning. Batas token skill (`tests/skills.test.ts`: core 4000, landing/mobile prosa 1500 dan total 3500) tetap lulus. Tes C7 (`tests/skills-c7.test.ts`, `bench/src/judge/judge.test.ts` (c)) tetap lulus.
- `api.md` diregenerasi dari `api.ts` lewat `scripts/gen-skill-api.mjs`.
- Render tetap browser-murni (AD-6, `browser-pure.test.ts`). Golden render lama lulus dengan toleransi yang ada.
- Teks pesan tanpa istilah rubrik/juri/skor/golden.
- Setelah build: `systemctl --user restart lakard` → active. `bash tools/node26/verify.sh` exit 0.

**Never:**
- Jangan ubah `bench/protocol/*` (protocolHash `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d`), `bench/rubric/*`, teks juri v2.1 (`bench/src/judge/prompt.ts` keluaran dan sha), `bench/practice/prompts*.json`, argv/env claude, atau `.mcp.json`.
- Jangan ubah DESIGN.md atau dokumen arsitektur (spine). Folder di `.git/info/exclude` tidak disentuh.
- Perubahan skill hanya untuk butir 2 (teks x/y di api.ts → api.md) dan 6 (gating contoh efek). Jangan ubah aturan atau prosa lain.
- Jangan memblokir execute karena jumlahnya (pengingat saja).
- Tanpa apt, npm global, port, Docker, service baru, atau konfigurasi Claude global.
- Jangan menjalankan `systemctl restart pen-desktop` saat ada run pen.dev aktif atau di tengah seri. Restart nyata tidak wajib di story ini (unit test cukup).
- Tanpa run `claude -p` berbayar, kecuali satu `scripts/tracer-e2e.sh` (~$0,2) sebagai regresi.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| L1 celah antar-bar, butir mengintip | 390×844. `Overlay / Mini player` y674–738 dan `Overlay / Tab bar` y746–810 (celah 8). Kartu/baris daftar sebelumnya y700–780 di bawah keduanya. | 1 LC-20 pada unit itu: "terlihat di celah di antara bar zona bawah … (y 738–746)". | — |
| L2 celah antar-bar bersih | Sama, tetapi konten berakhir ≤ y674−8, atau celah ditutup node ber-fill (mis. panel latar di belakang kedua bar, atau anggota zona yang menutupnya). | Tanpa temuan. | — |
| L3 bar menempel | Mini player y674–746 dan tab bar y746–810 (celah 0). | Sub-cek baru tidak memicu. | — |
| L4 unit utuh di dalam celah | Unit setinggi ≤ celah, seluruhnya di dalam celah. | Tidak dilaporkan, konsisten dengan sub-cek 4. | — |
| X1 add x/y di frame none | `add(fr /*layout none*/, {type:'rect', x:10, y:20, width:4, height:4})` | Sukses. Node tersimpan dengan `position:'absolute', x:10, y:20`. | — |
| X2 update x/y di frame none | `update(childOfNone, {x:5})` tanpa `position` | Sukses, `position:'absolute'` ditambahkan. | — |
| X3 x/y di parent flow | `add(rowFrame, {type:'rect', x:1, …})`, `add(board, {…x…})`, `update` serupa | Tetap `SCHEMA_INVALID` + `XY_HINT`. | tidak berubah |
| X4 frame layout default | Frame tanpa `layout` (default none) | Sama seperti X1. | — |
| E1 execute ke-1/2 | Output MCP execute sukses | Baris `execute ke-N di sesi ini` tanpa saran. | — |
| E2 execute ke-≥3 | Sukses atau error | Baris pengingat: batas skill mobile/app 3, landing 4 (termasuk perbaikan), dan saran menyelesaikan sisa dalam satu execute lalu screenshot/export. | Pemanggilan tidak diblokir. |
| P1 seri practice selesai | `practice --iter k` menjalankan ≥ 1 run pen.dev | Satu restart sesudah run pen.dev terakhir, sebelum juri. Hasil (ok, dtk, detail) tercatat di laporan. | Gagal: catatan, juri tetap jalan. |
| P2 round selesai | `round --round r`: ≥ 1 run pen.dev di pemanggilan ini | Sama: satu restart sesudah loop run, sebelum strip/juri. Tercatat di `round-<r>.md/json` (juga uji-k). | idem |
| P3 reuse / dry-run / tanpa run pen.dev | `--reuse-pendev`, `--dry-run`, atau semua run pen.dev dipakai ulang | Tanpa restart. Alasan dicatat (dry-run: rencana dicetak). | — |
| P4 probe MCP menggantung | Probe tidak pernah resolve | Selesai ≤ batas 120 dtk (+ toleransi satu interval) dengan `ok:false`. | tidak throw |
| R1 round --resume, rubrik lama | `runs/rounds/<r>/judge/<P>/judge-text.md` berbeda dari teks juri saat ini | Ditolak sebelum run/spawn mana pun (exit 1). Pesan menyebut file dan menyarankan putaran baru atau `rejudge --from <r> --label`. Dry-run mencetak masalahnya. | Abort |
| R2 round --resume, teks sama, rep tanpa R9/R10 | `rep.json` ok tanpa kriteria R9/R10 | Ulangan itu dijalankan ulang (claude palsu: spawn +1). Rep lengkap dipakai ulang. | — |

</intent-contract>

## Code Map

- `packages/check/src/rules.ts:195-564` -- `bottomZone` (anggota diurutkan menurut y), `covering`, dan `lc20` dengan `walk` (urutan: `cut` → `gap` → `orphan`). Sub-cek 4 `gap` (l.463) hanya menilai strip di bawah `floor` (anggota terbawah); celah di antara anggota tidak pernah dinilai. Pakai ulang `unitKind`, `unitVisible`, `rawBottomOf`, `PEEK_MIN`, `TOLERANCE`, dan perpanjangan penutup ber-fill dengan z-order sesudah unit. Helper ada di `packages/check/src/tree.ts` (`visibleRect`, `intersect`, `isFlowChild`).
- `packages/check/src/index.test.ts` -- blok `LC-20` dan fixture (a)–(f), B1–B4. Tambahkan L1–L4 dengan pembangun yang sama.
- Bukti dokumen: `bench/runs/practice/8/P2-lakar/doc/siaru-beranda.lakar.json`, board `zsVQi7E1` (Mini player y674–738, Tab bar y746–810, irisan "Kopi Pagi · Hari ini"); PNG di `bench/runs/practice/8/P2-lakar/png/zsVQi7E1.png`. Skrip arsip (scratchpad, di luar repo): `SCRATCH=/tmp/claude-0/-root-lakar/ff3247e7-b8d6-48ae-acb4-dd6a2a7ac61e/scratchpad /opt/node-26/bin/node /tmp/claude-0/-root-lakar/ff3247e7-b8d6-48ae-acb4-dd6a2a7ac61e/scratchpad/archcheck.mjs <file.lakar.json…>`. Skrip ini memakai `packages/daemon/dist` (build dulu); `tree.mjs <file> <boardId> <depth>` ada di dir yang sama. Untuk perbandingan sebelum/sesudah, jalankan dulu dengan dist baseline.
- `packages/core/src/transaction.ts:186-312` -- `add` (`parseInput` sebelum parent dicari), `update`/`duplicate` (`mergePatch`), dan `replace`. Normalisasi raw/patch sebelum validasi bila parent adalah frame dengan `(layout ?? 'none') === 'none'`, raw/patch berupa objek polos tanpa kunci `position`, dan x atau y bukan undefined/null: tambahkan `position:'absolute'`. Untuk `add`, cari parent tanpa throw (pakai `locate`) supaya urutan error lama tetap terjaga. Untuk `update`/`replace`, parent = `loc.parent`; untuk `duplicate`, parent sama dengan node asal. Board tetap di luar normalisasi. `packages/schema/src/nodes.ts:23,321-326` (`XY_HINT`, `xyOnlyWhenAbsolute`) tidak berubah. Tes: `packages/core/src/transaction.test.ts`.
- `packages/exec/src/api.ts:648` -- teks `position:'absolute'` (sumber `api.md:244`). Ganti frasa menjadi: x/y tanpa position di parent flow → SCHEMA_INVALID; anak frame `layout:'none'` selalu absolut, x/y diterima dan `position:'absolute'` ditambahkan otomatis. Regenerasi dengan `/opt/node-26/bin/node scripts/gen-skill-api.mjs`. Bila `tests/execute-description.test.ts`/snapshot memuat frasa ini, sesuaikan.
- `packages/mcp/src/server.ts:45-51,286-309` -- `formatExecute` dan tool `execute` (`guarded`/`asText`). Tambahkan penghitung per instance server (closure `createServer`/registrasi) untuk setiap pemanggilan tool execute (sukses maupun error). Baris pengingat ditambahkan di akhir teks sukses, dan di akhir teks error bila N ≥ 3. Deskripsi tool tidak wajib berubah. Tes: `packages/mcp/src/index.test.ts`.
- `bench/src/sys.ts:35-92` -- `restartPenDesktopAfterSeries`. Batasi `probe` dengan sisa batas waktu (Promise.race + timer yang di-`unref`/clear). Perbarui komentar header (dipakai seri practice, efek, dan round).
- `bench/src/practice/main.ts:96-137,819-839` -- `PRACTICE_SERIES.restartPenDesktop` → `true`. Tes "config default identik dengan perilaku lama" di `practice.test.ts:289` disesuaikan secara eksplisit hanya untuk flag ini.
- `bench/src/round/main.ts:612-660` (loop run) dan `:662` (strip + juri) -- sisipkan restart sesudah loop bila run pen.dev dijalankan di pemanggilan ini (hitung seperti `pendevRan` di practice) dan bukan dry-run. Probe: `PencilClient.connect(pre.server)` → `appState()` → `close()` (pola practice l.826-833). Tulis `pen-desktop-restart.json` di dir putaran. Bila tidak ada run pen.dev, baca file itu atau pakai alasan. Tambahkan field ke data laporan dan satu baris di `bench/src/round/report.ts` (section versi/catatan; contoh pola `lakardActiveAfter` l.279). Perbarui snapshot `round/__snapshots__` bila berubah. Cetak rencana restart di bagian dry-run.
- `bench/src/round/main.ts:366-440` -- `writeJudgeTextExclusive` dan `judgePrompt` (logika `coversCriteria` sudah ada). Ekspor predikat reuse round (`old.status !== 'invalid'`) sebagai konstanta bernama, lalu pakai di pemanggilan. Tambahkan fungsi murni `staleJudgeTexts(roundDir, judgeTexts)` → daftar `judge/<P>/judge-text.md` yang berbeda. Panggil di `roundMain` sesudah teks juri disiapkan: cetak saat dry-run, lalu `Abort` (exit 1) sebelum arsip/restart/run. Pola pesan ada di `bench/src/rejudge.ts:345-352`.
- `bench/src/round/round.test.ts` (atau `bench/src/rejudge.test.ts`, yang punya pola claude palsu `FAKE` + `SPAWNS`) -- tes R1 (fungsi murni, dir tmp) dan R2 (`judgePrompt` dengan predikat round, rep lama tanpa R9/R10 → spawn +1, rep lengkap tidak di-spawn).
- `packages/render/src/index.ts:79-129` + `packages/render/src/assets.ts` -- sesudah `mountBoardNode`, kumpulkan URL `data:` unik dari `background-image` elemen board dan turunannya (mesh PNG, ubin SVG noise), lalu `decode()` (gagal decode → abaikan, jangan NOT_FOUND). Pegang referensi sampai ukur, sebelum 2 rAF. `packages/render/src/effects.ts` -- `noiseTileUrl` (SVG feTurbulence) dan `meshDataUrl`.
- `packages/render/test/visual.test.ts` -- tes latensi efek (selisih render, screenshot 84 → 514 ms di 1.22). Ukur screenshot board ber-grain sebelum dan sesudah. Optimasi (mis. ubin noise dirasterisasi sekali ke PNG via canvas, di-cache per parameter) hanya bila golden `efek-noise-seed` dan render byte-identik tetap lulus tanpa `LAKAR_UPDATE_GOLDEN`. Bila tidak, catat angkanya dan masukkan ke `deferred`.
- `packages/skills/skills/landing.md:46-47` dan `packages/skills/skills/mobile.md:52-54` -- ganti komentar contoh efek dengan komentar gating yang setara panjangnya. Isinya: blok bidang efek (mesh/noise/`Crop / Kontur`) hanya bila permintaan/merek meminta suasana ekspresif atau layarnya hero/onboarding/sampul yang pantas; selain itu cukup `fill(C.field)` polos. Kode contoh tidak diubah. Ukur token sesudahnya.
- Verifikasi bench: `node bench/dist/cli.js round --round uji-9 --dry-run` dan `practice --iter 8 --dry-run` untuk protocolHash, sha teks juri = `rubric.json`, dan rencana restart.

## Tasks & Acceptance

**Execution:**
- [x] `packages/check/src/rules.ts` -- sub-cek 5 "celah antar-bar" (lihat Design Notes) di `walk` sesudah `gap` -- butir 1.
- [x] `packages/check/src/index.test.ts` -- fixture L1–L4 -- butir 1.
- [x] `packages/check/README.md`, `packages/mcp/src/server.ts` (deskripsi `layout_check`/LC-20 bila menyebut celah) -- tambah satu frasa -- konsistensi.
- [x] `packages/core/src/transaction.ts` + `transaction.test.ts` -- normalisasi X1–X4 -- butir 2.
- [x] `packages/exec/src/api.ts` → regenerasi `packages/skills/skills/api.md` -- butir 2.
- [x] `packages/mcp/src/server.ts` + `index.test.ts` -- penghitung dan pengingat E1/E2 -- butir 3.
- [x] `bench/src/sys.ts`, `bench/src/practice/main.ts`, `bench/src/round/main.ts`, `bench/src/round/report.ts` + tes (`practice.test.ts`, `round.test.ts`, snapshot) -- P1–P4 -- butir 4.
- [x] `bench/src/round/main.ts` + tes -- R1/R2 -- butir 5.
- [x] `packages/render/src/index.ts` (+ `assets.ts`/`effects.ts`) + `packages/render/test/visual.test.ts` -- decode bitmap efek, ukur dan optimasi grain bila mudah -- butir 6.
- [x] `packages/skills/skills/landing.md`, `mobile.md` -- komentar gating -- butir 6.
- [x] Plan ini (`## Implementation Notes`) -- catat follow-up arsitektur butir 7, angka ukur grain, bukti archcheck, dan deferred.

**Acceptance Criteria:**
- Given dokumen `bench/runs/practice/8/P2-lakar/doc/siaru-beranda.lakar.json`, when archcheck dijalankan sesudah build, then board `zsVQi7E1` mendapat LC-20 untuk unit yang mengintip di celah y738–746, dan temuan itu diverifikasi pada PNG-nya.
- Given semua dokumen latihan `bench/runs/practice/{5,6,7,8}/P*-lakar/doc/*.lakar.json` dan `bench/runs/practice-effects/*/P*-lakar/doc/*.lakar.json`, when archcheck sebelum vs sesudah dijalankan, then setiap temuan baru tercatat di Implementation Notes dan merupakan cacat nyata di PNG-nya. Positif palsu diperbaiki sebelum selesai.
- Given sesi Claude Code nyata (`scripts/tracer-e2e.sh`), when tracer berjalan, then lulus seperti sebelumnya.
- Given `pnpm build` dan `pnpm test`, when dijalankan, then semua lulus (jumlah tes dicatat). Contoh skill 0 temuan, batas token lulus, dan C7 lulus.
- Given `round --round uji-9 --dry-run` dan `practice --iter 8 --dry-run`, when dijalankan, then protocolHash `907cb36f…edb85d`, sha teks juri sama dengan `bench/rubric/rubric.json`, dan rencana restart pen-desktop tercetak untuk keduanya.
- Given commit akhir, when `git status --porcelain` diperiksa, then kosong untuk kode produk dan harness. `git diff <baseline> -- bench/protocol bench/rubric bench/practice/prompts*.json` kosong.

## Implementation Notes

- Baseline archcheck (dist di cacfc29, sebelum perubahan) sudah dijalankan orkestrator: `/tmp/claude-0/-root-lakar/ff3247e7-b8d6-48ae-acb4-dd6a2a7ac61e/scratchpad/sweep20-before.txt` (20 dokumen; 3 temuan: 6/P2 judul yatim, 6/P3 kartu Ulasan Sekar, 7/P2 Eps. 113). Bandingkan output sesudah build dengan file ini.

- **Butir 1 (LC-20 sub-cek 5 `between`):** di `walk` sesudah `gap`. Anggota `cov` diurutkan menurut y; lubang = antara bawah gabungan anggota atas (anggota dengan bawah terbesar sejauh ini) dan `y` anggota berikut (> TOLERANCE). Irisan x kedua pengapit. Lubang dirapatkan dari atas dan bawah oleh node ber-fill/blur sesudah unit (z-order, bukan keturunan unit) selebar irisan x. Lapor bila `peek.height ≥ PEEK_MIN` dan unit meluas ke luar lubang. Fixture L1–L4 (L2: konten berakhir ≤ zona − 8, panel latar di belakang kedua bar, anggota zona `Pemisah` yang menutup celah); L1 dibuktikan gagal tanpa sub-cek. Fixture (a)–(f), B1–B4 tidak diubah. Deskripsi `layout_check` (`server.ts`) dan `packages/check/README.md` + satu frasa.
- **Archcheck sesudah build** (`sweep20-after.txt` di scratchpad, dibanding `sweep20-before.txt`): satu-satunya perubahan = `practice/8/P2-lakar/siaru-beranda` board `zsVQi7E1` (gate 0 → 3): `Sampul / Kopi Pagi` (U9edV8h4) kartu y 738–746, teks `Show` "Kopi Pagi · Hari ini" (WF6pQtba) y 738–744, `IconButton / Terunduh` (mi6MVnQX) kartu y 738–746, semuanya "terlihat di celah di antara bar zona bawah "Overlay / Mini player" dan "Overlay / Tab bar"". Diverifikasi di `png/zsVQi7E1.png`: sampul teal, teks "Kopi Pagi · Hari ini", dan lingkaran hijau ikon unduh terlihat di celah 8 px antara mini player dan tab bar. Tiga temuan karena baris induknya bukan unit (transparan); ketiganya cacat nyata. Dokumen 5–7 dan practice-effects 1–3: temuan identik dengan sebelum (6/P2 judul yatim, 6/P3 Ulasan Sekar, 7/P2 Eps. 113). Tanpa positif palsu.
- **Butir 2 (normalisasi x/y):** `implicitAbsolute(parent, raw)` di `transaction.ts`: parent frame dengan `(layout ?? 'none') === 'none'`, raw objek polos tanpa kunci `position`, bukan `type:'board'`, x atau y bukan undefined/null → `{...raw, position:'absolute'}`. `add` mencari parent dengan `locate` (tanpa throw) sebelum `parseInput`; urutan error lama terjaga (skema salah ke parent tak ada → SCHEMA_INVALID; parent tak ada → NOT_FOUND). `update`/`replace`/`duplicate` memakai `loc.parent`. Board dan parent flow tidak dinormalisasi (X3 tetap XY_HINT). `api.ts` → `api.md` diregenerasi (stabil pada dua kali jalan; hanya frasa x/y berubah).
- **Butir 3 (pengingat execute):** penghitung per instance `createLakarMcpServer` (= satu sesi agen), dinaikkan di awal setiap pemanggilan tool `execute`. `withExecuteCount`: sukses selalu + baris `execute ke-N di sesi ini`; N ≥ 3 + pengingat `· batas skill: mobile/app 3, landing 4 (termasuk perbaikan) — selesaikan sisa dalam satu execute, lalu screenshot/export`; error hanya bila N ≥ 3. Tidak pernah memblokir. Tracer nyata menampilkan `execute ke-1 di sesi ini`.
- **Sesudah review:** teks pengingat execute diganti dan menggantikan contoh di Design Notes: N = 3 → `execute ke-3 di sesi ini · batas skill tercapai untuk mobile/app (3, termasuk perbaikan); landing maks 4 — lanjut screenshot/export`; N ≥ 4 → `execute ke-N di sesi ini · melewati batas skill (mobile/app 3, landing 4, termasuk perbaikan) — hentikan perbaikan kecil, lanjut screenshot/export`. Sub-cek 5 juga menangani kedua bar di dalam pembungkus `Overlay /` transparan: kandidat zona di dalam anggota transparan ikut menjadi anggota (tepi atas zona tetap), dan pembungkus transparan yang memuat anggota lain diabaikan saat menghitung lubang (fixture L1′; archcheck 5–8 + efek identik). Komentar `mobile.md` diubah menjadi peragaan bersyarat (mobile 3179 token, prosa 1500).
- **Butir 4 (restart pen-desktop):** `restartPenDesktopAfterSeries` membatasi probe dengan sisa batas waktu (`withTimeout`, timer di-`unref` dan di-clear); tes P4 probe menggantung → `ok:false` ≤ batas + satu interval. `PRACTICE_SERIES.restartPenDesktop = true` (tes config default diubah eksplisit hanya untuk flag ini). `round`: `pendevRan` dihitung di loop run; bila > 0 restart sesudah loop sebelum strip/juri, hasil ke `<roundDir>/pen-desktop-restart.json`; selain itu dibaca dari file itu atau alasan "tidak ada run pen.dev di pemanggilan ini". Field opsional `penDesktopRestart` di `RoundReport` + satu baris di bagian penjaga .pen (`round-<r>.md/json`, juga uji-k); snapshot tidak berubah (field tak ada → baris tak dicetak). Rencana restart tercetak di dry-run `round` dan `practice`.
- **Butir 5 (round --resume rubrik lama):** `ROUND_JUDGE_REUSE` (predikat `status !== 'invalid'`) dipakai `roundMain`; `staleJudgeTexts(roundDir, judgeTexts)` murni. Dipanggil sesudah teks juri disiapkan: dry-run mencetak `MASALAH: …`; non-dry-run `Abort` (exit 1) sebelum arsip/restart lakard/run, pesan menyebut file dan menyarankan putaran baru atau `rejudge --from <r> --label <label>`. Tes R1 (fungsi murni) dan R2 (`judgePrompt` + claude palsu: rep ok tanpa R9/R10 → spawn +1, rep lengkap dipakai ulang).
- **Butir 6 (bitmap efek):** `inlineDataUrls(el)` (URL `data:` unik di `background-image` inline board + turunan) dan `decodeDataUrls` (gagal decode diabaikan) di `assets.ts`; `renderBoard` men-decode sesudah mount, sebelum `fonts.ready` + 2 rAF, referensi dipegang sampai ukur. Tes visual baru (1 mesh PNG + 2 ubin noise SVG terkumpul dan ter-decode; data URL rusak diabaikan). Golden lama dan determinisme byte-identik lulus tanpa `LAKAR_UPDATE_GOLDEN`.
- **Angka latensi grain** (tes latensi 1440×900 mesh 5×4 + noise, median 5): sebelum render polos 62.9 / efek 65.9 ms (selisih 3.0), screenshot PNG polos 84 / efek 516 ms. Sesudah decode: render 63.6/82.1 dan 62.8/82.9 ms (selisih 18.5–20.1, batas 150), screenshot PNG 84–85 / 515–518 ms. Pembanding JPEG q90 board efek 57–63 ms → biaya screenshot = encode PNG berentropi tinggi; optimasi ubin noise tidak menolong (deferred).
- **Gating contoh efek skill:** `landing.md` komentar hero → gating (≤ batas: landing total tetap 3500/3500 token, komentar kontur dipendekkan agar muat); `mobile.md` dua baris komentar efek → tiga baris gating + resep onboarding/sampul gelap dipertahankan (mobile total 3150 → 3177, prosa 1500 tidak berubah karena komentar di blok kode). Kode contoh tidak diubah; contoh skill 0 temuan; C7 lulus.
- **Follow-up arsitektur (butir 7; spine tidak diedit):** AD-15 katalog `fills[]` + conic/noise/mesh, schemaVersion 2 + migrasi 1→2; AD-10/§Deferred `photo_search` + penyedia foto (Wikimedia utama, Openverse cadangan, Pexels tanpa key); LC-20 struktural (zona bawah, bar mengambang, celah antar-bar, judul yatim); normalisasi x/y anak frame `layout:'none'`. Tawarkan `bmad-architecture`.
- **Verifikasi:** `pnpm build` exit 0; `pnpm test` 49 file / 863 tes lulus; `gen-skill-api.mjs` dua kali stabil; dry-run `round --round uji-9` dan `practice --iter 8` exit 0, protocolHash `907cb36f…edb85d`, sha teks juri A/B = `rubric.json` ("sama"), practice Lampiran B = snapshot, rencana restart pen-desktop tercetak di keduanya; `systemctl --user restart lakard` → active; `scripts/tracer-e2e.sh` LULUS ($0,21); `tools/node26/verify.sh` exit 0; `git diff cacfc29 -- bench/protocol bench/rubric bench/practice/prompts*.json` kosong. Belum di-commit.
- **Verify (orkestrator):** keputusan restart sesudah seri diekstrak ke `penDesktopRestartStep` (`bench/src/sys.ts`; dipakai practice dan round, perilaku sama) agar baris matriks P1–P3 teruji (`practice.test.ts` "langkah restart pen-desktop…"); `readStoredRestart` round dihapus.

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 7 findings — high 0, medium 3, low 3, false 0, maybe-false 1
- findings:
  - `[medium]` `[patch]` mobile.md: komentar gating bertentangan dengan contoh di bawahnya (efek di kartu beranda biasa) — komentar diubah jadi "peragaan bersyarat: hanya bila permintaan/merek minta suasana ekspresif (atau onboarding/sampul); tanpa itu kartu cukup fill(C.field) polos"; kode tetap, token mobile 3179/3500, prosa 1500.
  - `[low]` `[reject]` landing.md: komentar Kontur dipendekkan di luar komentar gating — perlu agar landing tetap ≤ 3500 token (Always); makna komentar sama, tidak ada aturan/prosa yang berubah.
  - `[medium]` `[patch]` rules.ts `between`: `Overlay /` transparan pembungkus kedua bar menyembunyikan celah — bottomZone kini memasukkan kandidat di dalam anggota tak ber-fill sebagai anggota, dan `between` mengabaikan anggota tak ber-fill yang memuat anggota lain; fixture L1′ (1 temuan); archcheck 5–8 + efek 1–3 identik.
  - `[maybe-false]` `[defer]` decode Image terpisah belum terbukti dipakai lapisan background board — perlu tes halaman dingin board besar; dicatat di deferred (medium unverified).
  - `[low]` `[reject]` withTimeout tidak membatalkan probe; klien pencil yatim bisa hidup ±2–3 menit bila probe menggantung — sangat jarang (restart nyata 16,9 dtk), proses berakhir sendiri lewat timeout callTool; perbaikan butuh AbortSignal di PencilClient (parameter baru).
  - `[low]` `[patch]` practice/main.ts: komentar masih "seri efek" — diperbarui ke seri practice dan efek.
  - `[medium]` `[patch]` server.ts executeCountLine: pada N = 3 "selesaikan sisa dalam satu execute" mengundang execute ke-4 di mobile — teks N = 3 "batas skill tercapai untuk mobile/app …; landing maks 4 — lanjut screenshot/export", N ≥ 4 "melewati batas skill … hentikan perbaikan kecil"; tes diperbarui (menggantikan contoh Design Notes, dicatat di Implementation Notes).

## Design Notes

**Sub-cek 5 (celah antar-bar):**
- Untuk unit yang tidak dikecualikan dengan `cov = covering(zone, order, vis)`, ambil anggota `cov.members` yang diurutkan menurut y. Lubang = interval y di antara gabungan rentang y anggota, mulai dari `cov.top` sampai `floor`.
- Lubang ditutup oleh node ber-fill/blur yang z-order-nya sesudah unit dan selebar irisan x kedua anggota pengapit (pola penutup sub-cek 4).
- Untuk setiap lubang terbuka setinggi > TOLERANCE, `peek = intersect(vis, {x: irisan x anggota pengapit, y: lubang})`.
- Laporkan bila `peek.height ≥ PEEK_MIN` dan unit meluas ke luar lubang (`vis.y < lubang.atas − TOL` atau `bottom(vis) > lubang.bawah + TOL`), yaitu sebagian tertutup bar.
- Pesan: `kartu terlihat di celah di antara bar zona bawah "A" dan "B" (y 738–746), sebagian tertutup bar`. Expected: `jangan biarkan konten mengintip di celah antar-bar: rapatkan bar (celah 0), beri latar penutup di belakang keduanya, atau akhiri daftar sebelum zona`.

**Normalisasi x/y:** penerimaan dibuat dengan menulis `position:'absolute'` eksplisit, supaya dokumen tersimpan tetap valid terhadap skema per-node yang ada dan render/check tidak berubah. Konsekuensinya, bila layout frame kemudian diubah ke row/column, anak itu tetap absolut. Hal ini didokumentasikan dalam satu frasa di api.ts.

**Pengingat:** contoh baris untuk N ≥ 3: `execute ke-5 di sesi ini · batas skill: mobile/app 3, landing 4 (termasuk perbaikan) — selesaikan sisa dalam satu execute, lalu screenshot/export`. Untuk N < 3: `execute ke-N di sesi ini`.

**Follow-up arsitektur (butir 7, dicatat di sini dan di Auto Run Result, spine tidak diedit):**
- AD-15: katalog `fills[]` + conic/noise/mesh dan schemaVersion 2 + migrasi 1→2.
- AD-10/§Deferred: `photo_search` dan penyedia foto (Wikimedia utama, Openverse cadangan, Pexels tanpa key).
- LC-20 struktural: zona bawah, bar mengambang, celah antar-bar, judul yatim.
- Normalisasi x/y anak frame none (butir 2).

Tawarkan `bmad-architecture`.

## Verification

**Commands:**
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH pnpm build` -- expected: exit 0
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH pnpm test` -- expected: semua lulus (sekuensial; catat jumlah)
- `cd /root/lakar && /opt/node-26/bin/node scripts/gen-skill-api.mjs && git diff --stat packages/skills/skills/api.md` -- expected: hanya frasa x/y berubah; dijalankan dua kali tetap stabil
- `SCRATCH=<scratchpad> /opt/node-26/bin/node <scratchpad>/archcheck.mjs bench/runs/practice/{5,6,7,8}/P*-lakar/doc/*.lakar.json bench/runs/practice-effects/*/P*-lakar/doc/*.lakar.json` -- expected: temuan baru `zsVQi7E1` dan hanya cacat nyata lain
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH node bench/dist/cli.js round --round uji-9 --dry-run; PATH=/opt/node-26/bin:$PATH node bench/dist/cli.js practice --iter 8 --dry-run` -- expected: hash dan sha seperti AC, serta rencana restart
- `systemctl --user restart lakard && systemctl --user is-active lakard` -- expected: active
- `cd /root/lakar && bash scripts/tracer-e2e.sh` -- expected: lulus (sekali, ~$0,2)
- `cd /root/lakar && bash tools/node26/verify.sh` (PATH bawaan) -- expected: exit 0

## Auto Run Result

Status: built

- **Ringkasan:** sweep 7 butir wajib sebelum putaran 2. (1) LC-20 sub-cek 5: konten mengintip di celah antar-bar bawah bertumpuk (termasuk bar di dalam `Overlay /` transparan). (2) core menormalisasi x/y tanpa position pada anak frame `layout:'none'` → `position:'absolute'` (add/update/replace/duplicate); parent flow tetap SCHEMA_INVALID; api.ts/api.md satu frasa. (3) MCP execute menambah baris `execute ke-N di sesi ini`, pengingat batas skill mulai N = 3 (sukses dan error), tidak memblokir. (4) restart pen-desktop sekali sesudah seri pen.dev kini juga di seri practice dan round (`penDesktopRestartStep`, `pen-desktop-restart.json`, baris laporan), probe dibatasi sisa 120 dtk. (5) `round --resume` dengan teks juri tersimpan berbeda → Abort exit 1 sebelum arsip/run (dry-run mencetak MASALAH); tes rep rubrik lama (tanpa R9/R10) dijalankan ulang. (6) bitmap efek (mesh PNG, ubin noise SVG) di-decode sesudah mount sebelum ukur; komentar gating contoh efek landing/mobile; optimasi grain diukur dan di-defer. (7) follow-up arsitektur dicatat di Design Notes/Implementation Notes (AD-15 fills + schemaVersion 2; AD-10 photo_search & penyedia foto; LC-20 struktural; normalisasi x/y) — tawarkan `bmad-architecture`; spine tidak diedit.
- **File:** `packages/check/src/rules.ts` (+ tes, README) LC-20; `packages/core/src/transaction.ts` (+ tes) normalisasi; `packages/exec/src/api.ts` + `packages/skills/skills/api.md` frasa x/y; `packages/mcp/src/server.ts` (+ tes) penghitung execute, deskripsi layout_check; `packages/render/src/{index,assets}.ts` (+ visual.test) decode efek; `packages/skills/skills/{landing,mobile}.md` komentar gating; `bench/src/sys.ts` probe timeout + `penDesktopRestartStep`; `bench/src/practice/main.ts`, `bench/src/round/{main,report}.ts` (+ tes) restart, staleJudgeTexts, ROUND_JUDGE_REUSE.
- **Review (quick):** 7 temuan → 4 patch (3 medium, 1 low), 1 defer (maybe-false decode), 2 ditolak (komentar Kontur dipendekkan demi batas token; probe yatim jarang, perbaikan butuh parameter baru).
- **Follow-up review:** true — 3 medium dipatch; risiko belum terverifikasi: perluasan keanggotaan `bottomZone` (kandidat di dalam anggota tak ber-fill) mengubah zona untuk semua sub-cek LC-20; hanya dicek pada arsip latihan 5–8 + efek 1–3 (identik), belum pada pola pembungkus lain.
- **Verifikasi:** `pnpm build` exit 0; `pnpm test` 49 file / 865 tes lulus (0 skip); gen-skill-api stabil; archcheck practice 5–8 + efek 1–3: satu-satunya perubahan 8/P2 `zsVQi7E1` gate 0 → 3 (sampul "Kopi Pagi", teks "Kopi Pagi · Hari ini", ikon unduh di celah y738–746; dicek di PNG), lainnya identik; dry-run `round --round uji-9` dan `practice --iter 8` exit 0, protocolHash `907cb36f…edb85d`, sha teks juri A/B = rubric.json, rencana restart tercetak; `git diff cacfc29 -- bench/protocol bench/rubric bench/practice` kosong; `scripts/tracer-e2e.sh` LULUS (1 run, $0,21); lakard di-restart → active; `tools/node26/verify.sh` exit 0. pen-desktop tidak di-restart nyata (unit test).
- **Risiko sisa:** decode efek belum terbukti di halaman dingin; screenshot grain ±5× lebih lambat (encode PNG); perluasan zona LC-20 heuristik; satu baris mengintip menghasilkan beberapa temuan (baris transparan bukan unit); pengingat execute hanya teks (agen bisa tetap melewati batas); skill v9 + gating belum diukur pada P1–P4/A–B (putaran 2); restart pen-desktop di round belum diuji nyata; landing.md tepat 3500/3500 token.
