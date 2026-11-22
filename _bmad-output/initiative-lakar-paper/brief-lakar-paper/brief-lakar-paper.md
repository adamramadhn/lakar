# Brief: Lakar setara paper.design

Input untuk initiative-lakar-paper. Dicatat Sofia dari arahan Fatmuh (2026-11-22) dan dokumentasi publik paper.design (dibaca 2026-11-22).

## §Arahan pemilik

- Pemilik keputusan sekarang Fatmuh, bukan Adam lagi. Arah lama boleh diubah.
- Target: Lakar "persis seperti paper.design" dalam empat hal:
  - editor penuh;
  - komponen dan token;
  - ekspor dan sinkron kode;
  - pembanding kualitas agen.
- Tingkat kemiripan: setara fitur dan alur kerja. UI tetap desain Lakar yang sudah ada di `design/lakar-ui.pen` ("UI udah ada dari pen").
- Pemakaian: lokal dulu. Akun menyusul di pengembangan berikutnya.
- Nasib gerbang G1 lama dan bentuk wadah diserahkan ke Sofia ("yang baik menurut kamu").

## §Apa itu Paper

Sumber: https://paper.design, https://paper.design/llms.txt.

- Paper adalah alat desain berbasis HTML dan CSS. Canvas merender HTML/CSS asli, bukan representasi vektor abstrak.
- Desain bisa diekspor sebagai kode React.
- Agen AI membaca dan menulis desain lewat MCP.
- Alur dua arah: dari desain ke kode, dan dari kode ke canvas.
- Paper Desktop (macOS) menjalankan server MCP lokal. MCP hosted juga tersedia (`https://mcp.paper.design`, OAuth).

## §Editor

Sumber: https://paper.design/roadmap, bagian "everything you expect from a pro tool".

- Canvas desain profesional: edit langsung, panel properti, layout dengan CSS asli.
- CSS Grid sedang direncanakan.
- Pen tool dan edit vektor sedang dikerjakan, dengan detail SVG yang terjaga (https://paper.design/docs/svg).
- Paste ke canvas sebagai layer yang bisa diedit: dari HTML, dari Figma, dan dari situs langsung lewat ekstensi Snapshot (https://paper.design/docs/paste).

## §Agen di canvas

Sumber: https://paper.design/docs/mcp, roadmap.

- Agen melihat canvas dan bisa membaca serta menulis. Contoh pemakaian:
  - membuat layout;
  - menarik konten atau data nyata;
  - mengubah frame terpilih menjadi kode;
  - membuat varian responsif;
  - mengecek konsistensi.
- Ada satu dialog "Connect your agent" untuk Claude, Codex, Cursor, OpenCode, Copilot, VS Code, dan agen stdio lain.
- Asisten agen yang sadar canvas sudah selesai. Remix lewat klik kanan masih direncanakan.

## §Token dan tema

Sumber: https://paper.design/docs/tokens.

- Token (CSS variables) yang didukung: warna, radius, spacing, container, breakpoint, font family, font weight, font size, line height, dan letter spacing.
- Token dikelola di tab Theme. Pengguna bisa memilih token di panel properti, melepasnya (detach), mengubahnya dengan efek ke semua pemakai, menyalinnya antar-file, dan menyalinnya ke file CSS.
- Agen bisa membuat token dari desain atau dari CSS variables di codebase.
- Roadmap: kelas tema (gaya teks gabungan) dan mode tema (dark, compact).

## §Komponen

Sumber: roadmap.

- Komponen dengan props dan slot, selaras dengan konsep kode (coming soon).
- Komponen kode dari codebase dipakai di canvas (in progress).
- Kit komponen, icon pack, dan shadcn (coming soon).

## §Kode

Sumber: llms.txt, roadmap.

- Ekspor ke React, dan Tailwind idiomatik untuk impor dan ekspor (in progress).
- Sinkron token, gaya, dan komponen antara codebase dan canvas lewat agen.

## §Di luar untuk sekarang

Fitur Paper yang menyangkut akun, tim, atau cloud:
- berbagi dan izin;
- hosting aset/CDN;
- MCP hosted dengan akun;
- kolaborasi.

Pemilik memilih lokal dulu, dan akun menyusul di pengembangan berikutnya.
