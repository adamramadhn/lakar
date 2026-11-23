// Canvas live (spec-canvas-agent-effects, spec-progressive-live-build, spec-vektor-5-pen-tool): wiring efek agen
// (reveal bertahap node baru, label Generating, Follow ke seksi baru) dan Pen tool (keyboard capture, tanpa request
// untuk path < 2 titik), diuji lewat DOM dengan board yang benar-benar di-mount oleh @lakar/render ke shadow root.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { REVEAL_MS, REVEAL_SHELL_MS, REVEAL_STEP_MS, type FadePlan } from './agentEffects';
import { Canvas } from './Canvas';
import type { AgentPresence, PendingAgent } from './presence';
import { dom, reducedMotion, renderUi } from './test/dom';
import { BOARD, BOARDS, CARD, makeDoc, SLUG, type Extra } from './test/fixtures';

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
    onSelect: vi.fn(),
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
    expect(opts).toMatchObject({ duration: REVEAL_MS, delay: 0, fill: 'backwards' });
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

  it('kursor agen yang hilang dari presence keluar dengan animasi lalu dilepas', async () => {
    const { rerender } = renderUi(<Canvas {...baseProps({ presence: [presence(true)] })} />);
    expect(document.querySelector('.agent-cursor')).not.toHaveClass('exiting');
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    rerender(<Canvas {...baseProps({ presence: [] })} />);
    expect(document.querySelector('.agent-cursor')).toHaveClass('exiting');
    await waitFor(() => expect(document.querySelector('.agent-cursor')).toBeNull());
  });

  it('pratinjau versi lama: label Generating tidak tampil', () => {
    const preview = { rev: 1, label: 'Version 1', canRestore: true, onBack: vi.fn(), onRestore: vi.fn() };
    renderUi(<Canvas {...baseProps({ presence: [presence(true)], preview })} />);
    expect(screen.queryByText('✦ Generating · Hero')).not.toBeInTheDocument();
  });
});

describe('Canvas — reveal bertahap (spec-progressive-live-build)', () => {
  /**
   * Seksi baru: judul + baris berisi tiga kartu (tiap kartu satu anak = atom). Seksi dan baris dipecah menjadi cangkang;
   * unit = judul + tiga kartu, urutan dokumen.
   */
  const card = (n: number): Extra => ({ id: `Kart000${n}`, name: `Card ${n}`, x: (n - 1) * 120, y: 0, width: 110, height: 80, children: [{ id: `Isi0000${n}`, name: 'Isi', x: 8, y: 8, width: 40, height: 20 }] });
  const SECTION: Extra = {
    id: 'Seks0001',
    name: 'Seksi / Fitur',
    x: 0,
    y: 120,
    width: 400,
    height: 160,
    children: [
      { id: 'Judu0001', name: 'Judul', x: 0, y: 0, width: 200, height: 30 },
      { id: 'Bari0001', name: 'Baris', x: 0, y: 40, width: 400, height: 100, children: [card(1), card(2), card(3)] },
    ],
  };
  const created = ['Seks0001', 'Judu0001', 'Bari0001', 'Kart0001', 'Isi00001', 'Kart0002', 'Isi00002', 'Kart0003', 'Isi00003'];
  const calls = () => dom().animate.mock.calls.map((c, i) => ({ id: (dom().animate.mock.contexts[i] as Element).getAttribute('data-lakar-id'), keyframes: c[0] as unknown as Keyframe[], opts: c[1] as unknown as KeyframeAnimationOptions }));

  it('seksi baru masuk blok demi blok dari atas: unit berurutan dengan stagger, wadahnya hanya fade opacity', async () => {
    const { rerender } = renderUi(<Canvas {...baseProps({ fades: [] })} />);
    await mounted(CARD);
    rerender(<Canvas {...baseProps({ doc: makeDoc(2, [SECTION]), fades: [{ key: 'call-s', rev: 2, endMs: Date.now(), ids: created }] })} />);
    await mounted('Kart0003');
    await waitFor(() => expect(dom().animate).toHaveBeenCalled());
    const all = calls();
    const units = all.filter((c) => 'translate' in c.keyframes[0]!);
    const shells = all.filter((c) => !('translate' in c.keyframes[0]!));
    // Urutan dokumen = atas ke bawah; seksi tidak muncul sebagai satu blok.
    expect(units.map((u) => u.id)).toEqual(['Judu0001', 'Kart0001', 'Kart0002', 'Kart0003']);
    expect(units.map((u) => u.opts.delay)).toEqual([0, 1, 2, 3].map((i) => i * REVEAL_STEP_MS));
    expect(units[0]!.keyframes[0]).toMatchObject({ opacity: 0, translate: '0 12px', filter: 'blur(4px)' });
    expect(units[0]!.opts).toMatchObject({ duration: REVEAL_MS, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
    // Cangkang (seksi, baris) mulai bersama unit pertamanya, opacity saja.
    expect(shells.map((s) => [s.id, s.opts.delay])).toEqual([
      ['Seks0001', 0],
      ['Bari0001', REVEAL_STEP_MS],
    ]);
    expect(shells[0]!.keyframes).toEqual([{ opacity: 0 }, { opacity: expect.any(String) }]);
    expect(shells[0]!.opts.duration).toBe(REVEAL_SHELL_MS);
    // Hanya opacity/translate/filter yang dianimasikan.
    for (const c of all) for (const k of c.keyframes) for (const p of Object.keys(k)) expect(['opacity', 'translate', 'filter']).toContain(p);
  });

  it('execute baru tiba di tengah reveal: reveal lama diselesaikan dulu, lalu node baru di-reveal', async () => {
    const finished: string[] = [];
    Element.prototype.animate = dom().animate.mockImplementation(function (this: Element) {
      const id = this.getAttribute('data-lakar-id') ?? '';
      return { finish: () => finished.push(id), cancel() {}, finished: Promise.resolve() } as unknown as Animation;
    }) as unknown as Element['animate'];
    const { rerender } = renderUi(<Canvas {...baseProps({ fades: [] })} />);
    await mounted(CARD);
    rerender(<Canvas {...baseProps({ doc: makeDoc(2, [SECTION]), fades: [{ key: 'call-1', rev: 2, endMs: Date.now(), ids: created }] })} />);
    await waitFor(() => expect(dom().animate).toHaveBeenCalled());
    const first = dom().animate.mock.calls.length;
    expect(finished).toEqual([]);
    rerender(<Canvas {...baseProps({ doc: makeDoc(3, [SECTION, NEW]), fades: [{ key: 'call-2', rev: 3, endMs: Date.now(), ids: [NEW.id] }] })} />);
    await waitFor(() => expect(dom().animate.mock.calls.length).toBe(first + 1));
    // Semua animasi reveal pertama diselesaikan (keadaan akhir) sebelum reveal kedua.
    expect(finished.sort()).toEqual(['Bari0001', 'Judu0001', 'Kart0001', 'Kart0002', 'Kart0003', 'Seks0001']);
    expect(animatedIds().at(-1)).toBe(NEW.id);
  });

  it('membuka dokumen yang seksinya sudah jadi: tanpa reveal (reconnect dan reduced motion: tes fade di atas)', async () => {
    renderUi(<Canvas {...baseProps({ doc: makeDoc(2, [SECTION]), fades: [{ key: 'old', rev: 2, endMs: Date.now() - 5_000, ids: created }] })} />);
    await mounted('Kart0003');
    expect(dom().animate).not.toHaveBeenCalled();
  });
});

describe('Canvas — Follow agent ke seksi baru', () => {
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
  const tall = [{ ...BOARDS[0]!, height: 2000 }];
  const boardBox = () => document.querySelector<HTMLElement>(`[data-board="${BOARD}"]`)!.style;

  it('kamera bergeser ke seksi baru (bukan hanya board) sampai seksi itu terlihat utuh', async () => {
    viewport(800, 600);
    reducedMotion(true);
    const onFocused = vi.fn();
    const { rerender } = renderUi(<Canvas {...baseProps({ boards: tall, onFocused })} />);
    rerender(<Canvas {...baseProps({ boards: tall, onFocused, focus: { boardId: BOARD, nonce: 7, rect: [0, 1200, 400, 300] } })} />);
    await waitFor(() => expect(onFocused).toHaveBeenCalledWith(7));
    const top = parseFloat(boardBox().top);
    // Seksi y 1200–1500 di layar: di dalam viewport 600 (zoom tetap 1).
    expect(parseFloat(boardBox().width)).toBe(400);
    expect(top + 1200).toBeGreaterThanOrEqual(18);
    expect(top + 1500).toBeLessThanOrEqual(600);
  });

  it('seksi baru sudah terlihat: kamera diam', async () => {
    viewport(800, 600);
    reducedMotion(true);
    const onFocused = vi.fn();
    const { rerender } = renderUi(<Canvas {...baseProps({ boards: tall, onFocused })} />);
    rerender(<Canvas {...baseProps({ boards: tall, onFocused, focus: { boardId: BOARD, nonce: 8, rect: [0, 100, 400, 200] } })} />);
    await waitFor(() => expect(onFocused).toHaveBeenCalledWith(8));
    expect(boardBox().top).toBe('0px');
  });
});

describe('Canvas — label Generating execute pertama', () => {
  const pending: PendingAgent[] = [{ session: 's1', label: 'Claude Code', color: 'violet', action: 'Build navbar and hero' }];

  it('board tujuan belum diketahui: label tingkat dokumen, bukan pada board', () => {
    renderUi(<Canvas {...baseProps({ pending })} />);
    const chip = screen.getByText('✦ Generating · Claude Code');
    expect(chip).toHaveClass('agent-generating', 'doc-pending', 'violet');
    expect(chip).toHaveAttribute('title', 'Build navbar and hero');
    expect(document.querySelector(`[data-board-label="${BOARD}"]`)).not.toHaveClass('generating');
  });

  it('dokumen kosong: state menunggu berganti "Your agent is building the first board"; pratinjau versi → tanpa label', () => {
    const { rerender } = renderUi(<Canvas {...baseProps({ boards: [], docEmpty: true, pending })} />);
    expect(screen.getByText('Your agent is building the first board')).toBeInTheDocument();
    rerender(<Canvas {...baseProps({ boards: [], docEmpty: true })} />);
    expect(screen.getByText('Waiting for your agent')).toBeInTheDocument();
    const preview = { rev: 1, label: 'Version 1', canRestore: true, onBack: vi.fn(), onRestore: vi.fn() };
    rerender(<Canvas {...baseProps({ pending, preview })} />);
    expect(screen.queryByText('✦ Generating · Claude Code')).not.toBeInTheDocument();
  });

  it('board [WIP] di antara execute (building): label Generating tetap pada board', () => {
    const p: AgentPresence = { session: 's1', label: 'Claude Code', color: 'agent', working: false, building: true, boardId: BOARD, changed: [], createdBoards: [], changedBoards: [] };
    renderUi(<Canvas {...baseProps({ presence: [p] })} />);
    expect(screen.getByText('✦ Generating · Hero')).toHaveClass('agent-generating');
  });
});

describe("Canvas — board height:'hug' (spec-board-hug-height)", () => {
  /** Dokumen fixture dengan board `height:'hug'`. */
  const hugDoc = () => {
    const doc = makeDoc(1);
    (doc.pages[0]!.children[0] as { height: unknown }).height = 'hug';
    return doc;
  };
  const frameEl = () => document.querySelector<HTMLElement>(`[data-board="${BOARD}"]`)!;

  it('host live bertinggi auto dan tingginya dilaporkan setelah mount; bingkai board memakai tinggi terukur dari props', async () => {
    const onHugHeight = vi.fn();
    const boards = [{ ...BOARDS[0]!, height: 900, hug: true as const }];
    const { rerender } = renderUi(<Canvas {...baseProps({ doc: hugDoc(), boards, onHugHeight })} />);
    await mounted(CARD);
    expect(host().style.height).toBe('');
    // jsdom tanpa layout: offsetHeight 0 (di browser = tinggi isi shadow root).
    await waitFor(() => expect(onHugHeight).toHaveBeenCalledWith(BOARD, 0));
    expect(frameEl().style.height).toBe('900px');
    rerender(<Canvas {...baseProps({ doc: hugDoc(), boards: [{ ...boards[0]!, height: 640 }], onHugHeight })} />);
    expect(frameEl().style.height).toBe('640px');
  });

  it('board bertinggi angka: host setinggi board, tanpa laporan tinggi (perilaku lama)', async () => {
    const onHugHeight = vi.fn();
    renderUi(<Canvas {...baseProps({ onHugHeight })} />);
    await mounted(CARD);
    expect(host().style.height).toBe('300px');
    expect(onHugHeight).not.toHaveBeenCalled();
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
    onTestFinished(() => window.removeEventListener('keydown', outside));
    return { ...view, onSelect, onSelectIds, onInsert, onCommit, onCommitCreate, outside };
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
  });
});

describe('Canvas — placeholder skeleton (spec-skeleton-live-build)', () => {
  const SKEL: Extra = { id: 'Skel0001', name: '[Skeleton] Seksi / Menu', x: 0, y: 120, width: 400, height: 160 };
  const style = () => host().shadowRoot?.querySelector('style[data-lakar-skeleton]')?.textContent ?? '';
  const working = (on: boolean): AgentPresence => ({ session: 's1', label: 'Claude Code', color: 'agent', working: on, boardId: BOARD, changed: [], createdBoards: [], changedBoards: [] });

  it('placeholder: tint + label nama seksi di shadow root; sapuan shimmer hanya saat board Generating', async () => {
    const { rerender } = renderUi(<Canvas {...baseProps({ doc: makeDoc(2, [SKEL]), presence: [working(true)] })} />);
    await mounted(SKEL.id);
    await waitFor(() => expect(style()).toContain('[data-lakar-id="Skel0001"]::before'));
    expect(style()).toContain('content:"Menu"');
    expect(style()).toMatch(/:host\(\[data-generating\]\) \[data-lakar-id="Skel0001"\]::after\{[^}]*animation:lakar-skel-sweep 2400ms linear 0ms infinite/);
    // Sapuan hanya transform; reduced motion mematikannya.
    expect(style()).toMatch(/@keyframes lakar-skel-sweep\{0%\{transform:translateX\(-100%\)\}70%,100%\{transform:translateX\(100%\)\}\}/);
    expect(style()).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\[data-lakar-id="Skel0001"\]::after\{display:none/);
    expect(host()).toHaveAttribute('data-generating');
    rerender(<Canvas {...baseProps({ doc: makeDoc(2, [SKEL]), presence: [working(false)] })} />);
    expect(host()).not.toHaveAttribute('data-generating');
    // Board tanpa placeholder: tanpa gaya skeleton.
    rerender(<Canvas {...baseProps({ doc: makeDoc(3), presence: [] })} />);
    await waitFor(() => expect(host().shadowRoot?.querySelector('style[data-lakar-skeleton]')).toBeNull());
  });

  it('diisi di tempat (nama tanpa prefiks, id sama): tint memudar sekali 240ms; isi baru di-reveal', async () => {
    const { rerender } = renderUi(<Canvas {...baseProps({ doc: makeDoc(2, [SKEL]), fades: [] })} />);
    await mounted(SKEL.id);
    const filled: Extra = { ...SKEL, name: 'Seksi / Menu', children: [{ id: 'Judu0009', name: 'Judul', x: 0, y: 0, width: 200, height: 30 }] };
    rerender(<Canvas {...baseProps({ doc: makeDoc(3, [filled]), fades: [{ key: 'fill', rev: 3, endMs: Date.now(), ids: ['Judu0009'] }] })} />);
    await mounted('Judu0009');
    await waitFor(() => expect(style()).toMatch(/\[data-lakar-id="Skel0001"\]::before\{[^}]*animation:lakar-skel-out 240ms cubic-bezier\(\.16,1,\.3,1\) forwards/));
    expect(style()).not.toContain('content:"Menu"');
    await waitFor(() => expect(animatedIds()).toEqual(['Judu0009']));
  });

  it('membuka dokumen yang placeholdernya sudah terisi: tanpa pudar (tidak ada mount sebelumnya)', async () => {
    renderUi(<Canvas {...baseProps({ doc: makeDoc(3, [{ ...SKEL, name: 'Seksi / Menu' }]) })} />);
    await mounted(SKEL.id);
    expect(host().shadowRoot?.querySelector('style[data-lakar-skeleton]')).toBeNull();
  });
});

describe('Canvas — Follow berirama untuk banyak execute kecil (spec-skeleton-live-build)', () => {
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
  const tall = [{ ...BOARDS[0]!, height: 2000 }];
  const boardTop = () => document.querySelector<HTMLElement>(`[data-board="${BOARD}"]`)!.style.top;

  it('blok tinggi yang sebagian besar sudah terlihat: kamera diam', async () => {
    viewport(800, 600);
    reducedMotion(true);
    const onFocused = vi.fn();
    const { rerender } = renderUi(<Canvas {...baseProps({ boards: tall, onFocused })} />);
    // y 300–900: terlihat 300 px (≥ 40% viewport), terpotong di bawah.
    rerender(<Canvas {...baseProps({ boards: tall, onFocused, focus: { boardId: BOARD, nonce: 9, rect: [0, 300, 400, 600] } })} />);
    await waitFor(() => expect(onFocused).toHaveBeenCalledWith(9));
    expect(boardTop()).toBe('0px');
  });

  it('execute tanpa node baru pada board yang sebagian terlihat: tidak melompat ke board utuh', async () => {
    viewport(800, 600);
    reducedMotion(true);
    const onFocused = vi.fn();
    const { rerender } = renderUi(<Canvas {...baseProps({ boards: tall, onFocused })} />);
    rerender(<Canvas {...baseProps({ boards: tall, onFocused, focus: { boardId: BOARD, nonce: 10 } })} />);
    await waitFor(() => expect(onFocused).toHaveBeenCalledWith(10));
    expect(boardTop()).toBe('0px');
  });
});
