// Tab History — versi bernama (spec-viewer-named-versions): tombol "Name" membuka input inline → POST /versions;
// chip label tampil di entri bertag dan ×-nya → DELETE /versions/:rev.
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HistoryPanel } from './HistoryPanel';
import { dom, renderUi } from './test/dom';

const SLUG = 'doc';
const ENTRIES = [
  { rev: 3, description: 'Add cards', opsSummary: 'add×3', opCount: 3, at: '2026-01-02T10:00:00Z', session: 'sess-111', snapshot: true },
  { rev: 2, description: 'Rename board', opsSummary: 'rename×1', opCount: 1, at: '2026-01-02T09:00:00Z', session: 'sess-111', snapshot: true },
];

function panel(entries = ENTRIES) {
  dom().daemon.on('GET', `/viewer/docs/${SLUG}/history`, () => ({ entries }));
  return renderUi(<HistoryPanel slug={SLUG} rev={3} onPreview={vi.fn()} onRestore={vi.fn()} />);
}

describe('HistoryPanel — versi bernama', () => {
  it('entri terkini → "Name" membuka input; simpan → POST /versions dengan nama; daftar dimuat ulang', async () => {
    const t = panel();
    await t.findByText('Add cards');
    await t.user.click(screen.getByRole('button', { name: /^Name$/ }));
    const input = screen.getByRole('textbox', { name: 'Version name' });
    await t.user.type(input, 'v1 — ready{Enter}');
    await waitFor(() => expect(dom().daemon.find('POST', `/viewer/docs/${SLUG}/versions`)).toHaveLength(1));
    expect(dom().daemon.find('POST', `/viewer/docs/${SLUG}/versions`)[0]!.body).toEqual({ name: 'v1 — ready', rev: 3 });
  });

  it('entri bertag → chip label tampil; klik × → DELETE /versions/:rev', async () => {
    const t = panel([{ ...ENTRIES[0]!, label: 'v1 final' }, ENTRIES[1]!]);
    await t.findByText('v1 final');
    await t.user.click(screen.getByRole('button', { name: 'Remove version name v1 final' }));
    await waitFor(() => expect(dom().daemon.find('DELETE', `/viewer/docs/${SLUG}/versions/3`)).toHaveLength(1));
    // Entri bertag menampilkan "Rename", bukan "Name".
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy();
  });
});
