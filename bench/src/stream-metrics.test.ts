import { describe, expect, it } from 'vitest';
import { computeMetrics, validateInit, type InitRules, type TimedLine } from './stream-metrics.js';
import { toolResultEvent, toolUseEvent } from '../../tests/support/stream.ts';

const RULES: InitRules = { server: 'pencil', requiredTools: ['mcp__pencil__execute'], forbiddenCwdRoot: '/root/lakar' };

const init = (over: Record<string, unknown> = {}) => ({
  type: 'system',
  subtype: 'init',
  cwd: '/tmp/lakar-bench-abc',
  model: 'claude-opus-5-5',
  claude_code_version: '2.1.325',
  mcp_servers: [{ name: 'pencil', status: 'connected' }],
  tools: ['mcp__pencil__execute', 'mcp__pencil__get_app_state'],
  ...over,
});
const toolUse = (id: string) => toolUseEvent(id, 'mcp__pencil__execute', {});
const toolResult = (id: string) => toolResultEvent(id, 'OK');
const result = (over: Record<string, unknown> = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  total_cost_usd: 0.88,
  duration_ms: 85000,
  duration_api_ms: 80000,
  num_turns: 5,
  modelUsage: { 'claude-opus-5-5': {} },
  ...over,
});
const timed = (pairs: [number, unknown][]): TimedLine[] => pairs.map(([t, ev]) => ({ t, line: typeof ev === 'string' ? ev : JSON.stringify(ev) }));

const normal = timed([
  [1200, init()],
  [5000, toolUse('t1')],
  [9000, toolResult('t1')],
  [12000, toolUse('t2')],
  [20000, toolResult('t2')],
  [26200, result()],
]);

describe('computeMetrics', () => {
  it('metrik normal: wall = t(result) − t(baris 1), biaya/turns/model/durasi, offset tool', () => {
    const m = computeMetrics(normal, RULES);
    expect(m.status).toBe('success');
    expect(m.wallMs).toBe(25000);
    expect(m.spawnToFirstEventMs).toBe(1200);
    expect(m.totalCostUsd).toBe(0.88);
    expect(m.durationMs).toBe(85000);
    expect(m.durationApiMs).toBe(80000);
    expect(m.numTurns).toBe(5);
    expect(m.subtype).toBe('success');
    expect(m.isError).toBe(false);
    expect(m.modelUsageKeys).toEqual(['claude-opus-5-5']);
    expect(m.init).toMatchObject({ model: 'claude-opus-5-5', claudeCodeVersion: '2.1.325', cwd: '/tmp/lakar-bench-abc' });
    expect(m.toolCalls).toBe(2);
    expect(m.firstToolUseMs).toBe(3800);
    expect(m.lastToolResultMs).toBe(18800);
    expect(m.toolSpanMs).toBe(15000);
  });

  it('tanpa result → failed no_result', () => {
    const m = computeMetrics(normal.slice(0, 3), RULES);
    expect(m).toMatchObject({ status: 'failed', reason: 'no_result', wallMs: undefined });
  });

  it('result error → failed', () => {
    expect(computeMetrics(timed([[1, init()], [2, result({ is_error: true })]]), RULES).status).toBe('failed');
    const m = computeMetrics(timed([[1, init()], [2, result({ subtype: 'error_max_turns' })]]), RULES);
    expect(m.status).toBe('failed');
    expect(m.reason).toContain('error_max_turns');
  });

  it('timeout atau exit ≠ 0 → failed', () => {
    expect(computeMetrics(normal, RULES, { exitCode: null, timedOut: true }).reason).toBe('timeout');
    expect(computeMetrics(normal, RULES, { exitCode: 1, timedOut: false }).reason).toBe('exit 1');
  });

  it('init melanggar → invalid', () => {
    for (const bad of [
      init({ mcp_servers: [{ name: 'pencil', status: 'connected' }, { name: 'lakar', status: 'connected' }] }),
      init({ mcp_servers: [{ name: 'pen-headless', status: 'connected' }] }),
      init({ mcp_servers: [{ name: 'pencil', status: 'failed' }] }),
      init({ tools: ['mcp__pencil__execute', 'Read'] }),
      init({ tools: ['mcp__pencil__get_app_state'] }),
      init({ cwd: '/root/lakar' }),
      init({ cwd: '/root/lakar/bench' }),
    ]) {
      const m = computeMetrics(timed([[1, bad], [2, result()]]), RULES);
      expect(m.status, JSON.stringify(bad)).toBe('invalid');
    }
    expect(computeMetrics(timed([[1, result()]]), RULES)).toMatchObject({ status: 'invalid', reason: 'no_init' });
  });

  it('server null (juri): wajib mcp_servers=[] dan tools=[]', () => {
    const J: InitRules = { server: null, requiredTools: [], forbiddenCwdRoot: '/root/lakar' };
    const ok = init({ mcp_servers: [], tools: [] });
    expect(validateInit(computeMetrics(timed([[1, ok]]), J).init, J)).toEqual([]);
    expect(computeMetrics(timed([[1, ok], [2, result()]]), J).status).toBe('success');
    for (const bad of [init({ mcp_servers: [], tools: ['Read'] }), init({ tools: [] }), init({ mcp_servers: [], tools: [], cwd: '/root/lakar/x' })]) {
      expect(computeMetrics(timed([[1, bad], [2, result()]]), J).status, JSON.stringify(bad)).toBe('invalid');
    }
  });

  it('server lakar: init berisi server pencil atau tool Read → invalid', () => {
    const L: InitRules = { server: 'lakar', requiredTools: ['mcp__lakar__execute'], forbiddenCwdRoot: '/root/lakar' };
    const good = init({ mcp_servers: [{ name: 'lakar', status: 'connected' }], tools: ['mcp__lakar__execute', 'mcp__lakar__open_doc'] });
    expect(computeMetrics(timed([[1, good], [2, result()]]), L).status).toBe('success');
    for (const bad of [
      init({ mcp_servers: [{ name: 'pencil', status: 'connected' }], tools: ['mcp__lakar__execute'] }),
      init({ mcp_servers: [{ name: 'lakar', status: 'connected' }], tools: ['mcp__lakar__execute', 'Read'] }),
      init({ mcp_servers: [{ name: 'lakar', status: 'connected' }], tools: ['mcp__lakar__open_doc'] }),
    ]) {
      expect(computeMetrics(timed([[1, bad], [2, result()]]), L).status, JSON.stringify(bad)).toBe('invalid');
    }
  });

  it('cwd mirip tapi di luar root tetap sah', () => {
    expect(validateInit(computeMetrics(timed([[1, init({ cwd: '/root/lakar-x' })]]), RULES).init, RULES)).toEqual([]);
  });

  it('baris non-JSON disimpan dan diabaikan', () => {
    const lines: TimedLine[] = [{ t: 500, line: 'Warning: something on stdout' }, ...normal, { t: 30000, line: '{rusak' }];
    const m = computeMetrics(lines, RULES);
    expect(m.status).toBe('success');
    expect(m.nonJsonLines).toBe(2);
    expect(m.wallMs).toBe(25000);
  });
});
