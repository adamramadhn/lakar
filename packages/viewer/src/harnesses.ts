// Snippet config MCP per harness untuk dialog "Manual setup" di halaman Connections (fungsi murni, tanpa React;
// diuji di connections.test.ts). Daftar ini sama dengan tabel deteksi daemon (packages/daemon/src/harnesses.ts):
// salin manual tetap ada sebagai fallback bila instalasi otomatis tidak bisa.
// Sengaja tanpa import relatif: modul ini juga di-typecheck oleh tsconfig.test.json (nodenext).

/** Config server MCP stdio dari `GET /viewer/connections` (struktur sama dengan `McpServerConfig` di api.ts). */
export type McpServerConfig = { command: string; args: string[]; env: { LAKAR_URL: string } };

/** Port lakard default (sama dengan DEFAULT_LAKARD_PORT @lakar/schema; disalin agar bundle tidak menarik zod). */
export const DEFAULT_PORT = 7466;

/** Tool MCP `lakar` (packages/mcp/src/server.ts). */
export const MCP_TOOLS = [
  'status',
  'read_skill',
  'open_doc',
  'list_documents',
  'list_boards',
  'execute',
  'inspect',
  'layout_check',
  'visual_diff',
  'screenshot',
  'export',
  'export_code',
  'icon_search',
  'photo_search',
  'get_selection',
  'paste',
  'undo',
  'redo',
  'fix_check',
] as const;

export type Harness = { id: string; label: string; file: string; snippet: (mcp: McpServerConfig) => string };

/** String TOML (basic string, escape setara JSON untuk path Windows). */
const toml = (s: string) => JSON.stringify(s);

const jsonSnippet = (m: McpServerConfig) => JSON.stringify({ mcpServers: { lakar: { command: m.command, args: m.args, env: m.env } } }, null, 2);

export const HARNESSES: Harness[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    file: '~/.claude.json',
    snippet: jsonSnippet,
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
    id: 'pi',
    label: 'Pi',
    file: '~/.pi/agent/mcp.json',
    snippet: jsonSnippet,
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    file: '~/.config/opencode/opencode.json',
    snippet: (m) => JSON.stringify({ mcp: { servers: { lakar: { type: 'local', command: [m.command, ...m.args], environment: { LAKAR_URL: m.env.LAKAR_URL } } } } }, null, 2),
  },
  {
    id: 'other',
    label: 'Other MCP client',
    file: 'mcpServers',
    snippet: jsonSnippet,
  },
];

/** Port URL lakard bila bukan default 7466 (aplikasi desktop memakai port lain saat 7466 terpakai), selain itu null. */
export function nonDefaultPort(url: string): number | null {
  try {
    const port = Number(new URL(url).port || 80);
    return port === DEFAULT_PORT ? null : port;
  } catch {
    return null;
  }
}
