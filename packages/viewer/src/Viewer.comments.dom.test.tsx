// Komentar di viewer (epic kolaborasi-agen story 9.4, desain "Viewer — Comments" 02–05):
// - Canvas: pin avatar per thread (resolved tersembunyi kecuali toggle), popover thread/draft, tool komentar (C).
// - Viewer: tab Comments di sidebar kiri (badge open), baris thread membuka popover, tulis lewat route
//   `/viewer/docs/:slug/comments*` lalu dokumen dimuat ulang.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Canvas } from './Canvas';
import { dom, renderUi } from './test/dom';
import { BOARD, BOARDS, CARD, makeDoc, SLUG } from './test/fixtures';
import { Viewer } from './Viewer';
import type { CommentThread } from './api';

const AT = '2026-11-24T01:00:00Z';

/** Thread pin di kartu (satu pesan pengguna + satu balasan agen). */
const PINNED: CommentThread = {
  id: 'Com00001',
  pageId: 'Page0001',
  nodeId: CARD,
  x: 20,
  y: 20,
  status: 'open',
  messages: [
    { author: { kind: 'user', name: 'You' }, text: 'naikkan padding tombol', at: AT },
    { author: { kind: 'agent', name: 'claude-code' }, text: 'padding sudah 16', at: AT },
  ],
};

type CanvasProps = ComponentProps<typeof Canvas>;

function baseProps(over: Partial<CanvasProps> = {}): CanvasProps {
  const doc = over.doc ?? makeDoc(1);
  return {
    slug: SLUG,
    rev: doc.rev,
    boards: BOARDS,
    doc,
    camera: { x: 0, y: 0, z: 1 },
    editable: true,
    highlight: undefined,
    onSelect: vi.fn(),
    ...over,
  };
}

/** Host board live + tunggu node `id` termount di shadow root-nya. */
const host = () => document.querySelector<HTMLElement>(`[data-live-board="${BOARD}"]`)!;
const mounted = (id: string) => waitFor(() => expect(host().shadowRoot?.querySelector(`[data-lakar-id="${id}"]`) ?? null).not.toBeNull());
/** Tap mouse di (x, y) layar pada board (kamera 0,0,1 → koordinat halaman sama). */
const tap = (x: number, y: number) => {
  const target = document.querySelector(`[data-board="${BOARD}"]`)!;
  fireEvent.pointerDown(target, { clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse' });
  fireEvent.pointerUp(target, { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse' });
};

/** Props `comments` penuh dengan spy; `over` menimpa sebagian. */
function commentsProps(over: Record<string, unknown> = {}) {
  return {
    threads: [PINNED],
    showResolved: false,
    openId: undefined,
    draft: undefined,
    busy: false,
    onOpen: vi.fn(),
    onReply: vi.fn(),
    onResolve: vi.fn(),
    onDelete: vi.fn(),
    onRequestFix: vi.fn(),
    onCancelFix: vi.fn(),
    onCopyPrompt: vi.fn(),
    onDraftSubmit: vi.fn(),
    onDraftCancel: vi.fn(),
    ...over,
  } as NonNullable<CanvasProps['comments']> & { onOpen: ReturnType<typeof vi.fn>; onReply: ReturnType<typeof vi.fn>; onResolve: ReturnType<typeof vi.fn>; onDraftSubmit: ReturnType<typeof vi.fn>; onDraftCancel: ReturnType<typeof vi.fn> };
}

describe('Canvas — pin dan popover komentar', () => {
  it('thread open → pin avatar; resolved tersembunyi sampai showResolved; klik pin → onOpen', async () => {
    const comments = commentsProps();
    const { user } = renderUi(<Canvas {...baseProps({ comments })} />);
    const pin = document.querySelector('.comment-pin')!;
    expect(pin).toHaveClass('user');

    // Resolved tanpa toggle → pin tidak tampil; dengan showResolved → pin pudar bercheck.
    const resolved = { ...PINNED, id: 'Com00002', status: 'resolved', resolvedAt: AT } as CommentThread;
    const c2 = commentsProps({ threads: [resolved] });
    const v2 = renderUi(<Canvas {...baseProps({ comments: c2 })} />);
    expect(document.querySelectorAll('.comment-pin')).toHaveLength(1);
    v2.unmount();
    renderUi(<Canvas {...baseProps({ comments: commentsProps({ threads: [resolved], showResolved: true }) })} />);
    await waitFor(() => expect(document.querySelector('.comment-pin.resolved')).not.toBeNull());

    await user.click(pin);
    expect(comments.onOpen).toHaveBeenCalledWith('Com00001');
  });

  it('openId → popover thread (pesan + Reply); kirim balasan → onReply; Resolve → onResolve; close → onOpen(undefined)', async () => {
    const comments = commentsProps({ openId: 'Com00001' });
    const { user } = renderUi(<Canvas {...baseProps({ comments })} />);
    await mounted(CARD);
    const card = document.querySelector<HTMLElement>('.comment-card')!;
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent('naikkan padding tombol');
    expect(card).toHaveTextContent('padding sudah 16');
    expect(card).toHaveTextContent('Agents can read and reply to this thread');

    await user.type(screen.getByPlaceholderText('Reply…'), 'sip');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(comments.onReply).toHaveBeenCalledWith('Com00001', 'sip');

    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(comments.onResolve).toHaveBeenCalledWith('Com00001', true);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(comments.onOpen).toHaveBeenCalledWith(undefined);
  });

  it('draft → pin bayangan + popover New comment; submit → onDraftSubmit; Escape di input → onDraftCancel', async () => {
    const comments = commentsProps({ draft: { x: 50, y: 60, nodeId: CARD } });
    const { user } = renderUi(<Canvas {...baseProps({ comments })} />);
    await mounted(CARD);
    expect(document.querySelector('.comment-pin.draft')).not.toBeNull();
    const card = document.querySelector<HTMLElement>('.comment-card')!;
    expect(card).toHaveTextContent('New comment');
    expect(card).toHaveTextContent('Pinned to Card');

    await user.type(screen.getByPlaceholderText('Write a comment…'), 'warnanya kurang');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(comments.onDraftSubmit).toHaveBeenCalledWith('warnanya kurang');

    // Escape saat fokus di input draft: kartu sendiri yang menutup (shortcut kanvas melewati target ketik).
    await user.keyboard('{Escape}');
    expect(comments.onDraftCancel).toHaveBeenCalled();
  });

  it('mailbox fix (spec-comment-to-fix): Ask agent → onRequestFix; menu agent; Copy prompt; open → Stop; done → chip', async () => {
    const comments = commentsProps({ openId: 'Com00001', fixAgents: ['claude-code', 'zed'] });
    const { user } = renderUi(<Canvas {...baseProps({ comments })} />);
    await mounted(CARD);

    // Tombol utama + ghost Copy prompt.
    await user.click(screen.getByRole('button', { name: 'Ask agent to fix' }));
    expect(comments.onRequestFix).toHaveBeenCalledWith('Com00001', undefined);
    await user.click(screen.getByRole('button', { name: 'Choose agent' }));
    const menu = document.querySelector('.comment-fix-menu')!;
    expect(menu).toHaveTextContent('Any agent');
    expect(menu).toHaveTextContent('Claude Code');
    await user.click(screen.getByRole('menuitem', { name: 'zed' }));
    expect(comments.onRequestFix).toHaveBeenLastCalledWith('Com00001', 'zed');
    await user.click(screen.getByRole('button', { name: 'Copy prompt' }));
    expect(comments.onCopyPrompt).toHaveBeenCalledWith(PINNED);
  });

  it('fixRequest open → status + Stop (onCancelFix); done → chip penutup; failed → Retry; resolved → tanpa aksi fix', async () => {
    const open = { ...PINNED, fixRequest: { status: 'open', agent: 'claude-code', at: AT } } as CommentThread;
    const c1 = commentsProps({ threads: [open], openId: 'Com00001' });
    const v1 = renderUi(<Canvas {...baseProps({ comments: c1 })} />);
    await mounted(CARD);
    expect(document.querySelector('.comment-card')).toHaveTextContent('Waiting for Claude Code to fix…');
    await v1.user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(c1.onCancelFix).toHaveBeenCalledWith('Com00001');
    v1.unmount();

    const done = { ...PINNED, fixRequest: { status: 'done', agent: 'claude-code', at: AT, note: 'ok' } } as CommentThread;
    const v2 = renderUi(<Canvas {...baseProps({ comments: commentsProps({ threads: [done], openId: 'Com00001' }) })} />);
    await mounted(CARD);
    expect(document.querySelector('.comment-fix-chip')).toHaveTextContent('fixed by Claude Code');
    v2.unmount();

    const failed = { ...PINNED, fixRequest: { status: 'failed', agent: 'zed', at: AT } } as CommentThread;
    const c3 = commentsProps({ threads: [failed], openId: 'Com00001' });
    const v3 = renderUi(<Canvas {...baseProps({ comments: c3 })} />);
    await mounted(CARD);
    expect(document.querySelector('.comment-fix-chip')).toHaveTextContent('fix failed by zed');
    await v3.user.click(screen.getByRole('button', { name: 'Retry fix' }));
    expect(c3.onRequestFix).toHaveBeenCalledWith('Com00001', undefined);
    v3.unmount();

    const resolved = { ...PINNED, status: 'resolved', resolvedAt: AT } as CommentThread;
    renderUi(<Canvas {...baseProps({ comments: commentsProps({ threads: [resolved], showResolved: true, openId: 'Com00001' }) })} />);
    await mounted(CARD);
    expect(screen.queryByRole('button', { name: 'Ask agent to fix' })).toBeNull();
    expect(document.querySelector('.comment-fix-status')).toBeNull();
  });

  it('tool komentar: tombol/C mengaktifkan; tap → onCommentAt + tool kembali ke Select; ruang kosong = titik bebas', async () => {
    const onCommentAt = vi.fn();
    const comments = commentsProps();
    const { user } = renderUi(<Canvas {...baseProps({ comments, onCommentAt })} />);
    await mounted(CARD);
    const btn = screen.getByRole('button', { name: 'Comment (C)' });
    await user.keyboard('c');
    expect(btn).toHaveAttribute('aria-pressed', 'true');

    // jsdom mengukur anak board 0×0: satu-satunya node kena hit = board, yang sengaja dilewati → titik bebas.
    tap(30, 30);
    expect(onCommentAt).toHaveBeenCalledWith({ x: 30, y: 30 });
    // Tool kembali ke Select setelah menaruh draft (klik berikutnya tidak menimpa draft terbuka).
    expect(btn).toHaveAttribute('aria-pressed', 'false');

    await user.keyboard('c');
    tap(600, 600);
    expect(onCommentAt).toHaveBeenLastCalledWith({ x: 600, y: 600 });
  });
});

// ---- Viewer: tab Comments + tulis lewat FakeDaemon ----

const withComments = (threads: CommentThread[], rev = 1) => ({ ...makeDoc(rev), comments: threads });

async function openViewer(threads: CommentThread[] = [PINNED]) {
  const state = { doc: withComments(threads) };
  const d = dom().daemon;
  d.on('GET', `/viewer/docs/${SLUG}`, () => ({ doc: state.doc }));
  d.on('POST', `/viewer/docs/${SLUG}/comments/create`, (req) => {
    const b = req.body as { text: string; nodeId?: string; x?: number; y?: number; pageId?: string };
    const thread: CommentThread = {
      id: 'Com00002',
      pageId: b.pageId ?? 'Page0001',
      ...(b.nodeId !== undefined ? { nodeId: b.nodeId } : {}),
      x: b.x ?? 0,
      y: b.y ?? 0,
      status: 'open',
      messages: [{ author: { kind: 'user' as const, name: 'You' }, text: b.text, at: new Date().toISOString() }],
    };
    state.doc = { ...state.doc, rev: state.doc.rev + 1, comments: [...(state.doc.comments ?? []), thread] };
    return { slug: SLUG, rev: state.doc.rev, thread };
  });
  d.on('POST', `/viewer/docs/${SLUG}/comments/reply`, (req) => {
    const b = req.body as { threadId: string; text: string };
    const message = { author: { kind: 'user' as const, name: 'You' }, text: b.text, at: new Date().toISOString() };
    let thread: CommentThread | undefined;
    state.doc = { ...state.doc, rev: state.doc.rev + 1, comments: state.doc.comments!.map((t) => (t.id === b.threadId ? (thread = { ...t, messages: [...t.messages, message] }) : t)) };
    return { slug: SLUG, rev: state.doc.rev, threadId: b.threadId, message, thread };
  });
  d.on('POST', `/viewer/docs/${SLUG}/comments/resolve`, (req) => {
    const b = req.body as { threadId: string; resolved?: boolean };
    const resolved = b.resolved ?? true;
    state.doc = {
      ...state.doc,
      rev: state.doc.rev + 1,
      comments: state.doc.comments!.map((t) => {
        if (t.id !== b.threadId) return t;
        const { resolvedAt: _drop, ...rest } = t;
        return resolved ? ({ ...rest, status: 'resolved', resolvedAt: new Date().toISOString() } as CommentThread) : ({ ...rest, status: 'open' } as CommentThread);
      }),
    };
    return { slug: SLUG, rev: state.doc.rev, threadId: b.threadId, status: resolved ? 'resolved' : 'open', resolvedAt: resolved ? AT : undefined };
  });
  d.on('POST', `/viewer/docs/${SLUG}/comments/delete`, (req) => {
    const b = req.body as { threadId: string };
    state.doc = { ...state.doc, rev: state.doc.rev + 1, comments: state.doc.comments!.filter((c) => c.id !== b.threadId) };
    return { slug: SLUG, rev: state.doc.rev, threadId: b.threadId };
  });
  // Mailbox fix (spec-comment-to-fix): route path-param — `{agent?}` minta fix, `{outcome:'cancelled'}` batal.
  d.on('POST', new RegExp(`^/viewer/docs/${SLUG}/comments/([A-Za-z0-9]+)/fix$`), (req, m) => {
    const threadId = m[1]!;
    const b = (req.body ?? {}) as { agent?: string; outcome?: string };
    let thread: CommentThread | undefined;
    state.doc = {
      ...state.doc,
      rev: state.doc.rev + 1,
      comments: state.doc.comments!.map((t) => {
        if (t.id !== threadId) return t;
        const fixRequest =
          b.outcome === 'cancelled'
            ? { status: 'cancelled' as const, at: new Date().toISOString() }
            : { status: 'open' as const, ...(b.agent !== undefined ? { agent: b.agent } : {}), at: new Date().toISOString() };
        thread = {
          ...t,
          fixRequest,
          ...(b.outcome === 'cancelled'
            ? {}
            : { messages: [...t.messages, { author: { kind: 'user' as const, name: 'You' }, text: `Fix request — Lakar document "${SLUG}"\nThread: ${t.id}`, at: new Date().toISOString() }] }),
        };
        return thread;
      }),
    };
    return { slug: SLUG, rev: state.doc.rev, threadId, fixRequest: thread!.fixRequest, thread };
  });
  const view = renderUi(<Viewer slug={SLUG} />);
  await waitFor(() => expect(document.querySelector(`[data-layer="${BOARD}"]`)).not.toBeNull());
  return { ...view, state };
}

describe('Viewer — tab Comments', () => {
  it('badge jumlah open; panel berisi baris thread; klik baris membuka popover di canvas', async () => {
    const { user } = await openViewer();
    const tab = screen.getByRole('tab', { name: /Comments/ });
    expect(tab.querySelector('.tab-badge')).toHaveTextContent('1');
    // Pin di kartu tampil di canvas.
    expect(document.querySelector('.comment-pin')).not.toBeNull();

    await user.click(tab);
    const row = screen.getByText('naikkan padding tombol').closest('.comment-row')!;
    expect(row).toHaveTextContent('Card');
    await user.click(row);
    await waitFor(() => expect(document.querySelector('.comment-card')).not.toBeNull());
    expect(document.querySelector('.comment-card')).toHaveTextContent('padding sudah 16');
  });

  it('resolve dari popover: POST resolve lalu pin hilang (resolved tidak ditampilkan)', async () => {
    const { user } = await openViewer();
    await user.click(document.querySelector('.comment-pin')!);
    await user.click(await screen.findByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(dom().daemon.find('POST', `/viewer/docs/${SLUG}/comments/resolve`)).toHaveLength(1));
    const req = dom().daemon.find('POST', `/viewer/docs/${SLUG}/comments/resolve`)[0]!;
    expect(req.body).toMatchObject({ threadId: 'Com00001' });
    await waitFor(() => expect(document.querySelector('.comment-pin')).toBeNull());
    await waitFor(() => expect(document.querySelector('.comment-card')).toBeNull());
  });

  it('reply dari popover: POST reply lalu pesan baru muncul setelah muat ulang', async () => {
    const { user } = await openViewer();
    await user.click(document.querySelector('.comment-pin')!);
    await user.type(screen.getByPlaceholderText('Reply…'), 'noted');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(document.querySelector('.comment-card')).toHaveTextContent('noted'));
    const req = dom().daemon.find('POST', `/viewer/docs/${SLUG}/comments/reply`)[0]!;
    expect(req.body).toMatchObject({ threadId: 'Com00001', text: 'noted' });
  });

  it('hapus dari popover: POST delete lalu pin dan kartu hilang dari canvas', async () => {
    const { user } = await openViewer();
    await user.click(document.querySelector('.comment-pin')!);
    await user.click(await screen.findByRole('button', { name: 'Delete comment' }));
    await waitFor(() => expect(dom().daemon.find('POST', `/viewer/docs/${SLUG}/comments/delete`)).toHaveLength(1));
    expect(dom().daemon.find('POST', `/viewer/docs/${SLUG}/comments/delete`)[0]!.body).toMatchObject({ threadId: 'Com00001' });
    await waitFor(() => expect(document.querySelector('.comment-pin')).toBeNull());
    await waitFor(() => expect(document.querySelector('.comment-card')).toBeNull());
  });

  it('tool komentar + tap + tulis: POST create lalu pin baru dari muatan ulang; popover baru terbuka', async () => {
    const { user } = await openViewer();
    await mounted(CARD);
    await user.keyboard('c');
    tap(30, 30);
    const draft = await screen.findByRole('dialog', { name: 'New comment' });
    // jsdom: anak board 0×0 → hanya board yang kena hit-test, dan board dilewati → titik bebas.
    expect(draft).toHaveTextContent('Free point');
    await user.type(screen.getByPlaceholderText('Write a comment…'), 'tombol ini');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const reqs = await waitFor(() => {
      const r = dom().daemon.find('POST', `/viewer/docs/${SLUG}/comments/create`);
      expect(r).toHaveLength(1);
      return r;
    });
    expect(reqs[0]!.body).toMatchObject({ text: 'tombol ini', x: 30, y: 30, pageId: 'Page0001' });
    expect(reqs[0]!.body).not.toHaveProperty('nodeId');
    // Muatan ulang memuat komentar baru; popover thread barunya terbuka otomatis.
    await waitFor(() => expect(document.querySelectorAll('.comment-pin').length).toBe(2));
    await waitFor(() => expect(document.querySelector('.comment-card')).toHaveTextContent('tombol ini'));
  });

  it('mailbox fix: Ask agent → POST fix lalu status + Stop; Stop → POST cancelled; Copy prompt → clipboard', async () => {
    const { user } = await openViewer();
    await user.click(document.querySelector('.comment-pin')!);
    await waitFor(() => expect(document.querySelector('.comment-card')).toHaveTextContent('Ask agent to fix'));

    await user.click(screen.getByRole('button', { name: 'Ask agent to fix' }));
    const fixUrl = `/viewer/docs/${SLUG}/comments/Com00001/fix`;
    await waitFor(() => expect(dom().daemon.find('POST', fixUrl)).toHaveLength(1));
    expect(dom().daemon.find('POST', fixUrl)[0]!.body).toEqual({});
    // Muatan ulang membawa fixRequest open → status menunggu + tombol Stop.
    await waitFor(() => expect(document.querySelector('.comment-card')).toHaveTextContent('Waiting for an agent to fix…'));

    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(dom().daemon.find('POST', fixUrl)).toHaveLength(2));
    expect(dom().daemon.find('POST', fixUrl)[1]!.body).toMatchObject({ outcome: 'cancelled' });
    // Cancelled → aksi awal tampil lagi.
    await waitFor(() => expect(document.querySelector('.comment-card')).toHaveTextContent('Ask agent to fix'));

    // Copy prompt: teks prompt yang sama (dokumen, thread, pin, komentar) ke clipboard + toast.
    await user.click(screen.getByRole('button', { name: 'Copy prompt' }));
    await waitFor(async () => {
      const copied = await navigator.clipboard.readText();
      expect(copied).toContain(`Fix request — Lakar document "${SLUG}"`);
      expect(copied).toContain('Thread: Com00001');
      expect(copied).toContain('naikkan padding tombol');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Fix prompt copied to clipboard');
  });
});
