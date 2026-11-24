// Header panel Theme (Section 11, story 9): menu Import (CSS variables, DTCG tokens) dan Export
// (Copy tokens as CSS, Export DTCG JSON, Copy DTCG JSON).
import { describe, expect, it, vi } from 'vitest';
import type { DocOp, LakarDocument } from '@lakar/schema';
import { dtcgTokensJson } from '@lakar/codegen';
import { renderUi } from './test/dom';
import { ThemePanel } from './ThemePanel';

const DOC = {
  schemaVersion: 8,
  id: 'Doc00001',
  rev: 1,
  pages: [{ id: 'Page0001', name: 'Page', children: [] }],
  tokenModes: ['light', 'dark'],
  tokens: {
    'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F' } },
    'radius.md': { type: 'radius', value: 12 },
  },
} as unknown as LakarDocument;

function renderPanel() {
  const onCommit = vi.fn(async (_ops: DocOp[], _label: string) => true);
  const onImportCss = vi.fn();
  const onImportDtcg = vi.fn();
  const onClose = vi.fn();
  const ui = renderUi(<ThemePanel doc={DOC} rev={1} editable onCommit={onCommit} onClose={onClose} onImportCss={onImportCss} onImportDtcg={onImportDtcg} />);
  return { onCommit, onImportCss, onImportDtcg, onClose, ...ui };
}

describe('ThemePanel: menu Import/Export', () => {
  it('menu Import: dua item (CSS variables…, DTCG tokens (.json)…) yang memanggil callback masing-masing', async () => {
    const t = renderPanel();
    await t.user.click(t.getByRole('button', { name: /^Import/ }));
    const css = t.getByRole('menuitem', { name: 'CSS variables…' });
    t.getByRole('menuitem', { name: 'DTCG tokens (.json)…' });
    await t.user.click(css);
    expect(t.onImportCss).toHaveBeenCalledTimes(1);
    expect(t.onImportDtcg).not.toHaveBeenCalled();
    await t.user.click(t.getByRole('button', { name: /^Import/ }));
    await t.user.click(t.getByRole('menuitem', { name: 'DTCG tokens (.json)…' }));
    expect(t.onImportDtcg).toHaveBeenCalledTimes(1);
  });

  it('menu Export: Copy tokens as CSS membuka popover; Copy DTCG JSON menyalin byte codegen', async () => {
    const t = renderPanel();
    await t.user.click(t.getByRole('button', { name: /^Export/ }));
    for (const name of ['Copy tokens as CSS', 'Export DTCG JSON', 'Copy DTCG JSON']) {
      expect(t.getByRole('menuitem', { name })).toBeTruthy();
    }
    await t.user.click(t.getByRole('menuitem', { name: 'Copy tokens as CSS' }));
    expect(t.getByRole('dialog', { name: 'Copy tokens' })).toBeTruthy();
    await t.user.click(t.getByRole('button', { name: /^Export/ }));
    await t.user.click(t.getByRole('menuitem', { name: 'Copy DTCG JSON' }));
    expect(await navigator.clipboard.readText()).toBe(dtcgTokensJson(DOC));
  });
});
