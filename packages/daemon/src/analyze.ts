// Audit desain untuk agen (story 9.6): tiga route baca-saja yang menganalisis dokumen aktif sesi —
// frekuensi warna (literal vs terikat token + kandidat terdekat), gaya teks (off-scale vs skala
// DESIGN.md), dan struktur berulang sebagai kandidat komponen. Semua dihitung pada dokumen TERSIMPAN:
// ref {$token} harus tetap terlihat supaya bound/literal bisa dibedakan. Tanpa commit/riwayat/state.
import type { FastifyInstance, FastifyReply } from 'fastify';
import { DISPLAY_SIZES, ID_PATTERN, LakarError, SESSION_HEADER, TYPE_SCALE, findTokenRefs, type AnyNode, type LakarDocument, type TokenRef, type TokenType } from '@lakar/schema';
import { z } from 'zod';
import type { ActiveDoc } from './agent-pages.js';

export type AnalyzeRoutesOptions = {
  docs: Map<string, LakarDocument>;
  activeDoc: ActiveDoc;
};

const parse = <S extends z.ZodType>(schema: S, body: unknown, hint: string): z.output<S> => {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint });
  return r.data;
};

const ok = (reply: FastifyReply, data: unknown) => reply.code(200).send({ ok: true, data });

export const ScopeBody = z.object({ boardId: z.string().regex(ID_PATTERN).optional() }).strict();
export const ClustersBody = ScopeBody.extend({ min: z.number().int().min(2).max(50).optional() });
export const SCOPE_HINT = 'kirim {} (seluruh dokumen aktif) atau {boardId} (satu board)';
export const CLUSTERS_HINT = 'kirim {} , {boardId}, dan/atau {min} (batas minimal pengulangan, default 3)';
const NO_ACTIVE_DOC_HINT = 'open_doc dulu di sesi ini';

/** Batas entri per daftar di respons (uses/nodeIds) supaya output MCP terbatas; `truncated` menandai sisanya. */
const USES_MAX = 20;
const HEX = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
const isTokenRef = (v: unknown): v is TokenRef =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 1 && typeof (v as { $token?: unknown }).$token === 'string';

type Located = { node: AnyNode; pageId: string; boardId: string };

/** Semua node dokumen tersimpan (board + keturunan + isi slot instance), dengan pageId+boardId. */
function allNodes(doc: LakarDocument, boardId?: string): Located[] {
  const out: Located[] = [];
  const walk = (n: AnyNode, pageId: string, boardId: string) => {
    out.push({ node: n, pageId, boardId });
    if ('children' in n) for (const c of n.children) walk(c, pageId, boardId);
    if (n.type === 'instance') for (const kids of Object.values(n.slots ?? {})) for (const c of kids) walk(c, pageId, boardId);
  };
  for (const p of doc.pages) {
    for (const b of p.children) {
      if (boardId && b.id !== boardId) continue;
      walk(b, p.id, b.id);
    }
  }
  return out;
}

export const requireBoard = (doc: LakarDocument, boardId: string | undefined, slug: string): void => {
  if (boardId && !doc.pages.some((p) => p.children.some((b) => b.id === boardId)))
    throw new LakarError('NOT_FOUND', `board ${boardId} tidak ada di dokumen ${slug}`, { hint: 'pakai boardId dari list_boards' });
};

// ---------------------------------------------------------------------------
// analyze_colors
// ---------------------------------------------------------------------------

const rgbOf = (hex: string): [number, number, number] | undefined => {
  if (!HEX.test(hex)) return undefined;
  const h = hex.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const dist2 = (a: [number, number, number], b: [number, number, number]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

type TokenEntry = { type: TokenType; value: unknown; modes?: Record<string, unknown> };
const colorTokens = (doc: LakarDocument): { name: string; rgb: [number, number, number] }[] => {
  const out: { name: string; rgb: [number, number, number] }[] = [];
  for (const [name, def] of Object.entries((doc.tokens ?? {}) as Record<string, TokenEntry>)) {
    if (def.type !== 'color') continue;
    const rgb = typeof def.value === 'string' ? rgbOf(def.value) : undefined;
    if (rgb) out.push({ name, rgb });
  }
  return out;
};

type ColorUse = { nodeId: string; prop: string; pageId: string; boardId: string };
type ColorBucket = { value: string; bound: boolean; token?: string; uses: ColorUse[]; count: number };

/** Path berwarna: kunci `color` (solid/stroke/text/icon), indeks di dalam `colors` (mesh), atau string apa pun di `props` instance. */
const isColorPath = (path: readonly (string | number)[], rootKey: string): boolean => {
  const leaf = path.at(-1);
  if (leaf === 'color') return true;
  if (typeof leaf === 'number' && path.at(-2) === 'colors') return true;
  return rootKey === 'props';
};

/** Frekuensi warna di seluruh node: literal hex vs ref {$token}; mesh colors[] dan props instance ikut dihitung. */
export function analyzeColors(doc: LakarDocument, boardId?: string): { colors: unknown[] } {
  const buckets = new Map<string, ColorBucket>();
  // Kunci map dinormalkan per jenis: hex → uppercase, bound → apa adanya (nama token lowercase).
  const keyOf = (v: string) => (v.startsWith('{$token:') ? v : v.toUpperCase());
  const put = (value: string, bound: boolean, token: string | undefined, use: ColorUse) => {
    const k = keyOf(value);
    const b = buckets.get(k) ?? { value: k, bound, ...(token ? { token } : {}), uses: [], count: 0 };
    b.count += 1;
    if (b.uses.length < USES_MAX) b.uses.push(use);
    buckets.set(k, b);
  };
  for (const { node, pageId, boardId: bid } of allNodes(doc, boardId)) {
    const use = (prop: (string | number)[]): ColorUse => ({ nodeId: node.id, prop: prop.join('.'), pageId, boardId: bid });
    const rec = node as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(rec)) {
      if (k === 'children' || k === 'slots') continue;
      for (const ref of findTokenRefs(v)) {
        const leaf = ref.path.length ? ref.path.at(-1) : k;
        const parent = ref.path.length >= 2 ? ref.path.at(-2) : k === 'props' || k === 'colors' ? k : undefined;
        if (leaf === 'color' || (typeof leaf === 'number' && parent === 'colors')) put(`{$token:${ref.token}}`, true, ref.token, use([k, ...ref.path]));
      }
      const walk = (x: unknown, path: (string | number)[]) => {
        if (typeof x === 'string' && HEX.test(x) && isColorPath(path, k)) put(x, false, undefined, use(path));
        else if (Array.isArray(x)) x.forEach((e, i) => walk(e, [...path, i]));
        else if (x && typeof x === 'object' && !isTokenRef(x)) for (const [ek, ev] of Object.entries(x)) walk(ev, [...path, ek]);
      };
      walk(v, [k]);
    }
  }
  const cands = colorTokens(doc);
  const colors = [...buckets.values()]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .map((b) => {
      const base = { value: b.value, count: b.count, bound: b.bound, uses: b.uses, ...(b.count > b.uses.length ? { truncated: true } : {}) };
      if (b.bound) return { ...base, token: b.token };
      const rgb = rgbOf(b.value);
      if (!rgb || !cands.length) return base;
      const candidates = cands
        .map((c) => ({ token: c.name, distance: Math.round(Math.sqrt(dist2(rgb, c.rgb)) * 10) / 10 }))
        .sort((x, y) => x.distance - y.distance || x.token.localeCompare(y.token))
        .slice(0, 3);
      return { ...base, candidates };
    });
  return { colors };
}

// ---------------------------------------------------------------------------
// analyze_typography
// ---------------------------------------------------------------------------

const SCALE_SIZES = new Set([...Object.values(TYPE_SCALE).map((t) => t.size), ...DISPLAY_SIZES]);
const NEAREST_SIZES = [...SCALE_SIZES].sort((a, b) => a - b);
const nearestSize = (v: number): number => NEAREST_SIZES.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), NEAREST_SIZES[0]!);

type StyleKey = { family: unknown; size: unknown; weight: unknown; style: unknown; lineHeight: unknown; letterSpacing: unknown };
const val = (v: unknown): string | number | undefined => (isTokenRef(v) ? `{$token:${v.$token}}` : typeof v === 'string' || typeof v === 'number' ? v : undefined);

/** Frekuensi gaya teks (node `text`) + tanda offScale untuk size literal di luar skala. */
export function analyzeTypography(doc: LakarDocument, boardId?: string): { styles: unknown[] } {
  const groups = new Map<string, { key: StyleKey; nodeIds: string[]; count: number }>();
  for (const { node } of allNodes(doc, boardId)) {
    if (node.type !== 'text') continue;
    const t = node as unknown as Record<string, unknown>;
    const key: StyleKey = { family: t.family, size: t.size, weight: t.weight, style: t.style, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing };
    const k = JSON.stringify(key);
    const g = groups.get(k) ?? { key, nodeIds: [], count: 0 };
    g.count += 1;
    if (g.nodeIds.length < USES_MAX) g.nodeIds.push(node.id);
    groups.set(k, g);
  }
  const styles = [...groups.values()]
    .sort((a, b) => b.count - a.count || JSON.stringify(a.key).localeCompare(JSON.stringify(b.key)))
    .map((g) => {
      const out: Record<string, unknown> = { count: g.count, nodeIds: g.nodeIds, ...(g.count > g.nodeIds.length ? { truncated: true } : {}) };
      for (const [k, v] of Object.entries(g.key)) {
        const s = val(v);
        if (s !== undefined) out[k] = s;
      }
      const size = typeof g.key.size === 'number' ? g.key.size : undefined;
      if (size !== undefined && !SCALE_SIZES.has(size)) {
        out.offScale = true;
        out.suggestedSize = nearestSize(size);
      }
      return out;
    });
  return { styles };
}

// ---------------------------------------------------------------------------
// analyze_clusters
// ---------------------------------------------------------------------------

const IGNORED_PROPS = new Set(['id', 'name', 'x', 'y', 'width', 'height', 'children', 'slots', 'component', 'content']);

/** Signature struktur: tipe + prop terurut (nilai primitif ikut: layout/gap membedakan klaster; content diabaikan) + sig anak/slot. */
function signature(n: AnyNode): string {
  const props = Object.entries(n as unknown as Record<string, unknown>)
    .filter(([k]) => !IGNORED_PROPS.has(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? `${k}=${JSON.stringify(v)}` : k));
  let sig = `${n.type}<${props.join(',')}>`;
  if ('children' in n && n.children.length) sig += `[${n.children.map(signature).join('|')}]`;
  if (n.type === 'instance' && n.slots) {
    const s = Object.entries(n.slots).sort(([a], [b]) => a.localeCompare(b)).map(([k, kids]) => `${k}(${kids.map(signature).join('|')})`);
    if (s.length) sig += `{${s.join(',')}}`;
  }
  return sig;
}

/** Struktur kontainer berulang ≥ min → kandidat komponen. Daun, instance, dan master tidak dihitung. */
export function analyzeClusters(doc: LakarDocument, boardId: string | undefined, min: number): { clusters: unknown[] } {
  const groups = new Map<string, { sig: string; ids: { nodeId: string; pageId: string; boardId: string; name?: string }[] }>();
  for (const { node, pageId, boardId: b } of allNodes(doc, boardId)) {
    if (node.type === 'board' || node.type === 'instance' || 'component' in node) continue;
    if (!('children' in node) || node.children.length === 0) continue;
    const sig = signature(node);
    const g = groups.get(sig) ?? { sig, ids: [] };
    g.ids.push({ nodeId: node.id, pageId, boardId: b, ...(typeof node.name === 'string' ? { name: node.name } : {}) });
    groups.set(sig, g);
  }
  const clusters = [...groups.values()]
    .filter((g) => g.ids.length >= min)
    .sort((a, b) => b.ids.length - a.ids.length || a.sig.localeCompare(b.sig))
    .map((g) => ({
      shape: g.sig.length > 200 ? `${g.sig.slice(0, 197)}…` : g.sig,
      count: g.ids.length,
      example: g.ids[0],
      nodeIds: g.ids.slice(0, USES_MAX).map((x) => x.nodeId),
      ...(g.ids.length > USES_MAX ? { truncated: true } : {}),
    }));
  return { clusters };
}

export function registerAnalyzeRoutes(app: FastifyInstance, { docs, activeDoc }: AnalyzeRoutesOptions): void {
  const scopedDoc = (header: string | string[] | undefined, body: { boardId?: string }) => {
    const { slug } = activeDoc(header);
    const doc = docs.get(slug);
    if (!doc) throw new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif', { hint: NO_ACTIVE_DOC_HINT });
    requireBoard(doc, body.boardId, slug);
    return { doc, slug };
  };
  const envelope = (doc: LakarDocument, slug: string, data: Record<string, unknown>) => ({ docId: doc.id, slug, rev: doc.rev, ...data });

  app.post('/analyze/colors', async (req, reply) => {
    const { slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(ScopeBody, req.body, SCOPE_HINT);
    const { doc } = scopedDoc(req.headers[SESSION_HEADER], body);
    return ok(reply, envelope(doc, slug, analyzeColors(doc, body.boardId)));
  });

  app.post('/analyze/typography', async (req, reply) => {
    const { slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(ScopeBody, req.body, SCOPE_HINT);
    const { doc } = scopedDoc(req.headers[SESSION_HEADER], body);
    return ok(reply, envelope(doc, slug, analyzeTypography(doc, body.boardId)));
  });

  app.post('/analyze/clusters', async (req, reply) => {
    const { slug } = activeDoc(req.headers[SESSION_HEADER]);
    const body = parse(ClustersBody, req.body, CLUSTERS_HINT);
    const { doc } = scopedDoc(req.headers[SESSION_HEADER], body);
    return ok(reply, envelope(doc, slug, analyzeClusters(doc, body.boardId, body.min ?? 3)));
  });
}
