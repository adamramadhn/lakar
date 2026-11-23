// Canvas live (spec-canvas-agent-effects, spec-vektor-5-pen-tool): wiring efek agen (fade-in node baru, label
// Generating) dan Pen tool (keyboard capture, tanpa request untuk path < 2 titik), diuji lewat DOM dengan board yang
// benar-benar di-mount oleh @lakar/render ke shadow root.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { FadePlan } from './agentEffects';
import { Canvas } from './Canvas';
import type { AgentPresence } from './presence';
import { dom, reducedMotion, renderUi } from './test/dom';
import { BOARD, BOARDS, CARD, makeDoc, SLUG } from './test/fixtures';

type Props = ComponentProps<typeof Canvas>;

const NEW = { id: 'Newn0001', name: 'New card', x: 200, y: 40, width: 100, height: 60 };

function baseProps(over: Partial<Props> = {}): Props {
  const doc = over.doc ?? makeDoc(1);
  return {
    slug: SLUG,
    rev: doc.rev,
    boards: BOARDS,
    doc,
    camera: { x: 0, y: 0, z: 1 },
    highlight: undefined,
    summary: undefined,
    checksLoading: false,
    onSelect: vi.fn(),
    onOpenChecks: vi.fn(),
    ...over,
  };
}

/** Host board live (shadow root berisi DOM hasil mountBoard). */
const host = () => document.querySelector<HTMLElement>(`[data-live-board="${BOARD}"]`)!;
/** Tunggu sampai node `id` ada di shadow root board. */
const mounted = (id: string) => waitFor(() => expect(host().shadowRoot?.querySelector(`[data-lakar-id="${id}"]`) ?? null).not.toBeNull());
/** Elemen yang dianimasikan lewat `Element.animate` (Web Animations stub). */
const animatedIds = () => dom().animate.mock.contexts.map((el) => (el as Element).getAttribute('data-lakar-id'));

const plan = (endMs: number): FadePlan => ({ key: 'call-1', rev: 2, endMs, ids: [NEW.id] });

describe('Canvas — fade-in node baru dari agen', () => {
  it('execute agen yang selesai sesudah canvas dibuka: node barunya di-fade-in saat board di-mount dari rev itu', async () => {
    const { rerender } = renderUi(<Canvas {...baseProps({ fades: [] })} />);
    await mounted(CARD);
    expect(dom().animate).not.toHaveBeenCalled();

    rerender(<Canvas {...baseProps({ doc: makeDoc(2, [NEW]), fades: [plan(Date.now())] })} />);
    await mounted(NEW.id);
    await waitFor(() => expect(animatedIds()).toEqual([NEW.id]));
    const [keyframes, opts] = dom().animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
    expect(keyframes[0]).toMatchObject({ opacity: 0, filter: 'blur(4px)' });
    expect(opts).toMatchObject({ duration: 500, fill: 'backwards' });
  });

  it('membuka dokumen: execute yang selesai sebelum canvas dibuka tidak memutar fade-in', async () => {
    renderUi(<Canvas {...baseProps({ doc: makeDoc(2, [NEW]), fades: [plan(Date.now() - 5_000)] })} />);
    await mounted(NEW.id);
    expect(dom().animate).not.toHaveBeenCalled();
  });

  it('reconnect: rencana di snapshot hello (fadeEpoch naik) dianggap lama dan tidak diputar', async () => {
    const { rerender } = renderUi(<Canvas {...baseProps({ fades: [], fadeEpoch: 0 })} />);
    await mounted(CARD);
    rerender(<Canvas {...baseProps({ doc: makeDoc(2, [NEW]), fades: [plan(Date.now())], fadeEpoch: 1 })} />);
    await mounted(NEW.id);
    expect(dom().animate).not.toHaveBeenCalled();
  });

  it('prefers-reduced-motion: tanpa animasi', async () => {
    reducedMotion(true);
    const { rerender } = renderUi(<Canvas {...baseProps({ fades: [] })} />);
    await mounted(CARD);
    rerender(<Canvas {...baseProps({ doc: makeDoc(2, [NEW]), fades: [plan(Date.now())] })} />);
    await mounted(NEW.id);
    expect(dom().animate).not.toHaveBeenCalled();
  });
});

describe('Canvas — label Generating', () => {
  const presence = (working: boolean): AgentPresence => ({ session: 's1', label: 'Claude Code', color: 'violet', working, boardId: BOARD, changed: [], createdBoards: [], changedBoards: [] });

  it('board yang sedang dikerjakan agen: label "✦ Generating · nama" warna sesi; selesai → label board biasa', () => {
    const { rerender } = renderUi(<Canvas {...baseProps({ presence: [presence(true)] })} />);
    const tag = screen.getByText('✦ Generating · Hero');
    expect(tag).toHaveClass('agent-generating', 'violet');
    expect(document.querySelector(`[data-board-label="${BOARD}"]`)).toHaveClass('generating');

    rerender(<Canvas {...baseProps({ presence: [presence(false)] })} />);
    expect(screen.queryByText('✦ Generating · Hero')).not.toBeInTheDocument();
    expect(document.querySelector(`[data-board-label="${BOARD}"]`)).not.toHaveClass('generating');
  });

  it('pratinjau versi lama: label Generating tidak tampil', () => {
    const preview = { rev: 1, label: 'Version 1', canRestore: true, onBack: vi.fn(), onRestore: vi.fn() };
    renderUi(<Canvas {...baseProps({ presence: [presence(true)], preview })} />);
    expect(screen.queryByText('✦ Generating · Hero')).not.toBeInTheDocument();
  });
});

describe('Canvas — Pen tool', () => {
  function penCanvas() {
    const onSelect = vi.fn();
    const onSelectIds = vi.fn();
    const onInsert = vi.fn();
    const onCommit = vi.fn(async () => 2);
    const onCommitCreate = vi.fn(async () => 'Path0001');
    const view = renderUi(<Canvas {...baseProps({ editable: true, selection: [CARD], onSelect, onSelectIds, onInsert, onCommit, onCommitCreate })} />);
    // Pendengar keydown di luar canvas (mis. shortcut hapus node Viewer): tidak boleh menerima tombol Pen.
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    const cleanup = () => window.removeEventListener('keydown', outside);
    return { ...view, onSelect, onSelectIds, onInsert, onCommit, onCommitCreate, outside, cleanup };
  }
  const pen = () => screen.getByRole('button', { name: 'Pen (P)' });
  /** Klik di (x, y) halaman (kamera 0,0,1, kanvas di 0,0 jsdom). */
  const tap = (x: number, y: number) => {
    const target = document.querySelector(`[data-board="${BOARD}"]`)!;
    fireEvent.pointerDown(target, { clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(target, { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse' });
  };

  it('Escape membatalkan path tanpa menghapus seleksi; tap Pen tidak menyisip layer', async () => {
    const t = penCanvas();
    await mounted(CARD);
    await t.user.click(pen());
    expect(pen()).toHaveAttribute('aria-pressed', 'true');
    tap(60, 60);
    await t.user.keyboard('{Escape}');
    expect(pen()).toHaveAttribute('aria-pressed', 'false');
    expect(t.onSelect).not.toHaveBeenCalled();
    expect(t.onSelectIds).not.toHaveBeenCalled();
    expect(t.onInsert).not.toHaveBeenCalled();
    expect(t.onCommitCreate).not.toHaveBeenCalled();
    expect(t.outside).not.toHaveBeenCalled();
    t.cleanup();
  });

  it('Delete saat menggambar membuang titik terakhir, bukan node terpilih', async () => {
    const t = penCanvas();
    await mounted(CARD);
    await t.user.click(pen());
    tap(60, 60);
    tap(160, 60);
    await t.user.keyboard('{Delete}');
    // Masih menggambar (satu titik tersisa); shortcut Delete di luar canvas tidak menerima event.
    expect(pen()).toHaveAttribute('aria-pressed', 'true');
    expect(t.outside).not.toHaveBeenCalled();
    expect(t.onCommit).not.toHaveBeenCalled();
    // Enter dengan satu titik tersisa: tidak ada path.
    await t.user.keyboard('{Enter}');
    expect(t.onCommitCreate).not.toHaveBeenCalled();
    expect(pen()).toHaveAttribute('aria-pressed', 'false');
    t.cleanup();
  });

  it('Enter dengan < 2 titik tidak mengirim request; dengan 2 titik satu commit add path di board', async () => {
    const t = penCanvas();
    await mounted(CARD);
    const before = dom().daemon.requests.length;
    await t.user.click(pen());
    tap(60, 60);
    await t.user.keyboard('{Enter}');
    expect(t.onCommitCreate).not.toHaveBeenCalled();
    expect(dom().daemon.requests.length).toBe(before);

    await t.user.click(pen());
    tap(60, 60);
    tap(160, 120);
    await t.user.keyboard('{Enter}');
    expect(t.onCommitCreate).toHaveBeenCalledTimes(1);
    expect(t.onCommitCreate).toHaveBeenCalledWith([expect.objectContaining({ op: 'add', parentId: BOARD, ref: 'pen', node: expect.objectContaining({ type: 'path' }) })], 'Draw path');
    expect(t.outside).not.toHaveBeenCalled();
    t.cleanup();
  });
});
