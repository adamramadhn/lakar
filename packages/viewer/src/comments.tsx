// UI komentar di viewer (epic kolaborasi-agen story 9.4, desain "Viewer — Comments" 02–05):
// - Pin avatar bulat di canvas (warna penulis: pengguna hijau `--avatar`, agen warna harness), resolved = pudar + centang.
// - Popover thread (CommentThreadCard): pesan + Reply + Resolve/Unresolve; popover komentar baru (NewCommentCard).
// - Panel Comments di sidebar kiri: chip Open/Resolved/All, baris thread, grup "Resolved · N" pudar, toggle pin resolved.
// Teks UI Inggris; komentar kode Indonesia.
import { useEffect, useRef, useState } from 'react';
import type { CommentAuthor, CommentThread } from './api.js';
import { harnessLabel } from './activity.js';
import { preferredColor, type AgentColor } from './agentEffects.js';
import { relativeTime } from './format.js';
import { useNow } from './hooks.js';
import { Icon } from './icons.js';

/** Warna pin/avatar komentar: pengguna = hijau avatar; agen = warna pilihan harness-nya (stabil antar-sesi). */
export type CommentColor = AgentColor | 'user';
export const authorColor = (a: CommentAuthor): CommentColor => (a.kind === 'user' ? 'user' : preferredColor(a.name));

/** Nama tampilan penulis: pengguna = "You"; agen = label harness (claude-code → Claude Code). */
export const authorName = (a: CommentAuthor): string => (a.kind === 'user' ? 'You' : harnessLabel(a.name));

const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();

/** Lingkaran avatar berisi huruf awal, warna `authorColor`. */
export function CommentAvatar({ author, size = 24 }: { author: CommentAuthor; size?: number }) {
  return (
    <span className={`comment-avatar ${authorColor(author)}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.44) }}>
      {initial(author.name)}
    </span>
  );
}

/** Label lokasi thread untuk chip/baris meta: nama layer pin (dari `nameOf`/daemon), nama halaman, atau "Free point". */
export function threadLocation(t: CommentThread, nameOf: (id: string) => string | undefined, pageNameOf?: (id: string) => string | undefined): string {
  if (t.nodeId !== undefined) return nameOf(t.nodeId) ?? t.nodeName ?? 'Node';
  return pageNameOf?.(t.pageId) ?? t.pageName ?? 'Free point';
}

/** Waktu pesan terakhir thread (untuk urutan terbaru-dulu di panel). */
const lastAt = (t: CommentThread) => t.messages[t.messages.length - 1]!.at;

/** Posisi halaman pin thread: pin di layer = kiri-atas box node kini; titik bebas/node hilang = (x, y) tersimpan. */
export const pinPoint = (t: CommentThread, nodeBox: (id: string) => { x: number; y: number } | undefined): { x: number; y: number } => {
  const box = t.nodeId !== undefined ? nodeBox(t.nodeId) : undefined;
  return box ? { x: box.x, y: box.y } : { x: t.x, y: t.y };
};

/**
 * Prompt fix (mailbox, spec-comment-to-fix): teks yang di-append daemon sebagai pesan pengguna saat minta fix,
 * disalin apa adanya oleh tombol Copy prompt — bentuknya harus tetap sama dengan `fixPrompt` di
 * `packages/daemon/src/comments.ts`.
 */
export const fixPromptText = (slug: string, t: CommentThread, agent?: string): string =>
  [
    `Fix request — Lakar document "${slug}"`,
    ...(agent !== undefined ? [`Agent: ${agent}`] : []),
    `Thread: ${t.id}`,
    ...(t.nodeId !== undefined ? [`Layer: ${t.nodeId}`] : []),
    `Pin: (${t.x}, ${t.y})`,
    `Comment: ${t.messages[0]!.text}`,
    'Apply the change, post progress via reply_to_comment, and close via fix_comment.',
  ].join('\n');

/**
 * Layer komentar di Canvas (prop `comments`): thread halaman ini, popover terbuka/draft baru, dan callback
 * tulisnya. `undefined` = layer disembunyikan (pratinjau versi / tanpa dokumen).
 */
export type CanvasComments = {
  threads: readonly CommentThread[];
  /** Pin resolved ikut tampil (toggle panel, disimpan pemanggil). */
  showResolved: boolean;
  /** Thread yang popover-nya terbuka. */
  openId?: string | undefined;
  /** Draft komentar baru (koordinat halaman; `nodeId` = layer pin). */
  draft?: { x: number; y: number; nodeId?: string | undefined } | undefined;
  /** Request tulis sedang berjalan (input popover nonaktif). */
  busy?: boolean | undefined;
  /** Buka popover thread `id` (undefined = tutup). */
  onOpen: (id: string | undefined) => void;
  onReply: (threadId: string, text: string) => Promise<unknown> | void;
  onResolve: (threadId: string, resolved: boolean) => Promise<unknown> | void;
  /** Hapus thread permanen. */
  onDelete: (threadId: string) => Promise<unknown> | void;
  /** Minta fix pada thread (mailbox, spec-comment-to-fix); `agent` = harness yang dituju bila dipilih di menu. */
  onRequestFix: (threadId: string, agent?: string) => Promise<unknown> | void;
  /** Batalkan permintaan fix yang masih open. */
  onCancelFix: (threadId: string) => Promise<unknown> | void;
  /** Salin prompt fix thread ke clipboard (tanpa mengubah thread). */
  onCopyPrompt: (thread: CommentThread) => void;
  /** Nama harness agen Live pada dokumen ini (opsi menu "Choose agent"; kosong/tiada = hanya "Any agent"). */
  fixAgents?: readonly string[] | undefined;
  onDraftSubmit: (text: string) => Promise<unknown> | void;
  onDraftCancel: () => void;
};

/**
 * Pin komentar di canvas (desain 02): lingkaran avatar di titik halaman; `selected` = cincin aksen + popover terbuka;
 * thread resolved tampil pudar dengan centang ("Dimmed pins with a check"). `x`,`y` = koordinat layar (sudah × kamera).
 */
export function CommentPin({ thread, x, y, selected, onClick }: { thread: CommentThread; x: number; y: number; selected: boolean; onClick: () => void }) {
  const resolved = thread.status === 'resolved';
  return (
    <button
      type="button"
      className={`comment-pin canvas-overlay-ui ${authorColor(thread.messages[0]!.author)}${selected ? ' selected' : ''}${resolved ? ' resolved' : ''}`}
      style={{ left: x, top: y }}
      aria-label={`Comment by ${authorName(thread.messages[0]!.author)}`}
      aria-expanded={selected}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {resolved ? <Icon name="check" size={13} /> : initial(thread.messages[0]!.author.name)}
    </button>
  );
}

/** Satu gelembung pesan di popover thread. */
function CommentMessageRow({ author, text, at, now }: { author: CommentAuthor; text: string; at: string; now: number }) {
  return (
    <div className="comment-msg">
      <CommentAvatar author={author} size={24} />
      <div className="comment-msg-body">
        <div className="comment-msg-top">
          <strong>{authorName(author)}</strong>
          {author.kind === 'agent' && <span className="comment-agent-badge">Agent</span>}
          <time>{relativeTime(at, now)}</time>
        </div>
        <p className="comment-msg-text">{text}</p>
      </div>
    </div>
  );
}

/** Baris input + tombol kirim (panah) untuk komentar baru dan balasan. */
function CommentInput({ placeholder, autoFocus = false, busy, onSubmit }: { placeholder: string; autoFocus?: boolean; busy: boolean; onSubmit: (text: string) => Promise<unknown> | void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    const res = onSubmit(t);
    // Teks baru dibersihkan saat tulis sukses — gagal (offline/error) → teks tetap untuk dikirim ulang.
    if (res && typeof (res as Promise<unknown>).then === 'function') (res as Promise<unknown>).then(() => setText(''), () => {});
    else setText('');
  };
  return (
    <form
      className="comment-input-row"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <input ref={ref} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={4000} disabled={busy} />
      <button type="submit" className="comment-send" aria-label="Send" title="Send" disabled={!text.trim() || busy}>
        <Icon name="sendHorizontal" size={14} />
      </button>
    </form>
  );
}

/**
 * Popover thread terbuka di canvas (desain 03/04): judul + chip lokasi, tombol Resolve/Unresolve, daftar pesan,
 * input Reply, dan catatan bahwa agen ikut membaca thread.
 */
export function CommentThreadCard({
  thread,
  location,
  x,
  y,
  busy,
  fixAgents,
  onReply,
  onResolve,
  onDelete,
  onRequestFix,
  onCancelFix,
  onCopyPrompt,
  onClose,
}: {
  thread: CommentThread;
  /** Label lokasi (`threadLocation`). */
  location: string;
  /** Koordinat layar pin. */
  x: number;
  y: number;
  /** Menulis (request berjalan): input dinonaktifkan. */
  busy: boolean;
  /** Nama harness agen Live pada dokumen ini (menu "Choose agent"). */
  fixAgents?: readonly string[] | undefined;
  onReply: (text: string) => Promise<unknown> | void;
  onResolve: (resolved: boolean) => void;
  onDelete: () => void;
  /** Minta fix; `agent` = harness yang dituju bila dipilih di menu split. */
  onRequestFix: (agent?: string) => Promise<unknown> | void;
  /** Batalkan permintaan fix yang masih open (tombol Stop). */
  onCancelFix: () => Promise<unknown> | void;
  /** Salin prompt fix thread ke clipboard. */
  onCopyPrompt: () => void;
  onClose: () => void;
}) {
  const now = useNow(30_000);
  const [agentMenu, setAgentMenu] = useState(false);
  const resolved = thread.status === 'resolved';
  const fix = thread.fixRequest;
  return (
    <div className="comment-card canvas-overlay-ui" role="dialog" aria-label="Comment thread" style={{ left: x + 14, top: y + 18 }} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="comment-card-head">
        <span className="comment-card-title">Comment</span>
        <span className="comment-card-chip" title={location}>
          {location}
        </span>
        <button type="button" className={`comment-resolve-btn${resolved ? ' reopen' : ''}`} onClick={() => onResolve(!resolved)} disabled={busy}>
          <Icon name="check" size={12} />
          {resolved ? 'Unresolve' : 'Resolve'}
        </button>
        <button type="button" className="comment-card-close comment-delete" aria-label="Delete comment" title="Delete comment" onClick={onDelete} disabled={busy}>
          <Icon name="trash" size={13} />
        </button>
        <button type="button" className="comment-card-close" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="comment-card-body">
        {thread.messages.map((m, i) => (
          <CommentMessageRow key={`${m.at}:${i}`} author={m.author} text={m.text} at={m.at} now={now} />
        ))}
      </div>
      <CommentInput placeholder="Reply…" busy={busy} onSubmit={onReply} />
      {/* Mailbox "Ask agent to fix" (spec-comment-to-fix): open = status + Stop; done = chip penutup;
          failed = chip + Retry; cancelled/tanpa request = aksi awal. Thread resolved tidak menawarkan fix. */}
      {!resolved &&
        (fix?.status === 'open' ? (
          <div className="comment-fix-status" role="status">
            <Icon name="loaderCircle" size={12} />
            <span className="comment-fix-status-text">Waiting for {fix.agent ? harnessLabel(fix.agent) : 'an agent'} to fix…</span>
            <button type="button" className="comment-fix-stop" onClick={onCancelFix} disabled={busy}>
              Stop
            </button>
          </div>
        ) : (
          <>
            {(fix?.status === 'done' || fix?.status === 'failed') && (
              <div className={`comment-fix-chip ${fix.status}`}>
                <Icon name={fix.status === 'done' ? 'check' : 'x'} size={11} />
                {fix.status === 'done' ? `fixed by ${fix.agent ? harnessLabel(fix.agent) : 'agent'}` : `fix failed${fix.agent ? ` by ${harnessLabel(fix.agent)}` : ''}`}
              </div>
            )}
            <div className="comment-fix-actions">
              <span className="comment-fix-split">
                <button type="button" className="comment-fix-btn" onClick={() => onRequestFix()} disabled={busy}>
                  <Icon name="sparkles" size={12} />
                  {fix?.status === 'failed' ? 'Retry fix' : 'Ask agent to fix'}
                </button>
                <button
                  type="button"
                  className="comment-fix-caret"
                  aria-label="Choose agent"
                  title="Choose agent"
                  aria-expanded={agentMenu}
                  aria-haspopup="menu"
                  onClick={() => setAgentMenu((v) => !v)}
                  disabled={busy}
                >
                  <Icon name="chevronDown" size={11} />
                </button>
                {agentMenu && (
                  <div className="comment-fix-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAgentMenu(false);
                        void onRequestFix();
                      }}
                    >
                      Any agent
                    </button>
                    {(fixAgents ?? []).map((a) => (
                      <button
                        key={a}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAgentMenu(false);
                          void onRequestFix(a);
                        }}
                      >
                        {harnessLabel(a)}
                      </button>
                    ))}
                  </div>
                )}
              </span>
              <button type="button" className="comment-fix-copy" onClick={onCopyPrompt} title="Copy the fix prompt to your clipboard">
                <Icon name="copy" size={12} />
                Copy prompt
              </button>
            </div>
          </>
        ))}
      <div className="comment-card-hint">Agents can read and reply to this thread</div>
    </div>
  );
}

/**
 * Popover komentar baru di titik klik tool komentar (desain 02): chip lokasi, input "Write a comment…",
 * dan petunjuk pin + mention agen.
 */
export function NewCommentCard({ location, x, y, busy, onSubmit, onClose }: { location: string; x: number; y: number; busy: boolean; onSubmit: (text: string) => Promise<unknown> | void; onClose: () => void }) {
  return (
    <div className="comment-card comment-new canvas-overlay-ui" role="dialog" aria-label="New comment" style={{ left: x + 14, top: y + 18 }} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="comment-card-head">
        <span className="comment-card-title">New comment</span>
        <span className="comment-card-chip" title={location}>
          {location}
        </span>
        <button type="button" className="comment-card-close" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={13} />
        </button>
      </div>
      <CommentInput placeholder="Write a comment…" autoFocus busy={busy} onSubmit={onSubmit} />
      <div className="comment-card-hint">
        Pinned to {location} · <span className="comment-mention">@ mentions an agent</span>
      </div>
    </div>
  );
}

// ---- Panel Comments (sidebar kiri, desain 05) ----

type Filter = 'open' | 'resolved' | 'all';

/** Baris thread di panel: avatar, nama, kutipan pesan pembuka, lokasi + jumlah pesan, waktu relatif. */
function CommentRow({ thread, nameOf, pageNameOf, now, dimmed, disabled, onOpen }: { thread: CommentThread; nameOf: (id: string) => string | undefined; pageNameOf: (id: string) => string | undefined; now: number; dimmed: boolean; disabled?: boolean | undefined; onOpen: () => void }) {
  const first = thread.messages[0]!;
  const resolved = thread.status === 'resolved';
  return (
    <button type="button" className={`comment-row${dimmed ? ' dimmed' : ''}`} disabled={disabled} onClick={onOpen}>
      <CommentAvatar author={first.author} size={26} />
      <span className="comment-row-body">
        <span className="comment-row-top">
          <strong>{authorName(first.author)}</strong>
          {resolved && <span className="comment-resolved-badge">Resolved</span>}
          <time>{relativeTime(lastAt(thread), now)}</time>
        </span>
        <span className="comment-row-text">{first.text}</span>
        <span className="comment-row-meta">
          <Icon name="messageCircle" size={11} />
          <span className="comment-row-loc">{threadLocation(thread, nameOf, pageNameOf)}</span>
          {thread.messages.length > 1 && <span className="comment-count">{thread.messages.length}</span>}
        </span>
      </span>
    </button>
  );
}

/**
 * Panel Comments (desain 05): chip filter `Open · n` / `Resolved · n` / `All`, toggle "This page", daftar thread
 * terbaru-dulu (grup resolved pudar dan bisa dilipat), dan footer toggle "Show resolved on canvas".
 */
export function CommentsPanel({
  threads,
  currentPageId,
  showResolved,
  onShowResolved,
  onOpen,
  nameOf,
  pageNameOf,
  disabled,
}: {
  threads: readonly CommentThread[];
  currentPageId: string;
  /** Pin resolved tampil di canvas (footer switch). */
  showResolved: boolean;
  onShowResolved: (v: boolean) => void;
  /** Buka thread di canvas (pindah halaman + fokus pin). */
  onOpen: (t: CommentThread) => void;
  nameOf: (id: string) => string | undefined;
  pageNameOf: (id: string) => string | undefined;
  /** Pratinjau versi: baris nonaktif (pin/popover disembunyikan canvas; klik tidak bisa membuka). */
  disabled?: boolean | undefined;
}) {
  const now = useNow(30_000);
  const [filter, setFilter] = useState<Filter>('open');
  const [pageOnly, setPageOnly] = useState(false);
  const [resolvedOpen, setResolvedOpen] = useState(true);
  const scoped = pageOnly ? threads.filter((t) => t.pageId === currentPageId) : threads;
  const sorted = [...scoped].sort((a, b) => (lastAt(a) < lastAt(b) ? 1 : -1));
  const open = sorted.filter((t) => t.status === 'open');
  const resolved = sorted.filter((t) => t.status === 'resolved');
  const rows =
    filter === 'all'
      ? { main: open, extra: resolved }
      : filter === 'resolved'
        ? { main: resolved, extra: [] as CommentThread[] }
        : { main: open, extra: [] as CommentThread[] };
  const chip = (f: Filter, label: string) => (
    <button type="button" className={`comment-filter${filter === f ? ' active' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
      {label}
    </button>
  );
  return (
    <div className="comments-panel">
      <div className="comments-filters">
        {chip('open', `Open · ${open.length}`)}
        {chip('resolved', `Resolved · ${resolved.length}`)}
        {chip('all', 'All')}
        <button type="button" className={`comment-filter page${pageOnly ? ' active' : ''}`} aria-pressed={pageOnly} title="Only threads on this page" onClick={() => setPageOnly(!pageOnly)}>
          This page
        </button>
      </div>
      <div className="comments-scroll">
        {rows.main.length === 0 && rows.extra.length === 0 ? (
          <div className="panel-empty">
            <Icon name="messageCircle" size={20} />
            <strong>{filter === 'resolved' ? 'Nothing resolved yet' : 'No comments yet'}</strong>
            <span>Use the comment tool (C) or click a pin to start a thread. Agents can read and reply.</span>
          </div>
        ) : (
          <>
            {rows.main.map((t) => (
              <CommentRow key={t.id} thread={t} nameOf={nameOf} pageNameOf={pageNameOf} now={now} dimmed={filter === 'resolved'} disabled={disabled} onOpen={() => onOpen(t)} />
            ))}
            {rows.extra.length > 0 && (
              <>
                <button type="button" className="comment-resolved-head" aria-expanded={resolvedOpen} onClick={() => setResolvedOpen(!resolvedOpen)}>
                  <Icon name={resolvedOpen ? 'chevronDown' : 'chevronRight'} size={13} />
                  Resolved · {rows.extra.length}
                </button>
                {resolvedOpen &&
                  rows.extra.map((t) => <CommentRow key={t.id} thread={t} nameOf={nameOf} pageNameOf={pageNameOf} now={now} dimmed disabled={disabled} onOpen={() => onOpen(t)} />)}
              </>
            )}
          </>
        )}
      </div>
      <div className="comments-footer">
        <Icon name="messageCircle" size={15} />
        <span className="follow-info">
          <span className="follow-title">Show resolved on canvas</span>
          <span className="follow-subtitle">Dimmed pins with a check</span>
        </span>
        <button type="button" role="switch" aria-checked={showResolved} aria-label="Show resolved on canvas" className={`switch${showResolved ? ' on' : ''}`} onClick={() => onShowResolved(!showResolved)}>
          <i />
        </button>
      </div>
    </div>
  );
}
