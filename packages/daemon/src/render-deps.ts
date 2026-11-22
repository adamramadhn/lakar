// Deps render canvas viewer (AD-6, editor-canvas story 3): `GET /viewer/render-deps?font=…&icon=…` mengembalikan face
// font (URL `/fonts/...` milik registry) dan glyph ikon (katalog) untuk kunci yang diminta. Viewer me-mount board
// dengan `mountBoard` di DOM-nya sendiri; aset gambar tetap dari `/assets/:hash`. Varian font atau ikon yang tidak
// dikenal tidak membuat error: dilaporkan di `missing` (canvas tetap tampil, acuan piksel tetap PNG daemon).
// Route baca-saja; route lama tidak berubah.
import type { FastifyInstance } from 'fastify';
import type { IconCatalogPort } from '@lakar/ports';
import type { FontFaceSource, FontStyle } from '@lakar/render';
import { ICON_LIBS, LakarError, type IconGlyph, type IconLib } from '@lakar/schema';
import type { FontRegistry } from './fonts.js';

/** Batas kunci per jenis dalam satu permintaan. */
export const RENDER_DEPS_MAX = 256;

export type RenderDepsData = {
  fonts: FontFaceSource[];
  icons: IconGlyph[];
  missing: { fonts: string[]; icons: string[] };
};

const HINT = `kirim font=<family>:<weight>:<normal|italic> dan icon=<${ICON_LIBS.join('|')}>/<nama>, boleh berulang (maks ${RENDER_DEPS_MAX} per jenis)`;
const invalid = (message: string) => new LakarError('SCHEMA_INVALID', message, { hint: HINT });

/** Nilai query (string atau array dari kunci berulang) → daftar unik. */
function listOf(v: unknown, what: string): string[] {
  if (v === undefined) return [];
  const raw = Array.isArray(v) ? v : [v];
  if (raw.some((x) => typeof x !== 'string')) throw invalid(`${what} harus string`);
  const out = [...new Set(raw as string[])];
  if (out.length > RENDER_DEPS_MAX) throw invalid(`${what} maks ${RENDER_DEPS_MAX} per permintaan, bukan ${out.length}`);
  return out;
}

/** `family:weight:style` (weight dan style diambil dari kanan; family boleh berisi spasi atau titik dua). */
export function parseFontKey(key: string): { family: string; weight: number; style: FontStyle } | undefined {
  const parts = key.split(':');
  if (parts.length < 3) return undefined;
  const style = parts.pop()!;
  const weight = parts.pop()!;
  const family = parts.join(':');
  if (!family.trim() || !/^[1-9]\d{0,2}$/.test(weight) || (style !== 'normal' && style !== 'italic')) return undefined;
  return { family, weight: Number(weight), style };
}

/** `lib/nama` dengan lib dari `ICON_LIBS`. */
export function parseIconKey(key: string): { lib: IconLib; icon: string } | undefined {
  const at = key.indexOf('/');
  if (at <= 0) return undefined;
  const lib = key.slice(0, at);
  const icon = key.slice(at + 1);
  if (!icon || !(ICON_LIBS as readonly string[]).includes(lib)) return undefined;
  return { lib: lib as IconLib, icon };
}

export function registerRenderDepsRoutes(app: FastifyInstance, { fonts, icons }: { fonts: FontRegistry; icons: IconCatalogPort<string, IconGlyph> }): void {
  app.get<{ Querystring: Record<string, unknown> }>('/viewer/render-deps', async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, unknown>;
    const fontKeys = listOf(q.font, 'font');
    const iconKeys = listOf(q.icon, 'icon');
    const data: RenderDepsData = { fonts: [], icons: [], missing: { fonts: [], icons: [] } };
    for (const key of fontKeys) {
      const req = parseFontKey(key);
      if (!req) throw invalid(`kunci font tidak valid: ${JSON.stringify(key)}`);
      try {
        data.fonts.push(...fonts.resolveFaces([req]));
      } catch (e) {
        if (!(e instanceof LakarError) || e.code !== 'FONT_MISSING') throw e;
        data.missing.fonts.push(key);
      }
    }
    for (const key of iconKeys) {
      const ref = parseIconKey(key);
      if (!ref) throw invalid(`kunci ikon tidak valid: ${JSON.stringify(key)}`);
      const glyph = icons.glyph(ref.lib, ref.icon);
      if (glyph) data.icons.push(glyph);
      else data.missing.icons.push(key);
    }
    return reply.code(200).header('cache-control', 'no-cache').send({ ok: true, data });
  });

  // Daftar font terpasang untuk panel Design (editor-canvas story 5): keluarga + bobot + gaya, urut nama. Baca-saja.
  app.get('/viewer/fonts', async (_req, reply) => {
    const families = fonts.entries().sort((a, b) => a.family.localeCompare(b.family));
    return reply.code(200).header('cache-control', 'no-cache').send({ ok: true, data: { families } });
  });
}
