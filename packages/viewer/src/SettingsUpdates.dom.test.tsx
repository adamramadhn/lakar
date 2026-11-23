// Settings → Updates + banner Recents (desain Section 11): tiga state kartu (Up to date / Update available /
// Check failed), section "What's new", banner "ready to install"/"Updated to", dan penyembunyian di browser.
// Modul updates.ts dimuat ulang per tes (vi.resetModules) supaya state singletonnya bersih.
import { act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderUi } from './test/dom';

const META = { version: '0.10.0', currentVersion: '0.9.0', notes: 'Catatan rilis\n- Fitur baru', pubDate: '2026-11-23T00:00:00Z' };
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
