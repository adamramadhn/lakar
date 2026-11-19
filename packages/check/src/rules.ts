// Aturan G0 (AD-8): satu fungsi per aturan. Masukan: board ter-resolve + hasil ukur render. Murni.
import { G0_RULES, type Finding, type ResolvedDocument, type ResolvedFill, type ResolvedTextNode as TextNode } from '@lakar/schema';
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

export const CONTRAST_MIN = 4.5;
export const CONTRAST_MIN_LARGE = 3;
/** Teks besar: ≥ 24px, atau ≥ 19px dengan bobot ≥ 700. */
export const isLargeText = (t: { size: number; weight?: number | undefined }): boolean => t.size >= 24 || (t.size >= 19 && (t.weight ?? 400) >= 700);
const MAX_CANDIDATES = 64;
type Effects = { opacity?: number | undefined; blend?: string | undefined; backdropBlur?: number | undefined };
const effectsOf = (n: unknown): Effects => n as Effects;

export function lc04(ctx: BoardContext): Finding[] {
  const out: Finding[] = [];
  const painters = ctx.nodes.filter((n) => (n.type === 'frame' || n.type === 'rect' || n.type === 'ellipse' || n.type === 'path') && fillsOf(n).length > 0);
  for (const t of texts(ctx)) {
    if (!nonEmpty(t) || (t.opacity ?? 1) <= 0) continue;
    const ink = inkRect(ctx, t);
    if (!ink || area(ink) <= 0 || !visibleRect(ctx, t)) continue;
    const order = ctx.order.get(t.id)!;
    const anc = ancestors(ctx, t);
    const ancIds = new Set(anc.map((a) => a.id));
    let warn = false;
    let alphaText = 1;
    for (const n of [t, ...anc.filter((a): a is FrameNode => a.type === 'frame')]) {
      const e = effectsOf(n);
      if (e.opacity !== undefined && e.opacity < 1) {
        alphaText *= e.opacity;
        warn = true;
      }
      if (e.blend && e.blend !== 'normal') warn = true;
    }
    // Penutup di atas teks (urutan sesudahnya) → tak tentu.
    let indeterminate = false;
    for (const p of painters) {
      if (ctx.order.get(p.id)! <= order) continue;
      const v = visibleRect(ctx, p);
      if (v && intersect(v, ink)) {
        indeterminate = true;
        break;
      }
    }
    if (indeterminate) continue;
    // Lapisan di bawah teks: leluhur + node sebelumnya yang memuat penuh ink (lainnya yang beririsan = sebagian).
    type Layer = { node: ChildNode | Container; partial: boolean; alpha: number };
    const layers: Layer[] = [];
    for (const p of painters) {
      if (ctx.order.get(p.id)! >= order) continue;
      const isAnc = ancIds.has(p.id);
      const v = visibleRect(ctx, p);
      if (!v || !intersect(v, ink)) continue;
      const shape = p.type === 'ellipse' || p.type === 'path';
      const partial = shape || (!isAnc && !contains(v, ink));
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
    let skip = false;
    scan: for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i]!;
      if (l.partial) {
        skip = true;
        break;
      }
      const fills = fillsOf(l.node);
      for (let j = fills.length - 1; j >= 0; j--) {
        const f = fills[j]!;
        if (f.type === 'image' || f.type === 'noise' || f.type === 'mesh') {
          skip = true;
          break scan;
        }
        const stops = f.type === 'solid' ? [f.color] : f.stops.map((s) => s.color);
        if (f.type !== 'solid') warn = true;
        if (l.alpha >= 1 && stops.every((c) => parseHex(c)[3] >= 1)) {
          base = stops.map((c) => parseHex(c).slice(0, 3) as RGB);
          break scan;
        }
        above.push({ fill: f, alpha: l.alpha });
      }
    }
    if (skip) continue;
    if (!base) {
      const bf = fillsOf(ctx.board);
      if (bf.some((f) => f.type === 'image' || f.type === 'noise' || f.type === 'mesh')) continue;
      base = [[1, 1, 1]];
      for (const f of bf) {
        const stops = f.type === 'solid' ? [f.color] : (f as { stops: { color: string }[] }).stops.map((s) => s.color);
        if (f.type !== 'solid') warn = true;
        base = base.flatMap((c) => stops.map((s) => over(parseHex(s), c)));
      }
    }
    let cands = base;
    for (let k = above.length - 1; k >= 0; k--) {
      const { fill: f, alpha } = above[k]!;
      const stops = f.type === 'solid' ? [f.color] : (f as { stops: { color: string }[] }).stops.map((s) => s.color);
      cands = cands.flatMap((c) => stops.map((s) => over(parseHex(s), c, alpha)));
      if (cands.length > MAX_CANDIDATES) {
        skip = true;
        break;
      }
    }
    if (skip) continue;
    const fg = parseHex(t.color ?? '#000000');
    let worst: { ratio: number; text: RGB; bg: RGB } | undefined;
    for (const bg of cands) {
      const text = over(fg, bg, alphaText);
      const ratio = contrastRatio(text, bg);
      if (!worst || ratio < worst.ratio) worst = { ratio, text, bg };
    }
    if (!worst) continue;
    const min = isLargeText(t) ? CONTRAST_MIN_LARGE : CONTRAST_MIN;
    if (worst.ratio >= min) continue;
    const ratio = Math.floor(worst.ratio * 100) / 100;
    out.push(
      finding(
        'LC-04',
        warn ? 'warning' : levelOf('LC-04'),
        t,
        clip120(`kontras ${ratio}:1 (${toHex(worst.text)} di atas ${toHex(worst.bg)}${warn ? ', gradien/opacity/blend: perkiraan' : ''}) ${quote(t.content)}`),
        `≥ ${min}:1 setelah komposit: teks lebih gelap/terang atau latar lebih kontras; acc2/kuning bukan teks kecil`,
      ),
    );
  }
  return out;
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

// ---------------------------------------------------------------------------
// Batas warning per board
// ---------------------------------------------------------------------------

export const MAX_WARNINGS_PER_RULE = 3;

/** Maks 3 warning per aturan; sisanya dicatat di detail temuan ketiga sebagai `(+n serupa)`. Detail ≤ 120 karakter. */
export function capWarnings(findings: readonly Finding[]): Finding[] {
  const count = new Map<string, number>();
  for (const f of findings) if (f.level === 'warning') count.set(f.rule, (count.get(f.rule) ?? 0) + 1);
  const seen = new Map<string, number>();
  const out: Finding[] = [];
  for (const f of findings) {
    if (f.level !== 'warning') {
      out.push(f);
      continue;
    }
    const k = (seen.get(f.rule) ?? 0) + 1;
    seen.set(f.rule, k);
    if (k > MAX_WARNINGS_PER_RULE) continue;
    const extra = k === MAX_WARNINGS_PER_RULE ? count.get(f.rule)! - MAX_WARNINGS_PER_RULE : 0;
    const suffix = extra > 0 ? ` (+${extra} serupa)` : '';
    const room = 120 - [...suffix].length;
    const d = [...f.detail];
    out.push({ ...f, detail: (d.length > room ? `${d.slice(0, room - 1).join('')}…` : f.detail) + suffix });
  }
  return out;
}

// ---------------------------------------------------------------------------
// LC-31 · mockup terpotong rata di tepi bawah seksi
// ---------------------------------------------------------------------------

/** Luapan minimal di bawah tepi clip (px) dan toleransi "rata" tepi clip ↔ tepi bawah seksi/board (px). */
export const CUT_OVER_MIN = 1;
export const FLUSH_TOL = 2;
/** Seksi = leluhur selebar ≥ 90% board. */
const SECTION_MIN_W_RATIO = 0.9;

/** Ber-cat: fill tak transparan, stroke, atau bayangan luar. */
const paintedCard = (n: ChildNode): boolean =>
  fillsOf(n).some((f) => f.type !== 'solid' || parseHex((f as { color: string }).color)[3] > 0) || (n as { stroke?: unknown }).stroke !== undefined || dropShadow(n);

/**
 * Frame ber-cat berisi teks yang melewati tepi bawah clip terdekat (frame `clip:true`, termasuk `Crop /`, atau board) > 1 px,
 * dengan tepi bawah clip rata (≤ 2 px) dengan tepi bawah seksi (leluhur selebar ≥ 90% board) atau board. Hanya node terluar.
 * Dikecualikan: leluhur `Scroll /`, rotasi, `Overlay /`, dan node yang sudah dilaporkan LC-02a (`skip`).
 */
export function lc31(ctx: BoardContext, skip: ReadonlySet<string> = new Set()): Finding[] {
  const out: Finding[] = [];
  const minW = SECTION_MIN_W_RATIO * ctx.boardRect.width;
  const walk = (children: readonly ChildNode[]) => {
    for (const n of children) {
      if (skip.has(n.id) || rotated(n) || named(n, 'Overlay /') || named(n, 'Scroll /')) continue;
      if (n.type !== 'frame') continue;
      const r = ctx.bounds.get(n.id);
      if (r && area(r) > 0 && paintedCard(n) && textsIn(n).length > 0) {
        const anc = ancestors(ctx, n);
        const clipIdx = anc.findIndex((a) => a.type === 'board' || a.clip === true);
        const clip = anc[clipIdx]!;
        const cr = clip.type === 'board' ? ctx.boardRect : ctx.bounds.get(clip.id);
        const over = cr ? bottom(r) - bottom(cr) : 0;
        if (cr && over > CUT_OVER_MIN && r.y < bottom(cr) - CUT_OVER_MIN && !anc.some((a) => a.type === 'frame' && rotated(a))) {
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
              finding(
                'LC-31',
                levelOf('LC-31'),
                n,
                `terpotong rata ${num(over)}px di tepi bawah ${section.name}`,
                'tampilkan utuh (padding bawah ≥ 64) atau kurangi isi',
              ),
            );
            continue;
          }
        }
      }
      walk(n.children);
    }
  };
  // Leluhur Scroll / dilewati seluruhnya (dok lama dengan posisi gulir).
  walk(ctx.board.children);
  return out;
}
