// Snapshot rubrik juri yang tracked (`bench/rubric/v<ver>/`): sumber rubrik (DESIGN.md Lampiran B, kriteria golden A/B)
// di-exclude git, jadi riwayatnya disimpan di sini bersama teks juri hasil render dan sha256-nya (`rubric.json`).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BENCH_ROOT } from '../protocol.js';
import { sha256 } from '../sys.js';

export const RUBRIC_DIR = join(BENCH_ROOT, 'rubric');
export const RUBRIC_JSON = join(RUBRIC_DIR, 'rubric.json');
export const LAMPIRAN_B_HEADING = '## Lampiran B';
/** `Versi rubrik: 2 (2026-11-18)` atau `Versi rubrik: 2.1 (2026-11-19)`. */
export const RUBRIC_VERSION_LINE = /^Versi rubrik:\s*(\d+(?:\.\d+)*)\s*\((\d{4}-\d{2}-\d{2})\)\s*$/;
export const RUBRIC_VERSION = /^\d+(?:\.\d+)*$/;

export type RubricJson = {
  version: string;
  date: string;
  /** sha256 teks juri persis seperti dikirim ke juri, per prompt. */
  judgeTextSha256: Record<string, string>;
  /** sha256 file sumber di snapshot (`lampiran-b.md`, `golden-kriteria.md`). */
  sourceSha256: Record<string, string>;
};

/** Bagian `## Lampiran B …` DESIGN.md (heading sampai heading `## ` berikutnya atau akhir file), apa adanya. */
export function lampiranB(designMd: string): string {
  const lines = designMd.split('\n');
  const i = lines.findIndex((l) => l.startsWith(LAMPIRAN_B_HEADING));
  if (i < 0) throw new Error('rubrik: bagian "## Lampiran B" tidak ditemukan di DESIGN.md');
  let j = i + 1;
  while (j < lines.length && !/^## /.test(lines[j]!)) j++;
  return `${lines.slice(i, j).join('\n').trimEnd()}\n`;
}

/** Versi rubrik dari baris `Versi rubrik: <v> (<tanggal>)` di Lampiran B; undefined bila belum ada (v1). */
export function rubricVersionOf(designMd: string): { version: string; date: string } | undefined {
  for (const l of lampiranB(designMd).split('\n')) {
    const m = l.trim().match(RUBRIC_VERSION_LINE);
    if (m) return { version: m[1]!, date: m[2]! };
  }
  return undefined;
}

/** Heading `## <id> …` + blok "Kriteria target" golden-set per prompt, apa adanya (dengan tag). */
export function goldenCriteriaBlocks(goldenMd: string, ids: readonly string[]): string {
  const lines = goldenMd.split('\n');
  const out: string[] = [];
  for (const id of ids) {
    const h = lines.findIndex((l) => l.startsWith(`## ${id} `));
    if (h < 0) throw new Error(`rubrik: bagian golden "## ${id} " tidak ditemukan`);
    const k = lines.findIndex((l, i) => i > h && l.trim() === '**Kriteria target:**');
    if (k < 0) throw new Error(`rubrik: Kriteria target ${id} tidak ditemukan`);
    out.push(lines[h]!, '', lines[k]!);
    for (let j = k + 1; j < lines.length && !lines[j]!.startsWith('---') && !/^## /.test(lines[j]!); j++) if (/^\d+\.\s/.test(lines[j]!)) out.push(lines[j]!);
    out.push('');
  }
  return `${out.join('\n').trimEnd()}\n`;
}

export type SnapshotInput = {
  designMd: string;
  goldenMd: string;
  /** Teks juri per prompt (sudah lulus penjaga bocor + C7). */
  judgeTexts: Record<string, string>;
  /** `--version`: wajib bila DESIGN.md belum punya baris versi; bila ada, harus sama. */
  version?: string;
  /** Tanggal bila baris versi tidak ada (YYYY-MM-DD). */
  today: string;
};

export type SnapshotPlan = { version: string; dir: string; files: Record<string, string>; json: RubricJson };

/** Rencana snapshot (murni): isi file `v<ver>/` dan `rubric.json`. */
export function planSnapshot(i: SnapshotInput, root = RUBRIC_DIR): SnapshotPlan {
  const fromDoc = rubricVersionOf(i.designMd);
  if (i.version !== undefined && !RUBRIC_VERSION.test(i.version)) throw new Error(`--version ${JSON.stringify(i.version)} tidak cocok ${RUBRIC_VERSION.source}`);
  if (fromDoc && i.version !== undefined && fromDoc.version !== i.version) throw new Error(`--version ${i.version} ≠ baris "Versi rubrik: ${fromDoc.version}" di DESIGN.md`);
  const version = fromDoc?.version ?? i.version;
  if (version === undefined) throw new Error('DESIGN.md Lampiran B tanpa baris "Versi rubrik: <v> (<tanggal>)"; pakai --version');
  const ids = Object.keys(i.judgeTexts).sort();
  const files: Record<string, string> = {
    'lampiran-b.md': lampiranB(i.designMd),
    'golden-kriteria.md': goldenCriteriaBlocks(i.goldenMd, ids),
  };
  for (const id of ids) files[`judge-text-${id}.md`] = i.judgeTexts[id]!;
  const json: RubricJson = {
    version,
    date: fromDoc?.date ?? i.today,
    judgeTextSha256: Object.fromEntries(ids.map((id) => [id, sha256(i.judgeTexts[id]!)])),
    sourceSha256: { 'lampiran-b.md': sha256(files['lampiran-b.md']!), 'golden-kriteria.md': sha256(files['golden-kriteria.md']!) },
  };
  return { version, dir: join(root, `v${version}`), files, json };
}

/**
 * Tulis snapshot secara eksklusif: dir versi belum ada → ditulis; ada dan identik → no-op; ada dan berbeda → error
 * (versi rubrik harus dinaikkan). `rubric.json` selalu menunjuk versi yang baru ditulis/diverifikasi.
 */
export function writeSnapshot(plan: SnapshotPlan, root = RUBRIC_DIR): 'ditulis' | 'identik' {
  let how: 'ditulis' | 'identik';
  if (existsSync(plan.dir)) {
    const have = readdirSync(plan.dir).sort();
    const want = Object.keys(plan.files).sort();
    const diff = [
      ...want.filter((f) => !have.includes(f) || readFileSync(join(plan.dir, f), 'utf8') !== plan.files[f]),
      ...have.filter((f) => !want.includes(f)),
    ];
    if (diff.length) throw new Error(`${plan.dir} sudah ada dengan isi berbeda (${diff.join(', ')}); naikkan versi rubrik, tidak ditimpa`);
    how = 'identik';
  } else {
    mkdirSync(plan.dir, { recursive: true });
    for (const [f, text] of Object.entries(plan.files)) writeFileSync(join(plan.dir, f), text, { flag: 'wx' });
    how = 'ditulis';
  }
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'rubric.json'), `${JSON.stringify(plan.json, null, 2)}\n`);
  return how;
}

export function readRubricJson(path = RUBRIC_JSON): RubricJson | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as RubricJson) : undefined;
}

/** Masalah (murni): sha teks juri saat ini ≠ `rubric.json`, atau versi berbeda. */
export function rubricShaProblems(current: { version: string | undefined; sha: Record<string, string> }, rubric: RubricJson | undefined): string[] {
  if (!rubric) return ['bench/rubric/rubric.json tidak ada; jalankan rubric-snapshot'];
  const out: string[] = [];
  if (current.version !== rubric.version) out.push(`versi rubrik ${current.version ?? '(tanpa baris versi)'} ≠ rubric.json ${rubric.version}`);
  for (const [id, s] of Object.entries(current.sha)) {
    if (rubric.judgeTextSha256[id] !== s) out.push(`sha256 teks juri ${id} ${s} ≠ rubric.json ${rubric.judgeTextSha256[id] ?? '(tidak ada)'}`);
  }
  return out;
}
