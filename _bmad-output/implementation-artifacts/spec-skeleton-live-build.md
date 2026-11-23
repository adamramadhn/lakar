---
title: 'Canvas terasa realtime: prelude otomatis, skeleton dulu, satu blok per execute'
type: feature
ticket: ''
created: '2026-11-23'
status: built
baseline_revision: '722f563'
route: full
route_source: pinned
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-progressive-live-build.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-board-hug-height.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-canvas-agent-effects.md'
  - '{project-root}/_bmad-output/implementation-artifacts/research-agent-canvas-references.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pengguna (v0.1.2): "setiap dia bikin component kenapa ga realtime". Argumen tool MCP baru sampai di server sesudah LLM selesai menulis seluruh snippet, jadi streaming komponen parsial tidak mungkin (open-pencil juga satu pohon JSX per call). Yang tersisa: (a) setiap execute diawali prelude skill core ±1.500 karakter, sehingga dengan 20–30 execute per halaman banyak token keluaran dan waktu tulis habis untuk teks yang sama; (b) seksi baru muncul satu per satu tanpa gambaran halaman, canvas tampak kosong di bawah seksi terakhir; (c) satu execute per seksi masih berarti satu seksi utuh (10–30 dtk tulis) sebelum ada yang mendarat.

**Approach:** Tiga bagian dalam satu PR.
1. **Prelude otomatis:** helper prelude (C, FONT, R, TY, HEAD, fill, line, F, Row, T, I, Btn, Badge) menjadi global bawaan sandbox exec (opsi b). Palet arketipe disimpan sekali oleh agen di `keep.C`/`keep.FONT` dan dipulihkan otomatis. Prelude lama yang dideklarasi ulang tetap sah (AD-4).
2. **Skeleton dulu:** execute pertama membuat board hug + semua seksi rencana sebagai placeholder `[Skeleton] nama` (konvensi nama, tanpa perubahan skema) lewat helper `Skel`. Execute berikutnya mengisinya di tempat lewat `Build` (node sama). Viewer menggambar placeholder dengan tint + label + sapuan shimmer ala g-scan; check melewati placeholder dan memberi LC-33 bila skeleton tersisa di board selesai; ekspor/codegen tidak pernah membawa gaya skeleton.
3. **Satu blok per execute:** panduan core/landing/webapp + `SERVER_INSTRUCTIONS`: sesudah skeleton, satu blok kecil per execute (navbar, teks hero, visual hero, header seksi, baris kartu). Ambang pengingat disesuaikan; Follow tidak menggeser kamera untuk blok kecil di seksi yang sudah terlihat dan geserannya diberi jarak.

## Boundaries & Constraints

**Always:**
- AD-4: nama tool, route, input, kode error, status HTTP tetap. Snippet lama dengan prelude sendiri (`const C=…`, `var`, `function`, `Object.assign`) tetap berjalan sama. Respons hanya bertambah; hint error dan teks instruksi boleh diperbaiki dengan tes diperbarui di PR yang sama.
- Model dokumen: tanpa perubahan skema (tanpa bump `schemaVersion`). Placeholder = frame biasa; semua tulis lewat op core (`add`/`update`).
- Viewer: satu stream `/viewer/events` lewat `activityHub`; tanpa dependensi ke core/exec/icons (hanya `@lakar/schema`).
- Gerak: shimmer ≤ 3 dtk per sapuan, hanya `transform`; pudar isi placeholder hanya `opacity`; `prefers-reduced-motion` mematikan keduanya.
- Anggaran skill: `LOAD_LIMIT` 9600 dan batas per file tidak dinaikkan.
- C6: desain dulu di `design/lakar-ui.pen` section 04 lewat MCP Pencil.
- Spec dan komentar berbahasa Indonesia; teks UI, commit, PR berbahasa Inggris.

**Never:**
- Menyimpan prelude/palet di penyimpanan tersembunyi daemon; menulis token ke dokumen pengguna demi palet.
- Gaya skeleton di render daemon, PNG ekspor, atau codegen.
- Menaikkan batas skill.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Snippet tanpa prelude | `T(b,'Judul','Halo','h1')` | Teks Plus Jakarta Sans 40/48, warna `C.t1` | Nama global salah → ReferenceError + hint berisi daftar helper bawaan |
| Prelude lama | `const C={…}; const T=(…)=>…` lalu `Btn(...)` | Sah; helper bawaan memakai `C`/`T` snippet (identifier bebas → deklarasi leksikal snippet) | — |
| Palet sesi | Execute 1 `keep.C=Object.assign(C,{acc})` | Execute berikutnya `C.acc` = nilai itu tanpa menulis ulang | `keep.C` bukan objek → palet bawaan |
| Skeleton | `keep.s={hero:Skel(page,'Seksi / Hero',876),…}` | Frame `[Skeleton] Seksi / Hero` lebar fill, minHeight 876, tanpa cat | — |
| Isi di tempat | `Build(keep.s.hero,{padding,…})` | Id sama, nama tanpa prefiks, minHeight dilepas, patch diterapkan | Node tanpa prefiks → hanya patch |
| Check board `[WIP] ` | Placeholder kosong (seksi kembar, frame kosong) | 0 temuan (placeholder dan wadah yang isinya hanya placeholder tidak dinilai) | — |
| Check board selesai | Nama tanpa `[WIP] `, placeholder tersisa | LC-33 warning per placeholder teratas, gerbang 0 | — |
| Viewer placeholder | Board berisi `[Skeleton] …` | Tint 4% + garis putus-putus + label nama seksi; sapuan `translateX` 2,4 dtk, stagger 120ms, hanya saat Generating | Reduced motion → statis |
| Viewer diisi | Mount berikut: id sama tanpa prefiks | Tint memudar 240ms sekali; anak baru di-reveal seperti biasa | Dokumen dibuka/reconnect → tanpa pudar |
| Follow blok kecil | Blok di seksi yang sudah terlihat ≥ min(tinggi, 40% viewport) | Kamera diam | — |
| Follow beruntun | Dua blok di luar layar dalam < 1,2 dtk | Satu geser, lalu geser ke target terbaru sesudah 1,2 dtk | Reduced motion → langsung |
| Execute perbaikan | Tanpa node baru, board sebagian terlihat | Kamera diam (tidak melompat ke board utuh) | Board di luar layar → perilaku lama |
| Ekspor/codegen | Board berisi placeholder | Frame kosong ber-min-height; kelas CSS tanpa penanda (`seksiMenu`) | — |
| Pengingat execute | Execute ke-n | n ≤ 3 tanpa saran; 4–25 pengingat mobile/app ("landing: lanjut satu blok per execute"); ≥ 26 semua | Tidak diblokir |

</frozen-after-approval>

## Code Map

- `packages/exec/src/helpers.ts` -- baru: `HELPERS_JS`, `HELPER_GLOBALS`, `DEFAULT_C`, `DEFAULT_FONT`; helper `Skel`/`Build`.
- `packages/daemon/src/sessions.ts` -- `setActiveDoc`: `open_doc` ke dokumen lain menghapus palet `keep.C`/`keep.FONT` (dipakai `server.ts` route `/docs/open`).
- `packages/exec/src/index.ts` -- `runSnippet` mengevaluasi `HELPERS_JS` (berkas `lakar-helpers.js`) sesudah prelude sandbox; hint ReferenceError menyebut helper bawaan.
- `packages/schema/src/findings.ts` -- `SKELETON_PREFIX`, `isSkeletonName`, aturan `LC-33`.
- `packages/check/src/tree.ts` -- `withoutSkeletons(board)`; `rules.ts` -- `skeletonIds`, `lc33`; `index.ts` -- `checkBoard` menilai board tanpa placeholder + LC-33 dari board utuh.
- `packages/codegen/src/names.ts` -- `words` membuang penanda `[Skeleton] ` dari identifier.
- `packages/viewer/src/skeleton.ts` -- baru: `skeletonEntries`, `skeletonCss`, `filledSince`, konstanta gerak.
- `packages/viewer/src/agentFx.ts` -- `applySkeletonStyle`, `hasNode`.
- `packages/viewer/src/agentEffects.ts` -- `regionInView`, `regionTouchesView`, `followWait`, `FOLLOW_SETTLE_MS`.
- `packages/viewer/src/Canvas.tsx` -- `Focus.agent` (opsional), `BoardLive` (gaya skeleton tiap mount, atribut `data-generating`), efek Follow berirama (hanya fokus agen).
- `packages/viewer/src/Viewer.tsx` -- fokus Follow dari event execute membawa `agent: true`.
- `packages/viewer/src/panels.tsx` -- label LC-33.
- `packages/mcp/src/server.ts` -- `SERVER_INSTRUCTIONS`, `EXECUTE_DESCRIPTION` (helper bawaan), `LAYOUT_CHECK_DESCRIPTION` (skeleton + LC-33), `EXECUTE_LANDING_REMINDER_FROM` 10 → 26; `index.ts` mengekspor konstanta pengingat.
- `packages/skills/skills/core.md` (Prelude = referensi + palet `keep`, langkah 3), `landing.md` (alur skeleton + blok, contoh 8 blok), `webapp.md` (skeleton + 2 blok `Build`), `mobile.md`, `ui.md` (tanpa penanda `// pakai prelude`), `variants.md`.
- `design/lakar-ui.pen` -- section 04: baris `J5LcI` "Skeleton build · one block per execute" (frame `MoWhr` Skeleton, `vQplO` Skeleton → content, `OMuVj` Follow, paced); tabel `WHm4A`: baris Skeleton diperbarui (`OCmVl`), baris baru `Bnu7l` Skeleton fill dan `EOJlZ` Follow pacing; catatan reduced motion `jJuQh`.
- Tes: `packages/exec/src/helpers.test.ts`, `packages/check/src/index.test.ts`, `packages/schema/src/findings.test.ts`, `packages/viewer/src/skeleton.test.ts`, `packages/viewer/src/Canvas.dom.test.tsx`, `packages/mcp/src/index.test.ts`, `tests/skills.test.ts`, `tests/skeleton-export.test.ts`, `packages/daemon/src/skills-examples.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] Desain Pencil section 04 (frame skeleton, transisi isi, Follow berirama, baris tabel gerak).
- [x] Helper bawaan sandbox + palet `keep` + tes AD-4.
- [x] Konvensi `[Skeleton] `: `Skel`/`Build`, check (pangkas + LC-33), codegen tanpa penanda.
- [x] Viewer: gaya skeleton di shadow root, shimmer saat Generating, pudar saat diisi, Follow berirama.
- [x] Panduan: core/landing/webapp/mobile/ui/variants, `SERVER_INSTRUCTIONS`, deskripsi tool, ambang pengingat.
- [x] `deferred-work.md`: butir prelude `resolved:`; butir baru.

**Acceptance Criteria:**
- Given agen mengikuti skill landing, when execute pertama selesai, then canvas memperlihatkan seluruh kerangka halaman (placeholder berlabel, bershimmer saat Generating) dan check 0 temuan.
- Given execute blok berikutnya, when ia mengisi placeholder dengan `Build`, then node yang sama berubah menjadi isi nyata dari atas ke bawah tanpa menulis ulang prelude.
- Given snippet lama ber-prelude sendiri, when dijalankan, then hasilnya sama seperti sebelum PR ini.
- Given board tanpa `[WIP] ` dengan placeholder tersisa, when check berjalan, then ada LC-33 warning.
- Given ekspor PNG/codegen board berisi placeholder, then tidak ada gaya skeleton.

## Implementation Notes

- **Penyimpangan workflow:** dikerjakan langsung oleh satu agen tanpa checkpoint, sesuai brief ("decide sensibly without asking").
- **Keputusan prelude: opsi (b), helper bawaan.** Opsi (a) (menyimpan prelude per dokumen dan menyuntikkannya) butuh penyimpanan kode tersembunyi per sesi/dokumen dan tetap mengirim teks yang sama ke QuickJS; helper bawaan lebih sederhana, deterministik, dan satu sumber kebenaran (`helpers.ts`). Helper dipasang sebagai properti global biasa (configurable) sehingga deklarasi leksikal snippet (`const C`) membayanginya tanpa SyntaxError; helper mencari `C`/`T`/… sebagai identifier bebas saat dipanggil, jadi prelude lama tetap konsisten. Diuji di QuickJS (`helpers.test.ts`).
- **Keputusan palet: `keep.C`/`keep.FONT`, bukan token dokumen.** `keep` adalah state sesi yang eksplisit dan sudah terdokumentasi (bukan penyimpanan tersembunyi). Token bertipe v3 tidak dipakai: nilai `C` adalah literal hex di node (bukan `{$token}`), jadi menurunkan palet dari token tidak mengikat apa pun, sedangkan menulis token akan mengubah dokumen pengguna (tokens.css ekspor, panel Theme, riwayat) tanpa diminta. Dokumen yang sudah bertoken tetap bisa dipakai agen lewat `getTokens()` + `{$token}` seperti sebelumnya.
- **Keputusan penanda skeleton: prefiks nama `[Skeleton] `** (pola `[WIP] `), tanpa perubahan skema. Penanda terlihat di Layers, bertahan lintas restart, dan bisa dibaca check/viewer/codegen dari nama saja.
- **`Build` melepas `minHeight`, tidak menghapus anak.** Contoh landing memakai `minHeight:876` pada hero sampai visual hero masuk (kontur `Crop /` setinggi hero tidak terpotong di blok teks hero).
- **Check:** board dinilai sebagai salinan tanpa subtree placeholder; wadah yang isinya hanya placeholder (mis. `Halaman` di execute skeleton) ikut dilewati, sebab tanpa itu LC-21 melaporkannya sebagai spacer kosong. Ukuran render tetap (placeholder memakan ruang).
- **Viewer:** gaya placeholder = satu `<style data-lakar-skeleton>` di shadow root board, ditulis ulang setiap mount (pola gaya edit teks di `canvasEdit.tsx`); placeholder sendiri tidak diberi cat di dokumen. Sapuan hanya saat host ber-atribut `data-generating` (board berlabel Generating), supaya skeleton yang tertinggal tidak tampak "memuat" selamanya.
- **Follow berirama:** wilayah blok dianggap terlihat bila bagian terlihat ≥ min(tinggi, 40% viewport) dan ≥ min(lebar, 80% viewport); execute tanpa node baru hanya menggeser bila board sama sekali tidak tampak; geseran berjarak ≥ 1,2 dtk, target di antaranya digabung (terbaru menang) lewat timer di efek Follow.
- **Ambang pengingat:** mobile/app tetap mulai ke-4; landing 10 → 26 (skeleton + navbar + 2 blok hero + ±6 seksi × 2–3 blok + footer + penutup ≈ 20–25).
- **Anggaran skill (estimateTokens, CRLF lokal / LF):** sebelum core 2512/2482, landing 3004/2966 (muat 9513/9389), mobile 2768 (9277), webapp 2890 (9399). Sesudah core 2244/2217, landing 3140/3097 prosa 1061/1045 (muat 9375/9249), mobile 2762 (muat 8997/8883), webapp 2862 prosa 936 (muat 9097/8982). Sesudah review pass 2 (CRLF): core 2245, landing 3143 (muat 9379), mobile 2750 (muat 8986), webapp 2848 (muat 9084). Prelude bawaan membebaskan ±270 token di core; contoh landing 8 blok dibayar dari situ.

## Plan Change Log

- Nama helper isi: `Fill` (brief) → `Build`, supaya tidak tertukar dengan helper cat `fill(c)`.
- Ditambah sesudah tes contoh skill: `withoutSkeletons` juga melewati wadah yang hanya berisi placeholder; `minHeight` hero di contoh landing.
- Ditambah sesudah tes codegen: penanda `[Skeleton] ` dibuang dari identifier kode.
- Review PR #29 (pass 2): palet per dokumen (daemon `setActiveDoc` menghapus `keep.C`/`keep.FONT` saat `open_doc` pindah dokumen) dan helper baru `Palette(c, font)` yang menulis palet utuh dari nilai bawaan; idiom `keep.C=Object.assign(C,{…})` di skill diganti `Palette`. Baris matriks "Palet sesi" kini berarti palet per dokumen aktif sesi.
- Review PR #29: `Build` hanya melepas `minHeight` dari placeholder; helper saling memanggil lewat closure (hanya `C`/`FONT`/`TY`/`HEAD` identifier bebas); LC-12 dinilai pada board utuh (placeholder dihitung); header/`source` codegen tanpa penanda; Follow agen yang menunggu dibatalkan oleh gestur kamera pengguna.

## Review Triage Log

**Pass 1 (quick, tinjau diri atas diff + tes contoh skill di Chromium lokal):**

| # | Temuan | Verdict | Rute | Bukti |
|---|---|---|---|---|
| 1 | `withoutSkeletons` memeriksa `found` sebelum memangkas, jadi board dikembalikan utuh (LC-21 spacer di contoh) | medium | patch | Pangkas dulu, lalu pilih hasil; tes contoh landing/webapp hijau |
| 2 | Execute skeleton: `Halaman` berisi placeholder saja → LC-21 spacer kosong | low | patch | Wadah yang isinya hanya placeholder ikut dilewati |
| 3 | Blok teks hero: `Crop / Kontur` 876 terpotong hero yang belum punya visual (LC-02a) | low | patch | Contoh memakai `minHeight:876` sampai visual masuk |
| 4 | Kelas CSS module codegen `skeletonSeksiMenu` membawa penanda placeholder | low | patch | `words` membuang `[Skeleton] `; `tests/skeleton-export.test.ts` |
| 5 | Shimmer tak berujung pada skeleton yang tertinggal setelah agen berhenti | low | patch | Sapuan hanya saat `data-generating` |
| 6 | `get(board)`/`list_boards` belum melaporkan jumlah placeholder | low | defer | deferred-work |
| 7 | Skeleton mobile belum dipandu (LC-12 mobile `[WIP] `) | low | defer | deferred-work |
| 8 | api.md (dibangkitkan dari api.ts) belum memuat helper bawaan | low | defer | deferred-work; core.md + `EXECUTE_DESCRIPTION` sumber agen |
| 9 | Aturan Follow longgar (board sebagian terlihat → diam) juga mengenai fokus pilihan pengguna (klik temuan/Layers) | medium | patch | `Focus.agent`; hanya Follow agen yang berirama; tes DOM fokus pengguna |
| 10 | `Build` pada frame tanpa `minHeight` | low | ditolak | `update(…,{minHeight:null})` sah; tes `helpers.test.ts` |

**Pass 2 (review independen PR #29, sesi induk; check claude-review CI gagal karena galat layanan):** medium 2, low 6 + nit, semua patch.

| # | Temuan | Verdict | Rute | Bukti |
|---|---|---|---|---|
| R1 | Palet bocor lintas dokumen dalam satu sesi (`keep` per sesi, `open_doc` tidak meresetnya); contoh webapp menumpuk palet parsial; restart daemon diam-diam kembali ke Jernih | medium | patch | `sessions.ts` `setActiveDoc` (dipakai route `/docs/open`) menghapus `keep.C`/`keep.FONT` saat pindah dokumen; `Palette(c, font)` menulis palet utuh dari nilai bawaan; core/webapp/mobile/variants memakai `Palette`; core.md meminta `Palette` diulang bila `keep` kosong sesudah restart (`keep.board`/`keep.s` juga hilang, jadi agen sudah harus memulihkan konteks). Tes: `sessions-palette.test.ts`, `helpers.test.ts` (Palette tidak menumpuk, `data` tidak termutasi), `skills.test.ts` (tanpa `Object.assign(C`) |
| R2 | `Build` selalu melepas `minHeight`, termasuk frame biasa | medium | patch | Hanya bila nama berprefiks `[Skeleton] `; tes menegaskan `minHeight:200` tetap |
| R3 | LC-12 board landing tetap tanpa `[WIP] ` dengan placeholder tersisa menyarankan tinggi ±72 (`withoutSkeletons`) | low | patch | LC-12 dinilai pada konteks board utuh; tes check (tanpa LC-12 palsu; ruang kosong sungguhan → tinggi pas memuat placeholder) |
| R4 | mobile.md memakai `Object.assign(C,…)` tanpa keep | low | patch | `Palette({…},{…})` (muat mobile 8986) |
| R5 | `minHeight:876` hero tidak pernah dilepas | low | patch | Komentar diganti: 876 = tinggi `Crop / Kontur`, sengaja tetap (melepasnya memotong kontur bila isi hero lebih pendek, LC-02a) |
| R6 | Header dan `source` codegen memuat nama mentah `[Skeleton] ` | low | patch | `layerName` di `names.ts` dipakai `words`, `headerOf`, `source`; tes ekspor node placeholder sendiri (`SeksiMenu.tsx`, header `"Seksi / Menu"`) |
| R7 | Timer Follow berirama (≤ 1,2 dtk) menimpa pan/zoom pengguna | low | patch | `takeOver` (wheel, zoom, pointerdown) mencatat gestur; fokus agen yang menunggu dibuang bila ada gestur sesudah mulai menunggu; tes DOM (gagal bila pembatalan dimatikan) |
| R8 | Helper bawaan mencari `line`/`fill`/`Row`/`T`/`I` sebagai identifier bebas → `const line=…` merusak `Btn` | low | patch | Helper saling memanggil lewat closure; `C`/`FONT`/`TY`/`HEAD` tetap bebas (prelude lama tetap memakai palet/skala snippet, AD-4); tes QuickJS |
| R9 | Nit: dua import di satu baris `tree.ts:2` | nit | patch | Dipisah |

## Design Notes

**Pencil (C6).** Section 04 `TA3p7` kini `fit_content`; baris baru `J5LcI` di bawah `GRlb7`: (1) `MoWhr` Skeleton: board hug berlabel Generating dengan lima placeholder (Navbar, Hero, Menu, Jadwal sangrai, Footer), tint `#1018280A`, garis putus-putus `#10182826`, label 10/600 `#667085`, pita sapuan; (2) `vQplO` keyframe 0/240/600ms: tint memudar, blok masuk; (3) `OMuVj` viewport + blok: "block in view → camera stays", "section off-screen → one pan, ≥ 1.2s between pans". Tabel `WHm4A`: Skeleton 1.2s → 2.4s loop (sapuan + jeda, stagger 120ms, hanya saat Generating), Skeleton fill 240ms `cubic-bezier(.16,1,.3,1)`, Follow pacing 500ms / 1.2s. Section 05 dan seterusnya digeser ke bawah supaya tidak bertumpuk.

**Angka gerak.** g-scan pen.dev 3s linear (riset §2): sapuan 2,4 dtk dengan 30% jeda (1,7 dtk gerak) terasa hidup tanpa menarik perhatian dari reveal isi; stagger 120ms membuat sapuan terbaca atas → bawah. Pudar tint 240ms = cangkang reveal.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- sukses.
- `npx -y pnpm@12.21.0 test` -- lihat catatan PR; kegagalan yang tersisa adalah kegagalan khas Windows yang sama dengan baseline (AGENTS.md). Contoh skill landing/webapp/mobile/core/ui di `skills-examples.test.ts` (Chromium lokal) hijau. CI Linux acuan.
- `npx vitest run` (setara `pnpm test` sesudah typecheck tes): kegagalan tersisa = kegagalan khas Windows yang tercantum di AGENTS.md/brief (izin key foto Unsplash/Pexels, SIGTERM/SIGKILL, CRLF judul skill + api.md, pool.test config, render/bench Chromium, sumber C7 tanpa `LAKAR_C7_ALLOW_MISSING_SOURCES`, sha prompt latihan CRLF, `release.sh`). Snapshot bench yang ditulis ulang (hanya CRLF) dikembalikan.
- Smoke daemon lokal (`LAKAR_BROWSER_CHANNEL=msedge LAKAR_PORT=7593`, data dir sementara): `open_doc` + 4 execute dari contoh landing (skeleton 5 placeholder, navbar, teks hero, visual hero). Check tiap execute 0/0/0. `bounds` board hug tetap `[0,0,1440,2588]` di keempat execute (skeleton memesan ruang; hero terisi 876 = perkiraan), `list_boards` `{height:2588, heightMode:'hug', wip:true}`; `inspect`: Navbar 72, Seksi / Hero 876, tiga `[Skeleton] ` tersisa. Sesudah `[WIP] ` dilepas: `layout_check` 0 error, 3 warning LC-33 (Fitur, Menu, Footer). `/app/` 200. Daemon dihentikan, data dir dihapus.
