// Skill Lakar (AD-11 `read_skill`): file Markdown `<name>.md` di `packages/skills/skills/` (di luar dist).
// Paket ini hanya mekanisme baca; isi skill ditulis terpisah. Tanpa dependensi @lakar lain.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE = '@lakar/skills';

/** Nama skill yang dikenal (tertutup). */
export const SKILL_NAMES = ['core', 'landing', 'mobile', 'icons', 'api'] as const;
export type SkillName = (typeof SKILL_NAMES)[number];

/** Direktori file skill: `packages/skills/skills/` (sama dari `src/` maupun `dist/`). */
export const SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url));

export const isSkillName = (name: string): name is SkillName => (SKILL_NAMES as readonly string[]).includes(name);

const skillPath = (name: SkillName, dir: string) => join(dir, `${name}.md`);

/** Semua nama skill + apakah file-nya sudah ada. */
export function listSkills(dir: string = SKILLS_DIR): { name: SkillName; available: boolean }[] {
  return SKILL_NAMES.map((name) => ({ name, available: existsSync(skillPath(name, dir)) }));
}

/** Isi skill `name`, atau undefined bila nama tidak dikenal atau file belum ada. */
export async function readSkill(name: string, dir: string = SKILLS_DIR): Promise<string | undefined> {
  if (!isSkillName(name)) return undefined;
  return readFile(skillPath(name, dir), 'utf8').catch(() => undefined);
}
