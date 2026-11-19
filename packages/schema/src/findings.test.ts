import { describe, expect, it } from 'vitest';
import { G0_RULES, G0_RULE_IDS, findingLine, summarizeFindings, summaryText, type Finding } from './index.js';

const f = (rule: Finding['rule'], level: Finding['level']): Finding => ({ level, rule, nodeId: 'Ab12Cd34', nodeName: 'Caption', detail: 'size 11px', expected: '≥ 12' });

describe('temuan G0 (AD-8)', () => {
  it('aturan G0: error ber-gerbang dan warning tanpa gerbang', () => {
    expect(G0_RULE_IDS).toEqual([
      'LC-01a', 'LC-01b', 'LC-02a', 'LC-02b', 'LC-04', 'LC-05', 'LC-11', 'LC-12', 'LC-18', 'LC-20',
      'LC-23', 'LC-24', 'LC-25', 'LC-26', 'LC-27', 'LC-28', 'LC-29', 'LC-30', 'LC-31',
    ]);
    for (const id of G0_RULE_IDS) expect(G0_RULES[id].gate, id).toBe(G0_RULES[id].level === 'error');
    const warnings = G0_RULE_IDS.filter((id) => G0_RULES[id].level === 'warning');
    expect(warnings).toEqual(['LC-12', 'LC-18', 'LC-23', 'LC-24', 'LC-25', 'LC-26', 'LC-27', 'LC-28', 'LC-29', 'LC-30']);
  });

  it('temuan warning dari aturan ber-gerbang (kontras perkiraan) tidak dihitung gerbang', () => {
    const w = f('LC-04', 'warning');
    expect(summarizeFindings([w, f('LC-04', 'error')])).toEqual({ error: 1, warning: 1, gate: 1 });
    expect(findingLine(w).startsWith('warning · LC-04')).toBe(true);
  });

  it('ringkasan dan baris', () => {
    const list = [f('LC-05', 'error'), f('LC-01a', 'error'), f('LC-12', 'warning')];
    const s = summarizeFindings(list);
    expect(s).toEqual({ error: 2, warning: 1, gate: 2 });
    expect(summaryText(s)).toBe('2 error (2 gerbang), 1 warning');
    expect(findingLine(list[0]!)).toBe('error·gerbang · LC-05 · Caption (Ab12Cd34) · size 11px · ≥ 12');
    expect(findingLine({ ...list[2]!, nodeName: 'Home · mobile', detail: 'ukuran 390×800', expected: '390×844' })).toBe(
      'warning · LC-12 · Home · mobile (Ab12Cd34) · ukuran 390×800 · 390×844',
    );
  });
});
