// Helper dialog Import from URL (epic adopsi open-pencil story 8): validPageUrl (http(s)+host) dan
// importToastTitle (jumlah layer + host finalUrl, fallback saat URL tak bisa diparse).
import { describe, expect, it } from 'vitest';
import type { ImportUrlResult } from './api.js';
import { IMPORT_PRESETS, importToastTitle, validPageUrl } from './importUrl.js';

describe('validPageUrl', () => {
  it('http/https dengan host diterima; skema lain, tanpa host, dan non-URL ditolak', () => {
    for (const u of ['https://example.com/', 'http://example.com:8080/p?q=1', ' http://a.b/c ']) expect(validPageUrl(u), u).toBe(true);
    for (const u of ['', '  ', 'ftp://example.com', 'file:///x', 'javascript:alert(1)', 'data:text/html,x', 'bukan url', '//example.com', 'http://']) {
      expect(validPageUrl(u), u).toBe(false);
    }
  });
});

const result = (layers: number, finalUrl: string): ImportUrlResult => ({
  slug: 'a',
  rev: 1,
  created: [],
  inverse: [],
  refs: {},
  nodeId: 'N',
  boardId: 'B',
  report: { kind: 'html', layers, autoLayout: 0, texts: 0, images: 0, vectors: 0, dropped: [] },
  page: { url: 'https://x/', finalUrl },
});

describe('importToastTitle', () => {
  it('"Imported N layers from <host>"; tunggal "layer"; finalUrl tak valid → URL apa adanya', () => {
    expect(importToastTitle(result(3, 'https://example.com/p?q=1'))).toBe('Imported 3 layers from example.com');
    expect(importToastTitle(result(1, 'https://sub.example.com/'))).toBe('Imported 1 layer from sub.example.com');
    expect(importToastTitle(result(2, 'bukan-url'))).toBe('Imported 2 layers from bukan-url');
  });
});

describe('IMPORT_PRESETS', () => {
  it('tiga preset desain: Desktop 1440 landing, Tablet 768 app, Mobile 375 mobile', () => {
    expect(IMPORT_PRESETS.map((p: (typeof IMPORT_PRESETS)[number]) => [p.id, p.width, p.screen])).toEqual([
      ['desktop', 1440, 'landing'],
      ['tablet', 768, 'app'],
      ['mobile', 375, 'mobile'],
    ]);
  });
});
