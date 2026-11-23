// Halaman Chromium terisolasi untuk importer paste HTML (AD-15, epic paste-vektor story 4).
// - Context baru per paste: JavaScript halaman mati (`javaScriptEnabled:false`), DPR 1, viewport `width`×800.
// - Jaringan: `context.route('**/*')` hanya melayani dokumen (sekali) dan font Lakar dari origin internal
//   `http://paste.lakar.invalid`; permintaan lain dibatalkan dan dicatat untuk laporan. Data URI tidak lewat jaringan.
// - Snapshot: skrip MILIK DAEMON (`SNAPSHOT_FN`, dijalankan lewat `page.evaluate`, bukan skrip halaman) membaca pohon
//   DOM, kotak, computed style, dan nilai tertulis beberapa properti dari CSSOM, lalu mengembalikan JSON biasa.
// HTML pengguna tidak disimpan di mana pun; snapshot dibuang setelah dipetakan (`html.ts`).
import type { Browser, Route } from 'playwright-core';
import type { FontRegistry } from '../fonts.js';

/** Origin internal halaman paste (tidak pernah ter-resolve; dilayani `route.fulfill`). */
export const PASTE_ORIGIN = 'http://paste.lakar.invalid';
/** Tinggi viewport halaman paste. */
export const PASTE_VIEWPORT_HEIGHT = 800;
/** Batas elemen dan kedalaman snapshot (sisanya dipotong, `truncated`). */
export const SNAPSHOT_ELEMENTS_MAX = 5000;
export const SNAPSHOT_DEPTH_MAX = 256;

/** Kotak dokumen `[x, y, w, h]` (px CSS, 2 desimal). */
export type SnapBox = [x: number, y: number, w: number, h: number];
export type SnapStyle = Record<string, string>;

export type SnapText = { k: 'text'; content: string; box: SnapBox; lines: number };
export type SnapElement = {
  k: 'el';
  tag: string;
  id?: string;
  cls?: string;
  label?: string;
  box: SnapBox;
  /** Subset computed style (`STYLE_PROPS`). */
  style: SnapStyle;
  /** Nilai tertulis (`SPEC_PROPS`): style inline, lalu aturan stylesheet yang menang; kosong = tidak ditulis. */
  spec: SnapStyle;
  children: SnapNode[];
  /** Kandidat teks: hanya teks, `<br>`, dan elemen inline tanpa kotak. `mixed` = tag inline bergaya teks lain. */
  text?: { content: string; lines: number; mixed: string[] };
  /** `<img>`: `src` hanya bila data URI. */
  img?: { src?: string };
  /** `<svg>` inline: XML dengan ukuran tampil dan paint computed dipanggang. */
  svg?: string;
  /** Atribut `on*` (tidak pernah dijalankan). */
  handlers?: string[];
  /** Pseudo-elemen `::before`/`::after` dengan `content` (tidak diimpor). */
  pseudo?: string[];
};
export type SnapNode = SnapElement | SnapText;
export type BlockedRequest = { type: string; url: string };
export type HtmlSnapshot = { width: number; body: SnapElement; scripts: number; requests: BlockedRequest[]; truncated: boolean };

/** Properti computed yang dibaca (kebab-case, `getPropertyValue`). */
export const STYLE_PROPS = [
  'display',
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-basis',
  'justify-content',
  'align-items',
  'align-content',
  'align-self',
  'justify-items',
  'justify-self',
  'row-gap',
  'column-gap',
  'grid-template-columns',
  'grid-template-rows',
  'grid-template-areas',
  'grid-auto-flow',
  'grid-column-start',
  'grid-column-end',
  'grid-row-start',
  'grid-row-end',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'background-color',
  'background-image',
  'background-size',
  'background-repeat',
  'background-position',
  'box-shadow',
  'opacity',
  'mix-blend-mode',
  'filter',
  'backdrop-filter',
  'transform',
  'overflow-x',
  'overflow-y',
  'visibility',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'color',
  'text-shadow',
  'text-decoration-line',
  'text-overflow',
  'font-variant-numeric',
  'white-space',
  'object-fit',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'z-index',
  'outline-style',
  'clip-path',
  'mask-image',
] as const;
/** Properti yang dibaca sebagai nilai tertulis (computed-nya selalu px terpakai). */
export const SPEC_PROPS = ['width', 'height', 'grid-template-columns', 'grid-template-rows'] as const;

/**
 * Skrip snapshot (JavaScript, dijalankan di halaman lewat `page.evaluate`). Ditulis sebagai string karena paket daemon
 * tidak memakai lib DOM. Argumen: `{styleProps, specProps, maxElements, maxDepth}`.
 */
export const SNAPSHOT_FN = String.raw`(opts) => {
  const SKIP = new Set(['head', 'style', 'link', 'meta', 'title', 'template', 'base', 'script']);
  const TEXT_PROPS = ['font-family', 'font-size', 'font-weight', 'font-style', 'color', 'letter-spacing', 'text-decoration-line', 'line-height'];
  const REPLACED = new Set(['img', 'svg', 'iframe', 'video', 'audio', 'canvas', 'object', 'embed', 'input', 'textarea', 'select', 'button', 'progress', 'meter']);
  const r2 = (n) => Math.round(n * 100) / 100;
  const sx = window.scrollX, sy = window.scrollY;
  const boxOf = (r) => [r2(r.left + sx), r2(r.top + sy), r2(r.width), r2(r.height)];
  let count = 0, scripts = 0, truncated = false;

  // Aturan stylesheet (termasuk @media yang cocok, @supports, @layer) untuk nilai tertulis.
  const rules = [];
  const collect = (list) => {
    for (const r of list) {
      if (r.selectorText !== undefined && r.style) rules.push(r);
      else if (r.cssRules) {
        if (r.media && r.media.mediaText && !window.matchMedia(r.media.mediaText).matches) continue;
        collect(r.cssRules);
      }
    }
  };
  for (const sh of document.styleSheets) { try { collect(sh.cssRules); } catch (e) {} }
  const splitSel = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(' || ch === '[') d++; else if (ch === ')' || ch === ']') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()).filter(Boolean); };
  const specificity = (sel) => {
    const s = sel.replace(/\[[^\]]*\]/g, ' .a ').replace(/::[\w-]+/g, ' z ');
    const a = (s.match(/#[\w-]+/g) || []).length;
    const b = (s.match(/\.[\w-]+|:[\w-]+/g) || []).length;
    const c = (s.match(/(^|[\s>+~(])[a-zA-Z][\w-]*/g) || []).length;
    return a * 10000 + b * 100 + c;
  };
  const specified = (el, prop) => {
    let best = undefined, bestKey = -1;
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const v = r.style.getPropertyValue(prop);
      if (!v) continue;
      let spec = -1;
      for (const part of splitSel(r.selectorText)) { try { if (el.matches(part)) spec = Math.max(spec, specificity(part)); } catch (e) {} }
      if (spec < 0) continue;
      const key = (r.style.getPropertyPriority(prop) ? 2e9 : 0) + spec * 1000 + i;
      if (key >= bestKey) { bestKey = key; best = v; }
    }
    const inline = el.style ? el.style.getPropertyValue(prop) : '';
    if (inline && (el.style.getPropertyPriority(prop) || bestKey < 2e9)) best = inline;
    return best || '';
  };

  const hasBox = (cs) =>
    !/^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/.test(cs.getPropertyValue('background-color')) ||
    cs.getPropertyValue('background-image') !== 'none' ||
    cs.getPropertyValue('box-shadow') !== 'none' ||
    ['top', 'right', 'bottom', 'left'].some((s) => parseFloat(cs.getPropertyValue('border-' + s + '-width')) > 0 || parseFloat(cs.getPropertyValue('padding-' + s)) > 0);
  const plainInline = (el) => {
    if (REPLACED.has(el.localName)) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return true;
    if (cs.display !== 'inline' || hasBox(cs)) return false;
    return parseFloat(cs.marginLeft) === 0 && parseFloat(cs.marginRight) === 0;
  };
  const inlineOnly = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 || n.nodeType === 8) continue;
      if (n.nodeType !== 1) return false;
      const tag = n.localName;
      if (tag === 'br' || SKIP.has(tag)) continue;
      if (!plainInline(n) || !inlineOnly(n)) return false;
    }
    return true;
  };
  const linesOf = (rects) => {
    const tops = [];
    for (const r of rects) { if (r.width <= 0 && r.height <= 0) continue; if (!tops.some((t) => Math.abs(t - r.top) < Math.max(2, r.height / 2))) tops.push(r.top); }
    return Math.max(1, tops.length);
  };
  const mixedOf = (el) => {
    const base = getComputedStyle(el);
    const out = new Set();
    for (const d of el.querySelectorAll('*')) {
      if (d.localName === 'br' || SKIP.has(d.localName)) continue;
      const cs = getComputedStyle(d);
      if (cs.display === 'none' || !(d.textContent || '').trim()) continue;
      if (TEXT_PROPS.some((p) => cs.getPropertyValue(p) !== base.getPropertyValue(p))) out.add(d.localName);
    }
    return [...out];
  };
  const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
  const svgOf = (el, box) => {
    const clone = el.cloneNode(true);
    const src = [el, ...el.querySelectorAll('*')];
    const dst = [clone, ...clone.querySelectorAll('*')];
    for (let i = 0; i < src.length; i++) {
      if (!SHAPES.has(src[i].localName)) continue;
      const cs = getComputedStyle(src[i]);
      dst[i].setAttribute('fill', cs.getPropertyValue('fill'));
      dst[i].setAttribute('stroke', cs.getPropertyValue('stroke'));
      dst[i].setAttribute('stroke-width', cs.getPropertyValue('stroke-width').replace(/px$/, ''));
      dst[i].removeAttribute('style');
      dst[i].removeAttribute('class');
    }
    clone.setAttribute('width', String(box[2]));
    clone.setAttribute('height', String(box[3]));
    clone.setAttribute('color', getComputedStyle(el).color);
    clone.removeAttribute('style');
    clone.removeAttribute('class');
    return new XMLSerializer().serializeToString(clone);
  };

  const visit = (el, depth, out) => {
    const tag = el.localName;
    if (tag === 'script') { scripts++; return; }
    if (SKIP.has(tag)) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    // display:contents diratakan, kecuali body (akar snapshot harus satu elemen).
    if (cs.display === 'contents' && el !== document.body) { for (const c of el.children) visit(c, depth, out); return; }
    if (count >= opts.maxElements || depth > opts.maxDepth) { truncated = true; return; }
    count++;
    const node = { k: 'el', tag, box: boxOf(el.getBoundingClientRect()), style: {}, spec: {}, children: [] };
    if (el.id) node.id = el.id;
    if (el.classList && el.classList.length) node.cls = el.classList[0];
    const label = el.getAttribute('aria-label');
    if (label) node.label = label;
    for (const p of opts.styleProps) node.style[p] = cs.getPropertyValue(p);
    for (const p of opts.specProps) node.spec[p] = specified(el, p);
    const handlers = el.getAttributeNames().filter((a) => /^on/i.test(a));
    if (handlers.length) node.handlers = handlers.map((a) => a.toLowerCase());
    const pseudo = ['::before', '::after'].filter((p) => { const c = getComputedStyle(el, p).content; return c && c !== 'none' && c !== 'normal'; });
    if (pseudo.length) node.pseudo = pseudo;
    out.push(node);
    if (tag === 'img') {
      const src = el.currentSrc || el.getAttribute('src') || '';
      node.img = src.startsWith('data:') ? { src } : {};
      return;
    }
    if (tag === 'svg') { node.svg = svgOf(el, node.box); return; }
    if (REPLACED.has(tag) && tag !== 'button') return;
    // innerText (bukan textContent): teks yang hanya ada di turunan display:none tidak menjadi layer kosong.
    if (inlineOnly(el) && el.innerText.trim()) {
      const range = document.createRange();
      range.selectNodeContents(el);
      node.text = { content: el.innerText.replace(/\n+$/, ''), lines: linesOf(range.getClientRects()), mixed: mixedOf(el) };
      return;
    }
    const pre = /^pre/.test(cs.whiteSpace) || cs.whiteSpace === 'break-spaces';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const raw = n.data;
        const content = pre ? raw : raw.replace(/\s+/g, ' ').trim();
        if (!content.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.width <= 0 && r.height <= 0) continue;
        node.children.push({ k: 'text', content, box: boxOf(r), lines: linesOf(range.getClientRects()) });
      } else if (n.nodeType === 1) visit(n, depth + 1, node.children);
    }
  };
  const out = [];
  visit(document.body, 0, out);
  return { body: out[0], scripts, truncated };
}`;

/** Prefix dokumen: charset, @font-face semua face terdaftar (dilayani origin internal), reset body, font default. */
export function pastePrefix(fonts: FontRegistry): string {
  const faces: string[] = [];
  for (const family of fonts.families()) {
    const e = fonts.entry(family);
    if (!e) continue;
    for (const w of e.weights)
      for (const st of e.styles)
        for (const subset of ['latin', 'latin-ext'] as const) {
          faces.push(
            `@font-face{font-family:${JSON.stringify(e.family)};font-weight:${w};font-style:${st};font-display:block;` +
              `src:url(${PASTE_ORIGIN}/fonts/${e.id}/${e.id}-${subset}-${w}-${st}.woff2) format("woff2");unicode-range:${e.unicodeRange[subset]}}`,
          );
        }
  }
  return `<!doctype html><meta charset="utf-8"><style>${faces.join('\n')}\nhtml,body{margin:0;padding:0}:root{font-family:Inter}</style>`;
}

export type SnapshotOptions = { width: number; fonts: FontRegistry; timeoutMs?: number; screenshot?: boolean };

/**
 * Render `html` di context terisolasi `browser` dan kembalikan snapshot (+ PNG elemen akar bila `screenshot`, untuk
 * uji piksel). Context selalu ditutup; lewat `timeoutMs` context ditutup paksa supaya evaluate yang macet tidak terus
 * berjalan sesudah sewa pool habis. URL font absolut (origin internal) supaya `<base href>` HTML tidak mengalihkannya.
 */
export async function snapshotHtml(browser: Browser, html: string, opts: SnapshotOptions): Promise<HtmlSnapshot & { png?: Buffer }> {
  const width = Math.max(1, Math.round(opts.width));
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: PASTE_VIEWPORT_HEIGHT }, deviceScaleFactor: 1, serviceWorkers: 'block', offline: false });
  const requests: BlockedRequest[] = [];
  let served = false;
  const timer = opts.timeoutMs ? setTimeout(() => void context.close().catch(() => {}), opts.timeoutMs) : undefined;
  try {
    if (opts.timeoutMs) context.setDefaultTimeout(opts.timeoutMs);
    const body = pastePrefix(opts.fonts) + html;
    await context.route('**/*', async (route: Route) => {
      const req = route.request();
      const url = req.url();
      if (url === `${PASTE_ORIGIN}/` && !served && req.isNavigationRequest()) {
        served = true;
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
      }
      const font = url.startsWith(`${PASTE_ORIGIN}/fonts/`) ? /^\/fonts\/([a-z0-9-]+)\/([^/?#]+)$/.exec(new URL(url).pathname) : null;
      const path = font ? opts.fonts.filePath(font[1]!, font[2]!) : undefined;
      if (path) return route.fulfill({ status: 200, contentType: 'font/woff2', path });
      requests.push({ type: req.resourceType(), url });
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    await page.goto(`${PASTE_ORIGIN}/`, { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready.then(() => true)');
    const snap = (await page.evaluate(
      `(${SNAPSHOT_FN})(${JSON.stringify({ styleProps: STYLE_PROPS, specProps: SPEC_PROPS, maxElements: SNAPSHOT_ELEMENTS_MAX, maxDepth: SNAPSHOT_DEPTH_MAX })})`,
    )) as { body?: SnapElement; scripts: number; truncated: boolean };
    // Body tak terlihat (mis. `body{display:none}`): snapshot kosong → importer melapor SCHEMA_INVALID, bukan galat render.
    snap.body ??= { k: 'el', tag: 'body', box: [0, 0, width, 0], style: {}, spec: {}, children: [] };
    let png: Buffer | undefined;
    if (opts.screenshot) {
      const els = snap.body.children.filter((c): c is SnapElement => c.k === 'el');
      const target = els.length === 1 && !snap.body.children.some((c) => c.k === 'text') ? els[0]!.box : snap.body.box;
      png = await page.screenshot({ type: 'png', clip: { x: target[0], y: target[1], width: Math.max(1, target[2]), height: Math.max(1, target[3]) }, fullPage: true, animations: 'disabled', caret: 'hide' });
    }
    return { width, body: snap.body, scripts: snap.scripts, requests, truncated: snap.truncated, ...(png ? { png } : {}) };
  } finally {
    clearTimeout(timer);
    await context.close().catch(() => {});
  }
}
