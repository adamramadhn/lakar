// Anotasi tool MCP (epic adopsi open-pencil story 2): satu tabel efek per tool → `ToolAnnotations` di `tools/list`.
// Tanpa anotasi, spesifikasi MCP menganggap tool menulis dan merusak (readOnlyHint false, destructiveHint true), jadi
// harness tidak bisa memberi izin baca otomatis. Tool baru wajib punya baris di sini: argumen `toolAnnotations` bertipe
// `ToolName` (nama di luar tabel gagal typecheck), dan tes `tools/list` (annotations.test.ts) menolak tool yang tidak
// ada di tabel atau terdaftar tanpa `annotations: toolAnnotations(...)`.
import type { ToolAnnotations } from '@modelcontextprotocol/server';

/**
 * Efek tool terhadap lingkungan:
 * - `read`: tidak mengubah dokumen, berkas, maupun state sesi yang tampak pengguna.
 * - `write`: mengubah sesuatu, tetapi tidak menghapus atau menimpa isi pengguna (hanya menambah, berkas ekspor, sesi).
 * - `destructive`: bisa menghapus atau menimpa isi pengguna (node yang sudah ada di dokumen).
 */
export type ToolEffect = 'read' | 'write' | 'destructive';

export const TOOL_EFFECTS = {
  status: 'read',
  read_skill: 'read',
  list_boards: 'read',
  list_documents: 'read',
  inspect: 'read',
  screenshot: 'read',
  layout_check: 'read',
  get_selection: 'read',
  icon_search: 'read',
  // Hanya mencari ke penyedia foto; impor terjadi saat foto dipakai lewat execute.
  photo_search: 'read',
  // Isi berkas dikembalikan di respons; tidak ada yang ditulis ke disk.
  export_code: 'read',
  visual_diff: 'read',
  // Mengganti dokumen aktif sesi atau membuat dokumen baru.
  open_doc: 'write',
  // Hanya menambah node baru.
  paste: 'write',
  // Menambah satu board berisi hasil impor; fetch http(s) hanya atas permintaan eksplisit (anti-SSRF di daemon).
  import_url: 'write',
  // Menulis PNG di <dataDir>/exports/, bukan isi desain.
  export: 'write',
  // Hanya membalik langkah sesi ini; ada rev lain sesudahnya → CONFLICT, jadi edit pengguna tidak tersentuh. Yang
  // terhapus hanya node tambahan sesi ini, dan isi yang diubah langkah itu kembali ke versi sebelumnya.
  undo: 'write',
  // JS bebas: bisa menghapus atau mengubah node mana pun.
  execute: 'destructive',
  // Mengulang langkah execute/paste; langkah execute bisa menghapus atau menimpa node pengguna (beda dengan undo).
  redo: 'destructive',
  // Menimpa properti node yang ada (anotasi statis: dryRun tidak mengubahnya).
  fix_check: 'destructive',
  list_pages: 'read',
  get_current_page: 'read',
  get_page_tree: 'read',
  // Hanya mengubah state sesi (halaman aktif), bukan dokumen.
  switch_page: 'write',
  // Menambah halaman baru; isi pengguna tidak dihapus/ditimpa.
  create_page: 'write',
  list_comments: 'read',
  // Audit desain baca-saja (story 9.6): frekuensi warna, gaya teks, struktur berulang.
  analyze_colors: 'read',
  analyze_typography: 'read',
  analyze_clusters: 'read',
  // Menambah thread/pesan komentar baru; node pengguna tidak dihapus/ditimpa.
  add_comment: 'write',
  reply_to_comment: 'write',
  // Mengubah status thread (resolved/open), idempoten.
  resolve_comment: 'write',
  // Menutup permintaan fix (mailbox) pada thread: status + satu pesan hasil; node pengguna tidak dihapus/ditimpa.
  fix_comment: 'write',
  // Menghapus thread komentar permanen dari dokumen.
  delete_comment: 'destructive',
} as const satisfies Record<string, ToolEffect>;

export type ToolName = keyof typeof TOOL_EFFECTS;

const ANNOTATIONS: Record<ToolEffect, ToolAnnotations> = {
  read: { readOnlyHint: true },
  write: { readOnlyHint: false, destructiveHint: false },
  destructive: { readOnlyHint: false, destructiveHint: true },
};

/** Anotasi MCP untuk tool `name`, diturunkan dari `TOOL_EFFECTS` (salinan baru tiap panggilan). */
export function toolAnnotations(name: ToolName): ToolAnnotations {
  return { ...ANNOTATIONS[TOOL_EFFECTS[name]] };
}
