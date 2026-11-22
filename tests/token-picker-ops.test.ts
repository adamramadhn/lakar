// Token Picker panel Design (epic token-tema story 4): op dari tokenPicker.ts dijalankan lewat `applyOps` core
// sungguhan (tanpa daemon). Membuktikan Done-when epic "mengubah satu token mengubah semua pemakainya" ujung ke ujung:
// pasang token lewat picker → ubah nilai token (setCellOps panel Theme) → `resolveDocument` memberi nilai baru di
// semua pemakai (mode efektif board), plus detach per mode, buat token dari nilai, dan invers (AD-8) yang persis.
import { describe, expect, it } from 'vitest';
import { resolveDocument, type DocOp, type LakarDocument } from '../packages/schema/src/index.ts';
import { applyOps, beginTransaction, createDocument } from '../packages/core/src/index.ts';
import { effectiveMode, setCellOps, type Built, type TokenMap } from '../packages/viewer/src/themeModel.ts';
import { applyTokenOps, createTokenOps, detachOps, fillColorSpec, radiusSpec, specState } from '../packages/viewer/src/tokenPicker.ts';
import type { DesignTarget } from '../packages/viewer/src/designModel.ts';

const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
};

/** Board L (light): rect A, rect B (radius 8); board D (dark): rect C. Semua fill literal. */
function fixture() {
  const tx = beginTransaction(createDocument(seeded(3)), { sessionId: 's', random: seeded(4) });
  tx.setTokenModes(['light', 'dark']);
  tx.setTokens({ 'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F' } } });
  const l = tx.add(null, { type: 'board', name: 'L', x: 0, y: 0, width: 400, height: 300, screen: 'app' });
  const a = tx.add(l, { type: 'rect', name: 'A', width: 10, height: 10, fills: [{ type: 'solid', color: '#123456' }] });
  const b = tx.add(l, { type: 'rect', name: 'B', width: 10, height: 10, radius: 8, fills: [{ type: 'solid', color: '#123456' }] });
  const d = tx.add(null, { type: 'board', name: 'D', x: 500, y: 0, width: 400, height: 300, screen: 'app', themeMode: 'dark' });
  const c = tx.add(d, { type: 'rect', name: 'C', width: 10, height: 10, fills: [{ type: 'solid', color: '#123456' }] });
  return { doc: tx.commit('fixture').doc, ids: { l, a, b, d, c } };
}

const run = (doc: LakarDocument, ops: DocOp[]) => {
  const tx = beginTransaction(doc, { sessionId: 'lakar-viewer' });
  applyOps(tx, ops);
  return tx.commit('ops');
};
const content = (d: LakarDocument) => ({ pages: d.pages, tokens: d.tokens ?? {}, tokenModes: d.tokenModes });
const find = (doc: unknown, id: string): Record<string, any> | undefined => {
  const walk = (n: any): any => (n.id === id ? n : (n.children ?? []).map(walk).find(Boolean));
  for (const p of (doc as LakarDocument).pages) for (const b of p.children) {
    const hit = walk(b);
    if (hit) return hit;
  }
  return undefined;
};
const opsOf = (b: Built): DocOp[] => {
  if ('error' in b) throw new Error(b.error);
  return b.ops;
};
const tokensOf = (d: LakarDocument) => (d.tokens ?? {}) as unknown as TokenMap;

/** Target panel Design seperti Viewer: node tersimpan + ter-resolve + mode efektif board pemilik. */
function targets(doc: LakarDocument, ids: string[]): DesignTarget[] {
  const res = resolveDocument(doc);
  return ids.map((id) => {
    const board = doc.pages[0]!.children.find((b) => find({ pages: [{ children: [b] }] }, id));
    const n = find(doc, id)!;
    return { id, type: n.type, name: n.name, stored: n, resolved: find(res, id)!, parentLayout: 'column', mode: effectiveMode(board as Record<string, unknown> | undefined, doc.tokenModes) };
  });
}

/** Commit `ops`, cek satu rev, lalu terapkan invers dan cek dokumen kembali persis. */
function roundTrip(doc: LakarDocument, ops: DocOp[]) {
  const r = run(doc, ops);
  expect(r.doc.rev).toBe(doc.rev + 1);
  expect(content(run(r.doc, r.inverse).doc)).toEqual(content(doc));
  return r.doc;
}

describe('op Token Picker di core', () => {
  it('pasang token ke 3 node lintas board, lalu ubah token: semua pemakai berubah (mode efektif masing-masing)', () => {
    const { doc, ids } = fixture();
    const attached = roundTrip(doc, opsOf(applyTokenOps(targets(doc, [ids.a, ids.b, ids.c]), fillColorSpec(0), 'colors.bg')));
    expect(find(attached, ids.a)!.fills[0].color).toEqual({ $token: 'colors.bg' });
    let res = resolveDocument(attached);
    expect([find(res, ids.a)!.fills[0].color, find(res, ids.b)!.fills[0].color, find(res, ids.c)!.fills[0].color]).toEqual(['#FFFFFF', '#FFFFFF', '#0F0F0F']);

    const light = roundTrip(attached, opsOf(setCellOps(tokensOf(attached), 'colors.bg', 'light', '#ff0000', attached.tokenModes)));
    res = resolveDocument(light);
    expect([find(res, ids.a)!.fills[0].color, find(res, ids.b)!.fills[0].color, find(res, ids.c)!.fills[0].color]).toEqual(['#FF0000', '#FF0000', '#0F0F0F']);
    const dark = roundTrip(light, opsOf(setCellOps(tokensOf(light), 'colors.bg', 'dark', '#00ff00', light.tokenModes)));
    expect(find(resolveDocument(dark), ids.c)!.fills[0].color).toBe('#00FF00');
  });

  it('detach multi-board: literal mode aktif per board dalam satu rev; undo mengembalikan ref', () => {
    const { doc, ids } = fixture();
    const attached = run(doc, opsOf(applyTokenOps(targets(doc, [ids.a, ids.c]), fillColorSpec(0), 'colors.bg'))).doc;
    const detached = roundTrip(attached, opsOf(detachOps(targets(attached, [ids.a, ids.c]), fillColorSpec(0), tokensOf(attached), attached.tokenModes)));
    expect(find(detached, ids.a)!.fills[0].color).toBe('#FFFFFF');
    expect(find(detached, ids.c)!.fills[0].color).toBe('#0F0F0F');
  });

  it('buat token dari nilai: token baru + ref dalam satu rev; undo menghapus keduanya', () => {
    const { doc, ids } = fixture();
    const ts = targets(doc, [ids.b]);
    const next = roundTrip(doc, opsOf(createTokenOps(tokensOf(doc), 'radius.card', 'radius', specState(ts, radiusSpec()), ts, radiusSpec())));
    expect(next.tokens?.['radius.card']).toEqual({ type: 'radius', value: 8 });
    expect(find(next, ids.b)!.radius).toEqual({ $token: 'radius.card' });
    expect(find(resolveDocument(next), ids.b)!.radius).toBe(8);
  });

  it('token color di slot radius ditolak core (tabel slot sama dengan saringan picker)', () => {
    const { doc, ids } = fixture();
    expect(() => run(doc, [{ op: 'update', id: ids.b, patch: { radius: { $token: 'colors.bg' } } }])).toThrow();
  });
});
