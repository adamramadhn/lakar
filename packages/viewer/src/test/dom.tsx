/// <reference lib="dom" />
// Harness tes komponen/DOM viewer (spec-viewer-dom-harness). Dipakai oleh `*.dom.test.tsx` (proyek vitest
// `viewer-dom`, environment jsdom). Isi:
// - `FakeDaemon`: pengganti `fetch` per route lakard (`{ok,data}` / `{ok:false,error}` AD-11), mencatat setiap request.
// - `FakeEventSource`: pengganti `EventSource` untuk `activityHub` (`/viewer/events`); `stream.*` memancarkan event.
// - Stub API browser yang tidak ada di jsdom: `matchMedia` (termasuk prefers-reduced-motion), `ResizeObserver`,
//   `Element.animate` (Web Animations), pointer capture, `scrollIntoView`, `CSS.escape`, `URL.createObjectURL`.
// - `renderUi`: render RTL + `userEvent` yang sudah disiapkan. Viewer tidak memakai context/provider React; state
//   bersama (api, activityHub) adalah singleton modul yang di-reset per file tes oleh isolasi modul vitest.
import { act, render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

// ---- fetch ----

export type FakeRequest = { method: string; path: string; query: URLSearchParams; body: unknown; headers: Record<string, string>; keepalive: boolean };
/** Handler route: kembalikan `data` (dibungkus `{ok:true,data}`), atau lempar `fail(...)` untuk error AD-11. */
export type FakeHandler = (req: FakeRequest, match: RegExpMatchArray) => unknown;

/** Error AD-11 dari handler (`throw fail('NOT_FOUND', 404)`). */
export class FakeFailure {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly message = code,
  ) {}
}
export const fail = (code: string, status = 400, message = code) => new FakeFailure(code, status, message);

export class FakeDaemon {
  readonly requests: FakeRequest[] = [];
  readonly #routes: { method: string; path: RegExp; handler: FakeHandler }[] = [];

  /** Daftarkan route; `path` string = cocok persis (tanpa query), RegExp = pola. Route terakhir menang. */
  on(method: string, path: string | RegExp, handler: FakeHandler): this {
    const re = typeof path === 'string' ? new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) : path;
    this.#routes.unshift({ method, path: re, handler });
    return this;
  }

  /** Request yang cocok dengan method + path (string persis atau RegExp). */
  find(method: string, path: string | RegExp): FakeRequest[] {
    return this.requests.filter((r) => r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)));
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://127.0.0.1:7466');
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = Object.fromEntries(Object.entries((init.headers as Record<string, string> | undefined) ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : init.body;
    const req: FakeRequest = { method, path: url.pathname, query: url.searchParams, body, headers, keepalive: init.keepalive === true };
    this.requests.push(req);
    for (const r of this.#routes) {
      const m = r.method === method ? url.pathname.match(r.path) : null;
      if (!m) continue;
      try {
        const data = await r.handler(req, m);
        return json({ ok: true, data: data ?? null });
      } catch (e) {
        if (e instanceof FakeFailure) return json({ ok: false, error: { code: e.code, message: e.message, hint: '' } }, e.status);
        throw e;
      }
    }
    return json({ ok: false, error: { code: 'NOT_FOUND', message: `no fake route for ${method} ${url.pathname}`, hint: '' } }, 404);
  };
}

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

// ---- EventSource ----

type EsListener = (ev: { data: string }) => void;

export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  closed = false;
  readonly #listeners = new Map<string, EsListener[]>();
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, l: EsListener) {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), l]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    for (const l of this.#listeners.get(type) ?? []) l({ data: JSON.stringify(data) });
  }
}

/** Stream `/viewer/events` yang sedang terbuka (instans terakhir yang belum ditutup). */
function openStream(): FakeEventSource {
  const es = FakeEventSource.instances.filter((s) => !s.closed).at(-1);
  if (!es) throw new Error('tidak ada EventSource terbuka (komponen belum berlangganan activityHub?)');
  return es;
}

let seq = 0;
/** seq event stream berikutnya (dipakai juga untuk event di `recent` snapshot hello, supaya urutannya cocok). */
export const nextSeq = () => ++seq;
/** Pemancar event stream di dalam `act` (state React diperbarui sebelum assert). */
export const stream = {
  current: openStream,
  hello(hello: { sessions?: unknown[]; recent?: unknown[] } = {}) {
    act(() => openStream().emit('hello', { sessions: [], recent: [], ...hello }));
  },
  /** Event sesudah hello; `seq` diisi otomatis bila tidak ada. */
  event(type: 'call' | 'session' | 'change' | 'selection' | 'openTab', payload: Record<string, unknown>) {
    const ev = { seq: nextSeq(), type, ...payload };
    act(() => openStream().emit(type, ev));
  },
  /** Stream putus (onerror): hub menyambung ulang sesudah backoff. */
  drop() {
    act(() => openStream().onerror?.({}));
  },
};

// ---- matchMedia ----

let mediaMatches: (query: string) => boolean = () => false;
/** Atur hasil `matchMedia` (mis. reduced motion) untuk tes berikutnya; reset ke "tidak cocok" tiap tes. */
export function setMedia(fn: (query: string) => boolean) {
  mediaMatches = fn;
}
export const reducedMotion = (on: boolean) => setMedia((q) => on && q.includes('prefers-reduced-motion: reduce'));

function matchMediaStub(query: string): MediaQueryList {
  return {
    matches: mediaMatches(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList;
}

// ---- Instalasi ----

export type DomStubs = { daemon: FakeDaemon; animate: ReturnType<typeof vi.fn> };
let current: DomStubs | undefined;

/** Stub per tes (dipanggil setup.ts di `beforeEach`). */
export function installDomStubs(): DomStubs {
  const daemon = new FakeDaemon();
  vi.stubGlobal('fetch', daemon.fetch);
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  mediaMatches = () => false;
  vi.stubGlobal('matchMedia', matchMediaStub);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') vi.stubGlobal('CSS', { escape: (s: string) => s.replace(/["\\]/g, '\\$&') });
  // Web Animations: elemen yang dianimasikan tercatat di `animate.mock.contexts`.
  const animate = vi.fn(function (this: Element) {
    return { cancel() {}, finish() {}, finished: Promise.resolve(), onfinish: null } as unknown as Animation;
  });
  Element.prototype.animate = animate as unknown as Element['animate'];
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  URL.createObjectURL = () => 'blob:fake';
  URL.revokeObjectURL = () => {};
  current = { daemon, animate };
  return current;
}

/** Stub tes yang sedang berjalan. */
export function dom(): DomStubs {
  if (!current) throw new Error('installDomStubs belum dipanggil (setupFiles proyek viewer-dom?)');
  return current;
}

/** Render RTL + `userEvent` yang terpasang (clipboard tiruan user-event ikut aktif). */
export function renderUi(ui: ReactElement, options?: RenderOptions) {
  const user = userEvent.setup();
  return { user, ...render(ui, options) };
}
