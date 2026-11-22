// Format tampilan: waktu relatif, nilai properti (token apa adanya), dan indeks pohon dokumen.
import type { LakarDocument } from '@lakar/schema';

export function relativeTime(iso: string | number, now = Date.now()): string {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString();
}

/** Nilai properti apa adanya: token → `$nama`, array/objek → JSON ringkas. */
export function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '–';
  if (typeof v === 'object' && v !== null && '$token' in v) return `$${String((v as { $token: unknown }).$token)}`;
  if (typeof v === 'number') return String(Math.round(v * 100) / 100);
  if (typeof v === 'string' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v) && v.every((x) => typeof x === 'number' || (typeof x === 'object' && x !== null && '$token' in x))) return v.map(formatValue).join(', ');
  return JSON.stringify(v);
}

/** Warna hex yang bisa digambar sebagai swatch (bukan token). */
export const hexColor = (v: unknown): string | undefined => (typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) ? v : undefined);

export type TreeNode = { id: string; name: string; type: string; children?: TreeNode[] };
export type NodeInfo = { id: string; name: string; type: string; boardId: string; pageIndex: number; path: string[]; parentId: string | undefined };

/** id → info (board pemilik, halaman, jalur nama) untuk seluruh dokumen. */
export function indexDocument(doc: LakarDocument): Map<string, NodeInfo> {
  const out = new Map<string, NodeInfo>();
  doc.pages.forEach((page, pageIndex) => {
    for (const board of page.children as unknown as TreeNode[]) {
      const walk = (n: TreeNode, path: string[], parentId: string | undefined) => {
        const p = [...path, n.name];
        out.set(n.id, { id: n.id, name: n.name, type: n.type, boardId: board.id, pageIndex, path: p, parentId });
        for (const c of n.children ?? []) walk(c, p, n.id);
      };
      walk(board, [], undefined);
    }
  });
  return out;
}
