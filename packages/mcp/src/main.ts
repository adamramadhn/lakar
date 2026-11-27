#!/usr/bin/env node
// Entry lakar-mcp (stdio). Didaftarkan lewat .mcp.json project; LAKAR_URL menunjuk ke lakard.
// Mode file (spec-collab-cloud story 2): `lakar --file <doc>.lakar.json` atau LAKAR_FILE=<path>
// menjalankan tool yang sama langsung pada satu file `.lakar.json` tanpa lakard.
// Mode server (story 4): `lakar --server <url> --token <capabilityToken>` (atau env
// LAKAR_SERVER/LAKAR_TOKEN) menyambung agen ke room `@lakar/sync` lewat WebSocket — replika lokal
// menjaga semantik mode file, perubahan diteruskan sebagai ops ke semua peer room.
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { DEFAULT_LAKARD_URL, errorMessage } from '@lakar/schema';
import { createLakarMcpServer } from './server.js';

/** Nilai `--<flag> <v>` / `--<flag>=<v>` dari argv (undefined bila absen). */
function argOf(flag: string, hint: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  if (i !== -1) {
    const v = process.argv[i + 1];
    if (!v || v.startsWith('-')) throw new Error(`--${flag} butuh nilai — ${hint}`);
    return v;
  }
  const inline = process.argv.find((a) => a.startsWith(`--${flag}=`));
  if (inline) return inline.slice(`--${flag}=`.length);
  return undefined;
}

/** `--server <url>` (argumen CLI) mengalahkan `LAKAR_SERVER`; `--token`/`LAKAR_TOKEN` untuk capability token. */
function serverArgs(): { url: string; token: string } | undefined {
  const url = argOf('server', 'mis. lakar --server wss://sync.lakar.dev --token <capabilityToken>') ?? process.env.LAKAR_SERVER;
  if (url === undefined) return undefined;
  const token = argOf('token', 'mis. lakar --token <capabilityToken> (dari respons create)') ?? process.env.LAKAR_TOKEN;
  if (token === undefined) throw new Error(`--server ${url} butuh capability token room: --token <token> atau env LAKAR_TOKEN`);
  return { url, token };
}

/** `--file <path>` (argumen CLI) mengalahkan `LAKAR_FILE`; dua-duanya mengalahkan `LAKAR_URL`. */
function fileArg(): string | undefined {
  return argOf('file', 'mis. lakar --file ./desain.lakar.json') ?? process.env.LAKAR_FILE;
}

/** `LAKAR_MCP_TOOLS=readonly` membatasi server ke tool ber-efek read (untuk harness review/bench). */
function toolsOpts(): { tools?: 'readonly' } {
  const v = process.env.LAKAR_MCP_TOOLS;
  if (v === undefined || v === 'all') return {};
  if (v !== 'readonly') throw new Error(`LAKAR_MCP_TOOLS harus 'readonly' atau 'all', bukan ${JSON.stringify(v)}`);
  return { tools: 'readonly' };
}

async function buildServer(): Promise<ReturnType<typeof createLakarMcpServer>> {
  try {
    const opts = toolsOpts();
    // Prioritas mode: --server (live collab) > --file (satu file) > lakard (default).
    const server = serverArgs();
    if (server !== undefined) {
      // Impor malas: SyncClient menarik ws + @lakar/daemon — mode daemon/file tidak boleh memuatnya.
      const { SyncClient, maskToken } = await import('./sync-client.js');
      const s = createLakarMcpServer(new SyncClient(server.url, server.token), opts);
      console.error(`lakar: mode server ${server.url} room ${maskToken(server.token)} (tool render/jaringan → NOT_SUPPORTED)`);
      return s;
    }
    const file = fileArg();
    if (file === undefined) return createLakarMcpServer(process.env.LAKAR_URL || DEFAULT_LAKARD_URL, opts);
    // Impor malas: FileClient menarik @lakar/daemon (DocStore/core/exec) — mode daemon tidak boleh memuatnya.
    const { FileClient } = await import('./file-client.js');
    const s = createLakarMcpServer(new FileClient(file), opts);
    console.error(`lakar: mode file ${file} (tanpa lakard; tool render → NOT_SUPPORTED)`);
    return s;
  } catch (e) {
    // Argumen salah / file hilang/rusak → gagal start yang jelas (stderr; stdio tetap bersih untuk protokol MCP).
    console.error(`lakar: ${errorMessage(e)}`);
    process.exit(1);
  }
}

await (await buildServer()).connect(new StdioServerTransport());
