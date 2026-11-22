# @lakar/skills

Mekanisme baca skill Lakar: file Markdown `skills/<name>.md` (core, polish, landing, mobile, webapp, icons, api, selection) untuk tool
`read_skill`. Isi skill ditulis terpisah; `api.md` dihasilkan dari `@lakar/exec`.

- **AD terkait:** AD-11 (`read_skill`), AD-12 (api.md dari kode).
- **Arah dependensi:** tidak bergantung pada paket `@lakar/*` lain.

## Ekspor utama

- `SKILL_NAMES`, `SKILLS_DIR`, `listSkills`, `readSkill`, `splitCode`, `estimateTokens`.

## Batasan

- `skills/*.md` beku untuk putaran bench (hash dicatat di `frozen.json` putaran); setiap blok ```js diuji
  terhadap daemon nyata (`packages/daemon/src/skills-examples.test.ts`).
- Batas token per skill dijaga `tests/skills.test.ts`.

## Atribusi

`skills/polish.md` (disiplin spacing, komponen, tipografi, warna, kritik diri) ditulis dengan kata sendiri (parafrase,
tanpa salinan teks) dari prinsip skill UI publik berikut:

- [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (layout, polish, typeset, colorize, bolder, quieter,
  distill, craft-floor, detector): Apache License 2.0; lihat LICENSE dan NOTICE.md di repositori sumber.
- [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill): MIT License, © 2026 Leonxlnx.
- [raphaelsalaja/skills](https://github.com/raphaelsalaja/skills) (alignment, color, defaults): MIT License, © 2026 Raphael Salaja.
- [zeke/swiss-design](https://github.com/zeke/swiss-design): MIT License.

Sumber lain di registry ui-skills tanpa lisensi tercantum hanya diambil prinsip umumnya, tanpa teks. Atribusi sengaja
hanya di README ini, bukan di teks skill yang dibaca agen.

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run packages/skills
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
