// ShareDialog (plan-share-link-ui): alur mount (list→auto-create), toggle izin → PATCH optimistic
// (gagal → revert + error), Expires select → expiresAt, Revoke dua langkah, Update snapshot → refresh.
// Daemon diganti `dom().daemon` (FakeDaemon) per route `/viewer/*`.
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShareDialog } from './ShareDialog';
import { dom, renderUi } from './test/dom';
import type { ShareLink } from './api';

const SLUG = 'my-landing';
const link = (over: Partial<ShareLink> = {}): ShareLink => ({
  token: 'tok_a',
  slug: SLUG,
  title: 'My Landing',
  permissions: { comment: true, download: false },
  url: `https://share.example/s/tok_a`,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  views: 12,
  boards: [{ id: 'b1', name: 'Board', w: 100, h: 100 }],
  ...over,
});

/** Pasang route GET shares; `shares()` dipanggil ulang tiap fetch (reload sesudah aksi). */
function stubList(shares: () => ShareLink[] | ShareLink, configured = true) {
  dom()
    .daemon.on('GET', `/viewer/docs/${SLUG}/shares`, () => {
      const s = shares();
      return { configured, host: 'share.example', shares: Array.isArray(s) ? s : [s] };
    });
}

describe('ShareDialog', () => {
  it('cloud tidak dikonfigurasi → pesan not configured + Done, tanpa aksi lain', async () => {
    stubList(() => [], false);
    renderUi(<ShareDialog slug={SLUG} onClose={vi.fn()} />);
    expect(await screen.findByText(/isn't configured/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(dom().daemon.find('POST', /^\/viewer\/docs\//)).toHaveLength(0);
  });

  it('share aktif: URL di field, "This link", meta views/boards, footer Stored on', async () => {
    stubList(() => link());
    renderUi(<ShareDialog slug={SLUG} onClose={vi.fn()} />);
    const input = await screen.findByLabelText<HTMLInputElement>('Share link');
    expect(input.value).toBe('https://share.example/s/tok_a');
    expect(screen.getByText('This link')).toBeInTheDocument();
    expect(screen.getByText(/1 link · 12 views/)).toBeInTheDocument();
    expect(screen.getByText(/Stored on share\.example/)).toBeInTheDocument();
  });

  it('tanpa link: auto POST share lalu list ulang → link baru tampil', async () => {
    let created = false;
    stubList(() => (created ? [link({ token: 'tok_baru', url: 'https://share.example/s/tok_baru' })] : []));
    dom()
      .daemon.on('POST', `/viewer/docs/${SLUG}/share`, () => {
        created = true;
        return { token: 'tok_baru', url: 'https://share.example/s/tok_baru', boards: 1 };
      });
    renderUi(<ShareDialog slug={SLUG} onClose={vi.fn()} />);
    expect(await screen.findByDisplayValue('https://share.example/s/tok_baru')).toBeInTheDocument();
    expect(dom().daemon.find('POST', `/viewer/docs/${SLUG}/share`)).toHaveLength(1);
  });

  it('toggle Can comment → PATCH permissions; gagal → revert + pesan error', async () => {
    stubList(() => link());
    let patchOk = true;
    dom()
      .daemon.on('PATCH', /^\/viewer\/shares\/tok_a$/, () => {
        if (!patchOk) throw new Error('service down');
        return {};
      });
    const { user } = renderUi(<ShareDialog slug={SLUG} onClose={vi.fn()} />);
    const sw = await screen.findByRole('switch', { name: 'Can comment' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await user.click(sw);
    await waitFor(() => expect(dom().daemon.find('PATCH', /^\/viewer\/shares\/tok_a$/)).toHaveLength(1));
    expect(dom().daemon.find('PATCH', /^\/viewer\/shares\/tok_a$/)[0]!.body).toEqual({ permissions: { comment: false } });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    // Gagal → kembali ke false + error tampil.
    patchOk = false;
    await user.click(sw);
    await waitFor(() => expect(dom().daemon.find('PATCH', /^\/viewer\/shares\/tok_a$/)).toHaveLength(2));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('Expires "Never" → PATCH expiresAt:null', async () => {
    stubList(() => link());
    dom()
      .daemon.on('PATCH', /^\/viewer\/shares\//, () => ({}));
    const { user } = renderUi(<ShareDialog slug={SLUG} onClose={vi.fn()} />);
    const sel = await screen.findByLabelText<HTMLSelectElement>('Link expiry');
    await user.selectOptions(sel, 'never');
    await waitFor(() => expect(dom().daemon.find('PATCH', /^\/viewer\/shares\//)[0]?.body).toEqual({ expiresAt: null }));
  });

  it('link kedaluwarsa → select Expires menampilkan "Expired" (bukan bucket menyesatkan)', async () => {
    stubList(() => link({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    renderUi(<ShareDialog slug={SLUG} onClose={vi.fn()} />);
    const sel = await screen.findByLabelText<HTMLSelectElement>('Link expiry');
    expect(sel.value).toBe('expired');
    expect(screen.getByRole('option', { name: 'Expired' })).toBeInTheDocument();
    // Chip "Expired" di baris link tetap tampil.
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0);
  });

  it('Revoke dua langkah → DELETE → baris hilang; link lain pindah jadi "this link"', async () => {
    let revoked = false;
    stubList(() => [link(), link({ token: 'tok_b', url: 'https://share.example/s/tok_b' })].filter((s) => !(revoked && s.token === 'tok_a')));
    dom()
      .daemon.on('DELETE', /^\/viewer\/shares\/tok_a$/, () => {
        revoked = true;
        return { token: 'tok_a', revoked: true };
      });
    const { user } = renderUi(<ShareDialog slug={SLUG} onClose={vi.fn()} />);
    const revoke = (await screen.findAllByRole('button', { name: 'Revoke' }))[0]!;
    await user.click(revoke);
    await user.click(screen.getByRole('button', { name: 'Yes, revoke' }));
    await waitFor(() => expect(dom().daemon.find('DELETE', /^\/viewer\/shares\/tok_a$/)).toHaveLength(1));
    // List reload: tok_b jadi "this link" pertama yang tersisa.
    expect(await screen.findByDisplayValue('https://share.example/s/tok_b')).toBeInTheDocument();
  });

  it('Update snapshot → POST refresh {slug}; catatan berubah "updated just now"', async () => {
    stubList(() => link());
    dom()
      .daemon.on('POST', /^\/viewer\/shares\/tok_a\/refresh$/, () => ({ token: 'tok_a', url: 'https://share.example/s/tok_a', boards: 1 }));
    const { user } = renderUi(<ShareDialog slug={SLUG} onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /Update snapshot/ }));
    await waitFor(() => expect(dom().daemon.find('POST', /^\/viewer\/shares\/tok_a\/refresh$/)).toHaveLength(1));
    expect(dom().daemon.find('POST', /^\/viewer\/shares\/tok_a\/refresh$/)[0]!.body).toEqual({ slug: SLUG });
    expect(await screen.findByText('Snapshot updated just now')).toBeInTheDocument();
  });
});
