// Tes OnboardingStore (spec-first-run-signin task A): penanda per instalasi di
// <dataDir>/onboarding.json — file tidak ada/korup/version tak dikenal → dianggap tidak ada
// (file dibiarkan); `effective()` mengikuti tabel spec (cloud off → disabled tanpa tulis; penanda
// → isi penanda; session tanpa penanda → completed via existing-session; sisanya → pending).
// `completed` tidak pernah diturunkan ke `skipped` (skip telat tidak membuka ulang gate).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OnboardingStore, type OnboardingState } from './index.js';
import type { CloudSession } from './session.js';

const SESSION: CloudSession = { token: 'sess-token-1', user: { id: 'u-1', email: 'adi@example.com' } };

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-onboarding-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function store(): Promise<{ s: OnboardingStore; path: string }> {
  const dir = await mkdtemp(join(root, 'data-'));
  const s = new OnboardingStore(dir);
  return { s, path: join(dir, 'onboarding.json') };
}

describe('OnboardingStore.load/save', () => {
  it('tanpa file → undefined; save → state lengkap ditulis 0644 atomik; load → nilai yang sama', async () => {
    const { s, path } = await store();
    expect(await s.load()).toBeUndefined();
    const st = await s.save('skipped', 'skip');
    expect(st).toEqual({ version: 1, signin: 'skipped', via: 'skip', at: expect.any(String) });
    expect((await stat(path)).mode & 0o777).toBe(0o644);
    expect(await s.load()).toEqual(st);
    // Isi file JSON valid yang bisa diperiksa pengguna.
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ version: 1, signin: 'skipped', via: 'skip' });
  });

  it('completed tidak diturunkan: save skipped setelah completed → tetap completed (isian lama)', async () => {
    const { s } = await store();
    const done = await s.save('completed', 'google');
    const again = await s.save('skipped', 'skip');
    expect(again).toEqual(done);
    expect((await s.load())!.signin).toBe('completed');
    // Sebaliknya boleh: skipped → completed (sign-in setelah skip harus meng-upgrade).
    const { s: s2 } = await store();
    await s2.save('skipped', 'skip');
    expect((await s2.save('completed', 'github')).signin).toBe('completed');
  });

  it('file korup/version tak dikenal → undefined dan file TIDAK dihapus (bisa diperiksa pengguna)', async () => {
    const { s, path } = await store();
    await writeFile(path, '{ini bukan json', 'utf8');
    expect(await s.load()).toBeUndefined();
    expect(existsSync(path)).toBe(true);
    await writeFile(path, JSON.stringify({ version: 99, signin: 'skipped', via: 'skip' }), 'utf8');
    expect(await s.load()).toBeUndefined();
    expect(existsSync(path)).toBe(true);
    await writeFile(path, JSON.stringify({ version: 1, signin: 'ngawur', via: 'skip' }), 'utf8');
    expect(await s.load()).toBeUndefined();
  });
});

describe('OnboardingStore.effective', () => {
  it('cloud off → disabled, tidak menulis apa pun', async () => {
    const { s, path } = await store();
    expect(await s.effective({ cloudOn: false, session: undefined })).toBe('disabled');
    expect(existsSync(path)).toBe(false);
    // Penanda pun tidak ditulis walau session ada.
    expect(await s.effective({ cloudOn: false, session: SESSION })).toBe('disabled');
    expect(existsSync(path)).toBe(false);
  });

  it('penanda ada → isi penanda (session pun tidak mengubah)', async () => {
    const { s } = await store();
    await s.save('skipped', 'skip');
    expect(await s.effective({ cloudOn: true, session: undefined })).toBe('skipped');
    expect(await s.effective({ cloudOn: true, session: SESSION })).toBe('skipped');
  });

  it('session valid tanpa penanda → completed + ditulis via existing-session', async () => {
    const { s, path } = await store();
    expect(await s.effective({ cloudOn: true, session: SESSION })).toBe('completed');
    const written = JSON.parse(await readFile(path, 'utf8')) as OnboardingState;
    expect(written.signin).toBe('completed');
    expect(written.via).toBe('existing-session');
  });

  it('tanpa penanda, tanpa session → pending (tidak ditulis)', async () => {
    const { s, path } = await store();
    expect(await s.effective({ cloudOn: true, session: undefined })).toBe('pending');
    expect(existsSync(path)).toBe(false);
  });
});
