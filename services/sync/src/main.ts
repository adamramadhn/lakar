// Entry @lakar/sync: `DATABASE_URL` wajib; `PORT` (default 8080), `HOST` (default 0.0.0.0 —
// service ini memang untuk dijangkau jaringan, berbeda dengan lakard yang loopback-saja),
// `LAKAR_API_KEY` (admin endpoint pemilik; kosong = hanya Bearer session akun yang diterima —
// spec-cloud-auth story B).
import { buildSync } from './app.js';
import { createPool, migrate } from './db.js';
import { PgRoomRepo } from './repo.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('lakar-sync: DATABASE_URL wajib diset (contoh postgres://user:pass@host:5432/db)');
  process.exit(1);
}
if (!process.env.LAKAR_API_KEY) {
  console.warn('lakar-sync: LAKAR_API_KEY tidak diset — endpoint pemilik (/api/rooms) hanya menerima Bearer session');
}

const pool = createPool(url);
const applied = await migrate(pool);
if (applied.length) console.log(`lakar-sync: migrasi diterapkan: ${applied.join(', ')}`);

const app = buildSync({
  repo: new PgRoomRepo(pool),
  ...(process.env.LAKAR_API_KEY ? { apiKey: process.env.LAKAR_API_KEY } : {}),
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
