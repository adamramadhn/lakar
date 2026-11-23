// Visual diff agen (spec-agent-visual-diff): `POST /visual-diff` {boardId?|nodeId?, fromRev?, toRev?, since?} merender
// board yang sama pada dua rev (snapshot History, spec-app-3) lewat RenderPort, membandingkan piksel dengan pixelmatch
// (toleransi antialiasing), lalu mengembalikan overlay PNG (piksel berubah merah di atas "sesudah" yang dipudarkan,
// kotak wilayah biru), changedRatio, dan wilayah berubah dalam koordinat board beserta node yang bersinggungan.
// Baca-saja: dokumen tidak disentuh. Logika piksel (diffRasters, findRegions, renderOverlay, regionNodes) murni.
import type { FastifyInstance } from 'fastify';
import pixelmatch from 'pixelmatch';
import { glyphScan } from '@lakar/check';
import type { BoardMeasure, RenderPort } from '@lakar/ports';
import { LakarError, SESSION_HEADER, findBoard, resolveDocument, type LakarDocument, type ResolvedDocument } from '@lakar/schema';
import { z } from 'zod';
import { notFound } from './errors.js';
import { readRevision } from './files.js';
import { locateNode } from './inspect.js';
import { decodePng, encodePng, toRgba } from './png.js';
import type { Session } from './sessions.js';
import type { DocStore } from './store.js';

/** Ambang beda warna pixelmatch (0–1, jarak OKLab HyAB); default pustaka. Piksel antialiasing tidak dihitung. */
export const DIFF_THRESHOLD = 0.1;
/** Jarak (px) di mana dua kelompok piksel berubah digabung menjadi satu wilayah. */
export const REGION_GAP = 24;
/** Sel grid pengelompokan wilayah (px). */
const REGION_CELL = 8;
/** Wilayah maksimal di respons (terbesar dulu); sisanya dihitung di `regionsTruncated`. */
export const REGIONS_MAX = 12;
/** Node maksimal per wilayah. */
export const REGION_NODES_MAX = 5;

export type Raster = { width: number; height: number; rgba: Uint8Array };
/** Persegi [x, y, w, h] dalam koordinat board. */
export type Box = [number, number, number, number];
export type DiffResult = {
  /** Wilayah yang dibandingkan (koordinat board). */
  area: Box;
  /** 1 = piksel berubah, per piksel `area` (baris demi baris). */
  mask: Uint8Array;
  changedPixels: number;
  changedRatio: number;
};
export type Region = { bounds: Box; pixels: number };

/** Ukuran kanvas perbandingan: dua render disejajarkan kiri-atas, kanvas = lebar/tinggi terbesar. */
export function canvasSize(before: Raster | null, after: Raster | null): { width: number; height: number } {
  return { width: Math.max(before?.width ?? 0, after?.width ?? 0), height: Math.max(before?.height ?? 0, after?.height ?? 0) };
}

/** Potong `box` ke [0,0,w,h]; kosong → lebar/tinggi 0. */
export function clampBox([x, y, w, h]: Box, width: number, height: number): Box {
  const x0 = Math.max(0, Math.min(width, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height, Math.floor(y)));
  const x1 = Math.max(x0, Math.min(width, Math.ceil(x + w)));
  const y1 = Math.max(y0, Math.min(height, Math.ceil(y + h)));
  return [x0, y0, x1 - x0, y1 - y0];
}

/** Salin `area` dari raster (sejajar kiri-atas) ke buffer RGBA + tanda cakupan; di luar raster = transparan, tak tercakup. */
function crop(src: Raster | null, [ax, ay, aw, ah]: Box): { rgba: Uint8Array; covered: Uint8Array } {
  const rgba = new Uint8Array(aw * ah * 4);
  const covered = new Uint8Array(aw * ah);
  if (!src) return { rgba, covered };
  const w = Math.max(0, Math.min(aw, src.width - ax));
  for (let y = 0; y < ah && ay + y < src.height; y++) {
    if (w <= 0) break;
    const from = ((ay + y) * src.width + ax) * 4;
    rgba.set(src.rgba.subarray(from, from + w * 4), y * aw * 4);
    covered.fill(1, y * aw, y * aw + w);
  }
  return { rgba, covered };
}

/**
 * Bandingkan dua render board (sejajar kiri-atas; ukuran boleh beda, mis. board hug). `clip` = wilayah yang
 * dibandingkan (koordinat board; default seluruh kanvas). Piksel yang hanya tercakup satu render (board tumbuh/
 * menyusut, board tidak ada di salah satu rev) selalu dihitung berubah; selebihnya pixelmatch (antialiasing diabaikan).
 */
export function diffRasters(before: Raster | null, after: Raster | null, clip?: Box, threshold = DIFF_THRESHOLD): DiffResult {
  const canvas = canvasSize(before, after);
  const area = clampBox(clip ?? [0, 0, canvas.width, canvas.height], canvas.width, canvas.height);
  const [, , aw, ah] = area;
  const len = aw * ah;
  const mask = new Uint8Array(len);
  if (len === 0) return { area, mask, changedPixels: 0, changedRatio: 0 };
  const a = crop(before, area);
  const b = crop(after, area);
  const ignore = new Uint8Array(len);
  let changed = 0;
  for (let i = 0; i < len; i++) {
    if (a.covered[i] !== b.covered[i]) {
      mask[i] = 1;
      changed++;
    }
    if (!a.covered[i] || !b.covered[i]) ignore[i] = 1;
  }
  const out = new Uint8Array(len * 4);
  pixelmatch(b.rgba, a.rgba, out, aw, ah, { threshold, diffMask: true, ignoreMask: ignore });
  for (let i = 0; i < len; i++) {
    if (out[i * 4 + 3]! > 0 && !mask[i]) {
      mask[i] = 1;
      changed++;
    }
  }
  return { area, mask, changedPixels: changed, changedRatio: Math.round((changed / len) * 10_000) / 10_000 };
}

const overlaps = (a: Box, b: Box, gap = 0) =>
  a[0] < b[0] + b[2] + gap && b[0] < a[0] + a[2] + gap && a[1] < b[1] + b[3] + gap && b[1] < a[1] + a[3] + gap;

/**
 * Kelompokkan piksel berubah (`mask` ukuran `width`×`height`) menjadi wilayah: sel grid berisi perubahan yang
 * berjarak ≤ `gap` px digabung (union-find), lalu kotak yang masih bertumpuk/berdekatan digabung lagi. Koordinat
 * relatif mask. Terbesar (jumlah piksel) dulu, maks `max`; `truncated` = sisa.
 */
export function findRegions(mask: Uint8Array, width: number, height: number, opts: { gap?: number; max?: number } = {}): { regions: Region[]; truncated: number } {
  const gap = opts.gap ?? REGION_GAP;
  const max = opts.max ?? REGIONS_MAX;
  const cw = Math.ceil(width / REGION_CELL);
  const ch = Math.ceil(height / REGION_CELL);
  const n = cw * ch;
  const count = new Uint32Array(n);
  const minX = new Int32Array(n).fill(width);
  const minY = new Int32Array(n).fill(height);
  const maxX = new Int32Array(n).fill(-1);
  const maxY = new Int32Array(n).fill(-1);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const cy = ((y / REGION_CELL) | 0) * cw;
    for (let x = 0; x < width; x++) {
      if (!mask[row + x]) continue;
      const c = cy + ((x / REGION_CELL) | 0);
      count[c]!++;
      if (x < minX[c]!) minX[c] = x;
      if (x > maxX[c]!) maxX[c] = x;
      if (y < minY[c]!) minY[c] = y;
      if (y > maxY[c]!) maxY[c] = y;
    }
  }
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  // Sel berjarak ≤ gap px: selisih indeks sel ≤ ceil(gap/cell) (perkiraan atas, kotak digabung ulang di bawah).
  const reach = Math.max(1, Math.ceil(gap / REGION_CELL));
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const c = cy * cw + cx;
      if (!count[c]) continue;
      // Hanya tetangga "ke depan" (baris sama ke kanan, baris bawah) supaya tiap pasangan diperiksa sekali.
      for (let dy = 0; dy <= reach && cy + dy < ch; dy++) {
        for (let dx = dy === 0 ? 1 : -reach; dx <= reach; dx++) {
          const nx = cx + dx;
          if (nx < 0 || nx >= cw) continue;
          const o = (cy + dy) * cw + nx;
          if (!count[o]) continue;
          const ra = find(c);
          const rb = find(o);
          if (ra !== rb) parent[rb] = ra;
        }
      }
    }
  }
  const groups = new Map<number, { x0: number; y0: number; x1: number; y1: number; pixels: number }>();
  for (let c = 0; c < n; c++) {
    if (!count[c]) continue;
    const r = find(c);
    const g = groups.get(r);
    if (!g) groups.set(r, { x0: minX[c]!, y0: minY[c]!, x1: maxX[c]!, y1: maxY[c]!, pixels: count[c]! });
    else {
      g.x0 = Math.min(g.x0, minX[c]!);
      g.y0 = Math.min(g.y0, minY[c]!);
      g.x1 = Math.max(g.x1, maxX[c]!);
      g.y1 = Math.max(g.y1, maxY[c]!);
      g.pixels += count[c]!;
    }
  }
  let regions: Region[] = [...groups.values()].map((g) => ({ bounds: [g.x0, g.y0, g.x1 - g.x0 + 1, g.y1 - g.y0 + 1], pixels: g.pixels }));
  // Gabung kotak yang bertumpuk atau berjarak < gap sampai stabil (kelompok cekung bisa menghasilkan kotak bertumpuk).
  for (let merged = true; merged; ) {
    merged = false;
    outer: for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const a = regions[i]!.bounds;
        const b = regions[j]!.bounds;
        if (!overlaps(a, b, gap)) continue;
        const x0 = Math.min(a[0], b[0]);
        const y0 = Math.min(a[1], b[1]);
        const x1 = Math.max(a[0] + a[2], b[0] + b[2]);
        const y1 = Math.max(a[1] + a[3], b[1] + b[3]);
        regions[i] = { bounds: [x0, y0, x1 - x0, y1 - y0], pixels: regions[i]!.pixels + regions[j]!.pixels };
        regions.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  regions = regions.sort((a, b) => b.pixels - a.pixels || a.bounds[1] - b.bounds[1] || a.bounds[0] - b.bounds[0]);
  return { regions: regions.slice(0, max), truncated: Math.max(0, regions.length - max) };
}

/** Warna overlay: piksel berubah, garis wilayah. */
const CHANGED_RGB = [230, 30, 45] as const;
const REGION_RGB = [37, 99, 235] as const;
/** Opasitas "sesudah" di overlay (dipudarkan ke putih). */
const FADE = 0.25;

/**
 * Overlay `area`: render "sesudah" (atau "sebelum" bila "sesudah" tidak menutupi piksel itu) dipudarkan ke putih,
 * piksel berubah merah, garis 1 px biru di tepi tiap wilayah (koordinat relatif area). Hasil RGBA opak.
 */
export function renderOverlay(before: Raster | null, after: Raster | null, diff: DiffResult, regions: readonly Region[]): Raster {
  const [, , aw, ah] = diff.area;
  const a = crop(before, diff.area);
  const b = crop(after, diff.area);
  const out = new Uint8Array(aw * ah * 4);
  for (let i = 0; i < aw * ah; i++) {
    const p = i * 4;
    if (diff.mask[i]) {
      out.set(CHANGED_RGB, p);
    } else {
      const src = b.covered[i] ? b.rgba : a.covered[i] ? a.rgba : null;
      // Komposit alpha di atas putih, lalu pudarkan.
      const alpha = src ? src[p + 3]! / 255 : 0;
      for (let k = 0; k < 3; k++) {
        const c = src ? 255 + (src[p + k]! - 255) * alpha : 255;
        out[p + k] = Math.round(255 + (c - 255) * FADE);
      }
    }
    out[p + 3] = 255;
  }
  const dot = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < aw && y < ah) out.set(REGION_RGB, (y * aw + x) * 4);
  };
  for (const { bounds: [x, y, w, h] } of regions) {
    for (let i = x - 1; i <= x + w; i++) {
      dot(i, y - 1);
      dot(i, y + h);
    }
    for (let j = y - 1; j <= y + h; j++) {
      dot(x - 1, j);
      dot(x + w, j);
    }
  }
  return { width: aw, height: ah, rgba: out };
}

/** Node kandidat untuk pemetaan wilayah → node: bounds di salah satu/kedua rev, rantai leluhur (tanpa board). */
export type NodeCandidate = { id: string; name: string; boxes: Box[]; ancestors: ReadonlySet<string>; state?: 'added' | 'removed' };
export type RegionNode = { id: string; name: string; state?: 'added' | 'removed' };

const intersection = (a: Box, b: Box): number => {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
};

/**
 * Node paling spesifik yang bersinggungan dengan `region` (koordinat board): leluhur dari node lain yang juga kena
 * dibuang, urut luas irisan terbesar, maks `max`.
 */
export function regionNodes(region: Box, candidates: readonly NodeCandidate[], max = REGION_NODES_MAX): RegionNode[] {
  const hits = candidates
    .map((c) => ({ c, area: Math.max(0, ...c.boxes.map((b) => intersection(region, b))) }))
    .filter((h) => h.area > 0);
  const covered = new Set<string>();
  for (const h of hits) for (const a of h.c.ancestors) covered.add(a);
  return hits
    .filter((h) => !covered.has(h.c.id))
    .sort((a, b) => b.area - a.area)
    .slice(0, max)
    .map(({ c }) => ({ id: c.id, name: c.name, ...(c.state ? { state: c.state } : {}) }));
}

type TreeNode = { id: string; name: string; children?: readonly TreeNode[] };

/** id → {name, leluhur} di bawah board (board sendiri tidak termasuk leluhur maupun hasil). */
function lineage(board: TreeNode): Map<string, { name: string; ancestors: Set<string> }> {
  const out = new Map<string, { name: string; ancestors: Set<string> }>();
  const walk = (n: TreeNode, chain: string[]) => {
    for (const c of n.children ?? []) {
      out.set(c.id, { name: c.name, ancestors: new Set(chain) });
      walk(c, [...chain, c.id]);
    }
  };
  walk(board, []);
  return out;
}

const measureBoxes = (m: BoardMeasure | undefined): Map<string, Box> => {
  const out = new Map<string, Box>();
  for (const n of m?.nodes ?? []) if (!out.has(n.id)) out.set(n.id, [n.x, n.y, n.width, n.height]);
  return out;
};

/** Kandidat node dari dua rev: node di keduanya memakai bounds kedua rev (node berpindah); sisanya added/removed. */
export function nodeCandidates(
  before: { board: TreeNode; measure: BoardMeasure } | null,
  after: { board: TreeNode; measure: BoardMeasure } | null,
): NodeCandidate[] {
  const la = before ? lineage(before.board) : new Map();
  const lb = after ? lineage(after.board) : new Map();
  const ba = measureBoxes(before?.measure);
  const bb = measureBoxes(after?.measure);
  const out: NodeCandidate[] = [];
  for (const [id, info] of lb) {
    const boxes = [bb.get(id), ba.get(id)].filter((b): b is Box => b !== undefined);
    if (boxes.length) out.push({ id, name: info.name, boxes, ancestors: info.ancestors, ...(before && !la.has(id) ? { state: 'added' as const } : {}) });
  }
  for (const [id, info] of la) {
    if (lb.has(id)) continue;
    const box = ba.get(id);
    if (box) out.push({ id, name: info.name, boxes: [box], ancestors: info.ancestors, ...(after ? { state: 'removed' as const } : {}) });
  }
  return out;
}

const DiffBody = z
  .object({
    boardId: z.string().min(1).optional(),
    nodeId: z.string().min(1).optional(),
    fromRev: z.number().int().min(0).optional(),
    toRev: z.number().int().min(0).optional(),
    since: z.enum(['last', 'session']).optional(),
  })
  .strict();
export const VISUAL_DIFF_HINT =
  "kirim {boardId?|nodeId?, fromRev?, toRev?, since?}: boardId ATAU nodeId (default board pertama), rev bilangan bulat ≥ 0, since 'last' (default) atau 'session' (tanpa fromRev)";

export type VisualDiffRoutesOptions = {
  docs: Map<string, LakarDocument>;
  store: DocStore;
  render: RenderPort<ResolvedDocument>;
  activeDoc: (header: string | string[] | undefined) => { session: Session; slug: string };
  assertIcons: (board: ResolvedDocument['pages'][number]['children'][number]) => void;
};

type Side = { raster: Raster; measure: BoardMeasure; board: ResolvedDocument['pages'][number]['children'][number] };

export function registerVisualDiffRoutes(app: FastifyInstance, { docs, store, render, activeDoc, assertIcons }: VisualDiffRoutesOptions): void {
  app.post('/visual-diff', async (req, reply) => {
    const { session, slug } = activeDoc(req.headers[SESSION_HEADER]);
    const r = DiffBody.safeParse(req.body ?? {});
    if (!r.success) {
      throw new LakarError('SCHEMA_INVALID', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: VISUAL_DIFF_HINT });
    }
    const body = r.data;
    if (body.boardId !== undefined && body.nodeId !== undefined) {
      throw new LakarError('SCHEMA_INVALID', 'kirim boardId ATAU nodeId, bukan keduanya', { hint: VISUAL_DIFF_HINT });
    }
    if (body.fromRev !== undefined && body.since !== undefined) {
      throw new LakarError('SCHEMA_INVALID', 'kirim fromRev ATAU since, bukan keduanya', { hint: VISUAL_DIFF_HINT });
    }
    const current = docs.get(slug)!;
    const toRev = body.toRev ?? current.rev;
    // Dasar default: rev sebelum tulis terakhir sesi ini (since 'session': sebelum tulis pertamanya) di dokumen ini;
    // sesi belum menulis → rev sebelumnya.
    const known = session.bases?.get(current.id);
    let base: 'explicit' | 'lastWrite' | 'sessionStart' | 'previousRev';
    let fromRev: number;
    if (body.fromRev !== undefined) [base, fromRev] = ['explicit', body.fromRev];
    else if (known) [base, fromRev] = body.since === 'session' ? ['sessionStart', known.first] : ['lastWrite', known.last];
    else [base, fromRev] = ['previousRev', Math.max(0, toRev - 1)];

    // r0 tanpa snapshot = dokumen kosong dari open_doc (createDocument + store.write, tanpa commit): belum ada board.
    // Duplikat menulis snapshot r0 lewat commit, jadi jalur ini tidak menyembunyikan isi.
    const readRev = (rev: number) =>
      readRevision(docs, store, slug, rev).catch((e: unknown) => {
        if (rev === 0 && e instanceof LakarError && e.code === 'NOT_FOUND') return { ...current, rev: 0, pages: current.pages.map((p) => ({ ...p, children: [] })) };
        throw e;
      });
    const [fromDoc, toDoc] = await Promise.all([readRev(fromRev), readRev(toRev)]);
    const before = resolveDocument(fromDoc);
    const after = resolveDocument(toDoc);

    let boardId: string | undefined;
    let nodeId: string | undefined;
    if (body.nodeId !== undefined) {
      const hit = locateNode(after, body.nodeId) ?? locateNode(before, body.nodeId);
      if (!hit) throw notFound(`node ${body.nodeId} tidak ada di dokumen ${slug} r${fromRev} maupun r${toRev}`, 'pakai ID dari created[] execute atau list_boards');
      boardId = hit.board.id;
      if (hit.node.id !== hit.board.id) nodeId = hit.node.id;
    } else {
      boardId = body.boardId ?? after.pages[0]?.children[0]?.id ?? before.pages[0]?.children[0]?.id;
      if (!boardId) throw notFound(`dokumen ${slug} belum punya board di r${fromRev} maupun r${toRev}`, 'buat board dulu lewat execute');
    }
    const boardFrom = findBoard(before, boardId);
    const boardTo = findBoard(after, boardId);
    if (!boardFrom && !boardTo) throw notFound(`board ${boardId} tidak ada di dokumen ${slug} r${fromRev} maupun r${toRev}`, 'pakai ID board dari list_boards');

    const shoot = async (doc: ResolvedDocument, board: Side['board'] | undefined): Promise<Side | null> => {
      if (!board) return null;
      assertIcons(board);
      const [png, measure] = await Promise.all([
        render.screenshot(doc, board.id),
        render.measure(doc, board.id, { allowGlyphs: glyphScan(board).allowGlyphs }),
      ]);
      const img = decodePng(png);
      return { raster: { width: img.width, height: img.height, rgba: toRgba(img) }, measure, board };
    };
    const [a, b] = await Promise.all([shoot(before, boardFrom), shoot(after, boardTo)]);

    // Lingkup node: gabungan bounds node di kedua rev (node berpindah/berubah ukuran tetap tercakup).
    let clip: Box | undefined;
    let missing: 'from' | 'to' | undefined = !a ? 'from' : !b ? 'to' : undefined;
    let note: string | undefined;
    if (nodeId !== undefined) {
      const boxes = [a, b].flatMap((s) => {
        const n = s?.measure.nodes.find((x) => x.id === nodeId);
        return n ? [[n.x, n.y, n.width, n.height] as Box] : [];
      });
      if (!a || !locateNode(before, nodeId)) missing = 'from';
      else if (!b || !locateNode(after, nodeId)) missing = 'to';
      if (boxes.length) {
        const x0 = Math.min(...boxes.map((x) => x[0]));
        const y0 = Math.min(...boxes.map((x) => x[1]));
        const x1 = Math.max(...boxes.map((x) => x[0] + x[2]));
        const y1 = Math.max(...boxes.map((x) => x[1] + x[3]));
        clip = [x0, y0, x1 - x0, y1 - y0];
      } else note = `node ${nodeId} tidak terukur (tersembunyi?): seluruh board dibandingkan`;
    }

    const diff = diffRasters(a?.raster ?? null, b?.raster ?? null, clip);
    const [ax, ay, aw, ah] = diff.area;
    const found = findRegions(diff.mask, aw, ah);
    const candidates = nodeCandidates(a && { board: a.board, measure: a.measure }, b && { board: b.board, measure: b.measure });
    const regions = found.regions.map((g) => {
      const bounds: Box = [g.bounds[0] + ax, g.bounds[1] + ay, g.bounds[2], g.bounds[3]];
      return { bounds, pixels: g.pixels, nodes: regionNodes(bounds, candidates) };
    });
    const overlay = renderOverlay(a?.raster ?? null, b?.raster ?? null, diff, found.regions);
    const png = aw > 0 && ah > 0 ? encodePng(overlay.width, overlay.height, overlay.rgba) : encodePng(1, 1, new Uint8Array([255, 255, 255, 255]));
    const sizeOf = (s: Side | null) => (s ? ([s.raster.width, s.raster.height] as [number, number]) : null);
    const size = { from: sizeOf(a), to: sizeOf(b) };
    const sizeDelta = a && b && (a.raster.width !== b.raster.width || a.raster.height !== b.raster.height) ? [b.raster.width - a.raster.width, b.raster.height - a.raster.height] : undefined;
    return reply.code(200).send({
      ok: true,
      data: {
        docId: current.id,
        slug,
        rev: current.rev,
        boardId,
        ...(nodeId !== undefined ? { nodeId } : {}),
        fromRev,
        toRev,
        base,
        area: diff.area,
        size,
        ...(sizeDelta ? { sizeDelta } : {}),
        ...(missing ? { missing } : {}),
        changedPixels: diff.changedPixels,
        changedRatio: diff.changedRatio,
        regions,
        ...(found.truncated ? { regionsTruncated: found.truncated } : {}),
        ...(note ? { note } : {}),
        mimeType: 'image/png',
        png: png.toString('base64'),
      },
    });
  });
}
