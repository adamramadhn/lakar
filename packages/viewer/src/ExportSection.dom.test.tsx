// Seksi Export di tab Design (spec-viewer-merged-design-tab): preset PNG/SVG per layer terpilih,
// tujuan = folder + nama yang bisa diketik (route /viewer/docs/:slug/export-file), dan row "Export code…".
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExportSection } from './ExportSection';
import { dom, renderUi } from './test/dom';

const SEL = { boardId: 'Board001', nodeId: 'Frame01', name: 'Card Item' };

function renderSection(sel: typeof SEL | undefined, onExportCode?: () => void) {
  return renderUi(<ExportSection slug="doc" sel={sel} onExportCode={onExportCode} />);
}

describe('ExportSection — preset + save ke path', () => {
  it('tanpa seleksi: tombol Export nonaktif; dengan seleksi: dua preset default (PNG 2x, SVG 1x)', () => {
    const off = renderSection(undefined);
    expect((off.getByRole('button', { name: /Export selection/ }) as HTMLButtonElement).disabled).toBe(true);
    off.unmount();

    const t = renderSection(SEL);
    expect((t.getByRole('button', { name: /Export Card Item/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(t.getAllByLabelText('Format').map((s) => (s as HTMLSelectElement).value)).toEqual(['png', 'svg']);
    // Nama file mengikuti nama layer (di-slugify).
    expect((t.getByLabelText('File name') as HTMLInputElement).value).toBe('card-item');
  });

  it('klik Export → POST /export-file per preset dengan dir+name+scale+format; status menampilkan path tersimpan', async () => {
    const t = renderSection(SEL);
    dom().daemon.on('POST', /^\/viewer\/docs\/doc\/export-file$/, (req) => {
      const b = req.body as { name: string };
      return { path: `/home/u/Downloads/${b.name}.x`, bytes: 1, dropped: [] };
    });
    const folder = t.getByLabelText('Save folder');
    await t.user.clear(folder);
    await t.user.type(folder, '/tmp/out');
    await t.user.click(t.getByRole('button', { name: /Export Card Item/ }));
    await waitFor(() => expect(dom().daemon.find('POST', '/viewer/docs/doc/export-file')).toHaveLength(2));
    const bodies = dom().daemon.find('POST', '/viewer/docs/doc/export-file').map((r) => r.body as Record<string, unknown>);
    expect(bodies[0]).toMatchObject({ boardId: 'Board001', nodeId: 'Frame01', scale: 2, format: 'png', dir: '/tmp/out', name: 'card-item@2x' });
    expect(bodies[1]).toMatchObject({ boardId: 'Board001', nodeId: 'Frame01', scale: 1, format: 'svg', dir: '/tmp/out', name: 'card-item' });
    await t.findByRole('status');
  });

  it('error route → pesan AD-11 tampil; Export code… memanggil callback', async () => {
    const onCode = vi.fn();
    const t = renderSection(SEL, onCode);
    await t.user.click(t.getByRole('button', { name: /Export Card Item/ }));
    await t.findByRole('alert');
    await t.user.click(t.getByRole('button', { name: 'Export code…' }));
    expect(onCode).toHaveBeenCalledTimes(1);
  });
});
