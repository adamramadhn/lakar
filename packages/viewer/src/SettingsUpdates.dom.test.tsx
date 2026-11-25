// Settings → Updates + banner Recents (desain Section 11): tiga state kartu (Up to date / Update available /
// Check failed), section "What's new", banner "ready to install"/"Updated to", dan penyembunyian di browser.
// Modul updates.ts dimuat ulang per tes (vi.resetModules) supaya state singletonnya bersih.
import { act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderUi } from './test/dom';

const META = { version: '0.10.0', currentVersion: '0.9.0', notes: 'Catatan rilis\n- Fitur baru', pubDate: '2026-11-23T00:00:00Z' };
const NIGHTLY_META = { version: '0.1.9-nightly.202611251800', currentVersion: '0.1.8', notes: 'Catatan nightly', pubDate: '2026-11-25T00:00:00Z' };
type Cmd = [cmd: string, args: Record<string, unknown> | undefined];

/** Pasang __TAURI__.core di window jsdom; `responses` = cmd → nilai (Error = invoke menolak). */
function setTauri(responses: Record<string, unknown>) {
  const calls: Cmd[] = [];
  (window as unknown as Record<string, unknown>).__TAURI__ = {
    core: {
      Channel: class {
        onmessage: (e: unknown) => void = () => {};
      },
      invoke: (cmd: string, args?: Record<string, unknown>) => {
        calls.push([cmd, args]);
        const v = responses[cmd];
        return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
      },
    },
  };
  return calls;
}

/** Modul segar per tes: updates.ts + komponen yang mengimpornya. */
async function setup() {
  vi.resetModules();
  const u = await import('./updates');
  const { SettingsUpdates } = await import('./SettingsUpdates');
  const { UpdateBanner } = await import('./UpdateBanner');
  const { SettingsLayout } = await import('./SettingsGeneral');
  return { u, SettingsUpdates, UpdateBanner, SettingsLayout };
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI__;
});

describe('Settings — Updates', () => {
  it('tidak ada update: badge "Up to date" + versi + tombol Check for updates', async () => {
    setTauri({ check_update: null });
    const { u, SettingsUpdates } = await setup();
    await act(async () => {
      await u.checkForUpdate();
    });
    const { getByText } = renderUi(<SettingsUpdates />);
    getByText('Up to date');
    getByText('Check for updates');
  });

  it('update tersedia: badge + "Download and install" + "What’s new in 0.10.0"', async () => {
    setTauri({ check_update: META });
    const { u, SettingsUpdates } = await setup();
    await act(async () => {
      await u.checkForUpdate();
    });
    const { getByText } = renderUi(<SettingsUpdates />);
    getByText('Update available');
    getByText('Download and install');
    getByText('What’s new in 0.10.0');
    getByText(/Fitur baru/);
  });

  it('check gagal: badge "Check failed" + pesan; "Try again" mengulang check', async () => {
    const calls = setTauri({ check_update: new Error('jaringan putus') });
    const { u, SettingsUpdates } = await setup();
    await act(async () => {
      await u.checkForUpdate();
    });
    const { getByText } = renderUi(<SettingsUpdates />);
    getByText('Check failed');
    getByText('jaringan putus');
    const user = userEvent.setup();
    await user.click(getByText('Try again'));
    expect(calls.filter((c) => c[0] === 'check_update')).toHaveLength(2);
  });

  it('kebijakan "Download updates" menawarkan Automatically / Ask me first', async () => {
    setTauri({ check_update: null });
    const { SettingsUpdates } = await setup();
    const { getByLabelText } = renderUi(<SettingsUpdates />);
    const select = getByLabelText('Download updates');
    const user = userEvent.setup();
    await user.selectOptions(select, 'ask');
    expect(localStorage.getItem('lakar.viewer.updatePolicy')).toBe('ask');
  });
});

describe('UpdateBanner (Recents)', () => {
  it('update terunduh → banner "ready to install"; "Restart now" memasang + relaunch', async () => {
    const calls = setTauri({ check_update: META, download_update: null, install_update: null, relaunch_app: null });
    const { u, UpdateBanner } = await setup();
    await act(async () => {
      await u.checkForUpdate();
      await u.downloadUpdate();
    });
    const { getByText } = renderUi(<UpdateBanner />);
    getByText('Lakar 0.10.0 is ready to install');
    const user = userEvent.setup();
    await user.click(getByText('Restart now'));
    await vi.waitFor(() => expect(calls.map((c) => c[0])).toEqual(['check_update', 'download_update', 'install_update', 'relaunch_app']));
  });

  it('habis restart → banner "Updated to Lakar x.y"; Dismiss menutupnya permanen', async () => {
    localStorage.setItem('lakar.viewer.updatedTo', JSON.stringify({ version: '0.10.0' }));
    setTauri({ app_version: '0.10.0', check_update: null });
    const { u, UpdateBanner } = await setup();
    await act(async () => {
      u.initUpdates();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(u.getUpdateState().justUpdated?.version).toBe('0.10.0'));
    const { getByText, queryByText } = renderUi(<UpdateBanner />);
    getByText('Updated to Lakar 0.10.0');
    const user = userEvent.setup();
    await user.click(getByText('Dismiss'));
    expect(queryByText('Updated to Lakar 0.10.0')).toBeNull();
    expect(localStorage.getItem('lakar.viewer.updatedTo')).toBeNull();
  });

  it('browser (tanpa __TAURI__): banner tidak tampil dan tab Updates disembunyikan', async () => {
    const { UpdateBanner, SettingsLayout } = await setup();
    const { container, queryByText } = renderUi(
      <>
        <UpdateBanner />
        <SettingsLayout tab="general">
          <div />
        </SettingsLayout>
      </>,
    );
    expect(container.querySelector('.update-banner')).toBeNull();
    expect(queryByText('Updates')).toBeNull();
    expect(queryByText('Connections')).not.toBeNull();
  });

  it('di aplikasi desktop tab Updates tampil', async () => {
    setTauri({ check_update: null });
    const { SettingsLayout } = await setup();
    const { getByRole } = renderUi(
      <SettingsLayout tab="updates">
        <div />
      </SettingsLayout>,
    );
    const nav = getByRole('navigation', { name: 'Settings' });
    expect(within(nav).getByText('Updates').closest('a')?.getAttribute('href')).toBe('#/settings/updates');
  });
});

/** init dengan channel tersimpan; tunggu state.channel termuat. */
async function initWithChannel(u: typeof import('./updates'), channel = 'stable') {
  await act(async () => {
    u.initUpdates();
    await Promise.resolve();
  });
  await vi.waitFor(() => expect(u.getUpdateState().channel).toBe(channel));
}

describe('Update channel (spec-update-channel)', () => {
  it('channel belum dimuat (command gagal) → seksi Update channel tidak dirender', async () => {
    setTauri({ app_version: '0.9.0', update_channel: new Error('unknown'), check_update: null });
    const { u, SettingsUpdates } = await setup();
    await act(async () => {
      u.initUpdates();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(u.getUpdateState().status).toBe('up-to-date'));
    const { queryByText } = renderUi(<SettingsUpdates />);
    expect(queryByText('Update channel')).toBeNull();
    expect(queryByText('Automatic updates')).not.toBeNull();
  });

  it('radiogroup dua opsi dengan aria-checked benar + baris help Stable', async () => {
    setTauri({ app_version: '0.9.0', update_channel: { channel: 'stable', saved: false }, check_update: null });
    const { u, SettingsUpdates } = await setup();
    await initWithChannel(u);
    const { getByRole, getByText } = renderUi(<SettingsUpdates />);
    getByText('Update channel');
    const group = getByRole('radiogroup', { name: 'Update channel' });
    expect(within(group).getByRole('radio', { name: 'Stable' }).getAttribute('aria-checked')).toBe('true');
    expect(within(group).getByRole('radio', { name: 'Nightly' }).getAttribute('aria-checked')).toBe('false');
    getByText('Tested releases. Recommended for most people.');
  });

  it('klik Nightly → set_update_channel lalu check_update; baris warning muncul', async () => {
    const calls = setTauri({
      app_version: '0.9.0',
      update_channel: { channel: 'stable', saved: false },
      set_update_channel: { channel: 'nightly', saved: true },
      check_update: null,
    });
    const { u, SettingsUpdates } = await setup();
    await initWithChannel(u);
    const { getByRole, getByText } = renderUi(<SettingsUpdates />);
    const user = userEvent.setup();
    await user.click(getByRole('radio', { name: 'Nightly' }));
    await vi.waitFor(() => expect(u.getUpdateState().channel).toBe('nightly'));
    expect(calls.map((c) => c[0])).toEqual(['app_version', 'update_channel', 'check_update', 'set_update_channel', 'check_update']);
    getByText('Pre-release builds — may be unstable. A new build ships every night.');
  });

  it('downloading → segmented disabled + baris busy', async () => {
    setTauri({ app_version: '0.9.0', update_channel: { channel: 'stable', saved: false }, check_update: META, download_update: new Promise(() => {}) });
    const { u, SettingsUpdates } = await setup();
    await initWithChannel(u);
    await act(async () => {
      void u.downloadUpdate();
    });
    await vi.waitFor(() => expect(u.getUpdateState().status).toBe('downloading'));
    const { getByRole, getByText } = renderUi(<SettingsUpdates />);
    const group = getByRole('radiogroup', { name: 'Update channel' });
    expect(within(group).getByRole('radio', { name: 'Stable' })).toHaveProperty('disabled', true);
    expect(within(group).getByRole('radio', { name: 'Nightly' })).toHaveProperty('disabled', true);
    getByText('You can switch channels after the current update finishes.');
  });

  it('ready → baris discard; klik Nightly membuang pending lalu check ulang (banner hilang)', async () => {
    const calls = setTauri({
      app_version: '0.9.0',
      update_channel: { channel: 'stable', saved: false },
      set_update_channel: { channel: 'nightly', saved: true },
      check_update: NIGHTLY_META,
      download_update: null,
    });
    const { u, SettingsUpdates, UpdateBanner } = await setup();
    await initWithChannel(u);
    // init auto policy? default localStorage kosong → auto → status ready via download latar
    await vi.waitFor(() => expect(u.getUpdateState().status).toBe('ready'));
    const { getByRole, getByText, queryByText } = renderUi(
      <>
        <SettingsUpdates />
        <UpdateBanner />
      </>,
    );
    getByText('Switching channels discards the update that’s ready to install.');
    expect(queryByText('Lakar 0.1.9 Nightly (2026-11-25) is ready to install')).not.toBeNull();
    const user = userEvent.setup();
    await user.click(getByRole('radio', { name: 'Nightly' }));
    // check baru di channel nightly: META yang sama → download_update dipanggil lagi (policy auto).
    await vi.waitFor(() => expect(calls.map((c) => c[0])).toContain('set_update_channel'));
    await vi.waitFor(() => expect(calls.filter((c) => c[0] === 'check_update')).toHaveLength(2));
  });

  it('Stable di atas build nightly → pill Nightly + catatan stableFromNightly', async () => {
    setTauri({ app_version: '0.1.9-nightly.202611251800', update_channel: { channel: 'stable', saved: true }, check_update: null });
    const { u, SettingsUpdates } = await setup();
    await initWithChannel(u);
    await vi.waitFor(() => expect(u.getUpdateState().status).toBe('up-to-date'));
    const { getByText, getAllByText } = renderUi(<SettingsUpdates />);
    // Pill `Nightly` netral di kartu Version (label radio "Nightly" juga memuat teks yang sama).
    expect(getAllByText('Nightly').some((el) => el.className.includes('status-pill'))).toBe(true);
    getByText("You're on a nightly build that's newer than the latest stable release. You'll get the next stable release when it's out.");
  });

  it('RELEASE_NOT_FOUND di channel nightly → pesan khusus nightly (bukan "up to date")', async () => {
    setTauri({ app_version: '0.9.0', update_channel: { channel: 'nightly', saved: true }, check_update: new Error('RELEASE_NOT_FOUND: no release found') });
    const { u, SettingsUpdates } = await setup();
    await initWithChannel(u, 'nightly');
    await vi.waitFor(() => expect(u.getUpdateState().status).toBe('failed'));
    const { getByText } = renderUi(<SettingsUpdates />);
    getByText('Check failed');
    getByText('No nightly build is available right now. Try again later, or switch to Stable.');
  });

  it('set_update_channel gagal → alert saveFailed, pilihan kembali ke channel lama', async () => {
    setTauri({ app_version: '0.9.0', update_channel: { channel: 'stable', saved: false }, set_update_channel: new Error('gagal tulis'), check_update: null });
    const { u, SettingsUpdates } = await setup();
    await initWithChannel(u);
    const { getByRole, getByText } = renderUi(<SettingsUpdates />);
    const user = userEvent.setup();
    await user.click(getByRole('radio', { name: 'Nightly' }));
    await vi.waitFor(() => expect(u.getUpdateState().channelError).toBe('save'));
    getByText('Couldn’t change the update channel. Try again.');
    const group = getByRole('radiogroup', { name: 'Update channel' });
    expect(within(group).getByRole('radio', { name: 'Stable' }).getAttribute('aria-checked')).toBe('true');
  });

  it('banner Recents memakai displayVersion untuk versi nightly', async () => {
    setTauri({ check_update: NIGHTLY_META, download_update: null });
    const { u, UpdateBanner } = await setup();
    await act(async () => {
      await u.checkForUpdate();
      await u.downloadUpdate();
    });
    const { getByText } = renderUi(<UpdateBanner />);
    getByText('Lakar 0.1.9 Nightly (2026-11-25) is ready to install');
  });
});
