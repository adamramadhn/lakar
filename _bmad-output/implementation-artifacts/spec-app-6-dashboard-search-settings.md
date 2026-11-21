---
title: 'Aplikasi 6: dropdown Search di Dashboard dan Settings → General'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: '81952c86804969be670ebd496537bfce8ab4a724'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/design/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Kotak Search di sidebar hanya memfilter grid, belum ada dropdown hasil seperti desain 02 ("Dashboard — Search", "Dashboard — Search No Results"). Menu Settings langsung ke Connections; halaman Settings → General ("Settings — Dark/Light", tablet/mobile) belum ada, jadi tema tidak bisa dipilih dan lokasi data lakard tidak terlihat.

**Approach:**
- Dropdown hasil di bawah kotak Search: file yang cocok (thumbnail mini, nama, subjudul), navigasi ↑/↓/Enter/Escape, Enter membuka file. Tanpa hasil: pesan + tombol "New file “<query>”" yang membuka dialog New file yang sudah ada dengan nama terisi.
- Halaman `#/settings` (General) dengan sub-nav General / Connections: bagian Appearance (Light / Dark / System, disimpan di localStorage, langsung diterapkan) dan bagian lokal dari `GET /status` (folder data, alamat server, versi).

## Boundaries & Constraints

**Always:**
- Teks UI bahasa Inggris, mengikuti desain (`No files match “q”`, `Create it as a new file, or ask your agent.`, `↑↓ navigate`, `↵ open`, `esc close`).
- Search mencari file aktif (`api.listDocs`), tidak peka huruf besar, cocok di slug; maksimal 8 hasil, urutan sama dengan daftar (terbaru dulu). Filter grid Recents/Files/Archive tetap seperti sekarang.
- Pola ARIA combobox: input `role=combobox`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; daftar `role=listbox` dengan `role=option`.
- Escape pertama menutup dropdown; Escape saat dropdown tertutup mengosongkan query. Klik di luar / blur menutup. Fokus + query tidak kosong membuka lagi.
- Tema: pilihan `system | light | dark` di `localStorage['lakar.viewer.theme']` (nilai rusak → `system`). Diterapkan sebelum render pertama lewat atribut `data-theme` di `<html>`; `system` mengikuti `prefers-color-scheme` dan berubah saat OS berubah. Perubahan di tab lain ikut (event `storage`).
- Route: `#/settings` dan `#/settings/general` → General; `#/settings/connections` tetap. Item sidebar "Settings" ke `#/settings` dan aktif di kedua halaman.
- Desktop: sub-nav vertikal 200px di kiri isi; ≤768px: sub-nav menjadi tab horizontal di atas isi (desain mobile/tablet); bagian (intro + isi) bertumpuk.

**Never:**
- Profile, foto, email, Language, Notifications (butuh akun / belum ada) — tidak ditampilkan.
- Tidak mengubah route daemon / tool MCP. Tidak mengedit `Canvas.tsx`, `Viewer.tsx`, `apps/desktop`; `App.tsx` hanya baris judul tab untuk route baru.
- Tidak ada dependensi baru.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ada hasil | query `wa`, file `creative-waterfall` | Dropdown label "Files", baris pertama aktif, Enter → `#/d/creative-waterfall` | N/A |
| Navigasi | ↓ di baris terakhir | kembali ke baris pertama (wrap); ↑ di pertama → terakhir | N/A |
| Tanpa hasil | query `pricing` | ikon search-x, `No files match “pricing”`, tombol `New file “pricing”` → dialog New file dengan nama `pricing` | N/A |
| Query spasi | `"   "` | dropdown tidak tampil | N/A |
| Daftar belum dimuat / gagal | `docs` undefined | dropdown tidak tampil | N/A |
| Tema rusak | localStorage `"blue"` atau akses melempar | dianggap `system` | try/catch |
| Status gagal | `/status` error/offline | bagian lokal menampilkan "Unavailable" | tidak melempar |

</frozen-after-approval>

## Code Map

- `packages/viewer/src/Dashboard.tsx` -- sidebar + halaman; `<label className="search">` diganti `<Search>`; Settings link + render halaman General; `NewFileDialog` dipanggil dengan nama awal.
- `packages/viewer/src/Dashboard.tsx` `Thumb`/`thumbnail` -- dipindah ke `Thumb.tsx` agar Search bisa memakainya tanpa impor melingkar.
- `packages/viewer/src/NewFileDialog.tsx` -- tambah prop `initialName` (default `Untitled`).
- `packages/viewer/src/files.ts` -- `Route`/`parseRoute` (+ `settings`), helper murni `searchDocs`; diuji di `files.test.ts`.
- `packages/viewer/src/App.tsx` -- hanya peta judul tab (`settings: 'Settings · Lakar'`); file milik sesi lain.
- `packages/viewer/src/tokens.css` -- blok gelap pindah dari `@media (prefers-color-scheme: dark)` ke `:root[data-theme='dark']`.
- `packages/viewer/src/main.tsx` -- panggil `initTheme()` sebelum render.
- `packages/viewer/src/Connections.tsx` -- pakai ulang `copyText`; tampilan Connections dibungkus layout Settings yang sama.
- `api.status()` / `DaemonStatus` (`version`, `host`, `port`, `dataDir`) -- data bagian lokal; jangan ubah tipenya kecuali menambah field opsional.

## Tasks & Acceptance

**Execution:**
- [x] `packages/viewer/src/files.ts` + `files.test.ts` -- route `settings`, `searchDocs(docs, q, limit)` -- logika murni teruji.
- [x] `packages/viewer/src/theme.ts` + `theme.test.ts` -- `parseTheme`, `resolveTheme(pref, systemDark)`, `initTheme`, `setTheme`, `useTheme` -- tema tersimpan & diterapkan.
- [x] `packages/viewer/src/tokens.css`, `main.tsx` -- atribut `data-theme`.
- [x] `packages/viewer/src/Thumb.tsx` -- pindahan `Thumb`.
- [x] `packages/viewer/src/Search.tsx` -- combobox + dropdown (posisi `fixed` dari rect input, lebar 340px dibatasi viewport, agar tidak terpotong `overflow` sidebar).
- [x] `packages/viewer/src/SettingsGeneral.tsx` -- layout Settings (judul, sub-nav/tab) + Appearance + bagian lokal (Data folder + Copy, Server, Version).
- [x] `packages/viewer/src/Dashboard.tsx`, `NewFileDialog.tsx`, `App.tsx` -- sambungkan.
- [x] `packages/viewer/src/app.css` -- gaya dropdown, settings, kartu tema, responsif.

**Acceptance Criteria:**
- Given Dashboard terbuka, when pengguna mengetik di Search, then dropdown hasil tampil sesuai desain gelap/terang dan grid tetap terfilter.
- Given tema `Light` dipilih di Settings, when halaman dimuat ulang, then tampilan tetap terang walau OS gelap.
- Given lebar 375px, when membuka `#/settings`, then tab General/Connections tampil di atas dan tidak ada scroll horizontal.

## Implementation Notes

- `SETTINGS_HASH` ada di `files.ts` (App.tsx hanya boleh diubah di baris judul). Sub-nav Settings dibentuk saat render karena App ↔ Dashboard ↔ SettingsGeneral saling impor (konstanta App belum terinisialisasi saat modul dievaluasi).
- Tata letak Settings memakai container query pada `.main.settings-main` (bukan media query jendela): isi ≤ 640px → tab horizontal, ≤ 900px → bagian bertumpuk. Di jendela 769–1100px sidebar 300px membuat isi terlalu sempit untuk kolom sub-nav 200px.
- Dropdown Search di-portal ke `<body>` (`position: fixed` dari rect kotak Search, lebar `min(340, viewport − left − 8)`), `mousedown` di dropdown di-`preventDefault` agar input tidak blur. Escape di-`preventDefault` supaya `type=search` tidak mengosongkan sendiri pada Escape pertama.
- Pratinjau kartu tema memakai warna tetap (nilai bg/sidebar/border dari tokens.css), karena harus menggambar tema tertentu, bukan tema aktif.
- Bagian lokal diberi judul "This computer" (desain belum punya bagian ini).

## Spec Change Log

## Review Triage Log

| # | Sumber | Temuan | Verdict | Rute / bukti |
|---|--------|--------|---------|--------------|
| 1 | blind, edge | Kilat tema terang sebelum `initTheme()` (script modul ditunda) | medium | patch: skrip inline di `index.html` |
| 2 | blind, edge | Enter di keadaan tanpa hasil tidak melakukan apa-apa | medium | patch: Enter → `create()`, footer "↵ create" |
| 3 | edge | Enter saat komposisi IME membuka file | low | patch: abaikan `isComposing` (koreksi langsung) |
| 4 | blind, edge | Di Archive dropdown bilang "No files match" padahal grid menampilkan arsip | medium | patch: dropdown tidak tampil di Archive |
| 5 | blind, verif | `CONNECTIONS_HASH` ganda (App.tsx dan files.ts) | low | patch: App me-re-export dari files.ts + tes parseRoute |
| 6 | blind | Baris aktif lama saat dropdown dibuka lagi | low | patch: reset ke 0 saat terbuka |
| 7 | blind | Escape tetap di-preventDefault walau tak ada yang ditutup | low | patch: tangani hanya saat terbuka / query ada |
| 8 | edge | `overflow: hidden` + max-height min 120px memotong isi di jendela pendek | low | patch: `overflow-y: auto` |
| 9 | blind | radiogroup tanpa navigasi panah | medium | patch: tombol `aria-pressed` dalam `role=group` |
| 10 | verif | Notifikasi subscriber tema tidak dites | medium | patch: ekspor subscribe + tes |
| 11 | verif | Logika wrap ↑/↓ tidak dites | low | patch: helper murni `wrapIndex` + tes |
| 12 | blind, verif | Filter grid peka huruf besar, dropdown tidak | false | slug selalu huruf kecil (`slugify` daemon), kasus `Wa-upper` tidak bisa terjadi |
| 13 | edge | Lebar dropdown 0 bila kotak di luar layar | false | drawer tertutup = input tidak fokus, dropdown tidak tampil |
| 14 | edge | Posisi basi bila sidebar reflow tanpa scroll/resize | low | ditolak: jarang, perbaikan menambah ResizeObserver |
| 15 | edge | `MediaQueryList.addListener` untuk Safari lama | low | ditolak: WebView2/Chromium modern |
| 16 | edge | New file dari query yang sama dengan slug arsip | false | dialog menampilkan slug bersufiks dari `taken` (termasuk arsip) dan server memberi sufiks |
| 17 | blind | Query tetap aktif di halaman Settings | low | ditolak: perilaku lama filter, tidak merugikan |
| 18 | blind | Warna pratinjau tema di-hardcode | false | nilai `#EFEFEF`/`#2C2C2C` diambil dari desain (node Preview), bukan token aplikasi |
| 19 | blind | `/status` diambil dua kali | low | ditolak: dua permintaan lokal murah, refaktor props |
| 20 | blind | `role=status` diumumkan ulang tiap ketikan | low | ditolak: perlu region live terpisah |
| 21 | blind, verif | Layar awal desktop (`apps/desktop/ui`) mengikuti OS, bukan pilihan tema | medium | defer: `apps/desktop` di luar cakupan sesi ini |
| 22 | blind, verif | Komponen Search tanpa tes DOM | low | sebagian lewat #11; viewer tidak punya harness DOM |

## Verification

**Commands:**
- `pnpm vitest run packages/viewer` -- semua lulus
- `pnpm -r typecheck` / `pnpm --filter @lakar/viewer build` -- tanpa error
- `pnpm vitest run tests/dependency-direction.test.ts` -- lulus

**Manual checks (if no CLI):**
- Browser (lakard `/app/`): Search ada hasil / tanpa hasil, ↑↓ Enter Escape, Settings General gelap/terang, 768 dan 375px.
