import { describe, expect, it } from 'vitest';
import { DocumentLocks } from './index.js';

const tick = () => new Promise<void>((r) => setTimeout(r, 5));

describe('DocumentLocks', () => {
  it("dua run('a') bersamaan berurutan FIFO; run('b') paralel tidak menunggu 'a'", async () => {
    const locks = new DocumentLocks();
    const log: string[] = [];
    let releaseA1!: () => void;
    const a1 = locks.run('a', async () => {
      log.push('a1:start');
      await new Promise<void>((r) => (releaseA1 = r));
      log.push('a1:end');
      return 1;
    });
    const a2 = locks.run('a', () => {
      log.push('a2');
      return 2;
    });
    const a3 = locks.run('a', async () => {
      log.push('a3');
      return 3;
    });
    const b = locks.run('b', async () => {
      log.push('b');
      return 'b';
    });
    expect(await b).toBe('b');
    await tick();
    expect(log).toEqual(['a1:start', 'b']);
    releaseA1();
    expect(await Promise.all([a1, a2, a3])).toEqual([1, 2, 3]);
    expect(log).toEqual(['a1:start', 'b', 'a1:end', 'a2', 'a3']);
    expect(locks.size).toBe(0);
  });

  it('kunci dilepas setelah fn melempar (sinkron maupun async)', async () => {
    const locks = new DocumentLocks();
    await expect(
      locks.run('a', () => {
        throw new Error('sinkron');
      }),
    ).rejects.toThrow('sinkron');
    await expect(locks.run('a', async () => Promise.reject(new Error('async')))).rejects.toThrow('async');
    expect(await locks.run('a', () => 'lanjut')).toBe('lanjut');
    expect(locks.size).toBe(0);
  });

  it('antrean setelah error tetap berjalan berurutan', async () => {
    const locks = new DocumentLocks();
    const log: string[] = [];
    const first = locks.run('a', async () => {
      await tick();
      log.push('gagal');
      throw new Error('x');
    });
    const second = locks.run('a', () => log.push('kedua'));
    await expect(first).rejects.toThrow('x');
    await second;
    expect(log).toEqual(['gagal', 'kedua']);
  });
});
