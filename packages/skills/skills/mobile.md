# Lakar: mobile app

Board `390 × 844` (`screen:'mobile'`), ukuran tetap. Board sudah menyusun anak sebagai kolom (tanpa `layout`).

Mode gelap (Malam): `Object.assign(C,{bg,sub:surface,line,line2,t1,t2,t3` dari netral gelap bernuansa aksen`, acc` varian gelap`, tint, field:raised, deep, on:'#0B0C0F', ok:'#4ADE80', warn:'#FBBF24', bad:'#F87171', acc2, data})`; kartu = surface, sorotan = raised, latar besar bukan abu murni.

## Struktur

- **Status bar** 54 (nama layer persis `Status bar`): jam kiri, ikon `signal`/`wifi`/`battery-full` 16 kanan, padding horizontal 24.
- **Satu wrapper** `Konten` (kolom, `width:'fill'`, padding horizontal 20; anak tanpa padding horizontal sendiri). Jarak: antar-seksi 24–32, judul seksi ↔ isi 12–16, antar-kartu 12–16, ikon ↔ teks 4–8.
- **Header hemat ruang** ≤ 64: avatar foto 40 (bila ada pengguna; potret, bukan inisial) + sapaan `title` (atau judul layar `title-lg`) + maks dua `IconButton /` 44. Baris konteks hanya bila ruang tersisa; gaya judul sama di satu alur. Header seksi: h4 + `Link /` aksen di kanan.
- **Kartu/list:** kartu padding 16–20; sorotan di bidang merek (terang: `C.field` + bayangan md; gelap: raised + garis aksen) dengan `Badge` metrik. Baris list ringkas 56–72: thumbnail 48–56 (wadah ikon 40 hanya untuk aksi/pengaturan), judul label + meta body-sm muted, keadaan di kanan: selesai `circle-check` success, berikutnya `Badge` aksen + baris disorot, mendatang chevron, terkunci `lock` muted. Target sentuh ≥ 44, jarak ≥ 8.
- **Foto untuk isi nyata:** sampul dan thumbnail yang mewakili konten (media, produk, makanan, tempat, orang) = foto dari pencarian `limit:12`, berbeda per butir; teks di atas foto diberi lapisan gelap. Bidang warna polos berlabel hanya bila pencarian gagal, atau tile kategori abstrak: hue sendiri per tile dari palet kategori + label kontras. Visual puncak maks ±280 tinggi.
- **Tanpa duplikasi:** satu butir tampil sekali per layar; bilah menempel memuat butir yang berjalan → sorotan memuat hal lain (butir berikutnya, ringkasan, rekomendasi), daftar tidak mengulanginya.
- **Ring/grafik** dari `ellipse` busur: jalur (`inner`, tint) + progres (`startDeg`, `sweepDeg` = persen × 360) di frame `layout:'none'`. Beberapa seri = busur bernada `C.data`, legenda titik bernada sama + nilai / sasaran.
- **Tab bar** 3–5 item: ikon 24 + label `tab`; aktif = aksen + pil tint, lainnya muted. Bilah yang menempel di atasnya = `Overlay /` lapis raised + progres tipis aksen. Mengambang = `Overlay / Tab bar` absolut (lebar 350, x 20, di atas home indicator).
- **Bilah bawah tetap** (aksi menetap): `Overlay / Bilah bawah` padding 16 20 34, total + tombol 56 lebar fill.
- **Layar pertama hidup dan selesai rapi:** board pertama memuat inti permintaan (aksi utama, isi kunci, awal tiap bagian) di atas zona bawah (tab bar, bilah menempel, bilah aksi). Daftar menampilkan ≥ 3 butir utuh; bila tidak muat, rapatkan header, visual puncak, dan sorotan dulu, baru kurangi butir. Butir terakhir berakhir ≥ 8 di atas zona; tanpa judul seksi yang isinya tertutup atau kartu setengah terlihat. Seksi yang tidak muat mulai utuh di balik zona/board posisi akhir.
- **Anggaran tinggi (hitung dulu):** tab bar mengambang mulai y 746; bilah menempel ±64 di atasnya; bilah aksi tetap ±734. Jumlahkan 54 status bar + header + seksi; lebih → rapatkan atau pindahkan seksi utuh, font tetap.
- **Bidang efek** (onboarding, sampul, kartu sorotan; bila diminta/merek ekspresif), satu per layar: `mesh` dasar → struktur bermakna berulang melintasi bidang (gelombang `path` dari loop, cincin `ellipse`, partikel; alpha bertingkat) → `noise` ≤ 0.08 → latar gelap: satu cahaya merek di balik fokus (blur ≥ 40, opacity ≤ 35%), bukan di tombol; teks/tombol di zona tenang/panel solid, kontras ≥ 4.5:1.
- **Home indicator** 34 (nama layer persis `Home indicator`), garis 134 × 5 di tengah.
- **Layar lebih panjang dari 844:** putuskan saat merencanakan. Status bar → header tetap → `Scroll / Konten` (`clip:true`) → bilah bawah tetap. Dua board 390 × 844 dibangun di execute pertama: posisi awal dan akhir (`const p=place(390,844,{near:b}); const b2=duplicate(b,{name:'… (akhir) …', x:p.x, y:p.y});` lalu `update(find({name:'Scroll / Konten', within:b2})[0].id, {scrollY:…})`), `scrollY` jatuh di awal seksi/butir dan butir terakhir selesai bersih di atas zona bawah.

## Alur execute (maks 3)

1. Execute 1: semua board lengkap (termasuk posisi akhir) dengan tinggi yang sudah dihitung.
2. Semua temuan `check` diperbaiki dalam satu execute (`update`/`editId`).
3. Akhir sesuai `core` (tanpa `inspect`, tanpa execute keempat).

## Contoh teruji

Beranda aplikasi kursus bahasa, arketipe Ramah (langkah khas: ring target mingguan bersegmen per keterampilan yang langsung tersambung ke tombol lanjutkan unit; daftar memperlihatkan keadaan):

```js
// pakai prelude
Object.assign(C,{acc:'#4F46E5',tint:'#4F46E514',field:'#EEF0FE',deep:'#312E81',acc2:'#A16207',data:['#4F46E5','#8B93F8','#A16207']}); Object.assign(FONT,{h:'DM Sans',b:'DM Sans',m:'DM Mono'});
const p=place(390,844);
const b=add(null,{type:'board',name:'[WIP] Tutur / Beranda · mobile · Ramah',x:p.x,y:p.y,width:390,height:844,screen:'mobile',fills:fill(C.bg)});
keep.board=b;
// Status bar 54
const sb=Row(b,'Status bar',{width:'fill',height:54,padding:[0,24],justify:'space-between'});
T(sb,'Jam','09:41','label');
const sig=Row(sb,'Sinyal',{gap:6}); for(const i of ['signal','wifi','battery-full']) I(sig,i,16,C.t1);
// Satu wrapper ber-padding 20
const w=F(b,'Konten',{width:'fill',padding:[8,20,0,20],gap:24});
const hd=Row(w,'Header',{width:'fill',justify:'space-between'});
const hi=F(hd,'Sapaan',{gap:4});
T(hi,'Hari','Kamis, 14 Mei','body-sm',{color:C.t3});
T(hi,'Judul','Halo, Sinta','title');
const ib=Row(hd,'IconButton / Notifikasi',{width:44,height:44,radius:9999,justify:'center',stroke:line()});
I(ib,'bell',20,C.t1);
// Kartu sorotan di bidang merek: ring bersegmen (satu nada per keterampilan) + pembanding minggu lalu
// Kartu sorotan = satu-satunya bidang efek: tint merek + mesh lembut + kontur gema dari ring + grain tipis. Onboarding/sampul
// gelap: latar board netral gelap → mesh (aksen, pendamping; terang di atas) → gelombang/cincin → noise 0.06 → satu cahaya merek.
const card=F(w,'Kartu / Target mingguan',{width:'fill',padding:20,gap:16,radius:16,clip:true,shadows:[{x:0,y:4,blur:16,color:'#10182814'}],
 fills:[...fill(C.field),{type:'mesh',columns:2,rows:2,colors:['#DDE1FD',C.field,C.field,'#F5ECD7']},{type:'noise',opacity:0.05,seed:3}]});
const fx=F(card,'Crop / Kontur',{position:'absolute',x:0,y:0,width:350,height:232,layout:'none',clip:true});
for(let i=0;i<9;i++){const r=64+i*20;
 add(fx,{type:'ellipse',name:'Kontur / '+(i+1),position:'absolute',x:68-r,y:68-r,width:2*r,height:2*r,stroke:{color:C.acc+(48-i*4).toString(16).padStart(2,'0'),width:1,align:'center'}});}
const top=Row(card,'Atas',{width:'fill',gap:20});
const ring=F(top,'Ring / Target',{layout:'none',width:96,height:96});
add(ring,{type:'ellipse',name:'Jalur',width:96,height:96,inner:0.8,fills:fill('#4F46E524')});
let deg=0; // 90 dari 150 menit = 60%: simak 45 (30%), bicara 30 (20%), kosakata 15 (10%)
for(const [n,pct,c] of [['Simak',30,C.data[0]],['Bicara',20,C.data[1]],['Kosakata',10,C.data[2]]]){
 add(ring,{type:'ellipse',name:'Seri / '+n,width:96,height:96,inner:0.8,startDeg:deg,sweepDeg:pct*3.6,fills:fill(c)}); deg+=pct*3.6;
}
const mid=F(ring,'Tengah',{position:'absolute',x:0,y:0,width:96,height:96,justify:'center',align:'center'});
T(mid,'KPI / Nilai','60%','title',{numeric:'tabular'});
const lg=F(top,'Legenda',{width:'fill',gap:4});
T(lg,'Label','Menit belajar minggu ini','body-sm',{color:C.t2});
T(lg,'Nilai','90 dari 150','h4',{numeric:'tabular'});
Badge(lg,'+20 vs minggu lalu','success','trending-up');
const sr=Row(card,'Seri',{width:'fill',gap:12});
for(const [n,v,c] of [['Simak','45',C.data[0]],['Bicara','30',C.data[1]],['Kosakata','15',C.data[2]]]){
 const it=Row(sr,'Legenda / '+n,{gap:6}); add(it,{type:'ellipse',name:'Titik',width:8,height:8,fills:fill(c)});
 T(it,'Teks',n+' '+v,'caption',{color:C.t2});
}
Btn(card,'Lanjutkan Unit 4','primary',{width:'fill'});
// Header seksi + list yang memperlihatkan keadaan
const sh=Row(w,'Header seksi',{width:'fill',justify:'space-between'});
T(sh,'Judul','Pelajaran hari ini','h4');
T(sh,'Link / Semua','Lihat semua','label',{color:C.acc});
const list=F(w,'Daftar pelajaran',{width:'fill',gap:8});
for(const [ic,j,m,st] of [['headphones','Menyimak: di stasiun','Unit 4 · 12 menit · 92%','done'],['message-circle','Percakapan memesan tiket','Unit 4 · 15 menit','next'],['book-open','Kosakata perjalanan','Unit 4 · 8 menit','todo'],['list-checks','Kuis akhir unit','Unit 4 · 10 soal','lock']]){
 const on=st==='next', off=st==='done'||st==='lock';
 const r=Row(list,'Item / '+j,{width:'fill',gap:12,padding:12,radius:12,fills:fill(on?C.tint:C.bg),stroke:line(on?C.acc:C.line)});
 const box=Row(r,'Ikon',{width:40,height:40,radius:12,justify:'center',fills:fill(on?C.acc:off?C.sub:C.tint)}); I(box,ic,20,on?C.on:off?C.t3:C.acc);
 const tx=F(r,'Teks',{width:'fill',gap:2});
 T(tx,'Judul',j,'label',{color:off?C.t2:C.t1}); T(tx,'Meta',m,'body-sm',{color:C.t3});
 if(on) Badge(r,'Berikutnya','accent'); else I(r,{done:'circle-check',todo:'chevron-right',lock:'lock'}[st],20,st==='done'?C.ok:C.t3);
}
// Tab bar mengambang (Overlay /), tab aktif = aksen + pil tint, + home indicator
const tb=Row(b,'Overlay / Tab bar',{position:'absolute',x:20,y:746,width:350,height:64,padding:[0,8],radius:24,fills:fill(C.bg),stroke:line(),shadows:[{x:0,y:4,blur:16,color:'#10182814'}]});
for(const [ic,l,on] of [['house','Beranda',1],['book-open','Kursus',0],['mic','Latihan',0],['user','Profil',0]]){
 const t=F(tb,'Tab / '+l,{width:'fill',height:48,gap:2,justify:'center',align:'center',radius:16,fills:fill(on?C.tint:C.bg)});
 I(t,ic,24,on?C.acc:C.t3); T(t,'Label',l,'tab',{color:on?C.acc:C.t3});
}
const hm=Row(b,'Home indicator',{position:'absolute',x:0,y:810,width:390,height:34,justify:'center'});
add(hm,{type:'rect',name:'Garis',width:134,height:5,radius:9999,fills:fill(C.t1)});
b
```
