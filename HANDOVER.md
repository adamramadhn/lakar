# HANDOVER — posisi pekerjaan Lakar (2026-11-22)

Catatan serah-terima untuk melanjutkan di ADE atau IDE lain. Aturan dan jebakan repo ada di [AGENTS.md](AGENTS.md).

## Branch dan PR

Semua PR ada di repo GitHub `fatmuh/lakar` (dulu `adamramadhn/lakar`; alamat lama di-redirect).

| Branch | Isi | PR | Status |
|---|---|---|---|
| `claude/desktop-tauri-f5e05a` | Aplikasi desktop Tauri + release workflow + halaman Connections (MCP) | #5 → `main` | CI hijau, **perlu approval reviewer** |
| `claude/app-design-parity` | Semua fitur edit di aplikasi + audit desain (lihat di bawah) | #6 → `claude/desktop-tauri-f5e05a` | Draft, CI hijau |
| (sudah di-merge ke `claude/app-design-parity`) | #7 presence agen, #8 search + Settings General, #9 tab title bar + window chrome, #10 Pages, #11 tablet/mobile, #12 folder | — | Merged |

**Urutan ke `main`:**
1. Approve dan merge #5.
2. Ubah base #6 ke `main`.
3. Perbarui deskripsi #6, keluarkan dari draft, lalu merge.
4. Push tag `v0.1.0`. `release.yml` membangun installer Windows/macOS/Linux dan menerbitkan GitHub Release beserta `SHA256SUMS.txt`.

## Isi `claude/app-design-parity`

Spec per fitur ada di `_bmad-output/implementation-artifacts/`.

| Fitur | Spec |
|---|---|
| Kelola file: New file + preset board, rename, duplicate, archive, delete, halaman Files/Archive | `spec-app-1-file-management.md` |
| Export PNG 1x/2x, Copy as CSS/Tailwind/JSON, unduhan desktop ke Downloads | `spec-app-2-export-copy.md` |
| Snapshot per rev, History Restore/Compare/pratinjau | `spec-app-3-history-restore.md` |
| Sisip/hapus layer manual (Frame, Rectangle, Ellipse, Text, Image, Icon), Undo | `spec-app-4-manual-layers.md` |
| Presence agen (cursor, outline, "Just changed") | `spec-app-5-agent-presence.md` |
| Search dropdown, Settings General | `spec-app-6-dashboard-search-settings.md` |
| Tab multi-dokumen, window chrome desktop | `spec-app-7-titlebar-tabs.md` |
| Kelola Pages | `spec-app-8-pages.md` |
| Layout tablet/mobile | `spec-app-9-viewer-responsive.md` |
| Folder + Move to… | `spec-app-10-folders.md` |

Perubahan sesudah gelombang fitur di atas:
- **Perbaikan tulis di Windows** (`1b6b60c`). Sebelumnya New file dan semua commit gagal dengan `EPERM fsync`. Smoke test release kini juga membuat dan menduplikasi file.
- **Sinkron antar-jendela.** Event `change` dikirim untuk penulisan dari aplikasi. Cache blob dan ukuran snapshot dibatasi.
- **Audit desain Dashboard dan Viewer.** Celah visual dan state ditutup, error daemon diterjemahkan ke pesan Inggris, dan aksesibilitas kartu diperbaiki.

**Installer uji terakhir:** artefak run GitHub Actions `44963466533` di workflow "Release desktop".

## Langkah berikutnya

1. **Uji installer di mesin nyata.** Hal-hal ini belum diverifikasi:
   - window chrome (min/max/close, drag),
   - Export PNG masuk ke Downloads,
   - tray (tutup lalu buka lagi),
   - layar "Chrome atau Edge tidak ditemukan",
   - peringatan Gatekeeper/SmartScreen karena build belum ditandatangani.

   Log daemon ada di `<app-log>/lakard.log`.
2. **Bawa ke `main`.** Ikuti urutan di bagian "Branch dan PR".
3. **Item tertunda.** Lihat `_bmad-output/implementation-artifacts/deferred-work.md`. Yang paling relevan:
   - pembuatan dokumen oleh agen (MCP) belum langsung menyegarkan daftar Dashboard;
   - tes integrasi handler unduhan Tauri;
   - kemungkinan display name file yang terpisah dari slug.
4. **Bagian desain yang sengaja belum dibuat** karena belum ada data atau tujuannya:
   - Learn, What's new/Feedback, Drafts/Shared, Notifications, Profile/Language;
   - "Agent sees your selection" (butuh tool MCP baru).

## Merapikan lingkungan lokal

- Worktree lama ada di `.claude/worktrees/`. Hapus dengan `git worktree remove <path>` bila tidak dipakai lagi.
- Checkout utama `D:\Work\Personal\lakar` mungkin masih menunjukkan `design/lakar-ui.pen` sebagai modified. Salinannya sudah di-commit di `claude/app-design-parity`.
