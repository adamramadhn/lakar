// Penyimpanan dokumen di <data>/docs: <slug>.lakar.json (tulis atomik tmp+rename)
// dan <slug>.history.jsonl (append). Hanya daemon yang menyentuh direktori ini (AD-1).
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { parseDocument } from '@lakar/core';
import { LakarError, type HistoryEntry, type LakarDocument } from '@lakar/schema';

export class DocStore {
  readonly docsDir: string;
  constructor(dataDir: string) {
    this.docsDir = join(dataDir, 'docs');
  }

  docPath(slug: string): string {
    return join(this.docsDir, `${slug}.lakar.json`);
  }
  historyPath(slug: string): string {
    return join(this.docsDir, `${slug}.history.jsonl`);
  }

  /** Baca dokumen; `undefined` bila belum ada. File rusak → SCHEMA_INVALID. */
  async read(slug: string): Promise<LakarDocument | undefined> {
    let text: string;
    try {
      text = await readFile(this.docPath(slug), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw e;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new LakarError('SCHEMA_INVALID', `file dokumen ${slug}.lakar.json bukan JSON valid: ${(e as Error).message}`, {
        hint: 'pulihkan file dari cadangan atau buka slug lain',
      });
    }
    try {
      return parseDocument(json);
    } catch (e) {
      // VERSION_MISMATCH (dokumen lebih baru / migrasi hilang) bukan file rusak: teruskan dengan hint pembaruan.
      if (e instanceof LakarError && e.code !== 'VERSION_MISMATCH') {
        throw new LakarError(e.code, `file dokumen ${slug}.lakar.json rusak: ${e.message}`, { hint: 'pulihkan file dari cadangan atau buka slug lain' });
      }
      throw e;
    }
  }

  /** Tulis atomik: file tmp di direktori yang sama, lalu rename. */
  async write(slug: string, doc: LakarDocument): Promise<void> {
    await mkdir(this.docsDir, { recursive: true });
    const target = this.docPath(slug);
    const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    await rename(tmp, target);
  }

  async appendHistory(slug: string, entry: HistoryEntry): Promise<void> {
    await mkdir(this.docsDir, { recursive: true });
    await appendFile(this.historyPath(slug), `${JSON.stringify(entry)}\n`, 'utf8');
  }
}
