# Lakar: break-ui

Opsional, di langkah review atau atas permintaan ("uji data terburuk", "cari edge case", "coba nama panjang"). Desain yang rapi dengan data contoh sering pecah dengan data nyata. Tugasnya satu: isi salinan board dengan data terburuk yang masuk akal, lalu laporkan apa yang pecah beserta perbaikannya. Tidak mendesain ulang (itu `variants`) dan tidak menilai selera (itu `review`).

## Aturan

1. Masuk akal, bukan acak. `aaaaaaaa…` dan nama 5.000 huruf tidak membuktikan apa pun. Pakai nilai yang benar-benar dihasilkan pengguna, atau batas dari permintaan atau brief.
2. Ubah data, bukan komponen. Di salinan hanya `content` teks dan jumlah butir yang berubah; ukuran, layout, dan warna tetap. Board sumber tidak disentuh.
3. Satu set, banyak kegagalan. Sebar ke baris berbeda: baris 1 nama panjang, baris 2 email panjang, baris 3 nama satu huruf.
4. Lapor dulu, perbaiki bila diminta. Sebagian temuan adalah keputusan desain (bungkus atau potong?).
5. Hanya aksara font terpasang (Latin + diakritik). Emoji (LC-01a) dan CJK/Arab (FONT_MISSING) tidak bisa diuji: tulis "tidak diuji".
6. Mode tema: dokumen ber-≥ 2 mode (`getTokens().modes`) → salinan (Alur 2) per mode lain, hanya `themeMode` beda; cek geometri, bukan hanya warna.
7. Master: instance salinan ikut master sumber → nilai terburuk lewat `props` instance; perbaikan di master mengenai semua instance, cek ulang setiap board pemakainya.

## Alur

1. **Peta.** `find({type:'text', within:board})` lalu catat teks yang berasal dari data: nama, email, peran, angka, hitungan, tanggal, label badge dan tombol, isi daftar (panjang daftar juga nilai).
2. **Salinan.** Satu execute: `const s=get(board), p=place(s.width,s.height,{near:board})`, lalu `duplicate(board,{name:'<nama> · Kasus terburuk', x:p.x, y:p.y})`. Isi teks salinan lewat `update(id,{content})` (cari node lewat `find({name, within:salinan})`). Daftar: satu salinan lagi untuk **Kosong** (butir dihapus, keadaan kosong tampil) bila daftar bisa kosong, dan **Satu** (satu butir, hitungan tepat 1).
3. **Pecahkan.** Baca `check` respons (LC-02a/b/c, LC-03, LC-11, LC-31 = pecah; `LC-12` tinggi pas di salinan bukan temuan, tinggi salinan sengaja sama dengan sumber), lalu `screenshot` salinan + zoom `scale:2` di baris terpadat.
4. **Lapor dan berhenti.** Tabel di bawah. Board salinan tetap ada sebagai uji regresi sampai pengguna memintanya dihapus.
5. **Perbaiki bila diminta** ("perbaiki semua", "perbaiki 1, 3"): ubah board sumber, ulangi perbaikan yang sama di salinan, pastikan keduanya bersih.

## Nilai terburuk

| Jenis | Nilai | Yang biasanya pecah |
|---|---|---|
| Nama panjang | `Raden Ajeng Siti Nurhaliza Kusumawardhani` | baris tunggal meluber, inisial |
| Nama tunggal/pendek | `Sukarno`, `Jo`, `J` | kolom kosong, inisial satu huruf |
| Gelar | `Prof. Dr. Ir. Bambang Hartono, M.Sc.` | titik dan koma memotong baris |
| Email | `bartholomew.fitzgerald@northwind-industries-holdings.example.com` | tanpa spasi: mendorong saudara keluar |
| Jabatan | `Senior Product Design Engineer, Platform Infrastructure` | slot sekunder tiga baris |
| Badge | `Menunggu verifikasi dokumen` | badge memanjang, judul terdesak |
| Uang | `Rp 1.250.000.000`, `−Rp 48.500` | kolom angka sempit |
| Hitungan | `0`, `1`, `1.284`, `99+` | keadaan kosong, tunggal, pemisah ribuan |
| Tanggal | `Rabu, 30 September 2026 · 23.59 WIB` | meta satu baris |
| Field opsional | kosong | baris yatim atau `—` sisa |
| Copy Inggris | `Notification settings`, `1 members` | label memanjang, jamak salah |

## Tanda dan perbaikan

| Yang terlihat | Sebab | Perbaikan |
|---|---|---|
| Teks satu baris meluber (LC-02b/LC-03) | teks tanpa `width` (tidak dibungkus) | `width:'fill'`, atau potong isinya dengan "…" |
| Aksi di ujung baris terdorong atau terpotong | kolom tengah hug atau lebar tetap | kolom teks `width:'fill'`, aksi lebar tetap |
| Badge memanjang mendesak judul | dua-duanya hug | putuskan yang mengalah: judul `fill`, badge hug |
| Avatar atau ikon melayang di tengah nama tiga baris | baris `align:'center'` | `align:'start'` bila teks bisa membungkus |
| Baris terakhir terpotong di kartu (LC-31/LC-02a) | tinggi kartu tetap | tinggi ikut isi, atau `Scroll /` yang disengaja |
| Kartu grid tak sama tinggi | panjang deskripsi beda | regang (`align:'stretch'`), isi dipotong ke 2 baris |
| Angka tak sejajar | proporsional | `numeric:'tabular'`, kolom lebar tetap rata kanan |
| Tombol pecah dengan label panjang | lebar tetap | lebar dari padding (hug) + `minWidth` |
| Diakritik terpotong | lineHeight terlalu rapat | lineHeight token `TY` |

**Bungkus, potong, atau batasi** per field, bukan global. Bungkus nilai yang dipakai mengenali sesuatu (nama, judul di detail). Potong di akhir untuk meta sekunder (peran, cuplikan pesan). Potong di tengah bila nilai berbeda di ujung (nama file, email berdomain sama). Batasi 2 baris untuk cuplikan di kartu. Angka, harga, dan tanggal tidak pernah dipotong. Model dokumen tidak punya ellipsis otomatis: tulis isi terpotong dengan "…" dan sebut aturannya di laporan.

## Laporan

```text
| # | Tingkat | Node | Nilai terburuk | Yang terjadi | Perbaikan |
| 1 | Pecah | Item / Email (Ab12Cd34) | bartholomew.…@….example.com | tombol ••• terdorong keluar | Teks width:'fill'; aksi width 40 |
```

Tingkat: **Pecah** (tak terbaca, aksi tak terjangkau, data salah), **Jelek** (terbaca tapi tampak salah), **Rapuh** (belum pecah, satu langkah lagi). Lalu: keputusan untuk pengguna (satu baris per keputusan + saran), yang bertahan, letak board salinan, dan "Balas `perbaiki semua` atau `perbaiki 1, 3`".

Adaptasi dari skill `break-ui` Emil Kowalski (MIT), lihat `packages/skills/NOTICE.md`.
