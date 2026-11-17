// Dokumen pen.dev baru per run: `pen-newdoc.sh` (xdotool ctrl+shift+n) + verifikasi murni sebelum claude dipanggil.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { TopNode } from './pencil-client.js';

export const NEWDOC_SCRIPT = '/root/pen-vps-kit/pen-newdoc.sh';
export const DOCUMENTS_DIR = join(homedir(), '.pencil/documents');
/** Dokumen yang berisi arsip golden set: tidak boleh aktif saat agen berjalan. */
export const GOLDEN_DOC_PATH = join(DOCUMENTS_DIR, '1e55d426-3895-4cef-8d4b-52763be3aff4/untitled.pen');

/** Snapshot path absolut `~/.pencil/documents/<dir>/<file>.pen` (tanpa membaca isinya). */
export function snapshotDocuments(dir = DOCUMENTS_DIR): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of readdirSync(join(dir, d.name))) if (f.endsWith('.pen')) out.push(join(dir, d.name, f));
  }
  return out.sort();
}

/** URI dari baris `Dokumen baru aktif: … \`file:///…\``. */
export function parseNewDocOutput(stdout: string): string | undefined {
  const line = stdout.split('\n').find((l) => l.includes('Dokumen baru aktif:'));
  if (!line) return undefined;
  return line.match(/`([^`]+)`/)?.[1] ?? line.match(/(file:\/\/\S+)/)?.[1];
}

export async function runNewDoc(script = NEWDOC_SCRIPT): Promise<{ uri: string | undefined; stdout: string; stderr: string }> {
  const { stdout, stderr } = await promisify(execFile)('bash', [script], { timeout: 90_000 });
  return { uri: parseNewDocOutput(stdout), stdout, stderr };
}

export function uriToPath(uri: string): string | undefined {
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
}

export type VerifyNewDocInput = {
  /** URI hasil parse output pen-newdoc.sh (bisa kosong: lihat catatan di verifyNewDoc). */
  uri: string | undefined;
  /** URI dari get_app_state klien harness. */
  appStateUri: string | undefined;
  prevUris: readonly string[];
  /** Path .pen yang sudah ada sebelum newdoc. */
  snapshot: readonly string[];
  /** Path .pen sesudah newdoc (dipakai bila pen-newdoc.sh tidak mencetak URI). */
  postSnapshot?: readonly string[];
  /** Node top-level dokumen baru. */
  topNodes: readonly TopNode[];
  goldenPath?: string;
};

export type VerifyNewDocResult = { uri: string | undefined; source: 'pen-newdoc.sh' | 'get_app_state'; problems: string[] };

/**
 * Verifikasi murni dokumen baru; problems kosong = aman menjalankan claude.
 * pen-newdoc.sh mengirim initialize + tools/call lalu menutup stdin sekaligus; server pencil sering keluar
 * sebelum menjawab tools/call, sehingga baris `Dokumen baru aktif:` tidak tercetak. Bila itu terjadi, URI diambil
 * dari get_app_state harness dan wajib terbukti baru: file-nya muncul di postSnapshot dan tidak ada di snapshot.
 */
export function verifyNewDoc(input: VerifyNewDocInput): VerifyNewDocResult {
  const out: string[] = [];
  const source = input.uri ? 'pen-newdoc.sh' : 'get_app_state';
  const uri = input.uri ?? input.appStateUri;
  if (!uri) return { uri, source, problems: ['URI dokumen baru kosong (pen-newdoc.sh dan get_app_state tidak memberi URI)'] };
  if (input.uri && input.appStateUri !== input.uri) out.push(`get_app_state URI ${input.appStateUri ?? '(kosong)'} ≠ newdoc ${input.uri}`);
  if (input.prevUris.includes(uri)) out.push(`URI sama dengan run sebelumnya: ${uri}`);
  const path = uriToPath(uri);
  if (!path) out.push(`URI bukan file:// yang sah: ${uri}`);
  else {
    if (path === (input.goldenPath ?? GOLDEN_DOC_PATH)) out.push(`URI adalah dokumen golden set: ${path}`);
    if (input.snapshot.includes(path)) out.push(`dokumen sudah ada sebelum newdoc: ${path}`);
    if (!input.uri && !(input.postSnapshot ?? []).includes(path)) out.push(`pen-newdoc.sh tidak mencetak URI dan ${path} tidak muncul sesudah newdoc`);
  }
  if (input.topNodes.length > 0) out.push(`dokumen baru tidak kosong: ${input.topNodes.length} node top-level`);
  return { uri, source, problems: out };
}
