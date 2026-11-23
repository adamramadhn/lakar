// Placeholder skeleton (spec-skeleton-live-build) tidak pernah membawa gaya skeleton ke luar viewer: dokumen hasil
// `Skel` hanya berisi frame biasa (tanpa cat), dan codegen/render memperlakukannya sebagai frame kosong ber-minHeight.
// Gaya tint/label/shimmer hanya ada di shadow root viewer (packages/viewer/src/skeleton.ts).
import { describe, expect, it } from 'vitest';
import { createDocument, transact } from '../packages/core/src/index.ts';
import { runSnippet } from '../packages/exec/src/index.ts';
import { IconCatalog } from '../packages/icons/src/index.ts';
import { generateCode } from '../packages/codegen/src/index.ts';
import { frameDecls } from '../packages/render/src/css.ts';

const icons = IconCatalog.load();

async function skeletonDoc() {
  let board = '';
  let skel = '';
  const r = await transact(createDocument(), { sessionId: 't', description: 'skeleton' }, async (tx) => {
    const out = await runSnippet(
      "const b=add(null,{type:'board',name:'[WIP] Kopi / Beranda · landing · Jernih',x:0,y:0,width:1440,height:'hug',screen:'landing',fills:fill(C.bg)});" +
        "const page=F(b,'Halaman',{width:'fill'}); const s=Skel(page,'Seksi / Menu',640); [b,s]",
      tx,
      { timeoutMs: 2000, keep: {}, icons },
    );
    if (!out.ok) throw out.error;
    [board, skel] = out.value as [string, string];
  });
  return { doc: r.doc, board, skel };
}

const SKELETON_STYLE = /lakar-skel|skeleton|shimmer|dashed|data-generating/i;

describe('skeleton tidak dikirim keluar viewer', () => {
  it('node placeholder = frame biasa tanpa cat/stroke (hanya nama, lebar fill, minHeight)', async () => {
    const { doc, skel } = await skeletonDoc();
    const page = doc.pages[0]!.children[0]! as unknown as { children: { children: Record<string, unknown>[] }[] };
    const node = page.children[0]!.children[0]!;
    expect(node.id).toBe(skel);
    expect(Object.keys(node).sort()).toEqual(['children', 'id', 'layout', 'minHeight', 'name', 'type', 'width']);
    expect(frameDecls(node as never).map(([p, v]) => `${p}:${v}`).join(';')).not.toMatch(SKELETON_STYLE);
  });

  it.each(['react-tailwind', 'react-css'] as const)('codegen %s: tanpa gaya skeleton', async (target) => {
    const { doc, board } = await skeletonDoc();
    const out = generateCode(doc, { nodeId: board, target });
    const all = out.files.map((f) => f.contents).join('\n');
    // Penanda placeholder tidak masuk identifier (kelas CSS module = seksiMenu) maupun gaya.
    expect(all).not.toMatch(SKELETON_STYLE);
    if (target === 'react-css') expect(all).toContain('.seksiMenu {');
    expect(all).toMatch(/640/); // minHeight tetap (perkiraan tinggi), tanpa cat
  });

  it.each(['react-tailwind', 'react-css'] as const)('codegen %s dari node placeholder sendiri: header, nama komponen, dan berkas tanpa penanda', async (target) => {
    const { doc, skel } = await skeletonDoc();
    const out = generateCode(doc, { nodeId: skel, target });
    expect(out.files.map((f) => f.path)).toContain('SeksiMenu.tsx');
    const main = out.files.find((f) => f.path === 'SeksiMenu.tsx')!.contents;
    expect(main.split('\n')[0]).toContain('from "Seksi / Menu"');
    expect(out.files.map((f) => `${f.path}\n${f.contents}`).join('\n')).not.toMatch(SKELETON_STYLE);
  });
});
