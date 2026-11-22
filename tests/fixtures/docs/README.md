# Korpus dokumen Lakar

Korpus ini adalah pengaman migrasi skema (spine `architecture-model-dokumen`, AD-3). Setiap fixture di sini wajib:

1. bermigrasi ke `SCHEMA_VERSION` terbaru lewat `parseDocument` (`packages/core/src/migrate.ts`);
2. lolos validasi skema dan `resolveDocument` (ekspansi instance + token, `tests/doc-corpus.test.ts`); fixture v1/v2 juga wajib tampil sama setelah migrasi token 2 → 3 (ref di-resolve = substitusi nilai datar lama);
3. dirender `ok: true` di Chromium untuk setiap board (`packages/render/test/corpus.test.ts`, dilewati bila Chromium Lakar tidak terpasang).

Loader bersama ada di `tests/support/doc-corpus.ts`.

## Konvensi

- File: `v<n>/<slug>.lakar.json`, berisi JSON dokumen Lakar apa adanya (seperti `<data>/docs/<slug>.lakar.json`).
- Folder `v<n>` wajib sama dengan `schemaVersion` di dalam file. Bila berbeda, loader gagal dan menyebut path file.
- Fixture di `v<n>` hanya boleh memakai fitur yang valid di versi `n` (mis. `v1` tanpa fill `conic`, `noise`, `mesh`).
- Setiap versi `1..SCHEMA_VERSION` wajib punya minimal satu fixture. Saat skema naik ke versi baru, tambahkan folder `v<n+1>` dalam PR yang sama. Fixture versi lama **tidak** diubah; justru fixture itulah yang membuktikan migrasinya.
- Aset gambar ada di `assets/<sha256>.png`. Nama file = sha256 isinya, dan fill `image` merujuknya lewat `assetId`. Tes render mendaftarkan semua PNG di folder ini.
- Teks memakai family Inter (atau default) dengan weight 400/500/600/700, normal, atau 400 italic. Hanya karakter yang tercakup subset latin/latin-ext Inter.
- Ikon hanya dari glyph fixture render (`packages/render/test/fixtures/icon-glyphs.json`): `lucide` house, star, check, search, chart-scatter; `simple-icons` github, whatsapp.

## Cakupan saat ini

| Fixture | Isi utama |
|---------|-----------|
| `v1/landing-dua-halaman` | dua halaman, token warna/panjang/ukuran teks, frame `row`/`column`/`none`, `hug`/`fill`, teks 400–700, rect `linear` + `radial`, stroke `sides`, radius 4 sudut, shadow `drop` + `inner`, ellipse busur, path, semua ikon, node `absolute` |
| `v1/tanpa-token` | dokumen tanpa `tokens`, board `app` sederhana |
| `v2/fill-efek` | fill `conic`, `noise`, `mesh` (satu warna token), `image` (`cover` + `tile`) |
| `v2/mobile-gulir` | board `mobile` dengan frame `scrollY`, efek `opacity`/`blend`/`blur`/`backdropBlur`/`rotation`, teks italic, token tipografi (`family`, `weight`, `size`, `lineHeight`, `letterSpacing`) |
| `v3/tema-mode` | token bertipe semua tipe (`color` … `letterSpacing`), `tokenModes: [light, dark]`, token dengan `modes` (warna, spacing, fontWeight), board `themeMode: dark` dan board tanpa `themeMode`, token di gap/padding/maxWidth/radius/size icon |
| `v4/grid-galeri` | frame `layout:'grid'` dengan track px/`fr`/`auto`/`minmax`, `gridTemplateRows`, `columnGap`/`rowGap` token dan `gap`, `align`/`justify`, anak `gridColumn`/`gridRow` (`span`, `start`+`span`, `start`/`end` negatif), anak `hug`/`fill`/fixed/tanpa ukuran, anak absolute di grid |
| `v5/komponen-kartu` | master `component` dengan prop `text`/`boolean` (`visible`)/`enum` dan slot, token di master, instance ber-override (akar, anak, dan path bersarang `InsBadg0/TxtBadg1`), instance dengan props dan isi slot, instance bersarang di dalam master (alamat tiga segmen), instance kedua dari master lain |

Gabungan korpus wajib tetap mencakup semua tipe node, semua jenis fill, dan properti di atas. Bila skema bertambah properti, tambahkan pemakaiannya ke fixture versi baru.

## Menambah dokumen nyata

Dokumen pengguna nyata **tidak boleh** disalin apa adanya. Langkahnya:

1. Salin file dari `<data>/docs/<slug>.lakar.json`.
2. Samarkan: ganti semua `content` teks, nama layer, nama halaman/board, dan nama token yang bisa mengenali orang, merek, atau proyek. Struktur, ukuran, dan gaya boleh tetap.
3. Ganti setiap `assetId` fill `image` dengan aset korpus (`e14414c7fc0f20c2a299aed9471ccf3f5056d94248f7a5948d8a067917faa153`), atau tambahkan PNG kecil non-pribadi ke `assets/` dengan nama sha256-nya.
4. Pastikan family font, weight, dan ikon memenuhi konvensi di atas (ganti family lain dengan Inter, ikon lain dengan salah satu glyph fixture).
5. Simpan di folder versi sesuai `schemaVersion` file (`v<n>/<slug>.lakar.json`). Jangan menaikkan `schemaVersion` secara manual.
6. Jalankan `pnpm exec vitest run tests/doc-corpus.test.ts packages/render/test/corpus.test.ts`.

Dokumen bench lama yang tersimpan di VPS menyusul: dokumen itu akan disamarkan dengan langkah yang sama, lalu ditambahkan ke folder versinya.
