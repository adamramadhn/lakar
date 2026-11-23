// Panel Activity di Viewer dengan stream nyata lewat activityHub (spec-canvas-agent-effects): baris yang tiba sesudah
// panel terbuka masuk dengan `chunk-in`; baris dari snapshot `hello` (buka atau reconnect) tidak dianimasikan.
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dom, FakeEventSource, nextSeq, renderUi, stream } from './test/dom';
import { BOARD, makeDoc, SLUG } from './test/fixtures';
import { Viewer } from './Viewer';

const session = { id: 's1', client: 'lakar-mcp', agent: 'claude-code', createdAt: new Date().toISOString(), executes: 0 };

/** Call selesai pada dokumen ini; `title` = judul baris (`callTitle`). */
const call = (callId: string, tool: string, target?: string) => ({
  callId,
  session: 's1',
  client: 'lakar-mcp',
  agent: 'claude-code',
  tool,
  slug: SLUG,
  status: 'done',
  startedAt: new Date().toISOString(),
  durationMs: 50,
  ...(target ? { target } : {}),
});
const callEvent = (c: ReturnType<typeof call>) => ({ seq: nextSeq(), type: 'call', call: c });

const row = (title: string) => screen.getByText(title).closest('.tool-call');

async function openViewer() {
  dom().daemon.on('GET', `/viewer/docs/${SLUG}`, () => ({ doc: makeDoc(1) }));
  const view = renderUi(<Viewer slug={SLUG} />);
  await waitFor(() => expect(document.querySelector(`[data-layer="${BOARD}"]`)).not.toBeNull());
  return view;
}

describe('Viewer — baris Activity', () => {
  it('panel dibuka kosong: call pertama yang tiba sesudahnya dianimasikan', async () => {
    await openViewer();
    stream.hello({ sessions: [session] });
    stream.event('call', { call: call('c1', 'read_skill', 'core') });
    expect(row('Load core skill')).toHaveClass('chunk-in');
  });

  it('call di snapshot hello saat dibuka tidak dianimasikan; call baru sesudahnya dianimasikan', async () => {
    await openViewer();
    stream.hello({ sessions: [session], recent: [callEvent(call('c1', 'read_skill', 'core'))] });
    expect(row('Load core skill')).not.toHaveClass('chunk-in');
    stream.event('call', { call: call('c2', 'inspect', 'Card') });
    expect(row('Inspect Card')).toHaveClass('chunk-in');
  });

  it('reconnect: call yang terlewat selama putus (snapshot hello kedua) tidak dianimasikan', async () => {
    await openViewer();
    const c1 = call('c1', 'read_skill', 'core');
    stream.hello({ sessions: [session], recent: [callEvent(c1)] });
    const first = stream.current();
    stream.drop();
    await waitFor(() => expect(FakeEventSource.instances.filter((s) => !s.closed && s !== first)).toHaveLength(1), { timeout: 2_500 });
    stream.hello({ sessions: [session], recent: [callEvent(c1), callEvent(call('c2', 'layout_check'))] });
    expect(row('Check all boards')).not.toHaveClass('chunk-in');
    stream.event('call', { call: call('c3', 'inspect', 'Card') });
    expect(row('Inspect Card')).toHaveClass('chunk-in');
  });
});
