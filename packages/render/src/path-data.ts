// Data path SVG (`d`, AD-14): parser, serializer, transform afin, dan kotak batas. Murni (tanpa DOM, tanpa IO),
// tanpa import dari luar paket. Dipakai importer paste SVG daemon (story 3) dan editor titik (story 5).
// Segmen dinormalkan ke absolut: H/V → L, S → C, T → Q (titik kendali dipantulkan); A tetap A sampai ditransformasi.

/** Matriks afin SVG `[a, b, c, d, e, f]`: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = readonly [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Segmen absolut. `A` = [rx, ry, rotasi°, largeArc 0|1, sweep 0|1, x, y]. */
export type PathSeg =
  | { cmd: 'M'; args: [number, number] }
  | { cmd: 'L'; args: [number, number] }
  | { cmd: 'C'; args: [number, number, number, number, number, number] }
  | { cmd: 'Q'; args: [number, number, number, number] }
  | { cmd: 'A'; args: [number, number, number, number, number, number, number] }
  | { cmd: 'Z'; args: [] };

/** Kalikan `m × n` (terapkan `n` dulu, lalu `m`). */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const isIdentity = (m: Matrix, eps = 1e-12): boolean =>
  Math.abs(m[0] - 1) < eps && Math.abs(m[1]) < eps && Math.abs(m[2]) < eps && Math.abs(m[3] - 1) < eps && Math.abs(m[4]) < eps && Math.abs(m[5]) < eps;

const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const ARG_COUNT: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
/** Angka SVG; sticky (`lastIndex`) supaya tokenisasi linear tanpa menyalin sisa string. */
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/** Error parse `d` (posisi karakter disebut di pesan). */
export class PathDataError extends Error {}

/** Tokenisasi `d` → perintah dan angka. Flag arc boleh rapat (`a1 1 0 104 4`). */
function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  let i = 0;
  let cmd = '';
  let argIndex = 0;
  while (i < d.length) {
    const ch = d[i]!;
    if (/[\s,]/.test(ch)) {
      i++;
      continue;
    }
    if (/[MLHVCSQTAZmlhvcsqtaz]/.test(ch)) {
      out.push(ch);
      cmd = ch.toUpperCase();
      argIndex = 0;
      i++;
      continue;
    }
    // Flag arc (argumen ke-4 dan ke-5): satu karakter 0/1.
    if (cmd === 'A' && (argIndex % 7 === 3 || argIndex % 7 === 4)) {
      if (ch !== '0' && ch !== '1') throw new PathDataError(`flag arc harus 0 atau 1 di posisi ${i}`);
      out.push(ch === '1' ? 1 : 0);
      argIndex++;
      i++;
      continue;
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(d);
    if (!m) throw new PathDataError(`karakter tak dikenal ${JSON.stringify(ch)} di posisi ${i}`);
    const v = parseFloat(m[0]);
    if (!Number.isFinite(v)) throw new PathDataError(`angka di luar jangkauan di posisi ${i}`);
    out.push(v);
    argIndex++;
    i += m[0].length;
  }
  return out;
}

/** Urai `d` → segmen absolut. `d` kosong/tidak diawali M → PathDataError. */
export function parsePath(d: string): PathSeg[] {
  const tokens = tokenize(d);
  const segs: PathSeg[] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  // Titik kendali terakhir untuk S/T (refleksi).
  let lastC: [number, number] | undefined;
  let lastQ: [number, number] | undefined;
  let i = 0;
  if (tokens.length === 0) throw new PathDataError('d kosong');
  if (typeof tokens[0] !== 'string' || tokens[0].toUpperCase() !== 'M') throw new PathDataError('d harus diawali M/m');
  let cmd = '';
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (typeof t === 'string') {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        segs.push({ cmd: 'Z', args: [] });
        x = sx;
        y = sy;
        lastC = lastQ = undefined;
        continue;
      }
    } else if (!cmd || cmd === 'Z' || cmd === 'z') throw new PathDataError('angka tanpa perintah');
    const up = cmd.toUpperCase();
    const n = ARG_COUNT[up]!;
    const a: number[] = [];
    for (let k = 0; k < n; k++) {
      const v = tokens[i + k];
      if (typeof v !== 'number') throw new PathDataError(`perintah ${cmd} butuh ${n} angka`);
      a.push(v);
    }
    i += n;
    const rel = cmd !== up;
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (up) {
      case 'M': {
        x = a[0]! + ox;
        y = a[1]! + oy;
        sx = x;
        sy = y;
        segs.push({ cmd: 'M', args: [x, y] });
        // Pasangan berikutnya = lineto implisit.
        cmd = rel ? 'l' : 'L';
        lastC = lastQ = undefined;
        break;
      }
      case 'L':
        x = a[0]! + ox;
        y = a[1]! + oy;
        segs.push({ cmd: 'L', args: [x, y] });
        lastC = lastQ = undefined;
        break;
      case 'H':
        x = a[0]! + ox;
        segs.push({ cmd: 'L', args: [x, y] });
        lastC = lastQ = undefined;
        break;
      case 'V':
        y = a[0]! + oy;
        segs.push({ cmd: 'L', args: [x, y] });
        lastC = lastQ = undefined;
        break;
      case 'C': {
        const s: PathSeg = { cmd: 'C', args: [a[0]! + ox, a[1]! + oy, a[2]! + ox, a[3]! + oy, a[4]! + ox, a[5]! + oy] };
        segs.push(s);
        lastC = [s.args[2], s.args[3]];
        lastQ = undefined;
        x = s.args[4];
        y = s.args[5];
        break;
      }
      case 'S': {
        const c1: [number, number] = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
        const s: PathSeg = { cmd: 'C', args: [c1[0], c1[1], a[0]! + ox, a[1]! + oy, a[2]! + ox, a[3]! + oy] };
        segs.push(s);
        lastC = [s.args[2], s.args[3]];
        lastQ = undefined;
        x = s.args[4];
        y = s.args[5];
        break;
      }
      case 'Q': {
        const s: PathSeg = { cmd: 'Q', args: [a[0]! + ox, a[1]! + oy, a[2]! + ox, a[3]! + oy] };
        segs.push(s);
        lastQ = [s.args[0], s.args[1]];
        lastC = undefined;
        x = s.args[2];
        y = s.args[3];
        break;
      }
      case 'T': {
        const c: [number, number] = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
        const s: PathSeg = { cmd: 'Q', args: [c[0], c[1], a[0]! + ox, a[1]! + oy] };
        segs.push(s);
        lastQ = c;
        lastC = undefined;
        x = s.args[2];
        y = s.args[3];
        break;
      }
      case 'A': {
        const s: PathSeg = { cmd: 'A', args: [Math.abs(a[0]!), Math.abs(a[1]!), a[2]!, a[3] ? 1 : 0, a[4] ? 1 : 0, a[5]! + ox, a[6]! + oy] };
        segs.push(s);
        lastC = lastQ = undefined;
        x = s.args[5];
        y = s.args[6];
        break;
      }
    }
  }
  return segs;
}

const fmt = (n: number) => {
  const v = +n.toFixed(4);
  return String(Object.is(v, -0) ? 0 : v);
};

/** Segmen → `d` ringkas (4 desimal). */
export function serializePath(segs: readonly PathSeg[]): string {
  return segs.map((s) => s.cmd + s.args.map((v) => fmt(v)).join(' ')).join('');
}

/**
 * Arc SVG (endpoint parameterization, SVG 1.1 F.6) → kubik. `from` = titik awal. Radius 0 → garis lurus; titik
 * awal = akhir → tanpa segmen.
 */
export function arcToCubics(from: [number, number], arc: readonly [number, number, number, number, number, number, number]): PathSeg[] {
  const [x1, y1] = from;
  let [rx, ry] = arc;
  const [, , phiDeg, largeArc, sweep, x2, y2] = arc;
  if (x1 === x2 && y1 === y2) return [];
  if (rx === 0 || ry === 0) return [{ cmd: 'L', args: [x2, y2] }];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number): [number, number] => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const deriv = (t: number): [number, number] => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out: PathSeg[] = [];
  let t = theta1;
  for (let i = 0; i < n; i++) {
    const t2 = t + step;
    const p1 = point(t);
    const d1 = deriv(t);
    const p2 = i === n - 1 ? ([x2, y2] as [number, number]) : point(t2);
    const d2 = deriv(t2);
    out.push({ cmd: 'C', args: [p1[0] + k * d1[0], p1[1] + k * d1[1], p2[0] - k * d2[0], p2[1] - k * d2[1], p2[0], p2[1]] });
    t = t2;
  }
  return out;
}

/** Ganti arc dengan kubik (titik awal dilacak). */
export function flattenArcs(segs: readonly PathSeg[]): PathSeg[] {
  const out: PathSeg[] = [];
  let cur: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  for (const s of segs) {
    switch (s.cmd) {
      case 'M':
        cur = [s.args[0], s.args[1]];
        start = cur;
        out.push(s);
        break;
      case 'Z':
        cur = start;
        out.push(s);
        break;
      case 'A':
        out.push(...arcToCubics(cur, s.args));
        cur = [s.args[5], s.args[6]];
        break;
      case 'L':
        cur = [s.args[0], s.args[1]];
        out.push(s);
        break;
      case 'C':
        cur = [s.args[4], s.args[5]];
        out.push(s);
        break;
      case 'Q':
        cur = [s.args[2], s.args[3]];
        out.push(s);
        break;
    }
  }
  return out;
}

/** Terapkan matriks ke semua titik; arc diubah ke kubik dulu (transform umum tidak menjaga parameter arc). */
export function transformPath(segs: readonly PathSeg[], m: Matrix): PathSeg[] {
  return flattenArcs(segs).map((s): PathSeg => {
    const a = s.args as readonly number[];
    const pts: number[] = [];
    for (let i = 0; i < a.length; i += 2) pts.push(...apply(m, a[i]!, a[i + 1]!));
    return { cmd: s.cmd, args: pts } as PathSeg;
  });
}

/** Kotak titik ujung + titik kendali (arc lewat kubik) `[x, y, w, h]`; tanpa titik → undefined. */
export function pathBounds(segs: readonly PathSeg[]): [number, number, number, number] | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of flattenArcs(segs)) {
    const a = s.args as readonly number[];
    for (let i = 0; i + 1 < a.length; i += 2) {
      minX = Math.min(minX, a[i]!);
      maxX = Math.max(maxX, a[i]!);
      minY = Math.min(minY, a[i + 1]!);
      maxY = Math.max(maxY, a[i + 1]!);
    }
  }
  return Number.isFinite(minX) ? [minX, minY, maxX - minX, maxY - minY] : undefined;
}
