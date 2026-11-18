// Bentuk temuan check G0 (AD-8) bersama: check, daemon, mcp, dan bench memakainya. Tanpa IO.

export type FindingLevel = 'error' | 'warning';

/** Aturan G0. `gate: true` = dihitung di gerbang ("0 error gerbang"). */
export const G0_RULES = {
  'LC-01a': { level: 'error', gate: true, title: 'emoji di teks' },
  'LC-01b': { level: 'error', gate: true, title: 'glyph Unicode sebagai ikon' },
  'LC-02a': { level: 'error', gate: true, title: 'node terpotong clip' },
  'LC-02b': { level: 'error', gate: true, title: 'teks meluap dari induknya' },
  'LC-04': { level: 'error', gate: true, title: 'kontras teks kurang' },
  'LC-05': { level: 'error', gate: true, title: 'teks lebih kecil dari 12px' },
  'LC-11': { level: 'error', gate: true, title: 'saudara tumpang tindih sebagian' },
  'LC-12': { level: 'warning', gate: false, title: 'ukuran atau posisi board' },
  'LC-18': { level: 'warning', gate: false, title: 'kartu bersarang' },
  'LC-20': { level: 'error', gate: true, title: 'konten tertutup bar bawah' },
  'LC-23': { level: 'warning', gate: false, title: 'celah teks ke badge, tombol, atau ikon kurang dari 8' },
  'LC-24': { level: 'warning', gate: false, title: 'proporsi badge di baris' },
  'LC-25': { level: 'warning', gate: false, title: 'radius tidak konsentris' },
  'LC-26': { level: 'warning', gate: false, title: 'ritme judul: ruang di atas tidak lebih besar' },
  'LC-27': { level: 'warning', gate: false, title: 'terlalu banyak ukuran huruf' },
  'LC-28': { level: 'warning', gate: false, title: 'baris teks terlalu panjang' },
  'LC-29': { level: 'warning', gate: false, title: 'bobot tipis pada teks kecil' },
  'LC-30': { level: 'warning', gate: false, title: 'tanda baca' },
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

/** Ringkasan: `gate` = jumlah temuan error dari aturan ber-gate (temuan warning aturan ber-gate, mis. kontras di atas gradien, tidak dihitung). */
export type FindingSummary = { error: number; warning: number; gate: number };

export function isGateRule(rule: string): boolean {
  return (G0_RULES as Record<string, { gate: boolean }>)[rule]?.gate === true;
}

export function summarizeFindings(findings: readonly Pick<Finding, 'level' | 'rule'>[]): FindingSummary {
  const s: FindingSummary = { error: 0, warning: 0, gate: 0 };
  for (const f of findings) {
    if (f.level === 'error') s.error++;
    else s.warning++;
    if (f.level === 'error' && isGateRule(f.rule)) s.gate++;
  }
  return s;
}

/** Satu baris ringkas: `<level>[·gerbang] · <rule> · <nodeName> (<nodeId>) · <detail> · <expected>`. */
export function findingLine(f: Finding): string {
  const level = f.level === 'error' && isGateRule(f.rule) ? `${f.level}·gerbang` : f.level;
  return `${level} · ${f.rule} · ${f.nodeName} (${f.nodeId}) · ${f.detail} · ${f.expected}`;
}

/** Ringkasan sebagai teks: `2 error (2 gerbang), 1 warning`. */
export function summaryText(s: FindingSummary): string {
  return `${s.error} error (${s.gate} gerbang), ${s.warning} warning`;
}
