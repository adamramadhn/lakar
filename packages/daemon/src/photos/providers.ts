// Adaptor penyedia foto stok: Pexels (pakai key) dan Openverse (tanpa key; CC0/PDM/CC BY dari Flickr/Wikimedia).
// Respons API dipetakan ke `PhotoCandidate`. Key hanya dikirim di header Authorization ke api.pexels.com.
import { NetError, type SafeNet } from './net.js';

export type ProviderName = 'pexels' | 'openverse';
export type Orientation = 'landscape' | 'portrait' | 'square';

/** Batas body JSON API. */
export const API_MAX_BYTES = 2 * 1024 * 1024;
export const API_TIMEOUT_MS = 8000;
/** Batas ukuran unduhan gambar (juga dipakai untuk menyaring `filesize` Openverse). */
export const IMAGE_MAX_BYTES = 12 * 1024 * 1024;
/** Lebar unduhan Pexels: cukup untuk board 1440 skala 2. */
export const PEXELS_DOWNLOAD_WIDTH = 2880;

export const REF_PATTERN = /^(pexels|openverse):([A-Za-z0-9-]{1,64})$/;
const PEXELS_ID = /^\d{1,20}$/;
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
  if (provider === 'pexels' ? !PEXELS_ID.test(id) : !OPENVERSE_ID.test(id)) return undefined;
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
