// Protokol benchmark yang dibekukan (AD-13, C7): pembungkus netral + teks prompt + argumen claude.
// Dipakai bench pen.dev dan putaran Lakar vs pen.dev. Penjaga baseline memakai hash per prompt (`promptHash`):
// pembungkus + config tanpa `promptIds` + teks prompt itu. `protocolHash` (byte ketiga file) tetap ada untuk info/legacy.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorMessage } from '@lakar/schema';

/** Root paket bench (`bench/`), sama dari `src/*.ts` (vitest) maupun `dist/*.js`. */
export const BENCH_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(BENCH_ROOT, '..');
export const PROTOCOL_DIR = join(BENCH_ROOT, 'protocol');
export const GOLDEN_SET_PATH = join(REPO_ROOT, '_bmad-output/initiative-lakar/ux-lakar/golden-set.md');
export const PROTOCOL_FILES = ['wrapper.txt', 'prompts.json', 'protocol.json'] as const;
export const PLACEHOLDER = '{{PROMPT}}';
/** Snapshot beku protokol G0 (`git show 925c66d:bench/protocol/*`), bukti migrasi baseline A/B ke hash per prompt. */
export const LEGACY_G0_DIR = join(PROTOCOL_DIR, 'legacy', '907cb36f');
/** Skema hash per prompt; mengganti nilai ini membatalkan semua baseline. */
export const PROMPT_HASH_SCHEME = 'lakar-bench-prompt/1';

export const PROMPT_IDS = ['A', 'B', 'C', 'D', 'E'] as const;
export type PromptId = (typeof PROMPT_IDS)[number];

export type ProtocolConfig = {
  version: number;
  model: string;
  timeoutMs: number;
  runsPerPrompt: number;
  maxAttemptsPerPrompt: number;
  promptIds: PromptId[];
  /** Flag bersama untuk semua alat (tanpa -p, --model, --mcp-config, --allowedTools). */
  claudeArgs: string[];
  /** Env tambahan untuk proses claude (simetris untuk semua alat). */
  env: Record<string, string>;
  /** Variabel env berawalan ini dibuang agar run tidak mewarisi sesi pemanggil (mis. CLAUDE_EFFORT). */
  envScrubPrefixes: string[];
};

export type Protocol = {
  dir: string;
  wrapper: string;
  prompts: Record<PromptId, string>;
  config: ProtocolConfig;
  hash: string;
};

export function protocolHash(dir = PROTOCOL_DIR): string {
  const h = createHash('sha256');
  for (const f of PROTOCOL_FILES) h.update(readFileSync(join(dir, f)));
  return h.digest('hex');
}

/** JSON kanonik: kunci objek terurut (rekursif), tanpa spasi. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

/**
 * Hash per prompt (murni): sha256 JSON kanonik `{scheme, wrapper, config (protocol.json tanpa promptIds), prompt}`.
 * Menambah/menghapus prompt lain tidak mengubah hash prompt ini; wrapper atau field config lain mengubah semuanya.
 */
export function promptHash(protocol: Pick<Protocol, 'wrapper' | 'prompts' | 'config'>, id: string): string {
  const prompt = (protocol.prompts as Record<string, string | undefined>)[id];
  if (typeof prompt !== 'string') throw new Error(`prompt ${id} tidak ada`);
  const { promptIds: _ids, ...config } = protocol.config;
  return createHash('sha256').update(canonicalJson({ scheme: PROMPT_HASH_SCHEME, wrapper: protocol.wrapper, config, prompt })).digest('hex');
}

/** Hash per prompt untuk `ids` (default: semua `promptIds` protokol). */
export function promptHashes(protocol: Pick<Protocol, 'wrapper' | 'prompts' | 'config'>, ids: readonly string[] = protocol.config.promptIds): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, promptHash(protocol, id)]));
}

export function loadProtocol(dir = PROTOCOL_DIR): Protocol {
  const wrapper = readFileSync(join(dir, 'wrapper.txt'), 'utf8');
  const prompts = JSON.parse(readFileSync(join(dir, 'prompts.json'), 'utf8')) as Record<PromptId, string>;
  const config = JSON.parse(readFileSync(join(dir, 'protocol.json'), 'utf8')) as ProtocolConfig;
  if (wrapper.split(PLACEHOLDER).length !== 2) throw new Error(`wrapper.txt harus berisi tepat satu ${PLACEHOLDER}`);
  for (const id of config.promptIds) {
    if (!(PROMPT_IDS as readonly string[]).includes(id)) throw new Error(`protocol.json: promptIds ${id} bukan salah satu ${PROMPT_IDS.join('/')}`);
    if (typeof prompts[id] !== 'string') throw new Error(`prompts.json tidak punya prompt ${id}`);
  }
  return { dir, wrapper, prompts, config, hash: protocolHash(dir) };
}

/** Pembungkus dengan prompt disisipkan; spasi di akhir dibuang. */
export function renderWith(wrapper: string, prompt: string): string {
  return wrapper.split(PLACEHOLDER).join(prompt).trimEnd();
}

export function renderPrompt(id: PromptId, protocol: Protocol = loadProtocol()): string {
  const prompt = protocol.prompts[id];
  if (prompt === undefined) throw new Error(`prompt ${id} tidak ada`);
  return renderWith(protocol.wrapper, prompt);
}

// ---------- golden-set (hanya dibaca penjaga C7) ----------

function sectionLines(goldenText: string, startsWith: string): string[] {
  const lines = goldenText.split('\n');
  const i = lines.findIndex((l) => l.startsWith(startsWith));
  if (i < 0) return [];
  const out: string[] = [];
  for (let j = i + 1; j < lines.length && !lines[j]!.startsWith('## '); j++) out.push(lines[j]!);
  return out;
}

/** Blockquote **Prompt:** di bagian `## <id> — …`, tanpa penanda `> `. */
export function extractGoldenPrompt(goldenText: string, id: string): string {
  const lines = sectionLines(goldenText, `## ${id} `);
  const k = lines.findIndex((l) => l.trim() === '**Prompt:**');
  if (k < 0) throw new Error(`golden-set: blok Prompt untuk ${id} tidak ditemukan`);
  const out: string[] = [];
  for (let j = k + 1; j < lines.length && lines[j]!.startsWith('>'); j++) out.push(lines[j]!.replace(/^> ?/, ''));
  if (!out.length) throw new Error(`golden-set: blockquote prompt ${id} kosong`);
  return out.join('\n');
}

/** Teks terlarang: butir "Kriteria target" untuk tiap id, §Prosedur, §Risiko. */
export function forbiddenSources(goldenText: string, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const lines = sectionLines(goldenText, `## ${id} `);
    const k = lines.findIndex((l) => l.trim() === '**Kriteria target:**');
    if (k < 0) continue;
    for (let j = k + 1; j < lines.length && !lines[j]!.startsWith('---'); j++) if (lines[j]!.trim()) out.push(lines[j]!);
  }
  for (const head of ['## Prosedur', '## Risiko']) out.push(...sectionLines(goldenText, head).filter((l) => l.trim()));
  return out;
}

/** Kata ternormalisasi: huruf kecil, tag `[Rn]`/nomor butir dibuang, tanda baca jadi spasi. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\[[a-z]\d*\]/g, ' ')
    .replace(/^\s*\d+\.\s/gm, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
}

export const NGRAM = 6;
/** Kalimat utuh sependek ini (di bawah NGRAM) juga dianggap frasa terlarang. */
export const MIN_SENTENCE_WORDS = 5;

/** Frasa terlarang: n-gram NGRAM kata + kalimat utuh pendek (≥ MIN_SENTENCE_WORDS) dari `sources`. */
export function forbiddenPhrases(sources: string[]): Set<string> {
  const out = new Set<string>();
  for (const src of sources) {
    const w = words(src);
    for (let i = 0; i + NGRAM <= w.length; i++) out.add(w.slice(i, i + NGRAM).join(' '));
    for (const sentence of src.split(/[.;:!?]\s/)) {
      const sw = words(sentence);
      if (sw.length >= MIN_SENTENCE_WORDS && sw.length < NGRAM) out.add(sw.join(' '));
    }
  }
  return out;
}

export const FORBIDDEN_TOKENS: readonly RegExp[] = [
  /\[R[1-8]\]/,
  /\[G\]/,
  /layout_check/i,
  /\brubrik/i,
  /\bjuri\b/i,
  /\bkriteria/i,
  /\bgolden/i,
  /DESIGN\.md/i,
];

/** Butir "Kriteria target" prompt ini selalu terlarang, apa pun prompt yang dicek. */
export const C7_CRITERIA_IDS: readonly string[] = PROMPT_IDS;

export type C7Result = { ok: boolean; problems: string[] };

/**
 * Penjaga C7 (murni). Gagal bila: (a) prompt di `prompts` ≠ blockquote golden-set;
 * (b) `rendered` memuat n-gram 6 kata (atau kalimat utuh ≥ 5 kata) dari Kriteria target / §Prosedur / §Risiko;
 * (c) `rendered` memuat token terlarang.
 */
export function checkC7(rendered: string, goldenText: string, prompts: Partial<Record<string, string>>): C7Result {
  const problems: string[] = [];
  const ids = Object.keys(prompts);
  if (!ids.length) problems.push('(a) tidak ada prompt yang diberikan untuk dibandingkan dengan golden-set');
  for (const id of ids) {
    let golden: string;
    try {
      golden = extractGoldenPrompt(goldenText, id);
    } catch (e) {
      problems.push(`(a) ${errorMessage(e)}`);
      continue;
    }
    if (prompts[id] !== golden) problems.push(`(a) prompt ${id} di prompts.json berbeda dari blockquote golden-set`);
  }
  const sources = forbiddenSources(goldenText, [...new Set([...C7_CRITERIA_IDS, ...ids])]);
  // Tanpa sumber terlarang, cek (b) akan lulus kosong: struktur golden-set berubah → gagal, bukan lulus diam-diam.
  if (sources.length === 0) problems.push('(b) sumber terlarang (Kriteria target / §Prosedur / §Risiko) tidak ditemukan di golden-set');
  const phrases = forbiddenPhrases(sources);
  const joined = ` ${words(rendered).join(' ')} `;
  for (const p of phrases) if (joined.includes(` ${p} `)) problems.push(`(b) frasa terlarang: "${p}"`);
  for (const re of FORBIDDEN_TOKENS) {
    const m = rendered.match(re);
    if (m) problems.push(`(c) token terlarang: "${m[0]}"`);
  }
  return { ok: problems.length === 0, problems };
}

/** C7 untuk seluruh protokol: setiap prompt hasil render, dengan prompts.json dibandingkan ke golden-set. */
export function checkProtocolC7(protocol: Protocol, goldenText: string): C7Result {
  const problems: string[] = [];
  for (const id of protocol.config.promptIds) {
    const r = checkC7(renderPrompt(id, protocol), goldenText, { [id]: protocol.prompts[id] });
    problems.push(...r.problems.map((p) => `${id}: ${p}`));
  }
  return { ok: problems.length === 0, problems };
}
