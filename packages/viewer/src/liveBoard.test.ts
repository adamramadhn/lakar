// Board hidup canvas (editor-canvas story 3): kunci deps dan cache deps render. Tanpa DOM.
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedBoardNode } from '@lakar/schema';
import { boardDepKeys, boardSignature, boardSource, fontDepKey, RenderDepsCache, type DepKeys, type RenderDepsResult } from './liveBoard.ts';

const board = {
  type: 'board',
  id: 'B1',
  name: 'Home',
  x: 0,
  y: 0,
  width: 390,
  height: 844,
  children: [
    { type: 'text', id: 'T1', content: 'Halo' },
    {
      type: 'frame',
      id: 'F1',
      children: [
        { type: 'text', id: 'T2', content: 'Bold', family: 'Space Grotesk', weight: 700 },
        { type: 'icon', id: 'I1', lib: 'lucide', icon: 'star', size: 24 },
        { type: 'icon', id: 'I2', lib: 'lucide', icon: 'star', size: 16 },
        { type: 'text', id: 'T3', content: 'Lagi' },
      ],
    },
  ],
} as unknown as ResolvedBoardNode;

const face = (family: string, weight: number, style = 'normal', subset = 'latin') => ({ family, weight, style: style as 'normal', url: `/fonts/x/x-${subset}-${weight}-${style}.woff2`, unicodeRange: 'U+0000-00FF' });
const glyph = (lib: 'lucide', icon: string) => ({ lib, icon, viewBox: [0, 0, 24, 24] as const, kind: 'stroke' as const, nodes: [] });

/** Daemon palsu: semua kunci dikenal kecuali yang berawalan `Nope` / `zzz`. */
function daemon() {
  const calls: DepKeys[] = [];
  const fetcher = vi.fn(async (keys: DepKeys): Promise<RenderDepsResult> => {
    calls.push(keys);
    const known = (k: string) => !k.startsWith('Nope') && !k.includes('zzz');
    return {
      fonts: keys.fonts.filter(known).flatMap((k) => {
        const [family, w, style] = k.split(':') as [string, string, string];
        return [face(family, Number(w), style, 'latin'), face(family, Number(w), style, 'latin-ext')];
      }),
      icons: keys.icons.filter(known).map((k) => glyph('lucide', k.split('/')[1]!)),
      missing: { fonts: keys.fonts.filter((k) => !known(k)), icons: keys.icons.filter((k) => !known(k)) },
    };
  });
  return { calls, fetcher };
}

describe('boardDepKeys', () => {
  it('font (default Inter 400 normal) dan ikon unik, urut kemunculan', () => {
    expect(boardDepKeys(board)).toEqual({ fonts: ['Inter:400:normal', 'Space Grotesk:700:normal'], icons: ['lucide/star'] });
    expect(fontDepKey({ family: 'Inter', weight: 400, style: 'italic' })).toBe('Inter:400:italic');
  });

  it('tanda tangan berubah hanya bila isi board berubah', () => {
    const same = JSON.parse(JSON.stringify(board)) as ResolvedBoardNode;
    expect(boardSignature(same)).toBe(boardSignature(board));
    expect(boardSignature({ ...board, name: 'Lain' })).not.toBe(boardSignature(board));
    expect(boardSignature(undefined)).toBe('');
  });
});

describe('boardSource', () => {
  it('live hanya untuk versi terkini dengan dokumen; pratinjau History dan tanpa dokumen → PNG', () => {
    expect(boardSource(true, false)).toBe('live');
    expect(boardSource(true, true)).toBe('snapshot');
    expect(boardSource(false, false)).toBe('snapshot');
  });
});

describe('RenderDepsCache', () => {
  it('hanya kunci baru yang diminta; permintaan bersamaan tidak ganda', async () => {
    const { calls, fetcher } = daemon();
    const cache = new RenderDepsCache(fetcher);
    const keys = boardDepKeys(board);
    const [a, b] = await Promise.all([cache.ensure(keys), cache.ensure(keys)]);
    expect(calls).toEqual([keys]);
    expect(a.complete).toBe(true);
    expect(a.fonts.length).toBe(4);
    expect(a.icons).toEqual([glyph('lucide', 'star')]);
    expect(b).toEqual(a);
    const c = await cache.ensure({ fonts: ['Inter:400:normal', 'Inter:700:normal'], icons: ['lucide/star', 'lucide/heart'] });
    expect(calls[1]).toEqual({ fonts: ['Inter:700:normal'], icons: ['lucide/heart'] });
    expect(c.fonts.map(fontDepKey)).toEqual(['Inter:400:normal', 'Inter:400:normal', 'Inter:700:normal', 'Inter:700:normal']);
    expect(c.icons.map((g) => g.icon)).toEqual(['star', 'heart']);
  });

  it('kunci missing di-cache kosong (tidak diminta ulang)', async () => {
    const { calls, fetcher } = daemon();
    const cache = new RenderDepsCache(fetcher);
    const keys = { fonts: ['Nope:400:normal'], icons: ['lucide/zzz'] };
    expect(await cache.ensure(keys)).toEqual({ fonts: [], icons: [], complete: true });
    await cache.ensure(keys);
    expect(calls.length).toBe(1);
  });

  it('gagal diambil (offline) → hasil sebagian, complete false; dicoba lagi berikutnya', async () => {
    const { calls, fetcher } = daemon();
    const cache = new RenderDepsCache(fetcher);
    await cache.ensure({ fonts: ['Inter:400:normal'], icons: [] });
    fetcher.mockRejectedValueOnce(new Error('offline'));
    const partial = await cache.ensure({ fonts: ['Inter:400:normal'], icons: ['lucide/star'] });
    expect(partial.complete).toBe(false);
    expect(partial.fonts.length).toBe(2);
    expect(partial.icons).toEqual([]);
    const again = await cache.ensure({ fonts: [], icons: ['lucide/star'] });
    expect(again).toEqual({ fonts: [], icons: [glyph('lucide', 'star')], complete: true });
    expect(calls.map((c) => c.icons)).toEqual([[], ['lucide/star']]);
  });
});
