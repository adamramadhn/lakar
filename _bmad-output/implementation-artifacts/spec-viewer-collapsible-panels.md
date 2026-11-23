---
title: 'Viewer: sidebar yang bisa dilipat dan pill layout_check dihapus'
type: feature
ticket: ''
created: '2026-11-23'
status: built
baseline_revision: '51adc70'
route: quick
risk: low
review: quick
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-app-9-viewer-responsive.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-viewer-dom-harness.md'
  - '{project-root}/.claude/skills/animate/SKILL.md'
  - '{project-root}/.claude/skills/choreograph/SKILL.md'
  - '{project-root}/.claude/skills/animation-performance/SKILL.md'
---

## Intent

**Problem:** Di layar dokumen aplikasi desktop, pill mengambang "layout_check ●0 ●0" di kiri bawah kanvas menduplikasi tab Checks di panel kanan dan bersaing dengan toolbar kanvas (CSS sampai menggeser toolbar ke kanan pill di kanvas sempit). Sidebar kiri (header file, Pages, Layers/Assets) dan kanan (Activity/Design/Checks/History) juga selalu terbuka, sehingga kanvas tidak bisa dibuat lebar seperti di Figma atau Pencil.

**Approach:** Hapus pill. Fungsinya yang tersisa (jumlah temuan dan klik ke Checks) pindah ke badge jumlah di tab Checks; marker temuan di kanvas tetap membuka Checks. Kedua sidebar bisa dilipat lewat tombol di kanvas dan shortcut. State disimpan per pengguna di localStorage. Panel bergerak sebagai overlay (`transform`) sehingga kanvas di-resize sekali per toggle, dan kamera dikompensasi supaya board tidak melompat. Sistem ini sejajar dengan tata letak responsif aplikasi 9: di tablet sisi kiri tetap laci, dan di mobile sisi kanan tetap bottom sheet.

## Desain (C6, desain dulu)

Semua perubahan dibuat di `design/lakar-ui.pen` lewat tool MCP Pencil (`get_app_state`, `read_skill`, `execute`, `save`) sebelum kode ditulis.

- **Pill dihapus** dari 82 frame (node "Checks Summary" di kanvas Viewer/Editor/Agent/Theme/Components/Code/Paste/Vectors, desktop dan tablet, dark dan light). View Controls di frame itu dipusatkan ulang.
- **Badge tab Checks:** komponen "Panel Tab" (`gCPfd`, varian `o6mcra`/`I9BYeU`) mendapat anak "Badge" (`WmOZY`/`xh0ix`, default nonaktif). Badge diaktifkan dengan jumlah error+warning di 82 instance "Tab Checks" non-mobile. Mobile tetap memakai ringkasan di strip sheet.
- **Komponen "Panel Toggle"** (`QNyCb`, variants `state: default | hover | active`: `zdXsr`, `FDORV`, `anaoM`) di Section 00 › Editor items. Ukurannya 32×32, radius 8, surface + border + bayangan 0 2 8 #0000001F, dengan ikon lucide panel-left/right-close/open.
- **Toggle di frame desktop yang ada:** "Panel Toggle Left" di (16,16) kanvas, dan "Panel Toggle Right" di kiri Export di 20 frame "Viewer — Desktop — …" (Section 03).
- **Frame baru di Section 03** (sesudah "New File"):
  - Dark: `u8rEg` "Left panel collapsed", `oHas7` "Right panel collapsed", `x282c` "Both panels collapsed".
  - Light: `SaY3x`, `CbMFE`, `bcGom`.
  - Board di frame "kiri dilipat" digeser +260 karena kamera dikompensasi (dunia tetap diam di layar).
- **Spesifikasi state toggle:** frame "Panel Toggles" (`NWe8E`) di Section 04 › Row Details › "Details Left" (`Cl1g8`). Isinya kiri/kanan × normal/hover/active, dark dan light, dengan catatan posisi, tooltip, dan shortcut.
- **Tabel motion `WHm4A`:** ada lima baris baru, yaitu `fugMz` Panel expand, `cJPNf` Panel collapse, `s1JwNF` Canvas reflow, `T4yhdW` Toolbar · canvas actions, dan `LA9yG` Panel toggle. Catatan reduced motion (`jJuQh`) ikut diperbarui.
- **Posisi section:** Section 03–10 sebelumnya saling tumpang tindih di root dokumen, karena tinggi section bertambah tanpa posisi berikutnya ikut digeser. Section 03–10 kini diberi jarak 240px. Isi section tidak berubah.

## Motion (skill animate, choreograph, animation-performance)

- **Gerbang (animate §1):** toggle lewat tombol jarang dilakukan (beberapa kali per sesi), jadi slide berfungsi menjaga konsistensi spasial (panel keluar/masuk dari tepinya). Toggle lewat keyboard **tidak dianimasikan** ("keyboard-initiated actions are a disqualifier").
- **Properti (animation-performance):** hanya `transform` pada panel dan `translate` (FLIP) pada toolbar/grup Export. Kanvas tidak dianimasikan lebarnya. Kanvas berisi board DOM hidup di shadow root dan `ResizeObserver`, jadi reflow per frame mahal. Kolom grid berubah sekali, dan `Canvas` menggeser `cam.x` sebesar perpindahan tepi kiri sehingga board diam di layar.
- **Koreografi:** panel (Lead) dan toolbar/grup aksi (Support) memakai satu keluarga kurva. Isi panel tidak di-stagger (satu entrance per container). Collapse memakai pola "popLayout": kolom ditutup seketika dan panel keluar sebagai overlay. Expand: panel masuk sebagai overlay, lalu kolom dibuka saat panel mendarat.

| Elemen | Peran | Mulai | Durasi | Gerak | Kurva |
|---|---|---|---|---|---|
| Panel (expand) | Lead | 0 | 240ms | translateX(∓100% → 0) | cubic-bezier(.32,.72,0,1) |
| Panel (collapse) | Lead | 0 | 200ms | translateX(0 → ∓100%), lalu `visibility: hidden` | cubic-bezier(.32,.72,0,1) |
| Kanvas | Static | — | 0 | satu resize; pan dikompensasi | — |
| View Controls, grup Theme/Export | Support | saat kolom berubah | 240ms | FLIP `translate` (lama − baru → 0) | cubic-bezier(.32,.72,0,1) |
| Tombol toggle | Feedback | — | 150ms / 120ms | hover warna (`ease`), tekan scale .96 (`ease-out`); hover hanya untuk `(hover: hover) and (pointer: fine)` | — |

- **Interruptible:** transisi CSS (bukan keyframes) berbalik dari posisi saat itu. Timer expand dibatalkan bila sisi itu dilipat lagi.
- **Reduced motion:** semua instan, yaitu kelas `panels-instant`, `transition: none` di `@media (prefers-reduced-motion: reduce)`, tanpa fase overlay dan tanpa FLIP.

## Boundaries & Constraints

**Always:**
- Route, tool MCP, dan kontrak daemon tidak berubah (perubahan hanya di viewer dan desain).
- Satu sistem tata letak dengan aplikasi 9. Desktop (>1100px): kiri dan kanan bisa dilipat. Tablet: kanan bisa dilipat, sedangkan kiri tetap laci dengan tombol "Layers", dan `Ctrl/⌘+Alt+[` membuka/menutup laci. Mobile: tombol disembunyikan dan shortcut tidak berlaku (panel kanan adalah bottom sheet).
- Akses localStorage dibungkus try/catch. Nilai rusak atau tidak tersedia berarti kedua sidebar terbuka.
- Shortcut tidak berlaku saat mengetik (input/textarea/select/contentEditable, termasuk shadow root board live) atau saat dialog/menu terbuka.
- Teks UI dalam bahasa Inggris, komentar dan spec dalam bahasa Indonesia.

**Never:**
- Menganimasikan `width`/`grid-template-columns` kanvas atau memicu render per frame.
- Menghilangkan jalan ke tab Checks: badge tab, marker temuan di kanvas (klik → Checks), dan `.sheet-checks` di mobile tetap ada.

## I/O & Edge-Case Matrix

| Kasus | Diharapkan | Tes |
|---|---|---|
| Dokumen dengan temuan (1 error, 2 warning) | Tidak ada `.checks-pill` atau teks "layout_check"; tab Checks berbadge "3" (`danger`) dengan title "1 errors, 2 warnings" | `Viewer.sidebars.dom.test.tsx` |
| Tanpa temuan | Tab Checks tanpa badge | idem |
| Klik toggle kiri | `.viewer.left-collapsed.left-float`, label "Show left sidebar", `aria-expanded=false`; sisi kanan tidak berubah | idem |
| Klik toggle kiri lagi | `left-collapsed` hilang, `left-float` bertahan sampai slide selesai (240ms), lalu kolom dibuka | idem |
| Toggle kanan | Ada di `.canvas-actions` (juga saat pratinjau versi); melipat hanya panel kanan | idem |
| Toggle lagi di tengah slide masuk | Langsung berbalik; timer expand yang dibatalkan tidak membuka kolom belakangan | idem |
| Ctrl/⌘+\ | Ada sisi yang terbuka → keduanya dilipat; keduanya dilipat → keduanya dibuka; instan (`panels-instant`, tanpa fase overlay) | idem |
| Ctrl/⌘+Alt+[ / ] | Kiri / kanan saja | idem |
| Shortcut saat fokus di "Search components" | Tidak ada perubahan | idem |
| Toggle, unmount, buka lagi | localStorage `lakar.viewer.sidebars` = `{left:true,right:false}`; state dipulihkan | idem |
| localStorage rusak | Kedua sidebar terbuka | idem |
| `prefers-reduced-motion: reduce` + klik | Instan, tanpa `left-float` sesudah expand, tanpa `Element.animate` pada toolbar/aksi | idem |
| Shortcut vs aksi edit | `shortcutAction` tidak mengenali Ctrl+\ dan Ctrl+Alt+[ / ] | `sidebars.test.ts` |
| Ctrl+[ tanpa Alt, Shift, atau tanpa modifier | Bukan shortcut sidebar (Ctrl+[ tetap "Send backward") | idem |
| Tepi kiri kanvas bergeser (lipat/buka kiri) | `cam.x` += selisih sehingga board diam di layar | manual (jsdom tidak punya layout; `ResizeObserver` di-stub) |
| Tablet, Ctrl/⌘+Alt+[ | Membuka/menutup laci Layers | manual |

## Code Map

- `packages/viewer/src/sidebars.ts` -- state murni: `readSidebars`/`writeSidebars` (try/catch), `toggleSide`, `toggleBoth`, `sidebarShortcut` (lewat `code`), `EXPAND_MS`/`COLLAPSE_MS`.
- `packages/viewer/src/SidebarToggle.tsx` -- hook `useSidebars` (collapsed, fase overlay `opening`, `panels-instant`, timer expand, FLIP `translate`) dan tombol `SidebarToggle`.
- `packages/viewer/src/Viewer.tsx` -- hook + listener shortcut (typing/dialog/mobile/tablet), kelas di `.viewer`, toggle kiri di `overlay`, toggle kanan di `leadingActions`; prop pill ke Canvas dibuang.
- `packages/viewer/src/Canvas.tsx` -- pill dan prop `summary`/`checksLoading`/`onOpenChecks` dihapus; slot `leadingActions` di `.canvas-actions` (tetap tampil saat pratinjau); kompensasi `cam.x` saat tepi kiri bergeser.
- `packages/viewer/src/BottomSheet.tsx` -- badge jumlah temuan di tab Checks.
- `packages/viewer/src/icons.tsx` -- `panelLeftClose/Open`, `panelRightClose/Open` (lucide).
- `packages/viewer/src/app.css` -- aturan pill (termasuk geser toolbar di container 694–940px dan mobile) dihapus; `.tab-badge`; `.panel-toggle`; grid eksplisit desktop + `*-float`/`*-collapsed` + `panels-instant` + reduced motion; tablet kanan 300px.
- `design/lakar-ui.pen` -- lihat bagian Desain.

## Tasks & Acceptance

**Execution:**
- [x] Desain Pencil: pill dihapus, badge tab Checks, komponen Panel Toggle, toggle di frame desktop, enam frame collapsed, frame state toggle, lima baris motion. File disimpan.
- [x] Hapus pill (Canvas + CSS) dan tambah badge tab Checks.
- [x] `sidebars.ts` + `SidebarToggle.tsx` + wiring Viewer + CSS + ikon.
- [x] Kompensasi kamera di Canvas.
- [x] Tes: `sidebars.test.ts` (node) dan `Viewer.sidebars.dom.test.tsx` (10 kasus); `Canvas.dom.test.tsx` disesuaikan dengan prop yang dihapus.

**Acceptance Criteria:**
- Given layar dokumen desktop, when dibuka, then tidak ada pill layout_check, dan tab Checks menunjukkan jumlah temuan bila ada.
- Given kedua sidebar terbuka, when tombol toggle kiri/kanan diklik, then panel itu slide keluar (200ms) dan kanvas mengisi ruangnya tanpa board melompat; klik lagi → slide masuk (240ms).
- Given fokus bukan di kolom ketik, when Ctrl/⌘+\ ditekan, then kedua sidebar dilipat atau dibuka seketika.
- Given jendela dibuka ulang, when Viewer dimuat, then state lipat terakhir dipulihkan.
- Given `prefers-reduced-motion: reduce`, when toggle diklik, then perubahan instan.

## Spec Change Log

- Toggle diletakkan **selalu di kanvas** (kiri atas; kanan atas sebelum Theme/Export), bukan di header panel. Strip tab kanan (4 tab + badge) di 300–320px tidak muat ditambah satu tombol lagi, dan tombol harus tetap ada saat panel dilipat. Posisi kiri atas sama dengan tombol "Layers" tablet.
- Shortcut per sisi memakai Ctrl/⌘+**Alt**+[ / ], karena Ctrl/⌘+[ / ] sudah dipakai untuk urutan z. `code`-based, jadi aman di tata letak non-US. Di Windows, AltGr (Ctrl+Alt) pada sebagian tata letak menghasilkan karakter, tetapi kode fisik BracketLeft/Right tetap terbaca.

## Implementation Notes

- **Fase overlay:** `left-float`/`right-float` = sisi itu dilipat **atau** sedang slide masuk. Selama float, panel `position: absolute` (z 20) dan kolom grid-nya 0. Collapse membuat kolom 0 seketika dan transform panel ke ∓100%. Expand membuat transform 0, lalu timer `EXPAND_MS` melepas float sehingga kolom dibuka.
- **Grid eksplisit di desktop:** `.layers-panel`/`.canvas`/`.side-panel` diberi `grid-column` 1/2/3. Panel yang absolute keluar dari alur grid, dan tanpa ini kanvas akan pindah ke kolom 1.
- **Kompensasi kamera** ada di `ResizeObserver` Canvas (selisih `getBoundingClientRect().left`). Kompensasi ini juga berlaku saat breakpoint 1100px dilewati, karena kolom kiri muncul atau hilang.
- **FLIP:** posisi `.view-controls` dan `.canvas-actions` diukur tepat sebelum kolom berubah (handler klik atau callback timer), lalu dianimasikan di `useLayoutEffect` render berikutnya dengan properti `translate`. Properti ini menumpuk dengan `transform: translateX(-50%)` toolbar.
- Di tablet, Ctrl/⌘+\ ikut membalik state kiri meski sisi itu tidak terlihat (kiri = laci). Efeknya baru tampak saat jendela melebar ke desktop.

## Review Triage Log

**Pass 1 (quick, self-review diff):** low 2 patch, 0 defer.

| # | Temuan | Verdict | Rute | Bukti |
|---|---|---|---|---|
| 1 | Komentar header Canvas masih menyebut "Checks" disembunyikan saat pratinjau (yang dimaksud pill) | low | patch | Komentar diperbarui; pill dan slot `leadingActions` dijelaskan |
| 2 | `sidebars.ts` diimpor tes node tanpa ekstensi → TS2835 di `pnpm test` | low | patch | Import `./editActions.js` / `./sidebars.ts` seperti tes node lain |

## Deferred

- Expand berjalan berurutan: toolbar baru di-FLIP sesudah panel mendarat (total sekitar 480ms untuk Support). Menyamakan waktunya butuh resize kanvas di awal expand, tetapi itu memunculkan area kosong di bawah panel yang masuk. Perlu feel-check di perangkat.
- Kompensasi kamera belum punya tes otomatis (jsdom tanpa layout).

Keduanya dicatat di `deferred-work.md`.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 test` -- expected: hijau kecuali kegagalan khas Windows (AGENTS.md); CI Linux acuan.
- `npx vitest run --project viewer-dom src/Viewer.sidebars.dom.test.tsx` -- expected: 10 tes lulus.

**Manual (aplikasi desktop):** lipat/buka tiap sisi lewat tombol dan shortcut, dan pastikan board tidak melompat. Toggle cepat dua kali harus berbalik mulus. Cek tablet (laci kiri, kanan bisa dilipat) dan mobile (tanpa tombol). Untuk reduced motion, aktifkan setting OS lalu pastikan perubahan instan.
