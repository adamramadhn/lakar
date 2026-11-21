// Viewer (desain bagian 03): Layers kiri dari JSON dokumen, canvas PNG per board, panel kanan
// Activity/Inspect/Checks/History. Seleksi dari layer, board, atau temuan check disorot di canvas. Stream
// aktivitas (`/viewer/events`) memuat ulang dokumen dan PNG board tersentuh saat rev berubah.
// History (aplikasi 3): klik entri → pratinjau versi lama (snapshot) di kanvas baca-saja dengan banner; Restore
// (dari banner atau entri) meminta konfirmasi lalu meng-commit versi itu sebagai rev baru.
// Layer manual (aplikasi 4): tool sisip di kanvas dan menu "+" di header Layers menjalankan `execute` dari sesi
// viewer dengan kode codegen.ts; Delete/Backspace menghapus node terpilih. Sesudahnya dokumen dimuat ulang
// (event sesi viewer tidak dipancarkan daemon) dan node baru dipilih. Gagal → toast, dokumen tidak berubah.
// Kehadiran agen (aplikasi 5): `agentPresence` (presence.ts) dari stream → kursor + outline di Canvas dan state
// baris Layers (agent / created / changed); disembunyikan saat pratinjau versi.
// Kelola halaman (aplikasi 8): section Pages (PagesPanel.tsx) menambah/rename/mengurutkan/menghapus halaman lewat
// route `/viewer/docs/:slug/pages…`. Halaman aktif dilacak per ID; board baru dari viewer masuk ke halaman aktif.
// Responsif (aplikasi 9): tablet (≤1100px) → panel kiri jadi laci di atas kanvas (tombol "Layers" + scrim); mobile
// (<768px) → top bar viewer (back, nama file + halaman yang membuka laci, History) dan panel kanan jadi bottom sheet
// (BottomSheet.tsx). Di desktop elemen tambahan disembunyikan CSS; hanya state tata letak yang ditambah di sini.
// Sinkron antar jendela: stream dibagi lewat `activityHub`; layer manual dari jendela lain (`change` `edit`) memuat
// ulang dokumen, dan dokumen yang diarsip/dihapus di jendela lain menampilkan pesan dengan jalan kembali ke
// Dashboard/Archive (`requestCloseTab`), bukan 404 mentah. Rename di jendela lain ditangani App (tab ikut pindah).
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LakarDocument } from '@lakar/schema';
import { activityHub, editChange, goneReason, revChange, sessionsForSlug, slugAppeared, type StreamEvent } from './activity';
import { ActivityPanel } from './ActivityPanel';
import { BottomSheet } from './BottomSheet';
import { AddLayerButton, IconPicker, Toast, type ToastState } from './AddLayer';
import { api, ApiError, errorText, OfflineError, type HistoryEntry, type InspectResult, type LayoutCheck } from './api';
import { Canvas, type CanvasPreview, type Focus, type Highlight, type InsertPoint } from './Canvas';
import { failureText, imageFileProblem, insertBoardAt, insertBoardPlaced, insertIntoBoard, canvasInsertTarget, menuInsertTarget, removeNode, type InsertExtra, type InsertKind, type InsertTarget } from './codegen';
import { resolvePageIndex } from './pages';
import { PagesPanel } from './PagesPanel';
import { indexDocument, relativeTime, type NodeInfo, type TreeNode } from './format';
import { HistoryPanel, timeOf } from './HistoryPanel';
import { canRestore, previewLabel } from './history';
import { useNow, useOffline, useRetry } from './hooks';
import { Icon, NODE_ICON } from './icons';
import { Modal } from './NewFileDialog';
import { ChecksPanel, InspectPanel } from './panels';
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
  { id: 'inspect', label: 'Inspect' },
  { id: 'checks', label: 'Checks' },
  { id: 'history', label: 'History' },
];


/** Fokus di kolom ketik (input, textarea, select, contentEditable): Delete/Backspace milik kolom itu. */
const typingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable);

/** Pesan Restore gagal; CONFLICT = versi usang (ada perubahan lebih baru) atau versi terkini. */
const restoreErrorText = (e: unknown) =>
  e instanceof ApiError && e.code === 'CONFLICT' ? `Newer changes arrived since you opened this version. Check History and try again. (${e.message})` : errorText(e);

type Loaded<T> = { state: 'loading' } | { state: 'ok'; value: T } | { state: 'error'; message: string; notFound?: boolean; corrupt?: boolean };

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
  const [selectedId, setSelectedId] = useState<string | undefined>(saved?.selectedId);
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

  /** Toast "Deleted <name>" + Undo (Restore rev sebelum hapus, baseRev = rev hapus) bila rev itu bersnapshot. */
  const offerUndo = useCallback(
    (name: string, rev: number) => {
      const message = `Deleted ${name}`;
      setToastState({ message, kind: 'info' });
      const prev = rev - 1;
      api.getHistory(slug).then(
        (entries) => {
          if (!entries.find((h) => h.rev === prev)?.snapshot) return;
          const undo = () => {
            setToastState(undefined);
            api.restore(slug, prev, rev).then(
              () => loadDoc(),
              (e) => setToast(restoreErrorText(e)),
            );
          };
          // Hanya bila toast ini masih tampil (belum diganti/ditutup).
          setToastState((t) => (t?.message === message && t.kind === 'info' ? { ...t, action: { label: 'Undo', run: undo } } : t));
        },
        () => {},
      );
    },
    [slug, loadDoc, setToast],
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

  // Delete/Backspace: hapus node terpilih (board juga), kecuali saat mengetik atau dialog/menu terbuka.
  const selectedRef = useRef<{ id: string; name: string; type: string } | undefined>(undefined);
  const selInfo = selectedId ? index.get(selectedId) : undefined;
  selectedRef.current = selInfo && !previewDoc ? { id: selInfo.id, name: selInfo.name, type: selInfo.type } : undefined;
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (typingTarget(e.target) || document.querySelector('.modal-scrim, .menu-layer')) return;
      const node = selectedRef.current;
      if (!node) return;
      e.preventDefault();
      if (e.repeat || editing.current > 0) return;
      const { code, description } = removeNode(node);
      void runEdit(code, description, (_created, rev) => {
        setSelectedId((s) => (s === node.id ? undefined : s));
        offerUndo(node.name, rev);
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editable, runEdit, offerUndo]);

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
          <div className="file-title">{slug}</div>
          <div className="file-meta">
            {previewDoc ? `Previewing rev ${d.rev} · latest ${latestDoc.rev}` : `Rev ${d.rev} · loaded ${relativeTime(loadedAt)}`}
          </div>
        </div>
        <div className="panel-tabs">
          <span className="panel-tab active">Layers</span>
        </div>
        <PagesPanel
          pages={d.pages.map((p) => ({ id: p.id, name: p.name, boardCount: p.children.length }))}
          activeId={page?.id}
          editable={editable}
          disabledReason={preview ? 'Not available while previewing a version' : 'lakard is offline'}
          onSelect={setPageId}
          onAdd={addPage}
          onRename={renamePage}
          onMove={movePage}
          onDelete={deletePage}
        />
        <div className="layer-tree">
          <div className="section-header">
            <span className="section-label">Layers</span>
            <AddLayerButton disabled={!editable} disabledReason={preview ? 'Not available while previewing a version' : 'lakard is offline'} hasBoard={boards.length > 0} onPick={onMenuInsert} />
          </div>
          {boards.length === 0 ? <div className="muted-note">No boards on this page yet.</div> : <LayerTree key={page?.id} nodes={boards} selectedId={selectedId} selectedPath={selectedInfo} index={index} onSelect={select} marks={preview ? undefined : marks} />}
        </div>
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
        onOpenChecks={() => openTab('checks')}
        preview={canvasPreview}
        editable={editable}
        onInsert={onCanvasInsert}
      />

      <BottomSheet state={sheet} onState={setSheet} tabs={TABS} tab={tab} onTab={openTab} summary={summary} onChecks={() => openTab('checks')}>
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
  marks,
}: {
  nodes: TreeNode[];
  selectedId: string | undefined;
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
    const selected = n.id === selectedId;
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
        {/* Kunci per execute: execute berikutnya pada node yang sama memutar ulang pudar titik. */}
        {(mark === 'agent' || mark === 'changed') && <i key={m?.key ?? mark} className="layer-agent-dot" aria-hidden="true" />}
      </div>,
    );
    if (isOpen) for (const c of kids) walk(c, depth + 1);
  };
  for (const n of nodes) walk(n, 0);
  return <div role="tree">{rows}</div>;
}
