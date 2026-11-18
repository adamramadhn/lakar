// Metrik dari transkrip `claude -p --output-format stream-json` yang setiap barisnya diberi cap waktu saat tiba.
// Fungsi murni: tidak tahu apa pun tentang alat yang diuji. Waktu gerbang = AD-13 (wall_ms).

/** Satu baris stdout: `t` = ms monotonic sejak spawn (performance.now()), `line` = teks tanpa `\n`. */
export type TimedLine = { t: number; line: string };

export type InitInfo = {
  model: string | undefined;
  claudeCodeVersion: string | undefined;
  cwd: string | undefined;
  mcpServers: { name: string; status: string }[];
  tools: string[];
};

export type RunStatus = 'success' | 'failed' | 'invalid';

export type RunMetrics = {
  status: RunStatus;
  reason: string | undefined;
  /** AD-13: t(baris result) − t(event pertama). Waktu gerbang. */
  wallMs: number | undefined;
  /** Diagnostik: spawn → event pertama. */
  spawnToFirstEventMs: number | undefined;
  /** Diagnostik (golden-set §Prosedur 3): offset relatif event pertama. */
  firstToolUseMs: number | undefined;
  lastToolResultMs: number | undefined;
  toolSpanMs: number | undefined;
  toolCalls: number;
  toolNames: string[];
  totalCostUsd: number | undefined;
  durationMs: number | undefined;
  durationApiMs: number | undefined;
  numTurns: number | undefined;
  isError: boolean | undefined;
  subtype: string | undefined;
  modelUsageKeys: string[];
  init: InitInfo | undefined;
  initProblems: string[];
  events: number;
  nonJsonLines: number;
};

export type InitRules = {
  /** Satu-satunya server MCP yang boleh ada (status `connected`). `null` = tanpa server MCP dan tanpa tool (juri). */
  server: string | null;
  /** Tool wajib di init (mis. `mcp__pencil__execute`). */
  requiredTools: string[];
  /** cwd tidak boleh berada di bawah path ini. */
  forbiddenCwdRoot: string;
};

export function parseInit(ev: any): InitInfo {
  return {
    model: ev.model,
    claudeCodeVersion: ev.claude_code_version,
    cwd: ev.cwd,
    mcpServers: Array.isArray(ev.mcp_servers) ? ev.mcp_servers.map((s: any) => ({ name: String(s?.name), status: String(s?.status) })) : [],
    tools: Array.isArray(ev.tools) ? ev.tools.map(String) : [],
  };
}

/** Masalah pada event init; kosong = valid. */
export function validateInit(init: InitInfo | undefined, rules: InitRules): string[] {
  if (!init) return ['event system/init tidak ada'];
  const out: string[] = [];
  const s = init.mcpServers;
  if (rules.server === null) {
    if (s.length) out.push(`mcp_servers harus [], dapat [${s.map((x) => `${x.name} ${x.status}`).join(', ')}]`);
    if (init.tools.length) out.push(`tools harus [], dapat [${init.tools.join(', ')}]`);
  } else {
    if (s.length !== 1 || s[0]!.name !== rules.server || s[0]!.status !== 'connected') {
      out.push(`mcp_servers harus tepat [${rules.server} connected], dapat [${s.map((x) => `${x.name} ${x.status}`).join(', ')}]`);
    }
    const prefix = `mcp__${rules.server}__`;
    const foreign = init.tools.filter((t) => !t.startsWith(prefix));
    if (foreign.length) out.push(`tool di luar ${prefix}*: ${foreign.join(', ')}`);
  }
  for (const t of rules.requiredTools) if (!init.tools.includes(t)) out.push(`tool wajib tidak ada di init: ${t}`);
  const root = rules.forbiddenCwdRoot.replace(/\/+$/, '');
  if (!init.cwd) out.push('cwd tidak ada di init');
  else if (init.cwd === root || init.cwd.startsWith(`${root}/`)) out.push(`cwd ${init.cwd} berada di bawah ${root}`);
  return out;
}

export type ProcessOutcome = { exitCode: number | null; timedOut: boolean };

export function computeMetrics(lines: readonly TimedLine[], rules: InitRules, proc: ProcessOutcome = { exitCode: 0, timedOut: false }): RunMetrics {
  let first: number | undefined;
  let nonJson = 0;
  let events = 0;
  let init: InitInfo | undefined;
  let result: any;
  let resultT: number | undefined;
  let firstToolUse: number | undefined;
  let lastToolResult: number | undefined;
  const toolNames: string[] = [];
  for (const { t, line } of lines) {
    if (!line.trim()) continue;
    let ev: any;
    try {
      ev = JSON.parse(line);
    } catch {
      nonJson++;
      continue;
    }
    if (ev === null || typeof ev !== 'object') {
      nonJson++;
      continue;
    }
    events++;
    first ??= t;
    if (ev.type === 'system' && ev.subtype === 'init' && !init) init = parseInit(ev);
    const content = ev.message?.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (ev.type === 'assistant' && c?.type === 'tool_use') {
          toolNames.push(String(c.name));
          firstToolUse ??= t;
        }
        if (ev.type === 'user' && c?.type === 'tool_result') lastToolResult = t;
      }
    }
    if (ev.type === 'result') {
      result = ev;
      resultT = t;
    }
  }
  const rel = (x: number | undefined) => (x === undefined || first === undefined ? undefined : x - first);
  const initProblems = validateInit(init, rules);
  let status: RunStatus = 'success';
  let reason: string | undefined;
  if (initProblems.length) {
    status = 'invalid';
    reason = init ? `init_invalid: ${initProblems.join('; ')}` : 'no_init';
  } else if (proc.timedOut) {
    status = 'failed';
    reason = 'timeout';
  } else if (!result) {
    status = 'failed';
    reason = 'no_result';
  } else if (result.is_error) {
    status = 'failed';
    reason = `is_error (${result.subtype})`;
  } else if (result.subtype !== 'success') {
    status = 'failed';
    reason = `subtype ${result.subtype}`;
  } else if (proc.exitCode !== 0) {
    status = 'failed';
    reason = `exit ${proc.exitCode}`;
  }
  const ftu = rel(firstToolUse);
  const ltr = rel(lastToolResult);
  return {
    status,
    reason,
    wallMs: rel(resultT),
    spawnToFirstEventMs: first,
    firstToolUseMs: ftu,
    lastToolResultMs: ltr,
    toolSpanMs: ftu !== undefined && ltr !== undefined ? ltr - ftu : undefined,
    toolCalls: toolNames.length,
    toolNames,
    totalCostUsd: result?.total_cost_usd,
    durationMs: result?.duration_ms,
    durationApiMs: result?.duration_api_ms,
    numTurns: result?.num_turns,
    isError: result?.is_error,
    subtype: result?.subtype,
    modelUsageKeys: result?.modelUsage && typeof result.modelUsage === 'object' ? Object.keys(result.modelUsage) : [],
    init,
    initProblems,
    events,
    nonJsonLines: nonJson,
  };
}
