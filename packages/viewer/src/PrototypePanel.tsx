// Panel Prototype (spec-prototype-mode): tombol Present ke route `#/p/<slug>`, daftar flow (titik masuk), dan
// editor interaksi `tap` untuk node terpilih. Interaksi ditulis via op `update` (`patch.interactions`, `null`
// menghapus kunci); flow via `setFlows` (ganti seluruh array). Pada instance, interaksi dibaca dari node tersimpan
// (segmen pertama) sehingga yang tertulis cocok dengan hit-test mode Present.
import { useMemo } from 'react';
import type { DocOp, Flow, Interaction, LakarDocument, Transition } from '@lakar/schema';
import { effectiveNode, isComposite } from './componentModel';
import { presentHash } from './files';
import { Icon } from './icons';

/** Id 8 karakter `[A-Za-z0-9]` untuk interaksi/flow baru (bentuk sama dengan id node). */
function newId(): string {
  const a = new Uint32Array(3);
  crypto.getRandomValues(a);
  const s = [...a].map((n) => n.toString(36)).join('');
  return (s.replace(/[^A-Za-z0-9]/g, '') + '00000000').slice(0, 8);
}

type Raw = { id: string; name: string; type: string; interactions?: Interaction[] };
type Commit = (ops: DocOp[], description: string) => Promise<boolean>;

const TRIGGERS: { value: Interaction['trigger']; label: string }[] = [{ value: 'tap', label: 'Tap' }];
const ACTIONS: { value: Interaction['action']['kind']; label: string }[] = [
  { value: 'navigate', label: 'Navigate to' },
  { value: 'back', label: 'Back' },
  { value: 'openLink', label: 'Open link' },
];
const TRANSITIONS: { value: Transition['kind']; label: string }[] = [
  { value: 'instant', label: 'Instant' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'slide', label: 'Slide' },
];
const DIRECTIONS: { value: NonNullable<Transition['direction']>; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
];

const select = (v: string, opts: readonly { value: string; label: string }[], onChange: (v: string) => void, label: string, disabled = false) => (
  <select className="proto-select" aria-label={label} value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
    {opts.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

export function PrototypePanel({ slug, doc, selection, editable, onCommit }: { slug: string; doc: LakarDocument; selection: readonly string[]; editable: boolean; onCommit: Commit }) {
  const boards = useMemo(() => doc.pages.flatMap((p) => p.children as unknown as Raw[]), [doc]);
  const flows = (doc.flows ?? []) as Flow[];
  const selectedId = selection[selection.length - 1];
  // Node terpilih: alamat komposit → node ter-ekspansi (interaksi master + override); id instance → node tersimpan.
  const selected = useMemo((): Raw | undefined => {
    if (!selectedId) return undefined;
    if (isComposite(selectedId)) return effectiveNode(doc, selectedId) as Raw | undefined;
    const walk = (list: readonly Raw[]): Raw | undefined => {
      for (const n of list) {
        if (n.id === selectedId) return n;
        const c = n as unknown as { children?: Raw[]; slots?: Record<string, Raw[]> };
        const hit = walk(c.children ?? []) ?? walk(Object.values(c.slots ?? {}).flat());
        if (hit) return hit;
      }
      return undefined;
    };
    return walk(boards);
  }, [doc, selectedId, boards]);
  const interactions = selected?.interactions ?? [];

  const setFlows = (next: Flow[] | null) => void onCommit([{ op: 'setFlows', flows: next as never }], 'Edit flows');
  const setInteractions = (next: Interaction[]) =>
    selectedId && void onCommit([{ op: 'update', id: selectedId, patch: { interactions: next.length ? next : null } }], 'Edit interactions');
  const patchInteraction = (id: string, p: Partial<Interaction>) => setInteractions(interactions.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const patchTransition = (id: string, p: Partial<Transition> | null) =>
    patchInteraction(id, { transition: p === null ? undefined : { ...(interactions.find((i) => i.id === id)?.transition ?? { kind: 'instant' }), ...p } });

  return (
    <div className="prototype-panel">
      <div className="proto-head">
        <button type="button" className="proto-present" disabled={!boards.length} title={boards.length ? 'Present prototype' : 'No boards to present'} onClick={() => (location.hash = presentHash(slug))}>
          <Icon name="play" size={13} />
          Present
        </button>
      </div>

      <section className="proto-section">
        <h3>Flows</h3>
        {flows.length === 0 && <p className="proto-hint">No flows. The presentation starts at the first board.</p>}
        {flows.map((f) => (
          <div key={f.id} className="proto-flow">
            <Icon name="flag" size={12} />
            <input key={`${f.id}:${f.name}`} className="proto-name" defaultValue={f.name} aria-label="Flow name" disabled={!editable} onBlur={(e) => e.currentTarget.value !== f.name && e.currentTarget.value.trim() && setFlows(flows.map((x) => (x.id === f.id ? { ...x, name: e.currentTarget.value.trim() } : x)))} />
            {select(f.startBoardId, boards.map((b) => ({ value: b.id, label: b.name })), (v) => setFlows(flows.map((x) => (x.id === f.id ? { ...x, startBoardId: v } : x))), 'Starting board', !editable)}
            <button type="button" className="proto-icon-btn" aria-label={`Present flow ${f.name}`} title={`Present “${f.name}”`} onClick={() => (location.hash = presentHash(slug, f.id))}>
              <Icon name="play" size={12} />
            </button>
            <button type="button" className="proto-icon-btn" aria-label="Delete flow" disabled={!editable} onClick={() => setFlows(flows.filter((x) => x.id !== f.id).length ? flows.filter((x) => x.id !== f.id) : null)}>
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}
        {boards.length > 0 && (
          <button type="button" className="proto-add" disabled={!editable} onClick={() => setFlows([...flows, { id: newId(), name: `Flow ${flows.length + 1}`, startBoardId: boards[0]!.id }])}>
            <Icon name="plus" size={12} /> Add flow
          </button>
        )}
      </section>

      <section className="proto-section">
        <h3>Interactions</h3>
        {!selected && <p className="proto-hint">Select a layer to add interactions.</p>}
        {selected && (
          <>
            <p className="proto-target">
              <Icon name="pointer" size={11} /> {selected.name}
            </p>
            {interactions.map((i) => (
              <div key={i.id} className="proto-interaction">
                <div className="proto-row">
                  {select(i.trigger, TRIGGERS, () => undefined, 'Trigger', true)}
                  {select(
                    i.action.kind,
                    ACTIONS,
                    (v) =>
                      patchInteraction(i.id, {
                        action: v === 'navigate' ? { kind: 'navigate', boardId: boards[0]?.id ?? '' } : v === 'back' ? { kind: 'back' } : { kind: 'openLink', url: 'https://' },
                      }),
                    'Action',
                    !editable,
                  )}
                  <button type="button" className="proto-icon-btn" aria-label="Delete interaction" disabled={!editable} onClick={() => setInteractions(interactions.filter((x) => x.id !== i.id))}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
                {i.action.kind === 'navigate' && (
                  <div className="proto-row">
                    {select(i.action.boardId, boards.map((b) => ({ value: b.id, label: b.name })), (v) => patchInteraction(i.id, { action: { kind: 'navigate', boardId: v } }), 'Target board', !editable)}
                    {select(i.transition?.kind ?? 'instant', TRANSITIONS, (v) => patchTransition(i.id, v === 'instant' ? null : { kind: v as Transition['kind'] }), 'Transition', !editable)}
                  </div>
                )}
                {i.action.kind === 'navigate' && i.transition?.kind === 'slide' && (
                  <div className="proto-row">
                    {select(i.transition.direction ?? 'left', DIRECTIONS, (v) => patchTransition(i.id, { direction: v as Transition['direction'] }), 'Direction', !editable)}
                    <input
                      key={`${i.id}:${i.transition.durationMs ?? 300}`}
                      className="proto-num"
                      type="number"
                      min={1}
                      step={50}
                      aria-label="Duration (ms)"
                      title="Duration (ms)"
                      defaultValue={i.transition.durationMs ?? 300}
                      disabled={!editable}
                      onBlur={(e) => Number(e.currentTarget.value) > 0 && patchTransition(i.id, { durationMs: Number(e.currentTarget.value) })}
                    />
                  </div>
                )}
                {i.action.kind === 'openLink' && (
                  <div className="proto-row">
                    <input
                      key={`${i.id}:${(i.action as { kind: 'openLink'; url: string }).url}`}
                      className="proto-url"
                      defaultValue={(i.action as { kind: 'openLink'; url: string }).url}
                      aria-label="Link URL"
                      placeholder="https://…"
                      disabled={!editable}
                      onBlur={(e) => e.currentTarget.value.trim() && patchInteraction(i.id, { action: { kind: 'openLink', url: e.currentTarget.value.trim() } })}
                    />
                  </div>
                )}
              </div>
            ))}
            <button type="button" className="proto-add" disabled={!editable || !boards.length} onClick={() => setInteractions([...interactions, { id: newId(), trigger: 'tap', action: { kind: 'navigate', boardId: boards[0]!.id } }])}>
              <Icon name="plus" size={12} /> Add interaction
            </button>
            {selected.type === 'board' && interactions.length === 0 && <p className="proto-hint">Board-level interactions apply to taps anywhere on the board.</p>}
          </>
        )}
      </section>
    </div>
  );
}
