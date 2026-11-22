# Lakar: kerja dari seleksi

Pengguna memilih node di canvas viewer Lakar lalu meminta pekerjaan atasnya ("buat varian responsif frame ini", "cek konsistensi yang saya pilih"). Viewer menampilkan setiap commit execute secara live dan mencatatnya di History; pengguna bisa tetap mengedit selama kamu bekerja.

## Alur dasar

1. `get_selection` tanpa argumen → `{slug, rev, addresses, nodes:[{id, type, name, boardId, bounds}], missing?}`. `nodes` kosong → minta pengguna memilih node di viewer, lalu berhenti. `missing` = node yang sudah dihapus: abaikan.
2. `open_doc {slug}` bila slug bukan dokumen aktif sesi ini (`get_selection` tidak mengganti dokumen aktif).
3. Alamati node lewat `nodes[].id` (baris `const SEL = [...]` di contoh, semua node terpilih), bukan nama. `bounds` = `[x,y,w,h]` terukur, relatif board. Execute `NOT_FOUND` pada id seleksi (pengguna menghapusnya) → `get_selection` lagi.
4. Tulis hanya lewat `execute`; node sumber tidak diubah kecuali diminta. Op berlaku di rev terbaru, jadi edit pengguna di antara panggilanmu tetap ada: ubah hanya node yang perlu (`update`), jangan hapus lalu bangun ulang.
5. Panggil `get_selection` lagi hanya bila pengguna merujuk seleksi baru.

## Varian responsif

Varian = board terpisah per lebar (dokumen tidak berisi media query). Tanpa lebar dari pengguna: 390 (mobile) dan 768 (tablet).

1. Satu execute untuk semua node terpilih dan semua lebar (contoh di bawah): board terpilih disalin, frame terpilih disalin ke board baru; posisi `place(w, h, {near})`, nama `<sumber> / <w>`, `expectedSize`; lalu lebar tetap yang terlalu lebar → `'fill'`, padding horizontal dipangkas, baris > 2 anak dan grid jadi satu kolom di < 600, heading besar diturunkan ke skala `TY`. Tinggi awal sengaja lega (luas sama dengan board sumber, maks 4000).
2. Baca `check` di respons (sama dengan `layout_check` untuk board tersentuh). Satu execute perbaikan: semua temuan + pangkas tinggi tiap varian ke bawah anak terakhir (`inspect {id, depth:1}`) + padding bawah sumber, `expectedSize` ikut.
3. Laporkan: id, nama, dan ukuran tiap varian, penyesuaian per lebar, sisa temuan. `layout_check` hanya bila temuan > 20 baris.

```js
const SEL = ['Aaaaaaaa']; // nodes[].id dari get_selection
const W = [390, 768];
const num = (x, m) => (typeof x === 'number' ? Math.min(x, m) : x);
const cap = (p, m) => (typeof p !== 'object' || '$token' in p ? (typeof p === 'number' && p > m ? [p, m] : p) : p.map((x, i) => (i % 2 ? num(x, m) : x)));
const out = [];
for (const id of SEL) {
  const src = get(id);
  let b = src; while (b.type !== 'board') b = get(b.parentId);
  for (const w of W) {
    const mob = w < 600, h = Math.min(4000, Math.round((b.height * b.width) / w)), padX = mob ? 20 : 40;
    const p = place(w, h, { near: b.id });
    const screen = mob ? 'mobile' : b.screen === 'mobile' ? 'app' : b.screen;
    const meta = { name: `${src.name} / ${w}`, x: p.x, y: p.y, width: w, height: h, screen, expectedSize: { width: w, height: h } };
    let v;
    if (src.type === 'board') v = duplicate(src.id, meta);
    else {
      v = add(null, { type: 'board', ...meta, ...(b.fills ? { fills: b.fills } : {}) });
      const c = duplicate(src.id);
      move(c, v);
      update(c, { width: 'fill', position: null, x: null, y: null });
    }
    for (const n of find({ within: v })) {
      const patch = {};
      if (typeof n.width === 'number' && n.width > w * 0.8) patch.width = 'fill';
      if (n.padding !== undefined) patch.padding = cap(n.padding, padX);
      if (mob && n.layout === 'row' && n.childIds.length > 2) Object.assign(patch, { layout: 'column', align: 'stretch' });
      if (mob && n.layout === 'grid') patch.gridTemplateColumns = [{ fr: 1 }];
      if (mob && n.gridColumn) patch.gridColumn = null;
      if (mob && n.gridRow) patch.gridRow = null;
      if (n.type === 'text' && n.size > (mob ? 32 : 48)) Object.assign(patch, mob ? { size: 32, lineHeight: 40 } : { size: 48, lineHeight: 56 });
      if (Object.keys(patch).length) update(n.id, patch);
    }
    out.push(v);
  }
}
keep.variants = out;
out;
```

## Cek konsistensi

Baca saja (snippet tanpa op mutasi tidak menambah rev); hasil di `data.value`. Laporkan per temuan: node (nama + id), nilai sekarang, usulan. Perbaiki hanya bila diminta, dalam satu execute.

- `literal`: node sejenis (nama, properti, dan prefiks nama induk sama, mis. `Kartu / …`) memakai `{$token}`, atau nilainya sama dengan nilai token dokumen (`getTokens()`, mode board) bertipe utama slot (warna → color, radius → radius, gap → spacing), node ini literal → pakai `token` itu.
- `nearColors`: warna literal yang hampir sama (selisih kanal ≤ 8, alpha sama) beserta node pemakainya → satukan.
- `uneven`: saudara sejenis (frame dengan `layout` sama di induk sama) dengan `gap`/`columnGap`/`rowGap`/`padding` berbeda → samakan ke nilai terbanyak.
- `offGrid`: jarak di luar skala `core` (kelipatan 4, plus 2 dan 6).

```js
// baca saja
const SEL = ['Aaaaaaaa']; // nodes[].id dari get_selection
const all = [...new Map(SEL.flatMap((id) => [get(id), ...find({ within: id })]).map((n) => [n.id, n])).values()];
const tok = (v) => v !== null && typeof v === 'object' && '$token' in v;
const GAPS = ['gap', 'columnGap', 'rowGap'];
const uses = [];
for (const n of all) {
  (n.fills ?? []).forEach((f) => f.type === 'solid' && uses.push([n, 'fills', f.color]));
  if (n.type === 'text' && n.color !== undefined) uses.push([n, 'color', n.color]);
  if (n.stroke) uses.push([n, 'stroke', n.stroke.color]);
  for (const p of ['radius', ...GAPS]) if (n[p] !== undefined) uses.push([n, p, n[p]]);
}
const kind = ([n, prop]) => `${n.parentId ? get(n.parentId).name.split(' / ')[0] : ''}|${n.name}|${prop}`;
const peerTok = {};
for (const u of uses) if (tok(u[2])) peerTok[kind(u)] ??= u[2].$token;
const hex = (v) => (v.length === 7 ? v + 'FF' : v).toUpperCase();
const { tokens: T, modes: M } = getTokens();
const brd = (n) => (n.parentId ? brd(get(n.parentId)) : n);
const same = (a, b) => (typeof a === 'string' && typeof b === 'string' ? hex(a) === hex(b) : a === b);
const valTok = ([n, p, v]) => Object.keys(T).find((t) => T[t].type === (p === 'radius' ? 'radius' : GAPS.includes(p) ? 'spacing' : 'color') && same(v, T[t].modes?.[brd(n).themeMode ?? M[0]] ?? T[t].value));
const literal = uses.filter((u) => !tok(u[2])).map((u) => ({ id: u[0].id, name: u[0].name, prop: u[1], value: u[2], token: peerTok[kind(u)] ?? valTok(u) })).filter((x) => x.token);
const byHex = {};
for (const [n, p, v] of uses) if (p !== 'radius' && !GAPS.includes(p) && typeof v === 'string') (byHex[hex(v)] ??= []).push(n.id);
const hexes = Object.keys(byHex);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const nearColors = [];
hexes.forEach((a, i) => hexes.slice(i + 1).forEach((c) => {
  const d = Math.max(...rgb(a).map((x, k) => Math.abs(x - rgb(c)[k])));
  if (d > 0 && d <= 8 && a.slice(7) === c.slice(7)) nearColors.push({ colors: [a, c], nodes: [...byHex[a], ...byHex[c]] });
}));
const uneven = [];
const groups = {};
for (const n of all) if (n.type === 'frame' && n.parentId) (groups[`${n.parentId}:${n.layout ?? 'none'}`] ??= []).push(n);
for (const sib of Object.values(groups)) for (const prop of [...GAPS, 'padding']) {
  const vals = [...new Set(sib.map((n) => JSON.stringify(n[prop] ?? 0)))];
  if (sib.length > 1 && vals.length > 1) uneven.push({ prop, nodes: sib.map((n) => ({ id: n.id, name: n.name, value: n[prop] ?? 0 })) });
}
const scale = (x) => typeof x !== 'number' || x % 4 === 0 || x === 2 || x === 6;
const offGrid = all.filter((n) => !GAPS.every((p) => scale(n[p])) || ![n.padding ?? 0].flat().every(scale)).map((n) => ({ id: n.id, name: n.name, gap: n.gap, padding: n.padding }));
({ checked: all.length, literal, nearColors, uneven, offGrid });
```
