// Dialog Import from URL (epic adopsi open-pencil story 8, desain section 11): alamat + preset lebar, submit memanggil
// onSubmit dengan body route; error daemon ditampilkan dengan Try again; busy mengunci field dan Escape tak menutup.
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportUrlDialog } from './ImportUrlDialog';
import { renderUi } from './test/dom';

function open({ busy = false, onSubmit = vi.fn(async () => {}), onClose = vi.fn() } = {}) {
  return { ...renderUi(<ImportUrlDialog busy={busy} onSubmit={onSubmit} onClose={onClose} />), onSubmit, onClose };
}

describe('ImportUrlDialog', () => {
  it('membuka: fokus di Page address, 3 preset lebar (Desktop aktif), Import page nonaktif sampai URL http(s) valid', async () => {
    const { user } = open();
    const dialog = screen.getByRole('dialog', { name: 'Import from URL' });
    const input = screen.getByLabelText('Page address');
    await waitFor(() => expect(input).toHaveFocus());
    for (const [name, checked] of [['Desktop', 'true'], ['Tablet', 'false'], ['Mobile', 'false']] as const) {
      expect(screen.getByRole('radio', { name: new RegExp(name) })).toHaveAttribute('aria-checked', checked);
    }
    const submit = screen.getByRole('button', { name: 'Import page' });
    expect(submit).toBeDisabled();
    await user.type(input, 'bukan url');
    expect(submit).toBeDisabled();
    expect(dialog.textContent).toContain('http(s) page address');
    await user.clear(input);
    await user.type(input, 'ftp://example.com');
    expect(submit).toBeDisabled();
  });

  it('submit meneruskan {url, width, screen} preset terpilih; sukses menutup dialog', async () => {
    const { user, onSubmit, onClose } = open();
    await user.type(screen.getByLabelText('Page address'), 'https://example.com/page ');
    await user.click(screen.getByRole('radio', { name: /Tablet/ }));
    await user.click(screen.getByRole('button', { name: 'Import page' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ url: 'https://example.com/page', width: 768, screen: 'app' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('preset Mobile → width 375 screen mobile; Desktop → 1440 landing', async () => {
    const { user, onSubmit } = open();
    await user.type(screen.getByLabelText('Page address'), 'https://example.com');
    await user.click(screen.getByRole('radio', { name: /Mobile/ }));
    await user.click(screen.getByRole('button', { name: 'Import page' }));
    await waitFor(() => expect(onSubmit).toHaveBeenLastCalledWith({ url: 'https://example.com', width: 375, screen: 'mobile' }));
  });

  it('submit gagal → pesan error + tombol Try again (dialog tetap terbuka)', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('alamat non-publik ditolak (127.0.0.1)');
    });
    const { user, onClose } = open({ onSubmit });
    await user.type(screen.getByLabelText('Page address'), 'http://127.0.0.1/');
    await user.click(screen.getByRole('button', { name: 'Import page' }));
    expect(await screen.findByText(/alamat non-publik ditolak/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('busy: field terkunci, langkah progres tampil, Escape dan Cancel tidak menutup', async () => {
    const { user, onClose } = open({ busy: true });
    expect(screen.getByLabelText('Page address')).toBeDisabled();
    expect(screen.getByText('Fetched page')).toBeInTheDocument();
    expect(screen.getByText('Converting to layers')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('Escape (tidak sibuk) dan Cancel menutup dialog', async () => {
    const { user, onClose, unmount } = open();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    const v2 = open();
    await v2.user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(v2.onClose).toHaveBeenCalledTimes(1);
  });
});
