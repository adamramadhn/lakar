---
title: 'Monorepo Lakar terbangun dan teruji kosong'
type: chore
ticket: '2'
created: '2026-11-17'
status: done
baseline_revision: '9e0db3c01ff7c70aa9a3c0617276c9eac70bb62f'
route: full
route_source: auto
risk: low
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/tools/node26/README.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Repo Lakar belum punya kode. Story berikutnya (tracer 1.3 dst.) butuh workspace pnpm dengan paket-paket Structural Seed, build `tsc -b` TypeScript 7, vitest, dan penjaga arah dependensi spine supaya hexagonal tidak bocor sejak awal.

**Approach:** Scaffold workspace pnpm kosong: 10 paket `packages/*` + `bench/` (masing-masing `package.json`, `tsconfig.json`, `src/index.ts` minimal + satu smoke test), tsconfig base + root solution dengan project references, vitest root, guard Node ≥ 26, dan tes arah dependensi berbasis pemindai murni yang dites dengan fixture pelanggaran.

## Boundaries & Constraints

**Always:**
- Node/pnpm hanya lewat `/opt/node-26/bin/node` dan `/opt/node-26/bin/pnpm` (wrapper). Tidak mengubah PATH sistem, profil shell, npm global, atau `/usr/bin/node` (C9).
- Versi terpin eksak (tanpa `^`/`~`): `typescript` 7.0.2, `vitest` 5.1.0, `@types/node` 26.6.6. Root `package.json`: `"private": true`, `"type": "module"`, `"packageManager": "pnpm@12.21.0"`, `"engines": {"node": ">=26"}`. Setiap paket juga punya `engines.node >=26`, `"type": "module"`, nama `@lakar/<nama>`, `"private": true`.
- `.node-version` berisi `26`. `pnpm-lock.yaml` di-commit.
- Arah dependensi (diagram spine, edge langsung): `core→schema`, `render→schema,ports`, `check→schema,ports`, `exec→core,ports`, `icons→schema`, `daemon→core,exec,render,check,icons,skills`, `mcp→schema`, `bench→schema`. `schema`, `ports`, `skills` tanpa dependensi `@lakar/*`. Yang diizinkan = closure transitif dari edge itu. Dependensi workspace dideklarasikan `workspace:*` dan direferensikan di `references` tsconfig.
- Larangan IO: `schema`, `ports`, `core`, `render` tidak boleh mengimpor builtin Node (`node:*` atau nama di `module.builtinModules`) maupun pustaka IO (`playwright-core`, `fastify`, `@fastify/*`, `@modelcontextprotocol/*`). `render` dikompilasi dengan lib DOM dan `types: []` (AD-6: bisa dimuat di browser).
- Artefak build masuk `.gitignore` repo: `node_modules/`, `dist/`, `*.tsbuildinfo`, `coverage/`.

**Never:**
- Jangan tambah dependensi runtime (zod, fastify, playwright, dll.) — milik story berikutnya. Jangan tulis logika domain.
- Jangan pakai alat yang butuh API TS programatik (typescript-eslint, ts-node, dll.).
- Jangan sentuh `.git/info/exclude`, `_bmad/`, `design/`, dokumen perencanaan, atau `tools/node26/*`. Jangan baca `design/` atau `ux-lakar/golden-set.md` (C7).
- Jangan instal Chromium, jangan buka port, jangan jalankan service.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Repo sehat | scaffold apa adanya | pemindai: 0 pelanggaran | — |
| core impor IO | file core berisi `import { readFile } from 'node:fs'` (atau `'fs'`, `require('child_process')`, `import('playwright-core')`) | pelanggaran `{pkg:'core', kind:'io', specifier}` | tes gagal dengan daftar pelanggaran |
| mcp impor core | file mcp berisi `import '@lakar/core'` atau `package.json` mcp punya dep `@lakar/core` | pelanggaran `{pkg:'mcp', kind:'direction', specifier:'@lakar/core'}` | tes gagal |
| arah terbalik | schema impor `@lakar/core` | pelanggaran direction | tes gagal |
| render impor icons | render impor `@lakar/icons` | pelanggaran direction | tes gagal |
| subpath | `@lakar/core/x` atau `node:fs/promises` | dinormalisasi ke `@lakar/core` / `fs` | — |
| Node 22 | `pnpm build` atau guard dijalankan dengan Node 22 | exit ≠ 0, pesan menyebut Node ≥ 26 | tsc tidak dijalankan |

</intent-contract>

## Code Map

- `tools/node26/README.md` -- konvensi pemanggilan Node 26/pnpm (read-only). Wrapper `/opt/node-26/bin/pnpm` mengawali PATH dengan `/opt/node-26/bin`, jadi skrip `pnpm run` memakai Node 26. Biner pnpm asli: `/opt/node-26/lib/node_modules/pnpm/pnpm`.
- `tools/node26/verify.sh` -- bukti C9, dijalankan di akhir (read-only).
- `.git/info/exclude` -- sudah meng-exclude folder perencanaan; jangan diubah.
- Repo saat ini hanya berisi `tools/node26/*` dan `_bmad-output/...`; tidak ada kode untuk dipakai ulang.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `pnpm-workspace.yaml` (`packages: ['packages/*', 'bench']`), `.node-version`, `.gitignore` -- root workspace. Skrip: `build` = `node scripts/assert-node.mjs && tsc -b`, `test` = `node scripts/assert-node.mjs && vitest run`, `clean` = `tsc -b --clean`. devDeps root: typescript, vitest, @types/node. Bila pnpm 12 butuh setelan (mis. `engineStrict: true`, izin build script) taruh di `pnpm-workspace.yaml`.
- [x] `scripts/assert-node.mjs` -- keluar 1 dengan pesan jelas bila `process.versions.node` major < 26 -- memenuhi "build gagal di Node 22" secara deterministik.
- [x] `tsconfig.base.json` -- strict, `composite`, `declaration`, `module`/`moduleResolution` `nodenext`, target ES2024, `outDir: dist`, `rootDir: src`; sesuaikan dengan opsi yang didukung TS 7.0.2.
- [x] `tsconfig.json` (root) -- `files: []` + `references` ke 11 paket.
- [x] `packages/{schema,ports,core,render,check,exec,icons,skills,daemon,mcp}/` dan `bench/` -- tiap paket: `package.json` (`exports` → `./dist/index.js` + types, deps `workspace:*` sesuai arah), `tsconfig.json` (extends base, `references` sesuai deps, exclude `**/*.test.ts`), `src/index.ts` (mis. `export const PACKAGE = '@lakar/<nama>'`), `src/index.test.ts` smoke test. `render`: `lib: ["ES2024","DOM"]`, `types: []`. Paket yang tidak butuh Node tidak memakai `@types/node`.
- [x] `tests/dependency-direction.ts` -- pemindai murni: membaca `package.json` dan file `src/**/*.ts` tiap paket, mengekstrak specifier (import/export from, `import()`, `require()`), menormalisasi, dan mengembalikan daftar pelanggaran `direction`/`io` sesuai aturan di Boundaries. Aturan (edge + paket IO-terlarang) didefinisikan sekali di file ini.
- [x] `tests/dependency-direction.test.ts` -- (a) repo nyata → 0 pelanggaran, dan semua 11 paket ditemukan; (b) fixture in-memory/tmp untuk setiap baris I/O Matrix → pelanggaran yang diharapkan.
- [x] `vitest.config.ts` (root) -- include `packages/*/src/**/*.test.ts`, `bench/src/**/*.test.ts`, `tests/**/*.test.ts`.
- [x] `pnpm-lock.yaml` -- hasil `pnpm install`, di-commit.

**Acceptance Criteria:**
- Given repo bersih, when `/opt/node-26/bin/pnpm install` lalu `pnpm build` lalu `pnpm test`, then ketiganya exit 0, `dist/` + `.d.ts` muncul untuk 11 paket, dan vitest melaporkan semua tes lulus.
- Given `packages/core/src` diberi sementara `import 'node:fs'` (atau mcp diberi `import '@lakar/core'`), when `pnpm test`, then tes arah dependensi gagal menyebut paket dan specifier; setelah dikembalikan, lulus lagi.
- Given Node 22 (`/usr/bin/node scripts/assert-node.mjs`, dan biner pnpm asli dengan `PATH=/usr/bin:...` menjalankan `build`), when dijalankan, then exit ≠ 0 dengan pesan Node ≥ 26.
- Given build selesai, when `git status --porcelain`, then tidak ada `node_modules`, `dist`, atau `*.tsbuildinfo` yang muncul.
- Given selesai, when `bash tools/node26/verify.sh`, then exit 0.

## Implementation Notes

- tsconfig.base memakai `${configDir}` untuk outDir/rootDir, `types: []` dan `lib: [ES2024]` default untuk semua paket (belum ada paket yang butuh @types/node); render menimpa lib dengan DOM.
- Biner pnpm asli (`/opt/node-26/lib/node_modules/pnpm/pnpm`) adalah ELF mandiri, jadi tes Node 22 dijalankan langsung dengan `PATH=/usr/bin:/bin` (bukan lewat `/usr/bin/node`); `build` dan `test` gagal exit 1 dengan pesan guard.
- pnpm 12 tidak butuh izin build script (tidak ada dependensi dengan postinstall); hanya `engineStrict: true` di pnpm-workspace.yaml.
- Tes arah dependensi untuk repo nyata mencetak daftar pelanggaran `pkg [kind] specifier (file)` di pesan assertion.

## Plan Change Log

## Review Triage Log

### 2026-11-17 — Review pass
- verdicts: 5 findings — high 0, medium 1, low 4, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` BUILTINS membuang prefiks `node:` dari semua entri, sehingga nama npm polos `test`/`sqlite`/`sea` di paket non-IO dianggap IO — BUILTINS kini hanya dari entri tanpa prefiks; specifier `node:*` mentah selalu IO; fixture `sqlite` vs `node:sqlite`.
  - `[low]` `[reject]` Temuan IO melaporkan specifier mentah, temuan direction yang ternormalisasi — baris matriks "core impor IO" mengharapkan specifier asli (`node:fs/promises` dst.), normalisasi hanya untuk deteksi; tidak ada kerugian yang bisa dinamai selain gaya pesan.
  - `[low]` `[patch]` Regex memindai komentar/string dan melewatkan ``import(`node:fs`)`` — pola `import()`/`require()` kini menerima backtick + fixture; pengupasan komentar ditolak karena plan menerima gerbang regex kasar, positif palsu pada impor IO yang dikomentari di paket murni jarang dan aman (konservatif), dan perbaikannya menambah kompleksitas.
  - `[medium]` `[patch]` File tes (`*.test.ts`, `tests/*.ts`) tidak pernah di-typecheck dan `@types/node` root tidak terpakai — ditambah `tsconfig.test.json` (noEmit, types node) dan skrip `test` menjalankan `tsc -p tsconfig.test.json` sebelum vitest; error tipe sengaja terbukti tertangkap (TS2322).
  - `[low]` `[patch]` Paket non-IO bisa memasang `@types/node` tanpa terdeteksi (melemahkan AD-6) — `@types/node` masuk IO_LIBRARIES + fixture.

## Design Notes

Closure transitif dipakai sebagai "diizinkan" agar `daemon` boleh memakai `schema`/`ports` dan `exec` boleh `schema`, tetapi arah ke atas (schema→core, mcp→core, render→icons) tetap ditolak. Pemindai berbasis regex cukup karena tujuan tes adalah gerbang kasar, bukan parser penuh; fixture membuktikan ia menangkap kasus yang diminta ticket.

## Verification

**Commands:**
- `cd /root/lakar && /opt/node-26/bin/pnpm install --frozen-lockfile` -- expected: exit 0
- `cd /root/lakar && /opt/node-26/bin/pnpm build` -- expected: exit 0, `packages/*/dist/index.d.ts` dan `bench/dist/index.d.ts` ada
- `cd /root/lakar && /opt/node-26/bin/pnpm test` -- expected: exit 0, semua tes (smoke 11 paket + arah dependensi) lulus
- `cd /root/lakar && /usr/bin/node scripts/assert-node.mjs; echo $?` -- expected: pesan Node ≥ 26, kode 1
- `cd /root/lakar && git status --porcelain --ignored | grep -E 'node_modules|dist|tsbuildinfo'` -- expected: hanya baris `!!` (ignored)
- `cd /root/lakar && bash tools/node26/verify.sh` -- expected: exit 0

## Auto Run Result

- Ringkasan: workspace pnpm 12.21.0 (Node ≥ 26) dengan 11 paket kosong `@lakar/*` (10 di `packages/` + `bench/`), `tsc -b` TypeScript 7.0.2 dengan project references sesuai arah spine, vitest 5.1.0, guard Node ≥ 26, dan tes arah dependensi (pemindai murni + fixture).
- File: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.node-version`, `.gitignore` (root workspace); `scripts/assert-node.mjs` (guard Node); `tsconfig.base.json`, `tsconfig.json`, `tsconfig.test.json` (build + typecheck tes); `vitest.config.ts`; `packages/*/` dan `bench/` (package.json, tsconfig.json, src/index.ts, src/index.test.ts); `tests/dependency-direction.ts` (aturan + pemindai), `tests/dependency-direction.test.ts`.
- Review (quick): 4 patch (1 medium, 3 low), 0 defer, 1 reject (specifier IO mentah: sesuai matriks, kosmetik).
- Follow-up review: false — patch medium hanya satu, tanpa high.
- Verifikasi: `pnpm install --frozen-lockfile` exit 0; `pnpm clean && pnpm build` exit 0, 11 `dist/index.d.ts`; `pnpm test` exit 0 (12 file, 35 tes); `/usr/bin/node scripts/assert-node.mjs` exit 1 dengan pesan; biner pnpm asli dengan `PATH=/usr/bin:/bin` `build` exit 1; injeksi sementara `import 'node:fs'` di core dan `import '@lakar/core'` di mcp membuat tes gagal dengan pesan `core [io] node:fs` / `mcp [direction] @lakar/core`, lalu dikembalikan; artefak build hanya muncul sebagai `!!`; `bash tools/node26/verify.sh` exit 0 (snapshot C9 identik baseline).
- Matriks: semua baris dicakup fixture vitest kecuali "Node 22", yang dicakup perintah Verification (guard + pnpm build di Node 22).
- Risiko sisa: pemindai berbasis regex (impor yang dibangun runtime tidak terdeteksi; impor IO yang dikomentari di paket murni ditandai). Paket yang nanti butuh API Node (daemon, exec, mcp, bench) perlu `"types": ["node"]` dan `@types/node` di tsconfig/manifest masing-masing.
