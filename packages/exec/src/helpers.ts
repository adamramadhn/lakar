// Helper desain bawaan sandbox (spec-skeleton-live-build): prelude skill core yang dulu ditulis ulang agen di setiap
// execute kini sudah ada sebagai global sebelum snippet berjalan. Dokumentasi untuk agen ada di skill core
// (`packages/skills/skills/core.md`, bagian Prelude); nilai di sini adalah sumber kebenarannya.
//
// Kompatibel mundur (AD-4): setiap helper dipasang sebagai properti global biasa (configurable, writable), jadi
// snippet lama yang masih mendeklarasikan prelude sendiri (`const C={…}`, `const T=(…)=>…`) tetap sah: deklarasi
// leksikal snippet membayangi properti global. Helper bawaan memanggil sesamanya lewat nama internal (closure),
// jadi `const line=…` di snippet tidak merusak `Btn`; hanya data desain `C`, `FONT`, `TY`, dan `HEAD` dicari sebagai
// identifier bebas saat dipanggil, sehingga palet/skala milik snippet (prelude lama) tetap dipakai helper bawaan.
//
// Palet per dokumen: `C`/`FONT` = nilai bawaan arketipe Jernih digabung dengan `keep.C`/`keep.FONT` (state sesi yang
// eksplisit). `Palette(c, font)` menulis palet utuh dari nilai bawaan (bukan menumpuk di atas palet sebelumnya) dan
// menyimpannya di `keep`; daemon menghapus `keep.C`/`keep.FONT` saat `open_doc` berpindah dokumen, jadi palet dokumen A
// tidak bocor ke dokumen B. `keep` hilang saat daemon restart (seperti `keep.board`); skill core meminta `Palette`
// diulang. Token dokumen (v3) tidak dipakai sebagai sumber palet: nilai `C` adalah literal hex di node, bukan
// referensi `{$token}`, dan menulis token akan mengubah dokumen pengguna (ekspor tokens.css, panel Theme) tanpa diminta.
import { SKELETON_PREFIX } from '@lakar/schema';

/** Nama global helper bawaan (urutan dokumentasi). */
export const HELPER_GLOBALS = ['C', 'FONT', 'Palette', 'R', 'TY', 'HEAD', 'fill', 'line', 'F', 'Row', 'T', 'I', 'Btn', 'Badge', 'Skel', 'Build'] as const;

/** Kunci `keep` palet dokumen aktif (dihapus daemon saat `open_doc` berpindah dokumen). */
export const PALETTE_KEEP_KEYS = ['C', 'FONT'] as const;

/** Palet bawaan (arketipe Jernih). */
export const DEFAULT_C = {
  bg: '#FFFFFF',
  sub: '#F6F7F9',
  line: '#E4E7EC',
  line2: '#D0D5DD',
  t1: '#101828',
  t2: '#475467',
  t3: '#667085',
  acc: '#0F766E',
  tint: '#0F766E14',
  on: '#FFFFFF',
  field: '#E6F2F1',
  deep: '#0B4F4A',
  acc2: '#CA8A04',
  data: ['#0F766E', '#5EB8AE', '#CA8A04'],
  ok: '#15803D',
  warn: '#B45309',
  bad: '#DC2626',
} as const;
export const DEFAULT_FONT = { h: 'Plus Jakarta Sans', b: 'Inter', m: 'JetBrains Mono' } as const;

/**
 * Sumber JavaScript helper (dievaluasi di QuickJS sesudah `keep` terpasang, sebelum snippet). Helper saling memanggil
 * lewat nama internal (closure); hanya `C`, `FONT`, `TY`, `HEAD` (dan API `add`/`get`/`update`/`keep`) identifier bebas.
 */
export const HELPERS_JS = `(function () {
  const g = globalThis;
  const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const C0 = ${JSON.stringify(DEFAULT_C)};
  const FONT0 = ${JSON.stringify(DEFAULT_FONT)};
  const k = g.keep;
  g.C = Object.assign(JSON.parse(JSON.stringify(C0)), plain(k) && plain(k.C) ? k.C : {});
  g.FONT = Object.assign({}, FONT0, plain(k) && plain(k.FONT) ? k.FONT : {});
  // Palet utuh dari nilai bawaan (bukan menumpuk), disimpan di keep untuk execute berikutnya di dokumen ini.
  const Palette = (c = {}, font = {}) => {
    for (const key of Object.keys(C)) delete C[key];
    for (const key of Object.keys(FONT)) delete FONT[key];
    Object.assign(C, JSON.parse(JSON.stringify(C0)), c);
    Object.assign(FONT, FONT0, font);
    keep.C = JSON.parse(JSON.stringify(C));
    keep.FONT = Object.assign({}, FONT);
    return C;
  };
  const R = (size, lineHeight, weight, letterSpacing = 0) => ({ size, lineHeight, weight, letterSpacing });
  g.TY = { 'display-xl': R(64, 72, 700, -0.02), 'display-lg': R(48, 56, 700, -0.02), h1: R(40, 48, 700, -0.015), h2: R(32, 40, 700, -0.01),
    'title-lg': R(28, 36, 700, -0.01), h3: R(24, 32, 600), title: R(22, 28, 700), h4: R(20, 28, 600), 'body-lg': R(18, 28, 400), body: R(16, 24, 400),
    'body-sm': R(14, 20, 400), label: R(14, 20, 600), caption: R(12, 16, 500), tab: R(12, 16, 600), overline: R(12, 16, 600, 0.08) };
  g.HEAD = ['display-xl', 'display-lg', 'h1', 'h2', 'title-lg', 'h3', 'title', 'h4'];
  const fill = (c) => [{ type: 'solid', color: c }];
  const line = (c = C.line) => ({ color: c, width: 1, align: 'inside' });
  const F = (p, name, o = {}) => add(p, { type: 'frame', name, layout: 'column', ...o });
  const Row = (p, name, o = {}) => F(p, name, { layout: 'row', align: 'center', ...o });
  const T = (p, name, content, role = 'body', o = {}) => add(p, { type: 'text', name, content, color: C.t1, family: HEAD.includes(role) ? FONT.h : FONT.b, ...TY[role], ...o });
  const I = (p, icon, size = 20, color = C.t2, o = {}) => add(p, { type: 'icon', lib: 'lucide', icon, size, color, ...o });
  const Btn = (p, label, kind = 'primary', o = {}) => {
    const pri = kind === 'primary';
    const b = Row(p, 'Button / ' + label, { height: 48, padding: [0, 24], gap: 8, justify: 'center', radius: 8, fills: fill(pri ? C.acc : C.bg), ...(pri ? {} : { stroke: line(C.line2) }), ...o });
    T(b, 'Label', label, 'label', { color: pri ? C.on : C.t1 });
    return b;
  };
  const Badge = (p, label, tone = 'accent', icon, size = 'sm', on = C.bg) => {
    const fg = { accent: C.acc, success: C.ok, warning: C.warn, danger: C.bad, neutral: C.t2, extra: C.acc2 }[tone] ?? C.acc, sm = size === 'sm';
    const L = (c) => parseInt(c.slice(3, 5), 16) > 127, dk = L(C.bg) && !L(on);
    const ink = dk ? C.on : !L(C.bg) || tone === 'neutral' ? fg : '#' + fg.slice(1, 7).match(/../g).map((h) => (parseInt(h, 16) >> 1).toString(16).padStart(2, '0')).join('');
    const b = Row(p, 'Badge / ' + label, { width: 'hug', height: sm ? 20 : 24, padding: [0, sm ? 6 : 8], gap: 4, radius: 9999, fills: fill(dk ? C.on + '1F' : tone === 'neutral' ? C.sub : fg + '1F') });
    if (icon) I(b, icon, sm ? 12 : 14, ink);
    T(b, 'Teks', label, 'caption', { color: ink });
    return b;
  };
  const SK = ${JSON.stringify(SKELETON_PREFIX)};
  const Skel = (p, name, minHeight = 240, o = {}) => F(p, SK + name, { width: 'fill', minHeight, ...o });
  // minHeight hanya dilepas dari placeholder (perkiraan tinggi skeleton); frame biasa mempertahankan minHeight-nya.
  const Build = (id, o = {}) => {
    const n = get(id);
    const skel = n.name.startsWith(SK);
    update(id, { ...(skel ? { name: n.name.slice(SK.length), minHeight: null } : {}), ...o });
    return id;
  };
  Object.assign(g, { Palette, R, fill, line, F, Row, T, I, Btn, Badge, Skel, Build });
})()`;