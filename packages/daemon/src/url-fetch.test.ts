// Fetch halaman untuk impor URL (epic adopsi open-pencil story 8): validasi anti-SSRF dua lapis (literal +
// hasil DNS di lookup koneksi), redirect divalidasi ulang per hop, timeout, batas byte, tipe konten, dan judul
// halaman — tanpa jaringan keluar (server HTTP lokal + transport/resolver palsu, pola yang sama dengan SafeNet).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { NetError, isBlockedIp } from './photos/net.js';
import { URL_FETCH_MAX_REDIRECTS, checkPageUrl, fetchPageHtml, pageTitle, type PageFetchOptions } from './url-fetch.js';

const HTML = '<!doctype html><html><head><title>Cool &amp; Site</title></head><body><h1>Hi</h1></body></html>';

let server: Server;
let port: number;
/** Alamat per host untuk resolver palsu (default 127.0.0.1). */
const ipFor = new Map<string, string>();
const requests: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/';
    requests.push(path);
    if (path === '/hang') return; // tidak pernah menjawab (uji timeout)
    if (path === '/redirect1') {
      res.writeHead(302, { location: '/redirect2' });
      return res.end();
    }
    if (path === '/redirect2') {
      res.writeHead(301, { location: '/' });
      return res.end();
    }
    if (path.startsWith('/loop')) {
      const n = Number(path.slice(5) || 0);
      res.writeHead(302, { location: `/loop${n + 1}` });
      return res.end();
    }
    if (path === '/to-private') {
      res.writeHead(302, { location: 'http://10.0.0.5/secret' });
      return res.end();
    }
    if (path === '/to-scheme') {
      res.writeHead(302, { location: 'ftp://example.com/x' });
      return res.end();
    }
    if (path === '/no-location') {
      res.writeHead(302);
      return res.end();
    }
    if (path === '/status404') return res.writeHead(404).end('nope');
    if (path === '/json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{}');
    }
    if (path === '/no-type') {
      res.writeHead(200);
      return res.end(HTML);
    }
    if (path === '/latin1') {
      res.writeHead(200, { 'content-type': 'text/html; charset=iso-8859-1' });
      return res.end(Buffer.concat([Buffer.from('<html><body>caf'), Buffer.from([0xe9]), Buffer.from('</body></html>')]));
    }
    if (path === '/big') {
      res.writeHead(200, { 'content-type': 'text/html' });
      const block = Buffer.alloc(1024 * 1024, 65);
      for (let i = 0; i < 4; i++) res.write(block);
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HTML);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
});
afterAll(async () => {
  await new Promise<void>((r) => {
    server.closeAllConnections();
    server.close(() => r());
  });
});

/** Opsi fetch tes (pola netOptions SafeNet): loopback diizinkan khusus tes; IP lain tetap difilter asli. */
const opts = (extra: PageFetchOptions = {}): PageFetchOptions => ({
  resolve: async (hostname) => [{ address: ipFor.get(hostname) ?? '127.0.0.1', family: 4 }],
  blockIp: (ip) => ip !== '127.0.0.1' && isBlockedIp(ip),
  transport: (o, cb) => httpRequest({ ...o, protocol: 'http:', port }, cb),
  ...extra,
});

const err = async (p: Promise<unknown>): Promise<NetError> => (await p.catch((e: unknown) => e)) as NetError;

describe('checkPageUrl', () => {
  it('http/https publik diterima; skema lain, kredensial, dan tanpa host ditolak', () => {
    for (const u of ['https://example.com/', 'http://example.com:8080/p?q=1', 'https://8.8.8.8/x']) expect(checkPageUrl(u).href).toBe(new URL(u).href);
    for (const u of ['ftp://example.com', 'file:///c:/x', 'javascript:alert(1)', 'data:text/html,x', 'mailto:a@b.c', '//example.com/x', 'bukan url']) {
      expect(() => checkPageUrl(u), u).toThrow(NetError);
    }
    expect(() => checkPageUrl('https://user:pass@example.com/')).toThrow(/berkredensial/);
  });

  it('literal IP non-publik ditolak (loopback, privat, link-local, CGNAT, v6, mapped)', () => {
    for (const u of [
      'http://127.0.0.1/',
      'http://127.9.9.9:8080/',
      'http://10.1.2.3/',
      'http://172.16.0.1/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data',
      'http://100.64.1.1/',
      'http://0.0.0.0/',
      'http://[::1]/',
      'http://[fe80::1]/',
      'http://[fc00::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:10.0.0.1]/',
      // Bentuk IP alternatif (parser WHATWG menormalkan ke dotted-quad sebelum dicek).
      'http://2130706433/',
      'http://0x7f000001/',
      'http://127.1/',
      'http://0/',
      'http://[fe80::1%25eth0]/',
    ]) {
      const e = ((): NetError => {
        try {
          checkPageUrl(u);
          throw new Error('harusnya ditolak');
        } catch (x) {
          return x as NetError;
        }
      })();
      expect(e.kind, u).toBe('blocked');
      expect(e.retryable).toBe(false);
    }
    // Alamat publik tetap lolos.
    expect(checkPageUrl('http://[2606:4700:4700::1111]/').hostname).toBe('[2606:4700:4700::1111]');
  });
});

describe('fetchPageHtml', () => {
  it('halaman HTML → {html, title, finalUrl, status, bytes}; header UA; tanpa skrip dieksekusi (hanya GET)', async () => {
    const p = await fetchPageHtml('http://site.test/', opts());
    expect(p).toMatchObject({ status: 200, finalUrl: 'http://site.test/', title: 'Cool & Site' });
    expect(p.html).toContain('<h1>Hi</h1>');
    expect(p.bytes).toBe(Buffer.byteLength(HTML));
    expect(requests).toContain('/');
  });

  it('redirect diikuti dan finalUrl = tujuan akhir; >3 hop dan tujuan terlarang ditolak', async () => {
    const p = await fetchPageHtml('http://site.test/redirect1', opts());
    expect(p.finalUrl).toBe('http://site.test/');
    expect(p.title).toBe('Cool & Site');
    const loop = await err(fetchPageHtml('http://site.test/loop0', opts()));
    expect(loop.kind).toBe('blocked');
    expect(loop.message).toContain(`${URL_FETCH_MAX_REDIRECTS}`);
    const priv = await err(fetchPageHtml('http://site.test/to-private', opts()));
    expect(priv.kind).toBe('blocked');
    const scheme = await err(fetchPageHtml('http://site.test/to-scheme', opts()));
    expect(scheme.kind).toBe('blocked');
    const noloc = await err(fetchPageHtml('http://site.test/no-location', opts()));
    expect(noloc.kind).toBe('bad-response');
  });

  it('hostname yang resolve ke IP non-publik ditolak di koneksi (tanpa celah DNS)', async () => {
    ipFor.set('evil.test', '10.0.0.5');
    try {
      const e = await err(fetchPageHtml('http://evil.test/', opts()));
      expect(e.kind).toBe('blocked');
      expect(e.message).toContain('non-publik');
    } finally {
      ipFor.delete('evil.test');
    }
  });

  it('HTTP error, tipe bukan HTML, body besar, dan timeout dipetakan ke NetError yang tepat', async () => {
    const nf = await err(fetchPageHtml('http://site.test/status404', opts()));
    expect(nf).toMatchObject({ kind: 'http', status: 404, retryable: false });
    const busy = await err(fetchPageHtml('http://site.test/status404', opts()));
    expect(busy.kind).toBe('http');
    const json = await err(fetchPageHtml('http://site.test/json', opts()));
    expect(json.kind).toBe('bad-response');
    const big = await err(fetchPageHtml('http://site.test/big', opts({ maxBytes: 1024 })));
    expect(big.kind).toBe('too-large');
    const to = await err(fetchPageHtml('http://site.test/hang', opts({ timeoutMs: 150 })));
    expect(to).toMatchObject({ kind: 'timeout', retryable: true });
    expect(to.message).not.toContain('rahasia');
  });

  it('content-type tanpa header diterima; charset latin1 didekode', async () => {
    const p = await fetchPageHtml('http://site.test/no-type', opts());
    expect(p.status).toBe(200);
    const l = await fetchPageHtml('http://site.test/latin1', opts());
    expect(l.html).toContain('café');
  });
});

describe('pageTitle', () => {
  it('mengambil <title> pertama, entity didekode, ws dirapatkan; tanpa title → undefined', () => {
    expect(pageTitle('<html><title> A   &amp;  B </title>x<title>lain</title>')).toBe('A & B');
    expect(pageTitle('<html><body>tanpa</body></html>')).toBeUndefined();
    expect(pageTitle(`<title>${'x'.repeat(200)}</title>`)!.length).toBe(120);
  });
});
