// Tool MCP `fix_check` (spec-check-autofix) → `POST /viewer/fix-check`. Dipisah dari server.ts supaya jejak di file
// bersama kecil (satu import + satu pemanggilan).
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { G0_RULE_IDS, errorMessage, findingLine, summaryText, type DocOp, type Finding, type FindingSummary } from '@lakar/schema';
import { formatError, type LakarTransport } from './client.js';
import { toolAnnotations } from './annotations.js';

/** Deskripsi tool `fix_check`. */
export const FIX_CHECK_DESCRIPTION =
  'Terapkan perbaikan otomatis temuan layout_check di dokumen aktif (tanpa boardId = semua board). ' +
  'Default hanya fix aman (deterministik, menjaga maksud): LC-12 tinggi pas board landing selesai (tanpa node absolut yang terpotong), LC-29 bobot 400, LC-30 … dan en dash rentang tanpa spasi (bukan teks mono). ' +
  'suggestions:true juga menerapkan saran pertama temuan tanpa fix aman (ukuran/line-height ke skala tipe, spacing ke token, wrap teks, target sentuh 44, ' +
  'hapus spacer, radius konsentris, lebar baris, ukuran/posisi board, tandai Overlay, hapus emoji/glyph): butuh penilaian, periksa hasilnya. ' +
  'codes = batasi aturan (mis. ["LC-30"]); dryRun:true = terapkan di salinan + check tanpa commit. ' +
  'Semua fix = satu rev (satu langkah undo: undo membatalkannya; visual_diff {} membandingkan dengan rev sebelumnya). Dilewati (skipped): board target berubah sejak check (stale), properti terikat token (token), ' +
  'bentrok dengan fix lain (conflict), ditolak op core (invalid). Board dirender dan dicek ulang. ' +
  'Mengembalikan {docId, slug, rev, dryRun, boards, summary, applied:[{rule, nodeId, nodeName, kind: fix|suggestion, label, ops}], skipped:[{…, reason, detail}], ' +
  'remaining:[temuan tersisa], newFindings:[temuan baru akibat fix]}; ditampilkan sebagai baris ringkas. ' +
  'Board tidak ada → NOT_FOUND; dokumen yang tidak bisa dirender → error yang sama dengan screenshot (tidak di-commit).';

type Applied = { rule: string; nodeId: string; nodeName: string; kind: 'fix' | 'suggestion'; label: string; ops: DocOp[] };
export type FixCheckData = {
  rev: number;
  dryRun: boolean;
  boards: { id: string }[];
  summary: FindingSummary;
  applied: Applied[];
  skipped: (Applied & { reason: string; detail?: string })[];
  remaining: Finding[];
  newFindings: Finding[];
};

/** Batas baris temuan per bagian (sisa, baru) di output MCP. */
export const FIX_CHECK_FINDING_LINES = 30;

const cut = (lines: string[], max: number, what: string): string[] =>
  lines.length > max ? [...lines.slice(0, max), `… ${lines.length - max} ${what} lagi`] : lines;

/** Output fix_check: ringkasan, lalu baris diterapkan/dilewati, sisa, dan temuan baru. */
export function formatFixCheck(d: FixCheckData): string {
  const head =
    `fix_check rev ${d.rev}${d.dryRun ? ' (dryRun: tidak di-commit)' : ''}: ${d.applied.length} diterapkan, ${d.skipped.length} dilewati; ` +
    `sesudah: ${summaryText(d.summary)}${d.newFindings.length ? ` (${d.newFindings.length} temuan baru)` : ''}`;
  const applied = d.applied.map((a) => `diterapkan · ${a.kind} · ${a.rule} · ${a.nodeName} (${a.nodeId}) · ${a.label}`);
  const skipped = d.skipped.map((s) => `dilewati · ${s.reason} · ${s.rule} · ${s.nodeName} (${s.nodeId}) · ${s.label}${s.detail ? ` · ${s.detail}` : ''}`);
  const remaining = d.remaining.map((f) => `sisa · ${findingLine(f)}${f.suggestions?.length ? ` · saran: ${f.suggestions.map((x) => x.label).join(' | ')}` : ''}`);
  const fresh = d.newFindings.map((f) => `baru · ${findingLine(f)}`);
  return [head, ...cut(applied, 60, 'diterapkan'), ...cut(skipped, 30, 'dilewati'), ...cut(remaining, FIX_CHECK_FINDING_LINES, 'sisa'), ...cut(fresh, FIX_CHECK_FINDING_LINES, 'baru')].join('\n');
}

const errorResult = (text: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text }] });

export function registerFixCheckTool(server: McpServer, client: LakarTransport): void {
  server.registerTool(
    'fix_check',
    {
      annotations: toolAnnotations('fix_check'),
      description: FIX_CHECK_DESCRIPTION,
      inputSchema: z.object({
        boardId: z.string().optional().describe('ID board; kosongkan untuk semua board dokumen aktif'),
        codes: z
          .array(z.enum(G0_RULE_IDS as [string, ...string[]]))
          .optional()
          .describe('hanya aturan ini, mis. ["LC-30","LC-12"]; kosongkan untuk semua'),
        suggestions: z.boolean().optional().describe('true = juga terapkan saran pertama temuan tanpa fix aman (default false)'),
        dryRun: z.boolean().optional().describe('true = hitung dan check tanpa commit (default false)'),
      }).strict(),
    },
    async (args) => {
      try {
        const body = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
        const r = await client.call<FixCheckData>('/viewer/fix-check', body);
        if (!r.ok) return errorResult(formatError(r.error));
        return { content: [{ type: 'text', text: formatFixCheck(r.data) }] };
      } catch (e) {
        return errorResult(errorMessage(e));
      }
    },
  );
}
