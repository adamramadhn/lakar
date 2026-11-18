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
  intersect,
  visibleRect,
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
// LC-20 · konten tertutup zona bawah
// ---------------------------------------------------------------------------

/** Jarak maks seed zona ke tepi bawah board, lebar min relatif board, dan jarak aman di atas zona. */
export const BOTTOM_BAR_MAX_GAP = 48;
const BOTTOM_BAR_MIN_WIDTH_RATIO = 0.5;
export const BOTTOM_BAR_CLEARANCE = 8;
/** Isi seksi minimal yang harus terlihat di atas zona agar judulnya tidak yatim (px). */
export const ORPHAN_MIN_BODY = 24;
const HEADING_MAX_H = 80;
const CARD_MAX_H_RATIO = 0.5;
/** Frame anak board selebar ≥ rasio ini dianggap layar (anak absolutnya boleh jadi anggota zona). */
const SCREEN_MIN_W_RATIO = 0.9;

const isChrome = (n: ChildNode) => named(n, 'Overlay /') || named(n, 'Status bar') || named(n, 'Home indicator');

type Painted = { fills?: readonly { type: string }[] | undefined; stroke?: unknown; backdropBlur?: number | undefined };
const hasFills = (n: ChildNode): boolean => ((n as Painted).fills?.length ?? 0) > 0;
const hasStroke = (n: ChildNode): boolean => (n as Painted).stroke !== undefined;
const hasImage = (n: ChildNode): boolean => (n as Painted).fills?.some((f) => f.type === 'image') ?? false;

type ZoneMember = { node: ChildNode; rect: Rect; order: number; legacy: boolean };
/** Zona bawah board: anggota (urut y) dan tepi atasnya. */
export type BottomZone = { members: ZoneMember[]; top: number };

/**
 * Zona bawah: `Overlay /` (kedalaman mana pun) + frame/rect absolut ber-fill (atau backdropBlur) anak board atau anak
 * layar, lebar ≥ 50% board. Seed: bawahnya ≤ 48 px dari tepi bawah; lalu tumpukan yang menempel di atasnya.
 */
export function bottomZone(ctx: BoardContext): BottomZone | undefined {
  const { board, boardRect } = ctx;
  const isScreen = (p: Container | undefined): boolean => {
    if (!p || p.type !== 'frame' || ctx.parentOf.get(p.id) !== board) return false;
    const r = ctx.bounds.get(p.id);
    return !!r && r.width >= SCREEN_MIN_W_RATIO * boardRect.width;
  };
  const cands: ZoneMember[] = [];
  for (const n of ctx.nodes) {
    const r = ctx.bounds.get(n.id);
    if (!r || area(r) <= 0 || r.width < BOTTOM_BAR_MIN_WIDTH_RATIO * boardRect.width) continue;
    const legacy = named(n, 'Overlay /');
    if (!legacy) {
      if ((n.type !== 'frame' && n.type !== 'rect') || named(n, 'Status bar') || named(n, 'Home indicator')) continue;
      const parent = ctx.parentOf.get(n.id)!;
      if (isFlowChild(parent, n) || !(parent === board || isScreen(parent))) continue;
      if (!hasFills(n) && !((n as Painted).backdropBlur! > 0)) continue;
      // Latar/scrim setinggi layar bukan bilah bawah (tanpa ini tepi zona jadi 0 dan tumpukan berhenti).
      if (r.height > CARD_MAX_H_RATIO * boardRect.height) continue;
    }
    cands.push({ node: n, rect: r, order: ctx.order.get(n.id)!, legacy });
  }
  const members = cands.filter((c) => boardRect.height - bottom(c.rect) <= BOTTOM_BAR_MAX_GAP);
  if (!members.length) return undefined;
  let top = Math.min(...members.map((m) => m.rect.y));
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of cands) {
      if (members.includes(c) || bottom(c.rect) < top - BOTTOM_BAR_CLEARANCE - TOLERANCE || c.rect.y >= top) continue;
      members.push(c);
      top = c.rect.y;
      grew = true;
    }
  }
  return { members: members.sort((a, b) => a.rect.y - b.rect.y || a.order - b.order), top };
}

/** Anggota zona yang menutup node berurutan `order` dan rentang x `r` (z-order: anggota sesudahnya; Overlay selalu). */
function covering(zone: BottomZone, order: number, r: Rect): { members: ZoneMember[]; top: number; label: string; legacyLabel: string } | undefined {
  const members = zone.members.filter((m) => (m.legacy || m.order > order) && m.rect.x < right(r) && r.x < right(m.rect));
  if (!members.length) return undefined;
  const one = members.length === 1 ? members[0]!.node : undefined;
  return {
    members,
    top: Math.min(...members.map((m) => m.rect.y)),
    label: one ? `"${one.name}" (${one.id})` : members.map((m) => `"${m.node.name}"`).join(' + '),
    legacyLabel: one ? `${one.name} (${one.id})` : members.map((m) => m.node.name).join(' + '),
  };
}

const maxTextSize = (n: ChildNode): number => {
  let best = 0;
  for (const t of [n, ...descendants(n)]) if (t.type === 'text' && t.content.trim() !== '') best = Math.max(best, t.size);
  return best;
};

export function lc20(ctx: BoardContext): Finding[] {
  const zone = bottomZone(ctx);
  if (!zone) return [];
  const { board, boardRect } = ctx;
  const out: Finding[] = [];
  const orderOf = (n: { id: string }) => ctx.order.get(n.id) ?? 0;

  // Dikecualikan: anggota zona dan chrome (beserta keturunannya).
  const excluded = new Set<string>();
  for (const n of [...zone.members.map((m) => m.node), ...ctx.nodes.filter(isChrome)]) {
    if (excluded.has(n.id)) continue;
    excluded.add(n.id);
    for (const d of descendants(n)) excluded.add(d.id);
  }

  // Wadah utama: frame `Scroll /` dan anak flow terbesar board.
  let best: { node: Container; rect: Rect } | undefined;
  for (const c of board.children) {
    if (c.type !== 'frame' || !isFlowChild(board, c) || isChrome(c) || excluded.has(c.id)) continue;
    const r = ctx.bounds.get(c.id);
    if (r && (!best || area(r) > area(best.rect))) best = { node: c, rect: r };
  }
  const scrolls = ctx.nodes.filter((n): n is FrameNode => n.type === 'frame' && named(n, 'Scroll /') && !excluded.has(n.id));
  const mains = new Set<string>([...scrolls.map((s) => s.id), ...(best ? [best.node.id] : [])]);

  // Sub-cek 1 (posisi akhir): konten terakhir wadah berakhir > y zona − 8.
  const reported = new Set<string>();
  let containers: { node: Container; rect: Rect }[] = scrolls.flatMap((n) => {
    const r = ctx.bounds.get(n.id);
    return r && covering(zone, orderOf(n), r) ? [{ node: n as Container, rect: r }] : [];
  });
  if (!containers.length) containers = [best ?? { node: board, rect: boardRect }];
  for (const { node: c, rect: cr } of containers) {
    const cov = covering(zone, c === board ? -1 : orderOf(c), cr);
    if (!cov) continue;
    let last: { node: ChildNode; rect: Rect } | undefined;
    for (const k of c.children) {
      if (!isFlowChild(c, k) || isChrome(k) || excluded.has(k.id)) continue;
      const r = ctx.bounds.get(k.id);
      if (!r || area(r) <= 0) continue;
      if (!last || bottom(r) > bottom(last.rect)) last = { node: k, rect: r };
    }
    if (!last) continue;
    const outer = last.rect;
    // Wadah transparan (tanpa fill/stroke) bukan konten: turun ke konten terakhirnya (padding bawah tidak dihitung).
    for (let k = last.node; k.type === 'frame' && !hasFills(k) && !hasStroke(k); ) {
      let inner: { node: ChildNode; rect: Rect } | undefined;
      for (const x of k.children) {
        const r = ctx.bounds.get(x.id);
        if (!isFlowChild(k, x) || !r || area(r) <= 0) continue;
        if (!inner || bottom(r) > bottom(inner.rect)) inner = { node: x, rect: r };
      }
      if (!inner) break;
      last = inner;
      k = inner.node;
    }
    const scrollY = c.type === 'frame' ? (c.scrollY ?? 0) : 0;
    // Batas bawah terlihat C: dipotong oleh C sendiri bila clip, frame clip leluhur, dan board (selalu clip).
    // Frame tanpa clip tetap menampilkan anak yang melewati bottom-nya.
    let visibleBottom = c.type === 'frame' && c.clip !== true ? boardRect.height : Math.min(bottom(cr), boardRect.height);
    for (let p = ctx.parentOf.get(c.id); p && p.type === 'frame'; p = ctx.parentOf.get(p.id)) {
      const pr = p.clip === true ? ctx.bounds.get(p.id) : undefined;
      if (pr) visibleBottom = Math.min(visibleBottom, bottom(pr));
    }
    const final = scrollY > 0 || bottom(outer) <= visibleBottom + TOLERANCE;
    if (!final) continue;
    const limit = cov.top - BOTTOM_BAR_CLEARANCE;
    if (bottom(last.rect) > limit + TOLERANCE) {
      reported.add(c.id);
      const one = cov.members.length === 1 ? cov.members[0]!.node.name : 'zona bawah';
      out.push(
        finding(
          'LC-20',
          'error',
          c,
          `konten terakhir ${last.node.name} (${last.node.id}) berakhir di y ${num(bottom(last.rect))}, ${cov.legacyLabel} mulai di y ${num(cov.top)}`,
          `berakhir ≤ ${num(limit)} (y ${one} − ${BOTTOM_BAR_CLEARANCE}); tambah padding bawah pada ${c.name}`,
        ),
      );
    }
  }
  if (reported.has(board.id)) return out;

  const lineHeights = new Map(ctx.measure.texts.map((t) => [t.id, t.lineHeight]));

  const unitKind = (n: ChildNode): string | undefined => {
    if (n.type === 'text') return n.content.trim() !== '' ? 'teks' : undefined;
    if (n.type === 'icon') return 'ikon';
    if (n.type === 'frame' && named(n, 'Crop /')) return 'gambar';
    if (named(n, 'Scroll /') || mains.has(n.id)) return undefined;
    const r = ctx.bounds.get(n.id);
    if (!r || r.height > CARD_MAX_H_RATIO * boardRect.height) return undefined;
    if (hasImage(n)) return 'gambar';
    if (n.type !== 'frame' && n.type !== 'rect') return undefined;
    if (hasFills(n)) return 'kartu';
    if (!hasStroke(n)) return undefined;
    // Stroke di semua sisi = kartu bergaris; stroke sebagian (garis pemisah baris) = baris, dinilai dari isinya.
    const sides = (n as { stroke?: { sides?: readonly string[] } }).stroke?.sides;
    return !sides || sides.length >= 4 ? 'kartu' : n.type === 'frame' ? 'baris' : undefined;
  };

  /** Bagian unit yang tampak: teks tanpa half-leading (+0,1 em di atas), baris = gabungan isi terlihat. */
  const unitVisible = (n: ChildNode, kind: string): Rect | undefined => {
    if (kind === 'baris' && n.type === 'frame') {
      let u: Rect | undefined;
      for (const k of n.children) {
        const v = visibleRect(ctx, k);
        if (!v) continue;
        u = u ? { x: Math.min(u.x, v.x), y: Math.min(u.y, v.y), width: Math.max(right(u), right(v)) - Math.min(u.x, v.x), height: Math.max(bottom(u), bottom(v)) - Math.min(u.y, v.y) } : v;
      }
      return u;
    }
    const vis = visibleRect(ctx, n);
    if (!vis || n.type !== 'text') return vis;
    const r = ctx.bounds.get(n.id)!;
    const lead = Math.max(0, ((lineHeights.get(n.id) ?? n.lineHeight ?? 1.2 * n.size) - n.size) / 2);
    return intersect(vis, { x: r.x, y: r.y + lead + 0.1 * n.size, width: r.width, height: r.height - 2 * lead - 0.1 * n.size });
  };

  /** Sub-cek 2: unit terpotong/menempel di tepi atas zona. true bila dilaporkan. */
  const cut = (n: ChildNode): boolean => {
    const kind = unitKind(n);
    if (!kind) return false;
    const vis = unitVisible(n, kind);
    if (!vis) return false;
    const cov = covering(zone, orderOf(n), vis);
    if (!cov) return false;
    const z = cov.top;
    if (!(vis.y < z - TOLERANCE && bottom(vis) > z - BOTTOM_BAR_CLEARANCE + TOLERANCE)) return false;
    const shown = Math.min(bottom(vis), z);
    // Terpotong = bagian unit di bawah tepi zona (juga bila dipotong clip gulir tepat di tepi zona).
    const rawBottom = kind === 'teks' || kind === 'baris' ? bottom(vis) : Math.max(bottom(vis), bottom(ctx.bounds.get(n.id)!));
    const what = rawBottom > z + TOLERANCE ? `terpotong zona bawah: terlihat y ${num(vis.y)}–${num(shown)}` : `menempel zona bawah: berakhir di y ${num(bottom(vis))}`;
    out.push(
      finding(
        'LC-20',
        'error',
        n,
        `${kind} ${what}, tertutup ${cov.label} mulai y ${num(z)}`,
        `seluruhnya di atas y ${num(z - BOTTOM_BAR_CLEARANCE)} (zona − ${BOTTOM_BAR_CLEARANCE}) atau seluruhnya di bawah zona: geser/padatkan konten di atasnya, atau akhiri layar pertama sebelum ${kind} ini`,
      ),
    );
    return true;
  };

  const headingLike = (h: ChildNode): boolean => {
    if (h.type === 'text') return h.content.trim() !== '';
    if (h.type !== 'frame' || hasFills(h) || hasStroke(h)) return false;
    return descendants(h).every((d) => d.type === 'text' || d.type === 'icon' || (d.type === 'frame' && !hasFills(d)));
  };

  /** Sub-cek 3: judul seksi terlihat, isinya tertutup zona. true bila dilaporkan. */
  const orphan = (f: ChildNode): boolean => {
    if (f.type !== 'frame' || f.layout !== 'column' || named(f, 'Crop /')) return false;
    const flow = f.children.filter((k) => {
      const r = ctx.bounds.get(k.id);
      return isFlowChild(f, k) && !isChrome(k) && !!r && area(r) > 0;
    });
    if (flow.length < 2) return false;
    const h = flow[0]!;
    const hr = ctx.bounds.get(h.id)!;
    if (hr.height > HEADING_MAX_H || !headingLike(h)) return false;
    const hv = visibleRect(ctx, h);
    if (!hv || Math.abs(hv.y - hr.y) > TOLERANCE || Math.abs(bottom(hv) - bottom(hr)) > TOLERANCE) return false;
    const cov = covering(zone, orderOf(h), hr);
    if (!cov) return false;
    const z = cov.top;
    if (bottom(hr) > z + TOLERANCE) return false;
    let below = false;
    for (const b of flow.slice(1)) {
      const v = visibleRect(ctx, b);
      const above = v ? Math.max(0, Math.min(bottom(v), z) - v.y) : 0;
      if (above >= ORPHAN_MIN_BODY) return false;
      if (bottom(ctx.bounds.get(b.id)!) > z + TOLERANCE) below = true;
    }
    if (!below) return false;
    const hSize = maxTextSize(h);
    const nextSize = maxTextSize(flow[1]!);
    if (nextSize > 0 && !(hSize > nextSize)) return false;
    const title = [h, ...descendants(h)].find((t): t is TextNode => t.type === 'text' && t.content.trim() !== '' && t.size === hSize);
    out.push(
      finding(
        'LC-20',
        'error',
        h,
        `judul seksi ${title ? quote(title.content) : h.name} di ${f.name} (${f.id}) terlihat, isinya tertutup zona bawah ${cov.label} mulai y ${num(z)}`,
        `tampilkan ≥ ${ORPHAN_MIN_BODY} px isi di atas y ${num(z)} atau pindahkan seluruh seksi ke bawah zona (akhiri layar pertama dengan rapi)`,
      ),
    );
    return true;
  };

  // Sub-cek 2 + 3, atas-ke-bawah: hanya yang terluar dilaporkan.
  const walk = (children: readonly ChildNode[]) => {
    for (const n of children) {
      if (excluded.has(n.id) || reported.has(n.id)) continue;
      if (cut(n)) continue;
      if (n.type === 'frame' && named(n, 'Crop /')) continue;
      if (orphan(n)) continue;
      if (n.type === 'frame') walk(n.children);
    }
  };
  walk(board.children);
  return out;
}
