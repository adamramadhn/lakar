// Route fix_check (spec-check-autofix) dengan RenderPort tiruan: satu rev per panggilan, dryRun tanpa commit, saran
// hanya dengan suggestions:true, codes, fix basi ditolak, properti terikat token dilewati, error input, Activity.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LakarDocument, SCHEMA_VERSION } from '@lakar/schema';
import { buildServer, loadConfig, type ActivityEvent } from './index.js';
import { tokenBoundKey } from './fix-check.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };

/** Kait sekali pakai yang berjalan di dalam `measure` berikutnya (mensimulasikan tulis lain selama render fix_check). */
let onMeasure: (() => Promise<void>) | undefined;
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let measured: string[] = [];
const fakeRender = {
  screenshot: async () => new Uint8Array(PNG_1x1),
  measure: async (doc: any, boardId: string) => {
    const hook = onMeasure;
    onMeasure = undefined;
    if (hook) await hook();
    measured.push(boardId);
    const b = doc.pages.flatMap((p: any) => p.children).find((x: any) => x.id === boardId);
    return { width: b.width, height: b.height, nodes: [], texts: [] };
  },
} as never;

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-fix-check-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const SNIPPET = `
const b = add(null,{type:'board',name:'Home',x:0,y:0,width:390,height:844,screen:'mobile'});
const thin = add(b,{type:'text',name:'Tipis',content:'Masuk',size:14,weight:300,color:'#101828'});
const hours = add(b,{type:'text',name:'Jam',content:'Buka 09.00-10.00',size:14,color:'#101828'});
const tiny = add(b,{type:'text',name:'Kecil',content:'Catatan',size:10,color:'#101828'});
({b, thin, hours, tiny})`;

async function setup() {
  const dataDir = await mkdtemp(join(root, 'data-'));
  const daemon = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: fakeRender });
  const events: ActivityEvent[] = [];
  daemon.activity.subscribe((e) => events.push(e));
  const post = (url: string, payload: unknown, session?: string) =>
    daemon.app.inject({ method: 'POST', url, payload: payload as object, headers: session ? { 'x-lakar-session': session } : {} });
  const sid = (await post('/sessions', {})).json().data.sessionId as string;
  await post('/docs/open', { slug: 'fix' }, sid);
  const ex = (await post('/execute', { code: SNIPPET, description: 'teks dengan temuan check' }, sid)).json();
  expect(ex.ok).toBe(true);
  const ids = ex.data.value as { b: string; thin: string; hours: string; tiny: string };
  const node = async (id: string) => (await post('/inspect', { id, depth: 0 }, sid)).json().data.node;
  const history = async () => (await daemon.app.inject({ method: 'GET', url: '/viewer/docs/fix/history' })).json().data.entries as { rev: number; description: string }[];
  return { ...daemon, post, sid, ids, node, history, events };
}

describe('POST /viewer/fix-check', () => {
  it('dryRun: fix aman dihitung + dicek ulang, dokumen dan rev tidak berubah', async () => {
    const s = await setup();
    try {
      const r = (await s.post('/viewer/fix-check', { dryRun: true }, s.sid)).json();
      expect(r.ok).toBe(true);
      expect(r.data).toMatchObject({ rev: 1, dryRun: true });
      expect(r.data.applied.map((a: any) => [a.rule, a.kind, a.nodeId])).toEqual([
        ['LC-29', 'fix', s.ids.thin],
        ['LC-30', 'fix', s.ids.hours],
      ]);
      // Sisa: LC-05 (saran saja) tetap; tanpa temuan baru.
      expect(r.data.remaining.map((f: any) => f.rule)).toContain('LC-05');
      expect(r.data.remaining.map((f: any) => f.rule)).not.toContain('LC-29');
      expect(r.data.newFindings).toEqual([]);
      expect((await s.node(s.ids.thin)).weight).toBe(300);
      expect((await s.history()).map((h) => h.rev)).toEqual([1]);
    } finally {
      await s.app.close();
    }
  });

  it('apply: semua fix aman = satu rev + satu entri riwayat; saran tidak disentuh tanpa suggestions', async () => {
    const s = await setup();
    try {
      const r = (await s.post('/viewer/fix-check', {}, s.sid)).json();
      expect(r.data).toMatchObject({ rev: 2, dryRun: false, skipped: [] });
      expect(r.data.applied).toHaveLength(2);
      expect((await s.node(s.ids.thin)).weight).toBe(400);
      expect((await s.node(s.ids.hours)).content).toBe('Buka 09.00–10.00');
      expect((await s.node(s.ids.tiny)).size).toBe(10);
      const h = await s.history();
      expect(h.map((x) => x.rev)).toEqual([2, 1]);
      expect(h[0]!.description).toBe('Apply check fixes');
      const lc05 = r.data.remaining.find((f: any) => f.rule === 'LC-05');
      expect(lc05.suggestions[0].label).toBe('Size 12');
      // Activity: fix_check tercatat dengan rev baru (viewer memuat ulang).
      const done = s.events.flatMap((e) => (e.type === 'call' && e.call.tool === 'fix_check' && e.call.status !== 'running' ? [e.call] : []));
      expect(done).toEqual([expect.objectContaining({ rev: 2 })]);
      // Panggilan kedua: tidak ada fix aman tersisa → tanpa commit.
      const again = (await s.post('/viewer/fix-check', {}, s.sid)).json();
      expect(again.data).toMatchObject({ rev: 2, applied: [] });
    } finally {
      await s.app.close();
    }
  });

  it('suggestions:true menerapkan saran pertama; codes membatasi aturan', async () => {
    const s = await setup();
    try {
      const only = (await s.post('/viewer/fix-check', { codes: ['LC-30'] }, s.sid)).json();
      expect(only.data.applied.map((a: any) => a.rule)).toEqual(['LC-30']);
      expect((await s.node(s.ids.thin)).weight).toBe(300);
      const all = (await s.post('/viewer/fix-check', { suggestions: true }, s.sid)).json();
      expect(all.data.applied.map((a: any) => [a.rule, a.kind])).toEqual([
        ['LC-05', 'suggestion'],
        ['LC-29', 'fix'],
      ]);
      expect((await s.node(s.ids.tiny)).size).toBe(12);
      expect(all.data.rev).toBe(3);
    } finally {
      await s.app.close();
    }
  });

  it('board target berubah sejak check (seksi ditambah selama render) → semua fix board itu stale, tanpa commit (review 33-1)', async () => {
    const s = await setup();
    try {
      onMeasure = async () => {
        const w = (await s.post('/execute', { code: `add('${s.ids.b}',{type:'text',name:'Seksi baru',content:'Halo',size:14,color:'#101828'})`, description: 'tambah seksi di tengah jalan' }, s.sid)).json();
        expect(w.ok).toBe(true);
      };
      const r = (await s.post('/viewer/fix-check', {}, s.sid)).json();
      expect(r.data.skipped.map((x: any) => [x.rule, x.reason])).toEqual([
        ['LC-29', 'stale'],
        ['LC-30', 'stale'],
      ]);
      expect(r.data.applied).toEqual([]);
      expect(r.data.rev).toBe(2);
      expect((await s.node(s.ids.thin)).weight).toBe(300);
    } finally {
      onMeasure = undefined;
      await s.app.close();
    }
  });

  it('tulis lain di board lain → fix tetap segar; check ulang hanya board yang berubah (review 33-4)', async () => {
    const s = await setup();
    try {
      const other = (await s.post('/execute', { code: `add(null,{type:'board',name:'Lain',x:2000,y:0,width:390,height:844,screen:'mobile'})`, description: 'board kedua tanpa temuan' }, s.sid)).json();
      expect(other.ok).toBe(true);
      onMeasure = async () => {
        const w = (await s.post('/execute', { code: `update('${other.data.created[0].id}', {name:'Lain 2'})`, description: 'ganti nama board lain' }, s.sid)).json();
        expect(w.ok).toBe(true);
      };
      measured = [];
      const r = (await s.post('/viewer/fix-check', {}, s.sid)).json();
      expect(r.data.applied.map((a: any) => a.rule)).toEqual(['LC-29', 'LC-30']);
      expect(r.data.rev).toBe(4);
      // Check awal: 2 board; execute di kait: board Lain; check ulang di bawah kunci: board fix + board Lain (berubah sejak check).
      const recheck = measured.slice(-2).sort();
      expect(recheck).toEqual([s.ids.b, other.data.created[0].id].sort());
      expect(r.data.boards.map((b: any) => b.id)).toEqual([s.ids.b, other.data.created[0].id]);
      // Tanpa tulis lain: hanya board fix yang dirender ulang.
      const again = await setup();
      try {
        await again.post('/execute', { code: `add(null,{type:'board',name:'Lain',x:2000,y:0,width:390,height:844,screen:'mobile'})`, description: 'board kedua tanpa temuan' }, again.sid);
        measured = [];
        const r2 = (await again.post('/viewer/fix-check', {}, again.sid)).json();
        expect(r2.data.rev).toBe(3);
        expect(measured.slice(2)).toEqual([again.ids.b]);
        expect(r2.data.boards).toHaveLength(2);
      } finally {
        await again.app.close();
      }
    } finally {
      onMeasure = undefined;
      await s.app.close();
    }
  });

  it('hook tulis agen: undo membatalkan fix_check; visual_diff {} sesudah fix_check berdasar rev sebelum fix_check (X1)', async () => {
    const s = await setup();
    try {
      const r = (await s.post('/viewer/fix-check', {}, s.sid)).json();
      expect(r.data.rev).toBe(2);
      const diff = (await s.post('/viewer/visual-diff', {}, s.sid)).json();
      expect(diff.data).toMatchObject({ base: 'lastWrite', fromRev: 1, toRev: 2 });
      const u = (await s.post('/viewer/undo', {}, s.sid)).json();
      expect(u.ok, JSON.stringify(u)).toBe(true);
      expect(u.data.rev).toBe(3);
      expect(u.data.undone[0].description).toBe('Apply check fixes');
      expect((await s.node(s.ids.thin)).weight).toBe(300);
      expect((await s.node(s.ids.hours)).content).toBe('Buka 09.00-10.00');
      // dryRun bukan tulis: tidak menjadi langkah undo dan tidak menggeser dasar visual_diff.
      await s.post('/viewer/fix-check', { dryRun: true }, s.sid);
      expect((await s.post('/viewer/visual-diff', {}, s.sid)).json().data).toMatchObject({ fromRev: 2, toRev: 3 });
    } finally {
      await s.app.close();
    }
  });

  it('error: board tak ada → NOT_FOUND; codes tak dikenal / kunci asing → SCHEMA_INVALID; tanpa dokumen aktif → NO_ACTIVE_DOC', async () => {
    const s = await setup();
    try {
      const nf = await s.post('/viewer/fix-check', { boardId: 'Zzzzzzzz' }, s.sid);
      expect([nf.statusCode, nf.json().error.code]).toEqual([404, 'NOT_FOUND']);
      const bad = await s.post('/viewer/fix-check', { codes: ['LC-99'] }, s.sid);
      expect([bad.statusCode, bad.json().error.code]).toEqual([400, 'SCHEMA_INVALID']);
      expect((await s.post('/viewer/fix-check', { apply: true }, s.sid)).json().error.code).toBe('SCHEMA_INVALID');
      const fresh = (await s.post('/sessions', {})).json().data.sessionId as string;
      expect((await s.post('/viewer/fix-check', {}, fresh)).json().error.code).toBe('NO_ACTIVE_DOC');
    } finally {
      await s.app.close();
    }
  });
});

describe('tokenBoundKey', () => {
  const doc = LakarDocument.parse({
    schemaVersion: SCHEMA_VERSION,
    id: 'Docu0001',
    rev: 1,
    tokens: { 'colors.ink': { type: 'color', value: '#101828' } },
    pages: [
      {
        id: 'Page0001',
        name: 'Page 1',
        children: [
          {
            type: 'board',
            id: 'Brd00001',
            name: 'Home',
            x: 0,
            y: 0,
            width: 390,
            height: 844,
            screen: 'mobile',
            children: [{ type: 'text', id: 'Txt00001', name: 'Teks', content: 'Halo', size: 14, color: { $token: 'colors.ink' } }],
          },
        ],
      },
    ],
  });

  it('properti ber-ref token → nama kunci; literal, remove, dan alamat komposit → undefined', () => {
    expect(tokenBoundKey(doc, { op: 'update', id: 'Txt00001', patch: { color: '#000000' } })).toBe('color');
    expect(tokenBoundKey(doc, { op: 'update', id: 'Txt00001', patch: { size: 16 } })).toBeUndefined();
    expect(tokenBoundKey(doc, { op: 'remove', id: 'Txt00001' })).toBeUndefined();
    expect(tokenBoundKey(doc, { op: 'update', id: 'Ins00001/Txt00001', patch: { color: '#000000' } })).toBeUndefined();
  });
});
