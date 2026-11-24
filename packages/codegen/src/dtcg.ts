// Konversi token Lakar ↔ JSON W3C DTCG (epic adopsi-open-pencil story 9). Murni: tanpa IO, tanpa DOM.
// `dtcgTokensJson` = sisi tulis (dipakai route export dan viewer), `parseDtcgTokens` = sisi baca (adaptor
// `DtcgPort` di @lakar/ports, disuntikkan daemon ke `execute` dan dipakai langsung oleh viewer).
// Pemetaan: color/fontFamily/fontWeight 1:1; radius/spacing/container/breakpoint/fontSize/lineHeight →
// dimension px; letterSpacing → dimension em; tipe Lakar yang tidak 1:1 disimpan di
// `$extensions["com.lakar"].type` agar round-trip lossless. Mode tema → `$extensions.mode`; urutan
// `tokenModes` dokumen disimpan di `$extensions["com.lakar"].tokenModes` akar (file DTCG asing tanpa
// field ini tetap diimpor: urutan mode disusun dari urutan kemunculan).
import {
  LakarError,
  MODE_NAME_PATTERN,
  TOKEN_NAME_PATTERN,
  TOKEN_TYPES,
  isTokenValueOf,
  type LakarDocument,
  type TokenType,
} from '@lakar/schema';
import { parseCssColor } from '@lakar/render';
import type { DtcgEntry, DtcgImport, DtcgParseOptions, DtcgSkip, DtcgTokenValue } from '@lakar/ports';

const TOKEN_NAME_MAX = 64;
const ALIAS_DEPTH = 10;
const REM_PX = 16;
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ALIAS = /^\{([^{}]+)\}$/;
const short = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}...` : s);

/** Tipe Lakar yang dipetakan 1:1 ke `$type` DTCG (tanpa `com.lakar.type`). */
const DIRECT: Partial<Record<TokenType, string>> = { color: 'color', fontFamily: 'fontFamily', fontWeight: 'fontWeight' };

// ---------------------------------------------------------------------------
// Ekspor
// ---------------------------------------------------------------------------

type AnyTokenDef = { readonly type: string; readonly value: unknown; readonly modes?: Readonly<Record<string, unknown>> };

/** Nilai DTCG untuk satu nilai Lakar (dimension berbentuk `{value, unit}`). */
function dtcgValue(type: TokenType, v: unknown): [string, unknown] {
  const direct = DIRECT[type];
  if (direct) return [direct, v];
  return ['dimension', { value: v, unit: type === 'letterSpacing' ? 'em' : 'px' }];
}

function tokenJson(t: AnyTokenDef): Record<string, unknown> {
  const type = t.type as TokenType;
  const [dtcgType, value] = dtcgValue(type, t.value);
  const out: Record<string, unknown> = { $type: dtcgType, $value: value };
  const ext: Record<string, unknown> = {};
  if (t.modes && Object.keys(t.modes).length) {
    ext.mode = Object.fromEntries(Object.entries(t.modes).map(([m, mv]) => [m, dtcgValue(type, mv)[1]]));
  }
  if (!DIRECT[type]) ext['com.lakar'] = { type };
  if (Object.keys(ext).length) out.$extensions = ext;
  return out;
}

/**
 * JSON W3C DTCG dari `doc.tokens`/`doc.tokenModes`. Deterministik: urutan token = urutan tersimpan,
 * indentasi 2, newline akhir. Nama yang menimpa token lain sebagai prefix grup (mis. `a` dan `a.b`
 * sama-sama token) ditulis datar di akar agar impor apa pun tetap membaca path penuh.
 */
export function dtcgTokensJson(doc: Pick<LakarDocument, 'tokens' | 'tokenModes'>): string {
  // Akar+grup ber-prototype-null: segmen bernama `constructor`/`toString` (nama token sah menurut
  // TOKEN_NAME_PATTERN) tidak membaca rantai prototype Object — tanpa ini token hilang dari output
  // dan `??=` akan menulis properti ke objek global.
  const root: Record<string, unknown> = Object.create(null);
  if (doc.tokenModes?.length) root.$extensions = { 'com.lakar': { tokenModes: [...doc.tokenModes] } };
  const tokens = doc.tokens ?? {};
  const names = new Set(Object.keys(tokens));
  for (const [name, t] of Object.entries(tokens)) {
    const segs = name.split('.');
    const flat = segs.slice(1).some((_, i) => names.has(segs.slice(0, i + 1).join('.')));
    if (flat) {
      root[name] = tokenJson(t);
      continue;
    }
    let node = root;
    for (let i = 0; i < segs.length - 1; i++) node = (node[segs[i]!] ??= Object.create(null)) as Record<string, unknown>;
    node[segs[segs.length - 1]!] = tokenJson(t);
  }
  return `${JSON.stringify(root, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Impor
// ---------------------------------------------------------------------------

type RawToken = {
  name: string;
  /** `$type` efektif: milik token sendiri, diwarisi dari grup terdekat bila tidak ditulis. */
  dtcgType: string | undefined;
  /** `$extensions["com.lakar"].type` mentah. */
  extType: unknown;
  /** `$value` mentah. */
  value: unknown;
  /** `$extensions.mode` mentah (kunci sudah divalidasi). */
  modes: Map<string, unknown>;
  /** Posisi traversal di file (agar `skipped` keluar dengan urutan file, bukan urutan fase). */
  ord: number;
};

const WEIGHT_WORDS: Record<string, number> = {
  thin: 100,
  hairline: 100,
  'extra-light': 200,
  extralight: 200,
  'ultra-light': 200,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  medium: 500,
  'semi-bold': 600,
  semibold: 600,
  'demi-bold': 600,
  demibold: 600,
  bold: 700,
  'extra-bold': 800,
  extrabold: 800,
  'ultra-bold': 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

/** Tipe dari segmen nama (petunjuk saat `$type` absen atau generik). Segmen dipisah `.` lalu `-`. */
function nameType(name: string): TokenType | undefined {
  const dot = name.toLowerCase().split('.');
  const flat = dot.flatMap((s) => s.split('-'));
  // Pasangan segmen bersebelahan (mis. 'line-height' di 'line-height-lg'), seperti `pair` di parseCssVariables.
  const pairs = flat.slice(1).map((s, i) => `${flat[i]}-${s}`);
  const has = (...ws: string[]) => flat.some((s) => ws.includes(s)) || dot.some((s) => ws.includes(s)) || pairs.some((s) => ws.includes(s));
  if (has('radius', 'radii', 'rounded', 'corner')) return 'radius';
  if (has('breakpoint', 'breakpoints')) return 'breakpoint';
  if (has('container')) return 'container';
  if (has('leading', 'lineheight', 'line-height')) return 'lineHeight';
  if (has('tracking', 'letterspacing', 'letter-spacing')) return 'letterSpacing';
  if (has('weight')) return 'fontWeight';
  if (has('fontfamily', 'font-family', 'family')) return 'fontFamily';
  if (has('fontsize', 'font-size', 'size', 'type-scale')) return 'fontSize';
  if (has('font')) return 'fontFamily';
  if (has('spacing', 'space', 'gap', 'padding', 'margin', 'inset')) return 'spacing';
  return undefined;
}

const dim = (v: unknown): { n: number; unit: string } | undefined => {
  if (!isObj(v)) return undefined;
  const n = v.value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  return { n, unit: typeof v.unit === 'string' ? v.unit : 'px' };
};

/** Tipe token dari `com.lakar.type`, `$type`, lalu segmen nama. 'unsupported' = `$type` DTCG tak didukung. */
function typeOf(raw: RawToken): TokenType | 'unsupported' | undefined {
  if (typeof raw.extType === 'string' && (TOKEN_TYPES as readonly string[]).includes(raw.extType)) return raw.extType as TokenType;
  const t = raw.dtcgType;
  if (t === undefined) return nameType(raw.name);
  if (t === 'color') return 'color';
  if (t === 'fontFamily') return 'fontFamily';
  if (t === 'fontWeight') return 'fontWeight';
  if (t === 'number') return raw.name.includes('weight') ? 'fontWeight' : 'unsupported';
  if (t === 'dimension') {
    const unit = dim(raw.value)?.unit;
    if (unit === 'em') return 'letterSpacing';
    return nameType(raw.name) ?? 'spacing';
  }
  return 'unsupported';
}

/** Nilai Lakar dari nilai DTCG mentah (bukan alias). Undefined = tidak valid untuk tipenya. */
function convert(type: TokenType, v: unknown): DtcgTokenValue | undefined {
  switch (type) {
    case 'color':
      // Pertahankan nilai yang sudah sah apa adanya (mis. '#RRGGBBAA') agar round-trip lossless;
      // bentuk rgb()/hsl() dinormalkan ke heksadesimal.
      return typeof v === 'string' ? (isTokenValueOf('color', v) ? v : parseCssColor(v)) : undefined;
    case 'fontFamily': {
      if (typeof v === 'string') return v.trim() ? v : undefined;
      if (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string' && (x as string).trim())) {
        return v.map((x) => (x as string).trim()).join(', ');
      }
      return undefined;
    }
    case 'fontWeight': {
      const n =
        typeof v === 'number'
          ? v
          : typeof v === 'string'
            ? (WEIGHT_WORDS[v.trim().toLowerCase()] ?? (/^\d+$/.test(v.trim()) ? Number(v.trim()) : undefined))
            : undefined;
      return n !== undefined && Number.isInteger(n) && n >= 100 && n <= 900 && n % 100 === 0 ? n : undefined;
    }
    case 'letterSpacing': {
      const d = dim(v);
      if (!d) return undefined;
      if (d.unit === 'em') return d.n;
      return d.n === 0 ? 0 : undefined;
    }
    default: {
      // Panjang px: dimension {value, unit:px|rem}; angka polos ditoleransi sebagai px.
      const d = dim(v);
      if (!d) return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
      if (d.unit === 'px') return d.n;
      if (d.unit === 'rem') return round4(d.n * REM_PX);
      return undefined;
    }
  }
}

/**
 * Parse JSON W3C DTCG menjadi token bertipe Lakar. `input` boleh string JSON atau objek hasil parse;
 * input yang bukan objek (atau JSON rusak) → `LakarError` `SCHEMA_INVALID`. Tidak ada yang dibuang
 * diam-diam: entri yang tidak bisa menjadi token muncul di `skipped` dengan alasan stabil.
 */
export function parseDtcgTokens(input: unknown, opts: DtcgParseOptions = {}): DtcgImport {
  let root = input;
  if (typeof input === 'string') {
    try {
      root = JSON.parse(input);
    } catch (e) {
      throw new LakarError('SCHEMA_INVALID', `JSON DTCG tidak valid: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!isObj(root)) throw new LakarError('SCHEMA_INVALID', 'JSON DTCG harus berupa objek berisi grup/token');

  const skipped: DtcgSkip[] = [];
  const skipOrder: number[] = [];
  const seenSkip = new Set<string>();
  const skip = (ord: number, source: string, reason: DtcgSkip['reason'], detail: string) => {
    const key = `${source}\u0000${reason}`;
    if (seenSkip.has(key)) return;
    seenSkip.add(key);
    skipped.push({ source, reason, detail });
    skipOrder.push(ord);
  };

  // Urutan mode yang dideklarasikan ekspor Lakar (round-trip); file asing boleh tidak punya.
  const rootExt = isObj(root.$extensions) ? root.$extensions : {};
  const lakarExt = isObj(rootExt['com.lakar']) ? rootExt['com.lakar'] : {};
  const declared =
    Array.isArray(lakarExt.tokenModes) && lakarExt.tokenModes.length > 0 && lakarExt.tokenModes.every((m) => typeof m === 'string' && MODE_NAME_PATTERN.test(m))
      ? [...new Set(lakarExt.tokenModes as string[])]
      : undefined;

  const raws = new Map<string, RawToken>();
  let seq = 0;
  const walk = (node: Record<string, unknown>, segs: string[], inherited: string | undefined) => {
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith('$')) continue;
      const path = [...segs, k];
      const name = path.join('.');
      const ord = seq++;
      if (!isObj(v)) {
        skip(ord, name, 'unsupported-type', 'Not a token object (no $value).');
        continue;
      }
      if (!Object.hasOwn(v, '$value')) {
        // Objek bertipe tanpa `$value` dan tanpa anak = token cacat, bukan grup; laporkan agar tak hilang diam-diam.
        if (typeof v.$type === 'string' && !Object.keys(v).some((c) => !c.startsWith('$'))) {
          skip(ord, name, 'unsupported-value', 'Token declares $type but has no $value.');
          continue;
        }
        walk(v, path, typeof v.$type === 'string' ? v.$type : inherited);
        continue;
      }
      if (raws.has(name)) {
        skip(ord, name, 'invalid-name', 'Duplicate token path.');
        continue;
      }
      if (name.length > TOKEN_NAME_MAX || !TOKEN_NAME_PATTERN.test(name)) {
        skip(ord, name, 'invalid-name', `Name "${short(name)}" is not a valid token name (lowercase segments joined by ".").`);
        continue;
      }
      const ext = isObj(v.$extensions) ? v.$extensions : {};
      const modeObj = isObj(ext.mode) ? ext.mode : {};
      const modes = new Map<string, unknown>();
      let badMode: string | undefined;
      for (const m of Object.keys(modeObj)) {
        if (!MODE_NAME_PATTERN.test(m)) {
          badMode = m;
          break;
        }
        modes.set(m, modeObj[m]);
      }
      if (badMode !== undefined) {
        skip(ord, name, 'invalid-mode', `Mode name "${short(badMode)}" is not valid (lowercase, digits, hyphens; max 32).`);
        continue;
      }
      const extType = isObj(ext['com.lakar']) ? ext['com.lakar'].type : undefined;
      raws.set(name, { name, dtcgType: typeof v.$type === 'string' ? v.$type : inherited, extType, value: v.$value, modes, ord });
    }
  };
  walk(root, [], typeof root.$type === 'string' ? root.$type : undefined);

  const existing = opts.tokens ?? {};
  const cache = new Map<string, DtcgEntry | null>();

  /** Bangun entry untuk satu raw (memoized; `null` = sudah dicatat di `skipped`). */
  const build = (raw: RawToken, stack: string[]): DtcgEntry | null => {
    const hit = cache.get(raw.name);
    if (hit !== undefined) return hit;

    /** Nilai mentah pada satu mode (mode tak terdefinisi → `$value`). */
    const rawAt = (mode: string | undefined): unknown => (mode !== undefined && raw.modes.has(mode) ? raw.modes.get(mode) : raw.value);

    /** Resolve nilai (bila string alias `{a.b}` → nilai terkonversi target pada mode itu). */
    const valueAt = (
      mode: string | undefined,
    ): { kind: 'value'; v: unknown } | { kind: 'alias'; v: DtcgTokenValue; alias: string; target: string; type: TokenType } | 'unknown' => {
      const src = rawAt(mode);
      const m = typeof src === 'string' ? ALIAS.exec(src.trim()) : null;
      if (!m) return { kind: 'value', v: src };
      const target = m[1]!.trim();
      const tr = raws.get(target);
      if (!tr || stack.length >= ALIAS_DEPTH || stack.includes(raw.name)) return 'unknown';
      const te = build(tr, [...stack, raw.name]);
      if (!te) return 'unknown';
      const v = mode !== undefined && te.modes && Object.hasOwn(te.modes, mode) ? te.modes[mode]! : te.value;
      return { kind: 'alias', v, alias: `{${target}}`, target, type: te.type as TokenType };
    };

    let type = typeOf(raw);
    const main = valueAt(undefined);
    if (main === 'unknown') {
      skip(raw.ord, raw.name, 'unknown-alias', 'Alias points to a token that was not imported (or is circular).');
      cache.set(raw.name, null);
      return null;
    }
    if (type === 'unsupported') {
      skip(raw.ord, raw.name, 'unsupported-type', `Type "${short(String(raw.dtcgType))}" is not supported.`);
      cache.set(raw.name, null);
      return null;
    }
    if (type === undefined) {
      if (main.kind === 'alias') type = main.type;
      else {
        skip(raw.ord, raw.name, 'unsupported-type', 'Token type could not be inferred (no $type, no com.lakar.type).');
        cache.set(raw.name, null);
        return null;
      }
    }

    // Nilai default: alias → nilai target divalidasi pada tipe sendiri; selain itu konversi mentah.
    let value: DtcgTokenValue;
    if (main.kind === 'alias') {
      if (!isTokenValueOf(type, main.v)) {
        skip(raw.ord, raw.name, 'unsupported-value', `Aliased value is not a valid ${type} value.`);
        cache.set(raw.name, null);
        return null;
      }
      value = main.v;
    } else {
      const c = convert(type, main.v);
      if (c === undefined || !isTokenValueOf(type, c)) {
        const shown = typeof main.v === 'string' || typeof main.v === 'number' ? `"${short(String(main.v))}"` : 'This value';
        skip(raw.ord, raw.name, 'unsupported-value', `${shown} is not a valid ${type} value.`);
        cache.set(raw.name, null);
        return null;
      }
      value = c;
    }

    // Nilai per mode: token alias murni mewarisi modes target; modes sendiri menimpa.
    const modes: Record<string, DtcgTokenValue> = {};
    if (main.kind === 'alias') {
      const te = cache.get(main.target);
      if (te?.modes) Object.assign(modes, te.modes);
    }
    for (const mode of raw.modes.keys()) {
      const r = valueAt(mode);
      if (r === 'unknown') {
        skip(raw.ord, raw.name, 'unknown-alias', `Alias for mode "${mode}" points to a token that was not imported.`);
        cache.set(raw.name, null);
        return null;
      }
      const mv = r.kind === 'alias' ? r.v : convert(type, r.v);
      if (mv === undefined || !isTokenValueOf(type, mv)) {
        skip(raw.ord, raw.name, 'unsupported-value', `Value for mode "${mode}" is not a valid ${type} value.`);
        cache.set(raw.name, null);
        return null;
      }
      modes[mode] = mv;
    }

    const entry: DtcgEntry = {
      path: raw.name,
      token: raw.name,
      type,
      value,
      ...(Object.keys(modes).length ? { modes } : {}),
      ...(main.kind === 'alias' ? { alias: main.alias } : {}),
      status: Object.hasOwn(existing, raw.name) ? 'update' : 'new',
    };
    cache.set(raw.name, entry);
    return entry;
  };

  const entries: DtcgEntry[] = [];
  for (const raw of raws.values()) {
    const e = build(raw, []);
    if (e) entries.push(e);
  }

  const found = [...new Set(entries.flatMap((e) => Object.keys(e.modes ?? {})))];
  const docModes = opts.modes;
  // Mode yang diminta file: deklarasi com.lakar bila ada, lalu mode yang dipakai entri (urut kemunculan).
  const wanted = declared ? [...declared, ...found.filter((m) => !declared.includes(m))] : [...found];
  // Rekonsiliasi dengan dokumen: semua mode file sudah ada → null (mode dokumen dipertahankan);
  // selain itu gabung: urutan dokumen dulu lalu mode baru, supaya mode yang ada tidak hilang/terurut ulang.
  const tokenModes = !wanted.length ? null : docModes?.length ? (wanted.every((m) => docModes.includes(m)) ? null : [...docModes, ...wanted.filter((m) => !docModes.includes(m))]) : wanted;

  // `skipped` mengikuti urutan traversal file (bukan urutan fase validasi).
  const sorted = skipOrder
    .map((_o, i) => i)
    .sort((a, b) => skipOrder[a]! - skipOrder[b]!)
    .map((i) => skipped[i]!);
  return { entries, tokenModes, skipped: sorted };
}
