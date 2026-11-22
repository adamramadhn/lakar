import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { PACKAGE, SKILL_NAMES, SKILLS_DIR, estimateTokens, isSkillName, listSkills, readSkill, splitCode } from './index.js';

describe('@lakar/skills', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'lakar-skills-'));
    await writeFile(join(dir, 'core.md'), '# core\nisi', 'utf8');
    await writeFile(join(dir, 'lain.md'), 'bukan skill', 'utf8');
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('mengekspor nama paket dan daftar nama tertutup', () => {
    expect(PACKAGE).toBe('@lakar/skills');
    expect(SKILL_NAMES).toEqual(['core', 'polish', 'landing', 'mobile', 'webapp', 'icons', 'api', 'selection']);
    expect(isSkillName('core')).toBe(true);
    expect(isSkillName('lain')).toBe(false);
  });

  it('SKILLS_DIR = packages/skills/skills/ (di luar dist)', () => {
    expect(SKILLS_DIR.endsWith(`${sep}packages${sep}skills${sep}skills${sep}`)).toBe(true);
  });

  it('listSkills: available hanya untuk file yang ada', () => {
    expect(listSkills(dir)).toEqual(SKILL_NAMES.map((name) => ({ name, available: name === 'core' })));
    expect(listSkills(join(dir, 'tidak-ada')).every((s) => !s.available)).toBe(true);
  });

  it('readSkill: isi file; nama di luar daftar / file belum ada / traversal → undefined', async () => {
    expect(await readSkill('core', dir)).toBe('# core\nisi');
    expect(await readSkill('landing', dir)).toBeUndefined();
    expect(await readSkill('lain', dir)).toBeUndefined();
    expect(await readSkill('../core', dir)).toBeUndefined();
  });

  it('estimateTokens: ceil(panjang string / 3.2)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(2);
    expect(estimateTokens('a'.repeat(32))).toBe(10);
    expect(estimateTokens('😀'.repeat(16))).toBe(10); // 32 unit UTF-16
  });

  it('splitCode: blok berpagar dipisah dari prosa', () => {
    const md = '# Judul\n\nprosa\n\n```js\nadd(null, {})\n```\n\nlagi\n\n```text\ncatatan\n```\n';
    const { blocks, prose } = splitCode(md);
    expect(blocks).toEqual([
      { lang: 'js', code: 'add(null, {})' },
      { lang: 'text', code: 'catatan' },
    ]);
    expect(prose).not.toContain('```');
    expect(prose).toContain('prosa');
    expect(prose).toContain('lagi');
  });
});
