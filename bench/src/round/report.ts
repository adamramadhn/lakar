// Laporan putaran: `bench/round-<round>.md|json` dan `bench/score-<id>.md|json`. Render murni (tes snapshot).
import type { JudgeRepRecord, Tool } from '../judge/run.js';
import { JUDGE_CRITERIA } from '../judge/prompt.js';
import type { LakarExtra } from '../lakar/run.js';
import type { RunRecord } from '../report.js';
import type { TextEmojiCount } from './emoji.js';
import type { Reconnect } from './reconnect.js';
import { TOOL_LABEL, TOOLS, type Agg, type Decision, type G0Decision, type GateResult, type PromptScore } from './score.js';

export const ROUND_ID = /^(uji-[1-9]\d*|[1-9]\d*)$/;
/** Putaran resmi (story 16): ID angka polos. */
export const isOfficialRound = (round: string): boolean => /^[1-9]\d*$/.test(round);
/** Path kode yang wajib bersih (porcelain kosong) di putaran resmi: produk + harness. */
export const OFFICIAL_CODE_PATHS: readonly string[] = ['packages', 'tools', 'scripts', 'bench/src', 'bench/protocol', 'bench/mcp', 'bench/package.json', 'package.json', 'pnpm-lock.yaml', '.mcp.json'];
const PROVISIONAL = 'sementara, menunggu konfirmasi Adam';
/** Isi sel/baris yang hanya boleh diisi Adam (agen tidak pernah mengisinya). */
export const AWAITING_ADAM = 'menunggu konfirmasi Adam';
const C4_LINE = 'C4: G1 tidak dimulai sebelum G0 lolos dan dikonfirmasi Adam.';

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
  /** Median biaya baseline pen.dev (`bench/baseline-pendev.json`), hanya dilaporkan. */
  baselineCostUsd?: number | undefined;
  runs: Partial<Record<Tool, RoundRun>>;
  gate: GateResult | undefined;
  sizeProblems: string[];
  score: PromptScore | undefined;
  decision: { decision: Decision; why: string };
};

export type FrozenVersions = {
  head: string;
  /** `git status --porcelain -- packages tools .mcp.json` (story 14). */
  porcelain: string;
  /** Putaran resmi: `git status --porcelain -- <OFFICIAL_CODE_PATHS>` (wajib kosong). */
  porcelainCode?: string;
  /** `git status --porcelain` penuh (file plan untracked/terubah boleh ada). */
  porcelainAll?: string;
  protocolHash: string;
  baselineProtocolHash: string;
  model: string;
  claude: string;
  lakard: { version?: string; schemaVersion?: number; pid?: number; startedAt?: string; browser?: string; node?: string };
  /** Versi `playwright-core` terpasang (packages/daemon). */
  playwright?: string;
  /** Font lakard (`/status.fonts`) + versi paket `@fontsource/*` di `packages/daemon/package.json`. */
  fonts?: { families: string[]; missing: string[]; packages: Record<string, string> };
  /** sha256 per `packages/<nama>/dist`. */
  distSha?: Record<string, string>;
  /** Pembanding `bench/baseline-pendev.json` (putaran resmi wajib sama). */
  baseline?: { model: string; claude: string; pendevDesktop: string | undefined };
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
  /** Keputusan G0 sementara (`decideG0`), menunggu konfirmasi Adam. */
  g0: { decision: G0Decision; why: string };
  /** Strip keempat run untuk Adam, dengan status commit. */
  pngs: { prompt: string; tool: Tool; path: string | undefined; status: string }[];
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
  L.push(`## Keputusan G0 (sementara, ${AWAITING_ADAM})`, '');
  L.push(`Keputusan G0: **${r.g0.decision}** (${PROVISIONAL}). Alasan: ${r.g0.why}.`, '');
  L.push('| Prompt | Keputusan | Alasan | Median waktu baseline pen.dev (dtk) | Median biaya baseline pen.dev |');
  L.push('|---|---|---|---|---|');
  for (const p of r.results) L.push(`| ${p.prompt} | ${p.decision.decision} | ${cell(p.decision.why)} | ${sec(p.baselineMedianMs)} | ${usd(p.baselineCostUsd)} |`);
  L.push('');
  L.push('Aturan: putaran dibatalkan → tidak dapat diputuskan; ada prompt Kalah → gagal; A dan B sama-sama Setara/Lebih baik → lolos; selebihnya → tidak dapat diputuskan. Biaya hanya dilaporkan (C8).', '');
  L.push(`- ${C4_LINE}`, '');
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
  if (r.g0.decision !== 'lolos') {
    L.push('## Evaluasi arah', '');
    L.push(`G0 **${r.g0.decision}** (${PROVISIONAL}). Fakta per prompt:`, '');
    for (const p of r.results) {
      const sc = p.score?.tools;
      const zeroVsTwo = sc ? JUDGE_CRITERIA.filter((c) => sc.lakar.criteria[c].median === 0 && sc.pendev.criteria[c].median === 2) : [];
      L.push(`- **${p.prompt}** — ${p.decision.decision}: ${p.decision.why}.`);
      L.push(`  - Gerbang: ${p.gate ? (p.gate.ok ? 'lolos' : `gagal (${p.gate.reasons.join('; ')})`) : '–'}.`);
      L.push(`  - Total: Lakar ${num(sc?.lakar.total)} vs pen.dev ${num(sc?.pendev.total)}.`);
      L.push(`  - R dengan Lakar 0 vs pen.dev 2: ${sc ? zeroVsTwo.join(', ') || 'tidak ada' : '–'}.`);
      L.push(`  - Rasio waktu Lakar/median baseline: ${ratio(p.runs.lakar?.record.wallMs, p.baselineMedianMs)}; Lakar/pen.dev putaran ini: ${ratio(p.runs.lakar?.record.wallMs, p.runs.pendev?.record.wallMs)}.`);
    }
    L.push('');
    L.push(`- ${C4_LINE}`);
    L.push(`- Opsi yang ${AWAITING_ADAM} (agen tidak memilih):`);
    L.push(`  1. Perbaiki penyebabnya, lalu putaran resmi baru \`--round ${isOfficialRound(r.round) ? Number(r.round) + 1 : '<n+1>'}\` untuk A dan B (putaran baru, bukan mengulang run; C8).`);
    L.push('  2. Evaluasi ulang arah editor milik Lakar.');
    L.push('');
  }
  L.push('## PNG untuk Adam', '');
  L.push('| Prompt | Alat | Strip | Status commit |');
  L.push('|---|---|---|---|');
  for (const x of r.pngs) L.push(`| ${x.prompt} | ${TOOL_LABEL[x.tool]} | ${x.path ? `\`${x.path}\`` : '–'} | ${cell(x.status)} |`);
  L.push('');
  L.push('## Konfirmasi Adam', '');
  L.push(`Status: **${AWAITING_ADAM}**. Bagian ini hanya diisi Adam; agen tidak pernah mengisinya.`, '');
  L.push('| Prompt | Keputusan sementara | Kriteria rentang > 1 | Keputusan Adam | Koreksi skor |');
  L.push('|---|---|---|---|---|');
  for (const p of r.results) {
    const flagged = p.score ? JUDGE_CRITERIA.flatMap((c) => TOOLS.filter((t) => p.score!.tools[t].criteria[c].flag).map((t) => `${c} ${TOOL_LABEL[t]}`)) : [];
    L.push(`| ${p.prompt} | ${p.decision.decision} | ${flagged.join(', ') || 'tidak ada'} | ${AWAITING_ADAM} | ${AWAITING_ADAM} |`);
  }
  L.push('');
  L.push(`Keputusan G0 final: ${AWAITING_ADAM} (sementara: ${r.g0.decision}).`, '');
  L.push('## Versi beku', '');
  const f = r.frozen;
  const block = (s: string) => `**tidak kosong**:\n\n\`\`\`\n${s}\n\`\`\``;
  L.push(`- git HEAD: \`${f.head}\`; \`git status --porcelain -- packages tools .mcp.json\`: ${f.porcelain ? block(f.porcelain) : 'kosong'}`);
  if (f.porcelainCode !== undefined) L.push(`- \`git status --porcelain -- ${OFFICIAL_CODE_PATHS.join(' ')}\`: ${f.porcelainCode ? block(f.porcelainCode) : 'kosong'}`);
  if (f.porcelainAll !== undefined) L.push(`- \`git status --porcelain\` penuh: ${f.porcelainAll ? `\n\n\`\`\`\n${f.porcelainAll}\n\`\`\`\n` : 'kosong'}`);
  L.push(`- protocolHash: \`${f.protocolHash}\` (baseline: \`${f.baselineProtocolHash}\`, ${f.protocolHash === f.baselineProtocolHash ? 'sama' : '**beda**'})`);
  L.push(`- Model agen dan juri: \`${f.model}\`; Claude Code: ${f.claude}`);
  if (f.baseline) L.push(`- Baseline pen.dev (\`bench/baseline-pendev.json\`): model \`${f.baseline.model}\`, Claude Code ${f.baseline.claude}, pen.dev desktop ${f.baseline.pendevDesktop ?? '–'}`);
  L.push(`- lakard: version ${f.lakard.version ?? '–'}, schemaVersion ${f.lakard.schemaVersion ?? '–'}, pid ${f.lakard.pid ?? '–'}, startedAt ${f.lakard.startedAt ?? '–'}, Chromium ${f.lakard.browser ?? '–'}${f.lakard.node ? `, Node ${f.lakard.node}` : ''}`);
  if (f.playwright) L.push(`- playwright-core: ${f.playwright}`);
  if (f.fonts) L.push(`- Font (/status): ${f.fonts.families.join(', ') || '–'}; missing: ${f.fonts.missing.length ? f.fonts.missing.join(', ') : '[]'}; paket: ${Object.entries(f.fonts.packages).map(([k, v]) => `${k} ${v}`).join(', ') || '–'}`);
  L.push(`- Ikon (/status): ${Object.entries(f.icons).map(([k, v]) => `${k} ${v}`).join(', ') || '–'}`);
  for (const [k, v] of Object.entries(f.skills)) L.push(`- skill \`${k}\` sha256 \`${v}\``);
  L.push(`- \`G0_RULES\`: \`${f.g0Rules}\``);
  L.push(`- sha256 \`packages/check/dist\`: \`${f.checkDist}\``);
  // `packages/check/dist` sudah dicetak di atas (`checkDist`); jangan diulang.
  if (f.distSha) for (const [k, v] of Object.entries(f.distSha)) if (k !== 'check') L.push(`- sha256 \`packages/${k}/dist\`: \`${v}\``);
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
