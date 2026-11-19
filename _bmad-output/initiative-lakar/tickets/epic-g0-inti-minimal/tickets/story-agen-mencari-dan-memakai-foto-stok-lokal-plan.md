---
title: 'Agen mencari dan memakai foto stok lokal'
type: feature
ticket: '18'
created: '2026-11-18'
status: done
baseline_revision: '9bce4f0705c6710658e9b94649d976103ff87318'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/initiative-lakar/architecture-lakar-core/architecture-lakar-core.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Agen Lakar hanya bisa memasang placeholder foto, sedangkan pen.dev memakai foto sungguhan (putaran 1, prompt B). Asset store dan fill gambar sudah ada (story 8), tetapi belum ada pencarian, impor, atau atribusi. Render juga belum pernah dibuktikan bebas jaringan.

**Approach:** Daemon mendapat modul `photos`. Modul ini memakai Pexels (pakai key) dengan cadangan Openverse (tanpa key, CC0/PDM/CC BY). Tool MCP `photo_search` mengembalikan kandidat beratribusi dan thumbnail pratinjau. Fungsi snippet sinkron `photo(ref)` mengembalikan `assetId` dan atribusi. Sebelum snippet jalan, daemon mengimpor sekali semua `photo('<ref>')` berliteral di kode ke `<dataDir>/assets/<sha256>`, lengkap dengan metadata sidecar. Browser render diblokir dari jaringan di luar daemon.

## Boundaries & Constraints

**Always:**
- QuickJS tetap sinkron (AD-7). Unduhan hanya terjadi di daemon sebelum snippet, di luar `docLocks`, sehingga lock dokumen tidak tertahan oleh jaringan. Render hanya membaca `/assets/<hash>` lokal (AD-10).
- Pemilihan penyedia: key Pexels valid → `pexels`. Tanpa key, key tidak aman, atau Pexels gagal 401/429/5xx → `openverse`. Respons mencantumkan `provider` dan `fallbackReason`.
- Ref kandidat `pexels:<id>` / `openverse:<uuid>` dipetakan ke URL unduhan lewat cache hasil cari. Cache miss → lookup by id ke API penyedia (Pexels `GET /v1/photos/{id}`, Openverse `GET /v1/images/{id}/`). Ref selalu divalidasi regex dan tidak pernah berupa URL bebas.
- SSRF: hanya `https`, tanpa kredensial di URL, port 443. Host diambil dari allowlist yang di-hardcode, bukan dari config:
  - API: `api.pexels.com`, `api.openverse.org`
  - Gambar: `images.pexels.com`, `live.staticflickr.com`, `farm<n>.staticflickr.com`, `upload.wikimedia.org`, dan thumbnail `api.openverse.org`
  - Openverse dicari dengan `source=flickr,wikimedia&license=cc0,pdm,by&category=photograph&mature=false`. Kandidat yang host-nya di luar allowlist dibuang.
  - Redirect diikuti manual, maks 3 hop, dan setiap hop divalidasi ulang.
  - Lookup DNS kustom menolak IP loopback, privat, link-local, CGNAT, ULA, dan multicast. Pengecekan ada di koneksi, bukan sebelum fetch.
- Batas: body JSON API ≤ 2 MiB, thumbnail ≤ 512 KiB, gambar ≤ 12 MiB (streaming; dibatalkan saat melewati batas, `content-length` tidak dipercaya). Timeout: API 8 dtk, thumbnail 5 dtk, gambar 20 dtk. Impor per execute maks 6 ref, paralel 3, total 30 dtk.
- Ukuran unduhan:
  - Pexels: `src.original` + `?auto=compress&cs=tinysrgb&w=2880`, cukup untuk board 1440 skala 2.
  - Openverse: `url` asli, hanya bila `filesize` (jika ada) ≤ 12 MiB.
- Validasi file: magic bytes lewat `rasterType` (PNG/JPEG/WebP/GIF), lalu sha256 → `assets/<sha>`. Penulisan atomik (tmp + rename, mode 644). sha yang sama tidak ditulis ulang.
- Metadata sidecar `<dataDir>/assets/meta/<sha>.json`: `{ref, provider, sourcePageUrl, downloadUrl, creator, creatorUrl, license, licenseUrl, attribution, width, height, bytes, mime, importedAt}`. Indeks `<dataDir>/photos/index.json` (ref → sha) menjamin foto yang sama tidak diunduh ulang.
- Secret:
  - Key hanya dibaca dari file `~/.config/lakar/pexels-api-key`. Path bisa diganti lewat kunci config `pexels_key_file`. Isinya satu baris berisi key saja; spasi dan newline di-trim.
  - File ditolak dan diperlakukan sebagai tanpa key bila mode bukan 600 / grup-lain bisa baca, atau pemiliknya bukan uid daemon. `status` lalu menulis `keyFile: 'insecure'`.
  - File dibaca ulang saat mtime berubah, jadi pergantian key tidak perlu restart.
  - Key hanya dikirim di header `Authorization` ke `api.pexels.com`. Key tidak pernah masuk URL, pesan error, status, metadata, log, atau git.
- Atribusi: hasil `photo_search` memuat `creator`, `license`, `sourcePageUrl`, dan baris `credit` siap pakai (Pexels: "Foto: <nama> / Pexels"; Openverse: teks `attribution`). Deskripsi tool menyebut "Photos provided by Pexels" (pedoman API Pexels).
- Kode error tetap enum AD-11 (Must not change epic):
  - Ref tidak dikenal, foto belum diimpor, atau tidak ada hasil → `NOT_FOUND`.
  - Penyedia gagal, timeout, atau melewati batas → `EXEC_ERROR` dengan `retryable: true` dan hint.
  - Input buruk → `SCHEMA_INVALID`.
- C7: deskripsi tool/fungsi dan teks skill boleh mengajarkan pemakaian foto secara umum, tanpa kata rubrik/golden/juri/skor/pen.dev/benchmark (`tests/check-c7.test.ts`, `tests/skills-c7.test.ts`).
- C9: tidak memakai apt, paket global, port, atau service baru. Unit `lakard` tidak diubah (tanpa `EnvironmentFile`, supaya key tidak masuk environment proses). `systemctl --user restart lakard` dijalankan setelah build.

**Never:**
- Tidak hotlink: render tidak pernah merujuk URL penyedia. Unsplash tidak dipakai.
- Tidak ada pre-fetch atau impor massal. Hanya ref yang dipakai snippet yang diunduh (larangan bulk copying ToS Pexels §8).
- Tidak menambah kode error atau mengubah skema fill gambar (`{type:'image', assetId, fit}`).
- Tidak menyentuh `bench/protocol/*` (protocolHash `907cb36f…`), `.mcp.json`, atau aplikasi lain.
- Tidak meminta key di chat. Implementer tidak membuat file key sendiri; itu langkah HITL.
- Rubrik dan prompt A/B tidak masuk skill (C7). Revisi skill yang kaya milik story 19.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cari dengan key | `photo_search {query:'kamar hotel', orientation?:'landscape', limit?:6}`, key valid | `{provider:'pexels', results:[{ref, width, height, alt, avgColor, creator, license, sourcePageUrl, credit}]}` + ≤ limit thumbnail (MCP image) | — |
| Tanpa key / key mode 644 | file tidak ada atau terlalu terbuka | `provider:'openverse'`, `fallbackReason:'no-key'\|'key-insecure'`; hasil hanya CC0/PDM/BY dari host allowlist | — |
| Pexels 429/5xx/timeout | key valid | fallback ke Openverse dan `fallbackReason` diisi | keduanya gagal → `EXEC_ERROR` retryable, tanpa key di pesan |
| Pakai di execute | `const p = photo('pexels:2014422'); add(b,{…fills:[{type:'image',assetId:p.assetId,fit:'cover'}]})` | Impor dulu (atau cache hit), lalu `p = {assetId, width, height, credit, license, creator, sourcePageUrl}` dan screenshot menampilkan foto | — |
| Impor ulang | ref yang sama di execute berikutnya | tanpa request jaringan (indeks) | — |
| Ref dinamis/tak dikenal | `photo(x)` dengan x non-literal yang belum diimpor, atau `photo('foo')` | — | `NOT_FOUND` + hint "pakai ref literal dari photo_search" / `SCHEMA_INVALID` untuk format |
| Host/redirect/IP jahat | URL gambar redirect ke host lain atau resolve ke 10.x/127.x | unduhan ditolak | `EXEC_ERROR` retryable:false, foto tidak tersimpan |
| File buruk | body HTML/SVG atau > 12 MiB | dibatalkan, tidak ada file di `assets/` | `EXEC_ERROR` |
| Render offline | halaman render meminta host non-daemon | permintaan gagal (resolver diblokir); render foto lokal tetap ok | — |

</intent-contract>

## Code Map

- `packages/daemon/src/assets.ts` -- `rasterType` (L8) dan `readAsset` (L19) dipakai ulang. Tambah `writeAsset(dataDir, bytes) → sha` (atomik) dan `readAssetMeta`. `ASSET_ID_PATTERN` (`packages/schema/src/nodes.ts` L16) membuat `/assets/meta/*.json` tidak tersaji.
- `packages/daemon/src/server.ts` -- `POST /icons/search` (L539–545) menjadi pola untuk `POST /photos/search`. Execute (≈L300–345): pre-impor ditaruh sebelum `docLocks.run`, lalu `photos` diteruskan ke `runSnippet` seperti `icons` (L336). `/status` (L209–235) mendapat `photos`. `STATUS` map (L44) tidak berubah. `bodyLimit` 1 MB (L155) tetap.
- `packages/daemon/src/config.ts` -- `KEYS` (L34) menambah `pexels_key_file`, karena parser menolak kunci tak dikenal. `DaemonConfig` (L18).
- `packages/daemon/src/chromium.ts` -- `launch` (≈L69) menambah arg khusus daemon `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost`. `CHROMIUM_ARGS` render tidak diubah. Hook `onLease(page)` dipakai tes untuk `page.route`.
- `packages/daemon/src/start.ts`, `main.ts` -- pembuatan `PhotoService` (dataDir, path key) diteruskan ke `buildServer`.
- `packages/ports/src/index.ts` -- `IconCatalogPort` (L61) menjadi pola untuk `PhotoLibraryPort` sinkron `{resolve(ref): PhotoInfo | undefined}`.
- `packages/exec/src/api.ts` -- `LakarApi` (L84), `ApiContext` (L125; tambah `photos`), entri `iconSearch` (L512) sebagai pola entri `photo` (`kind:'read'`, sync). `api-md.ts` + `node scripts/gen-skill-api.mjs` meregenerasi `packages/skills/skills/api.md`. `exec/src/index.ts` `RunOptions` menambah `photos`.
- `packages/mcp/src/server.ts` -- `registerTool` icon_search (L312–329) dan `ICON_SEARCH_DESCRIPTION` (L187) jadi pola. `StatusData`/`formatStatus`/`STATUS_DESCRIPTION` (L63–98) diperbarui. Kembalikan teks + `image` content untuk thumbnail.
- `packages/mcp/src/index.test.ts` L160 -- daftar tool persis; tambah `photo_search`.
- `tests/execute-description.test.ts` -- setiap kunci `API` harus muncul sebagai `name(` di `EXECUTE_DESCRIPTION`; tambah `photo(`.
- `packages/skills/skills/core.md` -- satu paragraf umum alur foto (`photo_search` → `photo('<ref>')` → fill `cover`, credit bila sesuai). Contoh ```js diuji `skills-examples.test.ts` dengan Chromium, jadi contoh di skill tidak boleh butuh jaringan: pakai fake provider atau tulis contoh sebagai teks non-```js.
- Pola fake HTTP server: `packages/mcp/src/index.test.ts` L34. Integrasi daemon: `index.test.ts` L48 (`mkdtemp` + `startDaemon`), aset manual L1052–1090.
- Jangan ubah: `bench/protocol/*`, `bench/src/protocol.ts` `PROTOCOL_FILES`, `.mcp.json`, `tools/lakard/lakard.service`, skema `nodes.ts` fill image, enum `errors.ts`.
- Kontinuitas 17: story 17 hanya mengubah bench/juri dan tidak menyentuh daemon/mcp/exec.

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/photos/net.ts` -- `safeFetch(url, {kind, maxBytes, timeoutMs, headers})`: allowlist host per kind, https/443, redirect manual ≤ 3 dengan validasi ulang, lookup DNS kustom yang menolak IP non-publik, body streaming dengan batas byte. Error disanitasi (tanpa header atau query). Allowlist dan lookup dapat diinjeksi hanya lewat konstruktor untuk tes -- inti keamanan.
- [x] `packages/daemon/src/photos/providers.ts` -- adapter `pexels` (search `locale` default `id-ID`, `per_page` ≤ 12, by-id) dan `openverse` (filter tetap di atas, by-id, kandidat host non-allowlist dibuang), dipetakan ke `PhotoCandidate`. Thumbnail: Pexels `src.tiny`, Openverse `thumbnail`.
- [x] `packages/daemon/src/photos/service.ts` -- `PhotoService`:
  - pembacaan key (mode/uid/mtime)
  - pemilihan provider + fallback
  - cache hasil cari (memori LRU 200, TTL 24 jam)
  - `search()` dengan thumbnail paralel
  - `importRefs(refs)` → `assets/<sha>` + `assets/meta/<sha>.json` + `photos/index.json` (atomik, mutex per ref)
  - `resolve(ref)` sinkron dari indeks di memori
  - `status()` → `{provider, keyFile:'present'|'absent'|'insecure', imported:n}`
- [x] `packages/daemon/src/assets.ts` -- `writeAsset` atomik + `readAssetMeta`.
- [x] `packages/daemon/src/config.ts` -- kunci `pexels_key_file` (env `LAKAR_PEXELS_KEY_FILE`), default `~/.config/lakar/pexels-api-key`.
- [x] `packages/ports/src/index.ts`, `packages/exec/src/api.ts`, `packages/exec/src/index.ts` -- `PhotoLibraryPort`, `ApiContext.photos`, entri `photo(ref)` (signature, doc umum, returns, errors `['NOT_FOUND','SCHEMA_INVALID']`, contoh yang memakai port fake di tes). Eksport `photoRefsInCode(code)`, regex literal `photo\(\s*(['"])(pexels|openverse):[A-Za-z0-9-]{1,64}\1`.
- [x] `packages/daemon/src/server.ts`, `start.ts`, `main.ts` -- route `POST /photos/search` (zod `{query 1–100, orientation?, limit? 1–12, preview? default true}`). Execute melakukan pre-impor `photoRefsInCode` di luar lock, dengan error impor dipetakan sesuai matriks. `photos` diteruskan ke `runSnippet`. `/status.photos`.
- [x] `packages/daemon/src/chromium.ts` -- `--host-resolver-rules` di launch daemon.
- [x] `packages/mcp/src/server.ts` -- tool `photo_search` (deskripsi umum + "Photos provided by Pexels", alur `photo('<ref>')`, catatan kredit). Respons teks JSON + ≤ 6 image content (base64 thumbnail dari daemon). Status memformat `photos`. `EXECUTE_DESCRIPTION` menyebut `photo(`.
- [x] `packages/skills/skills/core.md` + regen `packages/skills/skills/api.md` (`pnpm build && node scripts/gen-skill-api.mjs`) -- paragraf umum alur foto (C7).
- [x] Tes:
  - `packages/daemon/src/photos/*.test.ts`: fake provider HTTP lokal (allowlist dan lookup diinjeksi) untuk setiap baris matriks, mencakup redirect lintas host, IP privat, body > batas, HTML berlabel jpeg, 429 → fallback, key 644 → openverse, key tidak muncul di error/status/meta/indeks, dan cache hit tanpa request.
  - Tes integrasi daemon + Chromium: execute dengan `photo()` membuat screenshot yang piksel tengahnya ≈ warna foto uji. `onLease` memasang `page.route('**/*')` yang mencatat dan membatalkan semua request non-`127.0.0.1`. Hasilnya daftar request luar `[]`, render ok, dan `page.evaluate(fetch('https://images.pexels.com/'))` gagal.
  - Perbarui `packages/mcp/src/index.test.ts` dan `tests/execute-description.test.ts`.
- [x] `scripts/photo-offline-check.mjs` -- skrip verifikasi live (dipakai orkestrator, bukan tes CI). Lewat HTTP ke lakard 127.0.0.1:7466, skrip ini:
  - mencari "kamar hotel"
  - membuat doc uji `photo-check`
  - menjalankan execute fill kartu dengan kandidat pertama, lalu screenshot
  - memakai Playwright terpisah (Chromium Lakar, `page.route` mengabortkan semua host non-127.0.0.1) untuk memuat `/render/page`, me-render doc itu, dan screenshot ulang
  - membandingkan keduanya (selisih piksel ≤ 1 %) dan mencetak request luar yang tercatat (harus 0)
  - mencetak path metadata aset.

**Acceptance Criteria:**
- Given key Pexels terpasang (HITL) dan lakard di-restart, when sesi Claude Code baru memanggil `photo_search` "kamar hotel", then hasil `provider:'pexels'` memuat ≥ 3 kandidat dengan creator, license, sourcePageUrl, credit, dan thumbnail.
- Given kandidat terpilih, when satu `execute` memakai `photo('<ref>')` sebagai fill kartu lalu `screenshot`, then foto tampil di kartu.
- Given `scripts/photo-offline-check.mjs` dijalankan, when render ulang dengan semua request non-daemon dibatalkan di halaman render, then foto tetap tampil (selisih ≤ 1 %) dan 0 request luar tercatat.
- Given foto sudah diimpor, when `cat <dataDir>/assets/meta/<sha>.json`, then file memuat provider, sourcePageUrl, creator, license, width/height, dan bytes, dan `photos/index.json` memetakan ref → sha.
- Given file key tidak ada, when `photo_search` dipanggil, then hasil Openverse CC0/PDM/BY dengan `fallbackReason:'no-key'` (tetap berfungsi tanpa Adam).
- Given key terpasang, when `git grep -qF -f ~/.config/lakar/pexels-api-key` dan grep journal lakard serta `<dataDir>` dijalankan, then tidak ada hit.
- Given build selesai, when `tools/node26/verify.sh` dijalankan, then lakard aktif di 127.0.0.1:7466 dan snapshot C9 identik (pen, MCP pencil, n8n-mcp, t3code tetap berjalan).

## Implementation Notes

**Amandemen orkestrator (2026-11-18, disetujui atas mandat Adam):** penerbitan API key Pexels sedang ditutup oleh Pexels, jadi Adam tidak punya key. Konsekuensi:
- Openverse tanpa key adalah penyedia AKTIF saat ini. Adaptor Pexels tetap dibangun persis seperti plan dan dites dengan fake; ia aktif otomatis hanya bila file `~/.config/lakar/pexels-api-key` valid ada. File itu sekarang tidak ada; implementer TIDAK boleh membuatnya.
- Langkah HITL `request_secret` dilewati. AC pertama dijalankan dengan provider `openverse` (`fallbackReason:'no-key'`), sesuai Design Notes ("Bila Adam menolak ...").
- AC/verifikasi grep key hanya berlaku bila key ada, jadi dilewati.
- Batas rate Openverse anonim terukur (header `x-ratelimit-*`, 2026-11-18): burst 20/menit, sustained 200/hari. Cache hasil cari 24 jam + indeks ref→sha wajib supaya satu run bench (beberapa pencarian + beberapa impor; impor memakai cache hasil cari sehingga tidak perlu lookup by-id) aman di bawah batas. Tangani 429 Openverse sebagai `EXEC_ERROR` retryable dengan hint (jangan retry otomatis berulang; jangan mengakali rate limit).
- Catatan: saat diukur, pencarian Openverse yang tidak ter-cache CDN sering mengembalikan 504 dari Cloudflare setelah ~9–13 dtk. Timeout API 8 dtk dari plan tetap; 5xx/timeout → `EXEC_ERROR` retryable.
- Lingkungan (C9): Node 26 dipakai lewat `PATH=/opt/node-26/bin:$PATH` (mis. `PATH=/opt/node-26/bin:$PATH pnpm build`); Node sistem tetap 22. Tanpa apt, tanpa npm global. Jangan ubah folder yang tercantum di `.git/info/exclude`. Render tidak pernah mengakses jaringan.

## Plan Change Log

- 2026-11-18 (implementasi): tambahan kecil di luar plan — `keyFile:'invalid'` / `fallbackReason:'key-invalid'` untuk file key berisi format tak valid; `previews:[ref]` di teks `photo_search` MCP (urutan thumbnail); cache thumbnail di memori (≤ 24 MiB) untuk menghemat kuota Openverse; `scripts/photo-offline-check.mjs` membaca file dokumen dari dataDir hanya-baca (pola sama dengan `tracer-check.mjs`) dan menerima query sebagai argumen. SafeNet tes juga bisa mengganti `transport` (http ke server palsu) dan predikat IP (loopback diizinkan khusus tes).
- 2026-11-18 (verifikasi live): Openverse tidak punya hasil untuk "kamar hotel" (result_count 0) dan sering 504/timeout > 8 dtk. Skrip live lulus pada percobaan ke-3 dengan query "hotel room" (provider openverse, no-key, 6 hasil + 6 thumbnail, 3,6 dtk; selisih render 0,000 %; 0 permintaan luar).
- 2026-11-18 (verifikasi orkestrator): thumbnail Openverse gagal 406 untuk kandidat yang belum ter-cache CDN karena header `Accept: image/*` (negosiasi konten DRF di `/v1/images/<id>/thumb/`); hanya 0–3 dari 6 thumbnail sampai. Diperbaiki: `IMAGE_ACCEPT` (`image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.8`) di `net.ts`; validasi isi tetap via magic bytes. Fake Openverse kini menjawab 406 bila Accept tanpa `*/*`, dan tes no-key mengecek setiap kandidat punya thumbnail (merah sebelum perbaikan, hijau sesudah). Batas thumbnail anonim terukur terpisah: `anon_thumbnail` 1000/hari.

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 8 findings — high 0, medium 3, low 4, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` AC1/skrip live: Openverse 0 hasil untuk "kamar hotel", `photo-offline-check.mjs` default crash — default query kini mengikuti provider (`pexels` → "kamar hotel", `openverse` → "hotel room"); skrip tanpa argumen lulus. Deviasi AC1 (query Inggris saat Openverse) dicatat di Auto Run Result.
  - `[low]` `[patch]` `chromium.ts`: `--host-resolver-rules` tidak memblok URL ber-IP literal, komentar mengklaim isolasi penuh — komentar dikoreksi: isolasi IP literal berasal dari skema (fill gambar hanya `assetId` sha256, tanpa field URL).
  - `[medium]` `[patch]` `photos-render.test.ts`: assert "resolver diblokir" tak membedakan resolver vs CORS — kini `fetch(..., {mode:'no-cors'})` + `requestfailed` errorText harus `ERR_NAME_NOT_RESOLVED`.
  - `[low]` `[reject]` `service.ts`: anggaran impor 30 dtk tidak mencakup lookup by-id (hanya pada cache miss; maks ≈ 38 dtk) dan pesan timeout menyebut batas 20000 ms — jarang (butuh restart daemon + 6 ref baru + API lambat), dampak hanya beberapa detik/pesan; perbaikan menambah parameter signal di semua adaptor.
  - `[medium]` `[patch]` `service.ts`: daemon mengambil sampai 12 thumbnail padahal MCP menampilkan 6, memboroskan kuota `anon_thumbnail` — thumbnail kini dibatasi `THUMBNAILS_MAX = 6` kandidat teratas.
  - `[low]` `[reject]` `photoRefsInCode` ikut memindai komentar/string — agen menulis `photo('<ref>')` hanya di tempat dipakai; kasus ref di komentar jarang dan tetap satu foto on-demand (bukan salinan massal); perbaikan butuh parser JS.
  - `[low]` `[reject]` meta sidecar per sha tertimpa bila dua ref menghasilkan byte identik — praktis tidak terjadi (dua foto berbeda dengan sha256 sama); perbaikan mengubah tata letak metadata.
  - `[false]` `[reject]` mode key 400/700 diterima — plan menyamakan "mode bukan 600" dengan "grup-lain bisa baca"; kode menolak setiap bit grup/lain dan pemilik ≠ uid daemon, jadi tujuan keamanan terpenuhi; 400 lebih ketat dari 600. statSync mengikuti symlink, tetapi yang dicek tetap file yang dibaca.

## Design Notes

**Penyedia dan lisensi (diperiksa 2026-11-18):**
- **Pexels (default).** Lisensinya (pexels.com/license) menyatakan "free to use", "Attribution is not required", dan boleh dimodifikasi. ToS §5 mengizinkan "download, use, copy, modify". Tidak ada kewajiban hotlink. Larangannya: menjual salinan tanpa diubah, menyiratkan endorsement, redistribusi ke platform stok, dan "Bulk, large-scale or systematic copying" (§8), sehingga impor hanya on-demand. §11 meminta konten dihapus bila ada klaim, sehingga ref disimpan di metadata.
  - Pedoman API: "show a prominent link to Pexels", "credit our photographers when possible".
  - Rate limit: 200 req/jam, 20.000/bulan. Key gratis; header `Authorization: <key>` tanpa Bearer. Mendukung `locale=id-ID`, dan parameter `w` pada src berfungsi (contoh di dokumentasi API).
  - Sumber: pexels.com/license, pexels.com/api/documentation, pexels.com/terms-of-service.
- **Openverse (cadangan tanpa key).** Pemakaian anonim diizinkan. Batas anonim tidak terkonfirmasi: kode default 5/jam burst dan 100/hari, sumber pihak ketiga menyebut 20/menit dan 200/hari. Batas sebenarnya dicek lewat `GET /v1/rate_limit/`.
  - Field `attribution` adalah "Legally valid attribution". Openverse tidak menjamin status lisensi, dan pengguna wajib mematuhi lisensi konten; CC BY wajib atribusi, maka `credit` disimpan.
  - Larangan: scraping dan mengakali rate limit.
  - Sumber: api.openverse.org/v1/schema, docs.openverse.org/terms_of_service.html, docs.openverse.org/api/reference/authentication_and_throttling.html.
- **Unsplash ditolak.** Pedomannya berbunyi "All API uses must use the hotlinked image URLs … applies to all uses of the image" (help.unsplash.com/en/articles/2511271), sehingga bertentangan dengan render offline.
- **Pixabay** (pixabay.com/api/docs) cocok dengan unduhan lokal, tetapi butuh key kedua dan resolusi gratisnya maks 1280 px. Pixabay tidak dipakai, dan pilihan Sofia dipertahankan.
- Pemakaian internal non-komersial aman untuk ketiga penyedia yang dipakai.

**Mengapa pre-impor literal, bukan `photoImport` async:** QuickJS sinkron (AD-7; async host = Deferred). Pre-impor menghemat satu panggilan tool agen per foto (~5–10 dtk giliran model), dibanding tool `photo_import` terpisah. Konsistensinya dengan ikon: tool cari di MCP, pemakaian di snippet.

**Mengapa key lewat file, bukan EnvironmentFile:** daemon membaca file saat dibutuhkan, sehingga key tidak tampil di `/proc/<pid>/environ`/`systemctl show`, unit tidak berubah (verify.sh membandingkan ExecStart/Restart), dan key bisa diganti tanpa restart.

**Pemblokiran jaringan render:** `--host-resolver-rules` berlaku permanen di browser daemon dan tanpa overhead (`page.route` mematikan cache HTTP). Ini hanya untuk Chromium Lakar, bukan firewall VPS. Buktinya `page.route` yang mencatat dan membatalkan request, di tes dan di skrip live.

**Anggaran waktu (gerbang ≤ 1,5× median baseline: A 250,9 dtk, B 197,0 dtk):** `photo_search` p95 ≤ 3 dtk (API + 6 thumbnail paralel), impor ≤ 4 dtk per foto (paralel 3). Run dengan 2–4 foto diperkirakan +6–12 dtk di sisi alat, ≤ 5 % median baseline A. Cache cari 24 jam dan indeks ref→sha meniadakan unduhan ulang lintas run. Untuk putaran resmi, latensi impor tetap dihitung, karena bench membiarkan cache tetap ada. Ini simetris dengan pen.dev, yang punya fitur gambar sendiri. Pembungkus tidak berubah.

**HITL Adam (key Pexels):** opsional; tanpa key, Openverse tetap berjalan.
- Orkestrator memanggil `request_secret` (label "Pexels API key", URL https://www.pexels.com/api/new/, `delivery: file`), lalu menaruh file `~/.config/lakar/pexels-api-key`:
  - isinya satu baris yang hanya berisi key (tanpa `KEY=`, tanpa tanda kutip)
  - direktori `~/.config/lakar` mode 700, file mode 600, pemilik root
- Perintah penempatan: `install -d -m 700 ~/.config/lakar && install -m 600 "<file secret>" ~/.config/lakar/pexels-api-key`.
- Restart tidak wajib (key dibaca ulang saat mtime berubah), tetapi setelah build tetap jalankan `systemctl --user restart lakard`.
- Live AC Pexels menunggu langkah ini. Bila Adam menolak, AC pertama dijalankan dengan provider `openverse` dan dicatat.

**Arsitektur:** keputusan ini menyelesaikan AD-10 §Deferred (penyedia) dan menambah `photo_search` ke daftar tool v1 AD-11. Tawarkan `bmad-architecture` untuk mencatatnya; spine tidak diedit di story ini.

## Verification

**Commands:**
- `pnpm build && pnpm test` -- expected: lulus semua, termasuk tes photos (fake provider) dan integrasi Chromium offline.
- `node scripts/gen-skill-api.mjs && git diff --stat packages/skills/skills/api.md` -- expected: `photo(` ada di api.md, dan file regenerasi sama dengan yang di-commit.
- `pnpm vitest run tests/skills-c7.test.ts tests/check-c7.test.ts tests/execute-description.test.ts packages/mcp/src/index.test.ts` -- expected: lulus.
- `systemctl --user restart lakard && curl -s 127.0.0.1:7466/status | grep -o '"photos":{[^}]*}'` -- expected: provider/keyFile tanpa key.
- `/opt/node-26/bin/node scripts/photo-offline-check.mjs` -- expected: request luar 0, selisih ≤ 1 %, dan path meta dicetak.
- `git grep -qF -f ~/.config/lakar/pexels-api-key; echo $?` dan `journalctl --user -u lakard | grep -cF -f ~/.config/lakar/pexels-api-key` dan `grep -rlF -f ~/.config/lakar/pexels-api-key ~/.local/share/lakar` -- expected: `1`, `0`, dan kosong (hanya bila key ada).
- `tools/node26/verify.sh` -- expected: semua OK, snapshot C9 identik.
- `git diff --quiet 9bce4f0705c6710658e9b94649d976103ff87318 -- bench/protocol .mcp.json tools/lakard/lakard.service; echo $?` -- expected: `0` (pembungkus, konfigurasi MCP, dan unit beku).

**Manual checks (if no CLI):**
- Sesi Claude Code baru (`--allowedTools mcp__lakar`): `photo_search` "kamar hotel", lalu execute kartu dengan foto, lalu screenshot. Foto terlihat dan credit tercantum di hasil tool.

## Auto Run Result

Status: built

**Ringkasan:** daemon mendapat modul `photos` (SafeNet SSRF-aman, adaptor Pexels + Openverse, `PhotoService` dengan cache cari 24 jam, cache thumbnail, impor on-demand ke `assets/<sha>` + `assets/meta/<sha>.json` + `photos/index.json`). Tool MCP `photo_search` (JSON + ≤ 6 thumbnail), fungsi snippet sinkron `photo(ref)` dengan pre-impor ref literal di luar `docLocks`, `/status.photos`, browser daemon dengan `--host-resolver-rules`. Penyedia aktif: Openverse tanpa key (amandemen: Pexels menutup penerbitan key; adaptor Pexels dites dengan fake dan aktif otomatis bila file key valid ada).

**File:**
- `packages/daemon/src/photos/net.ts` — klien HTTP keluar: allowlist host, https/443, redirect manual ≤ 3, lookup DNS penolak IP non-publik, batas byte/waktu, Accept gambar dengan `*/*`.
- `packages/daemon/src/photos/providers.ts` — adaptor Pexels/Openverse → `PhotoCandidate`, filter lisensi cc0/pdm/by.
- `packages/daemon/src/photos/service.ts` — key file (mode/uid/mtime), fallback, cache, thumbnail, impor, indeks, status.
- `packages/daemon/src/assets.ts` — `writeAsset` atomik, `writeAssetMeta`/`readAssetMeta`, `imageSize`.
- `packages/daemon/src/{server,start,main,config,chromium,index}.ts` — route `/photos/search`, pre-impor execute, status, kunci `pexels_key_file`, arg resolver.
- `packages/ports`, `packages/exec` — `PhotoLibraryPort`, `photo(ref)`, `photoRefsInCode`.
- `packages/mcp/src/{server,index}.ts` — tool `photo_search`, status, deskripsi execute.
- `packages/skills/skills/core.md` + `api.md` (regen) — paragraf umum alur foto (C7).
- Tes: `photos/photos.test.ts`, `photos-render.test.ts`, `tests/support/photos.ts`, pembaruan tes daemon/exec/mcp/skills-examples.
- `scripts/photo-offline-check.mjs` — verifikasi live.

**Review:** 1 lensa (quick), 8 temuan: 4 patch (3 medium, 1 low), 0 defer, 4 ditolak (3 low, 1 false; alasan di triage log). Ditambah 1 perbaikan saat verifikasi (406 thumbnail Openverse, Plan Change Log). `followup_review_recommended: true` (pass pertama, 3 entri medium di-patch: 0 high, 3 medium, 1 low). Risiko tak terverifikasi yang dinamai: jalur Pexels (header `Authorization`, `locale=id-ID`, `?w=2880`, pemetaan by-id) belum pernah menyentuh API nyata — hanya fake; review lanjutan sebaiknya dijalankan saat key Pexels tersedia.

**Verifikasi:**
- `pnpm build && pnpm test`: 46 file, 746 tes lulus. Tes foto 28 lulus (setiap baris matriks).
- `node scripts/gen-skill-api.mjs`: api.md identik dengan versi di-commit; `photo(` ada.
- Tes C7/execute-description/mcp: 57 lulus.
- `systemctl --user restart lakard`: active; `/status.photos` = `{"provider":"openverse","keyFile":"absent",...}`.
- `scripts/photo-offline-check.mjs` (tanpa argumen → "hotel room"): 6 kandidat beratribusi + 6 thumbnail, selisih render offline 0,000 %, 0 request luar, meta lengkap.
- `bash tools/node26/verify.sh` (PATH bawaan): exit 0, 24 OK, snapshot C9 identik.
- `git diff --quiet 9bce4f07 -- bench/protocol .mcp.json tools/lakard/lakard.service`: 0.
- Grep key: dilewati (tidak ada file key).
- Rate limit Openverse anonim nyata (header): `anon_burst` 20/menit, `anon_sustained` 200/hari, `anon_thumbnail` 1000/hari. Pemakaian per run bench (perkiraan 2–4 pencarian, 2–6 impor): 2–4 request API (impor memakai cache hasil cari, unduhan ke Flickr/Wikimedia tidak dihitung), ≤ 24 thumbnail → ±50 run/hari sebelum batas sustained.
- Latensi live: `photo_search` dingin 1,2–4,8 dtk (6 hasil + 6 thumbnail), cache CDN/daemon 0,1–0,2 dtk; impor 3 foto dingin 0,4–0,65 dtk; impor ulang (indeks) ≤ 0,01 dtk.
- Smoke `claude -p` (MCP lakar saja, prompt latihan umum kartu kedai kopi): 48 dtk, $0,38, 9 giliran; agen memanggil `photo_search` → `photo()`; PNG menampilkan foto interior kedai sungguhan (Flickr, CC BY 2.0) dengan kredit ringkas di kartu.

**Deviasi AC:** AC1 dijalankan dengan provider `openverse` (tanpa key) dan query "hotel room": Openverse tidak punya hasil untuk "kamar hotel" (indeks berbahasa Inggris). Hint NOT_FOUND, deskripsi tool, dan skill mengarahkan agen ke kata kunci Inggris. AC grep key dilewati (tanpa key).

**Residual risk:**
- Openverse anonim tidak stabil: pencarian yang belum ter-cache CDN kadang 504/timeout 8 dtk; agen mendapat `EXEC_ERROR` retryable lalu fallback ke placeholder sesuai skill. Bisa menambah variansi latensi bench.
- Kualitas/relevansi foto Openverse (Flickr/Wikimedia) lebih bervariasi daripada Pexels; kredit CC BY panjang harus diringkas agen.
- Pexels hanya diverifikasi dengan fake.
- Kuota 200 pencarian/hari bersama untuk semua sesi di VPS ini; sweep besar (story 20) bisa menyentuhnya — cache 24 jam meredam pengulangan query yang sama.
- Arsitektur spine belum mencatat keputusan penyedia + tool `photo_search` (tawarkan `bmad-architecture`).
