/// <reference lib="dom" />
// Render murni: dokumen (sudah di-resolve) → DOM (AD-5, AD-6).
// HANYA `import type` dari luar paket: dist/index.js dimuat apa adanya sebagai module
// di halaman Chromium (dan nanti browser B), tanpa bundler.
import type { BoardNode, ChildNode, FrameNode, LakarDocument, TextNode } from '@lakar/schema';

export const PACKAGE = '@lakar/render';

/** Atribut penanda node di DOM; daemon memakainya untuk screenshot elemen board. */
export const NODE_ATTR = 'data-lakar-id';

const ALIGN: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
const JUSTIFY: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between' };

export function findBoard(doc: LakarDocument, boardId: string): BoardNode | undefined {
  for (const p of doc.pages) for (const b of p.children) if (b.id === boardId) return b;
  return undefined;
}

/** Ganti isi `root` dengan DOM board `boardId`. Mengembalikan elemen board. */
export function mountBoard(doc: LakarDocument, boardId: string, root: HTMLElement): HTMLElement {
  const board = findBoard(doc, boardId);
  if (!board) throw new Error(`board ${boardId} tidak ada`);
  const el = root.ownerDocument.createElement('div');
  el.setAttribute(NODE_ATTR, board.id);
  Object.assign(el.style, {
    position: 'relative',
    boxSizing: 'border-box',
    width: `${board.width}px`,
    height: `${board.height}px`,
    overflow: 'hidden', // board selalu clip (AD-15)
    background: '#FFFFFF', // [sementara] tracer belum punya fills (story 5)
    // Board menata anak flow sebagai kolom dari kiri atas.
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  } satisfies Partial<CSSStyleDeclaration>);
  for (const c of board.children) el.appendChild(renderChild(root.ownerDocument, c));
  root.replaceChildren(el);
  return el;
}

function renderChild(d: Document, n: ChildNode): HTMLElement {
  return n.type === 'frame' ? renderFrame(d, n) : renderText(d, n);
}

function renderFrame(d: Document, n: FrameNode): HTMLElement {
  const el = d.createElement('div');
  el.setAttribute(NODE_ATTR, n.id);
  const s = el.style;
  s.boxSizing = 'border-box';
  const layout = n.layout ?? 'none';
  if (layout === 'none') {
    s.position = 'relative';
    s.display = 'block';
  } else {
    // Pemetaan 1:1 ke flexbox CSS.
    s.display = 'flex';
    s.flexDirection = layout;
    if (n.gap !== undefined) s.gap = `${n.gap}px`;
    if (n.align) s.alignItems = ALIGN[n.align]!;
    if (n.justify) s.justifyContent = JUSTIFY[n.justify]!;
    if (s.position === '') s.position = 'relative';
  }
  if (n.padding !== undefined) s.padding = `${n.padding}px`;
  if (n.width !== undefined) s.width = `${n.width}px`;
  if (n.height !== undefined) s.height = `${n.height}px`;
  if (n.position === 'absolute') {
    s.position = 'absolute';
    s.left = `${n.x ?? 0}px`;
    s.top = `${n.y ?? 0}px`;
  }
  for (const c of n.children) el.appendChild(renderChild(d, c));
  return el;
}

function renderText(d: Document, n: TextNode): HTMLElement {
  const el = d.createElement('div');
  el.setAttribute(NODE_ATTR, n.id);
  const s = el.style;
  s.fontFamily = 'sans-serif'; // [sementara sampai story 7: registry font + FONT_MISSING]
  s.fontSize = `${n.size}px`;
  s.color = n.color ?? '#000000';
  s.whiteSpace = 'pre-wrap';
  el.textContent = n.content;
  return el;
}
