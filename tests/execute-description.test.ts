// Deskripsi tool `execute` di mcp harus menyebut setiap fungsi API exec (api.ts = satu-satunya sumber).
import { describe, expect, it } from 'vitest';
import { API, API_GLOBALS } from '../packages/exec/src/api.ts';
import { EXECUTE_DESCRIPTION } from '../packages/mcp/src/server.ts';

describe('deskripsi tool execute', () => {
  it.each(Object.keys(API))('menyebut %s(', (name) => {
    expect(EXECUTE_DESCRIPTION).toContain(`${name}(`);
  });

  it('menyebut keep, console.log, value, editId/edits, dan description 3–8 kata', () => {
    expect(Object.keys(API_GLOBALS)).toEqual(['keep', 'console']);
    for (const s of ['keep', 'console.log', 'data.value', 'editId', 'edits', '3–8 kata']) expect(EXECUTE_DESCRIPTION).toContain(s);
  });
});
