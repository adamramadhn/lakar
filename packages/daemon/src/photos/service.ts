// Layanan foto stok daemon: pencarian (Unsplash dengan key → Wikimedia Commons → cadangan Openverse) dengan tangga kata
// kunci, cache hasil cari (memori + disk `<dataDir>/cache/photo-search/`), impor on-demand, dan `resolve` sinkron untuk
// fungsi snippet `photo(ref)` (AD-7: snippet sinkron; jaringan terjadi di daemon sebelum snippet).
// - Wikimedia/Openverse (dan ref Pexels lama): byte diunduh ke store aset beralamat hash + metadata sidecar.
// - Unsplash: **aset jarak jauh** (hotlink resmi). Meta menyimpan URL dari API, tanpa byte di `assets/`; rute
//   `/assets/<id>` menyajikannya lewat cache render `<dataDir>/cache/remote-images/` (Cache-Control, ≤ 30 hari,
//   ≤ 256 MB, boleh dihapus kapan saja); cache dingin + jaringan gagal → placeholder PNG berwarna foto.
//   `download_location` dipanggil sekali per (ref, docId).
// Key hanya dibaca dari file (mode 600, milik uid daemon), dibaca ulang bila berubah, dan tidak pernah masuk pesan
// error, status, metadata, cache, indeks, atau log.
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PhotoInfo, PhotoLibraryPort } from '@lakar/ports';
import { LakarError } from '@lakar/schema';
import { imageSize, rasterType, solidPng, writeAsset, writeAssetMeta, writeFileAtomic, type AssetMeta } from '../assets.js';
import { NetError, SafeNet } from './net.js';
import {
  IMAGE_MAX_BYTES,
  OpenverseProvider,
  PexelsProvider,
  UnsplashProvider,
  WikimediaMaxlagError,
  WikimediaProvider,
  parseRef,
  type Orientation,
  type PhotoCandidate,
  type PhotoProvider,
  type ProviderName,
} from './providers.js';

export const THUMB_MAX_BYTES = 512 * 1024;
export const THUMB_TIMEOUT_MS = 5000;
export const IMAGE_TIMEOUT_MS = 20_000;
/** Ambil gambar jarak jauh untuk render (cache dingin): batas waktu agar render tidak menggantung. */
export const REMOTE_TIMEOUT_MS = 10_000;
/** Impor per execute: maks ref baru, paralel, dan batas waktu total. */
export const IMPORT_MAX_REFS = 6;
export const IMPORT_PARALLEL = 3;
export const IMPORT_TOTAL_MS = 30_000;
export const SEARCH_CACHE_MAX = 200;
export const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Cache cari di disk (bertahan saat restart): maks entri. */
export const SEARCH_DISK_MAX = 500;
export const SEARCH_LIMIT_DEFAULT = 6;
export const SEARCH_LIMIT_MAX = 12;
/** Maks anak tangga kata kunci per penyedia. */
export const LADDER_MAX = 3;
/** Maks thumbnail pratinjau per pencarian. */
export const THUMBNAILS_MAX = 6;
/** Batas total byte cache thumbnail di memori. */
const THUMB_CACHE_BYTES = 24 * 1024 * 1024;
/** Cache render gambar jarak jauh: umur maks dan total byte (LRU menurut waktu akses). */
export const REMOTE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const REMOTE_CACHE_DEFAULT_AGE_MS = 24 * 60 * 60 * 1000;
export const REMOTE_CACHE_MAX_BYTES = 256 * 1024 * 1024;
/** Unsplash `X-Ratelimit-Remaining` = 0 → Unsplash dilewati selama ini (batas Unsplash per jam). */
export const UNSPLASH_COOLDOWN_MS = 60 * 60 * 1000;
export const DEFAULT_UNSPLASH_APP_NAME = 'lakar';

export type KeyFileState = 'present' | 'absent' | 'insecure' | 'invalid';
/** Alasan penyedia sebelumnya dilewati (key/Unsplash → provider `wikimedia`; Wikimedia → provider `openverse`). */
export type FallbackReason =
  | 'no-key'
  | 'key-insecure'
  | 'key-invalid'
  | 'unsplash-401'
  | 'unsplash-429'
  | 'unsplash-5xx'
  | 'unsplash-timeout'
  | 'unsplash-error'
  | 'unsplash-empty'
  | 'pexels-401'
  | 'pexels-429'
  | 'pexels-5xx'
  | 'pexels-timeout'
  | 'pexels-error'
  | 'pexels-empty'
  | 'wikimedia-5xx'
  | 'wikimedia-429'
  | 'wikimedia-timeout'
  | 'wikimedia-maxlag'
  | 'wikimedia-error'
  | 'wikimedia-empty';

/** Kandidat untuk klien (tanpa URL unduhan/thumbnail penyedia). */
export type PhotoResult = {
  ref: string;
  width: number;
  height: number;
  alt: string;
  avgColor?: string;
  creator: string;
  license: string;
  sourcePageUrl: string;
  credit: string;
};
export type Thumbnail = { ref: string; mimeType: string; data: string };
/** Satu anak tangga yang dicoba: penyedia + kueri (+ orientation). */
export type Tried = { provider: ProviderName; query: string; orientation?: Orientation };
export type SearchResponse = {
  provider: ProviderName;
  fallbackReason?: FallbackReason;
  /** Kueri yang menghasilkan kandidat (bisa lebih sederhana dari permintaan). */
  query: string;
  /** Anak tangga yang dicoba, berurutan (yang terakhir = yang dipakai). */
  tried: Tried[];
  results: PhotoResult[];
  thumbnails: Thumbnail[];
};
export type PhotoStatus = { provider: ProviderName; keyFile: KeyFileState; imported: number };

export type PhotoServiceOptions = {
  dataDir: string;
  /** Path file key Pexels lama (config `pexels_key_file`): hanya untuk lookup ref `pexels:` lama, bukan pencarian. */
  keyFile: string;
  /** Path file key Unsplash (config `unsplash_key_file`); tidak ada → rantai Wikimedia → Openverse. */
  unsplashKeyFile?: string;
  /** `utm_source` atribusi Unsplash (config `unsplash_app_name`, default `lakar`). */
  unsplashAppName?: string;
  /** Hanya untuk tes: klien jaringan (allowlist/lookup/transport diinjeksi). */
  net?: SafeNet;
  /** Hanya untuk tes: uid pemilik yang diharapkan (default uid proses). */
  uid?: number;
  /** Hanya untuk tes: jam. */
  now?: () => number;
};

type CacheEntry<T> = { at: number; value: T };

/** LRU sederhana berbasis urutan sisip Map, dengan TTL. */
class Lru<T> {
  readonly #max: number;
  readonly #ttl: number;
  readonly #now: () => number;
  readonly #map = new Map<string, CacheEntry<T>>();
  constructor(max: number, ttl: number, now: () => number) {
    this.#max = max;
    this.#ttl = ttl;
    this.#now = now;
  }
  get(k: string): T | undefined {
    const e = this.#map.get(k);
    if (!e) return undefined;
    if (this.#now() - e.at > this.#ttl) {
      this.#map.delete(k);
      return undefined;
    }
    this.#map.delete(k);
    this.#map.set(k, e);
    return e.value;
  }
  set(k: string, value: T, at = this.#now()): void {
    this.#map.delete(k);
    this.#map.set(k, { at, value });
    while (this.#map.size > this.#max) this.#map.delete(this.#map.keys().next().value!);
  }
}

type IndexFile = { version: 1; refs: Record<string, string> };
type DiskSearchEntry = { v: 1; key: string; at: number; results: PhotoCandidate[] };
type RemoteCacheMeta = { v: 1; url: string; type: string; bytes: number; expires: number };

const RETRY_HINT = 'coba lagi sebentar lagi';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** NetError → LakarError (pesan sudah tersanitasi). */
function netToLakar(e: unknown, what: string, provider?: ProviderName): LakarError {
  if (e instanceof LakarError) return e;
  if (e instanceof NetError) {
    if (e.kind === 'blocked') {
      return new LakarError('EXEC_ERROR', `${what} ditolak: ${e.message}`, { hint: 'sumber ini ditolak kebijakan jaringan daemon; pilih kandidat lain dari photo_search', retryable: false });
    }
    if (e.kind === 'too-large') return new LakarError('EXEC_ERROR', `${what}: ${e.message}`, { hint: 'pilih kandidat lain dari photo_search', retryable: false });
    if (e.status === 429) {
      const hint =
        provider === 'openverse'
          ? 'batas permintaan anonim Openverse tercapai; tunggu sekitar 1 menit lalu ulangi, dan pakai ulang ref dari hasil photo_search sebelumnya (tersimpan 24 jam)'
          : provider === 'wikimedia'
            ? 'batas permintaan Wikimedia Commons tercapai; tunggu sebentar lalu ulangi, dan pakai ulang ref dari hasil photo_search sebelumnya (tersimpan 24 jam)'
            : `batas permintaan penyedia tercapai; ${RETRY_HINT}`;
      return new LakarError('EXEC_ERROR', `${what}: ${e.message}`, { hint, retryable: true });
    }
    return new LakarError('EXEC_ERROR', `${what}: ${e.message}`, { hint: e.retryable ? RETRY_HINT : 'pilih kandidat lain dari photo_search', retryable: e.retryable });
  }
  return new LakarError('EXEC_ERROR', `${what}: kesalahan tak terduga`, { hint: RETRY_HINT, retryable: true });
}

function wikimediaReason(e: unknown): FallbackReason {
  if (e instanceof WikimediaMaxlagError) return 'wikimedia-maxlag';
  if (e instanceof NetError) {
    if (e.status === 429) return 'wikimedia-429';
    if ((e.status ?? 0) >= 500) return 'wikimedia-5xx';
    if (e.kind === 'timeout') return 'wikimedia-timeout';
  }
  return 'wikimedia-error';
}

function unsplashReason(e: unknown): FallbackReason {
  if (e instanceof NetError) {
    if (e.status === 401 || e.status === 403) return 'unsplash-401';
    if (e.status === 429) return 'unsplash-429';
    if ((e.status ?? 0) >= 500) return 'unsplash-5xx';
    if (e.kind === 'timeout') return 'unsplash-timeout';
  }
  return 'unsplash-error';
}

const toResult = (c: PhotoCandidate): PhotoResult => ({
  ref: c.ref,
  width: c.width,
  height: c.height,
  alt: c.alt,
  ...(c.avgColor ? { avgColor: c.avgColor } : {}),
  creator: c.creator,
  license: c.license,
  sourcePageUrl: c.sourcePageUrl,
  credit: c.credit,
});

/** Jalankan `fn` atas `items` dengan paralelisme `n`; semua dijalankan sampai selesai (allSettled). */
async function pool<T, R>(items: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: 'fulfilled', value: await fn(items[i]!) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

// ---------------------------------------------------------------------------
// Tangga kata kunci
// ---------------------------------------------------------------------------

/** Kata pengisi yang dibuang sebelum menyederhanakan kueri. */
const STOP = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'in', 'on', 'at', 'for', 'to', 'by', 'from', 'photo', 'photos', 'image', 'picture', 'stock', 'unsplash', 'yang', 'dan', 'di', 'foto']);
/** Kata orang: kategori anak tangga terakhir = `portrait`. */
const PERSON =
  /^(portrait|portraits|person|people|man|men|woman|women|girl|boy|guy|lady|owner|chef|cook|farmer|doctor|nurse|teacher|student|worker|barista|baker|waiter|waitress|mechanic|driver|founder|ceo|manager|customer|staff|team|employee|entrepreneur|seller|vendor|artist|designer|developer|engineer|athlete|runner|coach|mother|father|family|couple|child|kid|senior|elderly|smiling|headshot|face|orang|pria|wanita|pemilik|koki|petani|guru|dokter)$/;

/**
 * Anak tangga (maks 3, berbeda): (1) kueri apa adanya; (2) dua kata isi pertama bila ≥ 3 kata isi; (3) kata kategori
 * (kata orang → `portrait`, selain itu kata isi terakhir) tanpa orientation.
 */
export function queryLadder(query: string, orientation?: Orientation): { query: string; orientation?: Orientation }[] {
  const q = query.trim().replace(/\s+/g, ' ');
  const words = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((w) => w && !STOP.has(w));
  const steps: { query: string; orientation?: Orientation }[] = [{ query: q, ...(orientation ? { orientation } : {}) }];
  if (words.length >= 3) steps.push({ query: words.slice(0, 2).join(' '), ...(orientation ? { orientation } : {}) });
  const cat = words.some((w) => PERSON.test(w)) ? 'portrait' : (words.at(-1) ?? q);
  steps.push({ query: cat });
  const seen = new Set<string>();
  return steps
    .filter((s) => {
      const k = `${s.query.toLowerCase()}|${s.orientation ?? ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, LADDER_MAX);
}

/** `Cache-Control` → umur cache (ms, ≤ 30 hari); `no-store` → 0. */
export function cacheAge(cc: string | undefined): number {
  if (cc && /(?:^|,)\s*no-store\b/i.test(cc)) return 0;
  const m = cc ? /(?:^|,)\s*(?:s-)?max-age=(\d+)/i.exec(cc) : null;
  const ms = m ? Number(m[1]) * 1000 : REMOTE_CACHE_DEFAULT_AGE_MS;
  return Math.min(ms, REMOTE_CACHE_MAX_AGE_MS);
}

/** `#RRGGBB` → RGB (default abu netral). */
function rgbOf(hex: string | undefined): [number, number, number] {
  const m = hex ? /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) : null;
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [0xd0, 0xd5, 0xdd];
}

export class PhotoService implements PhotoLibraryPort {
  readonly #dataDir: string;
  readonly #pexelsKeyFile: string;
  readonly #unsplashKeyFile: string | undefined;
  readonly #appName: string;
  readonly #net: SafeNet;
  readonly #uid: number | undefined;
  readonly #now: () => number;
  readonly #wikimedia: WikimediaProvider;
  readonly #openverse: OpenverseProvider;
  readonly #search: Lru<PhotoCandidate[]>;
  readonly #candidates: Lru<PhotoCandidate>;
  readonly #thumbs = new Map<string, { mimeType: string; data: string; bytes: number }>();
  #thumbBytes = 0;
  /** ref → info foto terimpor (dari indeks + meta). */
  readonly #imported = new Map<string, PhotoInfo>();
  /** assetId → meta aset jarak jauh (Unsplash). */
  readonly #remote = new Map<string, AssetMeta>();
  /** `ref|docId` yang sudah memicu `download_location`. */
  readonly #tracked = new Set<string>();
  readonly #inflight = new Map<string, Promise<void>>();
  readonly #remoteInflight = new Map<string, Promise<{ type: string; body: Buffer; maxAge: number } | undefined>>();
  /** assetId → saat terakhir disajikan sebagai placeholder (dihapus begitu foto asli tersaji). */
  readonly #placeholders = new Map<string, number>();
  #indexWrite: Promise<void> = Promise.resolve();
  #metaWrite: Promise<void> = Promise.resolve();
  readonly #keys = new Map<string, { sig: string; state: KeyFileState; key?: string }>();
  #pexels: { key: string; provider: PexelsProvider } | undefined;
  #unsplash: { key: string; provider: UnsplashProvider } | undefined;
  /** Unsplash dilewati sampai saat ini (X-Ratelimit-Remaining = 0). */
  #unsplashBlockedUntil = 0;

  constructor(opts: PhotoServiceOptions) {
    this.#dataDir = opts.dataDir;
    this.#pexelsKeyFile = opts.keyFile;
    this.#unsplashKeyFile = opts.unsplashKeyFile;
    this.#appName = opts.unsplashAppName?.trim() || DEFAULT_UNSPLASH_APP_NAME;
    this.#net = opts.net ?? new SafeNet();
    this.#uid = opts.uid ?? process.getuid?.();
    this.#now = opts.now ?? Date.now;
    this.#wikimedia = new WikimediaProvider(this.#net);
    this.#openverse = new OpenverseProvider(this.#net);
    this.#search = new Lru(SEARCH_CACHE_MAX, SEARCH_CACHE_TTL_MS, this.#now);
    this.#candidates = new Lru(SEARCH_CACHE_MAX * SEARCH_LIMIT_MAX, SEARCH_CACHE_TTL_MS, this.#now);
    this.#loadIndex();
  }

  get indexPath(): string {
    return join(this.#dataDir, 'photos', 'index.json');
  }
  get #searchDir(): string {
    return join(this.#dataDir, 'cache', 'photo-search');
  }
  get #remoteDir(): string {
    return join(this.#dataDir, 'cache', 'remote-images');
  }

  #loadIndex(): void {
    let idx: IndexFile;
    try {
      idx = JSON.parse(readFileSync(this.indexPath, 'utf8')) as IndexFile;
    } catch {
      return;
    }
    for (const [ref, sha] of Object.entries(idx.refs ?? {})) {
      if (!parseRef(ref) || !/^[a-f0-9]{64}$/.test(sha)) continue;
      try {
        const meta = JSON.parse(readFileSync(join(this.#dataDir, 'assets', 'meta', `${sha}.json`), 'utf8')) as AssetMeta;
        this.#imported.set(ref, infoFrom(sha, meta));
        if (meta.remote) {
          this.#remote.set(sha, meta);
          for (const d of meta.downloads ?? []) this.#tracked.add(`${ref}|${d.docId}`);
        }
      } catch {
        // Meta hilang/rusak: ref dianggap belum diimpor (impor ulang saat dipakai).
      }
    }
  }

  /** Status file key (default: key Unsplash). Dibaca ulang hanya bila mtime/ukuran/inode/mode/uid berubah. */
  keyState(file: string | undefined = this.#unsplashKeyFile): { state: KeyFileState; key?: string } {
    if (!file) return { state: 'absent' };
    let st;
    try {
      st = statSync(file);
    } catch {
      this.#keys.delete(file);
      return { state: 'absent' };
    }
    const sig = `${st.ino}:${st.size}:${st.mtimeMs}:${st.mode}:${st.uid}`;
    const cached = this.#keys.get(file);
    if (cached?.sig === sig) return cached;
    let next: { sig: string; state: KeyFileState; key?: string };
    if (!st.isFile() || (st.mode & 0o077) !== 0 || (this.#uid !== undefined && st.uid !== this.#uid)) next = { sig, state: 'insecure' };
    else {
      let raw: string | undefined;
      try {
        raw = readFileSync(file, 'utf8');
      } catch {
        raw = undefined;
      }
      const key = raw?.trim() ?? '';
      if (raw === undefined) next = { sig, state: 'absent' };
      else if (/^[\x21-\x7e]{8,200}$/.test(key)) next = { sig, state: 'present', key };
      else next = { sig, state: key ? 'invalid' : 'absent' };
    }
    this.#keys.set(file, next);
    return next;
  }

  #pexelsProvider(): PexelsProvider | undefined {
    const k = this.keyState(this.#pexelsKeyFile);
    if (k.state !== 'present' || !k.key) return undefined;
    if (this.#pexels?.key !== k.key) this.#pexels = { key: k.key, provider: new PexelsProvider(this.#net, k.key) };
    return this.#pexels.provider;
  }

  #unsplashProvider(): UnsplashProvider | undefined {
    const k = this.keyState();
    if (k.state !== 'present' || !k.key) return undefined;
    if (this.#unsplash?.key !== k.key) this.#unsplash = { key: k.key, provider: new UnsplashProvider(this.#net, k.key, this.#appName) };
    return this.#unsplash.provider;
  }

  status(): PhotoStatus {
    const k = this.keyState();
    return { provider: k.state === 'present' ? 'unsplash' : 'wikimedia', keyFile: k.state, imported: this.#imported.size };
  }

  // -------------------------------------------------------------------------
  // Cache cari (memori + disk)
  // -------------------------------------------------------------------------

  /** Entri cache disk (hasil + saat disimpan, agar TTL tidak diperbarui saat dibaca). */
  async #diskGet(key: string): Promise<{ results: PhotoCandidate[]; at: number } | undefined> {
    try {
      const e = JSON.parse(await readFile(join(this.#searchDir, `${sha256(key)}.json`), 'utf8')) as DiskSearchEntry;
      if (e.v !== 1 || e.key !== key || !Array.isArray(e.results) || typeof e.at !== 'number') return undefined;
      if (this.#now() - e.at > SEARCH_CACHE_TTL_MS) return undefined;
      return { results: e.results.filter((c) => c && typeof c.ref === 'string' && parseRef(c.ref)), at: e.at };
    } catch {
      return undefined;
    }
  }

  async #diskSet(key: string, results: PhotoCandidate[]): Promise<void> {
    try {
      await mkdir(this.#searchDir, { recursive: true });
      const entry: DiskSearchEntry = { v: 1, key, at: this.#now(), results };
      await writeFileAtomic(join(this.#searchDir, `${sha256(key)}.json`), JSON.stringify(entry));
      const names = (await readdir(this.#searchDir)).filter((n) => n.endsWith('.json'));
      if (names.length > SEARCH_DISK_MAX) {
        const withTime = await Promise.all(names.map(async (n) => ({ n, t: (await stat(join(this.#searchDir, n)).catch(() => undefined))?.mtimeMs ?? 0 })));
        withTime.sort((a, b) => a.t - b.t);
        for (const { n } of withTime.slice(0, names.length - SEARCH_DISK_MAX)) await rm(join(this.#searchDir, n), { force: true });
      }
    } catch {
      // Cache opsional: gagal menulis tidak menggagalkan pencarian.
    }
  }

  async #cachedSearch(p: PhotoProvider, query: string, orientation: Orientation | undefined, limit: number): Promise<PhotoCandidate[]> {
    const key = `${p.name}|${orientation ?? ''}|${limit}|${query.trim().toLowerCase()}`;
    // Hit memori dikembalikan apa adanya; hit disk memakai saat simpan aslinya: TTL 24 jam tidak diperbarui oleh pembacaan.
    const mem = this.#search.get(key);
    if (mem) return mem;
    const disk = await this.#diskGet(key);
    let res: PhotoCandidate[];
    if (disk) {
      res = disk.results;
      this.#search.set(key, res, disk.at);
    } else {
      res = await p.search({ query: query.trim(), ...(orientation ? { orientation } : {}), limit });
      await this.#diskSet(key, res);
      this.#search.set(key, res);
    }
    for (const c of res) this.#candidates.set(c.ref, c);
    return res;
  }

  /**
   * Cari foto. Rantai: Unsplash (bila key valid dan tidak sedang dibatasi) → Wikimedia Commons → Openverse. Per
   * penyedia semua anak tangga kata kunci (`queryLadder`) dicoba; error penyedia → langsung penyedia berikutnya.
   * Penyedia + anak tangga pertama yang mengembalikan ≥ 1 kandidat dipakai. Semua kosong → NOT_FOUND (dengan daftar
   * yang dicoba); tak ada yang kosong dan semua gagal → EXEC_ERROR dari error terakhir.
   */
  async search(q: { query: string; orientation?: Orientation; limit?: number; preview?: boolean }): Promise<SearchResponse> {
    const limit = q.limit ?? SEARCH_LIMIT_DEFAULT;
    let fallbackReason: FallbackReason | undefined;
    const chain: PhotoProvider[] = [];
    const unsplash = this.#unsplashProvider();
    if (unsplash && this.#now() < this.#unsplashBlockedUntil) fallbackReason = 'unsplash-429';
    else if (unsplash) chain.push(unsplash);
    else {
      const st = this.keyState().state;
      fallbackReason = st === 'insecure' ? 'key-insecure' : st === 'invalid' ? 'key-invalid' : 'no-key';
    }
    chain.push(this.#wikimedia, this.#openverse);
    const ladder = queryLadder(q.query, q.orientation);
    const tried: Tried[] = [];
    let provider: ProviderName = chain[0]!.name;
    let found: { results: PhotoCandidate[]; query: string } | undefined;
    let anyEmpty = false;
    let lastError: { error: unknown; provider: ProviderName } | undefined;
    outer: for (const [i, p] of chain.entries()) {
      provider = p.name;
      const last = i === chain.length - 1;
      for (const step of ladder) {
        tried.push({ provider: p.name, query: step.query, ...(step.orientation ? { orientation: step.orientation } : {}) });
        let res: PhotoCandidate[];
        try {
          res = await this.#cachedSearch(p, step.query, step.orientation, limit);
        } catch (e) {
          lastError = { error: e, provider: p.name };
          if (!last) fallbackReason = p.name === 'unsplash' ? unsplashReason(e) : wikimediaReason(e);
          continue outer;
        } finally {
          // `remaining` 0 dipakai sekali: hit cache sesudah masa tunggu tidak memblokir ulang.
          if (p instanceof UnsplashProvider && p.remaining === 0) {
            this.#unsplashBlockedUntil = this.#now() + UNSPLASH_COOLDOWN_MS;
            p.remaining = undefined;
          }
        }
        if (res.length) {
          found = { results: res, query: step.query };
          break outer;
        }
        anyEmpty = true;
      }
      if (!last) fallbackReason = p.name === 'unsplash' ? 'unsplash-empty' : 'wikimedia-empty';
    }
    if (!found) {
      if (!anyEmpty && lastError) throw netToLakar(lastError.error, 'pencarian foto gagal', lastError.provider);
      const list = tried.map((t) => `${t.provider}:"${t.query}"${t.orientation ? `/${t.orientation}` : ''}`).join(', ');
      throw new LakarError('NOT_FOUND', `tidak ada foto untuk ${JSON.stringify(q.query)} (dicoba: ${list})`, {
        hint: 'kata kunci sudah disederhanakan otomatis; jangan mengulang pencarian: pakai visual pengganti (lihat skill interface)',
      });
    }
    // Pratinjau hanya untuk kandidat teratas (klien MCP menampilkan maks 6) agar kuota thumbnail tidak terbuang.
    const thumbnails = q.preview === false ? [] : await this.#thumbnails(found.results.slice(0, THUMBNAILS_MAX));
    return { provider, ...(fallbackReason ? { fallbackReason } : {}), query: found.query, tried, results: found.results.map(toResult), thumbnails };
  }

  async #thumbnails(cands: readonly PhotoCandidate[]): Promise<Thumbnail[]> {
    const settled = await pool(cands, cands.length, async (c): Promise<Thumbnail | undefined> => {
      const hit = this.#thumbs.get(c.thumbUrl);
      if (hit) return { ref: c.ref, mimeType: hit.mimeType, data: hit.data };
      const r = await this.#net.fetch(c.thumbUrl, { kind: 'thumb', maxBytes: THUMB_MAX_BYTES, timeoutMs: THUMB_TIMEOUT_MS });
      const mimeType = rasterType(r.body);
      if (!mimeType) return undefined;
      const data = r.body.toString('base64');
      this.#thumbs.set(c.thumbUrl, { mimeType, data, bytes: data.length });
      this.#thumbBytes += data.length;
      while (this.#thumbBytes > THUMB_CACHE_BYTES && this.#thumbs.size) {
        const [k, v] = this.#thumbs.entries().next().value!;
        this.#thumbs.delete(k);
        this.#thumbBytes -= v.bytes;
      }
      return { ref: c.ref, mimeType, data };
    });
    // Thumbnail yang gagal dilewati: pratinjau opsional, hasil tetap berguna tanpa gambar.
    return settled.flatMap((s) => (s.status === 'fulfilled' && s.value ? [s.value] : []));
  }

  // -------------------------------------------------------------------------
  // Impor
  // -------------------------------------------------------------------------

  /** Info foto terimpor (sinkron; dipakai `photo(ref)` di snippet). Aset jarak jauh tidak punya file di `assets/`. */
  resolve(ref: string): PhotoInfo | undefined {
    const info = this.#imported.get(ref);
    if (!info) return undefined;
    if (!this.#remote.has(info.assetId) && !existsSync(join(this.#dataDir, 'assets', info.assetId))) return undefined;
    return { ...info };
  }

  /**
   * Impor ref (sekali; yang sudah ada di indeks tidak diunduh ulang). Ref tidak valid → SCHEMA_INVALID; lebih dari
   * `IMPORT_MAX_REFS` ref baru → SCHEMA_INVALID; ref tidak dikenal → NOT_FOUND; gagal unduh → EXEC_ERROR.
   * `docId`: foto Unsplash yang dipakai memicu `download_location` sekali per (ref, docId); gagal → dicatat di meta.
   */
  async importRefs(refs: readonly string[], ctx: { docId?: string } = {}): Promise<void> {
    const unique = [...new Set(refs)];
    for (const ref of unique) {
      if (!parseRef(ref)) {
        throw new LakarError('SCHEMA_INVALID', `ref foto tidak valid: ${JSON.stringify(ref)}`, {
          hint: "pakai ref dari photo_search apa adanya, mis. photo('unsplash:<id>'), photo('wikimedia:<id>') atau photo('openverse:<uuid>')",
        });
      }
    }
    const need = unique.filter((r) => !this.resolve(r));
    if (need.length > IMPORT_MAX_REFS) {
      throw new LakarError('SCHEMA_INVALID', `snippet memakai ${need.length} foto baru (maks ${IMPORT_MAX_REFS} per execute)`, {
        hint: `pakai maks ${IMPORT_MAX_REFS} foto baru per execute; foto yang sudah diimpor tidak dihitung`,
      });
    }
    if (need.length) {
      const signal = AbortSignal.timeout(IMPORT_TOTAL_MS);
      const settled = await pool(need, IMPORT_PARALLEL, (ref) => this.#importOnce(ref, signal));
      const failed = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
      if (failed) throw failed.reason instanceof LakarError ? failed.reason : netToLakar(failed.reason, 'impor foto gagal');
    }
    if (ctx.docId) {
      const docId = ctx.docId;
      await Promise.all(unique.filter((r) => r.startsWith('unsplash:') && !this.#tracked.has(`${r}|${docId}`)).map((r) => this.#trackDownload(r, docId)));
    }
  }

  /** Panggil `download_location` sekali per (ref, docId); hasil (atau galat tersanitasi) dicatat di meta. */
  async #trackDownload(ref: string, docId: string): Promise<void> {
    const k = `${ref}|${docId}`;
    if (this.#tracked.has(k)) return;
    this.#tracked.add(k);
    const info = this.#imported.get(ref);
    const meta = info ? this.#remote.get(info.assetId) : undefined;
    if (!info || !meta?.remote) return;
    const at = new Date(this.#now()).toISOString();
    let error: string | undefined;
    const unsplash = this.#unsplashProvider();
    if (!unsplash) error = `key Unsplash ${this.keyState().state}`;
    else {
      try {
        await unsplash.trackDownload(meta.remote.downloadLocation);
      } catch (e) {
        error = e instanceof NetError ? e.message : 'kesalahan tak terduga';
      }
    }
    if (error) meta.downloadErrors = [...(meta.downloadErrors ?? []), { docId, at, error }];
    else meta.downloads = [...(meta.downloads ?? []), { docId, at }];
    const write = () => writeAssetMeta(this.#dataDir, info.assetId, meta).then(() => undefined);
    this.#metaWrite = this.#metaWrite.then(write, write);
    await this.#metaWrite.catch(() => undefined);
  }

  #importOnce(ref: string, signal: AbortSignal): Promise<void> {
    let p = this.#inflight.get(ref);
    if (!p) {
      p = this.#importOne(ref, signal).finally(() => this.#inflight.delete(ref));
      this.#inflight.set(ref, p);
    }
    return p;
  }

  async #candidate(ref: string): Promise<PhotoCandidate> {
    const hit = this.#candidates.get(ref);
    if (hit) return hit;
    const parsed = parseRef(ref)!;
    const notFound = () =>
      new LakarError('NOT_FOUND', `foto ${ref} tidak dikenal`, { hint: "pakai ref literal dari hasil photo_search terbaru, mis. photo('unsplash:<id>')" });
    let provider: PhotoProvider | undefined;
    if (parsed.provider === 'pexels') {
      provider = this.#pexelsProvider();
      if (!provider) throw new LakarError('NOT_FOUND', `foto ${ref} tidak dikenal (penyedia Pexels tidak aktif)`, { hint: 'jalankan photo_search lalu pakai ref dari hasilnya' });
    } else if (parsed.provider === 'unsplash') {
      provider = this.#unsplashProvider();
      if (!provider) throw new LakarError('NOT_FOUND', `foto ${ref} tidak dikenal (penyedia Unsplash tidak aktif)`, { hint: 'jalankan photo_search lalu pakai ref dari hasilnya' });
    } else provider = parsed.provider === 'wikimedia' ? this.#wikimedia : this.#openverse;
    let c: PhotoCandidate | undefined;
    try {
      c = await provider.byId(parsed.id);
    } catch (e) {
      throw netToLakar(e, `lookup foto ${ref} gagal`, parsed.provider);
    }
    if (!c) throw notFound();
    this.#candidates.set(ref, c);
    return c;
  }

  async #importOne(ref: string, signal: AbortSignal): Promise<void> {
    if (this.resolve(ref)) return;
    const c = await this.#candidate(ref);
    if (c.provider === 'unsplash') return this.#importRemote(ref, c);
    let body: Buffer;
    try {
      body = (await this.#net.fetch(c.downloadUrl, { kind: 'image', maxBytes: IMAGE_MAX_BYTES, timeoutMs: IMAGE_TIMEOUT_MS, signal })).body;
    } catch (e) {
      throw netToLakar(e, `unduh foto ${ref} gagal`, c.provider);
    }
    if (!rasterType(body)) {
      throw new LakarError('EXEC_ERROR', `unduhan foto ${ref} bukan gambar PNG/JPEG/WebP/GIF`, { hint: 'pilih kandidat lain dari photo_search', retryable: false });
    }
    const { sha, mime } = await writeAsset(this.#dataDir, body);
    const size = imageSize(body) ?? { width: c.width, height: c.height };
    const meta: AssetMeta = {
      ref,
      provider: c.provider,
      sourcePageUrl: c.sourcePageUrl,
      downloadUrl: c.downloadUrl,
      creator: c.creator,
      ...(c.creatorUrl ? { creatorUrl: c.creatorUrl } : {}),
      license: c.license,
      ...(c.licenseUrl ? { licenseUrl: c.licenseUrl } : {}),
      attribution: c.attribution ?? c.credit,
      width: size.width,
      height: size.height,
      bytes: body.byteLength,
      mime,
      importedAt: new Date(this.#now()).toISOString(),
    };
    await writeAssetMeta(this.#dataDir, sha, meta);
    this.#imported.set(ref, { ...infoFrom(sha, meta), credit: c.credit });
    await this.#saveIndex();
  }

  /** Aset jarak jauh Unsplash: meta saja (URL dari API, kredit), tanpa byte di `assets/`. */
  async #importRemote(ref: string, c: PhotoCandidate): Promise<void> {
    if (!c.downloadLocation) throw new LakarError('EXEC_ERROR', `foto ${ref} tanpa download_location`, { hint: 'pilih kandidat lain dari photo_search', retryable: false });
    const sha = sha256(ref);
    const ratio = c.width && c.height ? c.height / c.width : 2 / 3;
    const width = c.width ? Math.min(c.width, 2880) : 2880;
    const meta: AssetMeta = {
      ref,
      provider: c.provider,
      sourcePageUrl: c.sourcePageUrl,
      downloadUrl: c.downloadUrl,
      creator: c.creator,
      ...(c.creatorUrl ? { creatorUrl: c.creatorUrl } : {}),
      license: c.license,
      ...(c.licenseUrl ? { licenseUrl: c.licenseUrl } : {}),
      attribution: c.credit,
      width,
      height: Math.round(width * ratio),
      bytes: 0,
      mime: 'image/jpeg',
      importedAt: new Date(this.#now()).toISOString(),
      ...(c.avgColor ? { avgColor: c.avgColor } : {}),
      remote: { provider: 'unsplash', url: c.downloadUrl, downloadLocation: c.downloadLocation },
    };
    await writeAssetMeta(this.#dataDir, sha, meta);
    this.#remote.set(sha, meta);
    this.#imported.set(ref, infoFrom(sha, meta));
    await this.#saveIndex();
  }

  /** Tulis indeks ref → sha (atomik, berurutan). */
  #saveIndex(): Promise<void> {
    const run = async () => {
      const refs: Record<string, string> = {};
      for (const [ref, info] of this.#imported) refs[ref] = info.assetId;
      await mkdir(join(this.#dataDir, 'photos'), { recursive: true });
      await writeFileAtomic(this.indexPath, `${JSON.stringify({ version: 1, refs } satisfies IndexFile, null, 2)}\n`);
    };
    this.#indexWrite = this.#indexWrite.then(run, run);
    return this.#indexWrite;
  }

  // -------------------------------------------------------------------------
  // Aset jarak jauh untuk render (cache HTTP render + placeholder)
  // -------------------------------------------------------------------------

  /** true bila `assetId` adalah aset jarak jauh (Unsplash). */
  isRemote(assetId: string): boolean {
    return this.#remote.has(assetId);
  }

  /**
   * Byte aset jarak jauh untuk rute `/assets/<id>`: cache render segar → ambil URL hotlink resmi (timeout 10 dtk)
   * → cache basi → placeholder PNG berwarna foto. undefined bila `assetId` bukan aset jarak jauh.
   */
  async remoteAsset(assetId: string): Promise<{ type: string; body: Buffer; placeholder: boolean } | undefined> {
    const meta = this.#remote.get(assetId);
    if (!meta?.remote) return undefined;
    const url = meta.remote.url;
    const key = sha256(url);
    const file = join(this.#remoteDir, key);
    const cached = await this.#remoteCached(key);
    if (cached && cached.fresh) {
      this.#placeholders.delete(assetId);
      return { type: cached.type, body: cached.body, placeholder: false };
    }
    let fetched = this.#remoteInflight.get(url);
    if (!fetched) {
      fetched = this.#fetchRemote(url).finally(() => this.#remoteInflight.delete(url));
      this.#remoteInflight.set(url, fetched);
    }
    const got = await fetched;
    if (got) {
      if (got.maxAge > 0) await this.#remoteStore(key, file, url, got);
      this.#placeholders.delete(assetId);
      return { type: got.type, body: got.body, placeholder: false };
    }
    if (cached) {
      this.#placeholders.delete(assetId);
      return { type: cached.type, body: cached.body, placeholder: false };
    }
    this.#placeholders.set(assetId, this.#now());
    return { type: 'image/png', body: solidPng(16, 16, rgbOf(meta.avgColor)), placeholder: true };
  }

  /** Aset di `ids` yang terakhir disajikan sebagai placeholder (catatan aditif respons screenshot/export). */
  placeholders(ids: Iterable<string>): string[] {
    return [...new Set(ids)].filter((id) => this.#placeholders.has(id));
  }

  async #fetchRemote(url: string): Promise<{ type: string; body: Buffer; maxAge: number } | undefined> {
    try {
      const r = await this.#net.fetch(url, { kind: 'image', maxBytes: IMAGE_MAX_BYTES, timeoutMs: REMOTE_TIMEOUT_MS });
      const type = rasterType(r.body);
      if (!type) return undefined;
      return { type, body: r.body, maxAge: cacheAge(r.headers['cache-control']) };
    } catch {
      return undefined;
    }
  }

  async #remoteCached(key: string): Promise<{ type: string; body: Buffer; fresh: boolean } | undefined> {
    try {
      const file = join(this.#remoteDir, key);
      const m = JSON.parse(await readFile(`${file}.json`, 'utf8')) as RemoteCacheMeta;
      const body = await readFile(file);
      const type = rasterType(body);
      if (m.v !== 1 || !type || body.byteLength !== m.bytes) return undefined;
      const t = new Date(this.#now());
      await utimes(file, t, t).catch(() => undefined);
      return { type, body, fresh: this.#now() < m.expires };
    } catch {
      return undefined;
    }
  }

  async #remoteStore(key: string, file: string, url: string, got: { type: string; body: Buffer; maxAge: number }): Promise<void> {
    try {
      await mkdir(this.#remoteDir, { recursive: true });
      await writeFileAtomic(file, got.body);
      const m: RemoteCacheMeta = { v: 1, url, type: got.type, bytes: got.body.byteLength, expires: this.#now() + got.maxAge };
      await writeFileAtomic(`${file}.json`, JSON.stringify(m));
      // LRU menurut waktu akses (mtime file gambar diperbarui saat tersaji dari cache).
      const names = (await readdir(this.#remoteDir)).filter((n) => /^[a-f0-9]{64}$/.test(n));
      const entries = await Promise.all(
        names.map(async (n) => {
          const st = await stat(join(this.#remoteDir, n)).catch(() => undefined);
          return { n, size: st?.size ?? 0, t: st?.mtimeMs ?? 0 };
        }),
      );
      let total = entries.reduce((a, e) => a + e.size, 0);
      entries.sort((a, b) => a.t - b.t);
      for (const e of entries) {
        if (total <= REMOTE_CACHE_MAX_BYTES) break;
        if (e.n === key) continue;
        await rm(join(this.#remoteDir, e.n), { force: true });
        await rm(join(this.#remoteDir, `${e.n}.json`), { force: true });
        total -= e.size;
      }
    } catch {
      // Cache opsional: gagal menulis tidak menggagalkan render.
    }
  }
}

function infoFrom(sha: string, meta: AssetMeta): PhotoInfo {
  const credit =
    meta.provider === 'unsplash'
      ? `Foto: ${meta.creator} / Unsplash`
      : meta.provider === 'pexels'
        ? `Foto: ${meta.creator} / Pexels`
        : meta.provider === 'wikimedia'
          ? `Foto: ${meta.creator} / Wikimedia Commons (${meta.license})`
          : meta.attribution;
  return {
    assetId: sha,
    width: meta.width,
    height: meta.height,
    credit,
    license: meta.license,
    creator: meta.creator,
    sourcePageUrl: meta.sourcePageUrl,
  };
}
