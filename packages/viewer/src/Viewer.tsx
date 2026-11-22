// Viewer (desain bagian 03): Layers kiri dari JSON dokumen, canvas PNG per board, panel kanan
// Activity/Inspect/Checks/History. Seleksi dari layer, board, atau temuan check disorot di canvas. Stream
// aktivitas (`/viewer/events`) memuat ulang dokumen dan PNG board tersentuh saat rev berubah.
// History (aplikasi 3): klik entri → pratinjau versi lama (snapshot) di kanvas baca-saja dengan banner; Restore
// (dari banner atau entri) meminta konfirmasi lalu meng-commit versi itu sebagai rev baru.
// Layer manual (aplikasi 4): tool sisip di kanvas dan menu "+" di header Layers menjalankan `execute` dari sesi
// viewer dengan kode codegen.ts. Sesudahnya dokumen dimuat ulang (event sesi viewer tidak dipancarkan daemon) dan
// node baru dipilih. Gagal → toast, dokumen tidak berubah.
// Aksi edit (editor-canvas story 6): hapus, group/ungroup, duplikat, urutan z, align/distribute, nudge, dan pilih
// semua lewat shortcut, menu konteks (canvas + Layers), dan panel Design; satu permintaan route ops per aksi dengan
// undo/redo dari op invers per jendela (editActions.ts, EditMenu.tsx).
// Kehadiran agen (aplikasi 5): `agentPresence` (presence.ts) dari stream → kursor + outline di Canvas dan state
// baris Layers (agent / created / changed); disembunyikan saat pratinjau versi.
// Kelola halaman (aplikasi 8): section Pages (PagesPanel.tsx) menambah/rename/mengurutkan/menghapus halaman lewat
// route `/viewer/docs/:slug/pages…`. Halaman aktif dilacak per ID; board baru dari viewer masuk ke halaman aktif.
// Responsif (aplikasi 9): tablet (≤1100px) → panel kiri jadi laci di atas kanvas (tombol "Layers" + scrim); mobile
// (<768px) → top bar viewer (back, nama file + halaman yang membuka laci, History) dan panel kanan jadi bottom sheet
// (BottomSheet.tsx). Di desktop elemen tambahan disembunyikan CSS; hanya state tata letak yang ditambah di sini.
// Paritas desain: header file (nama + chevron menu file, keterangan "Updated … by …" dari History), tab
// Layers/Assets, toast rollback saat execute agen gagal, pill "Last synced …" saat offline, chip "Following agent"
// di mobile, dan bagian "Parent layout" di Inspect (properti induk dari dokumen).
// Sinkron antar jendela: stream dibagi lewat `activityHub`; layer manual dari jendela lain (`change` `edit`) memuat
// ulang dokumen, dan dokumen yang diarsip/dihapus di jendela lain menampilkan pesan dengan jalan kembali ke
// Dashboard/Archive (`requestCloseTab`), bukan 404 mentah. Rename di jendela lain ditangani App (tab ikut pindah).
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { resolveDocument, type DocOp, type LakarDocument } from '@lakar/schema';
import { toggleSelection, type GeoNode } from './gesture';
import { actionState, EDIT_ACTIONS, nudgeNodes, nudgeOps, planAction, selectAllIds, selectionAfter, shortcutAction, type EditAction, type EditPlan } from './editActions';
import { EditMenu } from './EditMenu';
import { EMPTY_STACKS, recordCommit, settleStep, takeStep, type UndoStacks } from './undoHistory';
import { attachSelectionReporter } from './selectionSync';
import { lastAgentLabel, pruneSelection, shareBadgeText, undoSkippedFor } from './liveChanges';
import { UndoSkippedToast, type UndoSkipped } from './UndoSkippedToast';
import { activityHub, editChange, goneReason, harnessLabel, revChange, sessionsForSlug, slugAppeared, type StreamEvent } from './activity';
import { ActivityPanel } from './ActivityPanel';
import { BottomSheet } from './BottomSheet';
import { AddLayerButton, IconPicker, Toast, type ToastState } from './AddLayer';
import { api, ApiError, errorText, OfflineError, type FontFamily, type HistoryEntry, type InspectResult, type LayoutCheck } from './api';
import { Canvas, type CanvasMarker, type CanvasPreview, type Focus, type Highlight, type InsertPoint } from './Canvas';
import { failureText, imageFileProblem, insertBoardAt, insertBoardPlaced, insertIntoBoard, canvasInsertTarget, menuInsertTarget, type InsertExtra, type InsertKind, type InsertTarget } from './codegen';
import { resolvePageIndex } from './pages';
import { PagesPanel } from './PagesPanel';
import { indexDocument, relativeTime, type NodeInfo, type TreeNode } from './format';
import { HistoryPanel, timeOf } from './HistoryPanel';
import { canRestore, fileMeta, previewLabel } from './history';
import { FileMenu } from './FileMenu';
import { useNow, useOffline, useRetry } from './hooks';
import { Icon, NODE_ICON } from './icons';
import { Modal } from './NewFileDialog';
import { ChecksPanel } from './panels';
import { DesignPanel } from './DesignPanel';
import { parentLayoutOf, type DesignTarget } from './designModel';
import { measureLiveSize } from './liveGeometry';
import { agentPresence, layerMarks, type LayerMarkInfo } from './presence';
import { sheetForTab, type SheetState } from './sheet';
import { requestCloseTab } from './tabs';
import { getCamera, getViewState, saveCamera, saveViewState, type PanelTab } from './viewState';

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

/** Media query tata letak tablet (laci Layers); sama dengan app.css. */
const DRAWER_QUERY = '(max-width: 1100px)';

type Tab = PanelTab;
const TABS: { id: Tab; label: string }[] = [
  { id: 'activity', label: 'Activity' },
  { id: 'design', label: 'Design' },
  { id: 'checks', label: 'Checks' },
  { id: 'history', label: 'History' },
];


/**
 * Fokus di kolom ketik (input, textarea, select, contentEditable): Delete/Backspace milik kolom itu. Event dari
 * shadow root (teks yang diedit inline di board live) dicek pada target aslinya (`composedPath()[0]`).
 */
const typingTarget = (e: Event) => {
  const t = e.composedPath()[0] ?? e.target;
  return t instanceof HTMLElement && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable);
};

const NO_ACTIONS = Object.fromEntries(EDIT_ACTIONS.map((a) => [a, false])) as Record<EditAction, boolean>;

/** Pesan Restore gagal; CONFLICT = versi usang (ada perubahan lebih baru) atau versi terkini. */
const restoreErrorText = (e: unknown) =>
  e instanceof ApiError && e.code === 'CONFLICT' ? `Newer changes arrived since you opened this version. Check History and try again. (${e.message})` : errorText(e);

type Loaded<T> = { state: 'loading' } | { state: 'ok'; value: T } | { state: 'error'; message: string; notFound?: boolean; corrupt?: boolean };

type RawNode = Record<string, unknown> & { id: string; name: string; type: string; children?: RawNode[] };

/** Node mentah dokumen berdasarkan id (untuk properti induk di Inspect). */
function findNode(doc: LakarDocument, id: string): RawNode | undefined {
  const walk = (nodes: readonly RawNode[]): RawNode | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const hit = walk(n.children ?? []);
      if (hit) return hit;
    }
    return undefined;
  };
  for (const p of doc.pages) {
    const hit = walk(p.children as unknown as RawNode[]);
    if (hit) return hit;
  }
  return undefined;
}

/** Node rect dengan fill gambar: ikon Image di Layers/Assets (desain "Visual"). */
const isImageNode = (n: { type: string; fills?: unknown }) => n.type === 'rect' && Array.isArray(n.fills) && n.fills.some((f) => (f as { type?: unknown })?.type === 'image');

/** Aset dokumen untuk tab Assets: gambar terunggah dan ikon, urut dokumen. */
type AssetItem = { id: string; name: string; kind: 'image' | 'icon'; where: string };
function collectAssets(doc: LakarDocument): AssetItem[] {
  const out: AssetItem[] = [];
  for (const p of doc.pages) {
    for (const board of p.children as unknown as RawNode[]) {
      const walk = (n: RawNode) => {
        if (isImageNode(n as { type: string; fills?: unknown })) out.push({ id: n.id, name: n.name, kind: 'image', where: board.name });
        else if (n.type === 'icon') out.push({ id: n.id, name: typeof n.icon === 'string' ? `${String(n.lib ?? '')} / ${n.icon}` : n.name, kind: 'icon', where: board.name });
        for (const c of n.children ?? []) walk(c);
      };
      walk(board);
    }
  }
  return out;
}

/** Batas node temuan yang diukur untuk marker kanvas per run check. */
const MARKER_MAX = 24;

/** Durasi toast rollback di atas kanvas (desain "Viewer — Desktop — Error"). */
const ROLLBACK_MS = 6000;

export function Viewer({ slug }: { slug: string }) {
  const [doc, setDoc] = useState<Loaded<{ doc: LakarDocument; loadedAt: number }>>({ state: 'loading' });
  // State tampilan dipulihkan dari kunjungan tab sebelumnya (viewState.ts, memori sesi) dan disimpan tiap berubah.
  const [saved] = useState(() => getViewState(slug));
  /** Halaman aktif per ID (undefined = belum ditentukan: indeks tersimpan viewState dipakai). */
  const [pageId, setPageId] = useState<string | undefined>(undefined);
  /** Indeks halaman aktif pada dokumen terkini terakhir: tetangga saat halaman aktif dihapus. */
  const lastPageIndex = useRef(saved?.pageIndex ?? 0);
  /** Halaman baru dari "+" yang belum ada di dokumen termuat (jangan dianggap terhapus). */
  const pendingPage = useRef<string | undefined>(undefined);
  /** Seleksi (urutan pilih; terakhir = primer untuk Inspect/viewState). Canvas live dan Layers berbagi state ini. */
  const [selection, setSelection] = useState<string[]>(() => (saved?.selectedId ? [saved.selectedId] : []));
  const selectedId = selection[selection.length - 1];
  /** Ganti seleksi dengan satu node (atau kosong); bentuk fungsi menerima primer saat ini, hasil sama = tidak berubah. */
  const setSelectedId = useCallback((v: string | undefined | ((cur: string | undefined) => string | undefined)) => {
    setSelection((prev) => {
      const cur = prev[prev.length - 1];
      const next = typeof v === 'function' ? v(cur) : v;
      if (typeof v === 'function' && next === cur) return prev;
      return next ? [next] : [];
    });
  }, []);
  const [inspect, setInspect] = useState<Loaded<InspectResult> | undefined>(undefined);
  const [checks, setChecks] = useState<Loaded<LayoutCheck> | undefined>(undefined);
  const [tab, setTab] = useState<Tab>(saved?.panel ?? 'activity');
  const [attempt, setAttempt] = useState(0);
  const activity = useSyncExternalStore(activityHub.subscribeState, activityHub.getState);
  /** Dokumen diarsip/dihapus di jendela lain selagi terbuka. */
  const [gone, setGone] = useState<'archived' | 'deleted' | undefined>(undefined);
  /** Dokumen tidak ditemukan tetapi ada di arsip (pesan + tombol Open Archive). */
  const [inArchive, setInArchive] = useState(false);
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
  const offline = useOffline();
  /** Toast sisip/hapus/unggah: gagal, "Deleted …" + Undo, atau "Uploading image…". */
  const [toast, setToastState] = useState<ToastState | undefined>(undefined);
  const setToast = useCallback((message: string) => setToastState({ message, kind: 'error' }), []);
  const closeToast = useCallback(() => setToastState(undefined), []);
  /** Sisipan Icon menunggu pilihan di pemilih ikon. */
  const [iconAsk, setIconAsk] = useState<InsertTarget | undefined>(undefined);
  /** Sisipan Image menunggu file dari pemilih file. */
  const imageTarget = useRef<InsertTarget | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Node baru yang dipilih begitu dokumen termuat ulang (halaman ikut pindah). */
  const pendingSelect = useRef<string | undefined>(undefined);
  /** Execute dari viewer yang sedang berjalan (Delete berulang tidak dikirim dua kali). */
  const editing = useRef(0);
  /** Tata letak tablet/mobile: laci Layers/Pages terbuka, state bottom sheet (mobile). */
  const [layersOpen, setLayersOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState>('half');
  /** Tab panel kiri (desain "Panel Tabs": Layers | Assets). */
  const [leftTab, setLeftTab] = useState<'layers' | 'assets'>('layers');
  /** Menu file dari chevron di header file. */
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number } | undefined>(undefined);
  /** Ringkasan History untuk keterangan header file. */
  const [histInfo, setHistInfo] = useState<{ count: number; top?: HistoryEntry } | undefined>(undefined);
  /** Toast rollback: execute agen pada dokumen ini gagal (perubahan tidak diterapkan). */
  const [rollback, setRollback] = useState<{ text: string; key: number } | undefined>(undefined);
  /** Waktu kontak terakhir dengan lakard (muat dokumen / event): pill "Last synced …" saat offline. */
  const lastSync = useRef(Date.now());
  // Laci hanya ada di ≤1100px (sama dengan app.css): Escape menutupnya lebih dulu (fase capture) dan tidak diteruskan
  // ke shortcut kanvas (Escape kanvas menghapus seleksi). Layar melebar melewati 1100px → laci ditutup.
  useEffect(() => {
    if (!layersOpen) return;
    const mq = matchMedia(DRAWER_QUERY);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !mq.matches) return;
      e.stopPropagation();
      setLayersOpen(false);
    };
    const onChange = () => !mq.matches && setLayersOpen(false);
    window.addEventListener('keydown', onKey, { capture: true });
    mq.addEventListener('change', onChange);
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      mq.removeEventListener('change', onChange);
    };
  }, [layersOpen]);

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
          lastSync.current = Date.now();
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
  const currentRev = current?.rev;
  useEffect(() => {
    if (currentRev === undefined) return;
    let live = true;
    api.getHistory(slug).then(
      (entries) => live && setHistInfo(entries[0] ? { count: entries.length, top: entries[0] } : { count: 0 }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [slug, currentRev]);
  useEffect(() => {
    if (!rollback) return;
    const t = setTimeout(() => setRollback(undefined), ROLLBACK_MS);
    return () => clearTimeout(t);
  }, [rollback]);
  /** Dokumen yang tampil: versi pratinjau bila sudah termuat, selain itu terkini. */
  const previewDoc = preview?.doc.state === 'ok' ? preview.doc.value : undefined;
  const shown = previewDoc ?? current;
  const index = useMemo(() => (shown ? indexDocument(shown) : new Map<string, NodeInfo>()), [shown]);
  /** Indeks dokumen terkini (bukan pratinjau): pembersihan seleksi dan target undo (story 3). */
  const latestIndex = useMemo(() => (current ? (shown === current ? index : indexDocument(current)) : undefined), [current, shown, index]);
  const latestIndexRef = useRef(latestIndex);
  latestIndexRef.current = latestIndex;
  /** Nama node yang pernah terlihat jendela ini (nama node yang sudah dihapus agen untuk toast Undo skipped). */
  const knownNames = useRef(new Map<string, string>());
  const prevLatest = useRef<Map<string, NodeInfo> | undefined>(undefined);
  // Dokumen terkini berganti: node yang hilang (dihapus agen/jendela lain) keluar dari seleksi (dan laporan get_selection).
  useEffect(() => {
    if (!latestIndex) return;
    for (const [id, n] of latestIndex) knownNames.current.set(id, n.name);
    // Pratinjau versi: tidak dipangkas; dokumen pembanding tetap, jadi node yang dihapus selama pratinjau dibuang sesudahnya.
    if (previewDoc) return;
    const prev = prevLatest.current;
    prevLatest.current = latestIndex;
    if (!prev || prev === latestIndex) return;
    setSelection((sel) => pruneSelection(sel, (id) => prev.has(id), (id) => latestIndex.has(id)) as string[]);
  }, [latestIndex, previewDoc]);
  /** Dokumen tampil ter-resolve (AD-10): nilai token untuk panel Design (swatch, detach). Resolve gagal → nilai tersimpan. */
  const resolvedShown = useMemo(() => {
    if (!shown) return undefined;
    try {
      return resolveDocument(shown) as unknown as LakarDocument;
    } catch {
      return undefined;
    }
  }, [shown]);
  /** Font terpasang di lakard untuk Typography (GET /viewer/fonts); dimuat saat tab Design dibuka, dicoba lagi saat Retry/koneksi pulih (`attempt`). */
  const [fonts, setFonts] = useState<FontFamily[]>([]);
  const needFonts = tab === 'design' && fonts.length === 0;
  useEffect(() => {
    if (!needFonts) return;
    let live = true;
    api.fonts().then(
      (f) => live && setFonts(f),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [needFonts, attempt]);
  // Halaman aktif per ID. Tidak ada di dokumen: pratinjau versi lama atau halaman baru yang belum termuat → indeks
  // terakhir; selain itu halaman sudah dihapus → tetangga (resolvePageIndex).
  const pageFound = pageId !== undefined && !!shown?.pages.some((p) => p.id === pageId);
  const pageWaiting = !pageFound && (previewDoc !== undefined || (pageId !== undefined && pageId === pendingPage.current));
  const pageIndex = shown ? resolvePageIndex(shown.pages, pageWaiting ? undefined : pageId, lastPageIndex.current) : lastPageIndex.current;
  // Sinkronkan ID dan indeks terakhir dengan dokumen terkini (bukan pratinjau).
  useEffect(() => {
    if (previewDoc || !current || pageWaiting) return;
    const p = current.pages[pageIndex];
    if (!p) return;
    if (pendingPage.current && current.pages.some((x) => x.id === pendingPage.current)) pendingPage.current = undefined;
    lastPageIndex.current = pageIndex;
    if (p.id !== pageId) setPageId(p.id);
  }, [current, previewDoc, pageIndex, pageId, pageWaiting]);
  useEffect(() => saveViewState(slug, { pageIndex, selectedId, panel: tab }), [slug, pageIndex, selectedId, tab]);
  /** Pindah ke halaman indeks `i` dokumen yang tampil. */
  const goPage = useCallback(
    (i: number) => {
      const id = shown?.pages[i]?.id;
      if (id) setPageId(id);
    },
    [shown],
  );
  // Seleksi yang dipulihkan dari viewState bisa menunjuk node yang sudah tidak ada: dicek sekali saat dokumen
  // pertama termuat. Seleksi langsung oleh pengguna tidak disentuh.
  const restoredSelection = useRef(saved?.selectedId);
  useEffect(() => {
    const id = restoredSelection.current;
    if (id === undefined || !current) return;
    restoredSelection.current = undefined;
    if (selectedId === id && !index.has(id)) setSelectedId(undefined);
  }, [current, index, selectedId]);

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
      // baseRev = rev terkini yang diketahui viewer: daemon menolak bila agen sudah menulis sesudahnya.
      api.restore(slug, entry.rev, docRef.current?.rev).then(
        () => {
          setRestoring(false);
          setRestoreAsk(undefined);
          setPreview(undefined);
          // Versi lama dipulihkan: invers gestur sebelumnya tidak lagi bermakna terhadap dokumen ini.
          setStacks(EMPTY_STACKS);
          loadDoc();
        },
        (e) => {
          setRestoring(false);
          setRestoreError(restoreErrorText(e));
          if (e instanceof ApiError && e.code === 'CONFLICT') loadDoc(true);
        },
      );
    },
    [slug, loadDoc],
  );

  // Stream aktivitas: execute pada dokumen ini → muat ulang dokumen (rev lebih baru) dan PNG board tersentuh;
  // Follow agent → pindah halaman dan geser kamera ke board yang berubah. Reconnect → muat ulang penuh.
  const followRef = useRef(follow);
  followRef.current = follow;
  const onEvent = useRef<(e: StreamEvent) => void>(() => {});
  onEvent.current = (e) => {
    lastSync.current = Date.now();
    if (e.type === 'change') {
      // Perubahan dari jendela lain; gema jendela ini disaring helper (origin sama).
      const reason = goneReason(e, slug, api.origin);
      if (reason) {
        setGone(reason);
        return;
      }
      if (slugAppeared(e, slug) && (gone !== undefined || doc.state === 'error')) {
        setGone(undefined);
        loadDoc();
        return;
      }
      const shown = docRef.current;
      const ch = shown && !gone ? editChange(e, slug, shown.rev, api.origin) : undefined;
      if (ch) {
        if (ch.boards.length) {
          setTouched((t) => {
            const next = { ...t };
            for (const b of ch.boards) next[b] = Math.max(next[b] ?? -1, ch.rev);
            return next;
          });
        }
        loadDoc(true, ch.boards.length === 0);
      }
      return;
    }
    if (e.type !== 'call') return;
    const c = e.call;
    // Execute agen gagal pada dokumen ini → toast "…: execute failed, change rolled back" (snippet atomik).
    if (c.slug === slug && c.tool === 'execute' && c.status === 'error' && c.client !== 'lakar-viewer') {
      setRollback({ text: `${harnessLabel(c.client)}: execute failed, change rolled back`, key: e.seq });
    }
    // Klien viewer sendiri disaring oleh `revChange` (satu-satunya gerbang aturan itu).
    if (c.slug !== slug || c.status === 'running' || c.status === 'error') return;
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
      activityHub.listen({
        onEvent: (event) => onEvent.current(event),
        onReconnect: () => reload.current(true),
      }),
    [],
  );
  // Seleksi canvas dilaporkan ke daemon (AD-9, debounce) supaya agen membacanya lewat get_selection; dikirim ulang
  // saat stream tersambung lagi (daemon mungkin restart) dan dikosongkan saat Viewer ditutup.
  const reporter = useRef<ReturnType<typeof attachSelectionReporter> | undefined>(undefined);
  useEffect(() => {
    const r = attachSelectionReporter(slug, selectionRef.current, (s, addresses) => api.putSelection(s, addresses), (l) => activityHub.listen(l));
    reporter.current = r;
    return () => {
      r.dispose();
      if (reporter.current === r) reporter.current = undefined;
    };
  }, [slug]);
  useEffect(() => {
    reporter.current?.update(selection);
  }, [selection]);
  // Tidak ditemukan: cek arsip supaya pesan bisa menunjuk ke Archive.
  const notFound = doc.state === 'error' && doc.notFound === true;
  useEffect(() => {
    setInArchive(false);
    if (!notFound) return;
    let live = true;
    api.listArchive().then(
      (docs) => live && setInArchive(docs.some((d) => d.slug === slug)),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [notFound, slug]);
  // Stream aktivitas terputus → probe lakard lewat GET dokumen (tiap 5 dtk selama terputus) supaya status offline
  // (banner, pill "Last synced …", badge Disconnected) muncul tanpa menunggu aksi pengguna.
  const streamDown = !activity.connected;
  useEffect(() => {
    if (!streamDown) return;
    const probe = () => reload.current(true);
    const first = setTimeout(probe, 1000);
    const t = setInterval(probe, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [streamDown]);
  const setFollow = useCallback((v: boolean) => {
    setFollowState(v);
    writeFollow(v);
    if (!v) setFocus(undefined);
  }, []);
  // Board fokus di halaman lain → pindah halaman (Canvas halaman baru lalu menggeser kamera).
  useEffect(() => {
    const info = focus ? index.get(focus.boardId) : undefined;
    if (info && info.pageIndex !== pageIndex) goPage(info.pageIndex);
  }, [focus, index, pageIndex, goPage]);
  const onFocused = useCallback((nonce: number) => setFocus((f) => (f?.nonce === nonce ? undefined : f)), []);

  const now = useNow(5000);
  const views = useMemo(() => sessionsForSlug(activity, slug, now), [activity, slug, now]);
  const viewsRef = useRef(views);
  viewsRef.current = views;
  /**
   * Kehadiran agen (kursor, outline, baris Layers) tiap sesi Live pada dokumen ini. `now` (5 dtk) cukup untuk
   * jendela sorotan 10 dtk: pudarnya sendiri berjalan di CSS (`forwards`).
   */
  const presence = useMemo(() => agentPresence(views, index, now), [views, index, now]);
  const marks = useMemo(() => layerMarks(presence), [presence]);
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

  // Marker temuan di kanvas (desain "Warning Outline/Marker"): bounds node temuan diukur lewat POST /inspect
  // (maks. MARKER_MAX node per run check). Temuan pada board cukup memakai kotak board.
  const [findingBounds, setFindingBounds] = useState<Record<string, { boardId: string; bounds: [number, number, number, number] }>>({});
  const checkFindings = checks?.state === 'ok' ? checks.value.findings : undefined;
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    if (!checkFindings) return;
    let live = true;
    const ids = [...new Set(checkFindings.map((f) => f.nodeId))].filter((id) => {
      const info = indexRef.current.get(id);
      return info && info.type !== 'board';
    });
    setFindingBounds({});
    for (const id of ids.slice(0, MARKER_MAX)) {
      api.inspect(slug, id, 0).then(
        (r) => {
          const b = r.node.bounds;
          if (live && b) setFindingBounds((m) => ({ ...m, [id]: { boardId: r.boardId, bounds: b } }));
        },
        () => {},
      );
    }
    return () => {
      live = false;
    };
  }, [slug, checkFindings]);

  // Inspect node terpilih: properti tersimpan + bounds terukur (POST /inspect).
  useEffect(() => {
    // Pratinjau: properti terukur hanya ada untuk versi terkini, jadi Inspect menampilkan data JSON versi itu saja.
    if (!selectedId || preview) {
      setInspect(undefined);
      return;
    }
    let live = true;
    // Node sama (rev baru): data lama tetap tampil sampai hasil baru tiba (tanpa kedip highlight).
    setInspect((p) => (p?.state === 'ok' && p.value.node.id === selectedId ? p : { state: 'loading' }));
    api.inspect(slug, selectedId, 0).then(
      (r) => live && setInspect({ state: 'ok', value: r }),
      (e) => live && setInspect({ state: 'error', message: errorText(e) }),
    );
    return () => {
      live = false;
    };
    // Panel Design: diukur ulang tiap rev (Copy as dan posisi terukur mengikuti edit); tab lain hanya saat seleksi berubah.
  }, [slug, selectedId, attempt, preview, tab === 'design' ? currentRev : undefined]);

  useRetry(() => {
    loadDoc();
    setAttempt((a) => a + 1);
  });

  const select = useCallback(
    (id: string | undefined) => {
      setSelectedId(id);
      const info = id ? index.get(id) : undefined;
      if (info && info.pageIndex !== pageIndex) goPage(info.pageIndex);
    },
    [index, pageIndex, goPage],
  );

  // Node baru (sisipan) terpilih begitu ada di dokumen yang tampil; halaman ikut pindah.
  useEffect(() => {
    const id = pendingSelect.current;
    if (id && index.has(id)) {
      pendingSelect.current = undefined;
      select(id);
    }
  }, [index, select]);

  const editable = doc.state === 'ok' && !preview && !offline;

  /** Jalankan snippet viewer; sukses → muat ulang (board tersentuh saja) dan pilih node baru. */
  const runEdit = useCallback(
    (code: string, description: string, after?: (created: string | undefined, rev: number) => void) => {
      editing.current++;
      return api.execute(slug, code, description).then(
        (r) => {
          editing.current--;
          const created = r.created[0]?.id;
          const boardsTouched = r.check?.boards ?? [];
          if (boardsTouched.length) {
            setTouched((t) => {
              const next = { ...t };
              for (const b of boardsTouched) next[b] = Math.max(next[b] ?? -1, r.rev);
              return next;
            });
          }
          after?.(created, r.rev);
          loadDoc(true, boardsTouched.length === 0);
        },
        (e) => {
          editing.current--;
          setToast(e instanceof ApiError ? failureText(e.message, e.hint) : errorText(e));
        },
      );
    },
    [slug, loadDoc],
  );

  // Gestur canvas (story 4): satu gestur = satu permintaan ops (AD-7). Tumpukan undo/redo per jendela berisi op
  // invers dari respons route (AD-8); undo/redo dijalankan sebagai commit baru. Invers gagal (mis. node sudah dihapus
  // agen) → entri dibuang + toast, tanpa undo sebagian. Undo hapus (Delete + toast) tetap memakai restore (story 6).
  // Transisi tumpukan murni di undoHistory.ts; ref = nilai terkini untuk callback async, state = render tombol.
  const stacks = useRef<UndoStacks>(EMPTY_STACKS);
  const [undoDepth, setUndoDepth] = useState({ undo: 0, redo: 0 });
  const setStacks = useCallback((s: UndoStacks) => {
    stacks.current = s;
    setUndoDepth({ undo: s.undo.length, redo: s.redo.length });
  }, []);
  /** Satu permintaan ops (AD-7): sukses → invers ke tumpukan undo, dokumen dimuat ulang; gagal → toast, undefined. */
  const applyEdit = useCallback(
    (ops: DocOp[], description: string) => {
      editing.current++;
      return api.applyOps(slug, ops, description).then(
        (r) => {
          editing.current--;
          setStacks(recordCommit(stacks.current, r.inverse, description, Date.now()));
          loadDoc(true);
          return r;
        },
        (e) => {
          editing.current--;
          setToast(e instanceof ApiError ? failureText(e.message, e.hint) : errorText(e));
          loadDoc(true);
          return undefined;
        },
      );
    },
    [slug, loadDoc, setToast, setStacks],
  );
  const commitOps = useCallback((ops: DocOp[], description: string): Promise<boolean> => applyEdit(ops, description).then((r) => r !== undefined), [applyEdit]);
  /** Commit gestur canvas: rev commit (pratinjau ditahan sampai board di-mount dari rev itu), undefined bila gagal. */
  const commitGesture = useCallback((ops: DocOp[], description: string): Promise<number | undefined> => applyEdit(ops, description).then((r) => r?.rev), [applyEdit]);
  /** Toast "Undo skipped" (desain r69qO): entri undo/redo dibuang karena target sudah diubah/dihapus perubahan lain. */
  const [undoSkipped, setUndoSkipped] = useState<UndoSkipped | undefined>(undefined);
  const closeUndoSkipped = useCallback(() => setUndoSkipped(undefined), []);
  /** Undo atau redo: kirim op invers teratas; sukses → invers respons masuk tumpukan seberang, gagal → entri dibuang. */
  const stepHistory = useCallback(
    (dir: 'undo' | 'redo') => {
      // Satu permintaan tulis viewer sekaligus (klik toolbar beruntun, gestur yang masih dikirim).
      if (editing.current > 0) return;
      const { entry, stacks: rest } = takeStep(stacks.current, dir);
      if (!entry) return;
      setStacks(rest);
      editing.current++;
      api.applyOps(slug, entry.ops, `${dir === 'undo' ? 'Undo' : 'Redo'} ${entry.label}`).then(
        (r) => {
          editing.current--;
          setStacks(settleStep(stacks.current, dir, entry, { ok: true, inverse: r.inverse, at: Date.now() }));
          loadDoc(true);
        },
        (e) => {
          editing.current--;
          // Invers ditolak daemon (4xx, mis. NOT_FOUND) → entri dibuang; offline/5xx → entri dikembalikan.
          const transient = !(e instanceof ApiError) || e.status >= 500;
          setStacks(settleStep(stacks.current, dir, entry, { ok: false, transient }));
          // Ditolak permanen (4xx, mis. agen menghapus target, AD-8): toast desain "Undo skipped" (liveChanges.ts).
          const skipped = undoSkippedFor(
            dir,
            entry.ops,
            { transient, message: e instanceof ApiError ? e.message : undefined },
            (id) => latestIndexRef.current?.has(id) ?? true,
            (id) => knownNames.current.get(id),
            lastAgentLabel(viewsRef.current, entry.at),
          );
          if (skipped) setUndoSkipped({ key: Date.now(), ...skipped });
          else setToast(`Couldn't ${dir}: ${errorText(e)}`);
          loadDoc(true);
        },
      );
    },
    [slug, loadDoc, setToast, setStacks],
  );
  const undo = useCallback(() => stepHistory('undo'), [stepHistory]);
  const redo = useCallback(() => stepHistory('redo'), [stepHistory]);
  // Ctrl/⌘+Z = undo, Ctrl/⌘+Shift+Z atau Ctrl+Y = redo; bukan saat mengetik atau dialog/menu terbuka.
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const isUndo = k === 'z' && !e.shiftKey;
      const isRedo = (k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey && e.ctrlKey);
      if (!isUndo && !isRedo) return;
      if (typingTarget(e) || document.querySelector('.modal-scrim, .menu-layer')) return;
      e.preventDefault();
      if (e.repeat || editing.current > 0) return;
      stepHistory(isUndo ? 'undo' : 'redo');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editable, stepHistory]);
  const selectIds = useCallback((ids: string[]) => setSelection(ids), []);
  const toggleSelect = useCallback((id: string) => setSelection((prev) => toggleSelection(prev, id)), []);

  const insert = useCallback(
    (t: InsertTarget, extra: InsertExtra = {}) => {
      const { code, description } = t.board
        ? insertIntoBoard(t.kind, t.board, t.x, t.y, extra)
        : t.placed
          ? insertBoardPlaced(t.placed.pageId, t.placed.pageBoards)
          : insertBoardAt(t.x, t.y, t.pageId);
      void runEdit(code, description, (id) => {
        if (!id) return;
        pendingSelect.current = id;
        setSelectedId(id);
      });
    },
    [runEdit],
  );

  /** Tujuan sudah diketahui: Image → pemilih file, Icon → pemilih ikon, lainnya langsung disisipkan. */
  const beginInsert = useCallback(
    (t: InsertTarget) => {
      if (t.kind === 'image') {
        imageTarget.current = t;
        const input = fileInput.current;
        if (input) {
          input.value = '';
          input.click();
        }
      } else if (t.kind === 'icon') setIconAsk(t);
      else insert(t);
    },
    [insert],
  );

  /** Status edit terkini untuk callback async (unggahan selesai sesudah pratinjau dibuka/offline). */
  const editableRef = useRef(false);
  editableRef.current = editable;
  const onImageFile = useCallback(
    (file: File | undefined) => {
      const t = imageTarget.current;
      imageTarget.current = undefined;
      if (!file || !t) return;
      const problem = imageFileProblem(file);
      if (problem) {
        setToast(problem);
        return;
      }
      setToastState({ message: 'Uploading image…', kind: 'busy' });
      api.uploadAsset(file).then(
        (a) => {
          if (!editableRef.current) {
            setToast("Image uploaded but not inserted: the canvas can't be edited right now.");
            return;
          }
          setToastState(undefined);
          insert(t, { image: a });
        },
        (e) => setToast(e instanceof ApiError ? failureText(e.message, e.hint) : errorText(e)),
      );
    },
    [insert, setToast],
  );

  /** Operasi halaman: sukses → muat ulang dokumen; gagal → toast (dokumen dimuat ulang bila sudah usang). */
  const pageWrite = useCallback(
    (op: Promise<{ pageId: string }>, after?: (pageId: string) => void): Promise<void> =>
      op.then(
        (r) => {
          after?.(r.pageId);
          loadDoc();
        },
        (e) => {
          setToast(errorText(e));
          if (e instanceof ApiError && (e.code === 'NOT_FOUND' || e.code === 'CONFLICT')) loadDoc(true);
        },
      ),
    [loadDoc, setToast],
  );
  const addPage = useCallback(
    () =>
      void pageWrite(api.addPage(slug), (id) => {
        pendingPage.current = id;
        setPageId(id);
      }),
    [slug, pageWrite],
  );
  const renamePage = useCallback((id: string, name: string) => void pageWrite(api.renamePage(slug, id, name)), [slug, pageWrite]);
  const movePage = useCallback((id: string, to: number) => void pageWrite(api.movePage(slug, id, to)), [slug, pageWrite]);
  const deletePage = useCallback((id: string) => pageWrite(api.deletePage(slug, id)), [slug, pageWrite]);

  // ---- Aksi edit (story 6): group, ungroup, duplikat, hapus, urutan z, align, distribute, nudge, pilih semua ----
  // Plan murni dari editActions.ts atas geometri halaman (Canvas mengisi `sceneRef`), satu permintaan ops per aksi,
  // invers ke tumpukan undo jendela ini (AD-7, AD-8). Hapus tidak lagi memakai execute + restore rev.
  const sceneRef = useRef<(() => GeoNode[]) | null>(null);
  /** Render ulang saat geometri canvas berubah (ketersediaan Align & distribute di panel Design). */
  const [, setSceneTick] = useState(0);
  const onSceneChange = useCallback(() => setSceneTick((v) => v + 1), []);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const runPlan = useCallback(
    (plan: EditPlan, deleted: boolean) =>
      applyEdit(plan.ops, plan.label).then((r) => {
        if (!r) return;
        const next = selectionAfter(plan, r.refs);
        if (next) setSelection(next);
        if (!deleted) return;
        // Toast "Deleted …" + Undo = undo tumpukan, hanya bila entri hapus ini masih teratas.
        const entry = stacks.current.undo[stacks.current.undo.length - 1];
        const undoDelete = () => {
          // Tulisan lain masih berjalan: toast tetap, pengguna bisa mengklik lagi.
          if (editing.current > 0) return;
          setToastState(undefined);
          if (entry && stacks.current.undo[stacks.current.undo.length - 1] === entry) stepHistory('undo');
          else setToast("Couldn't undo this delete: it was already undone or newer edits were made.");
        };
        setToastState({ message: plan.label.replace(/^Delete /, 'Deleted '), kind: 'info', ...(entry ? { action: { label: 'Undo', run: undoDelete } } : {}) });
      }),
    [applyEdit, stepHistory, setToast],
  );
  /** Jalankan aksi untuk `ids` (default seleksi): aksi tak berlaku → toast/diam; satu permintaan tulis sekaligus. */
  const runAction = useCallback(
    (kind: EditAction, ids?: string[]) => {
      if (!editableRef.current || editing.current > 0) return;
      const plan = planAction(kind, sceneRef.current?.() ?? [], ids ?? selectionRef.current);
      if (!plan) return;
      if ('error' in plan) {
        setToast(plan.error);
        return;
      }
      void runPlan(plan, kind === 'delete');
    },
    [runPlan, setToast],
  );
  // Nudge panah: Δ menumpuk selama commit berjalan; dikirim sesudah dokumen termuat pada rev commit sebelumnya, dengan
  // x/y dari dokumen tersimpan (geometri canvas baru diukur ulang sesudah board di-mount ulang).
  const nudge = useRef({ dx: 0, dy: 0, waitRev: -1 });
  const flushNudge = useCallback(() => {
    const n = nudge.current;
    const d = docRef.current;
    if ((n.dx === 0 && n.dy === 0) || editing.current > 0 || !d || d.rev < n.waitRev || !editableRef.current) return;
    const nodes = nudgeNodes(sceneRef.current?.() ?? [], selectionRef.current, (id) => findNode(d, id));
    const { dx, dy } = n;
    n.dx = 0;
    n.dy = 0;
    const plan = nudgeOps(nodes, dx, dy);
    if (!plan) return;
    void applyEdit(plan.ops, plan.label).then((r) => {
      if (r) n.waitRev = r.rev;
      else {
        // Gagal: Δ yang menumpuk selama permintaan berjalan dibuang (tidak ikut nudge berikutnya).
        n.dx = 0;
        n.dy = 0;
      }
    });
  }, [applyEdit]);
  useEffect(() => flushNudge(), [currentRev, flushNudge]);
  // Seleksi berganti: Δ yang belum terkirim milik seleksi lama.
  useEffect(() => {
    nudge.current.dx = 0;
    nudge.current.dy = 0;
  }, [selection]);
  // Shortcut aksi (bukan saat mengetik, termasuk teks yang diedit inline, atau dialog/menu terbuka).
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if (typingTarget(e) || document.querySelector('.modal-scrim, .menu-layer')) return;
      const s = shortcutAction(e);
      if (!s) return;
      if ('selectAll' in s) {
        e.preventDefault();
        setSelection(selectAllIds(sceneRef.current?.() ?? [], selectionRef.current));
        return;
      }
      if (!selectionRef.current.length) return;
      if ('action' in s) {
        e.preventDefault();
        if (!e.repeat) runAction(s.action);
        return;
      }
      // Panah di baris Layers = navigasi pohon, bukan nudge.
      if (e.target instanceof HTMLElement && e.target.closest('[role="treeitem"]')) return;
      e.preventDefault();
      nudge.current.dx += s.nudge[0];
      nudge.current.dy += s.nudge[1];
      flushNudge();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editable, runAction, flushNudge]);
  /** Menu konteks aksi (canvas live / baris Layers) dengan seleksi saat dibuka. */
  const [editMenu, setEditMenu] = useState<{ x: number; y: number; ids: string[] } | undefined>(undefined);
  const openLayerMenu = useCallback((id: string, x: number, y: number) => {
    const cur = selectionRef.current;
    const ids = cur.includes(id) ? [...cur] : [id];
    if (!cur.includes(id)) setSelection(ids);
    setEditMenu({ x, y, ids });
  }, []);

  if (gone || (doc.state === 'error' && doc.notFound)) {
    const archived = gone === 'archived' || (!gone && inArchive);
    return (
      <div className="viewer-message">
        <div className="empty-state" role="alert">
          <Icon name={archived ? 'archive' : 'alert'} size={22} />
          <strong>
            {gone === 'archived'
              ? `“${slug}” was archived in another window`
              : gone === 'deleted'
                ? `“${slug}” was deleted in another window`
                : archived
                  ? `“${slug}” is in the Archive`
                  : `Document “${slug}” not found`}
          </strong>
          <span>{archived ? 'Unarchive it from the Archive to keep working on it.' : gone ? 'This file no longer exists.' : 'It may have been renamed, archived, or deleted.'}</span>
          <div className="empty-actions">
            <button type="button" className="btn" onClick={() => requestCloseTab(slug, '#/')}>
              Back to Dashboard
            </button>
            {archived && (
              <button type="button" className="btn" onClick={() => requestCloseTab(slug, '#/archive')}>
                Open Archive
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
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
          <strong>{doc.corrupt ? `Document “${slug}” can't be read` : "Couldn't open this document"}</strong>
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
  /** Marker temuan per node (level terberat menang); disembunyikan saat pratinjau versi. */
  const markers: CanvasMarker[] = [];
  if (!preview && checks?.state === 'ok') {
    const byNode = new Map<string, CanvasMarker>();
    for (const f of checks.value.findings) {
      const info = index.get(f.nodeId);
      if (!info) continue;
      const fb = findingBounds[f.nodeId];
      const m: CanvasMarker | undefined =
        info.type === 'board' ? { nodeId: f.nodeId, boardId: info.boardId, level: f.level } : fb ? { nodeId: f.nodeId, boardId: fb.boardId, bounds: fb.bounds, level: f.level } : undefined;
      const prev = byNode.get(f.nodeId);
      if (m && (!prev || (prev.level === 'warning' && m.level === 'error'))) byNode.set(f.nodeId, m);
    }
    markers.push(...byNode.values());
  }
  /**
   * Target panel Design (story 5): node tersimpan + pasangan ter-resolve + layout induk + ukuran terukur DOM live, urut
   * seleksi (terakhir = primer). Hanya dihitung saat tab Design terbuka.
   */
  const designTargets: DesignTarget[] =
    tab === 'design'
      ? selection.flatMap((id) => {
          const info = index.get(id);
          const n = findNode(d, id);
          if (!info || !n) return [];
          const parentLayout = parentLayoutOf(info.type, info.parentId ? findNode(d, info.parentId) : undefined);
          const r = resolvedShown ? findNode(resolvedShown, id) : undefined;
          return [{ id, type: n.type, name: n.name, stored: n, resolved: r ?? n, parentLayout, measured: measureLiveSize(document, info.boardId, id) }];
        })
      : [];
  const docHasBoards = d.pages.some((p) => p.children.length > 0);
  const meta = previewDoc
    ? `Previewing rev ${d.rev} · latest ${latestDoc.rev}`
    : fileMeta(histInfo, latestDoc.pages.reduce((n, p) => n + p.children.length, 0), loadedAt, (t) => relativeTime(t, now), harnessLabel);
  const assets = leftTab === 'assets' ? collectAssets(d) : [];
  /** Pilih halaman dari Pages: seleksi di halaman lain dilepas (Inspect tidak menampilkan node yang tidak terlihat). */
  const choosePage = (id: string) => {
    setPageId(id);
    const i = d.pages.findIndex((p) => p.id === id);
    setSelectedId((sel) => (sel && index.get(sel)?.pageIndex !== i ? undefined : sel));
  };
  const hasLive = views.some((v) => v.live);
  /** Locate di Agent Commit Row: pilih node lalu geser kamera ke board-nya bila belum terlihat (mekanisme Focus). */
  const locate = (id: string) => {
    const info = index.get(id);
    if (!info || preview) return;
    select(id);
    setFocus({ boardId: info.boardId, nonce: Date.now() });
  };
  /** Badge "Selection shared with agents" (desain RIpNN): seleksi tidak kosong dan ada agen Live pada dokumen ini. */
  const shareBadge = selection.length > 0 && !preview && !offline && hasLive ? shareBadgeText(selectedId ? index.get(selectedId)?.name : undefined, selection.length) : undefined;
  /** Rev terakhir tiap board berubah (≤ rev dokumen): PNG board lain dipakai ulang dari cache. */
  const onCanvasInsert = (kind: InsertKind, at: InsertPoint) => {
    beginInsert(canvasInsertTarget(kind, at, boards, page));
  };
  /** Menu "+": board terpilih (atau board pertama halaman) di kiri atas + 40px; tanpa board → Frame jadi board baru di halaman aktif. */
  const menuBoard = (selectedInfo && boards.find((b) => b.id === selectedInfo.boardId)) ?? boards[0];
  const onMenuInsert = (kind: InsertKind) => {
    const t = menuInsertTarget(kind, menuBoard, boards, page);
    if (t) beginInsert(t);
  };
  const boardRevs: Record<string, number> = {};
  for (const b of boards) boardRevs[b.id] = Math.min(d.rev, Math.max(baseRev, touched[b.id] ?? -1));

  /** Pilih tab panel; sheet mobile yang collapsed terbuka ke half. */
  const openTab = (t: Tab) => {
    setTab(t);
    setSheet(sheetForTab);
  };

  return (
    <div className={`viewer sheet-${sheet}${layersOpen ? ' layers-open' : ''}`}>
      <header className="viewer-topbar">
        <a className="viewer-topbar-btn" href="#/" aria-label="Back to Dashboard">
          <Icon name="chevronLeft" size={18} />
        </a>
        <button type="button" className="viewer-topbar-file" aria-label="Layers and pages" aria-expanded={layersOpen} onClick={() => setLayersOpen((v) => !v)}>
          <span className="viewer-topbar-title">{slug}</span>
          <span className="viewer-topbar-page">{previewDoc ? `Previewing rev ${d.rev}` : page?.name}</span>
        </button>
        <button type="button" className={`viewer-topbar-btn${tab === 'history' ? ' active' : ''}`} aria-label="History" title="History" onClick={() => openTab('history')}>
          <Icon name="history" size={18} />
        </button>
      </header>
      <aside className="layers-panel">
        <div className="file-header">
          <div className="file-row">
            <div className="file-title" title={slug}>
              {slug}
            </div>
            <button
              type="button"
              className="file-menu-btn"
              aria-label="File menu"
              aria-haspopup="menu"
              aria-expanded={fileMenu !== undefined}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setFileMenu({ x: r.left, y: r.bottom + 6 });
              }}
            >
              <Icon name="chevronDown" size={13} />
            </button>
          </div>
          <div className="file-meta" title={`Rev ${latestDoc.rev}`}>
            {meta}
          </div>
        </div>
        <div className="panel-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={leftTab === 'layers'} className={`panel-tab${leftTab === 'layers' ? ' active' : ''}`} onClick={() => setLeftTab('layers')}>
            Layers
          </button>
          <button type="button" role="tab" aria-selected={leftTab === 'assets'} className={`panel-tab${leftTab === 'assets' ? ' active' : ''}`} onClick={() => setLeftTab('assets')}>
            Assets
          </button>
        </div>
        {leftTab === 'assets' ? (
          <div className="layer-tree assets">
            <div className="section-header">
              <span className="section-label">Assets</span>
            </div>
            {assets.length === 0 ? (
              <div className="muted-note">No assets yet. Images and icons added to this file show up here.</div>
            ) : (
              assets.map((a) => (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  className={`layer-row asset-row${a.id === selectedId ? ' selected' : ''}`}
                  style={{ paddingLeft: 8 }}
                  title={a.where}
                  onClick={() => select(a.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      select(a.id);
                    }
                  }}
                >
                  <Icon name={a.kind === 'image' ? 'image' : 'star'} size={13} className="type-icon" />
                  <span className="layer-label">{a.name}</span>
                  <span className="asset-where">{a.where}</span>
                </div>
              ))
            )}
          </div>
        ) : (
          <>
        <PagesPanel
          pages={d.pages.map((p) => ({ id: p.id, name: p.name, boardCount: p.children.length }))}
          activeId={page?.id}
          editable={editable}
          disabledReason={preview ? 'Not available while previewing a version' : 'lakard is offline'}
          onSelect={choosePage}
          onAdd={addPage}
          onRename={renamePage}
          onMove={movePage}
          onDelete={deletePage}
        />
        <div className="layer-tree">
          <div className="section-header">
            <span className="section-header-left">
              <span className="section-label">Layers</span>
              {shareBadge && (
                <span className="share-badge compact" title={shareBadge}>
                  <Icon name="radio" size={10} />
                  Shared
                </span>
              )}
            </span>
            <AddLayerButton disabled={!editable} disabledReason={preview ? 'Not available while previewing a version' : 'lakard is offline'} hasBoard={boards.length > 0} onPick={onMenuInsert} />
          </div>
          {boards.length === 0 ? <div className="muted-note">No layers yet</div> : <LayerTree key={page?.id} nodes={boards} selectedId={selectedId} selectedIds={selection} selectedPath={selectedInfo} index={index} onSelect={select} onToggle={toggleSelect} onMenu={openLayerMenu} marks={preview ? undefined : marks} />}
        </div>
          </>
        )}
      </aside>
      <div className="layers-scrim" aria-hidden="true" onClick={() => setLayersOpen(false)} />
      <button type="button" className="layers-toggle" aria-expanded={layersOpen} onClick={() => setLayersOpen((v) => !v)}>
        <Icon name="layers" size={15} />
        <span>Layers</span>
        <Icon name="chevronDown" size={12} className="layers-toggle-chevron" />
      </button>

      <Canvas
        key={page?.id}
        camera={page ? getCamera(slug, page.id) : undefined}
        onCamera={(c) => page && saveCamera(slug, page.id, c)}
        slug={slug}
        doc={latestDoc}
        rev={d.rev}
        boardRevs={boardRevs}
        boards={boards}
        presence={presence}
        focus={focus && boards.some((b) => b.id === focus.boardId) ? focus : undefined}
        onFocused={onFocused}
        highlight={highlight}
        summary={summary}
        checksLoading={checks?.state === 'loading'}
        onSelect={select}
        selection={selection}
        onSelectIds={selectIds}
        onCommit={commitGesture}
        shareBadge={shareBadge}
        canUndo={editable && undoDepth.undo > 0}
        canRedo={editable && undoDepth.redo > 0}
        onUndo={undo}
        onRedo={redo}
        sceneRef={sceneRef}
        onSceneChange={onSceneChange}
        onContextMenu={(x, y, ids) => setEditMenu({ x, y, ids })}
        onOpenChecks={() => openTab('checks')}
        preview={canvasPreview}
        editable={editable}
        onInsert={onCanvasInsert}
        docEmpty={!docHasBoards}
        stale={offline ? relativeTime(lastSync.current, now) : undefined}
        markers={markers}
        onMarker={(id) => {
          select(id);
          openTab('checks');
        }}
        overlay={
          <>
            {undoSkipped && <UndoSkippedToast key={undoSkipped.key} toast={undoSkipped} onHistory={() => openTab('history')} onClose={closeUndoSkipped} />}
            {rollback && (
              <div key={rollback.key} className="rollback-toast canvas-overlay-ui" role="alert">
                <Icon name="undo2" size={14} />
                <span>{rollback.text}</span>
              </div>
            )}
            {hasLive && !preview && (
              <button type="button" className={`follow-chip canvas-overlay-ui${follow ? ' on' : ''}`} aria-pressed={follow} onClick={() => setFollow(!follow)}>
                <Icon name="crosshair" size={14} />
                <span>{follow ? 'Following agent' : 'Follow agent'}</span>
              </button>
            )}
          </>
        }
      />

      <BottomSheet state={sheet} onState={setSheet} tabs={TABS} tab={tab} onTab={openTab} summary={summary} onChecks={() => openTab('checks')}>
        <div className="panel-body">
          {tab === 'design' && (
            <DesignPanel
              targets={designTargets}
              path={selectedInfo?.path ?? []}
              editable={editable}
              fonts={fonts}
              inspectNode={inspect?.state === 'ok' ? inspect.value.node : undefined}
              rev={d.rev}
              onCommit={commitOps}
              align={designTargets.length > 1 ? { enabled: editable ? actionState(sceneRef.current?.() ?? [], selection) : NO_ACTIONS, run: (a) => runAction(a) } : undefined}
            />
          )}
          {tab === 'checks' && <ChecksPanel checks={checks} index={index} selectedId={selectedId} onSelect={select} onRun={runChecks} hasBoards={d.pages.some((p) => p.children.length > 0)} />}
          {tab === 'activity' && <ActivityPanel views={views} connected={activity.connected} offline={offline} follow={follow} onFollow={setFollow} nameOf={nameOf} onLocate={locate} />}
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
      </BottomSheet>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => onImageFile(e.currentTarget.files?.[0])} />
      {iconAsk && (
        <IconPicker
          onClose={() => setIconAsk(undefined)}
          onPick={(icon) => {
            const t = iconAsk;
            setIconAsk(undefined);
            insert(t, { icon });
          }}
        />
      )}
      {toast && <Toast toast={toast} onClose={closeToast} />}
      {editMenu && (
        <EditMenu
          x={editMenu.x}
          y={editMenu.y}
          enabled={editable ? actionState(sceneRef.current?.() ?? [], editMenu.ids) : NO_ACTIONS}
          onAction={(a) => runAction(a, editMenu.ids)}
          onClose={() => setEditMenu(undefined)}
        />
      )}
      {fileMenu && (
        <FileMenu
          target={{ slug, x: fileMenu.x, y: fileMenu.y }}
          archived={false}
          port={Number(location.port) || undefined}
          onClose={() => setFileMenu(undefined)}
          onError={setToast}
        />
      )}
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
  selectedIds,
  selectedPath,
  index,
  onSelect,
  onToggle,
  onMenu,
  marks,
}: {
  /** Klik kanan baris: menu aksi edit (story 6) di (x, y). */
  onMenu?: (id: string, x: number, y: number) => void;
  nodes: TreeNode[];
  selectedId: string | undefined;
  /** Semua node terpilih (seleksi banyak dari canvas); tanpa ini hanya `selectedId`. */
  selectedIds?: readonly string[];
  /** Shift-klik baris: tambah/kurangi seleksi. */
  onToggle?: (id: string) => void;
  selectedPath: NodeInfo | undefined;
  index: Map<string, NodeInfo>;
  onSelect: (id: string) => void;
  /** State agen per baris (aplikasi 5): agent (working), created (slide-in), changed (titik memudar). */
  marks?: ReadonlyMap<string, LayerMarkInfo> | undefined;
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
    const selected = selectedIds ? selectedIds.includes(n.id) : n.id === selectedId;
    const m = marks?.get(n.id);
    const mark = m?.mark;
    const markClass = m ? ` ${m.mark}${m.color === 'codex' ? ' codex' : ''}` : '';
    rows.push(
      <div
        key={n.id}
        data-layer={n.id}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={kids.length ? isOpen : undefined}
        tabIndex={0}
        className={`layer-row${selected ? ' selected' : ''}${depth === 0 ? ' top' : ''}${markClass}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={(e) => (e.shiftKey && onToggle ? onToggle(n.id) : onSelect(n.id))}
        onContextMenu={(e) => {
          if (!onMenu) return;
          e.preventDefault();
          onMenu(n.id, e.clientX, e.clientY);
        }}
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
        <Icon name={isImageNode(n) ? 'image' : (NODE_ICON[n.type] ?? 'square')} size={13} className="type-icon" />
        <span className="layer-label">{n.name}</span>
        {/* Kunci per execute: execute berikutnya pada node yang sama memutar ulang pudar titik. */}
        {(mark === 'agent' || mark === 'changed') && <i key={m?.key ?? mark} className="layer-agent-dot" aria-hidden="true" />}
      </div>,
    );
    if (isOpen) for (const c of kids) walk(c, depth + 1);
  };
  for (const n of nodes) walk(n, 0);
  return <div role="tree">{rows}</div>;
}
