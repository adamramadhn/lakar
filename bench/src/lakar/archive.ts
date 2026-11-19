// Arsip dokumen Lakar buatan putaran bench sebelumnya (story 14, follow-up review).
// Agen Lakar memilih slug sendiri; slug yang sudah ada sebelum run → `invalid` (`dokumen lama`). Putaran berikut
// dengan prompt yang sama hampir pasti memilih slug yang sama (mis. dari nama produk di prompt), jadi sebelum run
// harness memindahkan dokumen yang dibuat/dibuka agen di putaran bench lain ke arsip bench, lalu me-restart lakard
// (lakard menyimpan salinan dokumen di memori per slug). Pembungkus, prompt, dan produk tidak berubah.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { SLUG_PATTERN } from '@lakar/schema';
import { toolEvents } from '../tool-events.js';

/** Dir run Lakar di dalam dir putaran: `<prompt>-lakar` atau percobaan sebelumnya `<prompt>-lakar.prev-<stamp>`. */
const LAKAR_RUN_DIR = /^[A-Za-z0-9]+-lakar(\.prev-.+)?$/;

/** Catatan slug seketika yang ditulis `runLakar` tiap `open_doc` muncul di stream (bertahan walau run mati). */
export const LAKAR_DOCS_LOG = 'lakar-docs.jsonl';

/** Asal satu slug: dir run bench (`<nama root>/<putaran>/<dir run>`), `terhenti` = run tanpa `run.json`. */
export type LakarSource = { slug: string; run: string; terhenti: boolean };

const validSlug = (s: unknown): s is string => typeof s === 'string' && SLUG_PATTERN.test(s);

function readJsonFile(f: string): unknown {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Slug di `docs-before.json` (array `{name}` `*.lakar.json`); file tidak ada/rusak → undefined. */
function docsBefore(dir: string): Set<string> | undefined {
  const f = join(dir, 'docs-before.json');
  if (!existsSync(f)) return undefined;
  const arr = readJsonFile(f);
  if (!Array.isArray(arr)) return undefined;
  const out = new Set<string>();
  for (const d of arr) {
    const name = (d as { name?: unknown } | null)?.name;
    if (typeof name === 'string' && name.endsWith('.lakar.json')) out.add(name.slice(0, -'.lakar.json'.length));
  }
  return out;
}

function readLines(f: string): string[] {
  if (!existsSync(f)) return [];
  try {
    return readFileSync(f, 'utf8').split('\n');
  } catch {
    return [];
  }
}

/** Slug run terhenti: `lakar-docs.jsonl` lalu tool_use `open_doc` di `stream.jsonl` (tanpa syarat result). */
function stalledSlugs(dir: string): string[] {
  const out: string[] = [];
  for (const line of readLines(join(dir, LAKAR_DOCS_LOG))) {
    if (!line.trim()) continue;
    try {
      const s = JSON.parse(line)?.slug;
      if (validSlug(s)) out.push(s);
    } catch {
      /* baris rusak (mis. terpotong saat proses mati): dilewati */
    }
  }
  const lines = readLines(join(dir, 'stream.jsonl'))
    .filter((l) => l.includes('open_doc'))
    .map((line) => ({ t: 0, line }));
  for (const ev of toolEvents(lines)) {
    if (ev.kind === 'use' && ev.use.name === `mcp__lakar__open_doc` && validSlug(ev.use.input?.slug)) out.push(ev.use.input.slug);
  }
  return out;
}

/**
 * Asal slug dokumen Lakar yang dibuat/dibuka agen di dir run Lakar bench (di bawah setiap root: `runs/rounds/<round>`,
 * `runs/practice/<iter>`).
 * - Run selesai (`run.json`): `lakar.slug` + `lakar.opened` (`open_doc` membuat dokumen yang belum ada); dir putaran
 *   `exclude` (yang sedang berjalan) dilewati.
 * - Run terhenti (tanpa `run.json`, mis. proses dihentikan): wajib `docs-before.json`; slug dari `lakar-docs.jsonl`
 *   ∪ tool_use `open_doc` di `stream.jsonl`. Ikut juga di dir putaran `exclude`.
 * Slug yang ada di `docs-before.json` run itu tidak pernah diatribusikan ke run itu. `exclude` string = ID putaran di
 * root pertama (perilaku lama); `{root, id}` = dir `<root>/<id>` saja. Urut slug lalu run, unik per (slug, run).
 */
export function benchLakarSources(roots: string | readonly string[], exclude: string | { root: string; id: string }): LakarSource[] {
  const list = typeof roots === 'string' ? [roots] : roots;
  const ex = typeof exclude === 'string' ? { root: list[0], id: exclude } : exclude;
  const out = new Map<string, LakarSource>();
  for (const root of list) {
    if (!existsSync(root)) continue;
    for (const round of readdirSync(root)) {
      const excluded = root === ex.root && round === ex.id;
      const rdir = join(root, round);
      if (!statSync(rdir).isDirectory()) continue;
      for (const d of readdirSync(rdir)) {
        if (!LAKAR_RUN_DIR.test(d)) continue;
        const dir = join(rdir, d);
        if (!statSync(dir).isDirectory()) continue;
        const run = `${basename(root)}/${round}/${d}`;
        const before = docsBefore(dir);
        const f = join(dir, 'run.json');
        let cands: unknown[];
        let terhenti: boolean;
        if (existsSync(f)) {
          if (excluded) continue;
          const rec = readJsonFile(f) as { lakar?: { slug?: unknown; opened?: unknown } } | undefined;
          if (!rec || typeof rec !== 'object') continue;
          // Catatan seketika/stream ikut: run yang gagal sesudah open_doc (mis. timeout sebelum result) tetap terlacak.
          cands = [rec.lakar?.slug, ...(Array.isArray(rec.lakar?.opened) ? rec.lakar!.opened : []), ...(before ? stalledSlugs(dir) : [])];
          terhenti = false;
        } else {
          if (!before) continue;
          cands = stalledSlugs(dir);
          terhenti = true;
        }
        for (const s of cands) {
          if (!validSlug(s) || before?.has(s)) continue;
          const k = `${s}\0${run}`;
          if (!out.has(k)) out.set(k, { slug: s, run, terhenti });
        }
      }
    }
  }
  return [...out.values()].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : a.run < b.run ? -1 : a.run > b.run ? 1 : 0));
}

/** Slug dari `benchLakarSources` (terurut, unik). */
export function benchLakarSlugs(roots: string | readonly string[], exclude: string | { root: string; id: string }): string[] {
  return [...new Set(benchLakarSources(roots, exclude).map((x) => x.slug))].sort();
}

/** Teks rencana arsip: `docs/<slug>.lakar.json ← <run> (terhenti)` untuk sumber terhenti, selain itu path saja. */
export function describeLakarArchive(dataDir: string, items: readonly ArchiveItem[], sources: readonly LakarSource[]): string {
  if (!items.length) return '-';
  return items
    .map((x) => {
      const rel = relative(dataDir, x.from);
      const st = sources.filter((s) => s.slug === x.slug && s.terhenti).map((s) => `${s.run} (terhenti)`);
      return st.length ? `${rel} ← ${st.join(', ')}` : rel;
    })
    .join(', ');
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
