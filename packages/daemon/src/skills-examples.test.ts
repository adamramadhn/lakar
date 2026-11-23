// Setiap blok ```js di skill dijalankan terhadap daemon nyata (render + check Chromium): wajib sukses dengan
// check 0 error / 0 gerbang / 0 warning. Satu dokumen + sesi per file (blok berurutan, `keep` terbawa);
// helper prelude bawaan sandbox (spec-skeleton-live-build), jadi blok dijalankan apa adanya; blok api.md masing-masing di dokumen kosong baru.
// selection.md: dokumen berisi fixture seleksi (tests/support/selection-fixture.ts) dan baris `const SEL = [...]`
// diganti id board fixture; blok `// baca saja` wajib sukses tanpa op mutasi (tanpa check, rev tetap).
// LAKAR_SKILL_PNG_DIR=<dir> → PNG setiap board contoh ditulis ke sana untuk pemeriksaan visual.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SKILL_NAMES, SKILLS_DIR, splitCode, type SkillName } from '@lakar/skills';
import { PhotoService, SafeNet, loadConfig, startDaemon, type RunningDaemon } from './index.js';
import { chromiumInstalled } from '../../../tests/support/browser.ts';
import { postJson } from '../../../tests/support/http.ts';
import { startFakeProviders, type FakeProviders } from '../../../tests/support/photos.ts';
import { READ_ONLY_MARK, SELECTION_FIXTURE, withSelection } from '../../../tests/support/selection-fixture.ts';

// Tes tidak pernah memakai key Unsplash nyata: file key default dialihkan ke path yang tidak ada.
const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key' };
const browsersPath = process.env.LAKAR_BROWSERS_PATH || baseConfig.browsersPath;
const browserInstalled = chromiumInstalled(browsersPath);
if (!browserInstalled) {
  console.warn(`[@lakar/daemon] SKIP tes Chromium: chromium-headless-shell belum terpasang di ${browsersPath}. Jalankan: bash scripts/install-browser.sh`);
}

const PNG_DIR = process.env.LAKAR_SKILL_PNG_DIR;
const PRELUDE_MARK = '// prelude';

type Body = { ok: boolean; data?: any; error?: { code: string; message: string; hint: string; editId?: string } };

let d: RunningDaemon;
let dataDir: string;
/** Contoh `photo('<ref>')` di skill diimpor dari penyedia palsu lokal (tes tanpa jaringan). */
let fake: FakeProviders;

const call = async (path: string, body: unknown, session?: string): Promise<Body> => (await postJson(d.url, path, body, session)).body;

/** Sesi baru dengan dokumen kosong `slug` aktif. */
async function freshDoc(slug: string): Promise<string> {
  const sid = (await call('/sessions', {})).data.sessionId as string;
  const o = await call('/docs/open', { slug }, sid);
  if (!o.ok || !o.data.created) throw new Error(`open_doc ${slug}: ${JSON.stringify(o)}`);
  return sid;
}

const jsBlocks = async (name: SkillName) => splitCode(await readFile(join(SKILLS_DIR, `${name}.md`), 'utf8')).blocks.filter((b) => b.lang === 'js').map((b) => b.code);

/** Jalankan satu blok; kembalikan daftar masalah (kosong = lulus). */
async function runBlock(label: string, code: string, sid: string): Promise<string[]> {
  const isPrelude = code.startsWith(PRELUDE_MARK);
  const r = await call('/execute', { code, description: 'uji contoh skill lakar' }, sid);
  if (!r.ok) return [`${label}: ${r.error!.code} ${r.error!.message} (${r.error!.hint})`];
  const check = r.data.check as { summary: { error: number; warning: number; gate: number }; findings: { level: string; rule: string; nodeName: string; detail: string }[] } | undefined;
  // Blok prelude hanya mengatur palet: sukses tanpa op mutasi (tanpa check). Blok lain wajib dicek.
  if (isPrelude) return check ? [`${label}: blok prelude tidak boleh memutasi dokumen`] : [];
  if (code.startsWith(READ_ONLY_MARK)) return check ? [`${label}: blok baca saja tidak boleh memutasi dokumen`] : [];
  if (!check) return [`${label}: tidak ada check (blok tanpa op mutasi)`];
  const file = label.split(' ')[0]!;
  const pending = PENDING_2_10[file] ?? FIXTURE_FINDINGS[file] ?? [];
  const findings = check.findings.filter((f) => !pending.some((p) => f.rule === p.rule && p.node.test(f.nodeName) && f.detail.startsWith(p.detail)));
  if (findings.length === check.findings.length) {
    const { error, warning, gate } = check.summary;
    if (error || warning || gate) return [`${label}: check ${error} error / ${gate} gerbang / ${warning} warning: ${findings.map((f) => `${f.rule} ${f.nodeName}: ${f.detail}`).join('; ')}`];
    return [];
  }
  return findings.length ? [`${label}: check: ${findings.map((f) => `${f.level} ${f.rule} ${f.nodeName}: ${f.detail}`).join('; ')}`] : [];
}

/**
 * Warning aturan G1 yang dipicu contoh skill dan menunggu story 2.10: aturan + nama node yang diketahui + awal detail per
 * file skill. Temuan lain (termasuk pola sejenis di node lain) tetap gagal. Story 2.16 membereskan entri landing, mobile,
 * webapp, dan icons; tersisa api.md (dihasilkan dari `@lakar/exec`): LC-08 `Judul` tanpa lineHeight dan scrim teks di atas mesh.
 */
const PENDING_2_10: Record<string, { rule: string; node: RegExp; detail: string }[]> = {
  'api.md': [
    { rule: 'LC-08', node: /^Judul$/, detail: '32/39 (token 32/40)' },
    { rule: 'LC-08', node: /^Judul$/, detail: '40/49 (token 40/48)' },
    { rule: 'LC-08', node: /^Judul$/, detail: '16/20 (token 16/24)' },
    { rule: 'LC-04', node: /^Judul$/, detail: 'scrim: teks di atas efek tanpa scrim (fill solid ≥ 0,5) "Malam yang tenang' },
  ],
};

/**
 * Temuan yang sengaja dibawa fixture (bukan dari contoh skill): kartu kedua fixture seleksi ber-`gap` 10 (di luar skala,
 * bahan cek konsistensi) → LC-07 ikut tersalin ke varian. Temuan lain tetap gagal.
 */
const FIXTURE_FINDINGS: Record<string, { rule: string; node: RegExp; detail: string }[]> = {
  'selection.md': [{ rule: 'LC-07', node: /^Kartu \/ Profil rasa$/, detail: 'gap 10' }],
};

/** Skill tanpa contoh teruji (domain dan skill opsional berisi aturan saja); skill lain selain api wajib punya ≥ 1 blok js. */
const NO_EXAMPLES: readonly SkillName[] = ['layout', 'typography', 'color', 'accessibility', 'interface', 'writing', 'review', 'break-ui', 'variants'];

describe('PENDING_2_10', () => {
  it('hanya entri api.md (contoh skill lain bebas pengecualian)', () => {
    expect(Object.keys(PENDING_2_10)).toEqual(['api.md']);
  });
});

async function savePngs(slug: string, sid: string): Promise<void> {
  if (!PNG_DIR) return;
  await mkdir(PNG_DIR, { recursive: true });
  const boards = (await call('/boards', {}, sid)).data.boards as { id: string }[];
  for (const b of boards) {
    const s = await call('/screenshot', { boardId: b.id }, sid);
    if (s.ok) await writeFile(join(PNG_DIR, `${slug}-${b.id}.png`), Buffer.from(s.data.png as string, 'base64'));
  }
}

describe.skipIf(!browserInstalled)('contoh skill dijalankan terhadap daemon nyata', () => {

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'lakar-skills-examples-'));
    fake = await startFakeProviders();
    const keyFile = join(dataDir, 'pexels-api-key');
    await writeFile(keyFile, 'TESTKEYskillexamples000\n');
    await chmod(keyFile, 0o600);
    // Key Unsplash palsu (contoh `photo('unsplash:…')` di api.md/skill memakai penyedia palsu lokal, tanpa jaringan).
    const unsplashKeyFile = join(dataDir, 'unsplash-access-key');
    await writeFile(unsplashKeyFile, 'TESTKEYunsplash000000000\n');
    await chmod(unsplashKeyFile, 0o600);
    const photos = new PhotoService({ dataDir, keyFile, unsplashKeyFile, net: new SafeNet(fake.netOptions()) });
    d = await startDaemon({ ...baseConfig, port: 0, dataDir, browsersPath, pexelsKeyFile: keyFile, unsplashKeyFile }, { photos });
    await d.warmed;
    const preludes = (await jsBlocks('core')).filter((c) => c.startsWith(PRELUDE_MARK));
    expect(preludes).toHaveLength(1);
  }, 60_000);

  afterAll(async () => {
    await d?.close();
    await fake?.close();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it.each(SKILL_NAMES)(
    '%s.md: setiap blok js sukses dengan 0 error / 0 gerbang / 0 warning (PENDING hanya api.md)',
    async (name) => {
      const blocks = await jsBlocks(name);
      if (NO_EXAMPLES.includes(name)) {
        expect(blocks, `${name}.md: skill domain tanpa contoh teruji`).toEqual([]);
        return;
      }
      if (name !== 'api') expect(blocks.length, `${name}.md tanpa blok js`).toBeGreaterThan(0);
      if (name === 'api') expect(blocks.length).toBeGreaterThanOrEqual(12);
      const problems: string[] = [];
      let sid = name === 'api' ? '' : await freshDoc(`skill-${name}`);
      // selection.md bekerja atas seleksi pengguna: board fixture dipilih (id menggantikan baris `const SEL`).
      let sel: string[] | undefined;
      if (name === 'selection') {
        const f = await call('/execute', { code: SELECTION_FIXTURE, description: 'fixture seleksi pengguna' }, sid);
        expect(f.ok, JSON.stringify(f.error)).toBe(true);
        // Satu-satunya temuan fixture: gap 10 yang disengaja (FIXTURE_FINDINGS).
        expect(f.data.check.summary, JSON.stringify(f.data.check.findings)).toMatchObject({ error: 0, warning: 1, gate: 0 });
        expect(f.data.check.findings.map((x: { rule: string; nodeName: string; detail: string }) => `${x.rule} ${x.nodeName}: ${x.detail}`)).toEqual(['LC-07 Kartu / Profil rasa: gap 10']);
        sel = [f.data.value.board as string];
      }
      for (const [i, code] of blocks.entries()) {
        const label = `${name}.md blok ${i + 1}`;
        if (name === 'api') {
          sid = await freshDoc(`skill-api-${i + 1}`);
          problems.push(...(await runBlock(label, code, sid)));
          await savePngs(`skill-api-${i + 1}`, sid);
        } else problems.push(...(await runBlock(label, sel ? withSelection(code, sel) : code, sid)));
      }
      if (name !== 'api') await savePngs(`skill-${name}`, sid);
      expect(problems).toEqual([]);
    },
    120_000,
  );
});
