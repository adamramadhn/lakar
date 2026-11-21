// Settings → Connections (desain `lakar-ui.pen` node e7hIme): kartu status lakard, "Add an agent" bertab dengan
// config MCP stdio + Copy, dan "Tools exposed". Daftar "Connected agents" per harness sengaja belum ada (butuh
// identitas harness). Data dari `GET /viewer/connections` (URL lakard sebenarnya) dan `GET /status` (pool render).
import { useCallback, useEffect, useState } from 'react';
import { api, errorText, type Connections as ConnectionsInfo, type DaemonStatus, type McpServerConfig } from './api';
import { useRetry } from './hooks';
import { Icon } from './icons';

/** Tool MCP `lakar` (packages/mcp/src/server.ts). */
export const MCP_TOOLS = [
  'status',
  'read_skill',
  'open_doc',
  'list_boards',
  'execute',
  'inspect',
  'layout_check',
  'screenshot',
  'export',
  'icon_search',
  'photo_search',
] as const;

type Harness = { id: string; label: string; file: string; snippet: (mcp: McpServerConfig) => string };

/** String TOML (basic string, escape setara JSON untuk path Windows). */
const toml = (s: string) => JSON.stringify(s);

export const HARNESSES: Harness[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    file: '.mcp.json',
    snippet: (m) => JSON.stringify({ mcpServers: { lakar: { command: m.command, args: m.args, env: m.env } } }, null, 2),
  },
  {
    id: 'codex',
    label: 'Codex',
    file: '~/.codex/config.toml',
    snippet: (m) =>
      [
        '[mcp_servers.lakar]',
        `command = ${toml(m.command)}`,
        `args = [${m.args.map(toml).join(', ')}]`,
        `env = { LAKAR_URL = ${toml(m.env.LAKAR_URL)} }`,
      ].join('\n'),
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    file: '~/.gemini/settings.json',
    snippet: (m) => JSON.stringify({ mcpServers: { lakar: { command: m.command, args: m.args, env: m.env } } }, null, 2),
  },
  {
    id: 'acp',
    label: 'Other ACP',
    file: 'mcpServers (ACP session/new)',
    snippet: (m) => JSON.stringify([{ name: 'lakar', command: m.command, args: m.args, env: [{ name: 'LAKAR_URL', value: m.env.LAKAR_URL }] }], null, 2),
  },
];

/**
 * Salin teks. Clipboard API dulu; webview aplikasi desktop (WKWebView, WebKitGTK) bisa menolaknya, jadi
 * jatuh ke textarea + `execCommand('copy')`. Melempar bila keduanya gagal.
 */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // lanjut ke fallback
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    if (!document.execCommand('copy')) throw new Error('copy ditolak');
  } finally {
    area.remove();
  }
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

function DaemonCard({ info, status }: { info: ConnectionsInfo | undefined; status: DaemonStatus | undefined }) {
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
            {status ? <span className="status-pill ok">Running</span> : <span className="status-pill">Checking…</span>}
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

function AddAgent({ mcp }: { mcp: McpServerConfig | null }) {
  const [tab, setTab] = useState(HARNESSES[0]!.id);
  const harness = HARNESSES.find((h) => h.id === tab) ?? HARNESSES[0]!;
  const snippet = mcp ? harness.snippet(mcp) : '';
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
  const [status, setStatus] = useState<DaemonStatus | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(() => {
    setError(undefined);
    api.connections().then(setInfo, (e) => setError(errorText(e)));
    api.status().then(setStatus, () => setStatus(undefined));
  }, []);
  useEffect(load, [load]);
  useRetry(load);
  // Pool render bisa masih memanaskan diri: muat ulang status sampai siap atau gagal.
  useEffect(() => {
    const pool = status?.pool;
    if (!pool || pool.ready === pool.size || pool.lastError) return;
    const t = setTimeout(() => api.status().then(setStatus, () => {}), 1500);
    return () => clearTimeout(t);
  }, [status]);

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
          <AddAgent mcp={info.mcp} />
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
