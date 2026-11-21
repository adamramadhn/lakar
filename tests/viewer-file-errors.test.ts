// Error kelola file Dashboard dari daemon sungguhan: pesan daemon (bahasa Indonesia, untuk agen) dipetakan
// `fileErrorText` ke teks UI berbahasa Inggris. Bentuk error = body AD-11 `/viewer/*` (code, message, retryable).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer, loadConfig } from '../packages/daemon/src/index.ts';
import { fileErrorText, type FileOp } from '../packages/viewer/src/files.ts';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const fakeRender = { screenshot: async () => new Uint8Array(), measure: async () => ({ width: 0, height: 0, nodes: [], texts: [] }) } as never;
const indonesian = /dokumen|sudah|tidak|arsip|pilih|kesalahan|folder .* tidak/;

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-viewer-errors-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('fileErrorText dengan error daemon sungguhan', () => {
  it('rename/unarchive/delete/move gagal → teks Inggris yang menyebut file, tanpa pesan daemon', async () => {
    const { app } = buildServer({ config: { ...baseConfig, port: 0, dataDir: await mkdtemp(join(root, 'data-')) }, render: fakeRender });
    const post = (url: string, payload?: object) => app.inject({ method: 'POST', url, ...(payload ? { payload } : {}) });
    const fail = async (op: FileOp, slug: string, r: Awaited<ReturnType<typeof post>>) => {
      expect(r.statusCode, r.body).toBeGreaterThanOrEqual(400);
      const err = r.json().error as { code: string; message: string; retryable: boolean };
      expect(err.message).toMatch(indonesian); // daemon tetap berbahasa Indonesia untuk agen
      const text = fileErrorText(Object.assign(new Error(err.message), err), op, slug, () => 'fallback');
      expect(text).not.toMatch(indonesian);
      return text;
    };
    for (const name of ['Alpha', 'Beta', 'Gamma']) expect((await post('/viewer/docs', { name, board: { preset: 'desktop' } })).statusCode).toBe(200);

    expect(await fail('rename', 'beta', await post('/viewer/docs/alpha/rename', { name: 'Beta' }))).toBe('A file named “beta” already exists. Choose another name.');

    expect((await post('/viewer/docs/gamma/archive')).statusCode).toBe(200);
    expect(await fail('rename', 'gamma', await post('/viewer/docs/alpha/rename', { name: 'Gamma' }))).toBe(
      'An archived file is already named “gamma”. Choose another name, or delete it from Archive first.',
    );

    expect(await fail('delete', 'ghost', await app.inject({ method: 'DELETE', url: '/viewer/docs/ghost' }))).toBe('“ghost” no longer exists. It may have been renamed or deleted in another window.');
    expect(await fail('move', 'alpha', await post('/viewer/folders/move', { slug: 'alpha', folder: 'fzzzzzzzzzz' }))).toBe(
      'This folder or file no longer exists. It may have been deleted in another window.',
    );
    await app.close();
  });
});
