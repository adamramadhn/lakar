// Tes korpus dokumen (spine model-dokumen AD-3): setiap fixture `tests/fixtures/docs/v<n>/*.lakar.json` wajib
// bermigrasi ke SCHEMA_VERSION, lolos validasi, dan lolos `resolveDocument` (ekspansi instance + token). Render ada di `packages/render/test/corpus.test.ts`.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { beginTransaction, migrateDocument, parseDocument } from '../packages/core/src/index.ts';
import { expandInstances, HTML_TAGS, instanceIssues, NODE_TYPES, resolveDocument, resolveTokens, SCHEMA_VERSION, SVG_PRESENTATION_ATTRS, TOKEN_TYPES, type LakarDocument } from '../packages/schema/src/index.ts';
import { boardsOf, loadDocCorpus, missingVersions, type CorpusDoc } from './support/doc-corpus.ts';

const corpus = loadDocCorpus();

/** Kode LakarError yang dilempar `fn` (kelas bisa berasal dari salinan dist/src berbeda, jadi cek `code`). */
function thrownCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

type LooseNode = { type?: unknown; fills?: unknown; children?: unknown };
/** Semua node (board dan seluruh turunannya) di semua halaman dokumen mentah atau ter-parse. */
function allNodes(doc: unknown): LooseNode[] {
  const out: LooseNode[] = [];
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const n of list as LooseNode[]) {
      out.push(n);
      walk(n.children);
    }
  };
  for (const p of ((doc as { pages?: unknown }).pages as { children?: unknown }[] | undefined) ?? []) walk(p.children);
  return out;
}
/** Tipe fill yang dipakai node. */
const fillTypes = (n: LooseNode): string[] => (Array.isArray(n.fills) ? (n.fills as { type?: unknown }[]).map((f) => String(f.type)) : []);

const FILL_TYPES = ['solid', 'linear', 'radial', 'conic', 'noise', 'mesh', 'image'] as const;
const V2_ONLY_FILLS = new Set(['conic', 'noise', 'mesh']);

describe('korpus dokumen: cakupan versi', () => {
  it('setiap versi 1..SCHEMA_VERSION punya minimal satu fixture', () => {
    expect(missingVersions(corpus, SCHEMA_VERSION), 'versi tanpa fixture di tests/fixtures/docs').toEqual([]);
  });

  it('missingVersions mendeteksi versi yang kosong', () => {
    expect(missingVersions([{ version: 1 }], 3)).toEqual([2, 3]);
    expect(missingVersions([], 1)).toEqual([1]);
  });

  it('tidak ada fixture dengan versi di atas SCHEMA_VERSION', () => {
    expect(corpus.filter((d) => d.version > SCHEMA_VERSION).map((d) => d.path)).toEqual([]);
  });
});

describe('korpus dokumen: migrasi, validasi, resolveDocument', () => {
  it.each(corpus.map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('%s', (_label, d) => {
    let doc;
    try {
      doc = parseDocument(d.raw);
    } catch (e) {
      throw new Error(`${d.path}: parseDocument gagal: ${(e as Error).message}`);
    }
    expect(doc.schemaVersion, d.path).toBe(SCHEMA_VERSION);
    try {
      resolveDocument(doc);
    } catch (e) {
      throw new Error(`${d.path}: resolveDocument gagal: ${(e as Error).message}`);
    }
  });

  it('fixture rusak (pages: []) ditolak SCHEMA_INVALID', () => {
    const broken = { ...structuredClone(corpus[0]!.raw), pages: [] };
    expect(thrownCode(() => parseDocument(broken))).toBe('SCHEMA_INVALID');
  });

  it('fixture v1 tidak memakai fill khusus v2 (conic/noise/mesh)', () => {
    const offenders = corpus
      .filter((d) => d.version === 1)
      .flatMap((d) => allNodes(d.raw).flatMap((n) => fillTypes(n).filter((t) => V2_ONLY_FILLS.has(t)).map((t) => `${d.path}: fill ${t}`)));
    expect(offenders).toEqual([]);
  });

  it('gabungan korpus mencakup semua tipe node dan semua jenis fill', () => {
    const nodes = corpus.flatMap((d) => allNodes(parseDocument(d.raw)));
    const types = new Set(nodes.map((n) => String(n.type)));
    const fills = new Set(nodes.flatMap(fillTypes));
    expect(NODE_TYPES.filter((t) => !types.has(t)), 'tipe node tanpa fixture').toEqual([]);
    expect(FILL_TYPES.filter((t) => !fills.has(t)), 'jenis fill tanpa fixture').toEqual([]);
  });

  it('boardsOf mengembalikan board dari semua halaman', () => {
    const d = corpus.find((x) => x.version === 1 && x.name === 'landing-dua-halaman')!;
    const doc = parseDocument(d.raw);
    expect(doc.pages.length).toBeGreaterThanOrEqual(2);
    const boards = boardsOf(doc);
    expect(boards.length).toBe(doc.pages.reduce((n, p) => n + p.children.length, 0));
    expect(new Set(boards.map((b) => b.page))).toEqual(new Set(doc.pages.map((p) => p.name)));
  });

  it('migrasi tidak memutasi raw fixture', () => {
    const v1 = corpus.find((d) => d.version === 1)!;
    const before = JSON.stringify(v1.raw);
    parseDocument(v1.raw);
    expect(JSON.stringify(v1.raw)).toBe(before);
  });
});

/** Substitusi ref `{$token}` di `raw.pages` dengan nilai token datar lama (v1/v2), tanpa skema. */
function substituteFlat(raw: Record<string, unknown>): unknown {
  const tokens = (raw.tokens ?? {}) as Record<string, unknown>;
  const sub = (v: unknown): unknown => {
    if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 1 && typeof (v as { $token?: unknown }).$token === 'string') {
      return tokens[(v as { $token: string }).$token];
    }
    if (Array.isArray(v)) return v.map(sub);
    if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)]));
    return v;
  };
  return sub(raw.pages);
}

describe('korpus dokumen: migrasi token v2 → v3 (AD-11)', () => {
  it.each(corpus.filter((d) => d.version < 3).map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('tampilan tetap: %s', (_label, d) => {
    expect(resolveTokens(parseDocument(d.raw)).pages, d.path).toEqual(substituteFlat(d.raw));
  });

  it('fixture v3 memakai semua tipe token, dua mode, board dengan dan tanpa themeMode', () => {
    const v3 = corpus.filter((d) => d.version === 3).map((d) => parseDocument(d.raw));
    const types = new Set(v3.flatMap((doc) => Object.values(doc.tokens ?? {}).map((t) => t.type)));
    expect(TOKEN_TYPES.filter((t) => !types.has(t)), 'tipe token tanpa fixture v3').toEqual([]);
    expect(v3.some((doc) => doc.tokenModes?.join() === 'light,dark' && Object.values(doc.tokens ?? {}).some((t) => t.modes))).toBe(true);
    const boards = v3.flatMap((doc) => doc.pages.flatMap((p) => p.children));
    expect(boards.some((b) => b.themeMode === 'dark')).toBe(true);
    expect(boards.some((b) => b.themeMode === undefined)).toBe(true);
  });

  it('fixture v3 tema-mode: board gelap memakai nilai mode dark, board terang memakai value/modes.light', () => {
    const d = corpus.find((x) => x.version === 3 && x.name === 'tema-mode')!;
    const r = resolveTokens(parseDocument(d.raw));
    const [light, dark] = r.pages[0]!.children;
    expect(light!.fills).toEqual([{ type: 'solid', color: '#FFFFFF' }]);
    expect(dark!.fills).toEqual([{ type: 'solid', color: '#0B0C0F' }]);
    expect(light!.children[0]).toMatchObject({ gap: 16, padding: 16, maxWidth: 350, radius: 16 });
    expect(dark!.children[0]).toMatchObject({ gap: 20, padding: 20 });
    const icon = (b: typeof light) => (b!.children[0] as { children: { color?: string; weight?: number }[] }).children;
    expect(icon(light)[0]!.color).toBe('#1D4ED8');
    expect(icon(dark)[0]!.color).toBe('#60A5FA');
    expect([icon(light)[1]!.weight, icon(dark)[1]!.weight]).toEqual([600, 700]);
    const forced = resolveTokens(parseDocument(d.raw), { mode: 'dark' });
    expect(forced.pages[0]!.children[0]!.fills).toEqual([{ type: 'solid', color: '#0B0C0F' }]);
  });
});

describe('korpus dokumen: migrasi v3 → v4 (grid, AD-13)', () => {
  it.each(corpus.filter((d) => d.version === 3).map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('identitas: %s', (_label, d) => {
    expect(migrateDocument(d.raw, { target: 4 }), d.path).toEqual({ ...d.raw, schemaVersion: 4 });
  });

  it.each(corpus.filter((d) => d.version < 4).map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('%s: hasil v3 = hasil versi kini kecuali versi', (_label, d) => {
    const v3 = migrateDocument(d.raw, { target: 3 }) as Record<string, unknown>;
    expect(parseDocument(d.raw), d.path).toEqual({ ...v3, schemaVersion: SCHEMA_VERSION });
  });

  it('fixture v4 memakai grid: semua jenis track, rows, gap sumbu, penempatan span dan start/end', () => {
    const v4 = corpus.filter((d) => d.version === 4).map((d) => parseDocument(d.raw));
    const nodes = v4.flatMap((doc) => allNodes(doc)) as Record<string, unknown>[];
    const grids = nodes.filter((n) => n.type === 'frame' && n.layout === 'grid');
    const tracks = grids.flatMap((g) => [...((g.gridTemplateColumns as unknown[]) ?? []), ...((g.gridTemplateRows as unknown[]) ?? [])]);
    const kind = (t: unknown) => (typeof t === 'number' ? 'px' : t === 'auto' ? 'auto' : Object.keys(t as object)[0]);
    expect(new Set(tracks.map(kind))).toEqual(new Set(['px', 'fr', 'auto', 'minmax']));
    expect(grids.some((g) => g.gridTemplateRows !== undefined && g.columnGap !== undefined && g.rowGap !== undefined)).toBe(true);
    const places = nodes.flatMap((n) => [n.gridColumn, n.gridRow]).filter(Boolean) as Record<string, number>[];
    expect(places.some((p) => p.span !== undefined)).toBe(true);
    expect(places.some((p) => p.start !== undefined && p.end !== undefined)).toBe(true);
  });
});

/** Node ter-ekspansi berdasarkan alamat (id) di seluruh dokumen. */
function byAddress(doc: unknown): Map<string, Record<string, unknown>> {
  return new Map(allNodes(doc).map((n) => [String((n as { id?: unknown }).id), n as Record<string, unknown>]));
}

describe('korpus dokumen: migrasi v4 → v5 (komponen, AD-12)', () => {
  it.each(corpus.filter((d) => d.version === 4).map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('identitas: %s', (_label, d) => {
    expect(migrateDocument(d.raw, { target: 5 }), d.path).toEqual({ ...d.raw, schemaVersion: 5 });
  });

  it.each(corpus.filter((d) => d.version < 5).map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('%s: tanpa instance, expandInstances = dokumen itu sendiri', (_label, d) => {
    const doc = parseDocument(d.raw);
    expect(expandInstances(doc)).toBe(doc);
    expect(resolveDocument(doc)).toEqual(resolveTokens(doc));
  });

  const v5 = () => parseDocument(corpus.find((x) => x.version === 5 && x.name === 'komponen-kartu')!.raw);

  it('fixture v5 memakai master, prop text/boolean/enum, slot, override akar/anak/bersarang, dan instance bersarang', () => {
    const nodes = allNodes(v5()) as Record<string, unknown>[];
    const masters = nodes.filter((n) => n.component !== undefined) as { component: { props: { type: string }[]; slots: unknown[] } }[];
    expect(new Set(masters.flatMap((m) => m.component.props.map((p) => p.type)))).toEqual(new Set(['text', 'boolean', 'enum']));
    expect(masters.some((m) => m.component.slots.length > 0)).toBe(true);
    const instances = nodes.filter((n) => n.type === 'instance') as { overrides?: Record<string, unknown>; slots?: unknown; componentId: string }[];
    expect(instances.some((i) => Object.keys(i.overrides ?? {}).some((k) => k.includes('/')))).toBe(true);
    expect(instances.some((i) => i.overrides && Object.hasOwn(i.overrides, i.componentId))).toBe(true);
    expect(instances.some((i) => i.slots !== undefined)).toBe(true);
  });

  it('fixture v5 ter-resolve: alamat komposit, props, override, slot, dan token', () => {
    const r = resolveDocument(v5());
    expect(instanceIssues(r)).toEqual([]);
    const at = byAddress(r);
    expect(at.get('InsCard1')).toMatchObject({ type: 'frame', name: 'Card / promo', fills: [{ type: 'solid', color: '#FEF3C7' }] });
    expect(at.get('InsCard1')!.component).toBeUndefined();
    expect(at.get('InsCard1/TxtCard1')).toMatchObject({ content: 'Promo minggu ini', color: '#101828' });
    expect(at.get('InsCard1/InsBadg0/TxtBadg1')).toMatchObject({ content: 'Hemat' });
    expect(at.get('InsCard1/TxtCard2')).toMatchObject({ content: 'Isi bawaan kartu', color: '#7C2D12' });
    expect(at.get('InsCard1/IcnCard1')).toMatchObject({ icon: 'star' });
    expect(at.has('InsCard2/InsBadg0')).toBe(false);
    expect(at.get('InsCard2/IcnCard1')).toMatchObject({ icon: 'check' });
    expect((at.get('InsCard2/BdyCard1')!.children as { id: string }[]).map((c) => c.id)).toEqual(['TxtSlot1']);
    expect(at.get('TxtSlot1')).toMatchObject({ color: '#101828' });
    expect(at.get('InsBadg2/TxtBadg1')).toMatchObject({ content: 'Draf' });
    // Master tetap tampil apa adanya; master bersarang di Card ikut terurai di tempat tersimpannya.
    expect(at.get('MstCard1')!.component).toBeDefined();
    expect(at.get('InsBadg0/TxtBadg1')).toMatchObject({ content: 'Baru' });
  });

  it('mengubah master memperbarui semua instance tanpa menimpa override', () => {
    const doc = v5() as LakarDocument;
    const master = byAddress(doc).get('MstCard1')!;
    master.fills = [{ type: 'solid', color: '#E0F2FE' }];
    master.radius = 20;
    const desc = byAddress(doc).get('TxtCard2')!;
    desc.content = 'Isi master baru';
    desc.color = '#000000';
    const at = byAddress(resolveDocument(doc));
    expect(at.get('InsCard2')).toMatchObject({ fills: [{ type: 'solid', color: '#E0F2FE' }], radius: 20 });
    expect(at.get('InsCard1')).toMatchObject({ fills: [{ type: 'solid', color: '#FEF3C7' }], radius: 20 });
    expect(at.get('InsCard1/TxtCard2')).toMatchObject({ content: 'Isi master baru', color: '#7C2D12' });
    expect(at.get('InsCard1/InsBadg0/TxtBadg1')).toMatchObject({ content: 'Hemat' });
  });

  it('jalur mutasi core: update master lewat transaksi memperbarui instance tanpa menimpa override', () => {
    const tx = beginTransaction(v5(), { sessionId: 'tes-korpus' });
    tx.update('MstCard1', { radius: 20, fills: [{ type: 'solid', color: '#E0F2FE' }] });
    tx.update('TxtCard2', { content: 'Isi master baru', color: '#000000' });
    const at = byAddress(resolveDocument(tx.commit('ubah master').doc));
    expect(at.get('InsCard2')).toMatchObject({ fills: [{ type: 'solid', color: '#E0F2FE' }], radius: 20 });
    expect(at.get('InsCard1')).toMatchObject({ fills: [{ type: 'solid', color: '#FEF3C7' }], radius: 20 });
    expect(at.get('InsCard1/TxtCard2')).toMatchObject({ content: 'Isi master baru', color: '#7C2D12' });
  });

  it('jalur mutasi core: commit yang membuat siklus komponen ditolak SCHEMA_INVALID, dokumen asli utuh', () => {
    const doc = v5();
    const before = structuredClone(doc);
    const tx = beginTransaction(doc, { sessionId: 'tes-korpus' });
    tx.add('BdyCard1', { type: 'instance', name: 'Siklus', componentId: 'MstCard1' });
    expect(thrownCode(() => tx.commit('siklus'))).toBe('SCHEMA_INVALID');
    expect(doc).toEqual(before);
  });
});

describe('korpus dokumen: migrasi v5 → v6 (vektor, AD-14)', () => {
  it.each(corpus.filter((d) => d.version === 5).map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('identitas: %s', (_label, d) => {
    expect(migrateDocument(d.raw, { target: 6 }), d.path).toEqual({ ...d.raw, schemaVersion: 6 });
  });

  it.each(corpus.filter((d) => d.version < 6).map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('%s: hasil v5 = hasil versi kini kecuali versi', (_label, d) => {
    const v5 = migrateDocument(d.raw, { target: 5 }) as Record<string, unknown>;
    expect(parseDocument(d.raw), d.path).toEqual({ ...v5, schemaVersion: SCHEMA_VERSION });
  });

  it('fixture v6 memakai semua atribut vektor bertipe, semua atribut allowlist svg, dan frame ikon multi-path', () => {
    const nodes = corpus.filter((d) => d.version === 6).flatMap((d) => allNodes(parseDocument(d.raw))) as Record<string, unknown>[];
    const paths = nodes.filter((n) => n.type === 'path');
    for (const k of ['fillRule', 'strokeLinecap', 'strokeLinejoin', 'strokeDasharray', 'strokeMiterlimit']) expect(paths.some((p) => p[k] !== undefined), k).toBe(true);
    expect(new Set(paths.map((p) => p.fillRule).filter(Boolean))).toEqual(new Set(['evenodd']));
    expect(new Set(paths.map((p) => p.strokeLinecap).filter(Boolean))).toEqual(new Set(['round', 'square', 'butt']));
    expect(new Set(paths.map((p) => p.strokeLinejoin).filter(Boolean))).toEqual(new Set(['round', 'miter', 'bevel']));
    const attrs = new Set(paths.flatMap((p) => Object.keys((p.svg as object | undefined) ?? {})));
    expect([...attrs].sort()).toEqual([...SVG_PRESENTATION_ATTRS]);
    const frames = nodes.filter((n) => n.type === 'frame' && (n.children as { type: string }[]).length > 1 && (n.children as { type: string }[]).every((c) => c.type === 'path'));
    expect(frames.length).toBeGreaterThan(0);
    expect(new Set(paths.map((p) => (p.stroke as { align?: string } | undefined)?.align).filter(Boolean))).toEqual(new Set(['center', 'inside', 'outside']));
  });

  const v6 = () => parseDocument(corpus.find((x) => x.version === 6 && x.name === 'ikon-vektor')!.raw);

  it('jalur mutasi core: update properti vektor diterima; svg di luar allowlist ditolak SCHEMA_INVALID, dokumen asli utuh', () => {
    const ok = beginTransaction(v6(), { sessionId: 'tes-korpus' });
    ok.update('PthZig01', { strokeLinecap: 'round', strokeDasharray: [4, 2], svg: { 'stroke-opacity': '0.5' } });
    expect(byAddress(ok.commit('vektor').doc).get('PthZig01')).toMatchObject({ strokeLinecap: 'round', strokeDasharray: [4, 2], svg: { 'stroke-opacity': '0.5' } });
    const doc = v6();
    const before = structuredClone(doc);
    for (const patch of [{ svg: { transform: 'rotate(4)' } }, { svg: { 'stroke-opacity': 'url(#a)' } }]) {
      const tx = beginTransaction(doc, { sessionId: 'tes-korpus' });
      expect(thrownCode(() => {
        tx.update('PthZig01', patch);
        tx.commit('di luar allowlist');
      })).toBe('SCHEMA_INVALID');
    }
    expect(doc).toEqual(before);
  });
});

describe('korpus dokumen: migrasi v6 → v7 (tag semantik, AD-1)', () => {
  it.each(corpus.filter((d) => d.version === 6).map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('identitas: %s', (_label, d) => {
    expect(migrateDocument(d.raw, { target: 7 }), d.path).toEqual({ ...d.raw, schemaVersion: 7 });
  });

  it.each(corpus.filter((d) => d.version < 7).map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('%s: hasil v6 = hasil versi kini kecuali versi', (_label, d) => {
    const v6 = migrateDocument(d.raw, { target: 6 }) as Record<string, unknown>;
    expect(parseDocument(d.raw), d.path).toEqual({ ...v6, schemaVersion: SCHEMA_VERSION });
  });

  it('fixture v7 (hasil paste HTML sampel) memakai tag pada frame dan text, dan auto layout row/column/grid', () => {
    const nodes = corpus.filter((d) => d.version === 7).flatMap((d) => allNodes(parseDocument(d.raw))) as Record<string, unknown>[];
    const tags = new Set(nodes.map((n) => n.tag).filter(Boolean));
    for (const t of ['article', 'nav', 'section', 'h3', 'p', 'button', 'a', 'ul', 'li']) expect(tags.has(t), t).toBe(true);
    for (const t of tags) expect((HTML_TAGS as readonly unknown[]).includes(t)).toBe(true);
    expect(new Set(nodes.filter((n) => n.tag).map((n) => n.type))).toEqual(new Set(['frame', 'text']));
    expect(new Set(nodes.map((n) => n.layout).filter(Boolean))).toEqual(new Set(['row', 'column', 'grid']));
  });

  it('jalur mutasi core: tag di allowlist diterima; tag asing dan tag pada rect ditolak SCHEMA_INVALID', () => {
    const doc = parseDocument(corpus.find((x) => x.version === 7)!.raw);
    const frame = (allNodes(doc) as Record<string, unknown>[]).find((n) => n.type === 'frame' && n.tag === 'nav')!;
    const rect = (allNodes(doc) as Record<string, unknown>[]).find((n) => n.type === 'rect')!;
    const ok = beginTransaction(doc, { sessionId: 'tes-korpus' });
    ok.update(frame.id as string, { tag: 'header' });
    expect(byAddress(ok.commit('tag').doc).get(frame.id as string)).toMatchObject({ tag: 'header' });
    for (const [id, patch] of [[frame.id, { tag: 'div' }], [rect.id, { tag: 'p' }]] as const) {
      const tx = beginTransaction(doc, { sessionId: 'tes-korpus' });
      expect(thrownCode(() => {
        tx.update(id as string, patch);
        tx.commit('tag salah');
      })).toBe('SCHEMA_INVALID');
    }
  });
});

describe("korpus dokumen: migrasi v7 → v8 (board height:'hug', spec-board-hug-height)", () => {
  it.each(corpus.filter((d) => d.version === 7).map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('identitas: %s', (_label, d) => {
    expect(migrateDocument(d.raw), d.path).toEqual({ ...d.raw, schemaVersion: SCHEMA_VERSION });
  });

  it.each(corpus.filter((d) => d.version < 8).map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('%s: tinggi board tetap angka setelah migrasi', (_label, d) => {
    for (const p of parseDocument(d.raw).pages) for (const b of p.children) expect(typeof b.height, `${d.path} ${b.id}`).toBe('number');
  });

  it("fixture v8 memuat board height:'hug' (landing) di samping board bertinggi angka", () => {
    const boards = corpus.filter((d) => d.version === 8).flatMap((d) => parseDocument(d.raw).pages.flatMap((p) => p.children));
    expect(boards.some((b) => b.height === 'hug' && b.screen === 'landing')).toBe(true);
    expect(boards.some((b) => typeof b.height === 'number')).toBe(true);
  });

  it("jalur mutasi core: hug ↔ angka lewat update; 'fill' dan string lain ditolak SCHEMA_INVALID", () => {
    const doc = parseDocument(corpus.find((x) => x.version === 8)!.raw);
    const hug = doc.pages.flatMap((p) => p.children).find((b) => b.height === 'hug')!;
    const tx = beginTransaction(doc, { sessionId: 'tes-korpus' });
    tx.update(hug.id, { height: 2400 });
    const fixed = tx.commit('fixed').doc;
    expect(byAddress(fixed).get(hug.id)).toMatchObject({ height: 2400 });
    const back = beginTransaction(fixed, { sessionId: 'tes-korpus' });
    back.update(hug.id, { height: 'hug' });
    expect(byAddress(back.commit('hug').doc).get(hug.id)).toMatchObject({ height: 'hug' });
    for (const height of ['fill', 'auto']) {
      const bad = beginTransaction(doc, { sessionId: 'tes-korpus' });
      expect(thrownCode(() => {
        bad.update(hug.id, { height });
        bad.commit('tinggi salah');
      })).toBe('SCHEMA_INVALID');
    }
  });
});

describe('korpus dokumen: migrasi v8 → v9 (frame wrap, epic adopsi-open-pencil)', () => {
  it.each(corpus.filter((d) => d.version === 8).map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('identitas: %s', (_label, d) => {
    expect(migrateDocument(d.raw), d.path).toEqual({ ...d.raw, schemaVersion: SCHEMA_VERSION });
  });

  it.each(corpus.filter((d) => d.version < 9).map((d): [string, CorpusDoc] => [`v${d.version}/${d.name}`, d]))('%s: tanpa frame wrap di versi lama', (_label, d) => {
    // Hanya frame: text sudah punya `wrap` enum (auto|wrap|fixed) jauh sebelum v9.
    const frames = (allNodes(parseDocument(d.raw)) as Record<string, unknown>[]).filter((n) => n.type === 'frame');
    for (const n of frames) expect(n.wrap, `${d.path} ${String(n.id)}`).toBeUndefined();
  });

  it('fixture v9 memakai wrap:true pada frame row dan column dengan gap sumbu silang', () => {
    const frames = (corpus.filter((d) => d.version === 9).flatMap((d) => allNodes(parseDocument(d.raw))) as Record<string, unknown>[]).filter((n) => n.type === 'frame' && n.wrap === true);
    expect(frames.some((f) => f.layout === 'row' && f.rowGap !== undefined)).toBe(true);
    expect(frames.some((f) => f.layout === 'column' && f.columnGap !== undefined)).toBe(true);
  });

  it('jalur mutasi core: wrap boolean ↔ hapus lewat update; non-boolean dan wrap di node lain ditolak SCHEMA_INVALID', () => {
    const doc = parseDocument(corpus.find((x) => x.version === 9)!.raw);
    const frames = (allNodes(doc) as Record<string, unknown>[]).filter((n) => n.type === 'frame');
    const wrapFrame = frames.find((n) => n.wrap === true)!;
    const rect = (allNodes(doc) as Record<string, unknown>[]).find((n) => n.type === 'rect')!;
    const tx = beginTransaction(doc, { sessionId: 'tes-korpus' });
    tx.update(wrapFrame.id as string, { wrap: null });
    const off = tx.commit('tanpa wrap').doc;
    expect(byAddress(off).get(wrapFrame.id as string)!.wrap).toBeUndefined();
    const back = beginTransaction(off, { sessionId: 'tes-korpus' });
    back.update(wrapFrame.id as string, { wrap: true });
    expect(byAddress(back.commit('wrap').doc).get(wrapFrame.id as string)).toMatchObject({ wrap: true });
    for (const [id, patch] of [
      [wrapFrame.id, { wrap: 'yes' }],
      [wrapFrame.id, { wrap: 1 }],
      [rect.id, { wrap: true }],
    ] as const) {
      const bad = beginTransaction(doc, { sessionId: 'tes-korpus' });
      expect(thrownCode(() => {
        bad.update(id as string, patch);
        bad.commit('wrap salah');
      })).toBe('SCHEMA_INVALID');
    }
    expect(doc).toEqual(parseDocument(corpus.find((x) => x.version === 9)!.raw));
  });
});

describe('korpus dokumen: loader', () => {
  let tmp: string | undefined;
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  const write = (rel: string, body: string) => {
    tmp ??= mkdtempSync(join(tmpdir(), 'lakar-corpus-'));
    const path = join(tmp, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    return path;
  };

  it('folder ≠ schemaVersion → error menyebut path file', () => {
    write('v1/ok.lakar.json', JSON.stringify({ schemaVersion: 1 }));
    const bad = write('v1/salah-folder.lakar.json', JSON.stringify({ schemaVersion: 2 }));
    expect(() => loadDocCorpus(tmp)).toThrow(bad);
  });

  it('JSON rusak → error menyebut path file', () => {
    const bad = write('v2/rusak.lakar.json', '{ "schemaVersion": 2, ');
    expect(() => loadDocCorpus(tmp)).toThrow(bad);
  });

  it('membaca v<n>/*.lakar.json saja, urut versi lalu nama', () => {
    write('v2/b.lakar.json', JSON.stringify({ schemaVersion: 2 }));
    write('v2/a.lakar.json', JSON.stringify({ schemaVersion: 2 }));
    write('v1/z.lakar.json', JSON.stringify({ schemaVersion: 1 }));
    write('v1/catatan.json', '{}');
    write('assets/x.lakar.json', '{}');
    expect(loadDocCorpus(tmp).map((d) => `${d.version}/${d.name}`)).toEqual(['1/z', '2/a', '2/b']);
  });

  it('fixture tidak valid di v2 → tes validasi menyebut nama file', () => {
    const bad = write('v2/node-asing.lakar.json', JSON.stringify({ ...corpus.find((d) => d.version === 2)!.raw, pages: [] }));
    const [d] = loadDocCorpus(tmp);
    expect(d!.path).toBe(bad);
    expect(d!.name).toBe('node-asing');
    expect(thrownCode(() => parseDocument(d!.raw))).toBe('SCHEMA_INVALID');
  });
});
