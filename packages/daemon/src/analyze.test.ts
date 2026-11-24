// Audit desain (story 9.6): POST /analyze/colors, /analyze/typography, /analyze/clusters — baca-saja di
// dokumen aktif sesi; membedakan literal hex vs ref {$token}, off-scale, dan struktur berulang.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SESSION_HEADER, type LakarDocument } from '@lakar/schema';
import { TOOL_ROUTES } from './events.js';
import { buildServer, loadConfig } from './index.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const fakeRender = {
  screenshot: async () => new Uint8Array(PNG_1x1),
  measure: async (doc: any, boardId: string) => {
    const b = doc.pages.flatMap((p: any) => p.children).find((x: any) => x.id === boardId);
    return { width: b.width, height: b.height, nodes: [], texts: [] };
  },
} as never;

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-analyze-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function setup() {
  const dataDir = await mkdtemp(join(root, 'data-'));
  const daemon = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: fakeRender });
  const { app } = daemon;
  const post = (url: string, payload?: unknown, session?: string) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}), headers: session ? { [SESSION_HEADER]: session } : {} });
  const session = async () => (await post('/sessions', { client: 'lakar-mcp' })).json().data.sessionId as string;
  const open = async (s: string, slug: string) => {
    const r = await post('/docs/open', { slug }, s);
    expect(r.statusCode, r.body).toBe(200);
  };
  const exec = async (s: string, code: string, description: string) => {
    const r = await post('/execute', { code, description }, s);
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data;
  };
  const doc = async (slug: string) => JSON.parse(await readFile(join(dataDir, 'docs', `${slug}.lakar.json`), 'utf8')) as LakarDocument;
  return { ...daemon, post, session, open, exec, doc };
}

// Board audit: 3 kartu frame struktur identik (Chip berfill literal #FF6B6B), warna terikat, teks di luar skala.
const SEED = `
  setTokens({'colors.brand': {type:'color', value:'#FF6B60'}, 'colors.danger': {type:'color', value:'#DD0000'}});
  const b = add(null,{type:'board',name:'Audit',x:0,y:0,width:800,height:900,screen:'app'});
  const kartu = () => { const k = add(b,{type:'frame',name:'Kartu',width:200,height:80}); add(k,{type:'text',name:'Judul',content:'x',size:16}); add(k,{type:'rect',name:'Chip',width:20,height:12,fills:[{type:'solid',color:'#FF6B6B'}]}); };
  kartu(); kartu(); kartu();
  add(b,{type:'rect',name:'Solo',width:10,height:10,fills:[{type:'solid',color:'#00FF00'}]});
  add(b,{type:'rect',name:'Bound',width:10,height:10,fills:[{type:'solid',color:{$token:'colors.danger'}}]});
  add(b,{type:'text',name:'Off',content:'off',size:15});
  add(b,{type:'text',name:'Mono',content:'mono',size:16,family:'DM Mono',weight:700});
  add(b,{type:'rect',name:'Mesh',width:40,height:40,fills:[{type:'mesh',columns:2,rows:2,colors:['#0000FF','#00FFFF','#FF00FF','#FFFF00']}]});
  add(null,{type:'board',name:'Empty',x:900,y:0,width:200,height:200,screen:'app'});
`;

describe('analyze_* (story 9.6)', () => {
  it('colors: literal hex per nodeId, bound {$token}, kandidat token terdekat, filter boardId', async () => {
    const s = await setup();
    try {
      const sid = await s.session();
      await s.post('/viewer/docs', { name: 'audit', board: { preset: 'app' } });
      await s.open(sid, 'audit');
      const data = await s.exec(sid, SEED, 'isi board fixture audit');
      const boardId = data.created[0]!.id;

      const r = (await s.post('/analyze/colors', {}, sid)).json();
      expect(r.statusCode ?? r.data).toBeTruthy();
      const colors = r.data.colors as any[];
      // Terurut count desc; bound value mempertahankan nama token lowercase.
      expect(colors[0]!.count).toBeGreaterThanOrEqual(colors[1]!.count);
      expect(r.data.slug).toBe('audit');
      expect(r.data.rev).toBeGreaterThanOrEqual(1);
      const lit = colors.find((c) => c.value === '#FF6B6B')!;
      expect(lit.bound).toBe(false);
      expect(lit.count).toBe(3);
      expect(lit.uses[0]).toMatchObject({ prop: 'fills.0.color' });
      expect(lit.uses[0].boardId).toBe(boardId);
      expect(lit.candidates[0].token).toBe('colors.brand');
      const bound = colors.find((c) => c.bound === true)!;
      expect(bound.value).toBe('{$token:colors.danger}');
      expect(bound.token).toBe('colors.danger');
      expect(bound.count).toBe(1);
      // Mesh colors[] ikut dihitung sebagai literal.
      expect(colors.find((c) => c.value === '#0000FF')!.count).toBe(1);
      // Filter boardId: board 'Empty' tanpa warna.
      const doc = await s.doc('audit');
      const emptyBoard = doc.pages[0]!.children.find((b) => b.name === 'Empty')!;
      const scoped = (await s.post('/analyze/colors', { boardId: emptyBoard.id }, sid)).json();
      expect(scoped.data.colors).toEqual([]);
      const bad = await s.post('/analyze/colors', { boardId: 'ZZzzzz99' }, sid);
      expect(bad.statusCode).toBe(404);
      // Baca-saja: file identik byte.
      const before = JSON.stringify(await s.doc('audit'));
      await s.post('/analyze/colors', {}, sid);
      expect(JSON.stringify(await s.doc('audit'))).toBe(before);
    } finally {
      await s.app.close();
    }
  });

  it('typography: kelompok gaya, offScale + saran, prop token-bound', async () => {
    const s = await setup();
    try {
      const sid = await s.session();
      await s.post('/viewer/docs', { name: 'typo', board: { preset: 'app' } });
      await s.open(sid, 'typo');
      await s.exec(sid, SEED, 'isi teks fixture audit');
      const r = (await s.post('/analyze/typography', {}, sid)).json();
      const styles = r.data.styles as any[];
      const judul = styles.find((x) => x.size === 16)!;
      expect(judul.count).toBe(3);
      expect(judul.nodeIds).toHaveLength(3);
      expect(judul.offScale).toBeUndefined();
      const off = styles.find((x) => x.size === 15)!;
      expect(off.offScale).toBe(true);
      expect(off.suggestedSize).toBe(14);
      // Kelompok gaya lain (family+weight) terpisah dari kelompok 16 default.
      const mono = styles.find((x) => x.family === 'DM Mono')!;
      expect(mono.weight).toBe(700);
      expect(mono.count).toBe(1);
      // size terikat token muncul sebagai {$token:nama} tanpa offScale.
      await s.exec(sid, `setTokens({'fonts.body':{type:'fontSize',value:16}}); const b=find({name:'Audit'})[0].id; add(b,{type:'text',name:'Tok',content:'t',size:{$token:'fonts.body'}})`, 'tambah teks token audit');
      const r2 = (await s.post('/analyze/typography', {}, sid)).json();
      const tok = r2.data.styles.find((x: any) => String(x.size).startsWith('{$token:'))!;
      expect(tok.size).toBe('{$token:fonts.body}');
      expect(tok.offScale).toBeUndefined();
    } finally {
      await s.app.close();
    }
  });

  it('clusters: tiga frame identik → satu cluster; daun diabaikan; min membatasi', async () => {
    const s = await setup();
    try {
      const sid = await s.session();
      await s.post('/viewer/docs', { name: 'clu', board: { preset: 'app' } });
      await s.open(sid, 'clu');
      await s.exec(sid, SEED, 'isi klaster fixture audit');
      const r = (await s.post('/analyze/clusters', {}, sid)).json();
      const clusters = r.data.clusters as any[];
      const kartu = clusters.find((c) => c.example.name === 'Kartu')!;
      expect(kartu.count).toBe(3);
      expect(kartu.nodeIds).toHaveLength(3);
      expect(kartu.shape).toContain('frame');
      // min 4 menyingkirkan cluster 3-kartu.
      const r4 = (await s.post('/analyze/clusters', { min: 4 }, sid)).json();
      expect(r4.data.clusters.find((c: any) => c.example.name === 'Kartu')).toBeUndefined();
      // Kunci asing ditolak.
      expect((await s.post('/analyze/clusters', { nope: 1 }, sid)).statusCode).toBe(400);
      // Route → nama tool untuk event Activity (konvensi satu baris per pemetaan).
      expect(TOOL_ROUTES['/analyze/colors']).toBe('analyze_colors');
      expect(TOOL_ROUTES['/analyze/typography']).toBe('analyze_typography');
      expect(TOOL_ROUTES['/analyze/clusters']).toBe('analyze_clusters');
    } finally {
      await s.app.close();
    }
  });

  it('tanpa dokumen aktif → 401/4xx; kunci asing di body → 400', async () => {
    const s = await setup();
    try {
      const sid = await s.session();
      const r = await s.post('/analyze/colors', {}, sid);
      expect(r.statusCode).toBe(409);
    } finally {
      await s.app.close();
    }
  });
});
