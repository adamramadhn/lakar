// Indeks baseline pen.dev per prompt: `bench/baseline-pendev.json` (G0, A/B termigrasi) + `bench/baseline-pendev-<IDS>-<tanggal>.json`
// (story 11 dst.). Setiap prompt memakai baseline terbaru (`date`) yang mencakupnya; penjaga membandingkan hash per prompt
// (`promptHash`), model, Claude Code, dan pen.dev desktop. Baseline tanpa `promptHashes` = masalah (tanpa fallback ke hash utuh).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { errorMessage } from '@lakar/schema';
import { BENCH_ROOT } from './protocol.js';

export const BASELINE_FILE = /^baseline-pendev(?:-[A-Z]+-\d{4}-\d{2}-\d{2})?\.json$/;
export const PENDEV_DESKTOP_KEY = 'pen.dev desktop (X-AppImage-Version)';

/** Nama dasar keluaran `pendev-baseline` per prompt (tanpa ekstensi): `baseline-pendev-CDE-2026-11-19`. */
export function baselineBaseName(ids: readonly string[], date: string): string {
  return `baseline-pendev-${ids.join('')}-${date}`;
}

/** Versi awal `claude --version` ("2.1.325 (Claude Code)" → "2.1.325"). */
export const claudeSemver = (v: string): string => v.trim().split(/\s+/)[0] ?? '';

/** Path keluaran `pendev-baseline` per prompt di `benchRoot`. */
export function baselineOutputPaths(benchRoot: string, ids: readonly string[], date: string): { md: string; json: string } {
  const base = join(benchRoot, baselineBaseName(ids, date));
  return { md: `${base}.md`, json: `${base}.json` };
}

/** Keluaran yang sudah ada (eksklusif: tidak kosong → `pendev-baseline` exit 64, tidak menimpa). */
export function existingOutputs(out: { md: string; json: string }, exists: (f: string) => boolean): string[] {
  return [out.md, out.json].filter((f) => exists(f));
}

export type BaselineEntry = {
  prompt: string;
  promptHash: string;
  model: string | undefined;
  claude: string | undefined;
  pendevDesktop: string | undefined;
  medianWallMs: number | undefined;
  medianCostUsd: number | undefined;
  /** Path relatif repo (`bench/<file>`). */
  source: string;
  date: string;
};

export type BaselineIndex = {
  byPrompt: Record<string, BaselineEntry>;
  /** Baseline yang mencakup prompt yang sama tetapi lebih lama (tercatat, tidak dipakai). */
  superseded: BaselineEntry[];
  /** Prompt yang tercatat di file tetapi sukses < runsPerPrompt (tidak dipakai). */
  incomplete: string[];
  /** Masalah file (tanpa `promptHashes`, tidak terbaca). Selalu masalah pembekuan. */
  fileProblems: string[];
  files: string[];
};

type BaselineJson = {
  date?: string;
  model?: string;
  claudeVersion?: string;
  toolVersions?: Record<string, string | undefined>;
  promptHashes?: Record<string, string>;
  runsPerPrompt?: number;
  summary?: { prompt: string; successes?: number; wallMs?: { median?: number }; costUsd?: { median?: number } }[];
};

/** Indeks per prompt dari isi file baseline (murni). Urutan `files` tidak berpengaruh: `date` terbaru menang. */
export function indexBaselines(files: readonly { source: string; json?: unknown; error?: string }[]): BaselineIndex {
  const idx: BaselineIndex = { byPrompt: {}, superseded: [], incomplete: [], fileProblems: [], files: files.map((f) => f.source) };
  const all: BaselineEntry[] = [];
  for (const f of files) {
    if (f.error !== undefined) {
      idx.fileProblems.push(`${f.source}: tidak terbaca (${f.error})`);
      continue;
    }
    const b = (f.json ?? {}) as BaselineJson;
    if (!b.promptHashes || typeof b.promptHashes !== 'object' || !Object.keys(b.promptHashes).length) {
      idx.fileProblems.push(`${f.source}: tanpa promptHashes (hash protokol utuh tidak dipakai sebagai penjaga; migrasikan atau ukur ulang)`);
      continue;
    }
    for (const [prompt, promptHash] of Object.entries(b.promptHashes)) {
      const s = b.summary?.find((x) => x.prompt === prompt);
      if (!s || (b.runsPerPrompt !== undefined && (s.successes ?? 0) < b.runsPerPrompt)) {
        idx.incomplete.push(`${f.source}: prompt ${prompt} sukses ${s?.successes ?? 0} < ${b.runsPerPrompt ?? '?'}`);
        continue;
      }
      all.push({
        prompt,
        promptHash,
        model: b.model,
        claude: b.claudeVersion,
        pendevDesktop: b.toolVersions?.[PENDEV_DESKTOP_KEY],
        medianWallMs: s.wallMs?.median,
        medianCostUsd: s.costUsd?.median,
        source: f.source,
        date: b.date ?? '',
      });
    }
  }
  for (const e of all) {
    const cur = idx.byPrompt[e.prompt];
    if (!cur) idx.byPrompt[e.prompt] = e;
    else if (e.date > cur.date) {
      idx.superseded.push(cur);
      idx.byPrompt[e.prompt] = e;
    } else idx.superseded.push(e);
  }
  return idx;
}

/** Baca semua file baseline di `benchRoot` (`baseline-pendev.json` + `baseline-pendev-<IDS>-<tanggal>.json`). */
export function loadBaselines(benchRoot = BENCH_ROOT): BaselineIndex {
  const names = existsSync(benchRoot) ? readdirSync(benchRoot).filter((f) => BASELINE_FILE.test(f)).sort() : [];
  return indexBaselines(
    names.map((n) => {
      const source = `bench/${n}`;
      try {
        return { source, json: JSON.parse(readFileSync(join(benchRoot, n), 'utf8')) as unknown };
      } catch (e) {
        return { source, error: errorMessage(e) };
      }
    }),
  );
}

export type BaselineCurrent = {
  /** Hash per prompt saat ini (`promptHashes(protocol)`). */
  promptHashes: Record<string, string>;
  /** Bila diisi, dibandingkan juga dengan baseline per prompt (putaran resmi, `pendev-baseline`). */
  model?: string;
  claude?: string;
  /** `null` = periksa dan tidak terbaca; `undefined` = tidak diperiksa. */
  pendevDesktop?: string | null;
};

/** Masalah baseline per prompt (murni): masalah file, baseline belum diukur, hash prompt ≠ baseline, versi ≠ baseline. */
export function baselineProblems(index: BaselineIndex, current: BaselineCurrent, ids: readonly string[]): string[] {
  const out = [...index.fileProblems];
  const missing = ids.filter((id) => !index.byPrompt[id]);
  if (missing.length) out.push(`baseline ${missing.join(', ')} belum diukur`);
  for (const id of ids) {
    const b = index.byPrompt[id];
    if (!b) continue;
    const now = current.promptHashes[id];
    if (now !== b.promptHash) out.push(`hash prompt ${id} ${now ?? '(tidak ada)'} ≠ baseline ${b.promptHash} (${b.source})`);
    const cmp = (name: string, x: string | undefined, base: string | undefined) => {
      if (x !== base) out.push(`${name} ${id}: ${x ?? '(tidak terbaca)'} ≠ baseline ${base ?? '(tidak ada)'} (${b.source}); baseline pen.dev tidak sebanding`);
    };
    if (current.model !== undefined) cmp('model', current.model, b.model);
    if (current.claude !== undefined) cmp('claude', claudeSemver(current.claude), b.claude);
    if (current.pendevDesktop !== undefined) cmp('pen.dev desktop', current.pendevDesktop ?? undefined, b.pendevDesktop);
  }
  return out;
}

export type PendevBaselineArgs = { prompts: string[] | undefined; dryRun: boolean };

/** Argumen `pendev-baseline [--prompts X,Y] [--dry-run]` (murni); `--prompts` diurutkan menurut `promptIds`. */
export function parsePendevBaselineArgs(args: readonly string[], promptIds: readonly string[]): { ok: true; value: PendevBaselineArgs } | { ok: false; error: string } {
  let prompts: string[] | undefined;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--') continue;
    if (a === '--dry-run') {
      dryRun = true;
      continue;
    }
    let v: string;
    if (a === '--prompts') v = args[++i] ?? '';
    else if (a.startsWith('--prompts=')) v = a.slice('--prompts='.length);
    else return { ok: false, error: `argumen tidak dikenal: ${a}` };
    const ids = v.split(',').map((x) => x.trim());
    const bad = ids.filter((x) => !promptIds.includes(x));
    if (bad.length) return { ok: false, error: `--prompts ${JSON.stringify(v)}: prompt tidak dikenal ${bad.map((x) => JSON.stringify(x)).join(', ')} (protokol: ${promptIds.join(', ')})` };
    if (new Set(ids).size !== ids.length) return { ok: false, error: `--prompts ${JSON.stringify(v)}: prompt ganda` };
    prompts = promptIds.filter((x) => ids.includes(x));
  }
  return { ok: true, value: { prompts, dryRun } };
}

/** Prompt dari `ids` yang belum punya baseline sah (masalah per prompt; masalah file tidak dihitung di sini). */
export function promptsWithoutValidBaseline(index: BaselineIndex, current: BaselineCurrent, ids: readonly string[]): string[] {
  const clean: BaselineIndex = { ...index, fileProblems: [] };
  return ids.filter((id) => baselineProblems(clean, current, [id]).length > 0);
}
