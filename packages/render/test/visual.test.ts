// Tes golden properti visual (Design Notes story 8): fills, stroke, radius, shadows, efek, ellipse busur, ikon (story 10),
// path, fill gambar, layar gulir hasil `duplicate`, dan fill efek conic/noise/mesh (story 22). Golden + piksel sampel +
// bounds numerik + determinisme byte-identik + latensi.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveDocument, type ResolvedDocument } from '@lakar/schema';
// Tes boleh memakai core lewat path relatif (manifest render TIDAK bergantung pada @lakar/core).
import { beginTransaction, createDocument } from '../../core/src/index.js';
import type { BoardMeasure, NodeBounds } from '../src/index.js';
import {
  boardDoc,
  browserInstalled,
  compareGolden,
  currentPage,
  ellipse,
  freshPage,
  frame,
  icon,
  GOLDEN_MAX_RATIO,
  interFaces,
  path,
  pixelDiffRatio,
  pixels,
  rect,
  render,
  start,
  stop,
  testImageAsset,
  text,
} from './harness.js';
import { testLog } from '../../../tests/support/log.ts';

const faces = interFaces(400);
type Loose = Record<string, unknown>;
type Rgba = [number, number, number, number];

async function run(name: string, children: Loose[], size: { width: number; height: number }, fills?: Loose[]) {
  const { doc, boardId } = boardDoc(children, size, fills);
  const { result, png } = await render(doc, boardId, faces);
  if (!result.ok || !png) throw new Error(`render gagal: ${JSON.stringify(result)}`);
  await compareGolden(name, png);
  return { png, measure: result.measure, at: bounds(result.measure) };
}

const bounds = (m: BoardMeasure) => (id: unknown): NodeBounds => {
  const b = m.nodes.find((n) => n.id === id);
  if (!b) throw new Error(`node ${String(id)} tidak diukur`);
  return b;
};

const near = (v: number, want: number, tol = 0.5) => expect(Math.abs(v - want), `${v} ≈ ${want}`).toBeLessThanOrEqual(tol);
/** Warna piksel mendekati `hex` (selisih kanal ≤ tol). */
const isColor = (p: Rgba, hex: string, tol = 12) => {
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return want.every((v, i) => Math.abs(v - p[i]!) <= tol);
};
const expectColor = (p: Rgba, hex: string, label: string, tol = 12) => expect(isColor(p, hex, tol), `${label}: ${p} ≈ ${hex}`).toBe(true);
const luma = (p: Rgba) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];

const abs = (x: number, y: number, props: Loose = {}): Loose => ({ position: 'absolute', x, y, ...props });
const solid = (color: string) => [{ type: 'solid', color }];

const RED = '#E53935';
const GREEN = '#43A047';
const BLUE = '#1E88E5';
const WHITE = '#FFFFFF';
const BG = '#F2F2F2';

describe.skipIf(!browserInstalled)('render properti visual (Chromium, tanpa daemon)', () => {
  beforeAll(start, 60_000);
  afterAll(stop);

  it('ring-progres: 3 busur annulus mulai jam 12 searah jarum jam; tanpa busur = lingkaran penuh', async () => {
    const ring = (sweepDeg: number | undefined, color: string, props: Loose = {}) =>
      ellipse({ width: 120, height: 120, inner: 0.8, startDeg: 0, ...(sweepDeg === undefined ? {} : { sweepDeg }), fills: solid(color), ...props });
    const r270 = ring(270, RED, abs(20, 20));
    const r180 = ring(180, GREEN, abs(160, 20));
    const r90 = ring(90, BLUE, abs(300, 20));
    // Tumpukan absolute: 270 (bawah), 180, 90 (atas) + lingkaran penuh tanpa busur.
    const stack = frame(abs(440, 20, { layout: 'none', width: 120, height: 120 }), [
      ring(270, RED, abs(0, 0)),
      ring(180, GREEN, abs(0, 0)),
      ring(90, BLUE, abs(0, 0)),
    ]);
    const full = ellipse(abs(600, 50, { width: 60, height: 60, fills: solid(RED) }));
    const { png, at } = await run('ring-progres', [r270, r180, r90, stack, full], { width: 680, height: 160 });
    near(at(r270.id).width, 120);
    near(at(r270.id).height, 120);
    // pita: R 60, r 48 → tengah pita 54 dari pusat.
    const [jam3, jam9on180, pusat, jam6on270, jam10on270, s45, s135, s225, s315, fullCenter] = await pixels(png, [
      [80 + 54, 80],
      [220 - 54, 80],
      [80, 80],
      [80, 80 + 54],
      [80 - 38, 80 - 38],
      [500 + 38, 80 - 38],
      [500 + 38, 80 + 38],
      [500 - 38, 80 + 38],
      [500 - 38, 80 - 38],
      [630, 80],
    ]);
    expectColor(jam3!, RED, 'jam 3 busur 270°');
    expectColor(jam6on270!, RED, 'jam 6 busur 270°');
    expectColor(jam10on270!, WHITE, 'jam 10:30 di luar busur 270°');
    expectColor(jam9on180!, WHITE, 'jam 9 busur 180° = latar');
    expectColor(pusat!, WHITE, 'pusat = latar');
    expectColor(s45!, BLUE, 'tumpukan 45°');
    expectColor(s135!, GREEN, 'tumpukan 135°');
    expectColor(s225!, RED, 'tumpukan 225°');
    expectColor(s315!, WHITE, 'tumpukan 315°');
    expectColor(fullCenter!, RED, 'ellipse tanpa busur penuh');
  });

  it('kartu-gradien: radius 16, linear 135° + radial, drop shadow + inner, stroke inside di atas anak', async () => {
    const title = text('Kartu', { size: 24, lineHeight: 32, weight: 400, color: '#FFFFFF' });
    // Anak opak yang menutup pojok kiri atas termasuk tepi stroke dan pita inner shadow.
    const TEAL = '#00897B';
    const corner = rect(abs(0, 0, { width: 36, height: 36, fills: solid(TEAL) }));
    const card = frame(
      abs(60, 40, {
        layout: 'column',
        width: 280,
        height: 180,
        padding: [20, 20, 20, 52],
        radius: 16,
        fills: [
          { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#3730A3' }, { offset: 1, color: '#DB2777' }] },
          { type: 'radial', stops: [{ offset: 0, color: '#FFFFFF59' }, { offset: 1, color: '#FFFFFF00' }] },
        ],
        shadows: [
          { type: 'drop', x: 0, y: 8, blur: 24, spread: -4, color: '#00000066' },
          { type: 'inner', x: 0, y: 2, blur: 4, spread: 0, color: '#FFFFFF80' },
        ],
        stroke: { color: '#FFFFFF', width: 1, align: 'inside' },
      }),
      [title, corner],
    );
    const { png, at } = await run('kartu-gradien', [card], { width: 400, height: 280 }, solid(BG));
    near(at(card.id).width, 280);
    near(at(card.id).height, 180);
    const [tl, br, center, below, far, cornerTR, edge, strokeTop, strokeLeft, underInner] = await pixels(png, [
      [150, 48],
      [328, 208],
      [200, 130],
      [200, 226],
      [10, 270],
      [338, 41],
      [200, 40],
      [78, 40], // tepi atas kartu di atas anak
      [60, 62], // tepi kiri kartu di atas anak
      [78, 43], // pita inner shadow, di dalam anak
    ]);
    // kiri atas mendekati indigo (biru > merah), kanan bawah mendekati pink (merah > biru).
    expect(tl![2]).toBeGreaterThan(tl![0]);
    expect(br![0]).toBeGreaterThan(br![2]);
    // radial putih di tengah: lebih terang dari rata-rata dua sudut.
    expect(luma(center!)).toBeGreaterThan((luma(tl!) + luma(br!)) / 2);
    // bayangan di bawah kartu lebih gelap dari latar.
    expectColor(far!, BG, 'latar jauh', 2);
    expect(luma(below!)).toBeLessThan(luma(far!) - 10);
    // sudut terpotong radius: piksel (1,1) dari pojok kanan atas kartu bukan warna kartu.
    expect(luma(cornerTR!)).toBeGreaterThan(150);
    // stroke di atas anak; inner shadow di bawah anak (pita inner berwarna anak sendiri).
    expectColor(strokeTop!, WHITE, 'stroke tepi atas di atas anak', 6);
    expectColor(strokeLeft!, WHITE, 'stroke tepi kiri di atas anak', 6);
    expectColor(underInner!, TEAL, 'inner shadow di bawah anak', 4);
    // stroke inside 1px putih di tepi atas.
    expect(luma(edge!)).toBeGreaterThan(200);
  });

  it('stroke-align: inside/center/outside tidak mengubah bounds 100×60; sides bottom', async () => {
    const STROKE = '#D81B60';
    const FILL = '#BDBDBD';
    const box = (x: number, y: number, stroke: Loose) => rect(abs(x, y, { width: 100, height: 60, fills: solid(FILL), stroke: { color: STROKE, width: 4, ...stroke } }));
    const inside = box(20, 30, { align: 'inside' });
    const center = box(160, 30, { align: 'center' });
    const outside = box(300, 30, { align: 'outside' });
    const bottom = box(160, 120, { align: 'inside', sides: ['bottom'] });
    const { png, at } = await run('stroke-align', [inside, center, outside, bottom], { width: 440, height: 200 });
    for (const n of [inside, center, outside, bottom]) {
      near(at(n.id).width, 100);
      near(at(n.id).height, 60);
    }
    const outerAt = (x: number) => [x - 2, 60] as const; // 2px di luar tepi kiri
    const innerAt = (x: number) => [x + 1, 60] as const; // 1px di dalam tepi kiri
    const px = await pixels(png, [outerAt(20), outerAt(160), outerAt(300), innerAt(20), innerAt(160), innerAt(300), [210, 178], [210, 121], [161, 150], [210, 183]]);
    expectColor(px[0]!, WHITE, 'inside: luar tepi = latar');
    expectColor(px[1]!, STROKE, 'center: luar tepi = stroke');
    expectColor(px[2]!, STROKE, 'outside: luar tepi = stroke');
    expectColor(px[3]!, STROKE, 'inside: dalam tepi = stroke');
    expectColor(px[4]!, STROKE, 'center: dalam tepi = stroke');
    expectColor(px[5]!, FILL, 'outside: dalam tepi = fill');
    expectColor(px[6]!, STROKE, 'sides bottom: garis bawah');
    expectColor(px[7]!, FILL, 'sides bottom: tanpa garis atas');
    expectColor(px[8]!, FILL, 'sides bottom: tanpa garis kiri');
    expectColor(px[9]!, WHITE, 'sides bottom inside: tidak keluar tepi');
  });

  it('radius-clip: radius angka dan 4 sudut; frame clip+radius memotong anak', async () => {
    const DARK = '#263238';
    const r1 = rect(abs(20, 20, { width: 100, height: 100, radius: 24, fills: solid(BLUE) }));
    const r4 = rect(abs(140, 20, { width: 100, height: 100, radius: [0, 16, 40, 8], fills: solid(GREEN) }));
    const clipped = frame(abs(260, 20, { layout: 'column', width: 100, height: 100, radius: 30, clip: true, fills: solid(RED) }), [
      rect({ width: 'fill', height: 'fill', fills: solid(DARK) }),
    ]);
    const open = frame(abs(380, 20, { layout: 'column', width: 100, height: 100, radius: 30, fills: solid(RED) }), [
      rect({ width: 'fill', height: 'fill', fills: solid(DARK) }),
    ]);
    const { png } = await run('radius-clip', [r1, r4, clipped, open], { width: 500, height: 140 });
    const [c1, c4tl, c4br, clipCorner, clipCenter, openCorner] = await pixels(png, [
      [22, 22],
      [141, 21],
      [236, 116],
      [262, 22],
      [310, 70],
      [382, 22],
    ]);
    expectColor(c1!, WHITE, 'radius 24: pojok terpotong');
    expectColor(c4tl!, GREEN, 'radius [0,…]: pojok kiri atas tajam');
    expectColor(c4br!, WHITE, 'radius […,40,…]: pojok kanan bawah terpotong');
    expectColor(clipCorner!, WHITE, 'clip+radius: anak terpotong di pojok');
    expectColor(clipCenter!, DARK, 'clip+radius: anak terlihat di tengah');
    expectColor(openCorner!, DARK, 'tanpa clip: anak tidak terpotong');
  });

  it('efek: opacity, blend multiply, blur, backdropBlur di atas pola, rotation 30° (bounds AABB)', async () => {
    const stripes = frame(abs(0, 0, { layout: 'row', width: 600, height: 40 }), Array.from({ length: 30 }, (_, i) => rect({ width: 20, height: 40, fills: solid(i % 2 ? '#000000' : WHITE) })));
    const backdrop = frame(abs(20, 0, { layout: 'none', width: 120, height: 40, backdropBlur: 32, fills: solid('#FFFFFF33') }));
    const plain = frame(abs(160, 0, { layout: 'none', width: 120, height: 40, fills: solid('#FFFFFF33') }));
    const faded = rect(abs(20, 60, { width: 80, height: 60, fills: solid(RED), opacity: 0.5 }));
    const cyan = rect(abs(120, 60, { width: 80, height: 60, fills: solid('#00FFFF') }));
    const multiply = rect(abs(160, 80, { width: 80, height: 60, fills: solid('#FFFF00'), blend: 'multiply' }));
    const blurred = rect(abs(270, 70, { width: 60, height: 40, fills: solid(BLUE), blur: 12 }));
    const rotated = rect(abs(380, 60, { width: 100, height: 60, fills: solid(GREEN), rotation: 30 }));
    const label = text('Efek', abs(500, 80, { size: 20, lineHeight: 24, opacity: 0.6, shadows: [{ x: 2, y: 2, blur: 2, color: '#00000080' }] }));
    const { png, at } = await run('efek', [stripes, backdrop, plain, faded, cyan, multiply, blurred, rotated, label], { width: 600, height: 180 });
    const rb = at(rotated.id);
    expect(rb.width).toBeGreaterThan(100);
    near(rb.width, 100 * Math.cos(Math.PI / 6) + 60 * Math.sin(Math.PI / 6), 1);
    near(rb.height, 100 * Math.sin(Math.PI / 6) + 60 * Math.cos(Math.PI / 6), 1);
    // AABB tetap berpusat di tempat layout (origin tengah, tanpa efek layout).
    near(rb.x + rb.width / 2, 430, 1);
    near(rb.y + rb.height / 2, 90, 1);
    const [fade, mul, blurEdge, blurOut, bdA, bdB, plainA, plainB] = await pixels(png, [
      [60, 90],
      [180, 100],
      [270, 90],
      [262, 90],
      [70, 20],
      [90, 20],
      [210, 20],
      [230, 20],
    ]);
    expectColor(fade!, '#F29C9A', 'opacity 0.5 merah di atas putih', 6);
    expectColor(mul!, '#00FF00', 'multiply kuning × cyan = hijau', 6);
    // blur: tepi kotak tidak tajam, ada tinta di luar tepi.
    expect(isColor(blurEdge!, BLUE, 12)).toBe(false);
    expect(luma(blurOut!)).toBeLessThan(250);
    // backdropBlur meratakan garis hitam-putih; tanpa backdropBlur kontras tetap (putih vs hitam + 20% putih).
    const plainContrast = Math.abs(luma(plainA!) - luma(plainB!));
    expect(plainContrast).toBeGreaterThan(150);
    expect(Math.abs(luma(bdA!) - luma(bdB!))).toBeLessThan(plainContrast / 2);
  });

  it('ellipse-path: radial + stroke outside, sweep negatif/0/360+inner, path viewBox, drop shadow', async () => {
    const PINK = '#D81B60';
    const full = ellipse(
      abs(20, 20, {
        width: 100,
        height: 80,
        fills: [{ type: 'radial', stops: [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: BLUE }] }],
        stroke: { color: PINK, width: 3, align: 'outside' },
      }),
    );
    const neg = ellipse(abs(140, 20, { width: 80, height: 80, sweepDeg: -90, inner: 0.6, fills: solid(RED) }));
    const zero = ellipse(abs(240, 20, { width: 80, height: 80, sweepDeg: 0, inner: 0.5, fills: solid(RED), stroke: { color: '#000000', width: 2, align: 'center' } }));
    const annulus = ellipse(abs(340, 20, { width: 80, height: 80, sweepDeg: 360, inner: 0.5, fills: solid(GREEN), stroke: { color: '#000000', width: 2, align: 'inside' } }));
    const tri = path('M50 0 L100 100 L0 100 Z', [0, 0, 100, 100], abs(20, 130, { width: 120, height: 80, fills: solid(BLUE), stroke: { color: '#000000', width: 2, align: 'center' } }));
    const STAR = 'M12 2 L15.09 8.26 L22 9.27 L17 14.14 L18.18 21.02 L12 17.77 L5.82 21.02 L7 14.14 L2 9.27 L8.91 8.26 Z';
    const star = path(STAR, [0, 0, 24, 24], abs(170, 150, { fills: solid('#FDD835'), stroke: { color: '#5D4037', width: 1, align: 'inside' } }));
    const bigStar = path(STAR, [0, 0, 24, 24], abs(220, 120, { width: 96, height: 96, fills: solid('#FDD835'), stroke: { color: '#5D4037', width: 3, align: 'outside' }, shadows: [{ x: 4, y: 6, blur: 8, color: '#00000080' }] }));
    const { png, at } = await run('ellipse-path', [full, neg, zero, annulus, tri, star, bigStar], { width: 440, height: 240 });
    near(at(star.id).width, 24);
    near(at(star.id).height, 24);
    near(at(tri.id).width, 120);
    near(at(tri.id).height, 80);
    near(at(zero.id).width, 80);
    const [fullCenter, fullEdge, strokeOut, negTL, negTR, zeroC, annBand, annCenter, triIn, triCorner, shadow] = await pixels(png, [
      [70, 60],
      [22, 60],
      [18, 60],
      [140 + 40 - 26, 20 + 40 - 26],
      [140 + 40 + 26, 20 + 40 - 26],
      [280, 60],
      [340 + 40, 20 + 7],
      [380, 60],
      [80, 200],
      [22, 132],
      [296, 212], // di bawah kanan ujung kaki kanan bintang besar
    ]);
    expectColor(fullCenter!, WHITE, 'radial: pusat putih', 16);
    expect(fullEdge![2]).toBeGreaterThan(fullEdge![0] + 60); // tepi biru
    expectColor(strokeOut!, PINK, 'stroke outside di luar tepi ellipse', 30);
    expectColor(negTL!, RED, 'sweep −90: kuadran kiri atas');
    expectColor(negTR!, WHITE, 'sweep −90: kuadran kanan atas kosong');
    expectColor(zeroC!, WHITE, 'sweep 0: tidak tergambar');
    expectColor(annBand!, GREEN, 'sweep 360 + inner: pita');
    expectColor(annCenter!, WHITE, 'sweep 360 + inner: lubang');
    expectColor(triIn!, BLUE, 'segitiga: dalam');
    expectColor(triCorner!, WHITE, 'segitiga: pojok box kosong');
    expect(luma(shadow!)).toBeLessThan(230); // drop shadow mengikuti bentuk bintang
  });

  it('bayangan-path-vs-rect: drop-shadow path dikalibrasi sama dengan box-shadow rect', async () => {
    const shadow = (blur: number) => [{ type: 'drop', x: 6, y: 10, blur, color: '#000000A0' }];
    const one = async (node: Loose) => {
      const { doc, boardId } = boardDoc([node], { width: 220, height: 220 });
      const { result, png } = await render(doc, boardId, faces);
      if (!result.ok || !png) throw new Error(JSON.stringify(result));
      return png;
    };
    const square = (blur: number) => path('M0 0 H100 V100 H0 Z', [0, 0, 100, 100], abs(50, 50, { width: 100, height: 100, fills: solid('#37474F'), shadows: shadow(blur) }));
    const rectPng = await one(rect(abs(50, 50, { width: 100, height: 100, fills: solid('#37474F'), shadows: shadow(24) })));
    const pathPng = await one(square(24));
    await compareGolden('bayangan-path-vs-rect', pathPng);
    expect(await pixelDiffRatio(pathPng, rectPng)).toBeLessThanOrEqual(GOLDEN_MAX_RATIO);
    // Tes peka: blur dua kali lipat (kalibrasi salah) jelas berbeda.
    expect(await pixelDiffRatio(await one(square(48)), rectPng, 4)).toBeGreaterThan(GOLDEN_MAX_RATIO);
  });

  it('gambar-fit: cover/contain/fill/tile + avatar ellipse; aset tak ada → NOT_FOUND', async () => {
    const img = await testImageAsset();
    const imageFill = (fit: string) => [{ type: 'image', assetId: img, fit }];
    const box = (x: number, fit: string) => frame(abs(x, 20, { layout: 'none', width: 120, height: 80, fills: imageFill(fit) }));
    const cover = box(20, 'cover');
    const contain = box(160, 'contain');
    const fill = box(300, 'fill');
    const tile = box(440, 'tile');
    const avatar = ellipse(abs(600, 20, { width: 80, height: 80, fills: imageFill('cover'), stroke: { color: WHITE, width: 2, align: 'inside' } }));
    const { png } = await run('gambar-fit', [cover, contain, fill, tile, avatar], { width: 700, height: 120 }, solid(BG));
    const p = await pixels(png, [
      [25, 55], // cover: kuadran merah (dipotong vertikal), jauh dari diagonal
      [137, 24], // cover: kanan atas hijau
      [162, 60], // contain: pita kosong kiri (latar)
      [175, 50], // contain: merah
      [305, 55], // fill: kuadran merah
      [410, 65], // fill: kuadran kuning
      [440 + 66 + 8, 22], // tile: ubin kedua merah lagi
      [440 + 55, 20 + 30], // tile: ubin pertama kuadran kanan bawah kuning
      [601, 21], // avatar: pojok di luar lingkaran
      [655, 90], // avatar: dalam lingkaran, kuadran kuning
    ]);
    expectColor(p[0]!, RED, 'cover kuadran merah');
    expectColor(p[1]!, GREEN, 'cover kanan atas');
    expectColor(p[2]!, BG, 'contain sisi kosong', 2);
    expectColor(p[3]!, RED, 'contain isi');
    expectColor(p[4]!, RED, 'fill kuadran merah');
    expectColor(p[5]!, '#FDD835', 'fill kuadran kuning');
    expectColor(p[6]!, RED, 'tile ubin kedua');
    expectColor(p[7]!, '#FDD835', 'tile kuadran kuning');
    expectColor(p[8]!, BG, 'avatar pojok', 2);
    expectColor(p[9]!, '#FDD835', 'avatar isi');

    const missing = 'f'.repeat(64);
    const bad = boardDoc([frame({ width: 40, height: 40, fills: [{ type: 'image', assetId: missing, fit: 'cover' }] })], { width: 60, height: 60 });
    const r = await render(bad.doc, bad.boardId, faces);
    expect(r.result).toMatchObject({ ok: false, code: 'NOT_FOUND', assets: [missing] });
    expect(r.png).toBeUndefined();
  });

  it('layar-gulir: board B hasil duplicate dengan scrollY 200 menggeser semua anak Scroll / sebesar −200', async () => {
    const TINT = ['#E3F2FD', '#FCE4EC', '#E8F5E9', '#FFF3E0', '#EDE7F6', '#E0F7FA'];
    let doc = createDocument();
    const tx = beginTransaction(doc, { sessionId: 'tes-render' });
    const a = tx.add(null, { type: 'board', name: 'A', x: 0, y: 0, width: 320, height: 400, screen: 'mobile', fills: solid('#FAFAFA') });
    tx.add(a, { type: 'text', name: 'Judul', content: 'Daftar', size: 24, lineHeight: 32, width: 'fill' });
    const scroll = tx.add(a, {
      type: 'frame',
      name: 'Scroll / Daftar',
      layout: 'column',
      width: 'fill',
      height: 280,
      clip: true,
      gap: 8,
      padding: 12,
      fills: solid('#FFFFFF'),
      stroke: { color: '#BDBDBD', width: 1, align: 'inside' },
    });
    TINT.forEach((color, i) => {
      const row = tx.add(scroll, { type: 'frame', name: `Baris ${i + 1}`, layout: 'row', width: 'fill', height: 48, padding: [0, 12], align: 'center', radius: 8, fills: solid(color) });
      tx.add(row, { type: 'text', name: 'Label', content: `Baris ${i + 1}`, size: 16, lineHeight: 20 });
    });
    tx.add(a, { type: 'rect', name: 'Kaki', width: 'fill', height: 40, fills: solid('#455A64') });
    const b = tx.duplicate(a, { name: 'B', x: 360 });
    doc = tx.commit('layar gulir').doc;
    const boardB = doc.pages[0]!.children.find((n) => n.id === b)!;
    const scrollB = boardB.children.find((n) => n.name === 'Scroll / Daftar')!.id;
    const tx2 = beginTransaction(doc, { sessionId: 'tes-render' });
    tx2.update(scrollB, { scrollY: 200 });
    doc = tx2.commit('gulir B').doc;
    const resolved: ResolvedDocument = resolveDocument(doc);

    const shot = async (name: string, boardId: string) => {
      const { result, png } = await render(resolved, boardId, faces);
      if (!result.ok || !png) throw new Error(JSON.stringify(result));
      await compareGolden(name, png);
      return result.measure;
    };
    const mA = await shot('layar-gulir-a', a);
    const mB = await shot('layar-gulir-b', b);
    expect(mB.nodes).toHaveLength(mA.nodes.length);
    // Urutan DOM sama (duplicate menyalin struktur): node ke-i di A ↔ node ke-i di B.
    const scrollIdxA = mA.nodes.findIndex((n) => n.id === scroll);
    expect(mB.nodes[scrollIdxA]!.id).toBe(scrollB);
    const inScroll = new Set(Array.from({ length: TINT.length * 2 }, (_, k) => scrollIdxA + 1 + k));
    let shifted = 0;
    mA.nodes.forEach((na, i) => {
      const nb = mB.nodes[i]!;
      expect(nb.id).not.toBe(na.id);
      near(nb.x, na.x);
      near(nb.width, na.width);
      near(nb.height, na.height);
      if (inScroll.has(i)) {
        near(nb.y, na.y - 200);
        shifted++;
      } else near(nb.y, na.y);
    });
    expect(shifted).toBe(TINT.length * 2);
  });
  it('ikon: lucide stroke/filled/strokeWidth/ukuran 16–32, simple-icons warna brand, row bersama teks, opacity/rotation, drop shadow', async () => {
    const lu = (name: string, x: number, y: number, props: Loose = {}) => icon('lucide', name, abs(x, y, props));
    const house = lu('house', 20, 20, { size: 32, color: RED, strokeWidth: 2 });
    const star = lu('star', 70, 20, { size: 32, color: '#F9A825', filled: true, strokeWidth: 1.5 });
    const check = lu('check', 120, 24, { size: 24, color: GREEN, strokeWidth: 3 });
    const h16 = lu('house', 160, 28, { size: 16 });
    const h20 = lu('house', 184, 26, { size: 20 });
    const h24 = lu('house', 212, 24, { size: 24, color: BLUE });
    const gh = icon('simple-icons', 'github', abs(260, 20, { size: 32 }));
    const wa = icon('simple-icons', 'whatsapp', abs(310, 20, { size: 32 }));
    const scatter = lu('chart-scatter', 360, 20, { size: 32, color: '#8E24AA', strokeWidth: 1 });
    const row = frame(abs(20, 90, { layout: 'row', gap: 8, align: 'center' }), [
      icon('lucide', 'search', { size: 20, color: '#1A1A1A' }),
      text('Cari', { size: 16, lineHeight: 20, color: '#1A1A1A' }),
    ]);
    const faded = lu('house', 120, 84, { size: 32, color: RED, opacity: 0.5 });
    const rotated = lu('star', 170, 84, { size: 32, color: BLUE, rotation: 45, strokeWidth: 2 });
    const shadowed = lu('house', 240, 76, { size: 48, color: '#37474F', strokeWidth: 2, shadows: [{ type: 'drop', x: 4, y: 6, blur: 4, color: '#00000080' }] });
    const { png, at } = await run('ikon', [house, star, check, h16, h20, h24, gh, wa, scatter, row, faded, rotated, shadowed], { width: 420, height: 150 });
    // Kotak node = size×size (rotasi: AABB).
    for (const [n, size] of [[house, 32], [check, 24], [h16, 16], [h20, 20], [gh, 32]] as const) {
      near(at(n.id).width, size);
      near(at(n.id).height, size);
    }
    // Ikon flow di row: kotak 20×20, dipusatkan dengan teks.
    const rowIcon = (row.children as Loose[])[0]!;
    near(at(rowIcon.id).width, 20);
    const s = 32 / 24;
    const [door, doorInside, starFill, checkMid, ghRing, outside, fadedDoor, scatterDot, h24Door] = await pixels(png, [
      [Math.floor(20 + 15 * s), Math.floor(20 + 17 * s)], // tiang pintu kanan rumah (x=15)
      [Math.floor(20 + 12 * s), Math.floor(20 + 17 * s)], // di dalam pintu: kosong
      [Math.floor(70 + 12 * s), Math.floor(20 + 12 * s)], // pusat bintang filled
      [126, 38], // tengah garis kiri centang (grid 6.5,14.5)
      [Math.floor(260 + 12 * s), Math.floor(20 + 1.5 * s)], // cincin atas logo github
      [400, 140],
      [Math.floor(120 + 15 * s), Math.floor(84 + 17 * s)],
      [Math.floor(360 + 11.5 * s), Math.floor(20 + 11.5 * s)], // titik fill currentColor
      [212 + 15, 24 + 17],
    ]);
    expectColor(door!, RED, 'stroke lucide = color');
    expectColor(doorInside!, WHITE, 'fill none di dalam pintu');
    expectColor(starFill!, '#F9A825', 'filled: bentuk diisi color');
    expectColor(checkMid!, GREEN, 'centang strokeWidth 3');
    expectColor(ghRing!, '#181717', 'github warna brand default');
    expectColor(outside!, WHITE, 'latar di luar ikon');
    expectColor(fadedDoor!, '#F29C9A', 'opacity 0.5', 10);
    expectColor(scatterDot!, '#8E24AA', 'fill currentColor → color', 24);
    expectColor(h24Door!, BLUE, 'ukuran 24 warna biru');
    // Rotasi 45°: AABB lebih besar dari kotak.
    expect(at(rotated.id).width).toBeGreaterThan(40);
    // Drop shadow mengikuti bentuk glyph: bayangan di bawah garis lantai rumah, bukan kotak penuh.
    const k = 48 / 24;
    const [floorShadow, boxCorner] = await pixels(png, [
      [Math.floor(240 + 12 * k + 4), Math.floor(76 + 21 * k + 6)],
      [240 + 47 + 4, 76 + 2 + 6],
    ]);
    expect(luma(floorShadow!)).toBeLessThan(220);
    expectColor(boxCorner!, WHITE, 'pojok kotak tanpa glyph: tanpa bayangan', 6);
  });

  it('ikon tanpa glyph → ICON_UNKNOWN sebelum mount (tidak ada placeholder kosong)', async () => {
    const { doc, boardId } = boardDoc([icon('lucide', 'house'), icon('lucide', 'hoem')]);
    const { result } = await render(doc, boardId, faces);
    expect(result).toMatchObject({ ok: false, code: 'ICON_UNKNOWN', icons: ['lucide/hoem'] });
    const empty = await render(doc, boardId, faces, undefined, { icons: [] });
    expect(empty.result).toMatchObject({ ok: false, code: 'ICON_UNKNOWN', icons: ['lucide/house', 'lucide/hoem'] });
  });

  // ---------------------------------------------------------------------------
  // Fill efek (story 22): conic, noise ber-seed, mesh (canvas 2D). Deterministik: render ganda byte-identik.
  // ---------------------------------------------------------------------------

  const NIGHT = '#0B1020';
  const meshHero = (cols: number, rows: number, tweak = 0): Loose => {
    const pal = ['#0B1020', '#123B2A', '#0B1020', '#16A34A', '#0EA5E9', '#0B1020', '#22C55E', '#0B1020', '#1E3A8A', '#0B1020', '#0B1020', '#0F766E', '#0B1020', '#22C55E', '#0B1020', '#0B1020', '#0B1020', '#14532D', '#0B1020', '#0B1020'];
    const colors = Array.from({ length: cols * rows }, (_, i) => pal[i % pal.length]!);
    if (tweak) colors[0] = `#0B10${(0x20 + tweak).toString(16).padStart(2, '0').toUpperCase()}`;
    return { type: 'mesh', columns: cols, rows, colors };
  };
  const grain = (seed: number, opacity = 0.1): Loose => ({ type: 'noise', opacity, size: 1.5, seed, blend: 'overlay' });

  const conicBoard = () => {
    const donut = ellipse(
      abs(20, 20, {
        width: 160,
        height: 160,
        inner: 0.72,
        fills: [{ type: 'conic', angle: 0, stops: [{ offset: 0, color: GREEN }, { offset: 0.5, color: BLUE }, { offset: 1, color: GREEN }] }],
      }),
    );
    const card = rect(
      abs(220, 20, {
        width: 200,
        height: 160,
        radius: 16,
        fills: [{ type: 'conic', angle: 90, center: [0.5, 0.5], stops: [{ offset: 0, color: RED }, { offset: 0.25, color: RED }, { offset: 0.25, color: BLUE }, { offset: 1, color: BLUE }] }],
      }),
    );
    return { children: [donut, card], donut, card };
  };

  it('efek-conic-donut: conic pada ellipse annulus (ikut mask) dan rect; from angle searah jarum jam', async () => {
    const { children } = conicBoard();
    const { png } = await run('efek-conic-donut', children, { width: 440, height: 200 });
    const [donutTop, donutBottom, donutHole, cardRight, cardBottom, cardLeft] = await pixels(png, [
      [100, 32], // jam 12 pita donut → stop 0 (hijau)
      [100, 168], // jam 6 → stop 0,5 (biru)
      [100, 100], // lubang → latar putih
      [390, 150], // conic from 90°: ±122° (antara jam 3 dan jam 6) = seperempat pertama (merah)
      [250, 160], // ±230° → biru
      [320, 30], // jam 12 (360°) → biru
    ]);
    expectColor(donutTop!, GREEN, 'donut jam 12', 24);
    expectColor(donutBottom!, BLUE, 'donut jam 6', 24);
    expectColor(donutHole!, WHITE, 'lubang donut (mask)');
    expectColor(cardRight!, RED, 'conic from 90 deg: kuadran kanan bawah merah', 24);
    expectColor(cardBottom!, BLUE, 'conic kiri bawah biru', 24);
    expectColor(cardLeft!, BLUE, 'conic jam 12 biru', 24);
  });

  it('efek-noise-seed: grain overlay di atas gradien, deterministik; seed berbeda → piksel berbeda', async () => {
    const tile = (seed: number, x: number) =>
      rect(abs(x, 20, { width: 200, height: 160, fills: [{ type: 'linear', angle: 90, stops: [{ offset: 0, color: '#1E3A8A' }, { offset: 1, color: '#F97316' }] }, grain(seed, 0.12)] }));
    const { png } = await run('efek-noise-seed', [tile(7, 20), tile(7, 240)], { width: 460, height: 200 });
    // Dua kotak seed sama → butir sama (ubin dari kiri atas kotak masing-masing); selisih ≤ 3 dari dither gradien Skia
    // yang bergantung posisi layar.
    const left = await pixels(png, Array.from({ length: 40 }, (_, i) => [20 + 10 + i * 4, 60 + (i % 7) * 9] as const));
    const right = await pixels(png, Array.from({ length: 40 }, (_, i) => [240 + 10 + i * 4, 60 + (i % 7) * 9] as const));
    const maxDiff = Math.max(...left.map((p, i) => Math.max(...p.map((v, k) => Math.abs(v - right[i]![k]!)))));
    expect(maxDiff).toBeLessThanOrEqual(3);
    // Ada butir: piksel bertetangga berbeda (bukan gradien mulus).
    const row = await pixels(png, Array.from({ length: 30 }, (_, i) => [60 + i, 100] as const));
    const jumps = row.slice(1).filter((p, i) => Math.abs(luma(p) - luma(row[i]!)) > 3).length;
    expect(jumps).toBeGreaterThan(5);
    // Seed berbeda → PNG berbeda.
    const a = boardDoc([tile(7, 20)], { width: 240, height: 200 });
    const b = boardDoc([tile(8, 20)], { width: 240, height: 200 });
    const ra = await render(a.doc, a.boardId, faces);
    const rb = await render(b.doc, b.boardId, faces);
    expect(Buffer.compare(ra.png!, rb.png!)).not.toBe(0);
    expect(await pixelDiffRatio(ra.png!, rb.png!, 2)).toBeGreaterThan(0.05);
  });

  it('efek-mesh-hero: mesh 5×4 + grain di board gelap 720×450 dengan teks di zona tenang', async () => {
    const title = text('Aliran cahaya', abs(48, 300, { size: 40, lineHeight: 48, weight: 400, color: WHITE }));
    const { png } = await run('efek-mesh-hero', [title], { width: 720, height: 450 }, [{ type: 'solid', color: NIGHT }, meshHero(5, 4), grain(3, 0.08)]);
    // Titik kendali (0,25 , 1/3) hijau-ish; pojok kiri atas gelap.
    const [ctrl, corner] = await pixels(png, [
      [Math.round(720 * 0.75), Math.round(450 / 3)],
      [2, 2],
    ]);
    expect(luma(corner!)).toBeLessThan(60);
    expect(ctrl![1]).toBeGreaterThan(ctrl![0]!);
    // Medan mulus: dua piksel bertetangga tidak melompat jauh (tanpa banding/tepi keras).
    const line = await pixels(png, Array.from({ length: 60 }, (_, i) => [300 + i, 200] as const));
    const maxJump = Math.max(...line.slice(1).map((p, i) => Math.abs(luma(p) - luma(line[i]!))));
    expect(maxJump).toBeLessThan(40);
  });

  it('efek-mesh-ellipse: mesh pada ellipse busur dan path memakai mask bentuk yang sama', async () => {
    const blob = ellipse(abs(20, 20, { width: 200, height: 200, fills: [meshHero(3, 3)] }));
    const arc = ellipse(abs(240, 20, { width: 200, height: 200, inner: 0.6, startDeg: 0, sweepDeg: 270, fills: [meshHero(2, 2)] }));
    const shape = path('M0 100 C50 0 150 0 200 100 S350 200 200 200 Z', [0, 0, 200, 200], abs(460, 20, { width: 200, height: 200, fills: [meshHero(3, 2)] }));
    const { png } = await run('efek-mesh-ellipse', [blob, arc, shape], { width: 680, height: 240 });
    const [blobCorner, arcGap, arcBand, pathOutside] = await pixels(png, [
      [24, 24], // di luar lingkaran (pojok kotak) → latar putih
      [240 + 40, 20 + 40], // kuadran busur yang kosong (270° → 360°) → putih
      [240 + 100 + 80, 20 + 100], // pita jam 3 → terisi
      [460 + 10, 20 + 10], // di luar path → putih
    ]);
    expectColor(blobCorner!, WHITE, 'mesh ellipse dipotong lingkaran');
    expectColor(arcGap!, WHITE, 'mesh busur: kuadran kosong');
    expect(luma(arcBand!)).toBeLessThan(200);
    expectColor(pathOutside!, WHITE, 'mesh path dipotong bentuk');
  });

  it('determinisme: board conic, noise, mesh dirender 2× → PNG byte-identik', async () => {
    const { children } = conicBoard();
    const boards = [
      boardDoc(children, { width: 440, height: 200 }),
      boardDoc([rect(abs(0, 0, { width: 300, height: 200, fills: [{ type: 'solid', color: '#334155' }, grain(42, 0.1)] }))], { width: 300, height: 200 }),
      boardDoc([], { width: 640, height: 400 }, [{ type: 'solid', color: NIGHT }, meshHero(4, 3), grain(5, 0.06)]),
    ];
    for (const { doc, boardId } of boards) {
      const a = await render(doc, boardId, faces);
      // Halaman bersih: cache mesh modul tidak ikut (render dari nol).
      const p = await freshPage();
      try {
        const b = await render(doc, boardId, faces, p);
        expect(a.result.ok && b.result.ok).toBe(true);
        expect(Buffer.compare(a.png!, b.png!), boardId).toBe(0);
      } finally {
        await p.close();
      }
    }
  });

  it('bitmap efek (mesh PNG + ubin noise SVG) dikumpulkan dari background inline dan ter-decode sebelum ukur', async () => {
    const { doc, boardId } = boardDoc([rect(abs(0, 0, { width: 200, height: 100, fills: [{ type: 'solid', color: '#334155' }, grain(11, 0.1)] }))], { width: 640, height: 400 }, [
      { type: 'solid', color: NIGHT },
      meshHero(4, 3),
      grain(12, 0.06),
    ]);
    const r = (await currentPage().evaluate(
      `(async ([doc, boardId, fonts]) => { const m = await import('/render/index.js'); const a = await import('/render/assets.js');
        const r = await m.renderBoard(doc, boardId, document.getElementById('root'), { fonts, icons: [] });
        const urls = a.inlineDataUrls(document.querySelector('[data-lakar-id="' + boardId + '"]'));
        const imgs = await a.decodeDataUrls(document, [...urls, 'data:image/png;base64,AAAA']);
        return { ok: r.ok, kinds: urls.map((u) => u.slice(0, u.indexOf(',')).replace(/;base64$/, '')).sort(), decoded: imgs.length }; })(${JSON.stringify([doc, boardId, faces])})`,
    )) as { ok: boolean; kinds: string[]; decoded: number };
    expect(r.ok).toBe(true);
    // Satu mesh PNG + dua ubin noise (seed berbeda); data URL rusak diabaikan (bukan NOT_FOUND).
    expect(r.kinds).toEqual(['data:image/png', 'data:image/svg+xml', 'data:image/svg+xml']);
    expect(r.decoded).toBe(3);
  });

  it('latensi: board 1440×900 mesh 5×4 + noise vs board polos (median 5 render, selisih ≤ 150 ms)', async () => {
    const size = { width: 1440, height: 900 };
    const p = currentPage();
    await p.setViewportSize(size);
    // Waktu render di halaman: renderBoard (font, mount, 2 rAF, ukur) + satu frame lukis. Encode PNG screenshot dicatat
    // terpisah (bergantung entropi gambar: grain di atas gradien = PNG besar), tidak masuk batas.
    const time = async (fills: (i: number) => Loose[]) => {
      const render: number[] = [];
      const shot: number[] = [];
      for (let i = 0; i < 5; i++) {
        const { doc, boardId } = boardDoc([text('Judul', abs(80, 400, { size: 48, lineHeight: 56, color: WHITE }))], size, fills(i));
        const ms = (await p.evaluate(
          `(async ([doc, boardId, fonts]) => { const m = await import('/render/index.js'); const t0 = performance.now();
            const r = await m.renderBoard(doc, boardId, document.getElementById('root'), { fonts, icons: [] });
            await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
            return r.ok ? performance.now() - t0 : -1; })(${JSON.stringify([doc, boardId, faces])})`,
        )) as number;
        expect(ms).toBeGreaterThan(0);
        render.push(ms);
        const t0 = performance.now();
        await p.locator(`[data-lakar-id="${boardId}"]`).screenshot({ type: 'png', scale: 'css' });
        shot.push(performance.now() - t0);
      }
      const med = (xs: number[]) => xs.sort((a, b) => a - b)[2]!;
      return { render: med(render), shot: med(shot) };
    };
    await time(() => [{ type: 'solid', color: NIGHT }]); // pemanasan
    const plain = await time(() => [{ type: 'solid', color: NIGHT }]);
    // Warna mesh digeser tiap render agar cache tidak terpakai (biaya penuh tiap kali).
    const fx = await time((i) => [{ type: 'solid', color: NIGHT }, meshHero(5, 4, i + 1), grain(9, 0.08)]);
    const delta = fx.render - plain.render;
    testLog(
      `[latensi efek] render median polos ${plain.render.toFixed(1)} ms, mesh 5×4 + noise ${fx.render.toFixed(1)} ms, selisih ${delta.toFixed(1)} ms (batas 150 ms); ` +
        `screenshot PNG median polos ${plain.shot.toFixed(0)} ms, efek ${fx.shot.toFixed(0)} ms (encode PNG, di luar batas)`,
    );
    expect(delta).toBeLessThanOrEqual(150);
  });
});
