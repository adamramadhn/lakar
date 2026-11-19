// Generator fixture glyph ikon untuk tes render (dijalankan sekali, hasil di-commit):
//   /opt/node-26/bin/pnpm build && /opt/node-26/bin/node packages/render/test/fixtures/gen-icon-glyphs.mjs
// Sumber: katalog @lakar/icons (dist) = lucide-static 1.74.0 + simple-icons 16.38.0 terpasang. Render tidak
// bergantung pada @lakar/icons; fixture ini satu-satunya jembatan data untuk tes tanpa daemon.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { IconCatalog } = await import(join(here, '..', '..', '..', 'icons', 'dist', 'index.js'));
const cat = IconCatalog.load();
const refs = [
  ['lucide', 'house'],
  ['lucide', 'star'],
  ['lucide', 'check'],
  ['lucide', 'search'],
  ['lucide', 'chart-scatter'],
  ['simple-icons', 'github'],
  ['simple-icons', 'whatsapp'],
];
const glyphs = refs.map(([lib, icon]) => {
  const g = cat.glyph(lib, icon);
  if (!g) throw new Error(`${lib}/${icon} tidak ada`);
  return g;
});
const out = { source: { generator: 'packages/render/test/fixtures/gen-icon-glyphs.mjs', versions: cat.versions }, glyphs };
writeFileSync(join(here, 'icon-glyphs.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`ditulis ${glyphs.length} glyph`);
