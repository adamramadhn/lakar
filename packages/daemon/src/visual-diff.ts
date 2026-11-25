// Visual diff agen (spec-agent-visual-diff): `POST /viewer/visual-diff` {boardId?|nodeId?, fromRev?, toRev?, since?}
// merender board yang sama pada dua rev (snapshot History, spec-app-3) lewat RenderPort, membandingkan piksel dengan
// pixelmatch (toleransi antialiasing), lalu mengembalikan overlay PNG (piksel berubah merah di atas "sesudah" yang
// dipudarkan, kotak wilayah biru), changedRatio, dan wilayah berubah dalam koordinat board beserta node yang
// bersinggungan. Baca-saja: dokumen tidak disentuh. Logika piksel (prepareDiff, diffPrepared, findRegions,
// renderOverlay, regionNodes) murni.
//
// Memori: area di atas MAX_DIFF_PIXELS dibandingkan pada skala turun (`scale` di respons), potongan kedua rev dibuat
// sekali dan dipakai bersama oleh diff dan overlay, dan overlay dibatasi MAX_OVERLAY_SIDE per sisi (`overlayScale`).
import type { FastifyInstance } from 'fastify';
import pixelmatch from 'pixelmatch';
import { glyphScan } from '@lakar/check';
import type { BoardMeasure, RenderPort } from '@lakar/ports';
import { LakarError, SESSION_HEADER, findBoard, resolveDocument, type LakarDocument, type ResolvedDocument } from '@lakar/schema';
import { z } from 'zod';
import { notFound } from './errors.js';
import { readRevision } from './files.js';
import { locateNode } from './inspect.js';
import { decodePng, encodePng, type DecodedPng } from './png.js';
import { NO_ACTIVE_DOC_HINT, type Session } from './sessions.js';
import type { DocStore } from './store.js';

/** Ambang beda warna pixelmatch (0–1, jarak OKLab HyAB); default pustaka. Piksel antialiasing tidak dihitung. */
export const DIFF_THRESHOLD = 0.1;
/** Jarak (px) di mana dua kelompok piksel berubah digabung menjadi satu wilayah. */
export const REGION_GAP = 24;
/** Sel grid pengelompokan wilayah (px). */
const REGION_CELL = 8;
/** Kelompok maksimal sebelum gabung kotak; lebih banyak → grid dikasarkan (sel dan gap ×2) agar gabung tetap terbatas. */
export const REGION_GROUPS_MAX = 512;
/** Putaran gabung kotak maksimal (tiap putaran sapuan + union-find; biasanya stabil dalam 1–2 putaran). */
const MERGE_PASSES_MAX = 8;
/** Wilayah maksimal di respons (terbesar dulu); sisanya dihitung di `regionsTruncated`. */
export const REGIONS_MAX = 12;
/** Node maksimal per wilayah. */
export const REGION_NODES_MAX = 5;
/** Piksel maksimal yang dibandingkan; area lebih besar diskalakan turun (board landing panjang). */
export const MAX_DIFF_PIXELS = 4_000_000;
/** Sisi terpanjang overlay PNG maksimal (px). */
export const MAX_OVERLAY_SIDE = 4096;

/** Render terdekode (RGB atau RGBA 8-bit), bentuk `decodePng`. */
export type Raster = DecodedPng;
/** Persegi [x, y, w, h]. */
export type Box = [number, number, number, number];
type Crop = { rgba: Uint8Array; covered: Uint8Array };
/** Dua rev dipotong ke `area` (koordinat board) pada skala diff; dipakai bersama oleh diff dan overlay. */
export type Prepared = {
  area: Box;
  /** Ukuran ruang diff (px) dan skala per sumbu (px diff per px board; 1 = tanpa skala). */
  width: number;
  height: number;
  sx: number;
  sy: number;
  before: Crop;
  after: Crop;
};
export type DiffResult = {
  /** 1 = piksel berubah, per piksel ruang diff (baris demi baris). */
  mask: Uint8Array;
  /** Jumlah piksel berubah di ruang diff. */
  changed: number;
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

/**
 * Potong `area` dari raster (sejajar kiri-atas) ke RGBA `w`×`h` + tanda cakupan. Skala 1 = salin baris; skala turun =
 * rata-rata kotak sumber per piksel tujuan (tercakup bila piksel pojok kiri-atas kotaknya ada di raster).
 */
function crop(src: Raster | null, [ax, ay, aw, ah]: Box, w: number, h: number): Crop {
  const rgba = new Uint8Array(w * h * 4);
  const covered = new Uint8Array(w * h);
  if (!src) return { rgba, covered };
  const ch = src.channels;
  const px = src.pixels;
  if (w === aw && h === ah) {
    const cw = Math.max(0, Math.min(aw, src.width - ax));
    for (let y = 0; y < ah && ay + y < src.height && cw > 0; y++) {
      const row = (ay + y) * src.width + ax;
      if (ch === 4) rgba.set(px.subarray(row * 4, (row + cw) * 4), y * aw * 4);
      else {
        for (let x = 0; x < cw; x++) {
          const s = (row + x) * 3;
          const d = (y * aw + x) * 4;
          rgba[d] = px[s]!;
          rgba[d + 1] = px[s + 1]!;
          rgba[d + 2] = px[s + 2]!;
          rgba[d + 3] = 255;
        }
      }
      covered.fill(1, y * aw, y * aw + cw);
    }
    return { rgba, covered };
  }
  const fx = aw / w;
  const fy = ah / h;
  for (let v = 0; v < h; v++) {
    const y0 = ay + Math.floor(v * fy);
    if (y0 >= src.height) break;
    const y1 = Math.min(src.height, Math.max(y0 + 1, ay + Math.floor((v + 1) * fy)));
    for (let u = 0; u < w; u++) {
      const x0 = ax + Math.floor(u * fx);
      if (x0 >= src.width) break;
      const x1 = Math.min(src.width, Math.max(x0 + 1, ax + Math.floor((u + 1) * fx)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const s = (y * src.width + x) * ch;
          r += px[s]!;
          g += px[s + 1]!;
          b += px[s + 2]!;
          a += ch === 4 ? px[s + 3]! : 255;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const d = (v * w + u) * 4;
      rgba[d] = Math.round(r / n);
      rgba[d + 1] = Math.round(g / n);
      rgba[d + 2] = Math.round(b / n);
      rgba[d + 3] = Math.round(a / n);
      covered[v * w + u] = 1;
    }
  }
  return { rgba, covered };
}

/**
 * Siapkan perbandingan: `area` = `clip` (koordinat board; default seluruh kanvas) dipotong ke kanvas; area di atas
 * `maxPixels` diskalakan turun seragam. Kedua rev dipotong sekali di sini.
 */
export function prepareDiff(before: Raster | null, after: Raster | null, clip?: Box, maxPixels = MAX_DIFF_PIXELS): Prepared {
  const canvas = canvasSize(before, after);
  const area = clampBox(clip ?? [0, 0, canvas.width, canvas.height], canvas.width, canvas.height);
  const [, , aw, ah] = area;
  const s = aw * ah > maxPixels ? Math.sqrt(maxPixels / (aw * ah)) : 1;
  const w = s === 1 ? aw : Math.max(1, Math.floor(aw * s));
  const h = s === 1 ? ah : Math.max(1, Math.floor(ah * s));
  return { area, width: w, height: h, sx: aw ? w / aw : 1, sy: ah ? h / ah : 1, before: crop(before, area, w, h), after: crop(after, area, w, h) };
}

/**
 * Bandingkan potongan yang disiapkan. Piksel yang hanya tercakup satu render (board tumbuh/menyusut, board tidak ada
 * di salah satu rev) selalu dihitung berubah; selebihnya pixelmatch (antialiasing diabaikan).
 */
export function diffPrepared(p: Prepared, threshold = DIFF_THRESHOLD): DiffResult {
  const len = p.width * p.height;
  const mask = new Uint8Array(len);
  if (len === 0) return { mask, changed: 0, changedRatio: 0 };
  const a = p.before;
  const b = p.after;
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
  pixelmatch(b.rgba, a.rgba, out, p.width, p.height, { threshold, diffMask: true, ignoreMask: ignore });
  for (let i = 0; i < len; i++) {
    if (out[i * 4 + 3]! > 0 && !mask[i]) {
      mask[i] = 1;
      changed++;
    }
  }
  return { mask, changed, changedRatio: Math.round((changed / len) * 10_000) / 10_000 };
}

/** Siapkan + bandingkan sekaligus (tes dan pemanggil sederhana). */
export function diffRasters(before: Raster | null, after: Raster | null, clip?: Box, opts: { threshold?: number; maxPixels?: number } = {}): Prepared & DiffResult {
  const p = prepareDiff(before, after, clip, opts.maxPixels);
  return { ...p, ...diffPrepared(p, opts.threshold) };
}

const overlaps = (a: Box, b: Box, gap = 0) =>
  a[0] < b[0] + b[2] + gap && b[0] < a[0] + a[2] + gap && a[1] < b[1] + b[3] + gap && b[1] < a[1] + a[3] + gap;

/**
 * Satu putaran gabung kotak: urut x, sapu dengan daftar aktif (kotak yang tepi kanannya + gap masih melewati x kini),
 * pasangan yang bertumpuk/berdekatan disatukan lewat union-find (gabungan transitif dalam satu putaran).
 */
function mergePass(regions: Region[], gap: number): { regions: Region[]; merged: boolean } {
  const order = regions.map((_, i) => i).sort((i, j) => regions[i]!.bounds[0] - regions[j]!.bounds[0]);
  const parent = regions.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  let merged = false;
  let active: number[] = [];
  for (const i of order) {
    const bi = regions[i]!.bounds;
    active = active.filter((j) => regions[j]!.bounds[0] + regions[j]!.bounds[2] + gap > bi[0]);
    for (const j of active) {
      if (!overlaps(bi, regions[j]!.bounds, gap)) continue;
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) {
        parent[rj] = ri;
        merged = true;
      }
    }
    active.push(i);
  }
  if (!merged) return { regions, merged };
  const groups = new Map<number, Region>();
  regions.forEach((r, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (!g) groups.set(root, { bounds: [...r.bounds], pixels: r.pixels });
    else {
      const x0 = Math.min(g.bounds[0], r.bounds[0]);
      const y0 = Math.min(g.bounds[1], r.bounds[1]);
      const x1 = Math.max(g.bounds[0] + g.bounds[2], r.bounds[0] + r.bounds[2]);
      const y1 = Math.max(g.bounds[1] + g.bounds[3], r.bounds[1] + r.bounds[3]);
      g.bounds = [x0, y0, x1 - x0, y1 - y0];
      g.pixels += r.pixels;
    }
  });
  return { regions: [...groups.values()], merged };
}

/**
 * Kelompokkan piksel berubah (`mask` ukuran `width`×`height`) menjadi wilayah: sel grid berisi perubahan yang
 * berjarak ≤ `gap` px digabung (union-find), lalu kotak yang masih bertumpuk/berdekatan digabung lagi (sapuan, maks
 * MERGE_PASSES_MAX putaran). Lebih dari REGION_GROUPS_MAX kelompok → ulang dengan sel dan gap ×2 (kerja gabung
 * terbatas). Koordinat relatif mask. Terbesar (jumlah piksel) dulu, maks `max`; `truncated` = sisa.
 */
export function findRegions(
  mask: Uint8Array,
  width: number,
  height: number,
  opts: { gap?: number; max?: number; cell?: number } = {},
): { regions: Region[]; truncated: number } {
  const gap = opts.gap ?? REGION_GAP;
  const max = opts.max ?? REGIONS_MAX;
  const cell = opts.cell ?? REGION_CELL;
  const cw = Math.ceil(width / cell);
  const ch = Math.ceil(height / cell);
  const n = cw * ch;
  const count = new Uint32Array(n);
  const minX = new Int32Array(n).fill(width);
  const minY = new Int32Array(n).fill(height);
  const maxX = new Int32Array(n).fill(-1);
  const maxY = new Int32Array(n).fill(-1);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const cy = ((y / cell) | 0) * cw;
    for (let x = 0; x < width; x++) {
      if (!mask[row + x]) continue;
      const c = cy + ((x / cell) | 0);
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
  const reach = Math.max(1, Math.ceil(gap / cell));
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
  if (groups.size > REGION_GROUPS_MAX) return findRegions(mask, width, height, { gap: gap * 2, max, cell: cell * 2 });
  let regions: Region[] = [...groups.values()].map((g) => ({ bounds: [g.x0, g.y0, g.x1 - g.x0 + 1, g.y1 - g.y0 + 1], pixels: g.pixels }));
  // Gabung kotak yang bertumpuk atau berjarak < gap (kelompok cekung bisa menghasilkan kotak bertumpuk).
  for (let pass = 0; pass < MERGE_PASSES_MAX; pass++) {
    const r = mergePass(regions, gap);
    regions = r.regions;
    if (!r.merged) break;
  }
  regions.sort((a, b) => b.pixels - a.pixels || a.bounds[1] - b.bounds[1] || a.bounds[0] - b.bounds[0]);
  return { regions: regions.slice(0, max), truncated: Math.max(0, regions.length - max) };
}

/** Warna overlay: piksel berubah, garis wilayah. */
const CHANGED_RGB = [230, 30, 45] as const;
const REGION_RGB = [37, 99, 235] as const;
/** Opasitas "sesudah" di overlay (dipudarkan ke putih). */
const FADE = 0.25;

export type Overlay = { width: number; height: number; rgba: Uint8Array; /** px overlay per px ruang diff. */ scale: number };

/**
 * Overlay dari potongan yang sama dengan diff: render "sesudah" (atau "sebelum" bila "sesudah" tidak menutupi piksel
 * itu) dipudarkan ke putih, piksel berubah merah, garis 1 px biru di tepi tiap wilayah (koordinat ruang diff). Sisi
 * terpanjang > `maxSide` → diskalakan turun; blok yang memuat piksel berubah tetap merah. Hasil RGBA opak.
 */
export function renderOverlay(p: Prepared, diff: DiffResult, regions: readonly Region[], maxSide = MAX_OVERLAY_SIDE): Overlay {
  const { width: dw, height: dh } = p;
  const o = Math.max(dw, dh) > maxSide ? maxSide / Math.max(dw, dh) : 1;
  const ow = o === 1 ? dw : Math.max(1, Math.floor(dw * o));
  const oh = o === 1 ? dh : Math.max(1, Math.floor(dh * o));
  const out = new Uint8Array(ow * oh * 4);
  const fx = dw / Math.max(1, ow);
  const fy = dh / Math.max(1, oh);
  for (let v = 0; v < oh; v++) {
    const y0 = Math.floor(v * fy);
    const y1 = Math.max(y0 + 1, Math.floor((v + 1) * fy));
    for (let u = 0; u < ow; u++) {
      const x0 = Math.floor(u * fx);
      const x1 = Math.max(x0 + 1, Math.floor((u + 1) * fx));
      const d = (v * ow + u) * 4;
      let hit = false;
      const acc = [0, 0, 0];
      for (let y = y0; y < y1 && !hit; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * dw + x;
          if (diff.mask[i]) {
            hit = true;
            break;
          }
          const src = p.after.covered[i] ? p.after.rgba : p.before.covered[i] ? p.before.rgba : null;
          // Komposit alpha di atas putih.
          const alpha = src ? src[i * 4 + 3]! / 255 : 0;
          for (let k = 0; k < 3; k++) acc[k]! += src ? 255 + (src[i * 4 + k]! - 255) * alpha : 255;
        }
      }
      if (hit) out.set(CHANGED_RGB, d);
      else {
        const n = (y1 - y0) * (x1 - x0);
        for (let k = 0; k < 3; k++) out[d + k] = Math.round(255 + (acc[k]! / n - 255) * FADE);
      }
      out[d + 3] = 255;
    }
  }
  const dot = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < ow && y < oh) out.set(REGION_RGB, (y * ow + x) * 4);
  };
  for (const { bounds } of regions) {
    const x = Math.floor(bounds[0] * o);
    const y = Math.floor(bounds[1] * o);
    const w = Math.max(1, Math.ceil(bounds[2] * o));
    const h = Math.max(1, Math.ceil(bounds[3] * o));
    for (let i = x - 1; i <= x + w; i++) {
      dot(i, y - 1);
      dot(i, y + h);
    }
    for (let j = y - 1; j <= y + h; j++) {
      dot(x - 1, j);
      dot(x + w, j);
    }
  }
  return { width: ow, height: oh, rgba: out, scale: o };
}

/**
 * Kotak ruang diff → koordinat board. Pada skala turun kotak dilebarkan satu piksel diff per sisi (piksel tepi yang
 * hanya sebagian berubah bisa rata-ratanya di bawah ambang) lalu dipotong ke area, jadi kotak menutupi perubahan asli.
 */
export function toBoard(p: Prepared, [x, y, w, h]: Box): Box {
  const [ax, ay, aw, ah] = p.area;
  if (p.sx === 1 && p.sy === 1) return [x + ax, y + ay, w, h];
  const x0 = Math.max(0, Math.floor((x - 1) / p.sx));
  const y0 = Math.max(0, Math.floor((y - 1) / p.sy));
  const x1 = Math.min(aw, Math.ceil((x + w + 1) / p.sx));
  const y1 = Math.min(ah, Math.ceil((y + h + 1) / p.sy));
  return [x0 + ax, y0 + ay, x1 - x0, y1 - y0];
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
  /** Room `@lakar/sync` yang digabung: sisi "terkini" bisa berupa replika room. */
  rooms?: { doc(slug: string): LakarDocument | undefined; has(slug: string): boolean };
};

type Side = { raster: Raster; measure: BoardMeasure; board: ResolvedDocument['pages'][number]['children'][number] };

export function registerVisualDiffRoutes(app: FastifyInstance, { docs, store, render, activeDoc, assertIcons, rooms }: VisualDiffRoutesOptions): void {
  // AD-4: route baru di bawah /viewer/* (seperti /viewer/undo). Guard Origin global hanya menolak Origin asing;
  // server MCP (fetch Node tanpa Origin) tetap lolos.
  app.post('/viewer/visual-diff', async (req, reply) => {
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
    const current = docs.get(slug) ?? rooms?.doc(slug);
    if (!current) throw new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif', { hint: NO_ACTIVE_DOC_HINT });
    const toRev = body.toRev ?? current.rev;
    // Dasar default (hook tulis agen `AgentSteps.onAgentWrite`): rev sebelum tulis terakhir sesi ini (since 'session':
    // sebelum tulis pertamanya) di dokumen ini; sesi belum menulis → rev sebelumnya.
    const known = session.bases?.get(current.id);
    let base: 'explicit' | 'lastWrite' | 'sessionStart' | 'previousRev';
    let fromRev: number;
    if (body.fromRev !== undefined) [base, fromRev] = ['explicit', body.fromRev];
    else if (known) [base, fromRev] = body.since === 'session' ? ['sessionStart', known.first] : ['lastWrite', known.last];
    else [base, fromRev] = ['previousRev', Math.max(0, toRev - 1)];

    // r0 tanpa snapshot dianggap kosong hanya bila riwayat tidak punya commit r0: itu dokumen kosong dari open_doc
    // (createDocument + store.write). Ada commit r0 (duplikat) tetapi snapshot-nya hilang (retensi) → NOT_FOUND.
    const readRev = (rev: number) =>
      // Dokumen room tidak punya snapshot lokal: rev ≠ terkini → NOT_FOUND eksplisit; rev terkini → replika.
      rooms?.has(slug) ? Promise.resolve(rev === current.rev ? current : (() => { throw notFound(`dokumen room ${slug} tidak punya snapshot r${rev}`, 'dokumen room tidak menyimpan riwayat lokal'); })())
      : readRevision(docs, store, slug, rev).catch(async (e: unknown) => {
        if (rev !== 0 || !(e instanceof LakarError) || e.code !== 'NOT_FOUND') throw e;
        const history = await store.readHistory(slug).catch(() => []);
        if (history.some((h) => h.rev === 0)) throw e;
        return { ...current, rev: 0, pages: current.pages.map((p) => ({ ...p, children: [] })) };
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
      return { raster: decodePng(png), measure, board };
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

    const sizeOf = (s: Side | null) => (s ? ([s.raster.width, s.raster.height] as [number, number]) : null);
    const size = { from: sizeOf(a), to: sizeOf(b) };
    const sizeDelta = a && b && (a.raster.width !== b.raster.width || a.raster.height !== b.raster.height) ? [b.raster.width - a.raster.width, b.raster.height - a.raster.height] : undefined;
    // Potongan dibuat sekali (skala turun bila besar); render penuh tidak dipakai lagi sesudah ini.
    const prepared = prepareDiff(a?.raster ?? null, b?.raster ?? null, clip);
    const diff = diffPrepared(prepared);
    const found = findRegions(diff.mask, prepared.width, prepared.height);
    const candidates = nodeCandidates(a && { board: a.board, measure: a.measure }, b && { board: b.board, measure: b.measure });
    const perPx = prepared.sx * prepared.sy;
    const regions = found.regions.map((g) => {
      const bounds = toBoard(prepared, g.bounds);
      return { bounds, pixels: Math.round(g.pixels / perPx), nodes: regionNodes(bounds, candidates) };
    });
    const overlay = renderOverlay(prepared, diff, found.regions);
    const png = overlay.width > 0 && overlay.height > 0 ? encodePng(overlay.width, overlay.height, overlay.rgba) : encodePng(1, 1, new Uint8Array([255, 255, 255, 255]));
    const scale = Math.round(Math.min(prepared.sx, prepared.sy) * 1000) / 1000;
    const overlayScale = Math.round(Math.min(prepared.sx, prepared.sy) * overlay.scale * 1000) / 1000;
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
        area: prepared.area,
        size,
        ...(sizeDelta ? { sizeDelta } : {}),
        ...(missing ? { missing } : {}),
        ...(scale < 1 ? { scale } : {}),
        ...(overlayScale < 1 ? { overlayScale } : {}),
        changedPixels: Math.round(diff.changed / perPx),
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
