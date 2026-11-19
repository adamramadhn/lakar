# Lakar: accessibility

Ambang WCAG 2.2 AA. Kontras dihitung setelah komposit (`LC-04`); teks di tint/efek dinilai terhadap campuran terburuk di bawahnya.

## Kontras

- Teks biasa ≥ 4,5:1. Teks besar (≥ 24, atau ≥ 18,66 dengan bobot 700) ≥ 3:1.
- Batas kontrol (`Input /`, `Radio /`, `Checkbox /`) ≥ 3:1: garis `#7D8798` di latar terang, `#646B78` di latar gelap; `C.line2` hanya untuk tombol sekunder.
- Ikon tanpa label teks ≥ 3:1 terhadap latar. Ikon bersebelahan dengan teks yang menjelaskannya dianggap berlabel.
- Rating = bintang + nilai teks di baris yang sama (`4,8 · 1.284 ulasan`); bintang `star` `filled:true` warna `acc2`.
- `acc2`, kuning, oranye, amber bukan warna teks kecil: pakai untuk ikon berlabel atau bidang. Teks badge bernada gelap (prelude).
- Teks di atas foto, gradien, atau efek: scrim fill solid dengan alpha ≥ 0,5 di antara gambar dan teks (lapisan gelap di foto, elips peredam di efek: `color`).

## Ukuran dan target

- Minimum: teks 12 (caption); paragraf 16 di landing dan mobile, 14 di app dan di dalam kartu.
- Target sentuh mobile ≥ 44 × 44, jarak ≥ 8. `Link /` teks di mobile = frame tinggi 44 (`justify:'center'`) berisi teks, bukan teks lepas.

## Makna

- Status tidak hanya warna: selalu dengan teks atau ikon (`circle-check`, `triangle-exclamation-point`, `lock`).
