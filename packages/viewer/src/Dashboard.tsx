// Dashboard — Recents (desain bagian 01) dan halaman Files / Archive / Settings (bagian 02): sidebar + grid/list dokumen.
// Thumbnail = screenshot board pertama (Thumb.tsx). Search sidebar dengan dropdown hasil (Search.tsx), Ctrl/⌘ F memfokuskannya.
// Kelola file: tombol New file, context menu kartu (klik kanan / "…" / pintasan F2, Del, Ctrl D, Shift F10); daftar
// dimuat ulang lewat `api.onDocsChanged` dan saat agen selesai mengubah dokumen (stream aktivitas). Badge "Live" +
// subjudul "<agen> is editing…" untuk dokumen yang sedang dikerjakan agen (live.ts).
// Aksesibilitas: kartu/baris bukan tombol; judulnya tautan (aktif) / tombol (arsip) yang memegang fokus, pintasan
// (`aria-keyshortcuts` + tooltip), dan klik seluruh kartu. Tombol "…" saudara tautan, tidak bersarang.
// Tablet/mobile (≤768px, desain "Tablet/Mobile — Grid/List"): top bar Dashboard (menu, profil, Search / ikon search)
// menggantikan title bar di browser; sidebar jadi laci. Mobile: New file jadi ikon "+", list dua baris.
// Folder (aplikasi 10): halaman Files menampilkan "Folders" (Folder Item) lalu "Files"; `#/files/<id>` membuka folder
// dengan breadcrumb `Files › <nama>`. New folder, menu folder, "Move to…", dan seret kartu/baris ke folder/breadcrumb.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { activityHub } from './activity';
import { api, errorText, OfflineError, type DaemonStatus, type DocSummary, type FolderState } from './api';
import { openDoc } from './App';
import { FileMenu, Menu, SHORTCUT, type MenuTarget } from './FileMenu';
import { CONNECTIONS_HASH, docHash, fileErrorText, folderHash, inFolder, memberOf, parseSort, SETTINGS_HASH, SORT_KEYS, SORT_LABEL, sortDocs, type SortKey } from './files';
import { dragSource, FolderItem, FolderMenu, FolderNameDialog, useDropTarget, type FolderMenuTarget } from './Folders';
import { Connections, copyText } from './Connections';
import { HARNESSES } from './harnesses';
import { relativeTime } from './format';
import { useNow, useRetry } from './hooks';
import { Icon, type IconName } from './icons';
import { checkView, lastAgentView } from './listColumns';
import { liveDocs, type LiveDoc } from './live';
import { NewFileDialog } from './NewFileDialog';
import { Search } from './Search';
import { SettingsGeneral, SettingsLayout } from './SettingsGeneral';
import { openInNewTab } from './tabs';
import { docSubtitle, Thumb } from './Thumb';

type View = 'grid' | 'list';
const VIEW_KEY = 'lakar.viewer.view';
const SORT_KEY = 'lakar.viewer.sort';
const CONNECT_KEY = 'lakar.viewer.connectCollapsed';

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // penyimpanan tidak tersedia: tetap jalan
  }
}

export type DashboardPage = 'recents' | 'files' | 'archive' | 'settings' | 'connections';

/** Tombol "Copy MCP config": salin config Claude Code; entry MCP tidak ada / gagal → buka Connections. */
function CopyMcpConfig({ className = '' }: { className?: string }) {
  const [state, setState] = useState<'idle' | 'copied'>('idle');
  const copy = async () => {
    try {
      const { mcp } = await api.connections();
      if (!mcp) {
        location.hash = CONNECTIONS_HASH;
        return;
      }
      await copyText(HARNESSES[0]!.snippet(mcp));
      setState('copied');
      setTimeout(() => setState('idle'), 1500);
    } catch {
      location.hash = CONNECTIONS_HASH;
    }
  };
  return (
    <button type="button" className={`btn ${className}`} onClick={copy}>
      <Icon name={state === 'copied' ? 'circleCheck' : 'copy'} size={15} />
      {state === 'copied' ? 'Copied' : 'Copy MCP config'}
    </button>
  );
}

/** Kartu sidebar "Connect an agent"; tombol "–" melipatnya (diingat per peramban). */
function ConnectCard() {
  const [collapsed, setCollapsed] = useState(() => stored(CONNECT_KEY) === '1');
  const toggle = () => {
    setCollapsed((c) => {
      store(CONNECT_KEY, c ? '0' : '1');
      return !c;
    });
  };
  return (
    <div className={`connect-card${collapsed ? ' collapsed' : ''}`}>
      <div className="connect-title">
        <span>Connect an agent</span>
        <button type="button" className="icon-btn connect-toggle" aria-expanded={!collapsed} aria-label={collapsed ? 'Expand Connect an agent' : 'Collapse Connect an agent'} onClick={toggle}>
          <Icon name={collapsed ? 'plus' : 'minus'} size={14} />
        </button>
      </div>
      {!collapsed && (
        <>
          <p>Point Claude Code, Codex, or any ACP harness at Lakar's MCP server.</p>
          <CopyMcpConfig className="connect-copy" />
        </>
      )}
    </div>
  );
}

type MenuState = MenuTarget & { dialog?: 'rename' | 'delete' };

/** Empty State (komponen desain): lingkaran ikon 56px, judul 16/600, deskripsi 300px, aksi. */
function EmptyState({ icon, title, children, action, className = '' }: { icon: IconName; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`empty-state ${className}`}>
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      {children && <span className="empty-desc">{children}</span>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'plug', title: 'Connect your harness', text: "Add Lakar's MCP server to Claude Code, Codex, or any ACP client." },
  { icon: 'pencil', title: 'Ask for a design', text: 'Describe the screen in your harness. Lakar never asks for a prompt here.' },
  { icon: 'activity', title: 'Watch it land', text: 'Changes stream in live, with layout_check after every execute.' },
];

/** Recents pertama kali (desain "Recents — Empty"): empty state + "How it works". */
function FirstRun() {
  return (
    <div className="first-run">
      <EmptyState icon="file" title="No designs yet" action={<CopyMcpConfig />}>
        Ask your agent to design something. Files show up here as soon as the first change lands.
      </EmptyState>
      <section className="get-started" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="section-label">
          How it works
        </h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step-head">
                <span className="step-number">{i + 1}</span>
                <Icon name={s.icon} size={16} />
              </span>
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** Kartu/baris file: klik membuka (arsip: membuka menu), klik kanan / "…" membuka menu, pintasan di tautan judul. */
function fileHandlers(archived: boolean, setMenu: (m: MenuState) => void, onDuplicate: (slug: string) => void) {
  return (d: DocSummary) => {
    const menuAt = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setMenu({ slug: d.slug, x: e.clientX, y: e.clientY });
    };
    const menuBelow = (e: MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ slug: d.slug, x: r.left, y: r.bottom + 4 });
    };
    /** Klik di mana saja pada kartu/baris (bukan tombol "…"). Ctrl/⌘/klik tengah → tab baru tanpa berpindah. */
    const open = (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      if (archived) return setMenu({ slug: d.slug, x: e.clientX, y: e.clientY });
      if (e.ctrlKey || e.metaKey || e.button === 1) openInNewTab(d.slug);
      else openDoc(d.slug);
    };
    /** Pintasan di tautan/tombol judul (pemegang fokus kartu). Enter = klik bawaan elemen. */
    const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
      const r = (e.currentTarget.closest('.card, .list-row') ?? e.currentTarget).getBoundingClientRect();
      const at = { slug: d.slug, x: r.left + 16, y: r.top + 16 };
      if (e.key === 'F2' && !archived) {
        e.preventDefault();
        setMenu({ ...at, dialog: 'rename' });
      } else if (e.key === 'Delete') {
        e.preventDefault();
        setMenu({ ...at, dialog: 'delete' });
      } else if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && !archived) {
        e.preventDefault();
        onDuplicate(d.slug);
      } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault();
        setMenu(at);
      }
    };
    return { open, menuAt, menuBelow, onKeyDown };
  };
}

/** Judul kartu/baris: tautan dokumen (Enter membuka) atau, di Archive, tombol yang membuka menu. */
function FileLink({ d, archived, className, onOpen, onKeyDown }: { d: DocSummary; archived: boolean; className: string; onOpen: (e: MouseEvent<HTMLElement>) => void; onKeyDown: (e: KeyboardEvent<HTMLElement>) => void }) {
  const click = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    onOpen(e);
  };
  if (archived)
    return (
      <button type="button" className={`file-link ${className}`} aria-haspopup="menu" aria-keyshortcuts={SHORTCUT.archived.aria} title={SHORTCUT.archived.title} onClick={click} onKeyDown={onKeyDown}>
        {d.slug}
      </button>
    );
  return (
    <a className={`file-link ${className}`} href={docHash(d.slug)} aria-keyshortcuts={SHORTCUT.file.aria} title={SHORTCUT.file.title} onClick={click} onAuxClick={(e) => e.button === 1 && click(e)} onKeyDown={onKeyDown} draggable={false}>
      {d.slug}
    </a>
  );
}

/** Nilai kolom List yang belum diketahui daemon (tanpa riwayat, sesi lama, atau belum dicek sejak perubahan). */
function Unknown({ title }: { title?: string }) {
  return (
    <span className="list-unknown" title={title}>
      —
    </span>
  );
}

/** Kolom "Last agent" (desain `List Row`): avatar huruf awal + nama harness; edit dari aplikasi = "You". */
function LastAgent({ client, agent }: { client: string | undefined; agent: string | undefined }) {
  const v = lastAgentView(client, agent);
  return (
    <span className="list-col list-agent">
      {v ? (
        <>
          <span className={`list-avatar ${v.kind}`} aria-hidden="true">
            {v.initial}
          </span>
          <span className="list-agent-name">{v.label}</span>
        </>
      ) : (
        <Unknown />
      )}
    </span>
  );
}

/** Kolom "Checks": hasil check terakhir yang mencakup semua board pada rev terkini. */
function CheckStatus({ check }: { check: DocSummary['check'] }) {
  const v = checkView(check);
  return (
    <span className="list-col list-check">
      {v ? (
        <>
          <span className={`check-dot ${v.tone}`} aria-hidden="true" />
          {v.text}
        </>
      ) : (
        <Unknown title="Not checked since the last change" />
      )}
    </span>
  );
}

function MoreButton({ onClick }: { onClick: (e: MouseEvent<HTMLElement>) => void }) {
  return (
    <button type="button" className="icon-btn more-btn" aria-label="More actions" aria-haspopup="menu" title="More actions (Shift+F10)" onClick={onClick}>
      <Icon name="ellipsis" size={16} />
    </button>
  );
}

function LiveBadge({ live }: { live: LiveDoc }) {
  return (
    <span className={`live-badge ${live.color}`} title={live.running ? `${live.label} is editing` : `${live.label} is connected`}>
      <i />
      Live
    </span>
  );
}

const liveSubtitle = (live: LiveDoc | undefined, d: DocSummary) => (live?.running ? `${live.label} is editing…` : live ? `${live.label} · ${relativeTime(d.updatedAt)}` : docSubtitle(d));

const TITLES: Record<Exclude<DashboardPage, 'settings' | 'connections'>, string> = { recents: 'Recents', files: 'Files', archive: 'Archive' };
const NO_FOLDERS: FolderState = { folders: [], membership: {} };

/** Urut nama folder tanpa peka huruf besar (daemon sudah mengurutkan; dijaga juga di sini). */
const byFolderName = <T extends { name: string }>(folders: readonly T[]): T[] => [...folders].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

/** Breadcrumb halaman folder: "Files" (tautan + target lepas ke root) › nama folder. */
function Breadcrumb({ name, onDropRoot }: { name: string; onDropRoot: (slug: string) => void }) {
  const drop = useDropTarget(onDropRoot);
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <a href={folderHash()} className={`breadcrumb-root${drop.active ? ' drop-target' : ''}`} {...drop.props}>
        Files
      </a>
      <Icon name="chevronRight" size={18} className="breadcrumb-sep" />
      <h1 className="breadcrumb-current">{name}</h1>
    </nav>
  );
}

/** Kontrol urut halaman Files (desain "Filter Bar" → "Sort": Last edited ▾). */
function SortControl({ sort, onSort }: { sort: SortKey; onSort: (s: SortKey) => void }) {
  const [at, setAt] = useState<{ x: number; y: number } | undefined>(undefined);
  return (
    <>
      <button
        type="button"
        className="sort-btn"
        aria-haspopup="menu"
        aria-expanded={!!at}
        aria-label={`Sort by ${SORT_LABEL[sort]}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.right - 180, y: r.bottom + 4 });
        }}
      >
        <Icon name="arrowDownUp" size={14} />
        <span className="sort-label">{SORT_LABEL[sort]}</span>
        <Icon name="chevronDown" size={12} className="sort-chevron" />
      </button>
      {at && (
        <Menu
          x={at.x}
          y={at.y}
          onClose={() => setAt(undefined)}
          items={SORT_KEYS.map((k) => ({
            label: SORT_LABEL[k],
            checked: k === sort,
            run: () => {
              setAt(undefined);
              onSort(k);
            },
          }))}
        />
      )}
    </>
  );
}

/** Stream aktivitas agen: badge Live dan muat ulang daftar saat agen selesai mengubah dokumen. */
function useLive(onDocChange: () => void) {
  // Stream dibagi lewat `activityHub` (satu koneksi per jendela, juga dipakai Viewer dan Connections).
  const activity = useSyncExternalStore(activityHub.subscribeState, activityHub.getState);
  const change = useRef(onDocChange);
  change.current = onDocChange;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = activityHub.listen({
      onEvent: (event) => {
        // Execute/rename agen selesai (rev baru) → daftar + thumbnail usang. Digabung supaya rentetan call cukup sekali.
        if (event.type === 'call' && event.call.status !== 'running' && event.call.status !== 'error' && typeof event.call.rev === 'number') {
          clearTimeout(timer);
          timer = setTimeout(() => change.current(), 400);
        }
      },
      onReconnect: () => change.current(),
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);
  const now = useNow(10_000);
  return useMemo(() => liveDocs(activity, now), [activity, now]);
}

export function Dashboard({
  page = 'recents',
  folder,
  menuOpen,
  onCloseMenu,
  onOpenMenu,
}: {
  page?: DashboardPage;
  folder?: string;
  menuOpen: boolean;
  onCloseMenu: () => void;
  /** Tombol menu top bar tablet/mobile (laci sidebar). */
  onOpenMenu?: () => void;
}) {
  const [docs, setDocs] = useState<DocSummary[] | undefined>(undefined);
  const [archive, setArchive] = useState<DocSummary[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  /** lakard tidak terjangkau saat memuat (desain "Dashboard — Offline": "Can't load your files"). */
  const [offline, setOffline] = useState(false);
  const [status, setStatus] = useState<DaemonStatus | undefined>(undefined);
  const [view, setView] = useState<View>(() => (stored(VIEW_KEY) === 'list' ? 'list' : 'grid'));
  const [sort, setSort] = useState<SortKey>(() => parseSort(stored(SORT_KEY)));
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<MenuState | undefined>(undefined);
  /** Nama awal dialog New file; `undefined` = dialog tertutup. */
  const [creating, setCreating] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  /** Folder + keanggotaan (hanya dimuat di halaman Files); gagal dimuat berarti tanpa folder (daftar datar). */
  const [folderState, setFolderState] = useState<FolderState | undefined>(undefined);
  const [folderMenu, setFolderMenu] = useState<FolderMenuTarget | undefined>(undefined);
  const [newFolder, setNewFolder] = useState(false);
  /** Gagal memuat folder (halaman folder menampilkan error, bukan "Folder not found"). */
  const [folderError, setFolderError] = useState<string | undefined>(undefined);
  const archivedPage = page === 'archive';
  const filesPage = page === 'files';
  const settingsPage = page === 'settings' || page === 'connections';

  const load = useCallback(() => {
    setError(undefined);
    const fail = (e: unknown) => {
      if (e instanceof OfflineError) setOffline(true);
      else setError(fileErrorText(e, 'load', undefined, errorText));
    };
    const ok =
      <T,>(set: (v: T) => void) =>
      (v: T) => {
        setOffline(false);
        set(v);
      };
    api.listDocs().then(ok(setDocs), fail);
    if (page === 'archive') api.listArchive().then(ok(setArchive), fail);
    if (page === 'files')
      api.listFolders().then(
        (s) => {
          setFolderState(s);
          setFolderError(undefined);
        },
        (e: unknown) => {
          setFolderState((s) => s ?? NO_FOLDERS);
          if (!(e instanceof OfflineError)) setFolderError(fileErrorText(e, 'folder', undefined, errorText));
        },
      );
    api.status().then(setStatus, () => {});
  }, [page]);
  useEffect(load, [load]);
  useRetry(load);
  // Kelola file dari aplikasi → daftar langsung diperbarui tanpa reload.
  useEffect(() => api.onDocsChanged(load), [load]);
  // Dokumen baru dari agen muncul saat tab kembali aktif.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);
  const live = useLive(load);
  useEffect(() => {
    setMenu(undefined);
    setFolderMenu(undefined);
  }, [page, folder]);

  // Ctrl/⌘ F: fokus Search yang terlihat (sidebar desktop / top bar tablet). Abaikan saat dialog/menu terbuka.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'f') return;
      if (document.querySelector('.modal-scrim, .menu-layer')) return;
      const input = [...document.querySelectorAll<HTMLInputElement>('.dashboard .search input')].find((el) => el.offsetParent !== null);
      if (!input) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const changeView = (v: View) => {
    setView(v);
    store(VIEW_KEY, v);
  };
  const changeSort = (s: SortKey) => {
    setSort(s);
    store(SORT_KEY, s);
  };

  const folders = folderState?.folders ?? NO_FOLDERS.folders;
  const membership = folderState?.membership ?? NO_FOLDERS.membership;
  const currentFolder = filesPage && folder !== undefined ? folders.find((f) => f.id === folder) : undefined;
  /** `#/files/<id>` dengan id yang tidak dikenal (sesudah folder dimuat). */
  const folderMissing = filesPage && folder !== undefined && folderState !== undefined && !currentFolder && !folderError;
  /** Halaman folder dengan daftar folder yang gagal dimuat. */
  const folderLoadFailed = filesPage && folder !== undefined && !currentFolder && folderError !== undefined;
  // Halaman Files menunggu folder dimuat supaya file di folder tidak sempat tampil di root.
  const list = useMemo(() => {
    if (archivedPage) return archive;
    if (!filesPage) return docs;
    if (folderState === undefined || docs === undefined) return undefined;
    return inFolder(docs, membership, currentFolder?.id ?? null);
  }, [archivedPage, archive, filesPage, docs, folderState, membership, currentFolder]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (list ?? []).filter((d) => d.slug.toLowerCase().includes(q));
    return filesPage ? sortDocs(hit, sort) : hit;
  }, [list, query, filesPage, sort]);
  /** Jumlah file aktif per folder (meta Folder Item). */
  const counts = useMemo(() => {
    const n = new Map<string, number>();
    for (const d of docs ?? []) {
      const id = memberOf(membership, d.slug);
      if (id) n.set(id, (n.get(id) ?? 0) + 1);
    }
    return n;
  }, [docs, membership]);
  const showFolders = filesPage && folder === undefined && folders.length > 0 && !error && !offline;
  const moveTo = useCallback(
    (slug: string, id: string | null) => {
      if (memberOf(membership, slug) === id) return;
      api.moveToFolder(slug, id).catch((e: unknown) => setNotice(fileErrorText(e, 'move', slug, errorText)));
    },
    [membership],
  );
  // Judul tab browser = nama folder (dijadwalkan sesudah efek judul App.tsx); folder hilang → kembali 'Files · Lakar'.
  const folderName = currentFolder?.name;
  useEffect(() => {
    if (!filesPage || folder === undefined) return;
    const t = setTimeout(() => {
      document.title = folderName ? `${folderName} · Lakar` : 'Files · Lakar';
    }, 0);
    return () => clearTimeout(t);
  }, [filesPage, folderName, folder]);
  // Slug arsip juga terpakai (server memberi sufiks agar Unarchive tidak bentrok); arsip hanya diketahui bila sudah
  // dimuat, selain itu pratinjau mengandalkan hasil server.
  const taken = useMemo(() => new Set([...(docs ?? []), ...(archive ?? [])].map((d) => d.slug)), [docs, archive]);
  const duplicate = useCallback((slug: string) => {
    api.duplicateFile(slug).catch((e: unknown) => setNotice(fileErrorText(e, 'duplicate', slug, errorText)));
  }, []);
  const handlers = fileHandlers(archivedPage, setMenu, duplicate);

  const newFileBtn = (
    <button type="button" className="btn primary new-file-btn" aria-label="New file" onClick={() => setCreating('Untitled')}>
      <Icon name="plus" size={15} />
      <span className="btn-label">New file</span>
    </button>
  );
  const dragProps = (slug: string) => (filesPage ? dragSource(slug) : {});
  const menuFolder = folderMenu ? folders.find((f) => f.id === folderMenu.id) : undefined;
  /** Recents tanpa file sama sekali: first-run (desain "Recents — Empty"), tanpa view toggle. */
  const firstRun = page === 'recents' && docs !== undefined && docs.length === 0 && !error && !offline;
  const loadFailed = !!error || offline;
  const showToggle = !loadFailed && !folderMissing && !firstRun && !(archivedPage && archive?.length === 0) && !(list?.length === 0 && !showFolders);

  // Tombol search mobile: buka laci lalu fokus Search sidebar sesudah laci ter-render terlihat (efek di bawah).
  const focusSearch = useRef(false);
  const openSearch = () => {
    focusSearch.current = true;
    if (menuOpen) document.querySelector<HTMLInputElement>('.sidebar .search input')?.focus();
    else onOpenMenu?.();
  };
  // Laci terbuka: Escape menutupnya (Search menghentikan Escape miliknya sendiri lebih dulu).
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal-scrim, .menu-layer')) onCloseMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, onCloseMenu]);
  useEffect(() => {
    if (!menuOpen || !focusSearch.current) return;
    focusSearch.current = false;
    document.querySelector<HTMLInputElement>('.sidebar .search input')?.focus();
  }, [menuOpen]);
  const searchDocsList = error || archivedPage ? undefined : docs;

  let body: ReactNode;
  if (folderMissing)
    body = (
      <EmptyState
        icon="folder"
        title="Folder not found"
        action={
          <a className="btn" href={folderHash()}>
            <Icon name="file" size={15} /> Go to Files
          </a>
        }
      >
        It may have been deleted in another window.
      </EmptyState>
    );
  else if (offline && (list === undefined || list.length === 0) && !showFolders)
    body = (
      <EmptyState
        icon="wifiOff"
        title="Can't load your files"
        className="centered"
        action={
          <a className="btn" href={CONNECTIONS_HASH}>
            <Icon name="plug" size={15} /> Open Connections
          </a>
        }
      >
        Lakar lists files through lakard. They'll appear as soon as it's running again.
      </EmptyState>
    );
  else if (error || folderLoadFailed)
    body = (
      <EmptyState
        icon="alert"
        title={error ? "Couldn't load your files" : "Couldn't load folders"}
        className="centered"
        action={
          <button type="button" className="btn" onClick={load}>
            <Icon name="refresh" size={15} /> Try again
          </button>
        }
      >
        {error ?? folderError}
      </EmptyState>
    );
  else if (list === undefined)
    body = (
      <div className="file-grid" aria-busy="true" aria-label="Loading files">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card loading">
            <div className="card-header">
              <span className="skeleton-line wide" />
              <span className="skeleton-line" />
            </div>
            <div className="thumb large skeleton-thumb">
              <div className="skeleton" />
            </div>
          </div>
        ))}
      </div>
    );
  else if (firstRun) body = <FirstRun />;
  else if (list.length === 0 && currentFolder)
    body = (
      <EmptyState icon="folder" title="This folder is empty" action={newFileBtn}>
        Drag files onto the folder, or use Move to… in a file’s menu. New files created here go into this folder.
      </EmptyState>
    );
  else if (list.length === 0 && showFolders) body = <div className="folder-root-empty">{docs?.length ? 'All files are in folders.' : 'No files yet.'}</div>;
  else if (list.length === 0)
    body = archivedPage ? (
      <EmptyState
        icon="archive"
        title="Nothing in archive"
        className="centered"
        action={
          <a className="btn" href="#/files">
            <Icon name="file" size={15} /> Go to Files
          </a>
        }
      >
        Archived files are hidden from Recents. You can restore them anytime.
      </EmptyState>
    ) : (
      <EmptyState icon="file" title="No files yet" action={newFileBtn}>
        Create a file here, or ask your agent to create one with the lakar MCP tools.
      </EmptyState>
    );
  else if (shown.length === 0)
    body = (
      <EmptyState icon="searchX" title={`No results for “${query.trim()}”`} action={!archivedPage ? newFileBtn : undefined}>
        Try a different name.
      </EmptyState>
    );
  else if (view === 'grid')
    body = (
      <div className="file-grid">
        {shown.map((d) => {
          const h = handlers(d);
          const l = archivedPage ? undefined : live.get(d.slug);
          return (
            <div key={d.slug} className={`card${menu?.slug === d.slug ? ' menu-open' : ''}`} onClick={h.open} onContextMenu={h.menuAt} {...dragProps(d.slug)}>
              <div className="card-header">
                <div className="card-title-row">
                  <FileLink d={d} archived={archivedPage} className="card-title" onOpen={h.open} onKeyDown={h.onKeyDown} />
                  {l && <LiveBadge live={l} />}
                  <MoreButton onClick={h.menuBelow} />
                </div>
                <span className="card-subtitle">{archivedPage ? docSubtitle(d) : liveSubtitle(l, d)}</span>
              </div>
              <Thumb doc={d} size="large" archived={archivedPage} />
            </div>
          );
        })}
      </div>
    );
  else
    body = (
      <div className="file-list">
        <div className="list-head" aria-hidden="true">
          <span>Name</span>
          <span>Edited</span>
          <span>Created</span>
          <span>Last agent</span>
          <span>Checks</span>
          <span />
        </div>
        <div role="list" aria-label={currentFolder ? currentFolder.name : TITLES[page as keyof typeof TITLES]}>
          {shown.map((d) => {
            const h = handlers(d);
            const l = archivedPage ? undefined : live.get(d.slug);
            return (
              <div key={d.slug} role="listitem" className={`list-row${menu?.slug === d.slug ? ' menu-open' : ''}`} onClick={h.open} onContextMenu={h.menuAt} {...dragProps(d.slug)}>
                <span className="list-name">
                  <Thumb doc={d} size="mini" archived={archivedPage} />
                  <span className="list-text">
                    <span className="list-title-row">
                      <FileLink d={d} archived={archivedPage} className="list-title" onOpen={h.open} onKeyDown={h.onKeyDown} />
                      {l && <LiveBadge live={l} />}
                    </span>
                    <span className="list-sub">{l?.running ? `${l.label} is editing…` : `Edited ${relativeTime(d.updatedAt)}`}</span>
                  </span>
                </span>
                <span className="list-col">{relativeTime(d.updatedAt)}</span>
                <span className="list-col">{d.createdAt ? relativeTime(d.createdAt) : <Unknown />}</span>
                <LastAgent client={d.lastClient} agent={d.lastAgent} />
                <CheckStatus check={d.check} />
                <MoreButton onClick={h.menuBelow} />
              </div>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="dashboard">
      <header className="dash-topbar">
        <button type="button" className="topbar-btn" aria-label="Menu" aria-expanded={menuOpen} onClick={onOpenMenu}>
          <Icon name="menu" size={18} />
        </button>
        <div className="topbar-profile">
          <span className="avatar">L</span>
          <span className="profile-name">Lakar</span>
        </div>
        <div className="spacer" />
        <div className="topbar-search">
          <Search docs={searchDocsList} query={query} onQuery={setQuery} onCreate={setCreating} />
        </div>
        <button type="button" className="topbar-btn topbar-search-btn" aria-label="Search" onClick={openSearch}>
          <Icon name="search" size={18} />
        </button>
      </header>
      {menuOpen && <div className="scrim" onClick={onCloseMenu} />}
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="sidebar-top">
          <div className="profile">
            <span className="avatar">L</span>
            <span className="profile-name">Lakar</span>
          </div>
          <Search docs={searchDocsList} query={query} onQuery={setQuery} onCreate={setCreating} />
          <nav className="nav" aria-label="Dashboard">
            <a className={`nav-item${page === 'recents' ? ' active' : ''}`} href="#/" aria-current={page === 'recents' ? 'page' : undefined}>
              <Icon name="clock" size={16} />
              <span>Recents</span>
            </a>
          </nav>
        </div>
        <nav className="sidebar-section" aria-label="Local workspace">
          <div className="nav-item static">
            <Icon name="layers" size={16} />
            <span className="nav-strong">Local workspace</span>
            <span className="badge">Local</span>
          </div>
          <a className={`nav-item${filesPage ? ' active' : ''}`} href="#/files" aria-current={filesPage ? 'page' : undefined}>
            <Icon name="file" size={16} />
            <span>Files</span>
          </a>
          <a className={`nav-item${archivedPage ? ' active' : ''}`} href="#/archive" aria-current={archivedPage ? 'page' : undefined}>
            <Icon name="archive" size={16} />
            <span>Archive</span>
          </a>
          <a className={`nav-item${settingsPage ? ' active' : ''}`} href={SETTINGS_HASH} aria-current={settingsPage ? 'page' : undefined}>
            <Icon name="settings" size={16} />
            <span>Settings</span>
          </a>
        </nav>
        <ConnectCard />
        <div className="sidebar-spacer" />
        <footer className="sidebar-footer">{status ? `lakard ${status.version} · ${status.host}:${status.port}` : 'lakard'}</footer>
      </aside>

      {settingsPage ? (
        <SettingsLayout tab={page === 'connections' ? 'connections' : 'general'}>{page === 'connections' ? <Connections /> : <SettingsGeneral />}</SettingsLayout>
      ) : (
        <section className={`main${filesPage ? ' files-page' : ''}${view === 'list' ? ' list-view' : ''}`}>
          <div className="main-header">
            {currentFolder ? <Breadcrumb name={currentFolder.name} onDropRoot={(slug) => moveTo(slug, null)} /> : <h1>{TITLES[page as keyof typeof TITLES]}</h1>}
            {currentFolder && (
              <button
                type="button"
                className="icon-btn folder-header-more"
                aria-label="Folder actions"
                aria-haspopup="menu"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setFolderMenu({ id: currentFolder.id, x: r.left, y: r.bottom + 4 });
                }}
              >
                <Icon name="ellipsis" size={16} />
              </button>
            )}
            <div className="spacer" />
            {filesPage && folder === undefined && folderState !== undefined && !loadFailed && (
              <button type="button" className="btn new-folder-btn" aria-label="New folder" onClick={() => setNewFolder(true)}>
                <Icon name="folderPlus" size={15} />
                <span className="btn-label">New folder</span>
              </button>
            )}
            {!archivedPage && !folderMissing && newFileBtn}
            {showToggle && (
              <div className="view-toggle" role="group" aria-label="View">
                <button type="button" className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} aria-label="Grid view" title="Grid view" onClick={() => changeView('grid')}>
                  <Icon name="layoutGrid" />
                </button>
                <button type="button" className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'} aria-label="List view" title="List view" onClick={() => changeView('list')}>
                  <Icon name="list" />
                </button>
              </div>
            )}
          </div>

          {notice && (
            <div className="notice" role="alert">
              <Icon name="alert" size={14} />
              <span>{notice}</span>
              <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setNotice(undefined)}>
                <Icon name="x" size={12} />
              </button>
            </div>
          )}

          {filesPage && !loadFailed && !folderMissing && (list?.length ?? 0) > 0 && (
            <div className="filter-bar">
              <div className="spacer" />
              <SortControl sort={sort} onSort={changeSort} />
            </div>
          )}

          {showFolders && (
            <>
              <h2 className="section-label">Folders</h2>
              <div className="folder-grid">
                {byFolderName(folders).map((f) => (
                  <FolderItem
                    key={f.id}
                    folder={f}
                    count={counts.get(f.id) ?? 0}
                    menuOpen={folderMenu?.id === f.id}
                    onMenu={(x, y) => setFolderMenu({ id: f.id, x, y })}
                    onDropFile={(slug) => moveTo(slug, f.id)}
                  />
                ))}
              </div>
              <h2 className="section-label">Files</h2>
            </>
          )}

          {body}
        </section>
      )}
      {menu && (
        <FileMenu
          key={`${menu.slug}:${menu.x}:${menu.y}:${menu.dialog ?? ''}`}
          target={menu}
          {...(menu.dialog ? { dialog: menu.dialog } : {})}
          archived={archivedPage}
          port={status?.port}
          taken={taken}
          {...(filesPage && folderState ? { folders, folderOf: memberOf(membership, menu.slug) } : {})}
          onClose={() => setMenu(undefined)}
          onError={setNotice}
        />
      )}
      {folderMenu && menuFolder && (
        <FolderMenu
          key={`${folderMenu.id}:${folderMenu.x}:${folderMenu.y}`}
          target={folderMenu}
          folder={menuFolder}
          folders={folders}
          count={counts.get(menuFolder.id) ?? 0}
          onClose={() => setFolderMenu(undefined)}
          {...(currentFolder?.id === menuFolder.id
            ? {
                fromHeader: true,
                onDeleted: () => {
                  location.hash = folderHash();
                },
              }
            : {})}
        />
      )}
      {newFolder && <FolderNameDialog folders={folders} onClose={() => setNewFolder(false)} />}
      {creating !== undefined && <NewFileDialog taken={taken} initialName={creating} {...(currentFolder ? { folder: currentFolder.id } : {})} onClose={() => setCreating(undefined)} />}
    </div>
  );
}
