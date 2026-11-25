// Gate sign-in first-run (spec-first-run-signin task D): S1 provider/email, S2 menunggu OAuth,
// S3 magic link terkirim + cooldown resend, S4 cloud tak menjawab (Continue offline tidak POST),
// S5 sukses dari SSE `auth` (jendela mana pun), skip permanen via POST /viewer/onboarding (E5:
// POST gagal tetap menutup + toast), E9 skip jendela lain menutup gate ini, Esc tidak menutup.
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthStatus, CloudUser } from './api';
import { OnboardingGate } from './OnboardingGate';
import { dom, fail, renderUi, stream } from './test/dom';

const USER: CloudUser = { id: 'u1', email: 'ana@studio.id', name: 'Ana Putri' };

const base: AuthStatus = { signedIn: false, configured: true, providers: ['google', 'github', 'email'], host: 'api.lakar.dev', onboarding: { signin: 'pending' } };

function renderGate(status: Partial<AuthStatus> = {}) {
  const onDone = vi.fn();
  const onRetry = vi.fn();
  const onToast = vi.fn();
  const ui = renderUi(<OnboardingGate status={{ ...base, ...status }} onDone={onDone} onRetry={onRetry} onToast={onToast} />);
  stream.hello();
  return { ...ui, onDone, onRetry, onToast };
}

const title = () => document.querySelector('#onboarding-title')?.textContent;

describe('OnboardingGate — S1 `out`', () => {
  it('menampilkan judul, benefit, tiga metode (Google/GitHub/email), dan skip yang tidak pernah disabled', () => {
    renderGate();
    expect(title()).toBe('Welcome to Lakar');
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    const skip = screen.getByRole<HTMLButtonElement>('button', { name: 'Continue without an account' });
    expect(skip.disabled).toBe(false);
    expect(document.body.textContent).toContain('Lakar Cloud · api.lakar.dev');
  });

  it('provider yang tidak diiklankan tidak dirender; hanya email → tanpa divider "or"', () => {
    renderGate({ providers: ['email'] });
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
    expect(screen.queryByText('or')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
  });

  it('Esc tidak menutup gate (skip permanen harus disengaja)', async () => {
    const { user, onDone } = renderGate();
    await user.keyboard('{Escape}');
    expect(onDone).not.toHaveBeenCalled();
    expect(title()).toBe('Welcome to Lakar');
  });
});

describe('OnboardingGate — skip permanen', () => {
  it('klik → POST /viewer/onboarding {signin:skipped} → onDone skipped', async () => {
    const d = dom().daemon;
    d.on('POST', '/viewer/onboarding', () => ({ signin: 'skipped' }));
    const { user, onDone } = renderGate();
    await user.click(screen.getByRole('button', { name: 'Continue without an account' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('skipped'));
    expect(d.find('POST', '/viewer/onboarding').map((r) => r.body)).toEqual([{ signin: 'skipped' }]);
  });

  it('POST gagal (E5) → gate tetap ditutup + toast err.skip, tidak menjebak', async () => {
    dom().daemon.on('POST', '/viewer/onboarding', () => {
      throw fail('INTERNAL', 500);
    });
    const { user, onDone, onToast } = renderGate();
    await user.click(screen.getByRole('button', { name: 'Continue without an account' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('skipped'));
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('save this choice'));
  });

  it('event auth dari jendela lain membawa onboarding (E9) → gate menutup tanpa S5', async () => {
    const { onDone } = renderGate();
    stream.event('auth', { auth: { signedIn: false, onboarding: 'skipped' } });
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('skipped'));
    expect(title()).not.toBe('You’re signed in');
  });
});

describe('OnboardingGate — S2 `waiting` (OAuth)', () => {
  it('klik Google → auth/start → buka URL → S2; Cancel kembali ke S1; SSE signedIn → S5', async () => {
    const d = dom().daemon;
    d.on('POST', '/viewer/auth/start', (req) => ((req.body as { provider: string }).provider === 'email' ? { sent: true } : { url: 'https://api.lakar.dev/api/auth/google?nonce=n1' }));
    const { user, onDone } = renderGate();
    const popup = vi.spyOn(window, 'open').mockReturnValue({ location: {} } as unknown as Window);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(title()).toBe('Finish signing in in your browser'));
    expect(document.body.textContent).toContain('a Google sign-in page');
    popup.mockRestore();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(title()).toBe('Welcome to Lakar');

    // Callback tetap datang sesudah Cancel → S5 (E14).
    stream.event('auth', { auth: { signedIn: true, user: USER } });
    await waitFor(() => expect(title()).toBe('You’re signed in'));
    expect(document.body.textContent).toContain('Ana Putri · ana@studio.id');
    await user.click(screen.getByRole('button', { name: 'Open Lakar' }));
    expect(onDone).toHaveBeenCalledWith('signedIn');
  });

  it('S5 tanpa klik → auto onDone signedIn sesudah jeda singkat', async () => {
    const { onDone } = renderGate();
    stream.event('auth', { auth: { signedIn: true, user: USER } });
    await waitFor(() => expect(title()).toBe('You’re signed in'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('signedIn'), { timeout: 3_000 });
  });
});

describe('OnboardingGate — S3 `sent` (magic link)', () => {
  it('submit email → auth/start → S3; resend terkunci 30 dtk; "Use a different email" → S1', async () => {
    const bodies: unknown[] = [];
    dom().daemon.on('POST', '/viewer/auth/start', (req) => {
      bodies.push(req.body);
      return { sent: true };
    });
    const { user } = renderGate();
    await user.type(screen.getByPlaceholderText('you@example.com'), 'ana@studio.id');
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    await waitFor(() => expect(title()).toBe('Check your email'));
    expect(bodies).toEqual([{ provider: 'email', email: 'ana@studio.id' }]);
    expect(document.body.textContent).toContain('Open it on this computer');

    const resend = screen.getByRole<HTMLButtonElement>('button', { name: /^Resend in / });
    expect(resend.disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(title()).toBe('Welcome to Lakar');
  });

  it('rate limit 429 (E6) → err.ratelimit inline, tetap di S1', async () => {
    dom().daemon.on('POST', '/viewer/auth/start', () => {
      throw fail('EXPORT_FAILED', 500, 'service auth membatasi magic link (HTTP 429): slow down');
    });
    const { user } = renderGate();
    await user.type(screen.getByPlaceholderText('you@example.com'), 'ana@studio.id');
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Too many sign-in emails. Wait a few minutes, then try again.'));
    expect(title()).toBe('Welcome to Lakar');
  });
});

describe('OnboardingGate — S4 `unreachable` / S4b `no-methods`', () => {
  it('providers hilang → pesan offline + Try again (onRetry) + Continue offline (onDone offline, tanpa POST)', async () => {
    const { user, onDone, onRetry } = renderGate({ providers: undefined });
    expect(title()).toBe('Welcome to Lakar');
    expect(document.body.textContent).toContain('Can’t reach Lakar Cloud');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Continue offline' }));
    expect(onDone).toHaveBeenCalledWith('offline');
    expect(dom().daemon.find('POST', '/viewer/onboarding')).toHaveLength(0);
  });

  it('providers [] → no-methods: tanpa tombol provider, skip tetap tersedia', async () => {
    const d = dom().daemon;
    d.on('POST', '/viewer/onboarding', () => ({ signin: 'skipped' }));
    const { user, onDone } = renderGate({ providers: [] });
    expect(document.body.textContent).toContain('No sign-in methods are available on this service yet.');
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue without an account' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('skipped'));
  });
});
