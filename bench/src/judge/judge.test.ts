import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodePngRgb, encodePngRgbaWithChunks } from '../png/codec.js';
import { BENCH_ROOT, GOLDEN_SET_PATH, loadProtocol } from '../protocol.js';
import { c7Targets } from '../round/main.js';
import { sha256 } from '../sys.js';
import { lampiranB, planSnapshot, readRubricJson, rubricShaProblems, rubricVersionOf, writeSnapshot } from './rubric.js';
import { parseJudgeOutput } from './parse.js';
import { buildJudgeText, DESIGN_MD_PATH, extractCriteria, judgeC7Problems, judgeLeaks, neutralizeInternalTerms, parseDesignTokens, scrubToolNames, tokenLeaks } from './prompt.js';
import { assignLabels, buildJudgeArgs, buildJudgeBlocks, judgeMessageLine, runJudgeRep } from './run.js';

const protocol = loadProtocol();
const HAVE_SOURCES = existsSync(DESIGN_MD_PATH) && existsSync(GOLDEN_SET_PATH);

const GOLDEN_FIXTURE = `## A — Contoh

**Prompt:**
> teks

**Kriteria target:**
1. [R1] Bagian lengkap.
2. [R1] Tab bar 4 item, item aktif jelas. [G] konten tidak tertutup tab bar (LC-20).
3. [R4] Oranye. [T] Target sentuh ≥ 44. [R6] Angka konsisten.
4. [G] \`layout_check\` nol error gerbang.
5. [T] Hierarki baris.

---
`;

describe('teks juri', () => {
  it('kriteria tanpa butir/klausa [G]/[T], dinomori ulang', () => {
    expect(extractCriteria(GOLDEN_FIXTURE, 'A')).toEqual([
      '1. [R1] Bagian lengkap.',
      '2. [R1] Tab bar 4 item, item aktif jelas.',
      '3. [R4] Oranye. [R6] Angka konsisten.',
    ]);
  });

  it('nama alat dibuang (kata utuh), indentasi tetap', () => {
    expect(scrubToolNames('Lakar vs pen.dev dan pencil; pen lama. Pendapatan tetap.\n  {"a": 1}')).toBe('vs dan; lama. Pendapatan tetap.\n  {"a": 1}');
  });

  it('penjaga kebocoran: nama alat, path, nama file', () => {
    for (const bad of ['Desain dari Lakar', 'dibuat di pen.dev', 'server pencil', 'file /root/lakar/x', 'lihat A-lakar.png', 'file:///a/b', 'ukuran 1200 bytes', 'bench/runs']) {
      expect(judgeLeaks(bad).length, bad).toBeGreaterThan(0);
    }
    expect(judgeLeaks('Desain X, bagian 1 dari 3')).toEqual([]);
    // Kosakata internal: referensi token, ID aturan lint, istilah node "board".
    for (const bad of ['Hijau `{colors.accent-green}`', 'Frasa terlarang (LC-19)', 'Board persis 390×844']) expect(judgeLeaks(bad).length, bad).toBeGreaterThan(0);
    expect(judgeLeaks('mockup dashboard di artboard')).toEqual([]);
  });

  it('istilah internal sistem desain dinetralkan: token → nilai, `Nama /` dan LC-nn dibuang, board → artboard', () => {
    const md = "---\nname: x\ncolors:\n  # komentar\n  accent-green: '#15803D'         # teks putih\n  on-accent: '#FFFFFF'\ntypography:\n  mobile-title: { fontSize: 22px, lineHeight: 28px, fontWeight: '700' }\nrounded:\n  md: 8px\n---\nisi\n";
    const tokens = parseDesignTokens(md);
    expect(tokens.get('accent-green')).toBe('`#15803D`');
    expect(tokens.get('on-accent')).toBe('teks/ikon di atas aksen `#FFFFFF`');
    expect(tokens.get('mobile-title')).toBe('(teks 22px/28px, tebal 700)');
    expect(tokens.has('md')).toBe(false);
    const t = neutralizeInternalTerms(
      'Hijau `{colors.accent-green}` + `on-accent`. Sapaan `mobile-title`. CTA opsional (`Ekstra /`). Ikon `star`. **Frasa** (LC-19, per bahasa). Board 390, dua board.',
      tokens,
    );
    expect(t).toBe('Hijau `#15803D` + teks/ikon di atas aksen `#FFFFFF`. Sapaan (teks 22px/28px, tebal 700). CTA opsional. Ikon `star`. **Frasa** (per bahasa). Artboard 390, dua artboard.');
    expect(tokenLeaks(t, tokens)).toEqual([]);
    expect(tokenLeaks('pakai accent-green', tokens)).toEqual(['accent-green']);
  });

  it.skipIf(!HAVE_SOURCES && process.env.LAKAR_C7_ALLOW_MISSING_SOURCES === '1')('teks juri nyata: rubrik 8 kriteria, slop 12, prompt tanpa pembungkus, tanpa [G], tanpa nama alat', () => {
    const design = readFileSync(DESIGN_MD_PATH, 'utf8');
    const golden = readFileSync(GOLDEN_SET_PATH, 'utf8');
    for (const id of ['A', 'B'] as const) {
      const t = buildJudgeText(design, golden, id, protocol.prompts[id]);
      expect(judgeLeaks(t.text)).toEqual([]);
      expect(t.text).toContain(protocol.prompts[id]);
      expect(t.text).not.toContain('Mode benchmark');
      expect(t.text).not.toMatch(/\[G\]|\[T\]|\| R3 \||\| R7 \|/);
      for (const r of ['R1', 'R2', 'R4', 'R5', 'R6', 'R8', 'R9', 'R10']) expect(t.text).toContain(`| ${r} |`);
      expect(t.text).toContain('"R10": {"skor": 0|1|2');
      expect(t.rubricVersion).toBe(readRubricJson()!.version);
      // Juri tidak melihat aturan keputusan per prompt ("setara" kecil di prompt = "setara desainer produk senior").
      expect(t.text).not.toMatch(/daya tarik|Lebih baik|Kalah|Setara|melanggar brief|D_L|D_P/);
      expect(t.text).toMatch(/^12\. /m);
      expect(t.text).toContain('Setiap pelanggaran hanya dihitung di');
      expect(t.text).toContain('Setiap skor wajib disertai bukti');
      expect(t.secret).not.toContain(protocol.prompts[id]);
      // Kebutaan: tanpa kosakata internal sistem desain (token, konvensi nama node, ID lint, "board").
      expect(t.text).not.toMatch(/\{colors\.|\{typography\.|mobile-title|on-accent|accent-green|Ekstra \/|\bLC-\d|\bboards?\b/i);
      expect(tokenLeaks(t.text, parseDesignTokens(design))).toEqual([]);
    }
  });

  it('C7 juri: frasa rubrik di target terdeteksi', () => {
    const secret = 'Headline hero display, ≤ 3 baris, klaim hasil, tidak yatim.';
    expect(judgeC7Problems(secret, [{ name: 'skill', text: 'Buat headline hero display 3 baris klaim hasil ya' }]).length).toBeGreaterThan(0);
    expect(judgeC7Problems(secret, [{ name: 'skill', text: 'judul besar' }])).toEqual([]);
  });
});

const design = (skor = 2) => ({
  R1: { skor, bukti: 'navbar di atas' },
  R2: { skor, bukti: 'headline hero kiri' },
  R4: { skor, bukti: 'tombol hijau' },
  R5: { skor, bukti: 'ikon fitur' },
  R6: { skor, bukti: 'angka mockup' },
  R8: { skor, bukti: 'pricing' },
  R9: { skor, bukti: 'delta KPI berwarna di mockup' },
  R10: { skor, bukti: 'bidang hero ber-tint' },
  slop: { jumlah: 1, butir: ['9: semua teks rata tengah di footer'] },
  emoji: 0,
  fokus: 'headline hero kiri atas',
});

describe('parseJudgeOutput', () => {
  it('JSON valid (utuh atau satu blok kode)', () => {
    const v = { X: design(2), Y: design(1) };
    expect(parseJudgeOutput(JSON.stringify(v))).toEqual({ ok: true, verdict: v });
    expect(parseJudgeOutput('```json\n' + JSON.stringify(v) + '\n```').ok).toBe(true);
  });

  it('teks tanpa JSON / skor 3 / bukti kosong / kunci tambahan / slop tidak cocok → tidak valid', () => {
    expect(parseJudgeOutput('Menurut saya X lebih baik.').ok).toBe(false);
    expect(parseJudgeOutput(undefined).ok).toBe(false);
    const bad = (mut: (d: any) => void) => {
      const v: any = { X: design(), Y: design() };
      mut(v);
      return parseJudgeOutput(JSON.stringify(v));
    };
    expect(bad((v) => (v.X.R1.skor = 3))).toMatchObject({ ok: false, problems: [expect.stringMatching(/X\.R1\.skor/)] });
    expect(bad((v) => (v.Y.R6.bukti = ' '))).toMatchObject({ ok: false, problems: [expect.stringMatching(/Y\.R6\.bukti kosong/)] });
    expect(bad((v) => (v.X.R3 = { skor: 1, bukti: 'x' }))).toMatchObject({ ok: false });
    expect(bad((v) => delete v.Y.R8)).toMatchObject({ ok: false });
    // (e) rubrik v2: jawaban tanpa R9/R10 ditolak.
    expect(bad((v) => delete v.X.R9)).toMatchObject({ ok: false, problems: [expect.stringMatching(/X: kunci hilang R9/)] });
    expect(bad((v) => delete v.Y.R10)).toMatchObject({ ok: false, problems: [expect.stringMatching(/Y: kunci hilang R10/)] });
    expect(bad((v) => (v.X.R10.bukti = ''))).toMatchObject({ ok: false, problems: [expect.stringMatching(/X\.R10\.bukti kosong/)] });
    expect(bad((v) => (v.X.slop.jumlah = 2))).toMatchObject({ ok: false });
    expect(bad((v) => (v.X.emoji = -1))).toMatchObject({ ok: false });
    expect(bad((v) => (v.Z = {}))).toMatchObject({ ok: false });
    expect(parseJudgeOutput('Berikut: ' + JSON.stringify({ X: design(), Y: design() })).ok).toBe(false);
  });
});

describe('pengacakan dan pesan', () => {
  it('3 ulangan: kedua penugasan selalu muncul (rng seragam diundi ulang)', () => {
    const seq = [1, 1, 1, 1, 0, 1];
    let i = 0;
    const a = assignLabels(3, () => seq[i++]!);
    expect(a.map((x) => x.X)).toEqual(['lakar', 'pendev', 'lakar']);
    for (let k = 0; k < 50; k++) expect(new Set(assignLabels(3).map((x) => x.X)).size).toBe(2);
  });

  it('argv juri: tanpa --allowedTools, tools kosong, MCP kosong strict, input stream-json', () => {
    const argv = buildJudgeArgs('claude-opus-5-5', '/x/mcp-empty.json');
    expect(argv).not.toContain('--allowedTools');
    expect(argv.join(' ')).toContain('--input-format stream-json --output-format stream-json --verbose --model claude-opus-5-5 --tools  --strict-mcp-config --mcp-config /x/mcp-empty.json');
    expect(argv.slice(argv.indexOf('--tools'), argv.indexOf('--tools') + 2)).toEqual(['--tools', '']);
  });

  const img = () => encodePngRgb({ width: 2, height: 2, data: new Uint8Array(12) });

  it('pesan: label netral, gambar base64 tanpa metadata', () => {
    const blocks = buildJudgeBlocks('teks juri', { X: { tiles: [img(), img()], overview: img() }, Y: { tiles: [img()], overview: img() } });
    const texts = blocks.flatMap((b) => (b.type === 'text' ? [b.text] : []));
    expect(texts).toEqual(['teks juri', 'Desain X, bagian 1 dari 2', 'Desain X, bagian 2 dari 2', 'Desain X, overview', 'Desain Y, bagian 1 dari 1', 'Desain Y, overview']);
    expect(blocks.filter((b) => b.type === 'image')).toHaveLength(5);
    const line = JSON.parse(judgeMessageLine(blocks));
    expect(line).toMatchObject({ type: 'user', message: { role: 'user' } });
    expect(() => buildJudgeBlocks('dibuat dengan Lakar', { X: { tiles: [img()], overview: img() }, Y: { tiles: [img()], overview: img() } })).toThrow(/bocor/);
    const withMeta = encodePngRgbaWithChunks({ width: 1, height: 1, data: new Uint8Array(4) }, [{ type: 'tEXt', data: Buffer.from('a\0b') }]);
    expect(() => buildJudgeBlocks('t', { X: { tiles: [withMeta], overview: img() }, Y: { tiles: [img()], overview: img() } })).toThrow(/chunk/);
  });
});

describe('runJudgeRep (claude palsu)', () => {
  const withFake = async (script: string, fn: (fake: string, dir: string) => Promise<void>) => {
    const dir = mkdtempSync(join(tmpdir(), 'bench-judge-test-'));
    try {
      const fake = join(dir, 'fake.mjs');
      writeFileSync(fake, script);
      await fn(fake, dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const initOk = "{type:'system',subtype:'init',cwd:process.cwd(),tools:[],mcp_servers:[]}";
  const valid = JSON.stringify({ X: design(2), Y: design(1) });
  const base = (fake: string, dir: string) => ({
    prompt: 'A',
    rep: 1,
    mapping: { X: 'lakar' as const, Y: 'pendev' as const },
    blocks: [{ type: 'text' as const, text: 't' }],
    dir: join(dir, 'rep-1'),
    emptyMcpConfig: join(dir, 'mcp-empty.json'),
    config: { ...protocol.config, timeoutMs: 10_000 },
    forbiddenCwdRoot: '/root/lakar',
    command: process.execPath,
    prefixArgs: [fake],
  });

  it('jawaban tidak valid → 1 percobaan ulang → ok; pemetaan disimpan, stdin berisi pesan', async () => {
    const script = `import fs from 'node:fs';let s='';process.stdin.on('data',(d)=>(s+=d));process.stdin.on('end',()=>{
const w=(e)=>process.stdout.write(JSON.stringify(e)+'\\n');w(${initOk});
if(!s.includes('"type":"user"'))return;
if(!fs.existsSync(process.env.MARK)){fs.writeFileSync(process.env.MARK,'1');w({type:'result',subtype:'success',is_error:false,result:'bukan json',total_cost_usd:0.01});}
else w({type:'result',subtype:'success',is_error:false,result:${JSON.stringify(valid)},total_cost_usd:0.02});});`;
    await withFake(script, async (fake, dir) => {
      process.env.MARK = join(dir, 'mark');
      try {
        const rec = await runJudgeRep(base(fake, dir));
        expect(rec.status).toBe('ok');
        expect(rec.retried).toBe(true);
        expect(rec.attempts.map((a) => a.status)).toEqual(['invalid_output', 'ok']);
        expect(rec.costUsd).toBeCloseTo(0.03);
        expect(rec.verdict?.X.R1.skor).toBe(2);
        expect(JSON.parse(readFileSync(join(dir, 'rep-1', 'mapping.json'), 'utf8'))).toEqual({ X: 'lakar', Y: 'pendev' });
        expect(readFileSync(join(dir, 'mcp-empty.json'), 'utf8')).toBe('{"mcpServers":{}}\n');
      } finally {
        delete process.env.MARK;
      }
    });
  });

  it('dua kali tidak valid → failed (tidak diganti)', async () => {
    await withFake(
      `const w=(e)=>process.stdout.write(JSON.stringify(e)+'\\n');w(${initOk});w({type:'result',subtype:'success',is_error:false,result:'{"X":{}}'});`,
      async (fake, dir) => {
        const rec = await runJudgeRep(base(fake, dir));
        expect(rec.status).toBe('failed');
        expect(rec.attempts).toHaveLength(2);
        expect(rec.verdict).toBeUndefined();
      },
    );
  });

  it('init juri ada tool → invalid tanpa percobaan ulang', async () => {
    await withFake(
      `const w=(e)=>process.stdout.write(JSON.stringify(e)+'\\n');w({type:'system',subtype:'init',cwd:process.cwd(),tools:['Read'],mcp_servers:[]});setTimeout(()=>{},30000);`,
      async (fake, dir) => {
        const rec = await runJudgeRep(base(fake, dir));
        expect(rec.status).toBe('invalid');
        expect(rec.attempts).toHaveLength(1);
      },
    );
  });
});

// ---------- rubrik v2 dan snapshot tracked (story 17) ----------

const RUBRIC = readRubricJson();
const RUBRIC_V = RUBRIC ? join(BENCH_ROOT, 'rubric', `v${RUBRIC.version}`) : '';
/** Kata yang menyebut isi prompt A/B: tidak boleh ada di teks R4/R9/R10 (kriteria umum). */
const FORBIDDEN_IN_GENERAL = ['streak', 'target harian', 'Kasku', 'Gerak', 'invoice', 'avatar foto', 'avatar', 'langkah', 'kalori', 'UMKM', 'pembukuan', 'kebugaran', 'hijau', 'oranye'];
/** Bagian rahasia (rubrik + kriteria + bukti) dari teks juri: dari "## Aturan skor" sampai "## Checklist slop". */
const secretOf = (text: string) => text.slice(text.indexOf('## Aturan skor'), text.indexOf('## Checklist slop')).trim();

describe('rubrik v2 (snapshot tracked bench/rubric/)', () => {
  it('rubric.json ada, versi ≥ 2, dan snapshot v1 tetap ada', () => {
    expect(RUBRIC).toBeDefined();
    expect(Number(RUBRIC!.version.split('.')[0])).toBeGreaterThanOrEqual(2);
    expect(readdirSync(join(BENCH_ROOT, 'rubric', 'v1')).sort()).toEqual(['golden-kriteria.md', 'judge-text-A.md', 'judge-text-B.md', 'lampiran-b.md']);
  });

  it('(b) teks R4/R9/R10 di lampiran-b.md tanpa kata isi prompt A/B', () => {
    const lb = readFileSync(join(RUBRIC_V, 'lampiran-b.md'), 'utf8');
    expect(rubricVersionOf(lb)?.version).toBe(RUBRIC!.version);
    const rows = ['R4', 'R9', 'R10'].map((r) => {
      const row = lb.split('\n').find((l) => l.startsWith(`| ${r} |`));
      expect(row, r).toBeDefined();
      return row!;
    });
    const extra = lb.split('\n').filter((l) => /R9 dan R10/.test(l));
    expect(extra.length).toBeGreaterThanOrEqual(2);
    for (const t of [...rows, ...extra])
      for (const w of FORBIDDEN_IN_GENERAL) expect(new RegExp(`(^|[^\\p{L}])${w}($|[^\\p{L}])`, 'iu').test(t), `"${w}" di: ${t.slice(0, 60)}`).toBe(false);
  });

  it('(c) C7: frasa rubrik/kriteria v2 tidak ada di skill, pembungkus, prompt render, server MCP', () => {
    const targets = c7Targets(protocol);
    for (const n of ['packages/mcp/src/server.ts', 'bench/protocol/wrapper.txt', 'prompt agen A (hasil render)', 'prompt agen B (hasil render)']) expect(targets.map((t) => t.name)).toContain(n);
    expect(targets.some((t) => t.name.startsWith('packages/skills/skills/'))).toBe(true);
    for (const id of ['A', 'B']) {
      const secret = secretOf(readFileSync(join(RUBRIC_V, `judge-text-${id}.md`), 'utf8'));
      expect(secret).toContain('| R9 |');
      expect(judgeC7Problems(secret, targets)).toEqual([]);
    }
  });

  it('(d) sha256 judge-text-*.md snapshot = rubric.json; teks juri saat ini = snapshot', () => {
    for (const id of ['A', 'B']) {
      const text = readFileSync(join(RUBRIC_V, `judge-text-${id}.md`), 'utf8');
      expect(sha256(text), id).toBe(RUBRIC!.judgeTextSha256[id]);
      expect(judgeLeaks(text)).toEqual([]);
    }
    for (const f of ['lampiran-b.md', 'golden-kriteria.md']) expect(sha256(readFileSync(join(RUBRIC_V, f), 'utf8')), f).toBe(RUBRIC!.sourceSha256[f]);
    if (HAVE_SOURCES) {
      const design = readFileSync(DESIGN_MD_PATH, 'utf8');
      const golden = readFileSync(GOLDEN_SET_PATH, 'utf8');
      for (const id of ['A', 'B'] as const) {
        const t = buildJudgeText(design, golden, id, protocol.prompts[id]);
        expect(t.text, `teks juri ${id} berubah tanpa rubric-snapshot`).toBe(readFileSync(join(RUBRIC_V, `judge-text-${id}.md`), 'utf8'));
        expect(t.text).toContain(t.secret);
      }
      expect(lampiranB(design)).toBe(readFileSync(join(RUBRIC_V, 'lampiran-b.md'), 'utf8'));
    }
  });

  it('snapshot eksklusif: baru → ditulis; identik → no-op; berbeda → error; versi wajib/cocok', () => {
    const root = mkdtempSync(join(tmpdir(), 'bench-rubric-'));
    try {
      const design = '## Lampiran B — Rubrik\n\nVersi rubrik: 3 (2026-12-01)\n\nisi\n\n## Lain\n';
      const golden = '## A — x\n\n**Kriteria target:**\n1. [R1] a\n\n---\n';
      const plan = planSnapshot({ designMd: design, goldenMd: golden, judgeTexts: { A: 'teks A' }, today: '2026-11-18' }, root);
      expect(plan.version).toBe('3');
      expect(plan.json).toMatchObject({ version: '3', date: '2026-12-01', judgeTextSha256: { A: sha256('teks A') } });
      expect(plan.files['lampiran-b.md']).toBe('## Lampiran B — Rubrik\n\nVersi rubrik: 3 (2026-12-01)\n\nisi\n');
      expect(writeSnapshot(plan, root)).toBe('ditulis');
      expect(writeSnapshot(plan, root)).toBe('identik');
      const changed = planSnapshot({ designMd: design, goldenMd: golden, judgeTexts: { A: 'teks A berubah' }, today: '2026-11-18' }, root);
      expect(() => writeSnapshot(changed, root)).toThrow(/naikkan versi/);
      expect(JSON.parse(readFileSync(join(root, 'rubric.json'), 'utf8')).judgeTextSha256.A).toBe(sha256('teks A'));
      const v1 = '## Lampiran B — Rubrik\n\nisi\n';
      expect(() => planSnapshot({ designMd: v1, goldenMd: golden, judgeTexts: { A: 'a' }, today: '2026-11-18' }, root)).toThrow(/--version/);
      expect(planSnapshot({ designMd: v1, goldenMd: golden, judgeTexts: { A: 'a' }, version: '1', today: '2026-11-18' }, root).json.date).toBe('2026-11-18');
      expect(() => planSnapshot({ designMd: design, goldenMd: golden, judgeTexts: { A: 'a' }, version: '2', today: '2026-11-18' }, root)).toThrow(/≠/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('penjaga sha: versi atau sha berbeda dari rubric.json → masalah', () => {
    const rj = { version: '2', date: 'd', judgeTextSha256: { A: 'aa', B: 'bb' }, sourceSha256: {} };
    expect(rubricShaProblems({ version: '2', sha: { A: 'aa', B: 'bb' } }, rj)).toEqual([]);
    expect(rubricShaProblems({ version: '2', sha: { A: 'aa', B: 'xx' } }, rj)[0]).toContain('sha256 teks juri B xx ≠ rubric.json bb');
    expect(rubricShaProblems({ version: undefined, sha: { A: 'aa' } }, rj)[0]).toContain('versi rubrik');
    expect(rubricShaProblems({ version: '2', sha: {} }, undefined)[0]).toContain('rubric.json tidak ada');
  });
});
