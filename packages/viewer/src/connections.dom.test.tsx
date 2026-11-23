// Halaman Connections → "Install in an agent" (story 8.11): baris per harness dengan 5 state, dialog Confirm
// (path + "Adds N lines" + pratinjau) → POST install → pill Installed + toast Undo (revert + Rescan), baris
// Failed bila install gagal, menu More (Open config file / Remove), dan dialog Manual setup berisi Setup Card.
// Daemon diganti `dom().daemon` (FakeDaemon) per route.
import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Connections } from './Connections';
import { dom, renderUi } from './test/dom';

const MCP = { command: '/fake/node', args: ['/mcp/main.js'], env: { LAKAR_URL: 'http://127.0.0.1:7466' } };

type Row = {
  id: string;
  label: string;
  state: string;
  configPath: string | null;
  detected: boolean;
  installed: boolean;
  matches: boolean;
  format: string;
  preview: string | null;
  linesAdded: number;
};

const row = (id: string, label: string, p: Partial<Row> = {}): Row => ({
  id,
  label,
  state: 'not-installed',
  configPath: `/home/u/.config/${id}.json`,
  detected: true,
  installed: false,
  matches: false,
  format: 'json',
  preview: `{ "mcpServers": { "lakar": { "command": "node" } } }`,
  linesAdded: 7,
  ...p,
});

const ROWS: Row[] = [
  row('claude-code', 'Claude Code'),
  row('codex', 'Codex', { state: 'installed', installed: true, matches: true, configPath: '/home/u/.codex/config.toml', format: 'toml', preview: '[mcp_servers.lakar]' }),
  row('pi', 'Pi', { state: 'not-found', detected: false, preview: null, linesAdded: 0 }),
  row('opencode', 'OpenCode', { state: 'not-found', detected: false, preview: null, linesAdded: 0 }),
  row('other', 'Other MCP client', { state: 'manual', configPath: null, detected: false, format: 'manual', preview: null, linesAdded: 0 }),
];

/** Daemon tiruan untuk halaman Connections; `rows`/`installResult` bisa diganti per tes. */
function daemon(opts: { rows?: Row[]; installResult?: unknown; revertResult?: unknown; uninstallResult?: unknown; revealResult?: unknown } = {}) {
  const d = dom().daemon;
  d.on('GET', '/viewer/connections', () => ({ url: 'http://127.0.0.1:7466', mcp: MCP }));
  d.on('GET', '/status', () => ({ version: '0.0.0-test', host: '127.0.0.1', port: 7466, dataDir: '/data', node: 'v26.5.0', pool: { size: 1, ready: 1 } }));
  d.on('GET', '/viewer/connections/harnesses', () => ({ harnesses: opts.rows ?? ROWS }));
  d.on('POST', /^\/viewer\/connections\/harnesses\/([^/]+)\/install$/, (_req, m) => opts.installResult ?? { id: m[1], state: 'installed', backup: '/home/u/.config/claude-code.json.bak' });
  d.on('POST', /^\/viewer\/connections\/harnesses\/([^/]+)\/uninstall$/, (_req, m) => opts.uninstallResult ?? { id: m[1], state: 'not-installed' });
  d.on('POST', /^\/viewer\/connections\/harnesses\/([^/]+)\/revert$/, (_req, m) => opts.revertResult ?? { id: m[1], restored: true });
  d.on('POST', /^\/viewer\/connections\/harnesses\/([^/]+)\/reveal$/, (_req, m) => opts.revealResult ?? { id: m[1], opened: true });
  return d;
}

const posts = (action: string) => dom().daemon.find('POST', new RegExp(`^/viewer/connections/harnesses/[^/]+/${action}$`));
const scans = () => dom().daemon.find('GET', '/viewer/connections/harnesses');

async function loaded() {
  await waitFor(() => expect(document.querySelector('.conn-install')).not.toBeNull());
}

describe('Install in an agent — baris state', () => {
  it('satu baris per harness: pill + aksi per state, Install nonaktif untuk Not found', async () => {
    daemon();
    renderUi(<Connections />);
    await loaded();
    const rows = [...document.querySelectorAll('.conn-install')];
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.querySelector('.conn-install-title strong')!.textContent)).toEqual(['Claude Code', 'Codex', 'Pi', 'OpenCode', 'Other MCP client']);
    const pillText = (r: Element) => r.querySelector('.status-pill')?.textContent ?? '';
    expect(pillText(rows[0]!)).toBe('Not installed');
    expect(pillText(rows[1]!)).toBe('Installed');
    expect(pillText(rows[2]!)).toBe('Not found');
    expect(pillText(rows[4]!)).toBe(''); // manual: tanpa pill
    // not-found: hint + Install nonaktif (opacity .35 via disabled).
    expect(rows[2]!.querySelector('.conn-install-sub')!.textContent).toBe('Install Pi on this computer, then Rescan.');
    const disabledInstall = rows[2]!.querySelector<HTMLButtonElement>('.conn-install-actions .btn')!;
    expect(disabledInstall).toBeDisabled();
    // installed: Reinstall + tombol More.
    expect([...rows[1]!.querySelectorAll('button')].map((b) => b.textContent)).toContain('Reinstall');
    expect(rows[4]!.querySelector('button')!.textContent).toBe('Set up manually');
  });
});

describe('Install in an agent — alur', () => {
  it('Install → dialog Confirm (path, "Adds N lines", pratinjau) → POST → pill Installed + toast Undo → revert + Rescan', async () => {
    const d = daemon();
    const { user } = renderUi(<Connections />);
    await loaded();
    await user.click([...document.querySelectorAll('.conn-install')][0]!.querySelector('button.btn')!);
    // Dialog Confirm: label dialog, path file, badge baris, pratinjau, catatan backup.
    const dialog = await waitFor(() => document.querySelector('[role="dialog"]'));
    expect(dialog!.getAttribute('aria-label')).toBe('Install in Claude Code');
    expect(dialog!.querySelector('.conn-confirm-path')!.textContent).toBe('/home/u/.config/claude-code.json');
    expect(dialog!.querySelector('.conn-lines')!.textContent).toBe('Adds 7 lines');
    expect(dialog!.querySelector('code')!.textContent).toContain('mcpServers');
    expect(dialog!.textContent).toContain('.bak');
    await user.click([...dialog!.querySelectorAll('button')].find((b) => b.textContent === 'Install')!);
    await waitFor(() => expect(posts('install')).toHaveLength(1));
    expect(posts('install')[0]!.path).toBe('/viewer/connections/harnesses/claude-code/install');
    // Baris jadi Installed + toast dengan Undo.
    await waitFor(() => expect(document.querySelectorAll('.conn-install')[0]!.querySelector('.status-pill')!.textContent).toBe('Installed'));
    const toast = document.querySelector('.toast')!;
    expect(toast.textContent).toContain('Installed in Claude Code');
    const undo = [...toast.querySelectorAll('button')].find((b) => b.textContent === 'Undo')!;
    await user.click(undo);
    await waitFor(() => expect(posts('revert')).toHaveLength(1));
    await waitFor(() => expect(scans().length).toBeGreaterThanOrEqual(2)); // Rescan sesudah revert
    await waitFor(() => expect(document.querySelectorAll('.conn-install')[0]!.querySelector('.status-pill')!.textContent).toBe('Not installed'));
    void d;
  });

  it('install gagal → baris Failed: pesan + "Nothing was changed." + Set up manually/Try again', async () => {
    daemon({ installResult: { id: 'claude-code', state: 'failed', message: 'file config bukan JSON valid' } });
    const { user } = renderUi(<Connections />);
    await loaded();
    await user.click([...document.querySelectorAll('.conn-install')][0]!.querySelector('button.btn')!);
    const dialog = await waitFor(() => document.querySelector('[role="dialog"]'));
    await user.click([...dialog!.querySelectorAll('button')].find((b) => b.textContent === 'Install')!);
    const claudeRow = await waitFor(() => {
      const r = [...document.querySelectorAll('.conn-install')][0]!;
      expect(r.querySelector('.status-pill')!.textContent).toBe('Failed');
      return r;
    });
    expect(claudeRow.querySelector('.conn-install-sub')!.textContent).toContain('file config bukan JSON valid');
    expect(claudeRow.querySelector('.conn-install-sub')!.textContent).toContain('Nothing was changed.');
    expect([...claudeRow.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Set up manually', 'Try again']);
  });

  it('menu More pada baris Installed: Open config file → POST reveal; Remove → POST uninstall', async () => {
    daemon();
    const { user } = renderUi(<Connections />);
    await loaded();
    const codexRow = document.querySelectorAll('.conn-install')[1]!;
    await user.click(codexRow.querySelector('button.icon-btn')!);
    const menu = await waitFor(() => document.querySelector('[role="menu"]'));
    await user.click([...menu!.querySelectorAll('button')].find((b) => b.textContent?.includes('Open config file'))!);
    await waitFor(() => expect(posts('reveal')).toHaveLength(1));
    // Remove: buka menu lagi lalu klik item Remove.
    await user.click(codexRow.querySelector('button.icon-btn')!);
    const menu2 = await waitFor(() => document.querySelector('[role="menu"]'));
    await user.click([...menu2!.querySelectorAll('button')].find((b) => b.textContent?.includes('Remove'))!);
    await waitFor(() => expect(posts('uninstall')).toHaveLength(1));
    await waitFor(() => expect(document.querySelectorAll('.conn-install')[1]!.querySelector('.status-pill')!.textContent).toBe('Not installed'));
  });

  it('Set up manually → dialog Manual setup berisi tab harness + snippet (Setup Card lama)', async () => {
    daemon();
    const { user } = renderUi(<Connections />);
    await loaded();
    await user.click([...document.querySelectorAll('.conn-install')][4]!.querySelector('button')!);
    const dialog = await waitFor(() => document.querySelector('[role="dialog"]'));
    expect(dialog!.getAttribute('aria-label')).toBe('Manual setup');
    expect([...dialog!.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['Claude Code', 'Codex', 'Pi', 'OpenCode', 'Other MCP client']);
    expect(dialog!.querySelector('code')!.textContent).toContain('mcpServers');
    expect(dialog!.querySelector('code')!.textContent).toContain('LAKAR_URL');
  });

  it('Rescan memanggil ulang GET /viewer/connections/harnesses', async () => {
    daemon();
    const { user } = renderUi(<Connections />);
    await loaded();
    const before = scans().length;
    await user.click([...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Rescan'))!);
    await waitFor(() => expect(scans().length).toBeGreaterThan(before));
  });
});
