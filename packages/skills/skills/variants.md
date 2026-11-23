# Lakar: variants

Opsional, saat pengguna meminta beberapa variasi, alternatif, atau opsi ("buat 3 variasi hero", "kasih alternatif kartu harga"). Varian responsif per lebar ada di `selection`, bukan di sini. Nilai skill ini ada di **perbedaan arah**: tiga warna dari satu ide tidak mengajarkan apa pun saat dibandingkan.

## Aturan

1. **Satu hal per putaran.** Permintaan sebesar "seluruh dashboard" dipersempit ke satu bagian paling menentukan (hero, kartu harga, layar onboarding). Sebut pilihannya dan alasannya, tawarkan sisanya sebagai putaran berikutnya.
2. **Beda di sumbu yang dinamai.** Default 3 varian, maks 5. Sebelum menggambar, tulis nama + sumbu tiap varian: layout, kepadatan, kepribadian (arketipe `core`), titik fokus, atau cara menyajikan data. Nama menyebut arah ("Tenang", "Editorial", "Padat"), bukan "Opsi A/B/C". Dua varian yang hanya beda warna aksen atau copy = satu arah; ganti salah satunya.
3. **Setiap varian layak kirim.** Konten nyata (tanpa lorem), keadaan dan angka berpembanding, `check` bersih seperti desain biasa. Berbagi token dokumen tidak membuat varian sama; perbedaan ada di struktur.
4. **Ukuran penuh, konteks nyata.** Satu board per varian, lebarnya sama dengan sasaran (board landing: tinggi = bawah isi, ikuti `LC-12` tinggi pas), berisi tetangga yang wajar (kartu harga di antara tier lain, toast di atas halaman). Bukan thumbnail berjejer di satu board.
5. **Sumber tidak diubah.** Varian dari seleksi = board baru di sebelah sumber; node sumber tetap.

## Alur

1. Rencana: tabel nama + sumbu (≤ 5 baris), lalu bangun. Satu execute per varian, masing-masing diawali prelude; board ke-2 dan seterusnya `place(w,h,{near:<board sebelumnya>})`, nama `<Produk> / <Bagian> · <Arah>`.
2. Baca `check` tiap respons; perbaikan digabung ke satu execute terakhir untuk semua varian.
3. `screenshot` tiap board, cek ulang bahwa arahnya benar-benar beda. Varian yang ternyata menyatu dipotong dan disebut; dua arah yang jelas lebih baik daripada tiga yang dipaksakan.
4. Laporkan lalu berhenti. Pilihan milik pengguna; jangan memilih favorit di tabel:

```text
| # | Varian | Sumbu | Tepat bila | Biayanya |
| 1 | Tenang | garis, tanpa bayangan, padat | alat dipakai tiap hari | paling tidak berkesan |
| 2 | Editorial | huruf besar, ruang lega | momen ini perlu bobot | makan tinggi |
```

## Setelah memilih

- "pakai <varian>" → rapikan board itu (lepas penanda arah dari nama bila diminta). Board lain dihapus hanya bila pengguna memintanya.
- "kembangkan <varian>" → putaran baru: 3 arah baru yang menyimpang di sekitar varian itu.
- Ditanya mana yang kamu pilih: jawab dengan alasan dari kepribadian produk dan seberapa sering dipakai, bukan selera semata.

Adaptasi dari skill `prototype` Emil Kowalski (MIT), lihat `packages/skills/NOTICE.md`.
