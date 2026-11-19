---
title: 'LC-20: zona bawah struktural, konten terpotong di tepi zona, dan judul seksi yatim'
type: feature
ticket: ''
created: '2026-11-18'
status: built
baseline_revision: '72e7cba9462e369d3e41e7abe12f0614e50460d6'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** LC-20 hanya mengenali bar bernama `Overlay /` (≤48 px dari tepi bawah, lebar ≥50%) dan hanya memeriksa konten terakhir pada posisi akhir gulir. Di latihan 1.19 iterasi 6 (`bench/runs/practice/6/P3-lakar`, board `9J4GY5q3`: kartu ulasan terpotong `Overlay / Bilah bawah` y 738; `P2-lakar` board `MWLYK6Am`: judul "Episode baru" di atas mini player y 690, isinya tertutup) tidak ada temuan karena `Scroll /` pada posisi awal dilewati dan mini player (bawah 746, 98 px dari tepi) tidak dikenali.

**Approach:** Bangun satu *zona bawah* per board dari elemen yang menempel bawah (legacy `Overlay /` + node absolut struktural, ditumpuk), lalu LC-20 melaporkan (1) perilaku lama: konten terakhir pada posisi akhir berakhir > y zona − 8; (2) baru: unit konten yang terlihat sebagian/terpotong di tepi atas zona pada posisi mana pun; (3) baru: judul seksi yang terlihat tetapi isi seksinya tidak terlihat di atas zona. Konten yang seluruhnya di bawah zona tetap boleh.

## Boundaries & Constraints

**Always:** aturan tetap murni di `packages/check` (tanpa render baru); severity LC-20 tetap `error` gerbang (`packages/schema/src/findings.ts` tidak diubah); `Overlay /` tetap dikenali seperti dulu (di kedalaman mana pun, tanpa syarat fill/urutan); pengecualian `Scroll /` (konten di bawah lipatan/terpotong clip gulir tidak dilaporkan) dan `Crop /` (isi Crop tidak dinilai sendiri-sendiri, Crop dinilai sebagai satu unit) tetap; pesan temuan menyebut node, zona (nama anggota + y), dan saran satu langkah (geser/padatkan konten, beri ruang bawah, atau akhiri layar pertama dengan rapi); C7: pesan tanpa istilah rubrik/juri/skor/golden; Node via `/opt/node-26/bin`.

**Never:** mengubah bench (pembungkus/protocol/rubrik/judge), file .pen/pen.dev, folder di `.git/info/exclude`, konfigurasi global; menjadikan anak flow (non-absolut) sebagai elemen zona kecuali bernama `Overlay /`; memakai nama selain `Overlay /`/`Scroll /`/`Crop /`/`Status bar`/`Home indicator` sebagai syarat deteksi; menaikkan latensi check secara berarti (aturan tetap O(node × anggota zona)).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| (a) kartu terpotong bilah aksi | board 390×844, `Scroll /` scrollY 0; frame absolut "Bilah aksi" (fill, x0 y738 w390 h106, setelah konten); kartu ber-fill y 662–760 | 1 LC-20 pada kartu: terpotong zona y 738 | — |
| (b) judul seksi yatim | seksi (kolom): judul teks 22px y 650–672, daftar kartu mulai y 686; frame absolut "Mini player" y690–746 + "Tab bar" y746–810 | 1 LC-20 pada judul (sebut seksi + zona y 690, gabungan 2 anggota); kartu di seksi itu tidak dilaporkan terpisah | — |
| (c) tab bar + konten berakhir ≥8 px di atasnya | tab bar absolut ber-fill y 780, konten berakhir ≤ 772 | tanpa temuan | — |
| (d) layar gulir, konten utuh di bawah zona | `Scroll /` clip scrollY 0, kartu terakhir terlihat berakhir ≤ Z−8, kartu berikutnya top ≥ Z | tanpa temuan | — |
| (e) landing desktop tanpa elemen bawah | 1440×3000 landing, hanya anak flow | tanpa temuan | — |
| (f) footer biasa | landing dengan footer anak flow terakhir di tepi bawah | tanpa temuan | — |
| legacy | semua tes LC-20 lama di `index.test.ts` dan daemon | tetap lulus (teks detail boleh diperluas hanya bila tes diperbarui konsisten) | — |

</intent-contract>

## Code Map

- `packages/check/src/rules.ts` -- `lc20` (baris ~200–267) + konstanta `BOTTOM_BAR_MAX_GAP`(48), `BOTTOM_BAR_CLEARANCE`(8), `BOTTOM_BAR_MIN_WIDTH_RATIO`, `isChrome`. Ganti dengan: `bottomZone(ctx)` → `{ members, top, x0, x1, label } | undefined`, cek legacy last-content memakai `zone.top`, cek unit terpotong, cek judul yatim. Pakai helper `finding`, `quote`, `num`.
- `packages/check/src/tree.ts` -- `BoardContext` (`nodes` urutan dokumen, `order`, `parentOf`, `bounds`), `isFlowChild`, `named`, `descendants`, `TOLERANCE`. Tambah helper murni bila perlu (mis. `visibleRect(ctx, node)` = bounds ∩ semua leluhur frame `clip:true` ∩ board).
- `packages/check/src/index.ts` -- ekspor konstanta baru bila ditambah; `checkBoard` tetap memanggil `lc20(ctx)`.
- `packages/check/src/index.test.ts` -- pembangun `docOf/frame/rect/text`, `clean()`, blok `describe('LC-20 …')` (baris 247–292) dan fixture enam aturan (baris 294–313, tab bar `Overlay /` y 736). Tambah fixture (a)–(f) di sini.
- `packages/daemon/src/index.test.ts` baris 678–752 -- tes integrasi LC-20 Chromium; harus tetap lulus.
- `packages/daemon/src/skills-examples.test.ts` -- semua contoh skill wajib 0 error/0 gerbang/0 warning.
- `packages/mcp/src/server.ts` baris 141 -- teks LC-20 di `LAYOUT_CHECK_DESCRIPTION`; perbarui ringkas (tes hanya `toContain('LC-20')`).
- `packages/check/README.md` baris 4 -- sebutan LC-20; perbarui satu frasa bila perlu.
- `packages/skills/skills/{core,mobile,api}.md` -- ubah HANYA bila contoh skill menghasilkan temuan.
- Arsip latihan read-only: `bench/runs/practice/{1..6}/P*-lakar/doc/*.lakar.json`. Skrip uji arsip siap pakai: `/tmp/claude-0/-root-lakar/ff3247e7-b8d6-48ae-acb4-dd6a2a7ac61e/scratchpad/archcheck.mjs` (start daemon dist port 0, dataDir sementara di scratchpad, assets symlink). Baseline saat ini: 22 dokumen, gate 0 semua.

## Tasks & Acceptance

**Execution:**
- [x] `packages/check/src/rules.ts` -- implementasikan zona bawah, tiga sub-cek, dan pesan sesuai Design Notes -- inti perubahan.
- [x] `packages/check/src/tree.ts` -- helper `visibleRect` (dan lainnya bila perlu), murni -- dipakai rules.
- [x] `packages/check/src/index.test.ts` -- fixture (a)–(f) + kasus: tumpukan dua anggota jadi satu zona, elemen absolut sebelum konten (z-order) bukan zona, absolut tanpa fill bukan zona, isi `Crop /` dinilai sebagai satu unit, hanya unit terluar yang dilaporkan, pesan tanpa istilah rubrik/juri; perbarui tes lama hanya bila format detail berubah -- bukti.
- [x] `packages/mcp/src/server.ts`, `packages/check/README.md` -- deskripsi LC-20 baru (ringkas) -- agen tahu aturan.
- [x] Skill (`packages/skills/skills/*.md`) -- hanya bila `skills-examples.test.ts` gagal karena LC-20 baru; perbaiki contoh agar 0 temuan.

**Acceptance Criteria:**
- Given dokumen arsip `bench/runs/practice/6/P3-lakar` dan `P2-lakar`, when `archcheck.mjs` dijalankan setelah `pnpm build`, then board `9J4GY5q3` mendapat LC-20 untuk konten ulasan yang terpotong bilah bawah dan board `MWLYK6Am` mendapat LC-20 untuk judul/isi "Episode baru".
- Given seluruh 22 dokumen arsip latihan 1–6, when diperiksa, then setiap temuan LC-20 baru dicatat dan diverifikasi terhadap PNG-nya (`bench/runs/practice/N/P*-lakar/png/<board>.png`) sebagai cacat nyata; temuan pada desain yang terlihat benar = positif palsu yang harus diperbaiki sebelum selesai.
- Given contoh skill, when `skills-examples.test.ts` dijalankan, then 0 error/0 gerbang/0 warning.
- Given latensi, when tes kinerja 500 node dan `archcheck.mjs` dijalankan, then tes kinerja tetap < 100 ms dan waktu layout_check per dokumen tidak naik berarti dibanding baseline (≈150–700 ms).

## Implementation Notes

- `bottomZone(ctx)` (diekspor) membangun zona: kandidat `Overlay /` (kedalaman mana pun, tanpa syarat fill/urutan) + frame/rect absolut ber-fill/`backdropBlur` anak board atau anak layar (frame anak board ≥ 90% lebar), lebar ≥ 50%; seed ≤ 48 px dari bawah, tumpukan `bottom ≥ Z − 8 ∧ y < Z`. Penutup per node (`covering`): anggota `Overlay /` selalu, anggota struktural hanya bila urutan dokumennya sesudah node (z-order), dan beririsan x. Label: satu anggota `"nama" (id)`, lebih `"a" + "b"`.
- `tree.ts`: `intersect`, `visibleRect` (bounds ∩ leluhur `clip:true` ∩ board), murni.
- Urutan penilaian: sub-cek 1 (posisi akhir) dulu; wadah terlapor → seluruh isinya dilewati. Lalu satu penelusuran atas-ke-bawah: unit terpotong (sub-cek 2) → subtree dilewati; bila bukan, frame diuji judul yatim (sub-cek 3) → subtree dilewati. Hasil: hanya temuan terluar.
- Penyimpangan dari Design Notes (untuk menghapus positif palsu arsip, semuanya tanpa syarat nama baru):
  1. Sub-cek 2 memakai bawah *terlihat* (`vis.bottom > Z − 8`) bukan bawah mentah, agar konten yang terpotong clip `Scroll /` di atas zona tetap tidak dilaporkan (pengecualian Scroll).
  2. Stroke sebagian sisi (garis pemisah baris, mis. `sides:['bottom']`) bukan kartu; frame seperti itu = unit *baris* yang dinilai dari gabungan isi terlihatnya (arsip 3/P3 `0vzUoxAF`: baris berakhir 736 dan sliver 2 px baris berikutnya hanya ruang kosong).
  3. Teks dinilai dari area tinta: bounds tanpa half-leading (`measure.texts[].lineHeight`) dan +0,1 em di atas (arsip 5/P3 `yBNLuU9M`: sliver 2 px kotak teks tanpa tinta).
  4. Sub-cek 1: bila konten terakhir adalah frame transparan (tanpa fill/stroke), turun ke konten terakhirnya sehingga padding bawah wadah tidak dihitung; penentuan "posisi akhir" tetap memakai anak langsung (arsip 5/P2 `yl7z700b`: wrapper ber-padding berakhir tepat di y mini player, kartu terakhir 18 px di atasnya).
- Tes daemon lama (`scroll akhir…`, `LC-20 batas bawah terlihat…`) diperbarui konsisten: wadah tetap tidak dievaluasi pada posisi awal, tetapi kartu yang memotong tab bar (y 664–814 / 632–790 vs tab bar 780) kini dilaporkan sebagai unit terpotong — persis skenario (a).
- Skill tidak diubah: `skills-examples.test.ts` lulus tanpa temuan.

### Verifikasi
- `pnpm build` exit 0; `vitest packages/check` + `tests/check-c7.test.ts` 81/81; daemon index + skills-examples + mcp 106/106; schema + bench judge + tests 204/204; `tools/node26/verify.sh` exit 0 (dijalankan tanpa PATH node-26 agar snapshot C9 cocok).
- Kinerja: 500 node 6,9 ms; 500 node + zona bawah 11,7 ms (< 100 ms).
- Arsip 22 dokumen (`archcheck.mjs`): temuan baru, semua diverifikasi pada PNG sebagai cacat nyata — 1/P2 `vL1AHrab` (3 sampul tile mengintip 6 px di atas mini player), 1/P3 `qDFcjZWc` (baris "Air" terpotong bilah bawah), 2/P2 `3wR6R1XL` (3 sampul tile terpotong mini player), 2/P3 `cRgb8A77` (ringkasan rating terpotong), 6/P2 `MWLYK6Am` (judul "Episode baru" yatim), 6/P3 `9J4GY5q3` (kartu ulasan terpotong). Dokumen lain gate 0. Latensi layout_check sama dengan baseline HEAD (6/P2 dingin ≈1,2 s di kedua versi karena muat aset; hangat ≈170 ms).

## Plan Change Log

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 5 findings — high 0, medium 2, low 2, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` Latar absolut setinggi layar (anak board, ber-fill, bawah ≤ 48) jadi seed zona → Z = 0, tumpukan berhenti dan isinya ikut dikecualikan — patch: kandidat struktural wajib tinggi ≤ 50% board (`Overlay /` lama tetap tanpa syarat); tes (b″).
  - `[medium]` `[patch]` `unitKind` menilai fill `image` sebelum pengecualian `Scroll /`/wadah utama/batas tinggi → latar gambar besar jadi unit "gambar" positif palsu dan subtree terlewati — patch: urutan diubah (Crop → Scroll/wadah utama → tinggi ≤ 50% → gambar → kartu); tes baru.
  - `[low]` `[patch]` Kartu dipotong clip `Scroll /` tepat di tepi zona dilaporkan "menempel … berakhir di y 780" padahal terpotong — temuan sesuai intent (terpotong di tepi zona), hanya kata-katanya salah; patch: "terpotong" ditentukan dari bawah mentah (kecuali teks/baris); tes baru.
  - `[false]` `[reject]` Tes daemon lama diubah melampaui teks detail — intent mewajibkan unit terpotong pada posisi awal dilaporkan, termasuk untuk `Overlay /` (kasus iterasi 6 memakai `Overlay /`); kedua tes lama memuat kartu yang memotong tab bar pada posisi awal (skenario (a)); perilaku wadah lama (tidak dievaluasi pada posisi awal) tetap diuji.
  - `[low]` `[reject]` `headingLike` menerima keturunan ber-stroke/rect — hasilnya tetap judul yang wajar (baris judul dengan tombol bergaris/aksen), masih dibatasi ukuran teks judul > isi; pengetatan menambah cabang tanpa kasus nyata.

## Design Notes

Konstanta: `GAP=48`, `MIN_W=0.5`, `CLEARANCE=8`, `TOLERANCE=0.5`, `ORPHAN_MIN_BODY=24` (px isi seksi yang harus terlihat), `HEADING_MAX_H=80`, `CARD_MAX_H_RATIO=0.5` (tinggi board).

**Kandidat anggota zona:** (1) legacy: node bernama `Overlay /` (kedalaman mana pun); (2) struktural: frame/rect yang absolut (`position:'absolute'` atau parent `layout` none) dan merupakan anak langsung board, atau anak langsung *layar* (frame anak board yang lebarnya ≥ 90% board), punya `fills` tidak kosong atau `backdropBlur`, bukan `Status bar`/`Home indicator`. Syarat ukuran keduanya: lebar ≥ 50% board. **Seed**: bawah anggota ≤ 48 px dari tepi bawah board. **Tumpukan**: ulangi tambah kandidat yang `bottom ≥ Z − 8` dan `y < Z` (menempel/menumpuk di atas zona). `Z` = y minimum anggota. Zona dipakai hanya untuk node yang urutan dokumennya sebelum anggota teratas yang menutupnya (z-order), bukan keturunan anggota zona/chrome, dan beririsan horizontal dengan rentang x zona.

**Sub-cek 1 (legacy, posisi akhir):** logika `lc20` sekarang dengan `or.y` → `Z`; wadah yang dilaporkan dicatat agar unit di dalamnya tidak dilaporkan dua kali.

**Sub-cek 2 (terpotong di tepi):** unit = teks tidak kosong, icon, node dengan fill `image`, frame `Crop /` (isinya dilewati), dan frame/rect *kartu* (fills atau stroke, tinggi ≤ 50% board, bukan `Scroll /`, bukan board/wadah utama). Telusuri pohon; unit dilaporkan bila `visibleRect` tidak kosong, `vis.top < Z − TOL` dan `bottom(raw) > Z − 8 + TOL`; unit terlapor → keturunannya dilewati. Unit yang `top ≥ Z` (seluruhnya di bawah zona) tidak dilaporkan.

**Sub-cek 3 (judul yatim):** frame F (kolom, ≥2 anak flow luas > 0, bukan zona/chrome/`Crop /`). Anak pertama H = teks atau frame tanpa fills/stroke/image yang keturunannya hanya teks/icon/frame tanpa fill; tinggi ≤ 80; terlihat utuh dan `bottom ≤ Z`; ukuran teks terbesar H > ukuran teks terbesar anak flow kedua (bila ada teks). Isi = anak flow sisanya: setiap anak terlihat < 24 px di atas Z, dan minimal satu berakhir > Z. Laporkan pada H; unit di dalam F tidak dilaporkan lagi.

Contoh pesan (detail · expected):
- `kartu terpotong zona bawah: terlihat y 662–738, tertutup "Overlay / Bilah bawah" (Xxxxxxxx) mulai y 738` · `seluruhnya di atas y 730 (zona − 8) atau seluruhnya di bawah zona: geser/padatkan konten di atasnya, atau akhiri layar pertama sebelum kartu ini`
- `judul seksi "Episode baru" di Seksi / Episode baru (id) terlihat, isinya tertutup zona bawah "Overlay / Mini player" + "Overlay / Tab bar" mulai y 690` · `tampilkan ≥ 24 px isi di atas y 690 atau pindahkan seluruh seksi ke bawah zona (akhiri layar pertama dengan rapi)`

## Verification

**Commands:**
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH pnpm build` -- expected: exit 0
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH npx vitest run packages/check` -- expected: semua lulus
- `cd /root/lakar && PATH=/opt/node-26/bin:$PATH npx vitest run packages/daemon/src/index.test.ts packages/daemon/src/skills-examples.test.ts packages/mcp` -- expected: semua lulus (sekuensial, satu proses vitest)
- `cd /root/lakar && SCRATCH=<scratchpad> /opt/node-26/bin/node <scratchpad>/archcheck.mjs bench/runs/practice/*/P*-lakar/doc/*.lakar.json` -- expected: temuan baru hanya cacat nyata (9J4GY5q3, MWLYK6Am termasuk)
- `cd /root/lakar && bash tools/node26/verify.sh` -- expected: exit 0

## Auto Run Result

Status: built

- **Ringkasan:** LC-20 kini memakai zona bawah struktural (`Overlay /` lama + frame/rect absolut ber-fill/backdropBlur anak board/layar, lebar ≥ 50%, tinggi ≤ 50%, seed ≤ 48 px dari bawah, tumpukan menempel jadi satu zona, z-order dihormati) dan tiga sub-cek: konten terakhir posisi akhir (lama), unit terpotong/menempel di tepi atas zona, judul seksi yatim. Hanya temuan terluar; severity error gerbang tetap.
- **File:** `packages/check/src/rules.ts` (zona + sub-cek), `packages/check/src/tree.ts` (`intersect`, `visibleRect`), `packages/check/src/index.ts` (ekspor), `packages/check/src/index.test.ts` (fixture (a)–(f) + kasus tepi), `packages/daemon/src/index.test.ts` (2 tes lama: kartu terpotong pada posisi awal kini temuan), `packages/mcp/src/server.ts` + `packages/check/README.md` (deskripsi LC-20).
- **Review (quick):** 3 patch (2 medium, 1 low), 0 defer, 2 ditolak (lihat triage log).
- **Follow-up review:** false — dua patch medium mengubah syarat kandidat/urutan unit secara lokal, tercakup tes baru dan cek arsip ulang tanpa perubahan hasil.
- **Verifikasi:** `pnpm build` exit 0; vitest check 74/74; daemon+mcp+schema+tests+bench 515/515 (sekuensial); arsip 22 dokumen latihan + 15 dokumen dataDir/arsip lain: temuan hanya pada 6 board cacat nyata (1/P2, 1/P3, 2/P2, 2/P3, 6/P2 `MWLYK6Am`, 6/P3 `9J4GY5q3`); `tools/node26/verify.sh` exit 0; `systemctl --user restart lakard` → active.
- **Risiko sisa:** `Overlay /` setinggi layar (scrim) masih membuat Z kecil (perilaku lama); unit dinilai per bounds, bukan piksel (gambar transparan/teks rata kanan bisa sedikit meleset); ambang 24 px isi seksi dan 8 px jarak adalah heuristik; golden set .pen tidak bisa dicek (pen.dev tidak disentuh).
