import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { PACKAGE, SKILL_NAMES, SKILLS_DIR, isSkillName, listSkills, readSkill } from './index.js';

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
    expect(SKILL_NAMES).toEqual(['core', 'landing', 'mobile', 'icons', 'api']);
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
});
