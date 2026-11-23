---
title: 'Desain revisi: blok About di Settings-Updates dan alur instal MCP ke harness'
type: feature
ticket: '11'
created: '2026-11-23'
status: built
baseline_revision: 'a538f6da25278abd32853084c9b464fbb11ee160'
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
      Kartu sidebar "Connect an agent" (tombol Copy MCP config) belum diarahkan ke section Install in an agent.
    evidence: |-
      Kartu ini ada di sidebar semua layar dashboard (section 01/02/11). Mengubahnya menyentuh banyak layar di luar section 11, jadi dibiarkan; story implementasi 12 bisa memutuskan apakah tombolnya membuka Settings → Connections.
    location: >-
      design/lakar-ui.pen (Sidebar, kartu Connect an agent)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Fatmuh menolak dua hal di desain Section 11 (2026-11-23). Pertama, blok About di Settings → Updates: garis pembatas atas dan bawahnya terlihat kasar dan berat. Kedua, layar koneksi MCP hanya bisa menyalin config JSON, padahal pengguna ingin Lakar memasang server MCP ke harness (Claude, Codex, Pi, OpenCode, dan lainnya) secara otomatis.

**Approach:** Lewat MCP Pencil, di Section 11 (`ZDg9M`) `design/lakar-ui.pen`:
- Tambah section About di ketiga layar Updates (dark dan light) dengan aturan pembatas Settings: hairline hanya di antara section, section terakhir tanpa garis bawah, isi tanpa kartu atau garis sendiri.
- Tambah kelompok baris Connections (dark/light) berisi lima layar salinan Connections `e7hIme`: Install to app, Confirm, Installed, Failed, Manual setup. Semua memakai komponen dan token yang ada (Button, Icon Button, Badge, Toast, Panel Tab, Nav Item, pola kartu Agents/Version, dialog Import from URL, Setup Card lama).
- Catat layar, id node, dan keputusan di `design/README.md`.

</intent-contract>

## Implementation Notes

Route oneshot: perubahan teks di repo hanya `design/README.md` dan plan ini; desain dikerjakan lewat tool `execute` Pencil, tanpa kode aplikasi.

Desain disetujui atas delegasi Fatmuh (terima jadi, 2026-11-23).

Keputusan desain tercatat lengkap di `design/README.md` bagian Section 11 (butir About dan Install to app). Ringkasnya:
- **About.** Daftar kunci-nilai (Version mono, Channel, Daemon, Data folder) + tombol sekunder Copy build info dan Open-source licenses. Garis pemisah hanya di antara section; section terakhir tanpa garis bawah. Draf About lama hanya ada di memori tab Pencil (section `iYLJg`, draf yang di-revert di `fcd2ded`), tidak di `main`, jadi About dibangun ulang dari nol di layar yang sudah di-commit.
- **Install in an agent.** Menggantikan "Add an agent" di layar salinan. Baris per harness dengan state Not installed (Install), Installed (Reinstall + More), Not found (ikon redup, hint Rescan, Install nonaktif), Failed (latar `danger-soft`, pesan `danger`, Set up manually + Try again), dan Other MCP client (Set up manually). Install → dialog Confirm (pratinjau entri dan catatan backup) → Toast sukses dengan Undo, atau state Failed. Set up manually membuka dialog berisi Setup Card lama (tab, path, Copy, blok kode) sebagai fallback salin-config.
- Supaya kolom muat 706px, layar salinan menghapus baris Gemini CLI di Connected agents dan section Tools exposed (di layar asli section itu sudah terpotong di bawah lipatan).

Catatan implementasi (2026-11-23):
- Tab Pencil untuk `design/lakar-ui.pen` masih memegang draf lama di memori (section `iYLJg`). Pekerjaan dilakukan di salinan `design/lakar-ui.op811.pen` (disalin dari disk, folder yang sama agar shader relatif terbaca), disimpan lewat tool `save` Pencil, lalu disalin kembali ke `design/lakar-ui.pen`. File salinan tidak di-commit (masuk `.git/info/exclude`).
- Node yang baru di-`Insert` sempat dilaporkan `ctx.problems` "fully clipped" padahal render benar (bounds basi, sama seperti catatan story 8.1). Layar dark diganti salinan segar dari layar light (tema `dark`) dan About pertama diganti salinannya; sesudah itu `ctx.problems` kosong untuk semua layar baru dan layar Updates.
- `git diff --numstat` terhadap `main`: sekitar 23 ribu tambah dan 213 "hapus". Yang "dihapus" hanya serialisasi; hash JSON node lama (Connections `e7hIme`, Settings `GM2nq`, baris section 11 lain, section Version/Automatic updates/What's new, dialog Import from URL, Settings Nav) identik dengan `main`.

## Review Triage Log

### 2026-11-23 — Review pass (quick)
- verdicts: high 0, medium 0, low 3, false 1

| # | Temuan | Verdict | Route | Bukti / tindakan |
|---|---|---|---|---|
| 1 | Layar Connections dasar tidak punya item nav Updates, beda dengan layar Settings section 11 | low | patch | Settings Nav diganti salinan nav section 11 (`nRM4O`) dengan Connections aktif. |
| 2 | Isi kolom (Daemon + Connected agents 3 baris + 5 baris instal) melebihi 706px | low | patch | Baris Gemini CLI dan section Tools exposed dibuang di layar salinan; pesan gagal dipendekkan supaya baris tetap satu baris. |
| 3 | Dialog Confirm dan Manual setup tidak di tengah vertikal | low | patch | `y` dialog diset 270 dan 190. |
| 4 | `ctx.problems` "fully clipped" di About pertama dan layar dark | false | reject | Bounds basi setelah `Insert`; export PNG menunjukkan semua node terlihat. Diganti salinan segar, laporan hilang. |

## Auto Run Result

- Ringkasan: blok About baru di 6 layar Settings → Updates (pembatas hanya di antara section) dan kelompok baris Connections (`pbiwF` dark / `Tqilj` light) berisi 5 layar alur Install in an agent, semuanya dari komponen dan token yang ada.
- File:
  - `design/lakar-ui.pen`: section About di layar Updates, baris Connections baru.
  - `design/README.md`: tabel struktur, daftar baris, tabel layar, keputusan About dan Install to app, catatan audit.
  - plan ini.
- Verifikasi:
  - Export PNG (scale 1) dan screenshot Pencil untuk setiap layar baru/berubah, dark dan light.
  - `ctx.problems` kosong untuk 10 layar Connections dan 6 layar Updates (kecuali View Toggle header yang diwarisi dari layar dasar).
  - Hash node lama identik dengan `main`.
- Risiko sisa: tab Pencil yang terbuka untuk `design/lakar-ui.pen` masih memegang draf lama. Jangan simpan dari tab itu; tutup tanpa menyimpan, lalu buka ulang dari disk.

## Verification

**Manual checks (if no CLI):**
- Screenshot setiap layar baru lewat Pencil: tidak ada node yang terpotong atau meluap.
- Setiap layar dark punya pasangan light dengan `theme.mode = light`; warna baru memakai variabel (`$...`), kecuali latar ikon Toast sukses `#22C55E26` yang sama dengan Toast "Copied as PNG" yang sudah ada.
- `design/README.md` mencantumkan baris Connections, layar, id node, dan keputusan.
