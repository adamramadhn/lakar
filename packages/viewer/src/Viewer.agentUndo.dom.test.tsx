// Undo agen dari luar (spec-agent-undo): call `undo` agen selesai dengan rev baru → Viewer memuat ulang dokumen (node
// agen hilang) dan menampilkan baris Activity "Undo: …"; tumpukan undo jendela ini (edit pengguna sebelumnya) tetap
// utuh, jadi Ctrl+Z sesudahnya masih mengirim invers milik pengguna (AD-8).
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { dom, renderUi, stream } from './test/dom';
import { BOARD, CARD, makeDoc, SLUG } from './test/fixtures';
import { Viewer } from './Viewer';

const PASTED = { id: 'Svg00001', name: 'SVG', x: 10, y: 10, width: 10, height: 10 };
const AGENT = { id: 'Agent001', name: 'Agent card', x: 200, y: 20, width: 120, height: 80 };
const session = { id: 's1', client: 'lakar-mcp', agent: 'claude-code', createdAt: new Date().toISOString(), executes: 1 };

const layer = (id: string) => document.querySelector<HTMLElement>(`[data-layer="${id}"]`);

const call = (callId: string, tool: string, rev: number, extra: Record<string, unknown> = {}) => ({
  callId,
  session: 's1',
  client: 'lakar-mcp',
  agent: 'claude-code',
  tool,
  slug: SLUG,
  status: 'done',
  startedAt: new Date().toISOString(),
  durationMs: 20,
  rev,
  ...extra,
});

function paste(text: string) {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', { value: { files: [], getData: (t: string) => (t === 'text/plain' ? text : '') } });
  act(() => {
    document.body.dispatchEvent(ev);
  });
}

describe('Viewer — undo agen dari luar', () => {
  it('rev undo agen dimuat ulang; tumpukan undo pengguna tetap utuh', async () => {
    const d = dom().daemon;
    let rev = 1;
    const docAt = (r: number) => (r === 1 ? makeDoc(1) : r === 3 ? makeDoc(3, [PASTED, AGENT]) : makeDoc(r, [PASTED]));
    d.on('GET', `/viewer/docs/${SLUG}`, () => ({ doc: docAt(rev) }));
    d.on('GET', `/viewer/docs/${SLUG}/history`, () => ({ entries: [] }));
    d.on('POST', `/viewer/docs/${SLUG}/paste`, () => {
      rev = 2;
      return { slug: SLUG, rev: 2, created: [{ id: PASTED.id, name: PASTED.name, path: [] }], inverse: [{ op: 'remove', id: PASTED.id }], refs: {}, nodeId: PASTED.id, report: { kind: 'svg', paths: 1, kept: [], dropped: [] } };
    });
    d.on('POST', `/viewer/docs/${SLUG}/ops`, () => {
      rev = 5;
      return { slug: SLUG, rev: 5, created: [], inverse: [{ op: 'insert', parentId: BOARD, index: 1, node: PASTED }], refs: {} };
    });
    const v = renderUi(<Viewer slug={SLUG} />);
    await waitFor(() => expect(layer(BOARD)).not.toBeNull());
    stream.hello({ sessions: [session] });

    // Edit pengguna: paste SVG ke Card → entri undo jendela ini.
    await v.user.click(layer(CARD)!);
    paste('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>');
    await waitFor(() => expect(layer(PASTED.id)).not.toBeNull());

    // Agen: execute (rev 3) lalu undo (rev 4) dari luar jendela ini.
    rev = 3;
    stream.event('call', { call: call('c1', 'execute', 3, { description: 'add agent card', boards: [BOARD] }) });
    await waitFor(() => expect(layer(AGENT.id)).not.toBeNull());
    rev = 4;
    stream.event('call', { call: call('c2', 'undo', 4, { description: 'Undo: add agent card', boards: [BOARD] }) });
    await waitFor(() => expect(layer(AGENT.id)).toBeNull());
    expect(layer(PASTED.id)).not.toBeNull();
    expect(screen.getByText('Undo: add agent card')).toBeInTheDocument();

    // Ctrl+Z pengguna sesudahnya tetap membatalkan paste pengguna (invers milik jendela ini).
    await v.user.click(layer(BOARD)!);
    await v.user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(d.find('POST', `/viewer/docs/${SLUG}/ops`)).toHaveLength(1));
    expect(d.find('POST', `/viewer/docs/${SLUG}/ops`)[0]!.body).toMatchObject({ ops: [{ op: 'remove', id: PASTED.id }] });
  });
});
