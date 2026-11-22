// Ikon garis gaya Lucide (24×24, stroke 2) yang dipakai desain viewer. Inline supaya tanpa dependensi tambahan.
import type { CSSProperties, ReactElement } from 'react';

type Shape = ['path', string] | ['circle', number, number, number] | ['rect', number, number, number, number, number];

const ICONS = {
  layoutGrid: [['rect', 3, 3, 7, 7, 1], ['rect', 14, 3, 7, 7, 1], ['rect', 14, 14, 7, 7, 1], ['rect', 3, 14, 7, 7, 1]],
  list: [['path', 'M3 12h.01M3 18h.01M3 6h.01M8 12h13M8 18h13M8 6h13']],
  search: [['circle', 11, 11, 8], ['path', 'm21 21-4.3-4.3']],
  searchX: [['circle', 11, 11, 8], ['path', 'm13.5 8.5-5 5M8.5 8.5l5 5M21 21l-4.3-4.3']],
  folder: [['path', 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z']],
  folderPlus: [['path', 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'], ['path', 'M12 10v6M9 13h6']],
  folderInput: [['path', 'M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1'], ['path', 'M2 13h10m-3 3 3-3-3-3']],
  file: [['path', 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'], ['path', 'M14 2v4a2 2 0 0 0 2 2h4']],
  x: [['path', 'M18 6 6 18M6 6l12 12']],
  menu: [['path', 'M4 12h16M4 6h16M4 18h16']],
  chevronDown: [['path', 'm6 9 6 6 6-6']],
  chevronRight: [['path', 'm9 18 6-6-6-6']],
  chevronLeft: [['path', 'm15 18-6-6 6-6']],
  pointer: [['path', 'M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z']],
  hand: [
    ['path', 'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2'],
    ['path', 'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2'],
    ['path', 'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8'],
    ['path', 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'],
  ],
  plus: [['path', 'M5 12h14M12 5v14']],
  radio: [['path', 'M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9C23 8.8 23 15.1 19.1 19'], ['circle', 12, 12, 2]],
  sparkles: [
    ['path', 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z'],
    ['path', 'M20 3v4M22 5h-4M4 17v2M5 18H3'],
  ],
  gitCommit: [['circle', 12, 12, 3], ['path', 'M3 12h6M15 12h6']],
  minus: [['path', 'M5 12h14']],
  arrowDownUp: [['path', 'm3 16 4 4 4-4M7 20V4m14 4-4-4-4 4m4-4v16']],
  fit: [['path', 'M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3']],
  shieldCheck: [
    ['path', 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
    ['path', 'm9 12 2 2 4-4'],
  ],
  alert: [['path', 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'], ['path', 'M12 9v4M12 17h.01']],
  circleCheck: [['circle', 12, 12, 10], ['path', 'm9 12 2 2 4-4']],
  copy: [['rect', 8, 8, 14, 14, 2], ['path', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2']],
  download: [['path', 'M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'], ['path', 'm7 10 5 5 5-5']],
  refresh: [['path', 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'], ['path', 'M21 3v5h-5']],
  text: [['path', 'M4 7V4h16v3M9 20h6M12 4v16']],
  frame: [['path', 'M22 6H2M22 18H2M6 2v20M18 2v20']],
  square: [['rect', 3, 3, 18, 18, 2]],
  image: [['rect', 3, 3, 18, 18, 2], ['circle', 9, 9, 2], ['path', 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21']],
  shapes: [['path', 'M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z'], ['rect', 3, 14, 7, 7, 1], ['circle', 17.5, 17.5, 3.5]],
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
  settings: [
    [
      'path',
      'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
    ],
    ['circle', 12, 12, 3],
  ],
  server: [['rect', 2, 2, 20, 8, 2], ['rect', 2, 14, 20, 8, 2], ['path', 'M6 6h.01M6 18h.01']],
  activity: [['path', 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2']],
  loaderCircle: [['path', 'M21 12a9 9 0 1 1-6.219-8.56']],
  circleX: [['circle', 12, 12, 10], ['path', 'm15 9-6 6M9 9l6 6']],
  crosshair: [['circle', 12, 12, 10], ['path', 'M22 12h-4M6 12H2M12 6V2M12 22v-4']],
  squareTerminal: [['rect', 3, 3, 18, 18, 2], ['path', 'm7 11 2-2-2-2M11 13h4']],
  ellipsis: [['circle', 12, 12, 1], ['circle', 19, 12, 1], ['circle', 5, 12, 1]],
  pencil: [['path', 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'], ['path', 'm15 5 4 4']],
  link: [['path', 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'], ['path', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71']],
  archive: [['rect', 2, 3, 20, 5, 1], ['path', 'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4']],
  archiveRestore: [['rect', 2, 3, 20, 5, 1], ['path', 'M4 8v11a2 2 0 0 0 2 2h2M20 8v11a2 2 0 0 1-2 2h-2m-7-6 3-3 3 3M12 12v9']],
  trash: [['path', 'M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2']],
  history: [['path', 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'], ['path', 'M3 3v5h5'], ['path', 'M12 7v5l4 2']],
  rotateCcw: [['path', 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'], ['path', 'M3 3v5h5']],
  gitCompare: [['circle', 18, 18, 3], ['circle', 6, 6, 3], ['path', 'M13 6h3a2 2 0 0 1 2 2v7'], ['path', 'M11 18H8a2 2 0 0 1-2-2V9']],
  arrowUpRight: [['path', 'M7 7h10v10M7 17 17 7']],
  check: [['path', 'M20 6 9 17l-5-5']],
  arrowUp: [['path', 'm5 12 7-7 7 7M12 19V5']],
  arrowDown: [['path', 'M12 5v14M19 12l-7 7-7-7']],
  externalLink: [['path', 'M15 3h6v6M10 14 21 3'], ['path', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6']],
  tablet: [['rect', 4, 2, 16, 20, 2], ['path', 'M12 18h.01']],
  smartphone: [['rect', 5, 2, 14, 20, 2], ['path', 'M12 18h.01']],
  undo2: [['path', 'M9 14 4 9l5-5'], ['path', 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11']],
  redo2: [['path', 'm15 14 5-5-5-5'], ['path', 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13']],
  arrowLeftRight: [['path', 'M8 3 4 7l4 4'], ['path', 'M4 7h16'], ['path', 'm16 21 4-4-4-4'], ['path', 'M20 17H4']],
  arrowUpDown: [['path', 'm21 16-4 4-4-4'], ['path', 'M17 20V4'], ['path', 'm3 8 4-4 4 4'], ['path', 'M7 4v16']],
  hourglass: [['path', 'M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2']],
  eye: [['path', 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'], ['circle', 12, 12, 3]],
  columns2: [['rect', 3, 3, 18, 18, 2], ['path', 'M12 3v18']],
  squareDashed: [['path', 'M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M21 19a2 2 0 0 1-2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h1M14 3h1M14 21h1M3 9v1M21 9v1M3 14v1M21 14v1']],
  arrowRight: [['path', 'M5 12h14M12 5l7 7-7 7']],
  textAlignStart: [['path', 'M21 5H3M15 12H3M17 19H3']],
  textAlignCenter: [['path', 'M21 5H3M17 12H7M19 19H5']],
  textAlignEnd: [['path', 'M21 5H3M21 12H9M21 19H7']],
  textAlignJustify: [['path', 'M3 5h18M3 12h18M3 19h18']],
  panelTop: [['rect', 3, 3, 18, 18, 2], ['path', 'M3 9h18']],
  panelRight: [['rect', 3, 3, 18, 18, 2], ['path', 'M15 3v18']],
  panelBottom: [['rect', 3, 3, 18, 18, 2], ['path', 'M3 15h18']],
  panelLeft: [['rect', 3, 3, 18, 18, 2], ['path', 'M9 3v18']],
  scan: [['path', 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2']],
  // Aksi edit (story 6, desain "Context menu" / "Align & distribute"): lucide group, ungroup, bring-to-front,
  // send-to-back, align-*, align-*-space-around.
  group: [['path', 'M3 7V5c0-1.1.9-2 2-2h2M17 3h2c1.1 0 2 .9 2 2v2M21 17v2c0 1.1-.9 2-2 2h-2M7 21H5c-1.1 0-2-.9-2-2v-2'], ['rect', 7, 7, 7, 5, 1], ['rect', 10, 12, 7, 5, 1]],
  ungroup: [['rect', 5, 4, 8, 6, 1], ['rect', 11, 14, 8, 6, 1]],
  bringForward: [['rect', 8, 8, 8, 8, 2], ['path', 'M4 10a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2M14 20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2']],
  sendBackward: [['rect', 14, 14, 8, 8, 2], ['rect', 2, 2, 8, 8, 2], ['path', 'M7 14v1a2 2 0 0 0 2 2h1M14 7h1a2 2 0 0 1 2 2v1']],
  alignLeft: [['rect', 6, 14, 9, 6, 2], ['rect', 6, 4, 16, 6, 2], ['path', 'M2 2v20']],
  alignCenterX: [['path', 'M12 2v20M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1']],
  alignRight: [['rect', 2, 4, 16, 6, 2], ['rect', 9, 14, 9, 6, 2], ['path', 'M22 22V2']],
  alignTop: [['rect', 4, 6, 6, 16, 2], ['rect', 14, 6, 6, 9, 2], ['path', 'M22 2H2']],
  alignCenterY: [['path', 'M2 12h20M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1M14 8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1']],
  alignBottom: [['rect', 4, 2, 6, 16, 2], ['rect', 14, 9, 6, 9, 2], ['path', 'M22 22H2']],
  distributeX: [['rect', 9, 7, 6, 10, 2], ['path', 'M4 22V2M20 22V2']],
  distributeY: [['rect', 7, 9, 10, 6, 2], ['path', 'M22 20H2M22 4H2']],
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
  // Desain (Layer Row): board memakai ikon frame (#) sama seperti frame.
  board: 'frame',
  frame: 'frame',
  text: 'text',
  rect: 'square',
  ellipse: 'circle',
  path: 'spline',
  icon: 'star',
};
