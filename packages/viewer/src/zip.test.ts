// Penulis ZIP store (dialog Export code): struktur dibaca balik, CRC sama dengan zlib, deterministik.
import { describe, expect, it } from 'vitest';
import { crc32 as zlibCrc32 } from 'node:zlib';
import { crc32, zipFiles } from './zip.js';

/** Baca ZIP store lewat central directory (tanpa pustaka). */
function unzip(buf: Uint8Array): { path: string; contents: string; crc: number; flags: number; date: number }[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const endAt = buf.length - 22;
  expect(v.getUint32(endAt, true)).toBe(0x06054b50);
  const count = v.getUint16(endAt + 10, true);
  let at = v.getUint32(endAt + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const flags = v.getUint16(at + 8, true);
    expect(v.getUint16(at + 10, true)).toBe(0);
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const path = dec.decode(buf.subarray(at + 46, at + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const localName = v.getUint16(local + 26, true);
    const dataAt = local + 30 + localName + v.getUint16(local + 28, true);
    const data = buf.subarray(dataAt, dataAt + size);
    expect(crc32(data)).toBe(crc);
    out.push({ path, contents: dec.decode(data), crc, flags, date: v.getUint16(at + 14, true) });
    at += 46 + nameLen;
  }
  return out;
}

describe('zipFiles', () => {
  it('crc32 sama dengan zlib', () => {
    for (const s of ['', 'a', 'Lakar → kode', 'x'.repeat(10_000)]) {
      const b = new TextEncoder().encode(s);
      expect(crc32(b)).toBe(zlibCrc32(b));
    }
  });

  it('isi, urutan, nama UTF-8, folder, dan tanggal tetap terbaca balik', () => {
    const files = [
      { path: 'Halaman.tsx', contents: 'export function Halaman() {}\n' },
      { path: 'components/Kartu.tsx', contents: '// Kartu “é”\n' },
      { path: 'tokens.css', contents: '' },
    ];
    const zip = zipFiles(files);
    const back = unzip(zip);
    expect(back.map((f) => ({ path: f.path, contents: f.contents }))).toEqual(files);
    expect(back.every((f) => f.flags === 0x0800 && f.date === 33)).toBe(true);
  });

  it('deterministik: isi sama → byte sama', () => {
    const files = [{ path: 'a.css', contents: ':root {}\n' }];
    expect(zipFiles(files)).toEqual(zipFiles(files));
    expect(unzip(zipFiles([]))).toEqual([]);
  });
});
