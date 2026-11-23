# Lakar: ui

## Kontrol

- Tombol primer 48 (toolbar 40); sekunder outline/latar sub; ghost teks aksen. IconButton 44 (desktop 40) dan chip 32, radius full.
- `Badge` sm default (baris, daftar, tabel, meta); md hanya di samping judul ≥ 18 atau header kartu. Di permukaan gelap pada board terang: arg ke-6 = warna permukaan (mis. `C.deep`).
- Wadah ikon: tint + ikon aksen, atau solid aksen + ikon `C.on` (ditekankan). Avatar 32/40/48 = foto orang (inisial cadangan kecil). Logo: wadah 32 aksen + ikon + wordmark h4, bukan path.

## Form

Label di atas field (`label`, gap 8); `Input /` 48 radius 8; placeholder `t3`; bantuan `body-sm` `t2` di bawah; antar-field 16. Error = garis danger + `circle-exclamation-point` + pesan `body-sm` danger di bawah.

## Kartu dan kedalaman

- Kartu: padding 24 (mobile 16), radius 12, border; header boleh memuat `Badge` metrik. Isi kartu = baris atau bidang tint, bukan kartu lagi; judul seksi di luar kartu.
- Satu kepribadian per board: radius, kepadatan, dan satu kedalaman (garis, bayangan, atau tonal); alat harian tegas, konsumen lunak. Bayangan berlapis jatuh ke bawah: cincin 1 px alpha rendah (`spread:1`) + 2–3 lapis blur makin besar, alpha makin kecil.
- Kartu fitur: kartu → panel → fragmen produk; panel mengisi 60–65% bawah dan terpotong tepi kartu (`Crop /`).

## Tabel

Header 40 (`caption` `t3` di `sub`), baris 56 (padat 44) bergaris bawah. Tiap sel = frame (lebar tetap atau `width:'fill'`) berisi teksnya, lebar kolom sama di header dan baris; angka rata kanan, tabular.

## Foto

- Wajib untuk isi nyata (orang, tempat, makanan, produk, media) di hero, sampul, kartu konten, thumbnail, avatar; bukan untuk ikon fitur. Kueri 2–3 kata benda Inggris yang visual (`coffee beans bag`; orang = `<peran> portrait`). Pilih dari pratinjau: subjek jelas, berwarna, kontemporer, beda per butir.
- `const p=photo('<ref>')` (literal) → `fills:[{type:'image',assetId:p.assetId,fit:'cover'}]` pada `Image / …` berukuran tetap; maks 6 foto baru per execute; kredit hanya di ringkasan. Foto konten bergaris dalam 1 px `#0000001A` (terang) / `#FFFFFF1A` (gelap); logo tidak.

## Contoh teruji

Baris daftar berkeadaan: kolom teks fill, meta `t2` di bidang tint, `Badge` sm, wadah ikon konsentris (radius 20 = 8 + padding 12); `Badge` di permukaan `C.deep` memakai arg ke-6:

```js
// pakai prelude
const p=place(390,334);
const b=add(null,{type:'board',name:'Contoh / Pinjaman · mobile · Jernih',x:p.x,y:p.y,width:390,height:334,screen:'mobile',expectedSize:{width:390,height:334},fills:fill(C.bg)});
const list=F(b,'Daftar pinjaman',{width:'fill',padding:20,gap:8});
for(const [ic,j,m,st,tone] of [['book-open','Laut Bercerita','Kembali 21 Nov · sisa 3 hari','Dipinjam','accent'],['clock','Cantik Itu Luka','Terlambat 2 hari · denda Rp 4.000','Terlambat','danger'],['circle-check','Bumi Manusia','Dikembalikan 9 Nov','Selesai','success']]){
 const hot=tone==='accent';
 const r=Row(list,'Item / '+j,{width:'fill',gap:12,padding:12,radius:20,fills:fill(hot?C.tint:C.bg),stroke:line(hot?C.acc:C.line)});
 const w=Row(r,'Ikon',{width:40,height:40,radius:8,justify:'center',fills:fill(hot?C.acc:C.sub)}); I(w,ic,20,hot?C.on:C.t2);
 const tx=F(r,'Teks',{width:'fill',gap:2});
 T(tx,'Judul',j,'label',{width:'fill'}); T(tx,'Meta',m,'body-sm',{width:'fill',color:C.t2});
 Badge(r,st,tone);
}
const hl=Row(list,'Sorotan / Anggota',{width:'fill',gap:12,padding:16,radius:20,fills:fill(C.deep)});
T(hl,'Teks','Anggota aktif sampai Mar 2027','label',{width:'fill',color:C.on});
Badge(hl,'Premium','accent','star','sm',C.deep);
b
```
