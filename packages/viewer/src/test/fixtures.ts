// Dokumen kecil untuk tes DOM viewer: satu halaman, satu board 400×300 (`Board001`, "Hero") dengan frame `Card0001`.
// Tanpa teks/ikon, jadi canvas live tidak meminta font atau glyph (render-deps kosong).
import type { LakarDocument } from '@lakar/schema';

export const SLUG = 'demo';
export const BOARD = 'Board001';
export const CARD = 'Card0001';

/** Frame tambahan; `children` = frame bersarang (mis. seksi baru berisi kartu, spec-progressive-live-build). */
export type Extra = { id: string; name: string; x: number; y: number; width: number; height: number; children?: Extra[] };

const frame = (n: Extra): Record<string, unknown> => ({ type: 'frame', position: 'absolute', ...n, fills: [{ type: 'solid', color: '#0E7490' }], children: (n.children ?? []).map(frame) });

/** Dokumen rev `rev`; `extra` = frame tambahan di board (mis. node baru dari execute agen). */
export function makeDoc(rev = 1, extra: Extra[] = []): LakarDocument {
  return {
    schemaVersion: 10,
    id: 'Doc00001',
    rev,
    tokens: {},
    pages: [
      {
        id: 'Page0001',
        name: 'Page',
        children: [
          {
            type: 'board',
            id: BOARD,
            name: 'Hero',
            x: 0,
            y: 0,
            width: 400,
            height: 300,
            screen: 'landing',
            children: [frame({ id: CARD, name: 'Card', x: 20, y: 20, width: 120, height: 80 }), ...extra.map(frame)],
          },
        ],
      },
    ],
  } as unknown as LakarDocument;
}

/** Board kanvas (bentuk `CanvasBoard`) untuk `makeDoc`. */
export const BOARDS = [{ id: BOARD, name: 'Hero', x: 0, y: 0, width: 400, height: 300 }];
