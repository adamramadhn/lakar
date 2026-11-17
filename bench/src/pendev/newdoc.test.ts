import { describe, expect, it } from 'vitest';
import { parseNewDocOutput, verifyNewDoc } from './newdoc.js';
import { parseAppStateUri, parseTopNodes } from './pencil-client.js';

const GOLDEN = '/root/.pencil/documents/1e55d426-3895-4cef-8d4b-52763be3aff4/untitled.pen';
const NEW = 'file:///root/.pencil/documents/9999aaaa-0000-4000-8000-000000000000/untitled.pen';
const ok = { uri: NEW, appStateUri: NEW, prevUris: [], snapshot: [GOLDEN], topNodes: [], goldenPath: GOLDEN };
const frame = { id: 'X', name: 'F', type: 'frame', width: 1440, height: 900, declaredWidth: 1440, declaredHeight: null };

describe('newdoc', () => {
  it('parse output pen-newdoc.sh dan get_app_state', () => {
    const out = 'Dokumen baru aktif: - Currently active canvas editor URI: `' + NEW + '`\n';
    expect(parseNewDocOutput(out)).toBe(NEW);
    expect(parseNewDocOutput('apa saja\n')).toBeUndefined();
    expect(parseAppStateUri('## Canvas Editor\n\n- Currently active canvas editor URI: `' + NEW + '`\n')).toBe(NEW);
  });

  it('parse node top-level dari Print JSON (7 kolom LIST_TOP_SNIPPET)', () => {
    const text = 'OK\n\n## Print output\n["a","b","frame",390,844,0,390,844]\n';
    const t7 = 'OK\n["S5tVV3","Judul","frame",2400,null,2400,405]  \n';
    expect(parseTopNodes(t7)).toEqual([{ id: 'S5tVV3', name: 'Judul', type: 'frame', declaredWidth: 2400, declaredHeight: null, width: 2400, height: 405 }]);
    expect(parseTopNodes(text)).toEqual([]);
  });

  it('dokumen baru yang sah lolos', () => {
    expect(verifyNewDoc(ok)).toEqual({ uri: NEW, source: 'pen-newdoc.sh', problems: [] });
  });

  it('pen-newdoc.sh tanpa URI: pakai get_app_state bila file terbukti baru', () => {
    const path = NEW.replace('file://', '');
    expect(verifyNewDoc({ ...ok, uri: undefined, postSnapshot: [GOLDEN, path] })).toEqual({ uri: NEW, source: 'get_app_state', problems: [] });
  });

  it.each([
    ['URI sama dengan sebelumnya', { prevUris: [NEW] }],
    ['URI dokumen golden', { uri: `file://${GOLDEN}`, appStateUri: `file://${GOLDEN}` }],
    ['URI kosong', { uri: undefined, appStateUri: undefined }],
    ['script tanpa URI dan file tidak baru', { uri: undefined, postSnapshot: [GOLDEN] }],
    ['frame > 0', { topNodes: [frame] }],
    ['get_app_state beda', { appStateUri: 'file:///lain.pen' }],
    ['sudah ada di snapshot', { snapshot: [GOLDEN, '/root/.pencil/documents/9999aaaa-0000-4000-8000-000000000000/untitled.pen'] }],
  ])('%s → ditolak', (_, over) => {
    expect(verifyNewDoc({ ...ok, ...over }).problems.length).toBeGreaterThan(0);
  });
});
