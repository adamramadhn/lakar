// Route deps render canvas viewer (editor-canvas story 3): GET /viewer/render-deps. Tanpa Chromium.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer, loadConfig } from './index.js';
import { RENDER_DEPS_MAX, parseFontKey, parseIconKey } from './render-deps.js';

const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key', pexelsKeyFile: '/nonexistent/lakar-test/pexels-api-key' };
const noRender = {
  screenshot: async () => {
    throw new Error('render tidak boleh dipanggil');
  },
  measure: async () => {
    throw new Error('render tidak boleh dipanggil');
  },
} as never;

let dataDir: string;
let app: ReturnType<typeof buildServer>['app'];
beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'lakar-render-deps-'));
  app = buildServer({ config: { ...baseConfig, port: 0, dataDir }, render: noRender }).app;
});
afterAll(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

const get = (qs: string) => app.inject({ method: 'GET', url: `/viewer/render-deps${qs}` });
const q = (fonts: string[], icons: string[] = []) =>
  '?' + [...fonts.map((f) => `font=${encodeURIComponent(f)}`), ...icons.map((i) => `icon=${encodeURIComponent(i)}`)].join('&');

describe('GET /viewer/render-deps', () => {
  it('font + ikon dikenal → face /fonts/... (latin + latin-ext) dan glyph', async () => {
    const r = await get(q(['Inter:400:normal'], ['lucide/star']));
    expect(r.statusCode).toBe(200);
    const { data } = r.json();
    expect(data.missing).toEqual({ fonts: [], icons: [] });
    expect(data.fonts.length).toBe(2);
    for (const f of data.fonts) {
      expect(f).toMatchObject({ family: 'Inter', weight: 400, style: 'normal' });
      expect(f.url).toMatch(/^\/fonts\/inter\/inter-latin(-ext)?-400-normal\.woff2$/);
      expect(typeof f.unicodeRange).toBe('string');
    }
    expect(data.icons).toEqual([expect.objectContaining({ lib: 'lucide', icon: 'star', kind: 'stroke' })]);
    // URL face benar-benar disajikan route font lama.
    const font = await app.inject({ method: 'GET', url: data.fonts[0].url });
    expect(font.statusCode).toBe(200);
    expect(font.headers['content-type']).toBe('font/woff2');
  });

  it('font/ikon tak dikenal → missing, bukan error', async () => {
    const r = await get(q(['Nope:400:normal', 'Inter:400:normal'], ['lucide/zzz-tidak-ada']));
    expect(r.statusCode).toBe(200);
    const { data } = r.json();
    expect(data.missing).toEqual({ fonts: ['Nope:400:normal'], icons: ['lucide/zzz-tidak-ada'] });
    expect(data.fonts.length).toBe(2);
    expect(data.icons).toEqual([]);
  });

  it('nama family dan ikon kembali persis seperti diminta (cache viewer mencocokkan per kunci)', async () => {
    const { data } = (await get(q(['inter:400:normal'], ['lucide/home']))).json();
    expect(data.missing).toEqual({ fonts: [], icons: [] });
    expect(data.fonts.length).toBe(2);
    for (const f of data.fonts) expect(`${f.family}:${f.weight}:${f.style}`).toBe('inter:400:normal');
    expect(data.icons.map((g: { lib: string; icon: string }) => `${g.lib}/${g.icon}`)).toEqual(['lucide/home']);
  });

  it('tanpa parameter → kosong; kunci ganda dihitung sekali', async () => {
    expect((await get('')).json()).toEqual({ ok: true, data: { fonts: [], icons: [], missing: { fonts: [], icons: [] } } });
    const dup = (await get(q(['Inter:400:normal', 'Inter:400:normal']))).json().data;
    expect(dup.fonts.length).toBe(2);
  });

  it.each([['Inter:abc:normal'], ['Inter:400:oblique'], [':400:normal'], ['Inter']])('kunci font rusak %s → 400 SCHEMA_INVALID', async (k) => {
    const r = await get(q([k]));
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('SCHEMA_INVALID');
  });

  it.each([['star'], ['fontawesome/star'], ['lucide/']])('kunci ikon rusak %s → 400 SCHEMA_INVALID', async (k) => {
    const r = await get(q([], [k]));
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('SCHEMA_INVALID');
  });

  it(`> ${RENDER_DEPS_MAX} kunci → 400`, async () => {
    const many = Array.from({ length: RENDER_DEPS_MAX + 1 }, (_, i) => `lucide/i${i}`);
    const r = await get(q([], many));
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('SCHEMA_INVALID');
  });
});

describe('parse kunci', () => {
  it('family boleh berisi spasi dan titik dua; weight/style dari kanan', () => {
    expect(parseFontKey('Space Grotesk:700:italic')).toEqual({ family: 'Space Grotesk', weight: 700, style: 'italic' });
    expect(parseFontKey('A:B:400:normal')).toEqual({ family: 'A:B', weight: 400, style: 'normal' });
    expect(parseIconKey('simple-icons/github')).toEqual({ lib: 'simple-icons', icon: 'github' });
  });
});
