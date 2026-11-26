// Permukaan API snippet `execute` (AD-7) — didefinisikan SEKALI di sini: tipe publik ber-JSDoc
// (`LakarApi`) dan tabel runtime `API` (signature, doc, contoh yang dites, implementasi host).
// Tanpa IO. Semua op baca bekerja di salinan kerja transaksi dan mengembalikan salinan.
import { isPlainObject, type Transaction } from '@lakar/core';
import type { CssVariableSkip, CssVariablesPort, DtcgPort, DtcgSkip, IconCatalogMatch, IconCatalogPort, PhotoInfo, PhotoLibraryPort } from '@lakar/ports';
import {
  ICON_SEARCH_DEFAULT_LIMIT,
  ICON_SEARCH_MAX_LIMIT,
  ID_PATTERN,
  LakarError,
  NODE_ADDRESS_PATTERN,
  NODE_TYPES,
  expandedNodeAt,
  type AnyNode,
  type ErrorCode,
  type LakarDocument as Doc,
  type NodeInput,
  type NodeType,
} from '@lakar/schema';

// ---------------------------------------------------------------------------
// Batas
// ---------------------------------------------------------------------------

/** Maksimum op mutasi sukses per snippet; lebih dari ini → EXEC_ERROR + rollback. */
export const MAX_OPS = 5000;
/** Batas waktu default satu snippet (ms). */
export const DEFAULT_TIMEOUT_MS = 2000;
/** Ukuran maksimum `keep` (JSON, UTF-8). */
export const KEEP_MAX_BYTES = 64 * 1024;
/** Ukuran maksimum `value` (JSON, UTF-8) sebelum dipotong. */
export const VALUE_MAX_BYTES = 32 * 1024;
/** Batas log `console.log` per snippet. */
export const LOG_MAX_LINES = 100;
export const LOG_MAX_BYTES = 16 * 1024;
/** Jarak default antar-board untuk `place`. */
export const DEFAULT_PLACE_GAP = 80;

// ---------------------------------------------------------------------------
// Tipe publik
// ---------------------------------------------------------------------------

/**
 * Pandangan datar sebuah node (salinan): semua properti tersimpan apa adanya (ref token `{$token}` tidak
 * di-resolve) + field turunan hanya-baca `parentId`, `path`, dan `childIds` (khusus board/frame).
 * Tidak memuat `children`. Jangan kirim balik view utuh ke `update`/`replace`/`add`.
 */
export type NodeView = {
  id: string;
  type: NodeType;
  name: string;
  /** ID parent; `null` untuk board (anak halaman). */
  parentId: string | null;
  /** Daftar nama dari board ke node ini, mis. `['Home', 'Hero', 'Judul']`. */
  path: string[];
  /** ID anak langsung (urutan dokumen); hanya pada board/frame. */
  childIds?: string[];
  /** Board `height:'hug'`: tinggi terukur render terakhir sebelum snippet (belum terukur → tidak ada). */
  measuredHeight?: number;
  [prop: string]: unknown;
};

/** Kueri `find`. Semua kunci opsional; tanpa kunci = semua node. */
export type FindQuery = {
  type?: NodeType;
  /** String = nama sama persis; RegExp = nama cocok (dijalankan di sandbox). */
  name?: string | RegExp;
  /** ID board/frame: hanya keturunan node ini. */
  within?: string;
};

/** Opsi `place`. */
export type PlaceOptions = {
  /** ID board acuan: posisi dicari di kanan board itu, lalu di bawahnya. */
  near?: string;
  /** Jarak minimum antar-board (default 80). */
  gap?: number;
};

export type Point = { x: number; y: number };

/** Opsi `arrange`: satu mode per panggilan. */
export type ArrangeOptions =
  | { mode: 'align'; align: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' }
  | { mode: 'spread'; axis: 'x' | 'y'; gap?: number }
  | { mode: 'grid'; cols: number; gap?: number };

/** Opsi `analyze`. */
export type AnalyzeOptions = {
  /** ID node: audit hanya subtree-nya (termasuk dirinya). Tanpa scope = seluruh dokumen. */
  scope?: string;
  /** Maks entri per kategori (default 10). */
  limit?: number;
  /** Minimum anggota kelompok struktur berulang yang dilaporkan (default 3). */
  minCluster?: number;
};

/** Frekuensi satu nilai: angka untuk px, string hex untuk warna, `"$token <nama>"` untuk referensi token. */
export type AnalyzeFreq = { value: number | string; count: number };
/** Hasil `analyze`. */
export type AnalyzeReport = {
  /** Jumlah node yang diaudit (scope termasuk). */
  nodes: number;
  /** Warna pada fills/strokes/shadows/color teks/icon, urut frekuensi. `tokenColors`+`literalColors` = total pemakaian. */
  colors: AnalyzeFreq[];
  literalColors: number;
  tokenColors: number;
  /** Kombinasi family/weight/size pada node teks. */
  typography: { family: number | string; weight: number | string; size: number | string; count: number }[];
  /** Nilai `gap`/`columnGap`/`rowGap` dan komponen `padding` pada wadah. */
  spacing: { gaps: AnalyzeFreq[]; paddings: AnalyzeFreq[] };
  /** Subtree bentuk sama yang muncul ≥ `minCluster` kali (kandidat komponen). `shape` = tipe node + tipe anak rekursif. */
  clusters: { shape: string; count: number; ids: string[] }[];
};

/** Opsi `iconSearch`. */
export type IconSearchOptions = {
  /** Batasi ke satu pustaka: `lucide` (ikon UI) atau `simple-icons` (logo brand). */
  lib?: 'lucide' | 'simple-icons';
  /** Jumlah hasil (default 10, maks 50). */
  limit?: number;
};

/** Satu hasil `iconSearch`. `aliasOf` ada bila `icon` adalah alias (nilai = nama kanonik). */
export type IconSearchMatch = IconCatalogMatch<'lucide' | 'simple-icons'>;

/** Properti node untuk `add`/`replace` (katalog v1 tertutup), tanpa `id`/`children`. */
export type NodeProps = NodeInput;
/** Patch dangkal untuk `update`/`duplicate`; `null` menghapus properti opsional. */
export type NodePatch = Record<string, unknown>;

/** Tipe token (AD-11). */
export type TokenTypeName = 'color' | 'radius' | 'spacing' | 'container' | 'breakpoint' | 'fontFamily' | 'fontWeight' | 'fontSize' | 'lineHeight' | 'letterSpacing';
/** Token bertipe; `modes` = nilai per mode tema (kunci dari `setTokenModes`). */
export type TokenDefinition = { type: TokenTypeName; value: string | number; modes?: Record<string, string | number> };
/** Hasil `getTokens`: salinan token dokumen + `tokenModes` (`[]` bila tidak ada). */
export type TokensView = { tokens: Record<string, TokenDefinition>; modes: string[] };
/** Hasil `importCssVariables`. */
export type CssImportResult = {
  tokens: { variable: string; token: string; type: TokenTypeName; status: 'new' | 'update' }[];
  /** `tokenModes` dokumen sesudah impor. */
  modes: string[];
  skipped: CssVariableSkip[];
};
/** Hasil `importDtcgTokens`. `path` = path DTCG (= `token`); `alias` = target mentah `{a.b}` bila `$value` referensi. */
export type DtcgImportResult = {
  tokens: { path: string; token: string; type: TokenTypeName; status: 'new' | 'update'; alias?: string }[];
  /** `tokenModes` dokumen sesudah impor. */
  modes: string[];
  skipped: DtcgSkip[];
};

/** Fungsi global yang tersedia di snippet `execute`. */
export interface LakarApi {
  /**
   * Tambah node ke board/frame `parentId` (null = halaman, khusus board). Mengembalikan ID baru 8 karakter.
   *
   * Node `icon` ({type:'icon', lib:'lucide'|'simple-icons', icon, size, color?, strokeWidth?, filled?}): `icon` = nama
   * ikon kanonik pustaka (alias dikonversi otomatis, mis. lucide `home` → `house`); `name` = nama layer (default
   * `Icon / <lib> / <icon>`); `version` diisi otomatis dengan versi pustaka terpasang (jangan dikirim). Nama tidak
   * dikenal → ICON_UNKNOWN + 3 saran (cari dengan `iconSearch`).
   * Gambar lucide: stroke = `color` (default #000000), `strokeWidth` dalam unit grid 24 (default 2), ujung/sambungan
   * bulat, `filled: true` mengisi bentuk dengan `color`. Simple-icons (khusus logo brand): fill = `color` (default
   * warna brand), `strokeWidth`/`filled` diabaikan. Kotak node = `size`×`size`.
   */
  add(parentId: string | null, node: NodeProps): string;
  /** Merge dangkal properti; `null` menghapus properti opsional. `type`/`id`/`children` tidak bisa diubah. */
  update(id: string, patch: NodePatch): void;
  /** Ganti semua properti (boleh ganti tipe); ID, posisi, dan anak (bila tipe baru frame/board) tetap. */
  replace(id: string, node: NodeProps): void;
  /** Pindah node ke board/frame `parentId` pada `index` (default akhir); `null` = urutan board di halaman. */
  move(id: string, parentId: string | null, index?: number): void;
  /** Salin node + subtree dengan ID baru tepat setelah asal; `patch` di-merge ke akar salinan. Mengembalikan ID akar baru. */
  duplicate(id: string, patch?: NodePatch): string;
  /** Hapus node beserta subtree-nya. Master yang terhapus men-detach semua instancenya di commit yang sama. */
  remove(id: string): void;
  /**
   * Ratakan posisi node (koordinat absolut dokumen): `align` tepi/tengah kotak kelompok, `spread` jarak antar
   * merata pada satu sumbu (gap tetap atau dibagi rata), `grid` susun ulang dalam baris×kolom. Node harus
   * berposisi absolut (`position:'absolute'` dengan x/y) atau board — anak layout auto tidak punya x/y.
   */
  arrange(ids: string[], opts: ArrangeOptions): { moved: number };
  /**
   * Jadikan node master komponen (`{props, slots}`; tanpa argumen = `{props:[], slots:[]}` bila belum master) atau
   * lepas status master (`null`, instancenya di-detach). Instance: `add(parent, {type:'instance', name, componentId})`.
   */
  setComponent(id: string, component?: Record<string, unknown> | null): void;
  /** Hapus override pada `address` (ID instance = akar, atau `<instanceId>/<idNodeMaster>`); `props` = hanya properti itu. */
  resetOverride(address: string, props?: string[]): void;
  /** Ganti instance dengan node biasa ber-ID baru (props/override/slot diterapkan). `null` bila instance tersembunyi (dihapus). */
  detach(id: string): string | null;
  /**
   * Merge token ke dokumen; `null` menghapus token. Nilai datar: token ada → ganti `value` (tipe/mode tetap),
   * token baru → tipe diinferensi dari slot yang merujuknya. Objek `{type, value, modes?}` menggantikan token.
   */
  setTokens(map: Record<string, string | number | TokenDefinition | null>): void;
  /** Daftar mode tema dokumen (elemen pertama = default); `null` menghapus. Board memilih mode lewat `themeMode`. */
  setTokenModes(modes: string[] | null): void;
  /** Ganti seluruh daftar flow prototipe (`{id, name, startBoardId}`; daftar utuh, bukan patch); `null` menghapus `flows`. */
  setFlows(flows: { id: string; name: string; startBoardId: string }[] | null): void;
  /** Ganti nama token beserta semua ref `{$token}` di dokumen (satu commit). */
  renameToken(from: string, to: string): void;
  /**
   * Buat token bertipe dari stylesheet CSS variables (`:root` = nilai default, `[data-theme="dark"]` = mode `dark`);
   * mode baru didaftarkan, token bernama sama diperbarui (mode yang tidak disebut CSS tetap). Variabel yang tak terpetakan dilaporkan di `skipped`.
   */
  importCssVariables(css: string): CssImportResult;
  /**
   * Buat token bertipe dari JSON W3C DTCG (nested group → nama dipisah `.`; `$extensions.mode` = mode tema;
   * `$extensions["com.lakar"].type` = tipe Lakar asli; alias `{a.b}` di-resolve ke nilai target). Mode baru
   * didaftarkan, token bernama sama diperbarui; entri yang tak didukung dilaporkan di `skipped`.
   */
  importDtcgTokens(json: string): DtcgImportResult;
  /** Baca satu node (salinan datar). */
  get(id: string): NodeView;
  /** Cari node dalam urutan dokumen. */
  find(query?: FindQuery): NodeView[];
  /** Anak langsung node (`null` = board di halaman). */
  children(id: string | null): NodeView[];
  /** Token dokumen (bentuk tersimpan) dan daftar mode tema (`[]` bila tanpa mode). */
  getTokens(): TokensView;
  /**
   * Audit konsistensi desain dalam `scope` (id board/halaman/frame; tanpa argumen = seluruh dokumen): frekuensi
   * warna (literal vs `$token`), tipografi (family/weight/size), jarak (gap/padding), dan struktur berulang yang
   * layak dijadikan komponen. Jalankan sebelum melapor selesai — output rapi biasanya sedikit nilai berbeda.
   */
  analyze(opts?: AnalyzeOptions): AnalyzeReport;
  /** Posisi bebas tumpang tindih untuk board baru berukuran `w`×`h`. */
  place(w: number, h: number | 'hug', opts?: PlaceOptions): Point;
  /**
   * Cari ikon di katalog terpasang (lucide = ikon UI, simple-icons = logo brand). Urut relevansi: nama persis >
   * awalan nama/alias > token nama > tag persis > tag sebagian. Pakai `lib` + `icon` hasilnya di node icon.
   */
  iconSearch(query: string, opts?: IconSearchOptions): IconSearchMatch[];
  /**
   * Foto stok terimpor untuk ref `photo_search` (mis. `'unsplash:Kq3wLm8xT0a'` atau `'wikimedia:12345678'`). Ref harus ditulis literal di kode
   * (`photo('unsplash:Kq3wLm8xT0a')`): daemon mengimpornya sebelum snippet berjalan. Pakai `assetId` di fill
   * `{type:'image', assetId, fit:'cover'}`; `credit` = baris kredit siap pakai.
   */
  photo(ref: string): PhotoInfo;
}

/** Konteks host untuk satu snippet. */
export type ApiContext = {
  tx: Transaction;
  /** Salinan kerja hidup transaksi (hanya-baca). */
  view(): Readonly<Doc>;
  /** Dipanggil setelah setiap op mutasi sukses; melempar bila melewati `MAX_OPS`. */
  countOp(): void;
  /** Katalog ikon (kanonikalisasi node icon, `iconSearch`). */
  icons: IconCatalogPort;
  /** Foto terimpor (`photo`); tidak ada → setiap `photo()` NOT_FOUND. */
  photos?: PhotoLibraryPort;
  /** Parser CSS variables (`importCssVariables`), disuntikkan daemon dari @lakar/render; tidak ada → EXEC_ERROR. */
  cssVariables?: CssVariablesPort;
  /** Parser JSON W3C DTCG (`importDtcgTokens`), disuntikkan daemon dari @lakar/codegen; tidak ada → EXEC_ERROR. */
  dtcg?: DtcgPort;
  /**
   * Tinggi terukur board `height:'hug'` (render terakhir sebelum snippet; spec-board-hug-height). Dipakai `place` dan
   * `measuredHeight` di view board. Tanpa entri (mis. board baru di snippet ini) = belum terukur.
   */
  boardHeights?: ReadonlyMap<string, number>;
  /**
   * ID halaman aktif sesi (story 9.2): target `add(null,…)`, `children(null)`, dan `place()`. Tidak ada (sesi belum
   * pernah switch_page, pemanggil non-sesi) → halaman pertama, perilaku lama.
   */
  activePageId?: string;
};

/** Ukuran maksimum stylesheet `importCssVariables` (karakter). */
export const CSS_IMPORT_MAX_CHARS = 256 * 1024;
/** Ukuran maksimum JSON `importDtcgTokens` (karakter). */
export const DTCG_IMPORT_MAX_CHARS = 256 * 1024;

/** Format ref foto (`photo_search`): `unsplash:<id>`, `wikimedia:<pageid>`, `openverse:<uuid>`, atau `pexels:<id>` (lama). */
export const PHOTO_REF_PATTERN = /^(?:unsplash:[A-Za-z0-9_-]{6,32}|(?:pexels|openverse):[A-Za-z0-9-]{1,64}|wikimedia:\d{1,12})$/;
const PHOTO_REF_LITERAL = /photo\(\s*(['"])((?:unsplash|pexels|wikimedia|openverse):[A-Za-z0-9_-]{1,64})\1/g;

/**
 * Ref foto literal di kode snippet (`photo('unsplash:<id>')` / `photo('wikimedia:123')` / `photo("openverse:<uuid>")`), unik, urutan muncul.
 * Daemon mengimpornya sebelum snippet berjalan (snippet sinkron, tanpa jaringan).
 */
export function photoRefsInCode(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(PHOTO_REF_LITERAL)) out.add(m[2]!);
  return [...out];
}

export type ApiFunction = {
  kind: 'op' | 'read';
  /** Tanda tangan untuk dokumentasi (`api.md` dihasilkan dari sini oleh `scripts/gen-skill-api.mjs`). */
  signature: string;
  doc: string;
  returns: string;
  errors: readonly ErrorCode[];
  /** Snippet mandiri yang sukses di dokumen kosong (dites). */
  example: string;
  /** Implementasi host; argumen sudah berupa nilai JSON hasil dump dari QuickJS. */
  call(ctx: ApiContext, args: unknown[]): unknown;
};

export type ApiGlobal = { signature: string; doc: string };

/** Global non-fungsi API yang tersedia di snippet. */
export const API_GLOBALS: Readonly<Record<'keep' | 'console', ApiGlobal>> = {
  keep: {
    signature: 'keep: Record<string, any>',
    doc:
      'Objek JSON per sesi yang bertahan antar-execute (mis. keep.hero = add(...); lalu get(keep.hero) di panggilan berikutnya). ' +
      `Disimpan hanya bila execute sukses; maks ${KEEP_MAX_BYTES / 1024} KB.`,
  },
  console: {
    signature: 'console.log(...args): void',
    doc: `Tulis ke data.logs (string apa adanya, nilai lain sebagai JSON); maks ${LOG_MAX_LINES} baris / ${LOG_MAX_BYTES / 1024} KB.`,
  },
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const show = (v: unknown): string => (Array.isArray(v) ? 'array' : (JSON.stringify(v) ?? String(v)));

const ADDRESS_HINT = 'pakai ID 8 karakter dari add()/duplicate(), get()/find()/children(), created[].id, atau keep';

function requireId(fn: string, what: string, v: unknown): string {
  if (typeof v !== 'string' || !ID_PATTERN.test(v)) {
    throw new LakarError('SCHEMA_INVALID', `${fn}: ${what} harus ID 8 karakter [A-Za-z0-9], bukan ${show(v)}`, { hint: ADDRESS_HINT });
  }
  return v;
}

const VIEW_KEYS = ['parentId', 'path', 'childIds', 'measuredHeight'] as const;

/** Tolak field turunan NodeView (dan `children` bersarang) di argumen node/patch. */
function rejectDerivedKeys(fn: string, obj: unknown): void {
  if (!isPlainObject(obj)) return;
  const hit = VIEW_KEYS.filter((k) => Object.hasOwn(obj, k));
  if (hit.length) {
    throw new LakarError('SCHEMA_INVALID', `${fn}: ${hit.join('/')} hanya-baca (field turunan get/find/children), tidak bisa dikirim balik`, {
      hint: `parentId/path/childIds/measuredHeight hanya-baca; ambil properti yang perlu saja, mis. update(id, {gap: get(x).gap, fills: get(x).fills}); pindah parent → move(id, parentId)`,
    });
  }
  if (fn === 'add' && Object.hasOwn(obj, 'children')) {
    throw new LakarError('SCHEMA_INVALID', 'add: children bersarang tidak didukung', {
      hint: "tambahkan anak satu per satu: const f = add(b, {type:'frame', name:'Kartu'}); add(f, {type:'text', name:'Judul', content:'Halo', size:16})",
    });
  }
}

// ---------------------------------------------------------------------------
// Ikon (AD-9): kanonikalisasi sebelum op core
// ---------------------------------------------------------------------------

const ICON_KEYS = ['icon', 'lib', 'version'] as const;

/** `lib` yang dikenal katalog, atau undefined (dibiarkan sampai validasi core → SCHEMA_INVALID). */
const knownLib = (ctx: ApiContext, lib: unknown): string | undefined =>
  typeof lib === 'string' && Object.hasOwn(ctx.icons.versions, lib) ? lib : undefined;

/**
 * Kanonikkan `icon` + stempel `version` untuk lib/icon gabungan. Versi asing → SCHEMA_INVALID; nama tidak
 * dikenal → ICON_UNKNOWN (dari katalog). Mengembalikan undefined bila input dibiarkan untuk validasi core.
 */
function canonicalIcon(ctx: ApiContext, fn: string, lib: unknown, icon: unknown, version: unknown): { icon: string; version: string } | undefined {
  const l = knownLib(ctx, lib);
  if (l === undefined || typeof icon !== 'string') return undefined;
  const installed = ctx.icons.versions[l]!;
  if (version !== undefined && version !== null && version !== installed) {
    throw new LakarError('SCHEMA_INVALID', `${fn}: version ikon ${show(version)} bukan versi ${l} terpasang (${installed})`, {
      hint: 'hapus version dari node icon; diisi otomatis dengan versi pustaka terpasang',
    });
  }
  return ctx.icons.canonical(l, icon);
}

/** add/replace: node icon → `icon` kanonik, `version` terpasang, `name` default `Icon / <lib> / <icon>`. */
function iconNode(ctx: ApiContext, fn: string, node: unknown): unknown {
  if (!isPlainObject(node) || node.type !== 'icon') return node;
  const c = canonicalIcon(ctx, fn, node.lib, node.icon, node.version);
  if (!c) return node;
  return { ...node, icon: c.icon, version: c.version, ...(node.name === undefined ? { name: `Icon / ${node.lib as string} / ${c.icon}` } : {}) };
}

/** update/duplicate: patch yang menyentuh icon/lib/version pada node icon → lib/icon digabung dari node lama. */
function iconPatch(ctx: ApiContext, fn: string, id: unknown, patch: unknown): unknown {
  if (!isPlainObject(patch) || !ICON_KEYS.some((k) => Object.hasOwn(patch, k))) return patch;
  if (typeof id !== 'string' || !NODE_ADDRESS_PATTERN.test(id)) return patch;
  // Alamat komposit: node efektif isi instance (patch menjadi override, AD-12).
  const node = id.includes('/') ? expandedNodeAt(ctx.view() as Doc, id)?.node : walk(ctx.view()).find((e) => e.node.id === id)?.node;
  if (!node || node.type !== 'icon') return patch;
  const old = node as { lib: string; icon: string };
  const lib = Object.hasOwn(patch, 'lib') ? patch.lib : old.lib;
  const icon = Object.hasOwn(patch, 'icon') ? patch.icon : old.icon;
  const c = canonicalIcon(ctx, fn, lib, icon, patch.version);
  return c ? { ...patch, icon: c.icon, version: c.version } : patch;
}

const ICON_SEARCH_KEYS = ['lib', 'limit'];
const ICON_SEARCH_HINT = "contoh: iconSearch('dumbbell') atau iconSearch('arrow right', {lib:'lucide', limit:5})";

type Entry = { node: AnyNode; parentId: string | null; path: string[] };

/** Halaman aktif sesi untuk target `add(null)`/`children(null)`/`place`; fallback halaman pertama. */
const activePageOf = (ctx: ApiContext, doc: Readonly<Doc>) => doc.pages.find((p) => p.id === ctx.activePageId) ?? doc.pages[0]!;

/** Semua node tersimpan dalam urutan dokumen (pre-order: halaman → board → anak; isi slot instance ber-parent instance). */
function walk(doc: Readonly<Doc>): Entry[] {
  const out: Entry[] = [];
  const visit = (n: AnyNode, parentId: string | null, prefix: string[]) => {
    const path = [...prefix, n.name];
    out.push({ node: n, parentId, path });
    if ('children' in n) for (const c of n.children) visit(c, n.id, path);
    if (n.type === 'instance') for (const list of Object.values(n.slots ?? {})) for (const c of list) visit(c, n.id, path);
  };
  for (const p of doc.pages) for (const b of p.children) visit(b, null, []);
  return out;
}

/** NodeView salinan (JSON) dari entri; board `height:'hug'` yang sudah terukur mendapat `measuredHeight`. */
function toView(e: Entry, heights?: ReadonlyMap<string, number>): NodeView {
  const { children, ...props } = e.node as AnyNode & { children?: AnyNode[] };
  const view: Record<string, unknown> = { ...props, parentId: e.parentId, path: e.path };
  if (children) view.childIds = children.map((c) => c.id);
  const measured = e.node.type === 'board' && e.node.height === 'hug' ? heights?.get(e.node.id) : undefined;
  if (measured !== undefined) view.measuredHeight = measured;
  return JSON.parse(JSON.stringify(view)) as NodeView;
}

function mustFind(fn: string, doc: Readonly<Doc>, id: string, what = 'node'): Entry {
  const hit = walk(doc).find((e) => e.node.id === id);
  if (!hit) {
    throw new LakarError('NOT_FOUND', `${fn}: ${what} ${id} tidak ada`, {
      hint: 'ID mungkin sudah di-remove atau berasal dari dokumen lain; cari ulang dengan find({name}) atau children(null)',
    });
  }
  return hit;
}

/** Bungkus op mutasi: validasi wrapper → op core → hitung op sukses. */
function mutation<T>(ctx: ApiContext, fn: () => T): T {
  const r = fn();
  ctx.countOp();
  return r;
}

const FIND_KEYS = ['type', 'name', 'within'];
const PLACE_KEYS = ['near', 'gap'];
const ARRANGE_ALIGNS = ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as const;
const ARRANGE_HINT = "contoh: arrange([id1,id2], {mode:'align', align:'left'}); {mode:'spread', axis:'x', gap?:24}; {mode:'grid', cols:3, gap?:24}";
/** Gap default `arrange` mode grid (px). */
const DEFAULT_ARRANGE_GAP = 24;
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Nilai numerik properti node (x/y/width/height); non-numerik (hug/fill/token ref) → 0. */
const num = (v: unknown): number => (isFiniteNum(v) ? v : 0);
const ANALYZE_KEYS = ['scope', 'limit', 'minCluster'];
/** Referensi token `{$token:"nama"}` — objek dengan tepat satu kunci string. */
const isTokenRef = (v: unknown): v is { $token: string } =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 1 && typeof (v as { $token?: unknown }).$token === 'string';

type Rect = { x: number; y: number; w: number; h: number };
/** Kotak board; `height:'hug'` = tinggi terukur (`heights`), belum terukur = 0. */
const boardRect = (n: AnyNode, heights?: ReadonlyMap<string, number>): Rect => {
  const b = n as { id: string; x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { x: num(b.x), y: num(b.y), w: num(b.width), h: b.height === 'hug' ? (heights?.get(b.id) ?? 0) : num(b.height) };
};
/** Dua kotak terlalu dekat (jarak < gap di kedua sumbu) = tumpang tindih. */
const clash = (a: Rect, b: Rect, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

const CSS_IMPORT_HINT = "contoh: importCssVariables(':root { --colors-bg: #ffffff; } [data-theme=\"dark\"] { --colors-bg: #0f0f0f; }'); hanya custom property (--nama) di :root/html dan [data-theme=\"…\"]";
const DTCG_IMPORT_HINT = 'contoh: importDtcgTokens(\'{"colors":{"bg":{"$type":"color","$value":"#FFFFFF","$extensions":{"mode":{"dark":"#0B0C0F"}}}}}\'); nama token = path grup digabung ".", mode di $extensions.mode, alias "{a.b}" menunjuk token lain di file yang sama';

const BOARD = "const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});";

// ---------------------------------------------------------------------------
// Tabel API
// ---------------------------------------------------------------------------

export const API: { readonly [K in keyof LakarApi]: ApiFunction } = {
  add: {
    kind: 'op',
    signature: "add(parentId: string | null, node: {type: 'board'|'frame'|'text'|'rect'|'ellipse'|'path'|'icon'|'instance', name, ...}): string",
    doc:
      'Tambah node ke board/frame parentId (null = halaman aktif sesi — default halaman pertama; khusus board). Katalog tertutup: board, frame, text, rect, ellipse, path, icon, instance (bagian Komponen). ' +
      "parentId '<instanceId>/<idFrameSlot>' mengisi slot instance. " +
      'Anak ditambahkan satu per satu (tanpa children bersarang). Mengembalikan ID 8 karakter secara sinkron. ' +
      "Icon: {type:'icon', lib:'lucide'|'simple-icons', icon:<nama kanonik>, size, color?, strokeWidth?, filled?}; alias dikonversi ke nama kanonik " +
      "(lucide 'home' → 'house'), name default 'Icon / <lib> / <icon>', version diisi otomatis (jangan dikirim); nama tidak dikenal → ICON_UNKNOWN + 3 saran (cari dengan iconSearch).",
    returns: 'ID node baru (string 8 karakter)',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND', 'ICON_UNKNOWN'],
    example: `${BOARD}\nadd(b, {type:'text', name:'Judul', content:'Halo', size:32});\nadd(b, {type:'icon', lib:'lucide', icon:'home', size:24, color:'#1A1A1A'});`,
    call(ctx, [parentId, node]) {
      rejectDerivedKeys('add', node);
      const n = iconNode(ctx, 'add', node);
      // parentId null untuk board → halaman aktif sesi (transaction.ts menerima pageId sebagai parent board).
      const pid = parentId === null ? (ctx.activePageId ?? null) : parentId;
      return mutation(ctx, () => ctx.tx.add(pid as string | null, n));
    },
  },
  update: {
    kind: 'op',
    signature: 'update(id: string, patch: {...}): void',
    doc:
      'Merge dangkal properti ke node; null menghapus properti opsional. type/id/children tidak bisa diubah (ganti tipe → replace). ' +
      "id '<instanceId>/<idNodeMaster>' (isi instance) atau properti node pada instance (mis. fills) menjadi override instance itu; master tetap.",
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND', 'ICON_UNKNOWN'],
    example: `${BOARD}\nconst t = add(b, {type:'text', name:'Judul', content:'Halo', size:32});\nupdate(t, {size: 40, color: '#1A1A1A'});`,
    call(ctx, [id, patch]) {
      rejectDerivedKeys('update', patch);
      const p = iconPatch(ctx, 'update', id, patch);
      mutation(ctx, () => ctx.tx.update(id as string, p));
      return undefined;
    },
  },
  replace: {
    kind: 'op',
    signature: "replace(id: string, node: {type, name, ...}): void",
    doc: 'Ganti semua properti node (boleh ganti tipe, kecuali board ↔ non-board). ID dan posisi tetap; anak dipertahankan bila tipe baru frame/board.',
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND', 'ICON_UNKNOWN'],
    example: `${BOARD}\nconst r = add(b, {type:'rect', name:'Kotak', width:100, height:40});\nreplace(r, {type:'ellipse', name:'Bulat', width:40, height:40});`,
    call(ctx, [id, node]) {
      rejectDerivedKeys('replace', node);
      const n = iconNode(ctx, 'replace', node);
      mutation(ctx, () => ctx.tx.replace(id as string, n));
      return undefined;
    },
  },
  move: {
    kind: 'op',
    signature: 'move(id: string, parentId: string | null, index?: number): void',
    doc: "Pindah node ke board/frame parentId pada index (default akhir). parentId null hanya untuk board: mengubah urutan board di halaman. parentId '<instanceId>/<idFrameSlot>' = ke slot instance.",
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nconst f = add(b, {type:'frame', name:'Kartu', layout:'column'});\nconst t = add(b, {type:'text', name:'Judul', content:'Halo', size:16});\nmove(t, f, 0);`,
    call(ctx, [id, parentId, index]) {
      mutation(ctx, () => ctx.tx.move(id as string, parentId as string | null, index as number | undefined));
      return undefined;
    },
  },
  duplicate: {
    kind: 'op',
    signature: 'duplicate(id: string, patch?: {...}): string',
    doc: 'Salin node beserta subtree dengan ID baru, disisipkan tepat setelah asal; patch (aturan update) di-merge ke akar salinan.',
    returns: 'ID akar salinan (string 8 karakter)',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND', 'ICON_UNKNOWN'],
    example: `${BOARD}\nconst f = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8});\nadd(f, {type:'text', name:'Judul', content:'Halo', size:16});\nduplicate(f, {name:'Kartu 2'});`,
    call(ctx, [id, patch]) {
      rejectDerivedKeys('duplicate', patch);
      const p = iconPatch(ctx, 'duplicate', id, patch);
      return mutation(ctx, () => ctx.tx.duplicate(id as string, p));
    },
  },
  remove: {
    kind: 'op',
    signature: 'remove(id: string): void',
    doc: 'Hapus node beserta subtree-nya; ID itu tidak bisa dipakai lagi. Master komponen yang terhapus men-detach semua instancenya (node biasa ber-ID baru) di commit yang sama.',
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nconst t = add(b, {type:'text', name:'Sementara', content:'x', size:12});\nremove(t);`,
    call(ctx, [id]) {
      mutation(ctx, () => ctx.tx.remove(id as string));
      return undefined;
    },
  },
  setComponent: {
    kind: 'op',
    signature: "setComponent(id: string, component?: {props: [{name, type:'text'|'boolean'|'enum', default, options?, binds:[{nodeId, prop}]}], slots: [{name, nodeId}]} | null): void",
    doc:
      'Jadikan node anak (frame/text/rect/ellipse/path/icon) master komponen; tanpa component = {props:[], slots:[]} (master yang sudah ada tidak berubah). ' +
      "props: nama [a-z][A-Za-z0-9]*, binds menulis nilai prop ke properti node di dalam master (prop boolean + prop:'visible' menyembunyikan node). " +
      'slots: frame turunan master yang isinya diganti per instance. null melepas status master: semua instancenya di-detach di commit yang sama. ' +
      "Sisipkan instance dengan add(parentId, {type:'instance', name, componentId: id, props?}).",
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example:
      `${BOARD}\nconst k = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8, padding:16});\nconst t = add(k, {type:'text', name:'Judul', content:'Judul', size:16});\n` +
      "setComponent(k, {props:[{name:'title', type:'text', default:'Judul', binds:[{nodeId:t, prop:'content'}]}], slots:[]});\n" +
      "add(b, {type:'instance', name:'Kartu promo', componentId:k, props:{title:'Promo'}});",
    call(ctx, [id, component]) {
      if (component === undefined) {
        const hit = walk(ctx.view()).find((e) => e.node.id === id);
        if (hit && hit.node.type !== 'board' && hit.node.type !== 'instance' && hit.node.component !== undefined) return undefined;
      }
      mutation(ctx, () => ctx.tx.setComponent(id as string, component === undefined ? { props: [], slots: [] } : component));
      return undefined;
    },
  },
  resetOverride: {
    kind: 'op',
    signature: 'resetOverride(address: string, props?: string[]): void',
    doc:
      "Hapus override isi instance: address = '<instanceId>/<idNodeMaster>' (atau ID instance untuk override akar, mis. fills); props = hanya properti itu, tanpa props = semua. " +
      'Properti kembali mengikuti master. Override yatim (LC-32) juga bisa dibersihkan dengan ini.',
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example:
      `${BOARD}\nconst k = add(b, {type:'frame', name:'Kartu', layout:'column'});\nconst t = add(k, {type:'text', name:'Judul', content:'Judul', size:16});\nsetComponent(k);\n` +
      "const i = add(b, {type:'instance', name:'Kartu A', componentId:k});\nupdate(i + '/' + t, {content:'Promo', color:'#B42318'});\nresetOverride(i + '/' + t, ['color']);",
    call(ctx, [address, props]) {
      mutation(ctx, () => ctx.tx.resetOverride(address as string, props));
      return undefined;
    },
  },
  detach: {
    kind: 'op',
    signature: 'detach(id: string): string | null',
    doc:
      'Ganti instance dengan node biasa ber-ID baru di posisi yang sama: props, override, dan isi slot diterapkan (tampilan tetap, instance bersarang ikut menjadi node biasa; isi slot mempertahankan ID). ' +
      'Ref token tetap ref. null bila akar instance disembunyikan prop boolean-nya sendiri (instance dihapus).',
    returns: 'ID akar node baru (string 8 karakter) atau null',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example:
      `${BOARD}\nconst k = add(b, {type:'frame', name:'Kartu', layout:'column'});\nadd(k, {type:'text', name:'Judul', content:'Judul', size:16});\nsetComponent(k);\n` +
      "const i = add(b, {type:'instance', name:'Kartu A', componentId:k});\nconst f = detach(i);\nget(f).type;",
    call(ctx, [id]) {
      return mutation(ctx, () => ctx.tx.detach(id as string));
    },
  },
  arrange: {
    kind: 'op',
    signature: "arrange(ids: string[], opts: {mode:'align', align:'left'|'hcenter'|'right'|'top'|'vcenter'|'bottom'} | {mode:'spread', axis:'x'|'y', gap?: number} | {mode:'grid', cols: number, gap?: number}): {moved: number}",
    doc:
      'Ratakan posisi node dalam koordinat absolut dokumen (x/y tiap node dihitung dari rantai parent; node di parent berbeda tetap sejajar). ' +
      "mode 'align' + align 'left'|'hcenter'|'right' (atau 'top'|'vcenter'|'bottom') menyamakan tepi/tengah kotak kelompok. " +
      "mode 'spread' + axis 'x'|'y' memberi jarak antar merata: gap angka = jarak tetap dari tepi kiri/atas kelompok, tanpa gap = sisa ruang dibagi rata (urutan node mengikuti posisi sekarang). " +
      "mode 'grid' + cols menyusun ulang dalam baris×kolom dari pojok kiri-atas kelompok (urutan membaca y lalu x; gap default 24; lebar kolom = node terlebar di kolom itu, tinggi baris = node tertinggi di baris itu). " +
      "Syarat: tiap node punya x/y numerik — board atau anak dengan position:'absolute'. Anak layout auto tidak punya x/y → SCHEMA_INVALID (atur dulu lewat update, atau rapikan lewat gap/order parent-nya). " +
      'Lebar/tinggi non-numerik (hug/fill) dihitung 0. Hasil: {moved} = jumlah node yang berubah posisi.',
    returns: '{moved: number}',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example:
      "const a = add(null, {type:'board', name:'Kartu', x:0, y:0, width:390, height:844, screen:'mobile'});\n" +
      "const c = add(null, {type:'board', name:'Detail', x:600, y:300, width:390, height:844, screen:'mobile'});\n" +
      "const d = add(null, {type:'board', name:'Profil', x:1200, y:900, width:390, height:844, screen:'mobile'});\n" +
      "arrange([a, c, d], {mode:'spread', axis:'x', gap:80});",
    call(ctx, [ids, opts]) {
      if (!Array.isArray(ids) || !ids.every((i) => typeof i === 'string')) {
        throw new LakarError('SCHEMA_INVALID', `arrange: ids harus array ID string, bukan ${show(ids)}`, { hint: ARRANGE_HINT });
      }
      if (ids.length < 2) throw new LakarError('SCHEMA_INVALID', `arrange: butuh minimal 2 node, dikirim ${ids.length}`, { hint: ARRANGE_HINT });
      if (!isPlainObject(opts)) throw new LakarError('SCHEMA_INVALID', `arrange: opsi harus objek {mode, ...}, bukan ${show(opts)}`, { hint: ARRANGE_HINT });
      const o = opts as Record<string, unknown>;
      const mode = o.mode;
      if (mode !== 'align' && mode !== 'spread' && mode !== 'grid') {
        throw new LakarError('SCHEMA_INVALID', `arrange: mode harus 'align'|'spread'|'grid', bukan ${show(mode)}`, { hint: ARRANGE_HINT });
      }
      // Validasi opsi mode lebih dulu agar argumen yang salah → SCHEMA_INVALID sebelum NOT_FOUND id.
      if (mode === 'align' && !ARRANGE_ALIGNS.includes(o.align as never)) {
        throw new LakarError('SCHEMA_INVALID', `arrange: align harus ${ARRANGE_ALIGNS.map((a) => `'${a}'`).join('|')}, bukan ${show(o.align)}`, { hint: ARRANGE_HINT });
      }
      if (mode === 'spread') {
        if (o.axis !== 'x' && o.axis !== 'y') throw new LakarError('SCHEMA_INVALID', `arrange: axis harus 'x'|'y', bukan ${show(o.axis)}`, { hint: ARRANGE_HINT });
        if (o.gap !== undefined && (!isFiniteNum(o.gap) || o.gap < 0)) throw new LakarError('SCHEMA_INVALID', `arrange: gap harus angka ≥ 0, bukan ${show(o.gap)}`, { hint: 'hilangkan gap untuk jarak dibagi rata' });
      }
      if (mode === 'grid') {
        if (!isFiniteNum(o.cols) || !Number.isInteger(o.cols) || o.cols < 1) throw new LakarError('SCHEMA_INVALID', `arrange: cols harus bilangan bulat ≥ 1, bukan ${show(o.cols)}`, { hint: ARRANGE_HINT });
        if (o.gap !== undefined && (!isFiniteNum(o.gap) || o.gap < 0)) throw new LakarError('SCHEMA_INVALID', `arrange: gap harus angka ≥ 0, bukan ${show(o.gap)}`, { hint: ARRANGE_HINT });
      }
      const doc = ctx.view();
      const index = new Map(walk(doc).map((e) => [e.node.id, e]));
      /** Posisi absolut: x/y node + offset rantai parent (board di halaman = koordinat halaman). */
      const box = (n: AnyNode) => n as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
      const absOf = (e: Entry): Point => {
        let x = num(box(e.node).x);
        let y = num(box(e.node).y);
        let p = e.parentId;
        while (p) {
          const pe = index.get(p)!;
          x += num(box(pe.node).x);
          y += num(box(pe.node).y);
          p = pe.parentId;
        }
        return { x, y };
      };
      const items = ids.map((id) => {
        const e = mustFind('arrange', doc, id);
        const b = box(e.node);
        if (!isFiniteNum(b.x) || !isFiniteNum(b.y)) {
          throw new LakarError('SCHEMA_INVALID', `arrange: ${e.node.name} (${id}) tidak punya x/y — node berada di layout parent`, {
            hint: "atur position:'absolute' + x/y lewat update() dulu, atau rapikan lewat gap/urutan anak pada parent layout",
          });
        }
        const abs = absOf(e);
        const parent = e.parentId ? absOf(index.get(e.parentId)!) : { x: 0, y: 0 };
        return { e, abs, pOff: parent, w: num(b.width), h: num(b.height) };
      });
      const round = (v: number) => Math.round(v * 1000) / 1000;
      /** Tetapkan posisi absolut node → x/y lokal = absolut target − offset parent. */
      const placeAt = (it: (typeof items)[number], ax: number, ay: number): void => {
        const b = box(it.e.node);
        const nx = round(ax - it.pOff.x);
        const ny = round(ay - it.pOff.y);
        if (nx === num(b.x) && ny === num(b.y)) return;
        mutation(ctx, () => ctx.tx.update(it.e.node.id, { x: nx, y: ny }));
        moved++;
      };
      let moved = 0;
      const minX = Math.min(...items.map((i) => i.abs.x));
      const minY = Math.min(...items.map((i) => i.abs.y));
      const maxX2 = Math.max(...items.map((i) => i.abs.x + i.w));
      const maxY2 = Math.max(...items.map((i) => i.abs.y + i.h));
      if (mode === 'align') {
        const a = o.align as (typeof ARRANGE_ALIGNS)[number];
        for (const it of items) {
          const ax = a === 'left' ? minX : a === 'right' ? maxX2 - it.w : a === 'hcenter' ? minX + (maxX2 - minX - it.w) / 2 : it.abs.x;
          const ay = a === 'top' ? minY : a === 'bottom' ? maxY2 - it.h : a === 'vcenter' ? minY + (maxY2 - minY - it.h) / 2 : it.abs.y;
          placeAt(it, ax, ay);
        }
      } else if (mode === 'spread') {
        const axis = o.axis as 'x' | 'y';
        const gap = o.gap as number | undefined;
        const sorted = [...items].sort((p, q) => (axis === 'x' ? p.abs.x - q.abs.x : p.abs.y - q.abs.y));
        const span = axis === 'x' ? maxX2 - minX : maxY2 - minY;
        const sizes = sorted.reduce((s, i) => s + (axis === 'x' ? i.w : i.h), 0);
        const step = gap ?? (sorted.length > 1 ? Math.max(0, (span - sizes) / (sorted.length - 1)) : 0);
        // gap eksplisit = jarak antar tepi; tanpa gap = sisa ruang dibagi rata (juga antar tepi).
        let cursor = axis === 'x' ? minX : minY;
        for (const it of sorted) {
          if (axis === 'x') placeAt(it, cursor, it.abs.y);
          else placeAt(it, it.abs.x, cursor);
          cursor += (axis === 'x' ? it.w : it.h) + step;
        }
      } else {
        const cols = o.cols as number;
        const gap = (o.gap ?? DEFAULT_ARRANGE_GAP) as number;
        const sorted = [...items].sort((p, q) => p.abs.y - q.abs.y || p.abs.x - q.abs.x);
        const colW: number[] = [];
        const rowH: number[] = [];
        sorted.forEach((it, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          colW[c] = Math.max(colW[c] ?? 0, it.w);
          rowH[r] = Math.max(rowH[r] ?? 0, it.h);
        });
        const offX = [0];
        const offY = [0];
        for (let i = 1; i < cols; i++) offX[i] = offX[i - 1]! + (colW[i - 1] ?? 0) + gap;
        for (let i = 1; i < rowH.length; i++) offY[i] = offY[i - 1]! + (rowH[i - 1] ?? 0) + gap;
        sorted.forEach((it, i) => placeAt(it, minX + offX[i % cols]!, minY + offY[Math.floor(i / cols)]!));
      }
      return { moved };
    },
  },
  setTokens: {
    kind: 'op',
    signature: 'setTokens(map: {[name: string]: string | number | {type, value, modes?} | null}): void',
    doc:
      "Merge token ke dokumen (nama segmen [a-z0-9-] dipisah titik, mis. 'colors.primary'); null menghapus. Rujuk dengan {$token:'colors.primary'}. " +
      'Nilai datar: token ada → ganti value (type/modes tetap); token baru → type diinferensi dari slot yang merujuknya. ' +
      "Bertipe: {type:'color'|'radius'|'spacing'|'container'|'breakpoint'|'fontFamily'|'fontWeight'|'fontSize'|'lineHeight'|'letterSpacing', value, modes?:{dark:...}}.",
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'TOKEN_UNKNOWN'],
    example:
      "setTokens({'colors.primary': '#0F62FE', 'spacing.4': 16});\n" +
      `${BOARD}\nadd(b, {type:'rect', name:'Aksen', width:40, height:40, fills:[{type:'solid', color:{$token:'colors.primary'}}]});`,
    call(ctx, [map]) {
      mutation(ctx, () => ctx.tx.setTokens(map));
      return undefined;
    },
  },
  setTokenModes: {
    kind: 'op',
    signature: 'setTokenModes(modes: string[] | null): void',
    doc: "Ganti daftar mode tema dokumen: minimal satu, tanpa duplikat, elemen pertama = default; nama diawali huruf kecil/angka lalu [a-z0-9-], maks 32 karakter. null menghapus. Kunci token.modes dan board themeMode wajib ada di daftar ini (dicek saat commit).",
    returns: 'undefined',
    errors: ['SCHEMA_INVALID'],
    example:
      "setTokenModes(['light', 'dark']);\n" +
      "setTokens({'colors.bg': {type:'color', value:'#FFFFFF', modes:{dark:'#0B0C0F'}}});\n" +
      `${BOARD}\nupdate(b, {themeMode:'dark', fills:[{type:'solid', color:{$token:'colors.bg'}}]});`,
    call(ctx, [modes]) {
      mutation(ctx, () => ctx.tx.setTokenModes(modes));
      return undefined;
    },
  },
  setFlows: {
    kind: 'op',
    signature: 'setFlows(flows: {id, name, startBoardId}[] | null): void',
    doc:
      'Ganti seluruh daftar flow prototipe (titik masuk mode Present; daftar utuh, bukan patch per-flow): {id: ID 8 karakter unik, name, startBoardId: ID board yang ada — board yang dibuat op sebelumnya di snippet yang sama sudah bisa dipakai}. ' +
      'null menghapus flows. Interaksi antar-board dipasang lewat properti `interactions` pada node/board (lihat update).',
    returns: 'undefined',
    errors: ['SCHEMA_INVALID'],
    example:
      `${BOARD}\nconst c = add(null, {type:'board', name:'Detail', x:480, y:0, width:390, height:844, screen:'mobile'});\n` +
      "const card = add(b, {type:'frame', name:'Kartu', width:342, height:64});\n" +
      "add(card, {type:'rect', name:'Tombol', width:120, height:40, interactions:[{id:'Intr0001', trigger:'tap', action:{kind:'navigate', boardId:c}, transition:{kind:'slide', direction:'left'}}]});\n" +
      "setFlows([{id:'Flow0001', name:'Alur utama', startBoardId:b}]);",
    call(ctx, [flows]) {
      mutation(ctx, () => ctx.tx.setFlows(flows));
      return undefined;
    },
  },
  renameToken: {
    kind: 'op',
    signature: 'renameToken(from: string, to: string): void',
    doc: 'Ganti nama token: definisi pindah (urutan tetap) dan setiap ref {$token: from} di dokumen ikut berganti dalam commit yang sama. from tidak ada → TOKEN_UNKNOWN; to sudah dipakai → CONFLICT.',
    returns: 'undefined',
    errors: ['SCHEMA_INVALID', 'TOKEN_UNKNOWN', 'CONFLICT'],
    example:
      "setTokens({'colors.primary': '#0F62FE'});\n" +
      `${BOARD}\nadd(b, {type:'rect', name:'Aksen', width:40, height:40, fills:[{type:'solid', color:{$token:'colors.primary'}}]});\n` +
      "renameToken('colors.primary', 'colors.brand');",
    call(ctx, [from, to]) {
      mutation(ctx, () => ctx.tx.renameToken(from, to));
      return undefined;
    },
  },
  importCssVariables: {
    kind: 'op',
    signature: 'importCssVariables(css: string): {tokens: {variable, token, type, status}[], modes: string[], skipped: {source, reason, detail}[]}',
    doc:
      'Buat token bertipe dari isi file CSS variables. Blok :root/html = nilai default, [data-theme="x"] = mode x (didaftarkan ke tokenModes; dokumen tanpa mode: :root menjadi mode light). ' +
      "Nama: token dokumen yang cssVar-nya sama dipakai ulang (status update, ref tetap; nilai mode yang tidak disebut CSS dipertahankan), selain itu '-' → '.' (--colors-bg → colors.bg). " +
      'Tipe dari nilai dan nama (warna → color; radius, space/gap, text/font-size, font-weight, leading, tracking, font family); rem = 16px. ' +
      'Variabel tak terpetakan (bayangan, unit lain, selektor lain) dilewati dan dilaporkan di skipped; tidak ada token sama sekali → SCHEMA_INVALID.',
    returns: '{tokens: [{variable, token, type, status}], modes, skipped: [{source, reason, detail}]}',
    errors: ['SCHEMA_INVALID', 'EXEC_ERROR'],
    example:
      "importCssVariables(':root { --colors-bg: #ffffff; --radius-md: 12px; } [data-theme=\"dark\"] { --colors-bg: #0f0f0f; }');\n" +
      `${BOARD}\nupdate(b, {themeMode:'dark'});\nadd(b, {type:'rect', name:'Kartu', width:120, height:80, radius:{$token:'radius.md'}, fills:[{type:'solid', color:{$token:'colors.bg'}}]});`,
    call(ctx, [css]) {
      if (typeof css !== 'string' || !css.trim()) {
        throw new LakarError('SCHEMA_INVALID', `importCssVariables: css harus string isi stylesheet, bukan ${show(css)}`, { hint: CSS_IMPORT_HINT });
      }
      if (css.length > CSS_IMPORT_MAX_CHARS) {
        throw new LakarError('SCHEMA_INVALID', `importCssVariables: css maks ${CSS_IMPORT_MAX_CHARS / 1024} K karakter, dikirim ${css.length}`, { hint: 'impor per file atau per bagian' });
      }
      if (!ctx.cssVariables) {
        throw new LakarError('EXEC_ERROR', 'importCssVariables: parser CSS variables tidak tersedia di host ini', { hint: 'jalankan lewat lakard (tool execute MCP)' });
      }
      const doc = ctx.view();
      const parsed = ctx.cssVariables.parse(css, { tokens: doc.tokens ?? {}, ...(doc.tokenModes ? { modes: doc.tokenModes } : {}) });
      if (!parsed.entries.length) {
        const why = parsed.skipped.slice(0, 5).map((s) => `${s.source}: ${s.reason}`);
        throw new LakarError('SCHEMA_INVALID', `importCssVariables: tidak ada CSS variable yang bisa diimpor${why.length ? ` (${why.join('; ')})` : ''}`, { hint: CSS_IMPORT_HINT });
      }
      if (parsed.tokenModes) mutation(ctx, () => ctx.tx.setTokenModes(parsed.tokenModes));
      const map = Object.fromEntries(parsed.entries.map((e) => [e.token, { type: e.type, value: e.value, ...(e.modes ? { modes: e.modes } : {}) }]));
      mutation(ctx, () => ctx.tx.setTokens(map));
      const out: CssImportResult = {
        tokens: parsed.entries.map((e) => ({ variable: e.variable, token: e.token, type: e.type as TokenTypeName, status: e.status })),
        modes: [...(ctx.view().tokenModes ?? [])],
        skipped: parsed.skipped,
      };
      return JSON.parse(JSON.stringify(out)) as unknown;
    },
  },
  importDtcgTokens: {
    kind: 'op',
    signature: 'importDtcgTokens(json: string): {tokens: {path, token, type, status, alias?}[], modes: string[], skipped: {source, reason, detail}[]}',
    doc:
      'Buat token bertipe dari isi file JSON W3C DTCG (satu commit: setTokenModes lalu setTokens). Grup bersarang menjadi nama token dipisah "."; $extensions.mode = nilai per mode tema (didaftarkan ke tokenModes). ' +
      'Tipe: $extensions["com.lakar"].type (ditulis ekspor Lakar) > $type (color/fontFamily/fontWeight 1:1; dimension px → nama bila cocok selain itu spacing, em → letterSpacing; number → fontWeight hanya bila nama mengandung "weight") > segmen nama (radius, breakpoint, container, size, leading). ' +
      'Alias "{a.b}" di-resolve ke nilai token target dalam file yang sama (kolom alias di hasil); fontFamily array digabung ", "; keyword weight (thin…black, normal, bold) jadi angka; rem = 16px. ' +
      'Entri tak didukung (typography, shadow, border, gradient, transition, nama mode/nama token tidak valid, alias tak dikenal, nilai tak valid) dilewati dan dilaporkan di skipped; tidak ada token sama sekali → SCHEMA_INVALID.',
    returns: '{tokens: [{path, token, type, status, alias?}], modes, skipped: [{source, reason, detail}]}',
    errors: ['SCHEMA_INVALID', 'EXEC_ERROR'],
    example:
      'importDtcgTokens(JSON.stringify({colors:{bg:{$type:"color",$value:"#FFFFFF",$extensions:{mode:{dark:"#0B0C0F"}}}},"radius-md":{$type:"dimension",$value:{value:12,unit:"px"},$extensions:{"com.lakar":{type:"radius"}}}}));\n' +
      `${BOARD}\nupdate(b, {themeMode:'dark'});\nadd(b, {type:'rect', name:'Kartu', width:120, height:80, radius:{$token:'radius-md'}, fills:[{type:'solid', color:{$token:'colors.bg'}}]});`,
    call(ctx, [json]) {
      if (typeof json !== 'string' || !json.trim()) {
        throw new LakarError('SCHEMA_INVALID', `importDtcgTokens: json harus string isi file DTCG, bukan ${show(json)}`, { hint: DTCG_IMPORT_HINT });
      }
      if (json.length > DTCG_IMPORT_MAX_CHARS) {
        throw new LakarError('SCHEMA_INVALID', `importDtcgTokens: json maks ${DTCG_IMPORT_MAX_CHARS / 1024} K karakter, dikirim ${json.length}`, { hint: 'impor per file atau per bagian' });
      }
      if (!ctx.dtcg) {
        throw new LakarError('EXEC_ERROR', 'importDtcgTokens: parser DTCG tidak tersedia di host ini', { hint: 'jalankan lewat lakard (tool execute MCP)' });
      }
      const doc = ctx.view();
      const parsed = ctx.dtcg.parse(json, { tokens: doc.tokens ?? {}, ...(doc.tokenModes ? { modes: doc.tokenModes } : {}) });
      if (!parsed.entries.length) {
        const why = parsed.skipped.slice(0, 5).map((s) => `${s.source}: ${s.reason}`);
        throw new LakarError('SCHEMA_INVALID', `importDtcgTokens: tidak ada token DTCG yang bisa diimpor${why.length ? ` (${why.join('; ')})` : ''}`, { hint: DTCG_IMPORT_HINT });
      }
      if (parsed.tokenModes) mutation(ctx, () => ctx.tx.setTokenModes(parsed.tokenModes));
      const map = Object.fromEntries(parsed.entries.map((e) => [e.token, { type: e.type, value: e.value, ...(e.modes ? { modes: e.modes } : {}) }]));
      mutation(ctx, () => ctx.tx.setTokens(map));
      const out: DtcgImportResult = {
        tokens: parsed.entries.map((e) => ({ path: e.path, token: e.token, type: e.type as TokenTypeName, status: e.status, ...(e.alias ? { alias: e.alias } : {}) })),
        modes: [...(ctx.view().tokenModes ?? [])],
        skipped: parsed.skipped,
      };
      return JSON.parse(JSON.stringify(out)) as unknown;
    },
  },
  get: {
    kind: 'read',
    signature: 'get(id: string): NodeView',
    doc:
      'Baca satu node sebagai salinan datar: properti tersimpan (token apa adanya) + parentId, path (nama board→node), childIds (board/frame), measuredHeight (board height:"hug", render terakhir sebelum snippet). Melihat perubahan snippet ini. ' +
      "Instance dibaca tersimpan (componentId, props, overrides, slots; tanpa childIds, isi slot lewat children(instanceId)); isinya lewat alamat '<instanceId>/<idNodeMaster>' = node efektif (props/override diterapkan, id/parentId/childIds beralamat komposit).",
    returns: 'NodeView',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nconst t = add(b, {type:'text', name:'Judul', content:'Halo', size:32});\nget(t).path;`,
    call(ctx, [id]) {
      if (typeof id === 'string' && NODE_ADDRESS_PATTERN.test(id) && id.includes('/')) {
        // Alamat komposit (AD-12): node efektif isi instance (props, override, slot diterapkan; token apa adanya).
        const doc = ctx.view();
        const hit = expandedNodeAt(doc as Doc, id);
        if (!hit) {
          throw new LakarError('NOT_FOUND', `get: isi instance ${id} tidak ada`, {
            hint: 'alamat = <instanceId>/<idNodeMaster>[/…]: ID node master dari children(masterId); childIds node efektif sudah berupa alamat; node yang disembunyikan prop boolean tidak ada',
          });
        }
        const owner = mustFind('get', doc, id.split('/')[0]!);
        return toView({ node: hit.node as unknown as AnyNode, parentId: hit.parentId, path: [...owner.path.slice(0, -1), ...hit.names] }, ctx.boardHeights);
      }
      const nid = requireId('get', 'id', id);
      return toView(mustFind('get', ctx.view(), nid), ctx.boardHeights);
    },
  },
  find: {
    kind: 'read',
    signature: 'find(query?: {type?, name?: string | RegExp, within?: string}): NodeView[]',
    doc: 'Cari node tersimpan dalam urutan dokumen (termasuk isi slot instance, parentId = instance; isi master di dalam instance tidak). name string = sama persis, RegExp = cocok; within = hanya keturunan board/frame/instance itu.',
    returns: 'NodeView[] (urutan dokumen)',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nadd(b, {type:'text', name:'Judul', content:'Halo', size:32});\nfind({type:'text', name:/^Jud/, within: b}).map((n) => n.id);`,
    call(ctx, [query]) {
      const q = query ?? {};
      if (!isPlainObject(q)) {
        throw new LakarError('SCHEMA_INVALID', `find: query harus objek, bukan ${show(q)}`, { hint: "contoh: find({type:'text', name:/^Judul/, within: boardId})" });
      }
      const unknown = Object.keys(q).filter((k) => !FIND_KEYS.includes(k));
      if (unknown.length) {
        throw new LakarError('SCHEMA_INVALID', `find: kunci tidak dikenal: ${unknown.join(', ')}`, { hint: `kunci yang didukung: ${FIND_KEYS.join(', ')}` });
      }
      if (q.type !== undefined && !(NODE_TYPES as readonly unknown[]).includes(q.type)) {
        throw new LakarError('SCHEMA_INVALID', `find: type tidak dikenal: ${show(q.type)}`, { hint: `type salah satu: ${NODE_TYPES.join(', ')}` });
      }
      if (q.name !== undefined && typeof q.name !== 'string') {
        throw new LakarError('SCHEMA_INVALID', `find: name harus string atau RegExp, bukan ${show(q.name)}`, { hint: "contoh: find({name:'Judul'}) atau find({name:/^Kartu/})" });
      }
      const doc = ctx.view();
      let pool = walk(doc);
      if (q.within !== undefined) {
        const wid = requireId('find', 'within', q.within);
        mustFind('find', doc, wid, 'within');
        const parents = new Map(pool.map((x) => [x.node.id, x.parentId] as const));
        pool = pool.filter((e) => e.node.id !== wid && isUnder(parents, e, wid));
      }
      return pool.filter((e) => (q.type === undefined || e.node.type === q.type) && (q.name === undefined || e.node.name === q.name)).map((e) => toView(e, ctx.boardHeights));
    },
  },
  children: {
    kind: 'read',
    signature: 'children(id: string | null): NodeView[]',
    doc: 'Anak langsung node dalam urutan dokumen; null = board di halaman aktif sesi. Instance → isi slot tersimpannya (bukan isi master; itu lewat get alamat komposit). Node daun → [].',
    returns: 'NodeView[]',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: `${BOARD}\nadd(b, {type:'text', name:'Judul', content:'Halo', size:32});\nchildren(b).map((n) => n.name);`,
    call(ctx, [id]) {
      const doc = ctx.view();
      if (id === null || id === undefined) {
        const boards = new Set(activePageOf(ctx, doc).children.map((b) => b.id));
        return walk(doc).filter((e) => e.parentId === null && boards.has(e.node.id)).map((e) => toView(e, ctx.boardHeights));
      }
      const nid = requireId('children', 'id', id);
      mustFind('children', doc, nid);
      return walk(doc).filter((e) => e.parentId === nid).map((e) => toView(e, ctx.boardHeights));
    },
  },
  getTokens: {
    kind: 'read',
    signature: 'getTokens(): {tokens: {[name: string]: {type, value, modes?}}, modes: string[]}',
    doc:
      'Baca token dokumen dalam bentuk tersimpan (type, value, modes per mode tema) dan daftar mode tema (tokenModes; elemen pertama = default, [] bila tanpa mode). ' +
      'Melihat perubahan snippet ini. Nilai mode efektif board = modes[board.themeMode ?? modes[0]] ?? value.',
    returns: '{tokens: {[name]: {type, value, modes?}}, modes: string[]}',
    errors: ['SCHEMA_INVALID'],
    example:
      "setTokenModes(['light', 'dark']);\n" +
      "setTokens({'colors.bg': {type:'color', value:'#FFFFFF', modes:{dark:'#0B0C0F'}}, 'spacing.4': 16});\n" +
      'const { tokens, modes } = getTokens();\n' +
      "[modes, tokens['colors.bg'].modes.dark];",
    call(ctx, args) {
      if (args.some((a) => a !== undefined)) {
        throw new LakarError('SCHEMA_INVALID', `getTokens: tanpa argumen, dikirim ${show(args.find((a) => a !== undefined))}`, { hint: 'const { tokens, modes } = getTokens();' });
      }
      const doc = ctx.view();
      return JSON.parse(JSON.stringify({ tokens: doc.tokens ?? {}, modes: doc.tokenModes ?? [] })) as unknown;
    },
  },
  analyze: {
    kind: 'read',
    signature:
      "analyze(opts?: {scope?: string, limit?: number, minCluster?: number}): {nodes, colors: {value,count}[], literalColors, tokenColors, typography: {family,weight,size,count}[], spacing: {gaps:{value,count}[], paddings:{value,count}[]}, clusters: {shape,count,ids}[]}",
    doc:
      'Audit konsistensi desain sebelum melapor selesai — output rapi memakai sedikit nilai berbeda dan warna bertoken. ' +
      "scope = ID node: hanya subtree-nya (termasuk dirinya); tanpa argumen = seluruh dokumen. limit = maks entri per kategori (default 10). minCluster = minimum pengulangan struktur yang dilaporkan (default 3). " +
      'Warna dikumpulkan dari fills (solid + stop gradien), strokes, shadows, dan color teks/icon; hex literal dilaporkan apa adanya, ref {$token} sebagai "$token <nama>" (bandingkan literalColors vs tokenColors). ' +
      'Tipografi dari node text (family/weight/size; default = "(default)"/400). Spacing dari gap/columnGap/rowGap dan komponen padding wadah (ref token dilaporkan "$token <nama>"). ' +
      'clusters = subtree bertipe sama (tipe node + tipe anak rekursif, properti diabaikan) yang muncul ≥ minCluster kali — kandidat setComponent.',
    returns: '{nodes, colors, literalColors, tokenColors, typography, spacing:{gaps,paddings}, clusters}',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example:
      `${BOARD}\nadd(b, {type:'text', name:'Judul', content:'Halo', size:32, color:'#1A1A1A'});\n` +
      "add(b, {type:'text', name:'Isi', content:'Teks', size:16, lineHeight:24, color:'#1A1A1A'});\n" +
      "analyze({scope: b}).colors;",
    call(ctx, [opts]) {
      if (opts !== undefined && !isPlainObject(opts)) {
        throw new LakarError('SCHEMA_INVALID', `analyze: opsi harus objek {scope?, limit?, minCluster?}, bukan ${show(opts)}`, { hint: 'contoh: analyze() atau analyze({scope: boardId, limit: 5})' });
      }
      const o = (opts ?? {}) as Record<string, unknown>;
      const unknown = Object.keys(o).filter((k) => !ANALYZE_KEYS.includes(k));
      if (unknown.length) throw new LakarError('SCHEMA_INVALID', `analyze: kunci opsi tidak dikenal: ${unknown.join(', ')}`, { hint: `kunci yang didukung: ${ANALYZE_KEYS.join(', ')}` });
      for (const [what, v, min] of [['limit', o.limit ?? 10, 1], ['minCluster', o.minCluster ?? 3, 2]] as const) {
        if (!isFiniteNum(v) || !Number.isInteger(v) || v < min) {
          throw new LakarError('SCHEMA_INVALID', `analyze: ${what} harus bilangan bulat ≥ ${min}, bukan ${show(v)}`, { hint: `hilangkan ${what} untuk default` });
        }
      }
      const limit = (o.limit ?? 10) as number;
      const minCluster = (o.minCluster ?? 3) as number;
      const doc = ctx.view();
      let entries = walk(doc);
      if (o.scope !== undefined) {
        const sid = requireId('analyze', 'scope', o.scope);
        const root = mustFind('analyze', doc, sid, 'node scope');
        const keep = new Set<string>([sid]);
        for (const e of entries) if (keep.has(e.parentId ?? '')) keep.add(e.node.id);
        entries = entries.filter((e) => keep.has(e.node.id) || e.node.id === root.node.id);
      }
      /** Nilai untuk frekuensi: ref {$token} → "$token <nama>", angka apa adanya, hex warna huruf besar. */
      const val = (v: unknown): number | string | undefined => {
        if (isFiniteNum(v)) return v;
        if (isTokenRef(v)) return `$token ${v.$token}`;
        if (typeof v === 'string' && /^#[0-9A-Fa-f]{6,8}$/.test(v)) return v.toUpperCase();
        return undefined;
      };
      const bump = (m: Map<number | string, number>, v: unknown) => {
        const k = val(v);
        if (k !== undefined) m.set(k, (m.get(k) ?? 0) + 1);
      };
      const freq = (m: Map<number | string, number>): AnalyzeFreq[] => [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, limit);
      const colors = new Map<number | string, number>();
      const typo = new Map<string, { family: number | string; weight: number | string; size: number | string; count: number }>();
      const gaps = new Map<number | string, number>();
      const pads = new Map<number | string, number>();
      const clusterMap = new Map<string, string[]>();
      /** Tanda tangan struktur: tipe node + tipe anak rekursif (properti diabaikan), kedalaman maks 6. */
      const sig = (n: AnyNode, depth: number): string => {
        if (depth <= 0) return '…';
        const kids = ('children' in n ? (n.children as AnyNode[] | undefined) : undefined) ?? [];
        if (!kids.length) return n.type;
        return `${n.type}(${kids.map((c) => sig(c, depth - 1)).sort().join(',')})`;
      };
      let literalColors = 0;
      let tokenColors = 0;
      for (const e of entries) {
        const n = e.node as AnyNode & Record<string, unknown>;
        const colorList = (list: unknown) => {
          if (!Array.isArray(list)) return;
          for (const item of list) {
            if (!isPlainObject(item)) continue;
            const it = item as Record<string, unknown>;
            if (val(it.color) !== undefined) {
              bump(colors, it.color);
              if (isTokenRef(it.color)) tokenColors++;
              else literalColors++;
            }
            if (Array.isArray(it.stops)) for (const s of it.stops as Record<string, unknown>[]) bump(colors, s.color);
          }
        };
        colorList(n.fills);
        colorList(n.strokes);
        colorList(n.shadows);
        if (val(n.color) !== undefined) {
          bump(colors, n.color);
          if (isTokenRef(n.color)) tokenColors++;
          else literalColors++;
        }
        if (n.type === 'text') {
          const fam = isTokenRef(n.family) ? `$token ${n.family.$token}` : typeof n.family === 'string' ? n.family : '(default)';
          const wt = val(n.weight) ?? 400;
          const sz = val(n.size);
          if (sz !== undefined) {
            const key = `${fam}|${wt}|${sz}`;
            const row = typo.get(key) ?? { family: fam, weight: wt, size: sz, count: 0 };
            row.count++;
            typo.set(key, row);
          }
        }
        for (const k of ['gap', 'columnGap', 'rowGap'] as const) bump(gaps, n[k]);
        const pad = n.padding;
        for (const v of Array.isArray(pad) ? pad : [pad]) bump(pads, v);
        const s = sig(n, 6);
        clusterMap.set(s, [...(clusterMap.get(s) ?? []), n.id]);
      }
      const clusters = [...clusterMap.entries()]
        .filter(([, ids]) => ids.length >= minCluster)
        .map(([shape, ids]) => ({ shape: shape.length > 120 ? `${shape.slice(0, 117)}…` : shape, count: ids.length, ids: ids.slice(0, limit) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
      const report: AnalyzeReport = {
        nodes: entries.length,
        colors: freq(colors),
        literalColors,
        tokenColors,
        typography: [...typo.values()].sort((a, b) => b.count - a.count).slice(0, limit),
        spacing: { gaps: freq(gaps), paddings: freq(pads) },
        clusters,
      };
      return JSON.parse(JSON.stringify(report)) as unknown;
    },
  },
  place: {
    kind: 'read',
    signature: "place(w: number, h: number | 'hug', opts?: {near?: string, gap?: number}): {x, y}",
    doc:
      'Posisi {x, y} untuk board baru w×h yang tidak tumpang tindih board di halaman aktif sesi (termasuk yang dibuat di snippet ini), berjarak gap (default 80). ' +
      "h 'hug' = board height:'hug' (hanya tepi atasnya dihitung); board hug yang ada memakai tinggi terukur render terakhir. " +
      'Halaman kosong → {x:0, y:0}; tanpa near → baris atas, kiri ke kanan; near → kanan board itu, lalu di bawahnya.',
    returns: '{x: number, y: number}',
    errors: ['SCHEMA_INVALID', 'NOT_FOUND'],
    example: "const p = place(1440, 'hug');\nadd(null, {type:'board', name:'Beranda', x:p.x, y:p.y, width:1440, height:'hug', screen:'landing'});",
    call(ctx, [w, h, opts]) {
      for (const [what, v] of [['w', w], ['h', h]] as const) {
        if (what === 'h' && v === 'hug') continue;
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
          throw new LakarError('SCHEMA_INVALID', `place: ${what} harus angka > 0${what === 'h' ? " atau 'hug'" : ''}, bukan ${show(v)}`, {
            hint: 'contoh: const p = place(390, 844); add(null, {type:"board", x:p.x, y:p.y, ...}); landing: place(1440, \'hug\')',
          });
        }
      }
      const o = opts ?? {};
      if (!isPlainObject(o)) throw new LakarError('SCHEMA_INVALID', `place: opsi harus objek {near?, gap?}, bukan ${show(o)}`, { hint: 'contoh: place(390, 844, {near: boardId, gap: 80})' });
      const unknown = Object.keys(o).filter((k) => !PLACE_KEYS.includes(k));
      if (unknown.length) throw new LakarError('SCHEMA_INVALID', `place: kunci opsi tidak dikenal: ${unknown.join(', ')}`, { hint: `kunci yang didukung: ${PLACE_KEYS.join(', ')}` });
      const gap = o.gap ?? DEFAULT_PLACE_GAP;
      if (typeof gap !== 'number' || !Number.isFinite(gap) || gap < 0) {
        throw new LakarError('SCHEMA_INVALID', `place: gap harus angka ≥ 0, bukan ${show(gap)}`, { hint: 'hilangkan gap untuk default 80' });
      }
      const doc = ctx.view();
      const boards = activePageOf(ctx, doc).children.map((b) => boardRect(b, ctx.boardHeights));
      // Board hug baru: tingginya belum ada, jadi hanya tepi atasnya (1 px) yang dijaga dari tabrakan.
      const size = { w: w as number, h: h === 'hug' ? 1 : (h as number) };
      if (o.near !== undefined) {
        const nid = requireId('place', 'near', o.near);
        const near = mustFind('place', doc, nid, 'board near');
        if (near.node.type !== 'board') {
          throw new LakarError('SCHEMA_INVALID', `place: near harus ID board, bukan ${near.node.type}`, { hint: 'pakai ID board (children(null) mendaftar board di halaman)' });
        }
        const r = boardRect(near.node, ctx.boardHeights);
        const right = { x: r.x + r.w + gap, y: r.y, ...size };
        if (!boards.some((b) => clash(right, b, gap))) return { x: right.x, y: right.y };
        // Di bawah board acuan; geser turun melewati board yang menghalangi.
        const below = { x: r.x, y: r.y + r.h + gap, ...size };
        for (;;) {
          const hits = boards.filter((b) => clash(below, b, gap));
          if (!hits.length) return { x: below.x, y: below.y };
          below.y = Math.max(...hits.map((b) => b.y + b.h)) + gap;
        }
      }
      if (!boards.length) return { x: 0, y: 0 };
      // Baris atas: kanan dari board paling kanan, sejajar board paling atas.
      return { x: Math.max(...boards.map((b) => b.x + b.w)) + gap, y: Math.min(...boards.map((b) => b.y)) };
    },
  },
  iconSearch: {
    kind: 'read',
    signature: "iconSearch(query: string, opts?: {lib?: 'lucide'|'simple-icons', limit?: number}): {lib, icon, tags?, title?, aliasOf?}[]",
    doc:
      'Cari ikon di katalog terpasang: lucide (ikon UI) dan simple-icons (khusus logo brand). Urut relevansi: nama persis > awalan nama/alias > ' +
      `token nama > tag persis > tag sebagian; default ${ICON_SEARCH_DEFAULT_LIMIT} hasil, maks ${ICON_SEARCH_MAX_LIMIT}. Pakai lib + icon hasilnya di node icon (alias juga diterima, disimpan sebagai nama kanonik).`,
    returns: '{lib, icon, tags?, title?, aliasOf?}[] (bisa kosong)',
    errors: ['SCHEMA_INVALID'],
    example: `${BOARD}\nconst [m] = iconSearch('dumbbell', {lib:'lucide', limit:3});\nadd(b, {type:'icon', lib:m.lib, icon:m.icon, size:24});`,
    call(ctx, [query, opts]) {
      if (typeof query !== 'string' || !query.trim()) {
        throw new LakarError('SCHEMA_INVALID', `iconSearch: query harus string tidak kosong, bukan ${show(query)}`, { hint: ICON_SEARCH_HINT });
      }
      const o = opts ?? {};
      if (!isPlainObject(o)) throw new LakarError('SCHEMA_INVALID', `iconSearch: opsi harus objek {lib?, limit?}, bukan ${show(o)}`, { hint: ICON_SEARCH_HINT });
      const unknown = Object.keys(o).filter((k) => !ICON_SEARCH_KEYS.includes(k));
      if (unknown.length) throw new LakarError('SCHEMA_INVALID', `iconSearch: kunci opsi tidak dikenal: ${unknown.join(', ')}`, { hint: `kunci yang didukung: ${ICON_SEARCH_KEYS.join(', ')}` });
      if (o.lib !== undefined && knownLib(ctx, o.lib) === undefined) {
        throw new LakarError('SCHEMA_INVALID', `iconSearch: lib tidak dikenal: ${show(o.lib)}`, { hint: `lib salah satu: ${Object.keys(ctx.icons.versions).join(', ')} (atau hilangkan untuk semua)` });
      }
      const limit = o.limit ?? ICON_SEARCH_DEFAULT_LIMIT;
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > ICON_SEARCH_MAX_LIMIT) {
        throw new LakarError('SCHEMA_INVALID', `iconSearch: limit harus bilangan bulat 1–${ICON_SEARCH_MAX_LIMIT}, bukan ${show(limit)}`, { hint: `hilangkan limit untuk default ${ICON_SEARCH_DEFAULT_LIMIT}` });
      }
      const res = ctx.icons.search(query, { ...(o.lib !== undefined ? { lib: o.lib as string } : {}), limit });
      return JSON.parse(JSON.stringify(res)) as unknown;
    },
  },
  photo: {
    kind: 'read',
    signature: 'photo(ref: string): {assetId, width, height, credit, license, creator, sourcePageUrl}',
    doc:
      "Foto stok untuk ref dari tool photo_search (mis. 'unsplash:Kq3wLm8xT0a', 'wikimedia:<id>' atau 'openverse:<uuid>'). Tulis ref sebagai literal string di kode " +
      "(photo('unsplash:Kq3wLm8xT0a')), bukan variabel: daemon mengimpornya sekali sebelum snippet berjalan (Unsplash: aset jarak jauh yang disajikan daemon; lainnya: file lokal). " +
      "Pakai assetId di fill {type:'image', assetId, fit:'cover'} pada frame/rect bernama 'Image / …'; width/height = ukuran piksel asli; " +
      'credit = baris kredit siap pakai. Atribusi sudah tercatat di metadata aset: kredit tidak ditampilkan di UI kecuali pengguna memintanya; sebut di ringkasan akhir.',
    returns: '{assetId, width, height, credit, license, creator, sourcePageUrl}',
    errors: ['NOT_FOUND', 'SCHEMA_INVALID'],
    example:
      `${BOARD}\nconst p = photo('unsplash:Kq3wLm8xT0a');\n` +
      "const k = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8, padding:16, width:'fill'});\n" +
      "add(k, {type:'rect', name:'Image / Kamar', width:'fill', height:200, radius:12, fills:[{type:'image', assetId:p.assetId, fit:'cover'}]});\n" +
      "add(k, {type:'text', name:'Judul', content:'Kamar deluks, 2 tamu', size:16, lineHeight:24, weight:600, color:'#101828'});",
    call(ctx, [ref]) {
      if (typeof ref !== 'string' || !PHOTO_REF_PATTERN.test(ref)) {
        throw new LakarError('SCHEMA_INVALID', `photo: ref harus 'unsplash:<id>', 'wikimedia:<id>', 'openverse:<uuid>' atau 'pexels:<id>', bukan ${show(ref)}`, {
          hint: "pakai ref dari hasil photo_search apa adanya, mis. photo('unsplash:Kq3wLm8xT0a')",
        });
      }
      const info = ctx.photos?.resolve(ref);
      if (!info) {
        throw new LakarError('NOT_FOUND', `photo: foto ${ref} belum diimpor`, {
          hint: "pakai ref literal dari photo_search langsung di kode, mis. photo('unsplash:Kq3wLm8xT0a') (bukan variabel atau string rakitan), agar daemon mengimpornya sebelum snippet berjalan",
        });
      }
      return JSON.parse(JSON.stringify(info)) as unknown;
    },
  },
};

function isUnder(parents: ReadonlyMap<string, string | null>, e: Entry, ancestorId: string): boolean {
  let p = e.parentId;
  while (p !== null) {
    if (p === ancestorId) return true;
    p = parents.get(p) ?? null;
  }
  return false;
}

/** Nama semua global snippet (fungsi API + keep + console). */
export const SNIPPET_GLOBALS: readonly string[] = [...Object.keys(API), 'keep', 'console.log'];

// ---------------------------------------------------------------------------
// Referensi node/properti/respons (sumber `api.md`, AD-12)
// ---------------------------------------------------------------------------

/** Satu bagian referensi: butir ringkas + contoh opsional (snippet mandiri yang sukses di dokumen kosong). */
export type ApiReferenceSection = { title: string; items: readonly string[]; example?: string };

/** Referensi node, properti, respons execute, dan kode error. Dipakai `renderApiMarkdown()`. */
export const API_REFERENCE: readonly ApiReferenceSection[] = [
  {
    title: 'Katalog node v1',
    items: [
      "Tertutup: board, frame, text, rect, ellipse, path, icon, instance (bagian Komponen). Kunci di luar skema → SCHEMA_INVALID. Semua node anak wajib `name`.",
      "board (parent null): `{type:'board', name, x, y, width, height, screen:'landing'|'app'|'mobile', expectedSize?:{width,height}, fills?, themeMode?:string}` (themeMode harus ada di tokenModes). Selalu clip; anak disusun kolom dari kiri atas (seperti frame `layout:'column'`, align start).",
      "frame: `layout?:'none'|'row'|'column'|'grid'` (default `'none'` = semua anak absolut di x/y, default 0,0; grid: bagian Grid), `gap?` (boleh negatif), `padding?`, `align?:'start'|'center'|'end'|'stretch'` (sumbu silang), `justify?:'start'|'center'|'end'|'space-between'` (sumbu utama), `wrap?:boolean` (v9, hanya row/column: `true` = anak membungkus ke baris/kolom berikut; jarak antarbaris = `rowGap` di row, `columnGap` di column), `clip?`, `scrollY?` (geser isi ke atas), `tag?` (elemen HTML untuk ekspor kode: header|nav|main|section|article|aside|footer|figure|figcaption|blockquote|ul|ol|li|h1–h6|p|button|a), sizing, cat, radius, efek.",
      "text: `content, size, family?` (default Inter), `weight?` (100–900, default 400), `style?:'normal'|'italic'`, `lineHeight?` (px), `letterSpacing?` (em), `align?:'left'|'center'|'right'|'justify'`, `wrap?`, `numeric?:'proportional'|'tabular'`, `color?` (default #000000), `tag?` (seperti frame), sizing, efek.",
      'rect: sizing, cat, radius, efek. ellipse: sizing, cat, efek + `startDeg?` (0 = jam 12, searah jarum jam), `sweepDeg?` (-360..360), `inner?` (rasio lubang [0,1)) untuk busur/ring.',
      "path: `d` (SVG path), `viewBox:[x,y,w,h]`, sizing, cat, efek; vektor opsional `fillRule?:'nonzero'|'evenodd'`, `strokeLinecap?:'butt'|'round'|'square'`, `strokeLinejoin?:'miter'|'round'|'bevel'`, `strokeDasharray?` (px kotak render seperti stroke.width, bukan unit viewBox: kalikan skala saat menyalin dari SVG), `strokeMiterlimit?` (1..100), `svg?` (nilai string, mis. {'stroke-opacity':'0.5'}; allowlist: fill-opacity, paint-order, shape-rendering, stroke-dashoffset (px), stroke-opacity). " +
        'icon: `lib, icon, size, color?, strokeWidth?, filled?`, efek (lihat add).',
    ],
    example:
      `${BOARD}\nconst f = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8, padding:16, width:'fill', radius:12, fills:[{type:'solid', color:'#F6F7F9'}]});\n` +
      "add(f, {type:'text', name:'Judul', content:'Ringkasan', size:20, lineHeight:28, weight:600, color:'#101828'});\n" +
      "add(f, {type:'ellipse', name:'Ring', width:64, height:64, inner:0.8, startDeg:0, sweepDeg:216, fills:[{type:'solid', color:'#4F46E5'}]});\n" +
      "add(f, {type:'path', name:'Shape / Gelombang', d:'M0 8 Q 12 0 24 8 T 48 8', viewBox:[0,0,48,16], stroke:{color:'#0F766E', width:2, align:'center'}});",
  },
  {
    title: 'Sizing',
    items: [
      "`width`/`height`: angka (fixed) | `'hug'` (ikut isi) | `'fill'` (isi sisa ruang di sumbu utama parent, regang di sumbu silang) + `minWidth`/`maxWidth`/`minHeight`/`maxHeight`.",
      "Tanpa width/height: ikut isi di sumbu utama; di sumbu silang ikut `align` parent (board: start = ikut isi). `'fill'` butuh parent yang ukurannya diketahui.",
      "Teks: `wrap` default `'auto'` (satu baris, tidak dibungkus) bila width kosong/'hug', `'wrap'` bila width angka/'fill' (tinggi ikut isi). `'fixed'` = kotak width×height apa adanya. Paragraf: beri width angka atau 'fill'.",
      'icon: kotak `size`×`size`. path tanpa width/height (atau hug) memakai ukuran viewBox.',
    ],
    example:
      `${BOARD}\nconst row = add(b, {type:'frame', name:'Baris', layout:'row', gap:12, width:'fill', padding:[0,20], align:'center'});\n` +
      "add(row, {type:'text', name:'Paragraf', content:'Teks panjang yang dibungkus mengikuti lebar sisa baris ini.', size:16, lineHeight:24, width:'fill'});\n" +
      "add(row, {type:'rect', name:'Penanda', width:24, height:24, radius:6, fills:[{type:'solid', color:'#2563EB'}]});",
  },
  {
    title: 'Padding dan posisi',
    items: [
      '`padding`: angka | `[vertikal, horizontal]` | `[atas, kanan, bawah, kiri]` (urutan CSS).',
      "`position:'absolute'` + `x`/`y`: relatif kotak parent, keluar dari flow (x/y tanpa position di parent flow → SCHEMA_INVALID). Anak frame `layout:'none'` selalu absolut: x/y diterima, `position:'absolute'` ditambahkan otomatis (tetap absolut bila layout frame diubah). Pakai untuk node `Overlay /`; selebihnya flex.",
    ],
    example:
      `${BOARD}\nconst bar = add(b, {type:'frame', name:'Overlay / Tab bar', position:'absolute', x:20, y:746, width:350, height:64, layout:'row', padding:[0,8], align:'center', radius:24, fills:[{type:'solid', color:'#FFFFFF'}], stroke:{color:'#E4E7EC', width:1, align:'inside'}});\n` +
      "add(bar, {type:'icon', lib:'lucide', icon:'house', size:24, color:'#2563EB'});",
  },
  {
    title: 'Grid',
    items: [
      "Frame `layout:'grid'` + `gridTemplateColumns?`/`gridTemplateRows?`: array 1-24 track; track = angka (px) | `{fr:1}` | `'auto'` | `{minmax:[min, max]}` (min px|'auto', max px|fr|'auto'). Tanpa string CSS dan tanpa repeat(): tulis tiap track. Tanpa template = satu kolom.",
      "`columnGap?`/`rowGap?` (≥ 0, boleh token) menimpa `gap` per sumbu; `gap` negatif diabaikan di grid. `align` = posisi item di sel (sumbu vertikal), `justify` = distribusi track.",
      "Anak: `gridColumn?`/`gridRow?` `{start?, end?, span?}` (garis mulai 1, negatif dari ujung; end dan span tidak bersamaan), mis. `{span:2}`. Anak tanpa width meregang selebar sel; tanpa height meregang setinggi sel hanya bila `align` kosong/'stretch' (selain itu ikut isi: beri height). `'fill'` = regang, `'hug'` = ikut isi.",
    ],
    example:
      `${BOARD}\nconst g = add(b, {type:'frame', name:'Grid kartu', layout:'grid', gridTemplateColumns:[{fr:1}, {fr:1}], columnGap:12, rowGap:12, padding:16, width:'fill'});\n` +
      "for (const n of ['Satu', 'Dua']) add(g, {type:'rect', name:'Kartu ' + n, height:80, radius:12, fills:[{type:'solid', color:'#F2F4F7'}]});\n" +
      "add(g, {type:'rect', name:'Kartu lebar', height:80, radius:12, gridColumn:{span:2}, fills:[{type:'solid', color:'#E0E7FF'}]});",
  },
  {
    title: 'Cat, stroke, radius',
    items: [
      "`fills[]` (frame/rect/ellipse/path/board): `fills[0]` lapisan paling bawah. `{type:'solid', color}` | `{type:'linear', angle, stops:[{offset, color}]}` (sudut ala CSS: 0 = ke atas, 90 = ke kanan, searah jarum jam) | `{type:'radial', center?:[cx,cy] (0..1, default tengah), radius? (relatif kotak, default 0.5), stops}` | `{type:'image', assetId, fit:'cover'|'contain'|'fill'|'tile'}` | fill efek `conic`/`noise`/`mesh` (bagian Fill efek).",
      "Warna: `'#RRGGBB'` atau `'#RRGGBBAA'` (alpha di 2 digit akhir, mis. tint `#2563EB14`). rgba()/nama warna ditolak.",
      "`stroke: {color, width, align:'inside'|'center'|'outside', sides?:['top'|'right'|'bottom'|'left']}`; pemisah satu sisi = `sides:['bottom']`.",
      '`radius` (frame/rect): angka atau `[kiriAtas, kananAtas, kananBawah, kiriBawah]`.',
    ],
    example:
      `${BOARD}\nadd(b, {type:'rect', name:'Latar', width:390, height:200, fills:[{type:'solid', color:'#0B0C0F'}, {type:'radial', center:[0.8,0.2], radius:0.6, stops:[{offset:0, color:'#2563EB66'}, {offset:1, color:'#2563EB00'}]}]});\n` +
      "add(b, {type:'frame', name:'Garis bawah', width:'fill', height:48, stroke:{color:'#E4E7EC', width:1, align:'inside', sides:['bottom']}});",
  },
  {
    title: 'Fill efek',
    items: [
      "`{type:'conic', angle?, center?, stops}`: gradien sudut; `angle` derajat titik awal (0 = atas, searah jarum jam, default 0), `center?:[cx,cy]` 0..1 (default tengah), stops minimal 2. Untuk ring/donut progres bergradasi (ellipse `inner`) dan sorotan berputar.",
      "`{type:'noise', opacity, size?, seed?, blend?, mono?}`: grain ber-seed (seed sama → piksel sama). `opacity` 0..1 (grain halus 0.04–0.10), `size` ukuran butir px 0.5–8 (default 1.5), `seed` bulat 0..9999 (default 1), `blend` 'overlay' (default) | 'soft-light' | 'multiply' | 'screen' | 'normal', `mono` default true. Dicampur hanya dengan fill di bawahnya pada node yang sama: letakkan setelah gradien/mesh.",
      "`{type:'mesh', columns, rows, colors, points?}`: medan warna dari titik kendali (rata dan mulus, tanpa tepi). `columns`/`rows` bulat 2..5; `colors` tepat columns×rows warna, baris demi baris dari kiri atas; `points?` tepat columns×rows `[x,y]` 0..1 (default grid rata). Jumlah tidak cocok → SCHEMA_INVALID. Dirender sebagai bitmap (sisi ≤ 512 px) yang diskalakan ke kotak; pada ellipse/path ikut bentuknya.",
      'Warna fill efek boleh token `{$token}` seperti stops. Teks di atas efek: taruh di bagian medan yang tenang atau di atas permukaan solid/scrim.',
    ],
    example:
      `${BOARD}\nconst hero = add(b, {type:'frame', name:'Hero / Medan', width:390, height:320, layout:'column', justify:'end', padding:24, fills:[{type:'solid', color:'#0B1020'}, {type:'mesh', columns:3, rows:2, colors:['#0B1020', '#1D4ED8', '#0B1020', '#0E7490', '#0B1020', '#0B1020'], points:[[0,0], [0.7,0.1], [1,0], [0.2,0.8], [0.6,1], [1,1]]}, {type:'noise', opacity:0.06, seed:7}]});\n` +
      "add(hero, {type:'text', name:'Judul', content:'Malam yang tenang', size:28, lineHeight:36, weight:600, color:'#F8FAFC'});\n" +
      "add(b, {type:'ellipse', name:'Ring progres', width:80, height:80, inner:0.8, startDeg:0, sweepDeg:300, fills:[{type:'conic', angle:0, stops:[{offset:0, color:'#22D3EE'}, {offset:0.83, color:'#2563EB'}, {offset:1, color:'#2563EB'}]}]});",
  },
  {
    title: 'Efek',
    items: [
      "Semua node anak: `shadows[]` `{x, y, blur, spread?, color, type?:'drop'|'inner'}` (makna sama dengan CSS box-shadow), `opacity` 0..1, `blend`, `blur`, `backdropBlur`, `rotation` (derajat, searah jarum jam, poros tengah, tidak memengaruhi layout).",
      'Keterbatasan: pada ellipse busur/ring, path, dan icon bayangan mengikuti bentuk tetapi `spread` dan `inner` tidak didukung; `stroke.sides` diabaikan pada ellipse busur dan path. Text: hanya bayangan drop.',
    ],
    example:
      `${BOARD}\nadd(b, {type:'frame', name:'Kartu terangkat', width:200, height:120, radius:12, fills:[{type:'solid', color:'#FFFFFF'}], shadows:[{x:0, y:4, blur:16, color:'#10182814'}]});`,
  },
  {
    title: 'Token',
    items: [
      "`setTokens({'colors.primary':'#0F62FE', 'spacing.4':16})`; nilai properti boleh `{$token:'colors.primary'}` (token harus ada → selain itu TOKEN_UNKNOWN). get/find mengembalikan referensi apa adanya.",
      "Token bertipe `{type, value, modes?}`: warna → color; radius/gap/columnGap/rowGap/padding/ukuran/stroke.width/size icon → radius|spacing|container|breakpoint; text size → fontSize; family/weight/lineHeight/letterSpacing → tipe senama. Salah slot → SCHEMA_INVALID.",
      'Nilai per tipe (value dan modes): color hex #RRGGBB/#RRGGBBAA; fontFamily string tak kosong; fontWeight 100–900 kelipatan 100; lineHeight > 0; letterSpacing angka apa pun; tipe lain angka ≥ 0.',
      "Mode tema: `setTokenModes(['light','dark'])`, token `modes:{dark:'#000000'}`, board `themeMode:'dark'` (default mode pertama).",
      "Baca: `getTokens()` → `{tokens, modes}`. Ganti nama: `renameToken(from, to)` (semua ref ikut). Dari codebase: `importCssVariables(css)` (`:root` + `[data-theme]`; variabel CSS = `--` + nama dengan `.` → `-`).",
    ],
  },
  {
    title: 'Komponen',
    items: [
      'Master = node anak biasa ber-`component` (`setComponent(id, def?)`). Instance = `{type:\'instance\', name, componentId, props?, position?, x?, y?}`: isinya tidak disimpan, selalu mengikuti master (ubah master → semua instance berubah, override tetap).',
      "Isi instance dialamati `'<instanceId>/<idNodeMaster>'` (bersarang: `I/J/x`). `get(alamat)` = node efektif; `update(alamat, patch)` = override di instance terluar; `resetOverride(alamat, props?)` mengembalikan ke master. move/remove/replace pada isi instance → SCHEMA_INVALID.",
      "Props `{name, type:'text'|'boolean'|'enum', default, options?, binds:[{nodeId, prop}]}`; nilai per instance di `props`. Slot `{name, nodeId:<frame>}`: `add('<instanceId>/<idFrameSlot>', node)` mengisi slot (isi slot = node tersimpan biasa, ID sendiri).",
      '`detach(instanceId)` → node biasa ber-ID baru. Menghapus master men-detach semua instancenya di commit yang sama. Override/prop yang tidak lagi cocok dengan master diabaikan dan dilaporkan check LC-32.',
    ],
    example:
      `${BOARD}\nconst k = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8, padding:16, fills:[{type:'solid', color:'#F2F4F7'}]});\n` +
      "const t = add(k, {type:'text', name:'Judul', content:'Judul', size:16, lineHeight:24, weight:600});\nconst isi = add(k, {type:'frame', name:'Isi', layout:'column'});\n" +
      "add(isi, {type:'text', name:'Teks', content:'Isi kartu', size:14, lineHeight:20});\n" +
      "setComponent(k, {props:[{name:'title', type:'text', default:'Judul', binds:[{nodeId:t, prop:'content'}]}], slots:[{name:'body', nodeId:isi}]});\n" +
      "const a = add(b, {type:'instance', name:'Kartu A', componentId:k, props:{title:'Promo'}});\n" +
      "update(a + '/' + t, {color:'#B42318'});\nadd(a + '/' + isi, {type:'text', name:'Catatan', content:'Diskon 20%', size:14, lineHeight:20});\n" +
      "update(k, {fills:[{type:'solid', color:'#FFFFFF'}]});\nget(a + '/' + t).content;",
  },
  {
    title: 'Respons execute',
    items: [
      'Sukses: `{docId, rev, created:[{id, name, path}], value?, valueTruncated?, logs?, check?, bounds?, boundsTruncated?}`. `value` = nilai ekspresi terakhir (JSON). Snippet tanpa op mutasi tidak menaikkan rev (tanpa check/bounds).',
      '`check {boards, summary:{error, warning, gate}, findings:[{level, rule, nodeId, nodeName, detail, expected}]}`: board yang disentuh dirender dan dicek sebelum commit. Temuan tidak membatalkan commit; perbaiki lalu execute lagi.',
      '`bounds {id:[x,y,w,h]}`: dibulatkan, relatif board, untuk board tersentuh, node baru, dan node berubah (maks 60). Pakai untuk tinggi akhir board landing.',
      'Pratinjau `dryRun:true`: ops dijalankan pada salinan lalu dibuang — rev/riwayat/undo/keep tidak berubah. Respons berisi `changes {added, updated:[{…node, props}], deleted, moved, other, counts}` per node (ref `{id, type, name?, pageId, boardId}`); `other` menandai perubahan non-node (`tokens`, `comments`, `pages`). Temuan `check` sama seperti commit sungguhan. ID pada `added`/`created` hanya berlaku untuk pratinjau itu — commit sungguhan mencetak ID baru.',
      'Gagal: rollback penuh; error menyebut baris:kolom dan membawa `editId`. Perbaiki tanpa mengirim ulang kode: `execute({editId, edits:[{find, replace}]})` (find muncul tepat sekali; description diwarisi; edits kosong = jalankan ulang; editId hilang saat daemon restart).',
    ],
  },
  {
    title: 'Kode error',
    items: [
      'SCHEMA_INVALID: properti/kunci/nilai salah (pesan menyebut path). NOT_FOUND: ID/dokumen/aset/skill/foto tidak ada. CONFLICT: perubahan bersamaan (dicadangkan).',
      `NO_ACTIVE_DOC: panggil open_doc dulu. EXEC_TIMEOUT: snippet > ${DEFAULT_TIMEOUT_MS / 1000} detik. EXEC_ERROR: error JavaScript atau > ${MAX_OPS} op.`,
      'ICON_UNKNOWN: nama ikon tidak ada (+3 saran). TOKEN_UNKNOWN: token belum di-setTokens. FONT_MISSING: keluarga/weight tidak terdaftar atau karakter di luar latin/latin-ext (ganti dengan node icon).',
      'RENDER_FAILED (retryable): render gagal, coba lagi. EXPORT_FAILED: PNG gagal ditulis. VERSION_MISMATCH: versi mcp ≠ lakard (restart service).',
    ],
  },
];
