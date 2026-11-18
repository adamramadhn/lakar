// Emoji per run (murni), tiga angka terpisah: (a) di input tool_use agen, (b) temuan LC-01a/LC-01b Lakar, (c) menurut juri.
// Definisi emoji disamakan dengan packages/check/src/glyphs.ts (LC-01a); bench tidak boleh mengimpor check.
import type { Finding } from '@lakar/schema';
import type { TimedLine } from '../stream-metrics.js';

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
/** Glyph yang tidak boleh dipakai sebagai ikon (LC-01b). */
export const LC01B_GLYPHS = '★☆✓✔✗→←↑↓↗↘▶◀•';
const LC01B_SET = new Set([...LC01B_GLYPHS].map((c) => c.codePointAt(0)!));
const EMOJI_EXCLUDED = new Set([0xa9, 0xae, 0x2122]);
const VS16 = 0xfe0f;
const ZWJ = 0x200d;
const KEYCAP = 0x20e3;
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u;
const EMOJI = /^\p{Emoji}$/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const KEYCAP_BASE = /^[0-9#*]$/;

const codePoints = (s: string): number[] => [...s].map((c) => c.codePointAt(0)!);

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

export type TextEmojiCount = { emoji: number; glyphs: number; samples: string[] };

/** Emoji dan glyph LC-01b (dihitung terpisah, bukan emoji) di teks. */
export function countEmojiInText(text: string): TextEmojiCount {
  let emoji = 0;
  let glyphs = 0;
  const samples = new Set<string>();
  for (const { segment: g } of segmenter.segment(text)) {
    if (isEmojiGrapheme(g)) {
      emoji++;
      samples.add(g);
    } else if (LC01B_SET.has(g.codePointAt(0)!)) glyphs++;
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
  for (const { line } of lines) {
    let ev: any;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev?.type !== 'assistant' || !Array.isArray(ev.message?.content)) continue;
    for (const c of ev.message.content) {
      if (c?.type !== 'tool_use') continue;
      for (const s of strings(c.input)) {
        const r = countEmojiInText(s);
        acc.emoji += r.emoji;
        acc.glyphs += r.glyphs;
        for (const x of r.samples) if (!acc.samples.includes(x) && acc.samples.length < 20) acc.samples.push(x);
      }
    }
  }
  return acc;
}

/** (b) temuan LC-01a (emoji) dan LC-01b (glyph) dari layout_check harness. */
export function countLintEmoji(findings: readonly Pick<Finding, 'rule'>[]): { lc01a: number; lc01b: number } {
  return { lc01a: findings.filter((f) => f.rule === 'LC-01a').length, lc01b: findings.filter((f) => f.rule === 'LC-01b').length };
}
