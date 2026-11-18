// Aturan G0 (AD-8): satu fungsi per aturan. Masukan: board ter-resolve + hasil ukur render. Murni.
import type { Finding, ResolvedDocument, ResolvedTextNode as TextNode } from '@lakar/schema';
import { cpLabel, codePoints, emojiIn, GLYPH_ICON, leadingIconGlyph } from './glyphs.js';
import {
  area,
  bottom,
  descendants,
  isFlowChild,
  named,
  num,
  quote,
  right,
  TOLERANCE,
  type BoardContext,
  type Container,
  type Rect,
} from './tree.js';
import type { ResolvedChildNode as ChildNode, ResolvedFrameNode as FrameNode } from '@lakar/schema';

const finding = (rule: Finding['rule'], level: Finding['level'], n: { id: string; name: string }, detail: string, expected: string): Finding => ({
  level,
  rule,
  nodeId: n.id,
  nodeName: n.name,
  detail,
  expected,
});

const texts = (ctx: BoardContext): TextNode[] => ctx.nodes.filter((n): n is TextNode => n.type === 'text');

// ---------------------------------------------------------------------------
// LC-01a · emoji
// ---------------------------------------------------------------------------

export function lc01a(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  for (const t of texts(ctx)) {
    const found = [...new Set(emojiIn(t.content))];
    if (!found.length) continue;
    const list = found
      .slice(0, 3)
      .map((g) => `${JSON.stringify(g)} ${codePoints(g).map(cpLabel).join(' ')}`)
      .join(', ');
    const more = found.length > 3 ? ` (+${found.length - 3} lagi)` : '';
    out.push(finding('LC-01a', 'error', t, `emoji ${list}${more} di ${quote(t.content)}`, 'hapus emoji; ikon pakai node icon (icon_search)'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-01b · glyph Unicode sebagai ikon
// ---------------------------------------------------------------------------

export function lc01b(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  for (const t of texts(ctx)) {
    const g = leadingIconGlyph(t.content);
    if (!g) continue;
    const icon = GLYPH_ICON[String.fromCodePoint(g.codePoint)];
    out.push(
      finding(
        'LC-01b',
        'error',
        t,
        `glyph ${JSON.stringify(String.fromCodePoint(g.codePoint))} ${cpLabel(g.codePoint)} sebagai ikon di ${quote(t.content)}`,
        `hapus glyph; pakai node icon${icon ? ` (mis. lucide ${icon})` : ''} lewat icon_search`,
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-02a · terpotong clip
// ---------------------------------------------------------------------------

const SIDES = ['kiri', 'atas', 'kanan', 'bawah'] as const;

function overflow(n: Rect, p: Rect): Record<(typeof SIDES)[number], number> {
  return { kiri: p.x - n.x, atas: p.y - n.y, kanan: right(n) - right(p), bawah: bottom(n) - bottom(p) };
}

export function lc02a(ctx: BoardContext): Finding[] {
  const crops = ctx.nodes.filter((n): n is FrameNode => n.type === 'frame' && named(n, 'Crop /'));
  const freeCrops = new Set(crops.slice(0, 2).map((c) => c.id));
  const out: Finding[] = [];
  /** `path` = node dari clip P (inklusif) sampai parent node yang sedang diuji (inklusif). */
  const walk = (children: readonly ChildNode[], clip: Container, clipRect: Rect, path: readonly Container[], suppressed: boolean) => {
    for (const n of children) {
      let reported = false;
      const r = ctx.bounds.get(n.id);
      if (!suppressed && r && area(r) > 0) {
        let h = false;
        let v = false;
        let extraCrop: FrameNode | undefined;
        for (const p of path) {
          if (p.type !== 'frame') continue;
          if (named(p, 'Crop /')) {
            if (freeCrops.has(p.id)) h = v = true;
            else extraCrop ??= p;
          }
          if (named(p, 'Scroll /')) v = true;
          if ((p.rotation ?? 0) !== 0) h = v = true;
        }
        const o = overflow(r, clipRect);
        const sides = SIDES.filter((s) => o[s] > TOLERANCE && !((s === 'kiri' || s === 'kanan') ? h : v));
        if (sides.length) {
          reported = true;
          const crop = extraCrop ? `; "${extraCrop.name}" adalah Crop ke-3 atau lebih (maks 2 Crop per board) sehingga tidak membebaskan` : '';
          out.push(
            finding(
              'LC-02a',
              'error',
              n,
              `keluar ${sides.map((s) => `${num(o[s])}px di ${s}`).join(', ')} dari clip ${clip.name} (${clip.id})${crop}`,
              `seluruhnya di dalam ${clip.name}; perkecil atau pindahkan node (potongan sengaja: frame "Crop / …", maks 2 per board)`,
            ),
          );
        }
      }
      if (n.type === 'frame') {
        if (n.clip === true) {
          const nr = ctx.bounds.get(n.id);
          if (nr) walk(n.children, n, nr, [n], false);
        } else walk(n.children, clip, clipRect, [...path, n], suppressed || reported);
      }
    }
  };
  walk(ctx.board.children, ctx.board, ctx.boardRect, [ctx.board], false);
  return out;
}

// ---------------------------------------------------------------------------
// LC-05 · teks < 12px
// ---------------------------------------------------------------------------

export const MIN_TEXT_SIZE = 12;

export function lc05(ctx: BoardContext): Finding[] {
  return texts(ctx)
    .filter((t) => t.size < MIN_TEXT_SIZE && t.content.trim() !== '')
    .map((t) => finding('LC-05', 'error', t, `size ${num(t.size)}px`, `≥ ${MIN_TEXT_SIZE}`));
}

// ---------------------------------------------------------------------------
// LC-12 · ukuran dan posisi board (warning)
// ---------------------------------------------------------------------------

/** Ukuran default per `screen` bila `expectedSize` tidak ada. `heights` kosong = tinggi bebas. */
export const SCREEN_SIZES = {
  mobile: { width: 390, heights: [844] },
  app: { width: 1440, heights: [900, 1024] },
  landing: { width: 1440, heights: [] },
} as const satisfies Record<string, { width: number; heights: readonly number[] }>;

const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;

export function lc12(ctx: BoardContext, doc: ResolvedDocument): Finding[] {
  const b = ctx.board;
  const details: string[] = [];
  const expected: string[] = [];
  const w = ctx.measure.width;
  const h = ctx.measure.height;
  const size = `${num(w)}×${num(h)}`;
  if (b.expectedSize) {
    const e = b.expectedSize;
    if (!near(w, e.width) || !near(h, e.height)) {
      details.push(`ukuran ${size}`);
      expected.push(`${num(e.width)}×${num(e.height)} (expectedSize)`);
    }
  } else {
    const d = SCREEN_SIZES[b.screen];
    const heights: readonly number[] = d.heights;
    if (!near(w, d.width) || (heights.length > 0 && !heights.some((x) => near(h, x)))) {
      details.push(`ukuran ${size}`);
      expected.push(heights.length ? heights.map((x) => `${d.width}×${x}`).join(' atau ') : `lebar ${d.width} (tinggi bebas)`);
    }
  }
  const page = doc.pages.find((p) => p.children.some((x) => x.id === b.id));
  for (const o of page?.children ?? []) {
    if (o.id === b.id) continue;
    const ix = Math.min(b.x + b.width, o.x + o.width) - Math.max(b.x, o.x);
    const iy = Math.min(b.y + b.height, o.y + o.height) - Math.max(b.y, o.y);
    if (ix > 0 && iy > 0) {
      details.push(`bertabrakan dengan board ${o.name} (${o.id})`);
      expected.push(`tanpa tabrakan; posisi baru lewat place(${num(b.width)}, ${num(b.height)})`);
      break;
    }
  }
  if (!details.length) return [];
  return [finding('LC-12', 'warning', b, details.join('; '), expected.join('; '))];
}

// ---------------------------------------------------------------------------
// LC-20 · konten tertutup bar bawah
// ---------------------------------------------------------------------------

/** Jarak maks bar ke tepi bawah board, lebar min relatif board, dan jarak aman di atas bar. */
export const BOTTOM_BAR_MAX_GAP = 48;
const BOTTOM_BAR_MIN_WIDTH_RATIO = 0.5;
export const BOTTOM_BAR_CLEARANCE = 8;

const isChrome = (n: ChildNode) => named(n, 'Overlay /') || named(n, 'Status bar') || named(n, 'Home indicator');

export function lc20(ctx: BoardContext): Finding[] {
  const { board, boardRect } = ctx;
  const out: Finding[] = [];
  const reported = new Set<string>();
  const overlays = ctx.nodes.filter((n) => named(n, 'Overlay /'));
  for (const o of overlays) {
    const or = ctx.bounds.get(o.id);
    if (!or) continue;
    if (boardRect.height - bottom(or) > BOTTOM_BAR_MAX_GAP || or.width < BOTTOM_BAR_MIN_WIDTH_RATIO * boardRect.width) continue;
    const inOverlay = new Set(overlays.flatMap((x) => [x.id, ...descendants(x).map((d) => d.id)]));
    // Wadah C.
    let containers: { node: Container; rect: Rect }[] = ctx.nodes
      .filter((n): n is FrameNode => n.type === 'frame' && named(n, 'Scroll /') && !inOverlay.has(n.id))
      .flatMap((n) => {
        const r = ctx.bounds.get(n.id);
        return r && r.x < right(or) && or.x < right(r) ? [{ node: n as Container, rect: r }] : [];
      });
    if (!containers.length) {
      let best: { node: Container; rect: Rect } | undefined;
      for (const c of board.children) {
        if (c.type !== 'frame' || !isFlowChild(board, c) || isChrome(c)) continue;
        const r = ctx.bounds.get(c.id);
        if (r && (!best || area(r) > area(best.rect))) best = { node: c, rect: r };
      }
      containers = [best ?? { node: board, rect: boardRect }];
    }
    for (const { node: c, rect: cr } of containers) {
      if (reported.has(c.id)) continue;
      let last: { node: ChildNode; rect: Rect } | undefined;
      for (const k of c.children) {
        if (!isFlowChild(c, k) || isChrome(k)) continue;
        const r = ctx.bounds.get(k.id);
        if (!r || area(r) <= 0) continue;
        if (!last || bottom(r) > bottom(last.rect)) last = { node: k, rect: r };
      }
      if (!last) continue;
      const scrollY = c.type === 'frame' ? (c.scrollY ?? 0) : 0;
      // Batas bawah terlihat C: dipotong oleh C sendiri bila clip, frame clip leluhur, dan board (selalu clip).
      // Frame tanpa clip tetap menampilkan anak yang melewati bottom-nya.
      let visibleBottom = c.type === 'frame' && c.clip !== true ? boardRect.height : Math.min(bottom(cr), boardRect.height);
      for (let p = ctx.parentOf.get(c.id); p && p.type === 'frame'; p = ctx.parentOf.get(p.id)) {
        const pr = p.clip === true ? ctx.bounds.get(p.id) : undefined;
        if (pr) visibleBottom = Math.min(visibleBottom, bottom(pr));
      }
      const final = scrollY > 0 || bottom(last.rect) <= visibleBottom + TOLERANCE;
      if (!final) continue;
      const limit = or.y - BOTTOM_BAR_CLEARANCE;
      if (bottom(last.rect) > limit + TOLERANCE) {
        reported.add(c.id);
        out.push(
          finding(
            'LC-20',
            'error',
            c,
            `konten terakhir ${last.node.name} (${last.node.id}) berakhir di y ${num(bottom(last.rect))}, ${o.name} (${o.id}) mulai di y ${num(or.y)}`,
            `berakhir ≤ ${num(limit)} (y ${o.name} − ${BOTTOM_BAR_CLEARANCE}); tambah padding bawah pada ${c.name}`,
          ),
        );
      }
    }
  }
  return out;
}
