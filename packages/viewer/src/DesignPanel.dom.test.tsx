// Panel Design — baris Wrap + Row gap di grup Auto layout (v9, epic adopsi-open-pencil, desain Section 11
// PU4cd/oMWUS): Segmented "No wrap/Wrap" → op `update {wrap:true}` / `{wrap:null}` (hapus), Field "Row gap" → `rowGap`.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DesignTarget, Raw } from './designModel.js';
import { DesignPanel } from './DesignPanel';
import { renderUi } from './test/dom';

const t = (id: string, stored: Raw, extra: Partial<DesignTarget> = {}): DesignTarget => ({
  id,
  type: 'frame',
  name: id,
  stored: { id, type: 'frame', name: id, ...stored },
  resolved: { id, type: 'frame', name: id, ...stored },
  parentLayout: 'column',
  ...extra,
});

function panel(targets: DesignTarget[], editable = true) {
  const onCommit = vi.fn(async () => true);
  renderUi(<DesignPanel targets={targets} path={['Board', 'Frame']} editable={editable} fonts={[]} inspectNode={undefined} rev={1} onCommit={onCommit} />);
  return onCommit;
}

describe('DesignPanel — Wrap (v9)', () => {
  it('frame row: kontrol Wrap + Row gap tampil; Wrap → op {wrap:true}', async () => {
    const onCommit = panel([t('a', { layout: 'row' })]);
    expect(screen.getByRole('group', { name: 'Wrap' })).toBeDefined();
    expect(screen.getByLabelText('Row gap')).toBeDefined();
    // Belum wrap → segmen "No wrap" aktif.
    expect(screen.getByRole('button', { name: 'No wrap' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Wrap' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Wrap' }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith([{ op: 'update', id: 'a', patch: { wrap: true } }], 'Change wrap'));
  });

  it('frame wrap:true → "No wrap" menulis {wrap:null} (properti dihapus, bukan false)', async () => {
    const onCommit = panel([t('a', { layout: 'row', wrap: true })]);
    expect(screen.getByRole('button', { name: 'Wrap' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'No wrap' }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith([{ op: 'update', id: 'a', patch: { wrap: null } }], 'Change wrap'));
  });

  it('Field "Row gap" meng-commit rowGap (nilai awal = axisGapOf: rowGap ?? gap ?? 0)', async () => {
    const onCommit = panel([t('a', { layout: 'row', gap: 12 })]);
    const input = screen.getByLabelText('Row gap') as HTMLInputElement;
    expect(input.value).toBe('12');
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.blur(input);
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith([{ op: 'update', id: 'a', patch: { rowGap: 20 } }], 'Change row gap'));
  });

  it('seleksi campuran non-grid: baris Wrap tampil tanpa nilai aktif (mixed)', () => {
    panel([t('a', { layout: 'row' }), t('b', { layout: 'column', wrap: true })]);
    expect(screen.getByRole('group', { name: 'Wrap' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Wrap' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'No wrap' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('frame grid murni: baris Wrap tersembunyi', () => {
    panel([t('g', { layout: 'grid' })]);
    expect(screen.queryByRole('group', { name: 'Wrap' })).toBeNull();
  });

  it('frame tanpa auto layout (none): baris Wrap tersembunyi', () => {
    panel([t('n', {})]);
    expect(screen.queryByRole('group', { name: 'Wrap' })).toBeNull();
  });

  it('ganti direction ke none ikut mengirim wrap:null', async () => {
    const onCommit = panel([t('a', { layout: 'row', wrap: true })]);
    fireEvent.click(screen.getByRole('button', { name: 'No auto layout' }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith([{ op: 'update', id: 'a', patch: { layout: null, wrap: null } }], 'Change layout direction'));
  });

  it('ganti direction ke grid ikut mengirim wrap:null', async () => {
    const onCommit = panel([t('a', { layout: 'row', wrap: true })]);
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith([{ op: 'update', id: 'a', patch: { layout: 'grid', wrap: null, gridTemplateColumns: [{ fr: 1 }] } }], 'Change layout direction'));
  });
});
