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
import type { CssVariablesPort, IconCatalogPort, PhotoLibraryPort } from '@lakar/ports';
import { LakarError, errorMessage } from '@lakar/schema';
import { API, DEFAULT_TIMEOUT_MS, KEEP_MAX_BYTES, LOG_MAX_BYTES, LOG_MAX_LINES, MAX_OPS, SNIPPET_GLOBALS, VALUE_MAX_BYTES, type ApiContext } from './api.js';

export const PACKAGE = '@lakar/exec';
export * from './api.js';

export const DEFAULT_MEMORY_BYTES = 64 * 1024 * 1024;

export type RunOptions = {
  timeoutMs?: number;
  memoryBytes?: number;
  /** `keep` sesi dari execute sukses sebelumnya (default `{}`). */
  keep?: Record<string, unknown>;
  /** Katalog ikon (wajib): kanonikalisasi node icon dan `iconSearch` (AD-9). */
  icons: IconCatalogPort;
  /** Foto terimpor untuk `photo(ref)` (daemon mengimpor ref literal sebelum snippet). Tidak ada → `photo()` NOT_FOUND. */
  photos?: PhotoLibraryPort;
  /** Parser CSS variables untuk `importCssVariables` (daemon: @lakar/render). Tidak ada → EXEC_ERROR. */
  cssVariables?: CssVariablesPort;
};
export type RunSuccess = {
  ok: true;
  /** Nilai ekspresi terakhir (JSON); tidak ada bila `undefined`. Dipotong → string + `valueTruncated`. */
  value?: unknown;
  valueTruncated?: true;
  /** Baris `console.log` (sudah dibatasi; baris terakhir menandai pemotongan). */
  logs: string[];
  /** `keep` baru; pemanggil menyimpannya hanya bila commit sukses. */
  keep: Record<string, unknown>;
};
export type RunResult = RunSuccess | { ok: false; error: LakarError };

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
function loadQuickJS(memoryBytes: number = DEFAULT_MEMORY_BYTES): Promise<QuickJSWASMModule> {
  let p = modules.get(memoryBytes);
  if (!p) {
    const maximum = Math.ceil((BASE_HEAP_BYTES + memoryBytes) / WASM_PAGE);
    const wasmMemory = new WasmMemory({ initial: Math.min(256, maximum), maximum });
    p = newQuickJSWASMModuleFromVariant(newVariant(RELEASE_SYNC, { wasmMemory } as Parameters<typeof newVariant>[1]));
    modules.set(memoryBytes, p);
  }
  return p;
}

const SNIPPET_FILE = 'snippet.js';
const PRELUDE_FILE = 'lakar-api.js';
const HOST_FIND = '__lakar_find';
const HOST_LOG = '__lakar_log';

/**
 * Prelude di dalam QuickJS: `console.log`, `keep`, dan `find` (filter RegExp dijalankan di sandbox,
 * jadi bisa di-interrupt). Nilai lengkapnya adalah fungsi `finish` yang menyerialisasi nilai akhir dan
 * `keep` dengan `JSON.stringify` di dalam sandbox.
 */
const prelude = (keepJson: string) => `(function () {
  const g = globalThis;
  const hostFind = g.${HOST_FIND}, hostLog = g.${HOST_LOG};
  delete g.${HOST_FIND};
  delete g.${HOST_LOG};
  const fmt = (v) => {
    if (typeof v === 'string') return v;
    try { const s = JSON.stringify(v); return s === undefined ? String(v) : s; } catch (e) { return String(v); }
  };
  g.console = { log: function log(...args) { hostLog(args.map(fmt).join(' ')); } };
  g.find = function find(query) {
    if (query !== null && typeof query === 'object' && query.name instanceof RegExp) {
      const re = query.name;
      const rest = Object.assign({}, query);
      delete rest.name;
      return hostFind(rest).filter((n) => { re.lastIndex = 0; return re.test(n.name); });
    }
    return query === undefined ? hostFind() : hostFind(query);
  };
  g.keep = JSON.parse(${JSON.stringify(keepJson)});
  return function finish(value) {
    const out = {};
    try { out.value = JSON.stringify(value); } catch (e) { out.value = JSON.stringify(String(value)); }
    const k = g.keep;
    if (k === null || typeof k !== 'object' || Array.isArray(k)) out.keepError = 'keep harus objek JSON, bukan ' + (Array.isArray(k) ? 'array' : k === null ? 'null' : typeof k);
    else { try { out.keep = JSON.stringify(k); } catch (e) { out.keepError = 'keep tidak bisa diserialisasi JSON: ' + (e && e.message ? e.message : String(e)); } }
    return out;
  };
})()`;

/** Panjang UTF-8 tanpa TextEncoder (exec dikompilasi tanpa lib DOM). */
function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/** Potong string ke maksimum `max` byte UTF-8 (perkiraan aman per karakter). */
function truncateUtf8(s: string, max: number): string {
  let n = 0;
  let i = 0;
  for (; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const w = c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdbff ? 4 : 3;
    if (n + w > max) break;
    n += w;
    if (w === 4) i++;
  }
  return s.slice(0, i);
}

class LogBuffer {
  readonly lines: string[] = [];
  #bytes = 0;
  #dropped = 0;
  push(text: string): void {
    for (const line of text.split('\n')) {
      const size = utf8Length(line) + 1;
      if (this.lines.length >= LOG_MAX_LINES || this.#bytes + size > LOG_MAX_BYTES) {
        this.#dropped++;
        continue;
      }
      this.lines.push(line);
      this.#bytes += size;
    }
  }
  result(): string[] {
    if (!this.#dropped) return this.lines;
    return [...this.lines, `… (log dipotong: ${this.#dropped} baris dibuang; batas ${LOG_MAX_LINES} baris / ${LOG_MAX_BYTES / 1024} KB)`];
  }
}

type Dumped = { name?: unknown; message?: unknown; stack?: unknown; lineNumber?: unknown; __lakarError?: unknown };

/** Lokasi baris snippet dari error QuickJS: frame `snippet.js:L:K` pertama, atau `lineNumber` SyntaxError. */
function snippetLocation(dumped: unknown, code: string): { line: number; column?: number; text: string } | undefined {
  if (!dumped || typeof dumped !== 'object') return undefined;
  const d = dumped as Dumped;
  const m = typeof d.stack === 'string' ? /snippet\.js:(\d+)(?::(\d+))?/.exec(d.stack) : null;
  const line = m ? Number(m[1]) : typeof d.lineNumber === 'number' ? d.lineNumber : undefined;
  if (line === undefined) return undefined;
  const column = m?.[2] ? Number(m[2]) : undefined;
  const raw = code.split('\n')[line - 1] ?? '';
  const text = raw.trim().length > 160 ? `${raw.trim().slice(0, 160)}…` : raw.trim();
  return { line, column, text };
}

function withLocation(msg: string, loc: ReturnType<typeof snippetLocation>): string {
  if (!loc) return msg;
  return `baris ${loc.line}${loc.column !== undefined ? `:${loc.column}` : ''}: ${msg}${loc.text ? `\n> ${loc.text}` : ''}`;
}

const ROLLBACK = 'semua perubahan snippet ini dibatalkan (rollback penuh)';

function execErrorHint(dumped: unknown): string {
  const d = (dumped && typeof dumped === 'object' ? dumped : {}) as Dumped;
  const name = typeof d.name === 'string' ? d.name : '';
  const message = typeof d.message === 'string' ? d.message : '';
  if (name === 'ReferenceError') {
    return `global yang tersedia hanya: ${SNIPPET_GLOBALS.join(', ')} (tanpa import/require/await/fetch); ${ROLLBACK}`;
  }
  if (name === 'TypeError' && /undefined|null/.test(message)) {
    return `nilai null/undefined: periksa ID (pakai ID dari add()/find()/children() atau created[].id) dan isi keep (hanya berisi yang disimpan execute sukses sebelumnya di sesi ini); ${ROLLBACK}`;
  }
  if (name === 'SyntaxError') {
    return `tulis JavaScript biasa (bukan TypeScript/JSX; tanpa import/export/await); ${ROLLBACK}`;
  }
  return `perbaiki snippet; ${ROLLBACK}`;
}

function describeDumped(d: unknown): string {
  if (d && typeof d === 'object') {
    const o = d as Dumped;
    if (typeof o.message === 'string') return `${typeof o.name === 'string' ? o.name : 'Error'}: ${o.message}`;
  }
  try {
    return JSON.stringify(d) ?? String(d);
  } catch {
    return String(d);
  }
}

/**
 * Jalankan snippet di atas transaksi `tx`. Snippet TIDAK commit/rollback sendiri:
 * pemanggil wajib `tx.rollback()` bila `ok:false` dan `tx.commit()` bila `ok:true`.
 * Error host (mis. SCHEMA_INVALID dari `add`) bisa ditangkap snippet; bila tidak tertangkap,
 * kodenya diteruskan apa adanya (+ lokasi baris). Error snippet lain → EXEC_ERROR, lewat batas waktu →
 * EXEC_TIMEOUT. Lebih dari `MAX_OPS` op mutasi → EXEC_ERROR walau ditangkap snippet.
 */
export async function runSnippet(code: string, tx: Transaction, opts: RunOptions): Promise<RunResult> {
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
  const logs = new LogBuffer();
  let ops = 0;
  let fatal: LakarError | undefined;
  const apiCtx: ApiContext = {
    tx,
    view: () => tx.view(),
    icons: opts.icons,
    ...(opts.photos ? { photos: opts.photos } : {}),
    ...(opts.cssVariables ? { cssVariables: opts.cssVariables } : {}),
    countOp() {
      ops++;
      if (ops > MAX_OPS) {
        fatal = new LakarError('EXEC_ERROR', `snippet melewati batas ${MAX_OPS} op mutasi per execute`, {
          hint: `pecah pekerjaan ke beberapa execute (simpan ID di keep untuk dilanjutkan); ${ROLLBACK}`,
        });
        throw fatal;
      }
    },
  };

  const timeoutError = () =>
    new LakarError('EXEC_TIMEOUT', `snippet melewati batas waktu ${timeoutMs} ms`, {
      hint: `hindari loop tak berujung; pecah pekerjaan besar menjadi beberapa execute; ${ROLLBACK}`,
    });

  /** Petakan error QuickJS (sudah di-dump) ke LakarError + lokasi baris snippet. */
  const toLakarError = (dumped: unknown): LakarError => {
    if (timedOut) return timeoutError();
    const loc = snippetLocation(dumped, code);
    const idx = typeof dumped === 'object' && dumped !== null ? (dumped as Dumped).__lakarError : undefined;
    const host = fatal ?? (typeof idx === 'number' ? hostErrors[idx] : undefined);
    if (host) return new LakarError(host.code, withLocation(host.message, loc), { hint: host.hint, retryable: host.retryable });
    if (/out of memory/i.test(describeDumped(dumped))) {
      return new LakarError('EXEC_ERROR', `snippet melewati batas memori ${memoryBytes} byte`, {
        hint: `kurangi data yang dibuat di snippet; ${ROLLBACK}`,
      });
    }
    const what = loc ? describeDumped(dumped) : `error tak tertangkap di snippet: ${describeDumped(dumped)}`;
    return new LakarError('EXEC_ERROR', withLocation(what, loc), { hint: execErrorHint(dumped) });
  };

  try {
    const register = (name: string, fn: (args: unknown[]) => unknown) => {
      const handle = ctx.newFunction(name, (...argHandles: QuickJSHandle[]) => {
        try {
          if (fatal) throw fatal;
          const args = argHandles.map((h) => ctx.dump(h));
          return toHandle(ctx, fn(args));
        } catch (e) {
          const err = ctx.newError({ name: e instanceof LakarError ? 'LakarError' : 'TypeError', message: errorMessage(e) });
          if (e instanceof LakarError) {
            hostErrors.push(e);
            ctx.setProp(err, '__lakarError', ctx.newNumber(hostErrors.length - 1));
            const codeHandle = ctx.newString(e.code);
            ctx.setProp(err, 'code', codeHandle);
            codeHandle.dispose();
          }
          return { error: err };
        }
      });
      ctx.setProp(ctx.global, name, handle);
      handle.dispose();
    };
    for (const [name, fn] of Object.entries(API)) {
      register(name === 'find' ? HOST_FIND : name, (args) => fn.call(apiCtx, args));
    }
    register(HOST_LOG, ([line]) => {
      logs.push(String(line));
      return undefined;
    });

    const pre = ctx.evalCode(prelude(JSON.stringify(opts.keep ?? {})), PRELUDE_FILE, { type: 'global', strict: true });
    if (pre.error) {
      const dumped = ctx.dump(pre.error) as unknown;
      pre.error.dispose();
      throw new Error(`prelude sandbox gagal: ${describeDumped(dumped)}`);
    }
    const finish = pre.value;
    try {
      const result = ctx.evalCode(code, SNIPPET_FILE, { type: 'global', strict: true });
      if (result.error) {
        const dumped = ctx.dump(result.error) as unknown;
        result.error.dispose();
        return { ok: false, error: toLakarError(dumped) };
      }
      const fin = ctx.callFunction(finish, ctx.undefined, result.value);
      result.value.dispose();
      if (fin.error) {
        const dumped = ctx.dump(fin.error) as unknown;
        fin.error.dispose();
        return { ok: false, error: toLakarError(dumped) };
      }
      const out = ctx.dump(fin.value) as { value?: string; keep?: string; keepError?: string };
      fin.value.dispose();
      if (fatal) return { ok: false, error: fatal };
      return finishResult(out, logs.result());
    } finally {
      finish.dispose();
    }
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

function finishResult(out: { value?: string; keep?: string; keepError?: string }, logs: string[]): RunResult {
  const keepHint = `keep harus objek JSON biasa (string/angka/boolean/null/array/objek; tanpa fungsi atau siklus), maks ${KEEP_MAX_BYTES / 1024} KB; mis. keep.hero = add(...); ${ROLLBACK}`;
  if (out.keepError !== undefined) return { ok: false, error: new LakarError('SCHEMA_INVALID', out.keepError, { hint: keepHint }) };
  const keepJson = out.keep ?? '{}';
  const keepBytes = utf8Length(keepJson);
  if (keepBytes > KEEP_MAX_BYTES) {
    return { ok: false, error: new LakarError('SCHEMA_INVALID', `keep terlalu besar: ${keepBytes} byte (maks ${KEEP_MAX_BYTES})`, { hint: `simpan ID saja di keep, bukan data node; ${keepHint}` }) };
  }
  const res: RunSuccess = { ok: true, logs, keep: JSON.parse(keepJson) as Record<string, unknown> };
  if (out.value !== undefined) {
    if (utf8Length(out.value) > VALUE_MAX_BYTES) {
      res.value = `${truncateUtf8(out.value, VALUE_MAX_BYTES)}…`;
      res.valueTruncated = true;
    } else {
      res.value = JSON.parse(out.value) as unknown;
    }
  }
  return res;
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
export { renderApiMarkdown } from './api-md.js';
