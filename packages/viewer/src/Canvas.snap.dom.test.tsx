// Snapping, smart guide, pengukur jarak Alt+hover, dan menu zoom di canvas live (desain bagian 11, layar
// fvbjN/GSpGv/pSUKZ): board yang digeser menempel ke tepi saudara dengan guide `danger`, Alt+hover menggambar
// jarak ke seleksi, dan indikator zoom membuka menu lima perintah + shortcut Ctrl+=/−, Shift+0, Shift+2.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { LakarDocument } from '@lakar/schema';
import { Canvas } from './Canvas';
import { renderUi } from './test/dom';
import { makeDoc, SLUG } from './test/fixtures';

type Props = ComponentProps<typeof Canvas>;

const B1 = 'Board001';
const B2 = 'Board002';

/** Dua board berdampingan: A 400×300 di x=0, B 400×300 di x=440 (celah 40). */
const BOARDS2 = [
  { id: B1, name: 'Hero', x: 0, y: 0, width: 400, height: 300 },
  { id: B2, name: 'Beta', x: 440, y: 0, width: 400, height: 300 },
];
const docTwo = (rev = 1): LakarDocument => {
  const doc = makeDoc(rev);
  (doc.pages[0]!.children as unknown[]).push({ type: 'board', id: B2, name: 'Beta', x: 440, y: 0, width: 400, height: 300, screen: 'landing', children: [] });
  return doc;
};

function baseProps(over: Partial<Props> = {}): Props {
  const doc = over.doc ?? makeDoc(1);
  return {
    slug: SLUG,
    rev: doc.rev,
    boards: BOARDS2,
    doc,
    camera: { x: 0, y: 0, z: 1 },
    highlight: undefined,
    onSelect: vi.fn(),
    ...over,
  };
}

const section = () => document.querySelector('section.canvas')!;
const zoomLevel = () => document.querySelector<HTMLElement>('.zoom-level')!;

function viewport(w: number, h: number) {
  const cw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => w });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => h });
  onTestFinished(() => {
    if (cw) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cw);
    if (ch) Object.defineProperty(HTMLElement.prototype, 'clientHeight', ch);
  });
}

const label = (id: string) => document.querySelector<HTMLElement>(`[data-board-label="${id}"]`)!;

describe('Canvas — snapping & smart guide (desain fvbjN)', () => {
  it('geser board B mendekati tepi kanan board A: menempel, guide tampil, commit berisi posisi snap bulat', async () => {
    const onCommit = vi.fn(async () => 2);
    renderUi(<Canvas {...baseProps({ doc: docTwo(), editable: true, selection: [B2], onCommit })} />);
    // Drag label B dari x=500 ke 456 (Δ −44): tepi kiri B di 396, ≤ 6px dari tepi kanan A (400) → snap ke 400.
    fireEvent.pointerDown(label(B2), { clientX: 500, clientY: 20, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(section(), { clientX: 458, clientY: 20, buttons: 1, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(section(), { clientX: 456, clientY: 20, buttons: 1, pointerId: 1, pointerType: 'mouse' });
    await waitFor(() => expect(document.querySelector('.snap-guide')).not.toBeNull());
    // Badge menunjukkan posisi bulat yang akan di-commit.
    expect(document.querySelector('.size-badge')?.textContent).toBe('400, 0');
    fireEvent.pointerUp(section(), { clientX: 456, clientY: 20, button: 0, pointerId: 1, pointerType: 'mouse' });
    await waitFor(() =>
      expect(onCommit).toHaveBeenCalledWith(
        [
          {
            op: 'update',
            id: B2,
            patch: { x: 400, y: 0 },
          },
        ],
        'Move Beta',
      ),
    );
    // Guide hilang sesudah gestur selesai.
    await waitFor(() => expect(document.querySelector('.snap-guide')).toBeNull());
  });
});

describe('Canvas — pengukur jarak Alt+hover (desain GSpGv)', () => {
  it('seleksi A, Alt ditahan sambil hover B: jarak 40 digambar + hint "Measuring to Beta · Alt"', async () => {
    renderUi(<Canvas {...baseProps({ doc: docTwo(), selection: [B1] })} />);
    fireEvent.pointerMove(section(), { clientX: 500, clientY: 150, buttons: 0, pointerId: 1, pointerType: 'mouse' });
    await waitFor(() => expect(document.querySelector('.edit-hover')).not.toBeNull());
    fireEvent.keyDown(document.body, { key: 'Alt' });
    await waitFor(() => expect(document.querySelector('.measure-hint')).not.toBeNull());
    expect(document.querySelector('.measure-hint')?.textContent).toBe('Measuring to Beta · Alt');
    const labels = [...document.querySelectorAll('.snap-label')].map((el) => el.textContent);
    expect(labels).toContain('40');
    expect(document.querySelectorAll('.snap-guide').length).toBeGreaterThan(0);
    // Alt dilepas → overlay ukur hilang.
    fireEvent.keyUp(document.body, { key: 'Alt' });
    await waitFor(() => expect(document.querySelector('.measure-hint')).toBeNull());
  });
});

describe('Canvas — menu zoom (desain pSUKZ)', () => {
  it('indikator zoom membuka menu lima perintah dengan label shortcut', async () => {
    const { user } = renderUi(<Canvas {...baseProps({ camera: { x: 0, y: 0, z: 2 } })} />);
    expect(zoomLevel().textContent).toContain('200%');
    await user.click(screen.getByRole('button', { name: 'Zoom 200%' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    for (const label of ['Zoom in', 'Zoom out', 'Zoom to 100%', 'Zoom to fit', 'Zoom to selection']) {
      expect(screen.getByRole('menuitem', { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(document.querySelectorAll('.menu-shortcut')).toHaveLength(5);
  });

  it('item "Zoom to 100%" dan Shift+0 menaruh cam.z = 1 dengan pusat viewport tetap', async () => {
    const { user } = renderUi(<Canvas {...baseProps({ camera: { x: 0, y: 0, z: 2 } })} />);
    await user.click(screen.getByRole('button', { name: 'Zoom 200%' }));
    await user.click(screen.getByRole('menuitem', { name: /Zoom to 100%/ }));
    await waitFor(() => expect(zoomLevel().textContent).toContain('100%'));
    // Menu tertutup sesudah item dipilih.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // Shift+0 dari zoom lain.
    fireEvent.keyDown(document.body, { key: '=', code: 'Equal', ctrlKey: true });
    await waitFor(() => expect(zoomLevel().textContent).toContain('125%'));
    fireEvent.keyDown(document.body, { key: '0', code: 'Digit0', shiftKey: true });
    await waitFor(() => expect(zoomLevel().textContent).toContain('100%'));
  });

  it('"Zoom to selection" nonaktif tanpa seleksi; dengan seleksi membingkai bounds-nya (Shift+2)', async () => {
    viewport(800, 600);
    const { user, rerender } = renderUi(<Canvas {...baseProps()} />);
    await user.click(screen.getByRole('button', { name: 'Zoom 100%' }));
    expect(screen.getByRole('menuitem', { name: /Zoom to selection/ })).toBeDisabled();
    // Tutup menu lewat backdrop (.menu-layer); shortcut kanvas diblok selama menu terbuka.
    fireEvent.mouseDown(document.querySelector('.menu-layer')!);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    rerender(<Canvas {...baseProps({ selection: [B1] })} />);
    fireEvent.keyDown(document.body, { key: '2', code: 'Digit2', shiftKey: true });
    // Board 400×300 di viewport 800×600: z = min(688/400, 464/300) ≈ 1,5467 → 155%.
    await waitFor(() => expect(zoomLevel().textContent).toContain('155%'));
  });
});
