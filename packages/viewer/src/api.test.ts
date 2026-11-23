// Klien viewer: sesi hilang (401) dibuat ulang sekali, dan antrean serial per sesi. fetch palsu, tanpa lakard.
import { afterEach, describe, expect, it, vi } from 'vitest';

type Call = { method: string; path: string; body: any; session: string | undefined };
type Handler = (call: Call) => { status?: number; body: unknown; delayMs?: number };

const PNG = 'iVBORw0KGgo=';
const ok = (data: unknown) => ({ body: { ok: true, data } });

/** Pasang fetch palsu; `calls` dicatat saat fetch dipanggil (bukan saat selesai). */
function fakeFetch(handler: Handler): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (path: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const call: Call = { method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined, session: init.headers['x-lakar-session'] };
    calls.push(call);
    const r = handler(call);
    if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
  return calls;
}

/** Klien baru per tes (state modul `api` tidak bocor antar tes). */
async function freshApi() {
  vi.resetModules();
  return (await import('./api.ts')).api;
}

const docs = (slugs: string[]) => ok({ docs: slugs.map((slug) => ({ slug, rev: 1, updatedAt: '2026-01-01T00:00:00.000Z', boardCount: 1, firstBoardId: 'Bbbbbbb1' })) });
const doc = (slug: string) => ok({ doc: { id: 'Dddddddd', rev: 1, pages: [], slug } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('daemon mati (banner offline)', () => {
  it('fetch gagal → OfflineError dan offline aktif; respons berikutnya → offline padam; Retry memanggil pemuat', async () => {
    vi.resetModules();
    const mod = await import('./api.ts');
    const seen: boolean[] = [];
    const off = mod.connection.subscribe(() => seen.push(mod.connection.isOffline()));
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });
    await expect(mod.api.listDocs()).rejects.toBeInstanceOf(mod.OfflineError);
    expect(mod.connection.isOffline()).toBe(true);
    fakeFetch(() => docs([]));
    await expect(mod.api.listDocs()).resolves.toEqual([]);
    expect(mod.connection.isOffline()).toBe(false);
    expect(seen).toEqual([true, false]);
    off();
    const reload = vi.fn();
    const offRetry = mod.connection.onRetry(reload);
    mod.connection.retry();
    expect(reload).toHaveBeenCalledOnce();
    offRetry();
  });
});

describe('ViewerClient', () => {
  it('401 (sesi hilang): sesi dibuat ulang, /docs/open diulang, permintaan selesai', async () => {
    let sessions = 0;
    let shots = 0;
    const calls = fakeFetch((c) => {
      if (c.path === '/viewer/docs') return docs(['a']);
      if (c.path === '/viewer/docs/a') return doc('a');
      if (c.path === '/sessions') return ok({ sessionId: `s${++sessions}` });
      if (c.path === '/docs/open') return ok({ docId: 'Dddddddd', slug: 'a', rev: 1, created: false });
      if (c.path === '/screenshot') {
        if (++shots === 1) return { status: 401, body: { ok: false, error: { code: 'NOT_FOUND', message: 'sesi tidak dikenal', hint: 'buat sesi baru', retryable: false } } };
        return ok({ boardId: 'Bbbbbbb1', width: 10, height: 10, mimeType: 'image/png', png: PNG });
      }
      throw new Error(`tak terduga ${c.path}`);
    });
    const api = await freshApi();
    const shot = await api.screenshot('a', 1, 'Bbbbbbb1');
    expect(shot).toMatchObject({ boardId: 'Bbbbbbb1', width: 10, height: 10 });
    expect(calls.filter((c) => c.path === '/sessions')).toHaveLength(2);
    const opens = calls.filter((c) => c.path === '/docs/open');
    expect(opens.map((c) => c.session)).toEqual(['s1', 's2']);
    expect(calls.filter((c) => c.path === '/screenshot').map((c) => c.session)).toEqual(['s1', 's2']);
  });

  it('antrean serial: dua slug bersamaan → open(a), screenshot, open(b), screenshot meski respons a lambat', async () => {
    const calls = fakeFetch((c) => {
      if (c.path === '/viewer/docs') return docs(['a', 'b']);
      if (c.path.startsWith('/viewer/docs/')) return doc(c.path.slice('/viewer/docs/'.length));
      if (c.path === '/sessions') return ok({ sessionId: 's1' });
      if (c.path === '/docs/open') return { ...ok({ docId: 'Dddddddd', slug: c.body.slug, rev: 1, created: false }), delayMs: c.body.slug === 'a' ? 30 : 0 };
      if (c.path === '/screenshot') return { ...ok({ boardId: c.body.boardId, width: 1, height: 1, mimeType: 'image/png', png: PNG }), delayMs: c.body.boardId === 'A' ? 30 : 0 };
      throw new Error(`tak terduga ${c.path}`);
    });
    const api = await freshApi();
    await Promise.all([api.screenshot('a', 1, 'A'), api.screenshot('b', 1, 'B')]);
    const seq = calls.filter((c) => c.path === '/docs/open' || c.path === '/screenshot').map((c) => `${c.path}:${c.body.slug ?? c.body.boardId}`);
    expect(seq).toEqual(['/docs/open:a', '/screenshot:A', '/docs/open:b', '/screenshot:B']);
  });

  it('slug terhapus setelah daftar dimuat → NOT_FOUND tanpa /docs/open', async () => {
    const calls = fakeFetch((c) => {
      if (c.path === '/viewer/docs') return docs(['a']);
      if (c.path === '/viewer/docs/a') return { status: 404, body: { ok: false, error: { code: 'NOT_FOUND', message: 'dokumen a tidak ada', hint: '', retryable: false } } };
      if (c.path === '/sessions') return ok({ sessionId: 's1' });
      throw new Error(`tak terduga ${c.path}`);
    });
    const api = await freshApi();
    await api.listDocs();
    await expect(api.screenshot('a', 1, 'A')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(calls.some((c) => c.path === '/docs/open')).toBe(false);
  });

  it('cache screenshot memakai rev dari /docs/open, bukan rev pemanggil', async () => {
    let rev = 1;
    const calls = fakeFetch((c) => {
      if (c.path === '/viewer/docs') return docs(['a']);
      if (c.path === '/viewer/docs/a') return doc('a');
      if (c.path === '/sessions') return ok({ sessionId: 's1' });
      if (c.path === '/docs/open') return ok({ docId: 'Dddddddd', slug: 'a', rev, created: false });
      if (c.path === '/screenshot') return ok({ boardId: 'A', width: 1, height: 1, mimeType: 'image/png', png: PNG });
      throw new Error(`tak terduga ${c.path}`);
    });
    const api = await freshApi();
    await api.screenshot('a', 1, 'A');
    // Pemanggil melihat rev 2, daemon masih rev 1 → buka ulang, rev sama → cache dipakai.
    await api.screenshot('a', 2, 'A');
    expect(calls.filter((c) => c.path === '/screenshot')).toHaveLength(1);
    // Daemon maju ke rev 3 → screenshot baru.
    rev = 3;
    await api.screenshot('a', 3, 'A');
    expect(calls.filter((c) => c.path === '/screenshot')).toHaveLength(2);
  });
  it('PNG board yang dirender pada rev ≥ seenRev dipakai ulang tanpa /docs/open atau /screenshot baru', async () => {
    let rev = 3;
    const calls = fakeFetch((c) => {
      if (c.path === '/viewer/docs') return docs(['a']);
      if (c.path === '/viewer/docs/a') return doc('a');
      if (c.path === '/sessions') return ok({ sessionId: 's1' });
      if (c.path === '/docs/open') return ok({ docId: 'Dddddddd', slug: 'a', rev, created: false });
      if (c.path === '/screenshot') return ok({ boardId: 'A', width: 1, height: 1, mimeType: 'image/png', png: PNG });
      throw new Error(`tak terduga ${c.path}`);
    });
    const api = await freshApi();
    const first = await api.screenshot('a', 3, 'A');
    const count = (path: string) => calls.filter((c) => c.path === path).length;
    const opens = count('/docs/open');
    expect(count('/screenshot')).toBe(1);
    // Board terakhir berubah di rev 1; PNG rev 3 masih benar.
    expect(await api.screenshot('a', 1, 'A')).toBe(first);
    expect(count('/docs/open')).toBe(opens);
    expect(count('/screenshot')).toBe(1);
    // Daemon maju, board berubah di rev 4 → render baru.
    rev = 4;
    await api.screenshot('a', 4, 'A');
    expect(count('/screenshot')).toBe(2);
  });
});

describe('kolom List view (aplikasi 11)', () => {
  it('listDocs meneruskan field opsional createdAt/lastClient/check; ringkasan lama tanpa field tetap utuh', async () => {
    const rich = { slug: 'a', rev: 3, updatedAt: '2026-01-02T00:00:00.000Z', boardCount: 2, firstBoardId: 'Bbbbbbb1', createdAt: '2026-01-01T00:00:00.000Z', lastClient: 'codex-cli', check: { error: 1, warning: 0 } };
    const plain = { slug: 'b', rev: 1, updatedAt: '2026-01-01T00:00:00.000Z', boardCount: 0, firstBoardId: null };
    const calls = fakeFetch(() => ok({ docs: [rich, plain] }));
    const api = await freshApi();
    const list = await api.listDocs();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /viewer/docs']);
    expect(list).toEqual([rich, plain]);
    expect(list[1]).not.toHaveProperty('check');
  });
});

describe('kelola file', () => {
  it('rute + metode tulis; sukses → cache screenshot slug terkait dibuang dan pendengar dipanggil', async () => {
    let deleted = false;
    const calls = fakeFetch((c) => {
      if (c.path === '/viewer/docs' && c.method === 'GET') return docs(deleted ? [] : ['a']);
      if (c.path === '/viewer/docs/a' && c.method === 'GET') return doc('a');
      if (c.path === '/sessions') return ok({ sessionId: 's1' });
      if (c.path === '/docs/open') return ok({ docId: 'Dddddddd', slug: 'a', rev: 1, created: false });
      if (c.path === '/screenshot') return ok({ boardId: 'A', width: 1, height: 1, mimeType: 'image/png', png: PNG });
      if (c.path === '/viewer/docs' && c.method === 'POST') return ok({ slug: 'my-landing', rev: 1 });
      if (c.path === '/viewer/docs/a/rename') return ok({ slug: 'b', from: 'a' });
      if (c.path === '/viewer/docs/a/duplicate') return ok({ slug: 'a-copy', rev: 0 });
      if (c.path === '/viewer/docs/a/archive' || c.path === '/viewer/docs/a/unarchive') return ok({ slug: 'a' });
      if (c.path.startsWith('/viewer/docs/a') && c.method === 'DELETE') {
        deleted = true;
        return ok({ slug: 'a', deleted: true });
      }
      if (c.path === '/viewer/archive') return docs(['z']);
      throw new Error(`tak terduga ${c.method} ${c.path}`);
    });
    const api = await freshApi();
    const changed = vi.fn();
    api.onDocsChanged(changed);
    const fileEvents = vi.fn();
    api.onFileEvent(fileEvents);
    await expect(api.createFile('My Landing', { preset: 'custom', width: 10, height: 20 })).resolves.toEqual({ slug: 'my-landing', rev: 1 });
    await api.renameFile('a', 'B');
    await api.duplicateFile('a');
    await api.archiveFile('a');
    await api.unarchiveFile('a');
    await api.deleteFile('a', true);
    expect((await api.listArchive()).map((d) => d.slug)).toEqual(['z']);
    expect(changed).toHaveBeenCalledTimes(6);
    // Hanya rename/archive/delete yang memengaruhi tab; slug rename dari respons daemon.
    expect(fileEvents.mock.calls.map((c) => c[0])).toEqual([
      { type: 'rename', from: 'a', to: 'b' },
      { type: 'archive', slug: 'a' },
      { type: 'delete', slug: 'a', archived: true },
    ]);
    expect(calls.filter((c) => c.method !== 'GET' && c.path.startsWith('/viewer')).map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /viewer/docs',
      'POST /viewer/docs/a/rename',
      'POST /viewer/docs/a/duplicate',
      'POST /viewer/docs/a/archive',
      'POST /viewer/docs/a/unarchive',
      'DELETE /viewer/docs/a?archived=true',
    ]);
    expect(calls[0]!.body).toEqual({ name: 'My Landing', board: { preset: 'custom', width: 10, height: 20 } });

    // Screenshot a di-cache, lalu dihapus: cache dibuang → permintaan berikut tidak memakai PNG lama.
    deleted = false;
    await api.screenshot('a', 1, 'A');
    await api.screenshot('a', 1, 'A');
    expect(calls.filter((c) => c.path === '/screenshot')).toHaveLength(1);
    await api.deleteFile('a');
    await expect(api.screenshot('a', 1, 'A')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(calls.filter((c) => c.path === '/screenshot')).toHaveLength(1);
  });

  it('gagal → ApiError, pendengar tidak dipanggil', async () => {
    fakeFetch(() => ({ status: 409, body: { ok: false, error: { code: 'CONFLICT', message: 'dokumen b sudah ada', hint: 'pilih nama lain', retryable: false } } }));
    const api = await freshApi();
    const changed = vi.fn();
    api.onDocsChanged(changed);
    api.onFileEvent(changed);
    await expect(api.renameFile('a', 'b')).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('folder (aplikasi 10)', () => {
  const folder = { id: 'fabcdefghij', name: 'Client work', createdAt: '2026-01-01T00:00:00.000Z' };
  it('metode, path, body; pendengar onDocsChanged dipanggil setelah setiap tulis', async () => {
    const calls = fakeFetch((c) => {
      if (c.path === '/viewer/folders' && c.method === 'GET') return ok({ folders: [folder], membership: { a: folder.id } });
      if (c.path === '/viewer/folders' && c.method === 'POST') return ok({ folder });
      if (c.path === `/viewer/folders/${folder.id}/rename`) return ok({ folder: { ...folder, name: 'Clients' } });
      if (c.path === `/viewer/folders/${folder.id}` && c.method === 'DELETE') return ok({ id: folder.id, deleted: true, moved: ['a'] });
      if (c.path === '/viewer/folders/move') return ok({ slug: c.body.slug, folder: c.body.folder });
      throw new Error(`tak terduga ${c.method} ${c.path}`);
    });
    const api = await freshApi();
    const changed = vi.fn();
    api.onDocsChanged(changed);
    await expect(api.listFolders()).resolves.toEqual({ folders: [folder], membership: { a: folder.id } });
    expect(changed).not.toHaveBeenCalled();
    await expect(api.createFolder('Client work')).resolves.toEqual(folder);
    expect(changed).toHaveBeenCalledTimes(1);
    await expect(api.renameFolder(folder.id, 'Clients')).resolves.toMatchObject({ id: folder.id, name: 'Clients' });
    expect(changed).toHaveBeenCalledTimes(2);
    await expect(api.moveToFolder('a', folder.id)).resolves.toEqual({ slug: 'a', folder: folder.id });
    expect(changed).toHaveBeenCalledTimes(3);
    await expect(api.moveToFolder('a', null)).resolves.toEqual({ slug: 'a', folder: null });
    expect(changed).toHaveBeenCalledTimes(4);
    await expect(api.deleteFolder(folder.id)).resolves.toMatchObject({ id: folder.id, moved: ['a'] });
    expect(changed).toHaveBeenCalledTimes(5);
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['GET', '/viewer/folders', undefined],
      ['POST', '/viewer/folders', { name: 'Client work' }],
      ['POST', `/viewer/folders/${folder.id}/rename`, { name: 'Clients' }],
      ['POST', '/viewer/folders/move', { slug: 'a', folder: folder.id }],
      ['POST', '/viewer/folders/move', { slug: 'a', folder: null }],
      ['DELETE', `/viewer/folders/${folder.id}`, undefined],
    ]);
  });

  it('409 dari createFolder → ApiError CONFLICT, pendengar tidak dipanggil', async () => {
    fakeFetch(() => ({ status: 409, body: { ok: false, error: { code: 'CONFLICT', message: 'folder "Client work" sudah ada', hint: 'pilih nama lain', retryable: false } } }));
    const api = await freshApi();
    const changed = vi.fn();
    api.onDocsChanged(changed);
    const err = await api.createFolder('client work').catch((e: unknown) => e);
    expect(err).toBeInstanceOf((await import('./api.ts')).ApiError);
    expect(err).toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('History (aplikasi 3)', () => {
  it('versi lama + screenshot snapshot di-cache per slug@rev tanpa sesi; gagal tidak di-cache; restore → POST {rev} + pendengar', async () => {
    let failShot = true;
    const calls = fakeFetch((c) => {
      if (c.path === '/viewer/docs/a/revs/3' && c.method === 'GET') return ok({ doc: { id: 'Dddddddd', rev: 3, pages: [] } });
      if (c.path === '/viewer/docs/a/revs/2' && c.method === 'GET')
        return { status: 404, body: { ok: false, error: { code: 'NOT_FOUND', message: 'tidak ada snapshot', hint: 'versi ini dibuat sebelum snapshot tersedia' } } };
      if (c.path === '/viewer/docs/a/revs/3/screenshot') {
        if (failShot) {
          failShot = false;
          return { status: 500, body: { ok: false, error: { code: 'RENDER_FAILED', message: 'x', hint: '' } } };
        }
        return ok({ boardId: c.body.boardId, width: 1, height: 1, mimeType: 'image/png', png: PNG });
      }
      if (c.path === '/viewer/docs/a/restore') return ok({ slug: 'a', rev: 8, restoredFrom: 3 });
      throw new Error(`tak terduga ${c.method} ${c.path}`);
    });
    const api = await freshApi();
    const changed = vi.fn();
    api.onDocsChanged(changed);
    expect((await api.getRevision('a', 3)).rev).toBe(3);
    await api.getRevision('a', 3);
    await expect(api.getRevision('a', 2)).rejects.toMatchObject({ code: 'NOT_FOUND', hint: 'versi ini dibuat sebelum snapshot tersedia' });
    await expect(api.getRevision('a', 2)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(api.revScreenshot('a', 3, 'B')).rejects.toMatchObject({ code: 'RENDER_FAILED' });
    expect((await api.revScreenshot('a', 3, 'B')).boardId).toBe('B');
    await api.revScreenshot('a', 3, 'B');
    expect(calls.filter((c) => c.path === '/viewer/docs/a/revs/3')).toHaveLength(1);
    expect(calls.filter((c) => c.path === '/viewer/docs/a/revs/2')).toHaveLength(2);
    expect(calls.filter((c) => c.path === '/viewer/docs/a/revs/3/screenshot')).toHaveLength(2);
    expect(calls.every((c) => c.session === undefined)).toBe(true);
    await expect(api.restore('a', 3)).resolves.toEqual({ slug: 'a', rev: 8, restoredFrom: 3 });
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/viewer/docs/a/restore', body: { rev: 3 } });
    expect(changed).toHaveBeenCalledOnce();
    await api.restore('a', 3, 7);
    expect(calls.at(-1)).toMatchObject({ path: '/viewer/docs/a/restore', body: { rev: 3, baseRev: 7 } });
  });

  it('kelola halaman: path, method, dan body; gagal → ApiError', async () => {
    const calls = fakeFetch((c) => {
      if (c.path === '/viewer/docs/a/pages/Pg000001' && c.method === 'DELETE') return { status: 409, body: { ok: false, error: { code: 'CONFLICT', message: 'satu-satunya halaman', hint: 'dokumen butuh setidaknya satu halaman' } } };
      return ok({ slug: 'a', rev: 2, pageId: 'Pg000002' });
    });
    const api = await freshApi();
    await expect(api.addPage('a')).resolves.toEqual({ slug: 'a', rev: 2, pageId: 'Pg000002' });
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/viewer/docs/a/pages', body: {} });
    await api.addPage('a', 'Home');
    expect(calls.at(-1)).toMatchObject({ body: { name: 'Home' } });
    await api.renamePage('a', 'Pg000002', 'About');
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/viewer/docs/a/pages/Pg000002/rename', body: { name: 'About' } });
    await api.movePage('a', 'Pg000002', 0);
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/viewer/docs/a/pages/Pg000002/move', body: { index: 0 } });
    await api.deletePage('a', 'Pg000002');
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/viewer/docs/a/pages/Pg000002', body: undefined });
    await expect(api.deletePage('a', 'Pg000001')).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  });

  it('applyOps: POST /viewer/docs/:slug/ops tanpa sesi, description opsional, invalidasi slug; gagal → ApiError', async () => {
    const result = { slug: 'a', rev: 4, created: [], inverse: [{ op: 'update', id: 'Nnnnnnn1', patch: { gap: 8 } }], refs: {} };
    const calls = fakeFetch((c) => {
      if (c.body?.ops?.[0]?.op === 'remove') return { status: 404, body: { ok: false, error: { code: 'NOT_FOUND', message: 'ops[0] remove: node Zzzzzzzz tidak ada', hint: 'muat ulang' } } };
      return ok(result);
    });
    const api = await freshApi();
    const changed = vi.fn();
    api.onDocsChanged(changed);
    await expect(api.applyOps('a', [{ op: 'update', id: 'Nnnnnnn1', patch: { gap: 12 } }])).resolves.toEqual(result);
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/viewer/docs/a/ops', body: { ops: [{ op: 'update', id: 'Nnnnnnn1', patch: { gap: 12 } }] }, session: undefined });
    expect(calls.at(-1)!.body).not.toHaveProperty('description');
    expect(changed).toHaveBeenCalledOnce();
    await api.applyOps('a', result.inverse as never, 'Undo');
    expect(calls.at(-1)).toMatchObject({ body: { ops: result.inverse, description: 'Undo' } });
    await expect(api.applyOps('a', [{ op: 'remove', id: 'Zzzzzzzz' }])).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('paste: POST /viewer/docs/:slug/paste tanpa sesi, body apa adanya, invalidasi slug; gagal → ApiError', async () => {
    const result = { slug: 'a', rev: 5, created: [], inverse: [{ op: 'remove', id: 'Pppppppp' }], refs: { paste: 'Pppppppp' }, nodeId: 'Pppppppp', report: { kind: 'svg', paths: 1, kept: [], dropped: [] } };
    const calls = fakeFetch((c) =>
      c.body?.parentId === 'Zzzzzzzz' ? { status: 404, body: { ok: false, error: { code: 'NOT_FOUND', message: 'paste: node Zzzzzzzz tidak ada', hint: '' } } } : ok(result),
    );
    const api = await freshApi();
    const changed = vi.fn();
    api.onDocsChanged(changed);
    await expect(api.paste('a', { content: '<svg/>', parentId: 'Bbbbbbbb', name: 'Logo' })).resolves.toEqual(result);
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/viewer/docs/a/paste', body: { content: '<svg/>', parentId: 'Bbbbbbbb', name: 'Logo' }, session: undefined });
    expect(changed).toHaveBeenCalledOnce();
    await expect(api.paste('a', { content: '<svg/>', parentId: 'Zzzzzzzz' })).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('importUrl: POST /viewer/docs/:slug/import-url tanpa sesi, body apa adanya, invalidasi slug; gagal → ApiError', async () => {
    const result = { slug: 'a', rev: 6, created: [], inverse: [{ op: 'remove', id: 'Iiiiiiii' }], refs: { import: 'Iiiiiiii', paste: 'Pppppppp' }, nodeId: 'Pppppppp', boardId: 'Iiiiiiii', report: { kind: 'html', layers: 2, scripts: 0, dropped: [] }, page: { url: 'https://example.com/', finalUrl: 'https://example.com/', title: 'Cool Site' } };
    const calls = fakeFetch((c) =>
      c.body?.url === 'http://127.0.0.1/' ? { status: 400, body: { ok: false, error: { code: 'SCHEMA_INVALID', message: 'alamat non-publik ditolak', hint: '' } } } : ok(result),
    );
    const api = await freshApi();
    const changed = vi.fn();
    api.onDocsChanged(changed);
    await expect(api.importUrl('a', { url: 'https://example.com/', width: 768, screen: 'app' })).resolves.toEqual(result);
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/viewer/docs/a/import-url', body: { url: 'https://example.com/', width: 768, screen: 'app' }, session: undefined });
    expect(changed).toHaveBeenCalledOnce();
    await expect(api.importUrl('a', { url: 'http://127.0.0.1/' })).rejects.toMatchObject({ code: 'SCHEMA_INVALID', status: 400 });
  });

  it('putSelection: PUT /viewer/docs/:slug/selection tanpa sesi, tanpa invalidasi; gagal → ApiError', async () => {
    const calls = fakeFetch((c) => (c.path === '/viewer/docs/hilang/selection' ? { status: 404, body: { ok: false, error: { code: 'NOT_FOUND', message: 'dokumen hilang tidak ada', hint: '' } } } : ok({ slug: 'a', rev: 2, addresses: c.body.addresses })));
    const api = await freshApi();
    const changed = vi.fn();
    api.onDocsChanged(changed);
    await expect(api.putSelection('a', ['Nnnnnnn1'])).resolves.toEqual({ slug: 'a', rev: 2, addresses: ['Nnnnnnn1'] });
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', path: '/viewer/docs/a/selection', body: { addresses: ['Nnnnnnn1'] }, session: undefined });
    expect(changed).not.toHaveBeenCalled();
    await expect(api.putSelection('hilang', [])).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('restore dengan baseRev usang → ApiError CONFLICT 409 dengan hint', async () => {
    fakeFetch((c) => {
      if (c.path === '/viewer/docs/a/restore') return { status: 409, body: { ok: false, error: { code: 'CONFLICT', message: 'dokumen a sudah berubah ke r9', hint: 'ada perubahan yang lebih baru', retryable: false } } };
      throw new Error(`tak terduga ${c.path}`);
    });
    const api = await freshApi();
    await expect(api.restore('a', 3, 8)).rejects.toMatchObject({ code: 'CONFLICT', status: 409, hint: 'ada perubahan yang lebih baru' });
  });
});

describe('exportPng (aplikasi 2)', () => {
  it('PNG → blob + nama dari content-disposition; error AD-11 → ApiError; nama aneh → cadangan', async () => {
    const mod = await (async () => {
      vi.resetModules();
      return import('./api.ts');
    })();
    const seen: { path: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (path: string, init: { body: string }) => {
      seen.push({ path, body: JSON.parse(init.body) });
      if (JSON.parse(init.body).boardId === 'nope') {
        return new Response(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'board nope tidak ada', hint: 'pilih board lain' } }), { status: 404 });
      }
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-disposition': 'attachment; filename="my-landing-desktop@2x.png"' },
      });
    });
    const r = await mod.api.exportPng('my-landing', 'Bbbbbbb1', 2);
    expect(r.filename).toBe('my-landing-desktop@2x.png');
    expect(r.blob.size).toBe(4);
    expect(seen[0]).toEqual({ path: '/viewer/docs/my-landing/export', body: { boardId: 'Bbbbbbb1', scale: 2 } });
    await expect(mod.api.exportPng('my-landing', 'nope', 1)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(mod.exportFileName('attachment; filename="../x.png"', 'f.png')).toBe('f.png');
    expect(mod.exportFileName(null, 'f.png')).toBe('f.png');
  });

  it('nodeId (Copy as PNG) ikut di body; tanpa nodeId body persis seperti lama', async () => {
    const mod = await (async () => {
      vi.resetModules();
      return import('./api.ts');
    })();
    const seen: unknown[] = [];
    vi.stubGlobal('fetch', async (_path: string, init: { body: string }) => {
      seen.push(JSON.parse(init.body));
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } });
    });
    await mod.api.exportPng('my-landing', 'Bbbbbbb1', 2, 'Card0001');
    await mod.api.exportPng('my-landing', 'Bbbbbbb1', 2);
    expect(seen).toEqual([{ boardId: 'Bbbbbbb1', scale: 2, nodeId: 'Card0001' }, { boardId: 'Bbbbbbb1', scale: 2 }]);
  });
});

describe('layer manual (aplikasi 4)', () => {
  it('execute: /docs/open lalu POST /execute {code, description} dengan sesi viewer; gagal → ApiError berisi hint', async () => {
    let fail = false;
    const calls = fakeFetch((c) => {
      if (c.path === '/viewer/docs') return docs(['a']);
      if (c.path === '/viewer/docs/a') return doc('a');
      if (c.path === '/sessions') return ok({ sessionId: 's1' });
      if (c.path === '/docs/open') return ok({ docId: 'Dddddddd', slug: 'a', rev: 1, created: false });
      if (c.path === '/execute') {
        if (fail) return { status: 422, body: { ok: false, error: { code: 'RENDER_FAILED', message: 'render gagal', hint: 'periksa font', retryable: false } } };
        return ok({ docId: 'Dddddddd', rev: 2, created: [{ id: 'Nnnnnnn1', name: 'Rectangle' }], check: { boards: ['Bbbbbbb1'] } });
      }
      throw new Error(`tak terduga ${c.path}`);
    });
    const api = await freshApi();
    const r = await api.execute('a', 'add("B", {})', 'Insert rectangle into Desktop board');
    expect(r).toMatchObject({ rev: 2, created: [{ id: 'Nnnnnnn1' }] });
    const ex = calls.find((c) => c.path === '/execute')!;
    expect(ex).toMatchObject({ method: 'POST', session: 's1', body: { code: 'add("B", {})', description: 'Insert rectangle into Desktop board' } });
    expect(calls.findIndex((c) => c.path === '/docs/open')).toBeLessThan(calls.indexOf(ex));
    fail = true;
    await expect(api.execute('a', 'x', 'Insert rectangle into Desktop board')).rejects.toMatchObject({ code: 'RENDER_FAILED', hint: 'periksa font', status: 422 });
  });

  it('uploadAsset: byte mentah + content-type file; 413 → ApiError; iconSearch memakai sesi', async () => {
    const seen: { path: string; type: string | undefined; body: unknown }[] = [];
    let big = false;
    vi.stubGlobal('fetch', async (path: string, init: { method: string; headers: Record<string, string>; body?: unknown }) => {
      seen.push({ path, type: init.headers['content-type'], body: init.body });
      if (path === '/sessions') return new Response(JSON.stringify({ ok: true, data: { sessionId: 's1' } }));
      if (path === '/icons/search') return new Response(JSON.stringify({ ok: true, data: { query: 'star', results: [{ lib: 'lucide', icon: 'star' }] } }));
      if (big) return new Response(JSON.stringify({ ok: false, error: { code: 'SCHEMA_INVALID', message: 'gambar melebihi 20 MB', hint: 'perkecil', retryable: false } }), { status: 413 });
      return new Response(JSON.stringify({ ok: true, data: { assetId: 'f'.repeat(64), mime: 'image/png', width: 1200, height: 800 } }));
    });
    const api = await freshApi();
    const file = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    expect(await api.uploadAsset(file)).toMatchObject({ width: 1200, height: 800 });
    expect(seen[0]).toMatchObject({ path: '/viewer/assets', type: 'image/png', body: file });
    big = true;
    await expect(api.uploadAsset(file)).rejects.toMatchObject({ status: 413, code: 'SCHEMA_INVALID' });
    expect(await api.iconSearch('star')).toEqual([{ lib: 'lucide', icon: 'star' }]);
  });
});

describe('renderDeps (canvas live)', () => {
  it('GET /viewer/render-deps dengan font/icon berulang ter-encode; tanpa kunci tanpa query', async () => {
    const data = { fonts: [], icons: [], missing: { fonts: [], icons: [] } };
    const calls = fakeFetch(() => ok(data));
    const api = await freshApi();
    expect(await api.renderDeps({ fonts: ['Space Grotesk:700:normal', 'Inter:400:normal'], icons: ['lucide/star'] })).toEqual(data);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/viewer/render-deps?font=Space+Grotesk%3A700%3Anormal&font=Inter%3A400%3Anormal&icon=lucide%2Fstar' });
    await api.renderDeps({ fonts: [], icons: [] });
    expect(calls[1]!.path).toBe('/viewer/render-deps');
  });
});
