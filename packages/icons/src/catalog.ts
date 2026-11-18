// Katalog ikon kanonik (AD-9): nama kanonik + alias, pencarian deterministik, saran ICON_UNKNOWN, glyph.
// Mengimplementasikan `IconCatalogPort` (@lakar/ports) secara struktural (icons hanya bergantung pada schema).
import { ICON_LIBS, LakarError, type IconGlyph, type IconLib, type IconMatch } from '@lakar/schema';
import { loadLucide, loadSimpleIcons, type LucideData, type SimpleIconsData } from './data.js';

export const SEARCH_DEFAULT_LIMIT = 10;
export const SEARCH_MAX_LIMIT = 50;
/** Jumlah saran nama kanonik di pesan ICON_UNKNOWN. */
export const SUGGESTION_COUNT = 3;
/** Panjang maksimum nama yang dipakai menghitung saran (membatasi kerja jarak edit di host). */
const SUGGEST_MAX_NAME = 64;

export type SearchOptions = { lib?: IconLib; limit?: number };

/** Satu ikon kanonik di indeks pencarian. */
type Entry = {
  lib: IconLib;
  icon: string;
  /** Nama kanonik lalu alias. */
  names: string[];
  /** Tag (huruf kecil). */
  tags: string[];
  title?: string;
  /** Judul huruf kecil (simple-icons): dicocokkan seperti nama. */
  titleKey?: string;
};

const SCORE = { exact: 100, prefix: 80, token: 60, tagExact: 40, tagPartial: 20 } as const;

const tokensOf = (s: string) => s.split(/[\s_-]+/).filter(Boolean);
const normalize = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

/** Jarak edit Damerau (OSA): transposisi bertetangga = 1 (`hoem` → `home`). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array<number>(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[m]![n]!;
}

const libOrder = (lib: IconLib) => ICON_LIBS.indexOf(lib);

export class IconCatalog {
  static #instance: IconCatalog | undefined;

  /** Katalog dari pustaka terpasang; dimuat sekali (singleton malas). */
  static load(): IconCatalog {
    IconCatalog.#instance ??= new IconCatalog(loadLucide(), loadSimpleIcons());
    return IconCatalog.#instance;
  }

  readonly versions: Readonly<Record<IconLib, string>>;
  readonly #lucide: LucideData;
  readonly #simple: SimpleIconsData;
  readonly #entries: Entry[];

  private constructor(lucide: LucideData, simple: SimpleIconsData) {
    this.#lucide = lucide;
    this.#simple = simple;
    this.versions = Object.freeze({ lucide: lucide.version, 'simple-icons': simple.version });
    const aliasesOf = new Map<string, string[]>();
    for (const [alias, target] of lucide.aliases) aliasesOf.set(target, [...(aliasesOf.get(target) ?? []), alias]);
    this.#entries = [
      ...Object.keys(lucide.nodes).map(
        (icon): Entry => ({ lib: 'lucide', icon, names: [icon, ...(aliasesOf.get(icon) ?? [])], tags: (lucide.tags[icon] ?? []).map((t) => t.toLowerCase()) }),
      ),
      ...[...simple.icons.values()].map(
        (s): Entry => ({ lib: 'simple-icons', icon: s.slug, names: [s.slug], tags: s.tags.map((t) => t.toLowerCase()), title: s.title, titleKey: s.title.toLowerCase() }),
      ),
    ];
  }

  /** Jumlah ikon kanonik per pustaka. */
  count(lib: IconLib): number {
    return lib === 'lucide' ? Object.keys(this.#lucide.nodes).length : this.#simple.icons.size;
  }

  /** Alias lucide → nama kanonik (salinan). */
  aliases(): Map<string, string> {
    return new Map(this.#lucide.aliases);
  }

  /** Nama kanonik bila `icon` adalah nama kanonik/alias di `lib`, selain itu undefined. */
  resolve(lib: IconLib, icon: string): string | undefined {
    if (lib === 'lucide') return Object.hasOwn(this.#lucide.nodes, icon) ? icon : this.#lucide.aliases.get(icon);
    return this.#simple.icons.has(icon) ? icon : undefined;
  }

  /**
   * Nama kanonik + versi pustaka terpasang. Alias (mis. lucide `home`) dikonversi ke kanonik (`house`).
   * Tidak dikenal → `ICON_UNKNOWN` dengan tepat 3 saran dari pustaka yang sama; hint menyebut `lib`
   * yang benar bila nama ada di pustaka lain, dan `iconSearch`/`icon_search`.
   */
  canonical(lib: string, icon: string): { icon: string; version: string } {
    const l = this.#lib(lib);
    const hit = this.resolve(l, icon);
    if (hit !== undefined) return { icon: hit, version: this.versions[l] };
    throw this.unknown(l, icon);
  }

  /** LakarError ICON_UNKNOWN untuk `icon` di `lib` (pesan + saran + hint). */
  unknown(lib: IconLib, icon: string): LakarError {
    const suggestions = this.suggest(lib, icon);
    const other = ICON_LIBS.find((o) => o !== lib && this.resolve(o, icon) !== undefined);
    const query = tokensOf(icon.slice(0, SUGGEST_MAX_NAME)).join(' ') || icon.slice(0, SUGGEST_MAX_NAME);
    const hints: string[] = [];
    if (other) hints.push(`${JSON.stringify(icon)} ada di ${other}: pakai {lib:'${other}', icon:'${this.resolve(other, icon)}'}`);
    hints.push(`pakai salah satu saran, atau cari nama kanonik dengan iconSearch('${query}') di snippet (tool MCP: icon_search)`);
    if (lib === 'simple-icons' && !other) hints.push('simple-icons hanya berisi logo brand; ikon UI ada di lucide');
    return new LakarError('ICON_UNKNOWN', `ikon ${JSON.stringify(icon)} tidak ada di ${lib} ${this.versions[lib]}; saran: ${suggestions.join(', ')}`, {
      hint: hints.join('; '),
    });
  }

  /**
   * Tepat 3 nama kanonik berbeda dari `lib` yang mirip `name`: kandidat jarak edit dekat, lalu hasil
   * pencarian token nama, lalu diisi jarak edit terdekat.
   */
  suggest(lib: IconLib, name: string): string[] {
    const out: string[] = [];
    const push = (icon: string) => {
      if (out.length < SUGGESTION_COUNT && !out.includes(icon)) out.push(icon);
    };
    const n = name.slice(0, SUGGEST_MAX_NAME).toLowerCase();
    const ranked = this.#entries
      .filter((e) => e.lib === lib)
      .map((e) => ({ icon: e.icon, d: Math.min(...e.names.map((x) => editDistance(n, x))) }))
      .sort((a, b) => a.d - b.d || a.icon.length - b.icon.length || (a.icon < b.icon ? -1 : a.icon > b.icon ? 1 : 0));
    const close = Math.max(1, Math.floor(n.length / 3));
    for (const r of ranked) if (r.d <= close) push(r.icon);
    const query = tokensOf(n).join(' ');
    if (query) for (const m of this.search(query, { lib, limit: SEARCH_MAX_LIMIT })) push(m.aliasOf ?? m.icon);
    for (const r of ranked) push(r.icon);
    return out;
  }

  /**
   * Cari ikon. Skor: nama persis > awalan nama/alias > token nama > tag persis > tag sebagian.
   * Seri: lucide dulu, nama terpendek, alfabet. Satu hasil per ikon kanonik; bila yang cocok alias,
   * `icon` = alias dan `aliasOf` = nama kanonik (keduanya bisa dipakai). Default 10, maks 50.
   */
  search(query: string, opts: SearchOptions = {}): IconMatch[] {
    const emptyHint = "contoh: iconSearch('dumbbell') atau iconSearch('arrow right', {lib:'lucide'})";
    if (typeof query !== 'string' || !query.trim()) {
      throw new LakarError('SCHEMA_INVALID', 'query pencarian ikon wajib (string tidak kosong)', { hint: emptyHint });
    }
    const lib = opts.lib === undefined ? undefined : this.#lib(opts.lib);
    const limit = opts.limit ?? SEARCH_DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) {
      throw new LakarError('SCHEMA_INVALID', `limit harus bilangan bulat 1–${SEARCH_MAX_LIMIT}, bukan ${JSON.stringify(limit)}`, { hint: `hilangkan limit untuk default ${SEARCH_DEFAULT_LIMIT}` });
    }
    const q = normalize(query);
    const qName = q.replace(/ /g, '-');
    const tokens = tokensOf(q);
    // Hanya pemisah ('-', '_', spasi) → tanpa token: tolak (jika tidak, setiap ikon cocok secara hampa).
    if (!tokens.length) throw new LakarError('SCHEMA_INVALID', `query pencarian ikon hanya berisi pemisah: ${JSON.stringify(query)}`, { hint: emptyHint });
    const hits: { m: IconMatch; score: number }[] = [];
    for (const e of this.#entries) {
      if (lib && e.lib !== lib) continue;
      let score = 0;
      let via: string | undefined;
      const consider = (s: number, name?: string) => {
        if (s > score) {
          score = s;
          via = name;
        }
      };
      for (const name of e.names) {
        if (name === q || name === qName) consider(SCORE.exact, name);
        else if (name.startsWith(q) || name.startsWith(qName)) consider(SCORE.prefix, name);
        else {
          const nt = tokensOf(name);
          if (tokens.every((t) => nt.includes(t))) consider(SCORE.token, name);
        }
      }
      if (e.titleKey !== undefined) {
        if (e.titleKey === q) consider(SCORE.exact);
        else if (e.titleKey.startsWith(q)) consider(SCORE.prefix);
        else if (tokens.every((t) => tokensOf(e.titleKey!).includes(t))) consider(SCORE.token);
      }
      if (score < SCORE.tagExact && e.tags.includes(q)) consider(SCORE.tagExact);
      if (score < SCORE.tagPartial && e.tags.some((t) => t.includes(q) || (tokens.length > 1 && tokens.every((x) => tokensOf(t).includes(x))))) {
        consider(SCORE.tagPartial);
      }
      if (!score) continue;
      const m: IconMatch = { lib: e.lib, icon: e.icon };
      if (via !== undefined && via !== e.icon) {
        m.icon = via;
        m.aliasOf = e.icon;
      }
      if (e.title !== undefined) m.title = e.title;
      if (e.tags.length) m.tags = e.tags.slice(0, 8);
      hits.push({ m, score });
    }
    hits.sort(
      (a, b) =>
        b.score - a.score ||
        libOrder(a.m.lib) - libOrder(b.m.lib) ||
        a.m.icon.length - b.m.icon.length ||
        (a.m.icon < b.m.icon ? -1 : a.m.icon > b.m.icon ? 1 : 0),
    );
    return hits.slice(0, limit).map((h) => h.m);
  }

  /**
   * Data gambar ikon (`icon` kanonik atau alias); `glyph.icon` = nama yang diminta supaya cocok dengan
   * kunci node. Tidak dikenal → undefined.
   */
  glyph(lib: string, icon: string): IconGlyph | undefined {
    if (!(ICON_LIBS as readonly string[]).includes(lib)) return undefined;
    const l = lib as IconLib;
    const canon = this.resolve(l, icon);
    if (canon === undefined) return undefined;
    if (l === 'lucide') {
      return { lib: l, icon, viewBox: [0, 0, 24, 24], kind: 'stroke', nodes: this.#lucide.nodes[canon]! };
    }
    const s = this.#simple.icons.get(canon)!;
    return { lib: l, icon, viewBox: [0, 0, 24, 24], kind: 'fill', nodes: [['path', { d: this.#simple.path(canon)! }]], brandColor: `#${s.hex}` };
  }

  /** Glyph untuk daftar ref (yang tidak dikenal dilewati). */
  glyphs(refs: readonly { lib: string; icon: string }[]): IconGlyph[] {
    return refs.flatMap((r) => this.glyph(r.lib, r.icon) ?? []);
  }

  #lib(lib: unknown): IconLib {
    if (typeof lib === 'string' && (ICON_LIBS as readonly string[]).includes(lib)) return lib as IconLib;
    throw new LakarError('SCHEMA_INVALID', `lib ikon tidak dikenal: ${JSON.stringify(lib)}`, {
      hint: `lib salah satu: ${ICON_LIBS.join(', ')} (lucide = ikon UI, simple-icons = logo brand)`,
    });
  }
}
