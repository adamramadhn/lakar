import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSafeDestination, copyExclusive } from './artifacts.js';
import { readPngSize, readPngSizeFile } from '../png/codec.js';

function pngHead(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

describe('assertSafeDestination', () => {
  const runs = '/root/lakar/bench/runs';
  it('di bawah runs/ dan belum ada → lolos', () => {
    expect(() => assertSafeDestination(`${runs}/pendev/x/design.pen`, runs, false)).not.toThrow();
  });
  it('sudah ada → ditolak', () => {
    expect(() => assertSafeDestination(`${runs}/pendev/x/design.pen`, runs, true)).toThrow(/sudah ada/);
  });
  it('di luar runs/ → ditolak', () => {
    for (const d of ['/root/lakar/design/x.pen', `${runs}/../x.pen`, runs, '/root/lakar/bench/runs-x/a.pen']) {
      expect(() => assertSafeDestination(d, runs, false), d).toThrow(/di luar/);
    }
  });
  it('copyExclusive tidak menimpa dan tidak menyentuh sumber', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-art-'));
    try {
      const runsDir = join(dir, 'runs');
      const src = join(dir, 'src.bin');
      writeFileSync(src, 'asli');
      const dest = join(runsDir, 'design.pen');
      expect(() => copyExclusive(src, join(dir, 'luar.pen'), runsDir)).toThrow();
      mkdirSync(runsDir);
      copyExclusive(src, dest, runsDir);
      expect(readFileSync(dest, 'utf8')).toBe('asli');
      expect(() => copyExclusive(src, dest, runsDir)).toThrow(/sudah ada/);
      expect(readFileSync(src, 'utf8')).toBe('asli');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('IHDR PNG', () => {
  it('membaca lebar/tinggi', () => {
    expect(readPngSize(pngHead(1440, 4573))).toEqual({ width: 1440, height: 4573 });
    expect(readPngSize(pngHead(2880, 1800).subarray(0, 24))).toEqual({ width: 2880, height: 1800 });
  });
  it('menolak bukan PNG', () => {
    expect(() => readPngSize(Buffer.from('bukan png sama sekali, panjang'))).toThrow();
  });
  it('dari file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-png-'));
    try {
      writeFileSync(join(dir, 'a.png'), pngHead(390, 844));
      expect(readPngSizeFile(join(dir, 'a.png'))).toEqual({ width: 390, height: 844 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
