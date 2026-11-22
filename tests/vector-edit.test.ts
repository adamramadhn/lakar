// Done-when epic paste-vektor ujung ke ujung (story 5): ikon SVG di-paste lewat route viewer, titiknya diedit dengan
// model editor viewer (pathEdit.ts → op `update {d}` lewat route ops, satu rev), lalu diekspor kembali dengan
// `vectorToSvg`: hanya atribut `d` path yang diedit berubah, semua atribut lain tetap (R7). Undo lewat op invers
// mengembalikan dokumen. Path baru dari Pen tool (penNode → op `add`) juga satu rev dan bisa di-undo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vectorToSvg } from '../packages/render/src/index.ts';
import { resolveDocument, type LakarDocument, type ResolvedFrameNode } from '../packages/schema/src/index.ts';
import { buildServer, loadConfig } from '../packages/daemon/src/index.ts';
import { allRefs, editPatch, modelFromD, moveAnchors, moveHandle, handlesOf, penNode, setPointType } from '../packages/viewer/src/pathEdit.ts';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const fakeRender = { screenshot: async () => new Uint8Array(), measure: async () => ({ width: 1, height: 1, nodes: [], texts: [] }) } as never;
const ICON = readFileSync(new URL('./fixtures/svg/ikon-vektor/lonceng.svg', import.meta.url), 'utf8');

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-vector-edit-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

type Node = { id: string; type: string; children?: Node[] } & Record<string, unknown>;
const find = (d: { pages: { children: unknown[] }[] }, id: string): Node | undefined => {
  const walk = (n: Node): Node | undefined => (n.id === id ? n : (n.children ?? []).map(walk).find(Boolean));
  for (const p of d.pages) for (const b of p.children as Node[]) {
    const hit = walk(b);
    if (hit) return hit;
  }
  return undefined;
};
const content = (d: LakarDocument) => ({ pages: d.pages, tokens: d.tokens ?? {}, tokenModes: d.tokenModes });
/** Atribut setiap elemen SVG ekspor (urut dokumen), `d` dipisah supaya perbandingan atribut lain eksak. */
const elements = (svg: string) => [...svg.matchAll(/<([a-zA-Z]+)([^>]*)>/g)].map((m) => ({ tag: m[1], attrs: m[2]!.replace(/\sd="[^"]*"/, ''), d: /\sd="([^"]*)"/.exec(m[2]!)?.[1] }));

async function setup() {
  const dataDir = await mkdtemp(join(root, 'data-'));
  const { app } = buildServer({ config: { ...baseConfig, port: 7466, dataDir }, render: fakeRender });
  const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as object });
  const doc = async (slug: string) => JSON.parse(await readFile(join(dataDir, 'docs', `${slug}.lakar.json`), 'utf8')) as LakarDocument;
  const history = async (slug: string) => (await readFile(join(dataDir, 'docs', `${slug}.history.jsonl`), 'utf8')).split('\n').filter(Boolean);
  const r = await post('/viewer/docs', { name: 'Vector Edit', board: { preset: 'mobile' } });
  expect(r.statusCode, r.body).toBe(200);
  const slug = r.json().data.slug as string;
  const board = (await doc(slug)).pages[0]!.children[0]!.id;
  return { app, post, doc, history, slug, board };
}

describe('epic paste-vektor Done-when: impor → edit titik → ekspor', () => {
  it('ikon lonceng: edit titik hanya mengubah d di ekspor SVG; satu rev per gestur; undo', async () => {
    const t = await setup();
    try {
      const pasted = await t.post(`/viewer/docs/${t.slug}/paste`, { content: ICON, parentId: t.board, name: 'Bell' });
      expect(pasted.statusCode, pasted.body).toBe(200);
      const frameId = pasted.json().data.nodeId as string;
      const before = await t.doc(t.slug);
      const exportOf = (d: LakarDocument) => vectorToSvg(find(resolveDocument(d), frameId) as unknown as ResolvedFrameNode).svg;
      const svgBefore = exportOf(before);
      const frame = find(before, frameId)!;
      const path = frame.children![1]! as Node & { d: string; viewBox: [number, number, number, number] };
      const box = { w: typeof path.width === 'number' ? path.width : path.viewBox[2], h: typeof path.height === 'number' ? path.height : path.viewBox[3] };

      // Gestur 1: geser satu anchor di dalam viewBox (model editor viewer) → satu update {d}.
      const model = modelFromD(path.d);
      const ref = allRefs(model)[2]!;
      const moved = moveAnchors(model, [ref], 0.5, -0.5);
      const patch = editPatch(path, moved, box, true)!;
      expect(Object.keys(patch)).toEqual(['d']);
      const hist0 = (await t.history(t.slug)).length;
      const r1 = await t.post(`/viewer/docs/${t.slug}/ops`, { ops: [{ op: 'update', id: path.id, patch }], description: 'Edit path Path' });
      expect(r1.statusCode, r1.body).toBe(200);
      const after = await t.doc(t.slug);
      expect(after.rev).toBe(before.rev + 1);
      expect((await t.history(t.slug)).length).toBe(hist0 + 1);

      // Ekspor ulang: elemen dan atribut sama persis kecuali `d` path yang diedit.
      const a = elements(svgBefore);
      const b = elements(exportOf(after));
      expect(b.map((e) => [e.tag, e.attrs])).toEqual(a.map((e) => [e.tag, e.attrs]));
      const changed = a.flatMap((e, i) => (e.d !== b[i]!.d ? [i] : []));
      expect(changed).toHaveLength(1);
      expect(b[changed[0]!]!.d).toBe(patch.d);
      // Node path: hanya `d` yang berbeda (svg, fillRule, stroke, linecap, dst. utuh).
      const { d: _d1, ...restBefore } = path;
      const { d: _d2, ...restAfter } = find(after, path.id)!;
      expect(restAfter).toEqual(restBefore);

      // Gestur 2: handle + tipe titik pada path yang sama (dari d terbaru) tetap satu rev.
      const m2 = modelFromD(find(after, path.id)!.d as string);
      const withHandle = allRefs(m2).find((r) => handlesOf(m2, r).out)!;
      const h = handlesOf(m2, withHandle).out!;
      const m3 = setPointType(moveHandle(m2, withHandle, 'out', { x: h.x + 0.25, y: h.y }), [withHandle], 'mirrored');
      const p2 = editPatch(find(after, path.id) as never, m3, box, true)!;
      const r2 = await t.post(`/viewer/docs/${t.slug}/ops`, { ops: [{ op: 'update', id: path.id, patch: p2 }], description: 'Change point type' });
      expect(r2.statusCode, r2.body).toBe(200);
      expect((await t.doc(t.slug)).rev).toBe(after.rev + 1);
      // Label riwayat per gestur (spec: "Edit path <nama>", "Change point type").
      expect((await t.history(t.slug)).slice(-2).map((l) => JSON.parse(l).description)).toEqual(['Edit path Path', 'Change point type']);

      // Undo dua gestur (op invers, urutan terbalik) → dokumen seperti sesudah paste.
      for (const inv of [r2.json().data.inverse, r1.json().data.inverse]) {
        const u = await t.post(`/viewer/docs/${t.slug}/ops`, { ops: inv });
        expect(u.statusCode, u.body).toBe(200);
      }
      expect(content(await t.doc(t.slug))).toEqual(content(before));
    } finally {
      await t.app.close();
    }
  });

  it('Pen tool: path tertutup bezier = satu add, satu rev, valid, dan undo menghapusnya', async () => {
    const t = await setup();
    try {
      const before = await t.doc(t.slug);
      const node = penNode([{ p: { x: 40, y: 200 } }, { p: { x: 160, y: 80 }, out: { x: 220, y: 80 } }, { p: { x: 280, y: 200 } }], true)!;
      const r = await t.post(`/viewer/docs/${t.slug}/ops`, { ops: [{ op: 'add', parentId: t.board, node, ref: 'pen' }], description: 'Draw path' });
      expect(r.statusCode, r.body).toBe(200);
      const data = r.json().data;
      const after = await t.doc(t.slug);
      expect(after.rev).toBe(before.rev + 1);
      const created = find(after, data.created[0].id)!;
      expect(created).toMatchObject({ type: 'path', position: 'absolute', x: 40, y: 80, d: node.d, viewBox: node.viewBox });
      expect(String(created.d)).toMatch(/C.*Z$/);
      const u = await t.post(`/viewer/docs/${t.slug}/ops`, { ops: data.inverse });
      expect(u.statusCode, u.body).toBe(200);
      expect(content(await t.doc(t.slug))).toEqual(content(before));
    } finally {
      await t.app.close();
    }
  });
});
