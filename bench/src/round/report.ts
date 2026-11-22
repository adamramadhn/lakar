// Laporan putaran: `bench/round-<round>.md|json` dan laporan skor (`bench/score-<id>.md|json`; putaran resmi ≥ 2:
// `bench/round-<n>/score-<id>.md|json`). Render murni (tes snapshot).
import { G0_RULES } from '@lakar/schema';
import type { JudgeRepRecord, Tool } from '../judge/run.js';
import { JUDGE_CRITERIA } from '../judge/prompt.js';
import type { LakarExtra } from '../lakar/run.js';
import type { RunRecord } from '../report.js';
import type { TextEmojiCount } from './emoji.js';
import type { Reconnect } from './reconnect.js';
import {
  ADAM_FALSE_POSITIVE_FLAG,
  appealAxis,
  G1_MIN_BETTER,
  G1_MIN_PASS,
  G1_PROMPTS,
  R3_ONE_MAX,
  R3_RULES,
  R7_ONE_MAX_ERRORS,
  R7_ONE_MAX_WARNINGS,
  R7_STRUCTURAL_RULES,
  R7_TWO_MAX_WARNINGS,
  TIME_GATE_FACTOR,
  TOOL_LABEL,
  TOOLS,
  type Agg,
  type DecisionResult,
  type G0Decision,
  type G1Decision,
  type GateResult,
  type PromptScore,
  type TechnicalScores,
} from './score.js';

/** Aturan katalog R3/R7 (Lampiran A: LC-03/06/07/11/13/14/17/18/21) yang belum ada di `G0_RULES`, dihitung dari `G0_RULES`. */
const R3R7_RULES = ['LC-03', 'LC-06', 'LC-07', 'LC-11', 'LC-13', 'LC-14', 'LC-17', 'LC-18', 'LC-21'] as const;
export function r3r7Missing(rules: Readonly<Record<string, unknown>> = G0_RULES): string {
  const missing = R3R7_RULES.filter((r) => !(r in rules));
  if (!missing.length) return 'semua aturan katalog LC-03/06/07/11/13/14/17/18/21 sudah ada di `G0_RULES`.';
  return `aturan ${missing.map((r, i) => (i === 0 ? r : r.slice(3))).join('/')} belum ada di \`G0_RULES\`.`;
}

/** `G0_RULES` beku putaran (`frozen.g0Rules`, JSON objek); tidak ada/tidak terbaca → `G0_RULES` saat ini. */
export function frozenG0Rules(g0Rules: string | undefined): Readonly<Record<string, unknown>> {
  try {
    const v: unknown = g0Rules === undefined ? undefined : JSON.parse(g0Rules);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // jatuh ke aturan saat ini
  }
  return G0_RULES;
}

export const ROUND_ID = /^(uji-[1-9]\d*|[1-9]\d*)$/;
/** Putaran resmi (story 16): ID angka polos. */
export const isOfficialRound = (round: string): boolean => /^[1-9]\d*$/.test(round);
/** Path kode yang wajib bersih (porcelain kosong) di putaran resmi: produk + harness. */
export const OFFICIAL_CODE_PATHS: readonly string[] = ['packages', 'tools', 'scripts', 'bench/src', 'bench/protocol', 'bench/mcp', 'bench/package.json', 'package.json', 'pnpm-lock.yaml', '.mcp.json'];
const PROVISIONAL = 'sementara, menunggu konfirmasi Adam';
/** Isi sel/baris yang hanya boleh diisi Adam (agen tidak pernah mengisinya). */
export const AWAITING_ADAM = 'menunggu konfirmasi Adam';
const C4_LINE = 'C4: G1 tidak dimulai sebelum G0 lolos dan dikonfirmasi Adam.';
const G1_LINE = 'Keputusan G1 final hanya dari Adam; agen tidak mengonfirmasi atau menutup G1.';

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
  /** Path laporan skor (relatif repo, `scoreReportBase`); tanpa field → `bench/score-<prompt>.md` (laporan lama). */
  scoreReport?: string;
  baselineMedianMs: number | undefined;
  /** Median biaya baseline pen.dev (`bench/baseline-pendev.json`), hanya dilaporkan. */
  baselineCostUsd?: number | undefined;
  runs: Partial<Record<Tool, RoundRun>>;
  gate: GateResult | undefined;
  sizeProblems: string[];
  score: PromptScore | undefined;
  decision: DecisionResult;
  /** Masalah ukuran frame pen.dev terhadap ukuran mengikat (`boardSizeProblems`); kosong = sesuai. */
  pendevSizeProblems?: string[];
  /** Putaran G1: file baseline pen.dev yang dipakai prompt ini (baseline terbaru yang mencakupnya). */
  baselineSource?: string | undefined;
  /** Putaran G1: R3/R7 mekanis (`technicalScores`); null = temuan layout_check tidak ada. Tanpa field = G0 (tidak dihitung). */
  technical?: TechnicalScores | null;
};

/** Hasil probe foto sebelum run (putaran resmi). */
export type PhotoProbe = { query: string; provider: string; fallbackReason?: string; results: number; ms: number };

/** Versi rubrik + sha256 teks juri per prompt (sama dengan `bench/rubric/rubric.json`). */
export type JudgeTextInfo = { rubricVersion: string | undefined; textSha256: Record<string, string> };

export type FrozenVersions = {
  head: string;
  /** `git status --porcelain -- packages tools .mcp.json` (story 14). */
  porcelain: string;
  /** Putaran resmi: `git status --porcelain -- <OFFICIAL_CODE_PATHS>` (wajib kosong). */
  porcelainCode?: string;
  /** `git status --porcelain` penuh (file plan untracked/terubah boleh ada). */
  porcelainAll?: string;
  protocolHash: string;
  /** G0: protocolHash `bench/baseline-pendev.json`. Tidak ada di putaran G1 (sumber baseline per prompt di `promptBaselines`). */
  baselineProtocolHash?: string;
  /** Hash per prompt saat ini (G1). */
  promptHashes?: Record<string, string>;
  /** Baseline per prompt yang dipakai (G1); null = belum diukur. */
  promptBaselines?: Record<string, { promptHash: string; source: string; date: string } | null>;
  /** Versi baseline per prompt (G1). */
  baselinesByPrompt?: Record<string, { model: string | undefined; claude: string | undefined; pendevDesktop: string | undefined } | null>;
  model: string;
  claude: string;
  lakard: { version?: string; schemaVersion?: number; pid?: number; startedAt?: string; browser?: string; node?: string };
  /** Versi `playwright-core` terpasang (packages/daemon). */
  playwright?: string;
  /** Font lakard (`/status.fonts`) + versi paket `@fontsource/*` di `packages/daemon/package.json`. */
  fonts?: { families: string[]; missing: string[]; packages: Record<string, string> };
  /** sha256 per `packages/<nama>/dist`. */
  distSha?: Record<string, string>;
  /** Penyedia foto lakard (`/status.photos`) + probe sebelum run (putaran resmi). */
  photos?: { provider: string; keyFile: string; probe?: PhotoProbe };
  /** Pembanding `bench/baseline-pendev.json` (putaran resmi wajib sama). */
  baseline?: { model: string; claude: string; pendevDesktop: string | undefined };
  icons: Record<string, string>;
  skills: Record<string, string>;
  g0Rules: string;
  checkDist: string;
  pendevDesktop: string | undefined;
  pendevMcp: string | undefined;
  judge: { model: string; argv: string; rubricVersion?: string | undefined; textSha256?: Record<string, string> };
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
  /** Restart pen-desktop sesudah run pen.dev terakhir pemanggilan ini (hasil), atau alasan tidak dijalankan. */
  penDesktopRestart?: { ok: boolean; ms: number; detail: string } | string | undefined;
  results: RoundPrompt[];
  /** Keputusan G0 sementara (`decideG0`), menunggu konfirmasi Adam. */
  g0: { decision: G0Decision; why: string };
  /** Putaran G1 (A–E): keputusan G1 sementara (`decideG1`); bila ada, laporan merender bagian G1 menggantikan G0. */
  g1?: { decision: G1Decision; why: string };
  /** Strip keempat run untuk Adam, dengan status commit. */
  pngs: { prompt: string; tool: Tool; path: string | undefined; status: string }[];
  judgeCostUsd: number;
  /** Versi rubrik dan sha256 teks juri (story 17). */
  judge?: JudgeTextInfo;
  notes: string[];
};

const sec = (ms: number | undefined) => (ms === undefined ? '–' : (ms / 1000).toFixed(1));
const usd = (x: number | undefined) => (x === undefined ? '–' : `$${x.toFixed(2)}`);
const ratio = (a: number | undefined, b: number | undefined) => (a === undefined || !b ? '–' : (a / b).toFixed(2));
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const num = (x: number | undefined) => (x === undefined ? '–' : Number.isInteger(x) ? String(x) : x.toFixed(1));
const aggText = (a: Agg | undefined) => (a ? `${num(a.median)} (rentang ${num(a.range)})${a.flag ? ' **periksa Adam**' : ''}` : '–');
/** Skor maks juri = 2 × jumlah kriteria juri. */
export const MAX_TOTAL = 2 * JUDGE_CRITERIA.length;
export const judgeInfoLines = (j: JudgeTextInfo | undefined): string[] =>
  j
    ? [`Versi rubrik: ${j.rubricVersion ?? '1 (tanpa baris versi)'}`, ...Object.entries(j.textSha256).map(([id, s]) => `sha256 teks juri ${id}: \`${s}\``)]
    : ['Versi rubrik: tidak tercatat (laporan sebelum story 17)'];
const runStatus = (r: RoundRun | undefined) => (r ? `${r.record.status}${r.record.reason ? ` (${r.record.reason})` : ''}` : 'tidak dijalankan');

export function renderRoundMarkdown(r: RoundReport): string {
  const L: string[] = [];
  L.push(`# Putaran ${r.round}: Lakar vs pen.dev`, '');
  L.push(`Status: **${r.status}**${r.statusReasons.length ? ` (${r.statusReasons.join('; ')})` : ''}. Tanggal: ${r.date}.`, '');
  L.push(`Keputusan di laporan ini **${PROVISIONAL}**.`, '');
  L.push('## Ringkasan', '');
  L.push(`| Prompt | Waktu Lakar (dtk) | Waktu pen.dev (dtk) | Lakar/pen.dev | Lakar/baseline | Biaya Lakar | Biaya pen.dev | Gerbang Lakar | Total Lakar (maks ${MAX_TOTAL}) | Total pen.dev | Daya tarik Lakar | Daya tarik pen.dev | Keputusan |`);
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of r.results) {
    const l = p.runs.lakar?.record;
    const d = p.runs.pendev?.record;
    const tl = p.score?.tools.lakar;
    const tp = p.score?.tools.pendev;
    L.push(
      `| ${p.prompt} | ${sec(l?.wallMs)} | ${sec(d?.wallMs)} | ${ratio(l?.wallMs, d?.wallMs)} | ${ratio(l?.wallMs, p.baselineMedianMs)} | ${usd(l?.costUsd)} | ${usd(d?.costUsd)} | ${p.gate ? (p.gate.ok ? 'lolos' : 'gagal') : '–'} | ${num(tl?.total)} | ${num(tp?.total)} | ${num(tl && appealAxis(tl))} | ${num(tp && appealAxis(tp))} | ${p.decision.decision} (${PROVISIONAL}) |`,
    );
  }
  L.push('');
  if (r.g1) renderG1Section(L, r, r.g1);
  else {
    L.push(`## Keputusan G0 (sementara, ${AWAITING_ADAM})`, '');
    L.push(`Keputusan G0: **${r.g0.decision}** (${PROVISIONAL}). Alasan: ${r.g0.why}.`, '');
    L.push('| Prompt | Keputusan | Alasan | Median waktu baseline pen.dev (dtk) | Median biaya baseline pen.dev |');
    L.push('|---|---|---|---|---|');
    for (const p of r.results) L.push(`| ${p.prompt} | ${p.decision.decision} | ${cell(p.decision.why)} | ${sec(p.baselineMedianMs)} | ${usd(p.baselineCostUsd)} |`);
    L.push('');
    L.push('Aturan: putaran dibatalkan → tidak dapat diputuskan; ada prompt Kalah → gagal; A dan B sama-sama Setara/Lebih baik → lolos; selebihnya → tidak dapat diputuskan. Biaya hanya dilaporkan (C8).', '');
    L.push(`- ${C4_LINE}`, '');
  }
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
    L.push(`- Rasio pen.dev putaran ini/median baseline pen.dev: ${ratio(p.runs.pendev?.record.wallMs, p.baselineMedianMs)} (indikator drift, bukan gerbang)`);
    for (const t of TOOLS) if (p.runs[t]?.previous.length) L.push(`- Percobaan ${TOOL_LABEL[t]} sebelumnya (tidak dihitung): ${p.runs[t]!.previous.map((x) => `\`${x}\``).join(', ')}`);
    L.push('');
    const lk = p.runs.lakar?.record.lakar;
    L.push(`### Gerbang ${r.g1 ? 'G1' : 'G0'} Lakar (otomatis)`, '');
    L.push(`- layout_check harness: ${lk?.layout ? `gate = ${lk.layout.summary.gate}, error ${lk.layout.summary.error}, warning ${lk.layout.summary.warning} (rev ${lk.layout.rev})` : '–'}`);
    L.push(`- Ukuran board: ${lk?.boards.length ? lk.boards.map((b) => `${b.name} ${b.width}×${b.height}`).join(', ') : '–'}${p.sizeProblems.length ? ` → ${p.sizeProblems.join('; ')}` : ' → sesuai'}`);
    L.push(`- Waktu ≤ 1,5 × median baseline: ${p.gate?.timeRatio === undefined ? '–' : `rasio ${p.gate.timeRatio.toFixed(2)}`}`);
    if (r.g1) L.push(`- R3/R7 mekanis (temuan layout_check final per ID aturan): ${technicalText(p.technical)}`);
    L.push(`- Hasil: ${p.gate ? (p.gate.ok ? '**lolos**' : `**gagal** (${p.gate.reasons.join('; ')})`) : '–'}`);
    if (r.g1) L.push(`- Aturan R3/R7 yang belum ada di katalog dihitung 0 temuan: ${r3r7Missing(frozenG0Rules(r.frozen?.g0Rules))}`);
    else L.push(`- R3/R7 tidak dihitung di G0 (keputusan epic): ${r3r7Missing(frozenG0Rules(r.frozen?.g0Rules))}`);
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
      L.push(`Ulangan valid: ${p.score.validReps} dari ${p.score.reps.length}. Detail dan bukti: \`${p.scoreReport ?? `bench/score-${p.prompt}.md`}\`.`, '');
      L.push('| Kriteria | Lakar | pen.dev |');
      L.push('|---|---|---|');
      for (const c of JUDGE_CRITERIA) L.push(`| ${c} | ${aggText(p.score.tools.lakar.criteria[c])} | ${aggText(p.score.tools.pendev.criteria[c])} |`);
      L.push(`| **Total (jumlah median, maks ${MAX_TOTAL})** | **${num(p.score.tools.lakar.total)}** | **${num(p.score.tools.pendev.total)}** |`);
      L.push(`| **Daya tarik D = R9 + R10 (maks 4)** | **${num(appealAxis(p.score.tools.lakar))}** | **${num(appealAxis(p.score.tools.pendev))}** |`);
      L.push(`| Slop (juri) | ${aggText(p.score.tools.lakar.slop)} | ${aggText(p.score.tools.pendev.slop)} |`);
    } else L.push('Juri tidak dijalankan (strip salah satu alat tidak ada atau putaran berhenti).');
    L.push('');
    if (p.pendevSizeProblems) L.push(`Brief mengikat pen.dev (ukuran frame): ${p.pendevSizeProblems.length ? p.pendevSizeProblems.join('; ') : 'sesuai'}.`, '');
    L.push(`### Keputusan: **${p.decision.decision}** (${PROVISIONAL})`, '', `Alasan: ${p.decision.why}.`, '');
    L.push(`Strip: ${TOOLS.map((t) => (p.runs[t]?.strip ? `\`${p.runs[t]!.strip!.path}\` (${p.runs[t]!.strip!.width}×${p.runs[t]!.strip!.height}, ${p.runs[t]!.strip!.boards} board)` : `${TOOL_LABEL[t]} –`)).join(', ')}`, '');
  }
  L.push(`Biaya juri total: ${usd(r.judgeCostUsd)}.`, '');
  const gateName = r.g1 ? 'G1' : 'G0';
  const gateDecision = r.g1 ?? r.g0;
  if (gateDecision.decision !== 'lolos') {
    L.push('## Evaluasi arah', '');
    L.push(`${gateName} **${gateDecision.decision}** (${PROVISIONAL}). Fakta per prompt:`, '');
    for (const p of r.results) {
      const sc = p.score?.tools;
      const ch = p.decision.checks;
      L.push(`- **${p.prompt}** — ${p.decision.decision}: ${p.decision.why}.`);
      L.push(`  - Gerbang: ${p.gate ? (p.gate.ok ? 'lolos' : `gagal (${p.gate.reasons.join('; ')})`) : '–'}.`);
      L.push(`  - Total: Lakar ${num(sc?.lakar.total)} vs pen.dev ${num(sc?.pendev.total)}; daya tarik: Lakar ${num(ch?.appeal.lakar)} vs pen.dev ${num(ch?.appeal.pendev)}.`);
      L.push(`  - R dengan Lakar 0 vs pen.dev 2: ${ch ? ch.zeroVsTwo.join(', ') || 'tidak ada' : '–'}.`);
      L.push(`  - Pelanggaran brief pen.dev: ${ch ? ch.pendevBriefViolations.join('; ') || 'tidak ada' : '–'}.`);
      L.push(`  - Rasio waktu Lakar/median baseline: ${ratio(p.runs.lakar?.record.wallMs, p.baselineMedianMs)}; Lakar/pen.dev putaran ini: ${ratio(p.runs.lakar?.record.wallMs, p.runs.pendev?.record.wallMs)}.`);
    }
    L.push('');
    L.push(`- ${r.g1 ? G1_LINE : C4_LINE}`);
    L.push(`- Opsi yang ${AWAITING_ADAM} (agen tidak memilih):`);
    L.push(`  1. Perbaiki penyebabnya, lalu putaran resmi baru \`--round ${isOfficialRound(r.round) ? Number(r.round) + 1 : '<n+1>'}\` untuk ${r.g1 ? r.results.map((p) => p.prompt).join(', ') : 'A dan B'} (putaran baru, bukan mengulang run; C8).`);
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
  L.push(`Keputusan ${gateName} final: ${AWAITING_ADAM} (sementara: ${gateDecision.decision}).`, '');
  L.push('## Versi beku', '');
  const f = r.frozen;
  const block = (s: string) => `**tidak kosong**:\n\n\`\`\`\n${s}\n\`\`\``;
  L.push(`- git HEAD: \`${f.head}\`; \`git status --porcelain -- packages tools .mcp.json\`: ${f.porcelain ? block(f.porcelain) : 'kosong'}`);
  if (f.porcelainCode !== undefined) L.push(`- \`git status --porcelain -- ${OFFICIAL_CODE_PATHS.join(' ')}\`: ${f.porcelainCode ? block(f.porcelainCode) : 'kosong'}`);
  if (f.porcelainAll !== undefined) L.push(`- \`git status --porcelain\` penuh: ${f.porcelainAll ? `\n\n\`\`\`\n${f.porcelainAll}\n\`\`\`\n` : 'kosong'}`);
  if (f.promptHashes) {
    L.push(`- protocolHash (info, byte ketiga file protokol): \`${f.protocolHash}\`; penjaga baseline = hash per prompt`);
    for (const [id, h] of Object.entries(f.promptHashes)) {
      const b = f.promptBaselines?.[id];
      L.push(`- hash prompt ${id}: \`${h}\` (${b ? `baseline \`${b.source}\` ${b.date}: ${b.promptHash === h ? 'sama' : `**beda** \`${b.promptHash}\``}` : '**baseline belum diukur**'})`);
    }
  } else L.push(`- protocolHash: \`${f.protocolHash}\` (baseline: \`${f.baselineProtocolHash}\`, ${f.protocolHash === f.baselineProtocolHash ? 'sama' : '**beda**'})`);
  L.push(`- Model agen dan juri: \`${f.model}\`; Claude Code: ${f.claude}`);
  if (f.baseline) L.push(`- Baseline pen.dev (\`bench/baseline-pendev.json\`): model \`${f.baseline.model}\`, Claude Code ${f.baseline.claude}, pen.dev desktop ${f.baseline.pendevDesktop ?? '–'}`);
  if (f.baselinesByPrompt)
    for (const [id, b] of Object.entries(f.baselinesByPrompt))
      L.push(`- Baseline pen.dev ${id}${f.promptBaselines?.[id] ? ` (\`${f.promptBaselines[id]!.source}\`)` : ''}: ${b ? `model \`${b.model ?? '–'}\`, Claude Code ${b.claude ?? '–'}, pen.dev desktop ${b.pendevDesktop ?? '–'}` : 'belum diukur'}`);
  L.push(`- lakard: version ${f.lakard.version ?? '–'}, schemaVersion ${f.lakard.schemaVersion ?? '–'}, pid ${f.lakard.pid ?? '–'}, startedAt ${f.lakard.startedAt ?? '–'}, Chromium ${f.lakard.browser ?? '–'}${f.lakard.node ? `, Node ${f.lakard.node}` : ''}`);
  if (f.playwright) L.push(`- playwright-core: ${f.playwright}`);
  if (f.fonts) L.push(`- Font (/status): ${f.fonts.families.join(', ') || '–'}; missing: ${f.fonts.missing.length ? f.fonts.missing.join(', ') : '[]'}; paket: ${Object.entries(f.fonts.packages).map(([k, v]) => `${k} ${v}`).join(', ') || '–'}`);
  if (f.photos) {
    const pr = f.photos.probe;
    L.push(`- Foto: penyedia ${f.photos.provider}, key ${f.photos.keyFile}, probe ${pr ? `\`${pr.query}\` → ${pr.provider}, ${pr.results} hasil, ${pr.ms} ms, fallbackReason ${pr.fallbackReason ?? '–'}` : 'tidak dijalankan'}`);
  }
  L.push(`- Ikon (/status): ${Object.entries(f.icons).map(([k, v]) => `${k} ${v}`).join(', ') || '–'}`);
  for (const [k, v] of Object.entries(f.skills)) L.push(`- skill \`${k}\` sha256 \`${v}\``);
  L.push(`- \`G0_RULES\`: \`${f.g0Rules}\``);
  L.push(`- sha256 \`packages/check/dist\`: \`${f.checkDist}\``);
  // `packages/check/dist` sudah dicetak di atas (`checkDist`); jangan diulang.
  if (f.distSha) for (const [k, v] of Object.entries(f.distSha)) if (k !== 'check') L.push(`- sha256 \`packages/${k}/dist\`: \`${v}\``);
  L.push(`- pen.dev desktop: ${f.pendevDesktop ?? '–'}; MCP server: ${f.pendevMcp ?? '–'}`);
  L.push(`- Juri: model \`${f.judge.model}\`; argv \`${f.judge.argv}\``);
  for (const x of judgeInfoLines(r.judge)) L.push(`- ${x}`);
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
  if (r.penDesktopRestart !== undefined) {
    const x = r.penDesktopRestart;
    L.push(typeof x === 'string' ? `- Restart pen-desktop: tidak dijalankan (${cell(x)}).` : `- Restart pen-desktop sesudah run pen.dev terakhir: **${x.ok ? 'berhasil' : 'GAGAL'}**, durasi ${sec(x.ms)} dtk (${cell(x.detail)}).`);
  }
  L.push('');
  if (r.notes.length) {
    L.push('## Catatan', '');
    for (const n of r.notes) L.push(`- ${n}`);
    L.push('');
  }
  return L.join('\n');
}

/** Ringkasan R3/R7 satu prompt (G1). */
export function technicalText(t: TechnicalScores | null | undefined): string {
  if (t === undefined) return '–';
  if (t === null) return 'tidak terukur (temuan layout_check tidak ada) → gerbang gagal';
  const r3 = R3_RULES.map((x) => `${x} ${t.r3Counts[x]}`).join(', ');
  return `R3 = ${t.R3} (${r3}), R7 = ${t.R7} (${t.nonGateErrors} error non-gerbang, ${t.structuralWarnings} warning struktural)${t.flags.length ? ` **${t.flags.join('; ')}**` : ''}`;
}

function renderG1Section(L: string[], r: RoundReport, g1: NonNullable<RoundReport['g1']>): void {
  L.push(`## Keputusan G1 (sementara, ${AWAITING_ADAM})`, '');
  L.push(`Keputusan G1: **${g1.decision}** (${PROVISIONAL}). Alasan: ${g1.why}.`, '');
  L.push('| Prompt | Keputusan | Alasan | Rasio waktu (Lakar/baseline) | Emoji Lakar (a) / (b) / (c) | R3 / R7 | Baseline pen.dev (dtk, biaya, sumber) |');
  L.push('|---|---|---|---|---|---|---|');
  for (const p of r.results) {
    const lk = p.runs.lakar;
    const emoji = [lk?.agentEmoji?.emoji, lk?.lintEmoji ? lk.lintEmoji.lc01a + lk.lintEmoji.lc01b : undefined, p.score?.tools.lakar.emoji.median].map(num).join(' / ');
    const t = p.technical;
    const tech = t ? `${t.R3} / ${t.R7}${t.flags.length ? ` (${ADAM_FALSE_POSITIVE_FLAG})` : ''}` : t === null ? 'tidak terukur' : '–';
    L.push(
      `| ${p.prompt} | ${p.decision.decision} | ${cell(p.decision.why)} | ${p.gate?.timeRatio === undefined ? '–' : p.gate.timeRatio.toFixed(2)} | ${emoji} | ${tech} | ${sec(p.baselineMedianMs)}, ${usd(p.baselineCostUsd)}, ${p.baselineSource ? `\`${p.baselineSource}\`` : 'belum diukur'} |`,
    );
  }
  L.push('');
  L.push(
    `Aturan (Lampiran B): putaran dibatalkan → tidak dapat diputuskan; lolos bila ≥ ${G1_MIN_PASS} dari ${G1_PROMPTS.length} prompt (${G1_PROMPTS.join(', ')}) Setara/Lebih baik, ≥ ${G1_MIN_BETTER} Lebih baik, emoji Lakar (a)/(b)/(c) = 0 dan rasio waktu ≤ ${TIME_GATE_FACTOR} di semua prompt; gagal bila ada emoji > 0, rasio > ${TIME_GATE_FACTOR}, atau jumlah itu tidak bisa tercapai lagi; selebihnya (prompt hilang/tidak dapat dinilai yang masih bisa mengubah hasil, waktu/emoji tidak terukur) → tidak dapat diputuskan. Biaya hanya dilaporkan (C8).`,
    '',
  );
  L.push(
    `- Gerbang Lakar G1 menambah R3/R7 mekanis: R3 = 2 bila ${R3_RULES.join(', ')} semuanya 0, 1 bila totalnya ≤ ${R3_ONE_MAX}, 0 bila lebih; R7 = 2 bila 0 error non-gerbang dan ≤ ${R7_TWO_MAX_WARNINGS} warning struktural (${R7_STRUCTURAL_RULES.join('/')}), 1 bila ≤ ${R7_ONE_MAX_ERRORS} error non-gerbang (ditandai "${ADAM_FALSE_POSITIVE_FLAG}") dan ≤ ${R7_ONE_MAX_WARNINGS} warning struktural, 0 selebihnya. R3 = 0 atau R7 = 0 → gerbang gagal (Kalah).`,
  );
  L.push(`- ${G1_LINE}`, '');
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
  for (const t of TOOLS) L.push(`| **Daya tarik (R9 + R10)** | ${TOOL_LABEL[t]} | ${reps.map(() => '').join(' | ')} | **${num(appealAxis(s.tools[t]))}** | | |`);
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
