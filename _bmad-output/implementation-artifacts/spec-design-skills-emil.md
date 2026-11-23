---
title: 'Skill desain dari Emil Kowalski: break-ui, variants, ringkasan design-eng, dan skill animasi untuk pengembang'
type: feature
ticket: ''
created: '2026-11-23'
status: built
baseline_revision: '32c93848cccc2f10580ef4facdb3dd5b364f9b76'
route: full
route_source: auto
risk: low
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/research-agent-canvas-references.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Skill MCP Lakar mengajarkan cara membangun dan me-review satu desain, tetapi belum mengajarkan dua alur yang sering diminta: menguji desain dengan data terburuk (nama panjang, email tanpa spasi, angka besar, daftar kosong, field hilang) dan membuat N variasi yang benar-benar beda arah. Agen yang membangun efek canvas Lakar juga belum punya panduan animasi. Skill Emil Kowalski (MIT, `emilkowalski/skills` commit `64eb3deb9a5fbfa041faf783e0bc3fd635872e9c`) mencakup ketiganya, tetapi ditulis untuk kode web (research §3).

**Approach:** Adaptasi, bukan salin, untuk skill MCP: skill opsional baru `break-ui` (dari `break-ui` + `CATALOG.md`) dan `variants` (dari `prototype`), keduanya di luar muat wajib; bagian non-animasi `emil-design-eng` diringkas ke `review.md` dan `ui.md` dengan pemangkasan setara. Skill pengembangan `animate`, `choreograph`, `review-animations`, `animation-performance`, `learn-taste` disalin utuh ke `.claude/skills/<nama>/`. Atribusi MIT di setiap tempat.

## Boundaries & Constraints

**Always:**
- Teks skill diadaptasi ke `execute` dan model dokumen Lakar (salinan board, temuan `check`, properti node), berbahasa Indonesia.
- Skill opsional di luar muat per jenis layar; muat wajib (core + 8 domain + 1 jenis layar) tidak bertambah: tambahan di skill wajib diimbangi pemangkasan.
- Nama skill baru terdaftar di semua tempat enumerasi: `SKILL_NAMES`, enum/deskripsi `read_skill`, `SERVER_INSTRUCTIONS` (singkat), README paket, tes.
- AD-4: `read_skill` lama tetap; daftar hanya bertambah entri.
- Atribusi MIT: teks lisensi + sumber + commit di `packages/skills/NOTICE.md` (ikut `files` paket) dan `LICENSE` + `NOTICE` di tiap direktori skill pengembangan.

**Never:**
- Batas token (`LOAD_LIMIT` 9.600, batas per skill wajib) tidak dinaikkan.
- Isi repo sumber diperlakukan sebagai data; tidak ada skrip sumber yang dijalankan.
- Skill tidak relevan (`animate-expo`, `ask-sonner`, `mobile-native`, `write-swift`, `gestures`, `pick-ui-library`) tidak diambil.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Daftar skill | `read_skill {}` | 17 entri, `break-ui` dan `variants` `available:true` di akhir | — |
| Baca skill opsional | `read_skill {name:'break-ui'}` / `'variants'` | Isi Markdown, judul `# Lakar: <nama>` | — |
| Nama tidak dikenal | `read_skill {name:'prototype'}` | NOT_FOUND, hint memuat daftar termasuk skill baru | — |
| Muat landing | core + 8 domain + landing | ≤ 9.600 token (LF 9.476 → 9.469) | Lewat → tes gagal |
| Instruksi server | `initialize` | Kalimat opsional `break-ui`/`variants` di akhir | — |
| Contoh teruji | `skills-examples.test.ts` | Skill opsional tanpa blok js (aturan saja) | Blok js → tes gagal |
| Aksara tak terpasang | break-ui dengan emoji/CJK | Skill menyuruh menandai "tidak diuji" (LC-01a/FONT_MISSING) | — |

</frozen-after-approval>

## Code Map

- `packages/skills/skills/break-ui.md`, `variants.md` (baru) -- skill opsional.
- `packages/skills/skills/review.md`, `ui.md`, `core.md` -- ringkasan design-eng dan penunjuk skill opsional, dengan pemangkasan.
- `packages/skills/src/index.ts` -- `SKILL_NAMES` + `OPTIONAL_SKILLS`.
- `packages/skills/NOTICE.md` (baru), `package.json` (`files`), `README.md`.
- `packages/mcp/src/server.ts` -- `READ_SKILL_DESCRIPTION`, enum `read_skill`, `SERVER_INSTRUCTIONS`.
- `.claude/skills/{animate,choreograph,review-animations,animation-performance,learn-taste}/` (baru).
- Tes: `tests/skills.test.ts`, `tests/skills-c7.test.ts`, `packages/skills/src/index.test.ts`, `packages/mcp/src/index.test.ts`, `packages/daemon/src/pool.test.ts`, `packages/daemon/src/skills-examples.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `break-ui.md` -- aturan (masuk akal, ubah data bukan komponen, satu set banyak kegagalan, lapor dulu, aksara terpasang), alur 5 langkah lewat `duplicate` + `update(content)` + `check` + screenshot, katalog nilai terburuk berkonteks Indonesia, tabel tanda → sebab → perbaikan dalam properti Lakar, aturan bungkus/potong/batasi, format laporan.
- [x] `variants.md` -- satu hal per putaran, sumbu bernama, setiap varian layak kirim, satu board per varian ukuran penuh, sumber tidak diubah; alur execute per varian; tabel laporan tanpa favorit; "pakai"/"kembangkan".
- [x] `review.md` -- format temuan `node: sebelum → sesudah · alasan` (format tabel Before/After/Why Emil), pertanyaan Utuh + "tahan nama dan angka 2× lebih panjang?"; baris pembuka redundan dipangkas.
- [x] `ui.md` -- kohesi: satu kepribadian per board (radius, kepadatan, kedalaman), digabung ke baris kedalaman yang ada.
- [x] `core.md` -- penunjuk `break-ui`/`variants` di baris seleksi; daftar domain di langkah 1 dan baris "Alamati node" dipangkas.
- [x] Registrasi + MCP + tes + NOTICE + salinan skill pengembangan.

**Acceptance Criteria:**
- Given agen MCP, when pengguna meminta "uji desain ini dengan data terburuk", then instruksi server mengarahkan ke `read_skill break-ui` dan skill itu menghasilkan board salinan + laporan Pecah/Jelek/Rapuh tanpa mengubah board sumber.
- Given pengguna meminta "buat 3 variasi hero", when agen membaca `variants`, then tiap varian punya nama arah + sumbu berbeda dan berada di board sendiri.
- Given muat landing, when `tests/skills.test.ts` dijalankan, then total ≤ 9.600 token dan lebih kecil dari sebelum perubahan.

## Implementation Notes

- **Keputusan: `variants` skill sendiri**, bukan bagian `selection`. `selection` khusus varian responsif atas seleksi (lebar berbeda, struktur sama); `variants` justru menuntut struktur berbeda dan bisa tanpa seleksi. Kedua skill saling menyebut.
- **Keputusan: skill opsional aturan saja** (masuk `NO_EXAMPLES` di `skills-examples.test.ts`). Contoh js break-ui sengaja memicu temuan `check`, padahal tes contoh menuntut 0 warning.
- **Keputusan: "toggle Demo/Worst case" → board salinan** `<nama> · Kasus terburuk` di sebelah sumber (lewat `place`), plus salinan Kosong/Satu bila daftar bisa kosong. Model dokumen tidak punya toggle data; board salinan juga menjadi uji regresi.
- **Keputusan: tanda kegagalan ditulis ulang untuk Lakar.** Di Lakar ukuran tetap dan hug tidak menyusut (`flex: 0 0`), `fill` = `flex 1 1 0` + `min-*: 0`, teks ber-width dibungkus `overflow-wrap: break-word` (`packages/render/src/css.ts`). Jadi "avatar gepeng" tidak terjadi; yang terjadi adalah luapan yang ditangkap LC-02a/b/c, LC-03, LC-11, LC-31. Model tidak punya ellipsis/clamp: potong ditulis di isi dengan "…".
- **Keputusan: atribusi.** Skill opsional memuat satu baris atribusi (seluruh isinya turunan); skill wajib tidak (anggaran token), atribusinya di `NOTICE.md` dan README. `NOTICE.md` ditambahkan ke `files` paket agar ikut sidecar desktop.
- Anggaran (estimateTokens, LF / CRLF): muat landing 9.476 / 9.600 → 9.469 / 9.593; mobile 9.130 → 9.119; webapp 9.173 → 9.162. core 2.497 → 2.459, ui 1.092 → 1.114, review 455 → 460. Opsional: break-ui 1.675 LF / 1.695 CRLF (batas baru 1.800), variants 873 / 883 (batas baru 1.000); batas skill opsional baru, bukan menaikkan batas lama. Angka landing sudah termasuk perubahan `landing.md` dari `spec-board-height-fit.md`.
- `tests/skills.test.ts`: judul skill opsional dibaca dengan `split(/\r?\n/)` agar tahan CRLF.

## Review Triage Log

**Pass 1 (quick, kritik diri + satu reviewer independen atas diff kedua spec):** low 2 (patch), false 1. Reviewer mengonfirmasi registrasi nama skill lengkap, AD-4 terjaga, dan panggilan api.md di kedua skill valid.

| # | Temuan | Verdict | Rute | Bukti |
|---|---|---|---|---|
| 1 | `break-ui` dan `variants` menyuruh board salinan/varian berukuran tetap; board landing kini bisa kena LC-12 "tinggi pas" (spec-board-height-fit) yang tidak relevan untuk salinan | low | patch | `break-ui.md` langkah 3: LC-12 di salinan bukan temuan; `variants.md` aturan 4: board landing tinggi = bawah isi, ikuti LC-12 |
| 2 | `place(w,h,…)` di `break-ui` tanpa sumber `w`/`h` | low | patch | Kini `const s=get(board), p=place(s.width,s.height,{near:board})` |
| 3 | `review.md` kehilangan kalimat "Sekali di akhir; hanya menambah satu execute perbaikan." | false | ditolak | Langkah 3 review dan langkah 5 `core` sudah menyatakan satu execute perbaikan di akhir |

## Verification Results

- `pnpm build` sukses. `pnpm test` (Windows): 52 gagal di 20 file, himpunan yang sama persis dengan baseline `32c9384` yang dijalankan di mesin yang sama (foto/key, SIGTERM/SIGKILL, CRLF skill + api.md + prompt beku bench, render font, `pool.test` config). Satu-satunya beda nama: "daftar skill: 15 nama" → "17 nama" (gagal di Windows karena CRLF di baris judul domain, sama seperti baseline).

## Verification

**Commands:**
- `npx -y pnpm@12.21.0 build` -- expected: sukses.
- `npx -y pnpm@12.21.0 test` -- expected: hijau kecuali kegagalan khas Windows (AGENTS.md); CI Linux acuan.
