// Kerangka App (spec-agent-open-doc): event stream `openTab` membuka dokumen baru di jendela ini (location.hash), dan
// reporter fokus melaporkan dokumen yang tampil lewat PUT /viewer/focus (mount, pindah dokumen, reconnect stream).
import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from './api';
import { App } from './App';
import { docHash } from './files';
import { dom, FakeEventSource, renderUi, stream } from './test/dom';
import { makeDoc } from './test/fixtures';

/** Daemon tiruan minimum untuk App + Dashboard + Viewer. */
function daemon() {
  const d = dom().daemon;
  d.on('GET', '/viewer/docs', () => ({ docs: [] }));
  d.on('GET', '/viewer/archive', () => ({ docs: [] }));
  d.on('GET', '/viewer/folders', () => ({ folders: [], membership: {} }));
  d.on('GET', /^\/viewer\/docs\/([^/]+)$/, (_req, m) => ({ doc: { ...makeDoc(1), id: `Doc-${m[1]}` } }));
  d.on('PUT', '/viewer/focus', (req) => ({ slug: (req.body as { slug: string | null }).slug, focused: null }));
  return d;
}
const focusBodies = () => dom().daemon.find('PUT', '/viewer/focus').map((r) => (r.body as { slug: string | null }).slug);

describe('App — openTab dari agen', () => {
  it('openTab untuk jendela ini (atau tanpa origin) membuka dokumen sebagai tab aktif', async () => {
    daemon();
    location.hash = '#/';
    renderUi(<App />);
    stream.hello();
    stream.event('openTab', { openTab: { slug: 'landing-baru' } });
    expect(location.hash).toBe(docHash('landing-baru'));
    await waitFor(() => expect(document.title).toBe('landing-baru · Lakar'));

    stream.event('openTab', { openTab: { slug: 'kedua', origin: api.origin } });
    expect(location.hash).toBe(docHash('kedua'));
  });

  it('openTab untuk jendela lain diabaikan', () => {
    daemon();
    location.hash = '#/';
    renderUi(<App />);
    stream.hello();
    stream.event('openTab', { openTab: { slug: 'bukan-untukku', origin: 'jendela-lain' } });
    expect(location.hash).toBe('#/');
  });

  it('stream membawa origin jendela (?origin=) supaya openTab hanya menuju jendela yang hidup', () => {
    daemon();
    renderUi(<App />);
    expect(stream.current().url).toBe(`/viewer/events?origin=${encodeURIComponent(api.origin)}`);
  });
});

describe('App — reporter fokus (PUT /viewer/focus)', () => {
  it('melapor null di Dashboard, slug saat dokumen dibuka, dan ulang sesudah stream tersambung lagi', async () => {
    daemon();
    location.hash = '#/';
    renderUi(<App />);
    await waitFor(() => expect(focusBodies()).toEqual([null]));
    stream.hello();

    location.hash = docHash('demo');
    await waitFor(() => expect(focusBodies()).toEqual([null, 'demo']));
    // Semua laporan membawa id jendela (daemon menyimpan fokus per origin).
    expect(dom().daemon.find('PUT', '/viewer/focus').every((r) => r.headers['x-lakar-origin'] === api.origin)).toBe(true);

    // Stream putus → hub menyambung ulang sesudah backoff 1 dtk; hello kedua = reconnect → lapor ulang.
    const first = stream.current();
    stream.drop();
    await waitFor(() => expect(FakeEventSource.instances.filter((s) => !s.closed && s !== first)).toHaveLength(1), { timeout: 2_500 });
    stream.hello();
    await waitFor(() => expect(focusBodies()).toEqual([null, 'demo', 'demo']));
  });

  it('jendela aktif lagi (focus) → lapor ulang dokumen yang tampil', async () => {
    daemon();
    location.hash = docHash('demo');
    renderUi(<App />);
    await waitFor(() => expect(focusBodies()).toEqual(['demo']));
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(focusBodies()).toEqual(['demo', 'demo']));
  });
});
