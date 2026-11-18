// Arsip dokumen Lakar buatan putaran bench sebelumnya (story 14, follow-up review).
// Agen Lakar memilih slug sendiri; slug yang sudah ada sebelum run → `invalid` (`dokumen lama`). Putaran berikut
// dengan prompt yang sama hampir pasti memilih slug yang sama (mis. dari nama produk di prompt), jadi sebelum run
// harness memindahkan dokumen yang dibuat/dibuka agen di putaran bench lain ke arsip bench, lalu me-restart lakard
// (lakard menyimpan salinan dokumen di memori per slug). Pembungkus, prompt, dan produk tidak berubah.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SLUG_PATTERN } from '@lakar/schema';

/** Dir run Lakar di dalam dir putaran: `<prompt>-lakar` atau percobaan sebelumnya `<prompt>-lakar.prev-<stamp>`. */
const LAKAR_RUN_DIR = /^[A-Za-z0-9]+-lakar(\.prev-.+)?$/;

/**
 * Slug dokumen Lakar yang dibuat/dibuka agen di putaran bench selain `currentRound` (dari `run.json`:
 * `lakar.slug` + `lakar.opened`, karena `open_doc` membuat dokumen yang belum ada). Terurut, unik.
 */
export function benchLakarSlugs(roundsRoot: string, currentRound: string): string[] {
  const out = new Set<string>();
  if (!existsSync(roundsRoot)) return [];
  for (const round of readdirSync(roundsRoot)) {
    if (round === currentRound) continue;
    const rdir = join(roundsRoot, round);
    if (!statSync(rdir).isDirectory()) continue;
    for (const d of readdirSync(rdir)) {
      if (!LAKAR_RUN_DIR.test(d)) continue;
      const f = join(rdir, d, 'run.json');
      if (!existsSync(f)) continue;
      let rec: { lakar?: { slug?: unknown; opened?: unknown } };
      try {
        rec = JSON.parse(readFileSync(f, 'utf8'));
      } catch {
        continue;
      }
      const cands = [rec.lakar?.slug, ...(Array.isArray(rec.lakar?.opened) ? rec.lakar!.opened : [])];
      for (const s of cands) if (typeof s === 'string' && SLUG_PATTERN.test(s)) out.add(s);
    }
  }
  return [...out].sort();
}

export type ArchiveItem = { slug: string; from: string; to: string };

/** Rencana pemindahan (murni terhadap isi dir): file dokumen + history + dir export slug yang ada di `dataDir`. */
export function planLakarArchive(dataDir: string, slugs: readonly string[], destDir: string): ArchiveItem[] {
  const out: ArchiveItem[] = [];
  for (const slug of slugs) {
    for (const name of [`${slug}.lakar.json`, `${slug}.history.jsonl`]) {
      const from = join(dataDir, 'docs', name);
      if (existsSync(from)) out.push({ slug, from, to: join(destDir, 'docs', name) });
    }
    const ex = join(dataDir, 'exports', slug);
    if (existsSync(ex)) out.push({ slug, from: ex, to: join(destDir, 'exports', slug) });
  }
  return out;
}

/** Pindahkan sesuai rencana (rename, tanpa menimpa). Tujuan sudah ada → error sebelum apa pun dipindah. */
export function applyLakarArchive(items: readonly ArchiveItem[]): void {
  for (const it of items) if (existsSync(it.to)) throw new Error(`arsip: tujuan sudah ada: ${it.to}`);
  for (const it of items) {
    mkdirSync(join(it.to, '..'), { recursive: true });
    renameSync(it.from, it.to);
  }
}
