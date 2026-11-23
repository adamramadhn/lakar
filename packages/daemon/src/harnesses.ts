// Route `/viewer/connections/harnesses*` (halaman Connections → "Install in an agent"): deteksi harness yang
// terpasang di mesin lalu pasang/hapus/pulihkan entri server MCP `lakar` di file config-nya (Claude Code,
// Codex, Pi, OpenCode). Semua tulis memakai backup `<file>.bak` byte-identik + `writeFileAtomic` (assets.ts),
// dan merge tidak menimpa key/section lain. Kegagalan sebelum tulis tidak mengubah apa pun ("Nothing was
// changed"). Deteksi = file config atau marker-dir/env-override ada (binary di PATH tidak dicek — Rescan murah).
// Semua deteksi/IO lewat `deps` yang diinjeksikan (home/env/platform/fs/reveal) supaya tes memakai home palsu
// tanpa men-stub `process.env`. Route baru hanya di bawah `/viewer/*`; guard Origin server.ts berlaku otomatis
// untuk non-GET. Log hanya `lakard: <aksi> <id> → <state>` — tidak pernah path absolut, isi file, atau nilai env.
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { LakarError, errorMessage } from '@lakar/schema';
import { writeFileAtomic } from './assets.js';
import { resolveMcpEntry, resolveMcpNode, type McpServerConfig } from './connections.js';

/** State baris harness (GET): `failed` hanya muncul sebagai hasil POST (bukan hasil scan). */
export type HarnessState = 'installed' | 'not-installed' | 'not-found' | 'manual';
/** State hasil POST install/uninstall. */
export type HarnessResultState = HarnessState | 'failed';

export type HarnessInfo = {
  id: string;
  label: string;
  state: HarnessState;
  /** Path file config yang akan ditulis; null untuk `other` (manual). */
  configPath: string | null;
  detected: boolean;
  installed: boolean;
  /** Entri `lakar` di config sama dengan entri MCP yang akan ditulis sekarang. */
  matches: boolean;
  format: 'json' | 'toml' | 'jsonc' | 'manual';
  /** Snippet yang ditambahkan (untuk dialog Confirm); null bila entry MCP tidak ada. */
  preview: string | null;
  /** Jumlah baris `preview` (badge "Adds N lines"). */
  linesAdded: number;
};

export type HarnessResult = { id: string; state: HarnessResultState; message?: string; backup?: string };
export type HarnessRevertResult = { id: string; restored: boolean };
export type HarnessRevealResult = { id: string; opened: boolean };

/**
 * Dependency terinjeksi untuk deteksi dan reveal; default-nya IO nyata. Tes mengganti `home`, `env`,
 * `platform`, dan `reveal` sehingga home user asli dan `process.env` tidak disentuh.
 */
export type HarnessDeps = {
  home: () => string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  exists: (path: string) => boolean;
  isDir: (path: string) => boolean;
  /** Buka file config di file manager OS (default: explorer /select, open -R, xdg-open dir). */
  reveal: (file: string) => void;
};

export type HarnessRoutesOptions = {
  host: string;
  /** Port config: dipakai bila server belum listen (tes inject). */
  port: number;
  /** Entry MCP dari config (`mcp_entry` / `LAKAR_MCP_ENTRY`); tidak diset → `DEFAULT_MCP_ENTRY`. */
  mcpEntry?: string;
  /** Runtime Node khusus MCP dari config (`mcp_node` / `LAKAR_MCP_NODE`). */
  mcpNode?: string;
  /** Runtime Node fallback untuk `command` (default `process.execPath`). */
  nodePath?: string;
  /** Dependency deteksi/IO (parsial; sisanya default nyata). */
  deps?: Partial<HarnessDeps>;
  /** Pencatat hasil aksi (`lakard: <aksi> <id> → <state>`). Default `console.warn`. */
  log?: (message: string) => void;
};

/** Buka `file` di file manager OS: Windows `explorer /select,<file>`, macOS `open -R`, Linux `xdg-open <dir>`. */
function osReveal(file: string, platform: NodeJS.Platform): void {
  const cmd = platform === 'win32' ? 'explorer' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? [`/select,${file}`] : platform === 'darwin' ? ['-R', file] : [dirname(file)];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } catch {
    // file manager tidak tersedia: diabaikan (respons route tetap opened sesuai hasil spawn)
  }
}

const defaultDeps = (): HarnessDeps => ({
  home: homedir,
  env: process.env,
  platform: process.platform,
  exists: existsSync,
  isDir: (p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
  reveal: (file) => osReveal(file, process.platform),
});

const isEnoent = (e: unknown) => {
  const code = (e as NodeJS.ErrnoException)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR';
};

/** String TOML (basic string; escape setara JSON, aman untuk path Windows dengan backslash). */
const toml = (s: string) => JSON.stringify(s);

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

/** Entri `mcpServers.lakar` untuk file JSON (claude-code, pi). */
const jsonEntry = (mcp: McpServerConfig): Record<string, unknown> => ({ command: mcp.command, args: [...mcp.args], env: { LAKAR_URL: mcp.env.LAKAR_URL } });

/** Entri `mcp.servers.lakar` untuk OpenCode (command = array per bentuk config opencode). */
const opencodeEntry = (mcp: McpServerConfig): Record<string, unknown> => ({
  type: 'local',
  command: [mcp.command, ...mcp.args],
  environment: { LAKAR_URL: mcp.env.LAKAR_URL },
});

/** Blok TOML `[mcp_servers.lakar]` untuk `~/.codex/config.toml`. */
const codexBlock = (mcp: McpServerConfig): string =>
  ['[mcp_servers.lakar]', `command = ${toml(mcp.command)}`, `args = [${mcp.args.map(toml).join(', ')}]`, `env = { LAKAR_URL = ${toml(mcp.env.LAKAR_URL)} }`].join('\n');

// ---- Bantu TOML (text surgery, section lain utuh byte-per-byte) ----

/** Header tabel `[mcp_servers.lakar]` atau sub-tabelnya (`[mcp_servers.lakar.env]` dst.), komentar ditoleransi. */
const LAKAR_TABLE_HEADER = /^\s*\[\s*mcp_servers\.lakar(?:\s*\]|\s*\.[^\]]*\])\s*(?:#.*)?$/;
/** Header tabel TOML mana pun sampai akhir baris (penanda akhir blok), termasuk array-of-tables `[[x]]`. */
const TABLE_HEADER = /^\s*\[+\s*[A-Za-z0-9_.'" -]+\s*\]+\s*(?:#.*)?$/;

/** Buang semua blok `[mcp_servers.lakar(.…)]` (header sampai header tabel berikut / EOF). */
function stripCodexLakar(text: string): string {
  const out: string[] = [];
  let skip = false;
  for (const line of text.split('\n')) {
    if (LAKAR_TABLE_HEADER.test(line)) {
      skip = true;
      continue;
    }
    if (skip && TABLE_HEADER.test(line)) skip = false;
    if (!skip) out.push(line);
  }
  // Rapikan: maks satu baris kosong berturut, tanpa baris kosong di awal/akhir.
  const joined = out.join('\n').replace(/\n{3,}/g, '\n\n');
  return joined.trim() === '' ? '' : `${joined.replace(/^\n+/, '').replace(/\n+$/, '')}\n`;
}

/** Gabung blok `lakar` baru ke config.toml: blok lama diganti (bukan dobel), section lain utuh. */
function mergeCodexToml(text: string | undefined, mcp: McpServerConfig): { ok: true; out: string } {
  const base = text === undefined ? '' : stripCodexLakar(text);
  const out = base ? `${base}\n${codexBlock(mcp)}\n` : `${codexBlock(mcp)}\n`;
  return { ok: true, out };
}

/** `installed` = ada blok lakar; `matches` = command/args/LAKAR_URL blok pertama sama dengan entri kini. */
function scanCodexToml(text: string, mcp: McpServerConfig | null): { installed: boolean; matches: boolean } {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => LAKAR_TABLE_HEADER.test(l));
  if (start === -1) return { installed: false, matches: false };
  const end = lines.findIndex((l, i) => i > start && TABLE_HEADER.test(l));
  const block = lines.slice(start, end === -1 ? undefined : end).join('\n');
  if (!mcp) return { installed: true, matches: false };
  const cmd = /^\s*command\s*=\s*("(?:[^"\\]|\\.)*")/m.exec(block);
  const args = /^\s*args\s*=\s*(\[[^\]]*\])/m.exec(block);
  const env = /LAKAR_URL\s*=\s*("(?:[^"\\]|\\.)*")/.exec(block);
  try {
    const matches =
      !!cmd && !!args && !!env && JSON.parse(cmd[1]!) === mcp.command && deepEqual(JSON.parse(args[1]!), mcp.args) && JSON.parse(env[1]!) === mcp.env.LAKAR_URL;
    return { installed: true, matches };
  } catch {
    return { installed: true, matches: false };
  }
}

// ---- Bantu JSON / JSONC ----

/** Buang komentar `//` dan blok komentar di luar string (JSONC opencode); posisi lain dipertahankan. */
export function stripJsonComments(text: string): string {
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < text.length) {
    const c = text[i]!;
    if (inStr) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Parse JSON/JSONC jadi objek; rusak atau bukan objek → null. */
function parseObject(text: string, jsonc: boolean): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(jsonc ? stripJsonComments(text) : text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const asObject = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Gabung entri `mcpServers.lakar` (json) atau `mcp.servers.lakar` (jsonc) ke objek; key lain utuh. */
function mergeObject(obj: Record<string, unknown>, entry: unknown, jsonc: boolean): string {
  if (jsonc) {
    const mcpSection = { ...(asObject(obj.mcp) ?? {}) };
    const servers = { ...(asObject(mcpSection.servers) ?? {}) };
    servers.lakar = entry;
    mcpSection.servers = servers;
    obj.mcp = mcpSection;
  } else {
    const servers = { ...(asObject(obj.mcpServers) ?? {}) };
    servers.lakar = entry;
    obj.mcpServers = servers;
  }
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/** Hapus entri `lakar`; `changed` false bila entri tidak ada (tidak ada yang ditulis). */
function stripObject(obj: Record<string, unknown>, jsonc: boolean): boolean {
  const servers = jsonc ? asObject(asObject(obj.mcp)?.servers) : asObject(obj.mcpServers);
  if (!servers || !('lakar' in servers)) return false;
  delete servers.lakar;
  return true;
}

/** `installed`/`matches` entri `lakar` di objek yang sudah diparse. */
function scanObject(obj: Record<string, unknown> | null, entry: Record<string, unknown> | null, jsonc: boolean): { installed: boolean; matches: boolean } {
  const servers = obj ? (jsonc ? asObject(asObject(obj.mcp)?.servers) : asObject(obj.mcpServers)) : null;
  const lakar = servers ? asObject(servers.lakar) : null;
  if (!lakar) return { installed: false, matches: false };
  return { installed: true, matches: entry !== null && deepEqual(lakar, entry) };
}

// ---- Tabel harness ----

type RealFormat = 'json' | 'toml' | 'jsonc';

type HarnessDef = {
  id: string;
  label: string;
  format: RealFormat;
  /** Path file config target untuk `deps` ini. */
  configPath: (d: HarnessDeps) => string;
  /** Deteksi: file config ada, marker-dir ada, atau env override diset. Binary tidak dicek. */
  detected: (d: HarnessDeps, configPath: string) => boolean;
  /** Entri yang ditulis/dibandingkan per format. */
  entry: (mcp: McpServerConfig) => Record<string, unknown>;
  /** Snippet pratinjau (dialog Confirm + `linesAdded`). */
  preview: (mcp: McpServerConfig) => string;
};

const jsonPreview = (mcp: McpServerConfig) => JSON.stringify({ mcpServers: { lakar: jsonEntry(mcp) } }, null, 2);

const HARNESS_DEFS: HarnessDef[] = [
  {
    // Claude Code: `CLAUDE_CONFIG_DIR` menggeser home config; marker `~/.claude` atau file `~/.claude.json`.
    id: 'claude-code',
    label: 'Claude Code',
    format: 'json',
    configPath: (d) => join(d.env.CLAUDE_CONFIG_DIR || d.home(), '.claude.json'),
    detected: (d, file) => !!d.env.CLAUDE_CONFIG_DIR || d.exists(file) || d.isDir(join(d.home(), '.claude')),
    entry: jsonEntry,
    preview: jsonPreview,
  },
  {
    // Codex: `CODEX_HOME` menggeser `<dir>/config.toml`; marker `~/.codex`.
    id: 'codex',
    label: 'Codex',
    format: 'toml',
    configPath: (d) => join(d.env.CODEX_HOME || join(d.home(), '.codex'), 'config.toml'),
    detected: (d, file) => !!d.env.CODEX_HOME || d.exists(file) || d.isDir(join(d.home(), '.codex')),
    entry: jsonEntry, // hanya dipakai bentuk {command,args,env} untuk perbandingan (scanCodexToml)
    preview: codexBlock,
  },
  {
    // Pi coding agent: `PI_CODING_AGENT_DIR` menggeser `<dir>/mcp.json`; marker `~/.pi`.
    id: 'pi',
    label: 'Pi',
    format: 'json',
    configPath: (d) => join(d.env.PI_CODING_AGENT_DIR || join(d.home(), '.pi', 'agent'), 'mcp.json'),
    detected: (d, file) => !!d.env.PI_CODING_AGENT_DIR || d.exists(file) || d.isDir(join(d.home(), '.pi')),
    entry: jsonEntry,
    preview: jsonPreview,
  },
  {
    // OpenCode: `~/.config/opencode/` (Windows sama; non-Windows hormati `XDG_CONFIG_HOME`);
    // `opencode.json` didahulukan dari `opencode.jsonc`. JSONC ditulis balik sebagai JSON rapi.
    id: 'opencode',
    label: 'OpenCode',
    format: 'jsonc',
    configPath: (d) => {
      const dir = d.platform === 'win32' ? join(d.home(), '.config', 'opencode') : join(d.env.XDG_CONFIG_HOME || join(d.home(), '.config'), 'opencode');
      const json = join(dir, 'opencode.json');
      if (d.exists(json)) return json;
      const jsonc = join(dir, 'opencode.jsonc');
      return d.exists(jsonc) ? jsonc : json;
    },
    detected: (d, file) => d.exists(file) || d.isDir(dirname(file)),
    entry: opencodeEntry,
    preview: (mcp) => JSON.stringify({ mcp: { servers: { lakar: opencodeEntry(mcp) } } }, null, 2),
  },
];

/** Definisi `other` (virtual): tanpa file config; pengguna menyalin snippet sendiri. */
const OTHER = { id: 'other', label: 'Other MCP client' } as const;

const harnessDef = (id: string): HarnessDef | 'other' | undefined => (id === OTHER.id ? 'other' : HARNESS_DEFS.find((h) => h.id === id));

const unknownHarness = (id: string) =>
  new LakarError('SCHEMA_INVALID', `harness tidak dikenal: ${JSON.stringify(id)}`, { hint: `id yang dikenal: ${[...HARNESS_DEFS.map((h) => h.id), OTHER.id].join(', ')}` });

export function registerHarnessRoutes(app: FastifyInstance, { host, port, mcpEntry, mcpNode, nodePath = process.execPath, deps, log = (m) => console.warn(m) }: HarnessRoutesOptions): void {
  const d: HarnessDeps = { ...defaultDeps(), ...deps };
  /** Entri MCP kini (sama dengan `GET /viewer/connections`), null bila entry tidak ditemukan. */
  const mcpConfig = (): McpServerConfig | null => {
    const addr = app.server.address();
    const url = `http://${host}:${addr && typeof addr === 'object' ? addr.port : port}`;
    const entry = resolveMcpEntry(mcpEntry, d.exists);
    if (!entry) return null;
    return { command: resolveMcpNode(mcpNode, nodePath, d.exists), args: [entry], env: { LAKAR_URL: url } };
  };

  const describe = async (h: HarnessDef, mcp: McpServerConfig | null): Promise<HarnessInfo> => {
    const file = h.configPath(d);
    const detected = h.detected(d, file);
    let installed = false;
    let matches = false;
    if (detected && d.exists(file)) {
      const text = await readFile(file, 'utf8').catch(() => undefined);
      if (text !== undefined) {
        const scan = h.format === 'toml' ? scanCodexToml(text, mcp) : scanObject(parseObject(text, h.format === 'jsonc'), mcp ? h.entry(mcp) : null, h.format === 'jsonc');
        installed = scan.installed;
        matches = scan.matches;
      }
    }
    const preview = mcp ? h.preview(mcp) : null;
    return {
      id: h.id,
      label: h.label,
      state: !detected ? 'not-found' : installed ? 'installed' : 'not-installed',
      configPath: file,
      detected,
      installed,
      matches,
      format: h.format,
      preview,
      linesAdded: preview ? preview.split('\n').length : 0,
    };
  };

  const OTHER_INFO: HarnessInfo = { id: OTHER.id, label: OTHER.label, state: 'manual', configPath: null, detected: false, installed: false, matches: false, format: 'manual', preview: null, linesAdded: 0 };

  /** Rescan: state semua harness + pratinjau entri per format. */
  app.get('/viewer/connections/harnesses', async (_req, reply) => {
    const mcp = mcpConfig();
    const harnesses = [...(await Promise.all(HARNESS_DEFS.map((h) => describe(h, mcp)))), OTHER_INFO];
    return reply.code(200).send({ ok: true, data: { harnesses } });
  });

  /**
   * Balas 400 `{ok:false,error}` ala handler global server.ts — dikirim di sini supaya modul ini mandiri
   * (terdaftar langsung tanpa error handler Fastify). Input tak dikenal tetap 400, kegagalan bisnis tetap 200.
   */
  const bad = (reply: FastifyReply, err: LakarError) => reply.code(400).send({ ok: false, error: err.toBody() });

  /** `harnessDef` atau balas 400 bila id tak dikenal (undefined = respons sudah dikirim). */
  const defOr400 = (id: string, reply: FastifyReply): HarnessDef | 'other' | undefined => {
    const h = harnessDef(id);
    if (h === undefined) {
      bad(reply, unknownHarness(id));
      return undefined;
    }
    return h;
  };

  /** Def nyata (bukan `other`) atau balas 400 (undefined = respons sudah dikirim). */
  const realOr400 = (id: string, reply: FastifyReply): HarnessDef | undefined => {
    const h = defOr400(id, reply);
    if (h === undefined) return undefined;
    if (h === 'other') {
      bad(reply, new LakarError('SCHEMA_INVALID', `harness ${OTHER.id} tidak punya file config`, { hint: 'pakai Set up manually di halaman Connections' }));
      return undefined;
    }
    return h;
  };

  /**
   * Pasang entri `lakar` ke file config `h`: deteksi → entry MCP → baca+merge → backup `.bak` → tulis atomik.
   * Kegagalan bisnis kembali `state:'failed'` (200, bukan throw) supaya baris Failed terisi pesannya.
   */
  const install = async (h: HarnessDef): Promise<HarnessResult> => {
    const file = h.configPath(d);
    if (!h.detected(d, file)) return { id: h.id, state: 'failed', message: 'harness tidak terdeteksi di komputer ini' };
    const mcp = mcpConfig();
    if (!mcp) return { id: h.id, state: 'failed', message: 'entry MCP tidak ditemukan (jalankan build atau set LAKAR_MCP_ENTRY)' };
    let text: string | undefined;
    try {
      text = await readFile(file, 'utf8');
    } catch (e) {
      if (!isEnoent(e)) return { id: h.id, state: 'failed', message: 'file config tidak bisa dibaca' };
    }
    const entry = h.format === 'jsonc' ? opencodeEntry(mcp) : jsonEntry(mcp);
    let out: string;
    if (h.format === 'toml') {
      out = mergeCodexToml(text, mcp).out;
    } else {
      const obj = text === undefined ? {} : parseObject(text, h.format === 'jsonc');
      if (!obj) return { id: h.id, state: 'failed', message: `file config bukan ${h.format === 'jsonc' ? 'JSONC' : 'JSON'} valid` };
      out = mergeObject(obj, entry, h.format === 'jsonc');
    }
    try {
      // Direktori config mungkin belum ada (marker/env-override menandai terdeteksi, file belum ditulis).
      await mkdir(dirname(file), { recursive: true });
      let backup: string | undefined;
      if (text !== undefined) {
        backup = `${file}.bak`;
        await writeFileAtomic(backup, text);
      }
      await writeFileAtomic(file, out);
      return { id: h.id, state: 'installed', ...(backup ? { backup } : {}) };
    } catch (e) {
      return { id: h.id, state: 'failed', message: `gagal menulis file config: ${errorMessage(e)}` };
    }
  };

  /** Hapus entri `lakar` (backup `.bak` dulu). File tidak ada / tanpa entri → `not-installed` tanpa tulis. */
  const uninstall = async (h: HarnessDef): Promise<HarnessResult> => {
    const file = h.configPath(d);
    if (!h.detected(d, file)) return { id: h.id, state: 'failed', message: 'harness tidak terdeteksi di komputer ini' };
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (e) {
      if (isEnoent(e)) return { id: h.id, state: 'not-installed' };
      return { id: h.id, state: 'failed', message: 'file config tidak bisa dibaca' };
    }
    let out: string;
    if (h.format === 'toml') {
      if (!text.split('\n').some((l) => LAKAR_TABLE_HEADER.test(l))) return { id: h.id, state: 'not-installed' };
      out = stripCodexLakar(text);
    } else {
      const obj = parseObject(text, h.format === 'jsonc');
      if (!obj) return { id: h.id, state: 'failed', message: `file config bukan ${h.format === 'jsonc' ? 'JSONC' : 'JSON'} valid` };
      if (!stripObject(obj, h.format === 'jsonc')) return { id: h.id, state: 'not-installed' };
      out = `${JSON.stringify(obj, null, 2)}\n`;
    }
    try {
      const backup = `${file}.bak`;
      await writeFileAtomic(backup, text);
      await writeFileAtomic(file, out);
      return { id: h.id, state: 'not-installed', backup };
    } catch (e) {
      return { id: h.id, state: 'failed', message: `gagal menulis file config: ${errorMessage(e)}` };
    }
  };

  app.post<{ Params: { id: string } }>('/viewer/connections/harnesses/:id/install', async (req, reply) => {
    const h = realOr400(req.params.id, reply);
    if (h === undefined) return reply;
    const result = await install(h);
    log(`lakard: install ${result.id} → ${result.state}`);
    return reply.code(200).send({ ok: true, data: result });
  });

  app.post<{ Params: { id: string } }>('/viewer/connections/harnesses/:id/uninstall', async (req, reply) => {
    const h = realOr400(req.params.id, reply);
    if (h === undefined) return reply;
    const result = await uninstall(h);
    log(`lakard: uninstall ${result.id} → ${result.state}`);
    return reply.code(200).send({ ok: true, data: result });
  });

  /** Pulihkan `<file>.bak` ke path aslinya (atomik). `.bak` tidak ada → `restored:false`. */
  app.post<{ Params: { id: string } }>('/viewer/connections/harnesses/:id/revert', async (req, reply) => {
    const h = defOr400(req.params.id, reply);
    if (h === undefined) return reply;
    if (h === 'other') return reply.code(200).send({ ok: true, data: { id: OTHER.id, restored: false } satisfies HarnessRevertResult });
    const file = h.configPath(d);
    let restored = false;
    try {
      const backup = await readFile(`${file}.bak`);
      await writeFileAtomic(file, backup);
      restored = true;
    } catch {
      // .bak tidak ada atau gagal dipulihkan: tidak ada yang berubah
    }
    log(`lakard: revert ${h.id} → ${restored ? 'restored' : 'nothing'}`);
    return reply.code(200).send({ ok: true, data: { id: h.id, restored } satisfies HarnessRevertResult });
  });

  /** Buka file config di file manager OS. File tidak ada → `opened:false`. */
  app.post<{ Params: { id: string } }>('/viewer/connections/harnesses/:id/reveal', async (req, reply) => {
    const h = defOr400(req.params.id, reply);
    if (h === undefined) return reply;
    if (h === 'other') return reply.code(200).send({ ok: true, data: { id: OTHER.id, opened: false } satisfies HarnessRevealResult });
    const file = h.configPath(d);
    let opened = false;
    if (d.exists(file)) {
      try {
        d.reveal(file);
        opened = true;
      } catch {
        opened = false;
      }
    }
    return reply.code(200).send({ ok: true, data: { id: h.id, opened } satisfies HarnessRevealResult });
  });
}
