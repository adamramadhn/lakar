// Penjaga C7 juri: rubrik dan kriteria hanya ada di teks juri (bench/runs/**, gitignored). Frasanya tidak boleh muncul
// di protokol agen, skill, server MCP, atau prompt agen hasil render; modul agen tidak mengimpor judge/*.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildJudgeText, DESIGN_MD_PATH, judgeC7Problems, judgeLeaks } from '../bench/src/judge/prompt.ts';
import { GOLDEN_SET_PATH, loadProtocol } from '../bench/src/protocol.ts';
import { c7Targets } from '../bench/src/round/main.ts';

const ROOT = join(import.meta.dirname, '..');
const BENCH_SRC = join(ROOT, 'bench/src');
const ALLOW_MISSING = process.env.LAKAR_C7_ALLOW_MISSING_SOURCES === '1';
const missing = [DESIGN_MD_PATH, GOLDEN_SET_PATH].filter((p) => !existsSync(p));
if (missing.length && ALLOW_MISSING) console.warn(`[judge-c7] LAKAR_C7_ALLOW_MISSING_SOURCES=1: sumber tidak ada, cek frasa dilewati: ${missing.join(', ')}`);

/** Modul agen: runner generik, adaptor Lakar, adaptor pen.dev (bukan tes). */
function agentModules(): string[] {
  const out = ['claude-runner.ts'];
  for (const d of ['lakar', 'pendev']) for (const f of readdirSync(join(BENCH_SRC, d))) if (f.endsWith('.ts') && !f.endsWith('.test.ts')) out.push(`${d}/${f}`);
  return out;
}

describe('C7 juri', () => {
  it('sumber teks juri ada (kecuali LAKAR_C7_ALLOW_MISSING_SOURCES=1)', () => {
    if (!ALLOW_MISSING) expect(missing).toEqual([]);
  });

  it.skipIf(missing.length > 0 && ALLOW_MISSING)('frasa rubrik/kriteria juri tidak ada di protokol, skill, server MCP, prompt agen', () => {
    const protocol = loadProtocol();
    const design = readFileSync(DESIGN_MD_PATH, 'utf8');
    const golden = readFileSync(GOLDEN_SET_PATH, 'utf8');
    const targets = c7Targets(protocol);
    expect(targets.map((t) => t.name)).toEqual(expect.arrayContaining(['bench/protocol/wrapper.txt', 'packages/skills/skills/core.md', 'packages/mcp/src/server.ts', 'prompt agen A (hasil render)']));
    for (const id of protocol.config.promptIds) {
      const t = buildJudgeText(design, golden, id, protocol.prompts[id]);
      expect(judgeLeaks(t.text)).toEqual([]);
      expect(judgeC7Problems(t.secret, targets)).toEqual([]);
    }
  });

  it.skipIf(missing.length > 0 && ALLOW_MISSING)('penjaga mendeteksi injeksi frasa kriteria ke skill', () => {
    const protocol = loadProtocol();
    const t = buildJudgeText(readFileSync(DESIGN_MD_PATH, 'utf8'), readFileSync(GOLDEN_SET_PATH, 'utf8'), 'A', protocol.prompts.A);
    const line = t.secret.split('\n').find((l) => l.startsWith('2. '))!;
    expect(judgeC7Problems(t.secret, [{ name: 'skill palsu', text: `Catatan: ${line}` }]).length).toBeGreaterThan(0);
  });

  it.each(agentModules())('modul agen %s tidak mengimpor judge/*', (f) => {
    const text = readFileSync(join(BENCH_SRC, f), 'utf8');
    expect(text.match(/from\s+['"][^'"]*judge\/[^'"]*['"]|import\(['"][^'"]*judge\//g) ?? []).toEqual([]);
  });
});
