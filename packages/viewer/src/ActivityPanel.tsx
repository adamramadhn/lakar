// Tab Activity (desain bagian 03, frame "Viewer — Desktop — Activity"): sesi per harness (Live/Idle) dengan
// daftar Tool Call Row (running, done, warning, error), dan bar "Follow agent" di bawah.
import { useState } from 'react';
import { callMeta, callTitle, harnessColor, harnessLabel, shortAgo, type ActivityCall, type SessionView } from './activity';
import { relativeTime } from './format';
import { useNow } from './hooks';
import { Icon, type IconName } from './icons';

const STATUS_ICON: Record<ActivityCall['status'], IconName> = { running: 'loaderCircle', done: 'circleCheck', warning: 'alert', error: 'circleX' };
/** Baris yang ditampilkan per sesi. */
const CALLS_SHOWN = 50;

export function ToolCallRow({ call, now, nameOf }: { call: ActivityCall; now: number; nameOf: (id: string) => string | undefined }) {
  const at = call.status === 'running' ? Date.parse(call.startedAt) : Date.parse(call.startedAt) + (call.durationMs ?? 0);
  const meta = callMeta(call, now);
  return (
    <div className={`tool-call ${call.status}${call.summary?.error ? ' has-error' : ''}`} title={call.error ? `${call.error.code}: ${call.error.message}` : undefined}>
      <span className="tool-call-status">
        <Icon name={STATUS_ICON[call.status]} size={14} className={call.status === 'running' ? 'spin' : undefined} />
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
  );
}

function SessionCard({ view, now, nameOf }: { view: SessionView; now: number; nameOf: (id: string) => string | undefined }) {
  const [open, setOpen] = useState<boolean | undefined>(undefined);
  const { session, calls, live, lastCallAt } = view;
  const expanded = open ?? live;
  const color = harnessColor(session.client);
  const callCount = calls.length;
  const subtitle = live
    ? `${session.client ?? 'agent'} · started ${relativeTime(session.createdAt, now)} · ${callCount} call${callCount === 1 ? '' : 's'}`
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
              <span className={`live-badge ${color}`}>
                <i />
                Live
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
            calls.slice(0, CALLS_SHOWN).map((c) => <ToolCallRow key={c.callId} call={c} now={now} nameOf={nameOf} />)
          )}
        </div>
      )}
    </section>
  );
}

export function ActivityPanel({
  views,
  connected,
  follow,
  onFollow,
  nameOf,
}: {
  views: SessionView[];
  connected: boolean;
  follow: boolean;
  onFollow: (v: boolean) => void;
  nameOf: (id: string) => string | undefined;
}) {
  const now = useNow(views.some((v) => v.running) ? 1000 : 10_000);
  return (
    <div className="activity">
      <div className="activity-scroll">
        {!connected && (
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
              <SessionCard key={v.session.id} view={v} now={now} nameOf={nameOf} />
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
