// Tab History (desain bagian 03, frame "Viewer — Desktop — History"): timeline revisi per hari (Today, Yesterday,
// tanggal) dari GET /viewer/docs/:slug/history. Baca-saja: tanpa Restore, Compare, atau pratinjau sebelum/sesudah.
import { useEffect, useState } from 'react';
import { harnessColor, harnessLabel } from './activity';
import { api, errorText, type HistoryEntry } from './api';
import { groupByDay } from './history';
import { useRetry } from './hooks';
import { Icon } from './icons';

type Loaded = { state: 'loading' } | { state: 'ok'; entries: HistoryEntry[] } | { state: 'error'; message: string };

const timeOf = (at: string) => {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

export function HistoryPanel({ slug, rev }: { slug: string; rev: number }) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
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

  const top = loaded.entries[0]!.rev;
  return (
    <div className="history">
      {groupByDay(loaded.entries).map((g, i) => (
        <div key={`${i}:${g.label}`} className="history-group">
          <div className="history-day">{g.label.toUpperCase()}</div>
          {g.entries.map((e) => {
            const current = e.rev === top;
            const color = harnessColor(e.client);
            const who = e.client ? harnessLabel(e.client) : `Session ${e.session}`;
            return (
              <div key={e.rev} className={`history-entry${current ? ' current' : ''}`}>
                <div className="history-rail">
                  <i className={`history-node${current ? ` ${color}` : ''}`} />
                  <span className="history-line" />
                </div>
                <div className="history-body">
                  <div className="history-head">
                    <span className={`history-agent ${color}`}>{(e.client ? harnessLabel(e.client) : 'A').charAt(0).toUpperCase()}</span>
                    <span className="history-who">{who}</span>
                    <span className="history-dot">·</span>
                    <span className="history-time" title={e.at}>
                      {timeOf(e.at)}
                    </span>
                    {current && <span className={`history-current ${color}`}>Current</span>}
                  </div>
                  <div className="history-title">{e.description}</div>
                  <div className="history-meta">
                    rev {e.rev} · {e.opCount} op{e.opCount === 1 ? '' : 's'}
                    {e.opsSummary ? ` · ${e.opsSummary}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
