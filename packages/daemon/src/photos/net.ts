// Klien HTTP keluar untuk foto stok (inti keamanan SSRF). Hanya https/443 ke host allowlist yang di-hardcode per
// jenis permintaan; redirect diikuti manual (maks 3 hop, setiap hop divalidasi ulang); IP non-publik ditolak di
// lookup DNS koneksi (bukan sebelum fetch, jadi tidak ada celah DNS rebinding); body dibaca streaming dengan batas
// byte (content-length tidak dipercaya). Pesan error tidak memuat header, query, atau kredensial.
import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';

/** Jenis permintaan: menentukan allowlist host. */
export type FetchKind = 'api' | 'thumb' | 'image';

/** Allowlist host per jenis (string = host persis, RegExp = pola host penuh). */
export type HostAllowlist = Readonly<Record<FetchKind, readonly (string | RegExp)[]>>;

// `images.unsplash.com` saja: `plus.unsplash.com` (Unsplash+ / premium) sengaja di luar allowlist.
const IMAGE_HOSTS = ['images.unsplash.com', 'images.pexels.com', 'live.staticflickr.com', /^farm\d{1,2}\.staticflickr\.com$/, 'upload.wikimedia.org', 'thumb.wikimedia.org'] as const;

/** Allowlist produksi (di-hardcode; tidak dibaca dari config). */
export const DEFAULT_ALLOWLIST: HostAllowlist = {
  api: ['api.unsplash.com', 'api.pexels.com', 'commons.wikimedia.org', 'api.openverse.org'],
  thumb: [...IMAGE_HOSTS, 'api.openverse.org'],
  image: [...IMAGE_HOSTS],
};

/**
 * User-Agent semua permintaan keluar (kebijakan User-Agent Wikimedia: deskriptif). Sengaja tanpa email, nama,
 * hostname, atau data pribadi lain.
 */
export const USER_AGENT = 'Lakar/0.1 (internal design tool)';

/** Host yang boleh menerima header `Authorization` (key Unsplash `Client-ID …`, key Pexels). */
export const AUTH_HOSTS: readonly string[] = ['api.unsplash.com', 'api.pexels.com'];

export const MAX_REDIRECTS = 3;

/**
 * Header Accept untuk thumbnail/gambar. Wajib menyertakan `*\/*`: endpoint thumbnail Openverse (negosiasi konten DRF)
 * menjawab 406 untuk `image/*` saja. Validasi isi tetap lewat magic bytes (`rasterType`), bukan content-type.
 */
export const IMAGE_ACCEPT = 'image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.8';

export type NetErrorKind = 'blocked' | 'http' | 'timeout' | 'too-large' | 'network' | 'bad-response';

/** Error jaringan tersanitasi: `message` hanya memuat host + path tanpa query. */
export class NetError extends Error {
  readonly kind: NetErrorKind;
  readonly status: number | undefined;
  readonly retryable: boolean;
  constructor(kind: NetErrorKind, message: string, opts: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = 'NetError';
    this.kind = kind;
    this.status = opts.status;
    this.retryable = opts.retryable ?? (kind === 'timeout' || kind === 'network' || (kind === 'http' && (opts.status === 429 || (opts.status ?? 0) >= 500)));
  }
}

/** Rentang IP non-publik: loopback, privat, link-local, CGNAT, ULA, multicast, dan rentang khusus lain. */
const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv6');
}

/** true bila `ip` bukan alamat publik (atau bukan IP valid). IPv4-mapped IPv6 dicek sebagai IPv4. */
export function isBlockedIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return BLOCKED.check(ip, 'ipv4');
  if (fam === 6) {
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
    if (mapped) return BLOCKED.check(mapped[1]!, 'ipv4');
    if (/^::ffff:/i.test(ip)) return true;
    return BLOCKED.check(ip, 'ipv6');
  }
  return true;
}

/** Resolver mentah (default `dns.lookup` all:true). */
export type Resolver = (hostname: string) => Promise<LookupAddress[]>;

const systemResolver: Resolver = (hostname) =>
  new Promise((resolve, reject) => dnsLookup(hostname, { all: true }, (err, addrs) => (err ? reject(err) : resolve(addrs))));

/** Fungsi pembuat permintaan (default `https.request`); tes boleh mengganti transport, bukan validasinya. */
export type Transport = (opts: RequestOptions, onResponse: (res: IncomingMessage) => void) => ClientRequest;

export type SafeNetOptions = {
  /** Hanya untuk tes: allowlist pengganti. */
  allowlist?: HostAllowlist;
  /** Hanya untuk tes: resolver DNS pengganti (hasilnya tetap difilter `blockIp`). */
  resolve?: Resolver;
  /** Hanya untuk tes: predikat IP terlarang pengganti (default `isBlockedIp`). */
  blockIp?: (ip: string) => boolean;
  /** Hanya untuk tes: transport pengganti (mis. http ke server lokal). */
  transport?: Transport;
};

export type FetchOptions = {
  kind: FetchKind;
  maxBytes: number;
  timeoutMs: number;
  headers?: Record<string, string>;
  /** Batas waktu luar (mis. total impor); dibatalkan → NetError timeout. */
  signal?: AbortSignal;
};

/** Header respons yang diteruskan ke pemanggil (sisanya dibuang): batas laju Unsplash dan Cache-Control. */
export const PASSED_HEADERS = ['x-ratelimit-remaining', 'cache-control'] as const;

export type FetchResult = { status: number; url: string; contentType: string; body: Buffer; headers: Partial<Record<(typeof PASSED_HEADERS)[number], string>> };

/** `host + path` tanpa query/kredensial, untuk pesan error. */
export function describeUrl(u: URL | string): string {
  try {
    const url = typeof u === 'string' ? new URL(u) : u;
    const path = url.pathname.length > 80 ? `${url.pathname.slice(0, 80)}…` : url.pathname;
    return `${url.hostname}${path}`;
  } catch {
    return '(URL tidak valid)';
  }
}

export class SafeNet {
  readonly #allow: HostAllowlist;
  readonly #resolve: Resolver;
  readonly #blockIp: (ip: string) => boolean;
  readonly #transport: Transport;

  constructor(opts: SafeNetOptions = {}) {
    this.#allow = opts.allowlist ?? DEFAULT_ALLOWLIST;
    this.#resolve = opts.resolve ?? systemResolver;
    this.#blockIp = opts.blockIp ?? isBlockedIp;
    this.#transport = opts.transport ?? ((o, cb) => httpsRequest(o, cb));
  }

  /** Host diizinkan untuk jenis `kind`. */
  hostAllowed(kind: FetchKind, host: string): boolean {
    const h = host.toLowerCase();
    return this.#allow[kind].some((p) => (typeof p === 'string' ? p === h : p.test(h)));
  }

  /** Validasi URL (https, 443, tanpa kredensial, host allowlist) atau lempar NetError blocked. */
  check(kind: FetchKind, raw: string | URL): URL {
    let url: URL;
    try {
      url = typeof raw === 'string' ? new URL(raw) : raw;
    } catch {
      throw new NetError('blocked', 'URL tidak valid', { retryable: false });
    }
    if (url.protocol !== 'https:') throw new NetError('blocked', `hanya https yang diizinkan (${url.protocol})`, { retryable: false });
    if (url.username || url.password) throw new NetError('blocked', `URL berkredensial ditolak (${url.hostname})`, { retryable: false });
    if (url.port !== '' && url.port !== '443') throw new NetError('blocked', `port ${url.port} ditolak (${url.hostname})`, { retryable: false });
    if (!this.hostAllowed(kind, url.hostname)) throw new NetError('blocked', `host ${url.hostname} di luar allowlist`, { retryable: false });
    return url;
  }

  /** Lookup koneksi: resolve lalu tolak bila ada alamat non-publik. */
  #lookup = (hostname: string, options: { all?: boolean } | number | undefined, callback: (...args: unknown[]) => void): void => {
    const all = typeof options === 'object' && options !== null && options.all === true;
    this.#resolve(hostname).then(
      (addrs) => {
        const bad = addrs.find((a) => this.#blockIp(a.address));
        if (!addrs.length) return callback(Object.assign(new Error(`DNS ${hostname}: tanpa alamat`), { code: 'ENOTFOUND' }));
        if (bad) return callback(Object.assign(new Error(`host ${hostname} resolve ke alamat non-publik`), { code: 'LAKAR_BLOCKED_IP' }));
        if (all) return callback(null, addrs);
        return callback(null, addrs[0]!.address, addrs[0]!.family);
      },
      (err: unknown) => callback(err),
    );
  };

  /** GET satu URL dengan validasi per hop, batas byte, dan batas waktu. */
  async fetch(raw: string, opts: FetchOptions): Promise<FetchResult> {
    const ac = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, opts.timeoutMs);
    const outer = opts.signal;
    const onOuter = () => {
      timedOut = true;
      ac.abort();
    };
    if (outer) {
      if (outer.aborted) onOuter();
      else outer.addEventListener('abort', onOuter, { once: true });
    }
    try {
      let url = this.check(opts.kind, raw);
      // Authorization hanya ke host permintaan pertama (dan hanya bila host itu di AUTH_HOSTS): redirect tidak membawa key.
      const authHost = url.hostname;
      for (let hop = 0; ; hop++) {
        const res = await this.#once(url, opts, ac.signal, authHost).catch((e: unknown) => {
          if (timedOut) throw new NetError('timeout', `batas waktu ${opts.timeoutMs} ms terlewati (${url.hostname})`);
          throw e;
        });
        if (res.status >= 300 && res.status < 400 && res.status !== 304) {
          res.stream.resume();
          if (hop >= MAX_REDIRECTS) throw new NetError('blocked', `lebih dari ${MAX_REDIRECTS} redirect (${url.hostname})`, { retryable: false });
          const loc = res.location;
          if (!loc) throw new NetError('bad-response', `redirect tanpa Location (${url.hostname})`, { retryable: false });
          let next: URL;
          try {
            next = new URL(loc, url);
          } catch {
            throw new NetError('blocked', `redirect ke URL tidak valid (${url.hostname})`, { retryable: false });
          }
          url = this.check(opts.kind, next);
          continue;
        }
        if (res.status < 200 || res.status >= 300) {
          res.stream.resume();
          throw new NetError('http', `HTTP ${res.status} dari ${describeUrl(url)}`, { status: res.status });
        }
        const body = await this.#readBody(res.stream, opts.maxBytes, url).catch((e: unknown) => {
          if (timedOut) throw new NetError('timeout', `batas waktu ${opts.timeoutMs} ms terlewati (${url.hostname})`);
          throw e;
        });
        return { status: res.status, url: url.toString(), contentType: res.contentType, body, headers: res.headers };
      }
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuter);
    }
  }

  #once(
    url: URL,
    opts: FetchOptions,
    signal: AbortSignal,
    authHost: string,
  ): Promise<{ status: number; location: string | undefined; contentType: string; stream: IncomingMessage; headers: FetchResult['headers'] }> {
    // Header Authorization hanya ke AUTH_HOSTS (setiap hop dicek ulang, jadi redirect tidak membawa key).
    const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: opts.kind === 'api' ? 'application/json' : IMAGE_ACCEPT };
    for (const [k, v] of Object.entries(opts.headers ?? {})) {
      if (k.toLowerCase() === 'authorization' && (url.hostname !== authHost || !AUTH_HOSTS.includes(url.hostname))) continue;
      headers[k] = v;
    }
    return new Promise((resolve, reject) => {
      let req: ClientRequest;
      try {
        req = this.#transport(
          {
            protocol: 'https:',
            hostname: url.hostname,
            port: 443,
            path: `${url.pathname}${url.search}`,
            method: 'GET',
            headers,
            signal,
            lookup: this.#lookup as unknown as RequestOptions['lookup'],
            agent: false,
          },
          (res) => {
            const ct = res.headers['content-type'];
            const passed: FetchResult['headers'] = {};
            for (const h of PASSED_HEADERS) {
              const v = res.headers[h];
              if (typeof v === 'string') passed[h] = v;
            }
            resolve({
              headers: passed,
              status: res.statusCode ?? 0,
              location: typeof res.headers.location === 'string' ? res.headers.location : undefined,
              contentType: typeof ct === 'string' ? ct : '',
              stream: res,
            });
          },
        );
      } catch (e) {
        reject(new NetError('network', `permintaan gagal (${url.hostname}): ${sanitize(e)}`));
        return;
      }
      req.on('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'LAKAR_BLOCKED_IP') reject(new NetError('blocked', `host ${url.hostname} resolve ke alamat non-publik`, { retryable: false }));
        else reject(new NetError('network', `koneksi ke ${url.hostname} gagal: ${e.code ?? sanitize(e)}`));
      });
      req.end();
    });
  }

  async #readBody(stream: IncomingMessage, maxBytes: number, url: URL): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for await (const chunk of stream) {
        const b = chunk as Buffer;
        total += b.length;
        if (total > maxBytes) {
          stream.destroy();
          throw new NetError('too-large', `respons ${describeUrl(url)} melewati batas ${maxBytes} byte`, { retryable: false });
        }
        chunks.push(b);
      }
    } catch (e) {
      if (e instanceof NetError) throw e;
      throw new NetError('network', `body ${url.hostname} terputus: ${sanitize(e)}`);
    }
    return Buffer.concat(chunks, total);
  }
}

/** Pesan error tanpa URL/query (hanya kata pertama yang aman). */
function sanitize(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  if (typeof code === 'string') return code;
  const name = (e as { name?: unknown })?.name;
  return typeof name === 'string' ? name : 'error';
}
