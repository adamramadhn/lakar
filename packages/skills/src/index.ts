// Skill Lakar (AD-11 `read_skill`): file Markdown `<name>.md` di `packages/skills/skills/` (di luar dist).
// Paket ini hanya mekanisme baca; isi skill ditulis terpisah. Tanpa dependensi @lakar lain.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE = '@lakar/skills';

/** Nama skill yang dikenal (tertutup): inti, jenis layar, delapan domain desain, lalu rujukan dan alur seleksi. */
export const SKILL_NAMES = [
  'core',
  'landing',
  'mobile',
  'webapp',
  'layout',
  'typography',
  'color',
  'accessibility',
  'ui',
  'interface',
  'writing',
  'review',
  'icons',
  'api',
  'selection',
] as const;
export type SkillName = (typeof SKILL_NAMES)[number];

/** Skill domain yang dibaca bersama `core` dan satu skill jenis layar (story 2.16). */
export const DOMAIN_SKILLS = ['layout', 'typography', 'color', 'accessibility', 'ui', 'interface', 'writing', 'review'] as const satisfies readonly SkillName[];

/** Skill jenis layar. */
export const SCREEN_SKILLS = ['landing', 'mobile', 'webapp'] as const satisfies readonly SkillName[];

/** Nama skill lama yang sudah tidak ada → pesan pengganti (bukan alias; `read_skill` tetap NOT_FOUND). */
export const RETIRED_SKILLS: Readonly<Record<string, string>> = {
  polish: `skill polish dipecah menjadi ${DOMAIN_SKILLS.join(', ')}`,
};

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

/**
 * Perkiraan token konservatif untuk batas ukuran skill: `ceil(karakter / 3.2)` (karakter = unit UTF-16, ≥ code point).
 * Teks Indonesia + kode cenderung ~3.5–4 karakter per token; 3.2 sengaja melebihkan.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.2);
}

/** Satu blok kode berpagar di Markdown skill. */
export type FencedBlock = { lang: string; code: string };

/** Pisahkan Markdown skill menjadi blok berpagar (```lang … ```) dan prosa (sisanya, tanpa pagar). */
export function splitCode(md: string): { blocks: FencedBlock[]; prose: string } {
  const blocks: FencedBlock[] = [];
  const prose = md.replace(/^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm, (_m, lang: string, code: string) => {
    blocks.push({ lang: lang.trim(), code: code.replace(/\n$/, '') });
    return '';
  });
  return { blocks, prose };
}
