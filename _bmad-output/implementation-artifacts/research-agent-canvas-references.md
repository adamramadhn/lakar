---
title: 'Referensi: agen di canvas (open-pencil, Paper, pen.dev, skill Emil Kowalski)'
created: '2026-11-23'
sources:
  - 'https://github.com/open-pencil/open-pencil @ 6e70fe7945da637c1304b97d42a95f3812278f19'
  - 'https://paper.design/ (demo HTML hidup di bawah tombol download, dibaca 2026-11-23)'
  - 'https://www.pen.dev/ (CSS landing + video import-preview-0b5ca298b64f.mp4, dibaca 2026-11-23)'
  - 'https://github.com/emilkowalski/skills @ 64eb3deb9a5fbfa041faf783e0bc3fd635872e9c (MIT)'
---

# Referensi agen di canvas

Catatan riset untuk tiga spec: agen bekerja di dokumen terbuka (`spec-agent-open-doc.md`), skill desain dari Emil Kowalski, dan efek canvas saat agen bekerja. Angka diambil langsung dari kode atau CSS sumbernya.

## 1. MCP open-pencil (`packages/mcp`)

- **Rantai koneksi:** stdio → server HTTP/WebSocket → webview editor. Semua tool berjalan di editor hidup (tidak headless). Hanya satu aplikasi terhubung; register yang lebih baru menggantikan yang lama.
- **Urutan pemilihan dokumen** (`src/app/automation/bridge/handlers.ts:143-158`, `target.ts`):
  1. `document_id` eksplisit;
  2. dokumen terakhir yang dipakai sesi MCP itu (dipaku; pindah tab tidak memindahkan agen);
  3. tab aktif.

  Dokumen terpaku ditutup → error yang menunjuk `list_documents`. Tidak ada dokumen → error yang menyebut `create_document`/`open_document`; tidak pernah membuat diam-diam.
- **Setiap respons membawa `target`** `{documentId, documentName, path, pageId, pageName}`.
- **Tool dokumen:** `list_documents` (tab + flag `active`), `activate_document`, `open_document`, `create_document`, `save_document`, `close_document`, `undo`/`redo`.
- **Edit:** setiap panggilan yang mengubah dokumen = satu langkah undo "Agent: …" dengan lock per dokumen. `undo` menolak membatalkan edit pengguna.
- **Aplikasi mati:** pesan tetap "STOP and tell the user… start OpenPencil, open a document… Do NOT attempt to start the app yourself".
- **Skill** (`skills/open-pencil/`, satu skill): manual tool + sintaks JSX, tanpa panduan rasa desain. Aturan yang layak ditiru:
  - jangan mengubah seleksi dan viewport pengguna kecuali diminta;
  - pakai Hug untuk halaman panjang, jangan menebak tinggi;
  - verifikasi dengan pixel diff bahwa hanya area yang dimaksud berubah.

## 2. Efek canvas saat agen bekerja

### Paper (demo HTML/CSS hidup)
| Efek | Nilai |
|---|---|
| Node baru dari agen muncul | `visibility:hidden` → opacity 0→1, 300 ms `cubic-bezier(.16,1,.3,1)` |
| Node yang sedang ditulis | Outline biru `#4D94FB` |
| Log aktivitas (`terminal-chunk-in`) | opacity 0→1, blur 2px→0, translateY 4px→0, 600 ms `cubic-bezier(.16,1,.3,1)` |
| `enter` | blur 5px, opacity 0, translateY 8px → normal; 800 ms `cubic-bezier(.25,.46,.45,.94)`; delay `--stagger × .1s` |
| Cursor agen | `cursor-reveal`/`cursor-exit`: opacity + scale 0.5↔1 |
| Avatar agen di presence | Lingkaran 22px biru, ikon robot; keluar 400 ms opacity→0, scale→0.6 |
| Pan kamera ke artboard berikutnya | 1000 ms `cubic-bezier(.4,0,0,1)` |

Indikator titik-titik biru kecil tampil di atas artboard selama agen bekerja.

### pen.dev
- **Video `import-preview`:** beberapa agen membangun varian paralel ("create 5 variations"). Masing-masing punya:
  - cursor berwarna dengan label pil nama model (Opus oranye, GPT biru, Minimax hijau, Kimi);
  - label "✦ Generating: N. Nama" di atas board;
  - border board berwarna agen.

  Isi board muncul bertahap per bagian.
- **CSS landing:**
  - `g-build`: opacity 0, translateY 14px → normal, 650 ms `cubic-bezier(.16,1,.3,1)`, delay per elemen.
  - `g-scan`: reveal kiri→kanan 3 s linear, diikuti garis cursor 1px `#6F9DF9` (`#4F86F7` tema terang) yang memudar di 92–100%. Ini yang paling mendekati "shimmer".
  - `g-wipe`: sapuan 1.1 s `cubic-bezier(.16,1,.3,1)` dengan blur 1.5px pada 12% awal.

### open-pencil (Skia/WebGL; tanpa shimmer dan tanpa fade-in node)
- **Pulse kerja:** outline 2px, 5px di luar node, opacity gelombang sinus 0.3↔0.8, periode 1.5 s, `#4285F5`. Kode ada tetapi tidak dipanggil.
- **Flash selesai:** hijau `#29BA5C`, 800 ms (0→1 di 30% awal, lalu 1→0).
- **Flash mendarat:** padding 30→0 dalam 200 ms easeInOutQuad, tahan 400 ms, pudar 300 ms `1-t²`.
- **Cursor agen:**
  - meluncur 180 ms easeOutCubic, dimulai dari posisi saat itu;
  - label pil putih dengan garis warna agen dan ikon sparkle;
  - disembunyikan saat idle;
  - follow kamera 260 ms.

### Arah untuk Lakar (canvas DOM)
1. Node baru dari agen: opacity 0→1 + blur kecil + translateY 4–14px, 300–650 ms `cubic-bezier(.16,1,.3,1)`, stagger. Dipicu event edit agen, tidak saat dokumen dibuka.
2. Board yang sedang dikerjakan: label "✦ Generating…" + border warna agen; opsional sapuan ala `g-scan` sebagai shimmer.
3. Node yang sedang ditulis: outline warna agen (selaraskan dengan outline dan "Just changed" yang sudah ada).
4. Cursor per agen dengan warna + nama model; reveal dan exit dengan scale 0.5↔1; `transition: transform 180ms cubic-bezier(.33,1,.68,1)`.
5. Panel Activity: baris baru dengan efek `terminal-chunk-in`.

Wajib didesain dulu di `design/lakar-ui.pen` section 04 (Agent presence & motion) sebelum dikodekan.

## 3. Skill Emil Kowalski (aiforui.dev/skills, MIT)

Ditulis untuk agen yang menulis kode web, jadi harus diadaptasi ke `execute`/model dokumen Lakar, bukan disalin. Atribusi + teks lisensi MIT wajib ikut.

| Kelompok | Skill | Rencana |
|---|---|---|
| Skill MCP Lakar (diadaptasi) | `break-ui` | Skill opsional di langkah review: isi board dengan data terburuk (nama panjang, email tanpa spasi, angka besar, daftar kosong, field hilang), cek truncate/wrap/clamp |
| | `emil-design-eng` (bagian non-animasi) | Ringkas ke skill `ui`/`review` (polish komponen, format review) |
| | `prototype` | Panduan varian yang benar-benar beda arah (alur "buat N variasi") |
| Skill pengembangan (`.claude/skills/`) | `animate`, `choreograph`, `review-animations`, `animation-performance`, `learn-taste` | Untuk agen yang membangun efek canvas Lakar |
| Tidak relevan | `animate-expo`, `ask-sonner`, `mobile-native`, `write-swift`, `gestures`, `pick-ui-library` | — |

Kendala: `tests/skills.test.ts` membatasi muatan (core + 8 domain + 1 jenis layar ≤ 9.600 token, "turun saja, jangan naik"). Tambahan masuk sebagai skill opsional, atau diimbangi pemangkasan.
