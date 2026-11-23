---
title: 'Tinggi board landing mengikuti isi'
type: feature
ticket: ''
created: '2026-11-23'
status: built
baseline_revision: '32c93848cccc2f10580ef4facdb3dd5b364f9b76'
route: full
route_source: auto
risk: low
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dokumen `landing-kopi-lereng` menyisakan ruang kosong 24 px di bawah footer (board 4074, isi 4050). Tinggi board landing berupa angka tetap, dan `landing.md` menyuruh agen `update(keep.board, {height:…})` dengan angka yang dalam praktik ditebak. `check` tidak menangkapnya: LC-12 hanya menilai "tinggi pas" untuk board mobile panjang.

**Approach:** (a) LC-12 mendapat cabang landing: board landing tanpa `expectedSize` dan tanpa prefiks `[WIP] ` yang punya ruang kosong > 8 px di bawah anak flow terakhir → warning "tinggi pas = N" dengan hint `update(board, {height:N})`. Hanya wadah `height:'fill'` yang isinya rata atas yang dibongkar; padding bawahnya dihitung isi. (b) `landing.md` menyuruh mengambil tinggi akhir dari `bounds`, bukan menebak, dan menindaklanjuti LC-12.

## Boundaries & Constraints

**Always:**
- AD-4: rule ID, level, dan bentuk temuan LC-12 tetap; keluaran check hanya bertambah entri (board landing yang dulu tanpa temuan). Pesan mobile dan aturan lain tidak berubah.
- Aturan murni di `packages/check` (tanpa IO), memakai `BoardContext` dan bounds terukur.
- Anggaran skill: muat landing tidak naik (pemangkasan setara).

**Never:**
- Tidak ada tinggi `hug` untuk board (skema board `height` = angka; perubahan skema butuh `schemaVersion` baru) di spec ini.
- Board `[WIP] ` tidak dinilai: seksi masih ditambah antar-execute, dan memangkas di tengah pembangunan memotong seksi berikutnya.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Insiden | landing 1440×4074, isi berakhir 4050 | warning LC-12 `tinggi 4074, isi berakhir 24 px di atas tepi bawah: tinggi pas = 4050` | bukan gerbang |
| Pas | tinggi = bawah isi, atau sisa ≤ 8 px | tanpa temuan | — |
| Masih dibangun | nama diawali `[WIP] ` | tanpa temuan tinggi | — |
| Board kosong | tanpa anak flow | tanpa temuan | — |
| expectedSize | landing dengan `expectedSize` | cabang lama (ukuran persis) | — |
| Padding bawah | wadah hug berpadding bawah | padding = isi, tanpa temuan | — |
| Wadah fill | `Halaman` `height:'fill'`, isi rata atas | bawah anak flow terakhir + padding bawah wadah | — |
| Wadah fill isi di tengah | kolom `justify:'center'` / baris `align:'center'` | wadah = isi, tanpa temuan | — |
| Frame bertinggi angka | hero `height:900` di board 900, footer `height:400` di dasar | frame = isi utuh, tanpa temuan | — |
| Overlay | `Overlay /` absolut di bawah isi | tidak dihitung isi | — |
| Lebar salah | landing 1280 | temuan ukuran lama, tanpa cabang tinggi | — |

</frozen-after-approval>

## Code Map

- `packages/check/src/rules.ts` -- `LANDING_SLACK_MAX`, `stackBottom()`, cabang landing di `lc12` (setelah cabang mobile `FIT_SLACK_MAX`).
- `packages/check/src/index.ts` -- ekspor `LANDING_SLACK_MAX`.
- `packages/check/src/index.test.ts` -- `describe('LC-12 board')`: kasus matriks.
- `packages/mcp/src/server.ts` -- deskripsi LC-12 di `LAYOUT_CHECK_DESCRIPTION` menyebut tinggi pas landing.
- `packages/skills/skills/landing.md` -- kalimat pembuka + keterangan contoh execute penutup.
- `tests/support/selection-fixture.ts`, `packages/mcp/src/selection-flow.test.ts` -- tinggi board fixture = bawah isi (658).

## Tasks & Acceptance

**Execution:**
- [x] `rules.ts` -- `stackBottom(ctx)`: anak flow terbawah board; turun ke dalam frame `height:'fill'` rata atas (`topAligned`) yang mencapai tepi bawah board sambil menjumlah padding bawahnya; frame hug atau bertinggi angka = isi. Cabang `lc12`: `screen==='landing'`, tanpa `expectedSize`, bukan `[WIP] `, `h − end > 8 + TOLERANCE` → detail + expected.
- [x] Tes check untuk semua baris matriks.
- [x] `landing.md` -- "tinggi akhir dari `bounds`, bukan tebakan; `LC-12` "tinggi pas = N" → `update(keep.board,{height:N})`"; anggaran tetap di bawah batas.
- [x] Deskripsi LC-12 di MCP.

**Acceptance Criteria:**
- Given board landing selesai (tanpa `[WIP] `) dengan ruang kosong 24 px di bawah footer, when execute atau `layout_check` berjalan, then check memuat warning LC-12 "tinggi pas = 4050" beserta `update(board, {height:4050})`.
- Given board landing yang tingginya sama dengan bawah isi, when check berjalan, then tidak ada temuan LC-12 baru.
- Given contoh teruji `landing.md`, when `skills-examples.test.ts` dijalankan, then tetap 0 error / 0 warning.

## Implementation Notes

- **Keputusan: perluas LC-12, bukan aturan LC-33 baru.** LC-12 sudah berarti "ukuran atau posisi board" dan cabang mobile sudah memakai pola "tinggi pas = N" yang diajarkan `mobile.md`. Aturan baru akan menambah entri `G0_RULES` (nama dibekukan bench), `RULE_ORDER`, label viewer, dan deskripsi MCP tanpa manfaat bagi agen.
- **Keputusan: ambang 8 px** (`LANDING_SLACK_MAX`), bukan 32 px mobile. Kontrak landing adalah tinggi = bawah seksi terakhir, jadi sisa kecil pun salah; 8 px memberi ruang pembulatan subpiksel dan tetap menangkap insiden 24 px.
- **Keputusan: padding bawah dihitung dari wadah, bukan board.** Board tidak punya `padding` di skema; ruang bawah yang disengaja diwujudkan sebagai padding wadah atau seksi. Wadah hug memasukkan padding-nya ke bounds; wadah setinggi board dinilai dari anaknya + padding bawahnya.
- **Keputusan: lewati `[WIP] `.** Selama dibangun, board sengaja lebih tinggi (2000–6000). Cabang ini baru menilai setelah execute penutup melepas `[WIP] `; bila tinggi tebakan masih meleset, agen menerima satu warning dengan angka pasti.
- Tinggi `hug` untuk board ditunda (butuh skema baru); lihat bagian Ditunda di bawah.
- **Fixture yang tersentuh aturan baru (satu):** `tests/support/selection-fixture.ts` membuat board landing `Kopi / Beranda` 1440×900 tanpa `[WIP] `, padahal isinya berakhir di 658. LC-12 baru melapor `tinggi pas = 658`, dan tes `skills-examples` (selection.md) serta `selection-flow` menuntut LC-07 sebagai satu-satunya temuan fixture. Tinggi fixture diubah ke 658 (= bawah isi) agar maksud fixture tetap; `selection-flow.test.ts` menyesuaikan `bounds` seleksi `[0,0,1440,658]`. Varian responsif dari fixture tetap lega (tinggi awal dihitung dari luas sumber) dan lolos tanpa temuan baru. Fixture korpus/golden lain tidak memicu aturan ini (seluruh `pnpm test` dibandingkan dengan baseline).
- **Wadah vs seksi.** Hanya frame `height:'fill'` yang isinya rata atas (kolom `justify` start, baris `align` start/stretch) yang dibongkar. Frame bertinggi angka tidak bisa dibedakan dari seksi (hero 900 di board 900), jadi dihitung utuh sebagai isi; wadah `Halaman` bertinggi angka yang lebih panjang dari isinya tidak terlapor (negatif palsu yang diterima, lihat triage #1).

## Ditunda

- **Tinggi board `hug` (ikut isi).** Board saat ini selalu `height` angka dan selalu clip. Tinggi ikut isi menghapus kebutuhan angka sama sekali, tetapi butuh perubahan skema (`schemaVersion` v8 + migrasi), renderer, viewer (resize), dan codegen. Usul: `height:'hug'` hanya untuk `screen:'landing'`, diukur saat render.

## Review Triage Log

**Pass 1 (quick, kritik diri + satu reviewer independen):** medium 2, low 1, semua patch. Reviewer mengonfirmasi pengecualian Overlay/absolut, `expectedSize`, dan `[WIP] ` benar, serta AD-4 terjaga.

| # | Temuan | Verdict | Rute | Bukti |
|---|---|---|---|---|
| 1 | Wadah bertinggi angka dari y 0 sampai dasar tak bisa dibedakan dari seksi: board 1440×900 berisi `Seksi / Hero` `height:900` ikut dibongkar dan dilapor | medium | patch | Hanya `height:'fill'` yang dianggap wadah; tes hero 900 tanpa temuan |
| 2 | Wadah fill dengan `justify:'center'` (kolom) atau `align:'center'` (baris) membagi celah; saran tinggi hanya mengurangi separuh celah dan LC-12 muncul lagi | medium | patch | `topAligned()`; wadah tak rata atas = isi; dua tes |
| 3 | Seksi footer bertinggi tetap yang menyentuh dasar (ruang bawah disengaja) dibongkar → saran tinggi memotong footer | low | patch (kritik diri, sebelum #1) | Tes footer `height:400` tanpa temuan |
| 4 | Perubahan fixture seleksi 900 → 658 dianggap gejala positif palsu | false | ditolak | Fixture berisi dua seksi hug langsung di board yang berakhir di 658; 242 px kosong di bawahnya memang kasus yang dituju aturan. Perubahan dipertahankan |

## Verification Results

- `pnpm build` sukses. `pnpm test` (Windows): himpunan kegagalan sama persis dengan baseline `32c9384` di mesin yang sama (kegagalan khas Windows di AGENTS.md); tes `packages/check` 237 lulus, `skills-examples` selection.md dan landing.md lulus.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 test` -- expected: hijau kecuali kegagalan khas Windows (AGENTS.md); CI Linux acuan.
