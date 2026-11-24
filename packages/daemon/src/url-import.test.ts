// Route impor URL (epic adopsi open-pencil story 8): `POST /viewer/docs/:slug/import-url` (viewer, guard Origin)
// dan `POST /viewer/import-url` (sesi, tool MCP `import_url`). Board baru berisi hasil pipeline HTML paste; satu
// rev + satu entri riwayat; validasi URL anti-SSRF di route (fetch asli, tanpa `page`); error jaringan terpetakan;
// undo lewat `inverse`. Fetch halaman disuntik lewat `pageFetch` (BuildOptions) untuk tes jalan sukses.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SESSION_HEADER, type LakarDocument } from '@lakar/schema';
import { buildServer, loadConfig, TOOL_ROUTES } from './index.js';
import { NetError } from './photos/net.js';
import type { HtmlSnapshot } from './paste/html-page.js';
import type { FetchedPage } from './url-fetch.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const fakeRender = {
  screenshot: async () => new Uint8Array(),
  measure: async () => ({ width: 1, height: 1, nodes: [], texts: [] }),
} as never;

const style = (s: Record<string, string>) => ({ display: 'block', 'background-color': 'rgba(0, 0, 0, 0)', 'background-image': 'none', 'box-shadow': 'none', color: 'rgb(0, 0, 0)', 'font-size': '16px', 'font-family': 'Inter', 'font-weight': '400', ...s });
const snapshot = (width: number): HtmlSnapshot => ({
  width,
  scripts: 1,
  requests: [],
  truncated: false,
  body: {
    k: 'el',
    tag: 'body',
    box: [0, 0, width, 60],
    style: style({}),
    spec: {},
    children: [{ k: 'el', tag: 'h1', box: [0, 10, 200, 40], style: style({}), spec: {}, children: [], text: { content: 'Hello', lines: 1, mixed: [] } }],
  },
});
const htmlRender = {
  ...(fakeRender as object),
  snapshotHtml: async (_html: string, o: { width: number }) => snapshot(o.width),
};

const PAGE: FetchedPage = { html: '<html><title>T</title><body><h1>Hello</h1></body></html>', finalUrl: 'https://example.com/', status: 200, contentType: 'text/html', title: 'Cool Site', bytes: 60 };
const pageFetch = (p: FetchedPage = PAGE) => (async () => p) as (raw: string) => Promise<FetchedPage>;

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-urlimport-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function setup(opts: { render?: unknown; pageFetch?: (raw: string) => Promise<FetchedPage> } = {}) {
  const dataDir = await mkdtemp(join(root, 'data-'));
  const daemon = buildServer({
    config: { ...baseConfig, port: 7466, dataDir },
    render: (opts.render ?? htmlRender) as never,
    ...(opts.pageFetch ? { pageFetch: opts.pageFetch } : {}),
  });
  const { app } = daemon;
  const docsDir = join(dataDir, 'docs');
  const post = (url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers });
  const doc = async (slug: string) => JSON.parse(await readFile(join(docsDir, `${slug}.lakar.json`), 'utf8')) as LakarDocument;
  const history = async (slug: string) =>
    (await readFile(join(docsDir, `${slug}.history.jsonl`), 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  const create = async (name: string) => {
    const r = await post('/viewer/docs', { name, board: { preset: 'mobile' } });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.slug as string;
  };
  return { ...daemon, post, doc, history, create };
}

const node = (d: LakarDocument, id: string): any => {
  const walk = (n: any): any => (n.id === id ? n : (n.children ?? []).map(walk).find(Boolean));
  for (const p of d.pages) for (const b of p.children) {
    const hit = walk(b);
    if (hit) return hit;
  }
  return undefined;
};
const content = (d: LakarDocument) => ({ pages: d.pages, tokens: d.tokens ?? {}, tokenModes: d.tokenModes });

describe('POST /viewer/docs/:slug/import-url', () => {
  it('URL valid → board baru berisi layer hasil impor; satu rev + riwayat; undo lewat inverse', async () => {
    const seen: string[] = [];
    const t = await setup({ pageFetch: async (raw) => (seen.push(raw), { ...PAGE, finalUrl: raw }) });
    try {
      const slug = await t.create('Impor Satu');
      const before = await t.doc(slug);
      const firstBoard = before.pages[0]!.children[0]!;
      const r = await t.post(`/viewer/docs/${slug}/import-url`, { url: 'https://example.com/', width: 768 });
      expect(r.statusCode, r.body).toBe(200);
      const data = r.json().data;
      expect(seen).toEqual(['https://example.com/']);
      expect(data).toMatchObject({ slug, rev: before.rev + 1, nodeId: data.refs.paste, boardId: data.refs.import, page: { url: 'https://example.com/', finalUrl: 'https://example.com/', title: 'Cool Site' } });
      expect(data.report.kind).toBe('html');
      const after = await t.doc(slug);
      const board = node(after, data.boardId);
      // Board: preset lebar 768 (screen app), nama dari <title>, posisi kanan board pertama +80 (375+80=455), tinggi = tinggi konten impor.
      expect(board).toMatchObject({ type: 'board', name: 'Cool Site', x: (firstBoard.width as number) + 80, y: 0, width: 768, screen: 'app' });
      expect(board.height).toBeGreaterThan(0);
      expect(board.children).toHaveLength(1);
      expect(board.children[0].id).toBe(data.nodeId);
      expect((await t.history(slug)).at(-1)).toMatchObject({ rev: after.rev, description: 'Import page Cool Site', client: 'lakar-viewer' });
      // Undo lewat inverse mengembalikan dokumen (board dan isinya hilang).
      const undo = await t.post(`/viewer/docs/${slug}/ops`, { ops: data.inverse });
      expect(undo.statusCode, undo.body).toBe(200);
      expect(content(await t.doc(slug))).toEqual(content(before));
    } finally {
      await t.app.close();
    }
  });

  it('URL non-publik → 400 walau pageFetch diinjeksikan (checkPageUrl di route, bukan hanya di fetcher)', async () => {
    let called = 0;
    const t = await setup({ pageFetch: async (raw) => (called++, { ...PAGE, finalUrl: raw }) });
    try {
      const slug = await t.create('Impor Ditolak');
      for (const url of ['http://127.0.0.1/', 'file:///etc/passwd', 'http://user:pass@example.com/']) {
        const r = await t.post(`/viewer/docs/${slug}/import-url`, { url });
        expect(r.statusCode, `${url} → ${r.body}`).toBe(400);
        expect(r.json().error.code).toBe('SCHEMA_INVALID');
      }
      expect(called).toBe(0);
    } finally {
      await t.app.close();
    }
  });

  it('skema non-http(s), kredensial, dan IP non-publik → 400 SCHEMA_INVALID (fetch asli, tanpa jaringan)', async () => {
    // Tanpa pageFetch: `fetchPageHtml` asli menjalankan `checkPageUrl` sebelum transport apa pun.
    const t = await setup();
    try {
      const slug = await t.create('Impor Ditolak');
      const rev = (await t.doc(slug)).rev;
      for (const url of [
        'ftp://example.com/x',
        'file:///etc/passwd',
        'javascript:alert(1)',
        'data:text/html,<p>x</p>',
        'http://127.0.0.1/',
        'http://127.0.0.1:7466/status',
        'http://10.0.0.5/',
        'http://172.16.0.1/',
        'http://192.168.1.1/',
        'http://169.254.169.254/latest/meta-data',
        'http://[::1]/',
        'http://[fe80::1]/',
        'http://[::ffff:127.0.0.1]/',
        'http://user:pass@example.com/',
        'bukan-url',
      ]) {
        const r = await t.post(`/viewer/docs/${slug}/import-url`, { url });
        expect(r.statusCode, `${url} → ${r.body}`).toBe(400);
        expect(r.json().error.code).toBe('SCHEMA_INVALID');
      }
      expect((await t.doc(slug)).rev).toBe(rev);
    } finally {
      await t.app.close();
    }
  });

  it('error jaringan terpetakan: timeout/network/HTTP 5xx retryable EXEC_ERROR; too-large/bukan-HTML SCHEMA_INVALID', async () => {
    const cases: [NetError, number, string, boolean][] = [
      [new NetError('timeout', 'batas waktu'), 422, 'EXEC_ERROR', true],
      [new NetError('network', 'koneksi gagal'), 422, 'EXEC_ERROR', true],
      [new NetError('http', 'HTTP 503', { status: 503 }), 422, 'EXEC_ERROR', true],
      [new NetError('http', 'HTTP 404', { status: 404 }), 400, 'SCHEMA_INVALID', false],
      [new NetError('too-large', 'melewati batas'), 400, 'SCHEMA_INVALID', false],
      [new NetError('bad-response', 'bukan HTML'), 400, 'SCHEMA_INVALID', false],
    ];
    let impl: NetError = cases[0]![0];
    const t = await setup({
      pageFetch: async () => {
        throw impl;
      },
    });
    try {
      const slug = await t.create('Impor Error');
      for (const [net, status, code, retryable] of cases) {
        impl = net;
        const r = await t.post(`/viewer/docs/${slug}/import-url`, { url: 'https://example.com/' });
        expect(r.statusCode, `${net.kind} → ${r.body}`).toBe(status);
        expect(r.json().error).toMatchObject({ code, retryable });
      }
    } finally {
      await t.app.close();
    }
  });

  it('body/halaman/dokumen salah → error jelas; tanpa snapshotter → RENDER_FAILED', async () => {
    const t = await setup({ pageFetch: pageFetch() });
    try {
      const slug = await t.create('Impor Body');
      for (const [body, status, code] of [
        [{}, 400, 'SCHEMA_INVALID'],
        [{ url: '' }, 400, 'SCHEMA_INVALID'],
        [{ url: 'x'.repeat(2100) }, 400, 'SCHEMA_INVALID'],
        [{ url: 'https://example.com/', width: 0 }, 400, 'SCHEMA_INVALID'],
        [{ url: 'https://example.com/', screen: 'watch' }, 400, 'SCHEMA_INVALID'],
        [{ url: 'https://example.com/', extra: 1 }, 400, 'SCHEMA_INVALID'],
        [{ url: 'https://example.com/', pageId: 'Page9999' }, 404, 'NOT_FOUND'],
      ] as const) {
        const r = await t.post(`/viewer/docs/${slug}/import-url`, body);
        expect(r.statusCode, `${JSON.stringify(body)} → ${r.body}`).toBe(status);
        expect(r.json().error.code).toBe(code);
      }
      expect((await t.post('/viewer/docs/Bad_Slug/import-url', { url: 'https://example.com/' })).statusCode).toBe(400);
      expect((await t.post('/viewer/docs/tidak-ada/import-url', { url: 'https://example.com/' })).statusCode).toBe(404);
      // Origin asing ditolak guard /viewer/*.
      expect((await t.post(`/viewer/docs/${slug}/import-url`, { url: 'https://example.com/' }, { origin: 'https://evil.example' })).statusCode).toBe(403);
    } finally {
      await t.app.close();
    }
    const noRender = await setup({ render: fakeRender, pageFetch: pageFetch() });
    try {
      const slug = await noRender.create('Impor NoRender');
      const r = await noRender.post(`/viewer/docs/${slug}/import-url`, { url: 'https://example.com/' });
      expect(r.statusCode, r.body).toBe(503);
      expect(r.json().error.code).toBe('RENDER_FAILED');
    } finally {
      await noRender.app.close();
    }
  });
});

describe('POST /viewer/import-url (tool MCP import_url)', () => {
  it('TOOL_ROUTES memetakan route; sesi tanpa dokumen → NO_ACTIVE_DOC; sukses → board+layer, riwayat sesi, Activity import_url', async () => {
    expect(TOOL_ROUTES['/viewer/import-url']).toBe('import_url');
    const calls: string[] = [];
    const t = await setup({
      pageFetch: async (raw) => (calls.push(raw), { ...PAGE, finalUrl: raw }),
    });
    try {
      const slug = await t.create('Impor Agen');
      const s = await t.post('/sessions', { client: 'claude-code' });
      const session = s.json().data.sessionId as string;
      const h = { [SESSION_HEADER]: session };
      const none = await t.post('/viewer/import-url', { url: 'https://example.com/' }, h);
      expect(none.statusCode).toBe(409);
      expect(none.json().error.code).toBe('NO_ACTIVE_DOC');
      expect((await t.post('/docs/open', { slug }, h)).statusCode).toBe(200);
      const r = await t.post('/viewer/import-url', { url: 'https://example.com/x?q=1', screen: 'landing' }, h);
      expect(r.statusCode, r.body).toBe(200);
      const data = r.json().data;
      const after = await t.doc(slug);
      const board = node(after, data.boardId);
      expect(board).toMatchObject({ type: 'board', screen: 'landing' });
      expect(data).toMatchObject({ slug, nodeId: board.children[0].id, report: { kind: 'html' } });
      expect(data.target.boardIds).toContain(data.boardId);
      expect(calls).toEqual(['https://example.com/x?q=1']);
      expect((await t.history(slug)).find((e: any) => e.rev === data.rev)).toMatchObject({ client: 'claude-code' });
      const done = t.activity.recent().filter((e) => e.type === 'call' && e.call.tool === 'import_url' && e.call.status === 'done');
      expect(done.at(-1)).toMatchObject({ call: { tool: 'import_url', slug, rev: data.rev, target: 'example.com/x' } });
    } finally {
      await t.app.close();
    }
  });
});
