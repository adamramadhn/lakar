import { describe, expect, it } from 'vitest';
import { beginTransaction, createDocument } from '@lakar/core';
import { API, PACKAGE, runSnippet } from './index.js';

const tracer = `const b=add(null,{type:'board',name:'Tracer',x:0,y:0,width:390,height:844,screen:'mobile'}); add(b,{type:'text',name:'Judul',content:'Halo dari Lakar',size:32})`;
const txFor = () => beginTransaction(createDocument(), { sessionId: 's' });

describe('@lakar/exec', () => {
  it('mengekspor nama paket dan permukaan API tracer', () => {
    expect(PACKAGE).toBe('@lakar/exec');
    expect(Object.keys(API)).toEqual(['add']);
  });

  it('sukses: ID dikembalikan sinkron ke snippet, commit oleh pemanggil', async () => {
    const tx = txFor();
    const r = await runSnippet(`${tracer}; typeof b === 'string' && b.length`, tx);
    expect(r).toEqual({ ok: true, value: 8 });
    const c = tx.commit('tracer');
    expect(c.created.map((x) => x.name)).toEqual(['Tracer', 'Judul']);
    expect(c.doc.pages[0]!.children[0]!.children[0]).toMatchObject({ type: 'text', content: 'Halo dari Lakar' });
  });

  it('throw tak tertangkap → EXEC_ERROR + pesan', async () => {
    const r = await runSnippet(`${tracer}; throw new Error('x')`, txFor());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('EXEC_ERROR');
      expect(r.error.message).toContain('Error: x');
    }
  });

  it('error host tak tertangkap → kode aslinya (SCHEMA_INVALID + hint x/y)', async () => {
    const r = await runSnippet(`const b=add(null,{type:'board',name:'B',x:0,y:0,width:10,height:10,screen:'app'}); add(b,{type:'text',name:'T',content:'a',size:12,x:10})`, txFor());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('SCHEMA_INVALID');
      expect(r.error.hint).toMatch(/x\/y hanya untuk board\/node absolute/);
    }
  });

  it('error host yang ditangkap snippet tidak membatalkan transaksi', async () => {
    const tx = txFor();
    const r = await runSnippet(`const b=add(null,{type:'board',name:'B',x:0,y:0,width:10,height:10,screen:'app'}); let code; try { add(b,{type:'nope'}) } catch (e) { code = e.name } code`, tx);
    expect(r).toEqual({ ok: true, value: 'LakarError' });
    expect(tx.commit('x').created).toHaveLength(1);
  });

  it('loop tak berujung → EXEC_TIMEOUT', async () => {
    const t0 = Date.now();
    const r = await runSnippet('while(true){}', txFor(), { timeoutMs: 200 });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('EXEC_TIMEOUT');
  });

  it('batas memori → EXEC_ERROR', async () => {
    const r = await runSnippet(`const a=[]; while(true){ a.push(new Array(1e5).fill(1)) }`, txFor(), { memoryBytes: 8 * 1024 * 1024, timeoutMs: 5000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('EXEC_ERROR');
      expect(r.error.message).toMatch(/batas memori/);
    }
    // modul tetap/kembali bisa dipakai setelah out of memory
    expect(await runSnippet('1+1', txFor(), { memoryBytes: 8 * 1024 * 1024 })).toEqual({ ok: true, value: 2 });
  });

  it('tanpa fs/jaringan: require, fetch, process, import tidak ada', async () => {
    const r = await runSnippet(
      `[typeof require, typeof fetch, typeof process, typeof XMLHttpRequest, typeof globalThis.std, typeof globalThis.os]`,
      txFor(),
    );
    expect(r).toEqual({ ok: true, value: ['undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined'] });
  });
});
