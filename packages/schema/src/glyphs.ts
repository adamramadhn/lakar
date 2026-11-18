// Definisi emoji (LC-01a) dan glyph Unicode sebagai ikon (LC-01b): satu sumber untuk check dan paket lain yang
// menghitung emoji. Murni, tanpa IO; teks dipakai apa adanya (render menyimpan salinannya sendiri).

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });

/** Glyph yang tidak boleh dipakai sebagai ikon (daftar persis aturan produk). */
export const LC01B_GLYPHS = '★☆✓✔✗→←↑↓↗↘▶◀•';
/** Code point glyph `LC01B_GLYPHS`. */
export const LC01B_CODEPOINTS: ReadonlySet<number> = new Set([...LC01B_GLYPHS].map((c) => c.codePointAt(0)!));

/** ©, ®, ™: bukan emoji walau bertanda presentasi. */
const EMOJI_EXCLUDED = new Set([0xa9, 0xae, 0x2122]);
/** Variation selector teks (U+FE0E). */
export const VS15 = 0xfe0e;
const VS16 = 0xfe0f;
const ZWJ = 0x200d;
const KEYCAP = 0x20e3;

const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u;
const EMOJI = /^\p{Emoji}$/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const KEYCAP_BASE = /^[0-9#*]$/;

export const codePoints = (s: string): number[] => [...s].map((c) => c.codePointAt(0)!);
export const graphemes = (s: string): string[] => Array.from(segmenter.segment(s), (x) => x.segment);
export const cpLabel = (cp: number): string => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

/** Grapheme `g` adalah emoji (definisi LC-01a: Emoji_Presentation, atau pictographic + VS16; © ® ™ dikecualikan). */
export function isEmojiGrapheme(g: string): boolean {
  const cps = codePoints(g);
  const base = cps[0];
  if (base === undefined || EMOJI_EXCLUDED.has(base)) return false;
  const baseChar = String.fromCodePoint(base);
  if (EMOJI_PRESENTATION.test(g)) return true;
  if (cps.includes(VS16) && EMOJI.test(baseChar)) return true;
  if (cps.includes(KEYCAP) && KEYCAP_BASE.test(baseChar)) return true;
  if (cps.includes(ZWJ) && PICTOGRAPHIC.test(g)) return true;
  return false;
}
