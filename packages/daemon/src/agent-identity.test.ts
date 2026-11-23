// Identitas agen (spec-canvas-agent-effects): header `x-lakar-agent` saat POST /sessions → field opsional `agent`
// pada event session dan call. Klien tanpa header mendapat bentuk event lama (AD-4).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentOf } from './events.js';
import { buildServer, loadConfig, type ActivityEvent } from './index.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const fakeRender = { screenshot: async () => new Uint8Array(), measure: async () => ({ width: 1, height: 1, nodes: [], texts: [] }) } as never;

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-agent-id-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('agentOf', () => {
  it('ASCII tampak ≤ 64 dipangkas; kosong, terlalu panjang, non-ASCII, atau array → undefined', () => {
    expect(agentOf({ 'x-lakar-agent': ' claude-code ' })).toBe('claude-code');
    expect(agentOf({ 'x-lakar-agent': 'Zed Agent' })).toBe('Zed Agent');
    expect(agentOf({ 'x-lakar-agent': 'x'.repeat(64) })).toBe('x'.repeat(64));
    expect(agentOf({})).toBeUndefined();
    expect(agentOf({ 'x-lakar-agent': '   ' })).toBeUndefined();
    expect(agentOf({ 'x-lakar-agent': 'x'.repeat(65) })).toBeUndefined();
    expect(agentOf({ 'x-lakar-agent': 'agén' })).toBeUndefined();
    expect(agentOf({ 'x-lakar-agent': ['a', 'b'] })).toBeUndefined();
  });
});

describe('POST /sessions + x-lakar-agent', () => {
  it('header → agent di event session dan call; tanpa header → tanpa field agent', async () => {
    const dataDir = await mkdtemp(join(root, 'data-'));
    const { app, activity } = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: fakeRender });
    const events: ActivityEvent[] = [];
    activity.subscribe((e) => events.push(e));
    try {
      const res = await app.inject({ method: 'POST', url: '/sessions', payload: { client: 'lakar-mcp' }, headers: { 'x-lakar-agent': 'claude-code' } });
      expect(res.statusCode).toBe(200);
      const sid = res.json().data.sessionId as string;
      await app.inject({ method: 'POST', url: '/skills/read', payload: {}, headers: { 'x-lakar-session': sid } });
      expect(events.find((e) => e.type === 'session')).toMatchObject({ session: { id: sid.slice(0, 8), client: 'lakar-mcp', agent: 'claude-code' } });
      const mine = events.filter((e) => e.type === 'call' && e.call.session === sid.slice(0, 8));
      expect(mine.length).toBe(2);
      for (const e of mine) expect(e.type === 'call' && e.call.agent).toBe('claude-code');

      const old = (await app.inject({ method: 'POST', url: '/sessions', payload: { client: 'lakar-mcp' } })).json().data.sessionId as string;
      await app.inject({ method: 'POST', url: '/skills/read', payload: {}, headers: { 'x-lakar-session': old } });
      const oldEvents = events.filter((e) => (e.type === 'call' ? e.call.session : e.session.id) === old.slice(0, 8));
      expect(oldEvents.length).toBe(3);
      for (const e of oldEvents) expect('agent' in (e.type === 'call' ? e.call : e.session)).toBe(false);
    } finally {
      await app.close();
    }
  });
});
