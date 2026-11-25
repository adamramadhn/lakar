// Hook bersama alur sign-in Lakar Cloud (spec-first-run-signin task C): state machine
// `out → waiting → sent` + busy/error/sentTo dipakai CloudAuthCard (Connections), ShareDialog
// (CTA sign-in), dan OnboardingGate — satu implementasi, bukan tiga salinan. Event SSE `auth`
// sengaja ditangani pemanggil (masing-masing punya reaksi beda: reload status, tutup gate).
import { useRef, useState } from 'react';
import { api, errorText } from './api';
import { GATE_ERRORS } from './cloudAuth';
import { isDesktop, openExternal } from './desktop';

/** Fase alur sign-in: tombol (out) → menunggu callback browser (waiting) → magic link terkirim (sent). */
export type SignInPhase = 'out' | 'waiting' | 'sent';

export type CloudSignInOptions = {
  /** Pemetaan error → teks UI (Connections: `errorText` teknis; gate: `gateErrorText` copy). */
  formatError?: (e: unknown) => string;
  /** Pesan saat `window.open` diblokir browser (copy gate bila dipakai di sana). */
  popupError?: string;
  /** Pesan saat service tidak mengembalikan URL OAuth (copy gate bila dipakai di sana). */
  noUrlError?: string;
};

export type CloudSignIn = {
  phase: SignInPhase;
  setPhase: (p: SignInPhase) => void;
  /** Operasi yang sedang jalan ('google'|'github'|'email') — tombol lain disabled selama busy. */
  busy: string | undefined;
  error: string | undefined;
  setError: (e: string | undefined) => void;
  /** Alamat tujuan magic link terakhir (untuk Resend). */
  sentTo: string;
  /** Provider OAuth yang terakhir dibuka (untuk copy "…a {Google|GitHub} sign-in page"). */
  waitingProvider: 'google' | 'github' | undefined;
  /** Buka alur OAuth: URL dibuka di browser sistem; fase → `waiting` saat berhasil. */
  start: (provider: 'google' | 'github') => Promise<void>;
  /** Buka ulang URL OAuth terakhir ("Open browser again" — nonce valid 15 menit). */
  reopen: () => Promise<void>;
  /** Kirim magic link ke alamat; fase → `sent` saat berhasil. */
  sendLink: (to: string) => Promise<void>;
  /** Kembali ke fase `out` (Cancel waiting / "Use a different email"). */
  cancel: () => void;
  /** Bersihkan semua state (sign-out selesai). */
  reset: () => void;
};

/**
 * OAuth: `{url}` dari daemon dibuka di browser sistem; sign-in selesai lewat SSE `auth` (atau Cancel).
 * Di desktop `window.open` no-op → URL dibuka lewat opener Tauri sesudah fetch. Di browser, jendela
 * kosong dibuka sinkron di click handler (masih dalam user activation) lalu diarahkan sesudah fetch —
 * `null` = pop-up diblokir; kegagalan fetch menutup jendela itu lagi.
 */
export function useCloudSignIn(opts: CloudSignInOptions = {}): CloudSignIn {
  const formatError = opts.formatError ?? errorText;
  const popupError = opts.popupError ?? GATE_ERRORS.popup;
  const noUrlError = opts.noUrlError ?? 'The sign-in service did not return a URL — try another method.';
  const [phase, setPhase] = useState<SignInPhase>('out');
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [sentTo, setSentTo] = useState('');
  const [waitingProvider, setWaitingProvider] = useState<'google' | 'github' | undefined>(undefined);
  /** URL OAuth terakhir — "Open browser again" memakai nonce yang sama (masih valid 15 menit). */
  const lastUrl = useRef<string | undefined>(undefined);

  const start = async (provider: 'google' | 'github') => {
    if (busy) return;
    setBusy(provider);
    setError(undefined);
    const desktop = isDesktop();
    const w = desktop ? undefined : window.open('about:blank', '_blank');
    if (w === null) {
      setBusy(undefined);
      setError(popupError);
      return;
    }
    try {
      const r = await api.authStart({ provider });
      if ('url' in r) {
        if (desktop) await openExternal(r.url);
        else w!.location.href = r.url;
        lastUrl.current = r.url;
        setWaitingProvider(provider);
        setPhase('waiting');
      } else {
        w?.close();
        setError(noUrlError);
      }
    } catch (e) {
      w?.close();
      setError(formatError(e));
    } finally {
      setBusy(undefined);
    }
  };

  const reopen = async () => {
    const url = lastUrl.current;
    if (!url) return;
    if (isDesktop()) await openExternal(url).catch(() => {});
    else window.open(url, '_blank');
  };

  /** Magic link: `{sent:true}` → fase `sent` (email tujuan disimpan untuk Resend — tanpa polling). */
  const sendLink = async (to: string) => {
    const target = to.trim();
    if (busy || !target) return;
    setBusy('email');
    setError(undefined);
    try {
      await api.authStart({ provider: 'email', email: target });
      setSentTo(target);
      setPhase('sent');
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(undefined);
    }
  };

  const cancel = () => setPhase('out');

  const reset = () => {
    setPhase('out');
    setSentTo('');
    setWaitingProvider(undefined);
    lastUrl.current = undefined;
    setError(undefined);
  };

  return { phase, setPhase, busy, error, setError, sentTo, waitingProvider, start, reopen, sendLink, cancel, reset };
}
