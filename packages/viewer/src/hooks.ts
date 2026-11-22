import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { connection } from './api';

/** Panggil `fn` saat tombol Retry di banner offline ditekan. */
export function useRetry(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => connection.onRetry(() => ref.current()), []);
}

/** True setelah elemen pernah terlihat di viewport (render malas). */
export function useSeen<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** `Date.now()` yang diperbarui tiap `intervalMs` (waktu relatif, status Live/Idle). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** True selama lakard tidak bisa dihubungi (banner offline). */
export function useOffline(): boolean {
  return useSyncExternalStore(connection.subscribe, connection.isOffline, connection.isOffline);
}
