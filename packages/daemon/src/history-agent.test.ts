// Harness agen di entri riwayat (spec-agent-identity-history): execute dan paste sesi ber-header `x-lakar-agent`
// mencatat `agent` di `*.history.jsonl`; GET /viewer/docs → `lastAgent`, GET …/history → `agent`, juga sesudah
// restart. Entri lama tanpa `agent` (dan klien tanpa header) tetap berbentuk lama (AD-4).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer, loadConfig } from './index.js';
import { authorOf } from './sessions.js';
import { historyAgent, historyMeta } from './viewer.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const fakeRender = {
  screenshot: async () => new Uint8Array(PNG_1x1),
  measure: async (doc: any, boardId: string) => {
    const b = doc.pages.flatMap((p: any) => p.children).find((x: any) => x.id === boardId);
    return { width: b.width, height: b.height, nodes: [], texts: [] };
  },
} as never;

type Summary = { slug: string; lastClient?: string; lastAgent?: string };

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-history-agent-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function server(dataDir: string) {
  const { app } = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: fakeRender });
  const post = (url: string, payload: unknown, headers: Record<string, string> = {}) => app.inject({ method: 'POST', url, payload: payload as object, headers });
  const summary = async (slug: string) => ((await app.inject({ method: 'GET', url: '/viewer/docs' })).json().data.docs as Summary[]).find((d) => d.slug === slug);
  const history = async (slug: string) => (await app.inject({ method: 'GET', url: `/viewer/docs/${slug}/history` })).json().data.entries as Record<string, unknown>[];
  const session = async (slug: string, agent?: string) => {
    const s = (await post('/sessions', { client: 'lakar-mcp' }, agent ? { 'x-lakar-agent': agent } : {})).json().data.sessionId as string;
    expect((await post('/docs/open', { slug }, { 'x-lakar-session': s })).statusCode).toBe(200);
    return s;
  };
  let n = 0;
  const execute = async (s: string) => {
    n++;
    const r = await post('/execute', { code: `add(null,{type:'board',name:'Extra ${n}',x:${n * 500},y:0,width:390,height:844,screen:'mobile'})`, description: `tambah board ekstra nomor ${n}` }, { 'x-lakar-session': s });
    expect(r.statusCode, r.body).toBe(200);
  };
  return { app, post, summary, history, session, execute };
}

describe('agent di entri riwayat', () => {
  it('execute ber-agent → entri jsonl + lastAgent + entri history; klien tanpa header → bentuk lama; tahan restart', async () => {
    const dataDir = await mkdtemp(join(root, 'data-'));
    const t = server(dataDir);
    try {
      expect((await t.post('/viewer/docs', { name: 'Doc', board: { preset: 'mobile' } })).statusCode).toBe(200);
      const claude = await t.session('doc', 'claude-code');
      await t.execute(claude);
      expect(await t.summary('doc')).toMatchObject({ lastClient: 'lakar-mcp', lastAgent: 'claude-code' });

      const old = await t.session('doc');
      await t.execute(old);
      const d = await t.summary('doc');
      expect(d).toMatchObject({ lastClient: 'lakar-mcp' });
      expect(d).not.toHaveProperty('lastAgent');

      const lines = (await readFile(join(dataDir, 'docs', 'doc.history.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
      expect(lines[0]).not.toHaveProperty('agent');
      expect(lines.at(-2)).toMatchObject({ rev: 2, client: 'lakar-mcp', agent: 'claude-code' });
      expect(lines.at(-1)).toMatchObject({ rev: 3, client: 'lakar-mcp' });
      expect(lines.at(-1)).not.toHaveProperty('agent');
    } finally {
      await t.app.close();
    }
    // Restart: sesi hilang, agent tetap terbaca dari riwayat.
    const again = server(dataDir);
    try {
      const entries = await again.history('doc');
      expect(entries.map((e) => [e.rev, e.client, e.agent])).toEqual([
        [3, 'lakar-mcp', undefined],
        [2, 'lakar-mcp', 'claude-code'],
        [1, 'lakar-viewer', undefined],
      ]);
      expect(entries[0]).not.toHaveProperty('agent');
    } finally {
      await again.app.close();
    }
  });

  it('paste SVG sesi agen mencatat agent', async () => {
    const dataDir = await mkdtemp(join(root, 'data-'));
    const t = server(dataDir);
    try {
      await t.post('/viewer/docs', { name: 'Paste', board: { preset: 'mobile' } });
      const s = await t.session('paste', 'codex-mcp-client');
      const board = (await t.app.inject({ method: 'GET', url: '/viewer/docs/paste' })).json().data.doc.pages[0].children[0].id as string;
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#f00"/></svg>';
      const r = await t.post('/viewer/paste', { content: svg, parentId: board }, { 'x-lakar-session': s });
      expect(r.statusCode, r.body).toBe(200);
      expect((await t.history('paste'))[0]).toMatchObject({ rev: 2, client: 'lakar-mcp', agent: 'codex-mcp-client' });
    } finally {
      await t.app.close();
    }
  });
});

describe('historyAgent / historyMeta / authorOf', () => {
  const at = '2026-11-23T00:00:00.000Z';
  it('entri lama tanpa agent → tanpa lastAgent; agent rusak dari disk diabaikan; entri aplikasi tanpa agent', () => {
    expect(historyMeta([{ rev: 1, sessionId: 'gone', description: 'x', opsSummary: '', at, client: 'lakar-mcp' }])).toEqual({ createdAt: at, lastClient: 'lakar-mcp' });
    expect(historyMeta([{ rev: 1, sessionId: 'gone', description: 'x', opsSummary: '', at, client: 'lakar-mcp', agent: 'claude-code' }])).toEqual({
      createdAt: at,
      lastClient: 'lakar-mcp',
      lastAgent: 'claude-code',
    });
    expect(historyAgent({ sessionId: 'gone', agent: 42 as never })).toBeUndefined();
    expect(historyAgent({ sessionId: 'gone', agent: ' spaced ' })).toBeUndefined();
    expect(historyAgent({ sessionId: 'gone', agent: 'x'.repeat(65) })).toBeUndefined();
    expect(historyAgent({ sessionId: 'lakar-viewer', agent: 'claude-code' })).toBeUndefined();
  });
  it('authorOf: hanya field yang ada', () => {
    expect(authorOf({})).toEqual({});
    expect(authorOf({ client: 'lakar-mcp' })).toEqual({ client: 'lakar-mcp' });
    expect(authorOf({ client: 'lakar-mcp', agent: 'claude-code' })).toEqual({ client: 'lakar-mcp', agent: 'claude-code' });
  });
});
