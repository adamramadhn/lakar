// Helper desain bawaan sandbox (spec-skeleton-live-build): prelude otomatis, palet dari `keep`, kompatibilitas
// prelude lama (AD-4), dan helper skeleton `Skel`/`Build`.
import { describe, expect, it } from 'vitest';
import { beginTransaction, createDocument } from '@lakar/core';
import type { IconCatalogPort } from '@lakar/ports';
import { SKELETON_PREFIX } from '@lakar/schema';
import { DEFAULT_C, DEFAULT_FONT, HELPER_GLOBALS, runSnippet, type RunResult } from './index.js';

const icons: IconCatalogPort = {
  versions: { lucide: '1.74.0', 'simple-icons': '16.38.0' },
  canonical: (_lib, icon) => ({ icon, version: '1.74.0' }),
  search: () => [],
  glyph: () => undefined,
};
const run = (code: string, keep: Record<string, unknown> = {}) => {
  const tx = beginTransaction(createDocument(), { sessionId: 's' });
  return runSnippet(code, tx, { icons, keep, timeoutMs: 5000 }).then((r) => ({ r }));
};
function ok(r: RunResult) {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}\n${r.error.hint}`);
  return r;
}
const BOARD = "const b=add(null,{type:'board',name:'[WIP] B',x:0,y:0,width:1440,height:'hug',screen:'landing'});";

/** Prelude gaya lama (core.md sebelum spec ini), diringkas: deklarasi leksikal ulang tetap sah. */
const OLD_PRELUDE = `const C={bg:'#0B0C0F',t1:'#F5F6F8',acc:'#2DD4BF',on:'#0B0C0F'};
const FONT={h:'Manrope',b:'Manrope',m:'JetBrains Mono'};
const R=(size,lineHeight,weight,letterSpacing=0)=>({size,lineHeight,weight,letterSpacing});
const TY={body:R(16,24,400),h1:R(40,48,700),label:R(14,20,600)};
const HEAD=['h1'];
const fill=(c)=>[{type:'solid',color:c}];
const F=(p,name,o={})=>add(p,{type:'frame',name,layout:'column',...o});
const T=(p,name,content,role='body',o={})=>add(p,{type:'text',name,content,color:C.t1,family:HEAD.includes(role)?FONT.h:FONT.b,...TY[role],...o});`;

describe('helper bawaan sandbox', () => {
  it('semua helper tersedia tanpa prelude; palet bawaan = Jernih', async () => {
    const { r } = await run(`[${HELPER_GLOBALS.map((n) => `typeof ${n}`).join(',')}].join(' ')+'|'+C.acc+'|'+FONT.h+'|'+TY.h2.size`);
    const [types, acc, h, size] = String(ok(r).value).split('|');
    expect(types!.split(' ')).toEqual(HELPER_GLOBALS.map((n) => (['C', 'FONT', 'TY', 'HEAD'].includes(n) ? 'object' : 'function')));
    expect([acc, h, size]).toEqual([DEFAULT_C.acc, DEFAULT_FONT.h, '32']);
  });

  it('snippet tanpa prelude membangun node dengan helper (T memakai FONT/TY)', async () => {
    const { r } = await run(`${BOARD} const t=T(b,'Judul','Halo','h1'); Btn(b,'Coba'); Badge(b,'Baru','success','check'); get(t)`);
    expect(ok(r).value).toMatchObject({ type: 'text', family: 'Plus Jakarta Sans', size: 40, lineHeight: 48, color: DEFAULT_C.t1 });
  });

  it('palet dari keep.C/keep.FONT (disimpan sekali di execute pertama)', async () => {
    const first = ok((await run("keep.C=Object.assign(C,{acc:'#4F46E5'}); keep.FONT=Object.assign(FONT,{h:'DM Sans'}); 1")).r);
    expect(first.keep).toMatchObject({ C: { acc: '#4F46E5', bg: DEFAULT_C.bg }, FONT: { h: 'DM Sans', b: 'Inter' } });
    const { r } = await run(`${BOARD} const t=T(b,'Judul','Halo','h1'); C.acc+'|'+get(t).family`, first.keep);
    expect(ok(r).value).toBe('#4F46E5|DM Sans');
  });

  it('keep.C bukan objek → palet bawaan (tanpa error)', async () => {
    expect(ok((await run('C.acc', { C: 'rusak', FONT: [1] })).r).value).toBe(DEFAULT_C.acc);
  });

  it('AD-4: prelude lama (const C, const T, …) tetap sah dan helper bawaan ikut memakai deklarasi snippet', async () => {
    const { r } = await run(`${OLD_PRELUDE}\n${BOARD} const t=T(b,'Judul','Halo','h1'); const btn=Btn(b,'Ok'); [get(t),get(btn),get(children(btn)[0].id)]`);
    const [t, btn, label] = ok(r).value as Record<string, unknown>[];
    expect(t).toMatchObject({ family: 'Manrope', size: 40, color: '#F5F6F8' });
    // Btn bawaan memanggil T dan C milik snippet (identifier bebas → deklarasi leksikal snippet).
    expect(label).toMatchObject({ name: 'Label', family: 'Manrope', color: '#0B0C0F' });
    expect(btn).toMatchObject({ fills: [{ type: 'solid', color: '#2DD4BF' }] });
  });

  it('AD-4: prelude lama dengan var/function dan Object.assign juga sah', async () => {
    ok((await run("var C={acc:'#000000'}; function fill(c){return [{type:'solid',color:c}]} Object.assign(C,{t1:'#111111'}); C.t1")).r);
  });

  it('ReferenceError menyebut helper bawaan di hint', async () => {
    const r = (await run('Nope(1)')).r;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.hint).toContain('helper bawaan: C, FONT');
  });
});

describe('helper skeleton', () => {
  it("Skel membuat frame '[Skeleton] nama' lebar fill + minHeight; Build mengisi di tempat (id sama)", async () => {
    const { r } = await run(`${BOARD} const s=Skel(b,'Seksi / Menu',640); const before=get(s); const back=Build(s,{padding:[96,80],gap:24}); T(s,'Judul','Menu','h2'); [before,get(s),back===s]`);
    const [before, n, same] = ok(r).value as [Record<string, unknown>, Record<string, unknown>, boolean];
    expect(before).toMatchObject({ name: `${SKELETON_PREFIX}Seksi / Menu`, width: 'fill', minHeight: 640 });
    expect(n).toMatchObject({ type: 'frame', name: 'Seksi / Menu', layout: 'column', width: 'fill', padding: [96, 80], gap: 24 });
    expect(n.minHeight).toBeUndefined();
    expect(n.childIds).toHaveLength(1);
    expect(same).toBe(true);
  });

  it('Build pada node tanpa prefiks hanya menerapkan patch', async () => {
    const { r } = await run(`${BOARD} const s=F(b,'Seksi / FAQ',{minHeight:200}); Build(s,{gap:8}); Build(F(b,'Tanpa minHeight'),{gap:4}); get(s)`);
    expect(ok(r).value).toMatchObject({ name: 'Seksi / FAQ', gap: 8 });
  });
});
