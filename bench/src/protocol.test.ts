import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BENCH_ROOT,
  C7_CRITERIA_IDS,
  GOLDEN_SET_PATH,
  LEGACY_G0_DIR,
  PROMPT_IDS,
  checkC7,
  checkProtocolC7,
  extractGoldenPrompt,
  loadProtocol,
  promptHash,
  promptHashes,
  protocolHash,
  renderPrompt,
  renderWith,
} from './protocol.js';

const protocol = loadProtocol();
const hasGolden = existsSync(GOLDEN_SET_PATH);
if (!hasGolden) console.warn(`checkC7 di-skip: ${GOLDEN_SET_PATH} tidak ada (dikecualikan dari git)`);
const golden = hasGolden ? readFileSync(GOLDEN_SET_PATH, 'utf8') : '';

const G0_HASH = '907cb36f4674d422feded4506851b6391082b40b918dd46841edae607bedb85d';
const baselineG0 = JSON.parse(readFileSync(join(BENCH_ROOT, 'baseline-pendev.json'), 'utf8'));
const legacy = loadProtocol(LEGACY_G0_DIR);

describe('protokol', () => {
  it('memuat pembungkus, prompt A–E, dan konfigurasi', () => {
    expect(protocol.config.model).toBe('claude-opus-5-5');
    expect(protocol.config.promptIds).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect([...PROMPT_IDS]).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect([...C7_CRITERIA_IDS]).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(protocol.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(protocolHash()).toBe(protocol.hash);
  });

  it('protocol.json hanya berubah di promptIds; prompt A/B dan pembungkus = protokol G0', () => {
    const { promptIds: _a, ...now } = protocol.config;
    const { promptIds: _b, ...old } = legacy.config;
    expect(now).toEqual(old);
    expect(protocol.wrapper).toBe(legacy.wrapper);
    expect(readFileSync(join(LEGACY_G0_DIR, 'wrapper.txt'))).toEqual(readFileSync(join(protocol.dir, 'wrapper.txt')));
    expect(protocol.prompts.A).toBe(legacy.prompts.A);
    expect(protocol.prompts.B).toBe(legacy.prompts.B);
  });
});

describe('migrasi baseline G0 ke hash per prompt', () => {
  it('snapshot legacy = protokol beku baseline G0 (907cb36f…)', () => {
    expect(legacy.config.promptIds).toEqual(['A', 'B']);
    expect(protocolHash(LEGACY_G0_DIR)).toBe(G0_HASH);
    expect(baselineG0.protocolHash).toBe(G0_HASH);
    expect(legacy.wrapper).toBe(baselineG0.wrapper);
    expect(legacy.prompts).toEqual(baselineG0.prompts);
  });

  it('hash per prompt A/B dari legacy = dari protokol baru = promptHashes yang dicatat migrasi', () => {
    const fromLegacy = promptHashes(legacy);
    expect(Object.keys(fromLegacy)).toEqual(['A', 'B']);
    expect(promptHashes(protocol, ['A', 'B'])).toEqual(fromLegacy);
    expect(baselineG0.promptHashes).toEqual(fromLegacy);
    expect(baselineG0.promptHashMigration).toEqual({ fromProtocolHash: G0_HASH, legacyDir: 'bench/protocol/legacy/907cb36f', date: '2026-11-19' });
  });

  it('sensitivitas: prompt C bergeser 1 char → hanya hash C; pembungkus/config → semua hash', () => {
    const base = promptHashes(protocol);
    expect(new Set(Object.values(base)).size).toBe(5);
    const shiftC = { ...protocol, prompts: { ...protocol.prompts, C: `${protocol.prompts.C}.` } };
    const c = promptHashes(shiftC);
    expect(Object.keys(base).filter((id) => c[id] !== base[id])).toEqual(['C']);
    const w = promptHashes({ ...protocol, wrapper: `${protocol.wrapper} ` });
    expect(Object.keys(base).filter((id) => w[id] !== base[id])).toEqual(['A', 'B', 'C', 'D', 'E']);
    const cfg = promptHashes({ ...protocol, config: { ...protocol.config, timeoutMs: protocol.config.timeoutMs + 1 } });
    expect(Object.keys(base).filter((id) => cfg[id] !== base[id])).toEqual(['A', 'B', 'C', 'D', 'E']);
    // promptIds tidak ikut hash: menambah/mengurangi prompt lain tidak mengubah hash A.
    expect(promptHash({ ...protocol, config: { ...protocol.config, promptIds: ['A'] } }, 'A')).toBe(base.A);
    // Urutan kunci config tidak berpengaruh (JSON kanonik).
    const reordered = Object.fromEntries(Object.entries(protocol.config).reverse()) as typeof protocol.config;
    expect(promptHash({ ...protocol, config: reordered }, 'A')).toBe(base.A);
    expect(() => promptHash(legacy, 'C')).toThrow(/prompt C tidak ada/);
  });

  it('render menyisipkan prompt di placeholder', () => {
    const r = renderPrompt('A', protocol);
    expect(r).toContain(protocol.prompts.A);
    expect(r).not.toContain('{{PROMPT}}');
    expect(renderWith('x {{PROMPT}} y\n', 'P')).toBe('x P y');
  });

  it('pembungkus netral: tidak menyebut alat, simpan, atau ekspor', () => {
    expect(protocol.wrapper).not.toMatch(/pen\.dev|pencil|lakar|simpan|save|ekspor|export/i);
  });
});

describe.skipIf(!hasGolden)('checkC7 (golden-set.md)', () => {
  it('prompts.json identik dengan blockquote golden-set (A–E)', () => {
    for (const id of PROMPT_IDS) expect(extractGoldenPrompt(golden, id), id).toBe(protocol.prompts[id]);
  });

  it('gagal (b) bila pembungkus memuat frasa Kriteria target C–E', () => {
    for (const leak of ['Sidebar 248 dengan 6–8 item ikon, satu aktif.', 'Label di atas, field 48, satu field error.', 'Kedalaman dari lapisan surface tanpa bayangan.']) {
      const r = checkC7(renderWith(`${protocol.wrapper}\n${leak}`, protocol.prompts.A), golden, { A: protocol.prompts.A });
      expect(r.ok, leak).toBe(false);
      expect(r.problems.join('\n')).toContain('(b)');
    }
  });

  it('lulus pada protokol nyata', () => {
    expect(checkProtocolC7(protocol, golden)).toEqual({ ok: true, problems: [] });
  });

  it('gagal (b) bila pembungkus memuat frasa kriteria, dan menyebut frasanya', () => {
    const wrapper = `${protocol.wrapper}\nTujuh bagian hadir sesuai urutan.`;
    const r = checkC7(renderWith(wrapper, protocol.prompts.A), golden, { A: protocol.prompts.A });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/\(b\).*tujuh bagian hadir sesuai urutan/);
  });

  it('gagal (b) pada n-gram 6 kata dari §Prosedur', () => {
    const r = checkC7(`${renderPrompt('B', protocol)} Satu putaran = kelima prompt. Tidak ada pengulangan`, golden, { B: protocol.prompts.B });
    expect(r.ok).toBe(false);
  });

  it('gagal (c) pada tag atau kata terlarang', () => {
    for (const leak of ['[R6]', '[G]', 'layout_check', 'rubrik', 'juri', 'kriteria', 'golden', 'DESIGN.md']) {
      const r = checkC7(renderWith(`${protocol.wrapper} ${leak}`, protocol.prompts.A), golden, { A: protocol.prompts.A });
      expect(r.ok, leak).toBe(false);
      expect(r.problems.join('\n')).toContain('(c)');
    }
  });

  it('gagal (b) bila golden-set tanpa Kriteria/§Prosedur/§Risiko (tidak lulus kosong)', () => {
    const onlyPrompts = ['## A — x', '', '**Prompt:**', `> ${protocol.prompts.A}`, ''].join('\n');
    const r = checkC7(renderPrompt('A', protocol), onlyPrompts, { A: protocol.prompts.A });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/\(b\) sumber terlarang/);
  });

  it('gagal (a) bila tidak ada prompt yang diberikan', () => {
    const r = checkC7(renderPrompt('A', protocol), golden, {});
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/\(a\) tidak ada prompt/);
  });

  it('gagal (a) bila prompt bergeser 1 karakter', () => {
    const shifted = protocol.prompts.A.replace('Kasku', 'Kaskû');
    const r = checkC7(renderWith(protocol.wrapper, shifted), golden, { A: shifted });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/\(a\) prompt A/);
  });
});
