# Lakar: layout

Struktur, jarak, dan geometri semua jenis layar. Terapkan di execute pertama; warning spacing sisa ikut execute perbaikan.

## Geometri

Hitung sekali sebelum menaruh deret lebar tetap: sisa = lebar isi − padding − gap × (n − 1); tidak muat → kurangi kolom atau jadikan `width:'fill'` (visual samping: `width:'fill'` + `maxWidth`), dan isi lebar tetap di kartu (bar, grafik, mockup, deret chip) ≤ lebar isi kartu, sisanya `width:'fill'`.

## Proximity

| Relasi | Landing | Web app | Mobile |
|---|---|---|---|
| Ikon ↔ teks, label ↔ nilai | 4–8 | 4–8 | 4–8 |
| Item dalam grup (baris list, field) | 12–16 | 12–16 | 12–16 |
| Antar-grup / antar-kartu | 24 | 16–24 | 12–16 |
| Judul seksi ↔ isi | 32–48 | 16–24 | 12–16 |
| Antar-seksi | 96–128 | 24–32 | 24–32 |

Judul + isinya satu frame kelompok; kolom bergap seragam berisi kartu, judul, dan daftar = belum dikelompokkan. Kontrol rapat, konten lega.

## Struktur

- Row teks + badge/ikon/tombol: kolom teks `width:'fill'` (teks panjang di dalamnya juga `width:'fill'`), sisanya hug atau tetap.
- Satu tepi kiri bersama per permukaan. Padding simetris, bawah = atas (kecuali inset home indicator 34); tombol berikon: sisi ikon 2 lebih kecil. Inset teks di wadah ber-cat ≥ 8 (kartu 12–24, pill 6).
- Menumpuk hanya di `Overlay /`. Kartu berteks tinggi `hug`; sederet kartu satu tinggi (`align:'stretch'`); lebar isi bar = persen × lebar induk.
- `space-between`/anak `fill` membagi sisa ruang; wadah hug tanpa sisa → beri ukuran. Rantai `fill`: tiap wadah perantara juga `fill`.
- Ukuran meleset → perbaiki sizing wadah penyebab; jangan tinggi tebakan, `clip`, atau saudara absolut manual.

## Radius

Maks tiga nilai per board (pill/lingkaran bebas). Anak ber-cat di sudut padding: dalam = luar − padding, min 6 (20 − 12 → 8); tidak cukup → anak tanpa radius atau tanpa cat.
