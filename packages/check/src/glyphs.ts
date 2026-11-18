// Deteksi emoji (LC-01a) dan glyph Unicode sebagai ikon (LC-01b). Murni; teks dipakai apa adanya.

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });

/** Glyph yang tidak boleh dipakai sebagai ikon (daftar persis aturan produk). */
export const LC01B_GLYPHS = '★☆✓✔✗→←↑↓↗↘▶◀•';
const LC01B_SET = new Set([...LC01B_GLYPHS].map((c) => c.codePointAt(0)!));

/** ©, ®, ™: bukan emoji walau bertanda presentasi. */
const EMOJI_EXCLUDED = new Set([0xa9, 0xae, 0x2122]);
const VS15 = 0xfe0e;
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

/** Grapheme `g` adalah emoji (definisi LC-01a). */
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

/** Grapheme emoji di `content` (urut kemunculan, termasuk duplikat). */
export function emojiIn(content: string): string[] {
  return graphemes(content).filter(isEmojiGrapheme);
}

/** Glyph ikon terdepan (LC-01b): grapheme non-spasi pertama, U+FE0E dibuang, base di daftar, bukan emoji. */
export function leadingIconGlyph(content: string): { glyph: string; codePoint: number; grapheme: string } | undefined {
  const first = graphemes(content).find((g) => g.trim() !== '');
  if (first === undefined || isEmojiGrapheme(first)) return undefined;
  const glyph = String.fromCodePoint(...codePoints(first).filter((cp) => cp !== VS15));
  const base = glyph.codePointAt(0);
  if (base === undefined || !LC01B_SET.has(base)) return undefined;
  return { glyph, codePoint: base, grapheme: first };
}

/** Teks hanya berisi glyph daftar LC-01b (± U+FE0E) dan spasi. */
export function onlyIconGlyphs(content: string): boolean {
  let any = false;
  for (const cp of codePoints(content)) {
    if (cp === VS15 || String.fromCodePoint(cp).trim() === '') continue;
    if (!LC01B_SET.has(cp)) return false;
    any = true;
  }
  return any;
}

/** Ikon lucide pengganti untuk glyph LC-01b (saran di temuan). */
export const GLYPH_ICON: Readonly<Record<string, string>> = {
  '★': 'star',
  '☆': 'star',
  '✓': 'check',
  '✔': 'check',
  '✗': 'x',
  '→': 'arrow-right',
  '←': 'arrow-left',
  '↑': 'arrow-up',
  '↓': 'arrow-down',
  '↗': 'arrow-up-right',
  '↘': 'arrow-down-right',
  '▶': 'play',
  '◀': 'chevron-left',
  '•': 'dot',
};
