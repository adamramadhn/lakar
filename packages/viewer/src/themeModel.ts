// Model panel Theme (epic token-tema story 3, desain 07 Theme & tokens): daftar token per jenis, sel nilai per mode,
// dan pembangun op route ops viewer (AD-7) untuk ubah/tambah/ganti nama/hapus token, tambah/ganti nama mode, dan
// themeMode board (AD-11). Murni: masukan = kepala dokumen tersimpan; keluaran = DocOp[] (kosong = tanpa perubahan)
// atau pesan error Inggris siap UI. Validasi nilai memakai skema yang sama dengan core (`isTokenValueOf`).
import { findTokenUses, isTokenValueOf, MODE_NAME_PATTERN, TOKEN_NAME_PATTERN, TOKEN_TYPES, type DocOp, type TokenType } from '@lakar/schema';
import { opsFor, type DesignTarget } from './designModel.js';
import { formatNumber, isTokenRef, parseHex, parseNumber, sameValue } from './designValues.js';
/** Nama ikon viewer (icons.tsx) yang dipakai panel Theme; tanpa impor icons.tsx agar modul tetap murni (tanpa JSX). */
export type ThemeIcon = 'palette' | 'squareDashed' | 'moveHorizontal' | 'box' | 'monitorSmartphone' | 'type' | 'bold' | 'aLargeSmall' | 'pilcrow' | 'space' | 'sun' | 'moon' | 'contrast';

export type TokenDefLike = { type: TokenType; value: string | number; modes?: Record<string, string | number> };
export type TokenMap = Readonly<Record<string, TokenDefLike>>;
/** Bagian dokumen tersimpan yang dibaca panel Theme. */
export type ThemeDoc = {
  tokens?: TokenMap | undefined;
  tokenModes?: readonly string[] | undefined;
  pages: readonly { children: readonly Record<string, unknown>[] }[];
};
/** Hasil pembangun op: ops (kosong = tanpa perubahan) + label History, atau error untuk ditampilkan. */
export type Built = { ops: DocOp[]; label: string } | { error: string };

export type TypeMeta = {
  label: string;
  /** Nama ikon viewer (icons.tsx). */
  icon: ThemeIcon;
  /** Prefiks nama token baru bila jenis ini belum punya token. */
  prefix: string;
  initial: string | number;
  /** Teks sel → nilai sah, atau undefined. */
  parse: (text: string) => string | number | undefined;
  format: (v: unknown) => string;
  /** Kata untuk teks hapus ("plain color"). */
  plain: string;
};

const num = (v: unknown) => (typeof v === 'number' ? formatNumber(v) : String(v ?? ''));
const size = (t: string) => parseNumber(t, { min: 0 });
export const TYPE_META: Record<TokenType, TypeMeta> = {
  color: { label: 'Color', icon: 'palette', prefix: 'colors', initial: '#D9D9D9', parse: (t) => parseHex(t), format: (v) => (typeof v === 'string' ? v.replace(/^#/, '') : ''), plain: 'color' },
  radius: { label: 'Radius', icon: 'squareDashed', prefix: 'radius', initial: 4, parse: size, format: num, plain: 'number' },
  spacing: { label: 'Spacing', icon: 'moveHorizontal', prefix: 'spacing', initial: 8, parse: size, format: num, plain: 'number' },
  container: { label: 'Container', icon: 'box', prefix: 'container', initial: 1200, parse: size, format: num, plain: 'number' },
  breakpoint: { label: 'Breakpoint', icon: 'monitorSmartphone', prefix: 'breakpoint', initial: 768, parse: size, format: num, plain: 'number' },
  fontFamily: { label: 'Font family', icon: 'type', prefix: 'font.family', initial: 'Inter', parse: (t) => t.trim() || undefined, format: (v) => String(v ?? ''), plain: 'value' },
  fontWeight: { label: 'Font weight', icon: 'bold', prefix: 'font.weight', initial: 400, parse: (t) => parseNumber(t), format: num, plain: 'number' },
  fontSize: { label: 'Font size', icon: 'aLargeSmall', prefix: 'font.size', initial: 16, parse: size, format: num, plain: 'number' },
  lineHeight: { label: 'Line height', icon: 'pilcrow', prefix: 'font.line-height', initial: 24, parse: (t) => parseNumber(t), format: num, plain: 'number' },
  letterSpacing: { label: 'Letter spacing', icon: 'space', prefix: 'font.letter-spacing', initial: 0, parse: (t) => parseNumber(t), format: num, plain: 'number' },
};

/** Teks sel → nilai sah untuk tipe (skema v3), atau undefined. */
export function parseTokenValue(type: TokenType, text: string): string | number | undefined {
  const v = TYPE_META[type].parse(text);
  return v !== undefined && isTokenValueOf(type, v) ? v : undefined;
}

export const typeCounts = (tokens: TokenMap = {}): Record<TokenType, number> => {
  const out = Object.fromEntries(TOKEN_TYPES.map((t) => [t, 0])) as Record<TokenType, number>;
  for (const d of Object.values(tokens)) if (Object.hasOwn(out, d.type)) out[d.type]++;
  return out;
};

/** Jenis awal panel: jenis pertama yang punya token, selain itu color. */
export const firstType = (tokens: TokenMap = {}): TokenType => TOKEN_TYPES.find((t) => Object.values(tokens).some((d) => d.type === t)) ?? 'color';

/** Grup = nama tanpa segmen terakhir ('' untuk nama satu segmen). */
export const groupOf = (name: string) => (name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : '');

export type TokenGroup = { group: string; rows: { name: string; def: TokenDefLike }[] };

/** Token jenis `type` yang namanya memuat `filter`, dikelompokkan per grup (urut kemunculan di dokumen). */
export function tokenGroups(tokens: TokenMap = {}, type: TokenType, filter = ''): TokenGroup[] {
  const q = filter.trim().toLowerCase();
  const out: TokenGroup[] = [];
  const at = new Map<string, TokenGroup>();
  for (const [name, def] of Object.entries(tokens)) {
    if (def.type !== type || (q && !name.includes(q))) continue;
    const g = groupOf(name);
    let grp = at.get(g);
    if (!grp) {
      grp = { group: g, rows: [] };
      at.set(g, grp);
      out.push(grp);
    }
    grp.rows.push({ name, def });
  }
  return out;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Badge header: "48 tokens · 2 modes" (tanpa mode: "48 tokens"). */
export const countLabel = (tokens: TokenMap = {}, modes: readonly string[] = []) =>
  `${plural(Object.keys(tokens).length, 'token')}${modes.length ? ` · ${plural(modes.length, 'mode')}` : ''}`;

/** `high-contrast` → "High contrast". */
export const modeLabel = (m: string) => {
  const s = m.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Teks input mode → nama mode sah (huruf kecil, spasi → `-`), atau undefined. */
export function modeSlug(text: string): string | undefined {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
  return s && MODE_NAME_PATTERN.test(s) ? s : undefined;
}

/** Nilai sel: kolom default (`mode` undefined atau mode pertama) = `value`; mode lain = `modes[m]` atau diwarisi. */
export function cellOf(def: TokenDefLike, mode: string | undefined, modes: readonly string[] = []): { value: string | number; inherited: boolean } {
  if (mode === undefined || mode === modes[0]) return { value: def.value, inherited: false };
  if (def.modes && Object.hasOwn(def.modes, mode)) return { value: def.modes[mode]!, inherited: false };
  return { value: def.value, inherited: true };
}

const clone = (d: TokenDefLike): TokenDefLike => ({ type: d.type, value: d.value, ...(d.modes ? { modes: { ...d.modes } } : {}) });

/**
 * Edit satu sel. `mode` undefined/mode pertama = `value`; teks kosong di mode lain = hapus `modes[mode]`.
 * Nilai tidak sah → error; tanpa perubahan → ops kosong.
 */
export function setCellOps(tokens: TokenMap = {}, name: string, mode: string | undefined, text: string, modes: readonly string[] = []): Built {
  const def = tokens[name];
  if (!def) return { error: `Token ${name} no longer exists.` };
  const next = clone(def);
  const isDefault = mode === undefined || mode === modes[0];
  if (!isDefault && text.trim() === '') {
    if (next.modes) delete next.modes[mode];
  } else {
    const v = parseTokenValue(def.type, text);
    if (v === undefined) return { error: `Not a valid ${TYPE_META[def.type].label.toLowerCase()} value.` };
    if (isDefault) next.value = v;
    else next.modes = { ...(next.modes ?? {}), [mode]: v };
  }
  if (next.modes && Object.keys(next.modes).length === 0) delete next.modes;
  if (sameValue(next, def)) return { ops: [], label: '' };
  return { ops: [{ op: 'setTokens', tokens: { [name]: next } }], label: `Change token ${name}` };
}

/** Pesan error nama token (bentuk/panjang/dipakai), atau undefined bila sah dan bebas. */
export function tokenNameError(tokens: TokenMap = {}, name: string, self?: string): string | undefined {
  if (!name) return 'Enter a token name.';
  if (name.length > 64) return 'Token names are at most 64 characters.';
  if (!TOKEN_NAME_PATTERN.test(name)) return 'Use lowercase segments separated by dots, e.g. colors.text-primary.';
  if (name !== self && Object.hasOwn(tokens, name)) return `${name} already exists.`;
  return undefined;
}

/** Nama draf token baru: `<prefiks grup token pertama jenis itu | prefiks default>.new`, unik dengan `-2`, `-3`, … */
export function newTokenName(tokens: TokenMap = {}, type: TokenType): string {
  const first = Object.entries(tokens).find(([, d]) => d.type === type)?.[0];
  const prefix = (first && groupOf(first)) || TYPE_META[type].prefix;
  let name = `${prefix}.new`;
  for (let i = 2; Object.hasOwn(tokens, name); i++) name = `${prefix}.new-${i}`;
  return name;
}

export function addTokenOps(tokens: TokenMap = {}, rawName: string, type: TokenType): Built {
  const name = rawName.trim();
  const error = tokenNameError(tokens, name);
  if (error) return { error };
  return { ops: [{ op: 'setTokens', tokens: { [name]: { type, value: TYPE_META[type].initial } } }], label: `Add token ${name}` };
}

export function renameTokenOps(tokens: TokenMap = {}, from: string, rawTo: string): Built {
  const to = rawTo.trim();
  if (to === from) return { ops: [], label: '' };
  const error = tokenNameError(tokens, to);
  if (error) return { error };
  return { ops: [{ op: 'renameToken', from, to }], label: `Rename token ${from} to ${to}` };
}

/** Mode efektif board (AD-11): `themeMode` ?? mode pertama; dokumen tanpa mode → undefined. Satu sumber untuk Viewer. */
export const effectiveMode = (board: Readonly<Record<string, unknown>> | undefined, modes: readonly string[] | undefined): string | undefined =>
  (typeof board?.themeMode === 'string' ? board.themeMode : undefined) ?? modes?.[0];

/** Node (id) yang memakai token `name` beserta mode efektif board pemiliknya. */
function usersOf(doc: ThemeDoc, name: string): { id: string; node: Record<string, unknown>; mode: string | undefined; props: Set<string> }[] {
  const out = new Map<string, { id: string; node: Record<string, unknown>; mode: string | undefined; props: Set<string> }>();
  for (const use of findTokenUses(doc.pages)) {
    if (use.token !== name) continue;
    const nodePath = use.path.slice(0, use.path.length - use.propPath.length);
    let cur: unknown = doc;
    for (const seg of nodePath) cur = (cur as Record<string | number, unknown> | undefined)?.[seg];
    const node = cur as Record<string, unknown> | undefined;
    if (!node || typeof node.id !== 'string') continue;
    const board = doc.pages[use.page]?.children[use.board];
    const mode = effectiveMode(board, doc.tokenModes);
    let u = out.get(node.id);
    if (!u) {
      u = { id: node.id, node, mode, props: new Set() };
      out.set(node.id, u);
    }
    u.props.add(String(use.propPath[0]));
  }
  return [...out.values()];
}

/** Jumlah layer (node unik) yang memakai token. */
export const tokenUsage = (doc: ThemeDoc, name: string) => usersOf(doc, name).length;

/** Jumlah layer pemakai semua token sekaligus (satu kali jalan pohon; kunci node = path-nya). */
export function usageCounts(doc: ThemeDoc): Map<string, number> {
  const nodes = new Map<string, Set<string>>();
  for (const use of findTokenUses(doc.pages)) {
    const key = use.path.slice(0, use.path.length - use.propPath.length).join('.');
    let set = nodes.get(use.token);
    if (!set) nodes.set(use.token, (set = new Set()));
    set.add(key);
  }
  return new Map([...nodes].map(([k, v]) => [k, v.size]));
}

/** Ganti setiap ref `{$token: name}` di `v` dengan `literal` (salinan baru). */
function detach(v: unknown, name: string, literal: unknown): unknown {
  if (isTokenRef(v)) return v.$token === name ? literal : v;
  if (Array.isArray(v)) return v.map((x) => detach(x, name, literal));
  if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, detach(x, name, literal)]));
  return v;
}

/** Hapus token: setiap pemakai di-detach ke nilai mode efektif board-nya (AD-11), lalu token dihapus; satu commit. */
export function deleteTokenOps(doc: ThemeDoc, name: string): Built {
  const def = doc.tokens?.[name];
  if (!def) return { error: `Token ${name} no longer exists.` };
  const ops: DocOp[] = [];
  for (const u of usersOf(doc, name)) {
    const literal = cellOf(def, u.mode, doc.tokenModes).value;
    const patch: Record<string, unknown> = {};
    for (const k of u.props) patch[k] = detach(u.node[k], name, literal);
    ops.push({ op: 'update', id: u.id, patch });
  }
  ops.push({ op: 'setTokens', tokens: { [name]: null } });
  return { ops, label: `Delete token ${name}` };
}

export function addModeOps(doc: ThemeDoc, text: string): Built {
  const mode = modeSlug(text);
  if (!mode) return { error: 'Use letters, numbers, and dashes for the mode name.' };
  const modes = doc.tokenModes ?? [];
  if (modes.includes(mode)) return { error: `Mode ${modeLabel(mode)} already exists.` };
  const next = modes.length ? [...modes, mode] : mode === 'light' ? ['light'] : ['light', mode];
  return { ops: [{ op: 'setTokenModes', modes: next }], label: `Add mode ${mode}` };
}

/** Ganti nama mode: daftar mode, kunci `modes` setiap token, dan `themeMode` board — satu commit. */
export function renameModeOps(doc: ThemeDoc, from: string, text: string): Built {
  const modes = doc.tokenModes ?? [];
  if (!modes.includes(from)) return { error: `Mode ${modeLabel(from)} no longer exists.` };
  const to = modeSlug(text);
  if (!to) return { error: 'Use letters, numbers, and dashes for the mode name.' };
  if (to === from) return { ops: [], label: '' };
  if (modes.includes(to)) return { error: `Mode ${modeLabel(to)} already exists.` };
  const ops: DocOp[] = [{ op: 'setTokenModes', modes: modes.map((m) => (m === from ? to : m)) }];
  const tokens: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(doc.tokens ?? {})) {
    if (!def.modes || !Object.hasOwn(def.modes, from)) continue;
    tokens[name] = { ...def, modes: Object.fromEntries(Object.entries(def.modes).map(([k, v]) => [k === from ? to : k, v])) };
  }
  if (Object.keys(tokens).length) ops.push({ op: 'setTokens', tokens });
  for (const p of doc.pages) {
    for (const b of p.children) if (b.themeMode === from && typeof b.id === 'string') ops.push({ op: 'update', id: b.id, patch: { themeMode: to } });
  }
  return { ops, label: `Rename mode ${from} to ${to}` };
}

/** Mode efektif gabungan board terpilih (`themeMode` ?? mode pertama); undefined = campuran. */
export function readThemeMode(targets: readonly DesignTarget[], modes: readonly string[]): string | undefined {
  const set = new Set(targets.map((t) => (typeof t.stored.themeMode === 'string' ? t.stored.themeMode : modes[0])));
  return set.size === 1 ? [...set][0] : undefined;
}

/** Pilih mode untuk board terpilih: mode pertama = hapus `themeMode` (default), lainnya = nama mode. */
export const themeModeOps = (targets: readonly DesignTarget[], mode: string, modes: readonly string[]): DocOp[] =>
  opsFor(targets, () => ({ themeMode: mode === modes[0] ? null : mode }));

/** Ikon segmen mode: light → sun, dark → moon, lainnya → contrast. */
export const modeIcon = (m: string): ThemeIcon => (m === 'light' ? 'sun' : m === 'dark' ? 'moon' : 'contrast');
