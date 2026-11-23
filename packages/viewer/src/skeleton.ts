// Placeholder skeleton di canvas (spec-skeleton-live-build, desain bagian 04 "Skeleton build"). Murni, tanpa DOM:
// daftar placeholder `[Skeleton] …` sebuah board dan CSS shadow root yang menggambarnya. Gaya ini hanya milik viewer:
// dokumen, render daemon, ekspor PNG, dan codegen memperlakukan placeholder sebagai frame biasa tanpa gaya tambahan.
import { isSkeletonName, SKELETON_PREFIX, type ResolvedBoardNode, type ResolvedChildNode } from '@lakar/schema';

/** Satu sapuan shimmer (≤ 3 dtk, riset §2 g-scan), lalu jeda; hanya `transform`. */
export const SKELETON_SWEEP_MS = 2400;
/** Jeda awal sapuan per placeholder (atas → bawah). */
export const SKELETON_STAGGER_MS = 120;
/** Tint placeholder memudar saat diisi di tempat (sama dengan cangkang reveal). */
export const SKELETON_FILL_MS = 240;
const EASE = 'cubic-bezier(.16,1,.3,1)';

export type SkeletonEntry = { id: string; label: string };

/** Label placeholder: nama tanpa prefiks `[Skeleton] ` dan tanpa awalan konvensi `Seksi / `. */
export const skeletonLabel = (name: string): string => name.slice(SKELETON_PREFIX.length).replace(/^Seksi \/ /, '').trim() || 'Section';

/** Placeholder teratas board (urutan dokumen); isi di dalam placeholder tidak dihitung. */
export function skeletonEntries(board: ResolvedBoardNode | undefined): SkeletonEntry[] {
  const out: SkeletonEntry[] = [];
  const walk = (kids: readonly ResolvedChildNode[]) => {
    for (const c of kids) {
      if (isSkeletonName(c.name)) out.push({ id: c.id, label: skeletonLabel(c.name) });
      else if (c.type === 'frame') walk(c.children);
    }
  };
  if (board) walk(board.children);
  return out;
}

/** String CSS (konten `content`): kutip, backslash, dan baris baru di-escape. */
const cssString = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`;
const sel = (id: string): string => `[data-lakar-id=${cssString(id)}]`;

/**
 * CSS shadow root board: placeholder = tint + garis putus-putus + label nama seksi (`::before`), sapuan shimmer
 * (`::after`, `translateX` saja) hanya saat host berlabel Generating (`:host([data-generating])`). `filled` = id yang
 * pada mount sebelumnya masih placeholder dan kini sudah diisi: tint-nya memudar sekali (240ms). Reduced motion →
 * tanpa sapuan dan tanpa pudar. Kosong bila tidak ada yang perlu digambar.
 */
export function skeletonCss(entries: readonly SkeletonEntry[], filled: readonly string[] = []): string {
  if (!entries.length && !filled.length) return '';
  const base =
    'content:"";position:absolute;inset:0;box-sizing:border-box;border:1px dashed rgba(16,24,40,.16);border-radius:inherit;' +
    'background:rgba(16,24,40,.04);pointer-events:none';
  const rules: string[] = [
    `@keyframes lakar-skel-sweep{0%{transform:translateX(-100%)}70%,100%{transform:translateX(100%)}}`,
    `@keyframes lakar-skel-out{from{opacity:1}to{opacity:0}}`,
  ];
  entries.forEach((e, i) => {
    const s = sel(e.id);
    rules.push(
      `${s}{overflow:hidden}`,
      `${s}::before{${base};content:${cssString(e.label)};padding:12px 16px;font:600 13px/16px Inter,system-ui,sans-serif;color:#667085}`,
      `:host([data-generating]) ${s}::after{content:"";position:absolute;inset:0;pointer-events:none;` +
        `background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.55) 50%,rgba(255,255,255,0) 100%);` +
        `transform:translateX(-100%);animation:lakar-skel-sweep ${SKELETON_SWEEP_MS}ms linear ${i * SKELETON_STAGGER_MS}ms infinite}`,
    );
  });
  for (const id of filled) rules.push(`${sel(id)}::before{${base};animation:lakar-skel-out ${SKELETON_FILL_MS}ms ${EASE} forwards}`);
  rules.push(
    `@media (prefers-reduced-motion:reduce){${[...entries.map((e) => `${sel(e.id)}::after`), ...filled.map((id) => `${sel(id)}::before`)].join(',') || ':host'}{display:none;animation:none}}`,
  );
  return rules.join('\n');
}

/**
 * Id yang baru diisi: placeholder di mount sebelumnya yang masih ada di board tetapi tidak lagi placeholder.
 * `present` = id node yang ada di board sekarang.
 */
export function filledSince(prev: ReadonlySet<string>, now: readonly SkeletonEntry[], present: (id: string) => boolean): string[] {
  const still = new Set(now.map((e) => e.id));
  return [...prev].filter((id) => !still.has(id) && present(id));
}
