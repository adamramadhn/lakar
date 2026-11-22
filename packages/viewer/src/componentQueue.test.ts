import { describe, expect, it } from 'vitest';
import type { DocOp } from '@lakar/schema';
import { createActionQueue, type QueueDeps } from './componentQueue.js';

type Doc = { rev: number; names: string[] };

/** Daemon palsu: apply menaikkan rev dan menambah nama; dokumen "dimuat" baru saat `load()` dipanggil. */
function harness(opts: { fail?: (ops: DocOp[]) => boolean; editable?: boolean } = {}) {
  let stored: Doc = { rev: 1, names: [] };
  let loaded: Doc | undefined = stored;
  const log: string[] = [];
  const waiters: { rev: number; resolve: () => void }[] = [];
  const load = () => {
    loaded = stored;
    for (const w of waiters.splice(0)) {
      if (w.rev <= stored.rev) w.resolve();
      else waiters.push(w);
    }
  };
  const deps: QueueDeps<Doc, string> = {
    latest: () => loaded,
    editable: () => opts.editable ?? true,
    info: (d) => `info@${d.rev}`,
    apply: async (ops, label) => {
      log.push(`apply ${label} @${loaded?.rev}`);
      if (opts.fail?.(ops)) return undefined;
      stored = { rev: stored.rev + 1, names: [...stored.names, label] };
      // Muat ulang tiba sesudah respons (seperti loadDoc async).
      setTimeout(load, 5);
      return { rev: stored.rev, refs: { slotted: `node${stored.rev}` } };
    },
    waitRev: (rev) => new Promise((resolve) => ((loaded?.rev ?? -1) >= rev ? resolve() : waiters.push({ rev, resolve }))),
    toast: (m) => log.push(`toast ${m}`),
    select: (id) => log.push(`select ${id}`),
  };
  return { q: createActionQueue(deps), log, doc: () => stored };
}
const op = (id: string): DocOp[] => [{ op: 'remove', id }];

describe('antrean aksi komponen', () => {
  it('aksi kedua dibangun dari dokumen yang sudah memuat rev aksi pertama; seleksi sesudah rev termuat', async () => {
    const { q, log, doc } = harness();
    const seen: string[] = [];
    const a = q('A', (d, info) => (seen.push(`${d.names.join('+') || '-'}|${info}`), op('a')), (refs) => refs.slotted);
    const b = q('B', (d, info) => (seen.push(`${d.names.join('+') || '-'}|${info}`), op('b')));
    await Promise.all([a, b]);
    expect(seen).toEqual(['-|info@1', 'A|info@2']);
    expect(log).toEqual(['apply A @1', 'select node2', 'apply B @2']);
    expect(doc().rev).toBe(3);
  });

  it('error pembangun → toast tanpa request; [] / undefined → tanpa request; aksi berikutnya tetap jalan', async () => {
    const { q, log } = harness();
    await q('Bad', () => ({ error: 'Name taken' }));
    await q('Empty', () => []);
    await q('None', () => undefined);
    await q('Throw', () => {
      throw new Error('boom');
    });
    await q('Ok', () => op('x'));
    expect(log).toEqual(['toast Name taken', 'toast boom', 'apply Ok @1']);
  });

  it('request gagal → tanpa seleksi, antrean lanjut; tidak bisa diedit → tanpa request', async () => {
    const failing = harness({ fail: () => true });
    await failing.q('A', () => op('a'), () => 'x');
    await failing.q('B', () => op('b'));
    expect(failing.log).toEqual(['apply A @1', 'apply B @1']);
    const ro = harness({ editable: false });
    await ro.q('A', () => op('a'));
    expect(ro.log).toEqual([]);
  });
});
