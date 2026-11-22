// Sinkron antar jendela (event `change`, hub stream bersama, tab) dan batas memori cache klien viewer.
// EventSource dan fetch palsu, tanpa lakard.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActivityHub,
  activityReducer,
  connectActivity,
  editChange,
  goneReason,
  initialActivity,
  remoteDocCall,
  remoteEffect,
  slugAppeared,
  type ActivityEvent,
  type ChangeEvent,
  type DocChange,
  type EventSourceLike,
  type StreamHandlers,
} from './activity.ts';
import { applyFileEvent, onRequestCloseTab, requestCloseTab } from './tabs.ts';

const ME = 'win-me';
let seq = 0;
const change = (c: DocChange): ChangeEvent => ({ seq: ++seq, type: 'change', change: c });
const call = (c: Partial<Extract<ActivityEvent, { type: 'call' }>['call']>): ActivityEvent => ({
  seq: ++seq,
  type: 'call',
  call: { callId: 'c1', session: 'lakar-vi', client: 'lakar-viewer', tool: 'restore', slug: 'a', status: 'done', startedAt: '2026-11-22T00:00:00.000Z', ...c },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('remoteEffect', () => {
  it('gema jendela sendiri (origin sama) → undefined; tanpa origin dianggap jendela lain', () => {
    expect(remoteEffect({ kind: 'create', slug: 'a', origin: ME }, ME)).toBeUndefined();
    expect(remoteEffect({ kind: 'create', slug: 'a' }, ME)).toEqual({ invalidate: ['a'] });
  });
  it('rename → cache dua slug dibuang + event tab rename remote', () => {
    expect(remoteEffect({ kind: 'rename', slug: 'b', from: 'a', origin: 'w2' }, ME)).toEqual({
      invalidate: ['a', 'b'],
      fileEvent: { type: 'rename', from: 'a', to: 'b', remote: true },
    });
  });
  it('archive/delete → event tab remote; delete salinan arsip tidak membuang cache', () => {
    expect(remoteEffect({ kind: 'archive', slug: 'a' }, ME)).toEqual({ invalidate: ['a'], fileEvent: { type: 'archive', slug: 'a', remote: true } });
    expect(remoteEffect({ kind: 'delete', slug: 'a', archived: false }, ME)).toEqual({ invalidate: ['a'], fileEvent: { type: 'delete', slug: 'a', archived: false, remote: true } });
    expect(remoteEffect({ kind: 'delete', slug: 'a', archived: true }, ME)).toEqual({ invalidate: [], fileEvent: { type: 'delete', slug: 'a', archived: true, remote: true } });
  });
  it('duplicate/unarchive/folders/edit → hanya muat ulang daftar (cache slug baru dibuang)', () => {
    expect(remoteEffect({ kind: 'duplicate', slug: 'a-copy', from: 'a' }, ME)).toEqual({ invalidate: ['a-copy'] });
    expect(remoteEffect({ kind: 'unarchive', slug: 'a' }, ME)).toEqual({ invalidate: ['a'] });
    expect(remoteEffect({ kind: 'folders' }, ME)).toEqual({ invalidate: [] });
    expect(remoteEffect({ kind: 'edit', slug: 'a', rev: 3 }, ME)).toEqual({ invalidate: [] });
  });
});

describe('reaksi Viewer atas change', () => {
  it('editChange: edit jendela lain pada slug terbuka dengan rev lebih baru → rev + board; gema/slug lain/rev lama → undefined', () => {
    expect(editChange(change({ kind: 'edit', slug: 'a', rev: 5, boards: ['B1'], origin: 'w2' }), 'a', 4, ME)).toEqual({ rev: 5, boards: ['B1'] });
    expect(editChange(change({ kind: 'edit', slug: 'a', rev: 5 }), 'a', 4, ME)).toEqual({ rev: 5, boards: [] });
    expect(editChange(change({ kind: 'edit', slug: 'a', rev: 5, origin: ME }), 'a', 4, ME)).toBeUndefined();
    expect(editChange(change({ kind: 'edit', slug: 'b', rev: 5 }), 'a', 4, ME)).toBeUndefined();
    expect(editChange(change({ kind: 'edit', slug: 'a', rev: 4 }), 'a', 4, ME)).toBeUndefined();
    expect(editChange(call({ rev: 9 }), 'a', 4, ME)).toBeUndefined();
  });
  it('goneReason: archive/delete dokumen terbuka dari jendela lain; gema, salinan arsip, slug lain → undefined', () => {
    expect(goneReason(change({ kind: 'archive', slug: 'a', origin: 'w2' }), 'a', ME)).toBe('archived');
    expect(goneReason(change({ kind: 'delete', slug: 'a', archived: false }), 'a', ME)).toBe('deleted');
    expect(goneReason(change({ kind: 'delete', slug: 'a', archived: true }), 'a', ME)).toBeUndefined();
    expect(goneReason(change({ kind: 'archive', slug: 'a', origin: ME }), 'a', ME)).toBeUndefined();
    expect(goneReason(change({ kind: 'archive', slug: 'b' }), 'a', ME)).toBeUndefined();
    expect(goneReason(change({ kind: 'rename', slug: 'b', from: 'a' }), 'a', ME)).toBeUndefined();
  });
  it('slugAppeared: dibuat, dipulihkan, duplikat, atau hasil rename ke slug ini', () => {
    for (const kind of ['create', 'unarchive', 'duplicate', 'rename'] as const) expect(slugAppeared(change({ kind, slug: 'a' }), 'a')).toBe(true);
    expect(slugAppeared(change({ kind: 'archive', slug: 'a' }), 'a')).toBe(false);
    expect(slugAppeared(change({ kind: 'create', slug: 'b' }), 'a')).toBe(false);
  });
  it('remoteDocCall: restore/pages selesai dari jendela lain → daftar dimuat ulang; gema, running, agen → tidak', () => {
    expect(remoteDocCall(call({ origin: 'w2' }), ME)).toBe(true);
    expect(remoteDocCall(call({ tool: 'pages' }), ME)).toBe(true);
    expect(remoteDocCall(call({ origin: ME }), ME)).toBe(false);
    expect(remoteDocCall(call({ status: 'running' }), ME)).toBe(false);
    expect(remoteDocCall(call({ client: 'claude-code', tool: 'execute' }), ME)).toBe(false);
    expect(remoteDocCall(change({ kind: 'folders' }), ME)).toBe(false);
  });
  it('reducer: event change tidak masuk state Activity, seq tetap maju', () => {
    const s = activityReducer(initialActivity, { type: 'event', event: { seq: 7, type: 'change', change: { kind: 'folders' } } });
    expect(s).toEqual({ ...initialActivity, seq: 7 });
  });
});

/** EventSource palsu; `instances` mencatat setiap koneksi. */
function fakeEventSource() {
  const instances: FakeES[] = [];
  class FakeES implements EventSourceLike {
    onopen: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    closed = false;
    readonly listeners = new Map<string, ((ev: { data: string }) => void)[]>();
    constructor(readonly url: string) {
      instances.push(this);
    }
    addEventListener(type: string, l: (ev: { data: string }) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), l]);
    }
    close() {
      this.closed = true;
    }
    emit(type: string, data: unknown) {
      for (const l of this.listeners.get(type) ?? []) l({ data: JSON.stringify(data) });
    }
  }
  return { FakeES, instances };
}

describe('stream: event change', () => {
  it('connectActivity meneruskan frame `change`', () => {
    const { FakeES, instances } = fakeEventSource();
    const got: unknown[] = [];
    const stop = connectActivity({ onHello: () => {}, onEvent: (e) => got.push(e), onConnection: () => {} }, { EventSource: FakeES });
    instances[0]!.emit('change', { seq: 3, type: 'change', change: { kind: 'archive', slug: 'a' } });
    expect(got).toEqual([{ seq: 3, type: 'change', change: { kind: 'archive', slug: 'a' } }]);
    stop();
  });
});

describe('ActivityHub', () => {
  it('satu koneksi untuk semua pelanggan; pelanggan baru langsung melihat state; tutup saat pelanggan terakhir pergi', () => {
    const { FakeES, instances } = fakeEventSource();
    const hub = new ActivityHub((h: StreamHandlers) => connectActivity(h, { EventSource: FakeES }));
    const appEvents: string[] = [];
    const offApp = hub.listen({ onEvent: (e) => appEvents.push(e.type), onReconnect: () => appEvents.push('reconnect') });
    expect(instances).toHaveLength(1);
    instances[0]!.emit('hello', { sessions: [{ id: 'sess0001', client: 'claude-code', createdAt: '2026-11-22T00:00:00.000Z', executes: 0 }], recent: [] });
    instances[0]!.emit('call', { seq: 1, type: 'call', call: { callId: 'x', session: 'sess0001', client: 'claude-code', tool: 'execute', slug: 'a', status: 'running', startedAt: '2026-11-22T00:00:00.000Z' } });
    instances[0]!.emit('change', { seq: 2, type: 'change', change: { kind: 'folders' } });
    // Viewer dipasang belakangan: tanpa koneksi baru, state sudah berisi sesi + call.
    const notify = vi.fn();
    const offState = hub.subscribeState(notify);
    const viewerEvents: string[] = [];
    const offViewer = hub.listen({ onEvent: (e) => viewerEvents.push(e.type) });
    expect(instances).toHaveLength(1);
    expect(hub.getState().connected).toBe(true);
    expect(Object.keys(hub.getState().sessions)).toEqual(['sess0001']);
    expect(hub.getState().calls.map((c) => c.callId)).toEqual(['x']);
    expect(hub.getState().seq).toBe(2);
    instances[0]!.emit('change', { seq: 3, type: 'change', change: { kind: 'edit', slug: 'a', rev: 2 } });
    expect(appEvents).toEqual(['call', 'change', 'change']);
    expect(viewerEvents).toEqual(['change']);
    expect(notify).toHaveBeenCalled();
    offViewer();
    offState();
    expect(instances[0]!.closed).toBe(false);
    offApp();
    expect(instances[0]!.closed).toBe(true);
    expect(hub.getState()).toBe(initialActivity);
  });
});

describe('tab: archive/delete dari jendela lain', () => {
  it('tab aktif dibiarkan (Viewer menampilkan pesan); tab lain ditutup; rename remote tetap mengikuti', () => {
    expect(applyFileEvent(['a', 'b'], 'a', { type: 'archive', slug: 'a', remote: true })).toEqual({ tabs: ['a', 'b'], navigate: false, next: 'a', view: { type: 'none' } });
    expect(applyFileEvent(['a', 'b'], 'a', { type: 'delete', slug: 'a', archived: false, remote: true })).toEqual({ tabs: ['a', 'b'], navigate: false, next: 'a', view: { type: 'none' } });
    expect(applyFileEvent(['a', 'b'], 'a', { type: 'archive', slug: 'b', remote: true })).toEqual({ tabs: ['a'], navigate: false, next: 'a', view: { type: 'drop', slug: 'b' } });
    expect(applyFileEvent(['a', 'b'], 'a', { type: 'rename', from: 'a', to: 'x', remote: true })).toEqual({ tabs: ['x', 'b'], navigate: true, next: 'x', view: { type: 'move', from: 'a', to: 'x' } });
  });
  it('requestCloseTab sampai ke pendengar; sesudah dilepas tidak lagi', () => {
    const got: string[] = [];
    const off = onRequestCloseTab((slug, hash) => got.push(`${slug} ${hash}`));
    requestCloseTab('a', '#/archive');
    off();
    requestCloseTab('b', '#/');
    expect(got).toEqual(['a #/archive']);
  });
});

// ---- Klien api: origin, applyRemote, batas cache + revoke blob URL ----

type Req = { method: string; path: string; headers: Record<string, string> };
const PNG = 'iVBORw0KGgo=';
const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } });

function stubFetch(handler: (r: Req, body: any) => Response): Req[] {
  const reqs: Req[] = [];
  vi.stubGlobal('fetch', async (path: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const r = { method: init.method, path, headers: init.headers };
    reqs.push(r);
    return handler(r, init.body ? JSON.parse(init.body) : undefined);
  });
  return reqs;
}

/** URL blob palsu yang bisa dilacak: createObjectURL → `blob:n`, revoke dicatat. */
function stubBlobUrls() {
  let n = 0;
  const revoked: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++n}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => void revoked.push(u));
  return revoked;
}

async function freshApi() {
  vi.resetModules();
  return import('./api.ts');
}

describe('api: sinkron antar jendela', () => {
  it('setiap permintaan membawa x-lakar-origin yang sama dengan api.origin', async () => {
    const reqs = stubFetch(() => ok({ docs: [] }));
    const { api } = await freshApi();
    await api.listDocs();
    await api.createFile('A', { preset: 'desktop' }).catch(() => {});
    expect(api.origin).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(reqs.map((r) => r.headers['x-lakar-origin'])).toEqual([api.origin, api.origin]);
  });

  it('applyRemote: cache slug dibuang, pendengar daftar dipanggil, event tab diteruskan dengan remote:true', async () => {
    stubBlobUrls();
    const reqs = stubFetch((r) => {
      if (r.path === '/viewer/docs') return ok({ docs: [{ slug: 'a', rev: 1, updatedAt: '', boardCount: 1, firstBoardId: 'A' }] });
      if (r.path === '/viewer/docs/a') return ok({ doc: { id: 'Dddddddd', rev: 1, pages: [] } });
      if (r.path === '/sessions') return ok({ sessionId: 's1' });
      if (r.path === '/docs/open') return ok({ docId: 'Dddddddd', slug: 'a', rev: 1, created: false });
      if (r.path === '/screenshot') return ok({ boardId: 'A', width: 1, height: 1, mimeType: 'image/png', png: PNG });
      throw new Error(`tak terduga ${r.path}`);
    });
    const { api } = await freshApi();
    const changed = vi.fn();
    const files = vi.fn();
    api.onDocsChanged(changed);
    api.onFileEvent(files);
    await api.screenshot('a', 1, 'A');
    await api.screenshot('a', 1, 'A');
    expect(reqs.filter((r) => r.path === '/screenshot')).toHaveLength(1);
    api.applyRemote({ invalidate: [], fileEvent: undefined });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(reqs.filter((r) => r.path === '/screenshot')).toHaveLength(1);
    api.applyRemote({ invalidate: ['a'], fileEvent: { type: 'archive', slug: 'a' } });
    expect(changed).toHaveBeenCalledTimes(2);
    expect(files).toHaveBeenCalledWith({ type: 'archive', slug: 'a', remote: true });
    await api.screenshot('a', 1, 'A');
    expect(reqs.filter((r) => r.path === '/screenshot')).toHaveLength(2);
    api.notifyDocsChanged();
    expect(changed).toHaveBeenCalledTimes(3);
  });
});

describe('api: batas memori cache', () => {
  it('screenshot rev baru untuk board yang sama → entri rev lama dibuang dan blob URL-nya di-revoke sesudah jeda', async () => {
    vi.useFakeTimers();
    const revoked = stubBlobUrls();
    let rev = 1;
    stubFetch((r) => {
      if (r.path === '/viewer/docs') return ok({ docs: [{ slug: 'a', rev, updatedAt: '', boardCount: 1, firstBoardId: 'A' }] });
      if (r.path === '/viewer/docs/a') return ok({ doc: { id: 'Dddddddd', rev, pages: [] } });
      if (r.path === '/sessions') return ok({ sessionId: 's1' });
      if (r.path === '/docs/open') return ok({ docId: 'Dddddddd', slug: 'a', rev, created: false });
      if (r.path === '/screenshot') return ok({ boardId: 'A', width: 1, height: 1, mimeType: 'image/png', png: PNG });
      throw new Error(`tak terduga ${r.path}`);
    });
    const { api, REVOKE_DELAY_MS } = await freshApi();
    const s1 = await api.screenshot('a', 1, 'A');
    for (rev = 2; rev <= 5; rev++) await api.screenshot('a', rev, 'A');
    expect(api.cacheSizes()).toMatchObject({ shots: 1, latest: 1 });
    expect(revoked).toEqual([]);
    await vi.advanceTimersByTimeAsync(REVOKE_DELAY_MS);
    expect(revoked).toEqual([s1.url, 'blob:2', 'blob:3', 'blob:4']);
  });

  it('#revShots dibatasi LRU (URL yang dibuang di-revoke); #revDocs dibatasi; entri yang baru dipakai bertahan', async () => {
    vi.useFakeTimers();
    const revoked = stubBlobUrls();
    stubFetch((r, body) => {
      const m = /^\/viewer\/docs\/a\/revs\/(\d+)(\/screenshot)?$/.exec(r.path);
      if (m && m[2]) return ok({ boardId: body.boardId, width: 1, height: 1, mimeType: 'image/png', png: PNG });
      if (m) return ok({ doc: { id: 'Dddddddd', rev: Number(m[1]), pages: [] } });
      throw new Error(`tak terduga ${r.path}`);
    });
    const { api, REV_SHOTS_MAX, REV_DOCS_MAX, REVOKE_DELAY_MS } = await freshApi();
    const first = await api.revScreenshot('a', 1, 'B');
    for (let rev = 2; rev <= REV_SHOTS_MAX; rev++) await api.revScreenshot('a', rev, 'B');
    // Rev 1 dipakai lagi → paling baru; entri tertua berikutnya (rev 2) yang dibuang.
    expect(await api.revScreenshot('a', 1, 'B')).toBe(first);
    const extra = await api.revScreenshot('a', REV_SHOTS_MAX + 1, 'B');
    expect(api.cacheSizes().revShots).toBe(REV_SHOTS_MAX);
    await vi.advanceTimersByTimeAsync(REVOKE_DELAY_MS);
    expect(revoked).toEqual(['blob:2']);
    expect(extra.url).toBe(`blob:${REV_SHOTS_MAX + 1}`);
    for (let rev = 1; rev <= REV_DOCS_MAX + 10; rev++) await api.getRevision('a', rev);
    expect(api.cacheSizes().revDocs).toBe(REV_DOCS_MAX);
  });

  it('applyRemote / tulis yang membuang slug me-revoke URL screenshot slug itu', async () => {
    vi.useFakeTimers();
    const revoked = stubBlobUrls();
    stubFetch((r, body) => {
      if (r.path === '/viewer/docs/a/revs/2/screenshot') return ok({ boardId: body.boardId, width: 1, height: 1, mimeType: 'image/png', png: PNG });
      throw new Error(`tak terduga ${r.path}`);
    });
    const { api, REVOKE_DELAY_MS } = await freshApi();
    const shot = await api.revScreenshot('a', 2, 'B');
    api.applyRemote({ invalidate: ['a'] });
    expect(api.cacheSizes().revShots).toBe(0);
    await vi.advanceTimersByTimeAsync(REVOKE_DELAY_MS);
    expect(revoked).toEqual([shot.url]);
  });
});
