// Logika bersama sign-in cloud (spec-first-run-signin task C): keputusan gate first-run, pemetaan
// error ke copy gate (teknis tetap di `errorText` untuk Connections), deteksi rate limit magic
// link, inisial avatar, dan store memori "session expired" untuk account chip (E4 — hidup sampai
// reload/sign-in). Tanpa dependensi runtime selain `api` (type+kelas error) — aman dites di Node.
import { ApiError, OfflineError, type AuthStatus, type CloudUser } from './api.js';

// ---- Keputusan gate ----

/** Route Dashboard tempat gate boleh tampil saat boot (deep link viewer/present/join tidak pernah). */
export const GATE_BOOT_ROUTES = new Set(['recents', 'files', 'archive', 'settings', 'connections', 'updates']);

/**
 * Gate first-run tampil hanya bila SEMUA benar (fail-open — tabel "Kapan gate tampil" spec):
 * status terjawab + `onboarding.signin === 'pending'` (daemon baru), `configured:true` +
 * `signedIn:false`, boot ke halaman Dashboard, dan belum "Continue offline" di pemuatan ini.
 */
export function shouldShowGate(status: AuthStatus | undefined, bootRoute: string, dismissedThisLoad: boolean): boolean {
  if (dismissedThisLoad || status === undefined) return false;
  if (status.onboarding?.signin !== 'pending') return false;
  if (status.configured !== true || status.signedIn !== false) return false;
  return GATE_BOOT_ROUTES.has(bootRoute);
}

// ---- Deteksi error ----

/** Rate limit magic link: daemon membawa penanda `HTTP 429` di pesan (triage T5, kode tetap EXPORT_FAILED). */
export function isRateLimited(e: unknown): boolean {
  return e instanceof ApiError && /HTTP 429/.test(`${e.message} ${e.hint}`);
}

/** Gangguan jaringan ke service cloud (lakard menjawab EXPORT_FAILED "tidak bisa dihubungi/merespons") atau lakard sendiri putus. */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof OfflineError) return true;
  return e instanceof ApiError && /tidak bisa dihubungi|tidak merespons|ECONNREFUSED/i.test(e.message);
}

// ---- Copy error gate (bahasa Inggris — tabel Copy spec; pesan daemon tidak pernah mentah) ----

export const GATE_ERRORS = {
  popup: 'Allow pop-ups to sign in.',
  nourl: 'The sign-in service didn’t return a link. Try another method.',
  network: 'Can’t reach Lakar Cloud. Check your connection and try again.',
  ratelimit: 'Too many sign-in emails. Wait a few minutes, then try again.',
  email: 'Enter a valid email address.',
  generic: 'Sign-in didn’t start. Try again or use another method.',
} as const;

/**
 * Error sign-in → kalimat copy gate (`GATE_ERRORS`): rate limit → `ratelimit`; jaringan → `network`;
 * SCHEMA_INVALID soal email (magic link menolak alamat) → `email`; sisanya → `generic` (detail asli
 * ke `console.warn`, tidak pernah tampil mentah — gate bukan layar teknis seperti Connections).
 */
export function gateErrorText(e: unknown): string {
  if (isRateLimited(e)) return GATE_ERRORS.ratelimit;
  if (isNetworkError(e)) return GATE_ERRORS.network;
  if (e instanceof ApiError && e.code === 'SCHEMA_INVALID' && /email/i.test(e.message)) return GATE_ERRORS.email;
  if (!(e instanceof ApiError)) console.warn('sign-in gagal:', e);
  return GATE_ERRORS.generic;
}

// ---- Avatar ----

/** Inisial avatar dari nama (2 kata → huruf pertama masing-masing) atau email (2 huruf pertama). */
export function initialsOf(u: CloudUser): string {
  const base = u.name?.trim() || u.email;
  const parts = base.split(/\s+/).filter(Boolean);
  const init = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : base.slice(0, 2);
  return init.toUpperCase();
}

// ---- Store "session expired" + pengguna terakhir (E4, memori modul — sampai reload) ----

export type SessionExpiredState = { expired: boolean; user: CloudUser | undefined };

let expiredFlag = false;
/** Profil signed-in terakhir yang terlihat jendela ini — avatar chip saat session tiba-tiba expired. */
let lastUser: CloudUser | undefined;
/** Snapshot stabil untuk `useSyncExternalStore` — diganti hanya saat isi berubah. */
let snapshot: SessionExpiredState = { expired: false, user: undefined };
const expiredListeners = new Set<() => void>();
const expiredNotify = () => {
  snapshot = { expired: expiredFlag, user: lastUser };
  for (const l of [...expiredListeners]) l();
};

export const sessionExpired = {
  subscribe(l: () => void): () => void {
    expiredListeners.add(l);
    return () => {
      expiredListeners.delete(l);
    };
  },
  getSnapshot(): SessionExpiredState {
    return snapshot;
  },
  /** Status auth yang terlihat komponen: signed-in dicatat untuk avatar; expired dibersihkan oleh session baru. */
  noteStatus(s: AuthStatus | undefined): void {
    if (s?.signedIn && s.user) {
      const userChanged = lastUser !== s.user;
      lastUser = s.user;
      if (expiredFlag || userChanged) {
        expiredFlag = false;
        expiredNotify();
      }
    }
  },
  /** Event `auth` `reason:'expired'` — session dicabut service di tengah jalan (chip + toast). */
  markExpired(): void {
    if (!expiredFlag) {
      expiredFlag = true;
      expiredNotify();
    }
  },
  /** Sign-in baru (event signedIn:true) membersihkan state expired. */
  clear(): void {
    if (expiredFlag) {
      expiredFlag = false;
      expiredNotify();
    }
  },
};
