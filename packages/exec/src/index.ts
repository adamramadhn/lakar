// Sandbox `execute` (AD-7): QuickJS build release **sync**, tanpa fs/jaringan,
// dengan batas waktu (interrupt handler) dan batas memori per panggilan.
import {
  RELEASE_SYNC,
  newQuickJSWASMModuleFromVariant,
  newVariant,
  shouldInterruptAfterDeadline,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSWASMModule,
} from 'quickjs-emscripten';
import type { Transaction } from '@lakar/core';
import { LakarError } from '@lakar/schema';
import { API } from './api.js';

export const PACKAGE = '@lakar/exec';
export { API } from './api.js';

export const DEFAULT_TIMEOUT_MS = 2000;
export const DEFAULT_MEMORY_BYTES = 64 * 1024 * 1024;

export type RunOptions = { timeoutMs?: number; memoryBytes?: number };
export type RunResult = { ok: true; value: unknown } | { ok: false; error: LakarError };

const WASM_PAGE = 64 * 1024;
/** Ruang dasar heap WASM (runtime + konteks kosong) di luar batas memori snippet. */
const BASE_HEAP_BYTES = 16 * 1024 * 1024;

// exec dikompilasi tanpa lib DOM/@types/node; `WebAssembly.Memory` diambil lewat tipe minimal.
type WasmMemoryCtor = new (d: { initial: number; maximum: number }) => object;
const WasmMemory = (globalThis as unknown as { WebAssembly: { Memory: WasmMemoryCtor } }).WebAssembly.Memory;

const modules = new Map<number, Promise<QuickJSWASMModule>>();
/**
 * Muat modul WASM sekali per batas memori (async); setelah itu eksekusi snippet sepenuhnya sinkron.
 * Batas memori ditegakkan dengan `WebAssembly.Memory` ber-`maximum`: di build ini `setMemoryLimit`
 * QuickJS tidak bisa menghitung ukuran alokasi (malloc_usable_size tidak tersedia), jadi heap WASM
 * itu sendiri yang dibatasi. Snippet dijalankan berurutan (sinkron), jadi batas modul = batas per panggilan.
 */
export function loadQuickJS(memoryBytes: number = DEFAULT_MEMORY_BYTES): Promise<QuickJSWASMModule> {
  let p = modules.get(memoryBytes);
  if (!p) {
    const maximum = Math.ceil((BASE_HEAP_BYTES + memoryBytes) / WASM_PAGE);
    const wasmMemory = new WasmMemory({ initial: Math.min(256, maximum), maximum });
    p = newQuickJSWASMModuleFromVariant(newVariant(RELEASE_SYNC, { wasmMemory } as Parameters<typeof newVariant>[1]));
    modules.set(memoryBytes, p);
  }
  return p;
}

/**
 * Jalankan snippet di atas transaksi `tx`. Snippet TIDAK commit/rollback sendiri:
 * pemanggil wajib `tx.rollback()` bila `ok:false` dan `tx.commit()` bila `ok:true`.
 * Error host (mis. SCHEMA_INVALID dari `add`) bisa ditangkap snippet; bila tidak tertangkap,
 * kodenya diteruskan apa adanya. Error snippet lain → EXEC_ERROR, lewat batas waktu → EXEC_TIMEOUT.
 */
export async function runSnippet(code: string, tx: Transaction, opts: RunOptions = {}): Promise<RunResult> {
  const memoryBytes = opts.memoryBytes ?? DEFAULT_MEMORY_BYTES;
  const qjs = await loadQuickJS(memoryBytes);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const runtime = qjs.newRuntime();
  runtime.setMemoryLimit(memoryBytes);
  runtime.setMaxStackSize(1024 * 1024);
  const deadline = Date.now() + timeoutMs;
  let timedOut = false;
  const interrupt = shouldInterruptAfterDeadline(deadline);
  runtime.setInterruptHandler((rt) => {
    if (interrupt(rt)) {
      timedOut = true;
      return true;
    }
    return false;
  });
  const ctx = runtime.newContext();
  const hostErrors: LakarError[] = [];
  try {
    for (const [name, fn] of Object.entries(API)) {
      const handle = ctx.newFunction(name, (...argHandles: QuickJSHandle[]) => {
        try {
          const args = argHandles.map((h) => ctx.dump(h));
          return toHandle(ctx, fn.call(tx, args));
        } catch (e) {
          const err = ctx.newError({ name: e instanceof LakarError ? 'LakarError' : 'TypeError', message: errMessage(e) });
          if (e instanceof LakarError) {
            hostErrors.push(e);
            ctx.setProp(err, '__lakarError', ctx.newNumber(hostErrors.length - 1));
          }
          return { error: err };
        }
      });
      ctx.setProp(ctx.global, name, handle);
      handle.dispose();
    }

    const result = ctx.evalCode(code, 'snippet.js', { type: 'global', strict: true });
    if (result.error) {
      const dumped = ctx.dump(result.error) as unknown;
      result.error.dispose();
      if (timedOut) {
        return {
          ok: false,
          error: new LakarError('EXEC_TIMEOUT', `snippet melewati batas waktu ${timeoutMs} ms`, {
            hint: 'hindari loop tak berujung; pecah pekerjaan besar menjadi beberapa execute',
          }),
        };
      }
      const idx = typeof dumped === 'object' && dumped !== null ? (dumped as { __lakarError?: unknown }).__lakarError : undefined;
      if (typeof idx === 'number' && hostErrors[idx]) return { ok: false, error: hostErrors[idx] };
      if (/out of memory/i.test(describeDumped(dumped))) {
        return {
          ok: false,
          error: new LakarError('EXEC_ERROR', `snippet melewati batas memori ${memoryBytes} byte`, {
            hint: 'kurangi data yang dibuat di snippet; semua perubahan dibatalkan (rollback penuh)',
          }),
        };
      }
      return {
        ok: false,
        error: new LakarError('EXEC_ERROR', `error tak tertangkap di snippet: ${describeDumped(dumped)}`, {
          hint: 'perbaiki snippet; semua perubahan dibatalkan (rollback penuh)',
        }),
      };
    }
    const value = ctx.dump(result.value) as unknown;
    result.value.dispose();
    return { ok: true, value };
  } finally {
    try {
      ctx.dispose();
      runtime.dispose();
    } catch {
      // Runtime rusak (mis. setelah out of memory): buang modulnya, panggilan berikutnya memuat ulang.
      modules.delete(memoryBytes);
    }
  }
}

function toHandle(ctx: QuickJSContext, v: unknown): QuickJSHandle | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'string') return ctx.newString(v);
  if (typeof v === 'number') return ctx.newNumber(v);
  if (v === null) return ctx.null;
  if (typeof v === 'boolean') return v ? ctx.true : ctx.false;
  const r = ctx.evalCode(`(${JSON.stringify(v)})`);
  if (r.error) {
    r.error.dispose();
    throw new Error('gagal mengirim nilai host ke snippet');
  }
  return r.value;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function describeDumped(d: unknown): string {
  if (d && typeof d === 'object') {
    const o = d as { name?: unknown; message?: unknown };
    if (typeof o.message === 'string') return `${typeof o.name === 'string' ? o.name : 'Error'}: ${o.message}`;
  }
  try {
    return JSON.stringify(d) ?? String(d);
  } catch {
    return String(d);
  }
}
