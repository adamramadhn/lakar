// Snippet config MCP per harness (dialog Manual setup di Connections): path Windows dengan backslash dan spasi
// tetap utuh. Daftar harness mengikuti tabel deteksi daemon (packages/daemon/src/harnesses.ts): claude-code,
// codex, pi, opencode, other — format snippet per format file config harness itu.
// Bentuk config aplikasi desktop Windows: `command` = salinan Node MCP di app-data (di luar direktori instalasi,
// agar sesi agen tidak mengunci installer), `args` = server MCP di direktori instalasi.
import { describe, expect, it } from 'vitest';
import { HARNESSES, MCP_TOOLS, nonDefaultPort, type McpServerConfig } from './harnesses.ts';

const mcp: McpServerConfig = {
  command: 'C:\\Users\\Budi Santoso\\AppData\\Local\\id.lakar.desktop\\mcp\\lakar-node.exe',
  args: ['C:\\Users\\Budi Santoso\\AppData\\Local\\Lakar\\resources\\sidecar\\mcp\\dist\\main.js'],
  env: { LAKAR_URL: 'http://127.0.0.1:7467' },
};

const snippet = (id: string) => HARNESSES.find((h) => h.id === id)!.snippet(mcp);

describe('snippet harness', () => {
  it.each(['claude-code', 'pi', 'other'])('%s: JSON → mcpServers.lakar {command, args, env} persis', (id) => {
    expect(JSON.parse(snippet(id))).toEqual({ mcpServers: { lakar: { command: mcp.command, args: mcp.args, env: { LAKAR_URL: 'http://127.0.0.1:7467' } } } });
  });

  it('codex: TOML dengan backslash di-escape', () => {
    expect(snippet('codex').split('\n')).toEqual([
      '[mcp_servers.lakar]',
      'command = "C:\\\\Users\\\\Budi Santoso\\\\AppData\\\\Local\\\\id.lakar.desktop\\\\mcp\\\\lakar-node.exe"',
      'args = ["C:\\\\Users\\\\Budi Santoso\\\\AppData\\\\Local\\\\Lakar\\\\resources\\\\sidecar\\\\mcp\\\\dist\\\\main.js"]',
      'env = { LAKAR_URL = "http://127.0.0.1:7467" }',
    ]);
  });

  it('opencode: JSON → mcp.servers.lakar {type:"local", command:[cmd,...args], environment}', () => {
    expect(JSON.parse(snippet('opencode'))).toEqual({
      mcp: {
        servers: {
          lakar: {
            type: 'local',
            command: [mcp.command, ...mcp.args],
            environment: { LAKAR_URL: 'http://127.0.0.1:7467' },
          },
        },
      },
    });
  });

  it('daftar tool MCP memuat list_documents dan paste', () => {
    expect(MCP_TOOLS).toContain('list_documents');
    expect(MCP_TOOLS).toContain('paste');
    expect(MCP_TOOLS).toContain('visual_diff');
  });

  it('lima harness dengan id unik, diakhiri fallback manual "other"', () => {
    expect(HARNESSES.map((h) => h.id)).toEqual(['claude-code', 'codex', 'pi', 'opencode', 'other']);
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
