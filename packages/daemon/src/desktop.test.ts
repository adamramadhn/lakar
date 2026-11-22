// Opsi daemon untuk aplikasi desktop (sidecar): browser_channel, viewer_dir, mcp_entry, GET /viewer/connections,
// LAKAR_EXIT_ON_STDIN_CLOSE. Peluncuran browser memakai launcher palsu, kecuali tes alur startDaemon → channel yang
// memakai Chrome sistem bila ada (lulus juga tanpa Chrome: harus pesan "Chrome atau Edge tidak ditemukan").
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSER_NOT_FOUND,
  BrowserLaunchError,
  DEFAULT_MCP_ENTRY,
  RenderPool,
  browserCandidates,
  buildServer,
  launchSystemBrowser,
  loadConfig,
  resolveMcpEntry,
  startDaemon,
} from './index.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const noRender = { screenshot: async () => new Uint8Array(), measure: async () => ({}) } as never;

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-desktop-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('config desktop', () => {
  it('tanpa env baru → default lama (tanpa channel, viewerDir, mcpEntry)', () => {
    const c = loadConfig({});
    expect(c.browserChannel).toBeUndefined();
    expect(c.viewerDir).toBeUndefined();
    expect(c.mcpEntry).toBeUndefined();
    expect(loadConfig({ LAKAR_BROWSER_CHANNEL: '' }).browserChannel).toBeUndefined();
  });

  it('LAKAR_BROWSER_CHANNEL chrome|msedge|auto diterima; nilai lain → Error berisi nilai valid', () => {
    for (const v of ['chrome', 'msedge', 'auto'] as const) expect(loadConfig({ LAKAR_BROWSER_CHANNEL: v }).browserChannel).toBe(v);
    expect(() => loadConfig({ LAKAR_BROWSER_CHANNEL: 'firefox' })).toThrow(/LAKAR_BROWSER_CHANNEL tidak valid: "firefox".*chrome, msedge, auto/);
  });

  it('LAKAR_VIEWER_DIR dan LAKAR_MCP_ENTRY', () => {
    const c = loadConfig({ LAKAR_VIEWER_DIR: '/x/viewer', LAKAR_MCP_ENTRY: '/x/mcp/main.js' });
    expect(c.viewerDir).toBe('/x/viewer');
    expect(c.mcpEntry).toBe('/x/mcp/main.js');
  });

  it('config.toml: browser_channel, viewer_dir, mcp_entry; env menang', async () => {
    const file = join(root, 'config.toml');
    await writeFile(file, 'browser_channel = "msedge"\nviewer_dir = "/v"\nmcp_entry = "/m.js"\n');
    expect(loadConfig({ LAKAR_CONFIG: file })).toMatchObject({ browserChannel: 'msedge', viewerDir: '/v', mcpEntry: '/m.js' });
    expect(loadConfig({ LAKAR_CONFIG: file, LAKAR_BROWSER_CHANNEL: 'chrome' }).browserChannel).toBe('chrome');
    await writeFile(file, 'browser_channel = ""\n');
    expect(loadConfig({ LAKAR_CONFIG: file }).browserChannel).toBeUndefined();
    await writeFile(file, 'browser_channel = "safari"\n');
    expect(() => loadConfig({ LAKAR_CONFIG: file })).toThrow(/browser_channel tidak valid/);
  });
});

describe('browser sistem', () => {
  it('urutan kandidat: chrome/msedge tunggal; auto → Chrome → Edge → (Linux) chromium sistem yang ada', () => {
    expect(browserCandidates('chrome').map((c) => c.channel)).toEqual(['chrome']);
    expect(browserCandidates('msedge').map((c) => c.channel)).toEqual(['msedge']);
    expect(browserCandidates('auto', 'win32').map((c) => c.channel)).toEqual(['chrome', 'msedge']);
    const linux = browserCandidates('auto', 'linux', (p) => p === '/usr/bin/chromium-browser');
    expect(linux.map((c) => c.channel ?? c.executablePath)).toEqual(['chrome', 'msedge', '/usr/bin/chromium-browser']);
  });

  const notFound = (name: string) => new Error(`browserType.launch: Chromium distribution '${name}' is not found at C:\\x\\${name}.exe\nRun "npx playwright install ${name}"`);
  const fakeBrowser = { isConnected: () => true, version: () => 'tiruan', on: () => {}, close: async () => {} } as never;

  it('auto: Chrome tidak ada → Edge dipakai', async () => {
    const tried: string[] = [];
    const b = await launchSystemBrowser(
      async (o) => {
        tried.push(o.channel ?? o.executablePath ?? '');
        if (o.channel === 'chrome') throw notFound('chrome');
        return fakeBrowser;
      },
      browserCandidates('auto', 'win32'),
      { headless: true },
      'auto',
    );
    expect(b).toBe(fakeBrowser);
    expect(tried).toEqual(['chrome', 'msedge']);
  });

  it('tidak ada Chrome/Edge → BrowserLaunchError "Chrome atau Edge tidak ditemukan"', async () => {
    const err = await launchSystemBrowser(async (o) => Promise.reject(notFound(o.channel!)), browserCandidates('auto', 'win32'), {}, 'auto').catch((e) => e);
    expect(err).toBeInstanceOf(BrowserLaunchError);
    expect(err.message.startsWith(BROWSER_NOT_FOUND)).toBe(true);
    expect(err.message).toContain('Chrome atau Edge tidak ditemukan');
    expect(err.message).not.toContain('\n');
  });

  it('terpasang tapi gagal jalan → pesan berbeda dengan alasan', async () => {
    const err = await launchSystemBrowser(
      async (o) => Promise.reject(o.channel === 'chrome' ? new Error('Target page, context or browser has been closed\nlog...') : notFound('msedge')),
      browserCandidates('auto', 'win32'),
      {},
      'auto',
    ).catch((e) => e);
    expect(err).toBeInstanceOf(BrowserLaunchError);
    expect(err.message).toMatch(/^Chrome\/Edge gagal dijalankan .*Google Chrome: Target page.*Microsoft Edge: tidak terpasang/);
  });

  it('pool: BrowserLaunchError → lastError = pesan apa adanya (tanpa awalan)', async () => {
    const pool = new RenderPool({
      size: 2,
      timeoutMs: 1000,
      launch: async () => {
        throw new BrowserLaunchError(`${BROWSER_NOT_FOUND} (dicoba: Google Chrome)`);
      },
      openPage: async () => {
        throw new Error('tidak dipanggil');
      },
    });
    await pool.warm();
    expect(pool.status()).toMatchObject({ ready: 0, lastError: `${BROWSER_NOT_FOUND} (dicoba: Google Chrome)` });
    await pool.close();
  });
});

describe('alur channel: config → startDaemon → ChromiumRenderer → browser sistem', () => {
  it('browserChannel chrome: pool siap (Chrome ada) ATAU lastError diawali BROWSER_NOT_FOUND; bukan jalur headless-shell', async () => {
    const dataDir = join(root, 'flow-data');
    const browsersPath = join(root, 'flow-empty-browsers');
    await mkdir(browsersPath, { recursive: true });
    const d = await startDaemon({ ...baseConfig, port: 0, dataDir, browsersPath, renderPages: 2, renderTimeoutMs: 20_000, browserChannel: 'chrome' });
    try {
      await d.warmed;
      const st = d.renderer.status();
      if (st.ready !== st.size) expect(st.lastError?.startsWith(BROWSER_NOT_FOUND), st.lastError).toBe(true);
      expect(st.lastError ?? '').not.toContain('browser gagal dijalankan');
    } finally {
      await d.close();
    }
  }, 60_000);
});

describe('host desktop (Rust)', () => {
  it('NO_BROWSER_MARKER di apps/desktop/src-tauri/src/main.rs sama dengan BROWSER_NOT_FOUND', async () => {
    const mainRs = await readFile(fileURLToPath(new URL('../../../apps/desktop/src-tauri/src/main.rs', import.meta.url)), 'utf8');
    expect(mainRs).toContain(`NO_BROWSER_MARKER: &str = "${BROWSER_NOT_FOUND}"`);
  });
});

describe('GET /viewer/connections', () => {
  it('default (repo): url + mcp {command: node daemon, args: [packages/mcp/dist/main.js], env.LAKAR_URL}', async () => {
    const { app } = buildServer({ config: { ...baseConfig, port: 7466, dataDir: join(root, 'd1') }, render: noRender });
    const res = await app.inject({ method: 'GET', url: '/viewer/connections' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const expectedEntry = resolveMcpEntry(undefined);
    expect(body).toEqual({
      ok: true,
      data: {
        url: 'http://127.0.0.1:7466',
        mcp: expectedEntry ? { command: process.execPath, args: [expectedEntry], env: { LAKAR_URL: 'http://127.0.0.1:7466' } } : null,
      },
    });
    expect(DEFAULT_MCP_ENTRY).toBe(resolve(fileURLToPath(new URL('../../mcp/dist/main.js', import.meta.url))));
    await app.close();
  });

  it('mcp_entry diset + ada → dipakai; tidak ada → mcp null', async () => {
    const entry = join(root, 'main.js');
    await writeFile(entry, '');
    const a = buildServer({ config: { ...baseConfig, port: 0, dataDir: join(root, 'd2'), mcpEntry: entry }, render: noRender }).app;
    expect((await a.inject({ method: 'GET', url: '/viewer/connections' })).json().data.mcp).toEqual({ command: process.execPath, args: [entry], env: { LAKAR_URL: 'http://127.0.0.1:0' } });
    await a.close();
    const b = buildServer({ config: { ...baseConfig, port: 0, dataDir: join(root, 'd3'), mcpEntry: join(root, 'tidak-ada.js') }, render: noRender }).app;
    expect((await b.inject({ method: 'GET', url: '/viewer/connections' })).json().data.mcp).toBeNull();
    await b.close();
  });

  it('setelah listen: url memakai port sebenarnya', async () => {
    const { app } = buildServer({ config: { ...baseConfig, port: 0, dataDir: join(root, 'd4') }, render: noRender });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const port = (app.server.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/viewer/connections`);
    const body = (await res.json()) as { data: { url: string; mcp: { env: { LAKAR_URL: string } } | null } };
    expect(body.data.url).toBe(`http://127.0.0.1:${port}`);
    if (body.data.mcp) expect(body.data.mcp.env.LAKAR_URL).toBe(`http://127.0.0.1:${port}`);
    await app.close();
  });
});

describe('lakard main: LAKAR_EXIT_ON_STDIN_CLOSE', () => {
  const mainJs = fileURLToPath(new URL('../dist/main.js', import.meta.url));

  it('stdin ditutup → berhenti bersih (exit 0)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'lakar-main-'));
    const child = spawn(process.execPath, [mainJs], {
      env: { ...process.env, LAKAR_PORT: '0', LAKAR_DATA_DIR: tmp, LAKAR_EXIT_ON_STDIN_CLOSE: '1', LAKAR_BROWSERS_PATH: join(tmp, 'no-browser') },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    try {
      let out = '';
      await new Promise<void>((res, rej) => {
        child.stdout.on('data', (c: Buffer) => {
          out += c.toString();
          if (out.includes('mendengarkan http://127.0.0.1:')) res();
        });
        child.on('exit', () => rej(new Error('keluar sebelum listen')));
      });
      const exited = new Promise<number | null>((r) => child.on('exit', r));
      child.stdin.end();
      expect(await exited).toBe(0);
      expect(out).toContain('stdin ditutup');
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await rm(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  it('LAKAR_BROWSER_CHANNEL tidak valid → exit 1 dengan nilai valid', async () => {
    const child = spawn(process.execPath, [mainJs], { env: { ...process.env, LAKAR_BROWSER_CHANNEL: 'firefox' } });
    let stderr = '';
    child.stderr.on('data', (c) => (stderr += c));
    expect(await new Promise<number | null>((r) => child.on('exit', r))).toBe(1);
    expect(stderr).toMatch(/LAKAR_BROWSER_CHANNEL tidak valid.*chrome, msedge, auto/);
  });
});
