// Paste SVG di viewer (epic paste-vektor story 3, desain G0vf1/nE6dL, Toast r69qO, Paste Report w2am0). Murni, tanpa
// DOM dan tanpa IO: deteksi SVG di clipboard, target parent dari seleksi, dan teks toast/report dari laporan importer
// daemon (AD-15; importer tidak ada di viewer).
import type { LakarDocument } from '@lakar/schema';

/** Laporan importer (bentuk respons route paste daemon). */
export type PasteDropKind = 'element' | 'attribute' | 'value';
export type PasteReport = { kind: 'svg'; paths: number; kept: string[]; dropped: { kind: PasteDropKind; name: string; count: number }[] };

/**
 * Teks yang dianggap SVG: elemen pertama `<svg` sesudah BOM, spasi, komentar, prolog `<?xml …?>`, dan DOCTYPE.
 * Dokumen XML lain (mis. XHTML berisi SVG inline) bukan SVG.
 */
export function svgFromText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  let s = text.replace(/^\uFEFF/, '').trimStart();
  for (;;) {
    const close = s.startsWith('<!--') ? '-->' : s.startsWith('<?') ? '?>' : /^<!doctype/i.test(s) ? '>' : undefined;
    if (!close) break;
    const end = s.indexOf(close);
    if (end === -1) return undefined;
    s = s.slice(end + close.length).trimStart();
  }
  return /^<svg[\s>/]/i.test(s) ? text : undefined;
}

/**
 * Pilihan paste dari clipboard: file SVG dulu (nama file = nama layer), lalu teks SVG; selain itu undefined (paste
 * dibiarkan, tanpa `preventDefault`).
 */
export function clipboardSvg<F extends { type: string; name: string }>(input: { files: readonly F[]; text: string | undefined }): { file: F; name: string | undefined } | { text: string } | undefined {
  const file = input.files.find(isSvgFile);
  if (file) return { file, name: fileLayerName(file.name) };
  const text = svgFromText(input.text);
  return text ? { text } : undefined;
}

/** "Undo paste" hanya bila entri paste masih teratas di tumpukan undo jendela ini. */
export const canUndoPaste = (undo: readonly unknown[], entry: unknown): boolean => entry !== undefined && undo[undo.length - 1] === entry;

/** File SVG dari clipboard/drop. */
export const isSvgFile = (f: { type: string; name: string }): boolean => f.type === 'image/svg+xml' || /\.svg$/i.test(f.name);

/** Nama layer dari nama file (`rocket.svg` → `rocket`). */
export function fileLayerName(name: string): string | undefined {
  const s = name.replace(/\.svg$/i, '').trim();
  return s ? s.slice(0, 120) : undefined;
}

export const PASTE_NO_TARGET = 'Select a board or frame to paste into.';

type TreeNode = { id: string; type: string; children?: TreeNode[] };

/**
 * Tujuan paste dari seleksi (alamat terakhir dipilih): board/frame terpilih itu sendiri, selain itu kontainer leluhur
 * terdekat. Alamat isi instance (`I/…`) memakai instance terluar; instance bukan tujuan, jadi naik ke parent-nya.
 */
export function pasteTarget(doc: Pick<LakarDocument, 'pages'>, selection: readonly string[]): { parentId: string } | { error: string } {
  const last = selection[selection.length - 1];
  if (!last) return { error: PASTE_NO_TARGET };
  const id = last.split('/')[0]!;
  const find = (n: TreeNode, chain: TreeNode[]): TreeNode[] | undefined => {
    const next = [...chain, n];
    if (n.id === id) return next;
    for (const c of n.children ?? []) {
      const hit = find(c, next);
      if (hit) return hit;
    }
    return undefined;
  };
  for (const p of doc.pages) {
    for (const b of p.children as unknown as TreeNode[]) {
      const chain = find(b, []);
      if (!chain) continue;
      for (let i = chain.length - 1; i >= 0; i--) {
        const n = chain[i]!;
        if (n.type === 'board' || n.type === 'frame') return { parentId: n.id };
      }
    }
  }
  return { error: PASTE_NO_TARGET };
}

const KEPT_LABELS: Record<string, string> = {
  'fill-rule': 'fill-rule',
  'stroke-linecap': 'stroke caps',
  'stroke-linejoin': 'joins',
  'stroke-dasharray': 'dashes',
  'stroke-dashoffset': 'dash offsets',
  'stroke-miterlimit': 'miter limits',
  'fill-opacity': 'fill opacity',
  'stroke-opacity': 'stroke opacity',
  'paint-order': 'paint order',
  'shape-rendering': 'shape rendering',
  opacity: 'opacity',
  transform: 'transforms',
};

/** `a`, `a and b`, `a, b and c`. */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Judul toast/report: "Pasted SVG as 4 paths". */
export const pasteTitle = (r: PasteReport): string => `Pasted SVG as ${plural(r.paths, 'path')}`;

const dropName = (d: PasteReport['dropped'][number]) => (d.kind === 'value' ? `${d.name} value` : d.name);
/** Maks nama yang disebut di toast; sisanya diringkas menjadi "N more". */
const TOAST_NAMES_MAX = 4;

/** Deskripsi toast: "Kept fill-rule, stroke caps and dashes. Not imported: filter, <mask> (no matching property)." */
export function pasteDescription(r: PasteReport): string {
  const parts: string[] = [];
  const kept = r.kept.map((k) => KEPT_LABELS[k] ?? k);
  if (kept.length) parts.push(`Kept ${joinList(kept)}.`);
  if (r.dropped.length) {
    const names = r.dropped.map(dropName);
    const shown = names.length > TOAST_NAMES_MAX ? [...names.slice(0, TOAST_NAMES_MAX - 1), `${names.length - TOAST_NAMES_MAX + 1} more`] : names;
    const values = r.dropped.filter((d) => d.kind === 'value').length;
    const why = values === 0 ? 'no matching property' : values === r.dropped.length ? 'unsupported values' : 'no matching property or unsupported values';
    parts.push(`Not imported: ${shown.join(', ')} (${why}).`);
  }
  return parts.length ? parts.join(' ') : 'All attributes kept.';
}

export type PasteReportItem = { icon: 'code' | 'paintbrush'; what: string; why: string };

/** Baris "Not imported" Paste Report (w2am0). */
export function pasteReportItems(r: PasteReport): PasteReportItem[] {
  return r.dropped.map((d) => ({
    icon: d.kind === 'element' ? 'code' : 'paintbrush',
    what: d.count > 1 ? `${d.count} × ${dropName(d)}` : dropName(d),
    why: d.kind === 'value' ? 'Value not supported' : 'No matching Lakar property',
  }));
}

/** Deskripsi header report: "4 paths in “Icon / Rocket” · 1 change in History". */
export const pasteReportDescription = (r: PasteReport, layer: string): string => `${plural(r.paths, 'path')} in “${layer}” · 1 change in History`;

/** Teks "Copy report". */
export function pasteReportText(r: PasteReport, layer: string): string {
  const items = pasteReportItems(r);
  const lines = [pasteTitle(r), pasteReportDescription(r, layer), pasteDescription(r)];
  if (items.length) lines.push(`Not imported (${items.length}):`, ...items.map((i) => `- ${i.what}: ${i.why}`));
  return lines.join('\n');
}
