# Lakar: color

## Peran warna

- Aksen = aksi utama, state aktif, tautan, seri utama; ±10% luas board, bukan judul atau deretan ikon.
- Peran sah lain: bidang merek `field` (tint muda) atau `deep` (aksen tua) untuk latar seksi/kartu sorotan, bukan abu polos; satu pendamping `acc2` dengan satu makna tetap (pencapaian, rating, kategori); status untuk arah dan keadaan. Pendamping dan status muncul ≥ 2 kali dengan makna sama.
- Maks 2 hue non-status di luar palet kategori. Merah hanya error dan aksi destruktif; hue status ≥ 15° dari hue aksen.
- Di tint/`field`, teks sekunder `t2`. Di permukaan berwarna lain, teks sekunder = turunan hue permukaan (hex eksplisit, bukan alpha), bukan abu.

## Bidang efek

Hanya bila permintaan/merek meminta suasana ekspresif; ≤ 1 per board/layar, di fokus merek; selain itu bidang merek polos. Lapis: `fills` netral → `mesh` (aksen, ≤ 1 pendamping, netral) → struktur bermakna yang berulang dan melintasi bidang (gelombang `path` dari loop, kontur/cincin, kisi/partikel; alpha bertingkat ±6–50%, 1–2 garis tegas) → `noise` 0.04–0.08 → di latar gelap boleh satu cahaya merek di balik fokus (blur ≥ 40, opacity ≤ 35%), bukan di tombol.

Teks di zona tenang: struktur merunduk di sana, lalu **elips peredam** sebagai anak terakhir `Crop /` efek: `ellipse` fill warna latar bidang + alpha `B3`–`E6`, blur 32–64, menutup keempat sudut setiap kotak teks. Alternatif dan cuplikan produk: panel solid.
