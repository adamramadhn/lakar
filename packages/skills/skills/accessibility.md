# Lakar: accessibility

WCAG 2.2 AA; kontras dihitung sesudah komposit, terhadap campuran terburuk di bawah teks (`check` melaporkan rasionya).

- Batas kontrol (`Input /`, `Radio /`, `Checkbox /`): garis `#7D8798` di latar terang, `#646B78` di gelap; `C.line2` hanya tombol sekunder.
- Ikon tanpa label teks ≥ 3:1; ikon di samping teks penjelasnya dianggap berlabel.
- Rating = bintang `star` `filled:true` warna `acc2` + nilai teks sebaris (`4,8 · 1.284 ulasan`).
- `acc2`, kuning, oranye, amber bukan warna teks kecil: untuk ikon berlabel atau bidang.
- Teks di atas foto/gradien/efek: scrim fill solid alpha ≥ 0,5 di antara gambar dan teks (lapisan gelap di foto; elips peredam di efek).
- Paragraf 16 di landing dan mobile, 14 di app dan di dalam kartu. Mobile: target ≥ 44 × 44, jarak ≥ 8; `Link /` teks = frame tinggi 44 (`justify:'center'`) berisi teks.
- Status tidak hanya warna: plus teks atau ikon (`circle-check`, `triangle-exclamation-point`, `lock`).
