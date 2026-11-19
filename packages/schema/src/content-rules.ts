// Aturan konten bersama (frasa terlarang LC-19) untuk check dan deskripsi MCP. Tanpa IO.
// Sumber = DESIGN.md "Frasa terlarang" (per bahasa) dan skill `polish.md` (baris "Frasa terlarang (kata utuh)");
// kesesuaiannya dijaga `tests/content-rules.test.ts`. Aturan check mengimpor daftar dari sini, tidak menyalinnya.

/** Frasa terlarang per bahasa, urutan sama dengan DESIGN.md. Dicocokkan tanpa beda huruf, per kata utuh. */
export const FORBIDDEN_PHRASES = {
  id: ['solusi terbaik', 'revolusioner', 'tingkatkan produktivitas', 'pelajari lebih lanjut', 'klik di sini', 'lorem ipsum', 'judul fitur'],
  en: ['learn more', 'click here', 'unlock', 'seamless', 'next-level', 'game changer', 'empower your'],
} as const satisfies { id: readonly string[]; en: readonly string[] };

export type ForbiddenLang = keyof typeof FORBIDDEN_PHRASES;

/**
 * Pengecualian (diterapkan di check LC-19, bukan di sini): teks di dalam `Input /` (placeholder/isian) dan teks bernama
 * tepat `Label` atau berleluhur `Label` (DESIGN.md: "Teks di dalam `Input /` dan layer `Label` dikecualikan").
 */
/**
 * Pengecualian LC-19: teks di dalam `Input /`, dan layer `Label` (label form). Keputusan Adam 2026-11-19 (G1):
 * pengecualian `Label` tidak berlaku di dalam komponen aksi (`Button /`, `IconButton /`, `Link /`, `Tab /`),
 * karena teks tombol generik justru anti-pattern yang ingin ditangkap.
 */
export const FORBIDDEN_EXEMPT = { inside: 'Input /', layer: 'Label', labelNotInside: ['Button /', 'IconButton /', 'Link /', 'Tab /'] } as const;

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Spasi dalam frasa = satu atau lebih whitespace; tanda hubung = hyphen ASCII, U+2010, atau U+2011. */
const pattern = (p: string): string => escape(p).replace(/ /g, '\\s+').replace(/-/g, '[-‐‑]');

const PHRASES: readonly { phrase: string; lang: ForbiddenLang }[] = (Object.keys(FORBIDDEN_PHRASES) as ForbiddenLang[]).flatMap((lang) =>
  FORBIDDEN_PHRASES[lang].map((phrase) => ({ phrase, lang })),
);
const MATCHERS = PHRASES.map((p) => ({ ...p, re: new RegExp(`(?<![\\p{L}\\p{N}_])${pattern(p.phrase)}(?![\\p{L}\\p{N}_])`, 'iu') }));

/** Frasa terlarang yang muncul di `text` (kata utuh, tanpa beda huruf), urutan daftar, tanpa duplikat. */
export function forbiddenPhrasesIn(text: string): { phrase: string; lang: ForbiddenLang }[] {
  return MATCHERS.filter((m) => m.re.test(text)).map(({ phrase, lang }) => ({ phrase, lang }));
}
