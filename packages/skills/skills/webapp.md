# Lakar: aplikasi web dan dashboard

Board persis ukuran permintaan (default `1440 × 900`, `screen:'app'`); semua isi muat tanpa gulir. Anak board: satu `Row` `Aplikasi` (`width:'fill'`, `height:'fill'`, `align:'stretch'`) berisi sidebar + area kerja.

## Struktur

- **Latar halaman** netral yang digeser 2–4% ke hue aksen (mis. `#F3F6F5` untuk teal), bukan abu murni; kartu putih di atasnya. Satu strategi kedalaman: garis 1 px + bayangan sm.
- **Sidebar 240** (padding 16, putih, garis kanan): logo 32 + nama, lalu grup bernavigasi dengan label `overline` t3. Item 40 (ikon 20 + label, radius 8); item aktif = fill aksen solid + ikon/teks `C.on`, bukan sekadar tint atau teks tebal. Hitungan tugas = `Badge` sm di kanan item. Bawah: organisasi/pengguna.
- **Area kerja** padding 32, gap 24. **Header 48–64:** judul layar `title-lg` + baris konteks t2; kanan: pemilih konteks (periode, cabang) sebagai `Input /` 40 dengan `chevron-down`, pencarian, satu tombol primer.
- **KPI** satu baris 3–4 kartu: satu KPI utama ber-fill `C.deep` (atau aksen) dengan teks terang, nilai terbesar, sparkline atau area kecil; KPI lain putih atau ber-tint. Setiap KPI: label, nilai `KPI / Nilai` tabular + satuan kecil t3, chip delta berwarna status + ikon arah + pembanding ("vs minggu lalu"). Kartu KPI tidak kembar: ukuran, fill, atau grafik mininya berbeda.
- **Grafik bervariasi dalam satu layar,** bentuk mengikuti data: batang bertumpuk/berkelompok untuk komposisi (dari `rect`, sudut atas 4), area bergradasi untuk tren (gradien aksen ke transparan di bawah garis), sparkline di KPI. Garis tipis tunggal hanya pelengkap. Seri bernada `C.data`, legenda titik bernada sama, label sumbu caption t3, nilai kini/puncak ditandai (batang hari ini aksen penuh, lainnya lebih muda).
- **Tabel:** header caption t3 di bidang `sub`; baris 48–56 dengan garis bawah; kolom angka rata kanan tabular dengan satuan kecil; status = `Badge` bertitik (`dot`); baris bermasalah ber-tint warning/danger; keterangan waktu relatif ("2 jam lalu").
- **Panel keadaan** (bila ada ruang): daftar yang perlu tindakan (terlambat, stok tipis, menunggu) dengan ikon status dan waktu.
- Grid kartu gap 24, padding kartu 20–24, radius 12. Isi seluruh tinggi board: baris bawah `height:'fill'`, grafik `height:'fill'`.

## Tanda slop dashboard

Semua kartu putih + garis tipis + satu aksen biru; grafik garis tipis tanpa area atau legenda; KPI telanjang tanpa delta dan pembanding; sidebar polos tanpa penanda aktif tegas; empat kartu KPI kembar; tabel tanpa keadaan; ruang kosong besar di bawah.

## Alur execute (maks 3)

1. Execute 1: board lengkap (sidebar, header, KPI, grafik, tabel).
2. Semua temuan `check` + kritik diri diperbaiki dalam satu execute.
3. Akhir sesuai `core`.

## Contoh teruji

Dasbor operasional jaringan laundry kiloan, arketipe Padat (langkah khas: KPI utama di bidang gelap merek dengan sparkline, volume harian bertumpuk per layanan; tabel memperlihatkan keadaan):

```js
// pakai prelude
Object.assign(C,{sub:'#F3F6F5',field:'#E3F1EF',acc2:'#7C3AED',data:['#0F766E','#5EB8AE','#7C3AED']}); Object.assign(FONT,{h:'Inter',b:'Inter',m:'IBM Plex Mono'});
const p=place(1440,900);
const b=add(null,{type:'board',name:'[WIP] Lipat / Ringkasan · app · Padat',x:p.x,y:p.y,width:1440,height:900,screen:'app',fills:fill(C.sub)});
keep.board=b;
const app=Row(b,'Aplikasi',{width:'fill',height:'fill',align:'stretch'});
// Sidebar: grup berlabel, item aktif = fill aksen solid
const sb=F(app,'Sidebar',{width:240,padding:16,gap:24,fills:fill(C.bg),stroke:{...line(),sides:['right']}});
const lg=Row(sb,'Logo',{gap:12,padding:[4,8]});
const mk=Row(lg,'Logo / Tanda',{width:32,height:32,radius:8,justify:'center',fills:fill(C.acc)}); I(mk,'shirt',18,C.on);
T(lg,'Wordmark','Lipat','h4');
for(const [g,items] of [['Operasional',[['layout-dashboard','Ringkasan',1,''],['shopping-bag','Pesanan',0,'12'],['truck','Antar-jemput',0,'']]],['Laporan',[['chart-column','Pendapatan',0,''],['users','Pelanggan',0,'']]]]){
 const gr=F(sb,'Grup / '+g,{width:'fill',gap:4});
 T(Row(gr,'Grup label',{padding:[0,10,4,10]}),'Label',g.toUpperCase(),'overline',{color:C.t3});
 for(const [ic,l,on,n] of items){const it=Row(gr,'Nav / '+l,{width:'fill',height:40,gap:12,padding:[0,10],radius:8,fills:fill(on?C.acc:C.bg)});
  I(it,ic,20,on?C.on:C.t2); T(it,'Label',l,'label',{width:'fill',color:on?C.on:C.t1}); if(n) Badge(it,n,'neutral');}
}
const main=F(app,'Area kerja',{width:'fill',padding:32,gap:24});
const hd=Row(main,'Header',{width:'fill',justify:'space-between'});
const ht=F(hd,'Judul',{gap:4}); T(ht,'Judul','Ringkasan hari ini','title-lg'); T(ht,'Konteks','Kamis, 14 Mei · 3 outlet buka','body-sm',{color:C.t2});
const ha=Row(hd,'Aksi',{gap:12});
const sel=Row(ha,'Input / Outlet',{height:40,gap:8,padding:[0,12],radius:8,fills:fill(C.bg),stroke:line(C.line2)});
I(sel,'store',16,C.t2); T(sel,'Nilai','Semua outlet','body-sm'); I(sel,'chevron-down',16,C.t2);
Btn(ha,'Pesanan baru','primary',{height:40,padding:[0,16]});
// KPI: satu utama di bidang gelap + sparkline; lainnya putih dengan chip delta
const kp=Row(main,'KPI',{width:'fill',gap:24,align:'stretch'});
const k1=F(kp,'Kartu / Cucian diproses',{width:360,padding:24,gap:12,radius:12,fills:fill(C.deep)});
T(k1,'Label','Cucian diproses','label',{color:'#BFE3DE'});
const kr=Row(k1,'Nilai',{width:'fill',gap:16,justify:'space-between'});
const kv=Row(kr,'Angka',{gap:6,align:'end'}); T(kv,'KPI / Nilai','486','title-lg',{size:40,lineHeight:48,color:C.on,numeric:'tabular'}); T(kv,'Satuan','kg','body',{color:'#BFE3DE'});
add(kr,{type:'path',name:'Sparkline',d:'M0 34 L24 30 L48 32 L72 22 L96 24 L120 12 L144 6',viewBox:[0,0,144,40],width:144,height:40,stroke:{color:'#5EEAD4',width:2,align:'center'}});
Badge(k1,'+8,2% vs Kamis lalu','success','trending-up','sm',C.deep);
for(const [l,v,u,d,tone,ic] of [['Pesanan masuk','73','pesanan','+11 vs kemarin','success','trending-up'],['Siap diambil','28','pesanan','4 lewat tempo','warning','clock'],['Rata-rata selesai','21,4','jam','−2,1 jam vs target','success','trending-down']]){
 const k=F(kp,'Kartu / '+l,{width:'fill',padding:24,gap:12,radius:12,fills:fill(C.bg),stroke:line()});
 T(k,'Label',l,'label',{color:C.t2});
 const r=Row(k,'Nilai',{gap:6,align:'end'}); T(r,'KPI / Nilai',v,'title-lg',{size:40,lineHeight:48,numeric:'tabular'}); T(r,'Satuan',u,'body',{color:C.t3});
 Badge(k,d,tone,ic);
}
// Baris bawah mengisi sisa tinggi: batang bertumpuk per layanan + tabel berkeadaan
const bw=Row(main,'Bawah',{width:'fill',height:'fill',gap:24,align:'stretch'});
const ch=F(bw,'Kartu / Volume harian',{width:'fill',padding:24,gap:20,radius:12,fills:fill(C.bg),stroke:line()});
const chh=Row(ch,'Header',{width:'fill',justify:'space-between'});
T(chh,'Judul','Volume 7 hari per layanan (kg)','h4');
const lgd=Row(chh,'Legenda',{gap:16});
for(const [n,c] of [['Cuci setrika',C.data[0]],['Cuci kering',C.data[1]],['Kilat',C.data[2]]]){const it=Row(lgd,'Legenda / '+n,{gap:6});
 add(it,{type:'ellipse',name:'Titik',width:8,height:8,fills:fill(c)}); T(it,'Teks',n,'caption',{color:C.t2});}
const bars=Row(ch,'Batang',{width:'fill',height:'fill',gap:20,align:'stretch'});
for(const [d,s1,s2,s3,now] of [['Jum',212,96,40],['Sab',248,120,52],['Min',176,88,28],['Sen',230,104,44],['Sel',224,110,38],['Rab',240,116,46],['Kam',258,128,60,1]]){
 const col=F(bars,'Hari / '+d,{width:'fill',gap:8,align:'center',justify:'end'});
 const st=F(col,'Tumpuk',{width:'fill',radius:[4,4,0,0],clip:true});
 for(const [h,c] of [[s3,C.data[2]],[s2,C.data[1]],[s1,C.data[0]]]) add(st,{type:'rect',name:'Seri',width:'fill',height:Math.round(h*0.8),fills:fill(now?c:c+'99')});
 T(col,'Label',d,'caption',{color:now?C.t1:C.t3});
}
const tb=F(bw,'Kartu / Siap diambil',{width:520,padding:[24,0],gap:12,radius:12,fills:fill(C.bg),stroke:line()});
T(Row(tb,'Kepala',{width:'fill',padding:[0,24]}),'Judul','Siap diambil','h4');
const th=Row(tb,'Header tabel',{width:'fill',height:36,padding:[0,24],gap:16,fills:fill(C.sub)});
for(const [h,w,a] of [['Pelanggan','fill','left'],['Berat',64,'right'],['Status',132,'right']]) T(th,'Kolom',h,'caption',{width:w,align:a,color:C.t3});
for(const [n,m,kg,st,tone,bad] of [['Rina Andriani','Outlet Cempaka · 3 hari','6,4','Lewat 2 hari','warning',1],['Dimas Saputra','Outlet Pasir Kaliki · 5 jam','4,2','Siap','success',0],['Kos Melati 12','Antar 16.00 · 1 jam','11,8','Dijadwalkan','accent',0],['Hendra Wijaya','Outlet Cempaka · 2 hari','3,6','Lewat 1 hari','warning',1],['Salon Ayu','Antar 18.30 · 3 jam','9,2','Dijadwalkan','accent',0],['Putri Lestari','Outlet Dago · 40 menit','5,0','Siap','success',0]]){
 const r=Row(tb,'Baris / '+n,{width:'fill',height:56,padding:[0,24],gap:16,fills:fill(bad?C.warn+'14':C.bg),stroke:{...line(),sides:['bottom']}});
 const tx=F(r,'Teks',{width:'fill',gap:2}); T(tx,'Nama',n,'label'); T(tx,'Meta',m,'caption',{color:bad?C.t2:C.t3});
 T(r,'Berat',kg+' kg','body-sm',{width:64,align:'right',numeric:'tabular'});
 const sc=Row(r,'Status',{width:132,justify:'end'}); Badge(sc,st,tone,'dot');
}
b
```
