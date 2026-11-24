# Lakar: export-code

Implementasikan desain sebagai kode (design → code). Baca bila pengguna meminta membangun web/aplikasi/proyek dari desain Lakar ("buatkan Next.js dari board ini", "convert design to code") atau mengekspor token saja. Jangan transkripsi manual dari `inspect` — `export_code` adalah generator deterministik yang berkasnya 1:1 dengan desain (layout, token, komponen), identik dengan dialog Export code di viewer.

## Pipeline

1. **Survei** — `open_doc {slug?}` (kosong = dokumen terbuka di aplikasi), lalu `get_page_tree` + `list_boards` untuk peta halaman dan board. `inspect {id}` hanya untuk memilih target export. Perlu laporan tokenisasi dulu (warna tak terikat, tipografi di luar skala, struktur berulang) → `analyze_colors` / `analyze_typography` / `analyze_clusters`.
2. **Petakan target** — pilih `id` per board (atau subtree komponen untuk satu komponen saja). Generator mendecompose otomatis: master → `components/<Nama>.tsx` dengan props bertipe, instance → pemakaiannya, `tag` node → elemen semantik (`button`, `nav`, `h1`…).
3. **Token** — ikut otomatis dalam setiap export React: `tokens.css` (variabel + mode `[data-theme="dark"]`) dan `theme.css` (`@theme inline` Tailwind v4). Token saja tanpa UI → `export_code {target:'dtcg'}` → `tokens.json` W3C.
4. **Generate** — `export_code {id, target:'react-tailwind'}` per target. Opsi: `components:false` (semua inline), `tokens:false`, `typescript:false` (`.jsx`), `target:'react-css'` (CSS Modules, tanpa Tailwind). Selalu baca `warnings` di respons.
5. **Verifikasi & iterasi** — `screenshot {boardId}` lalu bandingkan dengan render halaman hasil. Desain berubah (rev naik, cek `list_documents`) → `visual_diff` untuk memastikan area yang berubah, lalu re-export `id` yang sama dan timpa berkasnya. File hasil export regeneratif: jangan diedit tangan.

## Scaffold: Next.js + Tailwind v4

```text
npx create-next-app@latest my-app --ts --tailwind --app --eslint
# taruh berkas export: <Board>.tsx + components/*.tsx → src/components/
#                        tokens.css + theme.css            → src/app/
```

```text
/* src/app/globals.css */
@import "tailwindcss";
@import "./theme.css"; /* mengimpor tokens.css + mendeklarasikan @theme */
```

```text
// src/app/page.tsx
import { PricingCard } from '@/components/PricingCard';
export default function Page() { return <PricingCard />; }
```

## Alternatif target

- **Vite + Tailwind v4**: `npm create vite@latest my-app -- --template react-ts`, `npm i -D tailwindcss @tailwindcss/vite`, tambahkan plugin `tailwindcss()` di `vite.config.ts`; `src/index.css` berisi dua `@import` yang sama.
- **Tanpa Tailwind**: `target:'react-css'` → komponen + `*.module.css` + `tokens.css` (impor `tokens.css` di root). Mode gelap dialihkan dengan atribut `data-theme="dark"` pada `<html>`.

## Aturan

- Pasang `tag` pada frame/teks di desain untuk markup semantik; konten instance yang perlu bervariasi diikat lewat `props` master, bukan override manual.
- Output statis dan 1:1 pada ukuran board; state interaktif (hover, disabled) dan responsivitas di luar lebar board adalah pekerjaan di sekitar kode hasil export.
