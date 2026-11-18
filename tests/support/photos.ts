// Penyedia foto palsu untuk tes (bukan bagian dist paket mana pun): satu server HTTP lokal yang meniru
// api.pexels.com, commons.wikimedia.org, api.openverse.org, images.pexels.com, thumb/upload.wikimedia.org, dan
// live.staticflickr.com berdasarkan header Host. SafeNet tes memakai transport http ke server ini + resolver palsu; validasi URL/allowlist/IP tetap asli.
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { crc32, deflateSync } from 'node:zlib';
import type { SafeNetOptions } from '../../packages/daemon/src/photos/net.ts';
import { isBlockedIp } from '../../packages/daemon/src/photos/net.ts';

/** PNG RGB 8-bit `w`×`h` satu warna. */
export function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Warna foto uji utama (pexels:2014422). */
export const PHOTO_RGB: [number, number, number] = [0x2e, 0x7d, 0x32];
export const PHOTO_PNG = solidPng(64, 48, PHOTO_RGB);
export const THUMB_PNG = solidPng(8, 6, PHOTO_RGB);
export const WIKI_PNG = solidPng(40, 30, [0x15, 0x65, 0xc0]);

export const OV_BY = 'aaaaaaaa-0000-4000-8000-000000000001';
export const OV_CC0 = 'aaaaaaaa-0000-4000-8000-000000000002';
const OV_EVIL = 'aaaaaaaa-0000-4000-8000-000000000003';
const OV_HUGE = 'aaaaaaaa-0000-4000-8000-000000000004';
const OV_NC = 'aaaaaaaa-0000-4000-8000-000000000005';

/** ID Pexels khusus (by-id) yang memicu kasus unduhan buruk. */
export const PEXELS_CASE = { redirectEvil: '900001', html: '900002', huge: '900003', redirectOk: '900004' } as const;

const pexelsPhoto = (id: string, file = `pexels-photo-${id}.jpeg`) => ({
  id: Number(id),
  width: 4000,
  height: 3000,
  url: `https://www.pexels.com/photo/kamar-${id}/`,
  photographer: 'Rina Wijaya',
  photographer_url: 'https://www.pexels.com/@rina',
  avg_color: '#2E7D32',
  alt: 'Kamar hotel dengan tempat tidur putih',
  src: { original: `https://images.pexels.com/photos/${id}/${file}`, tiny: `https://images.pexels.com/photos/${id}/${file}?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280` },
});

const ovImage = (id: string, url: string, license = 'by', filesize = 120_000) => ({
  id,
  title: `Kamar ${id.slice(-1)}`,
  url,
  thumbnail: `https://api.openverse.org/v1/images/${id}/thumb/`,
  creator: 'Budi Santoso',
  creator_url: 'https://www.flickr.com/people/budi',
  license,
  license_version: '2.0',
  license_url: 'https://creativecommons.org/licenses/by/2.0/',
  foreign_landing_url: `https://www.flickr.com/photos/budi/${id.slice(-4)}`,
  filesize,
  width: 40,
  height: 30,
  attribution: `"Kamar" by Budi Santoso is licensed under CC BY 2.0.`,
});

const OV_RESULTS = [
  ovImage(OV_BY, 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Kamar.png'),
  ovImage(OV_EVIL, 'https://example.com/x.png'),
  ovImage(OV_HUGE, 'https://live.staticflickr.com/1/huge.jpg', 'cc0', 20 * 1024 * 1024),
  ovImage(OV_NC, 'https://live.staticflickr.com/1/nc.jpg', 'by-nc'),
  ovImage(OV_CC0, 'https://live.staticflickr.com/65535/kamar_b.png', 'cc0'),
];

// ---------------------------------------------------------------------------
// Wikimedia Commons palsu: setiap baris matriks (kandidat baik, buruk, ranking, keragaman, orientation, URL impor).
// ---------------------------------------------------------------------------

type WikiSpec = {
  id: number;
  title: string;
  index: number;
  width?: number;
  height?: number;
  size?: number;
  mime?: string;
  license?: string;
  short?: string;
  artist?: string;
  categories?: string;
  nonFree?: boolean;
  /** Thumbnail tanpa segmen `/330px-` (turunan URL impor gagal). */
  oddThumb?: boolean;
};

const MIB = 1024 * 1024;
const wikiFile = (title: string) => title.replace(/^File:/, '').replace(/ /g, '_');
const UTM = '?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=';

/** ID halaman Wikimedia palsu per kasus. */
export const WIKI = {
  bySa: 1001, // relevansi 1, CC BY-SA, 4000 lebar → impor turunan 3840px
  cc0: 1002, // CC0, 3000 lebar, 2 MiB → impor URL asli
  featured: 1003, // Featured pictures → naik
  bw: 1004, // hitam-putih → turun
  spam1: 1005,
  spam2: 1006,
  spam3: 1007, // pembuat sama ketiga → dibuang (maks 2 per pembuat)
  png: 1008, // PNG 20 MiB → impor turunan 1920px
  portrait: 1009,
  square: 1010,
  svg: 2001,
  tiff: 2002,
  nc: 2003,
  gfdl: 2004,
  nonFree: 2005,
  small: 2006,
  panorama: 2007,
  map: 2008,
  pdArt: 2009,
  logo: 2010,
  oddThumb: 2011,
} as const;

const WIKI_SPECS: WikiSpec[] = [
  { id: WIKI.bySa, title: 'File:Running shoes on track.jpg', index: 1, width: 4000, height: 3000, size: 5 * MIB, license: 'cc-by-sa-4.0', short: 'CC BY-SA 4.0', artist: '<a href="//commons.wikimedia.org/wiki/User:Ana" title="User:Ana">Ana &amp; Co</a>', categories: 'Running shoes|Self-published work' },
  { id: WIKI.cc0, title: 'File:Shoes on wooden floor.jpg', index: 2, width: 3000, height: 2000, size: 2 * MIB, license: 'cc0', short: 'CC0', artist: 'Budi', categories: 'Shoes' },
  { id: WIKI.bw, title: 'File:Old shoe shop.jpg', index: 3, width: 3000, height: 2000, size: 2 * MIB, license: 'pd', short: 'Public domain', artist: 'Citra', categories: 'Black and white photographs of shops|PD-old-70' },
  { id: WIKI.spam1, title: 'File:Liat Portal 1.jpg', index: 4, width: 3000, height: 2000, size: 2 * MIB, license: 'cc-by-4.0', short: 'CC BY 4.0', artist: 'Liat Portal' },
  { id: WIKI.featured, title: 'File:Trail runner shoes.jpg', index: 5, width: 3000, height: 2000, size: 2 * MIB, license: 'cc-by-sa-3.0', short: 'CC BY-SA 3.0', artist: 'Dewi', categories: 'Featured pictures of objects|Shoes' },
  { id: WIKI.spam2, title: 'File:Liat Portal 2.jpg', index: 6, width: 3000, height: 2000, size: 2 * MIB, license: 'cc-by-4.0', short: 'CC BY 4.0', artist: 'Liat Portal' },
  { id: WIKI.spam3, title: 'File:Liat Portal 3.jpg', index: 7, width: 3000, height: 2000, size: 2 * MIB, license: 'cc-by-4.0', short: 'CC BY 4.0', artist: 'Liat Portal' },
  { id: WIKI.png, title: 'File:Sneaker studio.png', index: 8, width: 5000, height: 4000, size: 20 * MIB, mime: 'image/png', license: 'cc0', short: 'CC0', artist: 'Eka' },
  { id: WIKI.portrait, title: 'File:Runner portrait.jpg', index: 9, width: 2000, height: 3000, size: 2 * MIB, license: 'cc-by-2.0', short: 'CC BY 2.0', artist: 'Fajar' },
  { id: WIKI.square, title: 'File:Shoe square.jpg', index: 10, width: 2000, height: 2000, size: 2 * MIB, license: 'cc-by-2.0', short: 'CC BY 2.0', artist: 'Gita' },
  { id: WIKI.svg, title: 'File:Shoe vector.svg', index: 11, mime: 'image/svg+xml' },
  { id: WIKI.tiff, title: 'File:Shoe scan.tif', index: 12, mime: 'image/tiff' },
  { id: WIKI.nc, title: 'File:Shoe nc.jpg', index: 13, license: 'cc-by-nc-sa-2.0', short: 'CC BY-NC-SA 2.0' },
  { id: WIKI.gfdl, title: 'File:Shoe gfdl.jpg', index: 14, license: 'gfdl', short: 'GFDL' },
  { id: WIKI.nonFree, title: 'File:Shoe nonfree.jpg', index: 15, nonFree: true },
  { id: WIKI.small, title: 'File:Shoe small.jpg', index: 16, width: 640, height: 480 },
  { id: WIKI.panorama, title: 'File:Shoe panorama.jpg', index: 17, width: 4000, height: 1000 },
  { id: WIKI.map, title: 'File:Shoe district.jpg', index: 18, categories: 'Maps of Jakarta' },
  { id: WIKI.pdArt, title: 'File:Shoe still life.jpg', index: 19, license: 'pd', short: 'Public domain', categories: 'PD-Art (PD-old-100)' },
  { id: WIKI.logo, title: 'File:Shoe brand logo.jpg', index: 20 },
  { id: WIKI.oddThumb, title: 'File:Shoe huge.jpg', index: 21, width: 9000, height: 6000, size: 30 * MIB, oddThumb: true },
];

function wikiPage(w: WikiSpec) {
  const file = wikiFile(w.title);
  const meta: Record<string, { value: string }> = {
    ObjectName: { value: file },
    Artist: { value: w.artist ?? 'Hadi' },
    LicenseShortName: { value: w.short ?? 'CC BY 4.0' },
    License: { value: w.license ?? 'cc-by-4.0' },
    LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0' },
    Categories: { value: w.categories ?? 'Shoes' },
  };
  if (w.nonFree) meta.NonFree = { value: 'true' };
  return {
    pageid: w.id,
    ns: 6,
    title: w.title,
    index: w.index,
    imageinfo: [
      {
        size: w.size ?? 2 * MIB,
        width: w.width ?? 3000,
        height: w.height ?? 2000,
        thumburl: w.oddThumb
          ? `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/${file}/lossy-page1-${file}${UTM}thumbnail`
          : `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/${file}/330px-${file}${UTM}thumbnail`,
        thumbwidth: 330,
        url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${file}${UTM}original`,
        descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(w.title.replace(/ /g, '_'))}`,
        mime: w.mime ?? 'image/jpeg',
        extmetadata: meta,
      },
    ],
  };
}

export const WIKI_PAGES = WIKI_SPECS.map(wikiPage);

export type FakeRequest = { host: string; path: string; auth?: string; ua?: string };
export type Mode = 'ok' | 'hang' | number;
export type WikiMode = Mode | 'maxlag' | 'empty';

export type FakeProviders = {
  port: number;
  requests: FakeRequest[];
  /** Mode api.pexels.com / commons.wikimedia.org / api.openverse.org: ok, hang, atau status HTTP (+ maxlag/empty Wikimedia). */
  mode: { pexels: Mode; wikimedia: WikiMode; openverse: Mode | 'empty' };
  /** Konkurensi maksimum permintaan API commons.wikimedia.org yang teramati (reset manual). */
  wikiConcurrency: { now: number; max: number };
  /** Alamat per host untuk resolver palsu (default 127.0.0.1). */
  ipFor: Map<string, string>;
  /** Opsi SafeNet tes: transport http ke server ini; loopback diizinkan khusus tes, IP lain tetap difilter asli. */
  netOptions(): SafeNetOptions;
  close(): Promise<void>;
};

export async function startFakeProviders(): Promise<FakeProviders> {
  const requests: FakeRequest[] = [];
  const mode: FakeProviders['mode'] = { pexels: 'ok', wikimedia: 'ok', openverse: 'ok' };
  const wikiConcurrency = { now: 0, max: 0 };
  const ipFor = new Map<string, string>();
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const png = (res: ServerResponse, body: Buffer) => {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(body);
  };
  const server: Server = createServer((req: IncomingMessage, res) => {
    const host = (req.headers.host ?? '').split(':')[0]!;
    const path = req.url ?? '/';
    const auth = req.headers.authorization;
    const ua = req.headers['user-agent'];
    requests.push({ host, path, ...(auth ? { auth } : {}), ...(ua ? { ua } : {}) });
    const u = new URL(path, 'http://x');
    if (host === 'commons.wikimedia.org') {
      wikiConcurrency.now++;
      wikiConcurrency.max = Math.max(wikiConcurrency.max, wikiConcurrency.now);
      res.on('close', () => wikiConcurrency.now--);
      if (mode.wikimedia === 'hang') return;
      // Jeda kecil agar permintaan paralel (bila ada) benar-benar tumpang tindih.
      setTimeout(() => {
        if (typeof mode.wikimedia === 'number') return json(res, mode.wikimedia, { error: 'palsu' });
        if (mode.wikimedia === 'maxlag') {
          res.writeHead(200, { 'content-type': 'application/json', 'retry-after': '5' });
          return res.end(JSON.stringify({ error: { code: 'maxlag', info: 'Waiting for a database server: 6 seconds lagged.' } }));
        }
        if (u.pathname !== '/w/api.php') return json(res, 404, {});
        const pageids = u.searchParams.get('pageids');
        if (pageids) {
          const hit = WIKI_PAGES.find((p) => String(p.pageid) === pageids);
          return json(res, 200, { batchcomplete: true, query: { pages: [hit ?? { pageid: Number(pageids), missing: true }] } });
        }
        if (u.searchParams.get('generator') === 'search') {
          if (mode.wikimedia === 'empty') return json(res, 200, { batchcomplete: true });
          return json(res, 200, { batchcomplete: true, query: { pages: WIKI_PAGES } });
        }
        return json(res, 200, { error: { code: 'badvalue', info: 'palsu' } });
      }, 25);
      return;
    }
    const apiMode = host === 'api.pexels.com' ? mode.pexels : host === 'api.openverse.org' && !u.pathname.endsWith('/thumb/') ? mode.openverse : 'ok';
    if (apiMode === 'hang') return; // tidak pernah menjawab
    if (typeof apiMode === 'number') return json(res, apiMode, { error: 'palsu' });
    if (host === 'api.pexels.com') {
      if (u.pathname === '/v1/search') {
        const n = Number(u.searchParams.get('per_page') ?? 6);
        return json(res, 200, { photos: ['2014422', '2014423', '2014424', '2014425'].slice(0, n).map((id) => pexelsPhoto(id)) });
      }
      const m = /^\/v1\/photos\/(\d+)$/.exec(u.pathname);
      if (m) {
        const id = m[1]!;
        const special = Object.entries(PEXELS_CASE).find(([, v]) => v === id)?.[0];
        if (special) return json(res, 200, pexelsPhoto(id, `${special}.jpeg`));
        if (id.startsWith('2014')) return json(res, 200, pexelsPhoto(id));
        return json(res, 404, { error: 'Not Found' });
      }
      return json(res, 404, {});
    }
    if (host === 'api.openverse.org') {
      if (u.pathname === '/v1/images/') return json(res, 200, apiMode === 'empty' ? { result_count: 0, results: [] } : { result_count: OV_RESULTS.length, results: OV_RESULTS });
      const thumb = /^\/v1\/images\/([0-9a-f-]+)\/thumb\/$/.exec(u.pathname);
      // Seperti Openverse asli (negosiasi konten DRF): Accept tanpa `*/*` (mis. hanya `image/*`) → 406.
      if (thumb) return (req.headers.accept ?? '*/*').includes('*/*') ? png(res, THUMB_PNG) : json(res, 406, { detail: 'Could not satisfy the request Accept header.' });
      const m = /^\/v1\/images\/([0-9a-f-]+)\/$/.exec(u.pathname);
      const hit = m && OV_RESULTS.find((r) => r.id === m[1]);
      return hit ? json(res, 200, hit) : json(res, 404, { detail: 'Not found.' });
    }
    if (host === 'images.pexels.com') {
      if (path.includes('redirect-evil')) {
        res.writeHead(302, { location: 'https://evil.example.com/x.png' });
        return res.end();
      }
      if (path.includes('redirectOk')) {
        res.writeHead(302, { location: 'https://upload.wikimedia.org/ok.png' });
        return res.end();
      }
      if (path.includes('redirectEvil')) {
        res.writeHead(302, { location: 'https://evil.example.com/x.png' });
        return res.end();
      }
      if (path.includes('html')) {
        res.writeHead(200, { 'content-type': 'image/jpeg' });
        return res.end('<!doctype html><html><body>bukan gambar</body></html>');
      }
      if (path.includes('huge')) {
        // Tanpa content-length (chunked): batas byte harus ditegakkan saat streaming.
        res.writeHead(200, { 'content-type': 'image/png' });
        res.write(PHOTO_PNG.subarray(0, 16));
        const block = Buffer.alloc(1024 * 1024, 7);
        let sent = 0;
        const pump = () => {
          while (sent < 14 && res.write(block)) sent++;
          if (sent < 14) res.once('drain', pump);
          else res.end();
        };
        res.on('error', () => {});
        return pump();
      }
      return png(res, u.searchParams.has('h') ? THUMB_PNG : PHOTO_PNG);
    }
    if (host === 'thumb.wikimedia.org') return png(res, /\/330px-/.test(u.pathname) ? THUMB_PNG : WIKI_PNG);
    if (host === 'upload.wikimedia.org' || host === 'live.staticflickr.com') return png(res, WIKI_PNG);
    json(res, 404, {});
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return {
    port,
    requests,
    mode,
    wikiConcurrency,
    ipFor,
    netOptions: () => ({
      resolve: async (hostname) => [{ address: ipFor.get(hostname) ?? '127.0.0.1', family: 4 }],
      blockIp: (ip) => ip !== '127.0.0.1' && isBlockedIp(ip),
      transport: (opts, cb) => httpRequest({ ...opts, protocol: 'http:', port }, cb),
    }),
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
