# Lakar: color

## Peran warna

- Aksen = aksi utama, state aktif, tautan, seri utama; ±10% luas board (aksi, pilihan, fokus), bukan judul atau deretan ikon.
- Peran sah lain: (1) **bidang merek** `field` (tint muda) atau `deep` (aksen tua) untuk latar seksi/kartu sorotan, bukan abu polos; (2) **satu pendamping** `acc2`, satu makna tetap (pencapaian, rating, kategori); (3) **status** untuk arah dan keadaan. Pendamping dan status masing-masing muncul ≥ 2 kali dengan makna sama (sekali = acak).
- Tiap warna non-netral bermakna; maks 2 hue non-status di luar palet kategori.
- Merah hanya untuk error dan aksi destruktif. Hue status berjarak ≥ 15° dari hue aksen.

## Teks di permukaan berwarna

- Di bidang tint atau `field`, teks sekunder `t2`, bukan `t3`.
- Tidak ada teks abu di atas permukaan berwarna: teks sekunder = turunan hue permukaan itu, hex eksplisit, bukan alpha.

## Bidang efek

Hanya bila permintaan/merek meminta suasana ekspresif; ≤ 1 bidang per board/layar, di fokus merek. Tanpa permintaan itu: bidang merek polos. Lapis berurutan:

1. `fills` netral → `mesh` dari aksen, ≤ 1 pendamping, netral.
2. **Struktur** bermakna bagi merek dan berulang, melintasi bidang (gelombang/aliran `path` dari loop, kontur/cincin konsentris, kisi/partikel; alpha bertingkat ±6–50%, 1–2 garis tegas); sapuan kecil di pojok terbaca datar.
3. `noise` 0.04–0.08.
4. Latar gelap: boleh satu cahaya lembut merek di balik fokus (blur ≥ 40, opacity ≤ 35%), bukan di tombol.

Teks dan tombol di zona tenang: struktur merunduk/menipis di sana, lalu satu **elips peredam** sebagai anak terakhir `Crop /` efek (di bawah teks): `ellipse` fill solid warna latar bidang dengan alpha `B3`–`E6` (struktur tetap samar), blur 32–64, cukup besar sampai keempat sudut setiap kotak teks di bidang itu ada di dalam elips. Alternatif: panel solid. Cuplikan produk = panel solid.
