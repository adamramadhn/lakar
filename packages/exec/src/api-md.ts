// `api.md` skill (AD-12) dihasilkan dari tabel `API`, `API_GLOBALS`, dan `API_REFERENCE` di api.ts. Murni, tanpa IO.
// Regenerasi file: `node scripts/gen-skill-api.mjs` setelah `pnpm build`.
import { API, API_GLOBALS, API_REFERENCE } from './api.js';

/** Isi `packages/skills/skills/api.md`. Setiap contoh berupa blok ```js mandiri untuk dokumen kosong. */
export function renderApiMarkdown(): string {
  const out: string[] = [
    '# API snippet execute',
    '',
    'Referensi lengkap fungsi global di snippet `execute` (sandbox QuickJS sinkron). Dihasilkan dari kode sumber Lakar; setiap contoh berjalan sendiri di dokumen kosong. Baca hanya bila deskripsi tool `execute` dan skill `core` belum cukup.',
    '',
    '## Fungsi',
  ];
  for (const [name, f] of Object.entries(API)) {
    out.push('', `### ${name}`, '', `\`${f.signature}\``, '', f.doc, '', `- Mengembalikan: ${f.returns}`, `- Error: ${f.errors.join(', ')}`, '', '```js', f.example, '```');
  }
  out.push('', '## Global lain', '');
  for (const g of Object.values(API_GLOBALS)) out.push(`- \`${g.signature}\`: ${g.doc}`);
  for (const s of API_REFERENCE) {
    out.push('', `## ${s.title}`, '', ...s.items.map((i) => `- ${i}`));
    if (s.example !== undefined) out.push('', '```js', s.example, '```');
  }
  return `${out.join('\n')}\n`;
}
