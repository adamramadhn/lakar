# @lakar/skills

Mekanisme baca skill Lakar: file Markdown `skills/<name>.md` (core, landing, mobile, icons, api) untuk tool
`read_skill`. Isi skill ditulis terpisah; `api.md` dihasilkan dari `@lakar/exec`.

- **AD terkait:** AD-11 (`read_skill`), AD-12 (api.md dari kode).
- **Arah dependensi:** tidak bergantung pada paket `@lakar/*` lain.

## Ekspor utama

- `SKILL_NAMES`, `SKILLS_DIR`, `listSkills`, `readSkill`, `splitCode`, `estimateTokens`.

## Batasan

- `skills/*.md` beku untuk putaran bench (hash dicatat di `frozen.json` putaran); setiap blok ```js diuji
  terhadap daemon nyata (`packages/daemon/src/skills-examples.test.ts`).
- Batas token per skill dijaga `tests/skills.test.ts`.

## Tes

```bash
/opt/node-26/bin/pnpm build
/opt/node-26/bin/pnpm exec vitest run packages/skills
```

Semua tes repo: `/opt/node-26/bin/pnpm test` (dari root).
