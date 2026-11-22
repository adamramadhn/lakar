// Thumbnail file (komponen Thumbnail mini/large desain 00): screenshot board pertama, dirender malas (hanya yang
// terlihat) dan di-cache per `slug@rev`. Dipakai grid/list Dashboard dan dropdown Search.
import { useEffect, useState } from 'react';
import { api, type DocSummary } from './api';
import { relativeTime } from './format';
import { useRetry, useSeen } from './hooks';
import { Icon } from './icons';

/** Thumbnail per `slug@rev` (memori viewer). */
const thumbs = new Map<string, Promise<string | null>>();
function thumbnail(doc: DocSummary): Promise<string | null> {
  if (!doc.firstBoardId) return Promise.resolve(null);
  const key = `${doc.slug}@${doc.rev}`;
  let hit = thumbs.get(key);
  if (!hit) {
    hit = api.screenshot(doc.slug, doc.rev, doc.firstBoardId).then((s) => s.url);
    hit.catch(() => thumbs.delete(key));
    thumbs.set(key, hit);
  }
  return hit;
}

/** Lupakan thumbnail (slug bisa dipakai ulang setelah rename/delete dengan rev yang sama). */
api.onDocsChanged(() => thumbs.clear());

/** Thumbnail kartu; file terarsip tidak bisa dirender (bukan dokumen aktif) → ikon arsip. */
export function Thumb({ doc, size, archived = false }: { doc: DocSummary; size: 'large' | 'mini'; archived?: boolean }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useRetry(() => failed && setAttempt((a) => a + 1));
  useEffect(() => {
    if (!seen || archived) return;
    let live = true;
    setFailed(false);
    thumbnail(doc).then(
      (u) => live && setUrl(u),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [seen, doc, attempt, archived]);
  return (
    <div ref={ref} className={`thumb ${size}`}>
      {archived ? (
        <Icon name="archive" size={size === 'large' ? 20 : 12} className="thumb-icon" />
      ) : url ? (
        <img src={url} alt="" draggable={false} />
      ) : failed ? (
        <Icon name="alert" size={size === 'large' ? 18 : 12} className="thumb-icon" />
      ) : url === null ? (
        <Icon name="board" size={size === 'large' ? 20 : 12} className="thumb-icon" />
      ) : (
        <div className="skeleton" />
      )}
    </div>
  );
}

/** Subjudul kartu/hasil Search: jumlah board · waktu relatif. */
export const docSubtitle = (d: DocSummary) =>
  `${d.boardCount === 0 ? 'No boards yet' : `${d.boardCount} board${d.boardCount === 1 ? '' : 's'}`} · ${relativeTime(d.updatedAt)}`;
