// scripts/release.sh --dry-run: hanya mencetak langkah + hasil cek, tanpa tag/build/restart.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

describe('scripts/release.sh', () => {
  it('--dry-run: exit 0, langkah tag → build → install-browser → restart → tunggu status, tanpa membuat tag', () => {
    const version = /LAKAR_VERSION = '([^']+)'/.exec(readFileSync(join(ROOT, 'packages/schema/src/version.ts'), 'utf8'))![1]!;
    const tagsBefore = git('tag', '--list');
    const r = spawnSync('bash', [join(ROOT, 'scripts/release.sh'), '--dry-run'], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
    expect(r.status, r.stderr).toBe(0);
    const out = r.stdout;
    expect(out).toContain(`versi ${version} (tag v${version})`);
    expect(out).toMatch(/cek tree: (bersih|KOTOR \(\d+ path\) — rilis nyata akan ditolak)/);
    const order = ['[1] tag', '[2] build', '[3] install-browser', '[4] restart service', '[5] tunggu'].map((s) => out.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out).toContain('dry-run selesai');
    expect(git('tag', '--list')).toBe(tagsBefore);
  });

  it('argumen tak dikenal → exit 2', () => {
    const r = spawnSync('bash', [join(ROOT, 'scripts/release.sh'), '--paksa'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(2);
  });
});
