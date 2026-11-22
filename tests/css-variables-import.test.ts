// Impor CSS variables ujung ke ujung tanpa daemon (epic token-tema story 2): parser asli @lakar/render disuntikkan ke
// `runSnippet` @lakar/exec seperti daemon, lalu commit core. Tes di `tests/` boleh mengimpor beberapa paket lewat path
// relatif (exec tidak bergantung pada render, AD-17).
import { describe, expect, it } from 'vitest';
import { beginTransaction, createDocument } from '../packages/core/src/index.ts';
import { runSnippet } from '../packages/exec/src/index.ts';
import { cssVarName } from '../packages/render/src/css.ts';
import { CSS_IMPORT_MODE_NAME, CSS_IMPORT_TOKEN_NAME, parseCssVariables } from '../packages/render/src/css-vars.ts';
import { MODE_NAME_PATTERN, TOKEN_NAME_PATTERN, TokenName, resolveDocument, type LakarDocument } from '../packages/schema/src/index.ts';
import type { IconCatalogPort } from '../packages/ports/src/index.ts';

const icons: IconCatalogPort = {
  versions: {},
  canonical: () => {
    throw new Error('tidak dipakai');
  },
  search: () => [],
  glyph: () => undefined,
};

const SAMPLE = `
:root {
  --colors-bg: #ffffff;
  --colors-text-primary: rgb(17 17 17);
  --colors-brand-primary: #f97316;
  --radius-md: 12px;
  --space-4: 1rem;
  --font-sans: "Inter", sans-serif;
  --text-lg: 1.25rem;
  --leading-7: 28px;
  --font-weight-semibold: 600;
  --tracking-tight: -0.02em;
  --shadow-card: 0 8px 24px #0003;
}
[data-theme="dark"] {
  --colors-bg: #0f0f0f;
  --colors-text-primary: #f5f5f5;
}`;

async function execute(doc: LakarDocument, code: string) {
  const tx = beginTransaction(doc, { sessionId: 's' });
  const r = await runSnippet(code, tx, { icons, cssVariables: { parse: parseCssVariables } });
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return { value: r.value as any, ...tx.commit('impor') };
}

describe('importCssVariables (parser asli)', () => {
  it('contoh file: tipe, nama, nilai mode, round trip cssVarName, board dark me-resolve nilai dark', async () => {
    const { value, doc } = await execute(createDocument(), `importCssVariables(${JSON.stringify(SAMPLE)})`);
    expect(doc.tokenModes).toEqual(['light', 'dark']);
    expect(doc.tokens).toEqual({
      'colors.bg': { type: 'color', value: '#FFFFFF', modes: { dark: '#0F0F0F' } },
      'colors.text.primary': { type: 'color', value: '#111111', modes: { dark: '#F5F5F5' } },
      'colors.brand.primary': { type: 'color', value: '#F97316' },
      'radius.md': { type: 'radius', value: 12 },
      'space.4': { type: 'spacing', value: 16 },
      'font.sans': { type: 'fontFamily', value: 'Inter' },
      'text.lg': { type: 'fontSize', value: 20 },
      'leading.7': { type: 'lineHeight', value: 28 },
      'font.weight.semibold': { type: 'fontWeight', value: 600 },
      'tracking.tight': { type: 'letterSpacing', value: -0.02 },
    });
    expect(value.skipped).toEqual([{ source: '--shadow-card', reason: 'unsupported-value', detail: expect.any(String) }]);
    for (const t of value.tokens) {
      expect(cssVarName(t.token)).toBe(t.variable);
      expect(TokenName.safeParse(t.token).success).toBe(true);
    }

    const used = await execute(
      doc,
      "const b = add(null, {type:'board', name:'Gelap', x:0, y:0, width:390, height:844, screen:'mobile', themeMode:'dark', fills:[{type:'solid', color:{$token:'colors.bg'}}]});" +
        "add(b, {type:'text', name:'Judul', content:'Halo', size:{$token:'text.lg'}, lineHeight:{$token:'leading.7'}, weight:{$token:'font.weight.semibold'}, letterSpacing:{$token:'tracking.tight'}, family:{$token:'font.sans'}, color:{$token:'colors.text.primary'}});",
    );
    const board = resolveDocument(used.doc).pages[0]!.children[0]!;
    expect(board.fills).toEqual([{ type: 'solid', color: '#0F0F0F' }]);
    expect(board.children[0]).toMatchObject({ size: 20, lineHeight: 28, weight: 600, letterSpacing: -0.02, family: 'Inter', color: '#F5F5F5' });
  });

  it('impor kedua: token yang sudah ada diperbarui (ref tetap), mode dan nilai mode lama dipertahankan', async () => {
    const first = await execute(createDocument(), `importCssVariables(${JSON.stringify(SAMPLE)})`);
    const withRef = await execute(first.doc, "const b = add(null, {type:'board', name:'B', x:0, y:0, width:390, height:844, screen:'mobile', fills:[{type:'solid', color:{$token:'colors.bg'}}]}); b");
    const { value, doc } = await execute(withRef.doc, `importCssVariables(':root { --colors-bg: #fafafa; } [data-theme="dim"] { --colors-bg: #333; }')`);
    expect(value.tokens).toEqual([{ variable: '--colors-bg', token: 'colors.bg', type: 'color', status: 'update' }]);
    expect(value.modes).toEqual(['light', 'dark', 'dim']);
    expect(doc.tokens!['colors.bg']).toEqual({ type: 'color', value: '#FAFAFA', modes: { dark: '#0F0F0F', dim: '#333333' } });
    expect(resolveDocument(doc).pages[0]!.children[0]!.fills).toEqual([{ type: 'solid', color: '#FAFAFA' }]);
  });

  it('pola nama/mode di render sama dengan schema', () => {
    expect(CSS_IMPORT_TOKEN_NAME.source).toBe(TOKEN_NAME_PATTERN.source);
    expect(CSS_IMPORT_MODE_NAME.source).toBe(MODE_NAME_PATTERN.source);
  });
});
