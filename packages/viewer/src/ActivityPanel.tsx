// Tab Activity (desain bagian 03, frame "Viewer — Desktop — Activity"): sesi per harness (Live/Idle) dengan
// daftar Tool Call Row (running, done, warning, error), dan bar "Follow agent" di bawah.
// Paritas desain: execute gagal → meta "failed · rolled back" + blok pesan error mono di bawah baris (frame
// "Viewer — Desktop — Error"); lakard offline → badge "Disconnected" dan call yang masih berjalan ditandai
// "interrupted · no response" (frame "… — Offline").
import { useState } from 'react';
import { callMeta, callTitle, harnessColor, harnessLabel, shortAgo, type ActivityCall, type SessionView } from './activity';
import { relativeTime } from './format';
import { useNow } from './hooks';
import { Icon, type IconName } from './icons';

const STATUS_ICON: Record<ActivityCall['status'], IconName> = { running: 'loaderCircle', done: 'circleCheck', warning: 'alert', error: 'circleX' };
/** Baris yang ditampilkan per sesi. */
const CALLS_SHOWN = 50;

export function ToolCallRow({ call, now, nameOf, offline = false }: { call: ActivityCall; now: number; nameOf: (id: string) => string | undefined; offline?: boolean }) {
  const at = call.status === 'running' ? Date.parse(call.startedAt) : Date.parse(call.startedAt) + (call.durationMs ?? 0);
  // Offline: call yang masih berjalan tidak akan mendapat jawaban dari stream → ditampilkan terputus.
  const interrupted = offline && call.status === 'running';
  const rolledBack = call.status === 'error' && call.tool === 'execute';
  // Desain Error: execute yang di-rollback memakai ikon segitiga kuning, meta merah.
  const status = interrupted || rolledBack ? 'warning' : call.status;
  const meta = interrupted ? 'interrupted · no response' : rolledBack ? 'failed · rolled back' : callMeta(call, now);
  return (
    <>
      <div className={`tool-call ${status}${call.summary?.error || interrupted || rolledBack ? ' has-error' : ''}`} title={call.error ? `${call.error.code}: ${call.error.message}` : undefined}>
        <span className="tool-call-status">
          <Icon name={STATUS_ICON[status]} size={14} className={status === 'running' ? 'spin' : undefined} />
        </span>
      <span className="tool-call-body">
        <span className="tool-call-title">{callTitle(call, nameOf)}</span>
        <span className="tool-call-meta">
          <span className="tool-call-tool">{call.tool}</span>
          {meta && <span className="tool-call-detail">{meta}</span>}
        </span>
      </span>
      <span className="tool-call-time">{shortAgo(at, now)}</span>
      </div>
      {call.status === 'error' && call.error && (
        <div className="tool-call-error">
          {/* Baris pertama saja: sisa pesan daemon berisi kutipan snippet. */}
          {call.tool} error: {call.error.message.split('\n')[0]}
          {rolledBack ? ' No changes were applied.' : ''}
        </div>
      )}
    </>
  );
}

function SessionCard({ view, now, nameOf, offline }: { view: SessionView; now: number; nameOf: (id: string) => string | undefined; offline: boolean }) {
  const [open, setOpen] = useState<boolean | undefined>(undefined);
  const { session, calls, live, lastCallAt } = view;
  const expanded = open ?? live;
  const color = harnessColor(session.client);
  const callCount = calls.length;
  const subtitle = live
    ? `Started ${relativeTime(session.createdAt, now)} · ${callCount} call${callCount === 1 ? '' : 's'}`
    : lastCallAt !== undefined
      ? `Idle · last call ${relativeTime(lastCallAt, now)}`
      : `Idle · session ${session.id}`;
  return (
    <section className={`session-card${expanded ? ' open' : ''}`}>
      <button type="button" className="session-header" aria-expanded={expanded} onClick={() => setOpen(!expanded)}>
        <span className={`harness-icon ${live ? color : 'idle'}`}>
          <Icon name="squareTerminal" size={15} />
        </span>
        <span className="session-info">
          <span className="session-title-row">
            <span className="session-title">{harnessLabel(session.client)}</span>
            {live && (
              <span className={`live-badge ${offline ? 'disconnected' : color}`}>
                <i />
                {offline ? 'Disconnected' : 'Live'}
              </span>
            )}
          </span>
          <span className="session-subtitle">{subtitle}</span>
        </span>
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} className="session-chevron" />
      </button>
      {expanded && (
        <div className="session-calls">
          {calls.length === 0 ? (
            <div className="muted-note">No tool calls on this document yet.</div>
          ) : (
            calls.slice(0, CALLS_SHOWN).map((c) => <ToolCallRow key={c.callId} call={c} now={now} nameOf={nameOf} offline={offline} />)
          )}
          {/* Desain Waiting: sesi Live yang belum menjalankan execute pada file ini. */}
          {live && !offline && !calls.some((c) => c.tool === 'execute') && (
            <div className="tool-call-waiting">
              <Icon name="hourglass" size={14} />
              Waiting for the first execute…
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function ActivityPanel({
  views,
  connected,
  offline = false,
  follow,
  onFollow,
  nameOf,
}: {
  views: SessionView[];
  connected: boolean;
  /** lakard tidak terjangkau (desain "Viewer — … — Offline"). */
  offline?: boolean;
  follow: boolean;
  onFollow: (v: boolean) => void;
  nameOf: (id: string) => string | undefined;
}) {
  const now = useNow(views.some((v) => v.running) ? 1000 : 10_000);
  return (
    <div className="activity">
      <div className="activity-scroll">
        {!connected && !offline && (
          <div className="activity-reconnect">
            <div className="spinner small" /> Connecting to live activity…
          </div>
        )}
        {views.length === 0 ? (
          <div className="panel-empty">
            <Icon name="activity" size={20} />
            <strong>No agent activity yet</strong>
            <span>Tool calls from Claude Code, Codex, or another MCP client show up here as they run.</span>
          </div>
        ) : (
          <>
            <div className="section-label activity-label">LIVE SESSIONS</div>
            {views.map((v) => (
              <SessionCard key={v.session.id} view={v} now={now} nameOf={nameOf} offline={offline} />
            ))}
          </>
        )}
      </div>
      <div className="follow-bar">
        <Icon name="crosshair" size={15} />
        <span className="follow-info">
          <span className="follow-title">Follow agent</span>
          <span className="follow-subtitle">Pan to changes as they land</span>
        </span>
        <button type="button" role="switch" aria-checked={follow} aria-label="Follow agent" className={`switch${follow ? ' on' : ''}`} onClick={() => onFollow(!follow)}>
          <i />
        </button>
      </div>
    </div>
  );
}
