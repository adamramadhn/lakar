// Tulis packages/skills/skills/api.md dari @lakar/exec (AD-12). Jalankan setelah `pnpm build`.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderApiMarkdown } from '../packages/exec/dist/index.js';

const out = fileURLToPath(new URL('../packages/skills/skills/api.md', import.meta.url));
writeFileSync(out, renderApiMarkdown(), 'utf8');
console.log(`api.md ditulis: ${out}`);
