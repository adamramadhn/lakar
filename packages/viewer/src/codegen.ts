// Layer manual (aplikasi 4): kode snippet `execute` untuk sisip/hapus layer dari viewer. Fungsi murni: nilai
// selalu lewat JSON.stringify (nama board/ikon dari dokumen tidak pernah disisipkan mentah ke kode).
// Deskripsi execute selalu 3–8 kata (aturan daemon), mis. "Insert rectangle into Desktop board".

export type InsertKind = 'frame' | 'rect' | 'ellipse' | 'text' | 'image' | 'icon';

/** Urutan tool/menu sisip dengan label UI dan shortcut. */
export const INSERT_KINDS: readonly { kind: InsertKind; label: string; key: string }[] = [
  { kind: 'frame', label: 'Frame', key: 'F' },
  { kind: 'rect', label: 'Rectangle', key: 'R' },
  { kind: 'ellipse', label: 'Ellipse', key: 'O' },
  { kind: 'text', label: 'Text', key: 'T' },
  { kind: 'image', label: 'Image', key: 'Shift+Ctrl+K' },
  { kind: 'icon', label: 'Icon', key: 'I' },
];

/** Board baru dari tool Frame di area kanvas kosong. */
export const NEW_BOARD = { width: 400, height: 300 } as const;
/** Sisipan dari menu "+": kiri atas board + 40px. */
export const MENU_OFFSET = 40;
/** Lebar maksimum node gambar (rasio dijaga). */
export const IMAGE_MAX_WIDTH = 400;
/** Batas unggahan gambar (sama dengan `ASSET_UPLOAD_MAX` daemon). */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

/** Data tambahan per tipe: gambar terunggah dan ikon terpilih. */
export type InsertExtra = { image?: { assetId: string; width: number; height: number }; icon?: { lib: string; icon: string } };

const SHAPE_FILL = [{ type: 'solid', color: '#D9D9D9' }];

/** Ukuran node gambar: lebar ≤ 400, rasio dijaga (1200×800 → 400×267). */
export function imageBox(width: number, height: number): { width: number; height: number } {
  const w = Math.max(1, Math.min(IMAGE_MAX_WIDTH, Math.round(width)));
  return { width: w, height: Math.max(1, Math.round((height * w) / Math.max(1, width))) };
}

/** Properti node default per tipe (tanpa posisi). Image/Icon butuh `extra`. */
export function nodeProps(kind: InsertKind, extra: InsertExtra = {}): Record<string, unknown> {
  switch (kind) {
    case 'frame':
      return { type: 'frame', name: 'Frame', layout: 'none', width: 200, height: 200 };
    case 'rect':
      return { type: 'rect', name: 'Rectangle', width: 200, height: 120, fills: SHAPE_FILL };
    case 'ellipse':
      return { type: 'ellipse', name: 'Ellipse', width: 120, height: 120, fills: SHAPE_FILL };
    case 'text':
      return { type: 'text', name: 'Text', content: 'Text', family: 'Inter', size: 16, color: '#111111' };
    case 'image': {
      if (!extra.image) throw new Error('image butuh assetId');
      return { type: 'rect', name: 'Image', ...imageBox(extra.image.width, extra.image.height), fills: [{ type: 'image', assetId: extra.image.assetId, fit: 'cover' }] };
    }
    case 'icon': {
      const { lib, icon } = extra.icon ?? { lib: 'lucide', icon: 'star' };
      return { type: 'icon', name: `Icon / ${lib} / ${icon}`, lib, icon, size: 24 };
    }
  }
}

const KIND_WORD: Record<InsertKind, string> = { frame: 'frame', rect: 'rectangle', ellipse: 'ellipse', text: 'text', image: 'image', icon: 'icon' };

/** Kata-kata nama (maks `max`), tanpa karakter kontrol; kosong → []. */
function nameWords(name: string, max: number): string[] {
  return name
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max);
}

const sentence = (...parts: (string | string[])[]) => parts.flat().join(' ');

const r = (n: number) => Math.round(n);

/** Sisip node `kind` ke board `board` di (x, y) koordinat board. */
export function insertIntoBoard(kind: InsertKind, board: { id: string; name: string }, x: number, y: number, extra: InsertExtra = {}): { code: string; description: string } {
  const node = { ...nodeProps(kind, extra), position: 'absolute', x: r(x), y: r(y) };
  const words = nameWords(board.name, 4);
  return {
    code: `add(${JSON.stringify(board.id)}, ${JSON.stringify(node)});`,
    description: sentence('Insert', KIND_WORD[kind], 'into', words, 'board'),
  };
}

const boardNode = (x: string, y: string) =>
  `{type: 'board', name: 'Frame', x: ${x}, y: ${y}, width: ${NEW_BOARD.width}, height: ${NEW_BOARD.height}, screen: 'app', fills: [{type: 'solid', color: '#FFFFFF'}]}`;

/** Board baru 400×300 di (x, y) koordinat halaman (tool Frame di area kosong). */
export function insertBoardAt(x: number, y: number): { code: string; description: string } {
  return { code: `add(null, ${boardNode(String(r(x)), String(r(y)))});`, description: 'Add new frame board to page' };
}

/** Board baru 400×300 di posisi bebas `place` (menu "+" tanpa board). */
export function insertBoardPlaced(): { code: string; description: string } {
  return { code: `const p = place(${NEW_BOARD.width}, ${NEW_BOARD.height});\nadd(null, ${boardNode('p.x', 'p.y')});`, description: 'Add new frame board to page' };
}

/** Hapus node `id` (board juga boleh). */
export function removeNode(node: { id: string; name: string; type: string }): { code: string; description: string } {
  const isBoard = node.type === 'board';
  const words = nameWords(node.name, 5);
  return {
    code: `remove(${JSON.stringify(node.id)});`,
    description: words.length ? sentence('Delete', words, isBoard ? 'board' : 'layer') : isBoard ? 'Delete selected board' : 'Delete selected layer',
  };
}

/** Jumlah kata deskripsi (sama dengan aturan daemon). */
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Teks toast untuk execute gagal: pesan + hint, tanpa bagian perbaikan `editId` (khusus agen).
 */
export function failureText(message: string, hint: string): string {
  const useful = hint
    .split(/;\s*/)
    .map((h) => h.trim())
    .filter((h) => h && !/editId|execute\(/.test(h))
    .join('; ');
  return useful ? `${message} (${useful})` : message;
}

/** Validasi file gambar sebelum unggah: tipe raster dan ukuran. Undefined = boleh. */
export function imageFileProblem(file: { name: string; type: string; size: number }): string | undefined {
  // Sebagian sistem tidak mengisi `type` (mis. .webp): jatuh ke ekstensi. Daemon tetap memeriksa magic bytes.
  const ok = file.type ? (IMAGE_TYPES as readonly string[]).includes(file.type) : /\.(png|jpe?g|webp|gif)$/i.test(file.name);
  if (!ok) return 'Choose a PNG, JPEG, WebP, or GIF image.';
  if (file.size > IMAGE_MAX_BYTES) return 'Image is larger than 20 MB.';
  return undefined;
}
