// Aturan G0 (AD-8): satu fungsi per aturan. Masukan: board ter-resolve + hasil ukur render. Murni.
import {
  COMPONENT_SIZES,
  CONTRAST_MIN,
  CONTROL_PREFIXES,
  DISPLAY_SIZES,
  ICON_GROUP_LABEL_MAX,
  FORBIDDEN_EXEMPT,
  forbiddenPhrasesIn,
  G0_RULES,
  HOME_INDICATOR_INSET,
  instanceIssues,
  KPI_LINE_HEIGHT_RATIO,
  KPI_SIZES,
  PARAGRAPH_MIN,
  PARAGRAPH_MIN_IN_CARD,
  SCRIM_MIN_ALPHA,
  SPACING_VALUES,
  textContrastMin,
  TOUCH_MIN,
  TYPE_SCALE,
  type Finding,
  type ResolvedDocument,
  type ResolvedFill,
  type ResolvedTextNode as TextNode,
} from '@lakar/schema';
import { cpLabel, codePoints, emojiIn, GLYPH_ICON, leadingIconGlyph } from './glyphs.js';
import {
  ancestors,
  area,
  bottom,
  contains,
  descendants,
  inkRect,
  union,
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

/**
 * Ukuran default per `screen` bila `expectedSize` tidak ada. `heights` kosong = tinggi bebas; `minHeight` = tinggi
 * minimal (mobile: satu board panjang bergulir sah, tinggi ≥ 844).
 */
export const SCREEN_SIZES = {
  mobile: { width: 390, heights: [], minHeight: 844 },
  app: { width: 1440, heights: [900, 1024], minHeight: 0 },
  landing: { width: 1440, heights: [], minHeight: 0 },
} as const satisfies Record<string, { width: number; heights: readonly number[]; minHeight: number }>;

/** Board mobile panjang: sisa ruang di bawah isi utama (ke zona bawah atau tepi board) > 32 px → saran tinggi pas. */
export const FIT_SLACK_MAX = 32;
/** Jarak isi terakhir ke zona bawah / tepi board yang dipakai untuk menghitung tinggi pas (px). */
export const FIT_CLEARANCE = 24;

const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;

/** Bawah isi utama board: anak flow terakhir wadah utama (anak flow terbesar board, atau board), turun lewat wadah transparan. */
function contentBottom(ctx: BoardContext, zone: BottomZone | undefined): number | undefined {
  const { board } = ctx;
  const excluded = new Set<string>();
  for (const n of [...(zone?.members.map((m) => m.node) ?? []), ...ctx.nodes.filter(isChrome)]) {
    excluded.add(n.id);
    for (const d of descendants(n)) excluded.add(d.id);
  }
  let best: { node: Container; rect: Rect } | undefined;
  for (const c of board.children) {
    if (c.type !== 'frame' || !isFlowChild(board, c) || excluded.has(c.id)) continue;
    const r = ctx.bounds.get(c.id);
    if (r && (!best || area(r) > area(best.rect))) best = { node: c, rect: r };
  }
  const lastOf = (c: Container): { node: ChildNode; rect: Rect } | undefined => {
    let last: { node: ChildNode; rect: Rect } | undefined;
    for (const k of c.children) {
      if (!isFlowChild(c, k) || excluded.has(k.id)) continue;
      const r = ctx.bounds.get(k.id);
      if (!r || area(r) <= 0) continue;
      if (!last || bottom(r) > bottom(last.rect)) last = { node: k, rect: r };
    }
    return last;
  };
  // Wadah utama setinggi board (latar layar) bukan isi: nilai anak-anaknya.
  let last = best && best.rect.height >= ctx.boardRect.height - TOLERANCE ? lastOf(best.node) : lastOf(board);
  for (let k = last?.node; last && k && k.type === 'frame' && !hasFills(k) && !hasStroke(k); ) {
    const inner = lastOf(k);
    if (!inner) break;
    last = inner;
    k = inner.node;
  }
  return last ? bottom(last.rect) : undefined;
}

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
    if (!near(w, d.width) || (heights.length > 0 && !heights.some((x) => near(h, x))) || h < d.minHeight - TOLERANCE) {
      details.push(`ukuran ${size}`);
      expected.push(
        heights.length
          ? heights.map((x) => `${d.width}×${x}`).join(' atau ')
          : d.minHeight
            ? `lebar ${d.width}, tinggi ≥ ${d.minHeight} (isi lebih panjang: satu board panjang)`
            : `lebar ${d.width} (tinggi bebas)`,
      );
    } else if (b.screen === 'mobile' && h > d.minHeight + TOLERANCE) {
      // Board mobile panjang: tinggi harus pas dengan isi (tanpa ruang kosong besar di atas zona bawah / tepi bawah).
      const zone = bottomZone(ctx);
      // Tanpa zona bawah: batasnya tepi atas `Home indicator` (bila ada), bukan tepi board.
      const home = zone ? undefined : ctx.nodes.find((n) => named(n, 'Home indicator'));
      const homeRect = home ? ctx.bounds.get(home.id) : undefined;
      const limit = zone ? zone.top : homeRect ? homeRect.y : h;
      const end = contentBottom(ctx, zone);
      if (end !== undefined && limit - end > FIT_SLACK_MAX + TOLERANCE) {
        const fit = Math.max(d.minHeight, Math.round(h - (limit - end) + FIT_CLEARANCE));
        details.push(`tinggi ${num(h)}, isi berakhir ${num(limit - end)} px di atas ${zone ? 'zona bawah' : homeRect ? 'Home indicator' : 'tepi bawah'}: tinggi pas = ${fit}`);
        expected.push(`tinggi ${fit} (sisa ≤ ${FIT_SLACK_MAX} px); geser zona bawah ikut tinggi baru`);
      }
    }
  }
  if (b.screen === 'mobile') {
    const legacy = ctx.nodes.find((n) => n.type === 'frame' && named(n, 'Scroll /') && (n.scrollY ?? 0) > 0);
    if (legacy) {
      details.push(`pola dua board usang (${legacy.name} scrollY ${num((legacy as FrameNode).scrollY ?? 0)})`);
      expected.push('pakai satu board panjang 390 × H (tanpa duplicate/scrollY)');
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
/** Bar mengambang: seed zona juga bila celah ke tepi bawah ≤ 96 px dan tinggi ≤ 120 px. */
export const FLOAT_MAX_GAP = 96;
export const FLOAT_MAX_H = 120;
/** Tinggi minimal bagian unit yang terlihat di celah di bawah zona mengambang agar dilaporkan (px). */
export const PEEK_MIN = 2;
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
 * layar, atau anak langsung ber-fill dari pembungkus (frame absolut transparan anak board/layar, lebar ≥ 50% board,
 * tinggi ≤ 50% board); lebar ≥ 50% board. Seed: bawahnya ≤ 48 px dari tepi bawah, atau bar mengambang (≤ 96 px,
 * tinggi ≤ 120 px); lalu tumpukan yang menempel di atasnya.
 */
export function bottomZone(ctx: BoardContext): BottomZone | undefined {
  const { board, boardRect } = ctx;
  const isScreen = (p: Container | undefined): boolean => {
    if (!p || p.type !== 'frame' || ctx.parentOf.get(p.id) !== board) return false;
    const r = ctx.bounds.get(p.id);
    return !!r && r.width >= SCREEN_MIN_W_RATIO * boardRect.width;
  };
  const painted = (n: ChildNode) => hasFills(n) || (n as Painted).backdropBlur! > 0;
  /** Pembungkus: frame absolut tanpa fill/blur anak board/layar, lebar ≥ 50% board, tinggi ≤ 50% board. */
  const isWrapper = (p: Container | undefined): boolean => {
    if (!p || p.type !== 'frame' || painted(p)) return false;
    const pp = ctx.parentOf.get(p.id);
    if (!pp || isFlowChild(pp, p) || !(pp === board || isScreen(pp))) return false;
    const r = ctx.bounds.get(p.id);
    return !!r && r.width >= BOTTOM_BAR_MIN_WIDTH_RATIO * boardRect.width && r.height <= CARD_MAX_H_RATIO * boardRect.height;
  };
  const cands: ZoneMember[] = [];
  for (const n of ctx.nodes) {
    const r = ctx.bounds.get(n.id);
    if (!r || area(r) <= 0 || r.width < BOTTOM_BAR_MIN_WIDTH_RATIO * boardRect.width) continue;
    const legacy = named(n, 'Overlay /');
    if (!legacy) {
      if ((n.type !== 'frame' && n.type !== 'rect') || named(n, 'Status bar') || named(n, 'Home indicator')) continue;
      const parent = ctx.parentOf.get(n.id)!;
      const direct = !isFlowChild(parent, n) && (parent === board || isScreen(parent));
      if (!direct && !isWrapper(parent)) continue;
      if (!painted(n)) continue;
      // Latar/scrim setinggi layar bukan bilah bawah (tanpa ini tepi zona jadi 0 dan tumpukan berhenti).
      if (r.height > CARD_MAX_H_RATIO * boardRect.height) continue;
    }
    cands.push({ node: n, rect: r, order: ctx.order.get(n.id)!, legacy });
  }
  const members = cands.filter((c) => {
    const gap = boardRect.height - bottom(c.rect);
    return gap <= BOTTOM_BAR_MAX_GAP || (gap <= FLOAT_MAX_GAP && c.rect.height <= FLOAT_MAX_H);
  });
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
  // Kandidat di dalam anggota transparan (mis. `Overlay / Bawah` tanpa fill berisi mini player + tab bar) ikut jadi anggota,
  // agar celah di antara isinya bisa dinilai (sub-cek 5). Tepi atas zona tidak berubah (isinya di dalam rentang pembungkus).
  for (const m of [...members]) {
    if (painted(m.node)) continue;
    const inside = new Set(descendants(m.node).map((d) => d.id));
    for (const c of cands) if (!members.includes(c) && inside.has(c.node.id)) members.push(c);
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

  /** Bawah mentah unit (sebelum clip): teks tanpa half-leading bawah, baris = gabungan isi. */
  const rawBottomOf = (n: ChildNode, kind: string): number => {
    const r = ctx.bounds.get(n.id)!;
    if (n.type === 'text') return bottom(r) - Math.max(0, ((lineHeights.get(n.id) ?? n.lineHeight ?? 1.2 * n.size) - n.size) / 2);
    if (kind === 'baris' && n.type === 'frame') {
      let b = -Infinity;
      for (const k of n.children) {
        const kr = ctx.bounds.get(k.id);
        if (kr && area(kr) > 0) b = Math.max(b, bottom(kr));
      }
      return Number.isFinite(b) ? b : bottom(r);
    }
    return bottom(r);
  };

  /** Sub-cek 4: unit terlihat di celah antara zona mengambang dan tepi bawah board, terpotong atau sebagian di belakang zona. */
  const gap = (n: ChildNode): boolean => {
    const kind = unitKind(n);
    if (!kind) return false;
    const vis = unitVisible(n, kind);
    if (!vis) return false;
    const cov = covering(zone, orderOf(n), vis);
    if (!cov) return false;
    const x0 = Math.min(...cov.members.map((m) => m.rect.x));
    const x1 = Math.max(...cov.members.map((m) => right(m.rect)));
    let floor = Math.max(...cov.members.map((m) => bottom(m.rect)));
    // Penutup celah: node ber-fill/blur sesudah unit (z-order) selebar rentang zona yang menempel di bawahnya (mis. Home indicator ber-fill).
    const order = orderOf(n);
    const own = new Set(descendants(n).map((d) => d.id));
    for (let grew = true; grew; ) {
      grew = false;
      for (const c of ctx.nodes) {
        const cr = ctx.bounds.get(c.id);
        if (!cr || orderOf(c) <= order || own.has(c.id) || !(hasFills(c) || (c as Painted).backdropBlur! > 0)) continue;
        if (cr.x > x0 + TOLERANCE || right(cr) < x1 - TOLERANCE || cr.y > floor + TOLERANCE || bottom(cr) <= floor + TOLERANCE) continue;
        floor = bottom(cr);
        grew = true;
      }
    }
    if (boardRect.height - floor <= TOLERANCE) return false;
    const peek = intersect(vis, { x: x0, y: floor, width: x1 - x0, height: boardRect.height - floor });
    if (!peek || peek.height < PEEK_MIN) return false;
    const terpotong = rawBottomOf(n, kind) > bottom(vis) + TOLERANCE;
    const behind = vis.y < floor - TOLERANCE;
    if (!terpotong && !behind) return false;
    out.push(
      finding(
        'LC-20',
        'error',
        n,
        `${kind} terlihat di celah di bawah zona bawah mengambang ${cov.label} (y ${num(peek.y)}–${num(bottom(peek))}), ${terpotong ? 'terpotong' : 'sebagian di belakang zona'}`,
        `jangan biarkan konten terlihat di celah di bawah bar mengambang: akhiri daftar sebelum zona, beri latar penutup sampai tepi bawah, atau tempelkan bar ke tepi bawah`,
      ),
    );
    return true;
  };

  /**
   * Sub-cek 5: unit terlihat di celah di antara dua bar zona bawah yang bertumpuk (mis. mini player di atas tab bar),
   * sebagian tertutup bar. Celah yang ditutup node ber-fill/blur sesudah unit (z-order) tidak dihitung.
   */
  const between = (n: ChildNode): boolean => {
    const kind = unitKind(n);
    if (!kind) return false;
    const vis = unitVisible(n, kind);
    if (!vis) return false;
    const cov = covering(zone, orderOf(n), vis);
    if (!cov || cov.members.length < 2) return false;
    const order = orderOf(n);
    const own = new Set(descendants(n).map((d) => d.id));
    // Pembungkus transparan (tanpa fill/blur) yang memuat anggota zona lain tidak menutup celah di antara isinya.
    const memberIds = new Set(cov.members.map((m) => m.node.id));
    const wraps = (m: ZoneMember) => !(hasFills(m.node) || (m.node as Painted).backdropBlur! > 0) && descendants(m.node).some((d) => memberIds.has(d.id));
    const ms = cov.members.filter((m) => !wraps(m)).sort((a, b) => a.rect.y - b.rect.y || a.order - b.order);
    if (ms.length < 2) return false;
    let upper = ms[0]!;
    for (const lower of ms.slice(1)) {
      const holeTop = bottom(upper.rect);
      if (lower.rect.y > holeTop + TOLERANCE) {
        const x0 = Math.max(upper.rect.x, lower.rect.x);
        const x1 = Math.min(right(upper.rect), right(lower.rect));
        if (x1 > x0) {
          // Penutup lubang: node ber-fill/blur sesudah unit selebar irisan x pengapit, dirapatkan dari atas dan bawah.
          let top = holeTop;
          let low = lower.rect.y;
          for (let grew = true; grew && low - top > TOLERANCE; ) {
            grew = false;
            for (const c of ctx.nodes) {
              const cr = ctx.bounds.get(c.id);
              if (!cr || orderOf(c) <= order || own.has(c.id) || !(hasFills(c) || (c as Painted).backdropBlur! > 0)) continue;
              if (cr.x > x0 + TOLERANCE || right(cr) < x1 - TOLERANCE) continue;
              if (cr.y <= top + TOLERANCE && bottom(cr) > top + TOLERANCE) {
                top = Math.min(bottom(cr), low);
                grew = true;
              } else if (bottom(cr) >= low - TOLERANCE && cr.y < low - TOLERANCE && cr.y > top) {
                low = cr.y;
                grew = true;
              }
            }
          }
          if (low - top > TOLERANCE) {
            const peek = intersect(vis, { x: x0, y: top, width: x1 - x0, height: low - top });
            if (peek && peek.height >= PEEK_MIN && (vis.y < top - TOLERANCE || bottom(vis) > low + TOLERANCE)) {
              out.push(
                finding(
                  'LC-20',
                  'error',
                  n,
                  `${kind} terlihat di celah di antara bar zona bawah "${upper.node.name}" dan "${lower.node.name}" (y ${num(peek.y)}–${num(bottom(peek))}), sebagian tertutup bar`,
                  `jangan biarkan konten mengintip di celah antar-bar: rapatkan bar (celah 0), beri latar penutup di belakang keduanya, atau akhiri daftar sebelum zona`,
                ),
              );
              return true;
            }
          }
        }
      }
      if (bottom(lower.rect) > bottom(upper.rect)) upper = lower;
    }
    return false;
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

  // Sub-cek 2 + 4 + 5 + 3, atas-ke-bawah: hanya yang terluar dilaporkan.
  const walk = (children: readonly ChildNode[]) => {
    for (const n of children) {
      if (excluded.has(n.id) || reported.has(n.id)) continue;
      if (cut(n)) continue;
      if (gap(n)) continue;
      if (between(n)) continue;
      if (n.type === 'frame' && named(n, 'Crop /')) continue;
      if (orphan(n)) continue;
      if (n.type === 'frame') walk(n.children);
    }
  };
  walk(board.children);
  return out;
}

// ===========================================================================
// Aturan polesan (story 1.23): luapan ink, tumpang tindih, kontras (error); spacing, proporsi, tipografi (warning).
// ===========================================================================

const levelOf = (rule: Finding['rule']): Finding['level'] => G0_RULES[rule].level;
const nonEmpty = (t: TextNode): boolean => t.content.trim() !== '';
const rotated = (n: { rotation?: number | undefined }): boolean => (n.rotation ?? 0) !== 0;
/** Komponen: aturan spacing/proporsi tidak menilai isi di dalamnya. */
const COMPONENTS = ['Button /', 'IconButton /', 'Badge /', 'Chip /', 'Tab /', 'Link /', 'Input /'];
const isComponent = (n: { name: string }): boolean => COMPONENTS.some((c) => named(n, c));
const inComponent = (ctx: BoardContext, n: ChildNode): boolean => isComponent(n) || ancestors(ctx, n).some((a) => a.type === 'frame' && isComponent(a));

type Pad = { t: number; r: number; b: number; l: number };
const ZERO_PAD: Pad = { t: 0, r: 0, b: 0, l: 0 };

/** Padding frame per sisi (`n` | `[v,h]` | `[t,r,b,l]`); board = 0. */
export function paddingOf(n: Container): Pad {
  if (n.type === 'board' || n.padding === undefined) return ZERO_PAD;
  const p = n.padding as number | readonly number[];
  if (typeof p === 'number') return { t: p, r: p, b: p, l: p };
  if (p.length === 2) return { t: p[0]!, r: p[1]!, b: p[0]!, l: p[1]! };
  return { t: p[0]!, r: p[1]!, b: p[2]!, l: p[3]! };
}

const textsIn = (n: ChildNode): TextNode[] => [n, ...descendants(n)].filter((t): t is TextNode => t.type === 'text' && nonEmpty(t));
const lineHeightOf = (ctx: BoardContext, t: TextNode): number => ctx.textMeasure.get(t.id)?.lineHeight ?? t.lineHeight ?? 1.2 * t.size;
const fillsOf = (n: ChildNode | Container): readonly ResolvedFill[] => ((n as { fills?: readonly ResolvedFill[] }).fills ?? []);
const strokeAll = (n: ChildNode): boolean => {
  const s = (n as { stroke?: { sides?: readonly string[] } }).stroke;
  return s !== undefined && (!s.sides || s.sides.length >= 4);
};
const dropShadow = (n: ChildNode): boolean => ((n as { shadows?: readonly { type?: string }[] }).shadows ?? []).some((s) => s.type !== 'inner');

/** Ber-cat: fill tak transparan, stroke, atau bayangan luar. */
const paintedCard = (n: ChildNode): boolean =>
  fillsOf(n).some((f) => f.type !== 'solid' || parseHex((f as { color: string }).color)[3] > 0) || (n as { stroke?: unknown }).stroke !== undefined || dropShadow(n);

/** Batasi detail warning ≤ 120 karakter. */
const clip120 = (s: string): string => ([...s].length > 120 ? `${[...s].slice(0, 119).join('')}…` : s);

// ---------------------------------------------------------------------------
// LC-02b · ink teks meluap dari content box induk
// ---------------------------------------------------------------------------

/** Luapan > 1 px dihitung (ink Range bisa berbeda sub-piksel dari bounds). */
export const INK_OVERFLOW_MIN = 1;
/**
 * Luapan baru cacat bila sisa jarak ink ke batas tampak terdekat di sisi itu < 4 px: tepi wadah ber-cat (fill/stroke)
 * atau ber-clip terdekat, tepi board, atau saudara (dari teks sampai wadah itu) yang menghadang di sisi itu.
 * Luapan kecil ke padding yang masih lega tidak terlihat sebagai cacat.
 */
export const INK_CLEARANCE_MIN = 4;

type Side = (typeof SIDES)[number];
const painted = (n: Container): boolean => n.type === 'board' || fillsOf(n).length > 0 || (n as { stroke?: unknown }).stroke !== undefined || n.clip === true;

/** Sisa jarak ink ke batas tampak di `side` (negatif = menabrak); `by` = nama penghadang. */
function clearance(ctx: BoardContext, t: TextNode, ink: Rect, side: Side): { gap: number; by: string } {
  let best = { gap: Infinity, by: '' };
  const take = (gap: number, by: string) => {
    if (gap < best.gap) best = { gap, by };
  };
  let unit: ChildNode = t;
  for (const a of ancestors(ctx, t)) {
    const ur = unit.type === 'text' ? ink : ctx.bounds.get(unit.id);
    for (const s of a.children) {
      if (s === unit || named(s, 'Overlay /') || named(s, 'Crop /') || !ur) continue;
      const sr = s.type === 'text' ? (nonEmpty(s) ? inkRect(ctx, s) : undefined) : ctx.bounds.get(s.id);
      if (!sr || area(sr) <= 0 || !visibleRect(ctx, s)) continue;
      const hOverlap = Math.min(bottom(sr), bottom(ink)) - Math.max(sr.y, ink.y) > 0;
      const vOverlap = Math.min(right(sr), right(ink)) - Math.max(sr.x, ink.x) > 0;
      if (side === 'kanan' && hOverlap && sr.x >= right(ur) - TOLERANCE) take(sr.x - right(ink), `${s.name} (${s.id})`);
      if (side === 'kiri' && hOverlap && right(sr) <= ur.x + TOLERANCE) take(ink.x - right(sr), `${s.name} (${s.id})`);
      if (side === 'bawah' && vOverlap && sr.y >= bottom(ur) - TOLERANCE) take(sr.y - bottom(ink), `${s.name} (${s.id})`);
      if (side === 'atas' && vOverlap && bottom(sr) <= ur.y + TOLERANCE) take(ink.y - bottom(sr), `${s.name} (${s.id})`);
    }
    if (painted(a)) {
      const r = a.type === 'board' ? ctx.boardRect : ctx.bounds.get(a.id);
      if (r) {
        const o = overflow(ink, r);
        take(-o[side], `tepi ${a.name} (${a.id})`);
      }
      break;
    }
    if (a.type === 'board') break;
    unit = a;
  }
  return best;
}

export function lc02b(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  for (const t of texts(ctx)) {
    if (!nonEmpty(t) || rotated(t) || named(t, 'Overlay /')) continue;
    const ink = ctx.ink.get(t.id);
    if (!ink || !visibleRect(ctx, t)) continue;
    const anc = ancestors(ctx, t);
    if (anc.some((a) => a.type === 'frame' && (named(a, 'Crop /') || named(a, 'Overlay /') || rotated(a)))) continue;
    const parent = anc[0]!;
    const pr = parent.type === 'board' ? ctx.boardRect : ctx.bounds.get(parent.id);
    if (!pr) continue;
    // Anak flow: content box (bounds − padding); anak absolut / frame layout none: padding box (= bounds).
    const pad = isFlowChild(parent, t) ? paddingOf(parent) : ZERO_PAD;
    const box: Rect = { x: pr.x + pad.l, y: pr.y + pad.t, width: pr.width - pad.l - pad.r, height: pr.height - pad.t - pad.b };
    const o = overflow(ink, box);
    const scrolled = parent.type === 'frame' && (parent.scrollY ?? 0) > 0;
    const hits = SIDES.flatMap((s) => {
      if (o[s] <= INK_OVERFLOW_MIN || (scrolled && (s === 'atas' || s === 'bawah'))) return [];
      const c = clearance(ctx, t, ink, s);
      return c.gap < INK_CLEARANCE_MIN ? [{ s, c }] : [];
    });
    if (!hits.length) continue;
    out.push(
      finding(
        'LC-02b',
        levelOf('LC-02b'),
        t,
        `teks ${quote(t.content)} meluap ${hits.map(({ s, c }) => `${num(o[s])}px di ${s} (sisa ${num(c.gap)}px ke ${c.by})`).join(', ')} dari isi ${parent.name} (${parent.id})`,
        `di dalam isi induk: teks width:'fill' (dibungkus) atau perlebar/perpendek; di Row, teks fill dan badge/ikon hug`,
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-02c · non-teks meluap dari isi wadah tampak
// ---------------------------------------------------------------------------

/** Luapan > 1 px dari content box dihitung. */
export const BOX_OVERFLOW_MIN = 1;
/**
 * Luapan non-teks baru cacat bila sisa jarak ke tepi wadah tampak di sisi itu < min(8, padding wadah di sisi itu / 2)
 * (negatif = tumpah keluar). Luapan kecil ke padding yang masih lega tidak terlihat sebagai cacat.
 */
export const BOX_CLEARANCE_MAX = 8;

const padSide = (p: Pad, s: Side): number => (s === 'kiri' ? p.l : s === 'kanan' ? p.r : s === 'atas' ? p.t : p.b);
const contentBox = (r: Rect, p: Pad): Rect => ({ x: r.x + p.l, y: r.y + p.t, width: r.width - p.l - p.r, height: r.height - p.t - p.b });

/**
 * Anak flow non-teks `n` (induk `P`) yang melewati content box `P` > 1 px dan content box wadah tampak `W` > 1 px, dengan
 * sisa jarak ke tepi `W` < min(8, padding `W` / 2). `W` = leluhur ber-cat terdekat (mulai `P`, bukan board) yang dicapai
 * lewat rantai anak flow. Dikecualikan: `Overlay /`/`Crop /` (node/leluhur), rotasi di rantai, induk gap negatif, sisi
 * atas/bawah di bawah `Scroll /`/`scrollY`, dan node LC-02a (`skip`). Hanya node terluar.
 */
export function lc02c(ctx: BoardContext, skip: ReadonlySet<string> = new Set()): Finding[] {
  const out: Finding[] = [];
  const reported = new Set<string>();
  for (const n of ctx.nodes) {
    if (n.type === 'text' || skip.has(n.id) || rotated(n) || named(n, 'Overlay /') || named(n, 'Crop /')) continue;
    const r = ctx.bounds.get(n.id);
    if (!r || area(r) <= 0) continue;
    const anc = ancestors(ctx, n);
    // Keturunan node LC-02a (dibungkam lc02a) dan keturunan node LC-02c yang sudah dilaporkan dilewati.
    if (anc.some((a) => reported.has(a.id) || skip.has(a.id))) continue;
    const parent = anc[0]!;
    if (parent.type === 'board' || !isFlowChild(parent, n) || ((parent.gap ?? 0) as number) < 0) continue;
    if (anc.some((a) => a.type === 'frame' && (named(a, 'Overlay /') || named(a, 'Crop /') || rotated(a)))) continue;
    // Wadah tampak: leluhur ber-cat terdekat lewat rantai anak flow.
    let wrap: FrameNode | undefined;
    for (let i = 0; i < anc.length; i++) {
      const a = anc[i]!;
      if (a.type === 'board') break;
      if (paintedCard(a)) {
        wrap = a;
        break;
      }
      if (!isFlowChild(anc[i + 1]!, a)) break;
    }
    if (!wrap) continue;
    const pr = ctx.bounds.get(parent.id);
    const wr = ctx.bounds.get(wrap.id);
    if (!pr || !wr) continue;
    const wp = paddingOf(wrap);
    const fromP = overflow(r, contentBox(pr, paddingOf(parent)));
    const fromW = overflow(r, contentBox(wr, wp));
    const edge = overflow(r, wr);
    const scrolled = anc.some((a) => a.type === 'frame' && (named(a, 'Scroll /') || (a.scrollY ?? 0) > 0));
    const hits = SIDES.filter(
      (s) =>
        !(scrolled && (s === 'atas' || s === 'bawah')) &&
        fromP[s] > BOX_OVERFLOW_MIN &&
        fromW[s] > BOX_OVERFLOW_MIN &&
        -edge[s] < Math.min(BOX_CLEARANCE_MAX, padSide(wp, s) / 2),
    );
    if (!hits.length) continue;
    reported.add(n.id);
    out.push(
      finding(
        'LC-02c',
        levelOf('LC-02c'),
        n,
        clip120(`meluap ${hits.map((s) => `${num(fromW[s])}px di ${s} (sisa ${num(-edge[s])}px ke tepi ${wrap.name})`).join(', ')} dari isi ${parent.name}`),
        'di dalam isi wadah: kecilkan, bungkus, atau beri ruang (sisa ke tepi ≥ 8 atau ≥ separuh padding)',
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-11 · saudara tumpang tindih sebagian
// ---------------------------------------------------------------------------

export function lc11(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  const containers: Container[] = [ctx.board, ...ctx.nodes.filter((n): n is FrameNode => n.type === 'frame')];
  for (const c of containers) {
    if (c.type === 'frame' && ((c.gap ?? 0) as number) < 0) continue;
    const kids = c.children.flatMap((k) => {
      if (named(k, 'Overlay /') || named(k, 'Crop /') || rotated(k) || (k.opacity ?? 1) <= 0) return [];
      if (!visibleRect(ctx, k)) return [];
      const r = k.type === 'text' ? inkRect(ctx, k) : ctx.bounds.get(k.id);
      if (!r || area(r) <= 0) return [];
      const hasText = k.type === 'text' ? nonEmpty(k) : textsIn(k).length > 0;
      return [{ k, r, flow: isFlowChild(c, k), hasText }];
    });
    for (let j = 1; j < kids.length; j++) {
      const b = kids[j]!;
      for (let i = 0; i < j; i++) {
        const a = kids[i]!;
        if (!(a.flow && b.flow) && !(a.hasText && b.hasText)) continue;
        const ix = intersect(a.r, b.r);
        if (!ix || ix.width < 1 || ix.height < 1) continue;
        // Termuat penuh di dalam bentuk/wadah (mis. label di tengah ring) bukan tabrakan; ink teks yang menutupi saudara tetap tabrakan.
        if ((a.k.type !== 'text' && contains(a.r, b.r)) || (b.k.type !== 'text' && contains(b.r, a.r))) continue;
        out.push(
          finding(
            'LC-11',
            levelOf('LC-11'),
            b.k,
            `tumpang tindih ${num(ix.width)}×${num(ix.height)}px dengan ${a.k.name} (${a.k.id}) di ${c.name}`,
            `pisahkan (perkecil/bungkus teks, gap ≥ 8); tumpukan sengaja: frame "Overlay / …"`,
          ),
        );
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-04 · kontras teks setelah komposit
// ---------------------------------------------------------------------------

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

export function parseHex(hex: string): RGBA {
  const h = hex.replace('#', '');
  const v = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return [v(0), v(2), v(4), h.length >= 8 ? v(6) : 1];
}
const over = (top: RGBA, bottom: RGB, alpha = 1): RGB => {
  const a = top[3] * alpha;
  return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a)];
};
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
/** Rasio kontras WCAG 2. */
export function contrastRatio(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
const toHex = (c: RGB) => `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

const MAX_CANDIDATES = 64;
type Effects = { opacity?: number | undefined; blend?: string | undefined; backdropBlur?: number | undefined };
const effectsOf = (n: unknown): Effects => n as Effects;
const isPainter = (n: ChildNode): boolean => (n.type === 'frame' || n.type === 'rect' || n.type === 'ellipse' || n.type === 'path') && fillsOf(n).length > 0;
const stopsOf = (f: ResolvedFill): string[] => (f.type === 'solid' ? [f.color] : (f as { stops: { color: string }[] }).stops.map((s) => s.color));
const busyFill = (f: ResolvedFill): boolean => f.type === 'image' || f.type === 'noise' || f.type === 'mesh';

/** Opacity jalur node + frame leluhurnya (alpha) dan apakah opacity < 1 / blend ada di jalur (perkiraan). */
function pathAlpha(ctx: BoardContext, n: ChildNode): { alpha: number; warn: boolean } {
  let alpha = 1;
  let warn = false;
  for (const x of [n, ...ancestors(ctx, n).filter((a): a is FrameNode => a.type === 'frame')]) {
    const e = effectsOf(x);
    if (e.opacity !== undefined && e.opacity < 1) {
      alpha *= e.opacity;
      warn = true;
    }
    if (e.blend && e.blend !== 'normal') warn = true;
  }
  return { alpha, warn };
}

/** Latar efektif di belakang `rect`: kandidat warna (stop gradien → beberapa) atau alasan dilewati (tak tentu). */
type Backdrop = { cands: RGB[]; warn: boolean } | { skip: 'image' | 'partial' | 'cover' | 'many' };

/**
 * Latar efektif LC-04 untuk persegi target (ink teks, bounds ikon/kontrol) dengan urutan dokumen `order`. Lapisan = node
 * ber-fill sebelum `order` yang beririsan `rect` (leluhur target, atau memuat `rect` penuh; sebagian/ellipse/path → tak
 * tentu), kecuali id di `exclude`; node ber-fill sesudah `order` yang beririsan → tak tentu; gambar/noise/mesh → tak tentu;
 * gradien/opacity/blend/backdrop blur → `warn`. Dikomposit dari lapisan teratas sampai fill opak (tanpa fill: board, lalu putih).
 */
function backdrop(ctx: BoardContext, painters: readonly ChildNode[], rect: Rect, order: number, ancIds: ReadonlySet<string>, exclude: ReadonlySet<string>): Backdrop {
  let warn = false;
  for (const p of painters) {
    if (ctx.order.get(p.id)! <= order || exclude.has(p.id)) continue;
    const v = visibleRect(ctx, p);
    if (v && intersect(v, rect)) return { skip: 'cover' };
  }
  type Layer = { node: ChildNode | Container; partial: boolean; alpha: number };
  const layers: Layer[] = [];
  for (const p of painters) {
    if (ctx.order.get(p.id)! >= order || exclude.has(p.id)) continue;
    const isAnc = ancIds.has(p.id);
    const v = visibleRect(ctx, p);
    if (!v || !intersect(v, rect)) continue;
    const shape = p.type === 'ellipse' || p.type === 'path';
    const partial = shape || (!isAnc && !contains(v, rect));
    let alpha = 1;
    for (const n of [p, ...ancestors(ctx, p).filter((a) => a.type === 'frame' && !ancIds.has(a.id))]) {
      const e = effectsOf(n);
      if (e.opacity !== undefined && e.opacity < 1) alpha *= e.opacity;
      if ((e.opacity !== undefined && e.opacity < 1) || (e.blend && e.blend !== 'normal') || (e.backdropBlur ?? 0) > 0) warn = true;
    }
    layers.push({ node: p, partial, alpha });
  }
  layers.sort((a, b) => (ctx.order.get(a.node.id) ?? 0) - (ctx.order.get(b.node.id) ?? 0));
  // Turun dari lapisan teratas sampai fill opak penuh (dasar).
  type Paint = { fill: ResolvedFill; alpha: number };
  const above: Paint[] = [];
  let base: RGB[] | undefined;
  scan: for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]!;
    if (l.partial) return { skip: 'partial' };
    const fills = fillsOf(l.node);
    for (let j = fills.length - 1; j >= 0; j--) {
      const f = fills[j]!;
      if (busyFill(f)) return { skip: 'image' };
      const stops = stopsOf(f);
      if (f.type !== 'solid') warn = true;
      if (l.alpha >= 1 && stops.every((c) => parseHex(c)[3] >= 1)) {
        base = stops.map((c) => parseHex(c).slice(0, 3) as RGB);
        break scan;
      }
      above.push({ fill: f, alpha: l.alpha });
    }
  }
  if (!base) {
    const bf = fillsOf(ctx.board);
    if (bf.some(busyFill)) return { skip: 'image' };
    base = [[1, 1, 1]];
    for (const f of bf) {
      if (f.type !== 'solid') warn = true;
      const stops = stopsOf(f);
      base = base.flatMap((c) => stops.map((s) => over(parseHex(s), c)));
    }
  }
  let cands = base;
  for (let k = above.length - 1; k >= 0; k--) {
    const { fill: f, alpha } = above[k]!;
    const stops = stopsOf(f);
    cands = cands.flatMap((c) => stops.map((s) => over(parseHex(s), c, alpha)));
    if (cands.length > MAX_CANDIDATES) return { skip: 'many' };
  }
  return { cands, warn };
}

/** Rasio terburuk warna `fg` (alpha × `alpha`) dikomposit di atas setiap kandidat latar. */
function worstOver(fg: RGBA, alpha: number, cands: readonly RGB[]): { ratio: number; fg: RGB; bg: RGB } | undefined {
  let worst: { ratio: number; fg: RGB; bg: RGB } | undefined;
  for (const bg of cands) {
    const c = over(fg, bg, alpha);
    const ratio = contrastRatio(c, bg);
    if (!worst || ratio < worst.ratio) worst = { ratio, fg: c, bg };
  }
  return worst;
}

const floor2 = (r: number): number => Math.floor(r * 100) / 100;
const idsOf = (n: ChildNode): Set<string> => new Set([n.id, ...descendants(n).map((d) => d.id)]);

const CONTROL_EXPECTED = `≥ ${CONTRAST_MIN.nonText}:1 terhadap latar: stroke border-input (#7D8798) atau fill kontrol yang kontras`;

/** Batas kontrol `Input /`, `Radio /`, `Checkbox /` (terluar) ≥ 3:1 terhadap latar. */
function controlIssues(ctx: BoardContext, painters: readonly ChildNode[]): Finding[] {
  const out: Finding[] = [];
  for (const k of ctx.nodes) {
    if (k.type !== 'frame' || !namedAny(k, CONTROL_PREFIXES)) continue;
    const anc = ancestors(ctx, k);
    if (anc.some((a) => a.type === 'frame' && namedAny(a, CONTROL_PREFIXES))) continue;
    const v = visibleRect(ctx, k);
    if (!v || area(v) <= 0) continue;
    const path = pathAlpha(ctx, k);
    if (path.alpha <= 0) continue;
    const bd = backdrop(ctx, painters, v, ctx.order.get(k.id)!, new Set(anc.map((a) => a.id)), idsOf(k));
    if ('skip' in bd) continue;
    // Cat batas: stroke + fill kontrol; tanpa keduanya → keturunan frame/rect/ellipse bercat (bukan teks/ikon).
    type BorderPaint = { colors: string[]; alpha: number };
    const own = (n: ChildNode, alpha: number): BorderPaint[] | undefined => {
      const paints: BorderPaint[] = [];
      const s = (n as { stroke?: { color: string } }).stroke;
      if (s) paints.push({ colors: [s.color], alpha });
      for (const f of fillsOf(n)) {
        if (busyFill(f)) return undefined;
        const colors = stopsOf(f);
        if (colors.some((c) => parseHex(c)[3] > 0)) paints.push({ colors, alpha });
      }
      return paints;
    };
    let paints = own(k, path.alpha);
    if (paints === undefined) continue;
    let warn = path.warn || bd.warn;
    if (paints.length === 0) {
      const iconBorder = namedAny(k, ['Checkbox /', 'Radio /']);
      for (const d of descendants(k)) {
        // Checkbox/Radio digambar dengan ikon (mis. lucide square/circle): ikon = batas.
        if (iconBorder && d.type === 'icon' && visibleRect(ctx, d)) {
          const dp = pathAlpha(ctx, d);
          if (dp.alpha <= 0) continue;
          warn ||= dp.warn;
          paints.push({ colors: [d.color ?? '#000000'], alpha: dp.alpha });
          continue;
        }
        if ((d.type !== 'frame' && d.type !== 'rect' && d.type !== 'ellipse') || !visibleRect(ctx, d)) continue;
        const dp = pathAlpha(ctx, d);
        if (dp.alpha <= 0) continue;
        const p = own(d, dp.alpha);
        if (p === undefined) {
          paints = undefined;
          break;
        }
        if (p.length) warn ||= dp.warn;
        paints.push(...p);
      }
      if (paints === undefined) continue;
    }
    const level = warn ? 'warning' : levelOf('LC-04');
    if (paints.length === 0) {
      out.push(finding('LC-04', level, k, 'batas kontrol: tanpa batas terlihat (tanpa stroke dan fill)', CONTROL_EXPECTED));
      continue;
    }
    // Rasio = maksimum atas cat batas; tiap cat dinilai terhadap kandidat latar terburuk (stop gradien terburuk).
    let best: { ratio: number; fg: RGB; bg: RGB } | undefined;
    for (const p of paints) {
      let worst: { ratio: number; fg: RGB; bg: RGB } | undefined;
      for (const c of p.colors) {
        const w = worstOver(parseHex(c), p.alpha, bd.cands);
        if (w && (!worst || w.ratio < worst.ratio)) worst = w;
      }
      if (worst && (!best || worst.ratio > best.ratio)) best = worst;
    }
    if (!best || best.ratio >= CONTRAST_MIN.nonText) continue;
    out.push(
      finding(
        'LC-04',
        level,
        k,
        clip120(`batas kontrol ${floor2(best.ratio)}:1 (${toHex(best.fg)} di atas ${toHex(best.bg)}${warn ? ', gradien/opacity/blend: perkiraan' : ''})`),
        CONTROL_EXPECTED,
      ),
    );
  }
  return out;
}

/** Komponen yang labelnya = teks di dalam komponen terdekat. */
const LABEL_COMPONENTS = ['Button /', 'IconButton /', 'Tab /', 'Link /', 'Chip /', 'Badge /', 'Input /', 'Radio /', 'Checkbox /', 'Stepper /'];
/** Chrome sistem (dirender OS di atas apa pun): ikon dan teks di dalamnya tidak dinilai ikon tanpa label/scrim. */
const SYSTEM_CHROME = ['Status bar', 'Home indicator'];
const ICON_BRAND_LIBS = new Set(['simple-icons']);

/** Isi tampak untuk pencarian label ikon: teks tak kosong, ikon, path, node bercat, atau frame berisi itu. */
const hasContent = (n: ChildNode): boolean =>
  n.type === 'text'
    ? nonEmpty(n)
    : n.type === 'icon' || n.type === 'path' || fillsOf(n).length > 0 || (n as { stroke?: unknown }).stroke !== undefined || (n.type === 'frame' && n.children.some(hasContent));
const hasVisibleText = (ctx: BoardContext, scope: Container): boolean =>
  (scope.type === 'board' ? ctx.nodes : [scope, ...descendants(scope)]).some((t) => t.type === 'text' && nonEmpty(t) && (t.opacity ?? 1) > 0 && visibleRect(ctx, t) !== undefined);

const iconOnly = (n: ChildNode): boolean => n.type === 'icon' || (n.type === 'frame' && n.children.length > 0 && n.children.every(iconOnly));
/** Teks nilai pendek: terlihat, berangka, ≤ ICON_GROUP_LABEL_MAX karakter. */
const valueLabel = (ctx: BoardContext, c: ChildNode): boolean =>
  c.type === 'text' && nonEmpty(c) && /\d/.test(c.content) && [...c.content.trim()].length <= ICON_GROUP_LABEL_MAX && (c.opacity ?? 1) > 0 && visibleRect(ctx, c) !== undefined;

/**
 * Ikon berlabel: komponen terdekat memuat teks; tanpa komponen, leluhur pertama yang punya anak lain berisi konten memuat teks.
 * Deretan ikon saja (anak lain di leluhur itu hanya ikon, mis. baris bintang rating) berlabel bila di leluhur pertama dengan
 * konten bukan-ikon ada teks nilai pendek bersebelahan (anak langsung, berangka, ≤ 40 karakter: "4,8", "1.284 ulasan").
 */
function iconLabeled(ctx: BoardContext, n: ChildNode, anc: readonly Container[]): boolean {
  const comp = anc.find((a) => a.type === 'frame' && namedAny(a, LABEL_COMPONENTS));
  if (comp) return hasVisibleText(ctx, comp);
  let cur: { id: string } = n;
  let group = false;
  for (const a of anc) {
    const others = a.children.filter((c) => c.id !== cur.id && hasContent(c));
    cur = a;
    if (!others.length) continue;
    if (!group) {
      if (others.every(iconOnly)) {
        group = true;
        continue;
      }
      // Deretan ikon sama tanpa pembungkus (mis. bintang langsung di baris): berlabel hanya oleh teks nilai, sama dengan deretan berbungkus.
      if (n.type === 'icon' && others.some((c) => c.type === 'icon' && c.lib === n.lib && c.icon === n.icon)) return others.some((c) => valueLabel(ctx, c));
      return hasVisibleText(ctx, a);
    }
    if (others.every(iconOnly)) continue;
    return others.some((c) => valueLabel(ctx, c));
  }
  return false;
}

const ICON_EXPECTED = `≥ ${CONTRAST_MIN.nonText}:1 terhadap latar (mis. amber gelap untuk bintang), atau beri label teks (mis. nilai rating di baris itu)`;

/** Ikon UI tanpa label teks ≥ 3:1 terhadap latar (logo `simple-icons` dan ikon chrome dilewati). */
function iconIssues(ctx: BoardContext, painters: readonly ChildNode[]): Finding[] {
  const out: Finding[] = [];
  for (const n of ctx.nodes) {
    if (n.type !== 'icon' || ICON_BRAND_LIBS.has(n.lib)) continue;
    const v = visibleRect(ctx, n);
    if (!v || area(v) <= 0) continue;
    const anc = ancestors(ctx, n);
    if (anc.some((a) => namedAny(a, SYSTEM_CHROME))) continue;
    const path = pathAlpha(ctx, n);
    if (path.alpha <= 0 || iconLabeled(ctx, n, anc)) continue;
    const bd = backdrop(ctx, painters, v, ctx.order.get(n.id)!, new Set(anc.map((a) => a.id)), new Set([n.id]));
    if ('skip' in bd) continue;
    const worst = worstOver(parseHex(n.color ?? '#000000'), path.alpha, bd.cands);
    if (!worst || worst.ratio >= CONTRAST_MIN.nonText) continue;
    const warn = path.warn || bd.warn;
    out.push(
      finding(
        'LC-04',
        warn ? 'warning' : levelOf('LC-04'),
        n,
        clip120(`ikon tanpa label ${floor2(worst.ratio)}:1 (${toHex(worst.fg)} di atas ${toHex(worst.bg)}${warn ? ', gradien/opacity/blend: perkiraan' : ''})`),
        ICON_EXPECTED,
      ),
    );
  }
  return out;
}

/** Keempat sudut `r` di dalam elips yang mengisi `v`. */
const inEllipse = (v: Rect, r: Rect): boolean => {
  const cx = v.x + v.width / 2;
  const cy = v.y + v.height / 2;
  const rx = v.width / 2;
  const ry = v.height / 2;
  if (rx <= 0 || ry <= 0) return false;
  return [
    [r.x, r.y],
    [right(r), r.y],
    [r.x, bottom(r)],
    [right(r), bottom(r)],
  ].every(([x, y]) => ((x! - cx) / rx) ** 2 + ((y! - cy) / ry) ** 2 <= 1);
};

const SCRIM_EXPECTED = `taruh scrim fill solid opacity ≥ ${String(SCRIM_MIN_ALPHA).replace('.', ',')} di antara gambar/efek dan teks, atau pindah ke zona tenang`;

/** Teks di atas foto/gradien multi-hue/efek blur tanpa scrim (fill solid alpha × opacity ≥ 0,5 yang memuat ink) → warning; chrome sistem dilewati. */
function scrimIssues(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  const layersAll = ctx.nodes.filter((p) => (p.type === 'frame' || p.type === 'rect' || p.type === 'ellipse' || p.type === 'path') && (fillsOf(p).length > 0 || ((p as { blur?: number }).blur ?? 0) > 0));
  for (const t of texts(ctx)) {
    if (!nonEmpty(t) || (t.opacity ?? 1) <= 0 || !visibleRect(ctx, t)) continue;
    const ink = inkRect(ctx, t);
    if (!ink || area(ink) <= 0) continue;
    const anc = ancestors(ctx, t);
    if (anc.some((a) => namedAny(a, SYSTEM_CHROME))) continue;
    const order = ctx.order.get(t.id)!;
    const ancIds = new Set(anc.map((a) => a.id));
    const under: (ChildNode | Container)[] = [ctx.board];
    for (const p of layersAll) {
      if (ctx.order.get(p.id)! >= order) continue;
      const v = visibleRect(ctx, p);
      if (v && intersect(v, ink)) under.push(p);
    }
    // Fill solid ≥ SCRIM_MIN_ALPHA (alpha warna × opacity jalur di luar leluhur teks) yang memuat ink; `from` = indeks fill pertama.
    const scrimFill = (p: ChildNode | Container, from = 0): boolean => {
      if (p.type === 'path') return false;
      const v = p.type === 'board' ? ctx.boardRect : visibleRect(ctx, p);
      if (!v || !contains(v, ink)) return false;
      if (p.type === 'ellipse' && !inEllipse(ctx.bounds.get(p.id) ?? v, ink)) return false;
      let a = 1;
      if (p.type !== 'board')
        for (const q of [p, ...ancestors(ctx, p)]) {
          const o = effectsOf(q).opacity;
          if (o !== undefined && !ancIds.has(q.id)) a *= o;
        }
      return fillsOf(p)
        .slice(from)
        .some((f) => f.type === 'solid' && parseHex(f.color)[3] * a >= SCRIM_MIN_ALPHA);
    };
    let busy = -1;
    let busyAt = 0;
    let kind = '';
    under.forEach((p, i) => {
      const fills = fillsOf(p);
      const img = fills.findLastIndex((f) => f.type === 'image');
      const fx = fills.findLastIndex((f) => f.type === 'noise' || f.type === 'mesh');
      const grad = fills.findLastIndex(multiHue);
      const top = Math.max(img, fx, grad);
      if (top >= 0) {
        busy = i;
        busyAt = top + 1;
        kind = top === img ? 'foto' : top === grad ? 'gradien' : 'efek';
      } else if (p.type !== 'board' && ((p as { blur?: number }).blur ?? 0) >= EFFECT_BLUR_MIN && !scrimFill(p)) {
        busy = i;
        busyAt = fills.length;
        kind = 'efek';
      }
    });
    if (busy < 0) continue;
    // Scrim: fill solid di atas lapisan sibuk (di node yang sama sesudah fill sibuk, atau lapisan sesudahnya).
    if (scrimFill(under[busy]!, busyAt) || under.slice(busy + 1).some((p) => scrimFill(p))) continue;
    out.push(
      finding(
        'LC-04',
        'warning',
        t,
        clip120(`scrim: teks di atas ${kind} tanpa scrim (fill solid ≥ ${String(SCRIM_MIN_ALPHA).replace('.', ',')}) ${quote(t.content)}`),
        SCRIM_EXPECTED,
      ),
    );
  }
  return out;
}

export function lc04(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  const painters = ctx.nodes.filter(isPainter);
  for (const t of texts(ctx)) {
    if (!nonEmpty(t) || (t.opacity ?? 1) <= 0) continue;
    const ink = inkRect(ctx, t);
    if (!ink || area(ink) <= 0 || !visibleRect(ctx, t)) continue;
    const anc = ancestors(ctx, t);
    const path = pathAlpha(ctx, t);
    const bd = backdrop(ctx, painters, ink, ctx.order.get(t.id)!, new Set(anc.map((a) => a.id)), new Set());
    if ('skip' in bd) continue;
    const warn = path.warn || bd.warn;
    const worst = worstOver(parseHex(t.color ?? '#000000'), path.alpha, bd.cands);
    if (!worst) continue;
    const min = textContrastMin(t);
    if (worst.ratio >= min) continue;
    out.push(
      finding(
        'LC-04',
        warn ? 'warning' : levelOf('LC-04'),
        t,
        clip120(`kontras ${floor2(worst.ratio)}:1 (${toHex(worst.fg)} di atas ${toHex(worst.bg)}${warn ? ', gradien/opacity/blend: perkiraan' : ''}) ${quote(t.content)}`),
        `≥ ${min}:1 setelah komposit: teks lebih gelap/terang atau latar lebih kontras; acc2/kuning bukan teks kecil`,
      ),
    );
  }
  // Teks yang sudah punya temuan kontras tidak diberi warning scrim lagi (satu slot cap per teks).
  const flagged = new Set(out.map((f) => f.nodeId));
  return [...out, ...controlIssues(ctx, painters), ...iconIssues(ctx, painters), ...scrimIssues(ctx).filter((f) => !flagged.has(f.nodeId))];
}

// ---------------------------------------------------------------------------
// LC-23 · celah teks ↔ badge/tombol/ikon di Row < 8 (warning)
// ---------------------------------------------------------------------------

export const ROW_GAP_MIN = 8;

export function lc23(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  const isTarget = (n: ChildNode) => (n.type === 'frame' && (named(n, 'Badge /') || named(n, 'Button /') || named(n, 'IconButton /'))) || (n.type === 'icon' && n.size >= 20);
  /** Teks atau frame berisi teks (bukan target): kotak = bounds ∪ ink teks di dalamnya. */
  const textExtent = (n: ChildNode): Rect | undefined => {
    if (isTarget(n)) return undefined;
    if (n.type === 'text') return nonEmpty(n) ? inkRect(ctx, n) : undefined;
    const ts = textsIn(n);
    if (!ts.length) return undefined;
    let r: Rect | undefined = ctx.bounds.get(n.id);
    for (const t of ts) {
      const i = ctx.ink.get(t.id);
      if (r && i) r = union(r, i);
    }
    return r;
  };
  for (const row of ctx.nodes) {
    if (row.type !== 'frame' || row.layout !== 'row' || inComponent(ctx, row)) continue;
    const flow = row.children.filter((k) => isFlowChild(row, k) && !!visibleRect(ctx, k));
    for (let i = 1; i < flow.length; i++) {
      const a = flow[i - 1]!;
      const b = flow[i]!;
      let gap: number | undefined;
      let target: ChildNode | undefined;
      let other: ChildNode | undefined;
      const ea = textExtent(a);
      const eb = textExtent(b);
      if (ea && isTarget(b)) {
        gap = ctx.bounds.get(b.id)!.x - right(ea);
        [target, other] = [b, a];
      } else if (isTarget(a) && eb) {
        gap = eb.x - right(ctx.bounds.get(a.id)!);
        [target, other] = [a, b];
      }
      if (gap === undefined || gap >= ROW_GAP_MIN - TOLERANCE) continue;
      out.push(finding('LC-23', 'warning', target!, `celah ${num(gap)}px ke teks ${other!.name} (${other!.id})`, `≥ ${ROW_GAP_MIN}: gap Row ≥ 8, teks width:'fill', badge/ikon hug`));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-24 · proporsi badge di baris (warning)
// ---------------------------------------------------------------------------

export function lc24(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  const isBadge = (n: ChildNode) => n.type === 'frame' && named(n, 'Badge /');
  /** Teks saudara (kedalaman ≤ 2 dari baris), tanpa isi badge. */
  const siblingTexts = (row: Container, unit: ChildNode): TextNode[] => {
    const outT: TextNode[] = [];
    for (const k of row.children) {
      if (k === unit || isBadge(k) || !isFlowChild(row, k)) continue;
      if (k.type === 'text' && nonEmpty(k)) outT.push(k);
      if (k.type === 'frame') for (const g of k.children) if (g.type === 'text' && nonEmpty(g)) outT.push(g);
    }
    return outT;
  };
  for (const b of ctx.nodes) {
    if (!isBadge(b) || !visibleRect(ctx, b)) continue;
    if (ancestors(ctx, b).some((a) => a.type === 'frame' && isComponent(a))) continue;
    let unit: ChildNode = b;
    let row = ctx.parentOf.get(b.id)!;
    let sib = siblingTexts(row, unit);
    // Pembungkus berisi badge saja (mis. kolom status, grup badge): naik maks 2 tingkat.
    for (let up = 0; !sib.length && up < 2 && row.type === 'frame'; up++) {
      unit = row;
      row = ctx.parentOf.get(row.id)!;
      sib = siblingTexts(row, unit);
    }
    if (!sib.length || row.type !== 'frame' || row.layout !== 'row') continue;
    const big = sib.reduce((m, t) => (t.size > m.size || (t.size === m.size && lineHeightOf(ctx, t) > lineHeightOf(ctx, m)) ? t : m));
    const lh = lineHeightOf(ctx, big);
    const h = ctx.bounds.get(b.id)?.height ?? 0;
    const own = textsIn(b);
    const ownSize = Math.max(0, ...own.map((t) => t.size));
    const ownLines = Math.max(0, ...own.map((t) => ctx.textMeasure.get(t.id)?.lines ?? 1));
    const issues: string[] = [];
    if (h > lh + TOLERANCE) issues.push(`tinggi ${num(h)} > line-height ${num(lh)}`);
    if (ownSize > 0 && ownSize >= big.size) issues.push(`teks ${num(ownSize)} ≥ ${num(big.size)}`);
    if (ownLines > 1) issues.push(`teks ${ownLines} baris`);
    if (!issues.length) continue;
    out.push(finding('LC-24', 'warning', b, `${issues.join(', ')} dari ${quote(big.content)}`, `Badge sm (20, teks 12) di baris; md (24) hanya di samping judul ≥ 18; 1 baris, hug`));
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-18 · kartu bersarang (warning)
// ---------------------------------------------------------------------------

export function lc18(ctx: BoardContext): Finding[] {
  const isCard = (n: ChildNode | Container): n is FrameNode => {
    if (n.type !== 'frame' || isComponent(n) || named(n, 'Overlay /') || n.children.length < 2) return false;
    if (!(fillsOf(n).length > 0 || strokeAll(n))) return false;
    const p = paddingOf(n);
    return Math.min(p.t, p.r, p.b, p.l) >= 12;
  };
  const elevated = (n: ChildNode) => strokeAll(n) || dropShadow(n);
  const out: Finding[] = [];
  for (const c of ctx.nodes) {
    if (!isCard(c) || !elevated(c) || !visibleRect(ctx, c)) continue;
    const outer = ancestors(ctx, c).find((a): a is FrameNode => isCard(a) && elevated(a));
    if (!outer) continue;
    out.push(finding('LC-18', 'warning', c, `kartu ber-${strokeAll(c) ? 'garis' : 'bayangan'} di dalam kartu ${outer.name} (${outer.id})`, 'satu lapis: kartu dalam jadi baris/bidang tanpa garis dan bayangan, atau judul di luar kartu'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-25 · radius tidak konsentris (warning)
// ---------------------------------------------------------------------------

export const CONCENTRIC_MAX_PAD = 24;
const CORNERS = [
  { key: 'kiri atas', i: 0, h: 'l', v: 't' },
  { key: 'kanan atas', i: 1, h: 'r', v: 't' },
  { key: 'kanan bawah', i: 2, h: 'r', v: 'b' },
  { key: 'kiri bawah', i: 3, h: 'l', v: 'b' },
] as const;

export function lc25(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  const radii = (n: { radius?: number | readonly number[] | undefined }): [number, number, number, number] => {
    const r = n.radius ?? 0;
    return typeof r === 'number' ? [r, r, r, r] : [r[0]!, r[1]!, r[2]!, r[3]!];
  };
  for (const p of ctx.nodes) {
    if (p.type !== 'frame' || !p.children.length) continue;
    const pr = ctx.bounds.get(p.id);
    if (!pr) continue;
    const ro = radii(p);
    const full = Math.min(pr.width, pr.height) / 2 - TOLERANCE;
    const pad = paddingOf(p);
    for (const c of p.children) {
      if ((c.type !== 'frame' && c.type !== 'rect') || !(fillsOf(c).length > 0 || c.stroke !== undefined)) continue;
      const cr = ctx.bounds.get(c.id);
      if (!cr || area(cr) <= 0) continue;
      const ri = radii(c);
      const cFull = Math.min(cr.width, cr.height) / 2 - TOLERANCE;
      for (const k of CORNERS) {
        const Ro = ro[k.i];
        const Ri = ri[k.i];
        const ph = pad[k.h];
        const pv = pad[k.v];
        if (Ro <= 0 || Ro >= full || Ri >= cFull) continue;
        if (ph <= 0 || pv <= 0 || ph > CONCENTRIC_MAX_PAD || pv > CONCENTRIC_MAX_PAD || Math.abs(ph - pv) > 2) continue;
        const ex = k.h === 'l' ? pr.x + ph : right(pr) - ph;
        const ey = k.v === 't' ? pr.y + pv : bottom(pr) - pv;
        const cx = k.h === 'l' ? cr.x : right(cr);
        const cy = k.v === 't' ? cr.y : bottom(cr);
        if (Math.abs(cx - ex) > 1 || Math.abs(cy - ey) > 1) continue;
        const pp = Math.min(ph, pv);
        if (Math.abs(Ro - (Ri + pp)) <= 2) continue;
        const inner = Ro - pp;
        out.push(
          finding(
            'LC-25',
            'warning',
            c,
            `radius ${num(Ri)} di sudut ${k.key} ${p.name} (radius ${num(Ro)}, padding ${num(pp)})`,
            inner >= 6 ? `luar = dalam + padding: radius dalam ${num(inner)} atau luar ${num(Ri + pp)}` : `luar = dalam + padding: luar ${num(Math.max(Ri, 6) + pp)} (dalam ≥ 6) atau padding lebih kecil`,
          ),
        );
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-26 · ritme judul: ruang di atas ≤ ruang di bawah (warning)
// ---------------------------------------------------------------------------

/** Nilai (harga, angka, jam), bukan judul: memuat angka dan ≤ 4 huruf. */
const isValue = (s: string): boolean => /\d/.test(s) && (s.match(/\p{L}/gu)?.length ?? 0) <= 4;

export function lc26(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  /** Kelompok konten sebelumnya: teks > 14 atau ≥ 2 teks (overline/kicker, ikon, badge tidak dihitung). */
  const isContent = (n: ChildNode) => {
    if (n.type === 'frame' && named(n, 'Badge /')) return false;
    const ts = textsIn(n);
    return ts.length >= 2 || ts.some((t) => t.size > 14);
  };
  for (const h of texts(ctx)) {
    if (!nonEmpty(h) || h.size < 20 || (h.weight ?? 400) < 600 || named(h, 'KPI /') || named(h, 'Display /') || isValue(h.content)) continue;
    let unit: ChildNode = h;
    let col = ctx.parentOf.get(h.id)!;
    if (col.type === 'frame' && col.layout === 'row') {
      const biggest = Math.max(...textsIn(col).map((t) => t.size));
      const pp = ctx.parentOf.get(col.id);
      if (h.size < biggest || !pp || !isFlowChild(pp, col)) continue;
      unit = col;
      col = pp;
    }
    const isColumn = col.type === 'board' || (col.layout ?? 'none') === 'column';
    if (!isColumn || !isFlowChild(col, unit)) continue;
    const flow = col.children.filter((k) => {
      const r = ctx.bounds.get(k.id);
      return isFlowChild(col, k) && !!r && area(r) > 0;
    });
    const i = flow.indexOf(unit);
    if (i <= 0 || i >= flow.length - 1) continue;
    const prev = flow[i - 1]!;
    if (!isContent(prev)) continue;
    const ur = ctx.bounds.get(unit.id)!;
    const above = ur.y - bottom(ctx.bounds.get(prev.id)!);
    const below = ctx.bounds.get(flow[i + 1]!.id)!.y - bottom(ur);
    if (above > below + TOLERANCE) continue;
    out.push(finding('LC-26', 'warning', h, `judul ${quote(h.content)}: ruang atas ${num(above)} ≤ bawah ${num(below)}`, 'judul + isi satu kelompok (gap 8–16), antarkelompok ≥ 2× (mis. 24–32)'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-27 · ukuran huruf per board (warning)
// ---------------------------------------------------------------------------

export const MAX_TEXT_SIZES = 6;

export function lc27(ctx: BoardContext): Finding[] {
  const sizes = [...new Set(texts(ctx).filter((t) => nonEmpty(t) && visibleRect(ctx, t)).map((t) => t.size))].sort((a, b) => a - b);
  if (sizes.length <= MAX_TEXT_SIZES) return [];
  return [finding('LC-27', 'warning', ctx.board, `${sizes.length} ukuran huruf: ${sizes.map(num).join(', ')}`, `≤ ${MAX_TEXT_SIZES} (idealnya ±5): satukan peran yang berdekatan`)];
}

// ---------------------------------------------------------------------------
// LC-28 · panjang baris (warning)
// ---------------------------------------------------------------------------

export const MAX_LINE_CHARS = 80;

export function lc28(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  for (const t of texts(ctx)) {
    const lines = ctx.textMeasure.get(t.id)?.lines ?? 0;
    if (lines < 2 || !nonEmpty(t)) continue;
    const avg = [...t.content.replace(/\n/g, '')].length / lines;
    if (avg <= MAX_LINE_CHARS) continue;
    out.push(finding('LC-28', 'warning', t, `rata-rata ${Math.round(avg)} karakter per baris (${lines} baris)`, `45–75 karakter: persempit lebar teks (mis. 560–680 untuk 16px)`));
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-29 · bobot tipis pada teks kecil (warning)
// ---------------------------------------------------------------------------

export function lc29(ctx: BoardContext): Finding[] {
  return texts(ctx)
    .filter((t) => nonEmpty(t) && (t.weight ?? 400) < 400 && t.size < 18)
    .map((t) => finding('LC-29', 'warning', t, `bobot ${t.weight} pada ${num(t.size)}px ${quote(t.content)}`, 'bobot ≥ 400 untuk teks < 18px (tipis hanya ≥ 28px)'));
}

// ---------------------------------------------------------------------------
// LC-30 · tanda baca (warning)
// ---------------------------------------------------------------------------

/** Rentang angka/jam dengan tanda hubung (`09.00-10.00`, `5-10`); tanggal ISO, telepon, kode tidak cocok. */
const NUM = String.raw`\d{1,3}(?:[.,:]\d{1,3})*`;
export const RANGE_HYPHEN = new RegExp(String.raw`(?<![\p{L}\d.,:/#+-])${NUM} ?- ?${NUM}(?![\p{L}\d/-])`, 'u');

export function lc30(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  for (const t of texts(ctx)) {
    const issues: string[] = [];
    // Teks mono bisa cuplikan kode: "..." di sana bukan elipsis prosa.
    if (t.content.includes('...') && !/mono/i.test(t.family ?? '')) issues.push('"..." (pakai "…")');
    const m = RANGE_HYPHEN.exec(t.content);
    if (m) issues.push(`tanda hubung di rentang ${JSON.stringify(m[0])} (pakai "–")`);
    if (issues.length) out.push(finding('LC-30', 'warning', t, `${issues.join('; ')} di ${quote(t.content)}`, 'en dash untuk rentang (09.00–10.00), karakter … untuk elipsis'));
  }
  return out;
}

// ===========================================================================
// Tipografi dan spacing (story G1 5): LC-03, LC-06, LC-07, LC-08, LC-09, LC-10 (warning). Angka dari design-tokens.
// ===========================================================================

/** Komponen kecil: isinya bukan paragraf (LC-06) dan tingginya dinilai terhadap token (LC-07). */
const SMALL_COMPONENTS = ['Button /', 'IconButton /', 'Badge /', 'Chip /', 'Tab /', 'Link /', 'Input /', 'Radio /', 'Checkbox /', 'Stepper /'];
/** Kontrol persegi: lebar juga dinilai (LC-07). */
const SQUARE_CONTROLS = ['IconButton /', 'Checkbox /', 'Radio /'];
/** Komponen interaktif yang dinilai target sentuhnya (LC-10). */
const TOUCH_COMPONENTS = ['Button /', 'IconButton /', 'Tab /', 'Input /', 'Radio /', 'Checkbox /', 'Stepper /', 'Link /'];
const namedAny = (n: { name: string }, prefixes: readonly string[]): boolean => prefixes.some((p) => named(n, p));
const ancestorFrames = (ctx: BoardContext, n: ChildNode): FrameNode[] => ancestors(ctx, n).filter((a): a is FrameNode => a.type === 'frame');
const visibleTexts = (ctx: BoardContext): TextNode[] => texts(ctx).filter((t) => nonEmpty(t) && visibleRect(ctx, t) !== undefined);

// ---------------------------------------------------------------------------
// LC-03 · teks tetap berisiko meluber (warning)
// ---------------------------------------------------------------------------

/** Ink melewati kotak teks (kiri/kanan) atau tinggi baris melewati tinggi kotak > 1 px. */
export const TEXT_BOX_OVERFLOW_MIN = 1;

export function lc03(ctx: BoardContext, skip: ReadonlySet<string> = new Set()): Finding[] {
  const out: Finding[] = [];
  const expected = `wrap:'wrap' dengan lebar fill/angka, atau beri ruang`;
  for (const t of visibleTexts(ctx)) {
    if (skip.has(t.id)) continue;
    const tm = ctx.textMeasure.get(t.id);
    if (t.wrap === 'fixed' && tm && tm.lines >= 2) {
      out.push(finding('LC-03', levelOf('LC-03'), t, clip120(`wrap fixed: ${tm.lines} baris terukur di ${quote(t.content)}`), expected));
      continue;
    }
    const b = ctx.bounds.get(t.id);
    if (!b) continue;
    const ink = ctx.ink.get(t.id);
    const ox = ink ? Math.max(b.x - ink.x, right(ink) - right(b)) : 0;
    if (ox > TEXT_BOX_OVERFLOW_MIN) {
      out.push(finding('LC-03', levelOf('LC-03'), t, clip120(`teks melewati kotaknya ${num(ox)}px (wrap ${t.wrap ?? 'auto'}) di ${quote(t.content)}`), expected));
      continue;
    }
    if (tm && tm.lines * tm.lineHeight > b.height + TEXT_BOX_OVERFLOW_MIN) {
      out.push(
        finding('LC-03', levelOf('LC-03'), t, clip120(`${tm.lines} baris × ${num(tm.lineHeight)} > tinggi kotak ${num(b.height)} di ${quote(t.content)}`), expected),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-06 · paragraf di bawah minimum (warning)
// ---------------------------------------------------------------------------

/** Paragraf = ≥ 2 baris terukur, ≥ 6 kata, bobot < 600. */
export const PARAGRAPH_MIN_WORDS = 6;
const PARAGRAPH_MAX_WEIGHT = 600;

/** Nama token skala berbobot 400 untuk ukuran minimum (16 → body, 14 → body-sm). */
const tokenFor = (size: number): string => Object.entries(TYPE_SCALE).find(([, t]) => t.size === size && t.weight === 400)?.[0] ?? `${size}px`;

export function lc06(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  for (const t of visibleTexts(ctx)) {
    const lines = ctx.textMeasure.get(t.id)?.lines ?? 0;
    if (lines < 2 || (t.weight ?? 400) >= PARAGRAPH_MAX_WEIGHT) continue;
    if (t.content.trim().split(/\s+/).length < PARAGRAPH_MIN_WORDS) continue;
    const frames = ancestorFrames(ctx, t);
    if (namedAny(t, SMALL_COMPONENTS) || frames.some((a) => namedAny(a, SMALL_COMPONENTS))) continue;
    const inCard = frames.some((a) => paintedCard(a));
    const min = inCard ? PARAGRAPH_MIN_IN_CARD : PARAGRAPH_MIN[ctx.board.screen];
    if (t.size >= min) continue;
    const where = inCard ? 'di kartu' : `di board ${ctx.board.screen}`;
    out.push(finding('LC-06', levelOf('LC-06'), t, clip120(`paragraf ${num(t.size)}px ${lines} baris ${where}: ${quote(t.content)}`), `≥ ${min}px (${tokenFor(min)}${inCard ? ' di kartu' : ''})`));
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-07 · spacing dan ukuran komponen di luar himpunan token (warning)
// ---------------------------------------------------------------------------

const CHROME_FRAMES = ['Status bar', 'Home indicator'];
const LC07_EXPECTED = `token spacing ${[...SPACING_VALUES].sort((a, b) => a - b).join('/')}; komponen juga ${COMPONENT_SIZES.join('/')}`;
const componentSizeOk = (v: number): boolean => SPACING_VALUES.has(v) || COMPONENT_SIZES.includes(v);

export function lc07(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  for (const n of ctx.nodes) {
    if (n.type !== 'frame') continue;
    if (namedAny(n, CHROME_FRAMES) || ancestorFrames(ctx, n).some((a) => namedAny(a, CHROME_FRAMES))) continue;
    const bad: string[] = [];
    if (typeof n.gap === 'number' && n.gap >= 0 && !SPACING_VALUES.has(n.gap)) bad.push(`gap ${num(n.gap)}`);
    const p = paddingOf(n);
    const pads = [p.t, p.r, p.l, ...(p.b === HOME_INDICATOR_INSET ? [] : [p.b])];
    const off = [...new Set(pads.filter((v) => !SPACING_VALUES.has(v)))];
    if (off.length) bad.push(`padding ${off.map(num).join('/')}`);
    if (namedAny(n, SMALL_COMPONENTS)) {
      if (typeof n.height === 'number' && !componentSizeOk(n.height)) bad.push(`height ${num(n.height)}`);
      if (namedAny(n, SQUARE_CONTROLS) && typeof n.width === 'number' && !componentSizeOk(n.width)) bad.push(`width ${num(n.width)}`);
    }
    if (bad.length) out.push(finding('LC-07', levelOf('LC-07'), n, clip120(bad.join(', ')), LC07_EXPECTED));
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-08 · ukuran di luar skala atau triple tidak cocok (warning)
// ---------------------------------------------------------------------------

/** Toleransi line-height terhadap token (px). */
export const LINE_HEIGHT_TOL = 0.5;
const SCALE = Object.values(TYPE_SCALE);
const SCALE_SIZES: ReadonlySet<number> = new Set(SCALE.map((t) => t.size));
const LC08_EXPECTED = `skala tipe DESIGN.md (TY): ${[...new Set(SCALE.map((t) => `${t.size}/${t.lineHeight}`))].sort((a, b) => parseFloat(a) - parseFloat(b)).join(', ')}`;

export function lc08(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  const expected = LC08_EXPECTED;
  for (const t of visibleTexts(ctx)) {
    // < 12px sudah error LC-05; tidak dilaporkan ganda.
    if (t.size < MIN_TEXT_SIZE) continue;
    const lh = t.lineHeight ?? ctx.textMeasure.get(t.id)?.lineHeight;
    const triple = `${num(t.size)}/${lh === undefined ? '?' : num(lh)}`;
    const kpi = named(t, 'KPI / Nilai');
    if (named(t, 'Display /')) {
      if (!SCALE_SIZES.has(t.size) && !DISPLAY_SIZES.includes(t.size)) out.push(finding('LC-08', levelOf('LC-08'), t, `${triple} di luar skala`, `Display: skala tipe atau ${DISPLAY_SIZES.join('/')}`));
      continue;
    }
    const tokens = [...new Set(SCALE.filter((s) => s.size === t.size).map((s) => s.lineHeight))];
    const fits = (x: number) => lh !== undefined && Math.abs(x - lh) <= LINE_HEIGHT_TOL;
    if (kpi && KPI_SIZES.includes(t.size)) {
      // KPI: size × 1,2, atau triple skala tipe berukuran sama (mis. 28/36, 32/40) juga sah.
      const want = t.size * KPI_LINE_HEIGHT_RATIO;
      if (lh !== undefined && !fits(want) && !tokens.some(fits)) {
        out.push(finding('LC-08', levelOf('LC-08'), t, `${triple} (KPI ${[num(want), ...tokens.map(num)].map((x) => `${num(t.size)}/${x}`).join(' atau ')})`, `KPI / Nilai: line-height = size × ${KPI_LINE_HEIGHT_RATIO} atau token skala`));
      }
      continue;
    }
    if (!SCALE_SIZES.has(t.size)) {
      out.push(finding('LC-08', levelOf('LC-08'), t, `${triple} di luar skala`, kpi ? `KPI / Nilai: ${KPI_SIZES.join('/')} atau skala tipe` : expected));
      continue;
    }
    if (lh !== undefined && !tokens.some(fits)) {
      out.push(finding('LC-08', levelOf('LC-08'), t, `${triple} (token ${tokens.map((x) => `${num(t.size)}/${x}`).join(' atau ')})`, expected));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-09 · lebih dari 2 keluarga font (warning)
// ---------------------------------------------------------------------------

export const MAX_FONT_FAMILIES = 2;
/** Keluarga default renderer bila `family` tidak diisi. */
const DEFAULT_FAMILY = 'Inter';

export function lc09(ctx: BoardContext): Finding[] {
  const fams = [...new Set(visibleTexts(ctx).map((t) => t.family ?? DEFAULT_FAMILY))].filter((f) => !/mono/i.test(f));
  if (fams.length <= MAX_FONT_FAMILIES) return [];
  return [finding('LC-09', levelOf('LC-09'), ctx.board, clip120(`${fams.length} keluarga font: ${fams.join(', ')}`), `≤ ${MAX_FONT_FAMILIES} keluarga (judul + isi); mono hanya untuk kode/SKU`)];
}

// ---------------------------------------------------------------------------
// LC-10 · target sentuh kecil di board mobile (warning)
// ---------------------------------------------------------------------------

/** Board mobile = `screen:'mobile'` dengan lebar terukur ≤ 430 (bukan tablet). */
export const MOBILE_MAX_WIDTH = 430;

export function lc10(ctx: BoardContext): Finding[] {
  if (ctx.board.screen !== 'mobile' || ctx.boardRect.width > MOBILE_MAX_WIDTH) return [];
  const out: Finding[] = [];
  for (const n of ctx.nodes) {
    if (!namedAny(n, TOUCH_COMPONENTS) || !visibleRect(ctx, n)) continue;
    const b = ctx.bounds.get(n.id)!;
    if (b.width >= TOUCH_MIN - TOLERANCE && b.height >= TOUCH_MIN - TOLERANCE) continue;
    out.push(finding('LC-10', levelOf('LC-10'), n, `${num(b.width)}×${num(b.height)} < ${TOUCH_MIN}×${TOUCH_MIN}`, `target sentuh ≥ ${TOUCH_MIN}×${TOUCH_MIN}: perbesar tinggi/lebar atau padding`));
  }
  return out;
}

// ===========================================================================
// Konten dan struktur seksi (story G1 6): LC-17, LC-19 (warning). Frasa dari content-rules.
// ===========================================================================

// ---------------------------------------------------------------------------
// LC-17 · struktur seksi mirip (warning)
// ---------------------------------------------------------------------------

/** Kemiripan multiset (Jaccard Σmin/Σmax) minimum antarseksi, dan jumlah node terlihat minimum per seksi. */
export const SECTION_SIMILARITY_MIN = 0.9;
export const SECTION_MIN_NODES = 6;

/**
 * Tumpukan utama board tanpa `Seksi /`: turun dari board selama wadah hanya punya satu anak flow terlihat (selain chrome)
 * berupa frame. Kandidat seksi = anak flow frame wadah itu yang bukan `layout:'row'` (baris daftar, bukan seksi), hanya
 * bila wadah kolom (board atau `layout:'column'`).
 */
function stackSections(ctx: BoardContext): FrameNode[] {
  let c: Container = ctx.board;
  for (;;) {
    const flow: ChildNode[] = c.children.filter((k) => isFlowChild(c, k) && !isChrome(k) && visibleRect(ctx, k));
    if (flow.length === 1 && flow[0]!.type === 'frame') {
      c = flow[0]!;
      continue;
    }
    const column = c.type === 'board' || c.layout === 'column';
    return column ? flow.filter((k): k is FrameNode => k.type === 'frame' && k.layout !== 'row') : [];
  }
}

/** Multiset keturunan terlihat (kedalaman penuh; anak berulang dihitung): `text <size>` untuk teks, tipe untuk lainnya. */
function sectionBag(ctx: BoardContext, sec: FrameNode): Map<string, number> {
  const bag = new Map<string, number>();
  const walk = (n: Container) => {
    for (const c of n.children) {
      if (!visibleRect(ctx, c)) continue;
      const k = c.type === 'text' ? `text ${num(c.size)}` : c.type;
      bag.set(k, (bag.get(k) ?? 0) + 1);
      if (c.type === 'frame') walk(c);
    }
  };
  walk(sec);
  return bag;
}

function jaccard(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number {
  let min = 0;
  let max = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k) ?? 0;
    const y = b.get(k) ?? 0;
    min += Math.min(x, y);
    max += Math.max(x, y);
  }
  return max > 0 ? min / max : 0;
}

export function lc17(ctx: BoardContext): Finding[] {
  const named17 = ctx.nodes.filter((n): n is FrameNode => n.type === 'frame' && named(n, 'Seksi /') && visibleRect(ctx, n) !== undefined);
  const secs = (named17.length ? named17 : stackSections(ctx))
    .map((s) => ({ s, bag: sectionBag(ctx, s) }))
    .filter((x) => [...x.bag.values()].reduce((a, b) => a + b, 0) >= SECTION_MIN_NODES);
  const nested = (a: FrameNode, b: FrameNode) => ancestors(ctx, b).includes(a) || ancestors(ctx, a).includes(b);
  const out: Finding[] = [];
  for (let j = 1; j < secs.length; j++) {
    const B = secs[j]!;
    let best: { s: FrameNode; sim: number } | undefined;
    for (let i = 0; i < j; i++) {
      const A = secs[i]!;
      if (nested(A.s, B.s)) continue;
      const sim = jaccard(A.bag, B.bag);
      if (sim >= SECTION_SIMILARITY_MIN && sim > (best?.sim ?? -1)) best = { s: A.s, sim };
    }
    if (!best) continue;
    out.push(
      finding(
        'LC-17',
        levelOf('LC-17'),
        B.s,
        clip120(`mirip ${best.s.name} (${best.s.id}): ${Math.round(best.sim * 100)}%`),
        'variasikan komposisi antar-seksi (tata letak, jenis isi), bukan judul + kartu identik berulang',
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-19 · frasa terlarang (warning)
// ---------------------------------------------------------------------------

function exemptFromPhrases(ctx: BoardContext, t: TextNode): boolean {
  const chain: { name: string }[] = [t, ...ancestorFrames(ctx, t)];
  if (chain.some((n) => named(n, FORBIDDEN_EXEMPT.inside))) return true;
  const label = chain.some((n) => n.name === FORBIDDEN_EXEMPT.layer);
  return label && !chain.some((n) => namedAny(n, FORBIDDEN_EXEMPT.labelNotInside));
}

export function lc19(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  for (const t of visibleTexts(ctx)) {
    if (exemptFromPhrases(ctx, t)) continue;
    const hits = forbiddenPhrasesIn(t.content);
    if (!hits.length) continue;
    const list = hits.map((h) => `"${h.phrase}" (${h.lang})`).join(', ');
    out.push(finding('LC-19', levelOf('LC-19'), t, clip120(`frasa terlarang ${list} di ${quote(t.content)}`), 'ganti dengan aksi/klaim spesifik dari konten'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Batas warning per board
// ---------------------------------------------------------------------------

export const MAX_WARNINGS_PER_RULE = 3;

/**
 * Maks 3 warning (dan maks 3 info) per aturan; sisanya dicatat di detail temuan ketiga sebagai `(+n serupa)`. Detail ≤ 120
 * karakter. Error tidak dibatasi.
 */
export function capWarnings(findings: readonly Finding[]): Finding[] {
  const key = (f: Finding) => `${f.level} ${f.rule}`;
  const count = new Map<string, number>();
  for (const f of findings) if (f.level !== 'error') count.set(key(f), (count.get(key(f)) ?? 0) + 1);
  const seen = new Map<string, number>();
  const out: Finding[] = [];
  for (const f of findings) {
    if (f.level === 'error') {
      out.push(f);
      continue;
    }
    const k = (seen.get(key(f)) ?? 0) + 1;
    seen.set(key(f), k);
    if (k > MAX_WARNINGS_PER_RULE) continue;
    const extra = k === MAX_WARNINGS_PER_RULE ? count.get(key(f))! - MAX_WARNINGS_PER_RULE : 0;
    const suffix = extra > 0 ? ` (+${extra} serupa)` : '';
    const room = 120 - [...suffix].length;
    const d = [...f.detail];
    out.push({ ...f, detail: (d.length > room ? `${d.slice(0, room - 1).join('')}…` : f.detail) + suffix });
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-31 · konten terpotong rata di tepi bawah
// ---------------------------------------------------------------------------

/** Luapan minimal di bawah tepi clip (px) dan toleransi "rata" tepi clip ↔ tepi bawah seksi/board (px). */
export const CUT_OVER_MIN = 1;
export const FLUSH_TOL = 2;
/** Seksi = leluhur selebar ≥ 90% board. */
const SECTION_MIN_W_RATIO = 0.9;
/** Daftar rata: ruang atas minimal (px) yang menandakan ruang bawah memang diharapkan. */
export const LIST_TOP_MIN = 8;

/**
 * Daftar rata: `k` frame ber-cat `layout:'column'` (bukan di `Crop /`) yang dua anak flow terakhirnya frame ber-cat berisi
 * teks, baris terakhir berakhir ≤ 2 px dari tepi bawah `k` (tanpa menggantung > 2 px), sedangkan anak flow pertama mulai ≥ 8 px dari tepi atas.
 */
function flushListRow(ctx: BoardContext, k: FrameNode, kr: Rect): { row: FrameNode; below: number; above: number } | undefined {
  if (k.layout !== 'column' || ancestors(ctx, k).some((a) => a.type === 'frame' && named(a, 'Crop /'))) return undefined;
  const flow = k.children.filter((c) => isFlowChild(k, c) && (ctx.bounds.get(c.id)?.height ?? 0) > 0);
  if (flow.length < 2) return undefined;
  const isRow = (c: ChildNode): c is FrameNode => c.type === 'frame' && paintedCard(c) && textsIn(c).length > 0;
  const last = flow[flow.length - 1]!;
  if (!isRow(last) || !isRow(flow[flow.length - 2]!)) return undefined;
  const below = bottom(kr) - bottom(ctx.bounds.get(last.id)!);
  const above = ctx.bounds.get(flow[0]!.id)!.y - kr.y;
  return below <= FLUSH_TOL && below >= -FLUSH_TOL && above >= LIST_TOP_MIN ? { row: last, below, above } : undefined;
}

/**
 * Frame ber-cat berisi teks (hanya node terluar) yang terpotong atau rata di tepi bawah:
 * (a) melewati tepi bawah clip terdekat (frame `clip:true`, termasuk `Crop /`, atau board) > 1 px, dengan tepi bawah clip
 * rata (≤ 2 px) dengan tepi bawah seksi (leluhur selebar ≥ 90% board) atau board;
 * (b) sama, tetapi tepi bawah node rata dengan tepi clip (−2..+1 px), node lebar < 90% board, tidak mulai dari tepi atas
 * clip atau tepi atas isi induknya, dan tidak menempel tepi kiri/kanan board (≤ 2 px) (bukan sidebar, footer, tab bar, atau
 * panel penuh);
 * (c) daftar rata (`flushListRow`): temuan pada baris terakhir.
 * Dikecualikan: leluhur `Scroll /`, rotasi, `Overlay /`, dan node yang sudah dilaporkan LC-02a (`skip`).
 */
export function lc31(ctx: BoardContext, skip: ReadonlySet<string> = new Set()): Finding[] {
  const out: Finding[] = [];
  const done = new Set<string>();
  const minW = SECTION_MIN_W_RATIO * ctx.boardRect.width;
  const walk = (children: readonly ChildNode[]) => {
    for (const n of children) {
      if (skip.has(n.id) || done.has(n.id) || rotated(n) || named(n, 'Overlay /') || named(n, 'Scroll /')) continue;
      if (n.type !== 'frame') continue;
      const r = ctx.bounds.get(n.id);
      const anc = ancestors(ctx, n);
      if (r && area(r) > 0 && paintedCard(n) && textsIn(n).length > 0 && !anc.some((a) => a.type === 'frame' && rotated(a))) {
        const clipIdx = anc.findIndex((a) => a.type === 'board' || a.clip === true);
        const clip = anc[clipIdx]!;
        const cr = clip.type === 'board' ? ctx.boardRect : ctx.bounds.get(clip.id);
        const over = cr ? bottom(r) - bottom(cr) : 0;
        const cut = over > CUT_OVER_MIN;
        // Panel penuh (bukan kartu): mulai di tepi atas clip, menempel tepi kiri/kanan board, atau mulai di tepi atas isi induknya.
        const par = anc[0]!;
        const parR = par.type === 'board' ? ctx.boardRect : ctx.bounds.get(par.id);
        const panel =
          cr === undefined ||
          r.y <= cr.y + FLUSH_TOL ||
          r.x <= FLUSH_TOL ||
          right(r) >= ctx.boardRect.width - FLUSH_TOL ||
          (parR !== undefined && r.y <= parR.y + paddingOf(par).t + FLUSH_TOL);
        const flush = !cut && over >= -FLUSH_TOL && r.width < minW - TOLERANCE && !panel;
        if (cr && (cut || flush) && r.y < bottom(cr) - CUT_OVER_MIN) {
          // Seksi rata: clip itu sendiri atau leluhurnya selebar ≥ 90% board yang tepi bawahnya rata dengan tepi clip; atau board.
          let section: Container | undefined = Math.abs(ctx.boardRect.height - bottom(cr)) <= FLUSH_TOL ? ctx.board : undefined;
          for (const a of anc.slice(clipIdx)) {
            if (section) break;
            if (a.type === 'board') continue;
            const ar = ctx.bounds.get(a.id);
            if (ar && ar.width >= minW - TOLERANCE && Math.abs(bottom(ar) - bottom(cr)) <= FLUSH_TOL) section = a;
          }
          if (section) {
            out.push(
              cut
                ? finding('LC-31', levelOf('LC-31'), n, `terpotong rata ${num(over)}px di tepi bawah ${section.name}`, 'tampilkan utuh (padding bawah ≥ 64) atau kurangi isi')
                : finding(
                    'LC-31',
                    levelOf('LC-31'),
                    n,
                    clip120(`rata di tepi bawah ${section.name} tanpa ruang bawah (sisa ${num(-over)}px)`),
                    'beri ruang bawah (padding atau margin ≥ 24) atau tampilkan utuh',
                  ),
            );
            continue;
          }
        }
        const list = flushListRow(ctx, n, r);
        if (list && !skip.has(list.row.id)) {
          done.add(list.row.id);
          out.push(
            finding(
              'LC-31',
              levelOf('LC-31'),
              list.row,
              clip120(`baris terakhir rata di tepi bawah ${n.name} (bawah ${num(list.below)}px, atas ${num(list.above)}px)`),
              'padding bawah setara padding atas, atau tampilkan baris utuh',
            ),
          );
        }
      }
      walk(n.children);
    }
  };
  // Leluhur Scroll / dilewati seluruhnya (dok lama dengan posisi gulir).
  walk(ctx.board.children);
  return out;
}

// ---------------------------------------------------------------------------
// LC-32 · referensi instance yang basi (AD-12)
// ---------------------------------------------------------------------------

const LC32_EXPECTED: Record<string, string> = {
  override: 'reset override itu, atau sunting master supaya node-nya ada lagi',
  prop: 'pakai prop yang ada di master dengan tipe yang cocok, atau hapus nilainya',
  slot: 'isi slot yang ada di master (frame), atau hapus isi slot itu',
  bind: 'perbaiki bind/slot di definisi master supaya menunjuk node master yang ada',
};

/**
 * Laporan ekspansi `instanceIssues` (dari `resolveDocument`) untuk board ini: override yatim, prop/slot tak dikenal
 * atau salah tipe, serta bind/slot master ke node yang hilang. Warning tanpa gerbang; satu temuan per laporan.
 */
export function lc32(doc: ResolvedDocument, boardId: string): Finding[] {
  return instanceIssues(doc)
    .filter((i) => i.boardId === boardId)
    .map((i) => finding('LC-32', 'warning', { id: i.instanceId, name: i.instanceName }, `${i.kind} ${i.key}: ${i.detail}`, LC32_EXPECTED[i.kind]!));
}

// ===========================================================================
// Aturan struktural G1 (story 4): LC-13, LC-14, LC-15, LC-16, LC-21, LC-22.
// ===========================================================================

// ---------------------------------------------------------------------------
// LC-13 · nama layer default (info)
// ---------------------------------------------------------------------------

/** Nama default editor (Lampiran A) + padanan tipe node AD-15, opsional diikuti angka. */
export const DEFAULT_LAYER_NAME = /^(rectangle|ellipse|path|group|board|image|svg|frame|rect|text|icon|vector)\s*\d*$/i;

export function lc13(ctx: BoardContext): Finding[] {
  return [ctx.board, ...ctx.nodes]
    .filter((n) => DEFAULT_LAYER_NAME.test(n.name.trim()))
    .map((n) => finding('LC-13', levelOf('LC-13'), n, clip120(`nama default ${quote(n.name)} (${n.type})`), 'nama bermakna sesuai peran (mis. "Kartu / Harga", "Image / Kamar", "Judul")'));
}

// ---------------------------------------------------------------------------
// LC-14 · absolut di dalam flex tanpa Overlay / (warning)
// ---------------------------------------------------------------------------

/** Nama yang sah absolut: tumpukan sengaja dan bidang efek (`Overlay /`, `Crop /`) dan chrome perangkat. */
const ABSOLUTE_OK = ['Overlay /', 'Crop /', 'Status bar', 'Home indicator'];

export function lc14(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  for (const n of ctx.nodes) {
    if (n.position !== 'absolute' || ABSOLUTE_OK.some((p) => named(n, p))) continue;
    const parent = ctx.parentOf.get(n.id)!;
    const layout = parent.type === 'board' ? 'column' : (parent.layout ?? 'none');
    if (layout === 'none') continue;
    if (ancestors(ctx, n).some((a) => a.type === 'frame' && (named(a, 'Overlay /') || named(a, 'Crop /')))) continue;
    out.push(
      finding(
        'LC-14',
        levelOf('LC-14'),
        n,
        clip120(`absolut di dalam ${parent.type === 'board' ? 'board' : `layout ${layout}`} ${parent.name} (${parent.id})`),
        'jadikan anak flow (gap/padding); tumpukan sengaja: nama "Overlay / …", bidang efek terpotong: "Crop / …"',
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-15 · > 1 pustaka ikon UI (warning)
// ---------------------------------------------------------------------------

/** Pustaka logo merek, bukan ikon UI. */
const BRAND_ICON_LIBS = new Set(['simple-icons']);

export function lc15(ctx: BoardContext): Finding[] {
  const libs = new Map<string, number>();
  for (const n of ctx.nodes) if (n.type === 'icon' && !BRAND_ICON_LIBS.has(n.lib)) libs.set(n.lib, (libs.get(n.lib) ?? 0) + 1);
  if (libs.size <= 1) return [];
  const list = [...libs].map(([lib, k]) => `${lib} ${k}`).join(', ');
  return [finding('LC-15', levelOf('LC-15'), ctx.board, clip120(`${libs.size} pustaka ikon UI: ${list}`), 'satu pustaka ikon UI per board (simple-icons untuk logo tidak dihitung)')];
}

// ---------------------------------------------------------------------------
// LC-16 · ikon digambar manual (error, bukan gerbang)
// ---------------------------------------------------------------------------

/** Ukuran maksimal `path` yang dianggap ikon (px). */
export const DRAWN_ICON_MAX = 32;

export function lc16(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  for (const n of ctx.nodes) {
    if (n.type !== 'path' || named(n, 'Chart /') || named(n, 'Shape /') || (n.opacity ?? 1) <= 0) continue;
    const b = ctx.bounds.get(n.id);
    // Punya bounds tetapi tidak terlihat sama sekali (di luar clip/board): bukan ikon yang tampil.
    if (b && !visibleRect(ctx, n)) continue;
    const w = b?.width ?? (typeof n.width === 'number' ? n.width : n.viewBox[2]);
    const h = b?.height ?? (typeof n.height === 'number' ? n.height : n.viewBox[3]);
    if (w > DRAWN_ICON_MAX + TOLERANCE || h > DRAWN_ICON_MAX + TOLERANCE) continue;
    out.push(
      finding(
        'LC-16',
        levelOf('LC-16'),
        n,
        clip120(`path ${num(w)}×${num(h)} ${quote(n.name)} digambar manual`),
        'pakai node icon (icon_search); bentuk sengaja: nama "Shape / …", bagian grafik: "Chart / …"',
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-21 · pemeriksaan struktural murah (warning): radius, spacer kosong, padding ganda, teks di baris tabel, bidang efek
// ---------------------------------------------------------------------------

export const MAX_RADII = 3;
/** Bidang efek: blur dekoratif minimal (px) dan luas gradien multi-hue minimal (rasio layar). */
export const EFFECT_BLUR_MIN = 24;
export const EFFECT_AREA_RATIO = 0.2;
/** Tinggi layar untuk luas bidang efek: board panjang dihitung per layar. */
const SCREEN_H = { mobile: 844, other: 900 };
/** Rentang toleransi kesejajaran kolom tabel dan lebar isi induk (px). */
const ALIGN_TOL = 1;

/** Ber-cat: fill tak transparan, stroke, bayangan luar, atau backdrop blur. */
const paintedAny = (n: ChildNode): boolean => paintedCard(n) || ((n as { backdropBlur?: number }).backdropBlur ?? 0) > 0;

/** RGB [0,1] → [hue°, saturasi HSL]. */
function hueSat(r: number, g: number, b: number): [number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return [0, 0];
  const sat = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, sat];
}

/** Gradien multi-hue: ≥ 2 stop kromatik (saturasi ≥ 0,2, alpha ≥ 0,15) dengan beda hue ≥ 30°. */
function multiHue(f: ResolvedFill): boolean {
  if (f.type !== 'linear' && f.type !== 'radial' && f.type !== 'conic') return false;
  const hues: number[] = [];
  for (const s of f.stops) {
    const [r, g, b, a] = parseHex(s.color);
    const [h, sat] = hueSat(r, g, b);
    if (sat >= 0.2 && a >= 0.15) hues.push(h);
  }
  for (let i = 0; i < hues.length; i++)
    for (let j = i + 1; j < hues.length; j++) {
      const d = Math.abs(hues[i]! - hues[j]!);
      if (Math.min(d, 360 - d) >= 30) return true;
    }
  return false;
}

function radiusIssue(ctx: BoardContext): Finding[] {
  const values = new Set<number>();
  for (const n of ctx.nodes) {
    if ((n.type !== 'frame' && n.type !== 'rect') || (n.opacity ?? 1) <= 0) continue;
    if (!(paintedAny(n) || (n.type === 'frame' && n.clip === true))) continue;
    const v = visibleRect(ctx, n);
    const r = ctx.bounds.get(n.id);
    if (!v || !r || area(v) <= 0) continue;
    const full = Math.min(r.width, r.height) / 2 - TOLERANCE;
    const raw = n.radius ?? 0;
    for (const x of typeof raw === 'number' ? [raw] : raw) if (x > 0 && x < full) values.add(x);
  }
  if (values.size <= MAX_RADII) return [];
  const list = [...values].sort((a, b) => a - b).map(num).join(', ');
  return [finding('LC-21', levelOf('LC-21'), ctx.board, clip120(`radius: ${values.size} nilai (${list})`), `≤ ${MAX_RADII} nilai radius per board (mis. kecil/sedang/besar) + pill/lingkaran`)];
}

function spacerIssue(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  for (const n of ctx.nodes) {
    if (n.type !== 'frame' && n.type !== 'rect') continue;
    if ((n.type === 'frame' && n.children.length > 0) || paintedAny(n) || named(n, 'Image /')) continue;
    const parent = ctx.parentOf.get(n.id)!;
    if (!isFlowChild(parent, n)) continue;
    const r = ctx.bounds.get(n.id);
    // Node seukuran titik (0×0) tidak memakan ruang: bukan spacer.
    if (r && r.width <= TOLERANCE && r.height <= TOLERANCE) continue;
    const size = r ? ` ${num(r.width)}×${num(r.height)}` : '';
    out.push(finding('LC-21', levelOf('LC-21'), n, clip120(`spacer kosong: ${n.type}${size} tanpa isi dan cat di ${parent.name} (${parent.id})`), 'hapus; jarak lewat gap/padding induk'));
  }
  return out;
}

function doublePaddingIssue(ctx: BoardContext): Finding[] {
  if (ctx.board.screen !== 'mobile') return [];
  const out: Finding[] = [];
  for (const n of ctx.nodes) {
    if (n.type !== 'frame' || !n.children.length || paintedAny(n) || inComponent(ctx, n)) continue;
    const parent = ctx.parentOf.get(n.id)!;
    if (!isFlowChild(parent, n)) continue;
    const pad = paddingOf(n);
    if (pad.l <= 0 && pad.r <= 0) continue;
    const r = ctx.bounds.get(n.id);
    const pr = parent.type === 'board' ? ctx.boardRect : ctx.bounds.get(parent.id);
    if (!r || !pr) continue;
    const pp = paddingOf(parent);
    if (Math.abs(r.width - (pr.width - pp.l - pp.r)) > ALIGN_TOL) continue;
    let hit: { side: 'kiri' | 'kanan'; own: number; outer: number; by: Container } | undefined;
    for (const a of ancestors(ctx, n)) {
      const ap = paddingOf(a);
      if (pad.l > 0 && ap.l > 0) hit = { side: 'kiri', own: pad.l, outer: ap.l, by: a };
      else if (pad.r > 0 && ap.r > 0) hit = { side: 'kanan', own: pad.r, outer: ap.r, by: a };
      if (hit || a.type === 'board' || paintedAny(a)) break;
    }
    if (!hit) continue;
    out.push(
      finding(
        'LC-21',
        levelOf('LC-21'),
        n,
        clip120(`padding ganda: padding ${hit.side} ${num(hit.own)} di dalam padding ${hit.side} ${num(hit.outer)} ${hit.by.name} (${hit.by.id})`),
        'satu lapis padding horizontal per layar (wadah luar); anak selebar isi tanpa padding sisi',
      ),
    );
  }
  return out;
}

function tableTextIssue(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  const containers: Container[] = [ctx.board, ...ctx.nodes.filter((n): n is FrameNode => n.type === 'frame')];
  for (const c of containers) {
    const rows = c.children.flatMap((k) => {
      if (k.type !== 'frame' || k.layout !== 'row') return [];
      const kids = k.children.filter((x) => isFlowChild(k, x));
      const xs = kids.map((x) => ctx.bounds.get(x.id)?.x);
      if (kids.length < 3 || xs.some((x) => x === undefined)) return [];
      return [{ row: k, kids, xs: xs as number[] }];
    });
    const grouped = new Set<string>();
    for (const ref of rows) {
      if (grouped.has(ref.row.id)) continue;
      const group = rows.filter((o) => !grouped.has(o.row.id) && o.kids.length === ref.kids.length && o.xs.every((x, i) => Math.abs(x - ref.xs[i]!) <= ALIGN_TOL));
      if (group.length < 3) continue;
      for (const g of group) grouped.add(g.row.id);
      for (const g of group) {
        const withText = g.kids.filter((x) => textsIn(x).length > 0).length;
        const direct = g.kids.filter((x) => x.type === 'text' && nonEmpty(x)).length;
        // Daftar (nomor/meta + tumpukan teks + status) punya ≤ 1 teks lepas; baris tabel punya ≥ 2 sel teks lepas.
        if (withText < 3 || direct < 2) continue;
        out.push(
          finding(
            'LC-21',
            levelOf('LC-21'),
            g.row,
            clip120(`teks di baris tabel: ${direct} teks langsung di baris (${group.length} baris sejajar di ${c.name})`),
            'tiap sel = frame lebar tetap/fill (sel berisi teks), kolom sejajar antarbaris',
          ),
        );
      }
    }
  }
  return out;
}

function effectFieldIssue(ctx: BoardContext): Finding[] {
  const screenH = Math.min(ctx.boardRect.height, ctx.board.screen === 'mobile' ? SCREEN_H.mobile : SCREEN_H.other);
  const minArea = EFFECT_AREA_RATIO * ctx.boardRect.width * screenH;
  const effects: { n: ChildNode; v: Rect }[] = [];
  for (const n of ctx.nodes) {
    const fills = fillsOf(n);
    if (!fills.length || (n.opacity ?? 1) <= 0) continue;
    const v = visibleRect(ctx, n);
    if (!v || area(v) <= 0) continue;
    const blur = (n as { blur?: number }).blur ?? 0;
    const isEffect =
      fills.some((f) => f.type === 'mesh') ||
      (blur >= EFFECT_BLUR_MIN && fills.some((f) => f.type !== 'image')) ||
      (fills.some(multiHue) && area(v) >= minArea);
    if (isEffect) effects.push({ n, v });
  }
  if (effects.length < 2) return [];
  // Union-find: node efek bersarang di node efek lain atau beririsan dengannya = satu bidang.
  const root = effects.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i]!)));
  // Juga satu bidang: node efek dengan wadah potong terdekat yang sama (leluhur `Crop /` atau frame `clip:true`, bukan board).
  const holder = effects.map((e) => ancestors(ctx, e.n).find((a) => a.type === 'frame' && (named(a, 'Crop /') || a.clip === true))?.id);
  for (let i = 0; i < effects.length; i++) {
    const inside = new Set(descendants(effects[i]!.n).map((d) => d.id));
    for (let j = i + 1; j < effects.length; j++) {
      const same = holder[i] !== undefined && holder[i] === holder[j];
      if (same || inside.has(effects[j]!.n.id) || intersect(effects[i]!.v, effects[j]!.v)) root[find(j)] = find(i);
    }
  }
  // Label bidang = node efek terluas di bidang itu (urutan dokumen bidang dipertahankan).
  const fields = new Map<number, { n: ChildNode; v: Rect }>();
  effects.forEach((e, i) => {
    const cur = fields.get(find(i));
    if (!cur || area(e.v) > area(cur.v)) fields.set(find(i), e);
  });
  if (fields.size < 2) return [];
  const names = [...fields.values()].map((e) => `"${e.n.name}"`).join(', ');
  return [
    finding(
      'LC-21',
      levelOf('LC-21'),
      ctx.board,
      clip120(`bidang efek: ${fields.size} bidang terpisah (${names})`),
      'maks 1 bidang efek ekspresif per board (mesh, blur dekoratif, gradien multi-warna luas); sisanya solid',
    ),
  ];
}

export function lc21(ctx: BoardContext): Finding[] {
  return [...radiusIssue(ctx), ...spacerIssue(ctx), ...doublePaddingIssue(ctx), ...tableTextIssue(ctx), ...effectFieldIssue(ctx)];
}

// ---------------------------------------------------------------------------
// LC-22 · jumlah node berkonvensi (info)
// ---------------------------------------------------------------------------

export const CONVENTIONS = ['Crop', 'Overlay', 'Scroll', 'Ekstra'] as const;

export function lc22(ctx: BoardContext): Finding[] {
  const counts = CONVENTIONS.map((c) => ctx.nodes.filter((n) => named(n, `${c} /`)).length);
  if (counts.every((k) => k === 0)) return [];
  return [
    finding(
      'LC-22',
      levelOf('LC-22'),
      ctx.board,
      CONVENTIONS.map((c, i) => `${c} ${counts[i]}`).join(', '),
      'sebut di artefak konvensi: (batas Crop ≤ 2, Ekstra ≤ 1 per board)',
    ),
  ];
}
