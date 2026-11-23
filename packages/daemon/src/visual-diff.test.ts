// Visual diff agen (spec-agent-visual-diff): logika piksel murni (rasio, wilayah, ukuran beda, node per wilayah) dan
// route POST /viewer/visual-diff (default rev dari tulis sesi, lingkup node, rev/board/node hilang, error) dengan RenderPort palsu
// yang melukis anak board sebagai blok warna (warna = hash properti node, jadi perubahan apa pun terlihat).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOOL_ROUTES, buildServer, loadConfig } from './index.js';
import { decodePng, encodePng, toRgba } from './png.js';
import { REGION_GROUPS_MAX, diffRasters, findRegions, nodeCandidates, regionNodes, renderOverlay, toBoard, type Raster } from './visual-diff.js';

/** Raster `w`×`h` putih dengan persegi berwarna `[x,y,w,h,[r,g,b]]`. */
function raster(w: number, h: number, rects: [number, number, number, number, [number, number, number]][] = []): Raster {
  const rgba = new Uint8Array(w * h * 4).fill(255);
  for (const [x, y, rw, rh, [r, g, b]] of rects) {
    for (let j = y; j < Math.min(h, y + rh); j++) {
      for (let i = x; i < Math.min(w, x + rw); i++) rgba.set([r, g, b, 255], (j * w + i) * 4);
    }
  }
  return { width: w, height: h, channels: 4, pixels: rgba };
}

describe('visual diff: logika piksel', () => {
  it('identik → 0 piksel, rasio 0, tanpa wilayah', () => {
    const a = raster(100, 80, [[10, 10, 20, 20, [0, 0, 0]]]);
    const d = diffRasters(a, raster(100, 80, [[10, 10, 20, 20, [0, 0, 0]]]));
    expect(d).toMatchObject({ area: [0, 0, 100, 80], changed: 0, changedRatio: 0 });
    expect(findRegions(d.mask, 100, 80).regions).toEqual([]);
  });

  it('satu blok berubah warna → rasio = luas blok / luas board, satu wilayah tepat di blok', () => {
    const d = diffRasters(raster(200, 100, [[40, 20, 30, 10, [20, 20, 200]]]), raster(200, 100, [[40, 20, 30, 10, [200, 20, 20]]]));
    expect(d.changed).toBe(300);
    expect(d.changedRatio).toBe(0.015);
    expect(findRegions(d.mask, 200, 100)).toEqual({ regions: [{ bounds: [40, 20, 30, 10], pixels: 300 }], truncated: 0 });
  });

  it('beda warna di bawah ambang (1 unit) diabaikan', () => {
    const d = diffRasters(raster(50, 50, [[0, 0, 50, 50, [100, 100, 100]]]), raster(50, 50, [[0, 0, 50, 50, [101, 100, 100]]]));
    expect(d.changed).toBe(0);
  });

  it('dua perubahan berjauhan → dua wilayah (terbesar dulu); berdekatan (< gap) → digabung', () => {
    const before = raster(300, 300);
    const far = diffRasters(before, raster(300, 300, [[10, 10, 10, 10, [0, 0, 0]], [200, 200, 20, 20, [0, 0, 0]]]));
    expect(findRegions(far.mask, 300, 300).regions.map((r) => r.bounds)).toEqual([[200, 200, 20, 20], [10, 10, 10, 10]]);
    const near = diffRasters(before, raster(300, 300, [[10, 10, 10, 10, [0, 0, 0]], [30, 10, 10, 10, [0, 0, 0]]]));
    expect(findRegions(near.mask, 300, 300).regions).toEqual([{ bounds: [10, 10, 30, 10], pixels: 200 }]);
  });

  it('batas jumlah wilayah: sisa dihitung di truncated', () => {
    const rects = Array.from({ length: 5 }, (_, i) => [i * 60, 0, 5, 5, [0, 0, 0]] as [number, number, number, number, [number, number, number]]);
    const d = diffRasters(raster(300, 10), raster(300, 10, rects));
    const r = findRegions(d.mask, 300, 10, { max: 3 });
    expect(r.regions).toHaveLength(3);
    expect(r.truncated).toBe(2);
  });

  it('ukuran beda (board hug tumbuh): disejajarkan kiri-atas, piksel tambahan dihitung berubah, wilayah di bagian baru', () => {
    const d = diffRasters(raster(100, 50), raster(100, 70));
    expect(d.area).toEqual([0, 0, 100, 70]);
    expect(d.changed).toBe(100 * 20);
    expect(findRegions(d.mask, 100, 70).regions[0]!.bounds).toEqual([0, 50, 100, 20]);
  });

  it('render tidak ada di satu rev (board baru) → seluruh area berubah; keduanya tidak ada → area kosong', () => {
    expect(diffRasters(null, raster(40, 30))).toMatchObject({ area: [0, 0, 40, 30], changed: 1200, changedRatio: 1 });
    expect(diffRasters(null, null)).toMatchObject({ area: [0, 0, 0, 0], changed: 0, changedRatio: 0 });
  });

  it('clip (lingkup node) membatasi area; rasio relatif area', () => {
    const d = diffRasters(raster(200, 100), raster(200, 100, [[0, 0, 10, 10, [0, 0, 0]], [150, 50, 10, 10, [0, 0, 0]]]), [140, 40, 40, 40]);
    expect(d.area).toEqual([140, 40, 40, 40]);
    expect(d.changed).toBe(100);
    expect(findRegions(d.mask, 40, 40).regions[0]!.bounds).toEqual([10, 10, 10, 10]);
  });

  it('overlay: piksel berubah merah, sisanya "sesudah" dipudarkan, bingkai wilayah biru; PNG bisa didekode ulang', () => {
    const before = raster(60, 40);
    const after = raster(60, 40, [[20, 10, 10, 10, [0, 0, 0]]]);
    const d = diffRasters(before, after);
    const { regions } = findRegions(d.mask, 60, 40);
    const o = renderOverlay(d, d, regions);
    const px = (x: number, y: number) => [...o.rgba.subarray((y * 60 + x) * 4, (y * 60 + x) * 4 + 4)];
    expect(px(25, 15)).toEqual([230, 30, 45, 255]);
    expect(px(0, 0)).toEqual([255, 255, 255, 255]);
    expect(px(19, 9)).toEqual([37, 99, 235, 255]);
    const png = decodePng(encodePng(o.width, o.height, o.rgba));
    expect([png.width, png.height]).toEqual([60, 40]);
    expect(toRgba(png)).toEqual(o.rgba);
    expect(o.scale).toBe(1);
  });

  it('render RGB (3 kanal) dibandingkan sama dengan RGBA', () => {
    const rgba = raster(20, 10, [[5, 5, 5, 5, [0, 0, 0]]]);
    const rgb: Raster = { width: 20, height: 10, channels: 3, pixels: rgba.pixels.filter((_, i) => i % 4 !== 3) };
    expect(diffRasters(rgb, rgba).changed).toBe(0);
    expect(diffRasters(rgb, raster(20, 10)).changed).toBe(25);
  });

  it('area di atas maxPixels dibandingkan pada skala turun; wilayah dipetakan balik ke koordinat board; overlay dibatasi maxSide', () => {
    const before = raster(400, 2000);
    const after = raster(400, 2000, [[100, 1200, 80, 40, [0, 0, 0]]]);
    const d = diffRasters(before, after, undefined, { maxPixels: 80_000 });
    expect([d.width, d.height]).toEqual([126, 632]);
    expect(d.width * d.height).toBeLessThanOrEqual(80_000);
    expect(d.changedRatio).toBeCloseTo((80 * 40) / (400 * 2000), 3);
    const { regions } = findRegions(d.mask, d.width, d.height);
    expect(regions).toHaveLength(1);
    const [x, y, w, h] = toBoard(d, regions[0]!.bounds);
    // Kotak board menutupi blok asli; dilebarkan paling banyak dua piksel diff (~6,3 px board) per sisi.
    expect(x).toBeLessThanOrEqual(100);
    expect(y).toBeLessThanOrEqual(1200);
    expect(x + w).toBeGreaterThanOrEqual(180);
    expect(y + h).toBeGreaterThanOrEqual(1240);
    expect(x).toBeGreaterThanOrEqual(93);
    expect(x + w).toBeLessThanOrEqual(187);
    const o = renderOverlay(d, d, regions, 200);
    expect(Math.max(o.width, o.height)).toBeLessThanOrEqual(200);
    expect(o.scale).toBeLessThan(1);
    // Blok berubah tetap merah walau overlay diperkecil.
    const red = [...Array(o.width * o.height).keys()].filter((i) => o.rgba[i * 4] === 230 && o.rgba[i * 4 + 1] === 30);
    expect(red.length).toBeGreaterThan(0);
  });

  it('banyak kelompok (> REGION_GROUPS_MAX) → grid dikasarkan; hasil tetap terbatas dan cepat', () => {
    const w = 2000;
    const h = 2000;
    const mask = new Uint8Array(w * h);
    // Titik terpisah setiap 50 px → 1.600 kelompok di grid dasar.
    for (let y = 0; y < h; y += 50) for (let x = 0; x < w; x += 50) mask[y * w + x] = 1;
    const t0 = performance.now();
    const r = findRegions(mask, w, h);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(r.regions.length + r.truncated).toBeLessThanOrEqual(REGION_GROUPS_MAX);
    expect(r.regions.reduce((a, g) => a + g.pixels, 0)).toBeGreaterThan(0);
  });

  it('node per wilayah: leluhur node lain yang kena dibuang, node baru/terhapus diberi state', () => {
    const before = { board: { id: 'B', name: 'Board', children: [{ id: 'C', name: 'Card', children: [{ id: 'T', name: 'Title' }, { id: 'X', name: 'Old' }] }] }, measure: { width: 100, height: 100, texts: [], nodes: [{ id: 'C', x: 0, y: 0, width: 100, height: 50 }, { id: 'T', x: 10, y: 10, width: 50, height: 10 }, { id: 'X', x: 10, y: 30, width: 50, height: 10 }] } };
    const after = { board: { id: 'B', name: 'Board', children: [{ id: 'C', name: 'Card', children: [{ id: 'T', name: 'Title' }, { id: 'N', name: 'New' }] }] }, measure: { width: 100, height: 100, texts: [], nodes: [{ id: 'C', x: 0, y: 0, width: 100, height: 50 }, { id: 'T', x: 10, y: 10, width: 50, height: 10 }, { id: 'N', x: 10, y: 60, width: 50, height: 10 }] } };
    const cands = nodeCandidates(before, after);
    expect(regionNodes([12, 12, 5, 5], cands)).toEqual([{ id: 'T', name: 'Title' }]);
    expect(regionNodes([12, 32, 5, 5], cands)).toEqual([{ id: 'X', name: 'Old', state: 'removed' }]);
    expect(regionNodes([12, 62, 5, 5], cands)).toEqual([{ id: 'N', name: 'New', state: 'added' }]);
    // Area kartu tanpa anak yang kena → kartu itu sendiri.
    expect(regionNodes([80, 40, 5, 5], cands)).toEqual([{ id: 'C', name: 'Card' }]);
    expect(regionNodes([0, 90, 5, 5], cands)).toEqual([]);
  });
});

// RenderPort palsu: anak langsung board disusun kolom dari kiri atas (lebar = width angka atau lebar board, tinggi =
// height angka), dilukis warna hash properti node. Board hug = jumlah tinggi anak (min 10).
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return [(h >>> 0) & 255, (h >>> 8) & 255, (h >>> 16) & 255] as [number, number, number];
};
const layout = (board: any) => {
  let y = 0;
  const nodes = (board.children ?? []).map((c: any) => {
    const n = { id: c.id, x: 0, y, width: typeof c.width === 'number' ? c.width : board.width, height: typeof c.height === 'number' ? c.height : 20 };
    y += n.height;
    return { n, c };
  });
  return { width: board.width, height: typeof board.height === 'number' ? board.height : Math.max(10, y), nodes };
};
// Warna node = fill solid pertamanya bila ada (deterministik dan berbeda jelas antar-rev); selain itu hash properti
// tanpa `id`. Hash yang memuat id acak sesekali menghasilkan dua warna di bawah ambang pixelmatch → tes flaky.
const paint = (own: any): [number, number, number] => {
  const hex = own.fills?.[0]?.type === 'solid' && typeof own.fills[0].color === 'string' ? /^#([0-9a-f]{6})$/i.exec(own.fills[0].color) : null;
  if (hex) {
    const v = parseInt(hex[1]!, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const { id: _id, ...rest } = own;
  return hash(JSON.stringify(rest));
};
const findBoardIn =(doc: any, id: string) => doc.pages.flatMap((p: any) => p.children).find((b: any) => b.id === id);
const fakeRender = {
  screenshot: async (doc: any, boardId: string) => {
    const l = layout(findBoardIn(doc, boardId));
    const r = raster(l.width, l.height, l.nodes.map(({ n, c }: any) => {
      const { children: _k, ...own } = c;
      return [n.x, n.y, n.width, n.height, paint(own)];
    }));
    return new Uint8Array(encodePng(r.width, r.height, r.pixels));
  },
  measure: async (doc: any, boardId: string) => {
    const l = layout(findBoardIn(doc, boardId));
    return { width: l.width, height: l.height, nodes: l.nodes.map(({ n }: any) => n), texts: [] };
  },
} as never;

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-visual-diff-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function setup() {
  const dataDir = await mkdtemp(join(root, 'data-'));
  const { app } = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: fakeRender });
  const post = (url: string, payload: unknown, session?: string) =>
    app.inject({ method: 'POST', url, payload: payload as object, headers: session ? { 'x-lakar-session': session } : {} });
  const c = await post('/viewer/docs', { name: 'Diff', board: { preset: 'mobile' } });
  expect(c.statusCode, c.body).toBe(200);
  const slug = c.json().data.slug as string;
  const session = async () => {
    const s = (await post('/sessions', { client: 'lakar-mcp' })).json().data.sessionId as string;
    expect((await post('/docs/open', { slug }, s)).statusCode).toBe(200);
    return s;
  };
  const execute = async (s: string, code: string) => {
    const r = await post('/execute', { code, description: 'langkah uji visual diff' }, s);
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { rev: number; value?: any };
  };
  const diff = (s: string, body: unknown = {}) => post('/viewer/visual-diff', body, s);
  return { app, post, slug, session, execute, diff, dataDir };
}

describe('POST /viewer/visual-diff', () => {
  it('default = rev sebelum tulis terakhir sesi; since session = sebelum tulis pertama; wilayah + node; lingkup node; rev sama', async () => {
    const t = await setup();
    try {
      const s = await t.session();
      const boardId = (await t.post('/boards', {}, s)).json().data.boards[0].id as string;
      const r1 = await t.execute(s, `const a = add('${boardId}', {type:'rect', name:'A', width:'fill', height:100, fills:[{type:'solid', color:'#111111'}]}); const b = add('${boardId}', {type:'rect', name:'B', width:'fill', height:100, fills:[{type:'solid', color:'#222222'}]}); keep.a = a; keep.b = b; [a, b];`);
      const [a, b] = r1.value as [string, string];
      const r2 = await t.execute(s, `update(keep.b, {fills:[{type:'solid', color:'#EE0000'}]})`);
      expect(r2.rev).toBe(r1.rev + 1);

      const last = await t.diff(s);
      expect(last.statusCode, last.body).toBe(200);
      const d = last.json().data;
      expect(d).toMatchObject({ boardId, fromRev: r1.rev, toRev: r2.rev, base: 'lastWrite', area: [0, 0, 375, 812], size: { from: [375, 812], to: [375, 812] }, changedPixels: 375 * 100 });
      expect(d.changedRatio).toBeCloseTo(100 / 812, 4);
      expect(d.regions).toEqual([{ bounds: [0, 100, 375, 100], pixels: 375 * 100, nodes: [{ id: b, name: 'B' }] }]);
      expect(d).not.toHaveProperty('sizeDelta');
      expect(d).not.toHaveProperty('missing');
      const png = decodePng(Buffer.from(d.png, 'base64'));
      expect([png.width, png.height]).toEqual([375, 812]);
      expect(d.mimeType).toBe('image/png');

      const first = (await t.diff(s, { since: 'session' })).json().data;
      expect(first).toMatchObject({ fromRev: r1.rev - 1, toRev: r2.rev, base: 'sessionStart' });
      expect(first.regions).toHaveLength(1);
      expect(first.regions[0].bounds).toEqual([0, 0, 375, 200]);
      expect(first.regions[0].nodes.map((n: any) => [n.id, n.state])).toEqual([[a, 'added'], [b, 'added']]);

      // Lingkup node: A tidak berubah antara r1 dan r2 → 0; B → seluruh area node.
      const na = (await t.diff(s, { nodeId: a })).json().data;
      expect(na).toMatchObject({ boardId, nodeId: a, area: [0, 0, 375, 100], changedPixels: 0, regions: [] });
      const nb = (await t.diff(s, { nodeId: b })).json().data;
      expect(nb).toMatchObject({ area: [0, 100, 375, 100], changedRatio: 1 });
      expect(nb.regions[0].bounds).toEqual([0, 100, 375, 100]);

      const same = (await t.diff(s, { fromRev: r2.rev, toRev: r2.rev })).json().data;
      expect(same).toMatchObject({ base: 'explicit', changedPixels: 0, changedRatio: 0, regions: [] });
      expect(TOOL_ROUTES['/viewer/visual-diff']).toBe('visual_diff');
      // Dokumen tidak disentuh (baca-saja).
      expect((await t.post('/boards', {}, s)).json().data.rev).toBe(r2.rev);
    } finally {
      await t.app.close();
    }
  });

  it('sesi tanpa tulis → previousRev; board baru → missing from; board hug tumbuh → sizeDelta', async () => {
    const t = await setup();
    try {
      const writer = await t.session();
      const r1 = await t.execute(writer, `add(null, {type:'board', name:'Landing', x:600, y:0, width:200, height:'hug', screen:'landing'})`);
      const landing = r1.value as string;
      const fresh = await t.session();
      const created = (await t.diff(fresh, { boardId: landing })).json().data;
      expect(created).toMatchObject({ base: 'previousRev', fromRev: r1.rev - 1, toRev: r1.rev, missing: 'from', changedRatio: 1, size: { from: null, to: [200, 10] } });

      const r2 = await t.execute(writer, `add('${landing}', {type:'rect', name:'Hero', width:200, height:60})`);
      const grown = (await t.diff(writer, { boardId: landing })).json().data;
      expect(grown).toMatchObject({ fromRev: r1.rev, toRev: r2.rev, size: { from: [200, 10], to: [200, 60] }, sizeDelta: [0, 50] });
      expect(grown.regions[0].bounds).toEqual([0, 0, 200, 60]);
    } finally {
      await t.app.close();
    }
  });

  it('dokumen baru open_doc (r0 tanpa snapshot) → r0 dianggap kosong: board pertama missing from', async () => {
    const t = await setup();
    try {
      const s = (await t.post('/sessions', { client: 'lakar-mcp' })).json().data.sessionId as string;
      expect((await t.post('/docs/open', { slug: 'fresh' }, s)).json().data.rev).toBe(0);
      const r1 = await t.execute(s, `add(null, {type:'board', name:'Home', x:0, y:0, width:100, height:50, screen:'mobile'})`);
      const d = (await t.diff(s)).json().data;
      expect(d).toMatchObject({ boardId: r1.value, base: 'lastWrite', fromRev: 0, toRev: 1, missing: 'from', changedRatio: 1 });
      expect((await t.diff(s, { since: 'session' })).json().data.fromRev).toBe(0);
      // Rev lain tanpa snapshot tetap NOT_FOUND.
      expect((await t.diff(s, { fromRev: 5 })).json().error.code).toBe('NOT_FOUND');
    } finally {
      await t.app.close();
    }
  });

  it('r0 yang punya commit di riwayat (duplikat) tetapi snapshot-nya hilang → NOT_FOUND, bukan dokumen kosong', async () => {
    const t = await setup();
    try {
      const dup = (await t.post(`/viewer/docs/${t.slug}/duplicate`, undefined)).json().data.slug as string;
      const snap = join(t.dataDir, 'docs', '.snapshots', dup, 'r0.lakar.json');
      expect(existsSync(snap)).toBe(true);
      await rm(snap);
      const s = (await t.post('/sessions', { client: 'lakar-mcp' })).json().data.sessionId as string;
      expect((await t.post('/docs/open', { slug: dup }, s)).statusCode).toBe(200);
      const r = await t.diff(s, { fromRev: 0, toRev: 0 });
      // r0 = rev kini → dokumen kini dipakai (bukan rekonstruksi); r0 lama sesudah commit berikutnya → NOT_FOUND.
      expect(r.statusCode).toBe(200);
      const boardId = (await t.post('/boards', {}, s)).json().data.boards[0].id as string;
      await t.execute(s, `update('${boardId}', {name:'Renamed'})`);
      const gone = await t.diff(s, { fromRev: 0 });
      expect([gone.statusCode, gone.json().error?.code]).toEqual([404, 'NOT_FOUND']);
    } finally {
      await t.app.close();
    }
  });

  it('route di bawah /viewer/*: tanpa Origin (server MCP) lolos, Origin asing → 403; board besar → scale', async () => {
    const t = await setup();
    try {
      const s = await t.session();
      const foreign = await t.app.inject({ method: 'POST', url: '/viewer/visual-diff', payload: {}, headers: { 'x-lakar-session': s, origin: 'https://evil.example' } });
      expect(foreign.statusCode).toBe(403);
      const r1 = await t.execute(s, `add(null, {type:'board', name:'Tall', x:900, y:0, width:1000, height:5000, screen:'landing'})`);
      await t.execute(s, `add('${r1.value}', {type:'rect', name:'Block', width:'fill', height:400})`);
      const d = (await t.diff(s, { boardId: r1.value })).json().data;
      expect(d.scale).toBeLessThan(1);
      expect(d.overlayScale).toBeLessThanOrEqual(d.scale);
      expect(d.changedRatio).toBeCloseTo(400 / 5000, 2);
      const [x, y, w, h] = d.regions[0].bounds;
      expect(x).toBeLessThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(0);
      expect(x + w).toBeGreaterThanOrEqual(1000);
      expect(y + h).toBeGreaterThanOrEqual(400);
      expect(y + h).toBeLessThan(420);
      const png = decodePng(Buffer.from(d.png, 'base64'));
      expect(Math.max(png.width, png.height)).toBeLessThanOrEqual(4096);
    } finally {
      await t.app.close();
    }
  });

  it('error: boardId+nodeId / fromRev+since → SCHEMA_INVALID; rev tanpa snapshot, node/board tak ada → NOT_FOUND; tanpa dokumen → NO_ACTIVE_DOC', async () => {
    const t = await setup();
    try {
      const s = await t.session();
      const code = async (body: unknown, session = s) => {
        const r = await t.diff(session, body);
        return [r.statusCode, r.json().error?.code];
      };
      expect(await code({ boardId: 'Aaaaaaaa', nodeId: 'Bbbbbbbb' })).toEqual([400, 'SCHEMA_INVALID']);
      expect(await code({ fromRev: 0, since: 'last' })).toEqual([400, 'SCHEMA_INVALID']);
      expect(await code({ fromRev: -1 })).toEqual([400, 'SCHEMA_INVALID']);
      expect(await code({ extra: 1 })).toEqual([400, 'SCHEMA_INVALID']);
      expect(await code({ fromRev: 99 })).toEqual([404, 'NOT_FOUND']);
      expect(await code({ nodeId: 'Zzzzzzzz' })).toEqual([404, 'NOT_FOUND']);
      expect(await code({ boardId: 'Zzzzzzzz' })).toEqual([404, 'NOT_FOUND']);
      const bare = (await t.post('/sessions', { client: 'lakar-mcp' })).json().data.sessionId as string;
      expect((await code({}, bare))[1]).toBe('NO_ACTIVE_DOC');
    } finally {
      await t.app.close();
    }
  });
});
