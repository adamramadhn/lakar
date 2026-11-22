// Snippet config MCP per harness (halaman Connections): path Windows dengan backslash dan spasi tetap utuh.
import { describe, expect, it } from 'vitest';
import { HARNESSES, nonDefaultPort, type McpServerConfig } from './harnesses.ts';

const mcp: McpServerConfig = {
  command: 'C:\\Program Files\\Lakar\\lakar-node.exe',
  args: ['C:\\Users\\Budi Santoso\\AppData\\Local\\Lakar\\resources\\mcp\\dist\\main.js'],
  env: { LAKAR_URL: 'http://127.0.0.1:7467' },
};

const snippet = (id: string) => HARNESSES.find((h) => h.id === id)!.snippet(mcp);

describe('snippet harness', () => {
  it.each(['claude-code', 'gemini'])('%s: JSON → mcpServers.lakar {command, args, env} persis', (id) => {
    expect(JSON.parse(snippet(id))).toEqual({ mcpServers: { lakar: { command: mcp.command, args: mcp.args, env: { LAKAR_URL: 'http://127.0.0.1:7467' } } } });
  });

  it('codex: TOML dengan backslash di-escape', () => {
    expect(snippet('codex').split('\n')).toEqual([
      '[mcp_servers.lakar]',
      'command = "C:\\\\Program Files\\\\Lakar\\\\lakar-node.exe"',
      'args = ["C:\\\\Users\\\\Budi Santoso\\\\AppData\\\\Local\\\\Lakar\\\\resources\\\\mcp\\\\dist\\\\main.js"]',
      'env = { LAKAR_URL = "http://127.0.0.1:7467" }',
    ]);
  });

  it('ACP: daftar server dengan env [{name, value}]', () => {
    expect(JSON.parse(snippet('acp'))).toEqual([{ name: 'lakar', command: mcp.command, args: mcp.args, env: [{ name: 'LAKAR_URL', value: 'http://127.0.0.1:7467' }] }]);
  });

  it('semua harness punya id unik', () => {
    expect(new Set(HARNESSES.map((h) => h.id)).size).toBe(HARNESSES.length);
  });
});

describe('nonDefaultPort', () => {
  it('7466 → null; port lain → nomornya; URL rusak → null', () => {
    expect(nonDefaultPort('http://127.0.0.1:7466')).toBeNull();
    expect(nonDefaultPort('http://127.0.0.1:7467')).toBe(7467);
    expect(nonDefaultPort('bukan url')).toBeNull();
  });
});
