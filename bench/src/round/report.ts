// Laporan putaran: `bench/round-<round>.md|json` dan `bench/score-<id>.md|json`. Render murni (tes snapshot).
import type { JudgeRepRecord, Tool } from '../judge/run.js';
import { JUDGE_CRITERIA } from '../judge/prompt.js';
import type { LakarExtra } from '../lakar/run.js';
import type { RunRecord } from '../report.js';
import type { TextEmojiCount } from './emoji.js';
import type { Reconnect } from './reconnect.js';
import { TOOL_LABEL, TOOLS, type Agg, type Decision, type GateResult, type PromptScore } from './score.js';

export const ROUND_ID = /^(uji-[1-9]\d*|[1-9]\d*)$/;
export const PROVISIONAL = 'sementara, menunggu konfirmasi Adam';

export type RoundRun = {
  key: string;
  prompt: string;
  tool: Tool;
  dir: string;
  record: RunRecord & { lakar?: LakarExtra };
  reconnect: Reconnect | undefined;
  agentEmoji: TextEmojiCount | undefined;
  lintEmoji: { lc01a: number; lc01b: number } | undefined;
  strip: { path: string; width: number; height: number; boards: number } | undefined;
  /** Percobaan sebelumnya (aborted/invalid) yang dipindahkan saat --resume. */
  previous: string[];
};

export type RoundPrompt = {
  prompt: string;
  baselineMedianMs: number | undefined;
  runs: Partial<Record<Tool, RoundRun>>;
  gate: GateResult | undefined;
  sizeProblems: string[];
  score: PromptScore | undefined;
  decision: { decision: Decision; why: string };
};

export type FrozenVersions = {
  head: string;
  porcelain: string;
  protocolHash: string;
  baselineProtocolHash: string;
  model: string;
  claude: string;
  lakard: { version?: string; schemaVersion?: number; pid?: number; startedAt?: string; browser?: string };
  icons: Record<string, string>;
  skills: Record<string, string>;
  g0Rules: string;
  checkDist: string;
  pendevDesktop: string | undefined;
  pendevMcp: string | undefined;
  judge: { model: string; argv: string };
};

export type RoundReport = {
  round: string;
  date: string;
  status: 'lengkap' | 'tidak lengkap' | 'dibatalkan';
  statusReasons: string[];
  frozen: FrozenVersions;
  wrapper: string;
  prompts: Record<string, string>;
  argv: { lakar: string; pendev: string; judge: string };
  env: { set: Record<string, string>; scrubbed: string[] };
  convention: string[];
  definitions: string[];
  penGuard: { files: number; changed: string[]; removed: string[]; added: string[] } | undefined;
  lakardActiveAfter: string | undefined;
  results: RoundPrompt[];
  judgeCostUsd: number;
  notes: string[];
};

const sec = (ms: number | undefined) => (ms === undefined ? '–' : (ms / 1000).toFixed(1));
const usd = (x: number | undefined) => (x === undefined ? '–' : `$${x.toFixed(2)}`);
const ratio = (a: number | undefined, b: number | undefined) => (a === undefined || !b ? '–' : (a / b).toFixed(2));
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const num = (x: number | undefined) => (x === undefined ? '–' : Number.isInteger(x) ? String(x) : x.toFixed(1));
const aggText = (a: Agg | undefined) => (a ? `${num(a.median)} (rentang ${num(a.range)})${a.flag ? ' **periksa Adam**' : ''}` : '–');
const runStatus = (r: RoundRun | undefined) => (r ? `${r.record.status}${r.record.reason ? ` (${r.record.reason})` : ''}` : 'tidak dijalankan');

export function renderRoundMarkdown(r: RoundReport): string {
  const L: string[] = [];
  L.push(`# Putaran ${r.round}: Lakar vs pen.dev`, '');
  L.push(`Status: **${r.status}**${r.statusReasons.length ? ` (${r.statusReasons.join('; ')})` : ''}. Tanggal: ${r.date}.`, '');
  L.push(`Keputusan di laporan ini **${PROVISIONAL}**.`, '');
  L.push('## Ringkasan', '');
  L.push('| Prompt | Waktu Lakar (dtk) | Waktu pen.dev (dtk) | Lakar/pen.dev | Lakar/baseline | Biaya Lakar | Biaya pen.dev | Gerbang Lakar | Total Lakar | Total pen.dev | Keputusan |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of r.results) {
    const l = p.runs.lakar?.record;
    const d = p.runs.pendev?.record;
    const tl = p.score?.tools.lakar;
    const tp = p.score?.tools.pendev;
    L.push(
      `| ${p.prompt} | ${sec(l?.wallMs)} | ${sec(d?.wallMs)} | ${ratio(l?.wallMs, d?.wallMs)} | ${ratio(l?.wallMs, p.baselineMedianMs)} | ${usd(l?.costUsd)} | ${usd(d?.costUsd)} | ${p.gate ? (p.gate.ok ? 'lolos' : 'gagal') : '–'} | ${num(tl?.total)} | ${num(tp?.total)} | ${p.decision.decision} (${PROVISIONAL}) |`,
    );
  }
  L.push('');
  for (const p of r.results) {
    L.push(`## Prompt ${p.prompt}`, '');
    L.push('### Waktu dan biaya', '');
    L.push('| Alat | Status | Wall (dtk) | duration_ms | Biaya | Turns | Tool call | Board/frame | Run |');
    L.push('|---|---|---|---|---|---|---|---|---|');
    for (const t of TOOLS) {
      const run = p.runs[t];
      const x = run?.record;
      L.push(
        `| ${TOOL_LABEL[t]} | ${cell(runStatus(run))} | ${sec(x?.wallMs)} | ${x?.durationMs ?? '–'} | ${usd(x?.costUsd)} | ${x?.numTurns ?? '–'} | ${x?.toolCalls ?? '–'} | ${x?.frames.map((f) => `${f.width}×${f.height}`).join(', ') || '–'} | ${run ? `\`${run.dir}\`` : '–'} |`,
      );
    }
    L.push('');
    L.push(`- Rasio Lakar/pen.dev (putaran ini): ${ratio(p.runs.lakar?.record.wallMs, p.runs.pendev?.record.wallMs)}`);
    L.push(`- Rasio Lakar/median baseline pen.dev (${sec(p.baselineMedianMs)} dtk): ${ratio(p.runs.lakar?.record.wallMs, p.baselineMedianMs)}`);
    for (const t of TOOLS) if (p.runs[t]?.previous.length) L.push(`- Percobaan ${TOOL_LABEL[t]} sebelumnya (tidak dihitung): ${p.runs[t]!.previous.map((x) => `\`${x}\``).join(', ')}`);
    L.push('');
    const lk = p.runs.lakar?.record.lakar;
    L.push('### Gerbang G0 Lakar (otomatis)', '');
    L.push(`- layout_check harness: ${lk?.layout ? `gate = ${lk.layout.summary.gate}, error ${lk.layout.summary.error}, warning ${lk.layout.summary.warning} (rev ${lk.layout.rev})` : '–'}`);
    L.push(`- Ukuran board: ${lk?.boards.length ? lk.boards.map((b) => `${b.name} ${b.width}×${b.height}`).join(', ') : '–'}${p.sizeProblems.length ? ` → ${p.sizeProblems.join('; ')}` : ' → sesuai'}`);
    L.push(`- Waktu ≤ 1,5 × median baseline: ${p.gate?.timeRatio === undefined ? '–' : `rasio ${p.gate.timeRatio.toFixed(2)}`}`);
    L.push(`- Hasil: ${p.gate ? (p.gate.ok ? '**lolos**' : `**gagal** (${p.gate.reasons.join('; ')})`) : '–'}`);
    L.push('- R3/R7 tidak dihitung di G0 (keputusan epic): aturan LC-03/06/07/11/13/14/17/18/21 belum ada di `G0_RULES`.');
    if (lk) L.push(`- Dokumen Lakar: slug \`${lk.slug ?? '–'}\` (dibuka agen: ${lk.opened.join(', ') || '–'}), salinan \`${lk.docPath ?? '–'}\``);
    L.push('');
    L.push('### Emoji', '');
    L.push('| Alat | (a) di input tool_use agen | glyph LC-01b di input (terpisah) | (b) LC-01a / LC-01b layout_check | (c) juri (median, rentang) |');
    L.push('|---|---|---|---|---|');
    for (const t of TOOLS) {
      const run = p.runs[t];
      const lint = t === 'lakar' ? (run?.lintEmoji ? `${run.lintEmoji.lc01a} / ${run.lintEmoji.lc01b}` : '–') : 'tidak dilint (EULA)';
      L.push(`| ${TOOL_LABEL[t]} | ${run?.agentEmoji ? `${run.agentEmoji.emoji}${run.agentEmoji.samples.length ? ` (${run.agentEmoji.samples.join(' ')})` : ''}` : '–'} | ${run?.agentEmoji?.glyphs ?? '–'} | ${lint} | ${aggText(p.score?.tools[t].emoji)} |`);
    }
    L.push('');
    L.push('### Reconnect (dilaporkan terpisah, tidak dikurangkan dari waktu)', '');
    L.push('| Alat | Jumlah | ms tool_use→tool_result terdampak | Kejadian |');
    L.push('|---|---|---|---|');
    for (const t of TOOLS) {
      const rc = p.runs[t]?.reconnect;
      const ev = rc ? [...rc.events.map((e) => `${e.kind}: ${e.detail}`), ...rc.toolErrors.map((e) => `${e.tool} (${e.ms ?? '?'} ms): ${e.snippet}`)].join('<br>') : '';
      L.push(`| ${TOOL_LABEL[t]} | ${rc?.count ?? '–'} | ${rc?.affectedMs ?? '–'} | ${cell(ev) || '–'} |`);
    }
    L.push('');
    L.push('### Skor juri (median 3 ulangan)', '');
    if (p.score) {
      L.push(`Ulangan valid: ${p.score.validReps} dari ${p.score.reps.length}. Detail dan bukti: \`bench/score-${p.prompt}.md\`.`, '');
      L.push('| Kriteria | Lakar | pen.dev |');
      L.push('|---|---|---|');
      for (const c of JUDGE_CRITERIA) L.push(`| ${c} | ${aggText(p.score.tools.lakar.criteria[c])} | ${aggText(p.score.tools.pendev.criteria[c])} |`);
      L.push(`| **Total (jumlah median)** | **${num(p.score.tools.lakar.total)}** | **${num(p.score.tools.pendev.total)}** |`);
      L.push(`| Slop (juri) | ${aggText(p.score.tools.lakar.slop)} | ${aggText(p.score.tools.pendev.slop)} |`);
    } else L.push('Juri tidak dijalankan (strip salah satu alat tidak ada atau putaran berhenti).');
    L.push('');
    L.push(`### Keputusan: **${p.decision.decision}** (${PROVISIONAL})`, '', `Alasan: ${p.decision.why}.`, '');
    L.push(`Strip: ${TOOLS.map((t) => (p.runs[t]?.strip ? `\`${p.runs[t]!.strip!.path}\` (${p.runs[t]!.strip!.width}×${p.runs[t]!.strip!.height}, ${p.runs[t]!.strip!.boards} board)` : `${TOOL_LABEL[t]} –`)).join(', ')}`, '');
  }
  L.push(`Biaya juri total: ${usd(r.judgeCostUsd)}.`, '');
  L.push('## Versi beku', '');
  const f = r.frozen;
  L.push(`- git HEAD: \`${f.head}\`; \`git status --porcelain -- packages tools .mcp.json\`: ${f.porcelain ? `**tidak kosong**:\n\n\`\`\`\n${f.porcelain}\n\`\`\`` : 'kosong'}`);
  L.push(`- protocolHash: \`${f.protocolHash}\` (baseline: \`${f.baselineProtocolHash}\`, ${f.protocolHash === f.baselineProtocolHash ? 'sama' : '**beda**'})`);
  L.push(`- Model agen dan juri: \`${f.model}\`; Claude Code: ${f.claude}`);
  L.push(`- lakard: version ${f.lakard.version ?? '–'}, schemaVersion ${f.lakard.schemaVersion ?? '–'}, pid ${f.lakard.pid ?? '–'}, startedAt ${f.lakard.startedAt ?? '–'}, Chromium ${f.lakard.browser ?? '–'}`);
  L.push(`- Ikon (/status): ${Object.entries(f.icons).map(([k, v]) => `${k} ${v}`).join(', ') || '–'}`);
  for (const [k, v] of Object.entries(f.skills)) L.push(`- skill \`${k}\` sha256 \`${v}\``);
  L.push(`- \`G0_RULES\`: \`${f.g0Rules}\``);
  L.push(`- sha256 \`packages/check/dist\`: \`${f.checkDist}\``);
  L.push(`- pen.dev desktop: ${f.pendevDesktop ?? '–'}; MCP server: ${f.pendevMcp ?? '–'}`);
  L.push(`- Juri: model \`${f.judge.model}\`; argv \`${f.judge.argv}\``);
  L.push('');
  L.push('## Protokol', '');
  L.push('### Pembungkus (bench/protocol/wrapper.txt, kata per kata)', '', '```', r.wrapper.trimEnd(), '```', '');
  for (const [id, text] of Object.entries(r.prompts)) L.push(`### Prompt ${id}`, '', '```', text, '```', '');
  L.push('### Argumen claude', '', 'Lakar:', '', '```', r.argv.lakar, '```', '', 'pen.dev:', '', '```', r.argv.pendev, '```', '', 'Juri:', '', '```', r.argv.judge, '```', '');
  L.push(`Env proses claude (agen dan juri): ${Object.entries(r.env.set).map(([k, v]) => `\`${k}=${v}\``).join(', ') || '–'}; dibuang dari env pemanggil: ${r.env.scrubbed.map((k) => `\`${k}\``).join(', ') || '–'}`, '');
  L.push('### Konvensi putaran', '');
  for (const c of r.convention) L.push(`- ${c}`);
  L.push('');
  L.push('### Definisi waktu dan reconnect', '');
  for (const d of r.definitions) L.push(`- ${d}`);
  L.push('');
  L.push('## Penjaga .pen lama', '');
  if (r.penGuard) {
    L.push(`- ${r.penGuard.files} file \`.pen\` di-md5 sebelum putaran (\`~/.pencil/documents\`, \`/root/lakar/design\`, \`/root/comprice\`, \`/opt/pen\`).`);
    L.push(`- Berubah: ${r.penGuard.changed.length ? r.penGuard.changed.map((x) => `\`${x}\``).join(', ') : 'tidak ada'}; hilang: ${r.penGuard.removed.length ? r.penGuard.removed.map((x) => `\`${x}\``).join(', ') : 'tidak ada'}; baru: ${r.penGuard.added.length}.`);
  } else L.push('- tidak dicek (dry-run)');
  L.push(`- \`systemctl --user is-active lakard\` sesudah putaran: ${r.lakardActiveAfter ?? '–'}`);
  L.push('');
  if (r.notes.length) {
    L.push('## Catatan', '');
    for (const n of r.notes) L.push(`- ${n}`);
    L.push('');
  }
  return L.join('\n');
}

const repStatus = (r: JudgeRepRecord) =>
  `${r.status}${r.retried ? ' (1 percobaan ulang)' : ''}${r.attempts.some((a) => a.problems.length) ? `: ${r.attempts.map((a, i) => `percobaan ${i + 1} ${a.status}${a.problems.length ? ` [${a.problems.slice(0, 3).join('; ')}]` : ''}`).join('; ')}` : ''}`;

export function renderScoreMarkdown(round: string, p: RoundPrompt): string {
  const L: string[] = [];
  L.push(`# Skor juri prompt ${p.prompt} (putaran ${round})`, '');
  L.push(`Juri LLM buta, 3 ulangan dengan label X/Y diacak. Keputusan **${p.decision.decision}** (${PROVISIONAL}): ${p.decision.why}.`, '');
  const s = p.score;
  if (!s) {
    L.push('Juri tidak dijalankan untuk prompt ini.', '');
    return L.join('\n');
  }
  L.push(`Ulangan valid: ${s.validReps} dari ${s.reps.length}.`, '');
  const reps = [...s.reps].sort((a, b) => a.rep - b.rep);
  L.push('## Skor per kriteria', '');
  L.push(`| Kriteria | Alat | ${reps.map((r) => `Ulangan ${r.rep}`).join(' | ')} | Median | Rentang | Periksa |`);
  L.push(`|---|---|${reps.map(() => '---|').join('')}---|---|---|`);
  for (const c of JUDGE_CRITERIA) {
    for (const t of TOOLS) {
      const a = s.tools[t].criteria[c];
      const byRep = reps.map((r) => a.evidence.find((e) => e.rep === r.rep)?.skor ?? '–');
      L.push(`| ${c} | ${TOOL_LABEL[t]} | ${byRep.join(' | ')} | ${num(a.median)} | ${num(a.range)} | ${a.flag ? '**periksa Adam**' : ''} |`);
    }
  }
  L.push(`| **Total** | Lakar | ${reps.map(() => '').join(' | ')} | **${num(s.tools.lakar.total)}** | | |`);
  L.push(`| **Total** | pen.dev | ${reps.map(() => '').join(' | ')} | **${num(s.tools.pendev.total)}** | | |`);
  L.push('');
  L.push('## Slop dan emoji menurut juri', '');
  L.push('| Alat | Slop (median, rentang) | Emoji terlihat (median, rentang) |');
  L.push('|---|---|---|');
  for (const t of TOOLS) L.push(`| ${TOOL_LABEL[t]} | ${aggText(s.tools[t].slop)} | ${aggText(s.tools[t].emoji)} |`);
  L.push('');
  L.push('## Bukti per ulangan', '');
  for (const t of TOOLS) {
    L.push(`### ${TOOL_LABEL[t]}`, '');
    for (const c of JUDGE_CRITERIA) {
      L.push(`**${c}**`, '');
      for (const e of s.tools[t].criteria[c].evidence) L.push(`- Ulangan ${e.rep} (skor ${e.skor}): ${e.bukti.replace(/\n/g, ' ')}`);
      L.push('');
    }
    L.push('**Titik fokus (R2)**', '');
    for (const x of s.tools[t].focus) L.push(`- Ulangan ${x.rep}: ${x.fokus.replace(/\n/g, ' ')}`);
    L.push('', '**Slop**', '');
    for (const x of s.tools[t].slop.items) L.push(`- Ulangan ${x.rep}: ${x.butir.length ? x.butir.map((b) => b.replace(/\n/g, ' ')).join(' · ') : 'tidak ada'}`);
    L.push('');
  }
  L.push('## Pemetaan X/Y per ulangan (dibuka setelah penilaian)', '');
  L.push('| Ulangan | Desain X | Desain Y | Status | Biaya |');
  L.push('|---|---|---|---|---|');
  for (const r of reps) L.push(`| ${r.rep} | ${TOOL_LABEL[r.mapping.X]} | ${TOOL_LABEL[r.mapping.Y]} | ${cell(repStatus(r))} | ${usd(r.costUsd)} |`);
  L.push('');
  return L.join('\n');
}

export function renderRoundJson(r: RoundReport): string {
  return `${JSON.stringify(r, null, 2)}\n`;
}

export function renderScoreJson(round: string, p: RoundPrompt): string {
  return `${JSON.stringify({ round, prompt: p.prompt, provisional: PROVISIONAL, decision: p.decision, score: p.score }, null, 2)}\n`;
}
