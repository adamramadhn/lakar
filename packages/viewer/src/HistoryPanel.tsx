// Tab History (desain bagian 03, frame "Viewer — Desktop — History"): timeline revisi per hari (Today, Yesterday,
// tanggal) dari GET /viewer/docs/:slug/history. Klik entri → pratinjau versi itu di kanvas; Compare membuka
// thumbnail Before/After board yang berubah; Restore memulihkan versi (konfirmasi di Viewer). Entri tanpa
// snapshot: Compare/Restore nonaktif ("No snapshot for this version").
// Seperti desain, tombol Compare/Restore hanya tampil pada entri terkini (Compare) dan entri yang sedang
// dipratinjau (latar biru); entri lain cukup judul + meta (klik untuk pratinjau). Jam 24 jam ("14:32").
import { useEffect, useRef, useState } from 'react';
import type { LakarDocument } from '@lakar/schema';
import { harnessColor, harnessLabel, whoOf } from './activity';
import { api, errorText, type HistoryEntry } from './api';
import { canRestore, changedBoards, comparePair, groupByDay, hasVersion, NO_SNAPSHOT, type BoardChange } from './history';
import { useRetry } from './hooks';
import { Icon } from './icons';

type Loaded = { state: 'loading' } | { state: 'ok'; entries: HistoryEntry[] } | { state: 'error'; message: string };

export const timeOf = (at: string) => {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
};

/** Jumlah pasangan Before/After yang ditampilkan per Compare. */
const COMPARE_MAX = 3;

export function HistoryPanel({
  slug,
  rev,
  previewRev,
  onPreview,
  onRestore,
}: {
  slug: string;
  /** Rev dokumen terkini. */
  rev: number;
  /** Rev yang sedang dipratinjau di kanvas. */
  previewRev?: number | undefined;
  /** Pratinjau entri (versi lama) atau kembali ke terkini (`undefined`). */
  onPreview: (entry: HistoryEntry | undefined) => void;
  onRestore: (entry: HistoryEntry) => void;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [comparing, setComparing] = useState<number | undefined>(undefined);
  // Versi bernama (spec-viewer-named-versions): rev yang sedang diedit labelnya (undefined = tidak ada), dan
  // label baru yang menunggu penyimpanan (anti dobel-klik).
  const [naming, setNaming] = useState<number | undefined>(undefined);
  const [namingBusy, setNamingBusy] = useState(false);
  const [namingError, setNamingError] = useState<string | undefined>(undefined);
  useRetry(() => setAttempt((a) => a + 1));
  useEffect(() => {
    let live = true;
    api.getHistory(slug).then(
      (entries) => live && setLoaded({ state: 'ok', entries }),
      (e) => live && setLoaded((prev) => (prev.state === 'ok' ? prev : { state: 'error', message: errorText(e) })),
    );
    return () => {
      live = false;
    };
  }, [slug, rev, attempt]);

  if (loaded.state === 'loading')
    return (
      <div className="panel-loading">
        <div className="spinner small" /> Loading history…
      </div>
    );
  if (loaded.state === 'error')
    return (
      <div className="panel-empty">
        <Icon name="alert" size={20} />
        <strong>Couldn't load history</strong>
        <span>{loaded.message}</span>
        <button type="button" className="btn small" onClick={() => setAttempt((a) => a + 1)}>
          <Icon name="refresh" size={13} /> Try again
        </button>
      </div>
    );
  if (loaded.entries.length === 0)
    return (
      <div className="panel-empty">
        <Icon name="clock" size={20} />
        <strong>No history yet</strong>
        <span>Each execute that changes the document adds a revision here.</span>
      </div>
    );

  const saveName = async (e: HistoryEntry, name: string) => {
    const trimmed = name.trim();
    if (namingBusy || !trimmed) return;
    setNamingBusy(true);
    setNamingError(undefined);
    try {
      if (trimmed === e.label) {
        // tidak berubah
      } else {
        await api.nameVersion(slug, trimmed, e.rev);
      }
      setNaming(undefined);
      setAttempt((a) => a + 1);
    } catch (err) {
      setNamingError(errorText(err));
    } finally {
      setNamingBusy(false);
    }
  };
  const removeName = async (e: HistoryEntry) => {
    if (namingBusy) return;
    setNamingBusy(true);
    setNamingError(undefined);
    try {
      await api.unnameVersion(slug, e.rev);
      setNaming(undefined);
      setAttempt((a) => a + 1);
    } catch (err) {
      setNamingError(errorText(err));
    } finally {
      setNamingBusy(false);
    }
  };

  const entries = loaded.entries;
  const top = entries[0]!.rev;
  const latest = Math.max(rev, top);
  return (
    <div className="history">
      {groupByDay(entries).map((g, i) => (
        <div key={`${i}:${g.label}`} className="history-group">
          <div className="history-day">{g.label.toUpperCase()}</div>
          {g.entries.map((e) => {
            const current = e.rev === top;
            const previewing = previewRev === e.rev;
            // Warna harness, bukan warna sesi (assignAgentColors): entri riwayat umumnya dari sesi yang sudah
            // berakhir, jadi warna per sesi Live tidak berlaku (spec-agent-identity-history).
            const author = whoOf(e);
            const color = harnessColor(author);
            const who = author ? harnessLabel(author) : `Session ${e.session}`;
            const readable = hasVersion(e, latest);
            const restorable = canRestore(e, latest);
            const open = comparing === e.rev;
            const select = () => {
              if (current || previewing) onPreview(undefined);
              else if (readable) onPreview(e);
            };
            return (
              <div key={e.rev} className={`history-entry${current ? ' current' : ''}${previewing ? ' previewing' : ''}`}>
                <div className="history-rail">
                  <i className={`history-node${current ? ` ${color}` : ''}`} />
                  <span className="history-line" />
                </div>
                <div className="history-body">
                  <div
                    className={`history-select${readable && !current ? ' clickable' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={previewing}
                    aria-disabled={!readable && !current}
                    title={current ? 'Latest version' : readable ? (previewing ? 'Back to live' : 'Preview this version') : NO_SNAPSHOT}
                    onClick={select}
                    onKeyDown={(k) => {
                      if (k.key === 'Enter' || k.key === ' ') {
                        k.preventDefault();
                        select();
                      }
                    }}
                  >
                    <div className="history-head">
                      <span className={`history-agent ${color}`}>{(author ? harnessLabel(author) : 'A').charAt(0).toUpperCase()}</span>
                      <span className="history-who">{who}</span>
                      <span className="history-dot">·</span>
                      <span className="history-time" title={e.at}>
                        {timeOf(e.at)}
                      </span>
                      {current && <span className={`history-current ${color}`}>Current</span>}
                      {previewing && <span className="history-previewing">Previewing</span>}
                      {e.label !== undefined && (
                        <span className="history-version" title={`Named version — rev ${e.rev}`}>
                          <Icon name="tag" size={11} />
                          {e.label}
                          <button
                            type="button"
                            className="history-version-remove"
                            aria-label={`Remove version name ${e.label}`}
                            title="Remove version name"
                            disabled={namingBusy}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void removeName(e);
                            }}
                          >
                            ×
                          </button>
                        </span>
                      )}
                    </div>
                    <div className="history-title">{e.description}</div>
                    <div className="history-meta">
                      rev {e.rev} · {e.opCount} op{e.opCount === 1 ? '' : 's'}
                      {e.opsSummary ? ` · ${e.opsSummary}` : ''}
                    </div>
                  </div>
                  {open && readable && <ComparePanel slug={slug} pair={comparePair(entries, e, latest)} />}
                  {(current || previewing || open) && (
                  <div className="history-actions">
                    <button
                      type="button"
                      className={`btn small${open ? ' active' : ''}`}
                      disabled={!readable}
                      title={readable ? (open ? 'Hide comparison' : 'Compare with the previous version') : NO_SNAPSHOT}
                      aria-expanded={open}
                      onClick={() => setComparing(open ? undefined : e.rev)}
                    >
                      <Icon name="columns2" size={13} /> Compare
                    </button>
                    {!current && (
                      <button type="button" className="btn small" disabled={!restorable} title={restorable ? 'Restore this version as a new revision' : NO_SNAPSHOT} onClick={() => onRestore(e)}>
                        <Icon name="rotateCcw" size={13} /> Restore
                      </button>
                    )}
                    <button
                      type="button"
                      className={`btn small${naming === e.rev ? ' active' : ''}`}
                      title={e.label ? 'Rename this version' : 'Name this version'}
                      aria-expanded={naming === e.rev}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setNamingError(undefined);
                        setNaming(naming === e.rev ? undefined : e.rev);
                      }}
                    >
                      <Icon name="tag" size={13} /> {e.label ? 'Rename' : 'Name'}
                    </button>
                  </div>
                  )}
                  {naming === e.rev && (
                    <VersionNameInput busy={namingBusy} error={naming === e.rev ? namingError : undefined} initial={e.label ?? ''} onSave={(name) => void saveName(e, name)} onCancel={() => setNaming(undefined)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

type CompareState = { state: 'loading' } | { state: 'ok'; changes: BoardChange[] } | { state: 'error'; message: string };

/** Thumbnail Before/After untuk board yang berubah antara `pair.before` dan `pair.after`. */
function ComparePanel({ slug, pair }: { slug: string; pair: { before?: number; after: number } }) {
  const [st, setSt] = useState<CompareState>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    setSt({ state: 'loading' });
    const before: Promise<LakarDocument | undefined> = pair.before !== undefined ? api.getRevision(slug, pair.before) : Promise.resolve(undefined);
    Promise.all([before, api.getRevision(slug, pair.after)]).then(
      ([b, a]) => live && setSt({ state: 'ok', changes: changedBoards(b, a) }),
      (e) => live && setSt({ state: 'error', message: errorText(e) }),
    );
    return () => {
      live = false;
    };
  }, [slug, pair.before, pair.after]);

  if (st.state === 'loading')
    return (
      <div className="history-compare muted">
        <div className="spinner small" /> Comparing…
      </div>
    );
  if (st.state === 'error') return <div className="history-compare muted">{st.message}</div>;
  if (st.changes.length === 0) return <div className="history-compare muted">No board changed in this version.</div>;
  const shown = st.changes.slice(0, COMPARE_MAX);
  return (
    <div className="history-compare">
      {shown.map((c) => (
        <div key={c.id} className="compare-board">
          {st.changes.length > 1 && <div className="compare-name">{c.name}</div>}
          <div className="compare-pair">
            <figure>
              <Thumb slug={slug} rev={pair.before} boardId={c.id} empty={pair.before === undefined ? 'No earlier snapshot' : c.change === 'added' ? 'New board' : undefined} />
              <figcaption>Before</figcaption>
            </figure>
            <figure>
              <Thumb slug={slug} rev={pair.after} boardId={c.id} empty={c.change === 'removed' ? 'Removed' : undefined} />
              <figcaption>After</figcaption>
            </figure>
          </div>
        </div>
      ))}
      {st.changes.length > shown.length && <div className="compare-more">+{st.changes.length - shown.length} more boards changed</div>}
    </div>
  );
}

function Thumb({ slug, rev, boardId, empty }: { slug: string; rev: number | undefined; boardId: string; empty?: string | undefined }) {
  const [st, setSt] = useState<{ url?: string; error?: string }>({});
  useEffect(() => {
    if (empty !== undefined || rev === undefined) return;
    let live = true;
    setSt({});
    api.revScreenshot(slug, rev, boardId).then(
      (s) => live && setSt({ url: s.url }),
      (e) => live && setSt({ error: errorText(e) }),
    );
    return () => {
      live = false;
    };
  }, [slug, rev, boardId, empty]);
  if (empty !== undefined || rev === undefined) return <div className="compare-thumb empty">{empty ?? 'No snapshot'}</div>;
  if (st.url) return <img className="compare-thumb" src={st.url} alt="" draggable={false} />;
  if (st.error)
    return (
      <div className="compare-thumb empty" title={st.error}>
        <Icon name="alert" size={14} />
      </div>
    );
  return <div className="compare-thumb skeleton" />;
}

/** Input inline nama versi (spec-viewer-named-versions): Enter menyimpan, Escape membatalkan; autoFocus. */
function VersionNameInput({ busy, error, initial, onSave, onCancel }: { busy: boolean; error?: string | undefined; initial: string; onSave: (name: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="history-naming" onClick={(e) => e.stopPropagation()}>
      <input
        ref={ref}
        className="input"
        defaultValue={initial}
        placeholder="Version name (e.g. v1 — ready for review)"
        maxLength={100}
        disabled={busy}
        aria-label="Version name"
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(e.currentTarget.value);
          else if (e.key === 'Escape') onCancel();
        }}
      />
      <button type="button" className="btn small primary" disabled={busy} onClick={() => ref.current && onSave(ref.current.value)}>
        Save
      </button>
      {error && (
        <div className="export-note danger" role="alert">
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
