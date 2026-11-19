## A — Kasku, landing page (prompt lama)

**Kriteria target:**
1. [R1] Tujuh bagian hadir sesuai urutan. CTA penutup opsional (`Ekstra /`).
2. [R2] Headline hero display, ≤ 3 baris, klaim hasil, tidak yatim. Dua CTA: primer hijau + sekunder outline.
3. [R6] Mockup dashboard di hero dibangun dari shape/teks nyata, dengan Pemasukan − Pengeluaran = Laba.
4. [R5] Ikon fitur Lucide (mis. `scan-line`, `file-chart-column`, `package`) dalam wadah yang seragam. Tidak ada emoji, termasuk di sapaan mockup.
5. [R6] Testimoni: nama, peran/usaha, kota Indonesia. Rating memakai ikon `star`.
6. [R8] Tier tengah ditonjolkan dengan satu cara utama + badge. CTA tier tengah primer, tier lain sekunder. Harga `Rp 79rb/bulan`, fitur dengan `check`.
7. [R4] Hijau `{colors.accent-green}` + `on-accent`. Ritme terang/gelap antar-seksi.
8. [G] `layout_check` nol error gerbang.

## B — Gerak, beranda mobile (prompt lama)

**Kriteria target:**
1. [R1] Board lebar 390 dan tinggi ≥ 844, status bar 54, dan home indicator.
2. [R5] Sapaan `mobile-title` dengan tanggal di atasnya. Avatar. Tanpa emoji tangan.
3. [R6] Ring progres (arc) dengan legenda nilai/target untuk langkah, kalori, menit aktif. Tafsir satu ring gabungan atau tiga ring konsentris sama-sama sah, karena prompt menulis "ring progress". Busur dan persen cocok dengan angka.
4. [R1] Jadwal ≥ 2 item: satu selesai (`circle-check`), satu berikutnya dengan aksi primer "Mulai" (`play`).
5. [R8] Dua kartu program yang bisa dibedakan (berbeda secara visual).
6. [R1] Tab bar 4 item (`house`, `dumbbell`, `chart-column`, `user`), item aktif jelas. [G] konten tidak tertutup tab bar (LC-20).
7. [R4] Oranye + `on-accent-orange`. Teks muted ≥ 4.5:1 di surface gelap.
8. [G] `layout_check` nol error gerbang.

## C — Arus, dashboard analitik web app (baru)

**Kriteria target:**
1. [R1] Sidebar 248 dengan 6–8 item ikon, satu aktif. Workspace/profil di bawah.
2. [R1] Header: judul + deskripsi kiri; filter tanggal (`calendar`) + aksi Ekspor kanan.
3. [R6] 4 KPI: `KPI / Nilai`, delta ikon + warna status + "vs 30 hari lalu". Minimal satu delta negatif. Rata-rata nilai pesanan = pendapatan ÷ pesanan.
4. [R2] Grafik pendapatan = `Region / Utama` (≥ 50% lebar). [R6] Label total grafik identik dengan string KPI pendapatan.
5. [R1] Tabel pesanan 6 baris: ID, pelanggan, tanggal, total rata kanan, badge status. [T] Hierarki baris → sel.
6. [R5] Produk terlaris: 5 item, thumbnail berlabel, jumlah terjual, bar proporsi.
7. [R4] Biru hanya untuk aksi, nav aktif, dan seri grafik utama.
8. [G] `layout_check` nol error gerbang. Densitas tidak dicampur.

## D — Singgah, checkout booking mobile (baru)

**Kriteria target:**
1. [R1] Header: `arrow-left` (`IconButton /` 44–48), judul, `step-indicator` 2/3. Header dan bilah bayar tetap saat digulir.
2. [R1] Isi melebihi 844 → satu board panjang selebar 390 (tinggi mengikuti konten, minimal 844), header di atas dan bilah bayar menempel di bawah board; bukan dua board atau strip gabungan. [T] Font tidak dikecilkan di bawah minimum.
3. [R5] Kartu kamar: foto yang sesuai isi (atau `Image /` berlabel), nama, tipe, rating ikon `star`.
4. [R6] Tanggal check-in/out (`calendar`): hari cocok dengan kalender dan jumlah malam benar. [R1] Stepper tamu `minus`/`plus` 44.
5. [R1] Form: label di atas, field 48, satu field error (border danger + `circle-alert` + pesan spesifik).
6. [R8] Metode bayar sebagai `radio-card` (QRIS, VA, Kartu), satu terpilih. Logo pembayaran ditulis sebagai teks.
7. [R6] Harga × malam + pajak + biaya = total, sama dengan total di bilah bawah. [R4] Tombol Bayar 56 teal + `on-accent`.
8. [G] `layout_check` nol error gerbang. [T] Target sentuh ≥ 44.

## E — Gudangku, inventaris tabel + panel detail (baru)

**Kriteria target:**
1. [R1] Sidebar `width-compact` 72 agar tabel + panel muat di 1440.
2. [R1] Toolbar: cari (`search`), chip kategori (jumlahnya = total), tombol "Tambah barang" (`plus`) amber + `on-accent-amber`.
3. [R2] Tabel 8 baris dengan satu densitas (56 atau 44), SKU/stok/harga memakai font data, angka rata kanan, badge Aman/Menipis/Habis (titik + teks).
4. [R1] Satu baris terpilih: tint amber + indikator kiri. Panel kanan 360–420 untuk barang yang sama.
5. [R6] Panel: nama, SKU, status, label-nilai, stok per 3 lokasi (jumlah = stok tabel), riwayat 4–5 entri.
6. [R4] Kedalaman dari lapisan surface tanpa bayangan. Teks muted ≥ 4.5:1.
7. [R4] Amber hanya untuk aksi primer dan seleksi. Status Menipis memakai `warning-dark` (titik + teks).
8. [G] `layout_check` nol error gerbang. Densitas satu tingkat.
