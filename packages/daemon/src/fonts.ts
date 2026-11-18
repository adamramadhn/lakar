// Registry font lokal (AD-10): keluarga arketipe DESIGN.md dari paket Fontsource terpin.
// `{family, weight, style}` → face `/fonts/<id>/<id>-<subset>-<w>-<style>.woff2` (subset latin + latin-ext).
// Varian yang tidak ada → FONT_MISSING (AD-6: tanpa fallback diam-diam). Tanpa unduhan saat render.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FontFaceSource, FontRequest, FontStyle } from '@lakar/render';
import { LakarError } from '@lakar/schema';

/** Paket Fontsource yang dikenal (dependencies @lakar/daemon, versi persis 5.3.0). */
export const FONT_PACKAGES = [
  'inter',
  'plus-jakarta-sans',
  'jetbrains-mono',
  'manrope',
  'ibm-plex-mono',
  'bricolage-grotesque',
  'dm-sans',
  'dm-mono',
] as const;

export const FONT_SUBSETS = ['latin', 'latin-ext'] as const;
type Subset = (typeof FONT_SUBSETS)[number];

const FILE_PATTERN = /^[a-z0-9-]+-(latin|latin-ext)-\d{3}-(normal|italic)\.woff2$/;

export type FontFamilyEntry = {
  id: string;
  family: string;
  weights: number[];
  styles: FontStyle[];
  /** Direktori `files/` paket. */
  dir: string;
  unicodeRange: Record<Subset, string>;
  /** Nama file woff2 yang boleh disajikan. */
  files: Set<string>;
};

type Metadata = { id: string; family: string; weights: number[]; styles: string[]; subsets: string[] };

export class FontRegistry {
  readonly #byId = new Map<string, FontFamilyEntry>();
  readonly #byFamily = new Map<string, FontFamilyEntry>();
  /** Paket yang tidak ter-resolve / rusak (untuk `status` story 12). */
  readonly missing: string[] = [];

  /** Bangun dari `metadata.json` + `unicode.json` paket via `import.meta.resolve`. */
  static load(packages: readonly string[] = FONT_PACKAGES): FontRegistry {
    const reg = new FontRegistry();
    for (const id of packages) {
      try {
        const meta = JSON.parse(readFileSync(fileURLToPath(import.meta.resolve(`@fontsource/${id}/metadata.json`)), 'utf8')) as Metadata;
        const unicodePath = fileURLToPath(import.meta.resolve(`@fontsource/${id}/unicode.json`));
        const unicode = JSON.parse(readFileSync(unicodePath, 'utf8')) as Record<string, string>;
        const dir = join(dirname(unicodePath), 'files');
        const styles = meta.styles.filter((s): s is FontStyle => s === 'normal' || s === 'italic');
        const files = new Set<string>();
        for (const subset of FONT_SUBSETS) {
          if (!meta.subsets.includes(subset) || !unicode[subset]) throw new Error(`subset ${subset} tidak ada`);
          for (const w of meta.weights) for (const s of styles) files.add(`${meta.id}-${subset}-${w}-${s}.woff2`);
        }
        for (const f of files) if (!existsSync(join(dir, f))) throw new Error(`file ${f} tidak ada`);
        reg.#add({
          id: meta.id,
          family: meta.family,
          weights: [...meta.weights].sort((a, b) => a - b),
          styles,
          dir,
          unicodeRange: { latin: unicode.latin!, 'latin-ext': unicode['latin-ext']! },
          files,
        });
      } catch {
        reg.missing.push(id);
      }
    }
    return reg;
  }

  #add(e: FontFamilyEntry): void {
    this.#byId.set(e.id, e);
    this.#byFamily.set(e.family.toLowerCase(), e);
  }

  /** Nama keluarga terdaftar. */
  families(): string[] {
    return [...this.#byId.values()].map((e) => e.family);
  }

  entry(family: string): FontFamilyEntry | undefined {
    return this.#byFamily.get(family.toLowerCase());
  }

  /** Face untuk setiap request, atau `LakarError FONT_MISSING` (non-retryable). */
  resolveFaces(requests: readonly FontRequest[]): FontFaceSource[] {
    const out: FontFaceSource[] = [];
    const missing: { req: FontRequest; e: FontFamilyEntry | undefined }[] = [];
    for (const req of requests) {
      const e = this.entry(req.family);
      if (!e || !e.weights.includes(req.weight) || !e.styles.includes(req.style)) {
        missing.push({ req, e });
        continue;
      }
      for (const subset of FONT_SUBSETS) {
        out.push({
          family: req.family,
          weight: req.weight,
          style: req.style,
          url: `/fonts/${e.id}/${e.id}-${subset}-${req.weight}-${req.style}.woff2`,
          unicodeRange: e.unicodeRange[subset],
        });
      }
    }
    if (missing.length) {
      const what = missing.map(({ req }) => `${req.family} ${req.weight} ${req.style}`).join(', ');
      const variants = missing
        .filter((m) => m.e)
        .map(({ e }) => `${e!.family} tersedia weight ${e!.weights.join('/')} style ${e!.styles.join('/')}`);
      const unique = [...new Set(variants)];
      throw new LakarError('FONT_MISSING', `font tidak tersedia: ${what}`, {
        hint: [`keluarga terdaftar: ${this.families().join(', ')}`, ...unique].join('; ') + '. Pakai salah satu varian itu (default Inter 400 normal).',
        retryable: false,
      });
    }
    return out;
  }

  /** Path file woff2 untuk disajikan, hanya untuk id terdaftar + nama file valid yang ada di registry. */
  filePath(id: string, file: string): string | undefined {
    const e = this.#byId.get(id);
    if (!e || !FILE_PATTERN.test(file) || !e.files.has(file)) return undefined;
    return join(e.dir, file);
  }
}
