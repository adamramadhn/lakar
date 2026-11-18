# Lakar: ikon

## Aturan

- Ikon selalu node `icon`: `add(p, {type:'icon', lib:'lucide', icon:'arrow-right', size:20, color})`. Nama ikon di field `icon`; `name` adalah nama layer (default `Icon / <lib> / <icon>`).
- **lucide** untuk semua ikon UI. **simple-icons** khusus logo brand (tautan sosial, integrasi): `{lib:'simple-icons', icon:'whatsapp'}`, warna default = warna brand. Satu pustaka ikon UI per board.
- Ukuran 16 / 20 / 24 / 32, stroke 2 (default). Warna mengikuti teks di sebelahnya, atau aksen untuk state aktif. Ikon dalam wadah: 24 di wadah tint 48 (fitur landing), 20 di wadah 40 (list mobile).
- Bintang rating: `{icon:'star', filled:true}`; bintang kosong terbaca nol. Tanda centang di daftar fitur: `check`.
- Logo pembayaran lokal (QRIS, GoPay, OVO, DANA): teks atau badge teks; jangan digambar ulang dari path.
- Tidak yakin nama? `iconSearch('kata kunci', {lib:'lucide', limit:5})` di snippet atau tool `icon_search`. Nama salah → ICON_UNKNOWN + 3 saran; pilih salah satu, jangan beralih ke emoji/simbol.

## Konsep → nama kanonik lucide (terpasang)

| Konsep | lucide |
|---|---|
| beranda | `house` |
| cari | `search` |
| notifikasi | `bell` |
| profil / akun | `user` |
| pengguna / tim | `users` |
| foto profil kosong | `circle-user` |
| tambah anggota | `user-plus` |
| pengaturan | `settings` |
| menu | `menu` |
| lainnya (horizontal) | `ellipsis` |
| lainnya (vertikal) | `ellipsis-vertical` |
| tutup | `x` |
| tambah | `plus` |
| kurang | `minus` |
| centang / fitur termasuk | `check` |
| selesai / sukses | `circle-check` |
| daftar tugas | `list-checks` |
| kembali | `arrow-left` |
| lanjut | `arrow-right` |
| tautan keluar | `arrow-up-right` |
| buka di tab baru | `external-link` |
| chevron kanan | `chevron-right` |
| chevron kiri | `chevron-left` |
| buka pilihan | `chevron-down` |
| keluar akun | `log-out` |
| tanggal | `calendar` |
| jam | `clock` |
| durasi / hitung mundur | `timer` |
| riwayat | `rotate-ccw-clock` |
| lokasi | `map-pin` |
| navigasi | `navigation` |
| telepon | `phone` |
| email | `mail` |
| chat | `message-circle` |
| kirim | `send` |
| bagikan | `share-2` |
| favorit | `heart` |
| rating | `star` |
| simpan | `bookmark` |
| suka | `thumbs-up` |
| keranjang | `shopping-cart` |
| belanja | `shopping-bag` |
| kartu | `credit-card` |
| dompet / saldo | `wallet` |
| struk / tagihan | `receipt` |
| uang tunai | `banknote` |
| harga / label | `tag` |
| diskon | `percent` |
| hadiah | `gift` |
| pengiriman | `truck` |
| paket | `package` |
| toko | `store` |
| kode QR | `qr-code` |
| pindai | `scan-line` |
| grafik batang | `chart-column` |
| grafik garis | `chart-line` |
| grafik lingkaran | `chart-pie` |
| naik | `trending-up` |
| turun | `trending-down` |
| dasbor | `layout-dashboard` |
| daftar | `list` |
| grid | `layout-grid` |
| tabel | `table` |
| dokumen | `file-text` |
| folder | `folder` |
| unduh | `download` |
| unggah | `upload` |
| gambar | `image` |
| kamera | `camera` |
| video | `video` |
| putar | `play` |
| jeda | `pause` |
| mikrofon / latihan bicara | `mic` |
| audio / menyimak | `headphones` |
| materi / kursus | `book-open` |
| pendidikan | `graduation-cap` |
| ide | `lightbulb` |
| otomatis / AI | `sparkles` |
| cepat / energi | `zap` |
| streak / panas | `flame` |
| target | `target` |
| juara / pencapaian | `trophy` |
| penghargaan | `award` |
| aman / terverifikasi | `shield-check` |
| terkunci | `lock` |
| lihat | `eye` |
| sembunyikan | `eye-off` |
| filter | `funnel` |
| atur | `sliders-horizontal` |
| urutkan | `arrow-up-down` |
| muat ulang | `refresh-cw` |
| ubah | `pen` |
| hapus | `trash` |
| salin | `copy` |
| tautan | `link` |
| bahasa / web | `globe` |
| mode terang | `sun` |
| mode gelap | `moon` |
| wifi | `wifi` |
| sinyal | `signal` |
| baterai | `battery-full` |
| info | `info` |
| peringatan error | `circle-exclamation-point` |
| peringatan | `triangle-exclamation-point` |
| gagal | `circle-x` |
| bantuan | `circle-question-mark` |
| kopi | `coffee` |
| makanan | `utensils` |
| kesehatan | `stethoscope` |
| obat | `pill` |
| kebugaran | `dumbbell` |
| penginapan | `bed` |
| mobil | `car` |
| penerbangan | `plane` |
| gedung / kantor | `building-complex` |
| kerja | `briefcase` |
| terverifikasi | `badge-check` |

## Alias lama → kanonik

Alias tetap diterima dan disimpan sebagai nama kanonik, tetapi tulis nama kanonik langsung.

| Alias | Kanonik |
|---|---|
| `home` | `house` |
| `more-horizontal` | `ellipsis` |
| `more-vertical` | `ellipsis-vertical` |
| `alert-circle`, `circle-alert` | `circle-exclamation-point` |
| `alert-triangle` | `triangle-exclamation-point` |
| `help-circle` | `circle-question-mark` |
| `x-circle` | `circle-x` |
| `check-circle-2` | `circle-check` |
| `user-circle` | `circle-user` |
| `filter` | `funnel` |
| `trash-2` | `trash` |
| `edit` | `square-pen` |
| `line-chart` | `chart-line` |
| `pie-chart` | `chart-pie` |
| `history` | `rotate-ccw-clock` |
| `building-2` | `building-complex` |

## Logo brand (simple-icons)

`whatsapp`, `instagram`, `facebook`, `x`, `tiktok`, `youtube`, `telegram`, `github`, `figma`, `spotify`, `gmail`, `googlemaps`, `shopee`. LinkedIn tidak tersedia: pakai teks.

```js
const b = add(null, {type:'board', name:'Ikon / Contoh · mobile · Jernih', x:0, y:0, width:390, height:844, screen:'mobile'});
const row = add(b, {type:'frame', name:'Baris ikon', layout:'row', gap:16, padding:20, align:'center'});
const box = add(row, {type:'frame', name:'Wadah ikon', layout:'row', width:48, height:48, radius:12, justify:'center', align:'center', fills:[{type:'solid', color:'#0F766E14'}]});
add(box, {type:'icon', lib:'lucide', icon:'truck', size:24, color:'#0F766E'});
for (let i = 0; i < 5; i++) add(row, {type:'icon', name:'Bintang '+(i+1), lib:'lucide', icon:'star', size:16, color:'#F5B700', filled:true});
add(row, {type:'icon', lib:'simple-icons', icon:'whatsapp', size:24});
const [m] = iconSearch('receipt', {lib:'lucide', limit:1});
add(row, {type:'icon', lib:m.lib, icon:m.icon, size:20, color:'#475467'});
```
