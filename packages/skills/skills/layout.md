# Lakar: layout

Struktur, jarak, dan geometri untuk semua jenis layar. Terapkan sejak execute pertama; warning spacing yang tersisa dibereskan sekaligus di execute perbaikan, tanpa execute tambahan.

## Hitung sebelum menaruh

- Sebelum menaruh n elemen lebar tetap sebaris: sisa = lebar isi induk − padding kiri/kanan − gap × (n − 1). Jumlah lebar tetap > sisa → kurangi kolom, kecilkan gap, atau jadikan satu kolom `width:'fill'`; jangan biarkan flex memeras teks.
- Visual samping (foto, mockup, kartu data di sebelah teks) = `width:'fill'` + `maxWidth`, bukan lebar tetap yang mendorong teks keluar.
- Padding bawah wadah = padding atas (kecuali inset home indicator 34).

## Proximity

| Relasi | Landing | Web app | Mobile |
|---|---|---|---|
| Ikon ↔ teks, label ↔ nilai | 4–8 | 4–8 | 4–8 |
| Item dalam grup (baris list, field) | 12–16 | 12–16 | 12–16 |
| Antar-grup / antar-kartu | 24 | 16–24 | 12–16 |
| Judul seksi ↔ isi | 32–48 | 16–24 | 12–16 |
| Antar-seksi | 96–128 | 24–32 | 24–32 |

- Judul + isinya satu kelompok; jeda antarkelompok ≥ 2× jarak di dalamnya: ruang di atas judul > judul ke isi (`LC-26`). Kolom bergap seragam berisi kartu, judul, daftar = belum dikelompokkan.
- Gap antar-saudara ≥ 8 (`LC-23`). Inset teks di wadah ber-fill/garis ≥ 8 (kartu 12–24), pill ≥ 6 kiri-kanan.
- Kepadatan berbeda per zona: kontrol rapat, konten lega.

## Struktur

- Row berisi teks + badge/ikon/tombol: kolom teks `width:'fill'` (teks panjang di dalamnya juga `width:'fill'` agar dibungkus: `LC-02b`); badge, ikon, tombol hug atau ukuran tetap.
- Satu tepi kiri bersama per permukaan; selisih 1–4 px terbaca sebagai salah.
- Padding simetris; tombol berikon: sisi ikon 2 px lebih kecil.
- Elemen menumpuk/beririsan hanya di `Overlay /`; saudara lain tidak beririsan (`LC-11`).
- Tanpa potongan/luberan: kartu berteks tinggi `hug`, sederet kartu satu tinggi (baris `align:'stretch'`), lebar isi bar = persen × lebar induk.

## Radius

- Maks tiga nilai radius per board (pill dan lingkaran tidak dihitung).
- Konsentris untuk anak ber-cat yang menempel di sudut padding: luar = dalam + padding, dalam ≥ 6 (`LC-25`); mis. baris radius 20 + padding 12 → wadah ikon 8. Pill dan lingkaran bebas.
