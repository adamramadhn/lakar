# @lakar/skills

Mekanisme baca skill Lakar: file Markdown `skills/<name>.md` untuk tool `read_skill`. Isi skill ditulis terpisah; `api.md`
dihasilkan dari `@lakar/exec`.

- **Inti:** `core` (alur kerja, prelude, prinsip, proses anti-slop, arketipe, token ringkas, struktur).
- **Jenis layar:** `landing`, `mobile`, `webapp` (masing-masing berisi contoh teruji).
- **Domain (story 2.16):** `layout`, `typography`, `color`, `accessibility`, `ui` (berisi contoh teruji), `interface`,
  `writing`, `review`. Menggantikan `polish` (dihapus; `read_skill('polish')` → NOT_FOUND dengan pesan pemecahannya).
- **Rujukan:** `icons`, `api`.

Aturan muat (instruksi MCP + deskripsi `read_skill`): core + 8 domain + 1 jenis layar dibaca paralel di satu giliran; total per
jenis layar ≤ 11.500 token (lewat batas → padatkan, jangan naikkan). Setiap aturan diajarkan di tepat satu skill.

- **AD terkait:** AD-11 (`read_skill`), AD-12 (api.md dari kode).
- **Arah dependensi:** tidak bergantung pada paket `@lakar/*` lain.

## Ekspor utama

- `SKILL_NAMES`, `DOMAIN_SKILLS`, `SCREEN_SKILLS`, `RETIRED_SKILLS`, `SKILLS_DIR`, `listSkills`, `readSkill`, `splitCode`,
  `estimateTokens`.

## Batasan

- `skills/*.md` beku untuk putaran bench (hash dicatat di `frozen.json` putaran); setiap blok ```js diuji
  terhadap daemon nyata (`packages/daemon/src/skills-examples.test.ts`).
- Batas token per skill dan total muat per jenis layar dijaga `tests/skills.test.ts`.

## Atribusi

Teks skill ditulis dengan kata sendiri dari DESIGN.md Lakar dan prinsip publik; atribusi sengaja hanya di README ini, bukan di
teks skill yang dibaca agen.

- `layout.md`, `typography.md`, `color.md`, `ui.md`, `interface.md`, `review.md` (disiplin spacing, komponen, tipografi,
  warna, kritik diri; dulu `polish.md`): parafrase (tanpa salinan teks) dari prinsip skill UI publik berikut:
  - [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (layout, polish, typeset, colorize, bolder, quieter,
    distill, craft-floor, detector): Apache License 2.0; lihat LICENSE dan NOTICE.md di repositori sumber.
  - [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill): MIT License, © 2026 Leonxlnx.
  - [raphaelsalaja/skills](https://github.com/raphaelsalaja/skills) (alignment, color, defaults): MIT License, © 2026 Raphael Salaja.
  - [zeke/swiss-design](https://github.com/zeke/swiss-design): MIT License.
- `accessibility.md`: ambang [WCAG 2.2](https://www.w3.org/TR/WCAG22/) (W3C) (kontras teks 1.4.3, kontras
  non-teks 1.4.11, ukuran target 2.5.8 dan 2.5.5 untuk 44 px, penggunaan warna 1.4.1), dinyatakan ulang dengan kata sendiri bersama DESIGN.md
  §Ambang kontras.
- `writing.md`: tanda slop copy dan tanda baca dari prinsip ui-skills di atas; frasa terlarang = DESIGN.md.

Sumber lain di registry ui-skills tanpa lisensi tercantum hanya diambil prinsip umumnya, tanpa teks.

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run packages/skills
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
