---
title: 'Desain UI adopsi open-pencil di lakar-ui.pen'
type: feature
ticket: '1'
created: '2026-11-23'
status: built
baseline_revision: 'fcd2ded2c15a0141ed642ddedde0b4346dfa0116'
route: oneshot
route_source: auto
risk: low
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 1
followup_review_recommended: false
context: ['{project-root}/design/README.md']
warnings: []
deferred:
  - summary: >-
      Tabel Struktur dokumen di design/README.md belum mencantumkan section 05 sampai 10.
    evidence: |-
      Tabel hanya memuat 00 sampai 04 sebelum story ini; section 05 sampai 10 ditambahkan story lain tanpa memperbarui tabel. Bukan disebabkan story 8.1.
    location: >-
      design/README.md:29
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 5–10 epic `epic-adopsi-open-pencil` menambah UI baru (snapping dan smart guide, pengukur jarak Alt+hover, zoom 100% dan zoom ke seleksi, Wrap dan gap baris di auto layout, Copy as PNG, dialog impor URL, Import/Export DTCG di panel Theme, Settings → Updates dan banner update), tetapi aturan C6 mewajibkan desainnya ada dulu di `design/lakar-ui.pen`.

**Approach:** Tambah section baru `11 · Editor ergonomics & import` di `lakar-ui.pen` lewat MCP Pencil, dengan pola section 10: header, baris Components (sheet dark dan light), lalu tiga kelompok baris (Canvas & Design panel, Import & tokens, Updates), masing-masing Dark lalu Light, berisi layar desktop 1440×900 yang disalin dari layar yang sudah ada (Editor, Theme, Import CSS, Settings, Recents) supaya komponen, token, grid, dan tipografi tetap sama. Versi light adalah salinan versi dark dengan `theme.mode = light`. Catat section, layar, dan id node di `design/README.md`.

</intent-contract>

## Implementation Notes

Route oneshot: perubahan teks di repo hanya `design/README.md`; desain dikerjakan lewat tool `execute` Pencil, tanpa kode aplikasi.

Riwayat: draf pertama (commit `b688146`, `9d9fcb2`, `cee64a2`) dinilai berantakan, terutama layar Settings dan updater, lalu di-revert di `fcd2ded`. Plan ini mencatat pengerjaan ulang dari nol di atas `fcd2ded` (isi `.pen` sama dengan `main`). Struktur draf lama tidak dipakai ulang.

Keputusan desain (atas delegasi Fatmuh, terima jadi 2026-11-23) tercatat lengkap di `design/README.md` bagian Section 11. Ringkasnya:
- Setiap layar adalah salinan layar yang sudah ada, lalu diubah seperlunya. Tidak ada layout baru yang dikarang.
- Komponen baru hanya dua: Smart Guide dan Distance Label (warna `danger`). Sisanya memakai komponen lama: Menu Item, Toast, Segmented Control, Field, Input, Button, Icon Button, Nav Item, Layer Row, Tool Button.
- Settings → Updates mengikuti struktur Settings → General (Section Intro 220 + Section Fields, garis bawah, Spacer 28) sesuai umpan balik pengguna, dengan kartu status dari Settings → Connections.
- Banner update memakai pola Offline Banner dari Dashboard — Offline.

Catatan implementasi (2026-11-23):
- Tab Pencil untuk `design/lakar-ui.pen` masih memegang draf lama di memori (section `iYLJg`). Supaya tidak tertimpa, pekerjaan dilakukan di salinan bersih `design/lakar-ui.op81.pen` (disalin dari disk pada `fcd2ded`, di folder yang sama agar shader relatif tetap terbaca), disimpan lewat tool `save` Pencil, lalu disalin kembali ke `design/lakar-ui.pen`. File salinan tidak di-commit.
- Hasil: `git diff --numstat` terhadap `fcd2ded` untuk `lakar-ui.pen` = 93305 tambah, 0 hapus. Section 00–10 tidak berubah.
- Section 11 = `ZDg9M`, 15 layar dark + 15 light, plus sheet komponen dark/light.

## Review Triage Log

### 2026-11-23 — Review pass (quick, pengerjaan ulang)
- verdicts: high 0, medium 0, low 4, false 1

| # | Temuan | Verdict | Route | Bukti / tindakan |
|---|---|---|---|---|
| 1 | Teks detail kartu versi meluap ke bawah tombol | low | patch | Detail diubah ke `fixed-width` + `fill_container`, teks dipersingkat. Dicek ulang lewat screenshot. |
| 2 | Grup Effects di panel Design terpotong 3px setelah baris Wrap ditambah | low | patch | Baris Inner shadow dinonaktifkan di layar Wrap. |
| 3 | Pointer putih tidak terlihat di versi light | low | patch | Pointer di atas menu diganti `#111111` di salinan light. |
| 4 | `ctx.problems` melaporkan chip Wrap dan baris Row Wrap "fully clipped" | false | reject | Bounds basi setelah `Replace`/`Move` di panggilan yang sama; screenshot menunjukkan semua node terlihat dan susunannya benar. Setelah file dibuka ulang dari disk, laporan itu hilang. |
| 5 | Badge "Unsupported" lebih lebar dari kolom Status di dialog DTCG | low | patch | Kolom Status 72 → 84, kolom path 190 → 178 (dark dan light). Setelah dibuka ulang, `ctx.problems` section 11 hanya berisi kartu "Feature Spatial design" yang diwarisi dari layar dasar `fdf6D`. |

## Auto Run Result

- Ringkasan: section `11 · Editor ergonomics & import` (`ZDg9M`) ditambahkan ke `design/lakar-ui.pen`, berisi 15 layar desktop dark dan 15 light untuk story 8.5–8.10 plus sheet komponen. Semua layar disalin dari layar yang sudah ada dan memakai komponen serta token yang sudah ada.
- File:
  - `design/lakar-ui.pen`: section 11 baru, hanya penambahan.
  - `design/README.md`: baris tabel struktur dan bagian Section 11 (layar, id node, keputusan).
  - plan ini.
- Verifikasi:
  - Screenshot Pencil untuk setiap layar dark, panel yang padat (canvas, panel Design, dialog, kartu Settings), contoh layar light, dan seluruh section.
  - Peringatan `fill_container` hanya pada node yang dinonaktifkan dan master Segmented Control lama.
  - Diff terhadap baseline hanya penambahan.
- Risiko sisa: tab Pencil yang terbuka untuk `design/lakar-ui.pen` masih memegang draf lama di memori. Jangan simpan dari tab itu; tutup tanpa menyimpan, lalu buka ulang dari disk.

## Verification

**Manual checks (if no CLI):**
- Screenshot setiap layar baru lewat `TakeScreenshot` Pencil: tidak ada node yang terpotong atau meluap.
- Setiap layar dark punya pasangan light dengan `theme.mode = light`, dan semua warna baru memakai variabel (`$...`), kecuali warna pointer dan sorotan gap yang memang konstan.
- `design/README.md` mencantumkan section 11, layar, dan id node.
