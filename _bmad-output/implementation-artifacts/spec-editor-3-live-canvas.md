---
title: 'Canvas viewer merender board sebagai DOM hidup (epic editor-canvas story 3)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_revision: '35218a8d48c78a6cb612bc5569df560f37e5e6d5'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/initiative-lakar-paper/tickets/epic-model-dokumen/architecture-model-dokumen/architecture-model-dokumen.md'
warnings: []
deferred:
  - summary: >-
      Siklus mount board live (mountLive, ensureFaces, efek BoardLive) belum punya tes otomatis di permukaan canvas; hanya smoke Playwright manual.
    evidence: |-
      Tes viewer berjalan di Node tanpa DOM (vitest.config.ts tanpa environment). Pencarian Canvas/BoardLive/mountLive/ensureFaces di file tes tidak menemukan apa pun. Usul: tes halaman Chromium seperti packages/render/test/text.test.ts atau e2e Playwright /app/.
    location: >-
      packages/viewer/src/Canvas.tsx BoardLive; packages/viewer/src/liveBoard.ts mountLive/ensureFaces
    severity: medium
  - summary: >-
      Bundle viewer naik 397 kB ke 523 kB (gzip 161 kB) karena resolveDocument menarik zod lewat tokens.ts @lakar/schema.
    evidence: |-
      Diukur dari vite build sebelum/sesudah. Usul: entry schema tanpa zod atau pisahkan validasi zod dari logika resolve token.
    location: >-
      packages/viewer/src/Canvas.tsx (impor resolveDocument)
    severity: low
---

<intent-contract>

## Intent

**Problem:** Canvas viewer menampilkan setiap board sebagai PNG dari `POST /screenshot`. Editor canvas (story 4–6: seleksi, drag, pratinjau gestur) butuh board sebagai DOM hidup yang bisa diubah lokal tanpa round-trip screenshot (AD-6).

**Approach:** Viewer me-resolve dokumen terkini dengan `resolveDocument` (`@lakar/schema`, AD-10) lalu me-mount tiap board dengan `mountBoard` (`@lakar/render`) di dalam shadow root per board, diskalakan dengan transform kamera. Daemon menambah `GET /viewer/render-deps` yang mengembalikan face font (URL `/fonts/...` yang sudah ada) dan glyph ikon (katalog `@lakar/icons`) untuk kunci yang diminta; aset gambar memakai `/assets/:hash` yang sudah ada. PNG tetap untuk pratinjau riwayat, thumbnail, export, dan tool `screenshot`.

## Boundaries & Constraints

**Always:**
- Board live dirender dari hasil `resolveDocument(doc)` dokumen terkini; resolve dijalankan sekali per objek dokumen (bukan per frame kamera).
- Board di-mount ulang hanya bila isi board ter-resolve berubah (tanda tangan JSON board); pan/zoom hanya mengubah transform, tidak me-mount ulang.
- DOM lama tetap tampil sampai DOM baru siap (tanpa kedip skeleton sesudah edit); mount yang basi (dokumen sudah lebih baru) dibuang.
- Mode pratinjau versi (History) tetap memakai PNG snapshot (`revScreenshot`) seperti sekarang.
- Route baru hanya `GET` di bawah `/viewer/*`, bentuk respons AD-11 `{ok:true,data}` / `{ok:false,error}`.
- Viewer hanya bergantung pada `@lakar/schema` dan `@lakar/render` (AD-17); fetch lewat `api.ts`.
- Lapisan kehadiran agen, Just changed, kursor agen, marker check, seleksi, sisip layer, halaman, zoom/Fit, offline, dan sheet mobile tetap bekerja tanpa perubahan perilaku.

**Never:**
- Tidak mengubah route, respons, atau tool lama (`/screenshot`, `/fonts/*`, `/assets/*`, `/viewer/docs/*`), default config, atau Thumb/Export.
- Tidak menambah chrome UI atau gaya baru di luar kelas wadah board live (tampilan board tetap sama, desain bagian 03).
- Tidak memakai `renderBoard` di viewer (cek ketat FONT_MISSING/ICON_UNKNOWN dan ukur milik daemon); tidak ada hit-test node atau seleksi DOM di story ini (story 4).
- Tidak membuka `EventSource` baru.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Deps lengkap | `GET /viewer/render-deps?font=Inter:400:normal&icon=lucide/star` | 200 `{fonts:[face latin, face latin-ext Inter 400 normal], icons:[glyph lucide/star], missing:{fonts:[],icons:[]}}` | — |
| Font/ikon tak dikenal | `font=Nope:400:normal&icon=lucide/zzz` | 200, `fonts:[]`, `icons:[]`, `missing:{fonts:['Nope:400:normal'], icons:['lucide/zzz']}` | viewer tetap me-mount (font fallback, ikon kosong) |
| Tanpa parameter | `GET /viewer/render-deps` | 200 semua array kosong | — |
| Kunci rusak | `font=Inter:abc:normal`, `font=Inter:400:oblique`, `icon=star`, lib di luar `ICON_LIBS` | 400 `SCHEMA_INVALID` | — |
| Terlalu banyak | > 256 `font` atau > 256 `icon` | 400 `SCHEMA_INVALID` | — |
| Board live | dokumen termuat, bukan pratinjau | `.board` berisi host `.board-live` dengan shadow root; isinya DOM render dengan `data-lakar-id` per node | — |
| Dokumen berubah | event change/reload → rev baru | board yang isinya berubah di-mount ulang tanpa `/screenshot`; board lain tidak disentuh | — |
| Deps gagal diambil | offline / 5xx | board tetap di-mount dengan deps yang sudah ada di cache; kunci gagal tidak di-cache (dicoba lagi saat koneksi pulih / mount berikutnya) | — |
| Resolve/mount gagal | `resolveDocument` atau `mountBoard` melempar | `.board-error` dengan pesan error (seperti PNG gagal) | — |
| Pratinjau History | `preview` aktif | board memakai PNG snapshot seperti sebelumnya | — |

</intent-contract>

## Code Map

- `packages/viewer/src/Canvas.tsx` -- `BoardImage` (PNG per board), loop board, prop Canvas; tempat `BoardLive`.
- `packages/viewer/src/Viewer.tsx` -- pemanggil `<Canvas>`; punya `latestDoc` (dokumen tersimpan terkini) dan `preview`.
- `packages/viewer/src/api.ts`, `packages/viewer/src/api.test.ts` -- klien `request` GET; tempat `renderDeps`.
- `packages/viewer/src/app.css` -- gaya `.board`, `.board img`.
- `packages/render/src/index.ts` -- `mountBoard`, `findBoard`, `fontRequests`, `iconRefs`, `iconKey`, `FontFaceSource`.
- `packages/render/src/fonts.ts` -- pola `FontFace` (`loadFaces`) yang diikuti viewer.
- `packages/schema/src/resolve.ts` -- `resolveDocument`.
- `packages/daemon/src/fonts.ts` -- `FontRegistry.resolveFaces` (lempar FONT_MISSING bila varian tidak ada).
- `packages/daemon/src/server.ts` -- `/fonts/:pkg/:file`, `/assets/:hash`, pendaftaran route, `icons` katalog.
- `packages/daemon/src/viewer.test.ts` -- pola tes route viewer (`buildServer` + `inject`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/render-deps.ts` -- baru: `registerRenderDepsRoutes(app, {fonts, icons})` dengan `GET /viewer/render-deps` (query `font` = `family:weight:style`, `icon` = `lib/name`, boleh berulang; maks 256 masing-masing) -- deps render viewer dari registry/katalog daemon.
- [x] `packages/daemon/src/server.ts` -- daftarkan route render-deps -- satu titik pendaftaran.
- [x] `packages/daemon/src/render-deps.test.ts` -- baru: tes semua baris matriks route -- kontrak route.
- [x] `packages/viewer/src/liveBoard.ts` -- baru: `boardDepKeys(board)`, `RenderDepsCache` (dedupe per kunci, kegagalan tidak di-cache), `ensureFaces(document, faces)`, `mountLive(host, resolved, boardId, deps)` (shadow root open + reset gaya + `mountBoard`), `boardSignature` -- logika live terpisah dari React agar bisa dites.
- [x] `packages/viewer/src/liveBoard.test.ts` -- baru: tes kunci deps, tanda tangan, cache (dedupe, hasil gabungan, missing, gagal → coba lagi) -- tanpa DOM.
- [x] `packages/viewer/src/api.ts` -- `renderDeps({fonts, icons})` → `GET /viewer/render-deps`; tes di `api.test.ts` -- klien bertipe.
- [x] `packages/viewer/src/Canvas.tsx` -- prop `doc?: LakarDocument`; `live` (hasil resolve) di-memo per `doc`; `BoardLive` (memo) untuk mode non-pratinjau, `BoardImage` tetap untuk pratinjau -- DOM hidup.
- [x] `packages/viewer/src/Viewer.tsx` -- teruskan `doc={latestDoc}` ke Canvas -- sumber dokumen live.
- [x] `packages/viewer/src/app.css` -- `.board-live` (wadah ukuran natural, `transform-origin: 0 0`, `pointer-events: none`) -- skala kamera tanpa mount ulang.

**Acceptance Criteria:**
- Given dokumen dengan board berisi teks, ikon, dan gambar terbuka di viewer, when canvas tampil, then setiap board adalah DOM (host `.board-live` dengan shadow root berisi elemen `[data-lakar-id]`) dengan font, glyph ikon, dan gambar termuat, dan tidak ada permintaan `POST /screenshot` untuk board itu.
- Given board live tampil, when agen menjalankan execute yang mengubah satu board, then board itu di-mount ulang dari dokumen baru tanpa screenshot dan board lain tidak di-mount ulang.
- Given board live tampil, when pengguna pan/zoom/Fit, then board ikut terskala dan tidak di-mount ulang.
- Given pengguna membuka pratinjau versi di History, when pratinjau tampil, then board memakai PNG snapshot seperti sebelumnya, dan kembali live setelah Back to latest.
- Given fitur viewer yang ada (outline kehadiran, Just changed, kursor agen, sisip layer, halaman, zoom/Fit, sheet mobile), when dipakai dengan board live, then perilakunya sama seperti dengan PNG.

## Spec Change Log

## Review Triage Log

### 2026-11-22 - Review pass
- verdicts: 36 findings - high 0, medium 8, low 16, false 12, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) Cache tidak memecah batch di RENDER_DEPS_MAX / batas URL - nyata hanya untuk board dengan >256 font/ikon unik; jarang dalam pemakaian sehari-hari dan perbaikannya menambah logika chunking.
  - `[low]` `[reject]` (blind) Satu kunci rusak menggagalkan seluruh batch dan dianggap gagal sementara - kunci berasal dari dokumen tervalidasi skema (weight 100–900 kelipatan 100, lib dari ICON_LIBS), jadi kunci rusak hampir tidak terjangkau; perbaikan menambah cabang 4xx.
  - `[false]` `[reject]` (blind) Pencocokan string eksak membuang face/glyph kanonik - `resolveFaces` mengembalikan `family: req.family` (fonts.ts:105) dan katalog mengembalikan nama yang diminta (alias `home`); kontrak kini dipatok tes baru (lihat baris vgap 3).
  - `[false]` `[reject]` (blind) Board tidak ada di dokumen ter-resolve → skeleton selamanya - di jalur live `boards` dan `doc` berasal dari objek `latestDoc` yang sama (`d = previewDoc ?? latestDoc`, pratinjau memakai PNG), jadi `findBoard` selalu menemukan board.
  - `[medium]` `[patch]` (blind) Deps parsial hanya dicoba ulang lewat tombol Retry; pesan error resolve lama tidak diganti - BoardLive kini memakai `useOffline()` dan mencoba ulang saat koneksi pulih; tanda tangan memuat `error:<pesan>` saat resolve gagal.
  - `[false]` `[reject]` (blind) Peredupan offline tidak mencapai board live - `.canvas.stale .board { opacity: .45 }` (app.css ~4507) berlaku pada `.board`, termasuk host shadow di dalamnya.
  - `[medium]` `[defer]` (blind) AC canvas (tanpa screenshot, pratinjau PNG, remount) tanpa tes otomatis - tidak ada setelan DOM untuk tes viewer; dicatat di `deferred` dan deferred-work.md (pilihan sumber board kini dipatok `boardSource`).
  - `[low]` `[defer]` (blind) Tindak lanjut ukuran bundle tidak tercatat di deferred-work.md - dicatat di `deferred` dan deferred-work.md; hit-test story 4 sudah ada di rencana epic.
  - `[false]` `[reject]` (blind) Mojibake di komentar `mountLive` - file berisi `→` UTF-8 yang benar (liveBoard.ts:116); artefak tampilan diff.
  - `[low]` `[patch]` (blind) Komentar header Canvas basi tentang PNG - komentar diperbarui: jalur PNG (pratinjau/tanpa doc) vs jalur live.
  - `[low]` `[reject]` (blind) `RenderDepsResult` didefinisikan tiga kali - pola repo: api.ts menyalin tipe respons daemon (DocSummary dll.); tipe bersama menambah permukaan publik di schema/render.
  - `[false]` `[reject]` (blind) Cache `ensureFaces` mengabaikan Document - viewer hanya punya satu document (tanpa popout/iframe); situasi dokumen kedua tidak terjangkau.
  - `[low]` `[reject]` (blind) BoardLive re-render tiap frame kamera - `findBoard` hanya iterasi board level atas (bukan tree), `boardSignature` di-memo per `resolved`; biaya per frame dapat diabaikan.
  - `[low]` `[reject]` (blind) Tes daemon kurang kasus tepi (batas font, 500, weight 1000) - weight 1000 tidak terjangkau (skema 100–900); sisanya cakupan tambahan tanpa cacat.
  - `[medium]` `[patch]` (edge) Deps gagal saat online / pulih otomatis tidak dicoba ulang - sama dengan perbaikan retry `useOffline` di atas.
  - `[low]` `[reject]` (edge) Face gagal dimuat tidak menandai board parsial - file font dari server yang sama dengan deps; jarang, perbaikan menambah nilai balik + cabang.
  - `[false]` `[reject]` (edge) Board tak ditemukan / ref host null → skeleton selamanya - sama dengan bantahan blind: board selalu ada di dokumen yang sama; ref terpasang sebelum efek berjalan.
  - `[low]` `[reject]` (edge) Remount yang melempar menyembunyikan DOM lama - `mountBoard` hanya melempar bila board tidak ada (tidak terjangkau); error ditampilkan sesuai matriks.
  - `[low]` `[reject]` (edge) >256 kunci baru satu board → 400 - sama dengan baris blind pertama.
  - `[low]` `[reject]` (edge) Query >16 KB → 431 - butuh ratusan kunci per jenis; tidak realistis.
  - `[low]` `[reject]` (edge) Satu kunci rusak menggagalkan batch - sama dengan baris blind kedua.
  - `[false]` `[reject]` (edge) Cache face per Document - satu document di viewer.
  - `[low]` `[reject]` (edge) Kunci `missing` tidak kedaluwarsa bila daemon menambah font/ikon - registry/katalog tetap per versi daemon; perbaikan menambah kedaluwarsa cache.
  - `[false]` `[reject]` (edge) Batas dicek setelah dedupe - kunci ganda tidak menambah kerja daemon; tidak ada klien yang bergantung pada hitungan mentah.
  - `[medium]` `[patch]` (edge) Retry hanya lewat tombol Retry (klaim) - terverifikasi (hooks.ts `useRetry` → `connection.onRetry`); diperbaiki dengan retry saat `useOffline` kembali false.
  - `[low]` `[patch]` (vgap) Pilihan live vs PNG di Canvas tanpa tes - diekstrak ke `boardSource(hasDoc, previewing)` di liveBoard.ts, dipakai Canvas, dites di liveBoard.test.ts.
  - `[medium]` `[defer]` (vgap) Siklus `mountLive`/`ensureFaces`/BoardLive hanya smoke manual - butuh harness Chromium; dicatat di `deferred`.
  - `[low]` `[patch]` (vgap) Kontrak gema nama family/ikon tidak dipatok tes - tes route baru meminta `inter:400:normal` dan `lucide/home` dan memeriksa nama kembali persis.
  - `[medium]` `[patch]` (vgap) Retry parsial hanya via tombol Retry - perbaikan `useOffline` yang sama.
  - `[low]` `[patch]` (vgap) Pesan error resolve lama tidak diganti - tanda tangan memuat pesan error.
  - `[false]` `[reject]` (intent) Font/aset tidak lewat `/viewer/*` - story meminta route `/viewer/*` baru "bila belum ada"; `/fonts/*` dan `/assets/*` sudah ada dan satu origin dengan `/app/`.
  - `[medium]` `[defer]` (intent) "Board adalah DOM data-lakar-id" tidak dites di permukaan canvas - digabung dengan item deferred harness canvas.
  - `[false]` `[reject]` (intent) Node di shadow root tidak terlihat oleh query light DOM - keputusan desain tercatat (isolasi gaya); shadow root open, D1 terpenuhi, story 4 memakai `shadowRoot`/`composedPath()`.
  - `[medium]` `[defer]` (intent) Remount tanpa screenshot tidak dites otomatis - digabung dengan item deferred harness canvas.
  - `[false]` `[reject]` (intent) "Tes tetap hijau" tanpa run CI Linux - instruksi story: tanpa kegagalan baru dibanding baseline Windows; CI dijalankan orkestrator saat PR.
  - `[false]` `[reject]` (intent) Kesetaraan visual dengan PNG tidak dites - AD-6 mengizinkan beda subpiksel di canvas; acuan piksel tetap render daemon.

## Design Notes

- **`mountBoard`, bukan `renderBoard`.** `renderBoard` menolak teks di luar cakupan font (FONT_MISSING) dan ikon tanpa glyph — benar untuk acuan piksel daemon (AD-6), tetapi canvas edit harus tetap menampilkan board. Viewer mendaftarkan `FontFace` ke `document.fonts` (cache per face, gagal → dihapus), menunggu face yang dibutuhkan termuat (maks 3 dtk), lalu `mountBoard` sinkron. Face di `document.fonts` berlaku juga di shadow tree.
- **Shadow root per board.** Mengisolasi DOM render dari `app.css` viewer (mis. `.board img`, font UI) sehingga tampilan sama dengan halaman render Chromium (`html,body{margin:0}`, gaya UA). Reset `:host{all:initial;display:block}`. Klik ter-retarget ke host di dalam `[data-board]`, jadi pilih/sisip tidak berubah. `pointer-events:none` di host sampai story 4 menambah hit-test (bisa lewat `composedPath()`/shadow root open).
- **Route deps berbasis kunci, bukan slug.** `GET /viewer/render-deps?font=…&icon=…` stateless dan di-cache viewer per kunci lintas board/dokumen; tidak bergantung pada rev (tidak ada balapan dokumen vs deps). Varian font / ikon tak dikenal dilaporkan di `missing` (bukan error) karena canvas tetap me-mount. Kunci font memakai `:` dengan weight dan style diambil dari kanan (nama family boleh berisi spasi).
- **Aset.** `assetBase` = `/assets/` (sama dengan halaman render daemon, origin sama dengan `/app/`).
- **Kinerja.** `resolveDocument` sekali per objek dokumen (`useMemo`), tanda tangan board = `JSON.stringify` board ter-resolve sekali per dokumen, mount hanya bila tanda tangan berubah; kamera hanya mengubah `transform: scale(z)` pada host.
- **Ukuran bundle.** `resolveDocument` menarik zod (lewat `tokens.ts`) ke bundle viewer: JS 397 kB → 523 kB (gzip 161 kB). Diterima karena AD-10 mewajibkan canvas memakai `resolveDocument`; memisahkan entry schema tanpa zod bisa jadi pekerjaan lanjutan.

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses (tsc -b + vite build)
- `npx -y pnpm@12.21.0 exec vitest run packages/daemon/src/render-deps.test.ts packages/viewer/ tests/dependency-direction.test.ts tests/resolve-document.test.ts` -- expected: hijau
- `npx -y pnpm@12.21.0 exec tsc -p tsconfig.test.json` -- expected: tanpa error
- `npx -y pnpm@12.21.0 exec vitest run packages/daemon/ packages/viewer/ tests/` -- expected: tanpa kegagalan baru dibanding `%TEMP%\lakar-fail-base.txt`

**Manual checks (if no CLI):**
- Jalankan daemon lokal (msedge) dengan dokumen berisi teks+ikon, buka `/app/#/d/<slug>` di Playwright: host `.board-live` punya shadowRoot dengan `[data-lakar-id]`, tidak ada `POST /screenshot` saat canvas tampil; ubah dokumen lewat route ops → DOM board ikut berubah; zoom mengubah `transform` saja.

**Hasil (implementasi):**
- build sukses; tsc tes bersih; tes terarah 19 file / 274 tes hijau.
- Suite daemon+viewer+tests: 40 gagal / 660 lulus, semuanya kategori baseline Windows (foto/Unsplash, SIGTERM/SIGKILL, pool config, skills api.md, C7/juri, practice-prompts, release.sh, ukuran skill core/landing); tidak ada kegagalan baru.
- Smoke Playwright (msedge, daemon port 7499): 3 node `[data-lakar-id]` di shadow root (board, teks "Halo Lakar", ikon lucide/house dengan 2 path SVG), Inter 700 termuat; update teks lewat ops → DOM berubah; tombol `=` → `transform: scale(0.83)`; 0 permintaan screenshot; 1 permintaan `render-deps`.

## Auto Run Result

**Ringkasan:** Canvas viewer me-mount board versi terkini sebagai DOM hidup (`resolveDocument` → `mountBoard` di shadow root per board, skala lewat transform kamera); deps font/glyph dari route baru `GET /viewer/render-deps`, aset dari `/assets/` lama. Pratinjau History, thumbnail, export, dan tool `screenshot` tetap PNG.

**File berubah:**
- `packages/daemon/src/render-deps.ts` -- baru: route deps render (face font + glyph, `missing` untuk yang tak dikenal, 400 untuk kunci rusak/>256).
- `packages/daemon/src/render-deps.test.ts` -- baru: tes matriks route + kontrak gema nama.
- `packages/daemon/src/server.ts` -- pendaftaran route.
- `packages/viewer/src/liveBoard.ts` -- baru: kunci deps, `RenderDepsCache`, `ensureFaces`, `mountLive`, `boardSource`, `boardSignature`.
- `packages/viewer/src/liveBoard.test.ts` -- baru: tes kunci, tanda tangan, sumber board, cache.
- `packages/viewer/src/Canvas.tsx` -- `BoardLive` (memo, retry saat koneksi pulih), prop `doc`, resolve sekali per dokumen.
- `packages/viewer/src/Viewer.tsx` -- `doc={latestDoc}`.
- `packages/viewer/src/api.ts`, `api.test.ts` -- `renderDeps` + tipe respons + tes.
- `packages/viewer/src/app.css` -- `.board-live`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- 2 item tunda.

**Temuan review (36):** patch 5 entri (1 medium: retry deps parsial saat koneksi pulih; 4 low: pesan error resolve basi, komentar header Canvas, `boardSource` + tes, tes kontrak gema nama). Ditunda 2 item (harness tes DOM canvas - medium; pertumbuhan bundle zod - low). Ditolak: 12 `false` dan 11 `low` dengan alasan per baris di Review Triage Log (batch >256/URL panjang, kunci rusak tak terjangkau, tipe respons tersalin sesuai pola repo, biaya re-render per frame dapat diabaikan, kasus tepi tes daemon, face gagal tanpa tanda parsial, remount melempar, kunci missing tak kedaluwarsa).

**Rekomendasi review lanjutan:** `false` -- pass pertama mem-patch 1 medium dan 4 low, 0 high.

**Verifikasi sesudah patch:** `pnpm build` sukses (JS 523.17 kB, gzip 161.26 kB); `tsc -p tsconfig.test.json` bersih; tes terarah 276/276 lulus; suite daemon+viewer+tests 40 gagal / 662 lulus, semua kategori baseline Windows, tanpa kegagalan baru.

**Risiko sisa:** siklus mount live (BoardLive/mountLive/ensureFaces) hanya diverifikasi smoke manual (ditunda); bundle +126 kB karena zod; face font gagal tidak memicu retry otomatis; board dengan >256 font/ikon unik akan gagal mengambil deps (ditolak sebagai tidak realistis).
