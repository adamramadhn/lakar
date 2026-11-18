// Layanan foto stok daemon: pencarian (Pexels dengan key → Wikimedia Commons → cadangan Openverse), cache hasil cari,
// impor on-demand ke store aset beralamat hash + metadata sidecar + indeks ref → sha, dan `resolve` sinkron
// untuk fungsi snippet `photo(ref)` (AD-7: snippet sinkron; unduhan terjadi di daemon sebelum snippet, AD-10).
// Key Pexels hanya dibaca dari file (mode 600, milik uid daemon), dibaca ulang bila mtime berubah, dan tidak
// pernah masuk pesan error, status, metadata, indeks, atau log.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PhotoInfo, PhotoLibraryPort } from '@lakar/ports';
import { LakarError } from '@lakar/schema';
import { imageSize, rasterType, writeAsset, writeAssetMeta, writeFileAtomic, type AssetMeta } from '../assets.js';
import { NetError, SafeNet } from './net.js';
import {
  IMAGE_MAX_BYTES,
  OpenverseProvider,
  PexelsProvider,
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
/** Impor per execute: maks ref baru, paralel, dan batas waktu total. */
export const IMPORT_MAX_REFS = 6;
export const IMPORT_PARALLEL = 3;
export const IMPORT_TOTAL_MS = 30_000;
export const SEARCH_CACHE_MAX = 200;
export const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const SEARCH_LIMIT_DEFAULT = 6;
export const SEARCH_LIMIT_MAX = 12;
/** Maks thumbnail pratinjau per pencarian. */
export const THUMBNAILS_MAX = 6;
/** Batas total byte cache thumbnail di memori. */
const THUMB_CACHE_BYTES = 24 * 1024 * 1024;

export type KeyFileState = 'present' | 'absent' | 'insecure' | 'invalid';
/**
 * Alasan penyedia terakhir yang dilewati: kunci/Pexels (provider `wikimedia`) atau Wikimedia (provider `openverse`).
 */
export type FallbackReason =
  | 'no-key'
  | 'key-insecure'
  | 'key-invalid'
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

/** Kandidat untuk klien (tanpa URL unduhan/thumbnail penyedia: render tidak pernah hotlink). */
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
export type SearchResponse = {
  provider: ProviderName;
  fallbackReason?: FallbackReason;
  query: string;
  results: PhotoResult[];
  thumbnails: Thumbnail[];
};
export type PhotoStatus = { provider: ProviderName; keyFile: KeyFileState; imported: number };

export type PhotoServiceOptions = {
  dataDir: string;
  /** Path file key Pexels (default config `pexels_key_file`). */
  keyFile: string;
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
  set(k: string, value: T): void {
    this.#map.delete(k);
    this.#map.set(k, { at: this.#now(), value });
    while (this.#map.size > this.#max) this.#map.delete(this.#map.keys().next().value!);
  }
}

type IndexFile = { version: 1; refs: Record<string, string> };

const RETRY_HINT = 'coba lagi sebentar lagi';

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

function pexelsReason(e: unknown): FallbackReason {
  if (e instanceof NetError) {
    if (e.status === 401 || e.status === 403) return 'pexels-401';
    if (e.status === 429) return 'pexels-429';
    if ((e.status ?? 0) >= 500) return 'pexels-5xx';
    if (e.kind === 'timeout') return 'pexels-timeout';
  }
  return 'pexels-error';
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

export class PhotoService implements PhotoLibraryPort {
  readonly #dataDir: string;
  readonly #keyFile: string;
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
  readonly #inflight = new Map<string, Promise<void>>();
  #indexWrite: Promise<void> = Promise.resolve();
  #key: { sig: string; state: KeyFileState; key?: string } | undefined;
  #pexels: { key: string; provider: PexelsProvider } | undefined;

  constructor(opts: PhotoServiceOptions) {
    this.#dataDir = opts.dataDir;
    this.#keyFile = opts.keyFile;
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
      } catch {
        // Meta hilang/rusak: ref dianggap belum diimpor (impor ulang saat dipakai).
      }
    }
  }

  /** Status key: dibaca ulang hanya bila mtime/ukuran/inode berubah. */
  keyState(): { state: KeyFileState; key?: string } {
    let st;
    try {
      st = statSync(this.#keyFile);
    } catch {
      this.#key = undefined;
      return { state: 'absent' };
    }
    const sig = `${st.ino}:${st.size}:${st.mtimeMs}:${st.mode}:${st.uid}`;
    if (this.#key?.sig === sig) return this.#key;
    let next: { sig: string; state: KeyFileState; key?: string };
    if (!st.isFile() || (st.mode & 0o077) !== 0 || (this.#uid !== undefined && st.uid !== this.#uid)) next = { sig, state: 'insecure' };
    else {
      let raw: string | undefined;
      try {
        raw = readFileSync(this.#keyFile, 'utf8');
      } catch {
        raw = undefined;
      }
      const key = raw?.trim() ?? '';
      if (raw === undefined) next = { sig, state: 'absent' };
      else if (/^[\x21-\x7e]{8,200}$/.test(key)) next = { sig, state: 'present', key };
      else next = { sig, state: key ? 'invalid' : 'absent' };
    }
    this.#key = next;
    return next;
  }

  #pexelsProvider(): PexelsProvider | undefined {
    const k = this.keyState();
    if (k.state !== 'present' || !k.key) return undefined;
    if (this.#pexels?.key !== k.key) this.#pexels = { key: k.key, provider: new PexelsProvider(this.#net, k.key) };
    return this.#pexels.provider;
  }

  status(): PhotoStatus {
    const k = this.keyState();
    return { provider: k.state === 'present' ? 'pexels' : 'wikimedia', keyFile: k.state, imported: this.#imported.size };
  }

  async #cachedSearch(p: PhotoProvider, query: string, orientation: Orientation | undefined, limit: number): Promise<PhotoCandidate[]> {
    const key = `${p.name}|${orientation ?? ''}|${limit}|${query.trim().toLowerCase()}`;
    const hit = this.#search.get(key);
    if (hit) return hit;
    const res = await p.search({ query: query.trim(), ...(orientation ? { orientation } : {}), limit });
    this.#search.set(key, res);
    for (const c of res) this.#candidates.set(c.ref, c);
    return res;
  }

  /**
   * Cari foto. Urutan: Pexels (bila key valid) → Wikimedia Commons → Openverse. Penyedia pertama yang mengembalikan
   * ≥ 1 kandidat dipakai; error atau hasil kosong → penyedia berikutnya. Semua kosong → NOT_FOUND; tak ada yang
   * kosong dan semua gagal → EXEC_ERROR dari error terakhir.
   */
  async search(q: { query: string; orientation?: Orientation; limit?: number; preview?: boolean }): Promise<SearchResponse> {
    const limit = q.limit ?? SEARCH_LIMIT_DEFAULT;
    let fallbackReason: FallbackReason | undefined;
    const chain: PhotoProvider[] = [];
    const pexels = this.#pexelsProvider();
    if (pexels) chain.push(pexels);
    else {
      const st = this.keyState().state;
      fallbackReason = st === 'insecure' ? 'key-insecure' : st === 'invalid' ? 'key-invalid' : 'no-key';
    }
    chain.push(this.#wikimedia, this.#openverse);
    let provider: ProviderName = chain[0]!.name;
    let found: PhotoCandidate[] | undefined;
    let anyEmpty = false;
    let lastError: { error: unknown; provider: ProviderName } | undefined;
    for (const [i, p] of chain.entries()) {
      provider = p.name;
      const last = i === chain.length - 1;
      let res: PhotoCandidate[];
      try {
        res = await this.#cachedSearch(p, q.query, q.orientation, limit);
      } catch (e) {
        lastError = { error: e, provider: p.name };
        if (!last) fallbackReason = p.name === 'pexels' ? pexelsReason(e) : wikimediaReason(e);
        continue;
      }
      if (res.length) {
        found = res;
        break;
      }
      anyEmpty = true;
      if (!last) fallbackReason = p.name === 'pexels' ? 'pexels-empty' : 'wikimedia-empty';
    }
    if (!found) {
      if (!anyEmpty && lastError) throw netToLakar(lastError.error, 'pencarian foto gagal', lastError.provider);
      throw new LakarError('NOT_FOUND', `tidak ada foto untuk ${JSON.stringify(q.query)} (${chain.map((p) => p.name).join(', ')})`, {
        hint: 'coba kata kunci lain yang lebih umum atau dalam bahasa Inggris, mis. "hotel room"; hilangkan orientation',
      });
    }
    // Pratinjau hanya untuk kandidat teratas (klien MCP menampilkan maks 6) agar kuota thumbnail tidak terbuang.
    const thumbnails = q.preview === false ? [] : await this.#thumbnails(found.slice(0, THUMBNAILS_MAX));
    return { provider, ...(fallbackReason ? { fallbackReason } : {}), query: q.query, results: found.map(toResult), thumbnails };
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

  /** Info foto terimpor (sinkron; dipakai `photo(ref)` di snippet). */
  resolve(ref: string): PhotoInfo | undefined {
    const info = this.#imported.get(ref);
    if (!info) return undefined;
    if (!existsSync(join(this.#dataDir, 'assets', info.assetId))) return undefined;
    return { ...info };
  }

  /**
   * Impor ref (sekali; yang sudah ada di indeks tidak diunduh ulang). Ref tidak valid → SCHEMA_INVALID; lebih dari
   * `IMPORT_MAX_REFS` ref baru → SCHEMA_INVALID; ref tidak dikenal → NOT_FOUND; gagal unduh → EXEC_ERROR.
   */
  async importRefs(refs: readonly string[]): Promise<void> {
    const unique = [...new Set(refs)];
    for (const ref of unique) {
      if (!parseRef(ref)) {
        throw new LakarError('SCHEMA_INVALID', `ref foto tidak valid: ${JSON.stringify(ref)}`, {
          hint: "pakai ref dari photo_search apa adanya, mis. photo('wikimedia:<id>'), photo('pexels:2014422') atau photo('openverse:<uuid>')",
        });
      }
    }
    const need = unique.filter((r) => !this.resolve(r));
    if (!need.length) return;
    if (need.length > IMPORT_MAX_REFS) {
      throw new LakarError('SCHEMA_INVALID', `snippet memakai ${need.length} foto baru (maks ${IMPORT_MAX_REFS} per execute)`, {
        hint: `pakai maks ${IMPORT_MAX_REFS} foto baru per execute; foto yang sudah diimpor tidak dihitung`,
      });
    }
    const signal = AbortSignal.timeout(IMPORT_TOTAL_MS);
    const settled = await pool(need, IMPORT_PARALLEL, (ref) => this.#importOnce(ref, signal));
    const failed = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
    if (failed) throw failed.reason instanceof LakarError ? failed.reason : netToLakar(failed.reason, 'impor foto gagal');
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
      new LakarError('NOT_FOUND', `foto ${ref} tidak dikenal`, { hint: "pakai ref literal dari hasil photo_search terbaru, mis. photo('wikimedia:<id>')" });
    let provider: PhotoProvider | undefined;
    if (parsed.provider === 'pexels') {
      provider = this.#pexelsProvider();
      if (!provider) throw new LakarError('NOT_FOUND', `foto ${ref} tidak dikenal (penyedia Pexels tidak aktif)`, { hint: 'jalankan photo_search lalu pakai ref dari hasilnya' });
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
}

function infoFrom(sha: string, meta: AssetMeta): PhotoInfo {
  const credit =
    meta.provider === 'pexels'
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
