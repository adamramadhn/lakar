---
title: 'Refactor sweep G0 sebelum putaran resmi'
type: refactor
ticket: '15'
created: '2026-11-18'
status: done
baseline_revision: 'dcd6464755b1c54b9a1a3f78e031bd10734df5d6'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred:
  - "Kode INTERNAL untuk kesalahan daemon (EXEC_ERROR 500 retryable vs STATUS 422): mengubah enum AD-11."
  - "store.commit gagal IO di /execute tanpa editId: kode yang tepat belum ada di enum; ditolak di story 9."
  - "404 Fastify dan 4xx non-AD-11 (413/415): mengubah respons route dan deteksi VERSION_MISMATCH klien mcp."
  - "Timeout klien MCP dilaporkan sebagai daemon mati: mengubah teks hasil tool."
  - "Process group/detached untuk claude di bench: mengubah pembungkus bench sebelum putaran resmi."
  - "Guard dist basi vitest: rawan positif palsu mtime; konvensi repo ditolak di story 11."
  - "parseApiResponse bersama mcp/bench + kode non-enum UNREACHABLE/BAD_RESPONSE di lakard-client bench: mengubah pemetaan error klien."
  - "readPngSize memakai ulang readChunks: tidak bisa, readPngSize bekerja atas 24 byte kepala file (readChunks butuh chunk utuh + CRC); hanya PNG_SIGNATURE yang dipakai ulang."
  - "Teks ICON_SEARCH_HINT daemon dan doc IconSearchOptions exec masih menulis 1–50/default 10 sebagai literal: teks dilihat agen dan skill api.md, dipertahankan byte-identik."
---

<intent-contract>

## Intent

**Problem:** Setelah story 1.1 sampai 1.14, kode G0 berisi helper dan konstanta yang ditulis ulang di beberapa paket (deteksi emoji/glyph, header sesi, port, VERSION_HINT, batas icon search, regex asset, helper PNG bench). Ada juga kode mati dan komentar basi, pemetaan error yang tidak seragam, beberapa kebocoran sumber daya kecil, helper tes yang disalin, dan paket tanpa README. Selain itu, dokumen uji/smoke masih tertinggal di `~/.local/share/lakar/docs`. Story 16 (putaran resmi G0) menyusul langsung, jadi pembersihan ini tidak boleh mengubah apa pun yang dibandingkan di benchmark.

**Approach:** Satukan duplikasi ke satu sumber kanonik yang diizinkan oleh arah dependensi, biasanya `@lakar/schema`. Buang kode mati, rapikan error mapping dan kebocoran tanpa menyentuh permukaan beku, bagikan helper tes tanpa melemahkan tes, dan tambahkan README singkat per paket. Arsipkan dokumen uji. Setiap perbaikan yang menuntut perubahan pada permukaan beku dicatat sebagai deferred.

## Boundaries & Constraints

**Always:**
- Permukaan beku harus identik byte demi byte dengan baseline `dcd6464`. Yang termasuk:
  - `packages/skills/skills/*.md`; `api.md` hasil `scripts/gen-skill-api.mjs` juga harus identik.
  - `bench/protocol/*` (hash protokol `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d`) dan `bench/mcp/pencil.json`.
  - Teks juri (`buildJudgeText`) dan argv agen/juri dari `round --dry-run`.
  - Nama, deskripsi, inputSchema, dan instructions semua tool MCP.
  - Bentuk `{ok, data|error}` dan enum kode error AD-11 (`packages/schema/src/errors.ts`).
  - Batas render AD-6.
  - Pesan, hint, dan kode error yang dilihat agen, kecuali kasus yang disebut eksplisit di Tasks.
- Arah dependensi mengikuti `tests/dependency-direction.ts`. `render` hanya boleh `import type` dari luar paket (dist-nya jalan di Chromium tanpa bundler), jadi `render` menyimpan salinannya sendiri. Paket IO_FORBIDDEN (schema, ports, core, render) tetap tanpa API Node.
- Tes tidak dilemahkan: tidak ada `skip`/`only`/`todo` baru, asersi tidak dikurangi, dan jumlah tes ≥ 678.
- Node selalu dipanggil lewat path absolut `/opt/node-26/bin/node` dan `/opt/node-26/bin/pnpm`. C9 berlaku: tanpa apt/npm global/service lain/`~/.cache/ms-playwright`.

**Never:**
- Mengubah enum error, menambah kode `INTERNAL`, atau mengubah status HTTP/bentuk respons route yang sudah ada.
- Mengubah perilaku proses `claude` di bench (spawn options, process group, argumen, env).
- Mengubah perhitungan skor/emoji/metrik bench secara semantik.
- Menyentuh `c9-baseline.txt` atau dokumen non-uji di `~/.local/share/lakar`, atau folder yang tercantum di `.git/info/exclude`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Snapshot MCP | `listTools` + instructions lewat InMemoryTransport | JSON identik dengan baseline (sha256 `277781d7…`) | beda = gagal, kembalikan |
| Skill & protokol | sha256 `skills/*.md`, `bench/protocol/*`, `bench/mcp/pencil.json` | identik dengan baseline | beda = gagal |
| Teks juri & dry-run | `buildJudgeText` A/B; `round --round uji-9 --dry-run` | identik, kecuali baris git HEAD/porcelain dan stamp arsip | beda lain = gagal |
| Emoji/glyph kanonik | teks emoji, ©®™, VS15/VS16, ZWJ, keycap | check LC-01a/b dan hitungan emoji bench sama persis dengan sebelumnya | tes lama tetap lulus |
| Pencil connect gagal | `client.connect` melempar | transport/child ditutup, error dilempar ulang | tanpa proses yatim |
| Lease pool basi | `page2()` setelah generation berganti | halaman lokal ditutup, tidak tersimpan di slot | tanpa halaman bocor |
| Dokumen uji | `tracer-*`, `manual-crash-12`, `pustaka-kampus-beranda`, `lapak-cuci-landing`, `rodaku-landing` (+history, +exports) | dipindah ke `~/.local/share/lakar/archive/sweep-1.15-<stamp>/`, lakard di-restart | `c9-baseline.txt` tetap di tempat |

</intent-contract>

## Code Map

- `packages/check/src/glyphs.ts` dan `bench/src/round/emoji.ts:6-34`: `LC01B_GLYPHS`, `isEmojiGrapheme`, VS15/VS16/ZWJ/KEYCAP, `codePoints`, `cpLabel` disalin verbatim. Komentar `emoji.ts:2` membenarkan salinan itu. `render/src/fonts.ts:118` `codePointLabel` tetap di render.
- `check/src/index.ts:18` `findBoard` (privat) sama dengan `render/src/index.ts:42`.
- Header sesi `'x-lakar-session'` ada di `daemon/src/sessions.ts:6`, `bench/src/lakar/lakard-client.ts:6`, dan literal di `mcp/src/client.ts:46`.
- `VERSION_HINT` ada di `daemon/src/server.ts:112` dan `mcp/src/client.ts:8`; `schema/src/version.ts` sudah ada.
- Port/URL 7466 ada di `daemon/src/config.ts:9` `DEFAULT_PORT`, `mcp/src/main.ts:6`, dan `bench/src/lakar/lakard-client.ts:5`. Skrip shell dibiarkan.
- Batas icon search 10/50 ada di `icons/src/catalog.ts:6-7`, `exec/src/api.ts:26-27`, dan `daemon/src/server.ts:122` (`.max(50)` + teks hint di :125, teks hint dipertahankan); kanonik di `schema/src/icons.ts`. Deskripsi MCP `icon_search` dan `.describe()` limit dilarang diubah.
- `daemon/src/config.ts:105-106` menyalin default exec `2000` dan `64*1024*1024` dari `exec/src/api.ts:15` `DEFAULT_TIMEOUT_MS` dan `exec/src/index.ts:20` `DEFAULT_MEMORY_BYTES`.
- Regex asset `/^[a-f0-9]{64}$/` ada di `daemon/src/assets.ts:6` dan inline di `schema/src/nodes.ts:99`. Pola dan pesan zod harus tetap sama.
- Helper PNG bench `bench/src/pendev/artifacts.ts:18-37` (`PNG_SIG`, `readPngSize`, `readPngSizeFile`) menyalin `bench/src/png/codec.ts`. Importir `lakar/run.ts:8` dan `judge/run.ts:7` mengambilnya dari `pendev/`. `daemon/src/png.ts` tetap terpisah.
- Pasangan tool_use/tool_result bench ada di `lakar/run.ts:63-90`, `round/reconnect.ts:22-44`, dan `round/emoji.ts:57-75`. Loop utama `stream-metrics.ts` tidak disentuh. Blok metrik→rekaman sama persis di `pendev/run.ts:174-193` dan `lakar/run.ts:177-196`.
- `mcp/src/server.ts` (197, 211, 285, 307, 346) berulang `if (!r.ok) return errorResult(formatError(r.error))`. `asText` sudah ada. `:17` memakai cast `as Error` (lempar non-Error → teks "undefined"). Perubahan hanya di badan handler.
- `isPlainObject` ada tiga: `core/src/transaction.ts:66`, `core/src/migrate.ts:17`, dan `exec/src/api.ts:171`. exec boleh impor core.
- `daemon/src/sessions.ts:46` `newEditId` memakai `byte % 62` (bias modulo).
- `daemon/src/server.ts` membangun error "tidak ditemukan" di 194/412/469/518 dan `check.ts:21`. `boardNotFound` juga dipakai untuk node. Fallback board pertama ada di 409/467.
- Cast `as Error` tersebar: `pendev/run.ts:150,226,228`, `lakar/run.ts:149,265`, `round/main.ts:209,409,418,444,491`, `cli.ts:61`, `sys.ts:210`. Padanan privat sudah ada: `exec/src/index.ts:376` `errMessage` dan `daemon/src/pool.ts:49` `firstLine`.
- Kebocoran:
  - `bench/src/claude-runner.ts:91-92` stream `wx` tanpa listener `'error'`.
  - `bench/src/pendev/pencil-client.ts:65-69` connect gagal tidak menutup transport.
  - `daemon/src/pool.ts:115-120` `page2()` menetapkan `slot.page2` sebelum cek generation, dan panggilan paralel membuka dua context.
  - `daemon/src/index.test.ts:1153-1166` child SIGTERM tidak di-kill bila timeout.
  - `mcp/src/index.test.ts:149` `fake.server.close()` tidak di-await; `:430-450` transport bocor bila connect gagal.
- Helper tes yang disalin:
  - Probe `browserInstalled` ada di `render/test/harness.ts:22-25`, `daemon/src/index.test.ts:19-22`, `pool.test.ts:15-18`, `skills-examples.test.ts:14-17`, dan `mcp/src/index.test.ts:457-460`.
  - `call()` fetch ada di `index.test.ts:43`, `skills-examples.test.ts:31`, dan `pool.test.ts:23`.
  - Fixture stream `L/use/res` ada di `bench/src/lakar/lakar.test.ts:14-16`, `round/round.test.ts:14`, dan `stream-metrics.test.ts:16-17`.
  - `console.log` sisa ada di `check/index.test.ts:381`, `daemon/index.test.ts:781`, `mcp/index.test.ts:545,573`, dan `tests/skills.test.ts:22`.
- Lokasi helper bersama: `tsconfig.test.json` sudah meng-include `tests/**/*.ts`, dan vitest hanya mengambil `*.test.ts`. Helper bersama ditaruh di `tests/support/*.ts`, atau di `bench/src/test-fixtures.ts` bila bench tsconfig mengecualikannya dari dist. Cek exclude, dan jangan sampai berkas helper ikut ke dist paket.
- Kode mati:
  - `schema/src/nodes.ts:301` `ChildInput` tidak dirujuk.
  - Ekspor yang hanya dipakai di berkasnya sendiri: daemon `pool.ts` `renderFailed`, `sessions.ts` `newEditId`/`FAILED_MAX`/`SESSION_LOG_MAX`, `server.ts` `BOUNDS_MAX`, `inspect.ts` `inspectTree`, `chromium.ts` `ASSET_HINT`, `config.ts` `RENDER_TIMEOUT_DEFAULT_MS`, `fonts.ts` `FONT_SUBSETS`; exec `loadQuickJS`, `snippetLocation`; render `textWrap`, `strokeSplit`, `maskImage`; check `BOTTOM_BAR_MIN_WIDTH_RATIO`; bench `daemonState`, `PEN_GUARD_DIRS`, `JUDGE_LEAK_PATTERNS`, `agg`, `PROVISIONAL`. Verifikasi dengan grep, termasuk `scripts/*.mjs` dan tes.
  - Tetap dipertahankan: `daemon/src/png.ts` `countDarkPixels`/`decodePng` (dipakai `scripts/tracer-check.mjs`), ekspor publik schema, `PACKAGE`, dan `jsonSchemas`.
- Komentar basi:
  - `exec/src/api.ts:140`: api.md "nanti" dihasilkan; sekarang sudah lewat `scripts/gen-skill-api.mjs`.
  - `bench/src/report.ts:1` dan `bench/src/protocol.ts:2`: "dipakai ulang story 14".
  - `render/src/layout.ts:307` "LC-01b di story 11" salah rujuk; cek aturan pemakai `texts`/overflow di `check/src/rules.ts`.
  - Komentar `render/src/index.ts:4` (browser B) dipertahankan.
- `bench/src/lakar/archive.ts:11` punya regex `SLUG` sendiri; schema punya `SLUG_PATTERN`, dan polanya harus setara. `bench/src/sys.ts:64` hard-code `/root/lakar/design` padahal `REPO_ROOT` ada.
- README per paket belum ada (11 paket + bench). Contoh nada: `tools/node26/README.md`.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/schema/src/glyphs.ts` (baru), `schema/src/index.ts`, `check/src/glyphs.ts`, `bench/src/round/emoji.ts`: pindahkan konstanta dan fungsi glyph/emoji bersama (`LC01B_GLYPHS`, `isEmojiGrapheme`, `codePoints`, `graphemes`, `cpLabel`) ke schema. check dan bench mengimpornya. Satu sumber deteksi untuk gerbang dan skor bench.
- [ ] `schema/src/{version,icons,nodes}.ts` dan importir di daemon/mcp/bench/exec/icons: konstanta kanonik `SESSION_HEADER`, `VERSION_HINT`, `DEFAULT_LAKARD_PORT`/`DEFAULT_LAKARD_URL`, `ICON_SEARCH_DEFAULT_LIMIT`/`ICON_SEARCH_MAX_LIMIT`, dan `ASSET_ID_PATTERN`. Semua salinan diganti impor, nilainya identik. `findBoard` untuk check (dan daemon bila cocok) memakai satu versi schema. Render tetap memegang salinannya.
- [ ] `daemon/src/config.ts`: impor default timeout/memori dari exec.
- [ ] `bench/src/png/codec.ts`, `bench/src/pendev/artifacts.ts`, importir: pindahkan helper ukuran PNG ke `png/codec.ts` dan pakai ulang `PNG_SIGNATURE`/`readChunks`.
- [ ] `bench/src/*`: tambahkan `applyMetrics` bersama untuk pendev/lakar run. Tambahkan generator pasangan tool_use/tool_result bersama untuk `lakar/run.ts`, `round/reconnect.ts`, dan `round/emoji.ts`, tetapi hanya bila semantiknya terbukti sama oleh tes yang ada. Bila tidak sama, catat di Implementation Notes dan biarkan. Pakai `SLUG_PATTERN` dan `REPO_ROOT` di archive/sys. Satu sleep helper menggantikan sleep inline.
- [ ] `schema/src/errors.ts`: tambahkan `errorMessage(e: unknown): string`. Ganti cast `as Error` di sumber non-tes (mcp/bench/daemon/exec) dan helper privat yang setara, tanpa mengubah teks untuk lemparan `Error` biasa.
- [ ] `mcp/src/server.ts` dan `mcp/src/client.ts`: lipat pola `!r.ok → errorResult(formatError(...))` ke `asText`. `client.#post` → `#request`. Konstanta header/hint/URL diambil dari schema. Teks tool, deskripsi, dan skema tidak berubah.
- [ ] `daemon/src/server.ts`, `check.ts`, `sessions.ts`, `core`, `exec`:
  - Satu helper "tidak ditemukan" dengan pesan dan hint per pemanggil tetap byte-identik; `boardNotFound` → `nodeNotFound` bila memang untuk node.
  - Satu helper fallback board pertama.
  - `newEditId` tanpa bias modulo, panjang/alfabet sama.
  - `isPlainObject` tunggal dari core.
- [ ] Kebocoran:
  - `bench/src/claude-runner.ts`: listener `'error'` pada stream.
  - `bench/src/pendev/pencil-client.ts`: tutup transport saat connect gagal, dengan tes (transport palsu/command gagal → close dipanggil, error dilempar ulang).
  - `daemon/src/pool.ts`: `page2()` membuka halaman ke variabel lokal, cek generation (tutup bila basi), satu promise in-flight per slot. Tambahkan tes pool untuk lease basi dan untuk paralel.
- [ ] Tes:
  - Helper bersama `browserInstalled`/`call` di `tests/support/` dan fixture stream bench bersama.
  - `finally` kill child di tes SIGTERM daemon; `await` close dan transport di tes mcp.
  - Gate `console.log` tes di balik env (mis. `LAKAR_TEST_LOG`).
  - Pastikan berkas helper tidak masuk dist.
- [ ] Kode mati dan komentar: hapus `ChildInput`, drop `export` yang hanya dipakai internal (hasil grep), dan perbaiki komentar basi yang tercantum.
- [ ] `tsconfig.base.json`: aktifkan `noUnusedLocals`. Aktifkan juga `noUnusedParameters` bila perbaikannya mekanis (prefiks `_`). Perbaiki semua temuan tanpa mengubah perilaku.
- [ ] `packages/*/README.md` dan `bench/README.md`: README singkat (≤ 40 baris) per paket berbahasa Indonesia, berisi peran, AD terkait, arah dependensi, ekspor utama, cara tes, dan batasan (mis. render tanpa API Node; protokol bench beku).
- [ ] Data: pindahkan dokumen uji, berikut history-nya dan `exports/<slug>`, ke `~/.local/share/lakar/archive/sweep-1.15-<stamp>/`, lalu `systemctl --user restart lakard` dan pastikan aktif.

**Acceptance Criteria:**
- Given build ulang, when skrip dump MCP, sha256 skill/protokol, teks juri, dan `round --dry-run` dibandingkan dengan baseline, then semuanya identik (kecuali baris HEAD/porcelain/stamp di dry-run).
- Given `pnpm build` dan `pnpm test`, when dijalankan dengan Node 26, then keduanya lulus dengan ≥ 678 tes, 0 skip, dan 0 gagal.
- Given grep atas `'x-lakar-session'`, `7466` (di TS), `/^[a-f0-9]{64}$/`, dan definisi `isEmojiGrapheme`, when dijalankan di `packages/*/src` dan `bench/src` non-tes, then masing-masing hanya muncul di satu sumber kanonik (render dikecualikan).
- Given `ls ~/.local/share/lakar/docs` setelah arsip, when dicek, then tidak ada dokumen uji yang disebut; `c9-baseline.txt` tetap ada; `lakard` active.
- Given `bash tools/node26/verify.sh`, when dijalankan, then exit 0.
- Given setiap temuan kandidat yang tidak dikerjakan, when plan dibaca, then temuan itu tercatat di `deferred:` dengan alasannya.

## Implementation Notes

- Kanonik di `@lakar/schema`: `glyphs.ts` baru (`LC01B_GLYPHS`, `LC01B_CODEPOINTS`, `VS15`, `isEmojiGrapheme`, `codePoints`, `graphemes`, `cpLabel`), `version.ts` (`SESSION_HEADER`, `DEFAULT_LAKARD_PORT`, `DEFAULT_LAKARD_URL`, `VERSION_HINT`), `icons.ts` (`ICON_SEARCH_DEFAULT_LIMIT`/`MAX_LIMIT`), `nodes.ts` (`ASSET_ID_PATTERN`, `findBoard` generik), `errors.ts` (`errorMessage`). check, bench, daemon, mcp, exec, icons mengimpornya; nama ekspor lama yang masih dipakai (`DEFAULT_PORT` daemon, `SEARCH_*_LIMIT` icons, `VERSION_HINT` mcp, re-ekspor glyph check) dipertahankan sebagai alias/re-ekspor. Render tetap memegang salinan `findBoard`/`codePointLabel`.
- `errorMessage(e)`: `message` bila string, selain itu `String(e)` — identik untuk `Error`; lemparan non-Error di `guarded` mcp kini memberi teks nilai, bukan "undefined". Menggantikan `errMessage` exec dan dasar `firstLine` pool.
- daemon: `errors.ts` (`notFound(message, hint)`) dipakai semua NOT_FOUND di server/check/chromium dengan teks byte-identik; `boardNotFound` (dipakai untuk node) → `nodeNotFound`; `firstBoardId` untuk screenshot/export; `newEditId` rejection sampling (byte ≥ 248 dibuang), panjang 8 dan alfabet sama; `isPlainObject` tunggal di `core/src/object.ts` (diekspor core, dipakai exec). `config.ts` mengambil default exec dari `@lakar/exec`.
- bench: `tool-events.ts` (generator `toolEvents`) dipakai `findCommittedSlug`, `toolResultHits`, `countAgentEmoji`. Semantik terbukti sama oleh tes lama lakar/round (tanpa perubahan asersi): parse per baris, lewati non-JSON dan `message.content` non-array, `tool_use` hanya di pesan assistant, `tool_result` hanya di pesan user, pasangan lewat `tool_use_id`. `applyMetrics` (pendev/run.ts) menggantikan blok metrik→rekaman+metrics.json+log yang identik di pendev/lakar. `readPngSize`/`readPngSizeFile` pindah ke `png/codec.ts` (memakai `PNG_SIGNATURE`; tetap diekspor dari index bench). `sleep` di `log.ts`. `archive.ts` memakai `SLUG_PATTERN` (lebih ketat dari regex lama: maks 64 karakter; slug lebih panjang tidak pernah bisa dibuat daemon, jadi hasil arsip nyata sama). `sys.ts` memakai `REPO_ROOT`.
- Kebocoran: `claude-runner` mencatat error stream `wx` dan melempar setelah proses selesai + pembersihan (sebelumnya event 'error' tanpa listener menjatuhkan harness; spawn/argumen/env tidak berubah). `PencilClient.connect` menutup transport saat connect gagal (parameter `makeTransport` untuk tes). `RenderPool` page2: halaman dibuka ke variabel lokal, cek generasi (basi → context ditutup), satu `creating2` in-flight per slot; `#discard`/`close` mengosongkannya.
- Tes: `tests/support/{browser,http,log,stream}.ts` (di luar dist: tidak ada tsconfig paket yang meng-include `tests/`; vitest hanya `*.test.ts`). Tes baru: pool page2 paralel + lease basi (fake browser), PencilClient connect gagal (2), claude-runner stream `wx` (1). `console.log` diagnostik di balik `LAKAR_TEST_LOG`. Total 683 tes, 0 skip.
- `noUnusedLocals` dan `noUnusedParameters` aktif di `tsconfig.base.json`; setelah sweep tidak ada temuan (dicek ulang dengan `tsc -b --force`).
- Ekspor internal yang di-drop (grep termasuk scripts/*.mjs dan tes): daemon `renderFailed`, `newEditId`, `FAILED_MAX`, `SESSION_LOG_MAX`, `BOUNDS_MAX`, `inspectTree`, `ASSET_HINT`, `RENDER_TIMEOUT_DEFAULT_MS`, `FONT_SUBSETS`, `ASSET_ID` (diganti `ASSET_ID_PATTERN`); exec `loadQuickJS`, `snippetLocation`, `ICON_SEARCH_*` (pindah ke schema); render `textWrap`, `strokeSplit`, `maskImage`; check `BOTTOM_BAR_MIN_WIDTH_RATIO`; bench `daemonState`, `PEN_GUARD_DIRS`, `JUDGE_LEAK_PATTERNS`, `agg`, `PROVISIONAL`, `LAKARD_URL`, `SESSION_HEADER`, `LC01B_GLYPHS`/`isEmojiGrapheme` emoji.ts. `ChildInput` dihapus.
- Komentar basi diperbaiki: exec `api.ts` (api.md dihasilkan `scripts/gen-skill-api.mjs`), `bench/src/report.ts`, `bench/src/protocol.ts`, `render/src/layout.ts` (tidak ada aturan check untuk teks `fixed` meluber; `measure.texts` belum dipakai). Komentar glyph check/schema tanpa istilah C7 (`skor`/benchmark).
- README ≤ 40 baris untuk 10 paket `packages/*` dan `bench/`.
- Data: 11 dokumen uji (7 `tracer-*` termasuk tracer verifikasi sweep ini, `manual-crash-12`, `pustaka-kampus-beranda`, `lapak-cuci-landing`, `rodaku-landing`) + history + `exports/<slug>` dipindah ke `~/.local/share/lakar/archive/sweep-1.15-20261118T051346Z/`; `c9-baseline.txt` tetap; lakard di-restart dan `active`.

## Plan Change Log

- Tracer e2e verifikasi dijalankan sebelum arsip, agar dokumen tracer yang dibuatnya ikut diarsipkan (acceptance: tidak ada `tracer-*` tersisa di docs).
- `firstBoardId` dibuat privat di daemon (bukan ekspor schema) karena hanya dipakai server.ts.

## Review Triage Log

### 2026-11-18 — Review pass
- verdicts: 4 findings — high 0, medium 1, low 2, false 0, maybe-false 0 (1 ditolak karena perbaikannya mengedit plan)
- findings:
  - `[medium]` `[patch]` `bench/src/claude-runner.ts`: transkrip `wx` gagal dibuka (EEXIST) baru dilaporkan setelah agen `claude` berbayar selesai berjalan. Terverifikasi: `createWriteStream` membuka file secara asinkron, spawn tidak menunggunya, dan tes lama menunjukkan agen palsu di-spawn. Fix: tunggu `ready`/`error` kedua stream sebelum spawn; bila gagal, destroy stream, hapus cwd, lalu throw sebelum spawn. Opsi spawn, argv, dan env tidak berubah. Tes EEXIST kini memakai penanda file dari agen palsu (`spawned` tidak boleh ada); tes itu terbukti gagal tanpa fix.
  - `[low]` `[patch]` `packages/schema/README.md` menyebut render punya salinan "deteksi glyph", padahal render hanya punya `codePointLabel`. Diperbaiki menjadi "label code point (`codePointLabel`)".
  - `[low]` `[patch]` `packages/exec/README.md` menulis "schema lewat core", padahal exec mengimpor schema langsung (diizinkan closure transitif). Teks diperbaiki.
  - `[low]` `[reject]` Klaim di Implementation Notes bahwa `toolEvents` "terbukti sama oleh tes lama" terlalu kuat, karena fixture tes ikut ditulis ulang ke `tests/support/stream.ts`. Reviewer sendiri menyatakan kesetaraannya benar lewat inspeksi. Satu-satunya perbaikan adalah mengedit plan, jadi temuan ini ditolak sesuai aturan triase.

## Design Notes

Deferred sejak perencanaan, dicatat di frontmatter saat finalisasi:
- Kode `INTERNAL` untuk kesalahan daemon. Saat ini `EXEC_ERROR` 500 retryable bertabrakan dengan `STATUS` 422; perbaikannya mengubah enum AD-11.
- `store.commit` yang gagal IO di `/execute` tanpa editId. Kode yang tepat belum ada di enum, dan temuan ini sudah ditolak di story 9.
- 404 Fastify dan status 4xx non-AD-11 (413/415). Perbaikannya mengubah respons route dan deteksi `VERSION_MISMATCH` di klien mcp.
- Timeout klien MCP dilaporkan sebagai daemon mati. Perbaikannya mengubah teks hasil tool.
- Process group dan `detached` untuk `claude` di bench. Ini mengubah pembungkus bench sebelum putaran resmi.
- Guard dist basi vitest. Rawan positif palsu mtime, dan konvensi repo sudah ditolak di story 11.
- `parseApiResponse` bersama mcp/bench dan kode non-enum `UNREACHABLE`/`BAD_RESPONSE` di lakard-client bench. Ini mengubah pemetaan error klien.

## Verification

**Commands:**
- `/opt/node-26/bin/pnpm build && /opt/node-26/bin/pnpm test`: lulus, tes ≥ 678, 0 skip.
- `/opt/node-26/bin/node scripts/gen-skill-api.mjs` (atau mode cek-nya) lalu `git diff --exit-code packages/skills/skills`: tanpa diff.
- `cat bench/protocol/wrapper.txt bench/protocol/prompts.json bench/protocol/protocol.json | sha256sum`: `907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d`.
- Dump MCP `/opt/node-26/bin/node <scratchpad>/s15/mcp-dump.mjs | sha256sum`: `277781d7988eb2853249fb99aa9edb15baf3b91f6d5d97a6216a77be60ca4dba`.
- Teks juri (`<scratchpad>/jt.mjs`) dan `node bench/dist/cli.js round --round uji-9 --dry-run`: diff dengan `<scratchpad>/s15/{judge,dry}-before.txt` kosong, kecuali HEAD/porcelain/stamp.
- `systemctl --user restart lakard && systemctl --user is-active lakard`: `active`. Satu kali `bash scripts/tracer-e2e.sh`: lulus.
- `bash tools/node26/verify.sh`: exit 0.

`<scratchpad>` = `/tmp/claude-0/-root-lakar/ff3247e7-b8d6-48ae-acb4-dd6a2a7ac61e/scratchpad`.

## Auto Run Result

- **Status: built** (2026-11-18). Route full, risk medium, review `quick` (pinned), 1 pass tanpa loop. Patch review diterapkan orkestrator sendiri (re-engage implementer tidak sinkron).
- **Ringkasan:**
  - Duplikasi lintas paket disatukan di `@lakar/schema`: glyph/emoji LC-01a/b, `SESSION_HEADER`, port/URL lakard, `VERSION_HINT`, batas icon search, `ASSET_ID_PATTERN`, `findBoard`, `errorMessage`. Render tetap memegang salinannya sendiri.
  - daemon: helper `notFound` dengan teks byte-identik, `nodeNotFound`, `firstBoardId`, dan `newEditId` tanpa bias modulo.
  - `isPlainObject` tunggal di core.
  - mcp: `asResult`/`asText` dan `#request`.
  - bench: `toolEvents`, `applyMetrics`, helper PNG di `png/codec.ts`, `sleep`, `SLUG_PATTERN`/`REPO_ROOT`.
  - Kebocoran diperbaiki: stream claude-runner (kini gagal sebelum spawn), transport pencil saat connect gagal, `page2()` pool (lease basi dan paralel), child/transport di tes.
  - Helper tes bersama di `tests/support/`; log tes di balik `LAKAR_TEST_LOG`.
  - `noUnusedLocals` dan `noUnusedParameters` aktif. Kode mati dan ekspor internal dibuang, komentar basi diperbaiki.
  - README untuk 10 paket dan `bench/`.
  - 11 dokumen uji (+history, exports) diarsipkan ke `~/.local/share/lakar/archive/sweep-1.15-20261118T051346Z/`.
- **File:** 89+ file. Inti: `packages/schema/src/{glyphs,version,icons,nodes,errors}.ts`, `packages/daemon/src/{server,pool,sessions,errors,config,check,chromium}.ts`, `packages/mcp/src/{server,client,main}.ts`, `packages/core/src/object.ts`, `bench/src/{tool-events,claude-runner,png/codec,pendev/*,lakar/*,round/*}.ts`, `tests/support/*.ts`, `tsconfig.base.json`, `*/README.md`.
- **Review:** 4 temuan. 3 patch (medium 1, low 2), 1 reject (klaim plan; fix = edit plan), 0 defer baru. Deferred sejak perencanaan tercatat di frontmatter (9 item).
- **Follow-up review: false.** Hanya 1 medium yang di-patch, dan fix-nya sudah diverifikasi tes yang terbukti gagal tanpa fix. Patch per verdict: high 0, medium 1, low 2.
- **Verifikasi:**
  - `pnpm build` dan `pnpm test`: 43 file, 683 tes lulus (sebelumnya 678), 0 skip.
  - Hash protokol tetap `907cb36f4674…`. sha256 `skills/*.md`, `bench/protocol/*`, dan `bench/mcp/pencil.json` identik; `gen-skill-api.mjs` tanpa diff.
  - Dump MCP (tools + instructions) sha256 tetap `277781d7…`. Teks juri identik. `round --dry-run` hanya berbeda di baris porcelain (perubahan belum di-commit).
  - Tracer e2e 1× lulus (dijalankan implementer sebelum arsip).
  - lakard di-restart setelah build final: `active`, pool ready 2.
  - `verify.sh` exit 0. Satu run tepat setelah restart sempat exit 1 karena service belum siap; dua run berikutnya exit 0.
- **Risiko residual:**
  - Tracer e2e dijalankan sebelum patch review claude-runner (bench saja, tidak menyentuh jalur tracer).
  - `noUnusedParameters` bisa memaksa prefiks `_` pada kode baru.
  - Slug arsip bench kini maks 64 karakter.
  - Teks hint icon search masih menulis 1–50/10 sebagai literal.
  - Tes integrasi tetap bergantung pada dist (`pnpm build` dulu).
  - Kandidat yang di-defer (kode `INTERNAL`, IO commit, 404 Fastify, timeout MCP, process group claude, guard dist, `parseApiResponse`) menunggu setelah putaran resmi G0.
