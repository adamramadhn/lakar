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
    await expect(api.createFile('My Landing', { preset: 'custom', width: 10, height: 20 })).resolves.toEqual({ slug: 'my-landing', rev: 1 });
    await api.renameFile('a', 'B');
    await api.duplicateFile('a');
    await api.archiveFile('a');
    await api.unarchiveFile('a');
    await api.deleteFile('a', true);
    expect((await api.listArchive()).map((d) => d.slug)).toEqual(['z']);
    expect(changed).toHaveBeenCalledTimes(6);
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
    await expect(api.renameFile('a', 'b')).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(changed).not.toHaveBeenCalled();
  });
});
