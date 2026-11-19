// Laporan baseline pen.dev (md + json). Tipe `RunRecord` juga dipakai run Lakar dan laporan putaran (round/).
import { summarize, type Summary } from './stats.js';

export type RunRecordStatus = 'success' | 'failed' | 'invalid' | 'aborted';

export type RunRecord = {
  runId: string;
  prompt: string;
  attempt: number;
  status: RunRecordStatus;
  reason: string | undefined;
  uri: string | undefined;
  /** Asal URI dokumen baru: output pen-newdoc.sh atau get_app_state harness. */
  uriSource: string | undefined;
  wallMs: number | undefined;
  durationMs: number | undefined;
  durationApiMs: number | undefined;
  costUsd: number | undefined;
  numTurns: number | undefined;
  toolCalls: number | undefined;
  /** Diagnostik saja. */
  firstToolUseMs: number | undefined;
  lastToolResultMs: number | undefined;
  spawnToFirstEventMs: number | undefined;
  frames: { id: string; name: string; width: number; height: number; png?: string; pngWidth?: number; pngHeight?: number }[];
  transcriptBytes: number | undefined;
  penPath: string | undefined;
  pngScaleMismatch: boolean;
  model: string | undefined;
  modelUsageKeys: string[];
  claudeCodeVersion: string | undefined;
  startedAt: string | undefined;
};

export type BaselineReport = {
  tool: string;
  date: string;
  status: 'lengkap' | 'tidak lengkap' | 'dibatalkan';
  protocolHash: string;
  model: string;
  modelUsageKeys: string[];
  claudeVersion: string | undefined;
  toolVersions: Record<string, string | undefined>;
  effort: string;
  wrapper: string;
  prompts: Record<string, string>;
  argv: string;
  env: { set: Record<string, string>; scrubbed: string[] };
  runsPerPrompt: number;
  runs: RunRecord[];
  notes: string[];
};

export type PromptSummary = { prompt: string; successes: number; attempts: number; wallMs: Summary; costUsd: Summary; failed: string[] };

export function summarizeRuns(runs: readonly RunRecord[], promptIds: readonly string[]): PromptSummary[] {
  return promptIds.map((p) => {
    const mine = runs.filter((r) => r.prompt === p);
    const ok = mine.filter((r) => r.status === 'success');
    return {
      prompt: p,
      successes: ok.length,
      attempts: mine.length,
      wallMs: summarize(ok.flatMap((r) => (r.wallMs === undefined ? [] : [r.wallMs]))),
      costUsd: summarize(ok.flatMap((r) => (r.costUsd === undefined ? [] : [r.costUsd]))),
      failed: mine.filter((r) => r.status !== 'success').map((r) => `${r.runId} (${r.status}: ${r.reason ?? '-'})`),
    };
  });
}

const sec = (ms: number | undefined) => (ms === undefined ? '–' : (ms / 1000).toFixed(1));
const usd = (x: number | undefined) => (x === undefined ? '–' : `$${x.toFixed(2)}`);
const kb = (b: number | undefined) => (b === undefined ? '–' : `${(b / 1024).toFixed(0)} KB`);
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderMarkdown(r: BaselineReport): string {
  const ids = Object.keys(r.prompts);
  const sums = summarizeRuns(r.runs, ids);
  const L: string[] = [];
  L.push(`# Baseline waktu ${r.tool}`, '');
  L.push(`Status: **${r.status}** (target ${r.runsPerPrompt} run sukses per prompt).`, '');
  L.push('## Ringkasan', '');
  L.push('| Prompt | Sukses / percobaan | Waktu median (dtk) | Rentang waktu (dtk) | Biaya median | Rentang biaya |');
  L.push('|---|---|---|---|---|---|');
  for (const s of sums) {
    L.push(`| ${s.prompt} | ${s.successes} / ${s.attempts} | ${sec(s.wallMs.median)} | ${sec(s.wallMs.min)}–${sec(s.wallMs.max)} | ${usd(s.costUsd.median)} | ${usd(s.costUsd.min)}–${usd(s.costUsd.max)} |`);
  }
  L.push('');
  L.push('## Versi dan protokol', '');
  L.push(`- Tanggal: ${r.date}`);
  L.push(`- Hash protokol (sha256 wrapper.txt + prompts.json + protocol.json): \`${r.protocolHash}\``);
  L.push(`- Model (pin \`--model\`): \`${r.model}\`; kunci \`modelUsage\`: ${r.modelUsageKeys.map((k) => `\`${k}\``).join(', ') || '–'}`);
  L.push(`- Claude Code: ${r.claudeVersion ?? '–'}`);
  for (const [k, v] of Object.entries(r.toolVersions)) L.push(`- ${k}: ${v ?? '–'}`);
  L.push(`- Effort: ${r.effort}`);
  L.push(`- Env proses claude: ${Object.entries(r.env.set).map(([k, v]) => `\`${k}=${v}\``).join(', ') || '–'}; dibuang dari env pemanggil: ${r.env.scrubbed.map((k) => `\`${k}\``).join(', ') || '–'}`);
  L.push('');
  L.push('### Argumen claude', '', '```', r.argv, '```', '');
  L.push('### Pembungkus (bench/protocol/wrapper.txt, kata per kata)', '', '```', r.wrapper.trimEnd(), '```', '');
  for (const id of ids) L.push(`### Prompt ${id}`, '', '```', r.prompts[id]!, '```', '');
  L.push('## Run', '');
  L.push('| Run | Prompt | Status | Wall (dtk) | duration_ms | Biaya | Turns | Tool call | Frame | Transkrip | .pen / PNG |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const x of r.runs) {
    const st = x.status + (x.reason ? ` (${x.reason})` : '') + (x.pngScaleMismatch ? ' png_scale_mismatch' : '');
    const frames = x.frames.map((f) => `${f.width}×${f.height}`).join(', ') || '0';
    const paths = [x.penPath, ...x.frames.flatMap((f) => (f.png ? [f.png] : []))].filter(Boolean).map((p) => `\`${p}\``).join('<br>') || '–';
    L.push(`| ${x.runId} | ${x.prompt} | ${cell(st)} | ${sec(x.wallMs)} | ${x.durationMs ?? '–'} | ${usd(x.costUsd)} | ${x.numTurns ?? '–'} | ${x.toolCalls ?? '–'} | ${frames} | ${kb(x.transcriptBytes)} | ${paths} |`);
  }
  L.push('');
  L.push('### Diagnostik (bukan waktu gerbang)', '');
  L.push('| Run | spawn → event pertama (dtk) | tool_use pertama (dtk) | tool_result terakhir (dtk) |');
  L.push('|---|---|---|---|');
  for (const x of r.runs) L.push(`| ${x.runId} | ${sec(x.spawnToFirstEventMs)} | ${sec(x.firstToolUseMs)} | ${sec(x.lastToolResultMs)} |`);
  L.push('');
  const failed = sums.flatMap((s) => s.failed);
  L.push('## Run gagal / tidak dihitung', '');
  L.push(failed.length ? failed.map((f) => `- ${f}`).join('\n') : '- tidak ada');
  L.push('');
  L.push('## Catatan pengukuran', '');
  for (const n of r.notes) L.push(`- ${n}`);
  L.push('');
  return L.join('\n');
}

export function renderJson(r: BaselineReport): string {
  return `${JSON.stringify({ ...r, summary: summarizeRuns(r.runs, Object.keys(r.prompts)) }, null, 2)}\n`;
}
