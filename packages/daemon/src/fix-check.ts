// Route fix_check (spec-check-autofix): `POST /viewer/fix-check` untuk sesi MCP (dokumen aktif sesi).
// Alur: check penuh tanpa batas per aturan (rev N) → rencana fix (`planFixes`: fix aman, saran pertama bila
// `suggestions`) → di bawah kunci dokumen: buang fix basi (dokumen berubah sejak rev N dan target berbeda), fix pada
// properti terikat token, dan fix yang ditolak op core → semua fix tersisa diterapkan lewat `applyOps` sebagai SATU
// transaksi (satu rev, satu entri riwayat = satu langkah undo) → render + check ulang board yang dicek → commit
// (kecuali `dryRun`). Error render → tidak di-commit (seperti execute).
import type { FastifyInstance } from 'fastify';
import { capWarnings, findingKey, planFixes, sortFindings, staleFixes, touchedBoards, type PlannedFix, type SkippedFix } from '@lakar/check';
import { applyOps, transact, type DocumentLocks } from '@lakar/core';
import type { RenderPort } from '@lakar/ports';
import { iconRefs } from '@lakar/render';
import {
  G0_RULE_IDS,
  LakarError,
  SESSION_HEADER,
  findBoard,
  resolveDocument,
  summarizeFindings,
  type DocOp,
  type Finding,
  type LakarDocument,
  type ResolvedDocument,
} from '@lakar/schema';
import { z } from 'zod';
import { runCheck, type BoardCheck } from './check.js';
import type { AgentSteps } from './agent-undo.js';
import type { CheckLedger } from './checks.js';
import { notFound } from './errors.js';
import type { HugHeights } from './hug-heights.js';
import { locateNode } from './inspect.js';
import { NO_ACTIVE_DOC_HINT, authorOf, type Sessions } from './sessions.js';
import type { DocStore } from './store.js';

/** Label riwayat commit fix_check. */
export const FIX_CHECK_DESCRIPTION = 'Apply check fixes';

const FixCheckBody = z
  .object({
    boardId: z.string().min(1).optional(),
    codes: z.array(z.enum(G0_RULE_IDS as [string, ...string[]])).optional(),
    suggestions: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  })
  .strict()
  .optional();
const FIX_CHECK_HINT = `kirim {boardId?, codes?: [${G0_RULE_IDS.slice(0, 3).join(', ')}, …], suggestions?: boolean, dryRun?: boolean}`;

export type FixCheckRoutesOptions = {
  docs: Map<string, LakarDocument>;
  store: DocStore;
  docLocks: DocumentLocks;
  sessions: Sessions;
  render: RenderPort<ResolvedDocument>;
  hugs: HugHeights;
  checks: CheckLedger;
  /** Hook tulis agen (undo agen + dasar visual_diff). */
  agentSteps: AgentSteps;
  icons: { canonical(lib: string, icon: string): unknown };
};

/** Properti yang di-patch op masih menyimpan ref token (`{$token}`) di dokumen tersimpan → fix memutus token. */
export function tokenBoundKey(stored: LakarDocument, op: DocOp): string | undefined {
  if (op.op !== 'update') return undefined;
  // Alamat komposit (isi instance) = override per instance; master tidak disentuh.
  const hit = locateNode(stored, op.id);
  if (!hit) return undefined;
  const node = hit.node as unknown as Record<string, unknown>;
  return Object.keys(op.patch).find((k) => JSON.stringify(node[k] ?? null).includes('"$token"'));
}

/** Temuan per board dibatasi seperti layout_check (3 warning/info per aturan per board), urutan board dijaga. */
function capped(byBoard: ReadonlyMap<string, Finding[]>): { findings: Finding[]; boards: Map<string, Finding[]> } {
  const boards = new Map<string, Finding[]>();
  for (const [id, list] of byBoard) boards.set(id, capWarnings(list));
  return { findings: sortFindings([...boards.values()].flat()), boards };
}

export function registerFixCheckRoutes(app: FastifyInstance, opts: FixCheckRoutesOptions): void {
  const { docs, store, docLocks, sessions, render, hugs, checks, agentSteps, icons } = opts;

  app.post('/viewer/fix-check', async (req, reply) => {
    const session = sessions.require(req.headers[SESSION_HEADER]);
    const slug = session.activeSlug;
    if (!slug || !docs.get(slug)) throw new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif', { hint: NO_ACTIVE_DOC_HINT });
    const parsed = FixCheckBody.safeParse(req.body ?? undefined);
    if (!parsed.success) {
      throw new LakarError('SCHEMA_INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), { hint: FIX_CHECK_HINT });
    }
    const body = parsed.data ?? {};
    const dryRun = body.dryRun === true;

    // 1. Check penuh pada rev N (tanpa kunci; dokumen immutable), tanpa batas per aturan supaya semua fix terlihat.
    const base = docs.get(slug)!;
    const baseResolved = resolveDocument(base);
    let boardIds: string[];
    if (body.boardId !== undefined) {
      if (!findBoard(baseResolved, body.boardId)) {
        throw notFound(`board ${body.boardId} tidak ada di dokumen ${slug}`, 'pakai ID board dari list_boards, atau panggil fix_check tanpa boardId untuk semua board');
      }
      boardIds = [body.boardId];
    } else boardIds = baseResolved.pages.flatMap((p) => p.children.map((b) => b.id));
    for (const id of boardIds) for (const r of iconRefs(findBoard(baseResolved, id)!)) icons.canonical(r.lib, r.icon);
    const before = await runCheck(render, baseResolved, boardIds, hugs.known(baseResolved), { cap: false });
    hugs.record(baseResolved, before.measures);
    const { planned, skipped: conflicts } = planFixes(before.findings, { codes: body.codes, suggestions: body.suggestions === true });

    // 2. Di bawah kunci: saring basi/token/invalid, terapkan sisanya sebagai satu transaksi, check ulang, commit.
    const out = await docLocks.run(slug, async () => {
      const current = docs.get(slug);
      if (!current || session.activeSlug !== slug) throw new LakarError('NO_ACTIVE_DOC', 'sesi ini belum punya dokumen aktif', { hint: NO_ACTIVE_DOC_HINT });
      const currentResolved = current === base ? baseResolved : resolveDocument(current);
      const { fresh, stale } = staleFixes(planned, baseResolved, currentResolved);
      const skipped: SkippedFix[] = [...conflicts, ...stale];
      const usable: PlannedFix[] = [];
      for (const it of fresh) {
        const key = it.ops.map((op) => tokenBoundKey(current, op)).find((k) => k !== undefined);
        if (key !== undefined) skipped.push({ ...it, reason: 'token', detail: `${key} is bound to a token; change the token or the binding instead` });
        else usable.push(it);
      }
      // Validasi berurutan pada salinan memori: fix yang ditolak op core dilewati, sisanya pasti lolos bersama.
      const applied: PlannedFix[] = [];
      let acc = current;
      for (const it of usable) {
        try {
          acc = (await transact(acc, { sessionId: session.id, description: FIX_CHECK_DESCRIPTION }, (tx) => applyOps(tx, it.ops))).doc;
          applied.push(it);
        } catch (e) {
          if (!(e instanceof LakarError)) throw e;
          skipped.push({ ...it, reason: 'invalid', detail: `${e.code}: ${e.message}` });
        }
      }
      if (!applied.length) {
        const shown = capped(before.byBoard);
        return { rev: current.rev, applied, skipped, boards: boardSummaries(before.boards, shown.boards), remaining: shown.findings, newFindings: [] as Finding[] };
      }
      const committed = await transact(current, { sessionId: session.id, description: FIX_CHECK_DESCRIPTION }, (tx) => applyOps(tx, applied.flatMap((it) => it.ops)));
      const after = resolveDocument(committed.doc);
      // Review 33-4: kunci dipegang selama render, jadi hanya board yang berubah sejak check (fix ini atau tulis lain)
      // dirender ulang; board lain memakai hasil check awal. Fix pada board itu sendiri (posisi/ukuran, LC-12) mengubah
      // tabrakan board lain → semua board dicek ulang. Board yang hilang (dijaga) dilewati.
      const live = boardIds.filter((id) => findBoard(after, id));
      const changed = new Set(touchedBoards(baseResolved, after));
      const boardLevel = applied.some((it) => it.ops.some((op) => 'id' in op && findBoard(after, op.id) !== undefined));
      const recheck = boardLevel ? live : live.filter((id) => changed.has(id));
      const ran = recheck.length ? await runCheck(render, after, recheck, hugs.known(currentResolved)) : undefined;
      const shownBefore = capped(before.byBoard);
      const reusedSummaries = boardSummaries(before.boards, shownBefore.boards);
      const boards = live.map((id) => ran?.boards.find((b) => b.id === id) ?? reusedSummaries.find((b) => b.id === id)!);
      const findings = sortFindings(live.flatMap((id) => ran?.byBoard.get(id) ?? shownBefore.boards.get(id) ?? []));
      const old = new Set(before.findings.map(findingKey));
      const remaining = findings.filter((f) => old.has(findingKey(f)));
      const newFindings = findings.filter((f) => !old.has(findingKey(f)));
      if (!dryRun) {
        await store.commit(slug, committed.doc, { ...committed.entry!, ...authorOf(session) });
        docs.set(slug, committed.doc);
        if (ran) {
          checks.record(committed.doc.id, current.rev, committed.doc.rev, ran.boards);
          hugs.record(after, ran.measures, current.rev);
        }
        // Hook tulis agen tunggal (spec-agent-visual-diff X1): fix_check = satu langkah undo agen, dan dasar
        // visual_diff {} = rev sebelum fix_check.
        agentSteps.onAgentWrite(session, committed.doc.id, current.rev, committed.doc.rev, committed.inverse, FIX_CHECK_DESCRIPTION);
      }
      return { rev: dryRun ? current.rev : committed.doc.rev, applied, skipped, boards, remaining, newFindings };
    });

    const all = [...out.remaining, ...out.newFindings];
    return reply.code(200).send({
      ok: true,
      data: {
        docId: base.id,
        slug,
        rev: out.rev,
        dryRun,
        boards: out.boards,
        summary: summarizeFindings(all),
        applied: out.applied,
        skipped: out.skipped,
        remaining: out.remaining,
        newFindings: out.newFindings,
      },
    });
  });
}

/** Ringkasan board dari temuan yang ditampilkan (terbatas). */
function boardSummaries(boards: readonly BoardCheck[], shown: ReadonlyMap<string, Finding[]>): BoardCheck[] {
  return boards.map((b) => ({ ...b, summary: summarizeFindings(shown.get(b.id) ?? []) }));
}
