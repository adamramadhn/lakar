// Emoji per run (murni), tiga angka terpisah: (a) di input tool_use agen, (b) temuan LC-01a/LC-01b Lakar, (c) menurut juri.
// Definisi emoji/glyph dari @lakar/schema: sumber yang sama dengan gerbang LC-01a/LC-01b (packages/check).
import { graphemes, isEmojiGrapheme, LC01B_CODEPOINTS, type Finding } from '@lakar/schema';
import type { TimedLine } from '../stream-metrics.js';
import { toolEvents } from '../tool-events.js';

export type TextEmojiCount = { emoji: number; glyphs: number; samples: string[] };

/** Emoji dan glyph LC-01b (dihitung terpisah, bukan emoji) di teks. */
export function countEmojiInText(text: string): TextEmojiCount {
  let emoji = 0;
  let glyphs = 0;
  const samples = new Set<string>();
  for (const g of graphemes(text)) {
    if (isEmojiGrapheme(g)) {
      emoji++;
      samples.add(g);
    } else if (LC01B_CODEPOINTS.has(g.codePointAt(0)!)) glyphs++;
  }
  return { emoji, glyphs, samples: [...samples].slice(0, 20) };
}

function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) for (const v of x) strings(v, out);
  else if (x && typeof x === 'object') for (const v of Object.values(x)) strings(v, out);
  return out;
}

/** (a) emoji di semua nilai string input `tool_use` agen (transkrip). */
export function countAgentEmoji(lines: readonly TimedLine[]): TextEmojiCount {
  const acc: TextEmojiCount = { emoji: 0, glyphs: 0, samples: [] };
  for (const ev of toolEvents(lines)) {
    if (ev.kind !== 'use') continue;
    for (const s of strings(ev.use.input)) {
      const r = countEmojiInText(s);
      acc.emoji += r.emoji;
      acc.glyphs += r.glyphs;
      for (const x of r.samples) if (!acc.samples.includes(x) && acc.samples.length < 20) acc.samples.push(x);
    }
  }
  return acc;
}

/** (b) temuan LC-01a (emoji) dan LC-01b (glyph) dari layout_check harness. */
export function countLintEmoji(findings: readonly Pick<Finding, 'rule'>[]): { lc01a: number; lc01b: number } {
  return { lc01a: findings.filter((f) => f.rule === 'LC-01a').length, lc01b: findings.filter((f) => f.rule === 'LC-01b').length };
}
