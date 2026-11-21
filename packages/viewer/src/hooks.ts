import { useEffect, useRef, useState, type RefObject } from 'react';
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
