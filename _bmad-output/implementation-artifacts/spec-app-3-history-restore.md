---
title: 'Aplikasi 3: History Restore, Compare, dan pratinjau versi'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'da79ddee018ca60c05be670fa9e9b558d73fdcfd'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/design/README.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-viewer-b-slice-2.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Tab History hanya daftar baca-saja. Riwayat di disk hanya menyimpan ringkasan op (`opsSummary`), bukan isi dokumen, jadi versi lama tidak bisa dilihat atau dipulihkan. Desain (`Viewer — Desktop — History`) punya Compare (Before/After), banner pratinjau, dan Restore.

**Approach:**
- Simpan snapshot dokumen per rev saat commit.
- Tambah route baca snapshot, render snapshot, dan restore.
- Di viewer: klik entri → pratinjau versi lama di kanvas (baca-saja, dengan banner "Previewing …", "Back to latest", "Restore this version").
- Tombol Compare menampilkan thumbnail Before/After board yang berubah.

## Boundaries & Constraints

**Always:**
- **Snapshot.**
  - **Lokasi:** `<dataDir>/docs/.snapshots/<slug>/r<rev>.lakar.json`, ditulis atomik sesudah `store.commit` berhasil.
  - **Kegagalan:** snapshot gagal hanya dicatat di log, tidak menggagalkan commit/execute. Respons `/execute` dan perilaku bench tidak berubah.
  - **Retensi:** 200 rev terakhir per dokumen; yang lebih lama dihapus.
- **Snapshot ikut operasi file batch 1:**
  - Rename memindahkan folder snapshot.
  - Duplicate tidak menyalin snapshot.
  - Archive/unarchive memindahkan folder ke `archive/.snapshots/`.
  - Delete menghapusnya.
- **Route baru.**
  - `GET /viewer/docs/:slug/revs/:rev` → `{doc}` atau 404 `NOT_FOUND` (hint "versi ini dibuat sebelum snapshot tersedia").
  - `POST /viewer/docs/:slug/revs/:rev/screenshot {boardId}` → PNG base64, bentuknya sama dengan `/screenshot`.
  - `POST /viewer/docs/:slug/restore {rev}` → commit baru di bawah `docLocks`, berisi isi snapshot. Rev naik, dan entri history berdeskripsi `Restored r<rev>` dengan sessionId sesi viewer. Event activity tetap dipancarkan seperti execute (pakai jalur `ActivityBus` yang ada) agar agen dan viewer lain ikut melihat.
- **`GET /viewer/docs/:slug/history`** menambah field opsional `snapshot: boolean` per entri. Field lama tidak berubah.
- **Viewer.**
  - Entri tanpa snapshot menampilkan Compare/Restore nonaktif dengan tooltip "No snapshot for this version".
  - Pratinjau menonaktifkan tool edit (batch 4) dan memakai screenshot snapshot.
  - Restore meminta konfirmasi singkat.
- Teks UI berbahasa Inggris; spec dan komentar berbahasa Indonesia.

**Never:**
- Merekonstruksi versi lama tanpa snapshot.
- Diff per node / teks.
- Mengubah format `.history.jsonl`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Commit menulis snapshot | execute r5 sukses | `r5.lakar.json` ada | tulis gagal → log, execute tetap ok |
| Retensi | 201 commit | r1 terhapus, r2..r201 ada | N/A |
| Restore | `{rev:3}`, latest r7 | r8 = isi r3, history "Restored r3" | rev tanpa snapshot → 404 |
| Restore saat agen bekerja | execute agen berjalan | diserialkan oleh `docLocks` | N/A |
| Rename/archive/delete | dokumen punya snapshot | folder snapshot ikut dipindah/dihapus | N/A |
| Pratinjau | klik entri r3 | kanvas menampilkan r3 + banner; tool edit nonaktif | screenshot gagal → pesan di kanvas |

</frozen-after-approval>

## Code Map

- `packages/daemon/src/store.ts` -- `commit()` (:113-148): tambah tulis snapshot sesudah commit, dengan fungsi tulis atomik yang ada. Operasi file batch 1 (`rename`/`archive`/`remove`) diperluas untuk folder snapshot.
- `packages/daemon/src/viewer.ts` -- `GET /viewer/docs/:slug/history` (:164-192): tambah `snapshot`.
- `packages/daemon/src/files.ts` (batch 1) -- tempat route restore/revs, karena butuh `docLocks`/`docs`/`sessions`. Restore memakai jalur commit yang sama dengan execute (`store.commit`, `docs.set`, event activity).
- `packages/daemon/src/chromium.ts` -- `screenshot(doc, boardId)` menerima dokumen apa pun; render snapshot tanpa menyimpannya ke `docs`.
- `packages/viewer/src/{HistoryPanel.tsx,history.ts,Viewer.tsx,Canvas.tsx,api.ts}` -- panel, mode pratinjau di Viewer, dan cache screenshot per `slug@rev`.

## Tasks & Acceptance

**Execution:**
- [x] daemon snapshot + route + `history-restore.test.ts` (seluruh matriks).
- [x] viewer History Compare/Restore/pratinjau + test logika murni.

**Acceptance Criteria:**
- Given dokumen dengan beberapa rev, when klik entri lama → Restore this version → konfirmasi, then kanvas kembali ke isi versi itu sebagai rev baru, dan entri "Restored r<rev>" muncul di History.

## Implementation Notes

- 2026-11-21 (subagen implementasi): snapshot ditulis di `DocStore.commit` sesudah dokumen tersimpan (`#writeAtomic` dengan direktori target), JSON ringkas; retensi `SNAPSHOT_KEEP` = 200 dipangkas setiap tulis; gagal → `console.warn`. Duplicate tidak menyalin folder, tetapi commit r0 salinan menulis snapshot r0 miliknya sendiri. `dropOrphanHistory` juga membuang folder snapshot yatim (slug dipakai ulang).
- `readRevision` (files.ts) dipakai GET revs, screenshot revs (export.ts, karena butuh RenderPort/ikon), dan Restore: snapshot dengan `id` dokumen berbeda atau rev di atas rev kini dianggap tidak ada; rev terkini tanpa snapshot memakai dokumen kini (bukan rekonstruksi).
- History: `snapshot: true` hanya ditulis bila ada (bentuk entri lama tetap persis sama).
- Restore: `sessionId` = `lakar-viewer` (identitas sesi viewer yang sama dengan entri kelola file batch 1); `opsSummary` = `restore`; respons `{slug, rev, restoredFrom}`. Event bus: call `tool: 'restore'`, `client: 'lakar-viewer'` running → done/error. Viewer menyaring call `lakar-viewer` dari Activity, kecuali `restore` dipakai `revChange` untuk memuat ulang dokumen.
- Viewer: kanvas pratinjau menyembunyikan Export, pill Checks, dan outline agen; Inspect hanya JSON versi itu (tanpa `/inspect`). Belum ada tool edit; prop `preview` Canvas adalah sinyal nonaktif untuk batch 4.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm build && pnpm exec vitest run packages/daemon/src/history-restore.test.ts packages/viewer` -- hijau.
