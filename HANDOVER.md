# HANDOVER — posisi pekerjaan Lakar (build lakar-paper selesai)

Catatan serah-terima untuk melanjutkan di ADE atau IDE lain. Aturan dan jebakan repo ada di [AGENTS.md](AGENTS.md).

## Update 2026-11-24 — gelombang Figma-parity + cloud collab MERGED ke `dev` + alur nightly

**Semua PR #64–#78 sudah merged ke branch `dev`** (bukan `main` — fitur masuk nightly dulu, `main` untuk rilis stabil).
Penomoran ulang skema yang dilakukan saat merge: section-groups tetap v11, comment-to-fix direnomor ke v12
(`MIGRATIONS[11]`), prototype mode direnomor ke v13 (`MIGRATIONS[12]`, fixture `tests/fixtures/docs/v13/prototype`,
goldens `v13-prototype.*`). Stack cloud (#70–#78, cabang dari v10) di-merge lewat `feat/cloud-signin` — tidak
menyentuh `SCHEMA_VERSION`, konfliknya union di wiring `services/*`, `comments.ts` (mailbox fix + room commit),
`Canvas.tsx` (ConnectionLayer + PeerLayer berdampingan), `Viewer.tsx` (tab prototype; checks tab tetap dibuang —
UI Checks sudah dihapus dev), `recordOps` fasad ditambah `setFlows`.

Perbaikan bug laten yang tertangkap saat merge:
- `files.test.ts`: marker konflik ter-commit oleh merge `feat/named-versions` (union ulang benar).
- Fixture `v11-section-groups`: board tanpa children → `walkBoard` yield 0 (di-fix saat merge #67).
- Tes `nodeId di board lain` di export-file: judul janji `EXPORT_FAILED` tapi assertion tak pernah ditulis.

**Pemisahan repo cloud**: `services/api` + `services/sync` + `deploy/` dipindah ke repo private
`fatmuh/lakar-cloud` (public repo ini MIT). Repo private memasang `fatmuh/lakar` sebagai submodule `lakar/`
(branch `dev`) — `@lakar/schema`/`@lakar/core` di-resolve lewat pnpm workspace di sana; PR cloud → repo private,
PR kode publik → repo ini. Tes e2e terhadap server sync sungguhan (`tests/rooms.test.ts`, `packages/mcp/src/
sync-client.test.ts`) ikut pindah. Klien cloud (viewer rooms, daemon `room-client.ts`, mcp `sync-client.ts`)
tetap publik — kontraknya lewat protokol WS/HTTP, bukan impor kode.

**Alur dev → main**: PR fitur menargetkan `dev`. Nightly build: `.github/workflows/nightly.yml` (01:00 WIB +
manual dispatch) memanggil `release.yml` (`workflow_call`, input `nightly`) → installer 4 OS → rilis pra-rilis
`nightly` yang tag-nya dipindah ke tip dev terbaru. Rilis stabil tetap tag `v*` di `main` (merge `dev` → `main`
saat siap rilis).

## Branch dan PR

Semua PR ada di repo GitHub `fatmuh/lakar` (dulu `adamramadhn/lakar`; alamat lama di-redirect).

Semua PR di bawah sudah di-merge ke `main`.

| Branch | Isi | PR |
|---|---|---|
| `claude/desktop-tauri-f5e05a` | Aplikasi desktop Tauri + release workflow + halaman Connections (MCP) | #5 |
| `claude/app-design-parity` | Semua fitur edit di aplikasi + audit desain (#7 sampai #14 sudah masuk ke sini) | #6 |
| `g1` | Pekerjaan G1 dari VPS: aturan `layout_check` sisa, skill per domain, rubrik v2.3, golden A–E | #15 |
| `docs/new-initiative` | Inisiatif `initiative-lakar-paper`, inisiatif lama ditutup, spine arsitektur model dokumen | #16, #17 |
| `feat/model-dokumen` | Build ketujuh epic `initiative-lakar-paper`, skema v7 | #18 |

**Rilis.** Tag `v0.1.0` ada di `20b913c` (merge #18). `release.yml` menerbitkan GitHub Release dengan installer Windows (exe, msi), macOS (arm64, x64), Linux (AppImage, deb) dan `SHA256SUMS.txt`: https://github.com/fatmuh/lakar/releases/tag/v0.1.0. Job `macos-x64` gagal sekali di langkah Smoke-test sidecar lalu lolos saat dijalankan ulang. Lognya tidak sempat terbaca, jadi penyebabnya belum diketahui. Awasi bila terulang.

## Isi `claude/app-design-parity`

Spec per fitur ada di `_bmad-output/implementation-artifacts/` — sejak meta split (PR #48/#52) lokasinya di repo `lakar-meta`, bukan di repo ini.

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

## Arah kerja (sejak 2026-11-22)

- **Inisiatif aktif: `_bmad-output/initiative-lakar-paper/`** — sekarang di repo `lakar-meta` (meta split #48/#52; `_bmad` dan `_bmad-output` tidak lagi di repo kode). Tujuannya Lakar setara paper.design: editor canvas, agen di canvas yang sama, token dan tema, komponen, ekspor kode, paste HTML/SVG dan vektor. Tidak ada gerbang benchmark.
- **`initiative-lakar` ditutup dan tidak mengikat.** G0 selesai, B (viewer + desktop) sudah dibangun, G1 vs pen.dev tidak dilanjutkan. File-nya disimpan sebagai riwayat.
- **Desain dulu, baru kode (C6 inisiatif baru).** UI/UX/motion mengikuti `design/lakar-ui.pen`. Layar baru didesain dulu di Pencil, lalu dikodekan lewat MCP pencil.
- **Installer sudah diuji Fatmuh** dari build GitHub Actions dan terpasang aman.

### Epic adopsi open-pencil (2026-11-24)

Epic ke-8 (`epic-adopsi-open-pencil`, 12 story: anotasi tool MCP, LC-34/35 overlap/overflow, aturan skill, snapping+smart guide+pengukur jarak+zoom, flex wrap skema v9, Copy as PNG, impor URL, token DTCG, updater desktop, instal MCP ke harness) sudah merge lewat PR #36–#51.

- **Retrospektif: `accepted`** — `lakar-meta/_bmad-output/initiative-lakar-paper/tickets/epic-adopsi-open-pencil/epic-adopsi-open-pencil-retrospective.md` + 3 ADR di folder yang sama. Semua 12 tiket `done`.
- **Verifikasi retro (Linux, Node 26):** build + 3028 tes hijau; SSRF/guard Origin, impor URL nyata, PNG `nodeId` + kompat lama, DTCG ekspor/impor, 20 anotasi tool MCP, dan `flex-wrap`/`row-gap` dilatih live ke daemon.
- **Temuan fix-now dari retro** (regex TOML Codex, inline-table lakar, `.bak` revert, prefiks translasi IPv6 SSRF, `checkPageUrl` untuk fetcher terinjeksi, `??=` prototype DTCG, versi `release.yml`, `undoLabel` impor) diperbaiki di branch `fix/retro-adopsi-open-pencil`.
- **Sisa:** 23 item defer tercatat di `deferred-work.md` (race/symlink config, content-encoding, updater bytes/origin, tes kontrak serde Rust, kesenjangan tes viewer, dsb.).
- **Rilis `v0.1.6` dipotong 2026-11-24** — memuat semua epic adopsi + fix retro. Cek artefak updater macOS bernama `Lakar_0.1.6_*` (uji nyata fix `release.yml` versi dari tag).

### Epic kolaborasi agen (2026-11-24, selesai — semua story merged ke main)

Epic ke-9 (`epic-kolaborasi-agen`, 6 story, dipecah dari hasil refresh riset open-pencil): desain UI kolaborasi di `lakar-ui.pen` (9.1), tool halaman via MCP (9.2), model+tool komentar canvas (9.3), UI komentar viewer (9.4), pratinjau execute dry-run (9.5), audit desain `analyze_*` (9.6). **Semua merged: PR #55, #56, #60 (pengganti #57 yang tertutup saat base-nya dihapus), #58, #59.** Server MCP = 32 tool. Tag `v0.1.7` dipotong di atasnya (rilis berjalan).

- **9.1 selesai.** Section 12 · Agent collaboration tercommit ke `design/lakar-ui.pen` (lakar-meta `48206e9`): 16 layar (8 dark + 8 light) + 7 komponen baru (Comment Pin, Comment Message, Thread Row, Page Row·Agent, Change Op Row, Audit Color Row, Cluster Card); 19 PNG pratinjau di `design/previews/`; catatan di `design/README.md`.
- **9.2 selesai di branch `feat/agent-page-tools` (merged via PR #55).** Lima tool baru: `list_pages`, `get_current_page`, `switch_page` (nama/id), `create_page`, `get_page_tree`. `session.activePage` menjadi target `add(null)`/`children(null)`/`place()`; default halaman pertama jadi sesi lama identik. Server MCP 25 tool.
- **9.3 di branch `feat/canvas-comments` (merged via PR #56).** Skema v10: `comments` opsional di dokumen — thread pin `nodeId` (mengikuti layer) atau titik bebas `x,y` (koordinat halaman), pesan berpenulis `user|agent`, status `open|resolved` + `resolvedAt`. Route agen `/comments*` (list/create/reply/resolve, resolve idempoten tanpa rev), 4 tool MCP baru → server 29 tool. `collectIds` ikut memindai id thread. Route viewer + UI = story 9.4.
- **9.5 di branch `feat/execute-dry-run` (merged via PR #60).** `execute({dryRun:true})` menjalankan ops+check pada salinan: respons `{dryRun, rev, changes, check, bounds, value, logs}` tanpa commit — `changes` = diff struktural `{added, updated, deleted, moved, other, counts}` (reorder/pindah-parent/perubahan tokens·comments·pages ikut terlihat, perbandingan key-order-insensitive). ID pratinjau sekali-pakai.
- **9.6 di branch `feat/analyze-audit` (merged via PR #58).** Tiga route baca `/analyze/colors|typography|clusters` pada dokumen aktif sesi + 3 tool MCP → server 32 tool: frekuensi warna literal vs `{$token}` (mesh `colors[]` dan `props` instance ikut; kandidat token terdekat jarak RGB), gaya teks off-scale vs `TYPE_SCALE`/`DISPLAY_SIZES` dengan `suggestedSize`, dan struktur kontainer berulang (signature tipe+prop+nilai primitif+anak/slot; instance/master dilewati). Envelope `{docId, slug, rev}`; daftar `uses`/`nodeIds` dibatasi 20 dengan `truncated`.
- **9.4 di branch `feat/viewer-comments` (merged via PR #59).** UI komentar lengkap sesuai Section 12: route viewer `/viewer/docs/:slug/comments*` (mutasi dibagi dengan route agen; penulis `{user,You}`, riwayat `lakar-viewer`, event `change` ber-origin), tool Comment (toolbar + `C`), pin avatar mengikuti layer, popover thread/draft (diklem ke viewport), dan tab Comments di sidebar (filter Open/Resolved/All, "This page", grup Resolved lipat, "Show resolved on canvas" persisten). Thread ikut dokumen → komentar agen tampil live lewat `change`/`loadDoc` yang sudah ada.

## Langkah berikutnya

0. **Agen di canvas: selesai dan sudah di `main` (2026-11-23).** Riset pendukung ada di `research-agent-canvas-references.md`. Agar `bmad-build` ter-render dengan benar, skrip `_bmad` harus versi 6.13.0-next (commit `138d7f1`).
   1. **Agen bekerja di dokumen yang terbuka** (#20, `spec-agent-open-doc.md`). `open_doc {}` memakai dokumen yang sedang difokuskan di aplikasi, atau membuat dokumen baru dan membuka tabnya. Ada juga tool `list_documents`, dan respons tulis membawa `target`.
   2. **Skill desain dari Emil Kowalski** (#22, `spec-design-skills-emil.md`). Skill opsional `break-ui` dan `variants`, isi non-animasi masuk ke `ui`/`review`. Lima skill animasi dipasang di `.claude/skills/`. Atribusi MIT ada di `packages/skills/NOTICE.md`.
   3. **Efek canvas saat agen bekerja** (#21, `spec-canvas-agent-effects.md`). Desainnya ada di `lakar-ui.pen` section 04, baris `GRlb7`. Isinya: identitas agen lewat header `x-lakar-agent`, warna per sesi, label "✦ Generating", fade-in node, cursor 180 ms, dan baris Activity `terminal-chunk-in`.
   4. **Tinggi board landing** (#22, `spec-board-height-fit.md`). LC-12 memberi peringatan bila ada ruang kosong di bawah isi board landing yang sudah jadi, dan skill `landing` mengambil tinggi dari `bounds`.

   5. **Identitas agen di History/Dashboard dan warna sesi yang konsisten** (#24, `spec-agent-identity-history.md`).
   6. **Harness tes DOM viewer** (#25, `spec-viewer-dom-harness.md`). Tes ditulis sebagai `*.dom.test.tsx` (jsdom + Testing Library) dan dijalankan oleh `pnpm test` sebagai project vitest `viewer-dom`.
   7. **Build live per seksi** (#26, `spec-progressive-live-build.md`) dan **board `height:'hug'`** (#28, `spec-board-hug-height.md`, skema v8).
   8. **Sidebar kiri/kanan bisa di-collapse, pill `layout_check` dihapus** (#27, `spec-viewer-collapsible-panels.md`).
   9. **Kerangka dulu, lalu satu blok per execute, plus prelude bawaan** (#29, `spec-skeleton-live-build.md`). Marker `[Skeleton] `, helper `Skel`/`Build`/`Palette`, dan LC-33.
   10. **Installer menutup `lakar-node.exe` yang sedang berjalan** (#30, `spec-installer-locked-node.md`). Config MCP di Windows menunjuk salinan Node yang stabil.
   11. **Epic loop verifikasi agen** (riset `research-open-pencil-features-for-lakar/`):
       - `undo`/`redo` agen (#31, `spec-agent-undo.md`);
       - `visual_diff` (#32, `spec-agent-visual-diff.md`);
       - `fix_check` (#33, `spec-check-autofix.md`).

       Ketiganya berbagi hook `AgentSteps.onAgentWrite`. Server MCP kini punya 19 tool.

   **Rilis:** `v0.1.1` sampai `v0.1.5` terbit pada 2026-11-23. Cek `claude-review` di CI gagal di sisi layanan (`api.moccilabs.com` menolak dalam sekitar 1 detik). Sebagai gantinya, PR besar di-review lokal oleh subagen sebelum merge. Key atau kuota secret itu perlu dicek Fatmuh.

   **Perlu uji manual Fatmuh** dengan installer terbaru:
   - Dari sesi Claude baru, prompt "buatkan landing page menggunakan lakar". Kerangka seksi muncul dengan shimmer, lalu terisi per blok secara live.
   - Dua agen (Claude Code dan Codex) tampil dengan warna dan nama masing-masing.
   - Upgrade installer saat aplikasi dan sesi MCP sedang berjalan berhasil tanpa dialog error.
1. **Uji manual `v0.1.0` oleh Fatmuh.** Pasang installer rilis, lalu cek butir Done-when yang tersisa (lihat "Sisa" di bawah).
2. **Build `initiative-lakar-paper` selesai dan sudah di `main` (#18).** Semua 34 tiket berstatus done. Semua story dijalankan lewat `bmad-build-auto`. Spec ada di `_bmad-output/implementation-artifacts/spec-{model-dokumen,editor,agen,token,komponen,kode,vektor}-*.md`. Spine arsitektur ada di `_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md`. Skema kini v7.
   - **Model dokumen.** Korpus v1/v2, token bertipe dengan mode tema (v3), `resolveDocument` sebagai satu pintu resolusi, dan `css.ts` sebagai pemetaan CSS tunggal.
   - **Editor canvas.** Route `/viewer/docs/:slug/ops` dengan op invers untuk undo/redo, board sebagai DOM hidup, select/move/resize, panel Design, aksi edit, dan grid (v4).
   - **Agen di canvas.** Seleksi bersama lewat `get_selection`, perubahan agen tampil live tanpa menimpa edit manual, dan skill `selection`.
   - **Token dan tema.** API baca token untuk agen, panel Theme, dan Token Picker di panel Design.
   - **Komponen.** Master dan instance (v5), op komponen, UI komponen di viewer, serta props dan slot.
   - **Kode.** Paket `@lakar/codegen` (React + Tailwind atau CSS), komponen sebagai file React, uji paritas piksel, dialog Export code, tool `export_code`, dan impor CSS variables.
   - **Paste dan vektor.** Atribut SVG bertipe pada path (v6), importer SVG dan HTML dengan tool `paste` (tag v7), Pen tool, dan edit titik.
   - **Sisa (butuh Fatmuh).** Butir Done-when yang butuh installer release desktop dan demo manual Fatmuh: membuat landing page dari nol dan alur varian lewat agen.
   - **Tema tertunda utama.** Viewer belum punya harness tes DOM/komponen, jadi wiring UI hanya dites lewat logika murni. Dokumen nyata v1/v2 pengguna dan bench (termasuk di VPS) belum masuk korpus; caranya ada di `tests/fixtures/docs/README.md`. Item lain ada di `deferred-work.md`.
3. **Item tertunda.** Lihat `_bmad-output/implementation-artifacts/deferred-work.md`.

## Merapikan lingkungan lokal

- Worktree lama ada di `.claude/worktrees/`. Hapus dengan `git worktree remove <path>` bila tidak dipakai lagi.
- Checkout utama `D:\Work\Personal\lakar` mungkin masih menunjukkan `design/lakar-ui.pen` sebagai modified. Salinannya sudah di-commit di `claude/app-design-parity`.

## Pindah environment / server baru (tutorial langkah per langkah)

Dua repo terlibat: `fatmuh/lakar` (kode, publik) dan `fatmuh/lakar-meta` (privat: `_bmad-output/`, `_bmad/`, `.claude/skills/`, `design/` termasuk `lakar-ui.pen`). Checkout meta dipasang kembali ke path aslinya lewat junction (Windows) atau symlink (Linux) oleh `scripts/link-meta`.

### 1. Prasyarat

| Alat | Keterangan |
|---|---|
| Git + akses GitHub | `lakar-meta` privat → login `gh auth login` atau SSH key/PAT scope `repo` di akun yang diundang |
| Node ≥ 26 | Windows: nvm; Linux: `bash tools/node26/install.sh` (pasang ke `/opt/node-26`, tidak menyentuh Node sistem) |
| pnpm 12.21.0 | `npx -y pnpm@12.21.0` selalu bisa dipakai tanpa instal global |
| Browser render | Windows: Edge/Chrome sistem (`LAKAR_BROWSER_CHANNEL=msedge`); Linux: `bash scripts/install-browser.sh` (chromium-headless-shell ke `~/.cache/lakar/ms-playwright`) |
| Rust + prasyarat Tauri | Hanya untuk build aplikasi desktop; CI yang membangun installer resmi |
| Pencil | Untuk membuka/mengedit `design/lakar-ui.pen` — lihat langkah 6 |

### 2. Clone dan tautkan meta

```sh
git clone https://github.com/fatmuh/lakar
git clone https://github.com/fatmuh/lakar-meta
cd lakar
scripts\link-meta.cmd D:\path\ke\lakar-meta      # Windows (junction)
bash scripts/link-meta.sh /path/ke/lakar-meta   # Linux/macOS (symlink)
```

Tanpa argumen, script mencoba env `LAKAR_META` lalu file `%USERPROFILE%\.lakar-meta`/`~/.lakar-meta` berisi path meta. Path yang kembali berfungsi persis seperti sebelum split: `_bmad-output/`, `_bmad/`, `.claude/skills/`, `design/` — Pencil, BMAD, dan bench tidak perlu tahu bedanya. Commit perubahan di path itu selalu di repo `lakar-meta`, bukan `lakar`.

### 3. Build dan tes

```sh
pnpm install
pnpm build        # wajib sebelum daemon atau tes yang pakai dist
pnpm test         # opsional tapi disarankan sekali
```

### 4. Jalankan

```sh
pnpm lakard       # daemon + viewer di http://127.0.0.1:7466/app/
```

- **Windows**: `set LAKAR_BROWSER_CHANNEL=msedge` (atau `auto`) supaya render memakai browser sistem.
- **Linux server sebagai service**: `bash tools/lakard/install-service.sh` (systemd `--user`). Agar tetap hidup setelah logout: `sudo loginctl enable-linger <user>` — keputusan admin, skrip hanya melaporkannya.
- **Akses viewer dari laptop** saat daemon di server: `ssh -L 7466:127.0.0.1:7466 user@server` lalu buka `http://127.0.0.1:7466/app/`. Daemon memang sengaja loopback-only.
- **Aplikasi desktop** tidak perlu dibangun lokal; pasang installer dari GitHub Releases. Di server headless cukup daemon + viewer lewat tunnel.

### 5. Hubungkan agen (MCP)

Buka viewer → Settings → Connections → "Install in an agent". Lakar mendeteksi Claude Code, Codex, Pi, dan OpenCode lalu menulis config MCP-nya (dengan backup `.bak` dan Undo). Ini satu klik — tidak perlu edit file JSON manual.

### 6. Pencil / pen.dev (file `.pen` dan aturan desain)

`design/lakar-ui.pen` adalah sumber kebenaran visual dan **terenkripsi** — jangan pernah dibaca/diubah sebagai teks. Dua cara memakainya:

- **Mesin dengan GUI (laptop/PC desainer):** pasang aplikasi Pencil dari https://pen.dev (Windows/macOS; AppImage untuk Linux). Buka `design/lakar-ui.pen` dari aplikasi. Untuk agen, config Pencil MCP menunjuk binary `mcp-server-*` di dalam instalasi aplikasi (lihat contoh di `.mcp.json` atau config harness).
- **Server headless:** aplikasi desktop tidak bisa (butuh display). Pakai CLI resminya:

  ```sh
  npm install -g @pen.dev/cli      # butuh Node ≥ 22.19; Node 26 aman
  pen login                         # sekali; atau PEN_CLI_KEY=pencil_cli_... untuk non-interaktif/CI
  pen interactive --in design/lakar-ui.pen --out design/lakar-ui.pen
  pen --prompt "..." --out design/lakar-ui.pen
  ```

  CLI menjalankan engine editor yang sama dengan aplikasi — hasil file identik, hanya tanpa canvas live (minta `--enable-preview`/`--preview-output` untuk PNG). `PEN_CLI_KEY` dibuat di Developer Keys di org settings pen.dev.

- **Aturan desain-dulu.** Layar/fitur UI baru didesain dulu di `lakar-ui.pen` lewat Pencil (aplikasi atau CLI), baru diimplementasikan di viewer/desktop. Jangan mengarang tampilan langsung di kode.

### 7. Data dan kunci yang TIDAK ikut git (bawa manual bila perlu)

| Apa | Lokasi di mesin ini |
|---|---|
| Dokumen desain (daemon CLI) | `%USERPROFILE%\.local\share\Lakar` |
| Data aplikasi desktop (dokumen, config, log) | `%LOCALAPPDATA%\id.lakar.desktop\data` |
| Kunci privat updater Tauri | `C:\Users\Fatmuh\.lakar-updater-key\` — JANGAN masuk repo; sudah ada sebagai secret `TAURI_SIGNING_PRIVATE_KEY` di GitHub, cukup untuk build rilis |
| API key foto (pexels/unsplash) | file yang ditunjuk `LAKAR_PEXELS_KEY_FILE`/`LAKAR_UNSPLASH_KEY_FILE` di config daemon |
| Pointer lokasi meta | `%USERPROFILE%\.lakar-meta` atau env `LAKAR_META` (atau selalu pakai argumen script) |

Di Linux, path setara: `~/.local/share/lakar` (daemon) dan `~/.local/share/id.lakar.desktop` (desktop). Folder data tinggal disalin utuh — semua dokumen ikut.

### 8. Checklist pindah

1. `gh auth login` di mesin baru (akses `lakar-meta`).
2. Clone `lakar` + `lakar-meta`, jalankan `link-meta`.
3. `pnpm install && pnpm build`.
4. Browser: `scripts/install-browser.sh` (Linux) atau pastikan Edge/Chrome ada (Windows).
5. Salin folder data dokumen bila mau melanjutkan file lama.
6. `pnpm lakard` → buka viewer → install MCP ke harness → verifikasi agen bisa `open_doc`.
7. Pasang Pencil (GUI) atau `@pen.dev/cli` + `pen login` (headless) bila akan menyentuh `lakar-ui.pen`.
8. Tidak perlu: kunci updater (CI), Rust/Tauri (kecuali build desktop), installer lama.
