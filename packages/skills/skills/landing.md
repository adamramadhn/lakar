# Lakar: landing page

Board `1440 × bebas` (`screen:'landing'`). Mulai dengan tinggi besar (2000–6000); execute penutup set tinggi = bawah seksi terakhir dari `bounds`.

## Struktur

- Wrapper `Halaman` (kolom, `width:'fill'`) langsung di board; setiap seksi `Seksi / …` lebar fill dengan padding horizontal 80. Grid 12 kolom: isi 1280 (tepi 80), gutter 24; blok utama mulai di awal kolom. Ritme: padding vertikal seksi 96–128; judul seksi ↔ isi 32–48; antar-kartu 24; dalam grup 12–16; ikon ↔ teks 4–8.
- **Navbar 72:** logo kiri (wadah 32 aksen + ikon + wordmark), 3–5 tautan `Link /` body-sm, kanan satu tombol sekunder + satu primer (tinggi 40). Garis bawah satu sisi.
- **Hero ≥ 640** di bidang merek (`C.field`) atau putih: headline display ≤ 3 baris berupa klaim hasil, bukan nama fitur; subjudul body-lg ≤ 2 baris; satu CTA primer + satu sekunder; baris penguat kecil di bawah CTA (jaminan, gratis ongkir). Visual hero adalah anak frame hero dan menyatu dengan latarnya: foto suasana nyata (`Image /` ≥ 520 lebar, radius 16–24) dengan 1–2 kartu data kecil `Overlay /` di atasnya (wajib bila permintaan menyebut foto), atau mockup produk utuh (padding bawah hero ≥ 64; isi berlebih → kurangi baris, jangan dipotong; tanpa `Crop /`). Bukan kartu berbingkai di kolom terpisah.
- **Bidang efek** (bila permintaan/merek meminta suasana ekspresif; satu per halaman), empat lapis: (1) `fills` netral → `mesh` dari aksen, ≤ 1 pendamping, netral; (2) **struktur** bermakna bagi merek dan berulang: 12–24 garis aliran/gelombang `path` dari loop (aksen ber-alpha ±6–50%, 1–2 garis tegas), kontur konsentris, atau kisi/partikel, di `Crop /` absolut seukuran bidang (`clip:true`, anak pertama), melintasi ≥ ⅔ lebar; sapuan kecil di pojok terbaca datar; (3) `noise` 0.04–0.08; (4) latar gelap: boleh satu cahaya lembut merek di belakang fokus (blur ≥ 40, opacity ≤ 35%). Teks/tombol di zona tenang (struktur merunduk/menipis, atau elips gelap ber-blur sebagai peredam), kontras ≥ 4.5:1 terhadap warna terburuk di bawahnya; cuplikan produk = panel solid. Seksi lain yang diminta berefek: gema palet yang sama, jauh lebih tipis, bukan bidang kedua. Ring/donut progres boleh `conic`.
- **Header seksi:** h2 → body-lg secondary, lebar ≤ 720. Rata kiri atau tengah, konsisten. Overline aksen maks 2 per halaman dan hanya bila membawa informasi (kategori, langkah), bukan di setiap seksi. Baris meta maks 2 "·".
- **Ritme:** dua seksi bersebelahan tidak boleh berstruktur sama (variasikan: bento, dua kolom teks + visual, daftar langkah, tabel banding, seksi bidang merek). Latar seksi bergantian putih → `C.field` → putih → `C.deep` (teks `C.on`/terang, satu seksi saja), bukan abu polos. Dalam grid ≥ 3 kartu, minimal satu kartu berbeda lebar, ditekankan (bidang/solid), atau memuat elemen non-teks.
- **Kartu fitur/langkah:** ikon 24 di wadah 48 (tint; solid aksen untuk butir yang ditekankan), judul h4, deskripsi body-sm, dan satu detail konkret berpembanding (angka, durasi, harga) atau `Badge`. Alur bertahap: nomor/penanda tahap + garis penghubung, tahap kini disorot.
- **Orang (testimoni, tim, profil):** foto potret kartu (`Image /` tinggi 240–320, fill cover) atau avatar foto 48–64, semua dari satu pencarian potret (`limit:12`), satu orang berbeda per kartu; kutipan spesifik (hasil + konteks: angka sebelum → sesudah), nama, peran/usaha, kota. Rating: ikon `star` `filled:true` warna `C.acc2` + angka. Kartu orang tidak kembar: satu sorotan (bidang/lebih lebar) atau metrik hasil berwarna.
- **Pricing/jadwal:** 2–4 tier atau slot jadwal. Unggulan ditonjolkan satu cara (`C.deep` dengan teks terang + bayangan md, atau border aksen) + `Badge` (di `C.deep`: arg ke-6 `C.deep`); CTA-nya primer, lainnya sekunder. Keadaan tiap pilihan terlihat (kuota, tanggal, habis/tersedia). Harga h1/display-lg tabular, fitur dengan ikon `check`. Kartu tier sama tinggi (`align:'stretch'` pada baris), CTA sejajar di bawah (`justify:'space-between'`). Label CTA bermaksud sama = teks sama di seluruh halaman.
- **CTA penutup** (boleh `Ekstra /`) dan **footer:** logo + satu kalimat, 3–4 kolom tautan, hak cipta; tautan sosial dengan logo simple-icons atau teks.

## Alur execute

1. Board + `keep.board`/`keep.page` + navbar + hero.
2. Dua–tiga seksi berikutnya (`F(keep.page, 'Seksi / …')`).
3. Seksi sisa + footer. Baca `check` tiap respons.
4. Screenshot → execute penutup: perbaikan + tinggi board + lepas `[WIP] `.

## Contoh teruji

Board, navbar, dan hero di bidang merek (langkah khas: mockup jadwal pengiriman utuh di bawah teks hero; baris memperlihatkan keadaan):

```js
// pakai prelude
const p=place(1440,2000);
const b=add(null,{type:'board',name:'[WIP] Biji Pagi / Beranda · landing · Jernih',x:p.x,y:p.y,width:1440,height:2000,screen:'landing',fills:fill(C.bg)});
keep.board=b;
const page=F(b,'Halaman',{width:'fill'});
// Navbar 72
const nav=Row(page,'Navbar',{width:'fill',height:72,padding:[0,80],justify:'space-between',stroke:{...line(),sides:['bottom']}});
const logo=Row(nav,'Logo',{gap:12});
const mark=Row(logo,'Logo / Tanda',{width:32,height:32,radius:8,justify:'center',fills:fill(C.acc)});
I(mark,'coffee',20,C.on);
T(logo,'Wordmark','Biji Pagi','h4');
const links=Row(nav,'Tautan',{gap:32});
for(const l of ['Cara kerja','Asal biji','Harga']) T(links,'Link / '+l,l,'body-sm',{color:C.t2,weight:500});
const act=Row(nav,'Aksi',{gap:12});
Btn(act,'Masuk','secondary',{height:40,padding:[0,16]});
Btn(act,'Coba sampel','primary',{height:40,padding:[0,16]});
// Efek (mesh/noise/Kontur) hanya bila merek minta suasana ekspresif; selain itu fill(C.field) polos
const hero=F(page,'Seksi / Hero',{width:'fill',padding:[96,80],gap:64,align:'center',clip:true,fills:[...fill(C.field),
 {type:'mesh',columns:3,rows:2,colors:['#CDE8E4',C.field,'#F4E7C8',C.field,C.field,'#D3EBE7']},{type:'noise',opacity:0.05,seed:11}]});
// 16 kontur selebar penuh, merunduk di tengah (zona teks tenang)
const fx=F(hero,'Crop / Kontur',{position:'absolute',x:0,y:0,width:1440,height:876,layout:'none',clip:true});
for(let i=0;i<16;i++){const y=60+i*26,k=i%5===2;
 add(fx,{type:'path',name:'Kontur / '+(i+1),d:`M0 ${y} C 420 ${y+40} 300 ${y+420} 720 ${y+430} S 1020 ${y+40} 1440 ${y}`,viewBox:[0,0,1440,756],width:1440,height:756,stroke:{color:C.acc+(k?'80':(16+i*2).toString(16).padStart(2,'0')),width:k?1.5:1,align:'center'}});}
const copy=F(hero,'Hero / Teks',{width:800,gap:24,align:'center'});
T(copy,'Overline','LANGGANAN BIJI KOPI UNTUK KAFE','overline',{color:C.acc});
T(copy,'Headline','Biji segar tiba tiap Senin, disangrai 72 jam sebelumnya','display-lg',{width:'fill',align:'center'});
T(copy,'Subjudul','Atur jadwal, profil sangrai, dan jumlah per cabang dari satu dasbor; tagihan ikut pemakaian.','body-lg',{width:640,align:'center',color:C.t2});
const cta=Row(copy,'CTA',{gap:12,padding:[8,0,0,0]});
Btn(cta,'Coba sampel');
Btn(cta,'Lihat jadwal sangrai','secondary');
T(copy,'Penguat','Gratis ongkir untuk 3 pengiriman pertama · berhenti kapan saja','body-sm',{color:C.t3});
// Mockup utuh: 3 baris cukup, padding bawah hero 96
const app=F(hero,'Mockup / Dasbor',{width:1040,padding:24,gap:20,radius:16,fills:fill(C.bg),stroke:line(),shadows:[{x:0,y:4,blur:16,color:'#10182814'}]});
const top=Row(app,'Header',{width:'fill',justify:'space-between'});
T(top,'Judul','Pengiriman minggu ini','h4');
const meta=Row(top,'Meta',{gap:8});
Badge(meta,'36,5 kg · +4 kg vs minggu lalu','success','trending-up');
Badge(meta,'Disangrai Jumat','accent','flame');
const rows=F(app,'Daftar',{width:'fill'});
// Keadaan: selesai, berikutnya (disorot), peringatan
for(const [n,k,q,st,tone,ic,hot] of [['Kafe Teras, Bandung','Gayo · medium','12 kg','Tiba Senin','success','circle-check',0],['Ruang Seduh, Jakarta','Kintamani · light','8 kg','Dikemas','accent','package',1],['Pojok Arang, Bogor','Toraja · medium-dark','6,5 kg','Stok 2 hari','warning','triangle-exclamation-point',0]]){
 const r=Row(rows,'Baris / '+n,{width:'fill',height:56,gap:16,padding:[0,12],radius:8,fills:fill(hot?C.tint:C.bg)});
 const w=Row(r,'Ikon',{width:32,height:32,radius:8,justify:'center',fills:fill(hot?C.acc:C.sub)}); I(w,ic,16,hot?C.on:C.t2);
 T(r,'Cabang',n,'body-sm',{width:'fill',weight:500});
 T(r,'Biji',k,'body-sm',{width:200,color:C.t2});
 T(r,'Jumlah',q,'body-sm',{width:64,numeric:'tabular'});
 const sc=Row(r,'Status',{width:136,justify:'end'}); Badge(sc,st,tone);
}
keep.page=page;
b
```

Seksi fitur bento: satu kartu lebar berisi stok berpembanding + linimasa, dua kartu sempit (satu ditekankan), bukan tiga kartu kembar:

```js
// pakai prelude
const s=F(keep.page,'Seksi / Fitur',{width:'fill',padding:[128,80],gap:48});
const head=F(s,'Header seksi',{width:720,gap:16});
T(head,'Overline','CARA KERJA','overline',{color:C.acc});
T(head,'Judul','Dari sangrai ke rak bar dalam tiga hari','h2',{width:'fill'});
T(head,'Deskripsi','Setiap kiriman membawa tanggal sangrai, profil, dan saran resep.','body-lg',{width:'fill',color:C.t2});
const grid=Row(s,'Grid fitur',{width:'fill',gap:24,align:'stretch'});
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
 const hd=Row(k,'Kepala',{width:'fill',justify:'space-between'}); // ikon + metrik
 const w=Row(hd,'Ikon',{width:48,height:48,radius:12,justify:'center',fills:fill(hot?C.acc:C.tint)}); I(w,ic,24,hot?C.on:C.acc);
 Badge(hd,det,tone,undefined,'md');
 T(k,'Judul',j,'h4');
 T(k,'Deskripsi',dsc,'body-sm',{width:'fill',color:C.t2});
}
```

Execute penutup: tinggi = bawah seksi terakhir dari `bounds` (y 948 + 780), lepas `[WIP] `:

```js
update(keep.board, {height:1728, name:'Biji Pagi / Beranda · landing · Jernih'});
```
