// Penyimpanan tahan kill (R1): tmp+fsync+rename, riwayat-dulu, rekonsiliasi saat buka, write-back migrasi.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocument } from '@lakar/core';
import type { HistoryEntry, LakarDocument } from '@lakar/schema';
import { DocStore, SNAPSHOT_MAX_BYTES } from './store.js';

const STORE_DIST = fileURLToPath(new URL('../dist/store.js', import.meta.url));

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lakar-store-test-'));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const entry = (rev: number): HistoryEntry => ({ rev, sessionId: 's', description: `rev ${rev} uji`, opsSummary: 'add×1', at: '2026-11-18T00:00:00.000Z' });
const withRev = (doc: LakarDocument, rev: number): LakarDocument => ({ ...doc, rev });
const tmpFiles = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.tmp'));

describe('DocStore retensi snapshot per byte', () => {
  it('default 200 MB; total folder snapshot melewati batas → snapshot tertua dibuang, terbaru selalu disimpan', async () => {
    expect(SNAPSHOT_MAX_BYTES).toBe(200 * 1024 * 1024);
    const base = createDocument();
    const size = (rev: number) => JSON.stringify({ ...base, rev }).length;
    // Batas muat tepat 3 snapshot (ukuran per rev hampir sama; rev 1 digit).
    const store = new DocStore(join(root, 'bytes'), { snapshotMaxBytes: size(1) * 3 + 2 });
    for (let rev = 1; rev <= 6; rev++) await store.commit('d', withRev(base, rev), entry(rev));
    expect([...(await store.snapshotRevs('d'))].sort()).toEqual([4, 5, 6]);
    // Batas lebih kecil dari satu snapshot: snapshot terbaru tetap ada.
    const tiny = new DocStore(join(root, 'tiny'), { snapshotMaxBytes: 1 });
    for (let rev = 1; rev <= 3; rev++) await tiny.commit('d', withRev(base, rev), entry(rev));
    expect([...(await tiny.snapshotRevs('d'))]).toEqual([3]);
    // Batas jumlah tetap berlaku bersamaan.
    const both = new DocStore(join(root, 'both'), { snapshotKeep: 2 });
    for (let rev = 1; rev <= 4; rev++) await both.commit('d', withRev(base, rev), entry(rev));
    expect([...(await both.snapshotRevs('d'))].sort()).toEqual([3, 4]);
  });
});

describe('DocStore', () => {
  it('commit: riwayat lalu dokumen; readHistory; tanpa tmp sisa', async () => {
    const store = new DocStore(join(root, 'a'));
    const doc = createDocument();
    await store.write('d', doc);
    await store.commit('d', withRev(doc, 1), entry(1));
    await store.commit('d', withRev(doc, 2), entry(2));
    expect((await store.read('d'))!.rev).toBe(2);
    expect((await store.readHistory('d')).map((e) => e.rev)).toEqual([1, 2]);
    expect(tmpFiles(store.docsDir)).toEqual([]);
  });

  it('commit memperbaiki ekor riwayat parsial sebelum append', async () => {
    const store = new DocStore(join(root, 'b'));
    const doc = createDocument();
    await store.commit('d', withRev(doc, 1), entry(1));
    await writeFile(store.historyPath('d'), `${await readFile(store.historyPath('d'), 'utf8')}{"rev":2,"sess`, { flag: 'w' });
    await store.commit('d', withRev(doc, 2), entry(2));
    const lines = (await readFile(store.historyPath('d'), 'utf8')).split('\n');
    expect(lines.at(-1)).toBe('');
    expect(lines.slice(0, -1).map((l) => JSON.parse(l).rev)).toEqual([1, 2]);
  });

  it('tulis dokumen gagal → riwayat dipotong kembali', async () => {
    const store = new DocStore(join(root, 'c'));
    const doc = createDocument();
    await store.commit('d', withRev(doc, 1), entry(1));
    const before = await readFile(store.historyPath('d'), 'utf8');
    // Path dokumen jadi direktori berisi → rename gagal.
    await rm(store.docPath('d'));
    await mkdir(join(store.docPath('d'), 'x'), { recursive: true });
    await expect(store.commit('d', withRev(doc, 2), entry(2))).rejects.toThrow();
    expect(await readFile(store.historyPath('d'), 'utf8')).toBe(before);
    expect(tmpFiles(store.docsDir)).toEqual([]);
  });

  it('read: hapus tmp sisa, buang baris parsial/rusak dan entri rev > doc.rev, tulis ulang riwayat', async () => {
    const store = new DocStore(join(root, 'e'));
    const doc = withRev(createDocument(), 2);
    await store.write('d', doc);
    await store.write('lain', doc);
    await writeFile(`${store.docPath('d')}.123.abcd.tmp`, '{"part', 'utf8');
    await writeFile(`${store.docPath('lain')}.123.abcd.tmp`, '{"part', 'utf8');
    const lines = [JSON.stringify(entry(1)), 'bukan json', JSON.stringify(entry(2)), JSON.stringify(entry(3))];
    await writeFile(store.historyPath('d'), `${lines.join('\n')}\n{"rev":4,`, 'utf8');
    expect((await store.read('d'))!.rev).toBe(2);
    expect(tmpFiles(store.docsDir)).toEqual(['lain.lakar.json.123.abcd.tmp']);
    expect(await readFile(store.historyPath('d'), 'utf8')).toBe(`${JSON.stringify(entry(1))}\n${JSON.stringify(entry(2))}\n`);
    expect((await store.readHistory('d')).at(-1)!.rev).toBe(2);
  });

  it('read: dokumen hasil migrasi ditulis balik atomik', async () => {
    const dir = join(root, 'm');
    const plain = new DocStore(dir);
    const doc = createDocument();
    await plain.write('d', doc);
    const raw = await readFile(plain.docPath('d'), 'utf8');
    // Tiruan langkah migrasi: menambah token.
    const baru = { 'colors.baru': { type: 'color', value: '#000000' } };
    const migrating = new DocStore(dir, { migrate: (r) => ({ ...(r as object), tokens: baru }) });
    const read = await migrating.read('d');
    expect(read!.tokens).toEqual(baru);
    const after = await readFile(plain.docPath('d'), 'utf8');
    expect(after).not.toBe(raw);
    expect(JSON.parse(after).tokens).toEqual(baru);
    expect(tmpFiles(plain.docsDir)).toEqual([]);
    // Tanpa migrasi: file tidak ditulis ulang.
    await plain.read('d');
    expect(await readFile(plain.docPath('d'), 'utf8')).toBe(after);
  });

  it('read: dokumen v1 lama dimigrasi resmi ke versi kini (v11) dan ditulis balik', async () => {
    const dir = join(root, 'v1');
    const plain = new DocStore(dir);
    const doc = createDocument();
    await plain.write('lama', doc);
    const v1 = { ...JSON.parse(await readFile(plain.docPath('lama'), 'utf8')), schemaVersion: 1 };
    await writeFile(plain.docPath('lama'), `${JSON.stringify(v1, null, 2)}\n`, 'utf8');
    const read = await new DocStore(dir).read('lama');
    expect(read).toEqual(doc);
    expect(read!.schemaVersion).toBe(11);
    expect(JSON.parse(await readFile(plain.docPath('lama'), 'utf8'))).toEqual(doc);
    expect(tmpFiles(plain.docsDir)).toEqual([]);
  });

  it('kill SIGKILL di tengah commit dokumen besar (≥ 8 kali): dokumen utuh, riwayat konsisten', async () => {
    expect(existsSync(STORE_DIST), 'jalankan pnpm build dulu').toBe(true);
    const dataDir = join(root, 'kill');
    const store = new DocStore(dataDir);
    // ~1,5 MB: satu board dengan banyak rect.
    const base = createDocument();
    const board = { type: 'board', name: 'Besar', x: 0, y: 0, width: 400, height: 400, screen: 'app', id: 'Bbbbbbbb', children: [] as unknown[] };
    for (let i = 0; i < 7000; i++) board.children.push({ type: 'rect', name: `Kotak nomor ${i} dengan nama panjang`, id: `R${String(i).padStart(7, '0')}`, width: 10, height: 10 });
    const big = { ...base, pages: [{ ...base.pages[0]!, children: [board] }] } as unknown as LakarDocument;
    await store.write('d', big);
    const child = `
      const { DocStore } = await import(${JSON.stringify(STORE_DIST)});
      const store = new DocStore(${JSON.stringify(dataDir)});
      let doc = await store.read('d');
      for (;;) {
        const rev = doc.rev + 1;
        doc = { ...doc, rev };
        await store.commit('d', doc, { rev, sessionId: 'k', description: 'commit uji kill ' + rev, opsSummary: 'update×1', at: new Date().toISOString() });
        process.stdout.write(rev + '\\n');
      }`;
    let lastRev = 0;
    for (let round = 0; round < 8; round++) {
      const p = spawn(process.execPath, ['--input-type=module', '-e', child], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      p.stderr.on('data', (c) => (stderr += c));
      // Tunggu commit pertama, lalu bunuh pada waktu acak (sering di tengah tulis).
      await new Promise<void>((resolve, reject) => {
        p.stdout.once('data', () => resolve());
        p.once('exit', (code) => reject(new Error(`anak keluar ${code} sebelum commit: ${stderr}`)));
      });
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 120)));
      const exited = new Promise((r) => p.once('exit', r));
      p.kill('SIGKILL');
      await exited;

      const doc = await store.read('d');
      expect(doc, `ronde ${round}`).toBeDefined();
      expect(doc!.pages[0]!.children[0]!.children).toHaveLength(7000);
      expect(doc!.rev).toBeGreaterThan(lastRev);
      lastRev = doc!.rev;
      const text = await readFile(store.historyPath('d'), 'utf8');
      expect(text.endsWith('\n'), `ronde ${round}: tanpa baris parsial`).toBe(true);
      const hist = text.split('\n').slice(0, -1).map((l) => JSON.parse(l) as HistoryEntry);
      expect(hist.at(-1)!.rev, `ronde ${round}: riwayat terakhir = doc.rev`).toBe(doc!.rev);
      expect(hist.map((h) => h.rev)).toEqual(hist.map((_, i) => i + 1));
      expect(tmpFiles(store.docsDir)).toEqual([]);
    }
  }, 120_000);
});
