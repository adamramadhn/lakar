// Kolom Last agent dan Checks List view Dashboard (aplikasi 11): fungsi murni.
import { describe, expect, it } from 'vitest';
import { checkView, lastAgentView } from './listColumns.ts';

describe('lastAgentView', () => {
  it('tanpa client → tidak diketahui; lakar-viewer → You (avatar pengguna)', () => {
    expect(lastAgentView(undefined)).toBeUndefined();
    expect(lastAgentView('')).toBeUndefined();
    expect(lastAgentView('lakar-viewer')).toEqual({ label: 'You', initial: 'Y', kind: 'user' });
  });
  it('agen: label harness + huruf awal; Codex = X berwarna codex', () => {
    expect(lastAgentView('claude-code')).toEqual({ label: 'Claude Code', initial: 'C', kind: 'agent' });
    expect(lastAgentView('codex-cli')).toEqual({ label: 'Codex', initial: 'X', kind: 'codex' });
    expect(lastAgentView('lakar-mcp')).toEqual({ label: 'MCP agent', initial: 'M', kind: 'agent' });
    expect(lastAgentView('zed')).toEqual({ label: 'zed', initial: 'Z', kind: 'agent' });
  });
});

describe('checkView', () => {
  it('tidak diketahui → undefined; error > warning > Passed; jamak', () => {
    expect(checkView(undefined)).toBeUndefined();
    expect(checkView({ error: 0, warning: 0 })).toEqual({ text: 'Passed', tone: 'success' });
    expect(checkView({ error: 1, warning: 3 })).toEqual({ text: '1 error', tone: 'danger' });
    expect(checkView({ error: 2, warning: 0 })).toEqual({ text: '2 errors', tone: 'danger' });
    expect(checkView({ error: 0, warning: 1 })).toEqual({ text: '1 warning', tone: 'warning' });
    expect(checkView({ error: 0, warning: 4 })).toEqual({ text: '4 warnings', tone: 'warning' });
  });
});
