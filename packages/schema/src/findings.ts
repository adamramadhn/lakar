// Bentuk temuan check G0 (AD-8) bersama: check, daemon, mcp, dan bench memakainya. Tanpa IO.

export type FindingLevel = 'error' | 'warning';

/** Aturan G0. `gate: true` = dihitung di gerbang ("0 error gerbang"). */
export const G0_RULES = {
  'LC-01a': { level: 'error', gate: true, title: 'emoji di teks' },
  'LC-01b': { level: 'error', gate: true, title: 'glyph Unicode sebagai ikon' },
  'LC-02a': { level: 'error', gate: true, title: 'node terpotong clip' },
  'LC-05': { level: 'error', gate: true, title: 'teks lebih kecil dari 12px' },
  'LC-12': { level: 'warning', gate: false, title: 'ukuran atau posisi board' },
  'LC-20': { level: 'error', gate: true, title: 'konten tertutup bar bawah' },
} as const satisfies Record<string, { level: FindingLevel; gate: boolean; title: string }>;

export type G0RuleId = keyof typeof G0_RULES;
export const G0_RULE_IDS = Object.keys(G0_RULES) as G0RuleId[];

/** Satu temuan check (AD-8). `detail` = yang terukur, `expected` = yang seharusnya / cara memperbaiki. */
export type Finding = {
  level: FindingLevel;
  rule: G0RuleId;
  nodeId: string;
  nodeName: string;
  detail: string;
  expected: string;
};

/** Ringkasan: `gate` = jumlah temuan dari aturan ber-gate. */
export type FindingSummary = { error: number; warning: number; gate: number };

export function isGateRule(rule: string): boolean {
  return (G0_RULES as Record<string, { gate: boolean }>)[rule]?.gate === true;
}

export function summarizeFindings(findings: readonly Pick<Finding, 'level' | 'rule'>[]): FindingSummary {
  const s: FindingSummary = { error: 0, warning: 0, gate: 0 };
  for (const f of findings) {
    if (f.level === 'error') s.error++;
    else s.warning++;
    if (isGateRule(f.rule)) s.gate++;
  }
  return s;
}

/** Satu baris ringkas: `<level>[·gerbang] · <rule> · <nodeName> (<nodeId>) · <detail> · <expected>`. */
export function findingLine(f: Finding): string {
  const level = isGateRule(f.rule) ? `${f.level}·gerbang` : f.level;
  return `${level} · ${f.rule} · ${f.nodeName} (${f.nodeId}) · ${f.detail} · ${f.expected}`;
}

/** Ringkasan sebagai teks: `2 error (2 gerbang), 1 warning`. */
export function summaryText(s: FindingSummary): string {
  return `${s.error} error (${s.gate} gerbang), ${s.warning} warning`;
}
