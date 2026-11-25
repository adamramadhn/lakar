// Logika murni gate first-run (spec-first-run-signin task D): keputusan `shouldShowGate` per baris
// tabel "Kapan gate tampil" (fail-open), pemetaan `gateErrorText` ke copy gate, deteksi rate limit
// `HTTP 429`, inisial avatar, dan store `sessionExpired` (E4).
import { describe, expect, it, vi } from 'vitest';
import { ApiError, OfflineError, type AuthStatus } from './api.ts';
import { GATE_ERRORS, gateErrorText, initialsOf, isRateLimited, sessionExpired, shouldShowGate } from './cloudAuth.ts';

const pending: AuthStatus = { signedIn: false, configured: true, providers: ['google', 'github', 'email'], host: 'api.lakar.dev', onboarding: { signin: 'pending' } };

describe('shouldShowGate (fail-open)', () => {
  it('tampil hanya saat pending + configured + signed out + boot ke Dashboard', () => {
    for (const r of ['recents', 'files', 'archive', 'settings', 'connections', 'updates']) {
      expect(shouldShowGate(pending, r, false), r).toBe(true);
    }
  });
  it('status tidak terjawab (undefined) → tidak tampil', () => {
    expect(shouldShowGate(undefined, 'recents', false)).toBe(false);
  });
  it('field onboarding hilang (daemon lama) → tidak tampil', () => {
    const { onboarding, ...rest } = pending;
    expect(shouldShowGate(rest, 'recents', false)).toBe(false);
  });
  it('signin selain pending (skipped/completed/disabled) → tidak tampil', () => {
    for (const signin of ['skipped', 'completed', 'disabled'] as const) {
      expect(shouldShowGate({ ...pending, onboarding: { signin } }, 'recents', false), signin).toBe(false);
    }
  });
  it('configured:false / signedIn:true → tidak tampil', () => {
    expect(shouldShowGate({ ...pending, configured: false }, 'recents', false)).toBe(false);
    expect(shouldShowGate({ ...pending, signedIn: true }, 'recents', false)).toBe(false);
  });
  it('boot ke deep link (viewer/present/join) → tidak tampil (E11)', () => {
    for (const r of ['viewer', 'present', 'join']) {
      expect(shouldShowGate(pending, r, false), r).toBe(false);
    }
  });
  it('sudah "Continue offline" di pemuatan ini → tidak tampil (E2)', () => {
    expect(shouldShowGate(pending, 'recents', true)).toBe(false);
  });
});

describe('gateErrorText → copy gate (pesan daemon tidak pernah mentah)', () => {
  it('rate limit (HTTP 429 di pesan) → err.ratelimit', () => {
    const e = new ApiError('EXPORT_FAILED', 'service auth membatasi magic link (HTTP 429): slow down', 'tunggu beberapa menit…', 500);
    expect(isRateLimited(e)).toBe(true);
    expect(gateErrorText(e)).toBe(GATE_ERRORS.ratelimit);
  });
  it('OfflineError / jaringan ke service → err.network', () => {
    expect(gateErrorText(new OfflineError())).toBe(GATE_ERRORS.network);
    expect(gateErrorText(new ApiError('EXPORT_FAILED', 'service auth tidak bisa dihubungi', '', 500))).toBe(GATE_ERRORS.network);
  });
  it('SCHEMA_INVALID soal email → err.email', () => {
    expect(gateErrorText(new ApiError('SCHEMA_INVALID', 'email tidak valid', '', 400))).toBe(GATE_ERRORS.email);
    // SCHEMA_INVALID tanpa konteks email tetap generic.
    expect(gateErrorText(new ApiError('SCHEMA_INVALID', 'provider tidak dikenal', '', 400))).toBe(GATE_ERRORS.generic);
  });
  it('error lain / non-ApiError → err.generic + console.warn (bukan ApiError)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(gateErrorText(new ApiError('EXPORT_FAILED', 'detail teknis apa pun', '', 500))).toBe(GATE_ERRORS.generic);
    expect(gateErrorText(new Error('weird'))).toBe(GATE_ERRORS.generic);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('initialsOf', () => {
  it('nama dua kata → dua inisial; satu kata/email → dua huruf pertama', () => {
    expect(initialsOf({ id: 'u1', email: 'ana@studio.id', name: 'Ana Putri' })).toBe('AP');
    expect(initialsOf({ id: 'u1', email: 'ana@studio.id', name: 'Madonna' })).toBe('MA');
    expect(initialsOf({ id: 'u1', email: 'ana@studio.id' })).toBe('AN');
  });
});

describe('sessionExpired (E4)', () => {
  it('noteStatus menyimpan user terakhir; markExpired → snapshot expired; sign-in baru membersihkan', () => {
    const user = { id: 'u1', email: 'ana@studio.id', name: 'Ana Putri' };
    sessionExpired.noteStatus({ signedIn: true, configured: true, user });
    expect(sessionExpired.getSnapshot()).toEqual({ expired: false, user });

    const seen: number[] = [];
    const off = sessionExpired.subscribe(() => seen.push(1));
    sessionExpired.markExpired();
    sessionExpired.markExpired(); // transisi saja yang memberi tahu
    expect(sessionExpired.getSnapshot().expired).toBe(true);
    expect(seen).toHaveLength(1);

    sessionExpired.noteStatus({ signedIn: true, configured: true, user });
    expect(sessionExpired.getSnapshot().expired).toBe(false);
    off();
  });
});
