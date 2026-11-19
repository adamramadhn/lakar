// Bentuk temuan check (AD-8) bersama: check, daemon, mcp, dan bench memakainya. Tanpa IO.

/** `info` hanya muncul di `layout_check` (execute memuat error dan warning). */
export type FindingLevel = 'error' | 'warning' | 'info';

/**
 * Aturan yang berjalan (nama `G0_RULES` dibekukan bench; G1 menambah aturan). `gate: true` = dihitung di gerbang
 * ("0 error gerbang"). LC-16 = error bukan gerbang.
 */
export const G0_RULES = {
  'LC-01a': { level: 'error', gate: true, title: 'emoji di teks' },
  'LC-01b': { level: 'error', gate: true, title: 'glyph Unicode sebagai ikon' },
  'LC-02a': { level: 'error', gate: true, title: 'node terpotong clip' },
  'LC-02b': { level: 'error', gate: true, title: 'teks meluap dari induknya' },
  'LC-02c': { level: 'error', gate: true, title: 'non-teks meluap dari isi wadah' },
  'LC-04': { level: 'error', gate: true, title: 'kontras teks kurang' },
  'LC-05': { level: 'error', gate: true, title: 'teks lebih kecil dari 12px' },
  'LC-11': { level: 'error', gate: true, title: 'saudara tumpang tindih sebagian' },
  'LC-12': { level: 'warning', gate: false, title: 'ukuran atau posisi board' },
  'LC-13': { level: 'info', gate: false, title: 'nama layer default' },
  'LC-14': { level: 'warning', gate: false, title: 'absolut di dalam flex tanpa Overlay /' },
  'LC-15': { level: 'warning', gate: false, title: 'lebih dari 1 pustaka ikon UI' },
  'LC-16': { level: 'error', gate: false, title: 'ikon digambar manual' },
  'LC-18': { level: 'warning', gate: false, title: 'kartu bersarang' },
  'LC-20': { level: 'error', gate: true, title: 'konten tertutup bar bawah' },
  'LC-21': { level: 'warning', gate: false, title: 'struktur: radius, spacer, padding ganda, teks di baris tabel, bidang efek' },
  'LC-22': { level: 'info', gate: false, title: 'jumlah node berkonvensi' },
  'LC-23': { level: 'warning', gate: false, title: 'celah teks ke badge, tombol, atau ikon kurang dari 8' },
  'LC-24': { level: 'warning', gate: false, title: 'proporsi badge di baris' },
  'LC-25': { level: 'warning', gate: false, title: 'radius tidak konsentris' },
  'LC-26': { level: 'warning', gate: false, title: 'ritme judul: ruang di atas tidak lebih besar' },
  'LC-27': { level: 'warning', gate: false, title: 'terlalu banyak ukuran huruf' },
  'LC-28': { level: 'warning', gate: false, title: 'baris teks terlalu panjang' },
  'LC-29': { level: 'warning', gate: false, title: 'bobot tipis pada teks kecil' },
  'LC-30': { level: 'warning', gate: false, title: 'tanda baca' },
  'LC-31': { level: 'error', gate: true, title: 'konten terpotong rata di tepi bawah' },
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

/**
 * Ringkasan: `gate` = jumlah temuan error dari aturan ber-gate (temuan warning aturan ber-gate, mis. kontras di atas
 * gradien, dan error aturan tanpa gerbang, mis. LC-16, tidak dihitung). `info` = temuan info (0 di execute).
 */
export type FindingSummary = { error: number; warning: number; gate: number; info: number };

export function isGateRule(rule: string): boolean {
  return (G0_RULES as Record<string, { gate: boolean }>)[rule]?.gate === true;
}

export function summarizeFindings(findings: readonly Pick<Finding, 'level' | 'rule'>[]): FindingSummary {
  const s: FindingSummary = { error: 0, warning: 0, gate: 0, info: 0 };
  for (const f of findings) {
    if (f.level === 'error') s.error++;
    else if (f.level === 'info') s.info++;
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

/** Ringkasan sebagai teks: `2 error (2 gerbang), 1 warning` (+ `, n info` bila > 0). */
export function summaryText(s: FindingSummary): string {
  return `${s.error} error (${s.gate} gerbang), ${s.warning} warning${s.info > 0 ? `, ${s.info} info` : ''}`;
}
