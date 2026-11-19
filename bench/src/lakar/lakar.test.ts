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
import { boardSizeProblems, boardSizeProblemsFor, findCommittedSlug, lakarPreflightProblems, runLakar, snapshotLakarDocs } from './run.js';

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
    // Spesifikasi eksplisit (prompt latihan): tinggi null = bebas; prompt tanpa spesifikasi hanya cek ada board.
    expect(boardSizeProblemsFor({ width: 1440, height: 900 }, [{ id: 'd', width: 1440, height: 1024 }])).toEqual(['board d 1440×1024 ≠ 1440×900']);
    expect(boardSizeProblemsFor({ width: 1440, height: null }, [{ id: 'l', width: 1440, height: 7000 }])).toEqual([]);
    expect(boardSizeProblemsFor({ width: 390, height: 844 }, [{ id: 'm', width: 375, height: 844 }])).toEqual(['board m 375×844 ≠ 390×844']);
    expect(boardSizeProblemsFor(undefined, [{ id: 'x', width: 1, height: 1 }])).toEqual([]);
    expect(boardSizeProblems('P1', [{ id: 'x', width: 1, height: 1 }])).toEqual([]);
  });

  it('C 1440×1024 dan E 1440×900 persis; D 390 × ≥ 844 apa pun versi rubrik', () => {
    const b = (id: string, width: number, height: number) => ({ id, width, height });
    for (const rule of ['exact', 'mobile-min-height'] as const) {
      expect(boardSizeProblems('C', [b('c', 1440, 1024)], rule)).toEqual([]);
      expect(boardSizeProblems('C', [b('c', 1440, 1025)], rule)).toEqual(['board c 1440×1025 ≠ 1440×1024']);
      expect(boardSizeProblems('E', [b('e', 1440, 900)], rule)).toEqual([]);
      expect(boardSizeProblems('E', [b('e', 1440, 1025)], rule)).toEqual(['board e 1440×1025 ≠ 1440×900']);
      expect(boardSizeProblems('D', [b('d', 390, 1600)], rule)).toEqual([]);
      expect(boardSizeProblems('D', [b('d', 390, 844), b('d2', 390, 1200)], rule)).toEqual([]);
      expect(boardSizeProblems('D', [b('d', 390, 800)], rule)).toEqual(['board d 390×800 ≠ 390×≥844']);
      expect(boardSizeProblems('D', [b('d', 400, 900)], rule)).toEqual(['board d 400×900 ≠ 390×≥844']);
      expect(boardSizeProblems('D', [], rule)).toEqual(['tidak ada board']);
    }
    // B tetap mengikuti versi rubrik (persis < 2.2).
    expect(boardSizeProblems('B', [b('b', 390, 1600)], 'exact')).toEqual(['board b 390×1600 ≠ 390×844']);
    expect(boardSizeProblems('B', [b('b', 390, 1600)], 'mobile-min-height')).toEqual([]);
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

  it('A6 pencatatan seketika: open_doc di stream → lakar-docs.jsonl walau proses mati tanpa result/run.json', async () => {
    const s = await setup('x-resep', false);
    const outDir = join(s.runs, 'P3-lakar');
    const dying = join(root, 'dying-claude.mjs');
    const evs = [
      { type: 'system', subtype: 'init', cwd: '__CWD__', model: 'claude-opus-5-5', mcp_servers: [{ name: 'lakar', status: 'connected' }], tools: ['mcp__lakar__execute', 'mcp__lakar__open_doc'] },
      use('1', 'open_doc', { slug: 'x-resep' }),
      use('2', 'open_doc', { slug: '../jahat' }),
      use('3', 'execute', { code: 'open_doc' }),
    ];
    writeFileSync(dying, `const evs=${JSON.stringify(evs)};for(const e of evs){if(e.cwd==='__CWD__')e.cwd=process.cwd();process.stdout.write(JSON.stringify(e)+'\\n');}process.exit(1);`);
    await runLakar({
      runId: 't-P3',
      prompt: 'p',
      promptId: 'P3',
      outDir,
      config: { ...protocol.config, timeoutMs: 10_000 },
      client: new LakardClient(fake!.url),
      command: process.execPath,
      prefixArgs: [dying],
      mcpConfig: s.mcp,
      runsRoot: s.runs,
      systemd: () => ({}),
    });
    expect(existsSync(join(outDir, 'run.json'))).toBe(false);
    const log = readFileSync(join(outDir, 'lakar-docs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(log.map((x) => x.slug)).toEqual(['x-resep']);
    expect(typeof log[0].t).toBe('number');
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
      // Multi-root: latihan (runs/practice/<iter>) ikut; yang dikecualikan hanya dir <root>/<id> yang sedang berjalan.
      const practice = join(root, 'practice');
      mkdirSync(join(practice, '1', 'P1-lakar'), { recursive: true });
      writeFileSync(join(practice, '1', 'P1-lakar', 'run.json'), JSON.stringify({ lakar: { slug: 'latihan-satu', opened: ['latihan-satu'] } }));
      mkdirSync(join(practice, '2', 'P2-lakar'), { recursive: true });
      writeFileSync(join(practice, '2', 'P2-lakar', 'run.json'), JSON.stringify({ lakar: { slug: 'latihan-dua' } }));
      expect(benchLakarSlugs([rounds, practice], { root: rounds, id: '1' })).toEqual(['gerak-beranda', 'gerak-coba', 'kasku-landing', 'latihan-dua', 'latihan-satu']);
      expect(benchLakarSlugs([rounds, practice], { root: practice, id: '2' })).toEqual(['gerak-beranda', 'gerak-coba', 'kasku-landing', 'latihan-satu', 'putaran-ini']);

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

  // Dir run terhenti: docs-before.json (+ stream.jsonl / lakar-docs.jsonl), tanpa run.json.
  const stalled = (dir: string, before: string[], opts: { stream?: unknown[]; log?: string[]; rawStream?: string }) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'docs-before.json'), JSON.stringify(before.map((s) => ({ name: `${s}.lakar.json`, size: 2, mtimeMs: 0 }))));
    if (opts.stream || opts.rawStream !== undefined) writeFileSync(join(dir, 'stream.jsonl'), opts.rawStream ?? opts.stream!.map((e) => JSON.stringify(e)).join('\n'));
    if (opts.log) writeFileSync(join(dir, 'lakar-docs.jsonl'), `${opts.log.join('\n')}\n`);
  };

  it('A1–A5: run terhenti diidentifikasi dari jejak sesinya; docs-before tidak pernah diatribusikan; dry-run tidak mengubah dataDir', async () => {
    const { benchLakarSlugs, benchLakarSources, describeLakarArchive, planLakarArchive } = await import('./archive.js');
    const root = mkdtempSync(join(tmpdir(), 'lakar-archive-stalled-'));
    try {
      const practice = join(root, 'practice');
      const rounds = join(root, 'rounds');
      mkdirSync(rounds, { recursive: true });
      // A1: run terhenti (stream: tool_use open_doc tanpa result), slug tidak ada di docs-before.
      stalled(join(practice, '4', 'P3-lakar'), ['milik-adam'], { stream: [use('1', 'open_doc', { slug: 'x-resep' }), { type: 'system', subtype: 'init' }] });
      // A2: catatan langsung; stream terpotong; baris rusak dilewati.
      stalled(join(practice, '5', 'P1-lakar'), [], { rawStream: '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"1","name":"mcp__lakar__open_doc","inp', log: ['{"t":1,"slug":"y"}', '{"t":2,"slu', '{"t":3,"slug":"../jahat"}'] });
      // A3: dokumen non-bench: ada di docs-before run terhenti; dir terhenti tanpa docs-before; dir non-Lakar.
      stalled(join(practice, '5', 'P2-lakar'), ['milik-adam'], { stream: [use('1', 'open_doc', { slug: 'milik-adam' })] });
      mkdirSync(join(practice, '5', 'P3-lakar'), { recursive: true });
      writeFileSync(join(practice, '5', 'P3-lakar', 'stream.jsonl'), JSON.stringify(use('1', 'open_doc', { slug: 'milik-adam' })));
      stalled(join(practice, '5', 'P1-pendev'), [], { stream: [use('1', 'open_doc', { slug: 'milik-adam' })] });
      // A4: run selesai dengan slug yang ada di docs-before run itu (invalid "dokumen lama") → tidak diatribusikan.
      const done = join(practice, '6', 'P3-lakar');
      stalled(done, ['z'], {});
      writeFileSync(join(done, 'run.json'), JSON.stringify({ status: 'invalid', lakar: { slug: 'z', opened: ['z', 'w'] } }));
      // Run selesai tetapi slug hanya di catatan seketika (mis. timeout sebelum result open_doc) → ikut.
      const late = join(practice, '6', 'P4-lakar');
      stalled(late, [], { log: ['{"t":1,"slug":"v-telat"}'] });
      writeFileSync(join(late, 'run.json'), JSON.stringify({ status: 'failed', lakar: { slug: undefined, opened: [] } }));
      // Iterasi berjalan (7): run selesai dilewati, run terhenti ikut.
      mkdirSync(join(practice, '7', 'P1-lakar'), { recursive: true });
      writeFileSync(join(practice, '7', 'P1-lakar', 'run.json'), JSON.stringify({ lakar: { slug: 'putaran-ini' } }));
      stalled(join(practice, '7', 'P2-lakar'), [], { log: ['{"t":1,"slug":"terhenti-di-sini"}'] });

      const ex = { root: practice, id: '7' };
      expect(benchLakarSources([rounds, practice], ex)).toEqual([
        { slug: 'terhenti-di-sini', run: 'practice/7/P2-lakar', terhenti: true },
        { slug: 'v-telat', run: 'practice/6/P4-lakar', terhenti: false },
        { slug: 'w', run: 'practice/6/P3-lakar', terhenti: false },
        { slug: 'x-resep', run: 'practice/4/P3-lakar', terhenti: true },
        { slug: 'y', run: 'practice/5/P1-lakar', terhenti: true },
      ]);
      expect(benchLakarSlugs([rounds, practice], ex)).toEqual(['terhenti-di-sini', 'v-telat', 'w', 'x-resep', 'y']);
      // A4: z dibuat run lain → tetap diarsip (diatribusikan ke run itu saja).
      stalled(join(rounds, 'uji-1', 'B-lakar'), [], { stream: [use('1', 'open_doc', { slug: 'z' })] });
      expect(benchLakarSources([rounds, practice], ex).filter((x) => x.slug === 'z')).toEqual([{ slug: 'z', run: 'rounds/uji-1/B-lakar', terhenti: true }]);

      // A5: rencana (dry-run) tidak mengubah dataDir; teks menyebut slug dan run terhenti asalnya.
      const data = join(root, 'data');
      mkdirSync(join(data, 'docs'), { recursive: true });
      for (const f of ['x-resep.lakar.json', 'milik-adam.lakar.json', 'z.lakar.json']) writeFileSync(join(data, 'docs', f), '{}');
      const sources = benchLakarSources([rounds, practice], ex);
      const plan = planLakarArchive(data, [...new Set(sources.map((x) => x.slug))], join(root, 'arsip'));
      expect(plan.map((x) => x.slug)).toEqual(['x-resep', 'z']);
      expect(describeLakarArchive(data, plan, sources)).toBe('docs/x-resep.lakar.json ← practice/4/P3-lakar (terhenti), docs/z.lakar.json ← rounds/uji-1/B-lakar (terhenti)');
      expect(describeLakarArchive(data, [], sources)).toBe('-');
      expect(snapshotLakarDocs(join(data, 'docs')).map((d) => d.name)).toEqual(['milik-adam.lakar.json', 'x-resep.lakar.json', 'z.lakar.json']);
      expect(existsSync(join(root, 'arsip'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
