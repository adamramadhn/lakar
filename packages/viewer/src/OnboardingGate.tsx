// Gate sign-in first-run (spec-first-run-signin task D): layar penuh pengganti <main> Dashboard
// selama `shouldShowGate` benar. S1 `out` (provider/email) → S2 `waiting` (OAuth di browser) →
// S3 `sent` (magic link terkirim, resend dikunci 30 dtk) → S5 `success` (auto-lanjut 1,5 dtk);
// S4 `unreachable` (service tak menjawab: Try again) dan S4b `no-methods`. Sign-in wajib: tidak
// ada jalur skip/offline — penanda `skipped` lama di daemon tetap dihormati (back-compat), tapi
// UI tak lagi menawarkannya. Gate adalah halaman, bukan dialog: tanpa Esc/klik-luar dan tanpa
// autofocus di S1; perpindahan state memindahkan fokus ke judul baru. SSE `auth` ditangani di
// sini: `signedIn:true` → S5 + fokus jendela desktop (E8); `onboarding` ≠ pending dari jendela
// lain → tutup (E9).
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { activityHub } from './activity';
import { type AuthStatus, type CloudUser } from './api';
import { GATE_ERRORS, gateErrorText } from './cloudAuth';
import { focusWindow } from './desktop';
import { useNow } from './hooks';
import { BrandIcon, Icon, LakarMark } from './icons';
import { useCloudSignIn } from './useCloudSignIn';

/** Gate hanya tertutup oleh sign-in — tanpa jalur skip/offline. */
export type GateDoneReason = 'signedIn';

/** Tampilan gate = gabungan fase hook sign-in + kondisi `status.providers` + sukses (S5). */
type GateView = 'out' | 'waiting' | 'sent' | 'unreachable' | 'no-methods' | 'success';

const EMAIL_OK = /^\S+@\S+\.\S+$/;
/** Kunci resend magic link di klien — melengkapi rate limit service 5/15 menit (E6). */
const RESEND_COOLDOWN_MS = 30_000;
/** S5 tampil singkat lalu otomatis masuk workspace. */
const SUCCESS_DELAY_MS = 1500;

const OAUTH: readonly ('google' | 'github')[] = ['google', 'github'];

export function OnboardingGate({
  status,
  onDone,
  onRetry,
}: {
  status: AuthStatus;
  onDone: (reason: GateDoneReason) => void;
  /** Muat ulang `authStatus` (Try again di S4 — cache providers daemon hanya menyimpan sukses). */
  onRetry: () => void;
}): ReactElement {
  const signin = useCloudSignIn({ formatError: gateErrorText });
  const [email, setEmail] = useState('');
  /** Error validasi alamat email lokal — ditampilkan di baris hint form. */
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [successUser, setSuccessUser] = useState<CloudUser | undefined>(undefined);
  /** Waktu kirim/resend magic link terakhir — dasar hitung mundur `Resend in m:ss`. */
  const [lastSentAt, setLastSentAt] = useState(0);
  const now = useNow(successUser === undefined && signin.phase === 'sent' ? 1000 : 60_000);

  const providers = status.providers;
  const offered = (p: 'google' | 'github' | 'email') => providers?.includes(p) ?? false;
  const oauth = OAUTH.filter(offered);
  /** Error form email: validasi lokal lebih dulu, lalu error sign-in (OAuth/gagal kirim). */
  const formError = emailError ?? signin.error;
  const view: GateView =
    successUser !== undefined ? 'success' : providers === undefined ? 'unreachable' : providers.length === 0 ? 'no-methods' : signin.phase;

  // Perpindahan state → fokus ke judul baru (pembaca layar mengumumkannya). Mount awal tidak
  // memindahkan fokus: halaman terbaca dari atas secara alami (spec: autofocus tidak ada).
  const titleRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) titleRef.current?.focus();
    else mounted.current = true;
  }, [view]);

  // SSE `auth`: sign-in selesai di jendela/tab mana pun → S5; penanda berubah di jendela lain → tutup.
  useEffect(
    () =>
      activityHub.listen({
        onEvent: (e) => {
          if (e.type !== 'auth') return;
          if (e.auth.signedIn) {
            setSuccessUser(e.auth.user ?? { id: '', email: '' });
            void focusWindow();
          } else if (e.auth.onboarding !== undefined) {
            onDone('signedIn');
          }
        },
      }),
    [onDone],
  );

  // S5: auto-lanjut ke workspace sesudah jeda singkat (atau langsung lewat "Open Lakar").
  useEffect(() => {
    if (successUser === undefined) return;
    const t = setTimeout(() => onDone('signedIn'), SUCCESS_DELAY_MS);
    return () => clearTimeout(t);
  }, [successUser, onDone]);

  const resendIn = Math.max(0, RESEND_COOLDOWN_MS - (now - lastSentAt));

  const send = async (to: string) => {
    setLastSentAt(Date.now());
    await signin.sendLink(to);
  };

  const brand = (
    <div className="onboarding-brand">
      <span className="onboarding-logo" aria-hidden="true">
        <LakarMark size={24} />
      </span>
      <span className="onboarding-wordmark">Lakar</span>
    </div>
  );

  let body: ReactElement;
  if (view === 'unreachable') {
    body = (
      <>
        <div>
          <h1 id="onboarding-title" ref={titleRef} tabIndex={-1} className="onboarding-title">
            Welcome to Lakar
          </h1>
          <p className="onboarding-tagline">The design canvas your coding agents drive.</p>
        </div>
        <p className="cloud-empty onboarding-note" role="note">
          <Icon name="alert" size={15} />
          Can’t reach Lakar Cloud right now. Check your connection and try again.
        </p>
        <div className="onboarding-actions">
          <button type="button" className="btn" onClick={onRetry}>
            <Icon name="rotateCcw" size={14} />
            Try again
          </button>
        </div>
      </>
    );
  } else if (view === 'no-methods') {
    body = (
      <>
        <div>
          <h1 id="onboarding-title" ref={titleRef} tabIndex={-1} className="onboarding-title">
            Welcome to Lakar
          </h1>
          <p className="onboarding-tagline">The design canvas your coding agents drive.</p>
        </div>
        <p className="cloud-empty onboarding-note" role="note">
          No sign-in methods are available on this service yet.
        </p>
        <div className="onboarding-actions">
          <button type="button" className="btn" onClick={onRetry}>
            <Icon name="rotateCcw" size={14} />
            Try again
          </button>
        </div>
      </>
    );
  } else if (view === 'waiting') {
    const provider = signin.waitingProvider === 'github' ? 'GitHub' : 'Google';
    body = (
      <>
        <div>
          <h1 id="onboarding-title" ref={titleRef} tabIndex={-1} className="onboarding-title">
            Finish signing in in your browser
          </h1>
          <p className="onboarding-tagline">We opened a {provider} sign-in page in your default browser. Come back here when you’re done.</p>
        </div>
        <p className="cloud-note" aria-live="polite">
          <Icon name="loaderCircle" size={14} className="spin" />
          Waiting for sign-in…
        </p>
        <div className="onboarding-actions">
          <button type="button" className="btn" onClick={() => void signin.reopen()}>
            Open browser again
          </button>
          <button type="button" className="btn" onClick={signin.cancel}>
            Cancel
          </button>
        </div>
      </>
    );
  } else if (view === 'sent') {
    body = (
      <>
        <div>
          <h1 id="onboarding-title" ref={titleRef} tabIndex={-1} className="onboarding-title">
            Check your email
          </h1>
          <p className="onboarding-tagline">
            We sent a sign-in link to <strong className="onboarding-email">{signin.sentTo}</strong>
          </p>
          <p className="onboarding-tagline">Open it on this computer — the link signs in this copy of Lakar and expires in 15 minutes.</p>
        </div>
        <div className="onboarding-actions">
          <button type="button" className="btn" disabled={resendIn > 0} onClick={() => void send(signin.sentTo)}>
            {resendIn > 0 ? `Resend in ${Math.floor(resendIn / 60_000)}:${String(Math.ceil((resendIn % 60_000) / 1000)).padStart(2, '0')}` : 'Resend'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setEmail(signin.sentTo);
              setEmailError(undefined);
              signin.cancel();
            }}
          >
            Use a different email
          </button>
        </div>
      </>
    );
  } else if (view === 'success') {
    const u = successUser!;
    const name = u.name?.trim();
    body = (
      <div className="onboarding-success">
        <Icon name="circleCheck" size={32} className="onboarding-success-icon" />
        <div>
          <h1 id="onboarding-title" ref={titleRef} tabIndex={-1} className="onboarding-title">
            You’re signed in
          </h1>
          <p className="onboarding-tagline">{name ? `${name} · ${u.email}` : u.email}</p>
        </div>
        <button type="button" className="btn primary" data-autofocus onClick={() => onDone('signedIn')}>
          Open Lakar
        </button>
      </div>
    );
  } else {
    // S1 `out`: benefit + provider + email + skip (semua metode setara visual — tanpa `primary`).
    body = (
      <>
        <div>
          <h1 id="onboarding-title" ref={titleRef} tabIndex={-1} className="onboarding-title">
            Welcome to Lakar
          </h1>
          <p className="onboarding-tagline">The design canvas your coding agents drive.</p>
        </div>
        <ul className="onboarding-benefits">
          <li>
            <Icon name="link" size={16} />
            Share snapshots with a link — viewers never need an account.
          </li>
          <li>
            <Icon name="radio" size={16} />
            Review designs live with others in rooms.
          </li>
          <li>
            <Icon name="shieldCheck" size={16} />
            Your files stay on this device.
          </li>
        </ul>
        <div className="onboarding-providers">
          {oauth.map((p) => (
            <button key={p} type="button" className="btn cloud-btn" disabled={signin.busy !== undefined} onClick={() => void signin.start(p)}>
              <BrandIcon name={p} size={16} />
              {signin.busy === p ? 'Opening…' : p === 'google' ? 'Continue with Google' : 'Continue with GitHub'}
            </button>
          ))}
          {offered('email') && oauth.length > 0 && (
            <div className="onboarding-divider" role="separator">
              <span>or</span>
            </div>
          )}
          {offered('email') && (
            <form
              className="cloud-email onboarding-email"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const value = email.trim();
                if (!EMAIL_OK.test(value)) {
                  setEmailError(GATE_ERRORS.email);
                  return;
                }
                setEmailError(undefined);
                void send(value);
              }}
            >
              <div className="onboarding-email-row">
                <label className="input onboarding-email-field">
                  <Icon name="mail" size={14} />
                  <input
                    type="email"
                    aria-label="Email address"
                    aria-describedby="onboarding-email-hint"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError(undefined);
                    }}
                  />
                </label>
                <button type="submit" className="btn" disabled={signin.busy !== undefined}>
                  {signin.busy === 'email' ? 'Sending…' : 'Send link'}
                </button>
              </div>
              <p
                id="onboarding-email-hint"
                className={formError ? 'onboarding-email-hint danger' : 'onboarding-email-hint'}
                role={formError ? 'alert' : undefined}
              >
                {formError ?? 'We’ll email you a sign-in link. No password needed.'}
              </p>
            </form>
          )}
        </div>
      </>
    );
  }

  return (
    <main className="onboarding" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        {brand}
        {body}
      </div>
    </main>
  );
}
