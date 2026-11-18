// Juri buta: `claude -p --input-format stream-json` dengan gambar base64, tanpa tool/MCP, label X/Y diacak per ulangan.
import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runClaude } from '../claude-runner.js';
import { readChunks } from '../png/codec.js';
import { readPngSize } from '../png/codec.js';
import type { ProtocolConfig } from '../protocol.js';
import { computeMetrics, validateInit, type InitRules } from '../stream-metrics.js';
import { parseJudgeOutput, type JudgeVerdict } from './parse.js';
import { judgeLeaks } from './prompt.js';

export type Tool = 'lakar' | 'pendev';
export type Assignment = { X: Tool; Y: Tool };
export const JUDGE_REPS = 3;
export const EMPTY_MCP = '{"mcpServers":{}}\n';

/** Init juri: tanpa server MCP, tanpa tool, cwd di luar repo. */
export const judgeInitRules = (forbiddenCwdRoot: string): InitRules => ({ server: null, requiredTools: [], forbiddenCwdRoot });

/** argv juri (tanpa nama program): tanpa --allowedTools, tool kosong, MCP kosong strict. */
export function buildJudgeArgs(model: string, emptyMcpConfig: string): string[] {
  return [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    model,
    '--tools',
    '',
    '--strict-mcp-config',
    '--mcp-config',
    emptyMcpConfig,
    '--disable-slash-commands',
    '--no-session-persistence',
  ];
}

/**
 * Penugasan label per ulangan, acak dengan `crypto`. Untuk n ≥ 2 kedua penugasan wajib muncul:
 * hasil yang seragam diundi ulang (tidak dipaksa urutan tetap).
 */
export function assignLabels(n = JUDGE_REPS, bit: () => number = () => randomInt(2)): Assignment[] {
  for (;;) {
    const out: Assignment[] = Array.from({ length: n }, () => (bit() ? { X: 'lakar', Y: 'pendev' } : { X: 'pendev', Y: 'lakar' }));
    if (n < 2 || new Set(out.map((a) => a.X)).size === 2) return out;
  }
}

export type DesignImages = { tiles: Buffer[]; overview: Buffer };

export type MessageBlock = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } };

/** Hanya chunk IHDR/IDAT/IEND (tanpa metadata). */
function assertBarePng(png: Buffer, label: string): void {
  const types = readChunks(png).map((c) => c.type);
  if (types.join(',') !== 'IHDR,IDAT,IEND') throw new Error(`${label}: PNG berisi chunk selain IHDR/IDAT/IEND (${types.join(',')})`);
}

/** Satu user message: teks juri + gambar berlabel netral. Gagal bila ada teks bocor atau PNG bermetadata. */
export function buildJudgeBlocks(text: string, designs: Record<'X' | 'Y', DesignImages>): MessageBlock[] {
  const blocks: MessageBlock[] = [{ type: 'text', text }];
  const img = (png: Buffer, label: string): MessageBlock => {
    assertBarePng(png, label);
    return { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } };
  };
  for (const k of ['X', 'Y'] as const) {
    const d = designs[k];
    d.tiles.forEach((t, i) => {
      const label = `Desain ${k}, bagian ${i + 1} dari ${d.tiles.length}`;
      blocks.push({ type: 'text', text: label }, img(t, label));
    });
    blocks.push({ type: 'text', text: `Desain ${k}, overview` }, img(d.overview, `Desain ${k}, overview`));
  }
  const leaks = blocks.flatMap((b) => (b.type === 'text' ? judgeLeaks(b.text) : []));
  if (leaks.length) throw new Error(`teks juri bocor: ${leaks.join('; ')}`);
  return blocks;
}

export function judgeMessageLine(blocks: MessageBlock[]): string {
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content: blocks } })}\n`;
}

/** Ringkasan isi pesan untuk arsip (tanpa base64). */
export function blocksMeta(blocks: MessageBlock[]): unknown[] {
  return blocks.map((b) => (b.type === 'text' ? { text: b.text.length > 200 ? `${b.text.slice(0, 200)}… (${b.text.length} karakter)` : b.text } : { image: readPngSize(Buffer.from(b.source.data, 'base64')) }));
}

export type JudgeAttempt = { dir: string; status: 'ok' | 'invalid_output' | 'failed' | 'invalid'; problems: string[]; costUsd: number | undefined; wallMs: number | undefined };

export type JudgeRepRecord = {
  prompt: string;
  rep: number;
  mapping: Assignment;
  status: 'ok' | 'failed' | 'invalid';
  verdict: JudgeVerdict | undefined;
  attempts: JudgeAttempt[];
  retried: boolean;
  costUsd: number;
};

export type JudgeRepInput = {
  prompt: string;
  rep: number;
  mapping: Assignment;
  blocks: MessageBlock[];
  dir: string;
  emptyMcpConfig: string;
  config: ProtocolConfig;
  forbiddenCwdRoot: string;
  /** Untuk tes: program pengganti `claude`. */
  command?: string;
  prefixArgs?: string[];
};

/** Satu ulangan juri: maksimal 1 percobaan ulang bila jawaban tidak valid; init tidak valid → `invalid`, tanpa ulang. */
export async function runJudgeRep(i: JudgeRepInput): Promise<JudgeRepRecord> {
  mkdirSync(i.dir, { recursive: true });
  writeFileSync(join(i.dir, 'mapping.json'), `${JSON.stringify(i.mapping, null, 1)}\n`, { flag: 'wx' });
  writeFileSync(join(i.dir, 'message-meta.json'), `${JSON.stringify(blocksMeta(i.blocks), null, 1)}\n`);
  if (!existsSync(i.emptyMcpConfig)) writeFileSync(i.emptyMcpConfig, EMPTY_MCP);
  const rules = judgeInitRules(i.forbiddenCwdRoot);
  const stdin = judgeMessageLine(i.blocks);
  const rec: JudgeRepRecord = { prompt: i.prompt, rep: i.rep, mapping: i.mapping, status: 'failed', verdict: undefined, attempts: [], retried: false, costUsd: 0 };
  for (let k = 1; k <= 2; k++) {
    const dir = join(i.dir, `attempt-${k}`);
    mkdirSync(dir);
    const run = await runClaude({
      rawArgs: buildJudgeArgs(i.config.model, i.emptyMcpConfig),
      stdin,
      config: i.config,
      outDir: dir,
      validateInit: (init) => validateInit(init, rules),
      forbiddenCwdRoot: i.forbiddenCwdRoot,
      ...(i.command ? { command: i.command } : {}),
      ...(i.prefixArgs ? { prefixArgs: i.prefixArgs } : {}),
    });
    const m = computeMetrics(run.lines, rules, { exitCode: run.exitCode, timedOut: run.timedOut });
    rec.costUsd += m.totalCostUsd ?? 0;
    const att: JudgeAttempt = { dir, status: 'ok', problems: [], costUsd: m.totalCostUsd, wallMs: m.wallMs };
    rec.attempts.push(att);
    if (m.status === 'invalid') {
      att.status = 'invalid';
      att.problems = [m.reason ?? 'init tidak valid'];
      rec.status = 'invalid';
      break;
    }
    let resultText: string | undefined;
    for (const l of run.lines) {
      try {
        const ev = JSON.parse(l.line);
        if (ev?.type === 'result' && typeof ev.result === 'string') resultText = ev.result;
      } catch {
        /* abaikan */
      }
    }
    if (m.status !== 'success') {
      att.status = 'failed';
      att.problems = [m.reason ?? 'run juri gagal'];
    } else {
      const p = parseJudgeOutput(resultText);
      if (p.ok) {
        rec.status = 'ok';
        rec.verdict = p.verdict;
        writeFileSync(join(dir, 'verdict.json'), `${JSON.stringify(p.verdict, null, 1)}\n`);
        break;
      }
      att.status = 'invalid_output';
      att.problems = p.problems;
    }
    if (k === 1) rec.retried = true;
  }
  writeFileSync(join(i.dir, 'rep.json'), `${JSON.stringify(rec, null, 1)}\n`);
  return rec;
}
