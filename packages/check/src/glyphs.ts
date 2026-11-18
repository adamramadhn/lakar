// Deteksi emoji (LC-01a) dan glyph Unicode sebagai ikon (LC-01b). Murni; teks dipakai apa adanya.
// Definisi dasar (emoji, daftar glyph) ada di @lakar/schema (satu sumber lintas paket).
import { codePoints, graphemes, isEmojiGrapheme, LC01B_CODEPOINTS, VS15 } from '@lakar/schema';

export { codePoints, cpLabel, graphemes, isEmojiGrapheme, LC01B_GLYPHS } from '@lakar/schema';

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
  if (base === undefined || !LC01B_CODEPOINTS.has(base)) return undefined;
  return { glyph, codePoint: base, grapheme: first };
}

/** Teks hanya berisi glyph daftar LC-01b (± U+FE0E) dan spasi. */
export function onlyIconGlyphs(content: string): boolean {
  let any = false;
  for (const cp of codePoints(content)) {
    if (cp === VS15 || String.fromCodePoint(cp).trim() === '') continue;
    if (!LC01B_CODEPOINTS.has(cp)) return false;
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
