// Koneksi Postgres + runner migrasi SQL plain (bukan ORM): file `NNNN_*.sql` di `migrations/`
// diterapkan berurutan dalam satu transaksi per file; versi tercatat di `sync_schema_migrations`.
// Pola sama dengan services/api/src/db.ts, TAPI tabel versi diberi prefix service: kedua service
// berbagi satu Postgres (spec-cloud-auth) dan nomor versi migrasi bertabrakan (api 1..3 vs sync
// 1..2) — tabel `schema_migrations` bersama membuat service yang jalan belakangan melewati
// migrasinya sendiri (atau gagal cold-start berbarengan karena PK ganda). File SQL sync semuanya
// IF NOT EXISTS, jadi re-apply pada install yang sempat mencatat versi di `schema_migrations`
// lama aman (no-op); `schema_migrations` tetap dipakai service api.
// CATATAN: install lama yang sudah menjalankan sync versi lama bisa meninggalkan baris versi
// milik sync di `schema_migrations` — api lalu melewati migrasinya sendiri. Semua file api juga
// IF NOT EXISTS, jadi menghapus baris itu (atau namespacing serupa di api) memulihkannya.
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

/** Tabel versi migrasi milik sync (bukan `schema_migrations` bersama — lihat komentar di atas). */
const VERSIONS_TABLE = 'sync_schema_migrations';

/** Terapkan migrasi yang belum jalan; kembalikan daftar versi yang baru diterapkan. */
export async function migrate(pool: Pool, dir = MIGRATIONS_DIR): Promise<number[]> {
  // Tabel versi dijamin dulu di sini supaya runner bekerja pada DB kosong maupun DB yang isinya
  // tinggal migrasi berikutnya (termasuk install lama yang mencatat versi di `schema_migrations`).
  await pool.query(`CREATE TABLE IF NOT EXISTS ${VERSIONS_TABLE} (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const { rows } = await pool.query<{ version: number }>(`SELECT version FROM ${VERSIONS_TABLE}`);
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
      await client.query(`INSERT INTO ${VERSIONS_TABLE} (version) VALUES ($1)`, [version]);
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
