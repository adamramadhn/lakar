// Dialog Share (plan-share-link-ui, mockup KxNaI): daftar share aktif dokumen lewat proxy daemon
// (`api.*Share`), link field + Copy, toggle izin (view selalu on), select Expires 7/30/90/Never,
// "Update snapshot" (re-render + PUT; URL & komentar tetap), footer "Stored on <host>".
// Cloud env belum diset di lakard → pesan "not configured" saja (tak ada aksi).
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { api, errorText, type ShareLink, type ShareList } from './api';
import { Icon, type IconName } from './icons';
import { Modal } from './NewFileDialog';

type Phase = 'loading' | 'creating' | 'ready' | 'unconfigured';

/** Umur singkat untuk baris link ("2 min ago"). */
function ageOf(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function fmtTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return sameDay ? `today, ${time}` : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}
/** Ringkas izin jadi teks "View, comment, download". */
function permText(s: ShareLink): string {
  const parts = ['View'];
  if (s.permissions.comment) parts.push('comment');
  if (s.permissions.download) parts.push('download');
  return parts.join(', ');
}
/** Ikon izin yang tampil di baris Active links. */
function permIcons(s: ShareLink): IconName[] {
  const icons: IconName[] = ['eye'];
  if (s.permissions.comment) icons.push('messageCircle');
  if (s.permissions.download) icons.push('download');
  return icons;
}
/** URL tampil pendek (host + /s/token) — token penuh tetap di href/copy. */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
const EXPIRE_OPTIONS = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'never', label: 'Never' },
] as const;
type ExpireId = (typeof EXPIRE_OPTIONS)[number]['id'];
/** Petakan ISO kedaluwarsa ke bucket select terdekat (nilai sembarang dari PATCH lain tetap terbaca). */
function expireBucket(expiresAt: string | null): ExpireId {
  if (expiresAt === null) return 'never';
  const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
  if (days <= 15) return '7';
  if (days <= 60) return '30';
  return '90';
}
function expired(s: ShareLink): boolean {
  return s.expiresAt !== null && new Date(s.expiresAt).getTime() <= Date.now();
}

function PermToggle({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

export function ShareDialog({ slug, onClose }: { slug: string; onClose: () => void }): ReactElement {
  const [phase, setPhase] = useState<Phase>('loading');
  const [list, setList] = useState<ShareList>({ configured: false, shares: [] });
  const [active, setActive] = useState<string | undefined>(undefined); // token "this link"
  const [busy, setBusy] = useState<string | undefined>(undefined); // 'create' | 'refresh' | token
  const [error, setError] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState<string | undefined>(undefined);
  const [confirmRevoke, setConfirmRevoke] = useState<string | undefined>(undefined);
  const [justUpdated, setJustUpdated] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const updatedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(copyTimer.current);
      clearTimeout(updatedTimer.current);
    },
    [],
  );

  const load = async (keepActive = true): Promise<boolean> => {
    // Reload daftar → label "updated just now" kedaluwarsa bersama data lama.
    setJustUpdated(false);
    try {
      const l = await api.listShares(slug);
      setList(l);
      if (!l.configured) {
        setPhase('unconfigured');
        return false;
      }
      setActive((a) => (keepActive && a && l.shares.some((s) => s.token === a) ? a : l.shares[0]?.token));
      setPhase('ready');
      return true;
    } catch (e) {
      setError(errorText(e));
      setPhase('ready');
      return false;
    }
  };

  // Buka dialog: tanpa link aktif → buat link pertama otomatis (daemon render + upload).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const l = await api.listShares(slug);
        if (cancelled) return;
        setList(l);
        if (!l.configured) {
          setPhase('unconfigured');
          return;
        }
        if (l.shares.length) {
          setActive(l.shares[0]!.token);
          setPhase('ready');
          return;
        }
        setPhase('creating');
        await api.createShare(slug);
        if (!cancelled) await load(false);
      } catch (e) {
        if (!cancelled) {
          setError(errorText(e));
          setPhase('ready');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const current = list.shares.find((s) => s.token === active) ?? list.shares[0];
  const totalViews = list.shares.reduce((n, s) => n + s.views, 0);

  const copy = async (s: ShareLink) => {
    try {
      await navigator.clipboard.writeText(s.url);
      setCopied(s.token);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(undefined), 1600);
    } catch {
      setError('Could not copy — copy the link manually.');
    }
  };

  /** Optimistic PATCH: revert + pesan error bila service menolak/down. */
  const patch = async (s: ShareLink, apply: (s: ShareLink) => ShareLink, body: Parameters<typeof api.patchShare>[1]) => {
    setError(undefined);
    setList((l) => ({ ...l, shares: l.shares.map((x) => (x.token === s.token ? apply(x) : x)) }));
    try {
      await api.patchShare(s.token, body);
    } catch (e) {
      setList((l) => ({ ...l, shares: l.shares.map((x) => (x.token === s.token ? s : x)) }));
      setError(errorText(e));
    }
  };
  const toggle = (s: ShareLink, key: 'comment' | 'download', v: boolean) =>
    patch(s, (x) => ({ ...x, permissions: { ...x.permissions, [key]: v } }), { permissions: { [key]: v } });
  const setExpires = (s: ShareLink, id: ExpireId) =>
    patch(
      s,
      (x) => ({ ...x, expiresAt: id === 'never' ? null : new Date(Date.now() + Number(id) * 86_400_000).toISOString() }),
      { expiresAt: id === 'never' ? null : new Date(Date.now() + Number(id) * 86_400_000).toISOString() },
    );

  const revoke = async (s: ShareLink) => {
    setBusy(s.token);
    setError(undefined);
    try {
      await api.revokeShare(s.token);
      setConfirmRevoke(undefined);
      await load();
    } catch (e) {
      setError(errorText(e));
      setConfirmRevoke(undefined);
    } finally {
      setBusy(undefined);
    }
  };

  const newLink = async () => {
    setBusy('create');
    setError(undefined);
    try {
      const r = await api.createShare(slug);
      await load(false);
      setActive(r.token);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(undefined);
    }
  };

  const updateSnapshot = async () => {
    if (!current) return;
    setBusy('refresh');
    setError(undefined);
    try {
      await api.refreshShare(current.token, slug);
      await load();
      setJustUpdated(true);
      // Label "updated just now" bersifat sesaat — bersihkan setelah beberapa detik.
      clearTimeout(updatedTimer.current);
      updatedTimer.current = setTimeout(() => setJustUpdated(false), 4000);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(undefined);
    }
  };

  if (phase === 'unconfigured') {
    return (
      <Modal label="Share" onClose={onClose} className="share-dialog">
        <div className="modal-text">
          <h2>Share “{slug}”</h2>
          <p>Sharing isn't configured on this machine. Set LAKAR_CLOUD_URL (and LAKAR_CLOUD_KEY) on lakard, then reopen this dialog.</p>
        </div>
        <div className="modal-buttons">
          <button type="button" data-autofocus className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal label="Share" onClose={onClose} className="share-dialog">
      <div className="share-head">
        <div className="modal-text">
          <h2>Share “{slug}”</h2>
          <p>Anyone with the link opens a read-only snapshot in a browser. No account needed.</p>
        </div>
        <button type="button" className="icon-btn share-close" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
      </div>
      {phase === 'loading' || phase === 'creating' ? (
        <div className="share-loading">
          <Icon name="loaderCircle" size={18} className="spin" />
          {phase === 'creating' ? 'Uploading a snapshot and creating your first link…' : 'Loading links…'}
        </div>
      ) : (
        <>
          {error && (
            <div className="modal-error" role="alert">
              {error}
            </div>
          )}
          {current ? (
            <>
              <div className="share-sec-head">
                <span className="field-label">Share link</span>
                <span className="share-meta">
                  <Icon name="refresh" size={11} /> Uploaded · {current.boards.length} {current.boards.length === 1 ? 'page' : 'pages'}
                </span>
              </div>
              <div className="share-url">
                <Icon name="link" size={14} />
                <input className="input share-url-input" readOnly value={current.url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn" onClick={() => void copy(current)}>
                  <Icon name={copied === current.token ? 'check' : 'copy'} size={14} />
                  {copied === current.token ? 'Copied' : 'Copy link'}
                </button>
              </div>
              <div className="share-sec-head">
                <span className="field-label">Guests with this link can</span>
                <label className="share-expires">
                  Expires
                  {/* Link kedaluwarsa menampilkan state "Expired" (disabled) — bukan bucket
                      terdekat yang menyesatkan; memilih durasi lain menghidupkan link lagi. */}
                  <select
                    value={expired(current) ? 'expired' : expireBucket(current.expiresAt)}
                    onChange={(e) => setExpires(current, e.currentTarget.value as ExpireId)}
                    aria-label="Link expiry"
                  >
                    {expired(current) && (
                      <option value="expired" disabled>
                        Expired
                      </option>
                    )}
                    {EXPIRE_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.id === 'never' ? 'Never' : `In ${o.label}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="perm-list">
                <div className="perm-row">
                  <span className="perm-icon">
                    <Icon name="eye" size={16} />
                  </span>
                  <span className="perm-text">
                    <span className="perm-title">Can view</span>
                    <span className="perm-desc">Every page of the snapshot, zoom and pan</span>
                  </span>
                  <span className="perm-always">
                    <Icon name="lock" size={11} /> Always on
                  </span>
                  <PermToggle on disabled label="Can view" onChange={() => undefined} />
                </div>
                <div className="perm-row">
                  <span className="perm-icon">
                    <Icon name="messageCircle" size={16} />
                  </span>
                  <span className="perm-text">
                    <span className="perm-title">Can comment</span>
                    <span className="perm-desc">Pins with a guest name; you see them in Activity</span>
                  </span>
                  <PermToggle on={current.permissions.comment} label="Can comment" onChange={(v) => void toggle(current, 'comment', v)} />
                </div>
                <div className="perm-row">
                  <span className="perm-icon">
                    <Icon name="download" size={16} />
                  </span>
                  <span className="perm-text">
                    <span className="perm-title">Can download .lakar.json</span>
                    <span className="perm-desc">The full document file, tokens included</span>
                  </span>
                  <PermToggle on={current.permissions.download} label="Can download" onChange={(v) => void toggle(current, 'download', v)} />
                </div>
              </div>
            </>
          ) : (
            <p className="share-empty">No active links.</p>
          )}
          <div className="share-sec-head">
            <span className="field-label">Active links</span>
            <span className="share-meta">
              {list.shares.length} {list.shares.length === 1 ? 'link' : 'links'} · {totalViews} views
              <button type="button" className="share-new" disabled={busy !== undefined} onClick={() => void newLink()}>
                {busy === 'create' ? 'Creating…' : '+ New link'}
              </button>
            </span>
          </div>
          <div className="link-list">
            {list.shares.map((s) => (
              <div key={s.token} className={`link-row${s.token === active ? ' current' : ''}`}>
                <span className="link-icon">
                  <Icon name="link" size={14} />
                </span>
                <div className="link-main">
                  <div className="link-url">
                    {shortUrl(s.url)}
                    {s.token === active && <span className="chip">This link</span>}
                    {expired(s) && <span className="chip expired">Expired</span>}
                  </div>
                  <div className="link-sub">
                    {permIcons(s).map((i) => (
                      <Icon key={i} name={i} size={11} />
                    ))}
                    {permText(s)} · {ageOf(s.createdAt)} · {s.views} {s.views === 1 ? 'view' : 'views'}
                  </div>
                </div>
                {confirmRevoke === s.token ? (
                  <span className="link-confirm">
                    Revoke?
                    <button type="button" className="link-revoke" disabled={busy === s.token} onClick={() => void revoke(s)}>
                      {busy === s.token ? 'Revoking…' : 'Yes, revoke'}
                    </button>
                    <button type="button" className="link-keep" disabled={busy === s.token} onClick={() => setConfirmRevoke(undefined)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <>
                    {s.token !== active && (
                      <button type="button" className="icon-btn link-pick" title="Show this link" aria-label="Show this link" onClick={() => setActive(s.token)}>
                        <Icon name="externalLink" size={13} />
                      </button>
                    )}
                    <button type="button" className="icon-btn" title="Copy link" aria-label="Copy link" onClick={() => void copy(s)}>
                      <Icon name={copied === s.token ? 'check' : 'copy'} size={13} />
                    </button>
                    <button type="button" className="link-revoke" disabled={busy !== undefined} onClick={() => setConfirmRevoke(s.token)}>
                      Revoke
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          {current && (
            <div className="snapshot-note">
              <span className="snapshot-icon">
                <Icon name="clock" size={15} />
              </span>
              <div className="snapshot-text">
                <strong>{justUpdated ? 'Snapshot updated just now' : `Snapshot from ${fmtTime(current.createdAt)}`}</strong>
                <span>Guests see the document as it was when you uploaded it. Update the snapshot to send edits; links and comments stay.</span>
              </div>
              <button type="button" className="btn" disabled={busy !== undefined} onClick={() => void updateSnapshot()}>
                <Icon name="refresh" size={13} />
                {busy === 'refresh' ? 'Updating…' : 'Update snapshot'}
              </button>
            </div>
          )}
          <div className="share-foot">
            <span className="share-foot-note">
              <Icon name="lock" size={12} />
              Stored on {list.host ?? 'the share service'} · only people with a link
            </span>
            <button type="button" className="btn primary" data-autofocus onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
