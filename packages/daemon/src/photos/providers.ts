// Adaptor penyedia foto stok: Pexels (pakai key), Wikimedia Commons (tanpa key; penyedia utama tanpa key) dan
// Openverse (tanpa key; cadangan, CC0/PDM/CC BY dari Flickr/Wikimedia). Respons API dipetakan ke `PhotoCandidate`.
// Key hanya dikirim di header Authorization ke api.pexels.com.
import { NetError, type SafeNet } from './net.js';

export type ProviderName = 'pexels' | 'wikimedia' | 'openverse';
export type Orientation = 'landscape' | 'portrait' | 'square';

/** Batas body JSON API. */
export const API_MAX_BYTES = 2 * 1024 * 1024;
export const API_TIMEOUT_MS = 8000;
/** Batas ukuran unduhan gambar (juga dipakai untuk menyaring `filesize` Openverse). */
export const IMAGE_MAX_BYTES = 12 * 1024 * 1024;
/** Lebar unduhan Pexels: cukup untuk board 1440 skala 2. */
export const PEXELS_DOWNLOAD_WIDTH = 2880;

export const REF_PATTERN = /^(pexels|wikimedia|openverse):([A-Za-z0-9-]{1,64})$/;
const PEXELS_ID = /^\d{1,20}$/;
const WIKIMEDIA_ID = /^\d{1,12}$/;
const OPENVERSE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Kandidat foto ternormalisasi (cache hasil cari + sumber metadata impor). */
export type PhotoCandidate = {
  ref: string;
  provider: ProviderName;
  width: number;
  height: number;
  alt: string;
  avgColor?: string;
  creator: string;
  creatorUrl?: string;
  license: string;
  licenseUrl?: string;
  sourcePageUrl: string;
  credit: string;
  /** Teks atribusi penyedia (Openverse) bila ada. */
  attribution?: string;
  downloadUrl: string;
  thumbUrl: string;
};

export type SearchQuery = { query: string; orientation?: Orientation; limit: number };

export interface PhotoProvider {
  readonly name: ProviderName;
  search(q: SearchQuery): Promise<PhotoCandidate[]>;
  byId(id: string): Promise<PhotoCandidate | undefined>;
}

/** Ref valid secara format dan per penyedia. */
export function parseRef(ref: string): { provider: ProviderName; id: string } | undefined {
  const m = REF_PATTERN.exec(ref);
  if (!m) return undefined;
  const provider = m[1] as ProviderName;
  const id = m[2]!;
  const valid = provider === 'pexels' ? PEXELS_ID : provider === 'wikimedia' ? WIKIMEDIA_ID : OPENVERSE_ID;
  if (!valid.test(id)) return undefined;
  return { provider, id };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

function parseJson(body: Buffer, what: string): unknown {
  try {
    return JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    throw new NetError('bad-response', `respons ${what} bukan JSON`, { retryable: true });
  }
}

/** Tambah query ke URL (tanpa menimpa query yang sudah ada). */
function withQuery(raw: string, params: Record<string, string>): string {
  const u = new URL(raw);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

// ---------------------------------------------------------------------------
// Pexels
// ---------------------------------------------------------------------------

export const PEXELS_API = 'https://api.pexels.com/v1';
export const PEXELS_LICENSE = 'Pexels License';
export const PEXELS_LICENSE_URL = 'https://www.pexels.com/license/';

type PexelsPhoto = {
  id?: unknown;
  width?: unknown;
  height?: unknown;
  url?: unknown;
  photographer?: unknown;
  photographer_url?: unknown;
  avg_color?: unknown;
  alt?: unknown;
  src?: { original?: unknown; tiny?: unknown };
};

export function mapPexels(p: PexelsPhoto, net: SafeNet): PhotoCandidate | undefined {
  const id = typeof p.id === 'number' || typeof p.id === 'string' ? String(p.id) : undefined;
  const original = str(p.src?.original);
  const tiny = str(p.src?.tiny);
  if (!id || !PEXELS_ID.test(id) || !original || !tiny) return undefined;
  let downloadUrl: string;
  try {
    downloadUrl = withQuery(original, { auto: 'compress', cs: 'tinysrgb', w: String(PEXELS_DOWNLOAD_WIDTH) });
    net.check('image', downloadUrl);
    net.check('thumb', tiny);
  } catch {
    return undefined;
  }
  const creator = str(p.photographer) ?? 'Pexels';
  const avg = str(p.avg_color);
  const creatorUrl = str(p.photographer_url);
  return {
    ref: `pexels:${id}`,
    provider: 'pexels',
    width: num(p.width),
    height: num(p.height),
    alt: str(p.alt) ?? '',
    ...(avg ? { avgColor: avg } : {}),
    creator,
    ...(creatorUrl ? { creatorUrl } : {}),
    license: PEXELS_LICENSE,
    licenseUrl: PEXELS_LICENSE_URL,
    sourcePageUrl: str(p.url) ?? `https://www.pexels.com/photo/${id}/`,
    credit: `Foto: ${creator} / Pexels`,
    downloadUrl,
    thumbUrl: tiny,
  };
}

export class PexelsProvider implements PhotoProvider {
  readonly name = 'pexels' as const;
  readonly #net: SafeNet;
  readonly #key: string;
  readonly #base: string;

  constructor(net: SafeNet, key: string, base = PEXELS_API) {
    this.#net = net;
    this.#key = key;
    this.#base = base;
  }

  async #get(path: string): Promise<unknown> {
    const r = await this.#net.fetch(`${this.#base}${path}`, { kind: 'api', maxBytes: API_MAX_BYTES, timeoutMs: API_TIMEOUT_MS, headers: { Authorization: this.#key } });
    return parseJson(r.body, 'Pexels');
  }

  async search(q: SearchQuery): Promise<PhotoCandidate[]> {
    const params = new URLSearchParams({ query: q.query, per_page: String(Math.min(12, q.limit)), locale: 'id-ID' });
    if (q.orientation) params.set('orientation', q.orientation);
    const data = (await this.#get(`/search?${params}`)) as { photos?: unknown };
    const photos = Array.isArray(data.photos) ? (data.photos as PexelsPhoto[]) : [];
    return photos.flatMap((p) => mapPexels(p, this.#net) ?? []).slice(0, q.limit);
  }

  async byId(id: string): Promise<PhotoCandidate | undefined> {
    if (!PEXELS_ID.test(id)) return undefined;
    try {
      return mapPexels((await this.#get(`/photos/${id}`)) as PexelsPhoto, this.#net);
    } catch (e) {
      if (e instanceof NetError && e.status === 404) return undefined;
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Openverse
// ---------------------------------------------------------------------------

export const OPENVERSE_API = 'https://api.openverse.org/v1';
/** Filter tetap: hanya foto, lisensi CC0/PDM/CC BY, sumber Flickr/Wikimedia, tanpa konten dewasa. */
export const OPENVERSE_FILTER = { source: 'flickr,wikimedia', license: 'cc0,pdm,by', category: 'photograph', mature: 'false' } as const;
const OPENVERSE_LICENSES = new Set(['cc0', 'pdm', 'by']);
const ASPECT: Record<Orientation, string> = { landscape: 'wide', portrait: 'tall', square: 'square' };

type OpenverseImage = {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  thumbnail?: unknown;
  creator?: unknown;
  creator_url?: unknown;
  license?: unknown;
  license_version?: unknown;
  license_url?: unknown;
  foreign_landing_url?: unknown;
  filesize?: unknown;
  width?: unknown;
  height?: unknown;
  attribution?: unknown;
};

const licenseLabel = (license: string, version: string | undefined) =>
  license === 'cc0' ? 'CC0 1.0' : license === 'pdm' ? 'Public Domain Mark 1.0' : `CC BY ${version ?? ''}`.trim();

export function mapOpenverse(img: OpenverseImage, net: SafeNet): PhotoCandidate | undefined {
  const id = str(img.id);
  const url = str(img.url);
  const thumb = str(img.thumbnail);
  const license = str(img.license)?.toLowerCase();
  if (!id || !OPENVERSE_ID.test(id) || !url || !thumb || !license || !OPENVERSE_LICENSES.has(license)) return undefined;
  if (typeof img.filesize === 'number' && img.filesize > IMAGE_MAX_BYTES) return undefined;
  try {
    net.check('image', url);
    net.check('thumb', thumb);
  } catch {
    return undefined;
  }
  const creator = str(img.creator) ?? 'tidak diketahui';
  const label = licenseLabel(license, str(img.license_version));
  const attribution = str(img.attribution);
  const creatorUrl = str(img.creator_url);
  const licenseUrl = str(img.license_url);
  return {
    ref: `openverse:${id}`,
    provider: 'openverse',
    width: num(img.width),
    height: num(img.height),
    alt: str(img.title) ?? '',
    creator,
    ...(creatorUrl ? { creatorUrl } : {}),
    license: label,
    ...(licenseUrl ? { licenseUrl } : {}),
    sourcePageUrl: str(img.foreign_landing_url) ?? `https://openverse.org/image/${id}`,
    credit: attribution ?? `Foto: ${creator} (${label})`,
    ...(attribution ? { attribution } : {}),
    downloadUrl: url,
    thumbUrl: thumb,
  };
}

export class OpenverseProvider implements PhotoProvider {
  readonly name = 'openverse' as const;
  readonly #net: SafeNet;
  readonly #base: string;

  constructor(net: SafeNet, base = OPENVERSE_API) {
    this.#net = net;
    this.#base = base;
  }

  async #get(path: string): Promise<unknown> {
    const r = await this.#net.fetch(`${this.#base}${path}`, { kind: 'api', maxBytes: API_MAX_BYTES, timeoutMs: API_TIMEOUT_MS });
    return parseJson(r.body, 'Openverse');
  }

  async search(q: SearchQuery): Promise<PhotoCandidate[]> {
    // Minta sedikit lebih banyak: sebagian kandidat bisa dibuang (host di luar allowlist / file terlalu besar).
    const params = new URLSearchParams({ q: q.query, ...OPENVERSE_FILTER, page_size: String(Math.min(20, q.limit * 2)) });
    if (q.orientation) params.set('aspect_ratio', ASPECT[q.orientation]);
    const data = (await this.#get(`/images/?${params}`)) as { results?: unknown };
    const results = Array.isArray(data.results) ? (data.results as OpenverseImage[]) : [];
    return results.flatMap((r) => mapOpenverse(r, this.#net) ?? []).slice(0, q.limit);
  }

  async byId(id: string): Promise<PhotoCandidate | undefined> {
    if (!OPENVERSE_ID.test(id)) return undefined;
    try {
      return mapOpenverse((await this.#get(`/images/${id}/`)) as OpenverseImage, this.#net);
    } catch (e) {
      if (e instanceof NetError && e.status === 404) return undefined;
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Wikimedia Commons
// ---------------------------------------------------------------------------

export const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';
/** Lebar thumbnail pratinjau (bucket standar Wikimedia). */
export const WIKIMEDIA_PREVIEW_WIDTH = 330;
/** Bucket thumbnail standar Wikimedia: ukuran lain dijawab HTTP 400. */
export const WIKIMEDIA_BUCKETS = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840] as const;
/** Lebar impor maksimum per jenis (target ≥ 2880 untuk board 1440 skala 2; PNG lebih berat → 1920). */
const WIKIMEDIA_IMPORT_MAX = { jpeg: 3840, png: 1920 } as const;
const WIKIMEDIA_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const WIKIMEDIA_PROPS = {
  prop: 'imageinfo',
  iiprop: 'url|size|mime|extmetadata',
  iiextmetadatafilter: 'LicenseShortName|License|LicenseUrl|Artist|ObjectName|Categories|NonFree',
  iiurlwidth: String(WIKIMEDIA_PREVIEW_WIDTH),
  maxlag: '5',
} as const;
/** Judul/kategori bukan foto (diagram, peta, logo, karya seni reproduksi, pindaian, …). */
export const WIKIMEDIA_NON_PHOTO =
  /\b(?:maps?|diagrams?|charts?|logos?|icons?|screenshots?|infographics?|coats? of arms|flags? of|drawings?|illustrations?|paintings?|artworks?|PD-Art|engravings?|lithographs?|posters?|scans?|scanned|plans? of|svg)\b/i;
const WIKIMEDIA_QUALITY = /Featured pictures|Quality images|Valued images/i;
const WIKIMEDIA_STOCKISH = /Files from Pexels|Images from Unsplash|Food photography|Portrait photographs/i;
const WIKIMEDIA_OLD = /Black and white|PD-old|Library of Congress|Fortepan|19th century|Historical/i;
/** Maks kandidat per pembuat (seri satu pengunggah tidak memenuhi hasil). */
export const WIKIMEDIA_PER_CREATOR = 2;
const UNKNOWN_CREATOR = 'tidak diketahui';
const MIN_LONG_SIDE = 1200;
const MIN_SHORT_SIDE = 800;
const MAX_ASPECT = 2.2;

/** Galat `maxlag` API MediaWiki (HTTP 200 + `Retry-After`): diperlakukan sebagai 503 retryable. */
export class WikimediaMaxlagError extends NetError {
  constructor() {
    super('http', 'Wikimedia Commons sedang sibuk (maxlag)', { status: 503, retryable: true });
  }
}

type LicenseClass = 'free' | 'by' | 'by-sa';

/** Kelas lisensi aman dari kode `License` / `LicenseShortName`; NC/ND/GFDL-saja/tak dikenal → undefined. */
export function wikimediaLicenseClass(code: string | undefined, short: string | undefined): LicenseClass | undefined {
  const restricted = (raw: string | undefined) => /\bnc\b|-nc\b|\bnd\b|-nd\b|non-?commercial|no ?deriv/.test(raw?.trim().toLowerCase() ?? '');
  // NC/ND pada kode ATAU nama pendek → tolak (jangan jatuh ke nama pendek yang tampak bebas).
  if (restricted(code) || restricted(short)) return undefined;
  const one = (raw: string | undefined): LicenseClass | undefined => {
    const v = raw?.trim().toLowerCase();
    if (!v) return undefined;
    if (v.startsWith('cc0') || v.startsWith('pd') || v.includes('public domain')) return 'free';
    if (/^cc[- ]by[- ]sa\b/.test(v)) return 'by-sa';
    if (/^cc[- ]by\b/.test(v)) return 'by';
    return undefined;
  };
  return one(code) ?? one(short);
}

/** Teks polos dari HTML extmetadata (tag dibuang, entitas didekode, spasi dirapikan). */
export function plainText(html: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ' ';
      }
      return named[e.toLowerCase()] ?? m;
    })
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Buang parameter `utm_*` dari URL. */
export function stripUtm(raw: string): string {
  const u = new URL(raw);
  for (const k of [...u.searchParams.keys()]) if (k.toLowerCase().startsWith('utm_')) u.searchParams.delete(k);
  return u.toString();
}

/** Bucket standar terbesar yang ≤ `max` dan < lebar asli (Wikimedia tidak memperbesar thumbnail). */
function importBucket(width: number, max: number): number | undefined {
  const fit = WIKIMEDIA_BUCKETS.filter((b) => b <= max && b < width);
  return fit.at(-1);
}

/**
 * URL impor: selalu thumbnail bucket standar (turunan path thumbnail pratinjau, `/330px-` → bucket terbesar < lebar asli,
 * maks 3840 JPEG/WebP, 1920 PNG). File asli `upload.wikimedia.org` tidak pernah diunduh: Wikimedia menjawab klien
 * otomatis dengan 429 dan meminta thumbnail ukuran standar (https://w.wiki/GHai). Turunan gagal → undefined.
 */
export function wikimediaImportUrl(info: { url: string; thumbUrl: string; width: number; size: number; mime: string }): string | undefined {
  const max = info.mime === 'image/png' ? WIKIMEDIA_IMPORT_MAX.png : WIKIMEDIA_IMPORT_MAX.jpeg;
  const bucket = importBucket(info.width, max);
  const seg = `/${WIKIMEDIA_PREVIEW_WIDTH}px-`;
  if (!bucket || bucket < WIKIMEDIA_PREVIEW_WIDTH || !info.thumbUrl.includes(seg)) return undefined;
  const u = new URL(info.thumbUrl);
  const i = u.pathname.lastIndexOf(seg);
  if (i < 0) return undefined;
  u.pathname = `${u.pathname.slice(0, i)}/${bucket}px-${u.pathname.slice(i + seg.length)}`;
  return u.toString();
}

type Ext = { value?: unknown };
type WikimediaPage = {
  pageid?: unknown;
  title?: unknown;
  index?: unknown;
  missing?: unknown;
  imageinfo?: {
    size?: unknown;
    width?: unknown;
    height?: unknown;
    thumburl?: unknown;
    url?: unknown;
    descriptionurl?: unknown;
    mime?: unknown;
    extmetadata?: Record<string, Ext | undefined>;
  }[];
};

/** Kandidat Wikimedia + data ranking (internal). */
export type WikimediaHit = { candidate: PhotoCandidate; index: number; licenseClass: LicenseClass; categories: string; mime: string };

const extStr = (m: Record<string, Ext | undefined> | undefined, k: string): string | undefined => {
  const v = m?.[k]?.value;
  return typeof v === 'string' ? str(v) : undefined;
};

/** Pemetaan + filter keamanan (mime, NonFree, lisensi, URL allowlist). Filter mutu ada di `wikimediaQualityOk`. */
export function mapWikimedia(page: WikimediaPage, net: SafeNet): WikimediaHit | undefined {
  const id = typeof page.pageid === 'number' || typeof page.pageid === 'string' ? String(page.pageid) : undefined;
  const ii = Array.isArray(page.imageinfo) ? page.imageinfo[0] : undefined;
  if (!id || !WIKIMEDIA_ID.test(id) || page.missing || !ii) return undefined;
  const mime = str(ii.mime)?.toLowerCase();
  if (!mime || !WIKIMEDIA_MIMES.has(mime)) return undefined;
  const meta = ii.extmetadata;
  const nonFree = extStr(meta, 'NonFree');
  if (nonFree && nonFree.toLowerCase() !== 'false' && nonFree !== '0') return undefined;
  const code = extStr(meta, 'License');
  const short = extStr(meta, 'LicenseShortName');
  const licenseClass = wikimediaLicenseClass(code, short);
  if (!licenseClass) return undefined;
  const rawUrl = str(ii.url);
  const rawThumb = str(ii.thumburl);
  const width = num(ii.width);
  const height = num(ii.height);
  const size = num(ii.size);
  if (!rawUrl || !rawThumb) return undefined;
  let downloadUrl: string | undefined;
  let thumbUrl: string;
  try {
    const url = stripUtm(rawUrl);
    thumbUrl = stripUtm(rawThumb);
    downloadUrl = wikimediaImportUrl({ url, thumbUrl, width, size, mime });
    if (!downloadUrl) return undefined;
    net.check('image', downloadUrl);
    net.check('thumb', thumbUrl);
  } catch {
    return undefined;
  }
  const title = str(page.title) ?? '';
  const alt = title.replace(/^File:/i, '').replace(/\.[A-Za-z0-9]{2,5}$/, '').trim();
  const artist = plainText(extStr(meta, 'Artist') ?? '').slice(0, 120).trim();
  const creator = artist || UNKNOWN_CREATOR;
  const license = short ?? code ?? (licenseClass === 'free' ? 'Public domain' : 'CC BY');
  const licenseUrl = extStr(meta, 'LicenseUrl');
  let sourcePageUrl = `https://commons.wikimedia.org/?curid=${id}`;
  const desc = str(ii.descriptionurl);
  if (desc) {
    try {
      sourcePageUrl = stripUtm(desc);
    } catch {
      // URL halaman sumber tak valid → pakai curid.
    }
  }
  const index = typeof page.index === 'number' && page.index > 0 ? page.index : Number.MAX_SAFE_INTEGER;
  return {
    candidate: {
      ref: `wikimedia:${id}`,
      provider: 'wikimedia',
      width,
      height,
      alt,
      creator,
      license,
      ...(licenseUrl ? { licenseUrl } : {}),
      sourcePageUrl,
      credit: `Foto: ${creator} / Wikimedia Commons (${license})`,
      attribution: `"${alt}" oleh ${creator}, ${license}, via Wikimedia Commons`,
      downloadUrl,
      thumbUrl,
    },
    index,
    licenseClass,
    categories: extStr(meta, 'Categories') ?? '',
    mime,
  };
}

/** Filter mutu pencarian: resolusi, rasio, orientation, dan pola bukan-foto pada judul/kategori. */
export function wikimediaQualityOk(h: WikimediaHit, orientation: Orientation | undefined): boolean {
  const { width: w, height: hh, alt } = h.candidate;
  if (!w || !hh) return false;
  if (Math.max(w, hh) < MIN_LONG_SIDE || Math.min(w, hh) < MIN_SHORT_SIDE) return false;
  if (Math.max(w, hh) / Math.min(w, hh) > MAX_ASPECT) return false;
  if (orientation === 'landscape' && w < 1.1 * hh) return false;
  if (orientation === 'portrait' && hh < 1.1 * w) return false;
  if (orientation === 'square' && (w / hh < 0.9 || w / hh > 1.1)) return false;
  if (WIKIMEDIA_NON_PHOTO.test(alt) || WIKIMEDIA_NON_PHOTO.test(h.categories)) return false;
  return true;
}

/** Skor ranking: relevansi Cirrus + lisensi + kategori mutu − foto lama/hitam-putih − PNG. */
export function wikimediaScore(h: WikimediaHit, total: number): number {
  const n = Math.max(1, total);
  const relevance = h.index === Number.MAX_SAFE_INTEGER ? 0 : 1 - (h.index - 1) / n;
  let s = relevance + (h.licenseClass === 'free' ? 0.25 : h.licenseClass === 'by' ? 0.1 : 0);
  if (WIKIMEDIA_QUALITY.test(h.categories)) s += 0.3;
  if (WIKIMEDIA_STOCKISH.test(h.categories)) s += 0.15;
  if (WIKIMEDIA_OLD.test(h.categories)) s -= 0.35;
  if (h.mime === 'image/png') s -= 0.1;
  return s;
}

/** Saring, ranking, dan batasi per pembuat; ambil `limit` teratas. */
export function rankWikimedia(hits: readonly WikimediaHit[], total: number, orientation: Orientation | undefined, limit: number): PhotoCandidate[] {
  const scored = hits
    .filter((h) => wikimediaQualityOk(h, orientation))
    .map((h) => ({ h, s: wikimediaScore(h, total) }))
    .sort((a, b) => b.s - a.s || a.h.index - b.h.index);
  const perCreator = new Map<string, number>();
  const out: PhotoCandidate[] = [];
  for (const { h } of scored) {
    if (out.length >= limit) break;
    const who = h.candidate.creator.toLowerCase();
    // Pembuat tak diketahui bukan satu orang: tidak dibatasi per pembuat.
    if (who === UNKNOWN_CREATOR) {
      out.push(h.candidate);
      continue;
    }
    const k = perCreator.get(who) ?? 0;
    if (k >= WIKIMEDIA_PER_CREATOR) continue;
    perCreator.set(who, k + 1);
    out.push(h.candidate);
  }
  return out;
}

export class WikimediaProvider implements PhotoProvider {
  readonly name = 'wikimedia' as const;
  readonly #net: SafeNet;
  readonly #base: string;
  /** Antrean: satu permintaan API Wikimedia berjalan pada satu waktu (kebijakan API: permintaan serial). */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(net: SafeNet, base = WIKIMEDIA_API) {
    this.#net = net;
    this.#base = base;
  }

  #get(params: Record<string, string>): Promise<unknown> {
    const qs = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params, ...WIKIMEDIA_PROPS });
    const run = async () => {
      const r = await this.#net.fetch(`${this.#base}?${qs}`, { kind: 'api', maxBytes: API_MAX_BYTES, timeoutMs: API_TIMEOUT_MS });
      const data = parseJson(r.body, 'Wikimedia Commons') as { error?: { code?: unknown } };
      if (data && typeof data === 'object' && data.error) {
        if (data.error.code === 'maxlag') throw new WikimediaMaxlagError();
        throw new NetError('bad-response', 'respons Wikimedia Commons berisi error', { retryable: false });
      }
      return data;
    };
    const p = this.#queue.then(run, run);
    this.#queue = p.catch(() => undefined);
    return p;
  }

  async search(q: SearchQuery): Promise<PhotoCandidate[]> {
    const data = (await this.#get({
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: `${q.query} filetype:bitmap filew:>799`,
      gsrlimit: q.orientation ? '50' : '40',
    })) as { query?: { pages?: unknown } };
    const pages = Array.isArray(data.query?.pages) ? (data.query.pages as WikimediaPage[]) : [];
    const hits = pages.flatMap((p) => mapWikimedia(p, this.#net) ?? []);
    return rankWikimedia(hits, pages.length, q.orientation, q.limit);
  }

  async byId(id: string): Promise<PhotoCandidate | undefined> {
    if (!WIKIMEDIA_ID.test(id)) return undefined;
    const data = (await this.#get({ pageids: id })) as { query?: { pages?: unknown } };
    const pages = Array.isArray(data.query?.pages) ? (data.query.pages as WikimediaPage[]) : [];
    const page = pages.find((p) => String(p.pageid) === id);
    return page ? mapWikimedia(page, this.#net)?.candidate : undefined;
  }
}
