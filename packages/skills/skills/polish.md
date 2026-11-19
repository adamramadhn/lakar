# Lakar: polesan

Dibaca di giliran yang sama dengan `core` dan skill jenis layar (paralel). Tidak menambah execute: terapkan sejak execute pertama; warning sisa diperbaiki sekaligus di execute perbaikan akhir, bukan satu per satu.

## Struktur dan jarak

- Row berisi teks + badge/ikon/tombol: kolom teks `width:'fill'` (teks panjang di dalamnya juga `width:'fill'` agar dibungkus, bukan meluap: `LC-02b`); badge, ikon, tombol hug atau ukuran tetap.
- Gap antar-saudara ≥ 8 (`LC-23`). Inset teks di wadah ber-fill/garis ≥ 8 (kartu 12–24), pill ≥ 6 kiri-kanan.
- Judul + isinya satu kelompok (gap 8–16); jeda antarkelompok ≥ 2× jarak di dalamnya, jadi ruang di atas judul > ruang judul ke isi (`LC-26`). Kolom bergap seragam berisi kartu, judul, daftar = belum dikelompokkan.
- Satu tepi kiri bersama per permukaan; selisih 1–4 px terbaca sebagai salah.
- Padding simetris; tombol berikon: sisi ikon 2 px lebih kecil.
- Kepadatan berbeda per zona: kontrol rapat, konten lega.
- Elemen menumpuk/beririsan hanya di `Overlay /`; saudara lain tidak beririsan (`LC-11`).
- Tanpa potongan/luberan: kartu berteks tinggi `hug` (baris kartu `align:'stretch'`), lebar isi bar = persen × lebar induk.

## Komponen

- Badge `sm` (20) default di baris, daftar, tabel, meta; `md` (24) hanya di samping judul ≥ 18 atau di header kartu. Tinggi badge ≤ line-height teks terbesar di barisnya, teksnya lebih kecil dari teks itu, satu baris (`LC-24`).
- Kartu tidak di dalam kartu bergaris/berbayang (`LC-18`): isi kartu = baris atau bidang tint tanpa garis dan bayangan; judul seksi di luar kartu.
- Radius konsentris untuk anak ber-cat yang menempel di sudut padding: luar = dalam + padding, dalam ≥ 6 (`LC-25`); mis. baris radius 20 + padding 12 → wadah ikon 8. Pill dan lingkaran bebas.
- Satu strategi kedalaman per board: garis, bayangan, atau tonal.
- Bayangan berlapis, semua jatuh ke bawah: cincin 1 px alpha rendah (`spread:1`, blur 0) + 2–3 lapis dengan blur makin besar dan alpha makin kecil. Tanpa glow berwarna tanpa offset.
- Foto konten diberi garis dalam 1 px `#0000001A` (terang) atau `#FFFFFF1A` (gelap); logo tidak.
- Kartu fitur: kartu → panel → fragmen produk; panel mengisi 60–65% bagian bawah dan terpotong tepi kartu (`Crop /`).
- Sederet kartu satu tinggi (`align:'stretch'`).

## Tipografi

- ±5 ukuran (maks 6 per board, `LC-27`) dan 2–3 bobot. Lompatan antarperan ≥ 1,2× (mobile) atau ≥ 1,25× (desktop). Satu ukuran per jenis elemen.
- Baris 45–75 karakter (`LC-28`): 16 px → lebar 520–640, 18 px → 580–700.
- Paragraf ≥ 3 baris: line-height ≥ 1,4× ukuran.
- Tracking −0,01 sampai −0,02 em untuk ≥ 24 px; +0,05 sampai +0,08 em untuk huruf kapital ≤ 14 px.
- Bobot < 400 hanya untuk ≥ 28 px (`LC-29`). Teks terang di latar gelap: line-height sedikit lebih longgar dan bobot naik satu tingkat.
- `numeric:'tabular'` untuk harga, jam, hitungan, kolom angka.
- Tanda baca (`LC-30`): rentang memakai en dash (`09.00–10.00`, `5–10`), elipsis `…`, kutip lengkung “…” pada testimoni, spasi tak-putus ` ` antara angka dan satuan agar tidak terpisah.
- Judul dan paragraf tidak berakhir satu kata sendirian. Headline tanpa satu kata berwarna/tebal (paling banyak sekali per halaman).

## Warna dan kontras

- Kontras dihitung setelah komposit (`LC-04`, error): ≥ 4,5:1 teks biasa; ≥ 3:1 teks ≥ 24 (atau ≥ 19 tebal), ikon, dan tepi field. Tint = aksen ber-alpha di atas latarnya; teks dinilai terhadap hasil campurannya.
- Di bidang tint atau `field`, teks sekunder `t2`, bukan `t3`. Teks badge bernada gelap (prelude). `acc2`, kuning, oranye, amber bukan warna teks kecil: pakai untuk ikon atau bidang.
- Tidak ada teks abu di atas permukaan berwarna: teks sekunder = turunan hue permukaan itu, hex eksplisit, bukan alpha.
- Aksen ±10% luas board: aksi, pilihan, fokus; bukan judul atau deretan ikon.
- Merah hanya untuk error dan aksi destruktif. Hue status berjarak ≥ 15° dari hue aksen.

## Kekayaan informasi

- Metrik dengan ekspresi beragam: angka besar, stat inline, sparkline, gauge, badge delta. Hindari tiga kotak kembar "ikon + angka besar + label".
- Angka utama yang berubah dari waktu ke waktu menampilkan riwayat kecil dengan titik perubahan.
- Layar kerja memuat satu keadaan yang layak dilihat: peringatan, terdegradasi, atau kosong.
- Buktikan, jangan klaim: fragmen produk sedang bekerja dengan data demo lengkap. Hero landing memperagakan aksi kategori (field pencarian, pemilih slot), bukan hanya tombol. Bukti diletakkan di sebelah klaimnya.
- Field kosong dihilangkan, bukan diisi "—". Angka dan tanggal tidak dipotong.
- Pencarian foto gagal: pengganti tampak selesai (hero: mockup produk/kartu data; sampul: bidang cerah + tipografi tebal), bukan label "Foto …", inisial di area besar, atau ilustrasi rakitan ikon/bentuk.

## Tanda slop

Teks bergradien; garis aksen di sisi kartu > 1 px; glow tanpa offset; label 01/02/03 yang bukan urutan sungguhan; overline di setiap seksi; pola "bukan X, melainkan Y" dan "X. Y."; strip 3–4 angka di bawah hero; kata kebajikan (jujur, tenang, benar-benar, sederhana); semua kartu sama panjang; set nama stok; "·" lebih dari 2 per baris; nama yang sama ≥ 3× dalam satu kartu.

Frasa terlarang (kata utuh): "solusi terbaik", "revolusioner", "tingkatkan produktivitas", "pelajari lebih lanjut", "klik di sini", "lorem ipsum", "judul fitur", "learn more", "click here", "unlock", "seamless", "next-level", "game changer", "empower your".

## Kritik diri (di screenshot akhir)

- Buram: hierarki masih terbaca bila gambar dikaburkan?
- Kerangka: tanpa teks, struktur masih bercerita?
- Tukar: terlihat sama dengan template biasa? Ubah satu hal khas produk.

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
