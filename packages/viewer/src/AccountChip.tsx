// Account chip di sidebar Dashboard (spec-first-run-signin task E) — mengganti blok `.profile`
// statis ("L" + Lakar). Empat state: signed-in (avatar inisial + nama/email, klik → Connections),
// signed-out+configured (blok lama + tombol Sign in), session expired (avatar terakhir + titik
// warning + sub "Session expired"), dan cloud off/status gagal/daemon lama (blok lama persis).
// Status dari `api.authStatus()` + SSE `auth`; state expired hidup di `sessionExpired` (memori
// modul — sampai reload atau sign-in baru).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { activityHub } from './activity';
import { api, type AuthStatus } from './api';
import { initialsOf, sessionExpired } from './cloudAuth';
import { CONNECTIONS_HASH } from './files';

/** Blok identitas lama — fallback untuk cloud off / status gagal / daemon tanpa field cloud. */
const fallback = (
  <>
    <span className="avatar">L</span>
    <span className="profile-name">Lakar</span>
  </>
);

export function AccountChip() {
  const [status, setStatus] = useState<AuthStatus | undefined>(undefined);
  const { expired, user: lastUser } = useSyncExternalStore(sessionExpired.subscribe, sessionExpired.getSnapshot);

  useEffect(() => {
    const load = () =>
      api.authStatus().then(
        (s) => {
          sessionExpired.noteStatus(s);
          setStatus(s);
        },
        () => {},
      );
    load();
    return activityHub.listen({
      onEvent: (e) => {
        if (e.type !== 'auth') return;
        if (e.auth.reason === 'expired') sessionExpired.markExpired();
        load();
      },
    });
  }, []);

  let content = fallback;
  if (status?.configured && status.signedIn && status.user) {
    const u = status.user;
    const name = u.name?.trim();
    content = (
      <>
        <span className="cloud-avatar account-chip-avatar">{initialsOf(u)}</span>
        <span className="account-chip-info">
          <span className="account-chip-name">{name || u.email}</span>
          {name && <span className="account-chip-sub">{u.email}</span>}
        </span>
      </>
    );
  } else if (expired && lastUser) {
    const u = lastUser;
    const name = u.name?.trim();
    content = (
      <>
        <span className="cloud-avatar account-chip-avatar">{initialsOf(u)}</span>
        <span className="account-chip-info">
          <span className="account-chip-name">{name || u.email}</span>
          <span className="account-chip-sub expired">
            <span className="account-chip-dot" aria-hidden="true" />
            Session expired
          </span>
        </span>
      </>
    );
  } else if (status?.configured && !status.signedIn) {
    content = (
      <>
        {fallback}
        <span className="btn small account-chip-signin">Sign in</span>
      </>
    );
  }

  const label =
    status?.signedIn && status.user ? `Lakar Cloud account: ${status.user.name?.trim() || status.user.email}` : expired && lastUser ? `Lakar Cloud account: ${lastUser.name?.trim() || lastUser.email} — session expired` : undefined;
  return (
    <a className="profile account-chip" href={CONNECTIONS_HASH} {...(label ? { 'aria-label': label } : {})}>
      {content}
    </a>
  );
}
