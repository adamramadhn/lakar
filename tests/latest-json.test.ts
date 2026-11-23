// apps/desktop/scripts/make-latest-json.mjs: peta sig → platform, URL rilis, dan kegagalan yang jelas
// (pola release.test.ts: skrip dipanggil lewat spawn, tidak diimpor ke typecheck .mjs).
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'apps/desktop/scripts/make-latest-json.mjs');
const dirs: string[] = [];

/** Direktori fixture sementara; `files` = nama → isi (`.sig` apa adanya, installer tidak perlu ada). */
function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'lakar-latest-json-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name.split('/').slice(0, -1).join('/')), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const run = (args: string[]) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });

const SIGS: Record<string, string> = {
  'Lakar_0.2.0_x64-setup.exe.sig': 'SIG-WIN',
  'Lakar_0.2.0_x64_en-US.msi.sig': 'SIG-MSI-DIABAIKAN',
  'Lakar_0.2.0_x64.app.tar.gz.sig': 'SIG-MAC-X64',
  'Lakar_0.2.0_aarch64.app.tar.gz.sig': 'SIG-MAC-ARM',
  'lakar_0.2.0_amd64.AppImage.sig': 'SIG-LINUX',
  'lakar_0.2.0_amd64.deb.sig': 'SIG-DEB-DIABAIKAN',
};

const ARGS = ['--version', '0.2.0', '--tag', 'v0.2.0', '--repo', 'fatmuh/lakar'];

describe('make-latest-json.mjs', () => {
  it('sig lengkap → latest.json dengan 4 platform dan URL rilis yang benar', () => {
    const dir = fixture(SIGS);
    const r = run(['--dir', dir, ...ARGS]);
    expect(r.status, r.stderr).toBe(0);
    const latest = JSON.parse(readFileSync(join(dir, 'latest.json'), 'utf8'));
    expect(latest.version).toBe('0.2.0');
    expect(Date.parse(latest.pub_date)).not.toBeNaN();
    const base = 'https://github.com/fatmuh/lakar/releases/download/v0.2.0';
    expect(latest.platforms).toEqual({
      'windows-x86_64': { signature: 'SIG-WIN', url: `${base}/Lakar_0.2.0_x64-setup.exe` },
      'darwin-x86_64': { signature: 'SIG-MAC-X64', url: `${base}/Lakar_0.2.0_x64.app.tar.gz` },
      'darwin-aarch64': { signature: 'SIG-MAC-ARM', url: `${base}/Lakar_0.2.0_aarch64.app.tar.gz` },
      'linux-x86_64': { signature: 'SIG-LINUX', url: `${base}/lakar_0.2.0_amd64.AppImage` },
    });
    // .msi.sig dan .deb.sig tidak masuk latest.json.
    const urls = Object.values(latest.platforms as Record<string, { url: string }>).map((p) => p.url);
    expect(urls.some((u) => u.endsWith('.msi') || u.endsWith('.deb'))).toBe(false);
  });

  it('--notes-file → notes masuk; --out menulis ke path lain', () => {
    const dir = fixture({ ...SIGS, 'notes.md': '  Isi catatan rilis  ' });
    const out = join(dir, 'sub', 'latest.json');
    const r = run(['--dir', dir, ...ARGS, '--notes-file', join(dir, 'notes.md'), '--out', out]);
    expect(r.status, r.stderr).toBe(0);
    const latest = JSON.parse(readFileSync(out, 'utf8'));
    expect(latest.notes).toBe('Isi catatan rilis');
  });

  it('platform kurang → gagal dan menyebut platformnya', () => {
    const { 'lakar_0.2.0_amd64.AppImage.sig': _gone, ...rest } = SIGS;
    const dir = fixture(rest);
    const r = run(['--dir', dir, ...ARGS]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('linux-x86_64');
  });

  it('tanpa sig sama sekali → gagal', () => {
    const dir = fixture({ 'Lakar_0.2.0_x64-setup.exe': 'biner' });
    const r = run(['--dir', dir, ...ARGS]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('.sig');
  });

  it('sig duplikat per platform → gagal', () => {
    const dir = fixture({ ...SIGS, 'Lakar_0.2.1_x64-setup.exe.sig': 'SIG-LAIN' });
    const r = run(['--dir', dir, ...ARGS]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('windows-x86_64');
  });

  it('argumen wajib kurang → gagal', () => {
    const dir = fixture(SIGS);
    const r = run(['--dir', dir, '--version', '0.2.0']);
    expect(r.status).toBe(1);
  });
});
