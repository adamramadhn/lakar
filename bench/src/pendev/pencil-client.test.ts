import { describe, expect, it } from 'vitest';
import type { Transport } from '@modelcontextprotocol/client';
import { PencilClient, type StdioServerConfig } from './pencil-client.js';

const CFG: StdioServerConfig = { type: 'stdio', command: '/nonexistent/pencil-mcp', args: [], env: {} };

describe('PencilClient.connect', () => {
  it('transport gagal start → transport ditutup, error asli dilempar ulang', async () => {
    let closed = 0;
    const fake: Transport = {
      start: async () => {
        throw new Error('spawn pencil gagal');
      },
      send: async () => {},
      close: async () => {
        closed++;
      },
    };
    await expect(PencilClient.connect(CFG, () => fake)).rejects.toThrow('spawn pencil gagal');
    expect(closed).toBeGreaterThanOrEqual(1);
  });

  it('command tidak ada (transport stdio asli) → connect menolak tanpa menggantung', async () => {
    await expect(PencilClient.connect(CFG)).rejects.toThrow();
  });
});
