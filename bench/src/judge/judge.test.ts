import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodePngRgb, encodePngRgbaWithChunks } from '../png/codec.js';
import { GOLDEN_SET_PATH, loadProtocol } from '../protocol.js';
import { parseJudgeOutput } from './parse.js';
import { buildJudgeText, DESIGN_MD_PATH, extractCriteria, judgeC7Problems, judgeLeaks, scrubToolNames } from './prompt.js';
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
  });

  it.skipIf(!HAVE_SOURCES && process.env.LAKAR_C7_ALLOW_MISSING_SOURCES === '1')('teks juri nyata: rubrik 6 kriteria, slop 12, prompt tanpa pembungkus, tanpa [G], tanpa nama alat', () => {
    const design = readFileSync(DESIGN_MD_PATH, 'utf8');
    const golden = readFileSync(GOLDEN_SET_PATH, 'utf8');
    for (const id of ['A', 'B'] as const) {
      const t = buildJudgeText(design, golden, id, protocol.prompts[id]);
      expect(judgeLeaks(t.text)).toEqual([]);
      expect(t.text).toContain(protocol.prompts[id]);
      expect(t.text).not.toContain('Mode benchmark');
      expect(t.text).not.toMatch(/\[G\]|\[T\]|\| R3 \||\| R7 \|/);
      for (const r of ['R1', 'R2', 'R4', 'R5', 'R6', 'R8']) expect(t.text).toContain(`| ${r} |`);
      expect(t.text).toMatch(/^12\. /m);
      expect(t.text).toContain('Setiap pelanggaran hanya dihitung di');
      expect(t.text).toContain('Setiap skor wajib disertai bukti');
      expect(t.secret).not.toContain(protocol.prompts[id]);
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
