// Account chip di sidebar Dashboard (spec-first-run-signin task E): empat state — signed-in
// (avatar inisial + nama/email, link Connections), signed-out+configured (blok lama + Sign in),
// session expired (user terakhir + titik warning + "Session expired"), dan fallback (blok lama)
// untuk cloud off / status gagal / daemon tanpa auth. SSE `auth` me-refresh state.
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccountChip } from './AccountChip';
import type { AuthStatus, CloudUser } from './api';
import { dom, fail, renderUi, stream } from './test/dom';

const USER: CloudUser = { id: 'u1', email: 'ana@studio.id', name: 'Ana Putri' };

function daemonAuth(status: Partial<AuthStatus> | 'fail') {
  const d = dom().daemon;
  d.on('GET', '/viewer/auth/status', () => {
    if (status === 'fail') throw fail('EXPORT_FAILED', 500);
    return { signedIn: false, configured: true, ...status };
  });
  return d;
}

const chip = () => document.querySelector<HTMLAnchorElement>('a.account-chip')!;

describe('AccountChip — empat state', () => {
  it('signed in → avatar inisial + nama + email, baris adalah link ke Connections', async () => {
    daemonAuth({ signedIn: true, user: USER });
    renderUi(<AccountChip />);
    await waitFor(() => expect(screen.getByText('Ana Putri')).toBeInTheDocument());
    expect(screen.getByText('ana@studio.id')).toBeInTheDocument();
    expect(document.querySelector('.cloud-avatar')?.textContent).toBe('AP');
    expect(chip().getAttribute('aria-label')).toBe('Lakar Cloud account: Ana Putri');
    expect(chip().getAttribute('href')).toBe('#/settings/connections');
  });

  it('signed out + configured → blok lama + tombol Sign in ke Connections', async () => {
    daemonAuth({ signedIn: false });
    renderUi(<AccountChip />);
    await waitFor(() => expect(screen.getByText('Sign in')).toBeInTheDocument());
    expect(screen.getByText('Lakar')).toBeInTheDocument();
    expect(chip().getAttribute('href')).toBe('#/settings/connections');
  });

  it('cloud off / status gagal → blok lama persis, tanpa tombol Sign in', async () => {
    daemonAuth({ configured: false });
    const { unmount } = renderUi(<AccountChip />);
    await waitFor(() => expect(screen.getByText('Lakar')).toBeInTheDocument());
    await waitFor(() => expect(dom().daemon.find('GET', '/viewer/auth/status')).toHaveLength(1));
    expect(screen.queryByText('Sign in')).not.toBeInTheDocument();
    unmount();

    daemonAuth('fail');
    renderUi(<AccountChip />);
    await waitFor(() => expect(dom().daemon.find('GET', '/viewer/auth/status')).toHaveLength(2));
    expect(screen.queryByText('Sign in')).not.toBeInTheDocument();
    expect(screen.getByText('Lakar')).toBeInTheDocument();
  });

  it('session expired (E4) → user terakhir + titik warning + "Session expired"; sign-in baru membersihkan', async () => {
    // signed-in dulu supaya profil terakhir tercatat, lalu event expired.
    daemonAuth({ signedIn: true, user: USER });
    renderUi(<AccountChip />);
    stream.hello();
    await waitFor(() => expect(screen.getByText('Ana Putri')).toBeInTheDocument());

    // Service mencabut session: daemon menghapus session.json → status berikutnya signed-out.
    daemonAuth({ signedIn: false });
    stream.event('auth', { auth: { signedIn: false, reason: 'expired' } });
    await waitFor(() => expect(screen.getByText('Session expired')).toBeInTheDocument());
    expect(document.querySelector('.account-chip-dot')).not.toBeNull();
    expect(screen.getByText('Ana Putri')).toBeInTheDocument();
    expect(screen.queryByText('Sign in')).not.toBeInTheDocument();

    // Sign-in baru → kembali ke state signed-in.
    daemonAuth({ signedIn: true, user: USER });
    stream.event('auth', { auth: { signedIn: true, user: USER } });
    await waitFor(() => expect(screen.getByText('ana@studio.id')).toBeInTheDocument());
    expect(screen.queryByText('Session expired')).not.toBeInTheDocument();
  });
});
