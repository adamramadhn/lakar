# Lakar: interface

Kaya informasi, miskin hiasan: buang ornamen tanpa fungsi; konteks angka, keadaan, dan metadata adalah isi.

## Angka dan data

- Angka kunci punya pembanding: sasaran, periode lalu, sisa, atau satuan (`3,1 dari 12 kg`, `+8,6% vs periode lalu`). Arah perubahan = warna status + ikon `trending-up`/`trending-down`.
- Metrik dengan ekspresi beragam: angka besar, stat inline, sparkline, gauge, badge delta. Hindari tiga kotak kembar "ikon + angka besar + label".
- Angka utama yang berubah dari waktu ke waktu menampilkan riwayat kecil dengan titik perubahan.
- Seri data (ring, bar, segmen): satu nada `C.data` per seri, titik legenda bernada sama.
- Field kosong dihilangkan, bukan diisi "—". Angka dan tanggal tidak dipotong.

## Keadaan

- Daftar memperlihatkan keadaan: selesai (muted + `circle-check`), sedang/berikutnya (disorot: bidang/border aksen + badge), mendatang (biasa), terkunci/kritis (`lock` atau badge warning/danger). Tiap butir bermetadata kecil.
- Layar kerja memuat satu keadaan yang layak dilihat: peringatan, terdegradasi, atau kosong.

## Bukti

- Buktikan, jangan klaim: fragmen produk sedang bekerja dengan data demo lengkap. Hero landing memperagakan aksi kategori (field pencarian, pemilih slot), bukan hanya tombol. Bukti diletakkan di sebelah klaimnya.
- Koleksi (tile, kategori, sampul): foto bila ada; tanpa foto, satu hue per kategori (4–6 hue serasi, terang/jenuh setara, teks kontras), bukan gradasi satu hue, abu kusam, atau neon acak. Palet kategori = satu peran.
- Pencarian foto gagal: pengganti tampak selesai (hero: mockup produk/kartu data; sampul: bidang cerah + tipografi tebal), bukan label "Foto …", inisial di area besar, atau ilustrasi rakitan ikon/bentuk.
