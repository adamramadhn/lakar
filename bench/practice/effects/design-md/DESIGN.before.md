---
name: Lakar Output Standard
description: Standar visual untuk desain yang DIHASILKAN agen Lakar di canvas Lakar (bukan tampilan UI aplikasi Lakar). Sumber skill read_skill, aturan layout_check, dan rubrik benchmark.
status: final
updated: 2026-11-17
sources:
  - ../forge-lakar/forge-lakar.md
  - .memlog.md
colors:
  # Netral terang (default). Rasio kontras di komentar sudah dihitung (WCAG 2.x).
  bg: '#FFFFFF'
  surface-subtle: '#F6F7F9'
  border: '#E4E7EC'           # garis dekoratif/pemisah saja (1.24:1)
  border-strong: '#D0D5DD'    # outline tombol sekunder, kartu (1.47:1), bukan batas kontrol
  border-input: '#7D8798'     # batas input/radio/checkbox: 3.63:1 di bg, 3.38:1 di surface-subtle
  text-primary: '#101828'     # 17.75:1
  text-secondary: '#475467'   # 7.69:1
  text-muted: '#667085'       # 4.97:1 di bg, 4.64:1 di surface-subtle
  # Netral gelap
  bg-dark: '#0B0C0F'
  surface-dark: '#15171C'
  surface-raised-dark: '#1D2026'
  border-dark: '#2A2E36'          # pemisah saja
  border-input-dark: '#646B78'    # batas kontrol: 3.34:1 di surface-dark, 3.65:1 di bg-dark
  text-primary-dark: '#F5F6F8'    # 18.09:1 di bg-dark
  text-secondary-dark: '#B4BAC5'  # 9.2:1 di surface-dark
  text-muted-dark: '#8A92A0'      # 5.72:1 di surface-dark, 5.21:1 di surface-raised-dark
  # Status (terang / gelap)
  success: '#15803D'
  success-dark: '#4ADE80'         # 10.29:1 di surface-dark
  warning: '#B45309'
  warning-dark: '#FBBF24'         # 10.74:1 di surface-dark
  danger: '#DC2626'
  danger-dark: '#F87171'          # 6.48:1 di surface-dark
  info: '#2563EB'
  info-dark: '#60A5FA'            # 7.05:1 di surface-dark
  # Keluarga aksen teruji. Varian -dark dipakai untuk teks/ikon/indikator aksen di mode gelap.
  accent-green: '#15803D'         # teks putih 5.02:1
  accent-green-dark: '#4ADE80'    # 10.29:1 di surface-dark; teks di atasnya: on-accent-dark
  accent-blue: '#2563EB'          # teks putih 5.17:1
  accent-blue-dark: '#60A5FA'     # 7.05:1
  accent-teal: '#0F766E'          # teks putih 5.47:1
  accent-teal-dark: '#2DD4BF'     # 9.63:1
  accent-indigo: '#4F46E5'        # teks putih 6.29:1
  accent-indigo-dark: '#818CF8'   # 6.01:1
  accent-rose: '#BE123C'          # teks putih 6.29:1
  accent-rose-dark: '#FB7185'     # 6.66:1
  accent-orange: '#F97316'        # sama di terang/gelap; 6.98:1 di bg-dark
  accent-amber: '#F5B700'         # sama di terang/gelap; 10.86:1 di bg-dark
  # Warna teks/ikon DI ATAS fill aksen
  on-accent: '#FFFFFF'            # untuk green, blue, teal, indigo, rose
  on-accent-orange: '#1A0F05'     # 6.72:1 (teks putih di oranye hanya 2.8:1)
  on-accent-amber: '#1A1405'      # 10.17:1
  on-accent-dark: '#0B0C0F'       # untuk semua accent-*-dark
typography:
  display-xl: { fontSize: 64px, lineHeight: 72px, fontWeight: '700', letterSpacing: -0.02em }
  display-lg: { fontSize: 48px, lineHeight: 56px, fontWeight: '700', letterSpacing: -0.02em }
  h1: { fontSize: 40px, lineHeight: 48px, fontWeight: '700', letterSpacing: -0.015em }
  h2: { fontSize: 32px, lineHeight: 40px, fontWeight: '700', letterSpacing: -0.01em }
  mobile-title-lg: { fontSize: 28px, lineHeight: 36px, fontWeight: '700', letterSpacing: -0.01em }
  h3: { fontSize: 24px, lineHeight: 32px, fontWeight: '600' }
  mobile-title: { fontSize: 22px, lineHeight: 28px, fontWeight: '700' }
  h4: { fontSize: 20px, lineHeight: 28px, fontWeight: '600' }
  body-lg: { fontSize: 18px, lineHeight: 28px, fontWeight: '400' }
  body: { fontSize: 16px, lineHeight: 24px, fontWeight: '400' }
  body-sm: { fontSize: 14px, lineHeight: 20px, fontWeight: '400' }
  label: { fontSize: 14px, lineHeight: 20px, fontWeight: '600' }
  caption: { fontSize: 12px, lineHeight: 16px, fontWeight: '500' }
  tab-label: { fontSize: 12px, lineHeight: 16px, fontWeight: '600' }
  overline: { fontSize: 12px, lineHeight: 16px, fontWeight: '600', letterSpacing: 0.08em }
  data: { fontSize: 14px, lineHeight: 20px, fontWeight: '500', note: 'angka tabular (numeric: tabular) dengan keluarga body; mono arketipe untuk SKU/kode' }
  kpi: { fontSize: '28 | 32 | 40px', lineHeight: '1.2', fontWeight: '700', note: 'hanya node bernama KPI / Nilai' }
rounded:
  none: 0px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  2xl: 24px
  full: 9999px
spacing:
  # Himpunan nilai sah = semua token di bawah + 2 dan 6 (hanya di dalam komponen kecil). Tidak ada nilai lain.
  '0-25': 2px
  '0-5': 4px
  '0-75': 6px
  '1': 8px
  '1-5': 12px
  '2': 16px
  '2-5': 20px
  '3': 24px
  '4': 32px
  '5': 40px
  '6': 48px
  '8': 64px
  '10': 80px
  '12': 96px
  '16': 128px
  page-margin-desktop: 80px
  page-margin-mobile: 20px
  content-max: 1280px
components:
  button-primary:
    height: 48px
    height-compact: 40px
    padding: '0 {spacing.3}'
    radius: '{rounded.md}'
    background: '{colors.accent-*}'
    foreground: '{colors.on-accent}'
    typography: '{typography.label}'
    icon-size: 20px
    icon-gap: '{spacing.1}'
  button-secondary:
    height: 48px
    border: '1px solid {colors.border-strong}'
    radius: '{rounded.md}'
  icon-button:
    size: 44px
    size-desktop: 40px
    icon-size: 20px
    radius: '{rounded.full}'
  input:
    height: 48px
    padding: '0 {spacing.2}'
    border: '1px solid {colors.border-input}'
    border-error: '1.5px solid {colors.danger}'
    radius: '{rounded.md}'
    label-gap: '{spacing.1}'
  radio-card:
    padding: '{spacing.1-5} {spacing.2}'
    radius: '{rounded.lg}'
    border: '1px solid {colors.border-strong}'
    border-selected: '1.5px solid {colors.accent-*}'
    fill-selected: 'tint aksen 6%'
    control-size: 24px
  checkbox:
    size: 20px
    radius: '{rounded.sm}'
    border: '1.5px solid {colors.border-input}'
  stepper:
    button-size: 44px
    icon-size: 20px
  step-indicator:
    segment-height: 4px
    gap: '{spacing.1}'
  chip:
    height: 32px
    padding: '0 {spacing.1-5}'
    radius: '{rounded.full}'
  card:
    padding: '{spacing.3}'
    radius: '{rounded.lg}'
    border: '1px solid {colors.border}'
  badge:
    height: 24px
    padding: '{spacing.0-25} {spacing.1}'
    radius: '{rounded.full}'
    typography: '{typography.caption}'
  icon:
    library: lucide
    library-later: [phosphor, material-symbols, tabler]
    brand-logos: simple-icons
    sizes: [16px, 20px, 24px, 32px]
    stroke: 2px
  avatar:
    sizes: [32px, 40px, 48px]
    radius: '{rounded.full}'
  sidebar:
    width: 248px
    width-compact: 72px
    item-height: 40px
  table-row:
    height: 56px
    height-compact: 44px
    header-height: 40px
  mobile-status-bar:
    height: 54px
  mobile-tab-bar:
    height: 64px
    bottom-inset: 34px
    item-touch: 48px
  mobile-bottom-bar:
    padding: '{spacing.2} {spacing.2-5} 34px'
    button-height: 56px
---

# Lakar Output Standard

> Dokumen ini mengatur **hasil desain yang dibuat agen Lakar** di canvas Lakar sendiri (forge-lakar-canvas, arsitektur `architecture-lakar-core`). Ini bukan tampilan UI aplikasi Lakar. UI itu punya spesifikasi terpisah. Kalau ada konflik dengan mockup, file desain, atau golden set, dokumen ini yang berlaku. Golden set: [golden-set.md](golden-set.md).

**Turunan dokumen ini.** Satu sumber, tiga konsumen dengan isi yang berbeda:

- **Skill (`read_skill`):** `core.md` (≤ 4k token: prinsip, proses anti-slop, arketipe, token ringkas, konvensi struktur, aturan penilaian, anti-pattern, kontrak ringkasan), lalu `landing.md`, `mobile.md`, `webapp.md` (masing-masing ≤ 1,5k), dan `icons.md`. Angka yang dicek mesin tidak diulang di skill. Agen mengetahuinya dari pesan `layout_check`.
- **Lint (`layout_check`):** Lampiran A.
- **Rubrik:** Lampiran B. Rubrik dan kriteria golden set **tidak dibaca agen**, supaya agen tidak mengoptimalkan hasil demi rubrik.
- Aturan perilaku agen yang ada di EXPERIENCE.md (Component Patterns, kolom Perlakuan di State Patterns, Interaction Primitives) ikut masuk ke `core.md`.

**Konvensi penulisan.** Angka tanpa satuan berarti px. Desimal di kalimat memakai koma (0,5px). Nilai yang disalin ke dokumen Lakar atau kode, termasuk rasio kontras, memakai titik (1.273, 4.5:1). Ribuan memakai titik (2.418).

## Brand & Style

Hasil Lakar harus terlihat seperti dikerjakan **desainer produk senior yang sibuk**: rapi, padat makna, tanpa hiasan yang tidak berfungsi. Kualitas datang dari hierarki, ritme spacing, dan konten yang masuk akal. Efek tidak menambah kualitas.

Prinsip, urut prioritas:

1. **Prompt adalah kontrak.** Semua bagian yang diminta harus ada, dalam urutan yang masuk akal. Paling banyak satu seksi tambahan, dan hanya dari jenis ini: CTA penutup, FAQ, atau baris logo. Nama layernya diawali `Ekstra /`.
2. **Satu titik fokus per layar.** Satu headline, angka kunci, atau aksi utama. Elemen lain mendukungnya. Di mobile, hanya ada satu tombol ber-fill aksen di viewport awal.
3. **Konten nyata.** Copy berbahasa sesuai prompt (default Indonesia), nama orang dan tempat yang wajar, dan angka yang konsisten (jumlah = total, persen cocok, hari cocok dengan tanggal). Angka sosial-proof (jumlah pengguna, rating agregat, % peningkatan) memakai angka tidak bulat yang wajar (`2.418 UMKM`), tanpa logo media/lembaga dan tanpa sumber karangan. Format: `Rp 79.000`, `Rp 48,2 jt`, `Rp 79rb` (harga paket), `7.842`, `12,4%`. Satu bentuk sapaan (kamu **atau** Anda) per desain. Label periode (mis. "30 hari terakhir") sama di semua elemen yang menampilkan periode yang sama.
4. **Ikon adalah ikon.** Emoji dan glyph Unicode sebagai ikon dilarang di seluruh hasil (lihat Components → Ikon).
5. **Reduksi.** Untuk setiap elemen, tanyakan apa yang hilang kalau elemen itu dihapus. Kalau tidak ada, hapus atau gabungkan.

### Proses anti-slop

Wajib dan urut. Setiap langkah meninggalkan artefak di blok `proses:` pada ringkasan.

| # | Langkah | Artefak di ringkasan (`proses:`) |
|---|---|---|
| 1 | **Konten dulu.** Tulis copy dan data contoh sebelum menggambar, tanpa frasa terlarang. | `konten: ditulis sebelum layout` |
| 2 | **Satu langkah khas:** satu keputusan komposisi yang spesifik untuk produk ini. | `langkah khas: <satu kalimat>` |
| 3 | **Bangun per seksi + `layout_check` per seksi.** | `layout_check: <error>/<warning>` |
| 4 | **Cek angka:** total, persen, tanggal ↔ hari, halaman = total ÷ per halaman, sudut busur ring/donut = persen × 360°. | `cek angka: <n relasi>, <selisih>` |
| 5 | **Pass reduksi.** | `reduksi: <yang dihapus> / tidak ada karena …` |
| 6 | **Kritik diri:** satu screenshot dicocokkan dengan 12 anti-pattern + judul yatim. | `kritik diri: <n tersisa>, yatim: <n>` |

Untuk foto stok juga dicatat `kueri foto: "<kueri>" (diganti n×)`. Untuk node berkonvensi (prefiks nama layer) dicatat `konvensi: Crop n, Overlay n, Scroll n, Ekstra n`.

### Arketipe gaya

Kalau prompt menyebut brand, warna, atau font, ikuti prompt. Kalau tidak, pilih **satu** arketipe dan tulis namanya di nama board. Arketipe menyediakan font, palet netral, radius, dan elevasi. Aksen mengikuti prompt, atau diambil dari `{colors.accent-*}`.

| Arketipe | Cocok untuk | Font (heading / body / data) | Netral | Radius | Elevasi | Karakter |
|---|---|---|---|---|---|---|
| **Jernih** | Landing SaaS, B2B, fintech | Plus Jakarta Sans / Inter / JetBrains Mono | terang | `{rounded.md}`–`{rounded.lg}` | sm–md | bersih, percaya diri, satu aksen |
| **Malam** | Mobile consumer gelap, media, kebugaran | Manrope / Manrope / JetBrains Mono | gelap | `{rounded.xl}`–`{rounded.2xl}` | lapis surface | hangat di gelap, aksen menyala |
| **Padat** | Admin, tabel, inventaris, CRM | Inter / Inter / IBM Plex Mono | terang atau gelap | `{rounded.sm}`–`{rounded.md}` | border | efisien, densitas tinggi, tenang |
| **Lantang** | Landing berkarakter, kampanye | Bricolage Grotesque / Inter / Inter | terang kontras tinggi | `{rounded.none}`–`{rounded.sm}` | datar | tipografi besar sebagai visual utama |
| **Ramah** | Mobile consumer terang, booking, edukasi | DM Sans / DM Sans / DM Mono | terang + tint aksen 4–8% | `{rounded.lg}`–`{rounded.2xl}` | md lembut | mudah didekati, lega |

Font dimuat dari registry font lokal Lakar (Fontsource). Font yang tidak tersedia menghasilkan error `FONT_MISSING`, bukan fallback diam-diam. Pilih font lain dari arketipe dan sebutkan di ringkasan.

## Colors

- **Warna netral mengisi sebagian besar layar.** Teks hanya tiga tingkat: primary, secondary, muted.
- **Satu aksen per desain**, untuk CTA utama, state aktif (tab, nav, baris terpilih), tautan, dan satu seri data utama. Tidak untuk dekorasi atau latar seksi besar. Variasinya: tint 4–12% (latar badge, ikon, seleksi) dan shade (pressed).
- **Mode gelap:** teks, ikon, dan indikator aksen memakai `accent-*-dark`. Fill tombol boleh memakai aksen dasar dengan `on-accent`, atau varian -dark dengan `on-accent-dark`. Kedalaman dibentuk dari `bg-dark` → `surface-dark` → `surface-raised-dark`. Blok teks ≥ 3 baris tidak memakai `#FFFFFF`, dan latar besar tidak `#000000`.
- **Warna status hanya untuk status**, selalu disertai teks atau ikon. Kalau warna status kebetulan mirip aksen (amber vs `warning-dark`), pakai token status untuk status.
- **Teks di atas aksen** memakai token `on-accent*`. Teks putih di oranye atau amber dilarang.
- **Dilarang:** fill solid krem/beige/ivory (hue 30–60°, saturasi 10–60%, lightness 85–97%) di area > 25% board; gradien dengan stop di hue 220–300° kecuali prompt meminta ungu/biru/gradien; gradien di teks; lebih dari satu gradien per board.
- **Pengecualian:** landing boleh punya 1–2 seksi gelap untuk ritme.

### Ambang kontras (WCAG 2.2 AA)

| Elemen | Minimum | Penegak |
|---|---|---|
| Teks < 24px (atau < 18,66px dengan berat ≥ 600) | 4.5:1 | LC-04 |
| Teks ≥ 24px, atau ≥ 18,66px dengan berat ≥ 600 | 3:1 | LC-04 |
| Batas kontrol (`Input /`, `Radio /`, `Checkbox /`) dan ikon tanpa label teks | 3:1 | LC-04 (stroke/ikon) |
| Placeholder (layer `Placeholder`) | 4.5:1 | LC-04 |
| Teks di atas foto atau gradien | wajib ada scrim (fill solid opacity ≥ 0,5 di antara gambar dan teks) | LC-04 (warning) |

## Typography

- **Maksimal dua keluarga** (heading + body), ditambah keluarga mono arketipe khusus untuk angka dan kode.
- **Skala wajib dipakai apa adanya:** `{typography.*}`. Pengecualian hanya untuk node berperan khusus: `KPI / Nilai` (28/32/40) dan `Display /` di landing (72/80).
- **Hierarki:** dua teks bersebelahan dengan peran berbeda (judul vs isi) harus berbeda ≥ 2 tingkat skala, **atau** berbeda berat/warna. Contoh: label 14/600 di atas nilai input 16/400 sah.
- **Line-height** mengikuti token, ditulis dalam **px** (mis. `lineHeight: 28` untuk `mobile-title`).
- **Ukuran minimum:** 12px mutlak, termasuk teks di dalam mockup (mockup dibangun pada skala nyata lalu dipotong dengan `Crop /`), hanya untuk metadata, caption, dan label tab. Teks 12px tidak boleh menjadi satu-satunya pembawa info utama (harga, nama, status). Paragraf ≥ 16px di landing dan mobile, ≥ 14px di web app.
- **Panjang baris** paragraf ≤ 75 karakter. Teks rata tengah maksimal 3 baris.
- **Judul tidak yatim:** headline, judul seksi, dan judul kartu/list tidak boleh berakhir dengan satu kata sendirian di baris terakhir. Ubah lebar atau copy.
- **Berat:** 400 body, 500–600 label/UI, 700 heading. 800/900 hanya untuk display Lantang dan harga.
- **Angka** di KPI, harga, dan tabel memakai `numeric: 'tabular'`. Kode/SKU memakai keluarga mono arketipe. Format penulisan angka ada di Prinsip 3.
- **Gaya judul seragam** di semua layar dalam satu alur. Di mobile, sapaan memakai `mobile-title` dan judul layar memakai `mobile-title-lg`.

## Layout & Spacing

**Grid 8px, satu himpunan nilai.** Gap, padding, dan ukuran komponen hanya boleh memakai nilai `{spacing.*}`: 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, ditambah 2 dan 6 di dalam komponen kecil (badge, chip, ikon ↔ teks). Pengecualian ditentukan oleh **nama node**, bukan nilai: `Status bar` (54) dan `Home indicator` (34).

**Proximity.** Jarak di dalam grup harus lebih kecil daripada jarak antar-grup.

| Relasi | Landing | Web app | Mobile |
|---|---|---|---|
| Ikon ↔ teks, label ↔ nilai | 4–8 | 4–8 | 4–8 |
| Item dalam grup (baris list, field) | 12–16 | 12–16 | 12–16 |
| Antar-grup / antar-kartu | 24 | 16–24 | 12–16 |
| Judul seksi ↔ isi | 32–48 | 16–24 | 12–16 |
| Antar-seksi | 96–128 (padding seksi) | 24–32 | 24–32 |

### Struktur wajib di dokumen Lakar

- **Nama board:** `[WIP] ` (selama dibangun) + `Produk / Layar · <landing|app|mobile> · <Arketipe>`, ditambah ` · <Pustaka>` bila bukan Lucide. Board di-clip, ukurannya persis sesuai prompt.
- **Flex layout di mana-mana.** Posisi absolut hanya untuk node `Overlay /`.
- Sizing memakai fill/hug. Teks yang wrap memakai `wrap: 'wrap'` dengan lebar tetap atau fill. Teks `wrap: 'fixed'` tidak boleh lebih dari 1 baris.
- Teks ≥ 2 baris dalam satu seksi memakai satu `textAlign`. Rata kiri adalah default. Rata tengah hanya untuk hero dan header seksi landing.
- Tidak ada spacer kosong. Layer diberi nama bermakna.
- **Ukuran board:** landing (`1440 × bebas`) boleh diperpanjang mengikuti konten. Ukuran board mobile dan app tidak boleh diubah (untuk isi yang lebih panjang, lihat pola Mobile).

### Konvensi nama layer (node berkonvensi)

Prefiks berikut dibaca `layout_check`.

| Prefiks | Arti | Batas |
|---|---|---|
| `Overlay /` | sengaja menumpuk/absolut (tab bar mengambang, badge di avatar) | konten yang berada di belakangnya tidak boleh tertutup (LC-20) |
| `Crop /` | sengaja memotong (mockup di hero) | paling banyak 2 per board |
| `Scroll /` | area gulir | hanya membebaskan sumbu vertikal dari LC-02a |
| `Image /` | slot gambar | — |
| `Ekstra /` | seksi tambahan | paling banyak 1 |
| `Seksi /` | seksi level atas (untuk LC-17) | — |
| `Region / Utama` | region dominan web app | ≥ 50% lebar area konten |
| `KPI / Nilai`, `Display /` | pengecualian skala font | — |
| `Button /`, `IconButton /`, `Tab /`, `Input /`, `Radio /`, `Checkbox /`, `Stepper /`, `Link /` | elemen interaktif (LC-10) dan kontrol (LC-04) | — |

### Pola per jenis layar

#### Landing page (1440 × bebas)

- Margin `{spacing.page-margin-desktop}`, konten maksimal `{spacing.content-max}`, gutter 24.
- **Navbar** 72: logo kiri, 3–5 tautan, satu aksi sekunder dan satu CTA primer di kanan.
- **Hero** ≥ 640 tinggi. Headline display ≤ 3 baris berupa klaim hasil, bukan nama fitur. Subjudul `body-lg` ≤ 2 baris. Satu CTA primer + satu sekunder + baris penguat (kalimat pendek di bawah CTA yang mengurangi keraguan, mis. "Tanpa kartu kredit"). Visual hero adalah anak dari frame `Hero` dan menyatu dengan latar hero (boleh `Crop /`), bukan kartu berbingkai di kolom terpisah.
- **Header seksi:** overline aksen → h2 → `body-lg` secondary, lebar ≤ 720.
- **Ritme:** dalam grid ≥ 3 kartu, minimal satu kartu berbeda lebar atau memuat elemen non-teks. Dua seksi bersebelahan tidak boleh berstruktur sama.
- **Kartu fitur:** ikon 24 di wadah tint 48, judul h4, deskripsi `body-sm`, dan opsional satu detail konkret.
- **Testimoni:** kutipan yang spesifik (hasil + konteks), nama, peran/usaha, dan kota. Rating memakai ikon `star` yang **terisi** (bintang outline terbaca sebagai nol), atau angka + satu ikon.
- **Pricing:** 2–4 tier. Tier unggulan ditonjolkan dengan **satu** cara utama (latar gelap/aksen **atau** border aksen) + badge. CTA tier unggulan primer, tier lain sekunder. Harga `h1`/`display-lg`, fitur dengan ikon `check`. Kartu tier tingginya sama dan CTA-nya sejajar. Label CTA dengan maksud yang sama memakai teks yang sama di seluruh halaman.
- **Footer:** logo + kalimat, 3–4 kolom tautan, hak cipta. Tautan sosial memakai logo Simple Icons atau teks.

#### Mobile app (390 × 844)

- Status bar 54 (jam + ikon sinyal/wifi/baterai). Home indicator 34.
- **Satu wrapper konten** dengan padding horizontal `{spacing.page-margin-mobile}`. Anak tidak menambah padding horizontal.
- **Header:** sapaan `mobile-title` (atau judul `mobile-title-lg`) + maksimal dua `IconButton /` 44–48.
- **Header seksi:** judul h4 + tautan aksen di kanan.
- **Target sentuh ≥ 44 × 44**, jarak antar-target ≥ 8.
- **Tab bar:** 3–5 item, ikon 24 + `tab-label`, aktif = aksen + tint/indikator. Kalau mengambang (`Overlay /`), konten terakhir harus berakhir ≥ 8 di atasnya.
- **Bilah bawah tetap** (`{components.mobile-bottom-bar}`) untuk aksi menetap: total + tombol 56.
- **Ring/grafik** dibuat dari shape (ellipse arc). Setiap ring punya legenda nilai/target. Isi tengah ring adalah angka kunci atau dibiarkan kosong. Ikon dekoratif di tengah hanya boleh kalau angka kuncinya sudah tampil di legenda.
- **Layar lebih panjang dari 844:** status bar → header tetap → `Scroll / Konten` (clip) → bilah bawah tetap. Disajikan sebagai dua board 390 × 844: board posisi awal dan board posisi akhir (setelah digulir). Font dan spacing tidak boleh dikecilkan di bawah minimum.

#### Web app / dashboard (1440 × 900 atau 1440 × 1024)

- **Kerangka:** sidebar 248 (atau `width-compact` 72 kalau ada tabel + panel detail) + konten dengan padding `{spacing.4}`.
- **Region dominan** (`Region / Utama`: grafik atau tabel) ≥ 50% lebar area konten. Hindari tiga zona yang sama berat.
- **Header halaman:** judul h2/h3 + deskripsi di kiri. Di kanan: filter + aksi (primer untuk aksi pembuatan, sekunder untuk ekspor/unduh).
- **KPI tile:** 3–4 per baris. Label `body-sm`, `KPI / Nilai` 28/32/40, delta berupa ikon `trending-up`/`trending-down` + persen + "vs periode lalu" dengan warna status.
- **Grafik:** bar/area, sumbu ringkas, legenda kanan atas, satu seri aksen. Grafik menampilkan label total yang **string-nya identik** dengan KPI terkait.
- **Densitas:** satu tingkat per layar (baris 56 atau 44, tidak dicampur).
- **Status sistem:** minimal satu elemen menunjukkan status (badge, stok menipis, sinkron terakhir).
- **Warna delta mengikuti makna, bukan arah:** pengeluaran naik = warning/danger, biaya turun = success. Ikon tetap mengikuti arah.
- **Satu metrik, satu bentuk tampilan.** Jangan menampilkan nilai yang sama sebagai ring dan progress bar sekaligus.
- **Palet seri data (2–3 seri):** seri utama = aksen; seri lain = tint aksen atau hue yang berjarak ≥ 60° dari aksen dan bukan merah/hijau yang mirip `danger`/`success`. Setiap seri punya legenda teks.

##### Tabel data

- Hierarki: tabel → baris (flex horizontal) → sel (frame selebar kolom) → konten. Teks tidak boleh langsung menjadi anak baris.
- Header 40 dengan `caption`/`overline` secondary. Baris 56/44, pemisah 1px `{colors.border}`.
- Angka dan harga rata kanan dengan font data. Status memakai badge (titik + teks). Aksi baris memakai ikon `ellipsis`.
- Baris terpilih: tint aksen + indikator kiri 2–3 (`Overlay /`) atau checkbox. Toolbar berisi cari + chip filter + aksi. Paginasi di bawah tabel.
- Panel detail kanan 360–420: judul, status, pasangan label-nilai, riwayat. Bagian dipisah garis, bukan bayangan.

#### Form (semua jenis layar)

- Label di atas (`label`, gap 8), field 48, helper/error `body-sm` (gap 8). Antar-field 16, antar-grup 32.
- Error: `{components.input.border-error}` + ikon `circle-alert` + pesan spesifik.
- Pilihan tunggal ≤ 5 opsi memakai `{components.radio-card}`. Stepper memakai `{components.stepper}` (44). Rincian harga berupa daftar label-nilai rata kanan, total tebal, dipisah garis.

## Elevation & Depth

| Token | Nilai | Dipakai untuk |
|---|---|---|
| flat | tanpa bayangan | default; kartu memakai border |
| sm | `0 1px 2px #1018280F` | tombol sekunder |
| md | `0 4px 16px #10182814` | kartu terangkat, mockup hero |
| lg | `0 16px 40px #1018281F` | popover, modal |

- Frame dengan stroke tidak boleh punya bayangan dengan opacity > 8% atau blur > 16.
- Dilarang: bayangan keras (blur < 4 dengan opacity > 15%), bayangan neon, glow.
- Mode gelap: kedalaman dari lapisan surface, bukan bayangan.
- Kedalaman tidak boleh menjadi satu-satunya penanda state.

## Shapes

- Radius mengikuti arketipe. Maksimal tiga nilai radius per board (di luar 0 dan full).
- **Radius bersarang:** untuk anak yang menempel ke sudut parent, radius dalam = radius luar − padding (min 4).
- `{rounded.full}` hanya untuk avatar, badge/chip, toggle, dan tombol ikon.
- Blob dekoratif dan ilustrasi yang digambar manual dari path dilarang, kecuali diminta.

## Components

Visual per komponen. Token ada di frontmatter `components`.

- **Tombol primer:** `{components.button-primary}`. 48 (40 di toolbar web app), ikon 20. Satu per seksi.
- **Tombol sekunder:** outline `{colors.border-strong}` atau latar `surface-subtle`. **Ghost:** teks aksen tanpa latar.
- **Tombol ikon:** `{components.icon-button}`. 44 di mobile, 40 di desktop, ikon 20.
- **Input:** `{components.input}`. Ikon prefiks 20 muted opsional. Error memakai `border-error` + pesan.
- **Radio card:** `{components.radio-card}`. Wadah ikon 40, nama + detail, kontrol radio 24 di kanan. Terpilih = border aksen 1,5 + tint 6% + radio terisi.
- **Checkbox:** `{components.checkbox}`.
- **Stepper:** `{components.stepper}`. Tombol `minus`/`plus` 44 dengan nilai di tengah.
- **Indikator langkah:** `{components.step-indicator}`. Segmen fill (selesai/aktif = aksen, belum = `border-strong`) + teks "Langkah n dari m".
- **Chip filter:** `{components.chip}`. Aktif = fill `text-primary` dengan teks berwarna `bg`, atau tint aksen. Jumlah memakai font data.
- **Kartu:** `{components.card}`. Padding 24 (16 di mobile).
- **Badge:** `{components.badge}`. Tint 10% + teks shade gelap dari warna yang sama (≥ 4.5:1), atau titik 6–8 + teks.
- **Avatar:** `{components.avatar}`. Inisial 2 huruf pada tint, atau foto. Satu gaya per daftar.
- **Logo placeholder:** wadah 32 (aksen, radius md) + ikon relevan + wordmark h4. Logo tidak digambar dari path.
- **Sidebar item:** `{components.sidebar}`. Ikon 20 + label `body-sm` 500. Aktif = tint + aksen.
- **Baris tabel:** `{components.table-row}`. **Tab bar mobile:** `{components.mobile-tab-bar}`. **Bilah bawah:** `{components.mobile-bottom-bar}`.
- **Gambar/foto:** fill pada frame `Image / <deskripsi>`. Kueri stok harus konkret (ruang/benda + material + suasana, mis. `hotel bedroom wooden interior`), bukan nama tempat umum. Cek hasilnya sekali dan ganti kalau isinya tidak sesuai. Gambar yang sama di dua board harus memakai fill yang sama. Kalau gambar belum ada, pakai blok tint + ikon `image` muted.

### Ikon dan logo brand

| Kebutuhan | MVP | Tonggak ke-2 |
|---|---|---|
| Ikon UI | **Lucide saja** (ISC), versi dipin di paket Lakar | + Phosphor (Ramah, Malam, Lantang; varian terisi boleh untuk state aktif), Material Symbols (prompt Android/Material), Tabler (cadangan) |
| Logo brand (WhatsApp, Instagram, …) | Simple Icons (CC0; merek dagang), hanya untuk tautan sosial/integrasi | sama |
| Logo pembayaran lokal (QRIS, GoPay, OVO, DANA) | teks atau badge teks; tidak digambar ulang | sama |

- `{components.icon}`: stroke 2, ukuran 16/20/24/32, warna mengikuti teks di sebelahnya atau aksen. Ikon dalam wadah: 24 di wadah 48.
- Ikon **hanya** dibuat sebagai node `icon` (`{lib, name, version}`, nama kanonik). Nama layer default `Icon / <pustaka> / <nama>`. Nama dicari lewat `icon_search`. Kalau nama tidak ada, tool menolak dan memberi 3 saran.
- **Satu pustaka ikon UI per board** (logo Simple Icons tidak dihitung).
- **Dilarang:** emoji dan glyph Unicode sebagai ikon (daftar glyph di LC-01b).
- Skill `icons.md` berisi tabel sekitar 80 konsep dengan nama per pustaka. Nama kanonik mengikuti versi Lucide yang dipin, dan alias lama (mis. `more-horizontal` → `ellipsis`) dipetakan di sana.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Semua bagian prompt; maksimal 1 seksi `Ekstra /` | Lebih dari satu seksi tambahan |
| Ikon sebagai node `icon` (Lucide di MVP) | Emoji atau glyph Unicode sebagai ikon (gerbang gagal) |
| Spacing dari himpunan token | 3, 5, 10, 14, 15, 18, 22, … |
| Skala tipografi token | Ukuran di luar skala tanpa nama peran |
| Satu aksen untuk aksi dan state aktif | Aksen di semua ikon dan latar |
| Border **atau** bayangan halus | Bayangan keras, glow |
| Konten nyata, angka konsisten | Lorem, "Judul Fitur", angka bertentangan |
| Variasi komposisi antar-seksi | Semua seksi = judul tengah + 3 kartu identik |

### Anti-pattern desain generik ("AI slop")

Checklist ini dipakai agen (kritik diri) dan juri (R8).

1. Gradien ungu-biru atau mesh di hero tanpa alasan brand.
2. Tiga kartu identik dengan ikon di lingkaran sebagai pola utama halaman.
3. Kartu di dalam kartu di dalam kartu.
4. Headline generik ("Solusi terbaik untuk bisnis Anda", "Revolusi …").
5. Statistik bulat dan berlebihan ("10x lebih cepat", "1 juta+ pengguna") yang tidak diberikan prompt.
6. Emoji atau glyph Unicode sebagai ikon.
7. Latar krem/beige/off-white hangat.
8. Glassmorphism/blur di mana-mana (blur hanya untuk bar yang mengambang).
9. Semua teks rata tengah.
10. Tombol generik ("Klik di sini", "Submit", "Pelajari lebih lanjut") di setiap kartu.
11. Ilustrasi atau maskot dari path manual.
12. Placeholder abu-abu kosong tanpa label di tempat yang seharusnya berisi konten.

**Frasa terlarang** (LC-19, per bahasa, dicocokkan per kata utuh):
- **id:** "solusi terbaik", "revolusioner", "tingkatkan produktivitas", "pelajari lebih lanjut", "klik di sini", "lorem ipsum", "judul fitur".
- **en:** "learn more", "click here", "unlock", "seamless", "next-level", "game changer", "empower your".

Teks di dalam `Input /` dan layer `Label` dikecualikan.

## Lampiran A — Aturan `layout_check`

`layout_check(boardId)` membaca layout setelah font siap dan layout stabil (satu run). Jenis layar dibaca dari properti `screen` board. Ringkasan error dan warning juga otomatis dikembalikan di setiap `execute`. Keluaran per baris: `level · ID · node · detail · nilai yang benar`. **Gerbang** = error yang menggagalkan hasil (Lampiran B).

| ID | Level | Aturan | Cara cek |
|---|---|---|---|
| LC-01a | error · gerbang | Emoji | `Emoji_Presentation`, atau `Extended_Pictographic` + VS16. `© ® ™` dikecualikan |
| LC-01b | error · gerbang | Glyph Unicode sebagai ikon | daftar `★☆✓✔✗→←↑↓↗↘▶◀•` sebagai teks berdiri sendiri atau di awal teks |
| LC-02a | error · gerbang | Terpotong oleh parent yang clip | bounds anak di luar parent clip > 0,5px. Kecuali di dalam `Crop /` (≤ 2), sumbu vertikal di `Scroll /`, dan anak dari parent yang dirotasi |
| LC-02b | error | Meluber dari parent flex non-clip | bounds anak melewati content-box parent > 0,5px (`Overlay /` dikecualikan) |
| LC-03 | warning | Teks tetap yang berisiko meluber | `wrap: 'fixed'` dengan ≥ 2 baris terukur, atau teks melewati kotaknya |
| LC-04 | error (solid) / warning (komposit) | Kontras | teks, placeholder, stroke kontrol, dan ikon tanpa label terhadap fill solid efektif di belakangnya (ancestor dan saudara di bawahnya). Di atas gradien: dihitung terhadap setiap stop. Di atas gambar: wajib scrim, lalu dihitung terhadap scrim yang dikomposit di atas hitam dan putih. Kalau ada opacity atau blend mode, level turun menjadi warning |
| LC-05 | error · gerbang | Font < 12px | `fontSize < 12` |
| LC-06 | warning | Paragraf di bawah minimum | teks ≥ 2 baris: < 16 (landing, mobile) / < 14 (app) |
| LC-07 | warning | Spacing di luar himpunan | gap/padding/ukuran komponen ∉ `{spacing.*}` ∪ {2, 6}, kecuali node `Status bar` dan `Home indicator` |
| LC-08 | warning | Font di luar skala atau triple tidak cocok | ukuran ∉ skala (kecuali `KPI / Nilai`, `Display /`), atau `fontSize × lineHeight` meleset > 0,5px dari token |
| LC-09 | warning | > 2 keluarga font | di luar keluarga mono arketipe |
| LC-10 | warning | Target sentuh kecil | node interaktif (Button/IconButton/Tab/Input/Radio/Checkbox/Stepper/Link) < 44 × 44 di board mobile (lebar ≤ 430) |
| LC-11 | warning | Tumpang tindih tidak disengaja | saudara non-flex beririsan > 4px; gap negatif di flex dikecualikan |
| LC-12 | warning | Board bertabrakan / tanpa clip / ukuran tidak sesuai prompt | bounds board; `clip`; `expectedSize` |
| LC-13 | info | Nama layer default | `Rectangle`, `Ellipse`, `Path`, `Group`, `Board`, `Image`, `svg` + angka |
| LC-14 | warning | Absolut di dalam flex tanpa `Overlay /` | — |
| LC-15 | warning | > 1 pustaka ikon UI | `icon.lib` (simple-icons tidak dihitung) |
| LC-16 | error | Ikon digambar manual | node `path` ≤ 32 × 32 yang tidak bernama `Chart /` atau `Shape /` |
| LC-17 | warning | Struktur seksi mirip | pasangan `Seksi /` (atau anak stack utama) dengan kemiripan multiset tipe + ukuran font ≥ 0,9 (Jaccard) |
| LC-18 | warning | Kartu dalam kartu | "kartu" = frame dengan fill/stroke + padding ≥ 12 + ≥ 2 anak, bukan Button/Input/Badge/Chip/Icon/Avatar/Tab. Kedalaman total ≥ 3. Lapisan surface tanpa stroke dan padding tidak dihitung |
| LC-19 | warning | Frasa terlarang | daftar per bahasa, per kata utuh, kecuali `Input /` dan `Label` |
| LC-20 | error · gerbang | Konten tertutup bar mengambang | untuk `Overlay /` yang menempel ke tepi bawah: konten terakhir di wrapper/`Scroll /` (pada board posisi akhir) berakhir ≥ 8 di atasnya |
| LC-21 | warning | Radius > 3 nilai, spacer kosong, padding horizontal ganda di mobile, teks langsung di baris tabel, > 1 gradien | pemeriksaan struktural murah |
| LC-22 | info | Jumlah node berkonvensi | menghitung `Crop/Overlay/Scroll/Ekstra`; wajib disebut di artefak `konvensi:` |

**Uji regresi:** desain target golden set (setelah dibangun ulang di Lakar) harus lolos semua error, dengan LC-17/18/19 = 0. Setiap false positive diselesaikan dengan memperbaiki aturan, bukan memberi pengecualian per board.

## Lampiran B — Rubrik benchmark

Versi rubrik: 2.1 (2026-11-18)

Rubrik ini **tidak dibaca agen**. Ada sepuluh kriteria; delapan dinilai juri dari PNG untuk perbandingan dengan pen.dev (skor maks 16). R3 dan R7 dicek mekanis sebagai kualitas teknis Lakar. Setelah itu ada gerbang dan keputusan per prompt. Snapshot setiap versi rubrik (Lampiran B, kriteria golden, dan teks juri beserta sha256-nya) disimpan tracked di `bench/rubric/`.

### Kriteria perbandingan (Lakar vs pen.dev, dari PNG, skor maks 16)

Setiap kriteria golden set dipetakan ke satu R. **Rn = 2** bila (a) semua kriteria golden yang dipetakan ke Rn terpenuhi **dan** (b) deskripsi kolom 2 terpenuhi. **Rn = 1** bila tepat satu kriteria golden gagal **atau** deskripsi kolom 1 terpenuhi. **Rn = 0** untuk kasus lain. R9 dan R10 tidak memetakan kriteria golden; skornya hanya dari deskripsi kolom.

| # | Kriteria | 2 | 1 | 0 |
|---|---|---|---|---|
| R1 | Kelengkapan prompt | semua bagian, mode, aksen, bahasa, dan ukuran mengikat sesuai | 1 hal minor salah (urutan, 1 seksi ekstra di luar aturan) | ada bagian hilang atau ukuran mengikat salah |
| R2 | Hierarki tipografi | satu titik fokus yang ditunjuk juri, lompatan skala tegas, tidak ada judul yatim | fokus ada tapi bersaing dengan 1 elemen, atau 1 judul yatim | tidak ada fokus, ukuran datar |
| R4 | Warna & kontras | aksen dipakai konsisten untuk aksi/aktif/seri utama; warna tambahan hanya bila bermakna (status, kategori, arah perubahan); tidak ada teks yang terlihat gagal kontras | 1 pemakaian warna tanpa makna atau 1 teks lemah | warna berceceran tanpa makna, atau ≥ 2 teks gagal kontras |
| R5 | Ikon & aset | satu gaya ikon, ukuran seragam, visual utama (hero/grafik/foto) relevan, tanpa emoji | 1 ikon tidak konsisten, 1 emoji dekoratif (mis. di sapaan), atau visual utama lemah | emoji/glyph sebagai ikon UI, ≥ 2 emoji, atau visual utama hilang/kosong |
| R6 | Konten | copy spesifik, angka konsisten (kriteria angka golden terpenuhi) | 1 inkonsistensi atau 1 frasa generik | lorem, kontradiksi ≥ 2, atau copy generik dominan |
| R8 | Karakter | 0 pelanggaran checklist slop (selain emoji, yang dihitung di R5) + ada keputusan komposisi khas **yang bisa ditunjuk juri dari PNG** | 1–2 pelanggaran, atau tidak ada langkah khas | ≥ 3 pelanggaran |
| R9 | Kekayaan informasi & detail | angka diberi konteks (pembanding, sasaran, tren, satuan, periode); daftar menunjukkan variasi status/kategori; detail sekunder yang berguna (metadata, label kecil, penanda) ada di sebagian besar bagian; padat tetapi tetap terbaca | konteks atau variasi hanya di sebagian bagian; banyak angka/item berdiri tanpa makna tambahan | hanya isi minimum yang diminta: angka telanjang, item seragam; atau terlalu padat sampai tidak terbaca |
| R10 | Polesan warna & komponen | semua unsur berikut ada: permukaan berlapis (bidang ber-tint warna utama, nuansa gelap/terang, bukan hanya netral polos); warna kedua bermakna (selain aksen dan netral) dipakai konsisten di lebih dari satu bagian; badge/chip/indikator berwarna dan terdefinisi; ikon dan visual (foto, grafik, gambar) matang dan menyatu | polesan hanya di sebagian elemen, komponen sebagian besar polos, atau salah satu unsur kolom 2 tidak ada (mis. hanya satu aksen di atas netral tanpa warna kedua bermakna) | datar: satu warna di atas netral polos hampir di seluruh desain, komponen hanya teks/garis, visual pendukung hilang atau tampak kasar |

Setiap pelanggaran hanya dihitung di **satu** R. Kesalahan (kontras, ikon tidak konsisten, angka salah) dinilai di R4/R5/R6; R9 dan R10 menilai ada atau tidaknya kekayaan dan polesan.

### Kualitas teknis Lakar (bukan perbandingan, dicek mekanis)

Pen.dev tidak dilint (EULA melarang ekstraksi dari output).

| # | Kriteria | 2 | 1 | 0 |
|---|---|---|---|---|
| R3 | Spacing & perataan | LC-07 = 0, LC-11 = 0, LC-06 = 0 | ≤ 5 temuan | > 5 |
| R7 | Kerapian teknis | 0 error non-gerbang, ≤ 3 warning struktural (LC-03/13/14/17/18/21) | ≤ 2 error non-gerbang yang dianulir Adam sebagai false positive, atau ≤ 8 warning | selebihnya |

### Gerbang Lakar (gagal otomatis)

- ada error berlevel `gerbang` di Lampiran A, atau ukuran board salah;
- R3 = 0 atau R7 = 0;
- waktu > 1,5 × median baseline pen.dev pada prompt yang sama (forge-lakar-canvas).

### Keputusan per prompt

T = total 8 median juri (maks 16); D = R9 + R10 ("daya tarik", maks 4); L = Lakar, P = pen.dev.

1. Run Lakar gagal atau gerbang Lakar gagal → **Kalah**.
2. Run pen.dev gagal atau tidak ada ulangan juri yang valid → tidak dapat dinilai.
3. Alasan Kalah. *Kalah-daya-tarik:* D_L ≤ D_P − 2, atau R9/R10 dengan Lakar 0 sementara pen.dev 2. *Kalah-lain:* T_L < T_P − 1, atau ada R1–R8 dengan Lakar 0 sementara pen.dev 2.
4. Ada alasan Kalah → **Kalah**. Kecuali bila **hanya** ada Kalah-daya-tarik **dan** pen.dev melanggar brief mengikat (ukuran frame pen.dev ≠ ukuran mengikat prompt, atau median R1 pen.dev = 0) → **Setara**.
5. Tidak Kalah, T_L ≥ T_P + 3, **dan** D_L ≥ D_P → **Lebih baik**. Selebihnya → **Setara**.

Alasan aturan:
- **Kriteria umum, bukan isi A/B.** R9/R10 menilai sifat yang terlihat di desain apa pun (konteks angka, variasi status, lapisan permukaan, warna bermakna). Adam menyebut keduanya kurang di A (landing) maupun B (mobile).
- **R4 direvisi.** R4 lama ("aksen hanya untuk aksi") menghukum warna kedua yang bermakna, padahal Adam menilainya sebagai kematangan. Tanpa revisi, R4 dan R10 saling meniadakan.
- **Sumbu daya tarik dengan veto gap ≥ 2.** Adam menolak "unggul struktur/copy" sebagai penebus desain datar: kepatuhan tidak menebus kedataran. Ini perluasan veto yang sudah ada (0 vs 2 pada satu R) ke sumbu yang menurut Adam paling menentukan. Gap 1 dianggap derau median.
- **Lebih baik mensyaratkan D_L ≥ D_P.** Klaim "lebih baik dari pen.dev" tidak boleh hanya berasal dari kepatuhan.
- **Ambang +3/−1.** +2 dari maks 12 diskalakan ke maks 16 menjadi ≈ +2,7, lalu dibulatkan ke +3. −1 tetap satu langkah skor sebagai toleransi derau; satuan langkahnya tidak berubah.
- **Gerbang Lakar tetap keras.** Kepatuhan brief adalah janji produk Lakar, dicek mekanis, dan tidak bergantung pada juri.
- **Pelanggaran brief pembanding hanya menetralkan veto daya tarik** dan tidak membuat Lakar Lebih baik. Keunggulan daya tarik yang diraih di luar batas mengikat bukan keunggulan sah (board lebih tinggi = ruang konten tambahan; bahasa lain = brief dilanggar). Meski begitu, kesalahan pembanding bukan prestasi Lakar: Kalah karena kualitas lain tetap Kalah.
- **Audit golden.** Kriteria golden tidak mewajibkan gaya yang tidak diminta prompt (mis. avatar inisial, satu kartu aksen, wadah tint). Kriteria seperti itu mencerminkan batas Lakar G0, bukan permintaan brief, dan menghukum alternatif yang lebih kaya.

- **G0:** prompt A dan B setara atau lebih baik. **G1 (lulus inti A):** ≥ 4 dari 5 prompt setara atau lebih baik **dan** ≥ 1 lebih baik.

### Prosedur juri

- Juri LLM menerima rubrik ini, kedua PNG (urutan diacak, nama alat disembunyikan), teks prompt, dan kriteria golden. Juri **tidak** menerima ringkasan agen.
- Setiap skor wajib disertai bukti (elemen + lokasi). "Mirip target" bukan bukti.
- Juri dijalankan 3× dengan urutan berbeda. Yang dipakai adalah median per kriteria. Kriteria dengan rentang > 1 wajib diperiksa Adam. Adam mengonfirmasi atau mengoreksi semua skor.
- **Jangkar visual:** PNG desain target yang dibangun ulang di Lakar boleh ditampilkan hanya untuk kalibrasi skor 2. Frame pen.dev tidak dipakai (arsip, EULA).
- **Normalisasi bentuk:** hasil mobile yang terdiri dari beberapa board, atau satu board panjang, digabung menjadi satu strip vertikal untuk kedua alat sebelum dinilai.
- **Laporan:** skor per R, total T dan daya tarik D kedua alat, "jumlah slop" kedua alat, waktu, biaya, versi rubrik, dan sha256 teks juri per prompt (sama dengan `bench/rubric/rubric.json`; putaran resmi di-abort bila berbeda).
- Juri tidak menerima aturan keputusan per prompt maupun skor putaran lain.
