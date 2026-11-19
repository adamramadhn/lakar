// Checker tracer-e2e: memeriksa stream-json `claude -p` + file dokumen.
//   node tracer-check.mjs <stream.jsonl> <slug> <dataDir> <outDir>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { decodePng, readPngSize, countDarkPixels } = await import(pathToFileURL(join(root, 'packages/daemon/dist/png.js')).href);

const [streamFile, slug, dataDir, outDir] = process.argv.slice(2);
if (!streamFile || !slug || !dataDir || !outDir) {
  console.error('pakai: node tracer-check.mjs <stream.jsonl> <slug> <dataDir> <outDir>');
  process.exit(2);
}

const W = 390;
const H = 844;
const TEXT = 'Halo dari Lakar';
let failed = 0;
const pass = (m) => console.log(`LULUS  ${m}`);
const fail = (m) => {
  console.log(`GAGAL  ${m}`);
  failed++;
};

const events = readFileSync(streamFile, 'utf8')
  .split('\n')
  .filter(Boolean)
  .flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
const toolUses = [];
const toolResults = new Map();
for (const ev of events) {
  const content = ev?.message?.content;
  if (!Array.isArray(content)) continue;
  for (const c of content) {
    if (ev.type === 'assistant' && c.type === 'tool_use') toolUses.push(c);
    if (ev.type === 'user' && c.type === 'tool_result') toolResults.set(c.tool_use_id, c);
  }
}
const final = events.findLast((e) => e.type === 'result');
console.log(
  `info   result: ${final ? `${final.subtype}${final.is_error ? ' (error)' : ''}, ${final.duration_ms} ms, $${final.total_cost_usd ?? '?'}` : 'tidak ada'}`,
);

// (1) urutan tool: open_doc → execute (tepat satu) → screenshot
const lakar = toolUses.filter((t) => t.name.startsWith('mcp__lakar__'));
const names = lakar.map((t) => t.name.replace('mcp__lakar__', ''));
console.log(`info   tool lakar: ${names.join(' → ') || '(tidak ada)'}`);
const iOpen = names.indexOf('open_doc');
const iExec = names.indexOf('execute');
const iShot = names.lastIndexOf('screenshot');
const execCount = names.filter((n) => n === 'execute').length;
const openSlug = iOpen >= 0 ? lakar[iOpen].input?.slug : undefined;
const errs = lakar.filter((t) => toolResults.get(t.id)?.is_error);
if (iOpen === 0 && execCount === 1 && iOpen < iExec && iExec < iShot && openSlug === slug && errs.length === 0) {
  pass(`urutan tool open_doc(${slug}) → execute (1×) → screenshot, tanpa error tool`);
} else {
  fail(`urutan tool salah: [${names.join(', ')}], execute ${execCount}×, slug ${openSlug}, error tool ${errs.length}`);
  for (const t of errs) console.log(`       ${t.name}: ${JSON.stringify(toolResults.get(t.id)?.content).slice(0, 300)}`);
}

// (2) PNG dari tool_result screenshot
let pngPath;
const shot = iShot >= 0 ? toolResults.get(lakar[iShot].id) : undefined;
const img = Array.isArray(shot?.content) ? shot.content.find((c) => c.type === 'image') : undefined;
if (!img?.source?.data) {
  fail('tool_result screenshot tidak berisi image');
} else {
  const buf = Buffer.from(img.source.data, 'base64');
  pngPath = join(outDir, `${slug}.png`);
  writeFileSync(pngPath, buf);
  try {
    const size = readPngSize(buf);
    const decoded = decodePng(buf);
    const dark = countDarkPixels(decoded, 0, 0, W, 60);
    if (size.width === W && size.height === H && dark > 100) {
      pass(`PNG IHDR ${size.width}×${size.height}, ${dark} piksel teks di area judul (${img.source.media_type})`);
    } else {
      fail(`PNG ${size.width}×${size.height}, piksel teks ${dark} (harus ${W}×${H} dan > 100)`);
    }
  } catch (e) {
    fail(`PNG tidak bisa dibaca: ${e.message}`);
  }
}

// (3) dokumen di direktori data
const docFile = join(dataDir, 'docs', `${slug}.lakar.json`);
if (!existsSync(docFile)) {
  fail(`file dokumen tidak ada: ${docFile}`);
} else {
  const doc = JSON.parse(readFileSync(docFile, 'utf8'));
  const board = doc.pages?.[0]?.children?.find((b) => b.type === 'board' && b.width === W && b.height === H);
  const text = board?.children?.find((n) => n.type === 'text' && n.content === TEXT);
  if (board && text && doc.rev === 1) pass(`${docFile}: rev 1, board ${W}×${H} berisi text "${TEXT}"`);
  else fail(`${docFile}: board/text tidak sesuai (rev ${doc.rev})`);
}

if (pngPath) console.log(`\nPNG: ${pngPath}`);
console.log(failed ? `\ntracer-check: ${failed} cek GAGAL` : '\ntracer-check: ketiga cek LULUS');
process.exit(failed ? 1 : 0);
