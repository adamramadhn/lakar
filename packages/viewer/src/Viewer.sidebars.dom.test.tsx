// Sidebar Viewer yang bisa dilipat (spec-viewer-collapsible-panels): toggle per sisi, shortcut (bukan saat mengetik),
// state tersimpan, reduced motion instan. Tab Checks dan marker check sudah dihapus (spec-viewer-merged-design-tab).
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dom, reducedMotion, renderUi } from './test/dom';
import { BOARD, makeDoc, SLUG } from './test/fixtures';
import { EXPAND_MS, SIDEBARS_KEY } from './sidebars';
import { Viewer } from './Viewer';

function routes() {
  const d = dom().daemon;
  d.on('GET', `/viewer/docs/${SLUG}`, () => ({ doc: makeDoc(1) }));
  d.on('POST', '/sessions', () => ({ sessionId: 'sess-1' }));
  d.on('POST', '/docs/open', () => ({ rev: 1 }));
}

async function openViewer() {
  routes();
  const view = renderUi(<Viewer slug={SLUG} />);
  await waitFor(() => expect(document.querySelector(`[data-layer="${BOARD}"]`)).not.toBeNull());
  return view;
}

const viewer = () => document.querySelector('.viewer')!;
const toggle = (side: 'left' | 'right') => document.querySelector<HTMLButtonElement>(`.panel-toggle.${side}`)!;
const key = (target: Element | Window, code: string, mods: { altKey?: boolean } = {}) =>
  fireEvent.keyDown(target, { key: code === 'Backslash' ? '\\' : code === 'BracketLeft' ? '[' : ']', code, ctrlKey: true, ...mods });

describe('Viewer — tab Checks dihapus', () => {
  it('panel kanan hanya punya Activity, Design, History; canvas tanpa marker check', async () => {
    await openViewer();
    const tabs = [...document.querySelectorAll('.side-panel .panel-tab, [role="tab"]')].map((t) => t.textContent);
    expect(tabs).not.toContain('Checks');
    expect(document.querySelector('.finding-marker')).toBeNull();
    expect(document.querySelector('.marker-layer')).toBeNull();
    expect(dom().daemon.find('POST', '/layout-check')).toHaveLength(0);
  });
});

describe('Viewer — sidebar yang bisa dilipat', () => {
  it('toggle kiri: collapse langsung melayang + slide; expand melayang sampai slide selesai lalu kolom dibuka', async () => {
    const { user } = await openViewer();
    expect(viewer()).not.toHaveClass('left-collapsed');
    expect(toggle('left')).toHaveAccessibleName('Hide left sidebar');
    expect(toggle('left')).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle('left'));
    expect(viewer()).toHaveClass('left-collapsed', 'left-float');
    expect(viewer()).not.toHaveClass('panels-instant');
    expect(toggle('left')).toHaveAccessibleName('Show left sidebar');
    expect(toggle('left')).toHaveAttribute('aria-expanded', 'false');
    expect(viewer()).not.toHaveClass('right-collapsed');

    await user.click(toggle('left'));
    expect(viewer()).not.toHaveClass('left-collapsed');
    // Panel masih slide masuk di atas kanvas; kolom grid dibuka sesudah EXPAND_MS.
    expect(viewer()).toHaveClass('left-float');
    await waitFor(() => expect(viewer()).not.toHaveClass('left-float'), { timeout: EXPAND_MS + 500 });
  });

  it('toggle kanan ada di grup kanan atas kanvas dan melipat panel kanan saja', async () => {
    const { user } = await openViewer();
    expect(toggle('right').closest('.canvas-actions')).not.toBeNull();
    await user.click(toggle('right'));
    expect(viewer()).toHaveClass('right-collapsed', 'right-float');
    expect(viewer()).not.toHaveClass('left-collapsed');
    expect(toggle('right')).toHaveAccessibleName('Show right sidebar');
    await user.click(toggle('right'));
    expect(viewer()).not.toHaveClass('right-collapsed');
  });

  it('toggle lagi di tengah slide masuk: berbalik tanpa menunggu (interruptible)', async () => {
    const { user } = await openViewer();
    await user.click(toggle('right'));
    await user.click(toggle('right'));
    expect(viewer()).toHaveClass('right-float');
    await user.click(toggle('right'));
    expect(viewer()).toHaveClass('right-collapsed', 'right-float');
    // Timer expand yang dibatalkan tidak membuka kolom belakangan.
    await new Promise((r) => setTimeout(r, EXPAND_MS + 50));
    expect(viewer()).toHaveClass('right-collapsed', 'right-float');
  });

  it('Ctrl+\\ melipat/membuka keduanya, Ctrl+Alt+[ / ] satu sisi; shortcut instan', async () => {
    await openViewer();
    key(window, 'Backslash');
    expect(viewer()).toHaveClass('left-collapsed', 'right-collapsed', 'panels-instant');
    key(window, 'Backslash');
    expect(viewer()).not.toHaveClass('left-collapsed');
    expect(viewer()).not.toHaveClass('right-collapsed');
    // Instan: tidak ada fase slide masuk.
    expect(viewer()).not.toHaveClass('left-float');
    expect(viewer()).not.toHaveClass('right-float');

    key(window, 'BracketLeft', { altKey: true });
    expect(viewer()).toHaveClass('left-collapsed');
    expect(viewer()).not.toHaveClass('right-collapsed');
    key(window, 'BracketRight', { altKey: true });
    expect(viewer()).toHaveClass('right-collapsed');
  });

  it('shortcut tidak berlaku saat mengetik di kolom input', async () => {
    const { user } = await openViewer();
    await user.click(screen.getByRole('tab', { name: 'Assets' }));
    const input = screen.getByRole('searchbox', { name: 'Search components' });
    input.focus();
    key(input, 'Backslash');
    key(input, 'BracketLeft', { altKey: true });
    expect(viewer()).not.toHaveClass('left-collapsed');
    expect(viewer()).not.toHaveClass('right-collapsed');
  });

  it('state tersimpan dan dipulihkan saat Viewer dibuka lagi', async () => {
    const { user, unmount } = await openViewer();
    await user.click(toggle('left'));
    expect(JSON.parse(localStorage.getItem(SIDEBARS_KEY)!)).toEqual({ left: true, right: false });
    unmount();
    renderUi(<Viewer slug={SLUG} />);
    await waitFor(() => expect(document.querySelector('.viewer')).not.toBeNull());
    expect(viewer()).toHaveClass('left-collapsed');
    expect(viewer()).not.toHaveClass('right-collapsed');
    expect(toggle('left')).toHaveAccessibleName('Show left sidebar');
  });

  it('localStorage rusak → kedua sidebar terbuka', async () => {
    localStorage.setItem(SIDEBARS_KEY, '{nope');
    await openViewer();
    expect(viewer()).not.toHaveClass('left-collapsed');
    expect(viewer()).not.toHaveClass('right-collapsed');
  });

  it('reduced motion: tombol juga instan (tanpa fase slide, tanpa FLIP)', async () => {
    reducedMotion(true);
    const { user } = await openViewer();
    await user.click(toggle('left'));
    expect(viewer()).toHaveClass('left-collapsed', 'panels-instant');
    await user.click(toggle('left'));
    expect(viewer()).not.toHaveClass('left-collapsed');
    expect(viewer()).not.toHaveClass('left-float');
    expect(dom().animate.mock.contexts.some((el) => (el as Element).matches('.view-controls, .canvas-actions'))).toBe(false);
  });
});
