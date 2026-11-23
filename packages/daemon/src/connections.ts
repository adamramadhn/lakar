// Route `GET /viewer/connections` (halaman Connections viewer + aplikasi desktop): URL lakard yang sebenarnya dan
// config server MCP stdio untuk harness. Baca-saja; bentuk respons AD-11 `{ok:true,data}`.
import type { FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Default entry MCP: tata letak repo `packages/mcp/dist/main.js` (relatif terhadap `packages/daemon/{src,dist}`). */
export const DEFAULT_MCP_ENTRY = fileURLToPath(new URL('../../mcp/dist/main.js', import.meta.url));

/** Config server MCP stdio (`mcpServers.lakar` di .mcp.json harness). */
export type McpServerConfig = { command: string; args: string[]; env: { LAKAR_URL: string } };
export type ConnectionsInfo = { url: string; mcp: McpServerConfig | null };

export type ConnectionRoutesOptions = {
  host: string;
  /** Port config: dipakai bila server belum listen (tes inject). */
  port: number;
  /** Entry MCP dari config (`mcp_entry` / `LAKAR_MCP_ENTRY`); tidak diset → `DEFAULT_MCP_ENTRY`. */
  mcpEntry?: string;
  /** Runtime Node untuk `command` (default `process.execPath`, runtime daemon ini). */
  nodePath?: string;
  /**
   * Runtime Node khusus MCP dari config (`mcp_node` / `LAKAR_MCP_NODE`). Dipakai bila file ada; selain itu
   * `nodePath`, agar config yang ditampilkan selalu bisa dijalankan.
   */
  mcpNode?: string;
  /** Hook tes. */
  exists?: (path: string) => boolean;
};

/** Path absolut entry MCP bila file ada, selain itu null. */
export function resolveMcpEntry(configured: string | undefined, exists: (path: string) => boolean = existsSync): string | null {
  const entry = resolve(configured || DEFAULT_MCP_ENTRY);
  return exists(entry) ? entry : null;
}

/** Runtime Node untuk `command`: `mcp_node` bila diset dan ada, selain itu runtime daemon. */
export function resolveMcpNode(configured: string | undefined, fallback: string, exists: (path: string) => boolean = existsSync): string {
  if (!configured) return fallback;
  const node = resolve(configured);
  return exists(node) ? node : fallback;
}

export function registerConnectionRoutes(app: FastifyInstance, { host, port, mcpEntry, mcpNode, nodePath = process.execPath, exists = existsSync }: ConnectionRoutesOptions): void {
  app.get('/viewer/connections', async (_req, reply) => {
    const addr = app.server.address();
    const url = `http://${host}:${addr && typeof addr === 'object' ? addr.port : port}`;
    const entry = resolveMcpEntry(mcpEntry, exists);
    const command = resolveMcpNode(mcpNode, nodePath, exists);
    const data: ConnectionsInfo = { url, mcp: entry ? { command, args: [entry], env: { LAKAR_URL: url } } : null };
    return reply.code(200).send({ ok: true, data });
  });
}
