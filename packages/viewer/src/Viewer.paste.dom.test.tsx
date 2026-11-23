// Wiring paste Viewer (spec-vektor-3/4): Ctrl+V text/html atau SVG → POST /viewer/docs/:slug/paste dengan parent dari
// seleksi; HTML langsung membuka Paste Report, SVG menampilkan toast; node baru terpilih sesudah dokumen dimuat ulang.
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PasteReport } from './paste';
import { dom, renderUi } from './test/dom';
import { BOARD, CARD, makeDoc, SLUG } from './test/fixtures';
import { Viewer } from './Viewer';

const PASTED = { id: 'Html0001', name: 'Pricing', x: 10, y: 10, width: 80, height: 40 };

function daemon(report: PasteReport) {
  const d = dom().daemon;
  let rev = 1;
  d.on('GET', `/viewer/docs/${SLUG}`, () => ({ doc: rev === 1 ? makeDoc(1) : makeDoc(2, [PASTED]) }));
  d.on('GET', `/viewer/docs/${SLUG}/history`, () => ({ entries: [] }));
  d.on('POST', `/viewer/docs/${SLUG}/paste`, () => {
    rev = 2;
    return { slug: SLUG, rev: 2, created: [{ id: PASTED.id, name: PASTED.name, path: [] }], inverse: [{ op: 'remove', id: PASTED.id }], refs: {}, nodeId: PASTED.id, report };
  });
  return d;
}

/** Event `paste` jendela dengan isi clipboard (jsdom tidak punya ClipboardEvent/DataTransfer). */
function paste(data: { html?: string; text?: string }) {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', {
    value: { files: [], getData: (t: string) => (t === 'text/html' ? (data.html ?? '') : t === 'text/plain' ? (data.text ?? '') : '') },
  });
  act(() => {
    document.body.dispatchEvent(ev);
  });
  return ev;
}

const layer = (id: string) => document.querySelector<HTMLElement>(`[data-layer="${id}"]`);

async function openViewer(report: PasteReport) {
  const d = daemon(report);
  const view = renderUi(<Viewer slug={SLUG} />);
  await waitFor(() => expect(layer(BOARD)).not.toBeNull());
  return { ...view, daemon: d };
}

const HTML_REPORT: PasteReport = { kind: 'html', layers: 3, autoLayout: 1, texts: 1, images: 0, vectors: 0, dropped: [{ kind: 'element', name: 'script', count: 1 }] };

describe('Viewer — paste', () => {
  it('HTML ke frame terpilih: body kind html + parent frame, Paste Report terbuka, node baru terpilih', async () => {
    const v = await openViewer(HTML_REPORT);
    // Pilih Card lewat Layers (buka board bila tertutup).
    expect(layer(CARD)).not.toBeNull();
    await v.user.click(layer(CARD)!);
    expect(layer(CARD)).toHaveAttribute('aria-selected', 'true');

    const ev = paste({ html: '<section><h1>Pricing</h1><script>x()</script></section>', text: 'Pricing' });
    expect(ev.defaultPrevented).toBe(true);
    await waitFor(() => expect(v.daemon.find('POST', `/viewer/docs/${SLUG}/paste`)).toHaveLength(1));
    expect(v.daemon.find('POST', `/viewer/docs/${SLUG}/paste`)[0]!.body).toEqual({ content: '<section><h1>Pricing</h1><script>x()</script></section>', parentId: CARD, kind: 'html' });

    const report = await screen.findByRole('region', { name: 'Paste report' });
    expect(within(report).getByText('Not imported (1)')).toBeInTheDocument();
    await waitFor(() => expect(layer(PASTED.id)).toHaveAttribute('aria-selected', 'true'));
    // Pasted Tag (desain rkIyP) di bawah node baru selama terpilih.
    expect(await screen.findByText('Pasted · Pricing')).toBeInTheDocument();
  });

  it('SVG: toast dengan Undo paste dan Details (tanpa kind di body)', async () => {
    const v = await openViewer({ kind: 'svg', paths: 2, kept: [], dropped: [] });
    expect(layer(CARD)).not.toBeNull();
    await v.user.click(layer(CARD)!);
    paste({ text: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>' });
    await waitFor(() => expect(v.daemon.find('POST', `/viewer/docs/${SLUG}/paste`)).toHaveLength(1));
    expect(v.daemon.find('POST', `/viewer/docs/${SLUG}/paste`)[0]!.body).toEqual({ content: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>', parentId: CARD });
    const toast = await screen.findByText('Undo paste');
    expect(toast.closest('.paste-toast')).not.toBeNull();
    await v.user.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByRole('region', { name: 'Paste report' })).toBeInTheDocument();
  });

  it('tanpa seleksi: tidak ada request, toast meminta memilih board atau frame', async () => {
    const v = await openViewer(HTML_REPORT);
    paste({ html: '<p>Hi</p>' });
    expect(await screen.findByText('Select a board or frame to paste into.')).toBeInTheDocument();
    expect(v.daemon.find('POST', `/viewer/docs/${SLUG}/paste`)).toHaveLength(0);
  });

  it('teks biasa (bukan SVG/HTML) tidak dicegat', async () => {
    const v = await openViewer(HTML_REPORT);
    await v.user.click(layer(BOARD)!);
    const ev = paste({ text: 'hello' });
    expect(ev.defaultPrevented).toBe(false);
    expect(v.daemon.find('POST', `/viewer/docs/${SLUG}/paste`)).toHaveLength(0);
  });
});
