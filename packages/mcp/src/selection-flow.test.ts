// Integrasi alur agen dari seleksi (epic agen-di-canvas story 4): lakard asli (Chromium Lakar) + server MCP Lakar.
// Pengguna memilih board fixture lewat route viewer, agen uji memanggil get_selection → read_skill selection →
// open_doc → execute contoh varian dari skill; pelanggan /viewer/events menerima event, History mencatat commit
// agen, edit manual di tengah alur tetap ada. Lalu cek konsistensi (blok baca saja) atas frame terpilih.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { summaryText } from '@lakar/schema';
import { createLakarMcpServer } from './index.js';
import { loadConfig, startDaemon, type RunningDaemon } from '../../daemon/src/index.ts';
import { splitCode } from '../../skills/src/index.ts';
import { chromiumInstalled } from '../../../tests/support/browser.ts';
import { postJson } from '../../../tests/support/http.ts';
import { READ_ONLY_MARK, SELECTION_FIXTURE, withSelection } from '../../../tests/support/selection-fixture.ts';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const browsersPath = process.env.LAKAR_BROWSERS_PATH || baseConfig.browsersPath;
const browserInstalled = chromiumInstalled(browsersPath);

const SLUG = 'kopi-varian';
const WINDOW = 'w1';

type StreamEvent = { event: string; data: any };

/** Pelanggan SSE /viewer/events: event terurai + tunggu event yang cocok. */
async function subscribe(base: string) {
  const ac = new AbortController();
  const res = await fetch(`${base}/viewer/events`, { signal: ac.signal });
  if (!res.ok || !res.body) throw new Error(`/viewer/events HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const events: StreamEvent[] = [];
  let buf = '';
  let waiters: (() => void)[] = [];
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const event = /^event: (.*)$/m.exec(chunk)?.[1];
          const data = /^data: (.*)$/m.exec(chunk)?.[1];
          if (event && data) events.push({ event, data: JSON.parse(data) });
        }
        const w = waiters;
        waiters = [];
        w.forEach((f) => f());
      }
    } catch {
      // dibatalkan
    }
  })();
  const waitFor = async (pred: (e: StreamEvent) => boolean, label: string): Promise<StreamEvent> => {
    const t0 = Date.now();
    for (;;) {
      const hit = events.find(pred);
      if (hit) return hit;
      if (Date.now() - t0 > 20_000) throw new Error(`event tidak datang: ${label}`);
      await new Promise<void>((r) => {
        waiters.push(r);
        setTimeout(r, 200);
      });
    }
  };
  await waitFor((e) => e.event === 'hello', 'hello');
  return { events, waitFor, close: async () => (ac.abort(), await pump) };
}

const text = (r: any) => (r.content as { type: string; text: string }[]).find((c) => c.type === 'text')!.text;

describe.skipIf(!browserInstalled)('alur agen dari seleksi: get_selection → execute varian → canvas live + History', () => {
  let d: RunningDaemon;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'lakar-selection-flow-'));
    d = await startDaemon({ ...baseConfig, port: 0, dataDir, browsersPath });
    await d.warmed;
  }, 60_000);

  afterAll(async () => {
    await d?.close();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  const req = async (method: 'GET' | 'PUT' | 'POST', path: string, body?: unknown) => {
    const r = await fetch(`${d.url}${path}`, {
      method,
      headers: { 'x-lakar-origin': WINDOW, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: (await r.json()) as any };
  };
  const getDoc = async () => (await req('GET', `/viewer/docs/${SLUG}`)).body.data.doc;

  it('seleksi viewer → get_selection → execute varian 390/768; event live, History, edit manual tetap ada; lalu cek konsistensi', async () => {
    // Dokumen fixture (desain yang sudah ada sebelum pengguna meminta varian).
    const designer = (await postJson(d.url, '/sessions', { client: 'fixture' })).body.data.sessionId as string;
    expect((await postJson(d.url, '/docs/open', { slug: SLUG }, designer)).body.ok).toBe(true);
    const f = (await postJson(d.url, '/execute', { code: SELECTION_FIXTURE, description: 'fixture beranda kopi' }, designer)).body;
    expect(f.ok, JSON.stringify(f.error)).toBe(true);
    const { board, hero, fitur, cards } = f.data.value as { board: string; hero: string; fitur: string; cards: string[] };
    const sourceBefore = (await getDoc()).pages[0].children.find((b: any) => b.id === board);

    const stream = await subscribe(d.url);
    const agent = new Client({ name: 'agen-uji', version: '0' });
    try {
      // Pengguna memilih board di canvas (viewer mengirim seleksi).
      const put = await req('PUT', `/viewer/docs/${SLUG}/selection`, { addresses: [board] });
      expect(put.status, JSON.stringify(put.body)).toBe(200);
      await stream.waitFor((e) => e.event === 'selection' && e.data.selection.slug === SLUG, 'selection');

      const [ct, st] = InMemoryTransport.createLinkedPair();
      await createLakarMcpServer(d.url).connect(st);
      await agent.connect(ct);

      // 1. Agen membaca seleksi (sesi belum open_doc → dokumen dengan seleksi terakhir).
      const sel = await agent.callTool({ name: 'get_selection', arguments: {} });
      expect(sel.isError, text(sel)).toBeFalsy();
      const selection = JSON.parse(text(sel));
      expect(selection).toMatchObject({ slug: SLUG, addresses: [board], nodes: [{ id: board, type: 'board', name: 'Kopi / Beranda', boardId: board, bounds: [0, 0, 1440, 900] }] });

      // 2. Skill selection memuat alur dan contoh teruji.
      const skill = text(await agent.callTool({ name: 'read_skill', arguments: { name: 'selection' } }));
      const blocks = splitCode(skill).blocks.filter((b) => b.lang === 'js');
      const variantCode = blocks.find((b) => !b.code.startsWith(READ_ONLY_MARK))!.code;
      const checkCode = blocks.find((b) => b.code.startsWith(READ_ONLY_MARK))!.code;

      // 3. open_doc slug seleksi, lalu pengguna mengedit manual sebelum agen menulis.
      expect((await agent.callTool({ name: 'open_doc', arguments: { slug: selection.slug } })).isError).toBeFalsy();
      const manual = await req('POST', `/viewer/docs/${SLUG}/ops`, { ops: [{ op: 'update', id: hero, patch: { gap: 32 } }] });
      expect(manual.status, JSON.stringify(manual.body)).toBe(200);
      const manualRev = manual.body.data.rev as number;
      await stream.waitFor((e) => e.event === 'change' && e.data.change.kind === 'edit' && e.data.change.rev === manualRev, 'change edit manual');

      // 4. Execute varian dari skill dengan id seleksi.
      const ex = await agent.callTool({ name: 'execute', arguments: { code: withSelection(variantCode, selection.nodes.map((n: any) => n.id)), description: 'varian responsif 390 dan 768' } });
      expect(ex.isError, text(ex)).toBeFalsy();
      const lines = text(ex).split('\n');
      const out = JSON.parse(lines[0]!);
      expect(out.rev).toBe(manualRev + 1);
      const variants = out.value as string[];
      expect(variants).toHaveLength(2);
      const head = /^check board ([A-Za-z0-9]{8}), ([A-Za-z0-9]{8}): (.*)$/.exec(lines[1]!);
      expect(head, lines[1]).not.toBeNull();
      expect([head![1], head![2]].sort()).toEqual([...variants].sort());
      expect(head![3]).toBe(summaryText({ error: 0, warning: 0, gate: 0 }));

      // Pelanggan /viewer/events menerima call execute selesai (pemicu mount ulang canvas, story 3).
      const done = await stream.waitFor((e) => e.event === 'call' && e.data.call.tool === 'execute' && e.data.call.status === 'done' && e.data.call.rev === out.rev, 'call execute done');
      expect(done.data.call).toMatchObject({ client: 'lakar-mcp', slug: SLUG, description: 'varian responsif 390 dan 768' });
      expect([...done.data.call.boards].sort()).toEqual([...variants].sort());
      expect(done.data.call.created).toEqual(expect.arrayContaining(variants));
      await stream.waitFor((e) => e.event === 'call' && e.data.call.tool === 'get_selection' && e.data.call.status === 'done' && e.data.call.target === board, 'call get_selection');

      // History mencatat commit agen di atas edit manual.
      const history = (await req('GET', `/viewer/docs/${SLUG}/history`)).body.data.entries as any[];
      expect(history[0]).toMatchObject({ rev: out.rev, description: 'varian responsif 390 dan 768', client: 'lakar-mcp' });
      expect(history[1]).toMatchObject({ rev: manualRev, client: 'lakar-viewer' });

      // Dokumen: sumber hanya berisi edit manual, varian = board terpisah per lebar yang mewarisi edit manual.
      const doc = await getDoc();
      const boards = doc.pages[0].children as any[];
      const source = boards.find((b) => b.id === board);
      const heroOf = (b: any) => b.children.find((n: any) => n.name === 'Seksi / Hero');
      expect(heroOf(source).gap).toBe(32);
      expect({ ...source, children: source.children.map((n: any) => (n.id === hero ? { ...n, gap: 24 } : n)) }).toEqual(sourceBefore);
      for (const [i, w] of [390, 768].entries()) {
        const v = boards.find((b) => b.id === variants[i]);
        expect(v).toMatchObject({ name: `Kopi / Beranda / ${w}`, width: w, screen: w < 600 ? 'mobile' : 'landing', expectedSize: { width: w } });
        expect(heroOf(v).gap).toBe(32);
        const fit = v.children.find((n: any) => n.name === 'Seksi / Fitur');
        expect(fit.layout).toBe(w < 600 ? 'column' : 'row');
        // Padding bertoken: elemen token dipertahankan, hanya elemen horizontal angka yang dipangkas.
        expect(fit.children[0].padding).toEqual([{ $token: 'spacing.card' }, w < 600 ? 20 : 24]);
      }

      // 5. Cek konsistensi atas frame terpilih: baca saja, rev tetap, temuan fixture terlapor.
      await req('PUT', `/viewer/docs/${SLUG}/selection`, { addresses: [fitur] });
      const sel2 = JSON.parse(text(await agent.callTool({ name: 'get_selection', arguments: {} })));
      expect(sel2.addresses).toEqual([fitur]);
      const ck = await agent.callTool({ name: 'execute', arguments: { code: withSelection(checkCode, [sel2.nodes[0].id]), description: 'cek konsistensi seleksi' } });
      expect(ck.isError, text(ck)).toBeFalsy();
      const report = JSON.parse(text(ck).split('\n')[0]!);
      expect(report.rev).toBe(out.rev);
      expect(report.check).toBeUndefined();
      const v = report.value;
      // Sejawat bertoken (judul kartu) dan nilai token dokumen tanpa sejawat (gap 24 = spacing.card, lewat getTokens).
      expect(v.literal).toEqual([
        expect.objectContaining({ id: fitur, name: 'Seksi / Fitur', prop: 'gap', value: 24, token: 'spacing.card' }),
        expect.objectContaining({ name: 'Judul', prop: 'color', value: '#0F766E', token: 'colors.accent' }),
      ]);
      const judulLiteral = v.literal[1];
      expect(v.nearColors).toEqual([{ colors: ['#475467FF', '#475569FF'], nodes: expect.any(Array) }]);
      expect(v.nearColors[0].nodes).toHaveLength(3);
      expect(v.uneven).toEqual(expect.arrayContaining([expect.objectContaining({ prop: 'gap', nodes: expect.arrayContaining([expect.objectContaining({ id: cards[1], value: 10 })]) })]));
      expect(v.offGrid.map((n: any) => n.id)).toEqual([cards[1]]);
      expect((await req('GET', `/viewer/docs/${SLUG}/history`)).body.data.entries[0].rev).toBe(out.rev);

      // Seleksi seluruh board: judul hero (induk `Seksi / …`) bukan sejawat judul kartu (`Kartu / …`); gap hero sudah
      // 32 (edit manual) jadi tidak sama dengan spacing.card.
      const whole = await agent.callTool({ name: 'execute', arguments: { code: withSelection(checkCode, [board]), description: 'cek konsistensi board' } });
      expect(JSON.parse(text(whole).split('\n')[0]!).value.literal).toEqual([
        expect.objectContaining({ id: fitur, prop: 'gap', token: 'spacing.card' }),
        expect.objectContaining({ id: judulLiteral.id, token: 'colors.accent' }),
      ]);

      // layout_check terpisah atas varian (langkah tiket): sama dengan check di respons execute.
      const lc = await agent.callTool({ name: 'layout_check', arguments: { boardId: variants[0] } });
      expect(text(lc)).toMatch(new RegExp(`^layout_check rev ${out.rev}, 1 board \\(${variants[0]}\\): `));
      expect(text(lc).split('\n')[0]!.endsWith(summaryText({ error: 0, warning: 0, gate: 0 }))).toBe(true);

      // 6. Dua frame terpilih (bukan board) → masing-masing disalin ke board varian baru; sumber tetap.
      const fx = await agent.callTool({ name: 'execute', arguments: { code: withSelection(variantCode, [hero, fitur]), description: 'varian responsif hero' } });
      expect(fx.isError, text(fx)).toBeFalsy();
      const fLines = text(fx).split('\n');
      const fOut = JSON.parse(fLines[0]!);
      expect(fOut.rev).toBe(out.rev + 1);
      expect(fLines[1]!.endsWith(`: ${summaryText({ error: 0, warning: 0, gate: 0 })}`), fLines[1]).toBe(true);
      const after = (await getDoc()).pages[0].children as any[];
      expect(after).toHaveLength(7);
      for (const [i, [name, w]] of ([['Seksi / Hero', 390], ['Seksi / Hero', 768], ['Seksi / Fitur', 390], ['Seksi / Fitur', 768]] as const).entries()) {
        const vb = after.find((b) => b.id === fOut.value[i]);
        expect(vb).toMatchObject({ name: `${name} / ${w}`, width: w, fills: [{ type: 'solid', color: '#FFFFFF' }] });
        expect(vb.children).toHaveLength(1);
        expect(vb.children[0]).toMatchObject({ name, width: 'fill' });
        expect([hero, fitur]).not.toContain(vb.children[0].id);
      }
      expect(heroOf(after.find((b) => b.id === board)).id).toBe(hero);
    } finally {
      await agent.close();
      await stream.close();
    }
  }, 120_000);

  // epic token-tema story 2: impor CSS variables dan getTokens lewat tool MCP execute; cek `literal` skill selection
  // memakai nilai token mode efektif board (dark) dan tipe utama slot.
  it('MCP execute: importCssVariables + getTokens; literal cocok dengan nilai mode dark, bukan nilai light', async () => {
    const agent = new Client({ name: 'agen-token', version: '0' });
    try {
      const [ct, st] = InMemoryTransport.createLinkedPair();
      await createLakarMcpServer(d.url).connect(st);
      await agent.connect(ct);
      expect((await agent.callTool({ name: 'open_doc', arguments: { slug: 'tema-css' } })).isError).toBeFalsy();
      const css = ':root { --colors-bg: #ffffff; --radius-md: 12px; --shadow-card: 0 8px 24px #0003; } [data-theme="dark"] { --colors-bg: #0f0f0f; }';
      const imp = await agent.callTool({ name: 'execute', arguments: { code: `importCssVariables(${JSON.stringify(css)})`, description: 'impor token dari css' } });
      expect(imp.isError, text(imp)).toBeFalsy();
      const impOut = JSON.parse(text(imp).split('\n')[0]!);
      expect(impOut.value.tokens.map((t: any) => `${t.variable}→${t.token}:${t.type}`)).toEqual(['--colors-bg→colors.bg:color', '--radius-md→radius.md:radius']);
      expect(impOut.value.modes).toEqual(['light', 'dark']);
      expect(impOut.value.skipped).toEqual([expect.objectContaining({ source: '--shadow-card', reason: 'unsupported-value' })]);

      const read = await agent.callTool({ name: 'execute', arguments: { code: 'getTokens()', description: 'baca token dokumen' } });
      const readOut = JSON.parse(text(read).split('\n')[0]!);
      expect(readOut.rev).toBe(impOut.rev);
      expect(readOut.value).toEqual({ tokens: { 'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F' } }, 'radius.md': { type: 'radius', value: 12 } }, modes: ['light', 'dark'] });

      const mk = await agent.callTool({
        name: 'execute',
        arguments: {
          code:
            "const b = add(null, {type:'board', name:'Gelap', x:0, y:0, width:390, height:844, screen:'mobile', themeMode:'dark'});" +
            "add(b, {type:'frame', name:'Kartu Gelap', width:100, height:40, fills:[{type:'solid', color:'#0F0F0F'}]});" +
            "add(b, {type:'frame', name:'Kartu Terang', width:100, height:40, fills:[{type:'solid', color:'#FFFFFF'}]});" +
            "add(b, {type:'rect', name:'Sudut', width:40, height:40, radius:12, fills:[{type:'solid', color:'#123456'}]}); b",
          description: 'board gelap dengan literal',
        },
      });
      expect(mk.isError, text(mk)).toBeFalsy();
      const board = JSON.parse(text(mk).split('\n')[0]!).value as string;
      const skill = text(await agent.callTool({ name: 'read_skill', arguments: { name: 'selection' } }));
      const checkCode = splitCode(skill).blocks.find((b) => b.lang === 'js' && b.code.startsWith(READ_ONLY_MARK))!.code;
      const ck = await agent.callTool({ name: 'execute', arguments: { code: withSelection(checkCode, [board]), description: 'cek konsistensi token gelap' } });
      expect(ck.isError, text(ck)).toBeFalsy();
      expect(JSON.parse(text(ck).split('\n')[0]!).value.literal).toEqual([
        expect.objectContaining({ name: 'Kartu Gelap', prop: 'fills', value: '#0F0F0F', token: 'colors.bg' }),
        expect.objectContaining({ name: 'Sudut', prop: 'radius', value: 12, token: 'radius.md' }),
      ]);
    } finally {
      await agent.close();
    }
  }, 60_000);
});
