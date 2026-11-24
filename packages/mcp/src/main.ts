#!/usr/bin/env node
// Entry lakar-mcp (stdio). Didaftarkan lewat .mcp.json project; LAKAR_URL menunjuk ke lakard.
// Mode file (spec-collab-cloud story 2): `lakar --file <doc>.lakar.json` atau LAKAR_FILE=<path>
// menjalankan tool yang sama langsung pada satu file `.lakar.json` tanpa lakard.
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { DEFAULT_LAKARD_URL, errorMessage } from '@lakar/schema';
import { createLakarMcpServer } from './server.js';

/** `--file <path>` (argumen CLI) mengalahkan `LAKAR_FILE`; dua-duanya mengalahkan `LAKAR_URL`. */
function fileArg(): string | undefined {
  const i = process.argv.indexOf('--file');
  if (i !== -1) {
    const v = process.argv[i + 1];
    if (!v || v.startsWith('-')) throw new Error('--file butuh path .lakar.json, mis. lakar --file ./desain.lakar.json');
    return v;
  }
  const inline = process.argv.find((a) => a.startsWith('--file='));
  if (inline) return inline.slice('--file='.length);
  return undefined;
}

async function buildServer(): Promise<ReturnType<typeof createLakarMcpServer>> {
  try {
    const file = fileArg() ?? process.env.LAKAR_FILE;
    if (file === undefined) return createLakarMcpServer(process.env.LAKAR_URL || DEFAULT_LAKARD_URL);
    // Impor malas: FileClient menarik @lakar/daemon (DocStore/core/exec) — mode daemon tidak boleh memuatnya.
    const { FileClient } = await import('./file-client.js');
    const server = createLakarMcpServer(new FileClient(file));
    console.error(`lakar: mode file ${file} (tanpa lakard; tool render → NOT_SUPPORTED)`);
    return server;
  } catch (e) {
    // Argumen --file salah / file hilang/rusak → gagal start yang jelas (stderr; stdio tetap bersih untuk protokol MCP).
    console.error(`lakar: ${errorMessage(e)}`);
    process.exit(1);
  }
}

await (await buildServer()).connect(new StdioServerTransport());
