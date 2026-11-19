// Setiap blok ```js di skill dijalankan terhadap daemon nyata (render + check Chromium): wajib sukses dengan
// check 0 error / 0 gerbang / 0 warning. Satu dokumen + sesi per file (blok berurutan, `keep` terbawa);
// blok `// pakai prelude` didahului blok prelude core.md; blok api.md masing-masing di dokumen kosong baru.
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

// Tes tidak pernah memakai key Unsplash nyata: file key default dialihkan ke path yang tidak ada.
const baseConfig = { ...loadConfig({}), unsplashKeyFile: '/nonexistent/lakar-test/unsplash-access-key' };
const browsersPath = process.env.LAKAR_BROWSERS_PATH || baseConfig.browsersPath;
const browserInstalled = chromiumInstalled(browsersPath);
if (!browserInstalled) {
  console.warn(`[@lakar/daemon] SKIP tes Chromium: chromium-headless-shell belum terpasang di ${browsersPath}. Jalankan: bash scripts/install-browser.sh`);
}

const PNG_DIR = process.env.LAKAR_SKILL_PNG_DIR;
const PRELUDE_MARK = '// prelude';
const USES_PRELUDE = '// pakai prelude';

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
async function runBlock(label: string, code: string, sid: string, prelude: string): Promise<string[]> {
  const isPrelude = code.startsWith(PRELUDE_MARK);
  const full = code.startsWith(USES_PRELUDE) ? `${prelude}\n${code}` : code;
  const r = await call('/execute', { code: full, description: 'uji contoh skill lakar' }, sid);
  if (!r.ok) return [`${label}: ${r.error!.code} ${r.error!.message} (${r.error!.hint})`];
  const check = r.data.check as { summary: { error: number; warning: number; gate: number }; findings: { level: string; rule: string; nodeName: string; detail: string }[] } | undefined;
  // Blok prelude hanya mendefinisikan helper: sukses tanpa op mutasi (tanpa check). Blok lain wajib dicek.
  if (isPrelude) return check ? [`${label}: blok prelude tidak boleh memutasi dokumen`] : [];
  if (!check) return [`${label}: tidak ada check (blok tanpa op mutasi)`];
  const pending = PENDING_2_10[label.split(' ')[0]!] ?? [];
  const findings = check.findings.filter((f) => !pending.some((p) => f.rule === p.rule && p.node.test(f.nodeName) && f.detail.startsWith(p.detail)));
  if (findings.length === check.findings.length) {
    const { error, warning, gate } = check.summary;
    if (error || warning || gate) return [`${label}: check ${error} error / ${gate} gerbang / ${warning} warning: ${findings.map((f) => `${f.rule} ${f.nodeName}: ${f.detail}`).join('; ')}`];
    return [];
  }
  return findings.length ? [`${label}: check: ${findings.map((f) => `${f.level} ${f.rule} ${f.nodeName}: ${f.detail}`).join('; ')}`] : [];
}

/**
 * Warning aturan G1 yang dipicu contoh skill dan menunggu story 2.10 (skill tidak diubah di story 4/5, C7): aturan + nama
 * node yang diketahui + awal detail per file skill. Temuan lain (termasuk pola sejenis di node lain) tetap gagal.
 * Story 4: LC-21. Story 5: LC-10 `Link / Semua` (mobile.md), LC-07 padding 10 sidebar (webapp.md), LC-08 `Judul` tanpa
 * lineHeight / 16/20 (api.md).
 */
const PENDING_2_10: Record<string, { rule: string; node: RegExp; detail: string }[]> = {
  'landing.md': [{ rule: 'LC-21', node: /^Baris \/ (Kafe Teras, Bandung|Ruang Seduh, Jakarta|Pojok Arang, Bogor)$/, detail: 'teks di baris tabel: 3 teks langsung di baris (3 baris sejajar di Daftar)' }],
  'mobile.md': [
    { rule: 'LC-21', node: /^\[WIP\] Tutur \/ Beranda · mobile · Ramah$/, detail: 'radius: 4 nilai (8, 16, 20, 24)' },
    { rule: 'LC-10', node: /^Link \/ Semua$/, detail: '82.2×20 < 44×44' },
  ],
  'webapp.md': [
    { rule: 'LC-21', node: /^Header tabel$/, detail: 'teks di baris tabel: 3 teks langsung di baris (7 baris sejajar di Kartu / Siap diambil)' },
    { rule: 'LC-07', node: /^(Grup label|Nav \/ (Ringkasan|Pesanan|Antar-jemput|Pendapatan|Pelanggan))$/, detail: 'padding 10' },
  ],
  'api.md': [
    { rule: 'LC-08', node: /^Judul$/, detail: '32/39 (token 32/40)' },
    { rule: 'LC-08', node: /^Judul$/, detail: '40/49 (token 40/48)' },
    { rule: 'LC-08', node: /^Judul$/, detail: '16/20 (token 16/24)' },
  ],
};

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
  let prelude = '';

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
    prelude = preludes[0]!;
  }, 60_000);

  afterAll(async () => {
    await d?.close();
    await fake?.close();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it.each(SKILL_NAMES)(
    '%s.md: setiap blok js sukses dengan 0 error / 0 gerbang / 0 warning',
    async (name) => {
      const blocks = await jsBlocks(name);
      if (name !== 'api') expect(blocks.length, `${name}.md tanpa blok js`).toBeGreaterThan(0);
      if (name === 'api') expect(blocks.length).toBeGreaterThanOrEqual(12);
      const problems: string[] = [];
      let sid = name === 'api' ? '' : await freshDoc(`skill-${name}`);
      for (const [i, code] of blocks.entries()) {
        const label = `${name}.md blok ${i + 1}`;
        if (name === 'api') {
          sid = await freshDoc(`skill-api-${i + 1}`);
          problems.push(...(await runBlock(label, code, sid, prelude)));
          await savePngs(`skill-api-${i + 1}`, sid);
        } else problems.push(...(await runBlock(label, code, sid, prelude)));
      }
      if (name !== 'api') await savePngs(`skill-${name}`, sid);
      expect(problems).toEqual([]);
    },
    120_000,
  );
});
