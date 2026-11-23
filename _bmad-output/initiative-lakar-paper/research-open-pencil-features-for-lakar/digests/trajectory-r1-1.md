# Digest trajectory-r1-1 — arah open-pencil dan suara penggunanya

Repo: `open-pencil/open-pencil`. Diakses 2026-11-23. Clone lokal di commit 68f8cad bersifat **shallow** (`git rev-parse --is-shallow-repository` = true, hanya 1 commit), jadi cadence dan tema diambil dari `gh`, bukan dari `git log`.

Catatan metode: sinyal reaksi di issue sangat tipis (issue teratas hanya punya 2 reaksi). Karena itu "suara pengguna" disimpulkan dari jumlah komentar, isi issue, dan Discussions, bukan dari voting. Bobotnya sesuai itu.

## Findings

### Trajectory

1. **Ritme rilis makin rapat, dengan jalur beta dan nightly.** Ada rilis bulanan pada Mar–Mei 2026 (0.11–0.13). Lalu ada jeda sekitar 2,5 bulan: 0.13.2 terbit 2026-05-30 dan 0.14.0 baru 2026-08-11. Setelah itu 0.15.0 (2026-09-16) dan 0.16.0 (2026-10-14), masing-masing dengan 3 beta. 0.17.0 (2026-11-22) didahului 6 beta dalam 3 minggu, dan sekarang ada jalur `0.18.0-nightly`. Selama jeda itu, Discussions #466 dan #666 bertanya "When's the next release?" karena master sudah 260–400+ commit lebih maju dari rilis terakhir.
   - source: `gh release list -R open-pencil/open-pencil --limit 30`; Discussions #466, #666 (via `gh api graphql`)
   - publisher: open-pencil (maintainer dannote) / pengguna; pub_date: 2026-03-30 s.d. 2026-11-22; accessed 2026-11-23; confidence: high; class: trajectory
2. **0.17.0 adalah rilis "Cloud + boards".** Catatan rilisnya: "adds OpenPencil Cloud, a self-hostable server where teams keep documents, edit them together in live rooms, share, comment, browse version history, and use AI paid from their plan's credits, and FigJam-style boards ... with draw.io and Mermaid import." Rilis ini juga membawa impor halaman web dari URL sebagai layer yang bisa diedit, formula variabel, efek glass/progressive blur/noise, "custom AI prompts and design reviews, coding-agent subagents", serta canvas progresif ("a change settles in tens of milliseconds instead of over a second").
   - source: `gh release view v0.17.0`; publisher: open-pencil; pub_date: 2026-11-22; accessed 2026-11-23; confidence: high; class: trajectory
3. **Investasi saat ini adalah Cloud yang dimonetisasi.** Dari 60 PR merged terakhir (2026-11-18 s.d. 11-23), puluhan ber-scope `cloud`: billing (#2289 "sell plans on the official production Cloud through its billing service"), seat counting (#2211), sign-in desktop (#2227, #2222), penghentian waitlist (#2307), dan "move the web app's front door to cloud.openpencil.dev" (#2306). Hampir semuanya dikerjakan dannote.
   - source: `gh pr list --state merged --limit 60`, PR #2306, #2307, #2289, #2211; publisher: open-pencil; pub_date: 2026-11-18..23; accessed 2026-11-23; confidence: high; class: trajectory
4. **Arah kedua adalah impor web/URL.** Contohnya PR #2210 "open web pages and files from a URL in the app and the CLI", #2238 "render web pages with their scripts", #2240 "import CSS backgrounds, z-index", dan #2207 "place HTML pages dropped on the canvas". 0.14.0 sebelumnya sudah menambah "Import HTML, CSS, Tailwind, and JSX as editable documents" serta ekspor `.pptx`.
   - source: PR #2207/#2210/#2238/#2240; `gh release view v0.14.0`; publisher: open-pencil; pub_date: 2026-08-11, 2026-11-18..21; accessed 2026-11-23; confidence: high; class: trajectory
5. **Roadmap resmi untuk "Current focus":** fidelitas `.fig`, Cloud yang andal untuk tim, desain sistem besar tetap responsif, **mobile** (aplikasi pendamping Cloud; editor Android sedang dikerjakan di PR #1593), **presentasi** sebagai jenis dokumen ketiga, dan "Treat the scene graph as a programmable design document: every important read, write, export, diff, and validation operation should be reachable through UI, CLI, MCP, and SDK surfaces." Local-first tetap kelas satu.
   - source: `packages/docs/development/roadmap.md` baris 10–18 (clone 68f8cad; juga https://openpencil.dev/development/roadmap); PR #2302 "plan mobile apps and presentations in the roadmaps"; publisher: open-pencil; pub_date: 2026-11-22; accessed 2026-11-23; confidence: high; class: trajectory
6. **Roadmap "Agent workflows" eksplisit.** Isinya:
   - SKILL.md resmi untuk loop "inspect → act → render/measure → compare → iterate instead of relying on one-shot prompting";
   - resep workflow AI yang teruji (termasuk "compare against a screenshot or Figma reference");
   - "structured node-tree diffs a first-class, Git-friendly review artifact";
   - lint dengan bukti expected/actual dan autofix aman;
   - paritas MCP/CLI/SDK yang diuji otomatis.
   - source: roadmap.md baris 89–100; publisher: open-pencil; pub_date: 2026-11-22; accessed 2026-11-23; confidence: high; class: trajectory
7. **Non-goals roadmap.** Yang dinyatakan bukan tujuan: akun wajib atau model cloud-only, layanan yang wajib mem-proxy kunci AI pengguna (BYOK tetap ada di samping kredit), dan "Read-only automation surfaces that cannot modify documents."
   - source: roadmap.md baris 126–131; publisher: open-pencil; pub_date: 2026-11-22; accessed 2026-11-23; confidence: high; class: positioning/trajectory
8. **Agen terus ditingkatkan dari rilis ke rilis.**
   - 0.15.0: WebMCP eksperimental untuk agen browser dengan kontrol "Off, Inspect, and Edit", eksklusi tool per permukaan (`mcp`/`ai`/`webmcp`), serta riwayat chat AI tersimpan.
   - 0.16.0: "agents you can follow" di shared room; validasi argumen MCP diperketat (`v.strictObject`).
   - 0.17.0: tool MCP digabung dan diganti nama menjadi verb-first. Ini breaking, dan "a tool disabled under its old name is enabled again". Selain itu ada coding-agent subagents dan Agent Skills.
   - source: `gh release view v0.15.0`, `v0.16.0`, `v0.17.0`; publisher: open-pencil; pub_date: 2026-09-16, 2026-10-14, 2026-11-22; accessed 2026-11-23; confidence: high; class: trajectory
9. **Breaking change tiap minor adalah pola mereka.** Setiap rilis 0.14–0.17 punya bagian "Breaking changes" yang panjang. Contohnya: room 0.17 tidak bisa bergabung dengan versi lama; ID layer `.fig` berubah sehingga "IDs printed by `openpencil tree` or MCP before this release no longer find their layers"; skema library v2; serta `openpencil-mcp` harus diperbarui bersama app (0.16).
   - source: `gh release view v0.14.0..v0.17.0`; publisher: open-pencil; pub_date: 2026-08..11; accessed 2026-11-23; confidence: high; class: trajectory

### User voice

10. **Keluhan teratas sepanjang masa adalah koneksi agen ke app.** Issue dengan komentar terbanyak adalah #240 "Claude code can not connect openpencil app" (16 komentar, v0.11.8). Error-nya: "OpenPencil app is not connected. STOP and tell the user ... Do NOT attempt to start the app yourself". Keluhan sejenis: #589 (bridge MCP 0.14.0 di Windows tidak pernah terhubung), #2250 (AppImage Linux tidak menjalankan server MCP, masih terbuka), #1584 "Make MCP sessions reliable for long-running desktop clients" (terbuka), serta Discussions #196 (3 upvote, nilai tertinggi) "MCP Setup for Different Coding Agents" dan #298 "Configuring Codex for MCP".
    - source: `gh api search/issues ... sort=comments`; `gh issue view 240`; Discussions #196, #298; publisher: pengguna GitHub; pub_date: 2026-04-30 s.d. 2026-11-19; accessed 2026-11-23; confidence: high; class: user-voice
11. **Stabilitas di bawah beban agen jadi bug terbuka yang paling banyak dibahas.**
    - #975: "document-mutation MCP tools sporadically wedge the WebView — rAF/microtask spin at 100% CPU, SIGTERM ignored, unsaved state lost" (5 komentar).
    - #976: "WASM heap corruption after render/delete churn — all mutations and saves fail ... until restart".
    - #978: `open_file` timeout pada dokumen kedua.
    - #883: "an edit made while an AI or MCP edit waits lands in its undo step".
    - #2070: app Linux kehilangan dokumen.
    - source: `gh search issues --state open "MCP"`; `gh issue view 975`; publisher: pengguna GitHub; pub_date: 2026-10-04..11-13; accessed 2026-11-23; confidence: high; class: user-voice
12. **Fidelitas impor Figma adalah tema keluhan terbesar kedua.**
    - #102 paste dari Figma (8 komentar), #69 karakter Tionghoa rusak saat impor (7), #36 frame tempelan tidak muncul di canvas (6), #379 alignment teks rusak, #578 "3,303 nodes drift on a plain read/write round-trip" (8), #1281 impor gagal pada variabel EXPRESSION, #1966 halaman tidak bisa dibuka setelah impor.
    - Kebanyakan sudah ditutup, dan maintainer memasang fidelitas sebagai fokus utama roadmap.
    - source: `gh api search/issues ... sort=comments`; `gh search issues --sort comments`; publisher: pengguna GitHub; pub_date: 2026-03..11; accessed 2026-11-23; confidence: high; class: user-voice
13. **Performa dan memori pada file besar masih bermasalah.** #255 "Problem loading large Design System" (terbuka, 6 komentar) menyebut RAM 8 GB dan "no loader indicating that is working". Ada juga #580 OOM saat membuka `.fig` dengan canvas besar dan #587 memory leak (keduanya terbuka). Klaim 0.17 tentang canvas lebih cepat dan memori lebih hemat adalah respons langsung terhadap ini.
    - source: `gh issue view 255`; issue #580, #587; publisher: pengguna GitHub; pub_date: 2026-05-10..08-24; accessed 2026-11-23; confidence: medium; class: user-voice
14. **Instalasi rapuh di awal.** Issue yang paling banyak di-+1 (hanya 2) adalah #59 "@open-pencil/mcp install fails with 'Workspace dependency not found'". Lainnya: #56 (6 komentar), #43 render tool gagal di Windows + Bun, #276 CLI crash via Bun, #357 tidak jalan di Mac Intel Sequoia, #567 clipboard diblokir di app desktop (7 komentar).
    - source: `gh api search/issues ... sort=reactions`; publisher: pengguna GitHub; pub_date: 2026-03..08; accessed 2026-11-23; confidence: medium; class: user-voice
15. **Fitur yang diminta pengguna, menurut komentar dan Discussions:**
    - persistensi dokumen bersama untuk deployment browser + MCP yang di-host (#113, terbuka) dan login + penyimpanan (#114), yang akhirnya dijawab oleh Cloud;
    - multiplayer tanpa host (#623, ditutup);
    - identitas node stabil dan serialisasi deterministik untuk format yang bisa di-diff (#770, terbuka, 7 komentar);
    - impor situs web (#107, Disc. #2173);
    - animasi berbasis kode (#37, Disc. #421);
    - plugin VS Code (#81);
    - tabel (#154);
    - impor Stitch/Pixso (#178, #244);
    - AI dengan web search, gambar, dan sandbox (#127);
    - OAuth langganan (#1280);
    - port Android (Disc. #2006);
    - komentar (Disc. #681, sudah dikirim di 0.16);
    - Storybook (Disc. #727).
    - Banyak yang kemudian masuk roadmap atau rilis, jadi maintainer jelas responsif.
    - source: `gh search issues --state open --sort comments`; Discussions listing via `gh api graphql`; publisher: pengguna GitHub; pub_date: 2026-03..11; accessed 2026-11-23; confidence: medium; class: user-voice
16. **AI mudah bingung oleh default editor.** #941: "text width by default should be auto width not auto height causing confusion for AI" (terbuka). #64: teks yang dibuat lewat MCP tampil kosong di Figma tanpa `set_font`.
    - source: `gh search issues --state open "MCP"`; reactions search; publisher: pengguna GitHub; pub_date: 2026-03-06, 2026-10-07; accessed 2026-11-23; confidence: medium; class: user-voice

### Positioning

17. **Deskripsi repo:** "AI-native design editor. Open-source Figma alternative." README: "Open-source design editor. Opens `.fig` and `.pen` design files, includes built-in AI, and ships as a programmable toolkit with a headless Vue SDK for building custom editors." Status: "Active development. Usable today, with some rough edges."
    - source: `gh repo view --json description`; README.md baris 9–11 (clone 68f8cad); publisher: open-pencil; pub_date: 2026-11-23; accessed 2026-11-23; confidence: high; class: positioning
18. **Nilai agen/MCP versi README:**
    - "AI builds designs — describe what you want in chat, 100+ tools create and modify nodes. Bring your own key";
    - "Fully programmable — headless CLI, XPath queries, Figma Plugin API ... MCP server for AI agents, and desktop agent integrations for Claude Code, Codex, Antigravity CLI, Gemini CLI, Cursor, Grok Build, and Pi".
    - Artinya mereka melayani dua jalur sekaligus: chat bawaan dan agen eksternal. Mereka juga sengaja menyalin Figma Plugin API (0.17 menyelaraskan variabel, paint, dan aturan font dengan Figma).
    - source: README.md baris 26–28; `gh release view v0.17.0`; publisher: open-pencil; pub_date: 2026-11-22; accessed 2026-11-23; confidence: high; class: positioning
19. **Pihak ketiga membingkainya sebagai "AI yang Figma tidak punya" dengan peringatan kedewasaan.** Judul daily.dev/XDA: "I tried an open-source Figma alternative, and its AI does what Figma's can't". LogRocket menyejajarkannya dengan Penpot. Ringkasan pencarian menyebut ada review yang menilai "early-stage, not production-ready". Ada juga proyek lain bernama sama (ZSeven-W/OpenPencil), jadi sumber pihak ketiga perlu dicek proyek mana yang dimaksud.
    - source: WebSearch "OpenPencil open-source Figma alternative AI review Hacker News" (hasil: https://app.daily.dev/posts/i-tried-an-open-source-figma-alternative-and-its-ai-does-what-figma-s-can-t-jlpxxyc51, https://blog.logrocket.com/ux-design/open-source-figma-alternatives/, https://medevel.com/openpencil/); publisher: daily.dev/XDA, LogRocket, Medevel; pub_date: tidak diketahui; accessed 2026-11-23; confidence: low (hanya cuplikan hasil pencarian, halaman tidak dibaca); class: positioning

### Traction

20. **Statistik repo:** 10.048 bintang, 1.096 fork, 49 watcher. Repo dibuat 2026-02-27 dan terakhir diperbarui 2026-11-23. Artinya sekitar 10 ribu bintang dalam 9 bulan.
    - source: `gh repo view --json stargazerCount,forkCount,createdAt,updatedAt`; publisher: GitHub; pub_date: 2026-11-23; accessed 2026-11-23; confidence: high; class: traction
21. **Proyek ini praktis milik satu maintainer.** Ada 87 kontributor, tetapi dannote menyumbang 3.456 commit, berikutnya sld0Ant 117 dan snatvb 42. Dari 60 PR merged terakhir, hampir semuanya dari dannote (pengecualian: #2277, #2268, #2263, #2257, #2232). Ini risiko bus-factor, dan Discussion #419 bertanya "Is this project actually active?" (2026-07-25, saat jeda rilis).
    - source: `gh api repos/.../contributors`; `gh pr list --state merged --limit 60`; Discussion #419; publisher: GitHub; pub_date: 2026-11-23; accessed 2026-11-23; confidence: high; class: traction
22. **Aktivitas issue melonjak setelah 0.16.** Jumlah issue per bulan: Mar 73, Apr 39, Mei 24, Jun 23, Jul 42, Agu 41, Sep 41, **Okt 124**, Nov 84 (sampai tanggal 23). Total 491 issue, 86 terbuka (25 berlabel bug). Nomor PR sudah mencapai #2309. Discussions aktif tetapi kecil: 23 thread, upvote maksimal 3.
    - source: `gh issue list --state all --limit 2000 --json createdAt`; graphql discussions totalCount; publisher: GitHub; pub_date: 2026-11-23; accessed 2026-11-23; confidence: high; class: traction
23. **Statistik commit mingguan tidak tersedia.** `gh api repos/.../stats/commit_activity` mengembalikan objek kosong `{}` (GitHub sedang menghitung), dan clone lokal shallow. Cadence commit hanya bisa ditaksir dari laju PR: sekitar 60 PR merged dalam 6 hari (2026-11-18..23).
    - source: perintah tersebut; confidence: medium; class: traction

## Leads worth chasing

- Isi `CHANGELOG.md` dan folder `changes/` di clone (belum dibaca) untuk rincian per-PR 0.17 dan nightly 0.18.
- Halaman https://openpencil.dev/cloud/: harga plan, kredit AI, dan model self-host Apache 2.0. Ini relevan kalau Lakar mempertimbangkan monetisasi.
- PR #1593 (editor Android) dan rencana presentasi `.deck`: perlu dicek seberapa jauh progresnya.
- #770 dan #173: format `.pen` yang bisa di-diff git dan identitas node stabil. Ini paralel langsung dengan model dokumen Lakar (AD-*).
- Halaman XDA/daily.dev dan Medevel: perlu dibaca utuh untuk keluhan dan pujian nyata dari reviewer.
- Discord proyek (tautan di README): kemungkinan besar suara pengguna ada di sana, bukan di reaksi GitHub.
- `skills/` di clone: SKILL.md resmi mereka untuk agen (loop inspect→act→render→compare), untuk dibandingkan dengan skill Lakar.

## Looked for, not found

- Thread Hacker News atau Reddit tentang open-pencil tidak muncul di hasil pencarian.
- Tidak ada issue dengan reaksi bermakna (maksimal 2), jadi peringkat permintaan berbasis voting tidak bisa dibuat.
- Riwayat git lokal sejak 2026-08-01 tidak ada karena clone shallow (1 commit).
- Statistik commit mingguan GitHub kosong.
- Tidak ada file ROADMAP di root. Roadmap hanya ada di `packages/docs/development/roadmap.md`.
- Tidak ada data jumlah pengguna Cloud, unduhan, atau pendapatan.
