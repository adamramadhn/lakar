// Panel Theme (epic token-tema story 3): op dari themeModel.ts dijalankan lewat `applyOps` core sungguhan (tanpa
// daemon) supaya batch komposit (hapus token + detach, ganti nama mode) lolos validasi commit, `resolveDocument`
// memberi nilai yang diharapkan di setiap board (mode efektif), dan inversnya (AD-8) mengembalikan dokumen persis.
import { describe, expect, it } from 'vitest';
import { resolveDocument, type DocOp, type LakarDocument } from '../packages/schema/src/index.ts';
import { applyOps, beginTransaction, createDocument } from '../packages/core/src/index.ts';
import { addModeOps, deleteTokenOps, renameModeOps, renameTokenOps, setCellOps, themeModeOps, type Built, type ThemeDoc } from '../packages/viewer/src/themeModel.ts';
import type { DesignTarget } from '../packages/viewer/src/designModel.ts';

const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
};

/** Board B1 (light): rect R (fill + radius tuple + stop gradien ber-token), teks T; board B2 (dark): teks D. */
function fixture() {
  const tx = beginTransaction(createDocument(seeded(1)), { sessionId: 's', random: seeded(2) });
  tx.setTokenModes(['light', 'dark']);
  tx.setTokens({
    'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F' } },
    'colors.accent': { type: 'color', value: '#3B82F6', modes: { dark: '#60A5FA' } },
    'radius.md': { type: 'radius', value: 12 },
  });
  const b1 = tx.add(null, { type: 'board', name: 'Light', x: 0, y: 0, width: 400, height: 300, screen: 'app', fills: [{ type: 'solid', color: { $token: 'colors.bg' } }] });
  const r = tx.add(b1, {
    type: 'rect',
    name: 'R',
    width: 100,
    height: 40,
    radius: [{ $token: 'radius.md' }, 0, 0, 0],
    fills: [{ type: 'linear', angle: 90, stops: [{ offset: 0, color: { $token: 'colors.accent' } }, { offset: 1, color: '#000000' }] }],
  });
  const t = tx.add(b1, { type: 'text', name: 'T', content: 'Hi', size: 16, color: { $token: 'colors.accent' } });
  const b2 = tx.add(null, { type: 'board', name: 'Dark', x: 500, y: 0, width: 400, height: 300, screen: 'app', themeMode: 'dark' });
  const d = tx.add(b2, { type: 'text', name: 'D', content: 'Hi', size: 16, color: { $token: 'colors.accent' } });
  return { doc: tx.commit('fixture').doc, ids: { b1, r, t, b2, d } };
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
const head = (d: LakarDocument) => d as unknown as ThemeDoc;

/** Commit `ops`, cek satu rev, lalu terapkan invers dan cek dokumen kembali persis. */
function roundTrip(doc: LakarDocument, ops: DocOp[]) {
  const r = run(doc, ops);
  expect(r.doc.rev).toBe(doc.rev + 1);
  const back = run(r.doc, r.inverse);
  expect(content(back.doc)).toEqual(content(doc));
  return r.doc;
}

describe('op panel Theme di core', () => {
  it('ubah nilai token: semua pemakai berubah di dokumen ter-resolve dalam satu rev; undo mengembalikan', () => {
    const { doc, ids } = fixture();
    const next = roundTrip(doc, opsOf(setCellOps(head(doc).tokens, 'colors.accent', 'light', '#ff0000', doc.tokenModes)));
    const res = resolveDocument(next);
    expect(find(res, ids.t)!.color).toBe('#FF0000');
    expect(find(res, ids.r)!.fills[0].stops[0].color).toBe('#FF0000');
    expect(find(res, ids.d)!.color).toBe('#60A5FA');
  });

  it('nilai mode dan kosongkan mode', () => {
    const { doc, ids } = fixture();
    const a = roundTrip(doc, opsOf(setCellOps(head(doc).tokens, 'colors.accent', 'dark', '#00ff00', doc.tokenModes)));
    expect(find(resolveDocument(a), ids.d)!.color).toBe('#00FF00');
    const b = roundTrip(a, opsOf(setCellOps(head(a).tokens, 'colors.accent', 'dark', '', a.tokenModes)));
    expect(find(resolveDocument(b), ids.d)!.color).toBe('#3B82F6');
  });

  it('hapus token: pemakai di-detach ke nilai mode efektif board (tuple, stop, teks), token hilang; undo mengembalikan ref', () => {
    const { doc, ids } = fixture();
    const next = roundTrip(doc, opsOf(deleteTokenOps(head(doc), 'colors.accent')));
    expect(next.tokens).not.toHaveProperty('colors.accent');
    expect(find(next, ids.t)!.color).toBe('#3B82F6');
    expect(find(next, ids.d)!.color).toBe('#60A5FA');
    expect(find(next, ids.r)!.fills[0].stops[0].color).toBe('#3B82F6');
    const radius = roundTrip(doc, opsOf(deleteTokenOps(head(doc), 'radius.md')));
    expect(find(radius, ids.r)!.radius).toEqual([12, 0, 0, 0]);
  });

  it('ganti nama token lewat route ops', () => {
    const { doc, ids } = fixture();
    const next = roundTrip(doc, opsOf(renameTokenOps(head(doc).tokens, 'colors.accent', 'colors.brand')));
    expect(find(next, ids.t)!.color).toEqual({ $token: 'colors.brand' });
  });

  it('tambah mode dan ganti nama mode yang dipakai token dan board; undo mengembalikan', () => {
    const { doc, ids } = fixture();
    const added = roundTrip(doc, opsOf(addModeOps(head(doc), 'High contrast')));
    expect(added.tokenModes).toEqual(['light', 'dark', 'high-contrast']);
    const renamed = roundTrip(added, opsOf(renameModeOps(head(added), 'dark', 'Night')));
    expect(renamed.tokenModes).toEqual(['light', 'night', 'high-contrast']);
    expect(find(renamed, ids.b2)!.themeMode).toBe('night');
    expect(renamed.tokens!['colors.bg']).toEqual({ type: 'color', value: '#FFFFFF', modes: { night: '#0F0F0F' } });
    expect(find(resolveDocument(renamed), ids.d)!.color).toBe('#60A5FA');
  });

  it('themeMode board: Dark lalu kembali ke mode pertama (hapus); nilai resolve mengikuti', () => {
    const { doc, ids } = fixture();
    const board = (d: LakarDocument): DesignTarget => ({ id: ids.b1, type: 'board', name: 'Light', stored: find(d, ids.b1)!, resolved: {}, parentLayout: undefined });
    const dark = roundTrip(doc, themeModeOps([board(doc)], 'dark', doc.tokenModes!));
    expect(find(resolveDocument(dark), ids.t)!.color).toBe('#60A5FA');
    const light = roundTrip(dark, themeModeOps([board(dark)], 'light', dark.tokenModes!));
    expect(find(light, ids.b1)).not.toHaveProperty('themeMode');
    expect(find(resolveDocument(light), ids.t)!.color).toBe('#3B82F6');
  });
});
