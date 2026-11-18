import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LAKAR_VERSION, SCHEMA_VERSION, SESSION_HEADER } from '@lakar/schema';
import { encodePngRgbaWithChunks } from '../png/codec.js';
import { loadProtocol } from '../protocol.js';
import type { TimedLine } from '../stream-metrics.js';
import { timedLines, toolResultEvent, toolUseEvent } from '../../../tests/support/stream.ts';
import { LakardClient } from './lakard-client.js';
import { boardSizeProblems, findCommittedSlug, lakarPreflightProblems, runLakar, snapshotLakarDocs } from './run.js';

const protocol = loadProtocol();
const L = (evs: unknown[]): TimedLine[] => timedLines(evs, 100);
const use = (id: string, name: string, input: unknown) => toolUseEvent(id, `mcp__lakar__${name}`, input);
const res = (id: string, is_error = false, text = 'ok') => toolResultEvent(id, [{ type: 'text', text }], is_error);

describe('findCommittedSlug', () => {
  it('open_doc terakhir yang diikuti execute sukses', () => {
    const lines = L([
      use('1', 'open_doc', { slug: 'coba' }),
      res('1'),
      use('2', 'open_doc', { slug: 'kasku-landing' }),
      res('2'),
      use('3', 'execute', { code: 'x' }),
      res('3', true, 'EXEC_ERROR'),
      use('4', 'execute', { code: 'y' }),
      res('4'),
      use('5', 'open_doc', { slug: 'lain' }),
      res('5'),
      use('6', 'execute', { code: 'z' }),
      res('6', true),
    ]);
    expect(findCommittedSlug(lines)).toEqual({ slug: 'kasku-landing', opened: ['coba', 'kasku-landing', 'lain'] });
  });

  it('open_doc gagal tidak dihitung; tanpa execute sukses → tanpa slug', () => {
    expect(findCommittedSlug(L([use('1', 'open_doc', { slug: 'x' }), res('1', true), use('2', 'execute', {}), res('2')])).slug).toBeUndefined();
    expect(findCommittedSlug(L([use('1', 'open_doc', { slug: 'x' }), res('1')])).slug).toBeUndefined();
  });
});

describe('preflight dan ukuran board', () => {
  it('versi, pool, .mcp.json', () => {
    expect(lakarPreflightProblems({ version: LAKAR_VERSION, pool: { size: 2, ready: 1, recreated: 0 } }, ['lakar'])).toEqual([]);
    expect(lakarPreflightProblems({ version: '9.9.9', pool: { size: 2, ready: 0, recreated: 0 } }, ['lakar', 'pencil'])).toHaveLength(3);
    expect(lakarPreflightProblems(undefined, ['lakar'])).toEqual(['GET /status gagal']);
  });

  it('A lebar 1440; B 390×844', () => {
    expect(boardSizeProblems('A', [{ id: 'a', width: 1440, height: 5000 }])).toEqual([]);
    expect(boardSizeProblems('A', [{ id: 'a', width: 1280, height: 5000 }])).toHaveLength(1);
    expect(boardSizeProblems('B', [{ id: 'b', width: 390, height: 844 }, { id: 'c', width: 390, height: 844 }])).toEqual([]);
    expect(boardSizeProblems('B', [{ id: 'b', width: 390, height: 900 }])).toEqual(['board b 390×900 ≠ 390×844']);
    expect(boardSizeProblems('B', [])).toEqual(['tidak ada board']);
  });
});

// ---------- runLakar dengan lakard palsu + claude palsu ----------

type Fake = { server: Server; url: string; calls: { path: string; body: any; session: string | undefined }[]; status: any };

async function fakeLakard(dataDir: string, boards: { id: string; width: number; height: number }[]): Promise<Fake> {
  const calls: Fake['calls'] = [];
  const f = { calls, status: { version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION, pid: 42, startedAt: '2026-11-18T00:00:00.000Z', dataDir, pool: { size: 2, ready: 2, recreated: 0 }, icons: { lucide: '1' } } } as Fake;
  f.server = createServer((req, rsp) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : undefined;
      calls.push({ path: req.url!, body: parsed, session: req.headers[SESSION_HEADER] as string | undefined });
      const ok = (data: unknown) => rsp.end(JSON.stringify({ ok: true, data }));
      if (req.url === '/status') return ok(f.status);
      if (req.url === '/sessions') return ok({ sessionId: 'harness-1' });
      if (req.url === '/docs/open') return ok({ docId: 'd', slug: parsed.slug, rev: 3, created: false });
      if (req.url === '/boards') return ok({ docId: 'd', slug: 's', rev: 3, boards: boards.map((b, i) => ({ ...b, name: `Board ${i}`, page: 'P', x: 0, y: 0, wip: false })) });
      if (req.url === '/layout-check')
        return ok({ docId: 'd', rev: 3, boards: [], summary: { error: 1, warning: 0, gate: 1 }, findings: [{ level: 'error', rule: 'LC-01a', nodeId: 'n', nodeName: 'T', detail: '👋', expected: 'x' }] });
      if (req.url === '/export') {
        const b = boards.find((x) => x.id === parsed.id)!;
        const p = join(dataDir, `${b.id}.png`);
        writeFileSync(p, encodePngRgbaWithChunks({ width: b.width, height: b.height, data: new Uint8Array(b.width * b.height * 4) }));
        return ok({ path: p, id: b.id, name: 'B', rev: 3, scale: parsed.scale, width: b.width, height: b.height, bytes: 1 });
      }
      rsp.statusCode = 404;
      rsp.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: req.url } }));
    });
  });
  await new Promise<void>((r) => f.server.listen(0, '127.0.0.1', r));
  const a = f.server.address() as { port: number };
  f.url = `http://127.0.0.1:${a.port}`;
  return f;
}

/** Skrip claude palsu: init lakar, open_doc slug, execute sukses, result. */
function fakeClaude(dir: string, slug: string): string {
  const p = join(dir, 'fake-claude.mjs');
  const evs = [
    { type: 'system', subtype: 'init', cwd: '__CWD__', model: 'claude-opus-5-5', mcp_servers: [{ name: 'lakar', status: 'connected' }], tools: ['mcp__lakar__execute', 'mcp__lakar__open_doc'] },
    use('1', 'open_doc', { slug }),
    res('1'),
    use('2', 'execute', { code: "text('Halo 👋')", description: 'tambah sapaan beranda' }),
    res('2'),
    { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.5, num_turns: 3, duration_ms: 1000 },
  ];
  writeFileSync(p, `const evs=${JSON.stringify(evs)};for(const e of evs){if(e.cwd==='__CWD__')e.cwd=process.cwd();process.stdout.write(JSON.stringify(e)+'\\n');}`);
  return p;
}

describe('runLakar (lakard + claude palsu)', () => {
  let root: string;
  let fake: Fake | undefined;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bench-lakar-test-'));
  });
  afterEach(async () => {
    await new Promise((r) => (fake ? fake.server.close(r) : r(undefined)));
    fake = undefined;
    rmSync(root, { recursive: true, force: true });
  });

  const setup = async (slug: string, preexisting: boolean, boards = [{ id: 'b1', width: 390, height: 844 }, { id: 'b2', width: 390, height: 844 }]) => {
    const dataDir = join(root, 'data');
    mkdirSync(join(dataDir, 'docs'), { recursive: true });
    if (preexisting) writeFileSync(join(dataDir, 'docs', `${slug}.lakar.json`), '{}');
    fake = await fakeLakard(dataDir, boards);
    const mcp = join(root, 'mcp.json');
    writeFileSync(mcp, JSON.stringify({ mcpServers: { lakar: { command: 'x' } } }));
    const runs = join(root, 'runs');
    mkdirSync(runs);
    const claude = fakeClaude(root, slug);
    // Dokumen "dibuat agen" selama run: ditulis sebelum runLakar bila tidak lama (claude palsu tidak menulis file).
    return { dataDir, mcp, runs, claude };
  };

  it('sukses: slug baru, sesi harness ber-version, layout-check, export skala 1, IHDR = ukuran board, salinan eksklusif', async () => {
    const s = await setup('gerak-beranda', false);
    const outDir = join(s.runs, 'B-lakar');
    // Simulasikan dokumen baru yang muncul setelah snapshot: tulis lewat hook status kedua.
    let n = 0;
    const client = new LakardClient(fake!.url);
    const orig = client.status.bind(client);
    client.status = async () => {
      if (n++ === 1) {
        writeFileSync(join(s.dataDir, 'docs', 'gerak-beranda.lakar.json'), '{"doc":1}');
        writeFileSync(join(s.dataDir, 'docs', 'gerak-beranda.history.jsonl'), '{}\n');
      }
      return orig();
    };
    const rec = await runLakar({
      runId: 't-B',
      prompt: 'p',
      promptId: 'B',
      outDir,
      config: { ...protocol.config, timeoutMs: 10_000 },
      client,
      command: process.execPath,
      prefixArgs: [s.claude],
      mcpConfig: s.mcp,
      runsRoot: s.runs,
      systemd: () => ({ NRestarts: '0' }),
    });
    expect(rec.status, rec.reason).toBe('success');
    expect(rec.lakar.slug).toBe('gerak-beranda');
    expect(rec.frames.map((f) => [f.width, f.height, f.pngWidth, f.pngHeight])).toEqual([
      [390, 844, 390, 844],
      [390, 844, 390, 844],
    ]);
    expect(rec.pngScaleMismatch).toBe(false);
    expect(rec.lakar.layout?.summary.gate).toBe(1);
    expect(readFileSync(join(outDir, 'doc', 'gerak-beranda.lakar.json'), 'utf8')).toBe('{"doc":1}');
    expect(existsSync(join(outDir, 'doc', 'gerak-beranda.history.jsonl'))).toBe(true);
    const sess = fake!.calls.find((c) => c.path === '/sessions')!;
    expect(sess.body).toMatchObject({ version: LAKAR_VERSION, schemaVersion: SCHEMA_VERSION });
    expect(fake!.calls.filter((c) => c.path === '/export').map((c) => c.body)).toEqual([
      { id: 'b1', scale: 1 },
      { id: 'b2', scale: 1 },
    ]);
    expect(fake!.calls.find((c) => c.path === '/docs/open')!.session).toBe('harness-1');
    expect(rec.lakar.daemonBefore?.pid).toBe(42);
  });

  it('dokumen lama: slug sudah ada di snapshot → invalid, tanpa /docs/open', async () => {
    const s = await setup('rodaku-landing', true);
    const rec = await runLakar({
      runId: 't-A',
      prompt: 'p',
      promptId: 'A',
      outDir: join(s.runs, 'A-lakar'),
      config: { ...protocol.config, timeoutMs: 10_000 },
      client: new LakardClient(fake!.url),
      command: process.execPath,
      prefixArgs: [s.claude],
      mcpConfig: s.mcp,
      runsRoot: s.runs,
      systemd: () => ({}),
    });
    expect(rec.status).toBe('invalid');
    expect(rec.reason).toMatch(/^dokumen lama/);
    expect(fake!.calls.some((c) => c.path === '/docs/open')).toBe(false);
  });

  it('preflight gagal (versi beda) → aborted tanpa claude', async () => {
    const s = await setup('x', false);
    fake!.status.version = '0.0.0-lain';
    const outDir = join(s.runs, 'A-lakar');
    const rec = await runLakar({ runId: 't', prompt: 'p', promptId: 'A', outDir, config: protocol.config, client: new LakardClient(fake!.url), command: '/bin/false', mcpConfig: s.mcp, runsRoot: s.runs });
    expect(rec.status).toBe('aborted');
    expect(rec.reason).toMatch(/LAKAR_VERSION/);
    expect(existsSync(join(outDir, 'stream.jsonl'))).toBe(false);
  });

  it('snapshotLakarDocs: hanya *.lakar.json', () => {
    const d = join(root, 'docs');
    mkdirSync(d);
    writeFileSync(join(d, 'a.lakar.json'), '{}');
    writeFileSync(join(d, 'a.history.jsonl'), '');
    expect(snapshotLakarDocs(d).map((x) => x.name)).toEqual(['a.lakar.json']);
  });
});

describe('arsip dokumen bench lama (slug bentrok)', () => {
  it('slug dari run Lakar putaran lain (slug + opened, termasuk .prev); putaran ini dan dokumen non-bench tidak disentuh', async () => {
    const { applyLakarArchive, benchLakarSlugs, planLakarArchive } = await import('./archive.js');
    const root = mkdtempSync(join(tmpdir(), 'lakar-archive-'));
    try {
      const rounds = join(root, 'rounds');
      const put = (dir: string, lakar: unknown) => {
        mkdirSync(join(rounds, dir), { recursive: true });
        writeFileSync(join(rounds, dir, 'run.json'), JSON.stringify({ status: 'success', lakar }));
      };
      put('uji-1/A-lakar', { slug: 'kasku-landing', opened: ['kasku-landing'] });
      put('uji-1/B-lakar.prev-20261118T000000Z', { slug: undefined, opened: ['gerak-coba'] });
      put('uji-1/A-pendev', { slug: 'bukan-lakar' });
      put('uji-2/B-lakar', { slug: 'gerak-beranda', opened: ['gerak-beranda', '../jahat'] });
      put('1/A-lakar', { slug: 'putaran-ini' });
      expect(benchLakarSlugs(rounds, '1')).toEqual(['gerak-beranda', 'gerak-coba', 'kasku-landing']);

      const data = join(root, 'data');
      mkdirSync(join(data, 'docs'), { recursive: true });
      mkdirSync(join(data, 'exports', 'kasku-landing'), { recursive: true });
      for (const f of ['kasku-landing.lakar.json', 'kasku-landing.history.jsonl', 'gerak-beranda.lakar.json', 'milik-adam.lakar.json']) writeFileSync(join(data, 'docs', f), '{}');
      const dest = join(root, 'arsip', '1-x');
      const plan = planLakarArchive(data, benchLakarSlugs(rounds, '1'), dest);
      expect(plan.map((x) => x.from.slice(data.length + 1))).toEqual(['docs/gerak-beranda.lakar.json', 'docs/kasku-landing.lakar.json', 'docs/kasku-landing.history.jsonl', 'exports/kasku-landing']);
      applyLakarArchive(plan);
      expect(snapshotLakarDocs(join(data, 'docs')).map((d) => d.name)).toEqual(['milik-adam.lakar.json']);
      expect(existsSync(join(dest, 'docs', 'kasku-landing.history.jsonl'))).toBe(true);
      expect(existsSync(join(dest, 'exports', 'kasku-landing'))).toBe(true);
      // Tujuan sudah ada → error sebelum apa pun dipindah.
      writeFileSync(join(data, 'docs', 'kasku-landing.lakar.json'), '{}');
      writeFileSync(join(data, 'docs', 'gerak-beranda.lakar.json'), '{}');
      expect(() => applyLakarArchive(planLakarArchive(data, ['gerak-beranda', 'kasku-landing'], dest))).toThrow(/sudah ada/);
      expect(existsSync(join(data, 'docs', 'gerak-beranda.lakar.json'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
