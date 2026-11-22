// Model murni dialog Export code (epic kode story 5, desain 09 lK7Y5/u7OIu): opsi → @lakar/codegen, glyph ikon dari
// dokumen ter-ekspansi (`iconRefs`) lewat pengambil glyph (viewer: GET /viewer/render-deps, yang memakai katalog yang
// sama dengan daemon), baris daftar file, ukuran, meta, ikon, nama zip, dan pewarnaan kode. Daemon `export_code`
// memanggil generator dan opsi yang sama, jadi berkasnya identik (AD-16).
import { generateCode, iconRefs, type CodegenFile, type CodegenResult, type CodegenTarget } from '@lakar/codegen';
import type { IconGlyph, LakarDocument } from '@lakar/schema';
/** Nama ikon baris file (subset IconName icons.tsx; tanpa impor agar modul ini murni untuk tes Node). */
export type FileIconName = 'palette' | 'wind' | 'fileType' | 'component' | 'fileCode';

export type { CodegenFile, CodegenTarget };

/** Pilihan dialog (desain: target segmented + tiga checkbox, default aktif). */
export type CodeExportSettings = { target: CodegenTarget; components: boolean; tokens: boolean; typescript: boolean };
export const DEFAULT_SETTINGS: CodeExportSettings = { target: 'react-tailwind', components: true, tokens: true, typescript: true };

export const TARGET_LABEL: Record<CodegenTarget, string> = { 'react-tailwind': 'React + Tailwind', 'react-css': 'React + CSS' };

/** Opsi codegen dari pilihan dialog (sama dengan body `export_code`). */
export const codegenOptions = (nodeId: string, s: CodeExportSettings) => ({ nodeId, target: s.target, components: s.components, tokens: s.tokens, typescript: s.typescript });

/** Kunci render-deps `lib/icon` untuk ikon yang diminta ekspor (termasuk varian enum dan isi instance). */
export function glyphKeys(doc: LakarDocument, nodeId: string, s: CodeExportSettings): string[] {
  return iconRefs(doc, codegenOptions(nodeId, s)).map((r) => `${r.lib}/${r.icon}`);
}

/** Ekspor: glyph diambil `fetchGlyphs` (kunci `lib/icon`; yang tidak ada dilewati → warning codegen), lalu generateCode. */
export async function exportCode(doc: LakarDocument, nodeId: string, s: CodeExportSettings, fetchGlyphs: (keys: string[]) => Promise<readonly IconGlyph[]>): Promise<CodegenResult> {
  const keys = glyphKeys(doc, nodeId, s);
  const icons = keys.length ? await fetchGlyphs(keys) : [];
  return generateCode(doc, { ...codegenOptions(nodeId, s), icons });
}

export const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** "512 B", "3.1 KB", "1.2 MB". */
export function formatBytes(n: number): string {
  if (n < 100) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** "5 files · 9.4 KB" (header daftar Files). */
export function filesSummary(files: readonly CodegenFile[]): string {
  const total = files.reduce((n, f) => n + byteLength(f.contents), 0);
  return `${files.length} ${files.length === 1 ? 'file' : 'files'} · ${formatBytes(total)}`;
}

export const COMPONENTS_FOLDER = 'components/';
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Ikon baris file (desain: berkas utama file-code, komponen component, modul CSS file-type, token palette, tema wind). */
export function fileIcon(path: string): FileIconName {
  if (path === 'tokens.css') return 'palette';
  if (path === 'theme.css') return 'wind';
  if (path.endsWith('.css')) return 'fileType';
  if (path.startsWith(COMPONENTS_FOLDER)) return 'component';
  return 'fileCode';
}

/** Meta tab pratinjau ("TSX · Tailwind v4", "CSS Modules", …). */
export function fileMeta(path: string, target: CodegenTarget): string {
  if (path === 'tokens.css') return 'CSS variables';
  if (path === 'theme.css') return 'Tailwind v4 theme';
  if (path.endsWith('.module.css')) return 'CSS Modules';
  const lang = path.endsWith('.jsx') ? 'JSX' : 'TSX';
  return `${lang} · ${target === 'react-tailwind' ? 'Tailwind v4' : 'CSS Modules'}`;
}

export type FileRow = { kind: 'folder'; name: string } | { kind: 'file'; path: string; name: string; nested: boolean; bytes: number; icon: FileIconName };

/** Baris daftar Files: urutan codegen; baris folder `components/` sebelum file komponen pertama, file di dalamnya menjorok. */
export function fileRows(files: readonly CodegenFile[]): FileRow[] {
  const rows: FileRow[] = [];
  let folder = false;
  for (const f of files) {
    const nested = f.path.startsWith(COMPONENTS_FOLDER);
    if (nested && !folder) {
      rows.push({ kind: 'folder', name: COMPONENTS_FOLDER });
      folder = true;
    }
    rows.push({ kind: 'file', path: f.path, name: nested ? f.path.slice(COMPONENTS_FOLDER.length) : f.path, nested, bytes: byteLength(f.contents), icon: fileIcon(f.path) });
  }
  return rows;
}

/** Nama unduhan zip: `<BerkasUtama>-<target>.zip`. */
export function zipName(files: readonly CodegenFile[], target: CodegenTarget): string {
  const main = files[0] ? baseName(files[0].path).replace(/\.(tsx|jsx)$/, '') : 'export';
  return `${main}-${target}.zip`;
}

/** Jenis node untuk baris sumber header ("Hero — Desktop · Board · rev 42"). */
export function nodeKindLabel(node: { type: string; component?: unknown }): string {
  if (node.component) return 'Component';
  const labels: Record<string, string> = { board: 'Board', frame: 'Frame', instance: 'Instance', text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', path: 'Path', icon: 'Icon' };
  return labels[node.type] ?? 'Layer';
}

/** Cari node tersimpan (board atau anak) menurut id. */
export function findStoredNode(doc: LakarDocument, id: string): { id: string; name: string; type: string; component?: unknown } | undefined {
  type N = { id: string; name: string; type: string; component?: unknown; children?: N[] };
  const walk = (n: N): N | undefined => {
    if (n.id === id) return n;
    for (const c of n.children ?? []) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return undefined;
  };
  for (const p of doc.pages) {
    for (const b of p.children as unknown as N[]) {
      const hit = walk(b);
      if (hit) return hit;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Pewarnaan kode (desain 09): tokenizer regex per baris, tidak memvalidasi sintaks.
// ---------------------------------------------------------------------------

/** keyword → --accent, string → --agent, selector/tag → --success, prop → --codex, comment → --text-muted, punct → --text-secondary. */
export type TokKind = 'keyword' | 'string' | 'selector' | 'prop' | 'comment' | 'punct' | 'plain';
export type Tok = { text: string; kind: TokKind };
/** Kelas CSS per jenis token (app.css `.tk-*`); plain tanpa kelas. */
export const TOK_CLASS: Record<TokKind, string> = { keyword: 'tk-kw', string: 'tk-str', selector: 'tk-sel', prop: 'tk-prop', comment: 'tk-com', punct: 'tk-p', plain: '' };

type Rule = [RegExp, TokKind];
const JS_RULES: Rule[] = [
  [/\/\/.*/y, 'comment'],
  [/\/\*.*?\*\//y, 'comment'],
  [/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/y, 'string'],
  [/\b(?:import|from|export|default|function|return|const|let|type|if|null|undefined|true|false|typeof)\b/y, 'keyword'],
  [/(?<=<\/?)[A-Za-z][\w.]*/y, 'selector'],
  [/[A-Za-z_][\w-]*(?==)/y, 'prop'],
  [/[{}()[\];,<>/=.:?!&|+*-]/y, 'punct'],
  [/[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\s+|./y, 'plain'],
];
const CSS_RULES: Rule[] = [
  [/\/\*.*?\*\//y, 'comment'],
  [/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, 'string'],
  [/@[\w-]+/y, 'keyword'],
  [/var\([^)]*\)|#[0-9A-Fa-f]{3,8}\b/y, 'string'],
  [/[{}();,:]/y, 'punct'],
  [/[^{}();,:"'\s/@#]+|\s+|./y, 'plain'],
];

function scan(line: string, rules: Rule[]): Tok[] {
  const out: Tok[] = [];
  let at = 0;
  while (at < line.length) {
    for (const [re, kind] of rules) {
      re.lastIndex = at;
      const m = re.exec(line);
      if (!m || m[0].length === 0) continue;
      const prev = out[out.length - 1];
      if (prev && prev.kind === kind) prev.text += m[0];
      else out.push({ text: m[0], kind });
      at += m[0].length;
      break;
    }
  }
  return out;
}

/** Baris CSS: selektor (sebelum `{`) dan nama properti (sebelum `:` di dalam blok) diwarnai khusus. */
function cssLine(line: string, inBlock: boolean): { toks: Tok[]; inBlock: boolean } {
  const decl = inBlock ? /^(\s*)([\w-]+)(\s*:)/.exec(line) : null;
  if (decl) {
    const rest = scan(line.slice(decl[0].length), CSS_RULES);
    const toks: Tok[] = [...(decl[1] ? [{ text: decl[1], kind: 'plain' as const }] : []), { text: decl[2]!, kind: 'prop' }, { text: decl[3]!, kind: 'punct' }, ...rest];
    return { toks, inBlock: !line.includes('}') };
  }
  const open = line.indexOf('{');
  if (!inBlock && open > 0 && !line.trimStart().startsWith('@')) {
    const sel = line.slice(0, open);
    const trimmed = sel.trimEnd();
    return { toks: [{ text: trimmed, kind: 'selector' }, ...scan(line.slice(trimmed.length), CSS_RULES)], inBlock: !line.includes('}', open) };
  }
  const toks = scan(line, CSS_RULES);
  let next = inBlock;
  for (const ch of line) {
    if (ch === '{') next = true;
    if (ch === '}') next = false;
  }
  return { toks, inBlock: next };
}

/** Token per baris untuk pratinjau `path` (CSS menurut ekstensi, selain itu TSX/JSX). */
export function highlight(path: string, text: string): Tok[][] {
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  if (!path.endsWith('.css')) return lines.map((l) => scan(l, JS_RULES));
  let inBlock = false;
  return lines.map((l) => {
    const r = cssLine(l, inBlock);
    inBlock = r.inBlock;
    return r.toks;
  });
}
