// apps/desktop/scripts/nightly-version.mjs: baseline = tag stable tertinggi +1 patch,
// sufiks UTC YYYYMMDDHHmm; tag non-final diabaikan; gagal jelas tanpa tag stable.
// (pola latest-json.test.ts: skrip dipanggil lewat spawn, tidak diimpor ke typecheck .mjs).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'apps/desktop/scripts/nightly-version.mjs');
const dirs: string[] = [];

function tagFile(tags: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'lakar-nightly-ver-'));
  dirs.push(dir);
  const file = join(dir, 'tags.txt');
  writeFileSync(file, tags.join('\n'));
  return file;
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const NOW = '2026-11-25T18:00:00Z';
const run = (tags: string[], now = NOW) =>
  spawnSync('node', [SCRIPT, '--tags', tagFile(tags), '--now', now], { encoding: 'utf8' });

describe('nightly-version.mjs', () => {
  it('v0.1.8 → 0.1.9-nightly.<UTC YYYYMMDDHHmm>', () => {
    const r = run(['v0.1.8']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('0.1.9-nightly.202611251800');
  });

  it('urut semver, bukan leksikal: v0.1.10 mengalahkan v0.1.9', () => {
    const r = run(['v0.1.9', 'v0.1.10', 'v0.1.2']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('0.1.11-nightly.202611251800');
  });

  it('tag pra-rilis dan `nightly` diabaikan sebagai baseline', () => {
    const r = run(['v0.1.8', 'v0.2.0-rc1', 'nightly', 'v0.1.9-beta.20261101']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('0.1.9-nightly.202611251800');
  });

  it('tanpa tag stable → exit bukan nol dengan pesan jelas', () => {
    const r = run(['nightly', 'v0.1.9-rc1']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('tidak ada tag stable');
  });

  it('T 12 digit UTC; --now di zona lain dinormalkan', () => {
    // 19:30 di +07:00 = 12:30 UTC.
    const r = run(['v1.0.0'], '2026-11-25T19:30:00+07:00');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('1.0.1-nightly.202611251230');
  });

  it('--now tak valid → gagal', () => {
    const r = run(['v0.1.8'], 'bukan-tanggal');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('--now');
  });
});
