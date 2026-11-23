// Panel Activity (spec-canvas-agent-effects): baris yang tiba sesudah panel terbuka masuk dengan `chunk-in`; baris
// yang sudah ada saat dibuka atau tiba lewat snapshot saat (ulang) tersambung tidak dianimasikan.
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityCall, SessionView } from './activity';
import { ActivityPanel } from './ActivityPanel';
import { renderUi } from './test/dom';

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const call = (callId: string, tool: string, extra: Partial<ActivityCall> = {}): ActivityCall => ({
  callId,
  session: 's1',
  client: 'lakar-mcp',
  agent: 'claude-code',
  tool,
  slug: 'demo',
  status: 'done',
  startedAt: iso(2_000),
  durationMs: 100,
  ...extra,
});

/** Sesi Live dengan call terbaru dulu (bentuk `sessionsForSlug`). */
const view = (calls: ActivityCall[]): SessionView => ({
  session: { id: 's1', client: 'lakar-mcp', agent: 'claude-code', createdAt: iso(60_000), executes: 0 },
  calls,
  live: true,
  running: false,
  lastCallAt: NOW - 1_000,
});

const panel = (views: SessionView[], connected = true) => <ActivityPanel views={views} connected={connected} follow={false} onFollow={vi.fn()} nameOf={() => undefined} />;

/** Baris Tool Call berdasarkan judul (`callTitle`). */
const row = (title: string) => screen.getByText(title).closest('.tool-call') as HTMLElement;

describe('ActivityPanel — entri baris (terminal-chunk-in)', () => {
  it('baris yang sudah ada saat panel dibuka tidak dianimasikan; baris yang tiba sesudahnya dianimasikan', () => {
    const first = call('c1', 'read_skill', { target: 'core' });
    const { rerender } = renderUi(panel([view([first])]));
    expect(row('Load core skill')).not.toHaveClass('chunk-in');

    const next = call('c2', 'screenshot', { target: 'Hero' });
    rerender(panel([view([next, first])]));
    expect(row('Screenshot Hero')).toHaveClass('chunk-in');
    expect(row('Load core skill')).not.toHaveClass('chunk-in');
  });

  it('call yang tiba lewat snapshot saat tersambung ulang tidak dianimasikan', () => {
    const first = call('c1', 'read_skill', { target: 'core' });
    const { rerender } = renderUi(panel([view([first])], false));
    // Snapshot `hello` membawa call yang terjadi selama putus, dirender saat masih belum tersambung.
    const missed = call('c2', 'layout_check');
    rerender(panel([view([missed, first])], false));
    rerender(panel([view([missed, first])], true));
    expect(row('Check all boards')).not.toHaveClass('chunk-in');

    const live = call('c3', 'inspect', { target: 'Card' });
    rerender(panel([view([live, missed, first])], true));
    expect(row('Inspect Card')).toHaveClass('chunk-in');
  });

  it('sesi Live menampilkan nama harness dan badge Live; Follow agent memanggil onFollow', async () => {
    const onFollow = vi.fn();
    const { user } = renderUi(<ActivityPanel views={[view([call('c1', 'read_skill')])]} connected follow={false} onFollow={onFollow} nameOf={() => undefined} />);
    const card = screen.getByText('Claude Code').closest('section')!;
    expect(within(card).getByText('Live')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Follow agent' }));
    expect(onFollow).toHaveBeenCalledWith(true);
  });
});
