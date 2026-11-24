// Route `/viewer/connections/harnesses*` (story 8.11): matriks I/O spec — deteksi per harness, install/uninstall
// dengan backup `.bak` byte-identik + merge tanpa menimpa key lain, revert, reveal, dan guard Origin.
// Home palsu lewat `mkdtemp` + deps terinjeksi (home/env/platform/reveal); `process.env` tidak disentuh.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerHarnessRoutes, stripJsonComments } from './harnesses.js';
import { buildServer, loadConfig } from './index.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const noRender = { screenshot: async () => new Uint8Array(), measure: async () => ({}) } as never;

let root: string;
let entry: string;
/** Entri `lakar` yang ditulis route ini (nodePath palsu + port config 7466 saat inject). */
let MCP: { command: string; args: string[]; env: { LAKAR_URL: string } };
let OPENCODE_MCP: { type: string; command: string[]; environment: { LAKAR_URL: string } };
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-harnesses-test-'));
  entry = join(root, 'mcp-entry.js');
  await writeFile(entry, '// server MCP palsu\n');
  MCP = { command: '/fake/node', args: [entry], env: { LAKAR_URL: 'http://127.0.0.1:7466' } };
  OPENCODE_MCP = { type: 'local', command: [MCP.command, ...MCP.args], environment: { LAKAR_URL: MCP.env.LAKAR_URL } };
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;
type HarnessRow = { id: string; state: string; configPath: string | null; detected: boolean; installed: boolean; matches: boolean; format: string; preview: string | null; linesAdded: number };

type Setup = {
  app: FastifyInstance;
  home: string;
  revealed: string[];
  get: (url: string) => Promise<InjectResponse>;
  act: (id: string, action: 'install' | 'uninstall' | 'revert' | 'reveal') => Promise<InjectResponse>;
  harnesses: () => Promise<HarnessRow[]>;
};

async function setup(env: NodeJS.ProcessEnv = {}, platform: NodeJS.Platform = 'win32', mcpEntry: string | undefined = entry): Promise<Setup> {
  const home = await mkdtemp(join(root, 'home-'));
  const revealed: string[] = [];
  const app = Fastify();
  registerHarnessRoutes(app, {
    host: '127.0.0.1',
    port: 7466,
    ...(mcpEntry ? { mcpEntry } : {}),
    nodePath: MCP.command,
    deps: { home: () => home, env, platform, reveal: (f) => revealed.push(f) },
    log: () => {},
  });
  const get = (url: string) => app.inject({ method: 'GET', url });
  const act = (id: string, action: 'install' | 'uninstall' | 'revert' | 'reveal') => app.inject({ method: 'POST', url: `/viewer/connections/harnesses/${id}/${action}` });
  const harnesses = async () => ((await get('/viewer/connections/harnesses')).json().data as { harnesses: HarnessRow[] }).harnesses;
  return { app, home, revealed, get, act, harnesses };
}

const row = async (t: Setup, id: string) => (await t.harnesses()).find((h) => h.id === id)!;

describe('GET /viewer/connections/harnesses', () => {
  it('home kosong → 4 harness not-found + other manual; preview berisi entri MCP', async () => {
    const t = await setup();
    const list = await t.harnesses();
    expect(list.map((h) => h.id)).toEqual(['claude-code', 'codex', 'pi', 'opencode', 'other']);
    for (const id of ['claude-code', 'codex', 'pi', 'opencode']) {
      expect(list.find((h) => h.id === id)).toMatchObject({ state: 'not-found', detected: false, installed: false });
    }
    expect(list.find((h) => h.id === 'other')).toMatchObject({ state: 'manual', configPath: null, format: 'manual', preview: null, linesAdded: 0 });
    const claude = list.find((h) => h.id === 'claude-code')!;
    expect(claude.configPath).toBe(join(t.home, '.claude.json'));
    expect(JSON.parse(claude.preview!)).toEqual({ mcpServers: { lakar: MCP } });
    expect(claude.linesAdded).toBe(claude.preview!.split('\n').length);
    const codex = list.find((h) => h.id === 'codex')!;
    expect(codex.preview).toContain('[mcp_servers.lakar]');
    const opencode = list.find((h) => h.id === 'opencode')!;
    expect(JSON.parse(opencode.preview!)).toEqual({ mcp: { servers: { lakar: OPENCODE_MCP } } });
    await t.app.close();
  });

  it('config berisi lakar = entri kini → installed + matches:true; entri beda → matches:false', async () => {
    const t = await setup();
    await writeFile(join(t.home, '.claude.json'), JSON.stringify({ mcpServers: { lakar: MCP } }));
    expect(await row(t, 'claude-code')).toMatchObject({ state: 'installed', installed: true, matches: true });
    await writeFile(join(t.home, '.claude.json'), JSON.stringify({ mcpServers: { lakar: { ...MCP, command: '/node/lama' } } }));
    expect(await row(t, 'claude-code')).toMatchObject({ state: 'installed', installed: true, matches: false });
    await t.app.close();
  });

  it('CLAUDE_CONFIG_DIR diset → configPath <dir>/.claude.json dan detected walau marker tak ada', async () => {
    const t = await setup({ CLAUDE_CONFIG_DIR: join(root, 'claude-dir') });
    expect(await row(t, 'claude-code')).toMatchObject({ detected: true, state: 'not-installed', configPath: join(root, 'claude-dir', '.claude.json') });
    await t.app.close();
  });

  it('CODEX_HOME / PI_CODING_AGENT_DIR menggeser file config dan menandai terdeteksi', async () => {
    const t = await setup({ CODEX_HOME: join(root, 'codex-home'), PI_CODING_AGENT_DIR: join(root, 'pi-dir') });
    expect(await row(t, 'codex')).toMatchObject({ detected: true, configPath: join(root, 'codex-home', 'config.toml') });
    expect(await row(t, 'pi')).toMatchObject({ detected: true, configPath: join(root, 'pi-dir', 'mcp.json') });
    await t.app.close();
  });

  it('non-Windows hormati XDG_CONFIG_HOME untuk opencode; marker dir ~/.config/opencode terdeteksi', async () => {
    const t = await setup({ XDG_CONFIG_HOME: join(root, 'xdg') }, 'linux');
    expect((await row(t, 'opencode')).configPath).toBe(join(root, 'xdg', 'opencode', 'opencode.json'));
    await t.app.close();
    const t2 = await setup({}, 'linux');
    await mkdir(join(t2.home, '.config', 'opencode'), { recursive: true });
    expect(await row(t2, 'opencode')).toMatchObject({ detected: true, state: 'not-installed', configPath: join(t2.home, '.config', 'opencode', 'opencode.json') });
    await t2.app.close();
  });

  it('entry MCP tidak ditemukan → GET tetap 200 dengan preview:null', async () => {
    const t = await setup({}, 'win32', join(root, 'tidak-ada.js'));
    const claude = await row(t, 'claude-code');
    expect(claude.preview).toBeNull();
    expect(claude.linesAdded).toBe(0);
    await t.app.close();
  });
});

describe('POST …/install', () => {
  it('claude-code: .bak byte-identik; mcpServers.lakar ditambah; key lain utuh', async () => {
    const t = await setup();
    const file = join(t.home, '.claude.json');
    const old = JSON.stringify({ oauth: { tok: 1 }, mcpServers: { lain: { command: 'x' } } }, null, 2);
    await writeFile(file, old);
    const r = await t.act('claude-code', 'install');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toEqual({ id: 'claude-code', state: 'installed', backup: `${file}.bak` });
    expect(await readFile(`${file}.bak`, 'utf8')).toBe(old);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ oauth: { tok: 1 }, mcpServers: { lain: { command: 'x' }, lakar: MCP } });
    expect(await row(t, 'claude-code')).toMatchObject({ state: 'installed', matches: true });
    await t.app.close();
  });

  it('claude-code terdeteksi hanya lewat marker ~/.claude → file config baru dibuat', async () => {
    const t = await setup();
    await mkdir(join(t.home, '.claude'));
    const r = await t.act('claude-code', 'install');
    expect(r.json().data).toEqual({ id: 'claude-code', state: 'installed' }); // tanpa file lama → tanpa backup
    expect(JSON.parse(await readFile(join(t.home, '.claude.json'), 'utf8'))).toEqual({ mcpServers: { lakar: MCP } });
    expect(existsSync(`${join(t.home, '.claude.json')}.bak`)).toBe(false);
    await t.app.close();
  });

  it('codex: blok [mcp_servers.lakar] lama diganti (bukan dobel), section lain utuh byte-per-byte', async () => {
    const t = await setup();
    const dir = join(t.home, '.codex');
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'config.toml');
    const old = '[model]\nx = 1\n\n[mcp_servers.lakar]\ncommand = "old"\n\n[other]\ny = 2\n';
    await writeFile(file, old);
    const r = await t.act('codex', 'install');
    expect(r.json().data.state).toBe('installed');
    const now = await readFile(file, 'utf8');
    expect(now.match(/\[mcp_servers\.lakar\]/g)).toHaveLength(1);
    expect(now.startsWith('[model]\nx = 1\n\n[other]\ny = 2\n')).toBe(true);
    expect(now).toContain(`command = ${JSON.stringify(MCP.command)}`);
    expect(now).toContain(`args = [${MCP.args.map((a) => JSON.stringify(a)).join(', ')}]`);
    expect(now).toContain('env = { LAKAR_URL = "http://127.0.0.1:7466" }');
    expect(await readFile(`${file}.bak`, 'utf8')).toBe(old);
    expect(await row(t, 'codex')).toMatchObject({ state: 'installed', matches: true });
    await t.app.close();
  });

  it('codex: sub-tabel [mcp_servers.lakar.env] juga diganti; [[array]] dan [mcp_servers.lain] utuh', async () => {
    const t = await setup();
    const dir = join(t.home, '.codex');
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'config.toml');
    await writeFile(file, '[mcp_servers.lakar]\ncommand = "old"\n\n[mcp_servers.lakar.env]\nX = "1"\n\n[[projects]]\npath = "/tmp/a"\n\n[mcp_servers.lain]\ncommand = "keep"\n');
    await t.act('codex', 'install');
    const now = await readFile(file, 'utf8');
    expect(now.match(/\[mcp_servers\.lakar\]/g)).toHaveLength(1);
    expect(now).not.toContain('[mcp_servers.lakar.env]');
    expect(now).toContain('[[projects]]\npath = "/tmp/a"');
    expect(now).toContain('[mcp_servers.lain]\ncommand = "keep"');
    await t.app.close();
  });

  it('pi: marker ~/.pi → ~/.pi/agent/mcp.json dibuat (dir baru)', async () => {
    const t = await setup();
    await mkdir(join(t.home, '.pi'));
    const r = await t.act('pi', 'install');
    expect(r.json().data.state).toBe('installed');
    expect(JSON.parse(await readFile(join(t.home, '.pi', 'agent', 'mcp.json'), 'utf8'))).toEqual({ mcpServers: { lakar: MCP } });
    await t.app.close();
  });

  it('opencode .jsonc: komentar ditoleransi; ditulis balik JSON rapi ke file yang sama; .bak simpan asli', async () => {
    const t = await setup();
    const dir = join(t.home, '.config', 'opencode');
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'opencode.jsonc');
    const old = '{\n  // tema pilihan pengguna\n  "theme": "dark",\n  /* server lain */\n  "mcp": { "servers": { "lain": { "type": "local" } } }\n}\n';
    await writeFile(file, old);
    const r = await t.act('opencode', 'install');
    expect(r.json().data.state).toBe('installed');
    expect(await readFile(`${file}.bak`, 'utf8')).toBe(old);
    const now = JSON.parse(await readFile(file, 'utf8'));
    expect(now).toEqual({ theme: 'dark', mcp: { servers: { lain: { type: 'local' }, lakar: OPENCODE_MCP } } });
    expect(existsSync(join(dir, 'opencode.json'))).toBe(false);
    await t.app.close();
  });

  it('opencode: opencode.json didahulukan dari opencode.jsonc bila keduanya ada', async () => {
    const t = await setup();
    const dir = join(t.home, '.config', 'opencode');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'opencode.json'), '{}');
    await writeFile(join(dir, 'opencode.jsonc'), '{}');
    await t.act('opencode', 'install');
    expect(JSON.parse(await readFile(join(dir, 'opencode.json'), 'utf8'))).toEqual({ mcp: { servers: { lakar: OPENCODE_MCP } } });
    expect(await readFile(join(dir, 'opencode.jsonc'), 'utf8')).toBe('{}');
    await t.app.close();
  });

  it('harness tidak terdeteksi → failed "tidak terdeteksi"; tidak membuat apa pun', async () => {
    const t = await setup();
    const r = await t.act('opencode', 'install');
    expect(r.json().data).toMatchObject({ id: 'opencode', state: 'failed' });
    expect(r.json().data.message).toContain('tidak terdeteksi');
    expect(existsSync(join(t.home, '.config', 'opencode'))).toBe(false);
    await t.app.close();
  });

  it('file JSON corrupt → failed; file asli tak berubah dan tanpa .bak', async () => {
    const t = await setup();
    const file = join(t.home, '.claude.json');
    const old = '{ bukan json';
    await writeFile(file, old);
    const r = await t.act('claude-code', 'install');
    expect(r.json().data.state).toBe('failed');
    expect(await readFile(file, 'utf8')).toBe(old);
    expect(existsSync(`${file}.bak`)).toBe(false);
    await t.app.close();
  });

  it('codex: baris kosong berturut di section lain dipertahankan byte-per-byte', async () => {
    const t = await setup();
    const dir = join(t.home, '.codex');
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'config.toml');
    const old = '[model]\nx = 1\n\n\n\n[other]\ny = 2\n';
    await writeFile(file, old);
    await t.act('codex', 'install');
    expect((await readFile(file, 'utf8')).startsWith('[model]\nx = 1\n\n\n\n[other]\ny = 2\n')).toBe(true);
    await t.app.close();
  });

  it('codex: header [mcp_servers."lakar"] quoted diganti; dotted-key → failed manual', async () => {
    const t = await setup();
    const dir = join(t.home, '.codex');
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'config.toml');
    await writeFile(file, '[mcp_servers."lakar"]\ncommand = "old"\n\n[model]\nx = 1\n');
    await t.act('codex', 'install');
    const now = await readFile(file, 'utf8');
    expect(now.match(/mcp_servers\s*\.\s*["']?lakar["']?\]/g)).toHaveLength(1);
    expect(now).toContain('[mcp_servers.lakar]');
    await t.app.close();

    // Bentuk dotted-key tidak bisa digabung blok → failed, file tidak disentuh.
    const t2 = await setup();
    const dir2 = join(t2.home, '.codex');
    await mkdir(dir2, { recursive: true });
    const file2 = join(dir2, 'config.toml');
    const old2 = 'mcp_servers.lakar.command = "old"\n\n[model]\nx = 1\n';
    await writeFile(file2, old2);
    expect(await row(t2, 'codex')).toMatchObject({ installed: true, matches: false });
    const r = await t2.act('codex', 'install');
    expect(r.json().data.state).toBe('failed');
    expect(r.json().data.message).toContain('dotted-key');
    expect(await readFile(file2, 'utf8')).toBe(old2);
    expect(existsSync(`${file2}.bak`)).toBe(false);
    await t2.app.close();
  });

  it('file config bukan UTF-8 → failed; byte asli utuh dan tanpa .bak', async () => {
    const t = await setup();
    const dir = join(t.home, '.codex');
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'config.toml');
    const bad = Buffer.from([0xff, 0xfe, 0x5b, 0x61, 0x5d]);
    await writeFile(file, bad);
    const r = await t.act('codex', 'install');
    expect(r.json().data.state).toBe('failed');
    expect(r.json().data.message).toContain('UTF-8');
    expect(await readFile(file)).toEqual(bad);
    expect(existsSync(`${file}.bak`)).toBe(false);
    await t.app.close();
  });

  it.skipIf(process.platform === 'win32')('mode file asli (0600) dipertahankan di config + .bak', async () => {
    const t = await setup();
    const file = join(t.home, '.claude.json');
    await writeFile(file, '{"oauth":{"tok":1}}');
    await chmod(file, 0o600);
    const r = await t.act('claude-code', 'install');
    expect(r.json().data.state).toBe('installed');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(`${file}.bak`)).mode & 0o777).toBe(0o600);
    await t.app.close();
  });

  it('entry MCP tidak ditemukan → failed "entry MCP tidak ditemukan"', async () => {
    const t = await setup({}, 'win32', join(root, 'tidak-ada.js'));
    await mkdir(join(t.home, '.claude'));
    const r = await t.act('claude-code', 'install');
    expect(r.json().data).toMatchObject({ id: 'claude-code', state: 'failed' });
    expect(r.json().data.message).toContain('entry MCP tidak ditemukan');
    await t.app.close();
  });
});

describe('POST …/uninstall dan revert', () => {
  it('uninstall pada installed → entri lakar dihapus, .bak dibuat, state not-installed', async () => {
    const t = await setup();
    const file = join(t.home, '.claude.json');
    const old = JSON.stringify({ keep: 1, mcpServers: { lakar: MCP, lain: {} } });
    await writeFile(file, old);
    const r = await t.act('claude-code', 'uninstall');
    expect(r.json().data).toEqual({ id: 'claude-code', state: 'not-installed', backup: `${file}.bak` });
    expect(await readFile(`${file}.bak`, 'utf8')).toBe(old);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ keep: 1, mcpServers: { lain: {} } });
    await t.app.close();
  });

  it('uninstall tanpa entri lakar → not-installed tanpa menulis; file corrupt → failed', async () => {
    const t = await setup();
    const file = join(t.home, '.claude.json');
    await writeFile(file, '{"mcpServers":{}}');
    expect((await t.act('claude-code', 'uninstall')).json().data.state).toBe('not-installed');
    expect(await readFile(file, 'utf8')).toBe('{"mcpServers":{}}');
    expect(existsSync(`${file}.bak`)).toBe(false);
    await writeFile(file, '{ rusak');
    expect((await t.act('claude-code', 'uninstall')).json().data.state).toBe('failed');
    await t.app.close();
  });

  it('uninstall codex: hanya blok lakar yang hilang', async () => {
    const t = await setup();
    const dir = join(t.home, '.codex');
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'config.toml');
    await writeFile(file, '[mcp_servers.lakar]\ncommand = "x"\n\n[model]\nx = 1\n');
    expect((await t.act('codex', 'uninstall')).json().data.state).toBe('not-installed');
    expect(await readFile(file, 'utf8')).toBe('[model]\nx = 1\n');
    await t.app.close();
  });

  it('revert memulihkan .bak byte-identik ke path asli; tanpa .bak → restored:false', async () => {
    const t = await setup();
    const file = join(t.home, '.claude.json');
    const old = '{"mcpServers":{}}';
    await writeFile(file, old);
    await t.act('claude-code', 'install');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ mcpServers: { lakar: MCP } });
    const r = await t.act('claude-code', 'revert');
    expect(r.json().data).toEqual({ id: 'claude-code', restored: true });
    expect(await readFile(file, 'utf8')).toBe(old);
    // .bak dihapus setelah restore sukses: revert berikutnya tidak menerapkan backup basi.
    expect(existsSync(`${file}.bak`)).toBe(false);
    await t.app.close();

    const t2 = await setup();
    expect((await t2.act('claude-code', 'revert')).json().data).toEqual({ id: 'claude-code', restored: false });
    await t2.app.close();
  });

  it('revert tanpa .bak: file buatan install (hanya lakar) dihapus → restored:true', async () => {
    const t = await setup();
    await mkdir(join(t.home, '.claude'));
    await t.act('claude-code', 'install');
    const file = join(t.home, '.claude.json');
    expect(existsSync(`${file}.bak`)).toBe(false);
    const r = await t.act('claude-code', 'revert');
    expect(r.json().data).toEqual({ id: 'claude-code', restored: true });
    expect(existsSync(file)).toBe(false);
    await t.app.close();
  });

  it('revert tanpa .bak: file dengan isi selain lakar dibiarkan → restored:false', async () => {
    const t = await setup();
    const file = join(t.home, '.claude.json');
    const old = JSON.stringify({ keep: 1, mcpServers: { lakar: MCP, lain: {} } });
    await writeFile(file, old);
    expect((await t.act('claude-code', 'revert')).json().data).toEqual({ id: 'claude-code', restored: false });
    expect(await readFile(file, 'utf8')).toBe(old);
    await t.app.close();
  });

  it('codex: header tabel ber-key arbitrer ([projects."/x"]) mengakhiri blok lakar — tidak ikut terhapus', async () => {
    const t = await setup();
    const dir = join(t.home, '.codex');
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'config.toml');
    const old = '[mcp_servers.lakar]\ncommand = "x"\n\n[projects."/home/user/app"]\ntrust = true\n';
    await writeFile(file, old);
    expect((await t.act('codex', 'uninstall')).json().data.state).toBe('not-installed');
    expect(await readFile(file, 'utf8')).toBe('[projects."/home/user/app"]\ntrust = true\n');
    await t.app.close();
  });

  it('codex: entri lakar inline-table → installed:true; install/uninstall failed manual, file utuh', async () => {
    const t = await setup();
    const dir = join(t.home, '.codex');
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'config.toml');
    const old = '[mcp_servers]\nlakar = { command = "old" }\n\n[model]\nx = 1\n';
    await writeFile(file, old);
    expect(await row(t, 'codex')).toMatchObject({ installed: true, matches: false });
    expect((await t.act('codex', 'install')).json().data.state).toBe('failed');
    expect((await t.act('codex', 'uninstall')).json().data.state).toBe('failed');
    expect(await readFile(file, 'utf8')).toBe(old);
    expect(existsSync(`${file}.bak`)).toBe(false);
    await t.app.close();

    const t2 = await setup();
    const dir2 = join(t2.home, '.codex');
    await mkdir(dir2, { recursive: true });
    const file2 = join(dir2, 'config.toml');
    const old2 = 'mcp_servers = { lakar = { command = "old" } }\n';
    await writeFile(file2, old2);
    expect(await row(t2, 'codex')).toMatchObject({ installed: true, matches: false });
    expect((await t2.act('codex', 'install')).json().data.state).toBe('failed');
    await t2.app.close();
  });

  it('codex dotted-key → uninstall failed; entri tidak disentuh', async () => {
    const t = await setup();
    const dir = join(t.home, '.codex');
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'config.toml');
    const old = 'mcp_servers.lakar.command = "x"\n\n[model]\nx = 1\n';
    await writeFile(file, old);
    const r = await t.act('codex', 'uninstall');
    expect(r.json().data.state).toBe('failed');
    expect(await readFile(file, 'utf8')).toBe(old);
    expect(existsSync(`${file}.bak`)).toBe(false);
    await t.app.close();
  });
});

describe('POST …/reveal', () => {
  it('file ada → opened:true dan file manager OS dipanggil; tak ada → opened:false', async () => {
    const t = await setup();
    const file = join(t.home, '.claude.json');
    await writeFile(file, '{}');
    expect((await t.act('claude-code', 'reveal')).json().data).toEqual({ id: 'claude-code', opened: true });
    expect(t.revealed).toEqual([file]);
    const t2 = await setup();
    expect((await t2.act('claude-code', 'reveal')).json().data).toEqual({ id: 'claude-code', opened: false });
    expect(t2.revealed).toEqual([]);
    await t.app.close();
    await t2.app.close();
  });
});

describe('input tidak dikenal / harness manual', () => {
  it('id tak dikenal → 400; install/uninstall other → 400; revert/reveal other → 200 false', async () => {
    const t = await setup();
    expect((await t.act('bukan', 'install')).statusCode).toBe(400);
    expect((await t.act('other', 'install')).statusCode).toBe(400);
    expect((await t.act('other', 'uninstall')).statusCode).toBe(400);
    expect((await t.act('other', 'revert')).json().data).toEqual({ id: 'other', restored: false });
    expect((await t.act('other', 'reveal')).json().data).toEqual({ id: 'other', opened: false });
    await t.app.close();
  });

  it('POST lintas-origin → 403 oleh guard Origin yang ada', async () => {
    const { app } = buildServer({ config: { ...baseConfig, port: 0, dataDir: join(root, 'd-origin') }, render: noRender });
    const r = await app.inject({ method: 'POST', url: '/viewer/connections/harnesses/claude-code/install', headers: { origin: 'http://evil.example' } });
    expect(r.statusCode).toBe(403);
    expect(r.json().ok).toBe(false);
    await app.close();
  });
});

describe('stripJsonComments', () => {
  it('komentar // dan /* */ di luar string dibuang; // di dalam string utuh', () => {
    const src = '{\n// a\n"x": "http://u", /* b */ "y": "/*c*/",\n"z": 1 // t\n}';
    expect(JSON.parse(stripJsonComments(src))).toEqual({ x: 'http://u', y: '/*c*/', z: 1 });
  });
});
