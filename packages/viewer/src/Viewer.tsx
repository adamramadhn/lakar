// Viewer read-only (desain bagian 03): Layers kiri dari JSON dokumen, canvas PNG per board, panel kanan
// Activity/Inspect/Checks/History. Seleksi dari layer, board, atau temuan check disorot di canvas. Stream
// aktivitas (`/viewer/events`) memuat ulang dokumen dan PNG board tersentuh saat rev berubah.
// History (aplikasi 3): klik entri → pratinjau versi lama (snapshot) di kanvas baca-saja dengan banner; Restore
// (dari banner atau entri) meminta konfirmasi lalu meng-commit versi itu sebagai rev baru.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { LakarDocument } from '@lakar/schema';
import { activityReducer, connectActivity, harnessColor, harnessLabel, initialActivity, isDocChangeFromViewer, revChange, sessionsForSlug, VIEWER_CLIENT, type ActivityEvent } from './activity';
import { ActivityPanel } from './ActivityPanel';
import { api, ApiError, errorText, OfflineError, type HistoryEntry, type InspectResult, type LayoutCheck } from './api';
import { Canvas, type AgentMark, type CanvasPreview, type Focus, type Highlight } from './Canvas';
import { indexDocument, relativeTime, type NodeInfo, type TreeNode } from './format';
import { HistoryPanel, timeOf } from './HistoryPanel';
import { canRestore, previewLabel } from './history';
import { useNow, useRetry } from './hooks';
import { Icon, NODE_ICON } from './icons';
import { Modal } from './NewFileDialog';
import { ChecksPanel, InspectPanel } from './panels';

const FOLLOW_KEY = 'lakar.viewer.followAgent';
function readFollow(): boolean {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== 'off';
  } catch {
    return true;
  }
}
function writeFollow(v: boolean) {
  try {
    localStorage.setItem(FOLLOW_KEY, v ? 'on' : 'off');
  } catch {
    // penyimpanan tidak tersedia
  }
}

type Tab = 'activity' | 'inspect' | 'checks' | 'history';
const TABS: { id: Tab; label: string }[] = [
  { id: 'activity', label: 'Activity' },
  { id: 'inspect', label: 'Inspect' },
  { id: 'checks', label: 'Checks' },
  { id: 'history', label: 'History' },
];

type Loaded<T> = { state: 'loading' } | { state: 'ok'; value: T } | { state: 'error'; message: string; notFound?: boolean; corrupt?: boolean };

export function Viewer({ slug }: { slug: string }) {
  const [doc, setDoc] = useState<Loaded<{ doc: LakarDocument; loadedAt: number }>>({ state: 'loading' });
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [inspect, setInspect] = useState<Loaded<InspectResult> | undefined>(undefined);
  const [checks, setChecks] = useState<Loaded<LayoutCheck> | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('activity');
  const [attempt, setAttempt] = useState(0);
  const [activity, dispatch] = useReducer(activityReducer, initialActivity);
  const [follow, setFollowState] = useState(readFollow);
  const [focus, setFocus] = useState<Focus | undefined>(undefined);
  /** Rev dasar semua board (muat penuh) dan rev terakhir per board tersentuh menurut event execute. */
  const [baseRev, setBaseRev] = useState(-1);
  const [touched, setTouched] = useState<Record<string, number>>({});
  /** Pratinjau versi lama (History) dan dokumennya dari snapshot. */
  const [preview, setPreview] = useState<{ entry: HistoryEntry; doc: Loaded<LakarDocument> } | undefined>(undefined);
  /** Entri yang menunggu konfirmasi Restore. */
  const [restoreAsk, setRestoreAsk] = useState<HistoryEntry | undefined>(undefined);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | undefined>(undefined);

  const docRef = useRef<LakarDocument | undefined>(undefined);
  /**
   * Muat dokumen. `onlyIfChanged`: abaikan hasil bila id dan rev sama (refresh diam). `full`: semua board
   * dianggap berubah (PNG dimuat ulang); event execute memakai `full=false` sehingga hanya board tersentuh dirender.
   */
  const loadDoc = useCallback(
    (onlyIfChanged = false, full = true) => {
      api.getDoc(slug).then(
        (d) => {
          const prev = docRef.current;
          const changed = !prev || prev.id !== d.id || prev.rev !== d.rev;
          if (onlyIfChanged && !changed) return;
          // Respons lama yang tiba belakangan (getDoc tumpang tindih) tidak boleh memundurkan rev yang tampil.
          if (prev && prev.id === d.id && d.rev < prev.rev) return;
          docRef.current = d;
          if (full || !prev || prev.id !== d.id) {
            setBaseRev(d.rev);
            // Board yang tersentuh di rev lebih baru dari dokumen ini tetap ditandai (event tiba sebelum muatan ini).
            setTouched((t) => Object.fromEntries(Object.entries(t).filter(([, r]) => r > d.rev)));
          }
          setDoc({ state: 'ok', value: { doc: d, loadedAt: Date.now() } });
          if (prev && changed) setAttempt((a) => a + 1);
        },
        (e) => {
          if (e instanceof OfflineError || onlyIfChanged) {
            setDoc((prev) => (prev.state === 'ok' ? prev : { state: 'error', message: errorText(e) }));
            return;
          }
          const code = e instanceof ApiError ? e.code : undefined;
          setDoc({ state: 'error', message: errorText(e), notFound: code === 'NOT_FOUND', corrupt: code === 'SCHEMA_INVALID' });
        },
      );
    },
    [slug],
  );
  useEffect(() => loadDoc(), [loadDoc]);
  // Perubahan agen terlihat saat tab kembali aktif (pola sama dengan Dashboard).
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && loadDoc(true);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadDoc]);

  const current = doc.state === 'ok' ? doc.value.doc : undefined;
  /** Dokumen yang tampil: versi pratinjau bila sudah termuat, selain itu terkini. */
  const previewDoc = preview?.doc.state === 'ok' ? preview.doc.value : undefined;
  const shown = previewDoc ?? current;
  const index = useMemo(() => (shown ? indexDocument(shown) : new Map<string, NodeInfo>()), [shown]);

  // Pratinjau versi: muat dokumen snapshot; ganti slug → keluar dari pratinjau.
  const startPreview = useCallback(
    (entry: HistoryEntry | undefined) => {
      if (!entry) {
        setPreview(undefined);
        return;
      }
      setPreview({ entry, doc: { state: 'loading' } });
      api.getRevision(slug, entry.rev).then(
        (d) => setPreview((p) => (p?.entry.rev === entry.rev ? { entry, doc: { state: 'ok', value: d } } : p)),
        (e) => setPreview((p) => (p?.entry.rev === entry.rev ? { entry, doc: { state: 'error', message: errorText(e) } } : p)),
      );
    },
    [slug],
  );
  useEffect(() => setPreview(undefined), [slug]);

  const restore = useCallback(
    (entry: HistoryEntry) => {
      setRestoring(true);
      setRestoreError(undefined);
      api.restore(slug, entry.rev).then(
        () => {
          setRestoring(false);
          setRestoreAsk(undefined);
          setPreview(undefined);
          loadDoc();
        },
        (e) => {
          setRestoring(false);
          setRestoreError(errorText(e));
        },
      );
    },
    [slug, loadDoc],
  );

  // Stream aktivitas: execute pada dokumen ini → muat ulang dokumen (rev lebih baru) dan PNG board tersentuh;
  // Follow agent → pindah halaman dan geser kamera ke board yang berubah. Reconnect → muat ulang penuh.
  const followRef = useRef(follow);
  followRef.current = follow;
  const onEvent = useRef<(e: ActivityEvent) => void>(() => {});
  onEvent.current = (e) => {
    if (e.type !== 'call') return;
    const c = e.call;
    if (c.slug !== slug || c.status === 'running' || c.status === 'error' || (c.client === VIEWER_CLIENT && !isDocChangeFromViewer(c))) return;
    const boardsTouched = c.tool === 'execute' ? (c.boards ?? []) : [];
    if (typeof c.rev === 'number' && boardsTouched.length) {
      const rev = c.rev;
      setTouched((t) => {
        const next = { ...t };
        for (const b of boardsTouched) next[b] = Math.max(next[b] ?? -1, rev);
        return next;
      });
    }
    const shown = docRef.current;
    const ch = shown ? revChange(e, slug, shown.rev) : undefined;
    if (ch) loadDoc(true, ch.boards === undefined);
    if (followRef.current && boardsTouched.length) setFocus({ boardId: boardsTouched[0]!, nonce: e.seq });
  };
  const reload = useRef(loadDoc);
  reload.current = loadDoc;
  useEffect(
    () =>
      connectActivity({
        onHello: (hello) => dispatch({ type: 'hello', hello }),
        onEvent: (event) => {
          dispatch({ type: 'event', event });
          onEvent.current(event);
        },
        onConnection: (connected) => dispatch({ type: 'connection', connected }),
        onReconnect: () => reload.current(true),
      }),
    [],
  );
  const setFollow = useCallback((v: boolean) => {
    setFollowState(v);
    writeFollow(v);
    if (!v) setFocus(undefined);
  }, []);
  // Board fokus di halaman lain → pindah halaman (Canvas halaman baru lalu menggeser kamera).
  useEffect(() => {
    const info = focus ? index.get(focus.boardId) : undefined;
    if (info && info.pageIndex !== pageIndex) setPageIndex(info.pageIndex);
  }, [focus, index, pageIndex]);
  const onFocused = useCallback((nonce: number) => setFocus((f) => (f?.nonce === nonce ? undefined : f)), []);

  const now = useNow(5000);
  const views = useMemo(() => sessionsForSlug(activity, slug, now), [activity, slug, now]);
  /** Board yang sedang dikerjakan: board dari call terakhir (yang punya board) tiap sesi Live pada dokumen ini. */
  const agents = useMemo<AgentMark[]>(() => {
    const out: AgentMark[] = [];
    for (const v of views) {
      if (!v.live) continue;
      const running = v.calls.find((c) => c.status === 'running');
      const boardOf = (c: (typeof v.calls)[number]) => c.boards?.[0] ?? (c.target ? index.get(c.target)?.boardId : undefined);
      // Call terbaru masih running tanpa board (mis. execute): board targetnya belum diketahui → tanpa outline.
      const newest = v.calls[0];
      if (newest && newest.status === 'running' && !boardOf(newest)) continue;
      for (const c of v.calls) {
        const boardId = boardOf(c);
        if (!boardId) continue;
        const who = harnessLabel(v.session.client);
        out.push({ session: v.session.id, boardId, color: harnessColor(v.session.client), running: running !== undefined, label: running ? `${who} · ${running.tool}` : who });
        break;
      }
    }
    return out;
  }, [views, index]);
  const nameOf = useCallback((id: string) => index.get(id)?.name, [index]);

  const runChecks = useCallback(() => {
    if (!current || current.pages.every((p) => p.children.length === 0)) return;
    setChecks({ state: 'loading' });
    api.layoutCheck(slug).then(
      (r) => setChecks({ state: 'ok', value: r }),
      (e) => setChecks({ state: 'error', message: errorText(e) }),
    );
  }, [slug, current]);
  useEffect(runChecks, [runChecks]);

  // Inspect node terpilih: properti tersimpan + bounds terukur (POST /inspect).
  useEffect(() => {
    // Pratinjau: properti terukur hanya ada untuk versi terkini, jadi Inspect menampilkan data JSON versi itu saja.
    if (!selectedId || preview) {
      setInspect(undefined);
      return;
    }
    let live = true;
    setInspect({ state: 'loading' });
    api.inspect(slug, selectedId, 0).then(
      (r) => live && setInspect({ state: 'ok', value: r }),
      (e) => live && setInspect({ state: 'error', message: errorText(e) }),
    );
    return () => {
      live = false;
    };
  }, [slug, selectedId, attempt, preview]);

  useRetry(() => {
    loadDoc();
    setAttempt((a) => a + 1);
  });

  const select = useCallback(
    (id: string | undefined) => {
      setSelectedId(id);
      const info = id ? index.get(id) : undefined;
      if (info && info.pageIndex !== pageIndex) setPageIndex(info.pageIndex);
    },
    [index, pageIndex],
  );

  if (doc.state === 'loading') {
    return (
      <div className="viewer-message">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }
  if (doc.state === 'error') {
    return (
      <div className="viewer-message">
        <div className="empty-state">
          <Icon name="alert" size={22} />
          <strong>{doc.notFound ? `Document “${slug}” not found` : doc.corrupt ? `Document “${slug}” can't be read` : "Couldn't open this document"}</strong>
          <span>{doc.message}</span>
          <a className="btn" href="#/">
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const { doc: latestDoc, loadedAt } = doc.value;
  const d = previewDoc ?? latestDoc;
  const canvasPreview: CanvasPreview | undefined = preview
    ? {
        rev: preview.entry.rev,
        label: previewLabel(preview.entry, timeOf),
        loading: preview.doc.state === 'loading',
        ...(preview.doc.state === 'error' ? { error: preview.doc.message } : {}),
        restoring,
        canRestore: canRestore(preview.entry, latestDoc.rev),
        onBack: () => setPreview(undefined),
        onRestore: () => {
          setRestoreError(undefined);
          setRestoreAsk(preview.entry);
        },
      }
    : undefined;
  const page = d.pages[pageIndex] ?? d.pages[0];
  const boards = (page?.children ?? []) as unknown as (TreeNode & { x: number; y: number; width: number; height: number })[];
  const selectedInfo = selectedId ? index.get(selectedId) : undefined;
  const highlight: Highlight | undefined =
    selectedInfo && inspect?.state === 'ok' && inspect.value.node.id === selectedId && inspect.value.node.bounds
      ? { boardId: inspect.value.boardId, bounds: inspect.value.node.bounds }
      : selectedInfo
        ? { boardId: selectedInfo.boardId }
        : undefined;
  const summary = checks?.state === 'ok' ? checks.value.summary : undefined;
  /** Rev terakhir tiap board berubah (≤ rev dokumen): PNG board lain dipakai ulang dari cache. */
  const boardRevs: Record<string, number> = {};
  for (const b of boards) boardRevs[b.id] = Math.min(d.rev, Math.max(baseRev, touched[b.id] ?? -1));

  return (
    <div className="viewer">
      <aside className="layers-panel">
        <div className="file-header">
          <div className="file-title">{slug}</div>
          <div className="file-meta">
            {previewDoc ? `Previewing rev ${d.rev} · latest ${latestDoc.rev}` : `Rev ${d.rev} · loaded ${relativeTime(loadedAt)}`}
          </div>
        </div>
        <div className="panel-tabs">
          <span className="panel-tab active">Layers</span>
        </div>
        <div className="pages">
          <div className="section-label">Pages</div>
          {d.pages.map((p, i) => (
            <button key={p.id} type="button" className={`page-row${p === page ? ' active' : ''}`} onClick={() => setPageIndex(i)}>
              <Icon name="file" size={12} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <div className="layer-tree">
          <div className="section-label">Layers</div>
          {boards.length === 0 ? <div className="muted-note">No boards on this page yet.</div> : <LayerTree key={page?.id} nodes={boards} selectedId={selectedId} selectedPath={selectedInfo} index={index} onSelect={select} />}
        </div>
      </aside>

      <Canvas
        key={page?.id}
        slug={slug}
        rev={d.rev}
        boardRevs={boardRevs}
        boards={boards}
        agents={agents}
        focus={focus && boards.some((b) => b.id === focus.boardId) ? focus : undefined}
        onFocused={onFocused}
        highlight={highlight}
        summary={summary}
        checksLoading={checks?.state === 'loading'}
        onSelect={select}
        onOpenChecks={() => setTab('checks')}
        preview={canvasPreview}
      />

      <aside className="side-panel">
        <div className="panel-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`panel-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="panel-body">
          {tab === 'inspect' && <InspectPanel info={selectedInfo} inspect={inspect} />}
          {tab === 'checks' && <ChecksPanel checks={checks} index={index} selectedId={selectedId} onSelect={select} onRun={runChecks} hasBoards={d.pages.some((p) => p.children.length > 0)} />}
          {tab === 'activity' && <ActivityPanel views={views} connected={activity.connected} follow={follow} onFollow={setFollow} nameOf={nameOf} />}
          {tab === 'history' && (
            <HistoryPanel
              slug={slug}
              rev={latestDoc.rev}
              previewRev={preview?.entry.rev}
              onPreview={startPreview}
              onRestore={(entry) => {
                setRestoreError(undefined);
                setRestoreAsk(entry);
              }}
            />
          )}
        </div>
      </aside>
      {restoreAsk && <RestoreDialog entry={restoreAsk} busy={restoring} error={restoreError} onCancel={() => !restoring && setRestoreAsk(undefined)} onConfirm={() => restore(restoreAsk)} />}
    </div>
  );
}

/** Konfirmasi singkat Restore: versi dipulihkan sebagai revisi baru, riwayat tidak dihapus. */
function RestoreDialog({ entry, busy, error, onCancel, onConfirm }: { entry: HistoryEntry; busy: boolean; error: string | undefined; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal label="Restore version" onClose={onCancel} className="small confirm">
      <span className="confirm-icon neutral">
        <Icon name="rotateCcw" size={18} />
      </span>
      <div className="modal-text">
        <h2>Restore rev {entry.rev}?</h2>
        <p>“{entry.description}” becomes a new revision on top of the history. Nothing is deleted, and agents continue from the restored version.</p>
      </div>
      {error && <div className="modal-error">{error}</div>}
      <div className="modal-buttons">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" data-autofocus className="btn primary" disabled={busy} onClick={onConfirm}>
          {busy ? 'Restoring…' : 'Restore'}
        </button>
      </div>
    </Modal>
  );
}

function LayerTree({
  nodes,
  selectedId,
  selectedPath,
  index,
  onSelect,
}: {
  nodes: TreeNode[];
  selectedId: string | undefined;
  selectedPath: NodeInfo | undefined;
  index: Map<string, NodeInfo>;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(nodes.map((n) => n.id)));
  // Buka leluhur node terpilih (mis. dipilih dari Checks) supaya barisnya terlihat.
  useEffect(() => {
    if (!selectedPath) return;
    const anc: string[] = [];
    for (let p = selectedPath.parentId; p; p = index.get(p)?.parentId) anc.push(p);
    if (anc.some((id) => !open.has(id))) setOpen((prev) => new Set([...prev, ...anc]));
  }, [selectedPath]);
  useEffect(() => {
    if (selectedId) document.querySelector(`[data-layer="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, open]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows: ReactNode[] = [];
  const walk = (n: TreeNode, depth: number) => {
    const kids = n.children ?? [];
    const isOpen = open.has(n.id);
    const selected = n.id === selectedId;
    rows.push(
      <div
        key={n.id}
        data-layer={n.id}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={kids.length ? isOpen : undefined}
        tabIndex={0}
        className={`layer-row${selected ? ' selected' : ''}${depth === 0 ? ' top' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onSelect(n.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(n.id);
          } else if (e.key === 'ArrowRight' && kids.length && !isOpen) toggle(n.id);
          else if (e.key === 'ArrowLeft' && kids.length && isOpen) toggle(n.id);
        }}
      >
        <span
          className="chevron"
          onClick={(e) => {
            e.stopPropagation();
            if (kids.length) toggle(n.id);
          }}
        >
          {kids.length > 0 && <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} />}
        </span>
        <Icon name={NODE_ICON[n.type] ?? 'square'} size={13} className="type-icon" />
        <span className="layer-label">{n.name}</span>
      </div>,
    );
    if (isOpen) for (const c of kids) walk(c, depth + 1);
  };
  for (const n of nodes) walk(n, 0);
  return <div role="tree">{rows}</div>;
}
