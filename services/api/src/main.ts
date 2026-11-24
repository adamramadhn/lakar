// Entry @lakar/api: `DATABASE_URL` wajib; `PORT` (default 8080), `HOST` (default 0.0.0.0 —
// service ini memang untuk dijangkau jaringan, berbeda dengan lakard yang loopback-saja),
// `LAKAR_API_KEY` (endpoint pemilik; kosong = semua endpoint pemilik 401), `PUBLIC_BASE_URL`
// (basis field `url` share, mis. `https://share.example.com`; tanpa ini dipakai
// `x-forwarded-proto` — satu hop proxy tepercaya — + header Host permintaan).
import { buildApi } from './app.js';
import { createPool, migrate } from './db.js';
import { PgShareRepo } from './repo.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('lakar-api: DATABASE_URL wajib diset (contoh postgres://user:pass@host:5432/db)');
  process.exit(1);
}
if (!process.env.LAKAR_API_KEY) {
  console.warn('lakar-api: LAKAR_API_KEY tidak diset — endpoint pemilik (/api/shares tulis) selalu 401');
}

const pool = createPool(url);
const applied = await migrate(pool);
if (applied.length) console.log(`lakar-api: migrasi diterapkan: ${applied.join(', ')}`);

const app = buildApi({
  repo: new PgShareRepo(pool),
  ...(process.env.LAKAR_API_KEY ? { apiKey: process.env.LAKAR_API_KEY } : {}),
  ...(process.env.PUBLIC_BASE_URL ? { publicBaseUrl: process.env.PUBLIC_BASE_URL } : {}),
  logger: true,
});
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
await app.listen({ host, port });

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
