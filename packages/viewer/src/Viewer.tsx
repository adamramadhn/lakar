// Viewer read-only (desain bagian 03): Layers kiri dari JSON dokumen, canvas PNG per board, panel kanan
// Inspect/Checks/Activity/History. Seleksi dari layer, board, atau temuan check disorot di canvas.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LakarDocument } from '@lakar/schema';
import { api, ApiError, errorText, OfflineError, type InspectResult, type LayoutCheck } from './api';
import { Canvas, type Highlight } from './Canvas';
import { indexDocument, relativeTime, type NodeInfo, type TreeNode } from './format';
import { useRetry } from './hooks';
import { Icon, NODE_ICON } from './icons';
import { ChecksPanel, InspectPanel, SoonPanel } from './panels';

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
  const [tab, setTab] = useState<Tab>('inspect');
  const [attempt, setAttempt] = useState(0);

  const docRef = useRef<LakarDocument | undefined>(undefined);
  /** Muat dokumen. `onlyIfChanged`: abaikan hasil bila id dan rev sama (refresh diam saat tab aktif lagi). */
  const loadDoc = useCallback(
    (onlyIfChanged = false) => {
      api.getDoc(slug).then(
        (d) => {
          const prev = docRef.current;
          const changed = !prev || prev.id !== d.id || prev.rev !== d.rev;
          if (onlyIfChanged && !changed) return;
          docRef.current = d;
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
  const index = useMemo(() => (current ? indexDocument(current) : new Map<string, NodeInfo>()), [current]);

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
    if (!selectedId) {
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
  }, [slug, selectedId, attempt]);

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

  const { doc: d, loadedAt } = doc.value;
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

  return (
    <div className="viewer">
      <aside className="layers-panel">
        <div className="file-header">
          <div className="file-title">{slug}</div>
          <div className="file-meta">
            Rev {d.rev} · loaded {relativeTime(loadedAt)}
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
        boards={boards}
        highlight={highlight}
        summary={summary}
        checksLoading={checks?.state === 'loading'}
        onSelect={select}
        onOpenChecks={() => setTab('checks')}
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
          {tab === 'activity' && <SoonPanel icon="activity" title="Activity" text="Live tool calls from your agents will show here." />}
          {tab === 'history' && <SoonPanel icon="clock" title="History" text="A timeline of changes per execute will show here." />}
        </div>
      </aside>
    </div>
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
