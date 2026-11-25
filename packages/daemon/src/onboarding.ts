// Penanda onboarding instalasi (spec-first-run-signin task A): `<dataDir>/onboarding.json` mencatat
// apakah layar sambutan sign-in Lakar Cloud pernah selesai/dilewati — per instalasi daemon (satu
// keputusan lintas jendela/origin), bukan localStorage viewer. File bukan rahasia → mode 0644,
// tulis atomik `writeFileAtomic`. File tidak ada/korup/version tak dikenal → dianggap tidak ada
// (file tidak dihapus — biar pengguna bisa memeriksa; reset manual = hapus file).
// Nilai efektif dihitung `effective()`: cloud off → `disabled` (tidak ditulis); penanda ada → isi
// penanda; session valid tanpa penanda → `completed` via `existing-session` (upgrade pengguna lama
// yang sudah sign-in tidak pernah melihat gate); selain itu → `pending` (gate boleh tampil sekali).
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writeFileAtomic } from './assets.js';
import type { CloudSession } from './session.js';

/** Nama file penanda di dataDir (di luar `docs/` — bukan dokumen). */
export const ONBOARDING_FILE = 'onboarding.json';

/** Nilai penanda yang ditulis ke disk. */
export type OnboardingSignin = 'skipped' | 'completed';
/** Jalur yang menutup onboarding (audit file; `'skip'` = tombol "Continue without an account"). */
export type OnboardingVia = 'skip' | 'google' | 'github' | 'email' | 'existing-session';
/** Nilai efektif yang dilaporkan daemon ke viewer (`onboarding.signin` di status auth). */
export type EffectiveSignin = OnboardingSignin | 'pending' | 'disabled';

export type OnboardingState = { version: 1; signin: OnboardingSignin; via: OnboardingVia; at: string };

const isEnoent = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT';
const isVia = (v: unknown): v is OnboardingVia => v === 'skip' || v === 'google' || v === 'github' || v === 'email' || v === 'existing-session';

/** Parse isi file → state; bentuk tak dikenal/version bukan 1 → undefined (file dibiarkan). */
const parseOnboarding = (text: string): OnboardingState | undefined => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return undefined;
  const s = json as Record<string, unknown>;
  const signin = s.signin;
  const via = s.via;
  if (s.version !== 1 || (signin !== 'skipped' && signin !== 'completed') || !isVia(via)) return undefined;
  return { version: 1, signin, via, at: typeof s.at === 'string' ? s.at : '' };
};

/**
 * Store penanda onboarding: satu file `onboarding.json` di dataDir (pemilik tunggal daemon, AD-1).
 * `load` membaca ulang dari disk tiap panggil — file kecil dan aksesnya jarang (status auth),
 * jadi perubahan dari luar (hapus manual) langsung terlihat.
 */
export class OnboardingStore {
  readonly path: string;
  constructor(dataDir: string) {
    this.path = join(dataDir, ONBOARDING_FILE);
  }

  /** Penanda tersimpan; tidak ada file ATAU isi tak dikenal → undefined (file dibiarkan utuh). */
  async load(): Promise<OnboardingState | undefined> {
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch (e) {
      if (isEnoent(e)) return undefined;
      throw e;
    }
    return parseOnboarding(text);
  }

  /**
   * Tulis penanda atomik mode 0644 (bukan rahasia). `completed` tidak pernah diturunkan ke
   * `skipped` — POST /viewer/onboarding yang datang telat (skip diklik bersamaan callback
   * sign-in landing) tidak boleh membuka kembali gate yang sudah selesai.
   */
  async save(signin: OnboardingSignin, via: OnboardingVia): Promise<OnboardingState> {
    const cur = await this.load();
    if (cur?.signin === 'completed') return cur;
    const next: OnboardingState = { version: 1, signin, via, at: new Date().toISOString() };
    await mkdir(dirname(this.path), { recursive: true });
    await writeFileAtomic(this.path, `${JSON.stringify(next, null, 2)}\n`, 0o644);
    return next;
  }

  /**
   * Nilai efektif `onboarding.signin` (tabel spec): cloud off → `disabled` (tidak ditulis — bila
   * cloud dinyalakan lagi, instalasi tetap `pending` dan gate tampil sekali); penanda ada → isi
   * penanda; session valid tanpa penanda → `completed` (ditulis, via `existing-session`); selain
   * itu → `pending` (tidak ditulis). Tulis `existing-session` best-effort — kegagalan tulis tidak
   * boleh mengubah status jujur "sudah sign-in".
   */
  async effective({ cloudOn, session }: { cloudOn: boolean; session: CloudSession | undefined }): Promise<EffectiveSignin> {
    if (!cloudOn) return 'disabled';
    const marker = await this.load();
    if (marker) return marker.signin;
    if (session) {
      await this.save('completed', 'existing-session').catch(() => {});
      return 'completed';
    }
    return 'pending';
  }
}
