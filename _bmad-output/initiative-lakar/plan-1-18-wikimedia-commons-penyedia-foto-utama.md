---
title: 'Wikimedia Commons sebagai penyedia foto utama (lanjutan story 1.18)'
type: feature
ticket: ''
created: '2026-11-18'
status: built
baseline_revision: '3805084034d912641bcb6b3729ac6f25b19f1b84'
route: full
route_source: auto
risk: high
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/initiative-lakar/tickets/epic-g0-inti-minimal/tickets/story-agen-mencari-dan-memakai-foto-stok-lokal-plan.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Tanpa key Pexels, `photo_search` jatuh ke Openverse, yang selama latihan 1.19 hampir selalu timeout 8 dtk / NOT_FOUND, sehingga agen berakhir dengan blok pengganti. Keputusan Adam 2026-11-18: Wikimedia Commons API (tanpa key) menjadi penyedia utama.

**Approach:** Adaptor ketiga `WikimediaProvider` di modul `photos` daemon (pola sama dengan Pexels/Openverse dari story 1.18). Urutan: Pexels bila file key valid → Wikimedia Commons → Openverse cadangan. Ref baru `wikimedia:<pageid>`. Pencarian menyaring dan me-ranking agar yang tampil foto stok berkualitas (bitmap foto, lisensi aman, resolusi/rasio layak, bukan diagram/peta/logo/lukisan).

## Boundaries & Constraints

**Always:**
- Semua invarian plan 1.18 tetap: impor sekali di daemon di luar `docLocks`, `assets/<sha>` + `assets/meta/<sha>.json` + `photos/index.json`, cache cari 24 jam, SafeNet (https/443, allowlist hardcode, redirect ≤ 3 dengan validasi ulang, DNS menolak IP non-publik, batas byte streaming, timeout API 8 dtk / thumb 5 dtk / gambar 20 dtk, impor maks 6 ref paralel 3 total 30 dtk), render tanpa jaringan.
- Allowlist: `api` + `commons.wikimedia.org`; `thumb`/`image` + `thumb.wikimedia.org` (API Commons kini mengembalikan thumbnail di host ini; terukur 2026-11-18) — `upload.wikimedia.org` sudah ada.
- API Commons: `https://commons.wikimedia.org/w/api.php`, `action=query&format=json&formatversion=2&generator=search&gsrnamespace=6&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiextmetadatafilter=LicenseShortName|License|LicenseUrl|Artist|ObjectName|Categories|NonFree&maxlag=5`, `gsrsearch="<query> filetype:bitmap filew:>799"`, `gsrlimit` 40 (50 bila orientation), `iiurlwidth=330` (pratinjau). By-id: `pageids=<id>` dengan prop sama.
- Respons `{"error":{"code":"maxlag"}}` (HTTP 200 + `Retry-After`) → `NetError` http 503 retryable; `error` lain → `bad-response`. Tanpa retry otomatis.
- Permintaan API Wikimedia serial: satu permintaan API Wikimedia sedang berjalan per `WikimediaProvider` (antrean promise). Thumbnail tetap paralel (ukuran standar, ter-cache CDN).
- User-Agent semua permintaan keluar: konstanta `USER_AGENT = 'Lakar/0.1 (internal design tool)'` — tanpa email, nama, hostname, atau data pribadi.
- Ukuran thumbnail Wikimedia hanya bucket standar (`20,40,60,120,250,330,500,960,1280,1920,3840`; ukuran lain → HTTP 400 "Use thumbnail sizes listed on https://w.wiki/GHai", terukur). Pratinjau = `thumburl` API (330). URL impor (target ≥ 2880 untuk board 1440 skala 2): lebar asli ≤ 3840 dan `size` ≤ 12 MiB → `url` asli; selain itu turunkan dari path thumbnail pratinjau dengan mengganti segmen `/330px-` → `/3840px-` (JPEG/WebP) atau `/1920px-` (PNG); turunan gagal → kandidat dibuang. Parameter `utm_*` dibuang dari semua URL. Setiap URL lolos `net.check`.
- Penyaringan kandidat (dibuang bila salah satu): mime bukan `image/jpeg|png|webp`; `NonFree` true; lisensi bukan CC0 / Public Domain (`pd*`, `cc0`, `public domain`) / CC BY / CC BY-SA (versi apa pun) — NC/ND/GFDL-saja/tak diketahui dibuang; sisi panjang < 1200 atau sisi pendek < 800; rasio > 2,2:1 di arah mana pun; orientation diminta tapi tidak cocok (landscape w ≥ 1,1h, portrait h ≥ 1,1w, square 0,9–1,1); judul atau kategori cocok pola non-foto (`map|diagram|chart|logo|icon|screenshot|infographic|coat of arms|flag of|drawing|illustration|painting|artwork|PD-Art|engraving|lithograph|poster|scan|plan of|svg`, tak peka huruf).
- Ranking skor: relevansi Cirrus `1 - (index-1)/N` + lisensi (CC0/PD +0,25, CC BY +0,1, BY-SA 0) + kategori mutu (`Featured pictures|Quality images|Valued images` +0,3; `Files from Pexels|Images from Unsplash|Food photography|Portrait photographs` +0,15) − hitam-putih/foto lama (`Black and white|PD-old|Library of Congress|Fortepan|19th century|Historical`) 0,35 − PNG 0,1. Keragaman: maks 2 kandidat per pembuat. Ambil `limit` teratas.
- Kandidat: `alt` = judul tanpa `File:`/ekstensi; `creator` = Artist tanpa HTML/entitas (≤ 120 karakter, kosong → 'tidak diketahui'); `license` = LicenseShortName; `licenseUrl`; `sourcePageUrl` = `descriptionurl`; `credit` = `Foto: <creator> / Wikimedia Commons (<license>)`; `attribution` = `"<alt>" oleh <creator>, <license>, via Wikimedia Commons`. Atribusi masuk meta, tidak ditampilkan di UI.
- Fallback: pakai penyedia pertama yang mengembalikan ≥ 1 kandidat; error ATAU hasil kosong → penyedia berikutnya. `fallbackReason` = alasan penyedia terakhir yang dilewati: `no-key|key-insecure|key-invalid|pexels-*|pexels-empty` (provider wikimedia) atau `wikimedia-5xx|wikimedia-429|wikimedia-timeout|wikimedia-maxlag|wikimedia-error|wikimedia-empty` (provider openverse). Semua kosong → `NOT_FOUND`; tak ada yang kosong dan semua gagal → `EXEC_ERROR` retryable dari error terakhir.
- `status().provider` = `pexels` bila key valid, selain itu `wikimedia`.
- Error tetap enum AD-11 (NOT_FOUND / EXEC_ERROR / SCHEMA_INVALID). C7: teks deskripsi/doc umum, tanpa kata rubrik/golden/juri/skor/pen.dev/benchmark.

**Never:**
- Tidak mengubah `bench/protocol/*`, `bench/src/protocol.ts`, pembungkus bench, `.mcp.json`, `tools/lakard/lakard.service`, enum `errors.ts`, skema fill image, `packages/skills/skills/{core,landing,mobile}.md` (milik story 1.19). `api.md` hanya berubah lewat regenerasi `scripts/gen-skill-api.mjs`.
- Tidak hotlink, tidak pre-fetch/impor massal, tidak scraping HTML Commons, tidak mengakali rate limit, tidak membuat file key Pexels.
- Tidak menghapus Openverse atau Pexels.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cari tanpa key | `photo_search {query:'running shoes'}` | `provider:'wikimedia'`, `fallbackReason:'no-key'`, ≤ limit kandidat `wikimedia:<pageid>` terfilter & ter-ranking + thumbnail 330 | — |
| Kandidat buruk | SVG/TIFF, CC BY-NC, GFDL saja, NonFree, 640×480, panorama 4:1, kategori "Maps"/"PD-Art", judul "logo" | dibuang | — |
| Ranking | CC0 vs BY-SA relevansi sama; Featured; foto hitam-putih; 3 foto pembuat sama | CC0 di atas BY-SA; Featured naik; B/W turun; maks 2 per pembuat | — |
| Wikimedia gagal | maxlag / 5xx / 429 / timeout / hasil kosong | Openverse dipakai, `fallbackReason:'wikimedia-…'` | Openverse juga gagal → `EXEC_ERROR` retryable; semua kosong → `NOT_FOUND` |
| Impor | `photo('wikimedia:123')` dari hasil cari | unduh URL asli (≤ 3840 & ≤ 12 MiB) atau turunan `3840px-`/`1920px-`; meta provider `wikimedia`, creator, license, licenseUrl, sourcePageUrl, attribution | redirect/IP jahat/bukan gambar → `EXEC_ERROR` seperti 1.18 |
| Cache miss | daemon restart, ref belum di indeks | lookup `pageids=<id>` (serial), lalu impor; lisensi/mime tak aman → `NOT_FOUND` | — |
| Ref | `photo('wikimedia:abc')` | — | `SCHEMA_INVALID` |
| Serial & UA | 2 pencarian berbeda paralel | maks 1 permintaan API Commons bersamaan; header UA = `Lakar/0.1 (internal design tool)` | — |

</intent-contract>

## Code Map

- `packages/daemon/src/photos/providers.ts` -- `ProviderName` (+`'wikimedia'`), `REF_PATTERN` (+`wikimedia`, id `^\d{1,12}$`), `parseRef`. Pola adaptor: `OpenverseProvider` (`#get`, `search`, `byId` 404 → undefined), `mapOpenverse` (`net.check` pada URL, buang bila gagal), `parseJson`, `str`/`num`. Tambah `WikimediaProvider`, `mapWikimedia`, konstanta API/bucket/pola.
- `packages/daemon/src/photos/net.ts` -- `DEFAULT_ALLOWLIST`/`IMAGE_HOSTS` (+`thumb.wikimedia.org`; api +`commons.wikimedia.org`); header `user-agent` di `#once` (L≈230) → konstanta `USER_AGENT` diekspor.
- `packages/daemon/src/photos/service.ts` -- `#openverse` pola instance; `search()` (rantai fallback), `FallbackReason`, `pexelsReason` (pola untuk `wikimediaReason`), `status()`, `#candidate()` (cabang provider), `netToLakar` (hint 429 per provider), `infoFrom` (credit wikimedia seperti pexels: `Foto: <creator> / Wikimedia Commons (<license>)`), hint NOT_FOUND/SCHEMA_INVALID menyebut `wikimedia:<id>`.
- `packages/exec/src/api.ts` -- `PHOTO_REF_PATTERN` (L144), `PHOTO_REF_LITERAL` (L145) +`wikimedia`; doc `photo` (L562–590): contoh ref & pesan SCHEMA_INVALID menyebut `wikimedia:<id>`; komentar L123/L143/L148. Regen `packages/skills/skills/api.md` lewat `node scripts/gen-skill-api.mjs` setelah `pnpm build`.
- `packages/mcp/src/server.ts` -- `PHOTO_SEARCH_DESCRIPTION` (L202–212): urutan penyedia (Pexels bila key → Wikimedia Commons → Openverse), lisensi CC0/PD lalu CC BY/BY-SA, kata kunci Inggris; tetap memuat "Photos provided by Pexels". `STATUS_DESCRIPTION` (L101) `pexels/wikimedia/openverse`. `StatusData.photos` tetap.
- `tests/support/photos.ts` -- server palsu berbasis Host: tambah `commons.wikimedia.org` (search `generator=search` & `pageids`, mode ok/hang/status/`maxlag`, hitung konkurensi maks, catat `user-agent`) dan `thumb.wikimedia.org`/`upload.wikimedia.org` (path `/wikipedia/commons/...`). `mode` + `wikimedia`. Data palsu mencakup setiap baris matriks.
- `packages/daemon/src/photos/photos.test.ts` -- tes tanpa key kini mengharapkan wikimedia; tes Openverse lama set `fake.mode.wikimedia = 503` (atau `'empty'`). Allowlist test L90 diperbarui.
- `packages/daemon/src/index.test.ts`, `photos-render.test.ts`, `skills-examples.test.ts` -- memakai fake; sesuaikan bila ekspektasi provider berubah.
- `packages/exec/src/index.test.ts` L445 -- `photoRefsInCode` + `wikimedia:`.
- `packages/mcp/src/index.test.ts` L60/L108/L180/L222 -- data fake bebas; perbarui hanya bila deskripsi/format berubah.
- `scripts/photo-offline-check.mjs` L46 -- non-pexels → "hotel room"; komentar.
- Jangan ubah: lihat Never.

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/photos/net.ts` -- allowlist + `USER_AGENT` -- host Commons & UA kebijakan Wikimedia.
- [x] `packages/daemon/src/photos/providers.ts` -- `WikimediaProvider` (serial API, maxlag, search+filter+ranking+keragaman, byId, URL impor/pratinjau, buang `utm_*`), ref `wikimedia:` -- penyedia utama.
- [x] `packages/daemon/src/photos/service.ts` -- rantai Pexels → Wikimedia → Openverse, alasan fallback, status, by-id wikimedia, credit -- urutan penyedia.
- [x] `packages/exec/src/api.ts` + regen `packages/skills/skills/api.md` -- ref `wikimedia:` dikenali pre-impor dan `photo()`.
- [x] `packages/mcp/src/server.ts` -- deskripsi `photo_search` & `status`.
- [x] `tests/support/photos.ts`, `packages/daemon/src/photos/photos.test.ts`, `packages/exec/src/index.test.ts` (+ tes lain yang terdampak) -- tes fake untuk setiap baris matriks: filter, ranking, keragaman, orientation, maxlag/5xx/timeout/kosong → openverse + reason, by-id, URL impor (asli vs turunan 3840/1920), serial (konkurensi maks 1), UA persis, meta wikimedia lengkap, `wikimedia:abc` → SCHEMA_INVALID.
- [x] `scripts/photo-wikimedia-live.mjs` -- skrip live (bukan tes CI): via HTTP lakard 127.0.0.1:7466 `/photos/search` (preview true) untuk ≥ 20 kueri umum Inggris (orang, makanan, tempat, produk; termasuk 'coffee shop interior', 'woman portrait smiling', 'fresh salad bowl', 'running shoes', 'office team meeting'), serial; per kueri cetak provider, jumlah hasil, ms, lisensi 3 teratas; ringkasan sukses (`provider==='wikimedia'` dan ≥ 3 hasil)/total, p50/p95 latensi; simpan thumbnail pertama tiap kueri ke direktori output (argumen, default di `os.tmpdir()`), keluar non-zero bila sukses < 80 %. Argumen `--suffix` opsional untuk menghindari cache daemon.
- [x] `scripts/photo-offline-check.mjs` -- default query non-pexels "hotel room".

**Acceptance Criteria:**
- Given lakard di-restart tanpa file key, when `curl -s 127.0.0.1:7466/status`, then `photos.provider` = `wikimedia`, `keyFile` = `absent`, dan `systemctl --user is-active lakard` = `active`.
- Given lakard aktif, when `scripts/photo-wikimedia-live.mjs` menjalankan ≥ 20 kueri, then ≥ 80 % sukses dengan provider `wikimedia`, angka p50/p95 tercetak, dan thumbnail yang dibuka manual (3–4) adalah foto relevan (bukan diagram/peta/logo/lukisan).
- Given `scripts/photo-offline-check.mjs` dijalankan, when kandidat Wikimedia diimpor dan dirender ulang offline, then selisih ≤ 1 %, 0 request luar, dan `assets/meta/<sha>.json` memuat `provider:"wikimedia"`, creator, license, licenseUrl, sourcePageUrl, attribution, width/height ≥ 1200 sisi panjang.
- Given build selesai, when `bash tools/node26/verify.sh` (PATH bawaan), then exit 0.

## Implementation Notes

- Lingkungan (C9): Node 26 lewat `PATH=/opt/node-26/bin:$PATH` (mis. `PATH=/opt/node-26/bin:$PATH pnpm build`); Node sistem tetap 22. Tanpa apt/npm global. RAM terbatas: jalankan vitest per file atau dengan `--maxWorkers=2`; jangan tinggalkan proses tes. Jangan jalankan `claude -p`. Jangan sentuh pen.dev, `.mcp.json`, folder di `.git/info/exclude`.

## Plan Change Log

- 2026-11-18 (implementasi): penyesuaian kecil di luar teks plan:
  - Pola non-foto memakai batas kata dan bentuk jamak (`\bmaps?\b`, `\bscans?\b`, …) supaya tidak salah cocok di dalam kata lain (mis. "scan" di "Scandinavia", "icon" di "iconic").
  - URL impor: bila lebar ≤ 3840 tetapi `size` > 12 MiB, dipakai bucket standar terbesar yang < lebar asli (maks 3840 JPEG/WebP, 1920 PNG), karena Wikimedia tidak memperbesar thumbnail. Untuk lebar > 3840 hasilnya sama dengan plan (`3840px-`/`1920px-`).
  - Lookup by-id hanya memakai filter keamanan (mime, NonFree, lisensi, allowlist URL). Filter mutu (resolusi, rasio, pola non-foto) hanya untuk pencarian, sehingga ref yang sudah dipilih dari hasil cari tetap bisa diimpor ulang setelah restart.
  - Campuran kosong + gagal di rantai penyedia → `NOT_FOUND`. `EXEC_ERROR` hanya bila tidak ada penyedia yang kosong.
  - `PHOTO_REF_PATTERN` di exec memvalidasi id wikimedia sebagai angka (`wikimedia:abc` → SCHEMA_INVALID langsung di `photo()`, selain di daemon).
- 2026-11-18 (verifikasi live): run pertama `photo-wikimedia-live.mjs` tanpa jeda: 18/22. Wikimedia menjawab HTTP 429 dari envoy (`retry-after: 17`, "too many requests") setelah ±10 pencarian beruntun dengan UA ini, lalu Openverse timeout 8 dtk. Sesuai Never (tanpa retry otomatis, tidak mengakali batas), skrip mendapat `--delay` (default 4000 ms antar kueri). Run kedua (`--suffix photo` agar cache daemon tidak terpakai): 22/22 wikimedia, p50 2093 ms, p95 3058 ms. Empat thumbnail diperiksa manual (potret, salad, interior kafe, rapat), semuanya foto relevan.

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 6 findings — high 0, medium 0, low 5, false 1, maybe-false 0
- findings:
  - `[low]` `[reject]` `#candidate()` → `WikimediaProvider.byId` tidak membawa signal impor 30 dtk, dan antrean serial bisa memperpanjang impor di atas 30 dtk — nyata, tetapi hanya pada cache miss (restart daemon + ref baru) dengan API lambat; by-id Wikimedia biasanya < 1 dtk. Perbaikan menambah parameter signal ke semua adaptor (alasan yang sama ditolak di review 1.18).
  - `[low]` `[patch]` `photo-offline-check.mjs` lulus walau pencarian jatuh ke Openverse — ditambah cek `search.provider === status.photos.provider` (gagal bila jatuh ke cadangan).
  - `[low]` `[reject]` bukti AC1/AC3/AC4 tidak tercatat di plan — perbaikannya mengedit plan; bukti dicatat di Auto Run Result oleh finalisasi.
  - `[false]` `[reject]` hint 429 Wikimedia tak terjangkau dari jalur search — hint tetap terjangkau lewat jalur impor (`#candidate` by-id dan unduhan `netToLakar(..., c.provider)`); tidak ada hasil buruk.
  - `[low]` `[patch]` `rankWikimedia`: semua file tanpa Artist berbagi satu kuota "tidak diketahui" — pembuat tak diketahui kini tidak dibatasi per pembuat; tes `keragaman` ditambah.
  - `[low]` `[patch]` `wikimediaLicenseClass`: kode `License` NC/ND jatuh ke `LicenseShortName` yang tampak bebas — NC/ND pada kode ATAU nama pendek kini menolak langsung; dua baris tes ditambah.

## Design Notes

**Mengapa Wikimedia:** tanpa key, API stabil (terukur 1,2–1,4 dtk untuk 30 hasil + extmetadata), kebijakan API mengizinkan klien dengan UA deskriptif dan permintaan serial + `maxlag`. Hasil untuk kueri stok umum layak (mis. "running shoes" → foto produk BY-SA "Featured photos"; "fresh salad bowl" → foto makanan CC0/BY/BY-SA; "woman portrait smiling" → potret, sebagian lukisan/hitam-putih yang harus disaring). Spam seri satu pengunggah (mis. 15 foto "Liat Portal …") → batas 2 per pembuat.

**Bucket thumbnail:** `iiurlwidth=2880` dikembalikan API sebagai URL `3840px-` (dibulatkan ke bucket) atau asli bila lebih kecil; meminta `2880px-` langsung → 400. Karena itu satu panggilan cari memakai `iiurlwidth=330` (pratinjau) dan URL impor diturunkan lokal tanpa panggilan API tambahan:
```
https://thumb.wikimedia.org/wikipedia/commons/thumb/8/81/X.jpg/330px-X.jpg  →  …/thumb/8/81/X.jpg/3840px-X.jpg
lebar asli 2709 (≤ 3840), size 3 MB  →  https://upload.wikimedia.org/wikipedia/commons/f/f0/X.jpg (asli)
```

**Lisensi:** `extmetadata.License.value` berupa kode (`cc0`, `pd`, `cc-by-2.0`, `cc-by-sa-4.0`, `gfdl`…). BY-SA aman untuk pemakaian internal; atribusi dicatat di meta (TASL), tidak di UI.

## Verification

**Commands:**
- `PATH=/opt/node-26/bin:$PATH pnpm build` -- expected: sukses.
- `PATH=/opt/node-26/bin:$PATH pnpm vitest run packages/daemon/src/photos packages/exec/src/index.test.ts packages/mcp/src/index.test.ts tests/execute-description.test.ts tests/skills-c7.test.ts tests/check-c7.test.ts` -- expected: lulus.
- `PATH=/opt/node-26/bin:$PATH pnpm test` -- expected: lulus semua (termasuk photos-render, skills-examples, daemon index).
- `PATH=/opt/node-26/bin:$PATH node scripts/gen-skill-api.mjs && git status --short packages/skills/skills/` -- expected: hanya `api.md` berubah (core/landing/mobile tidak).
- `systemctl --user restart lakard && systemctl --user is-active lakard && curl -s 127.0.0.1:7466/status | grep -o '"photos":{[^}]*}'` -- expected: active; provider wikimedia.
- `/opt/node-26/bin/node scripts/photo-wikimedia-live.mjs` -- expected: ≥ 80 % sukses, p50/p95 tercetak.
- `/opt/node-26/bin/node scripts/photo-offline-check.mjs` -- expected: provider wikimedia, selisih ≤ 1 %, 0 request luar.
- `bash tools/node26/verify.sh` -- expected: exit 0.
- `git diff --quiet 3805084034d912641bcb6b3729ac6f25b19f1b84 -- bench .mcp.json tools/lakard/lakard.service packages/skills/skills/core.md packages/skills/skills/landing.md packages/skills/skills/mobile.md packages/schema/src/errors.ts; echo $?` -- expected: `0`.

## Auto Run Result

Status: built

**Ringkasan:** Wikimedia Commons (tanpa key) menjadi penyedia foto utama `photo_search`/`photo()`. Urutan: Pexels bila file key valid → Wikimedia Commons → Openverse (cadangan; dipakai bila Wikimedia gagal atau kosong). Ref baru `wikimedia:<pageid>`. Adaptor memakai API `generator=search` + `imageinfo/extmetadata` (satu permintaan per pencarian, serial, `maxlag=5`, UA `Lakar/0.1 (internal design tool)` tanpa data pribadi), menyaring bitmap JPEG/PNG/WebP berlisensi CC0/PD/CC BY/CC BY-SA, resolusi ≥ 1200×800, rasio ≤ 2,2, pola non-foto, lalu me-ranking (relevansi + lisensi + kategori mutu − foto lama/hitam-putih − PNG, maks 2 per pembuat). Pratinjau = thumbnail bucket 330; impor = asli (≤ 3840 & ≤ 12 MiB) atau bucket `3840px-`/`1920px-` (ukuran non-standar dijawab 400 oleh Wikimedia). Impor sekali ke asset store + meta (provider, creator, license, licenseUrl, sourcePageUrl, attribution) + indeks; cache cari 24 jam.

**File:**
- `packages/daemon/src/photos/net.ts` — allowlist `commons.wikimedia.org` (api) + `thumb.wikimedia.org` (thumb/image); konstanta `USER_AGENT`.
- `packages/daemon/src/photos/providers.ts` — `WikimediaProvider`, pemetaan/filter/ranking, URL impor, ref `wikimedia:`.
- `packages/daemon/src/photos/service.ts` — rantai penyedia, `fallbackReason` wikimedia-*, status `wikimedia`, by-id, credit.
- `packages/exec/src/api.ts` + `packages/skills/skills/api.md` (regen) — ref `wikimedia:` di `photo()`/pre-impor.
- `packages/mcp/src/server.ts` — deskripsi `photo_search` dan `status`.
- `tests/support/photos.ts`, `packages/daemon/src/photos/photos.test.ts`, `packages/exec/src/index.test.ts` — fake Commons + tes setiap baris matriks.
- `scripts/photo-wikimedia-live.mjs` (baru), `scripts/photo-offline-check.mjs` — verifikasi live.

**Review:** 1 lensa (quick), 6 temuan: 3 patch (low), 0 defer, 3 ditolak (1 low impor >30 dtk pada cache miss — perbaikan butuh parameter signal di semua adaptor; 1 low bukti di plan — perbaikan mengedit plan; 1 false hint 429). `followup_review_recommended: false` (patch: 0 high, 0 medium, 3 low).

**Verifikasi:**
- `pnpm build`: sukses. Tes terfokus (7 file): 158 lulus. `pnpm test`: 48 file, 781 tes lulus; tidak ada proses vitest tersisa.
- `gen-skill-api.mjs`: hanya `api.md` berubah; core/landing/mobile, bench, `.mcp.json`, unit lakard, `errors.ts` identik dengan baseline (`git diff --quiet` = 0).
- `systemctl --user restart lakard`: active; `/status.photos` = `{"provider":"wikimedia","keyFile":"absent",...}` (AC1).
- `photo-wikimedia-live.mjs` (22 kueri, jeda 4 dtk):
  - implementer, cache dingin, `--suffix photo`: 22/22 wikimedia, p50 2093 ms, p95 3058 ms.
  - implementer, run pertama tanpa jeda: 18/22 — HTTP 429 Wikimedia setelah ±10 pencarian beruntun, lalu Openverse timeout.
  - orkestrator, `--suffix stock` (kueri lebih sempit): 18/22, p50 2024 ms, p95 6971 ms; 4 gagal karena hasil tersaring < 3 / kosong (bukan galat jaringan), jalur kosong → Openverse menambah 7–8 dtk.
  - orkestrator, kueri asli (CDN Wikimedia hangat): 22/22, p50 88 ms, p95 2041 ms.
  - pencarian baru tunggal via HTTP: 1,8–2,8 dtk (API + 6 thumbnail).
- Thumbnail diperiksa manual: "fresh salad bowl" (salad di piring, sangat baik), "coffee shop interior" (interior kafe, baik), "woman portrait smiling" (perempuan di sawah, relevan), "office team meeting" (pawai olahraga "District Office team" — tidak relevan).
- `photo-offline-check.mjs`: provider wikimedia, kandidat `wikimedia:138211251` (3840×2560, CC BY-SA 4.0), render ulang offline selisih 0,000 %, 0 request luar, meta lengkap (AC3).
- `bash tools/node26/verify.sh` (PATH bawaan): exit 0, 24 OK, snapshot C9 identik (AC4).

**Residual risk:**
- Rate limit Wikimedia untuk UA tanpa kontak: 429 (`retry-after` ±17 dtk) setelah ±10 pencarian beruntun; pemakaian normal (≤ 2 pencarian/desain) aman, sweep beruntun bisa jatuh ke Openverse yang lambat. UA berkontak menaikkan batas, tetapi dilarang (tanpa data pribadi) — keputusan Adam.
- Relevansi kueri abstrak/orang lebih lemah daripada situs stok: kata kunci dicocokkan harfiah ("office team meeting" → pawai olahraga; "man portrait outdoor" → beberapa foto lama/arsip). Filter tanggal (`DateTimeOriginal`) bisa jadi perbaikan lanjutan.
- Kueri sempit bisa tersaring kosong → fallback Openverse (timeout 8 dtk) → NOT_FOUND ±7–8 dtk.
- Impor 3840 px dingin ±4 dtk/foto (thumbnail dibuat on-demand oleh Wikimedia); by-id serial tanpa signal impor bisa melewati 30 dtk pada cache miss.
- Pexels tetap hanya diverifikasi dengan fake.
