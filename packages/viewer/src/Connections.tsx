// Settings → Connections (desain `lakar-ui.pen` node e7hIme + section 11 "Install in an agent" story 8.11):
// kartu status lakard, "Connected agents" (sesi MCP dari stream aktivitas, Live/Idle), lalu "Install in an agent"
// — baris per harness (Not installed / Installed / Not found / Failed / Other) yang memasang entri MCP `lakar`
// lewat `/viewer/connections/harnesses*` dengan backup `.bak` (Undo di toast memulihkannya). Dialog Confirm
// menampilkan pratinjau entri; "Set up manually" membuka Setup Card lama (tab + blok kode + Copy).
// Data dari `GET /viewer/connections` (URL lakard sebenarnya), `GET /status` (pool render),
// `GET /viewer/connections/harnesses` (Rescan), dan `GET /viewer/events` (sesi).
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { activityHub, shortAgo } from './activity';
import { Toast, type ToastState } from './AddLayer';
import {
  api,
  errorText,
  type Connections as ConnectionsInfo,
  type DaemonStatus,
  type HarnessInfo,
  type HarnessResult,
  type HarnessState,
  type McpServerConfig,
} from './api';
import { Menu, type Item } from './FileMenu';
import { HARNESSES, nonDefaultPort } from './harnesses';
import { useNow, useRetry } from './hooks';
import { Icon } from './icons';
import { agentRows } from './live';
import { Modal } from './NewFileDialog';

/** Status lakard untuk kartu: `undefined` = belum ada jawaban, `null` = permintaan gagal. */
type StatusState = DaemonStatus | null | undefined;

/**
 * Salin teks: Clipboard API bila ada, selain itu textarea + `execCommand('copy')` (webview tanpa Clipboard API).
 * Gagal → melempar.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // jatuh ke cara lama di bawah
    }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('clipboard tidak tersedia');
}

export function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await copyText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard tidak tersedia: teks tetap terlihat dan bisa diseleksi manual
    }
  };
  return (
    <button type="button" className={`btn small ${className}`} onClick={copy}>
      <Icon name={copied ? 'circleCheck' : 'copy'} size={13} />
      {copied ? 'Copied' : label}
    </button>
  );
}

function DaemonCard({ info, status }: { info: ConnectionsInfo | undefined; status: StatusState }) {
  const pool = status?.pool;
  const renderError = pool && pool.ready < pool.size ? pool.lastError : undefined;
  return (
    <div className="conn-card">
      <div className="conn-daemon">
        <span className="conn-daemon-icon">
          <Icon name="server" size={16} />
        </span>
        <div className="conn-daemon-text">
          <div className="conn-daemon-title">
            <strong>lakard</strong>
            {status ? (
              <span className="status-pill ok">Running</span>
            ) : status === null ? (
              <span className="status-pill error">Unreachable</span>
            ) : (
              <span className="status-pill">Checking…</span>
            )}
          </div>
          <span className="conn-daemon-sub mono">
            {info?.url ?? location.origin} · local only{status ? ` · v${status.version}` : ''}
          </span>
        </div>
        {info && <CopyButton text={info.url} label="Copy URL" />}
      </div>
      {pool && (
        <div className={`conn-render${renderError ? ' error' : ''}`} role={renderError ? 'alert' : undefined}>
          <Icon name={renderError ? 'alert' : 'circleCheck'} size={14} />
          <span>
            {renderError
              ? renderError
              : pool.ready === pool.size
                ? `Renderer ready${pool.browserVersion ? ` · Chromium ${pool.browserVersion}` : ''}`
                : 'Renderer starting…'}
          </span>
        </div>
      )}
    </div>
  );
}

function lastCall(at: string | undefined, now: number): string {
  if (!at) return 'No calls yet';
  const ago = shortAgo(Date.parse(at), now);
  return ago === 'now' ? 'Last call just now' : `Last call ${ago} ago`;
}

/** "Connected agents" (desain "Agents Card"): sesi MCP yang dikenal lakard sejak mulai, Live dulu. */
function ConnectedAgents() {
  // Stream dibagi lewat `activityHub` (satu koneksi per jendela).
  const activity = useSyncExternalStore(activityHub.subscribeState, activityHub.getState);
  const now = useNow(10_000);
  const rows = useMemo(() => agentRows(activity, now), [activity, now]);
  return (
    <section className="conn-section">
      <h2>Connected agents</h2>
      <p>Harnesses currently talking to Lakar over MCP.</p>
      <div className="conn-card conn-agents">
        {rows.length === 0 ? (
          <div className="conn-agent empty">
            <span className="conn-agent-icon idle">
              <Icon name="plug" size={16} />
            </span>
            <span className="conn-agent-info">
              <span className="conn-agent-title">
                <strong>No agents yet</strong>
              </span>
              <span className="conn-agent-sub">{activity.connected ? 'Install Lakar in a harness below to connect one.' : 'Waiting for lakard…'}</span>
            </span>
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="conn-agent">
              <span className={`conn-agent-icon ${r.color}`}>
                <Icon name="squareTerminal" size={16} />
              </span>
              <span className="conn-agent-info">
                <span className="conn-agent-title">
                  <strong>{r.label}</strong>
                  <span className={`conn-agent-status${r.live ? ` live ${r.color}` : ''}`}>
                    <i />
                    {r.live ? 'Live' : 'Idle'}
                  </span>
                </span>
                <span className="conn-agent-sub">
                  {r.live
                    ? `Session ${r.id.slice(0, 4)} · ${r.executes} execute${r.executes === 1 ? '' : 's'}${r.activeSlug ? ` · open: ${r.activeSlug}` : ''}`
                    : `${lastCall(r.lastAt, now)} · ${r.executes} execute${r.executes === 1 ? '' : 's'}`}
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/** Kartu snippet config per harness (dipakai dialog Manual setup; isi sama dengan "Add an agent" lama). */
function SetupCard({ mcp, url }: { mcp: McpServerConfig | null; url: string }) {
  const [tab, setTab] = useState(HARNESSES[0]!.id);
  const harness = HARNESSES.find((h) => h.id === tab) ?? HARNESSES[0]!;
  const snippet = mcp ? harness.snippet(mcp) : '';
  const port = nonDefaultPort(url);
  return (
    <div className="conn-card conn-code-card">
      <div className="conn-tabs" role="tablist" aria-label="Harness">
        {HARNESSES.map((h) => (
          <button key={h.id} type="button" role="tab" aria-selected={h.id === tab} className={`conn-tab${h.id === tab ? ' active' : ''}`} onClick={() => setTab(h.id)}>
            {h.label}
          </button>
        ))}
      </div>
      {mcp ? (
        <>
          <div className="conn-code-head">
            <Icon name="file" size={14} />
            <span className="mono conn-code-file">{harness.file}</span>
            <CopyButton text={snippet} />
          </div>
          <pre className="conn-code" role="tabpanel">
            <code>{snippet}</code>
          </pre>
          {port !== null && (
            <p className="conn-note">
              <Icon name="info" size={13} />
              lakard is on port {port}, not the default 7466. This config points there; copy it again if the port changes.
            </p>
          )}
        </>
      ) : (
        <div className="conn-render error" role="alert">
          <Icon name="alert" size={14} />
          <span>MCP server entry not found. Run pnpm build, or set LAKAR_MCP_ENTRY to the path of packages/mcp/dist/main.js.</span>
        </div>
      )}
    </div>
  );
}

/** Baris hasil scan + overlay klien (`failed`/`justInstalled` dari hasil POST; `state` GET tak pernah `failed`). */
type HarnessRow = Omit<HarnessInfo, 'state'> & { state: HarnessState | 'failed'; message?: string; justInstalled?: boolean };

const baseName = (path: string | null): string => (path ?? 'config').split(/[\\/]/).pop() ?? 'config';

/** Dialog Confirm (desain "Install · Confirm", salinan pola dialog Import from URL): file, "Adds N lines", pratinjau, catatan backup+restart. */
function ConfirmInstallDialog({ row, onDone, onClose }: { row: HarnessRow; onDone: (res: HarnessResult) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const install = async () => {
    if (busy) return;
    setBusy(true);
    try {
      onDone(await api.installHarness(row.id));
    } catch (e) {
      onDone({ id: row.id, state: 'failed', message: errorText(e) });
    }
  };
  return (
    <Modal label={`Install in ${row.label}`} onClose={onClose} className="small">
      <div className="modal-text">
        <h2>Install in {row.label}</h2>
        <p>Lakar adds its MCP server entry to this config file.</p>
      </div>
      <div className="conn-confirm-file">
        <Icon name="file" size={14} />
        <span className="mono conn-confirm-path">{row.configPath}</span>
        {row.linesAdded > 0 && <span className="conn-lines">Adds {row.linesAdded} lines</span>}
      </div>
      {row.preview ? (
        <pre className="conn-code">
          <code>{row.preview}</code>
        </pre>
      ) : (
        <div className="conn-render error" role="alert">
          <Icon name="alert" size={14} />
          <span>MCP server entry not found. Run pnpm build, or set LAKAR_MCP_ENTRY to the path of packages/mcp/dist/main.js.</span>
        </div>
      )}
      <p className="conn-note">
        <Icon name="info" size={13} />A backup is saved as <span className="mono">{baseName(row.configPath)}.bak</span> first. Restart {row.label} to connect.
      </p>
      <div className="modal-buttons">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" data-autofocus className="btn primary" disabled={!row.preview || busy} onClick={() => void install()}>
          {busy ? 'Installing…' : 'Install'}
        </button>
      </div>
    </Modal>
  );
}

/** Dialog Manual setup: Setup Card lama apa adanya (fallback salin config). */
function ManualSetupDialog({ mcp, url, onClose }: { mcp: McpServerConfig | null; url: string | undefined; onClose: () => void }) {
  return (
    <Modal label="Manual setup" onClose={onClose} className="manual-setup">
      <div className="modal-text">
        <h2>Manual setup</h2>
        <p>Add Lakar's MCP server to your harness config yourself. Same entry the Install button writes.</p>
      </div>
      <SetupCard mcp={mcp} url={url ?? location.origin} />
      <div className="modal-buttons">
        <button type="button" data-autofocus className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

/** "Install in an agent" (desain section 11): kepala + Rescan, lalu baris per harness dengan 5 state. */
function InstallAgents({ mcp, url }: { mcp: McpServerConfig | null | undefined; url: string | undefined }) {
  const [rows, setRows] = useState<HarnessRow[] | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState<string | undefined>(undefined);
  const [confirm, setConfirm] = useState<HarnessRow | undefined>(undefined);
  const [manual, setManual] = useState(false);
  const [menuAt, setMenuAt] = useState<{ id: string; x: number; y: number } | undefined>(undefined);
  const [toast, setToast] = useState<ToastState | undefined>(undefined);
  const [busy, setBusy] = useState<string | undefined>(undefined);

  const scan = useCallback(() => {
    api.harnesses().then(
      (hs) => {
        setRows(hs);
        setLoadFailed(undefined);
      },
      (e) => setLoadFailed(errorText(e)),
    );
  }, []);
  useEffect(scan, [scan]);
  useRetry(scan);

  const patch = (id: string, p: Partial<HarnessRow>) => setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const applyResult = (res: HarnessResult) => {
    setConfirm(undefined);
    if (res.state === 'installed') {
      patch(res.id, { state: 'installed', installed: true, matches: true, justInstalled: true, message: undefined });
      const label = rows?.find((r) => r.id === res.id)?.label ?? res.id;
      setToast({ kind: 'info', message: `Installed in ${label}`, action: { label: 'Undo', run: () => void undo(res.id) } });
    } else {
      patch(res.id, { state: 'failed', message: res.message ?? 'Install failed' });
    }
  };

  /** Undo toast: pulihkan `.bak` lalu Rescan (state berubah menurut daemon). */
  const undo = async (id: string) => {
    setToast(undefined);
    try {
      const res = await api.revertHarness(id);
      if (res.restored) {
        scan();
        setToast({ kind: 'info', message: 'Previous config restored' });
      } else {
        setToast({ kind: 'error', message: 'No backup to restore' });
      }
    } catch (e) {
      setToast({ kind: 'error', message: errorText(e) });
    }
  };

  const uninstall = async (r: HarnessRow) => {
    setBusy(r.id);
    try {
      const res = await api.uninstallHarness(r.id);
      if (res.state === 'failed') {
        patch(r.id, { state: 'failed', message: res.message ?? 'Remove failed' });
      } else {
        patch(r.id, { state: 'not-installed', installed: false, matches: false, justInstalled: false });
        setToast({ kind: 'info', message: `Removed from ${r.label}`, action: { label: 'Undo', run: () => void undo(r.id) } });
      }
    } catch (e) {
      patch(r.id, { state: 'failed', message: errorText(e) });
    } finally {
      setBusy(undefined);
    }
  };

  const reveal = async (r: HarnessRow) => {
    try {
      const res = await api.revealHarness(r.id);
      if (!res.opened) setToast({ kind: 'error', message: 'Config file not found' });
    } catch (e) {
      setToast({ kind: 'error', message: errorText(e) });
    }
  };

  const pill = (r: HarnessRow) =>
    r.state === 'installed' ? (
      <span className="status-pill ok">Installed</span>
    ) : r.state === 'failed' ? (
      <span className="status-pill error">Failed</span>
    ) : r.state === 'not-found' ? (
      <span className="status-pill muted">Not found</span>
    ) : r.state === 'not-installed' ? (
      <span className="status-pill">Not installed</span>
    ) : null;

  const detail = (r: HarnessRow) => {
    if (r.state === 'failed') return `${r.message ?? 'Install failed'}. Nothing was changed.`;
    if (r.state === 'not-found') return `Install ${r.label} on this computer, then Rescan.`;
    if (r.state === 'manual') return 'Any MCP-compatible client';
    if (r.justInstalled) return `Added just now · restart ${r.label} to connect`;
    return <span className="mono">{r.configPath}</span>;
  };

  const actions = (r: HarnessRow) => {
    const isBusy = busy === r.id;
    if (r.state === 'not-found') {
      return (
        <button type="button" className="btn primary small" disabled>
          Install
        </button>
      );
    }
    if (r.state === 'installed') {
      return (
        <>
          <button type="button" className="btn small" disabled={isBusy} onClick={() => setConfirm(r)}>
            Reinstall
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`${r.label} actions`}
            aria-haspopup="menu"
            onClick={(e) => {
              const b = e.currentTarget.getBoundingClientRect();
              setMenuAt({ id: r.id, x: b.right - 232, y: b.bottom + 4 });
            }}
          >
            <Icon name="ellipsis" size={16} />
          </button>
        </>
      );
    }
    if (r.state === 'failed') {
      return (
        <>
          <button type="button" className="btn small" onClick={() => setManual(true)}>
            Set up manually
          </button>
          <button type="button" className="btn small" disabled={isBusy} onClick={() => void retryInstall(r)}>
            {isBusy ? 'Installing…' : 'Try again'}
          </button>
        </>
      );
    }
    if (r.state === 'manual') {
      return (
        <button type="button" className="btn small" onClick={() => setManual(true)}>
          Set up manually
        </button>
      );
    }
    return (
      <button type="button" className="btn primary small" onClick={() => setConfirm(r)}>
        Install
      </button>
    );
  };

  /** "Try again" di baris Failed: langsung install ulang tanpa dialog Confirm. */
  const retryInstall = async (r: HarnessRow) => {
    setBusy(r.id);
    try {
      const res = await api.installHarness(r.id);
      if (res.state === 'failed') patch(res.id, { state: 'failed', message: res.message ?? 'Install failed' });
      else applyResult(res);
    } catch (e) {
      patch(r.id, { state: 'failed', message: errorText(e) });
    } finally {
      setBusy(undefined);
    }
  };

  const menuRow = menuAt ? rows?.find((r) => r.id === menuAt.id) : undefined;
  const moreItems = (r: HarnessRow): Item[] => [
    {
      label: 'Open config file',
      icon: 'externalLink',
      run: () => {
        setMenuAt(undefined);
        void reveal(r);
      },
    },
    {
      label: 'Remove',
      icon: 'trash',
      danger: true,
      separator: true,
      run: () => {
        setMenuAt(undefined);
        void uninstall(r);
      },
    },
  ];

  return (
    <section className="conn-section">
      <div className="conn-section-head">
        <h2>Install in an agent</h2>
        <button type="button" className="btn small" onClick={scan}>
          <Icon name="refresh" size={13} /> Rescan
        </button>
      </div>
      <p>Register Lakar's stdio MCP server in a harness on this computer. The harness talks to lakard over HTTP.</p>
      {loadFailed ? (
        <div className="conn-render error" role="alert">
          <Icon name="alert" size={14} />
          <span>{loadFailed}</span>
          <button type="button" className="btn small" onClick={scan}>
            <Icon name="refresh" size={13} /> Try again
          </button>
        </div>
      ) : rows === undefined ? (
        <div className="conn-card conn-installs" aria-busy="true">
          <div className="skeleton line" />
          <div className="skeleton line short" />
        </div>
      ) : (
        <div className="conn-card conn-installs">
          {rows.map((r) => (
            <div key={r.id} className={`conn-install${r.state === 'failed' ? ' failed' : ''}`}>
              <span className={`conn-install-icon${r.state === 'not-found' ? ' dim' : ''}`}>
                <Icon name={r.id === 'other' ? 'plug' : 'squareTerminal'} size={16} />
              </span>
              <span className="conn-install-info">
                <span className="conn-install-title">
                  <strong>{r.label}</strong>
                  {pill(r)}
                </span>
                <span className={`conn-install-sub${r.state === 'failed' ? ' danger' : ''}`}>{detail(r)}</span>
              </span>
              <span className="conn-install-actions">{actions(r)}</span>
            </div>
          ))}
        </div>
      )}
      {confirm && <ConfirmInstallDialog row={confirm} onDone={applyResult} onClose={() => setConfirm(undefined)} />}
      {manual && <ManualSetupDialog mcp={mcp ?? null} url={url} onClose={() => setManual(false)} />}
      {menuAt && menuRow && <Menu x={menuAt.x} y={menuAt.y} items={moreItems(menuRow)} onClose={() => setMenuAt(undefined)} />}
      {toast && <Toast toast={toast} onClose={() => setToast(undefined)} />}
    </section>
  );
}

export function Connections() {
  const [info, setInfo] = useState<ConnectionsInfo | undefined>(undefined);
  const [status, setStatus] = useState<StatusState>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(() => {
    setError(undefined);
    api.connections().then(setInfo, (e) => setError(errorText(e)));
    api.status().then(setStatus, () => setStatus(null));
  }, []);
  useEffect(load, [load]);
  useRetry(load);
  // Pool render bisa masih memanaskan diri, atau lakard belum terjangkau: muat ulang status sampai siap atau gagal.
  // Permintaan gagal → `null` (Unreachable) dan tetap dijadwalkan ulang (status berubah → efek ini jalan lagi).
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const pool = status?.pool;
    if (status && (!pool || pool.ready === pool.size || pool.lastError)) return;
    if (status === undefined) return; // muat pertama masih berjalan
    const t = setTimeout(
      () =>
        api.status().then(setStatus, () => {
          setStatus(null);
          setAttempt((a) => a + 1);
        }),
      1500,
    );
    return () => clearTimeout(t);
  }, [status, attempt]);

  return (
    <div className="connections">
      <DaemonCard info={info} status={status} />

      <ConnectedAgents />

      {error && (
        <div className="conn-render error" role="alert">
          <Icon name="alert" size={14} />
          <span>{error}</span>
          <button type="button" className="btn small" onClick={load}>
            <Icon name="refresh" size={13} /> Try again
          </button>
        </div>
      )}

      <InstallAgents mcp={info?.mcp} url={info?.url} />
    </div>
  );
}
