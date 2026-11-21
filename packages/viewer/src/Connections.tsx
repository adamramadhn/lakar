// Settings → Connections (desain `lakar-ui.pen` node e7hIme): kartu status lakard, "Add an agent" bertab dengan
// config MCP stdio + Copy, dan "Tools exposed". Daftar "Connected agents" per harness sengaja belum ada (butuh
// identitas harness). Data dari `GET /viewer/connections` (URL lakard sebenarnya) dan `GET /status` (pool render).
import { useCallback, useEffect, useState } from 'react';
import { api, errorText, type Connections as ConnectionsInfo, type DaemonStatus, type McpServerConfig } from './api';
import { HARNESSES, MCP_TOOLS, nonDefaultPort } from './harnesses';
import { useRetry } from './hooks';
import { Icon } from './icons';

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

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
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
    <button type="button" className="btn small" onClick={copy}>
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

function AddAgent({ mcp, url }: { mcp: McpServerConfig | null; url: string }) {
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
            <span className="mono">{harness.file}</span>
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

      <section className="conn-section">
        <h2>Add an agent</h2>
        <p>Register Lakar's stdio MCP server in your harness. It forwards to lakard over HTTP.</p>
        {error ? (
          <div className="conn-render error" role="alert">
            <Icon name="alert" size={14} />
            <span>{error}</span>
            <button type="button" className="btn small" onClick={load}>
              <Icon name="refresh" size={13} /> Try again
            </button>
          </div>
        ) : info === undefined ? (
          <div className="conn-card conn-code-card" aria-busy="true">
            <div className="skeleton line" />
            <div className="skeleton line short" />
          </div>
        ) : (
          <AddAgent mcp={info.mcp} url={info.url} />
        )}
      </section>

      <section className="conn-section">
        <h2>Tools exposed</h2>
        <p>What agents can call. Read-only in this app.</p>
        <div className="conn-tools">
          {MCP_TOOLS.map((t) => (
            <span key={t} className="conn-tool mono">
              {t}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
