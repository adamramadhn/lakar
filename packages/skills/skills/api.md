# API snippet execute

Referensi lengkap fungsi global di snippet `execute` (sandbox QuickJS sinkron). Dihasilkan dari kode sumber Lakar; setiap contoh berjalan sendiri di dokumen kosong. Baca hanya bila deskripsi tool `execute` dan skill `core` belum cukup.

## Fungsi

### add

`add(parentId: string | null, node: {type: 'board'|'frame'|'text'|'rect'|'ellipse'|'path'|'icon'|'instance', name, ...}): string`

Tambah node ke board/frame parentId (null = halaman, khusus board). Katalog tertutup: board, frame, text, rect, ellipse, path, icon, instance (bagian Komponen). parentId '<instanceId>/<idFrameSlot>' mengisi slot instance. Anak ditambahkan satu per satu (tanpa children bersarang). Mengembalikan ID 8 karakter secara sinkron. Icon: {type:'icon', lib:'lucide'|'simple-icons', icon:<nama kanonik>, size, color?, strokeWidth?, filled?}; alias dikonversi ke nama kanonik (lucide 'home' → 'house'), name default 'Icon / <lib> / <icon>', version diisi otomatis (jangan dikirim); nama tidak dikenal → ICON_UNKNOWN + 3 saran (cari dengan iconSearch).

- Mengembalikan: ID node baru (string 8 karakter)
- Error: SCHEMA_INVALID, NOT_FOUND, ICON_UNKNOWN

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
add(b, {type:'text', name:'Judul', content:'Halo', size:32});
add(b, {type:'icon', lib:'lucide', icon:'home', size:24, color:'#1A1A1A'});
```

### update

`update(id: string, patch: {...}): void`

Merge dangkal properti ke node; null menghapus properti opsional. type/id/children tidak bisa diubah (ganti tipe → replace). id '<instanceId>/<idNodeMaster>' (isi instance) atau properti node pada instance (mis. fills) menjadi override instance itu; master tetap.

- Mengembalikan: undefined
- Error: SCHEMA_INVALID, NOT_FOUND, ICON_UNKNOWN

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const t = add(b, {type:'text', name:'Judul', content:'Halo', size:32});
update(t, {size: 40, color: '#1A1A1A'});
```

### replace

`replace(id: string, node: {type, name, ...}): void`

Ganti semua properti node (boleh ganti tipe, kecuali board ↔ non-board). ID dan posisi tetap; anak dipertahankan bila tipe baru frame/board.

- Mengembalikan: undefined
- Error: SCHEMA_INVALID, NOT_FOUND, ICON_UNKNOWN

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const r = add(b, {type:'rect', name:'Kotak', width:100, height:40});
replace(r, {type:'ellipse', name:'Bulat', width:40, height:40});
```

### move

`move(id: string, parentId: string | null, index?: number): void`

Pindah node ke board/frame parentId pada index (default akhir). parentId null hanya untuk board: mengubah urutan board di halaman. parentId '<instanceId>/<idFrameSlot>' = ke slot instance.

- Mengembalikan: undefined
- Error: SCHEMA_INVALID, NOT_FOUND

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const f = add(b, {type:'frame', name:'Kartu', layout:'column'});
const t = add(b, {type:'text', name:'Judul', content:'Halo', size:16});
move(t, f, 0);
```

### duplicate

`duplicate(id: string, patch?: {...}): string`

Salin node beserta subtree dengan ID baru, disisipkan tepat setelah asal; patch (aturan update) di-merge ke akar salinan.

- Mengembalikan: ID akar salinan (string 8 karakter)
- Error: SCHEMA_INVALID, NOT_FOUND, ICON_UNKNOWN

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const f = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8});
add(f, {type:'text', name:'Judul', content:'Halo', size:16});
duplicate(f, {name:'Kartu 2'});
```

### remove

`remove(id: string): void`

Hapus node beserta subtree-nya; ID itu tidak bisa dipakai lagi. Master komponen yang terhapus men-detach semua instancenya (node biasa ber-ID baru) di commit yang sama.

- Mengembalikan: undefined
- Error: SCHEMA_INVALID, NOT_FOUND

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const t = add(b, {type:'text', name:'Sementara', content:'x', size:12});
remove(t);
```

### setComponent

`setComponent(id: string, component?: {props: [{name, type:'text'|'boolean'|'enum', default, options?, binds:[{nodeId, prop}]}], slots: [{name, nodeId}]} | null): void`

Jadikan node anak (frame/text/rect/ellipse/path/icon) master komponen; tanpa component = {props:[], slots:[]} (master yang sudah ada tidak berubah). props: nama [a-z][A-Za-z0-9]*, binds menulis nilai prop ke properti node di dalam master (prop boolean + prop:'visible' menyembunyikan node). slots: frame turunan master yang isinya diganti per instance. null melepas status master: semua instancenya di-detach di commit yang sama. Sisipkan instance dengan add(parentId, {type:'instance', name, componentId: id, props?}).

- Mengembalikan: undefined
- Error: SCHEMA_INVALID, NOT_FOUND

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const k = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8, padding:16});
const t = add(k, {type:'text', name:'Judul', content:'Judul', size:16});
setComponent(k, {props:[{name:'title', type:'text', default:'Judul', binds:[{nodeId:t, prop:'content'}]}], slots:[]});
add(b, {type:'instance', name:'Kartu promo', componentId:k, props:{title:'Promo'}});
```

### resetOverride

`resetOverride(address: string, props?: string[]): void`

Hapus override isi instance: address = '<instanceId>/<idNodeMaster>' (atau ID instance untuk override akar, mis. fills); props = hanya properti itu, tanpa props = semua. Properti kembali mengikuti master. Override yatim (LC-32) juga bisa dibersihkan dengan ini.

- Mengembalikan: undefined
- Error: SCHEMA_INVALID, NOT_FOUND

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const k = add(b, {type:'frame', name:'Kartu', layout:'column'});
const t = add(k, {type:'text', name:'Judul', content:'Judul', size:16});
setComponent(k);
const i = add(b, {type:'instance', name:'Kartu A', componentId:k});
update(i + '/' + t, {content:'Promo', color:'#B42318'});
resetOverride(i + '/' + t, ['color']);
```

### detach

`detach(id: string): string | null`

Ganti instance dengan node biasa ber-ID baru di posisi yang sama: props, override, dan isi slot diterapkan (tampilan tetap, instance bersarang ikut menjadi node biasa; isi slot mempertahankan ID). Ref token tetap ref. null bila akar instance disembunyikan prop boolean-nya sendiri (instance dihapus).

- Mengembalikan: ID akar node baru (string 8 karakter) atau null
- Error: SCHEMA_INVALID, NOT_FOUND

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const k = add(b, {type:'frame', name:'Kartu', layout:'column'});
add(k, {type:'text', name:'Judul', content:'Judul', size:16});
setComponent(k);
const i = add(b, {type:'instance', name:'Kartu A', componentId:k});
const f = detach(i);
get(f).type;
```

### setTokens

`setTokens(map: {[name: string]: string | number | {type, value, modes?} | null}): void`

Merge token ke dokumen (nama segmen [a-z0-9-] dipisah titik, mis. 'colors.primary'); null menghapus. Rujuk dengan {$token:'colors.primary'}. Nilai datar: token ada → ganti value (type/modes tetap); token baru → type diinferensi dari slot yang merujuknya. Bertipe: {type:'color'|'radius'|'spacing'|'container'|'breakpoint'|'fontFamily'|'fontWeight'|'fontSize'|'lineHeight'|'letterSpacing', value, modes?:{dark:...}}.

- Mengembalikan: undefined
- Error: SCHEMA_INVALID, TOKEN_UNKNOWN

```js
setTokens({'colors.primary': '#0F62FE', 'spacing.4': 16});
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
add(b, {type:'rect', name:'Aksen', width:40, height:40, fills:[{type:'solid', color:{$token:'colors.primary'}}]});
```

### setTokenModes

`setTokenModes(modes: string[] | null): void`

Ganti daftar mode tema dokumen: minimal satu, tanpa duplikat, elemen pertama = default; nama diawali huruf kecil/angka lalu [a-z0-9-], maks 32 karakter. null menghapus. Kunci token.modes dan board themeMode wajib ada di daftar ini (dicek saat commit).

- Mengembalikan: undefined
- Error: SCHEMA_INVALID

```js
setTokenModes(['light', 'dark']);
setTokens({'colors.bg': {type:'color', value:'#FFFFFF', modes:{dark:'#0B0C0F'}}});
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
update(b, {themeMode:'dark', fills:[{type:'solid', color:{$token:'colors.bg'}}]});
```

### renameToken

`renameToken(from: string, to: string): void`

Ganti nama token: definisi pindah (urutan tetap) dan setiap ref {$token: from} di dokumen ikut berganti dalam commit yang sama. from tidak ada → TOKEN_UNKNOWN; to sudah dipakai → CONFLICT.

- Mengembalikan: undefined
- Error: SCHEMA_INVALID, TOKEN_UNKNOWN, CONFLICT

```js
setTokens({'colors.primary': '#0F62FE'});
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
add(b, {type:'rect', name:'Aksen', width:40, height:40, fills:[{type:'solid', color:{$token:'colors.primary'}}]});
renameToken('colors.primary', 'colors.brand');
```

### importCssVariables

`importCssVariables(css: string): {tokens: {variable, token, type, status}[], modes: string[], skipped: {source, reason, detail}[]}`

Buat token bertipe dari isi file CSS variables. Blok :root/html = nilai default, [data-theme="x"] = mode x (didaftarkan ke tokenModes; dokumen tanpa mode: :root menjadi mode light). Nama: token dokumen yang cssVar-nya sama dipakai ulang (status update, ref tetap; nilai mode yang tidak disebut CSS dipertahankan), selain itu '-' → '.' (--colors-bg → colors.bg). Tipe dari nilai dan nama (warna → color; radius, space/gap, text/font-size, font-weight, leading, tracking, font family); rem = 16px. Variabel tak terpetakan (bayangan, unit lain, selektor lain) dilewati dan dilaporkan di skipped; tidak ada token sama sekali → SCHEMA_INVALID.

- Mengembalikan: {tokens: [{variable, token, type, status}], modes, skipped: [{source, reason, detail}]}
- Error: SCHEMA_INVALID, EXEC_ERROR

```js
importCssVariables(':root { --colors-bg: #ffffff; --radius-md: 12px; } [data-theme="dark"] { --colors-bg: #0f0f0f; }');
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
update(b, {themeMode:'dark'});
add(b, {type:'rect', name:'Kartu', width:120, height:80, radius:{$token:'radius.md'}, fills:[{type:'solid', color:{$token:'colors.bg'}}]});
```

### get

`get(id: string): NodeView`

Baca satu node sebagai salinan datar: properti tersimpan (token apa adanya) + parentId, path (nama board→node), childIds (board/frame). Melihat perubahan snippet ini. Instance dibaca tersimpan (componentId, props, overrides, slots; tanpa childIds, isi slot lewat children(instanceId)); isinya lewat alamat '<instanceId>/<idNodeMaster>' = node efektif (props/override diterapkan, id/parentId/childIds beralamat komposit).

- Mengembalikan: NodeView
- Error: SCHEMA_INVALID, NOT_FOUND

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const t = add(b, {type:'text', name:'Judul', content:'Halo', size:32});
get(t).path;
```

### find

`find(query?: {type?, name?: string | RegExp, within?: string}): NodeView[]`

Cari node tersimpan dalam urutan dokumen (termasuk isi slot instance, parentId = instance; isi master di dalam instance tidak). name string = sama persis, RegExp = cocok; within = hanya keturunan board/frame/instance itu.

- Mengembalikan: NodeView[] (urutan dokumen)
- Error: SCHEMA_INVALID, NOT_FOUND

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
add(b, {type:'text', name:'Judul', content:'Halo', size:32});
find({type:'text', name:/^Jud/, within: b}).map((n) => n.id);
```

### children

`children(id: string | null): NodeView[]`

Anak langsung node dalam urutan dokumen; null = board di halaman. Instance → isi slot tersimpannya (bukan isi master; itu lewat get alamat komposit). Node daun → [].

- Mengembalikan: NodeView[]
- Error: SCHEMA_INVALID, NOT_FOUND

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
add(b, {type:'text', name:'Judul', content:'Halo', size:32});
children(b).map((n) => n.name);
```

### getTokens

`getTokens(): {tokens: {[name: string]: {type, value, modes?}}, modes: string[]}`

Baca token dokumen dalam bentuk tersimpan (type, value, modes per mode tema) dan daftar mode tema (tokenModes; elemen pertama = default, [] bila tanpa mode). Melihat perubahan snippet ini. Nilai mode efektif board = modes[board.themeMode ?? modes[0]] ?? value.

- Mengembalikan: {tokens: {[name]: {type, value, modes?}}, modes: string[]}
- Error: SCHEMA_INVALID

```js
setTokenModes(['light', 'dark']);
setTokens({'colors.bg': {type:'color', value:'#FFFFFF', modes:{dark:'#0B0C0F'}}, 'spacing.4': 16});
const { tokens, modes } = getTokens();
[modes, tokens['colors.bg'].modes.dark];
```

### place

`place(w: number, h: number, opts?: {near?: string, gap?: number}): {x, y}`

Posisi {x, y} untuk board baru w×h yang tidak tumpang tindih board di halaman (termasuk yang dibuat di snippet ini), berjarak gap (default 80). Halaman kosong → {x:0, y:0}; tanpa near → baris atas, kiri ke kanan; near → kanan board itu, lalu di bawahnya.

- Mengembalikan: {x: number, y: number}
- Error: SCHEMA_INVALID, NOT_FOUND

```js
const p = place(1440, 900);
add(null, {type:'board', name:'Desktop', x:p.x, y:p.y, width:1440, height:900, screen:'landing'});
```

### iconSearch

`iconSearch(query: string, opts?: {lib?: 'lucide'|'simple-icons', limit?: number}): {lib, icon, tags?, title?, aliasOf?}[]`

Cari ikon di katalog terpasang: lucide (ikon UI) dan simple-icons (khusus logo brand). Urut relevansi: nama persis > awalan nama/alias > token nama > tag persis > tag sebagian; default 10 hasil, maks 50. Pakai lib + icon hasilnya di node icon (alias juga diterima, disimpan sebagai nama kanonik).

- Mengembalikan: {lib, icon, tags?, title?, aliasOf?}[] (bisa kosong)
- Error: SCHEMA_INVALID

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const [m] = iconSearch('dumbbell', {lib:'lucide', limit:3});
add(b, {type:'icon', lib:m.lib, icon:m.icon, size:24});
```

### photo

`photo(ref: string): {assetId, width, height, credit, license, creator, sourcePageUrl}`

Foto stok untuk ref dari tool photo_search (mis. 'unsplash:Kq3wLm8xT0a', 'wikimedia:<id>' atau 'openverse:<uuid>'). Tulis ref sebagai literal string di kode (photo('unsplash:Kq3wLm8xT0a')), bukan variabel: daemon mengimpornya sekali sebelum snippet berjalan (Unsplash: aset jarak jauh yang disajikan daemon; lainnya: file lokal). Pakai assetId di fill {type:'image', assetId, fit:'cover'} pada frame/rect bernama 'Image / …'; width/height = ukuran piksel asli; credit = baris kredit siap pakai. Atribusi sudah tercatat di metadata aset: kredit tidak ditampilkan di UI kecuali pengguna memintanya; sebut di ringkasan akhir.

- Mengembalikan: {assetId, width, height, credit, license, creator, sourcePageUrl}
- Error: NOT_FOUND, SCHEMA_INVALID

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const p = photo('unsplash:Kq3wLm8xT0a');
const k = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8, padding:16, width:'fill'});
add(k, {type:'rect', name:'Image / Kamar', width:'fill', height:200, radius:12, fills:[{type:'image', assetId:p.assetId, fit:'cover'}]});
add(k, {type:'text', name:'Judul', content:'Kamar deluks, 2 tamu', size:16, lineHeight:24, weight:600, color:'#101828'});
```

## Global lain

- `keep: Record<string, any>`: Objek JSON per sesi yang bertahan antar-execute (mis. keep.hero = add(...); lalu get(keep.hero) di panggilan berikutnya). Disimpan hanya bila execute sukses; maks 64 KB.
- `console.log(...args): void`: Tulis ke data.logs (string apa adanya, nilai lain sebagai JSON); maks 100 baris / 16 KB.

## Katalog node v1

- Tertutup: board, frame, text, rect, ellipse, path, icon, instance (bagian Komponen). Kunci di luar skema → SCHEMA_INVALID. Semua node anak wajib `name`.
- board (parent null): `{type:'board', name, x, y, width, height, screen:'landing'|'app'|'mobile', expectedSize?:{width,height}, fills?, themeMode?:string}` (themeMode harus ada di tokenModes). Selalu clip; anak disusun kolom dari kiri atas (seperti frame `layout:'column'`, align start).
- frame: `layout?:'none'|'row'|'column'|'grid'` (default `'none'` = semua anak absolut di x/y, default 0,0; grid: bagian Grid), `gap?` (boleh negatif), `padding?`, `align?:'start'|'center'|'end'|'stretch'` (sumbu silang), `justify?:'start'|'center'|'end'|'space-between'` (sumbu utama), `clip?`, `scrollY?` (geser isi ke atas), `tag?` (elemen HTML untuk ekspor kode: header|nav|main|section|article|aside|footer|figure|figcaption|blockquote|ul|ol|li|h1–h6|p|button|a), sizing, cat, radius, efek.
- text: `content, size, family?` (default Inter), `weight?` (100–900, default 400), `style?:'normal'|'italic'`, `lineHeight?` (px), `letterSpacing?` (em), `align?:'left'|'center'|'right'|'justify'`, `wrap?`, `numeric?:'proportional'|'tabular'`, `color?` (default #000000), `tag?` (seperti frame), sizing, efek.
- rect: sizing, cat, radius, efek. ellipse: sizing, cat, efek + `startDeg?` (0 = jam 12, searah jarum jam), `sweepDeg?` (-360..360), `inner?` (rasio lubang [0,1)) untuk busur/ring.
- path: `d` (SVG path), `viewBox:[x,y,w,h]`, sizing, cat, efek; vektor opsional `fillRule?:'nonzero'|'evenodd'`, `strokeLinecap?:'butt'|'round'|'square'`, `strokeLinejoin?:'miter'|'round'|'bevel'`, `strokeDasharray?` (px kotak render seperti stroke.width, bukan unit viewBox: kalikan skala saat menyalin dari SVG), `strokeMiterlimit?` (1..100), `svg?` (nilai string, mis. {'stroke-opacity':'0.5'}; allowlist: fill-opacity, paint-order, shape-rendering, stroke-dashoffset (px), stroke-opacity). icon: `lib, icon, size, color?, strokeWidth?, filled?`, efek (lihat add).

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const f = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8, padding:16, width:'fill', radius:12, fills:[{type:'solid', color:'#F6F7F9'}]});
add(f, {type:'text', name:'Judul', content:'Ringkasan', size:20, lineHeight:28, weight:600, color:'#101828'});
add(f, {type:'ellipse', name:'Ring', width:64, height:64, inner:0.8, startDeg:0, sweepDeg:216, fills:[{type:'solid', color:'#4F46E5'}]});
add(f, {type:'path', name:'Shape / Gelombang', d:'M0 8 Q 12 0 24 8 T 48 8', viewBox:[0,0,48,16], stroke:{color:'#0F766E', width:2, align:'center'}});
```

## Sizing

- `width`/`height`: angka (fixed) | `'hug'` (ikut isi) | `'fill'` (isi sisa ruang di sumbu utama parent, regang di sumbu silang) + `minWidth`/`maxWidth`/`minHeight`/`maxHeight`.
- Tanpa width/height: ikut isi di sumbu utama; di sumbu silang ikut `align` parent (board: start = ikut isi). `'fill'` butuh parent yang ukurannya diketahui.
- Teks: `wrap` default `'auto'` (satu baris, tidak dibungkus) bila width kosong/'hug', `'wrap'` bila width angka/'fill' (tinggi ikut isi). `'fixed'` = kotak width×height apa adanya. Paragraf: beri width angka atau 'fill'.
- icon: kotak `size`×`size`. path tanpa width/height (atau hug) memakai ukuran viewBox.

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const row = add(b, {type:'frame', name:'Baris', layout:'row', gap:12, width:'fill', padding:[0,20], align:'center'});
add(row, {type:'text', name:'Paragraf', content:'Teks panjang yang dibungkus mengikuti lebar sisa baris ini.', size:16, lineHeight:24, width:'fill'});
add(row, {type:'rect', name:'Penanda', width:24, height:24, radius:6, fills:[{type:'solid', color:'#2563EB'}]});
```

## Padding dan posisi

- `padding`: angka | `[vertikal, horizontal]` | `[atas, kanan, bawah, kiri]` (urutan CSS).
- `position:'absolute'` + `x`/`y`: relatif kotak parent, keluar dari flow (x/y tanpa position di parent flow → SCHEMA_INVALID). Anak frame `layout:'none'` selalu absolut: x/y diterima, `position:'absolute'` ditambahkan otomatis (tetap absolut bila layout frame diubah). Pakai untuk node `Overlay /`; selebihnya flex.

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const bar = add(b, {type:'frame', name:'Overlay / Tab bar', position:'absolute', x:20, y:746, width:350, height:64, layout:'row', padding:[0,8], align:'center', radius:24, fills:[{type:'solid', color:'#FFFFFF'}], stroke:{color:'#E4E7EC', width:1, align:'inside'}});
add(bar, {type:'icon', lib:'lucide', icon:'house', size:24, color:'#2563EB'});
```

## Grid

- Frame `layout:'grid'` + `gridTemplateColumns?`/`gridTemplateRows?`: array 1-24 track; track = angka (px) | `{fr:1}` | `'auto'` | `{minmax:[min, max]}` (min px|'auto', max px|fr|'auto'). Tanpa string CSS dan tanpa repeat(): tulis tiap track. Tanpa template = satu kolom.
- `columnGap?`/`rowGap?` (≥ 0, boleh token) menimpa `gap` per sumbu; `gap` negatif diabaikan di grid. `align` = posisi item di sel (sumbu vertikal), `justify` = distribusi track.
- Anak: `gridColumn?`/`gridRow?` `{start?, end?, span?}` (garis mulai 1, negatif dari ujung; end dan span tidak bersamaan), mis. `{span:2}`. Anak tanpa width meregang selebar sel; tanpa height meregang setinggi sel hanya bila `align` kosong/'stretch' (selain itu ikut isi: beri height). `'fill'` = regang, `'hug'` = ikut isi.

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const g = add(b, {type:'frame', name:'Grid kartu', layout:'grid', gridTemplateColumns:[{fr:1}, {fr:1}], columnGap:12, rowGap:12, padding:16, width:'fill'});
for (const n of ['Satu', 'Dua']) add(g, {type:'rect', name:'Kartu ' + n, height:80, radius:12, fills:[{type:'solid', color:'#F2F4F7'}]});
add(g, {type:'rect', name:'Kartu lebar', height:80, radius:12, gridColumn:{span:2}, fills:[{type:'solid', color:'#E0E7FF'}]});
```

## Cat, stroke, radius

- `fills[]` (frame/rect/ellipse/path/board): `fills[0]` lapisan paling bawah. `{type:'solid', color}` | `{type:'linear', angle, stops:[{offset, color}]}` (sudut ala CSS: 0 = ke atas, 90 = ke kanan, searah jarum jam) | `{type:'radial', center?:[cx,cy] (0..1, default tengah), radius? (relatif kotak, default 0.5), stops}` | `{type:'image', assetId, fit:'cover'|'contain'|'fill'|'tile'}` | fill efek `conic`/`noise`/`mesh` (bagian Fill efek).
- Warna: `'#RRGGBB'` atau `'#RRGGBBAA'` (alpha di 2 digit akhir, mis. tint `#2563EB14`). rgba()/nama warna ditolak.
- `stroke: {color, width, align:'inside'|'center'|'outside', sides?:['top'|'right'|'bottom'|'left']}`; pemisah satu sisi = `sides:['bottom']`.
- `radius` (frame/rect): angka atau `[kiriAtas, kananAtas, kananBawah, kiriBawah]`.

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
add(b, {type:'rect', name:'Latar', width:390, height:200, fills:[{type:'solid', color:'#0B0C0F'}, {type:'radial', center:[0.8,0.2], radius:0.6, stops:[{offset:0, color:'#2563EB66'}, {offset:1, color:'#2563EB00'}]}]});
add(b, {type:'frame', name:'Garis bawah', width:'fill', height:48, stroke:{color:'#E4E7EC', width:1, align:'inside', sides:['bottom']}});
```

## Fill efek

- `{type:'conic', angle?, center?, stops}`: gradien sudut; `angle` derajat titik awal (0 = atas, searah jarum jam, default 0), `center?:[cx,cy]` 0..1 (default tengah), stops minimal 2. Untuk ring/donut progres bergradasi (ellipse `inner`) dan sorotan berputar.
- `{type:'noise', opacity, size?, seed?, blend?, mono?}`: grain ber-seed (seed sama → piksel sama). `opacity` 0..1 (grain halus 0.04–0.10), `size` ukuran butir px 0.5–8 (default 1.5), `seed` bulat 0..9999 (default 1), `blend` 'overlay' (default) | 'soft-light' | 'multiply' | 'screen' | 'normal', `mono` default true. Dicampur hanya dengan fill di bawahnya pada node yang sama: letakkan setelah gradien/mesh.
- `{type:'mesh', columns, rows, colors, points?}`: medan warna dari titik kendali (rata dan mulus, tanpa tepi). `columns`/`rows` bulat 2..5; `colors` tepat columns×rows warna, baris demi baris dari kiri atas; `points?` tepat columns×rows `[x,y]` 0..1 (default grid rata). Jumlah tidak cocok → SCHEMA_INVALID. Dirender sebagai bitmap (sisi ≤ 512 px) yang diskalakan ke kotak; pada ellipse/path ikut bentuknya.
- Warna fill efek boleh token `{$token}` seperti stops. Teks di atas efek: taruh di bagian medan yang tenang atau di atas permukaan solid/scrim.

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const hero = add(b, {type:'frame', name:'Hero / Medan', width:390, height:320, layout:'column', justify:'end', padding:24, fills:[{type:'solid', color:'#0B1020'}, {type:'mesh', columns:3, rows:2, colors:['#0B1020', '#1D4ED8', '#0B1020', '#0E7490', '#0B1020', '#0B1020'], points:[[0,0], [0.7,0.1], [1,0], [0.2,0.8], [0.6,1], [1,1]]}, {type:'noise', opacity:0.06, seed:7}]});
add(hero, {type:'text', name:'Judul', content:'Malam yang tenang', size:28, lineHeight:36, weight:600, color:'#F8FAFC'});
add(b, {type:'ellipse', name:'Ring progres', width:80, height:80, inner:0.8, startDeg:0, sweepDeg:300, fills:[{type:'conic', angle:0, stops:[{offset:0, color:'#22D3EE'}, {offset:0.83, color:'#2563EB'}, {offset:1, color:'#2563EB'}]}]});
```

## Efek

- Semua node anak: `shadows[]` `{x, y, blur, spread?, color, type?:'drop'|'inner'}` (makna sama dengan CSS box-shadow), `opacity` 0..1, `blend`, `blur`, `backdropBlur`, `rotation` (derajat, searah jarum jam, poros tengah, tidak memengaruhi layout).
- Keterbatasan: pada ellipse busur/ring, path, dan icon bayangan mengikuti bentuk tetapi `spread` dan `inner` tidak didukung; `stroke.sides` diabaikan pada ellipse busur dan path. Text: hanya bayangan drop.

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
add(b, {type:'frame', name:'Kartu terangkat', width:200, height:120, radius:12, fills:[{type:'solid', color:'#FFFFFF'}], shadows:[{x:0, y:4, blur:16, color:'#10182814'}]});
```

## Token

- `setTokens({'colors.primary':'#0F62FE', 'spacing.4':16})`; nilai properti boleh `{$token:'colors.primary'}` (token harus ada → selain itu TOKEN_UNKNOWN). get/find mengembalikan referensi apa adanya.
- Token bertipe `{type, value, modes?}`: warna → color; radius/gap/columnGap/rowGap/padding/ukuran/stroke.width/size icon → radius|spacing|container|breakpoint; text size → fontSize; family/weight/lineHeight/letterSpacing → tipe senama. Salah slot → SCHEMA_INVALID.
- Nilai per tipe (value dan modes): color hex #RRGGBB/#RRGGBBAA; fontFamily string tak kosong; fontWeight 100–900 kelipatan 100; lineHeight > 0; letterSpacing angka apa pun; tipe lain angka ≥ 0.
- Mode tema: `setTokenModes(['light','dark'])`, token `modes:{dark:'#000000'}`, board `themeMode:'dark'` (default mode pertama).
- Baca: `getTokens()` → `{tokens, modes}`. Ganti nama: `renameToken(from, to)` (semua ref ikut). Dari codebase: `importCssVariables(css)` (`:root` + `[data-theme]`; variabel CSS = `--` + nama dengan `.` → `-`).

## Komponen

- Master = node anak biasa ber-`component` (`setComponent(id, def?)`). Instance = `{type:'instance', name, componentId, props?, position?, x?, y?}`: isinya tidak disimpan, selalu mengikuti master (ubah master → semua instance berubah, override tetap).
- Isi instance dialamati `'<instanceId>/<idNodeMaster>'` (bersarang: `I/J/x`). `get(alamat)` = node efektif; `update(alamat, patch)` = override di instance terluar; `resetOverride(alamat, props?)` mengembalikan ke master. move/remove/replace pada isi instance → SCHEMA_INVALID.
- Props `{name, type:'text'|'boolean'|'enum', default, options?, binds:[{nodeId, prop}]}`; nilai per instance di `props`. Slot `{name, nodeId:<frame>}`: `add('<instanceId>/<idFrameSlot>', node)` mengisi slot (isi slot = node tersimpan biasa, ID sendiri).
- `detach(instanceId)` → node biasa ber-ID baru. Menghapus master men-detach semua instancenya di commit yang sama. Override/prop yang tidak lagi cocok dengan master diabaikan dan dilaporkan check LC-32.

```js
const b = add(null, {type:'board', name:'Beranda', x:0, y:0, width:390, height:844, screen:'mobile'});
const k = add(b, {type:'frame', name:'Kartu', layout:'column', gap:8, padding:16, fills:[{type:'solid', color:'#F2F4F7'}]});
const t = add(k, {type:'text', name:'Judul', content:'Judul', size:16, lineHeight:24, weight:600});
const isi = add(k, {type:'frame', name:'Isi', layout:'column'});
add(isi, {type:'text', name:'Teks', content:'Isi kartu', size:14, lineHeight:20});
setComponent(k, {props:[{name:'title', type:'text', default:'Judul', binds:[{nodeId:t, prop:'content'}]}], slots:[{name:'body', nodeId:isi}]});
const a = add(b, {type:'instance', name:'Kartu A', componentId:k, props:{title:'Promo'}});
update(a + '/' + t, {color:'#B42318'});
add(a + '/' + isi, {type:'text', name:'Catatan', content:'Diskon 20%', size:14, lineHeight:20});
update(k, {fills:[{type:'solid', color:'#FFFFFF'}]});
get(a + '/' + t).content;
```

## Respons execute

- Sukses: `{docId, rev, created:[{id, name, path}], value?, valueTruncated?, logs?, check?, bounds?, boundsTruncated?}`. `value` = nilai ekspresi terakhir (JSON). Snippet tanpa op mutasi tidak menaikkan rev (tanpa check/bounds).
- `check {boards, summary:{error, warning, gate}, findings:[{level, rule, nodeId, nodeName, detail, expected}]}`: board yang disentuh dirender dan dicek sebelum commit. Temuan tidak membatalkan commit; perbaiki lalu execute lagi.
- `bounds {id:[x,y,w,h]}`: dibulatkan, relatif board, untuk board tersentuh, node baru, dan node berubah (maks 60). Pakai untuk tinggi akhir board landing.
- Gagal: rollback penuh; error menyebut baris:kolom dan membawa `editId`. Perbaiki tanpa mengirim ulang kode: `execute({editId, edits:[{find, replace}]})` (find muncul tepat sekali; description diwarisi; edits kosong = jalankan ulang; editId hilang saat daemon restart).

## Kode error

- SCHEMA_INVALID: properti/kunci/nilai salah (pesan menyebut path). NOT_FOUND: ID/dokumen/aset/skill/foto tidak ada. CONFLICT: perubahan bersamaan (dicadangkan).
- NO_ACTIVE_DOC: panggil open_doc dulu. EXEC_TIMEOUT: snippet > 2 detik. EXEC_ERROR: error JavaScript atau > 5000 op.
- ICON_UNKNOWN: nama ikon tidak ada (+3 saran). TOKEN_UNKNOWN: token belum di-setTokens. FONT_MISSING: keluarga/weight tidak terdaftar atau karakter di luar latin/latin-ext (ganti dengan node icon).
- RENDER_FAILED (retryable): render gagal, coba lagi. EXPORT_FAILED: PNG gagal ditulis. VERSION_MISMATCH: versi mcp ≠ lakard (restart service).
