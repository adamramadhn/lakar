// Tab Activity (desain bagian 03, frame "Viewer — Desktop — Activity"): sesi per harness (Live/Idle) dengan
// daftar Tool Call Row (running, done, warning, error), dan bar "Follow agent" di bawah.
// Paritas desain: execute gagal → meta "failed · rolled back" + blok pesan error mono di bawah baris (frame
// "Viewer — Desktop — Error"); lakard offline → badge "Disconnected" dan call yang masih berjalan ditandai
// "interrupted · no response" (frame "… — Offline").
import { useMemo, useRef, useState } from 'react';
import { callMeta, callTitle, harnessLabel, shortAgo, whoOf, type ActivityCall, type SessionView } from './activity';
import { liveSessionColors, sessionColor, type AgentColor } from './agentEffects';
import { relativeTime } from './format';
import { useNow } from './hooks';
import { Icon, type IconName } from './icons';
import { commitRow, selectionRead } from './liveChanges';

const STATUS_ICON: Record<ActivityCall['status'], IconName> = { running: 'loaderCircle', done: 'circleCheck', warning: 'alert', error: 'circleX' };
/** Baris yang ditampilkan per sesi. */
const CALLS_SHOWN = 50;

export function ToolCallRow({
  call,
  now,
  nameOf,
  offline = false,
  fresh = false,
}: {
  call: ActivityCall;
  now: number;
  nameOf: (id: string) => string | undefined;
  offline?: boolean;
  /** Baris baru sejak panel terbuka: masuk dengan `terminal-chunk-in` (spec-canvas-agent-effects). */
  fresh?: boolean;
}) {
  const at = call.status === 'running' ? Date.parse(call.startedAt) : Date.parse(call.startedAt) + (call.durationMs ?? 0);
  // Offline: call yang masih berjalan tidak akan mendapat jawaban dari stream → ditampilkan terputus.
  const interrupted = offline && call.status === 'running';
  const rolledBack = call.status === 'error' && call.tool === 'execute';
  // Desain Error: execute yang di-rollback memakai ikon segitiga kuning, meta merah.
  const status = interrupted || rolledBack ? 'warning' : call.status;
  const meta = interrupted ? 'interrupted · no response' : rolledBack ? 'failed · rolled back' : callMeta(call, now);
  return (
    <>
      <div className={`tool-call ${status}${call.summary?.error || interrupted || rolledBack ? ' has-error' : ''}${fresh ? ' chunk-in' : ''}`} title={call.error ? `${call.error.code}: ${call.error.message}` : undefined}>
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

/**
 * Agent Commit Row (desain b53rG, bagian 06): call terbaru sesi berupa execute sukses ber-rev. Locate memilih node
 * utama (atau board) call itu di canvas. Slide-in 180ms dari atas daftar.
 */
function AgentCommitRow({ call, color, meta, locate, now, nameOf, onLocate }: { call: ActivityCall; color: AgentColor; meta: string; locate: string | undefined; now: number; nameOf: (id: string) => string | undefined; onLocate?: ((id: string) => void) | undefined }) {
  const at = Date.parse(call.startedAt) + (call.durationMs ?? 0);
  return (
    <div className={`agent-commit ${color}`} title={shortAgo(at, now)}>
      <span className="agent-commit-status">
        <Icon name="gitCommit" size={14} />
      </span>
      <span className="tool-call-body">
        <span className="tool-call-title">{callTitle(call, nameOf)}</span>
        <span className="tool-call-meta">
          <span className="agent-commit-tool">{call.tool}</span>
          <span className="tool-call-detail">{meta}</span>
        </span>
      </span>
      {locate && onLocate && (
        <button type="button" className="agent-commit-locate" aria-label="Locate on canvas" title="Locate on canvas" onClick={() => onLocate(locate)}>
          <Icon name="crosshair" size={13} />
        </button>
      )}
    </div>
  );
}

function SessionCard({
  view,
  color,
  now,
  nameOf,
  offline,
  onLocate,
  isOld,
}: {
  view: SessionView;
  /** Warna sesi (sama dengan kursor canvas dan Layers; spec-agent-identity-history). */
  color: AgentColor;
  now: number;
  nameOf: (id: string) => string | undefined;
  offline: boolean;
  onLocate?: ((id: string) => void) | undefined;
  /** Call yang sudah ada saat panel dibuka (tanpa animasi masuk). */
  isOld: (callId: string) => boolean;
}) {
  const [open, setOpen] = useState<boolean | undefined>(undefined);
  const { session, calls, live, lastCallAt } = view;
  const expanded = open ?? live;
  const callCount = calls.length;
  const commit = commitRow(calls[0]);
  // Baris konteks (desain RIpNN "Context"): agen membaca seleksi pengguna lewat get_selection.
  const read = selectionRead(view);
  // Alamat komposit AD-12 (`instance/node`): nama dari segmen terakhir bila alamat utuhnya tidak dikenal.
  const readName = read?.target ? (nameOf(read.target) ?? nameOf(read.target.split('/').pop()!)) : undefined;
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
            <span className="session-title">{harnessLabel(whoOf(session))}</span>
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
      {expanded && read && (
        <div className="session-context">
          <Icon name="eye" size={13} />
          <span className="session-context-text">
            {harnessLabel(whoOf(session))} read your selection {relativeTime(Date.parse(read.startedAt) + (read.durationMs ?? 0), now)}
            {readName ? ':' : ''}
          </span>
          {readName && <strong>{readName}</strong>}
          {readName && read.nodes !== undefined && read.nodes > 1 && <span className="session-context-text">+{read.nodes - 1}</span>}
        </div>
      )}
      {expanded && (
        <div className="session-calls">
          {calls.length === 0 ? (
            <div className="muted-note">No tool calls on this document yet.</div>
          ) : (
            calls
              .slice(0, CALLS_SHOWN)
              .map((c, i) =>
                i === 0 && commit ? (
                  <AgentCommitRow key={`commit:${c.callId}`} call={c} color={color} meta={commit.meta} locate={commit.locate} now={now} nameOf={nameOf} onLocate={onLocate} />
                ) : (
                  <ToolCallRow key={c.callId} call={c} now={now} nameOf={nameOf} offline={offline} fresh={!isOld(c.callId)} />
                ),
              )
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
  onLocate,
}: {
  /** Locate di Agent Commit Row: pilih node/board di canvas. */
  onLocate?: (id: string) => void;
  views: SessionView[];
  connected: boolean;
  /** lakard tidak terjangkau (desain "Viewer — … — Offline"). */
  offline?: boolean;
  follow: boolean;
  onFollow: (v: boolean) => void;
  nameOf: (id: string) => string | undefined;
}) {
  const now = useNow(views.some((v) => v.running) ? 1000 : 10_000);
  // Call yang sudah ada saat panel dibuka atau tiba lewat snapshot (belum/baru tersambung) tidak dianimasikan; hanya
  // baris yang tiba sesudahnya (termasuk baris pertama kartu sesi baru) masuk dengan `chunk-in`. Snapshot dikenali dari
  // render pertama yang tersambung (saat mount atau sesudah putus): `hello` dan `connected` tiba di render yang sama.
  // Bukan dari daftar yang kosong, supaya call pertama di panel yang dibuka kosong tetap dianimasikan.
  const old = useRef(new Set<string>());
  const wasConnected = useRef(false);
  if (!connected || !wasConnected.current) for (const v of views) for (const c of v.calls) old.current.add(c.callId);
  wasConnected.current = connected;
  const isOld = (id: string) => old.current.has(id);
  // Warna per sesi Live, sama dengan presence canvas (`views` yang sama dari Viewer).
  const colors = useMemo(() => liveSessionColors(views), [views]);
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
              <SessionCard key={v.session.id} view={v} color={sessionColor(colors, v.session)} now={now} nameOf={nameOf} offline={offline} onLocate={onLocate} isOld={isOld} />
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
