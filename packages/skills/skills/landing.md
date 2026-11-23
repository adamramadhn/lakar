# Lakar: landing page

Board `1440` (`screen:'landing'`, `height:'hug'`): tinggi = isi; jangan isi atau naikkan `height`.

## Struktur

- Wrapper `Halaman` (kolom, `width:'fill'`) di board; tiap `Seksi / …` lebar fill, padding horizontal 80; grid 12 kolom, isi 1280, gutter 24.
- **Navbar 72:** logo kiri, 3–5 `Link /` body-sm, kanan tombol sekunder + primer (tinggi 40); garis bawah.
- **Hero ≥ 640** di `C.field` atau putih: headline display ≤ 3 baris berupa klaim hasil; subjudul body-lg ≤ 2 baris; CTA primer + sekunder; baris penguat kecil (jaminan, gratis ongkir). Visual = anak frame hero, menyatu dengan latar: foto suasana (`Image /` ≥ 520, radius 16–24) + 1–2 kartu data `Overlay /` (wajib bila foto diminta), atau mockup produk utuh (padding bawah ≥ 64; isi berlebih → kurangi baris, tanpa `Crop /`); bukan kartu berbingkai di kolom terpisah.
- **Bidang efek** (`color`): struktur 12–24 garis/kontur/partikel di `Crop /` absolut seukuran bidang (`clip:true`, anak pertama), ≥ ⅔ lebar. Seksi lain yang diminta berefek: gema tipis palet sama. Ring progres boleh `conic`.
- **Header seksi:** h2 → body-lg t2, lebar ≤ 720; rata kiri atau tengah, konsisten.
- **Ritme:** seksi bersebelahan berstruktur beda (bento, teks + visual, langkah, tabel banding, bidang merek); latar putih → `C.field` → putih → `C.deep` (teks terang, satu seksi). Grid ≥ 3 kartu: satu kartu beda lebar, ditekankan, atau berisi non-teks.
- **Kartu fitur/langkah:** ikon 24 di wadah 48, h4, body-sm, satu detail berpembanding (angka, durasi, harga) atau `Badge`. Alur bertahap: penanda + garis penghubung, tahap kini disorot.
- **Orang:** foto potret (`Image /` 240–320) atau avatar 48–64; kutipan hasil sebelum → sesudah, nama, peran/usaha, kota; satu disorot (bidang/lebih lebar) atau metrik hasil berwarna.
- **Pricing/jadwal:** 2–4 tier/slot; unggulan satu cara (`C.deep` + teks terang + bayangan md, atau border aksen) + `Badge`, CTA-nya primer, lainnya sekunder. Keadaan tiap pilihan (kuota, tanggal, habis). Harga h1/display-lg tabular, fitur ber-`check`, CTA sejajar bawah (`justify:'space-between'`); label CTA bermaksud sama = teks sama.
- **Karakter:** satu momen angka besar (`Display /` 72/80 + satuan + pembanding) sebagai bukti, bukan strip statistik; seksi `C.deep` memuat isi terkuat (angka, kutipan, perbandingan). Kolom bersebelahan sama tinggi dan terisi, visual setinggi teksnya; tanpa seksi setengah kosong.
- **CTA penutup** (boleh `Ekstra /`) dan **footer:** logo + satu kalimat, 3–4 kolom tautan, hak cipta; sosial = logo simple-icons atau teks.

## Alur execute

Execute 1 = skeleton: board hug + `Halaman` + semua seksi rencana (footer terakhir) sebagai `Skel(page,nama,perkiraan tinggi)` di `keep.s`. Lalu satu blok per execute dari atas: navbar; teks hero; visual hero; header seksi; satu baris kartu; …; `Build(keep.s.x,{…})` saat blok pertama seksinya + perbaikan `check`. Penutup: review → perbaikan + lepas `[WIP] ` (sisa `[Skeleton] ` → LC-33).

## Contoh teruji

Skeleton (contoh dipendekkan: tiga seksi):

```js
const p=place(1440,'hug');
const b=add(null,{type:'board',name:'[WIP] Biji Pagi / Beranda · landing · Jernih',x:p.x,y:p.y,width:1440,height:'hug',screen:'landing',fills:fill(C.bg)});
const page=F(b,'Halaman',{width:'fill'});
keep.s={nav:Skel(page,'Navbar',72),hero:Skel(page,'Seksi / Hero',876),fitur:Skel(page,'Seksi / Fitur',760)};
keep.board=b;
b
```

Navbar 72:

```js
const nav=Build(keep.s.nav,{layout:'row',height:72,padding:[0,80],align:'center',justify:'space-between',stroke:{...line(),sides:['bottom']}});
const logo=Row(nav,'Logo',{gap:12});
const mark=Row(logo,'Logo / Tanda',{width:32,height:32,radius:8,justify:'center',fills:fill(C.acc)});
I(mark,'coffee',20,C.on);
T(logo,'Wordmark','Biji Pagi','h4');
const links=Row(nav,'Tautan',{gap:32});
for(const l of ['Cara kerja','Asal biji','Harga']) T(links,'Link / '+l,l,'body-sm',{color:C.t2,weight:500});
const act=Row(nav,'Aksi',{gap:12});
Btn(act,'Masuk','secondary',{height:40,padding:[0,16]});
Btn(act,'Coba sampel','primary',{height:40,padding:[0,16]});
```

Teks hero di bidang merek (langkah khas: mockup jadwal utuh di bawah teks hero; baris berkeadaan):

```js
// minHeight 876 = tinggi Crop / Kontur, sengaja tetap; efek hanya bila diminta, selain itu fill(C.field)
const hero=Build(keep.s.hero,{minHeight:876,padding:[96,80],gap:64,align:'center',clip:true,fills:[...fill(C.field),
 {type:'mesh',columns:3,rows:2,colors:['#CDE8E4',C.field,'#F4E7C8',C.field,C.field,'#D3EBE7']},{type:'noise',opacity:0.05,seed:11}]});
// 16 kontur, merunduk di tengah (zona teks)
const fx=F(hero,'Crop / Kontur',{position:'absolute',x:0,y:0,width:1440,height:876,layout:'none',clip:true});
for(let i=0;i<16;i++){const y=60+i*26,k=i%5===2;
 add(fx,{type:'path',name:'Kontur / '+(i+1),d:`M0 ${y} C 420 ${y+40} 300 ${y+420} 720 ${y+430} S 1020 ${y+40} 1440 ${y}`,viewBox:[0,0,1440,756],width:1440,height:756,stroke:{color:C.acc+(k?'80':(16+i*2).toString(16).padStart(2,'0')),width:k?1.5:1,align:'center'}});}
// Peredam (anak terakhir Crop) memuat seluruh teks hero
add(fx,{type:'ellipse',name:'Peredam',x:120,y:0,width:1200,height:560,blur:48,fills:fill(C.field+'E6')});
const copy=F(hero,'Hero / Teks',{width:800,gap:24,align:'center'});
T(copy,'Overline','LANGGANAN BIJI KOPI UNTUK KAFE','overline',{color:C.acc});
T(copy,'Headline','Biji segar tiba tiap Senin, disangrai 72 jam sebelumnya','display-lg',{width:'fill',align:'center'});
T(copy,'Subjudul','Atur jadwal, profil sangrai, dan jumlah per cabang dari satu dasbor; tagihan ikut pemakaian.','body-lg',{width:640,align:'center',color:C.t2});
const cta=Row(copy,'CTA',{gap:12,padding:[8,0,0,0]});
Btn(cta,'Coba sampel');
Btn(cta,'Lihat jadwal sangrai','secondary');
T(copy,'Penguat','Gratis ongkir untuk 3 pengiriman pertama · berhenti kapan saja','body-sm',{color:C.t3});
```

Visual hero, mockup utuh 3 baris; padding bawah 96:

```js
const app=F(keep.s.hero,'Mockup / Dasbor',{width:1040,padding:24,gap:20,radius:16,fills:fill(C.bg),stroke:line(),shadows:[{x:0,y:4,blur:16,color:'#10182814'}]});
const top=Row(app,'Header',{width:'fill',justify:'space-between'});
T(top,'Judul','Pengiriman minggu ini','h4');
const meta=Row(top,'Meta',{gap:8});
Badge(meta,'36,5 kg · +4 kg vs minggu lalu','success','trending-up');
Badge(meta,'Disangrai Jumat','accent','flame');
const rows=F(app,'Daftar',{width:'fill'});
// selesai, berikutnya (disorot), peringatan
for(const [n,k,q,st,tone,ic,hot] of [['Kafe Teras, Bandung','Gayo · medium','12 kg','Tiba Senin','success','circle-check',0],['Ruang Seduh, Jakarta','Kintamani · light','8 kg','Dikemas','accent','package',1],['Pojok Arang, Bogor','Toraja · medium-dark','6,5 kg','Stok 2 hari','warning','triangle-exclamation-point',0]]){
 const r=Row(rows,'Baris / '+n,{width:'fill',height:56,gap:16,padding:[0,12],radius:8,fills:fill(hot?C.tint:C.bg)});
 const w=Row(r,'Ikon',{width:32,height:32,radius:8,justify:'center',fills:fill(hot?C.acc:C.sub)}); I(w,ic,16,hot?C.on:C.t2);
 // sel = frame berisi teks (kolom sejajar)
 for(const [c,v,wd,o] of [['Cabang',n,'fill',{weight:500}],['Biji',k,200,{color:C.t2}],['Jumlah',q,64,{numeric:'tabular'}]]) T(F(r,'Sel / '+c,{width:wd}),c,v,'body-sm',{width:'fill',...o});
 const sc=Row(r,'Status',{width:136,justify:'end'}); Badge(sc,st,tone);
}
```

Header seksi fitur:

```js
const s=Build(keep.s.fitur,{padding:[128,80],gap:48});
const head=F(s,'Header seksi',{width:720,gap:16});
T(head,'Overline','CARA KERJA','overline',{color:C.acc});
T(head,'Judul','Dari sangrai ke rak bar dalam tiga hari','h2',{width:'fill'});
T(head,'Deskripsi','Setiap kiriman membawa tanggal sangrai, profil, dan saran resep.','body-lg',{width:'fill',color:C.t2});
```

Baris kartu bento: kartu lebar (stok berpembanding + linimasa) + dua sempit (satu ditekankan), bukan tiga kembar:

```js
const grid=Row(keep.s.fitur,'Grid fitur',{width:'fill',gap:24,align:'stretch'});
const big=F(grid,'Kartu / Jadwal',{width:'fill',padding:32,justify:'space-between',radius:12,fills:fill(C.field)});
const bt=F(big,'Teks',{width:'fill',gap:12});
T(bt,'Judul','Jadwal sangrai mengikuti stok tiap cabang','h4',{width:'fill'});
T(bt,'Deskripsi','Sisa stok dari kasir menggeser jumlah kiriman sebelum biji habis.','body-lg',{width:560,color:C.t2});
const st=F(big,'Stok',{width:'fill',padding:16,gap:12,radius:8,fills:fill(C.bg)});
const sr=Row(st,'Baris',{width:'fill',justify:'space-between'});
T(sr,'Label','Stok Kafe Teras','body-sm',{color:C.t2}); Badge(sr,'3,1 dari 12 kg · habis Kamis','warning','triangle-exclamation-point');
const bar=Row(st,'Bar',{width:'fill',height:8,radius:9999,fills:fill(C.line)});
add(bar,{type:'rect',name:'Isi',width:196,height:8,radius:9999,fills:fill(C.warn)}); // 3,1 / 12 ≈ 26% × 760
const tl=Row(big,'Linimasa',{width:'fill',gap:12});
for(const [d,t,on] of [['Jum','Sangrai',1],['Sab','Istirahat',1],['Min','Dikemas',1],['Sen','Tiba di kafe',0]]){
 const c=F(tl,'Langkah / '+t,{width:'fill',padding:16,gap:4,radius:8,fills:fill(on?C.bg:C.acc)});
 T(c,'Hari',d,'caption',{color:on?C.t3:C.on});
 T(c,'Status',t,'label',{color:on?C.t1:C.on});
}
const side=F(grid,'Kolom kanan',{width:400,gap:24});
for(const [ic,j,dsc,det,tone,hot] of [['flame','Profil sangrai per menu','Espresso, filter, dan susu punya kurva sendiri.','3 profil','accent',1],['receipt','Tagihan ikut pemakaian','Bulan sepi, tagihan turun otomatis.','−6% vs Q1','success',0]]){
 const k=F(side,'Kartu / '+j,{width:'fill',padding:24,gap:12,radius:12,stroke:line(),...(hot?{shadows:[{x:0,y:4,blur:16,color:'#10182814'}]}:{})});
 const hd=Row(k,'Kepala',{width:'fill',justify:'space-between'});
 const w=Row(hd,'Ikon',{width:48,height:48,radius:12,justify:'center',fills:fill(hot?C.acc:C.tint)}); I(w,ic,24,hot?C.on:C.acc);
 Badge(hd,det,tone,undefined,'md');
 T(k,'Judul',j,'h4');
 T(k,'Deskripsi',dsc,'body-sm',{width:'fill',color:C.t2});
}
```

Penutup:

```js
update(keep.board, {name:'Biji Pagi / Beranda · landing · Jernih'});
```