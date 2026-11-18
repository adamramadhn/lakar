// Penyedia foto palsu untuk tes (bukan bagian dist paket mana pun): satu server HTTP lokal yang meniru
// api.pexels.com, api.openverse.org, images.pexels.com, upload.wikimedia.org, dan live.staticflickr.com berdasarkan
// header Host. SafeNet tes memakai transport http ke server ini + resolver palsu; validasi URL/allowlist/IP tetap asli.
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

export type FakeRequest = { host: string; path: string; auth?: string };
export type Mode = 'ok' | 'hang' | number;

export type FakeProviders = {
  port: number;
  requests: FakeRequest[];
  /** Mode api.pexels.com / api.openverse.org: ok, hang, atau status HTTP. */
  mode: { pexels: Mode; openverse: Mode };
  /** Alamat per host untuk resolver palsu (default 127.0.0.1). */
  ipFor: Map<string, string>;
  /** Opsi SafeNet tes: transport http ke server ini; loopback diizinkan khusus tes, IP lain tetap difilter asli. */
  netOptions(): SafeNetOptions;
  close(): Promise<void>;
};

export async function startFakeProviders(): Promise<FakeProviders> {
  const requests: FakeRequest[] = [];
  const mode: FakeProviders['mode'] = { pexels: 'ok', openverse: 'ok' };
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
    requests.push({ host, path, ...(auth ? { auth } : {}) });
    const u = new URL(path, 'http://x');
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
      if (u.pathname === '/v1/images/') return json(res, 200, { result_count: OV_RESULTS.length, results: OV_RESULTS });
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
    if (host === 'upload.wikimedia.org' || host === 'live.staticflickr.com') return png(res, WIKI_PNG);
    json(res, 404, {});
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return {
    port,
    requests,
    mode,
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
