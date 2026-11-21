---
title: 'Aplikasi 5: kehadiran agen di kanvas (kursor, outline, baris Layers)'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: '81952c86804969be670ebd496537bfce8ab4a724'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/design/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Saat agen bekerja, kanvas hanya menampilkan garis tepi board dengan label. Desain bagian 04 "Agent presence & motion" (dan overlay di layar Activity bagian 03) meminta kursor agen yang meluncur ke node target, outline board/node yang sedang diubah, sorotan "Just changed", dan state agen pada baris Layers.

**Approach:** Viewer menurunkan "kehadiran" tiap sesi Live dari stream `GET /viewer/events` yang ada (fungsi murni), lalu Canvas menggambar kursor + outline di atas board dan LayerTree memberi state pada barisnya. Daemon menambah field opsional `bounds` (id → `[x,y,w,h]` relatif board) pada event `call` selesai untuk execute dan inspect; field lama dan tool MCP tidak berubah.

## Boundaries & Constraints

**Always:**
- **Lokasi agen** per sesi Live pada dokumen ini = call terbaru (selesai, bukan error) yang punya lokasi:
  - execute dengan `bounds`: node utama = id `created` pertama yang punya bounds, lalu id non-board pertama di `bounds`, lalu board `boards[0]`;
  - inspect: `target` (bounds dari event bila ada);
  - screenshot/export/layout_check dengan board target: seluruh board.
  Board sebuah node diambil dari indeks dokumen; node yang belum ada di indeks dilewati.
- **Execute sedang berjalan:** target belum bisa diketahui (snippet bebas). Kursor tetap di lokasi terakhir dengan state `working`; tanpa lokasi terakhir, kursor belum tampil.
- **Agent Cursor** (komponen desain): pointer + tag warna harness (Claude Code/MCP = `--agent`, Codex = `--codex`).
  - `working`: spinner, nama harness, baris aksi mono `"{tool} · {judul call}"`.
  - `idle`: nama saja.
  - Ujung pointer di tengah node/board target. Kursor tampil selama sesi Live.
- **Agent Outline:** garis putus-putus 2px radius 3 di sekeliling board lokasi. Berdenyut saat working; idle → opacity 0.45.
- **Agent Node Outline:** fill agen 6%, garis 1.5px, radius 8 (4 bila tinggi < 48px).
  - Working: di sekeliling node lokasi, berdenyut.
  - Execute selesai dalam ≤ 10 dtk terakhir: outline untuk node berubah/baru (maks 12, bukan board), muncul fade + naik 8px dengan stagger 40ms. Node utama diberi badge "Just changed". Semua tampil 1.5 dtk lalu memudar 1.5 dtk.
- **Layers:**
  - node lokasi saat working → `Layer Row/agent` (latar agen 15%, ikon/label warna agen, titik dengan halo berdenyut);
  - node `created` → slide-in 4px + fade 160ms, latar agen memudar dalam 3 dtk;
  - node berubah lain → titik agen yang memudar dalam 3 dtk.
- **Gerak** mengikuti tabel desain:
  - kursor meluncur 400ms ease-out (dalam koordinat dokumen, jadi pan/zoom tidak membuatnya tertinggal);
  - teks aksi crossfade 150ms linear;
  - denyut outline 1.6s ease-in-out (opacity 1 → 0.4).
- **`prefers-reduced-motion`:** kursor melompat, outline solid tanpa denyut, tanpa fade/rise/slide, tanpa pan kamera.
- Overlay agen disembunyikan saat pratinjau versi; overlay tidak menangkap pointer.
- Teks UI berbahasa Inggris; spec dan komentar berbahasa Indonesia.

**Never:**
- Mengubah field event yang ada, route lama, atau tool MCP.
- Menebak target execute yang masih berjalan dari teks kode.
- Menganimasikan isi PNG board (skeleton/shimmer tetap seperti sekarang).
- Viewer bergantung pada core/exec/icons.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Execute selesai membuat kartu | done, created `[c1]`, bounds c1 | kursor meluncur ke tengah c1 (idle), outline + badge di c1 lalu pudar, baris c1 slide-in | c1 belum di indeks → muncul setelah dokumen dimuat ulang |
| Execute baru mulai | running sesudah call di atas | kursor tetap di c1, state working, aksi "execute · …", outline board berdenyut | N/A |
| Execute pertama sesi | running, tanpa call sebelumnya | tanpa kursor | N/A |
| Execute gagal | status error | lokasi tidak berubah, tanpa sorotan | N/A |
| Reconnect/hello | call lama > 10 dtk | tanpa sorotan ulang; kursor hanya bila sesi Live | N/A |
| Reduced motion | media query aktif | kursor lompat, outline solid diam | N/A |

</frozen-after-approval>

## Code Map

- `packages/daemon/src/events.ts` -- `ActivityCall` (tambah `bounds?: Record<string,[number,number,number,number]>`), `finish()`: execute → `data.bounds` (sudah ≤ 60 entri, `BOUNDS_MAX` di server.ts); inspect → `{[node.id]: node.bounds}` bila ada. Validasi tuple 4 angka.
- `packages/daemon/src/events.test.ts` -- test execute sukses (:89) dan inspect: `done.bounds` sama dengan `data.bounds`.
- `packages/viewer/src/activity.ts` -- salin field `bounds` ke tipe `ActivityCall`.
- Buat `packages/viewer/src/presence.ts` + `presence.test.ts` -- fungsi murni `agentPresence(views, index, now)` → per sesi `{session, label, color, working, action?, boardId, rect?, changed:[{id, boardId, rect, created}], changedKey?}`, dan `layerMarks(presence)` → `Map<id,'agent'|'created'|'changed'>`. Pakai `SessionView` (`sessionsForSlug`), `callTitle`, `harnessLabel`, `harnessColor`, `callEndMs`.
- `packages/viewer/src/Viewer.tsx` -- ganti memo `agents` (:239-257) dengan `agentPresence`; teruskan `presence` ke Canvas dan `marks` ke `LayerTree` (:625, kelas `layer-row` + titik halo). `now` (useNow 5000) cukup untuk jendela 10 dtk; animasi pudar memakai CSS `forwards`.
- `packages/viewer/src/Canvas.tsx` -- ganti prop `agents`/`AgentMark` dengan `presence`; render board outline, node outline (koordinat board + `cam`), kursor. Hook `useGlide` (rAF 400ms ease-out di koordinat dokumen; `reducedMotion()` yang ada → lompat).
- `packages/viewer/src/app.css` -- `.agent-outline` (:2111) jadi putus-putus; tambah `.agent-node-outline`, `.agent-cursor`, `.layer-row.agent|created|changed`; blok reduced-motion (:2422).
- Tidak menyentuh `Dashboard.tsx`, `App.tsx`, `apps/desktop` (sesi paralel).

## Tasks & Acceptance

**Execution:**
- [x] `packages/daemon/src/events.ts` + `events.test.ts` -- field opsional `bounds` -- data posisi target per execute/inspect.
- [x] `packages/viewer/src/activity.ts`, `presence.ts`, `presence.test.ts` -- tipe + turunan kehadiran murni -- logika teruji tanpa DOM.
- [x] `packages/viewer/src/Canvas.tsx`, `Viewer.tsx`, `app.css` -- kursor, outline, baris Layers, gerak & reduced-motion.

**Acceptance Criteria:**
- Given viewer terbuka dan agen menjalankan execute yang menambah node, when execute selesai, then kursor agen meluncur ke node baru, outline "Just changed" tampil lalu memudar, dan baris node di Layers beranimasi masuk.
- Given `prefers-reduced-motion: reduce`, when agen berpindah target, then kursor melompat tanpa luncuran dan outline tidak berdenyut.

## Implementation Notes

- Daemon: `bounds` divalidasi (tuple 4 angka hingga), peta kosong → tanpa field. Tipe tuple dari `inspect.ts`.
- Saat execute membuat node, kursor menuju node lain/board dulu, lalu ke node baru sesudah dokumen dimuat ulang (node belum di indeks dilewati sesuai spec).
- Baris aksi kursor memudar masuk 150ms (bukan crossfade dua teks).
- Saat pratinjau versi, tanda Layers ikut disembunyikan (konsisten dengan overlay kanvas).
- Pada Windows, 4 test `events.test.ts` yang memanggil `execute` gagal karena `fsync` EPERM (masalah lama di `store.ts`); dengan shim yang mengabaikan error itu ke-15 test lolos. CI Linux adalah acuan.

## Spec Change Log

## Review Triage Log

| # | Temuan (layer) | Verdict | Bukti | Rute |
|---|---|---|---|---|
| 1 | `markColors` terpisah dari `layerMarks`: warna baris bisa dari harness lain (blind, edge, verification) | low | `markColors` menandai codex untuk node mana pun yang disentuh sesi Codex, terlepas dari tanda yang menang | patch |
| 2 | Badge "Just changed" hilang bila lokasi bukan execute itu (blind); badge bisa salah node (verification) | medium | `primary = exec === locCall ? loc.nodeId : undefined`: inspect sesudah execute → sorotan tanpa badge | patch |
| 3 | Titik baris tidak diputar ulang untuk execute kedua pada node sama (blind, edge) | low | kelas dan elemen sama, animasi `both` sudah selesai | patch |
| 4 | `.layer-row.agent` menimpa `.layer-row.selected` (blind, edge) | low | spesifisitas sama, aturan agent lebih belakang | patch |
| 5 | Ambang radius outline node memakai tinggi di layar (blind) | low | `h = r[3] * cam.z`; radius berubah saat zoom | patch |
| 6 | Snapshot hello membesar karena `bounds` (blind) | maybe-false | 100 event × ≤ 60 tuple; perlu ukur ukuran hello nyata | defer |
| 7 | 12 sorotan subset acak, container mengalahkan node baru (blind) | false | server menyusun id `[board, created, changed]`, jadi created selalu lebih dulu setelah board difilter | reject |
| 8 | Tipe tuple bounds terduplikasi (blind) | false | viewer sengaja menyalin tipe event (komentar `activity.ts`); tanpa kerugian bernama | reject |
| 9 | Tidak ada test bounds rusak di daemon (blind) | low | input dari server sendiri; jarang ditemui | reject |
| 10 | Tidak ada test komponen kanvas/LayerTree (blind, verification) | medium | tidak ada setup test DOM di viewer; overlay lama juga tanpa test | defer |
| 11 | Status agen tidak terbaca pembaca layar (blind) | low | Activity panel menyampaikan info yang sama sebagai teks | reject |
| 12 | `.agent-layer *` redundan (blind) | low | `pointer-events` diwarisi | patch |
| 13 | Execute yang membuat board: tanpa animasi baris (edge) | medium | board difilter dari `changed`, jadi `layerMarks` tidak menandainya | patch |
| 14 | Node baru di dalam parent tertutup tidak terlihat (edge) | low | buka-tutup dikendalikan pengguna; buka otomatis tiap perubahan mengganggu | reject |
| 15 | Agen di halaman lain tidak tampil (edge) | low | sesuai rancangan; Follow agent berpindah halaman | reject |
| 16 | Kursor dua langkah sebelum dokumen dimuat ulang (edge) | low | sesuai spec: node belum di indeks dilewati | reject |
| 17 | Klaim AC1 untuk board baru (edge) | medium | akar sama dengan #13 | patch (#13) |

## Verification

**Commands:**
- `pnpm build && pnpm exec vitest run packages/viewer packages/daemon/src/events.test.ts` -- hijau.
- Cek langsung di browser: lakard + agen MCP (atau curl `/execute`) dengan viewer terbuka.
