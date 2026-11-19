import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { GOLDEN_SET_PATH, checkC7, checkProtocolC7, extractGoldenPrompt, loadProtocol, protocolHash, renderPrompt, renderWith } from './protocol.js';

const protocol = loadProtocol();
const hasGolden = existsSync(GOLDEN_SET_PATH);
if (!hasGolden) console.warn(`checkC7 di-skip: ${GOLDEN_SET_PATH} tidak ada (dikecualikan dari git)`);
const golden = hasGolden ? readFileSync(GOLDEN_SET_PATH, 'utf8') : '';

describe('protokol', () => {
  it('memuat pembungkus, prompt A/B, dan konfigurasi', () => {
    expect(protocol.config.model).toBe('claude-opus-5-5');
    expect(protocol.config.promptIds).toEqual(['A', 'B']);
    expect(protocol.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(protocolHash()).toBe(protocol.hash);
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
  it('prompts.json identik dengan blockquote golden-set', () => {
    expect(extractGoldenPrompt(golden, 'A')).toBe(protocol.prompts.A);
    expect(extractGoldenPrompt(golden, 'B')).toBe(protocol.prompts.B);
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
