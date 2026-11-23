// Fetch halaman web untuk impor URL (epic adopsi open-pencil story 8). Kebijakan jaringan sama dengan SafeNet
// (`photos/net.ts`), disesuaikan untuk halaman publik atas permintaan eksplisit pengguna/agen:
// - Hanya http/https, tanpa kredensial; port bebas selama host publik.
// - IP non-publik ditolak dua lapis: literal di `checkPageUrl` (tanpa request) dan hasil DNS di `lookup` koneksi
//   (tanpa celah DNS rebinding), diverifikasi ulang pada setiap hop redirect (maks 3).
// - Batas waktu total 15 detik, body streaming maks 10 MB, `accept-encoding: identity` (tanpa dekompresi).
// - Pesan error tidak memuat query, header, atau kredensial.
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup } from 'node:dns';
import { isIP } from 'node:net';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { NetError, USER_AGENT, describeUrl, isBlockedIp, type Resolver, type Transport } from './photos/net.js';

/** Batas waktu total fetch (termasuk redirect), sesuai catatan desain section 11. */
export const URL_FETCH_TIMEOUT_MS = 15_000;
/** Ukuran body maksimum (desain: 10 MB); ditegakkan saat streaming, bukan dari content-length. */
export const URL_FETCH_MAX_BYTES = 10 * 1024 * 1024;
/** Hop redirect maksimum (sama dengan SafeNet). */
export const URL_FETCH_MAX_REDIRECTS = 3;
/** Panjang URL maksimum yang diterima route (karakter). */
export const URL_FETCH_URL_MAX = 2048;

/** Halaman hasil fetch untuk importer HTML. */
export type FetchedPage = { html: string; finalUrl: string; status: number; contentType: string; title?: string; bytes: number };

export type PageFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  /** Hanya untuk tes: resolver DNS pengganti (hasilnya tetap difilter `blockIp`). */
  resolve?: Resolver;
  /** Hanya untuk tes: predikat IP terlarang pengganti (default `isBlockedIp`). */
  blockIp?: (ip: string) => boolean;
  /** Hanya untuk tes: transport pengganti (default `http.request`/`https.request` per skema). */
  transport?: Transport;
};

/** Titik injeksi fetch di route (`opts.page`); tes mengganti tanpa menyentuh validasi. */
export type PageFetch = (raw: string, opts?: PageFetchOptions) => Promise<FetchedPage>;

const systemResolver: Resolver = (hostname) =>
  new Promise((resolve, reject) => dnsLookup(hostname, { all: true }, (err, addrs) => (err ? reject(err) : resolve(addrs))));

/**
 * Validasi URL halaman: http/https, tanpa kredensial, host ada, dan literal IP non-publik (loopback, privat,
 * link-local, dll. lewat `isBlockedIp`) ditolak sebelum ada request. Hostname biasa dicek lagi di `lookup` koneksi.
 */
export function checkPageUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = typeof raw === 'string' ? new URL(raw) : raw;
  } catch {
    throw new NetError('blocked', 'URL tidak valid', { retryable: false });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new NetError('blocked', `hanya http(s) yang diizinkan (${url.protocol || 'tanpa skema'})`, { retryable: false });
  }
  if (url.username || url.password) throw new NetError('blocked', `URL berkredensial ditolak (${url.hostname})`, { retryable: false });
  if (!url.hostname) throw new NetError('blocked', 'URL tanpa host', { retryable: false });
  // `url.hostname` mempertahankan kurung untuk IPv6 (`[::1]`); literal IPv4/IPv6 dicek langsung supaya penolakan
  // deterministik. Bentuk ::ffff: hex sudah dianggap non-publik oleh `isBlockedIp`.
  const host = url.hostname.startsWith('[') && url.hostname.endsWith(']') ? url.hostname.slice(1, -1) : url.hostname;
  if (isIP(host) && isBlockedIp(host)) {
    throw new NetError('blocked', `alamat non-publik ditolak (${url.hostname})`, { retryable: false });
  }
  return url;
}

/** Lookup koneksi (seperti SafeNet.#lookup): resolve lalu tolak bila ada alamat non-publik. */
const guardedLookup =
  (resolve: Resolver, blockIp: (ip: string) => boolean) =>
  (hostname: string, options: { all?: boolean } | number | undefined, callback: (...args: unknown[]) => void): void => {
    const all = typeof options === 'object' && options !== null && options.all === true;
    resolve(hostname).then(
      (addrs) => {
        const bad = addrs.find((a) => blockIp(a.address));
        if (!addrs.length) return callback(Object.assign(new Error(`DNS ${hostname}: tanpa alamat`), { code: 'ENOTFOUND' }));
        if (bad) return callback(Object.assign(new Error(`host ${hostname} resolve ke alamat non-publik`), { code: 'LAKAR_BLOCKED_IP' }));
        if (all) return callback(null, addrs);
        return callback(null, addrs[0]!.address, addrs[0]!.family);
      },
      (err: unknown) => callback(err),
    );
  };

/** `content-type` halaman HTML yang diterima (parameter diabaikan); tanpa header → dianggap HTML. */
const isHtmlType = (ct: string) => ct === '' || /^\s*(text\/html|application\/xhtml\+xml)\b/i.test(ct);

/** Charset body dari content-type; default utf-8 (latin1/windows-1252 didukung). */
const charsetOf = (ct: string): BufferEncoding => (/charset\s*=\s*"?(?:latin1|iso-8859-1|windows-1252)/i.test(ct) ? 'latin1' : 'utf8');

/** `<title>` pertama (≤ 120 karakter, entity dasar didekode); dipakai nama board default. */
export function pageTitle(html: string): string | undefined {
  const m = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i.exec(html.slice(0, 128 * 1024));
  if (!m) return undefined;
  const t = m[1]!
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t ? t.slice(0, 120) : undefined;
}

/**
 * GET `raw` dan redirect-nya (maks `URL_FETCH_MAX_REDIRECTS` hop, tiap hop divalidasi ulang lewat `checkPageUrl`).
 * Hanya dipanggil atas permintaan eksplisit (route impor URL). Mengembalikan HTML + metadata halaman.
 */
export async function fetchPageHtml(raw: string, opts: PageFetchOptions = {}): Promise<FetchedPage> {
  const timeoutMs = opts.timeoutMs ?? URL_FETCH_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? URL_FETCH_MAX_BYTES;
  const resolve = opts.resolve ?? systemResolver;
  const blockIp = opts.blockIp ?? isBlockedIp;
  const transport = opts.transport ?? ((o: RequestOptions, cb: (res: IncomingMessage) => void) => (o.protocol === 'https:' ? httpsRequest(o, cb) : httpRequest(o, cb)));
  const lookup = guardedLookup(resolve, blockIp);

  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, timeoutMs);
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
    let url = checkPageUrl(raw);
    for (let hop = 0; ; hop++) {
      const res = await once(transport, lookup, url, ac.signal).catch((e: unknown) => {
        if (timedOut) throw new NetError('timeout', `batas waktu ${timeoutMs} ms terlewati (${url.hostname})`);
        throw e;
      });
      if (res.status >= 300 && res.status < 400 && res.status !== 304) {
        res.stream.resume();
        if (hop >= URL_FETCH_MAX_REDIRECTS) throw new NetError('blocked', `lebih dari ${URL_FETCH_MAX_REDIRECTS} redirect (${url.hostname})`, { retryable: false });
        const loc = res.location;
        if (!loc) throw new NetError('bad-response', `redirect tanpa Location (${url.hostname})`, { retryable: false });
        let next: URL;
        try {
          next = new URL(loc, url);
        } catch {
          throw new NetError('blocked', `redirect ke URL tidak valid (${url.hostname})`, { retryable: false });
        }
        url = checkPageUrl(next);
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        res.stream.resume();
        throw new NetError('http', `HTTP ${res.status} dari ${describeUrl(url)}`, { status: res.status });
      }
      if (!isHtmlType(res.contentType)) {
        res.stream.resume();
        throw new NetError('bad-response', `respons ${describeUrl(url)} bukan HTML (${res.contentType.split(';')[0]})`, { retryable: false });
      }
      const body = await readBody(res.stream, maxBytes, url).catch((e: unknown) => {
        if (timedOut) throw new NetError('timeout', `batas waktu ${timeoutMs} ms terlewati (${url.hostname})`);
        throw e;
      });
      const html = body.toString(charsetOf(res.contentType));
      const title = pageTitle(html);
      return { html, finalUrl: url.toString(), status: res.status, contentType: res.contentType, ...(title ? { title } : {}), bytes: body.length };
    }
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuter);
  }
}

function once(
  transport: Transport,
  lookup: (hostname: string, options: { all?: boolean } | number | undefined, callback: (...args: unknown[]) => void) => void,
  url: URL,
  signal: AbortSignal,
): Promise<{ status: number; location: string | undefined; contentType: string; stream: IncomingMessage }> {
  const headers = { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-encoding': 'identity' };
  // Host IPv6 tanpa kurung untuk transport; lookup tetap memfilter literal (lapis kedua setelah checkPageUrl).
  const hostname = url.hostname.startsWith('[') && url.hostname.endsWith(']') ? url.hostname.slice(1, -1) : url.hostname;
  return new Promise((resolve, reject) => {
    let req: ClientRequest;
    try {
      req = transport(
        {
          protocol: url.protocol,
          hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          headers,
          signal,
          lookup: lookup as unknown as RequestOptions['lookup'],
          agent: false,
        },
        (res) => {
          const ct = res.headers['content-type'];
          resolve({
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

async function readBody(stream: IncomingMessage, maxBytes: number, url: URL): Promise<Buffer> {
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

/** Pesan error tanpa URL/query (hanya kata pertama yang aman). */
function sanitize(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  if (typeof code === 'string') return code;
  const name = (e as { name?: unknown })?.name;
  return typeof name === 'string' ? name : 'error';
}
