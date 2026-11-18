// Klien MCP stdio milik harness untuk server `pencil` (pen.dev desktop). Dipakai di luar waktu terukur:
// verifikasi dokumen baru sebelum run, lalu save + daftar frame + Export PNG setelah `result`.
import { readFileSync } from 'node:fs';
import { Client, type Transport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

export type StdioServerConfig = { type: 'stdio'; command: string; args: string[]; env: Record<string, string> };

export function loadServerConfig(mcpConfigPath: string, server: string): StdioServerConfig {
  const cfg = JSON.parse(readFileSync(mcpConfigPath, 'utf8'));
  const s = cfg?.mcpServers?.[server];
  if (!s || s.type !== 'stdio') throw new Error(`${mcpConfigPath}: server stdio ${server} tidak ada`);
  return s as StdioServerConfig;
}

export type TopNode = { id: string; name: string; type: string; width: number; height: number; declaredWidth: unknown; declaredHeight: unknown };

/** URI dokumen aktif dari teks `get_app_state`. */
export function parseAppStateUri(text: string): string | undefined {
  return text.match(/Currently active canvas editor URI:\s*`([^`]+)`/)?.[1];
}

/** Snippet `execute` untuk node top-level (bounds = ukuran terselesaikan, n.width bisa null/fit). */
export const LIST_TOP_SNIPPET =
  'Get((n,c)=>{c.skipChildren();Print(JSON.stringify([n.id,n.name,n.type,n.width??null,n.height??null,c.bounds.width,c.bounds.height]))})';

/** Baris Print berbentuk JSON array dari LIST_TOP_SNIPPET. */
export function parseTopNodes(text: string): TopNode[] {
  const out: TopNode[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('[')) continue;
    let a: unknown;
    try {
      a = JSON.parse(line);
    } catch {
      continue;
    }
    if (!Array.isArray(a) || a.length !== 7) continue;
    out.push({ id: String(a[0]), name: String(a[1]), type: String(a[2]), declaredWidth: a[3], declaredHeight: a[4], width: Number(a[5]), height: Number(a[6]) });
  }
  return out;
}

function inheritedEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) out[k] = v;
  return out;
}

function stdioTransport(cfg: StdioServerConfig): Transport {
  return new StdioClientTransport({ command: cfg.command, args: cfg.args, env: { ...inheritedEnv(), ...cfg.env }, stderr: 'ignore' });
}

function textOf(res: any): string {
  return Array.isArray(res?.content) ? res.content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n') : '';
}

export class PencilClient {
  readonly #client: Client;
  readonly serverVersion: { name: string; version: string } | undefined;

  private constructor(client: Client) {
    this.#client = client;
    const v = client.getServerVersion();
    this.serverVersion = v ? { name: v.name, version: v.version } : undefined;
  }

  /**
   * Hubungkan klien harness. `connect` gagal → transport (dan proses anaknya) ditutup lalu error dilempar
   * ulang, agar tidak ada proses `pencil` yatim. `makeTransport` hanya untuk tes.
   */
  static async connect(cfg: StdioServerConfig, makeTransport: (cfg: StdioServerConfig) => Transport = stdioTransport): Promise<PencilClient> {
    const transport = makeTransport(cfg);
    const client = new Client({ name: 'lakar-bench-harness', version: '0' });
    try {
      await client.connect(transport);
    } catch (e) {
      await transport.close().catch(() => {});
      throw e;
    }
    return new PencilClient(client);
  }

  async #call(name: string, args: Record<string, unknown>): Promise<string> {
    const res = await this.#client.callTool({ name, arguments: args }, { timeout: 120_000 });
    const text = textOf(res);
    if ((res as any)?.isError) throw new Error(`pencil ${name} error: ${text.slice(0, 500)}`);
    return text;
  }

  async appState(): Promise<{ uri: string | undefined; text: string }> {
    const text = await this.#call('get_app_state', {});
    return { uri: parseAppStateUri(text), text };
  }

  async execute(uri: string, description: string, input: string): Promise<string> {
    return this.#call('execute', { uri, description, input });
  }

  async listTopNodes(uri: string): Promise<TopNode[]> {
    return parseTopNodes(await this.execute(uri, 'List top level nodes', LIST_TOP_SNIPPET));
  }

  async save(uri: string): Promise<string> {
    return this.#call('save', { uri });
  }

  /** Export PNG skala 1 (default pen.dev = 2, lihat execute.md `ExportOptions.scale`). Menulis `<dir>/<id>.png`. */
  async exportPng(uri: string, ids: string[], dir: string): Promise<string> {
    const input = `Export(${JSON.stringify(ids)},"png",${JSON.stringify(dir)},{scale:1})`;
    return this.execute(uri, 'Export frames as PNG', input);
  }

  async close(): Promise<void> {
    await this.#client.close();
  }
}
