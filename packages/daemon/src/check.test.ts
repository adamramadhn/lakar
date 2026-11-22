// Pipeline check daemon (AD-8) dengan RenderPort tiruan: temuan LC-32 dari `resolveDocument` sampai ke hasil `runCheck`
// (laporan ekspansi dibawa objek hasil yang sama, AD-10/AD-12).
import { describe, expect, it } from 'vitest';
import type { BoardMeasure, RenderPort } from '@lakar/ports';
import { LakarDocument, SCHEMA_VERSION, resolveDocument, type ResolvedDocument } from '@lakar/schema';
import { runCheck } from './check.js';

const stored = LakarDocument.parse({
  schemaVersion: SCHEMA_VERSION,
  id: 'Docu0001',
  rev: 1,
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
          children: [
            {
              type: 'frame',
              id: 'Mst00001',
              name: 'Kartu',
              layout: 'column',
              component: { props: [], slots: [] },
              children: [{ type: 'text', id: 'Txt00001', name: 'Teks', content: 'Halo', size: 14, color: '#101828' }],
            },
            { type: 'instance', id: 'Ins00001', name: 'Kartu / A', componentId: 'Mst00001', overrides: { Gone0001: { content: 'x' } } },
          ],
        },
      ],
    },
  ],
});

const measure: BoardMeasure = {
  width: 390,
  height: 844,
  nodes: [
    { id: 'Mst00001', x: 0, y: 0, width: 390, height: 44 },
    { id: 'Txt00001', x: 12, y: 12, width: 100, height: 20 },
    { id: 'Ins00001', x: 0, y: 60, width: 390, height: 44 },
    { id: 'Ins00001/Txt00001', x: 12, y: 72, width: 100, height: 20 },
  ],
  texts: [],
};

describe('runCheck', () => {
  it('override yatim muncul sebagai LC-32 warning di hasil check daemon; gerbang 0', async () => {
    const seen: string[] = [];
    const render = {
      measure: async (doc: ResolvedDocument, boardId: string) => {
        seen.push(boardId);
        expect(doc.pages[0]!.children[0]!.children.map((n) => n.id)).toEqual(['Mst00001', 'Ins00001']);
        return measure;
      },
    } as unknown as RenderPort<ResolvedDocument>;
    const ran = await runCheck(render, resolveDocument(stored), ['Brd00001']);
    expect(seen).toEqual(['Brd00001']);
    expect(ran.findings.filter((f) => f.rule === 'LC-32')).toEqual([expect.objectContaining({ level: 'warning', nodeId: 'Ins00001', nodeName: 'Kartu / A' })]);
    expect(ran.boards[0]!.summary.gate).toBe(0);
  });
});
