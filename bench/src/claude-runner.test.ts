import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildArgs, buildEnv, runClaude, shellQuote } from './claude-runner.js';
import { loadProtocol, renderPrompt } from './protocol.js';

const protocol = loadProtocol();

describe('buildArgs', () => {
  const prompt = renderPrompt('A', protocol);
  const argv = buildArgs({ prompt, config: protocol.config, mcpConfig: '/x/pencil.json', allowedTools: 'mcp__pencil' });

  it('-p = prompt hasil render, flag bersama, hanya mcp-config/allowedTools spesifik alat', () => {
    expect(argv.slice(0, 2)).toEqual(['-p', prompt]);
    expect(shellQuote(argv)).toContain('--model claude-opus-5-5 --strict-mcp-config --tools "" --output-format stream-json --verbose');
    for (const f of ['--disable-slash-commands', '--no-session-persistence']) expect(argv).toContain(f);
    expect(argv.slice(-4)).toEqual(['--mcp-config', '/x/pencil.json', '--allowedTools', 'mcp__pencil']);
    const other = buildArgs({ prompt, config: protocol.config, mcpConfig: '/y/.mcp.json', allowedTools: 'mcp__lakar' });
    expect(other.slice(0, -4)).toEqual(argv.slice(0, -4));
  });

  it('tanpa --system-prompt, --append-system-prompt, --effort', () => {
    for (const f of ['--system-prompt', '--append-system-prompt', '--effort']) expect(argv).not.toContain(f);
  });

  it('env: variabel sesi pemanggil dibuang, ENABLE_TOOL_SEARCH=false', () => {
    const { env, scrubbed } = buildEnv({ PATH: '/bin', CLAUDE_EFFORT: 'medium', CLAUDECODE: '1', AI_AGENT: 'x' }, protocol.config);
    expect(env).toEqual({ PATH: '/bin', ENABLE_TOOL_SEARCH: 'false' });
    expect(scrubbed).toEqual(['AI_AGENT', 'CLAUDECODE', 'CLAUDE_EFFORT']);
  });
});

describe('runClaude (claude tiruan)', () => {
  it('transkrip byte-identik, cap waktu per baris, cwd tmp dihapus', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-runner-test-'));
    try {
      const fake = join(dir, 'fake.mjs');
      writeFileSync(
        fake,
        `const w=(s)=>process.stdout.write(s);
w(JSON.stringify({type:'system',subtype:'init',cwd:process.cwd()})+'\\n');
setTimeout(()=>{w('{"type":"assistant","message":{"content":[]}}\\nnon-json\\n{"type":"res');},50);
setTimeout(()=>{w('ult","subtype":"success"}\\n');process.stderr.write('err');},120);`,
      );
      const out = join(dir, 'out');
      mkdirSync(out);
      const r = await runClaude({ prompt: 'p', mcpConfig: 'm', allowedTools: 'a', config: { ...protocol.config, timeoutMs: 10_000 }, outDir: out, command: process.execPath, prefixArgs: [fake] });
      expect(r.exitCode).toBe(0);
      expect(r.lines.map((l) => l.line)).toEqual([
        expect.stringContaining('"init"'),
        '{"type":"assistant","message":{"content":[]}}',
        'non-json',
        '{"type":"result","subtype":"success"}',
      ]);
      expect(r.lines[3]!.t).toBeGreaterThan(r.lines[1]!.t);
      const raw = readFileSync(join(out, 'stream.jsonl'), 'utf8');
      expect(raw).toBe(`${r.lines.map((l) => l.line).join('\n')}\n`);
      expect(readFileSync(join(out, 'stderr.txt'), 'utf8')).toBe('err');
      const timing = JSON.parse(readFileSync(join(out, 'timing.json'), 'utf8'));
      expect(timing.lines).toHaveLength(4);
      const initCwd = JSON.parse(r.lines[0]!.line).cwd;
      expect(initCwd).toBe(r.cwd);
      expect(existsSync(r.cwd)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('init invalid → proses dihentikan segera', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-runner-test-'));
    try {
      const fake = join(dir, 'fake.mjs');
      writeFileSync(fake, `process.stdout.write(JSON.stringify({type:'system',subtype:'init'})+'\\n'); setTimeout(()=>{},60000);`);
      const out = join(dir, 'out');
      mkdirSync(out);
      const t = Date.now();
      const r = await runClaude({ prompt: 'p', mcpConfig: 'm', allowedTools: 'a', config: protocol.config, outDir: out, command: process.execPath, prefixArgs: [fake], validateInit: () => ['buruk'] });
      expect(r.killedForInvalidInit).toEqual(['buruk']);
      expect(Date.now() - t).toBeLessThan(10_000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('rawArgs menggantikan buildArgs dan stdin terkirim lalu ditutup (juri stream-json)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-runner-test-'));
    try {
      const fake = join(dir, 'fake.mjs');
      writeFileSync(
        fake,
        `let s='';process.stdin.on('data',(d)=>s+=d);process.stdin.on('end',()=>{process.stdout.write(JSON.stringify({type:'echo',argv:process.argv.slice(2),stdin:s})+'\\n');});`,
      );
      const out = join(dir, 'out');
      mkdirSync(out);
      const raw = ['-p', '--input-format', 'stream-json', '--tools', ''];
      const r = await runClaude({ rawArgs: raw, stdin: '{"type":"user"}\n', config: { ...protocol.config, timeoutMs: 10_000 }, outDir: out, command: process.execPath, prefixArgs: [fake] });
      expect(r.argv).toEqual(raw);
      const ev = JSON.parse(r.lines[0]!.line);
      expect(ev.argv).toEqual(raw);
      expect(ev.argv).not.toContain('--allowedTools');
      expect(ev.stdin).toBe('{"type":"user"}\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tanpa rawArgs, prompt/mcpConfig/allowedTools wajib', async () => {
    await expect(runClaude({ config: protocol.config, outDir: '/nonexistent' })).rejects.toThrow(/wajib/);
  });
});
