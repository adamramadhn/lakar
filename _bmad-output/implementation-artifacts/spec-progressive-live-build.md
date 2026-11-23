---
title: 'Landing tersusun live: execute per seksi, reveal bertahap, Follow ke seksi baru'
type: feature
ticket: ''
created: '2026-11-23'
status: built
baseline_revision: '51adc70c6ecd26952d8caec3747db07e7429fc38'
route: full
route_source: pinned
risk: low
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-canvas-agent-effects.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-board-height-fit.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-app-5-agent-presence.md'
  - '{project-root}/_bmad-output/implementation-artifacts/research-agent-canvas-references.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Laporan pengguna Lakar v0.1.1 desktop: "kenapa ngga realtime, harusnya realtime". Board tidak tersusun live:
(a) execute pertama agen membuat board, navbar, dan hero sekaligus (rev 3, 47 node), karena `SERVER_INSTRUCTIONS`, `core.md`, dan `landing.md` menyuruh "2–4 execute besar untuk landing". Waktu terbesar habis saat LLM menulis snippet besar (QuickJS < 2 dtk), jadi canvas diam puluhan detik lalu satu potongan besar muncul;
(b) board landing dibuat setinggi halaman penuh di depan (±4000 px), sehingga yang terlihat board putih tinggi dengan hanya hero terisi;
(c) fade-in spec-canvas-agent-effects hanya menganimasikan maks 12 node teratas per execute, jadi hero di dalam board/wrapper baru muncul sebagai satu blok, tanpa build bertahap ala Paper/pen.dev;
(d) execute pertama sesi tidak mendapat label "Generating" (board baru diketahui sesudah call selesai).

**Approach:** Tiga lapis. (1) Panduan agen: landing dibangun satu execute per seksi (navbar + hero dulu), board mulai setinggi navbar + hero dan ditinggikan tiap seksi dari `bounds`, `[WIP] ` sampai execute penutup; webapp dua execute bangun; mobile tetap satu board utuh (alasan di Design Notes). (2) Viewer: fade 12-node diganti reveal bertahap: akar baru dipecah menjadi blok dalam urutan dokumen, blok masuk satu per satu dari atas dengan gerak ala g-build; Follow agent menggeser kamera ke seksi baru, bukan hanya board. (3) Label Generating: execute pertama → label tingkat dokumen (tidak menebak board); di antara execute → board `[WIP] ` sesi Live tetap berlabel Generating.

## Boundaries & Constraints

**Always:**
- AD-4: nama tool, route, input, kode error, dan status HTTP tetap. Teks instruksi server dan baris pengingat jumlah execute boleh diperbaiki, tesnya diperbarui di PR yang sama. `Focus.rect`, `AgentPresence.building`, dan prop `pending` Canvas hanya tambahan opsional.
- Anggaran skill (`tests/skills.test.ts`): `LOAD_LIMIT` 9600 dan batas per file tidak dinaikkan; setiap kata baru dibayar dengan pemangkasan yang sama.
- LC-12 tidak melawan keadaan antara: board landing `[WIP] ` dilewati LC-12 (sudah ada, `packages/check/src/rules.ts:315`), dan `[WIP] ` dilepas hanya di execute penutup.
- Viewer: satu stream `/viewer/events` lewat `activityHub`; tanpa dependensi ke core/exec/icons.
- Reveal hanya menganimasikan `opacity`, `translate`, dan `filter` lewat Web Animations API pada elemen di shadow root board. Tidak saat dokumen dibuka, tidak saat reconnect (`fadeEpoch` + `prime`), tidak untuk edit pengguna; `prefers-reduced-motion` mematikannya.
- Aturan spec-app-5: target execute yang sedang berjalan tidak ditebak.
- Spec dan komentar berbahasa Indonesia; teks UI berbahasa Inggris.

**Never:**
- Mengubah skema dokumen, aturan check, atau perilaku route.
- Menganimasikan ribuan daun (maks 32 unit per reveal) atau properti layout.
- Memecah board mobile menjadi beberapa execute selama LC-12 mobile tidak melewati `[WIP] `.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Landing execute 1 | Agen mengikuti `landing.md` | `place(1440,6000)` (ruang tumbuh), board `[WIP] …` tinggi ±960 berisi navbar + hero; board tidak menampilkan area kosong besar | Isi lebih tinggi dari board → LC-02a terpotong (agen menaikkan tinggi di execute berikutnya) |
| Landing execute seksi | `bounds` respons sebelumnya: `Halaman` 948 | `update(keep.board,{height:948+N})` lalu satu `Seksi / …` + perbaikan `check`; footer di seksi terakhir | Perkiraan N kurang → LC-02a; N lebih → ruang kosong sementara, dipangkas di penutup |
| Landing penutup | Review selesai | Perbaikan + tinggi pas dari `bounds` + lepas `[WIP] ` → LC-12 landing aktif | LC-12 "tinggi pas = N" → `update` |
| Webapp | `webapp.md` | Execute 1 board + sidebar + header (`keep.main`), execute 2 KPI + grafik + tabel, execute 3 perbaikan | — |
| Mobile | `mobile.md` | Tetap satu board utuh (≈ satu seksi landing) | LC-12 mobile tidak melewati `[WIP] ` |
| Pengingat jumlah execute | Execute ke-n sesi MCP | n ≤ 3 tanpa saran; 4–9 pengingat mobile/app ("landing: lanjut satu execute per seksi"); ≥ 10 pengingat semua | Tidak pernah diblokir |
| Reveal board baru | Execute membuat board + Halaman + navbar + hero | Board dan wadah = cangkang (opacity 240ms); blok (logo, tautan, aksi, baris teks hero, mockup …) masuk berurutan dokumen; 600ms, naik 12px, blur 4px, `cubic-bezier(.16,1,.3,1)`, jeda 60ms dipadatkan sampai total ≤ 1500ms | Elemen ber-filter sendiri → tanpa blur |
| Reveal seksi baru | Execute menambah `Seksi / Fitur` | Seksi tidak muncul sebagai satu blok; judul, kartu, isi kartu masuk bergiliran | Id tidak ada di DOM → dilewati |
| Execute baru di tengah reveal | Rev berikutnya termuat saat reveal berjalan | Reveal lama di board itu diselesaikan (`finish`) lalu reveal baru mulai; mount ulang melepas DOM lama | — |
| Dokumen dibuka / reconnect / reduced motion | Execute selesai sebelum canvas dibuka, snapshot `hello`, atau `prefers-reduced-motion` | Tanpa reveal | — |
| Follow agent | Execute selesai membuat seksi di y 1200 board tinggi | Kamera bergeser (500ms ease-out) sampai seksi terlihat utuh; zoom tetap kecuali lebar seksi tak muat; seksi lebih tinggi dari viewport → tepi atasnya terlihat | Seksi sudah terlihat → diam; tanpa node baru / beberapa board → perilaku board lama |
| Execute pertama sesi | Call execute berjalan, sesi belum punya lokasi | Label "✦ Generating · {harness}" tingkat dokumen (atas tengah canvas); dokumen kosong → "Your agent is building the first board" | Pratinjau versi → tanpa label |
| Di antara execute | Sesi Live, lokasi terakhir board `[WIP] …`, dokumen ini masih dokumen aktif sesi | Label "✦ Generating · nama board" tetap (building) | Board tanpa `[WIP] `, sesi pindah dokumen, atau idle > 60 dtk → hilang |

</frozen-after-approval>

## Code Map

- `packages/mcp/src/server.ts:165` -- `SERVER_INSTRUCTIONS`: "2–4 execute besar" → bangun bertahap per seksi; `executeCountLine` (:79) pengingat dua tingkat (`EXECUTE_REMINDER_FROM` 4, `EXECUTE_LANDING_REMINDER_FROM` 10).
- `packages/skills/skills/core.md` langkah 3 -- bangun bertahap; total mobile 3, app 4, landing seksi + 1.
- `packages/skills/skills/landing.md` -- tinggi dari `bounds`; "Alur execute" satu seksi per execute; contoh 1 `place(1440,6000)` + board 960; contoh 2 diawali `update(keep.board,{height:948+900})`.
- `packages/skills/skills/webapp.md` -- alur tiga execute; contoh dipecah dua blok (`keep.main`).
- `packages/skills/skills/mobile.md` -- alasan tetap satu board utuh.
- `packages/viewer/src/agentEffects.ts` -- `topmost` tanpa batas bawaan; baru `revealUnits` (:122), `revealSchedule` (:163), `regionVisible`/`followCamera` (:179/:190), konstanta `REVEAL_*`; `generatingBoards` (:273) ikut `building`. `FADE_MAX`, `staggerDelay` dihapus.
- `packages/viewer/src/agentFx.ts` -- `animateReveal(host, ids, reduced)` menggantikan `animateFadeIn`; `finishReveal(host)` (WeakMap animasi per host).
- `packages/viewer/src/presence.ts` -- `AgentPresence.building` (:122), `pendingAgents` (:200), `followRect` (:219).
- `packages/viewer/src/Canvas.tsx` -- `Focus.rect`; `playFade` (:545) menggabung kelompok execute jadi satu reveal; efek Follow (:625) memakai wilayah seksi; prop `pending` + chip `.doc-pending` (:1014); teks state menunggu.
- `packages/viewer/src/Viewer.tsx` -- `followRect(c)` (:589) ke `setFocus`; `pendingAgents` (:667) ke Canvas.
- `packages/viewer/src/app.css` -- `.agent-generating.doc-pending`.
- Tes: `packages/viewer/src/agentEffects.test.ts`, `packages/viewer/src/Canvas.dom.test.tsx`, `packages/viewer/src/test/fixtures.ts` (frame bersarang), `packages/mcp/src/index.test.ts`, `tests/skills.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] Panduan agen: `server.ts` (instruksi + pengingat), `core.md`, `landing.md`, `webapp.md`, `mobile.md`; tes `index.test.ts` dan `tests/skills.test.ts`.
- [x] Reveal bertahap: `agentEffects.ts` (pilihan unit + jadwal), `agentFx.ts` (Web Animations, interupsi), `Canvas.tsx` (`playFade`).
- [x] Follow ke seksi baru: `presence.ts` `followRect`, `agentEffects.ts` `followCamera`, `Viewer.tsx`, `Canvas.tsx`.
- [x] Label Generating: `presence.ts` (`building`, `pendingAgents`), `agentEffects.ts` (`generatingBoards`), `Canvas.tsx` (chip dokumen), `app.css`.
- [x] Tes murni (unit reveal, jadwal, followRect/followCamera, building, pending) dan tes DOM (urutan + stagger, cangkang opacity saja, interupsi, buka dokumen, Follow ke seksi, chip dokumen, building).
- [x] `deferred-work.md`: `resolved:` untuk "Execute pertama sebuah sesi belum mendapat label Generating"; item baru yang ditunda.

**Acceptance Criteria:**
- Given agen membangun landing mengikuti skill, when execute berjalan, then canvas menerima satu seksi per execute dan board tidak pernah memperlihatkan area kosong besar di bawah isi.
- Given execute agen membuat seksi baru, when board di-mount dari rev itu, then isi seksi masuk blok demi blok dari atas dalam ≤ 1,5 dtk; membuka dokumen, reconnect, atau reduced motion tidak memutarnya.
- Given Follow agent aktif, when execute membuat seksi di luar viewport, then kamera bergeser sampai seksi itu terlihat.
- Given execute pertama sesi berjalan, when board tujuan belum diketahui, then canvas menampilkan label Generating tingkat dokumen tanpa menandai board mana pun.

## Implementation Notes

- **Penyimpangan workflow:** dikerjakan langsung oleh satu agen tanpa checkpoint, sesuai brief ("decide sensibly without asking").
- **Anggaran skill (estimateTokens, CRLF lokal / LF CI):** sebelum landing 9593 / 9469, mobile 9236 / 9119, webapp 9277 / 9162. Sesudah landing 9592 / 9468, mobile 9277 / 9159, webapp 9399 / 9280 (batas 9600). Tambahan di `core.md` dan `landing.md` dibayar dengan memangkas komentar contoh landing dan kalimat pengantar contoh; mobile dan webapp masih punya ruang.
- **Pemilihan unit (`revealUnits`):** mulai dari akar baru (`topmost` di DOM, urutan dokumen). Selama ≤ 32 unit, unit terbesar (jumlah turunan) yang kedalamannya < 4 dari akar, punya anak, dan bukan atom (turunan ≤ 3: tombol, badge, ikon + teks) diganti anak-anaknya di tempat. Node yang dipecah menjadi cangkang yang hanya fade opacity 240ms mulai bersama unit pertamanya, supaya latar seksi tidak meloncat sebelum isinya. Urutan dokumen = atas ke bawah untuk flow kolom; dalam baris kiri ke kanan. Tidak membaca layout (tanpa `getBoundingClientRect`).
- **Jadwal:** durasi unit 600ms, jeda 60ms, dipadatkan `(1500 − 600) / (n − 1)` bila n besar; 6 unit selesai 900ms, 32 unit 1500ms. Naik 12px, blur 4px → 0 (tanpa blur bila elemen punya filter sendiri), `cubic-bezier(.16,1,.3,1)`, `fill:'backwards'`.
- **Interupsi:** animasi reveal disimpan per host board; reveal baru di host yang sama memanggil `finish()` pada yang lama (keadaan akhir). Board yang di-mount ulang mengganti DOM, jadi animasi lama hilang bersama elemennya. Beberapa execute yang termuat sekaligus digabung menjadi satu reveal.
- **Follow:** `followRect` = gabungan bounds node `created` (tanpa board) dari event call. Bounds daemon maks 60 entri dan memuat node baru dalam urutan pembuatan, jadi akar seksi selalu tercakup. Execute tanpa node baru (perbaikan) atau yang menyentuh beberapa board tetap memakai perilaku board lama supaya perbaikan kecil tidak menggeser kamera.
- **Generating:** dua bagian. (1) `pendingAgents`: sesi Live dengan execute berjalan dan tanpa lokasi (execute pertama) → chip tingkat dokumen, tidak pernah pada board. (2) `building`: di antara execute, presence non-working yang lokasinya board `[WIP] ` dan dokumen aktif sesinya masih dokumen ini → board tetap berlabel Generating. `[WIP] ` adalah pernyataan agen sendiri bahwa board belum selesai, dan lokasi = lokasi terakhir yang diketahui (aturan kursor spec-app-5), jadi tidak ada tebakan baru. Working menang atas building bila dua sesi menunjuk board yang sama.
- **Smoke test lokal:** daemon `LAKAR_BROWSER_CHANNEL=msedge LAKAR_PORT=7591` dengan data dir sementara: `/app/` 200, `open_doc` + dua execute (board 400 + hero, lalu `update` tinggi + seksi) sukses, check 0/0, `bounds` execute 2 = board + seksi baru saja (`[0,380,1440,280]`), cocok dengan `followRect`. Daemon dihentikan.

## Plan Change Log

## Review Triage Log

**Pass 1 (quick, tinjau diri atas diff):** low 4 diperbaiki, defer 3.

| # | Temuan | Verdict | Rute | Bukti |
|---|---|---|---|---|
| 1 | `followRect` dari execute perbaikan (tanpa node baru) memakai node berubah, termasuk wrapper `Halaman`, sehingga kamera melompat ke atas halaman | low | patch | Kini hanya node `created`; tanpa itu → perilaku board lama |
| 2 | Bounds relatif per board: execute yang menyentuh beberapa board menghasilkan wilayah campuran | low | patch | `followRect` → undefined bila `boards.length > 1` |
| 3 | Pengingat jumlah execute MCP ("batas tercapai, lanjut screenshot/export" di execute ke-3) melawan alur per seksi | low | patch | `executeCountLine` dua tingkat; tes diperbarui |
| 4 | `building` tetap menyala bila sesi sudah pindah ke dokumen lain (≤ 60 dtk) | low | patch | Syarat `activeSlug` sesi = dokumen ini |
| 5 | Desain Pencil section 04 belum memuat reveal bertahap dan chip Generating tingkat dokumen (C6) | low | defer | Chip memakai komponen label Generating yang sudah ada; angka gerak di Design Notes |
| 6 | Prelude diulang di setiap execute seksi (±500 token keluaran per execute) | low | defer | Lihat deferred-work: prelude persisten per sesi |
| 7 | Progres execute belum distream (canvas tetap diam selama LLM menulis satu seksi) | low | defer | Lihat Design Notes "Ide ditunda" |

## Design Notes

**Mobile tetap satu execute bangun.** Board mobile 844–1200 px ≈ satu seksi landing, dan H dihitung di depan (zona bawah di `H-98`). LC-12 mobile tidak melewati `[WIP] `, jadi board setengah jadi akan mendapat "tinggi pas = N" yang salah dan contoh skill (tes `skills-examples`, 0 warning) gagal. Memecahnya butuh perubahan aturan check, di luar spec ini.

**Webapp dua execute bangun.** Board app tinggi tetap (900); execute 1 (sidebar + header) tidak memicu temuan, execute 2 mengisi area kerja lewat `keep.main`. Contoh dijalankan `skills-examples.test.ts` dengan 0 temuan.

**Ruang tumbuh landing.** `place(1440,6000)` hanya memesan posisi (board lain diletakkan di sampingnya, bukan di bawah), sementara board dibuat setinggi isi. Board memotong isi (deferred `height:'hug'`), jadi tinggi dinaikkan di execute yang sama dengan seksi barunya, dengan perkiraan dilebihkan; execute berikutnya mengoreksi dari `bounds`.

**Angka gerak.** Riset §2: g-build 650ms translateY 14px dengan delay per elemen; Paper 300ms `cubic-bezier(.16,1,.3,1)`. Dipilih 600ms, 12px, blur 4px, jeda 60ms, total ≤ 1500ms (rentang brief 1,2–1,8 dtk), cangkang 240ms.

**Ide ditunda: progres execute lebih awal.** Daemon bisa mengirim event `progress` per op `add` dari QuickJS (mis. setiap 50ms) dan viewer me-mount node yang sudah ada sebelum commit. Ini tidak membantu masalah utama: QuickJS < 2 dtk, sedangkan waktu tunggu ada pada LLM menulis snippet sebelum call dikirim. Streaming argumen tool dari harness (Claude Code/MCP belum mendukung partial tool input ke server) adalah satu-satunya cara mempersingkat jeda itu; sampai itu ada, execute per seksi adalah tuasnya.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- sukses.
- `npx -y pnpm@12.21.0 test` -- sukses kecuali kegagalan khas Windows (AGENTS.md: izin key foto, SIGTERM, CRLF ukuran/judul skill, api.md, pool.test, render Chromium/bench, sha prompt latihan CRLF). `agentEffects.test.ts`, `Canvas.dom.test.tsx`, `packages/mcp/src/index.test.ts`, dan contoh landing/webapp/mobile di `skills-examples.test.ts` (Chromium lokal) hijau. CI Linux acuan.
