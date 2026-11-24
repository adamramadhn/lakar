// Koneksi Postgres + runner migrasi SQL plain (bukan ORM): file `NNNN_*.sql` di `migrations/`
// diterapkan berurutan dalam satu transaksi per file; versi tercatat di `schema_migrations`.
// Pola sama dengan services/api/src/db.ts.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Pool } from 'pg';
export type { Pool } from 'pg';

/** Direktori migrasi bawaan paket (sama relatif dari `src/` dan `dist/`). */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

const MIGRATION_FILE = /^(\d+)_.*\.sql$/;

export function createPool(url: string): Pool {
  const pool = new Pool({ connectionString: url });
  // Wajib: tanpa listener 'error', error koneksi klien idle (putus jaringan/restart DB)
  // memancarkan EventEmitter error tak tertangani → proses mati.
  pool.on('error', (e) => console.error('lakar-sync: klien pool idle error', e));
  return pool;
}

/** Terapkan migrasi yang belum jalan; kembalikan daftar versi yang baru diterapkan. */
export async function migrate(pool: Pool, dir = MIGRATIONS_DIR): Promise<number[]> {
  // Tabel versi diciptakan juga oleh 0001; di sini dijamin dulu supaya runner bekerja pada DB kosong
  // maupun DB yang isinya tinggal migrasi berikutnya.
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const { rows } = await pool.query<{ version: number }>('SELECT version FROM schema_migrations');
  const done = new Set(rows.map((r) => r.version));
  const files = (await readdir(dir))
    .map((f) => ({ file: f, m: MIGRATION_FILE.exec(f) }))
    .filter((x): x is { file: string; m: RegExpExecArray } => x.m !== null)
    .map((x) => ({ file: x.file, version: Number(x.m[1]) }))
    .filter((x) => !done.has(x.version))
    .sort((a, b) => a.version - b.version);
  const applied: number[] = [];
  for (const { file, version } of files) {
    const sql = await readFile(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      applied.push(version);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
  return applied;
}
