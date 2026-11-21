// Ikon garis gaya Lucide (24×24, stroke 2) yang dipakai desain viewer. Inline supaya tanpa dependensi tambahan.
import type { CSSProperties, ReactElement } from 'react';

type Shape = ['path', string] | ['circle', number, number, number] | ['rect', number, number, number, number, number];

const ICONS = {
  layoutGrid: [['rect', 3, 3, 7, 7, 1], ['rect', 14, 3, 7, 7, 1], ['rect', 14, 14, 7, 7, 1], ['rect', 3, 14, 7, 7, 1]],
  list: [['path', 'M3 12h.01M3 18h.01M3 6h.01M8 12h13M8 18h13M8 6h13']],
  search: [['circle', 11, 11, 8], ['path', 'm21 21-4.3-4.3']],
  file: [['path', 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'], ['path', 'M14 2v4a2 2 0 0 0 2 2h4']],
  x: [['path', 'M18 6 6 18M6 6l12 12']],
  menu: [['path', 'M4 12h16M4 6h16M4 18h16']],
  chevronDown: [['path', 'm6 9 6 6 6-6']],
  chevronRight: [['path', 'm9 18 6-6-6-6']],
  pointer: [['path', 'M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z']],
  hand: [
    ['path', 'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2'],
    ['path', 'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2'],
    ['path', 'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8'],
    ['path', 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'],
  ],
  plus: [['path', 'M5 12h14M12 5v14']],
  minus: [['path', 'M5 12h14']],
  fit: [['path', 'M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3']],
  shieldCheck: [
    ['path', 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
    ['path', 'm9 12 2 2 4-4'],
  ],
  alert: [['path', 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'], ['path', 'M12 9v4M12 17h.01']],
  circleCheck: [['circle', 12, 12, 10], ['path', 'm9 12 2 2 4-4']],
  copy: [['rect', 8, 8, 14, 14, 2], ['path', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2']],
  refresh: [['path', 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'], ['path', 'M21 3v5h-5']],
  text: [['path', 'M4 7V4h16v3M9 20h6M12 4v16']],
  frame: [['path', 'M22 6H2M22 18H2M6 2v20M18 2v20']],
  square: [['rect', 3, 3, 18, 18, 2]],
  circle: [['circle', 12, 12, 10]],
  spline: [['circle', 19, 5, 2], ['circle', 5, 19, 2], ['path', 'M5 17A12 12 0 0 1 17 5']],
  star: [
    ['path', 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
  ],
  board: [['rect', 2, 3, 20, 14, 2], ['path', 'M8 21h8M12 17v4']],
  wifiOff: [['path', 'M12 20h.01M8.5 16.429a5 5 0 0 1 7 0M5 12.859a10 10 0 0 1 5.17-2.69M19 12.859a10 10 0 0 0-2.007-1.523M2 8.82a15 15 0 0 1 4.177-2.643M22 8.82a15 15 0 0 0-11.288-3.764M2 2l20 20']],
  info: [['circle', 12, 12, 10], ['path', 'M12 16v-4M12 8h.01']],
  lock: [['rect', 3, 11, 18, 11, 2], ['path', 'M7 11V7a5 5 0 0 1 10 0v4']],
  plug: [['path', 'M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z']],
  clock: [['circle', 12, 12, 10], ['path', 'M12 6v6l4 2']],
  activity: [['path', 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2']],
  layers: [
    ['path', 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z'],
    ['path', 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12'],
    ['path', 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17'],
  ],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }): ReactElement {
  const shapes: Shape[] = ICONS[name];
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes.map((s, i) =>
        s[0] === 'path' ? <path key={i} d={s[1]} /> : s[0] === 'circle' ? <circle key={i} cx={s[1]} cy={s[2]} r={s[3]} /> : <rect key={i} x={s[1]} y={s[2]} width={s[3]} height={s[4]} rx={s[5]} />,
      )}
    </svg>
  );
}

/** Ikon tipe node untuk Layers dan Inspect. */
export const NODE_ICON: Record<string, IconName> = {
  board: 'board',
  frame: 'frame',
  text: 'text',
  rect: 'square',
  ellipse: 'circle',
  path: 'spline',
  icon: 'star',
};
