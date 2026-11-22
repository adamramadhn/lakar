// UI props dan slot komponen di panel Design (epic komponen story 5, desain 08 Components: grup Component master
// C2xbUQ/yjpLy dengan Prop Row zbNXr + menu "Add property", grup Instance xTIr4/rmfSe dengan Properties dan Slot Box).
// Semua op dibangun componentProps.ts dari dokumen terbaru saat giliran aksinya (`ComponentEdit` milik Viewer), lalu
// dikirim sebagai satu permintaan route ops (undo per jendela, AD-7/AD-8).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ComponentDef, LakarDocument } from '@lakar/schema';
import type { BuildResult } from './componentQueue';
import { nodeProps, type InsertKind } from './codegen';
import { instanceNode, type ComponentInfo } from './componentModel';
import {
  addPropOps,
  addSlotOps,
  bindLabel,
  bindProps,
  moveCandidates,
  nameProblem,
  parseOptions,
  removePropOps,
  removeSlotOps,
  renameSlotOps,
  setInstancePropOps,
  slotAddOp,
  slotMoveOp,
  updatePropOps,
  type InstanceModel,
  type InstancePropRow,
  type InstanceSlotRow,
  type MasterModel,
  type MasterPropRow,
  type MasterSlotRow,
  type PropType,
} from './componentProps';
import { Menu, type Item } from './FileMenu';
import { Icon, NODE_ICON, type IconName } from './icons';

/**
 * Penjalan aksi komponen milik Viewer: `build` dievaluasi pada dokumen tersimpan terbaru (sesudah aksi sebelumnya
 * tampil); `select` memilih node sesudah commit dari `refs` respons.
 */
export type ComponentEdit = (label: string, build: (doc: LakarDocument, info: ComponentInfo) => BuildResult, select?: (refs: Readonly<Record<string, string>>) => string | undefined) => void;

const TYPE_ICON: Record<PropType | 'slot', IconName> = { text: 'type', boolean: 'toggleRight', enum: 'list', slot: 'squareDashedBottom' };
const TYPE_TAG: Record<PropType | 'slot', string> = { text: 'Text', boolean: 'Boolean', enum: 'Enum', slot: 'Slot' };
const ADD_PROPERTY: { type: PropType; label: string; hint: string }[] = [
  { type: 'text', label: 'Text', hint: 'Bind to text' },
  { type: 'boolean', label: 'Boolean', hint: 'Show / hide a layer' },
  { type: 'enum', label: 'Enum', hint: 'Pick one of values' },
];
const menuAt = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return { x: Math.max(8, r.right - 232), y: r.bottom + 4 };
};
const defOf = (model: MasterModel): ComponentDef => ({ props: model.props.map((p) => p.prop), slots: model.slots.map((s) => ({ name: s.name, nodeId: s.nodeId })) });

/** Input teks berkotak: Enter/blur commit, Escape batal; `validate` → pesan inline tanpa commit. */
function TextInput({ value, onCommit, disabled, label, mono, validate, autoFocus, placeholder }: { value: string; onCommit: (v: string) => void; disabled: boolean; label: string; mono?: boolean; validate?: (v: string) => string | undefined; autoFocus?: boolean; placeholder?: string }) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const cancelled = useRef(false);
  useEffect(() => setProblem(undefined), [value]);
  return (
    <>
      <label className={`dp-select cp-input${mono ? ' mono' : ''}${problem ? ' invalid' : ''}${disabled ? ' disabled' : ''}`}>
        <input
          className="dp-inline"
          value={draft ?? value}
          aria-label={label}
          aria-invalid={problem ? true : undefined}
          disabled={disabled}
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.currentTarget.value);
            setProblem(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') {
              e.stopPropagation();
              cancelled.current = true;
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            const text = e.currentTarget.value;
            const typed = draft !== undefined;
            setDraft(undefined);
            if (cancelled.current) {
              cancelled.current = false;
              setProblem(undefined);
              return;
            }
            if (!typed || text === value) return;
            const p = validate?.(text);
            setProblem(p);
            // Tidak sah: teks yang diketik tetap tampil di samping pesannya supaya bisa diperbaiki.
            if (p) setDraft(text);
            else onCommit(text);
          }}
        />
      </label>
      {problem && (
        <span className="cp-problem" role="alert">
          {problem}
        </span>
      )}
    </>
  );
}

function Select({ value, options, onPick, disabled, label }: { value: string; options: readonly (readonly [string, string])[]; onPick: (v: string) => void; disabled: boolean; label: string }) {
  return (
    <label className={`dp-select${disabled ? ' disabled' : ''}`}>
      <select value={value} disabled={disabled} aria-label={label} onChange={(e) => onPick(e.currentTarget.value)}>
        {!options.some(([v]) => v === value) && <option value={value}>{value || '—'}</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={12} className="dp-select-chevron" />
    </label>
  );
}

function Switch({ on, onToggle, disabled, label }: { on: boolean; onToggle: (v: boolean) => void; disabled: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`} disabled={disabled} onClick={() => onToggle(!on)}>
      <i />
    </button>
  );
}

function SectionHeader({ title, onAdd, addTitle, disabled, open }: { title: string; onAdd?: ((el: HTMLElement) => void) | undefined; addTitle?: string; disabled: boolean; open?: boolean }) {
  return (
    <div className="dp-group-header cp-section">
      <h3>{title}</h3>
      {onAdd && (
        <button type="button" className={`dp-header-btn${open ? ' open' : ''}`} title={addTitle} aria-label={addTitle} aria-haspopup="menu" disabled={disabled} onClick={(e) => onAdd(e.currentTarget)}>
          <Icon name="plus" size={13} />
        </button>
      )}
    </div>
  );
}

/** Prop Row (zbNXr): ikon tipe, nama mono + tag tipe, default + target bind, tombol `…`. */
function PropRow({ kind, name, line2, target, open, onToggle, onMore, disabled }: { kind: PropType | 'slot'; name: string; line2: string; target: string; open: boolean; onToggle: () => void; onMore: (el: HTMLElement) => void; disabled: boolean }) {
  return (
    <div className={`cp-row${open ? ' open' : ''}`}>
      <button type="button" className="cp-row-main" aria-expanded={open} aria-label={`${TYPE_TAG[kind]} ${name}`} onClick={onToggle}>
        <span className="cp-row-icon">
          <Icon name={TYPE_ICON[kind]} size={13} />
        </span>
        <span className="cp-row-body">
          <span className="cp-row-line1">
            <span className="cp-row-name">{name}</span>
            <span className="cp-row-tag">{TYPE_TAG[kind]}</span>
          </span>
          <span className="cp-row-line2">
            <span className="cp-row-default">{line2}</span>
            <span className="cp-row-bind">
              <Icon name="link2" size={11} />
              <span>{target}</span>
            </span>
          </span>
        </span>
      </button>
      <button type="button" className="cp-row-more" title="More" aria-label={`More for ${name}`} aria-haspopup="menu" disabled={disabled} onClick={(e) => onMore(e.currentTarget)}>
        <Icon name="ellipsis" size={13} />
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cp-field">
      <span className="cp-field-label">{label}</span>
      <div className="cp-field-control">{children}</div>
    </div>
  );
}

/** Editor prop (tanpa desain, C6): Name, Default, Options (enum), Bindings. Setiap commit = satu aksi. */
function PropEditor({ row, model, edit, disabled, onRenamed }: { row: MasterPropRow; model: MasterModel; edit: ComponentEdit; disabled: boolean; onRenamed: (name: string) => void }) {
  const p = row.prop;
  const change = (label: string, c: Parameters<typeof updatePropOps>[4]) => edit(label, (doc, info) => updatePropOps(doc, info, model.masterId, p.name, c));
  const bindable = model.layers.filter((l) => bindProps(p.type, l.type, l.root).length > 0);
  const layerOptions = bindable.map((l) => [l.id, `${'\u00a0\u00a0'.repeat(l.depth)}${l.name}`] as const);
  const setBinds = (binds: { nodeId: string; prop: string }[], label: string) => change(label, { binds });
  const nextBind = (): { nodeId: string; prop: string } | undefined => {
    const used = new Set(p.binds.map((b) => `${b.nodeId}:${b.prop}`));
    for (const l of bindable) for (const prop of bindProps(p.type, l.type, l.root)) if (!used.has(`${l.id}:${prop}`)) return { nodeId: l.id, prop };
    return undefined;
  };
  const candidate = nextBind();
  return (
    <div className="cp-editor">
      <Field label="Name">
        <TextInput mono label="Property name" value={p.name} disabled={disabled} validate={(v) => nameProblem(defOf(model), v, p.name)} onCommit={(v) => (onRenamed(v), change('Rename property', { name: v }))} />
      </Field>
      <Field label="Default">
        {p.type === 'text' ? (
          <TextInput label="Default value" value={p.default} disabled={disabled} onCommit={(v) => change('Change property default', { default: v })} />
        ) : p.type === 'boolean' ? (
          <div className="cp-switch-row">
            <Switch on={p.default} label="Default value" disabled={disabled} onToggle={(v) => change('Change property default', { default: v })} />
            <span className="cp-state">{p.default ? 'True' : 'False'}</span>
          </div>
        ) : (
          <Select label="Default value" value={p.default} options={p.options.map((o) => [o, o] as const)} disabled={disabled} onPick={(v) => change('Change property default', { default: v })} />
        )}
      </Field>
      {p.type === 'enum' && (
        <Field label="Options">
          <TextInput
            label="Options"
            value={p.options.join(', ')}
            placeholder="small, medium, large"
            disabled={disabled}
            validate={(v) => (parseOptions(v).length ? undefined : 'Add at least one option')}
            onCommit={(v) => change('Change property options', { options: parseOptions(v) })}
          />
        </Field>
      )}
      <Field label="Bindings">
        <div className="cp-binds">
          {p.binds.length === 0 && <span className="dp-helper">{bindable.length ? 'Not bound to a layer yet.' : 'No layer in this component accepts this type.'}</span>}
          {p.binds.map((b, i) => {
            const layer = model.layers.find((l) => l.id === b.nodeId);
            const allowed = layer ? bindProps(p.type, layer.type, layer.root) : [];
            const props = allowed.includes(b.prop) ? allowed : [b.prop, ...allowed];
            return (
              <div key={`${b.nodeId}:${b.prop}:${i}`} className="cp-bind-row">
                <Select
                  label="Bound layer"
                  value={b.nodeId}
                  options={bindable.some((l) => l.id === b.nodeId) ? layerOptions : [[b.nodeId, layer?.name ?? 'Missing layer'], ...layerOptions]}
                  disabled={disabled}
                  onPick={(id) => {
                    const l = model.layers.find((x) => x.id === id);
                    const prop = l ? bindProps(p.type, l.type, l.root)[0] : undefined;
                    if (prop) setBinds(p.binds.map((x, j) => (j === i ? { nodeId: id, prop } : x)), 'Change binding');
                  }}
                />
                <Select label="Bound property" value={b.prop} options={props.map((x) => [x, bindLabel(x)] as const)} disabled={disabled} onPick={(prop) => setBinds(p.binds.map((x, j) => (j === i ? { ...x, prop } : x)), 'Change binding')} />
                <button type="button" className="dp-icon-btn" title="Remove binding" aria-label="Remove binding" disabled={disabled} onClick={() => setBinds(p.binds.filter((_, j) => j !== i), 'Remove binding')}>
                  <Icon name="minus" size={14} />
                </button>
              </div>
            );
          })}
          {candidate && (
            <button type="button" className="cp-link-btn" disabled={disabled} onClick={() => setBinds([...p.binds, candidate], 'Add binding')}>
              <Icon name="plus" size={12} />
              Add binding
            </button>
          )}
        </div>
      </Field>
    </div>
  );
}

function SlotEditor({ row, model, edit, disabled, onRenamed }: { row: MasterSlotRow; model: MasterModel; edit: ComponentEdit; disabled: boolean; onRenamed: (name: string) => void }) {
  return (
    <div className="cp-editor">
      <Field label="Name">
        <TextInput mono autoFocus label="Slot name" value={row.name} disabled={disabled} validate={(v) => nameProblem(defOf(model), v, row.name)} onCommit={(v) => (onRenamed(v), edit('Rename slot', (doc, info) => renameSlotOps(doc, info, model.masterId, row.name, v)))} />
      </Field>
    </div>
  );
}

type MenuState = { x: number; y: number; items: Item[]; key: string } | undefined;

/**
 * Grup Component master (desain C2xbUQ "Group Component"): Properties (+ menu Add property), Prop Row per prop
 * dengan editor, Slots (+ menu frame), Prop Row per slot, dan hint.
 */
export function MasterComponentGroup({ model, edit, disabled }: { model: MasterModel; edit: ComponentEdit; disabled: boolean }) {
  const [open, setOpen] = useState<string | undefined>(undefined);
  const [menu, setMenu] = useState<MenuState>(undefined);
  // Editor yang dibuka sesudah tambah prop/slot menunggu barisnya muncul (rev berikutnya).
  const pendingOpen = useRef<string | undefined>(undefined);
  const names = [...model.props.map((p) => `p:${p.name}`), ...model.slots.map((s) => `s:${s.name}`)];
  useEffect(() => {
    if (pendingOpen.current && names.includes(pendingOpen.current)) {
      setOpen(pendingOpen.current);
      pendingOpen.current = undefined;
    }
  });
  const close = () => setMenu(undefined);
  const addMenu = (el: HTMLElement) =>
    setMenu({
      ...menuAt(el),
      key: 'add',
      items: ADD_PROPERTY.map(({ type, label, hint }, i) => ({
        label,
        icon: TYPE_ICON[type],
        shortcut: hint,
        ...(i === 0 ? { heading: 'Add property' } : {}),
        run: () => {
          close();
          edit(`Add ${label.toLowerCase()} property`, (doc) => {
            const r = addPropOps(doc, model.masterId, type);
            if (r) pendingOpen.current = `p:${r.name}`;
            return r?.ops;
          });
        },
      })),
    });
  const slotMenu = (el: HTMLElement) =>
    setMenu({
      ...menuAt(el),
      key: 'slot',
      items: model.frames.length
        ? model.frames.map((f, i) => ({
            key: f.id,
            label: `${'\u00a0\u00a0'.repeat(Math.max(0, f.depth - 1))}${f.name}`,
            icon: 'frame' as IconName,
            shortcut: 'Frame',
            ...(i === 0 ? { heading: 'Mark as slot' } : {}),
            run: () => {
              close();
              edit('Mark frame as slot', (doc) => {
                const r = addSlotOps(doc, model.masterId, f.id);
                return r?.ops;
              });
            },
          }))
        : [{ label: 'No frames inside this component', heading: 'Mark as slot', disabled: true, run: close }],
    });
  const propMore = (row: MasterPropRow, el: HTMLElement) =>
    setMenu({
      ...menuAt(el),
      key: `p:${row.name}`,
      items: [
        { label: open === `p:${row.name}` ? 'Close editor' : 'Edit property', icon: 'pencil', run: () => (close(), setOpen((o) => (o === `p:${row.name}` ? undefined : `p:${row.name}`))) },
        { label: 'Delete property', icon: 'trash', danger: true, separator: true, run: () => (close(), edit('Delete property', (doc, info) => removePropOps(doc, info, model.masterId, row.name))) },
      ],
    });
  const slotMore = (row: MasterSlotRow, el: HTMLElement) =>
    setMenu({
      ...menuAt(el),
      key: `s:${row.name}`,
      items: [
        { label: 'Rename slot', icon: 'pencil', run: () => (close(), setOpen(`s:${row.name}`)) },
        { label: 'Remove slot', icon: 'trash', danger: true, separator: true, run: () => (close(), edit('Remove slot', (doc) => removeSlotOps(doc, model.masterId, row.name))) },
      ],
    });
  const toggle = (k: string) => setOpen((o) => (o === k ? undefined : k));
  return (
    <section className="dp-group cp-group">
      <SectionHeader title="Properties" addTitle="Add property" onAdd={addMenu} disabled={disabled} open={menu?.key === 'add'} />
      {model.props.length === 0 && <span className="dp-helper cp-empty">Add a property to change text, visibility, or a value per instance.</span>}
      {model.props.map((row) => (
        <div key={`p:${row.name}`} className="cp-item">
          <PropRow kind={row.type} name={row.name} line2={row.defaultText} target={row.bindText} open={open === `p:${row.name}`} onToggle={() => toggle(`p:${row.name}`)} onMore={(el) => propMore(row, el)} disabled={disabled} />
          {open === `p:${row.name}` && <PropEditor row={row} model={model} edit={edit} disabled={disabled} onRenamed={(n) => (pendingOpen.current = `p:${n}`)} />}
        </div>
      ))}
      <div className="cp-gap" />
      <SectionHeader title="Slots" addTitle="Add slot" onAdd={slotMenu} disabled={disabled} open={menu?.key === 'slot'} />
      {model.slots.map((row) => (
        <div key={`s:${row.name}`} className="cp-item">
          <PropRow kind="slot" name={row.name} line2={row.countText} target={row.frameName} open={open === `s:${row.name}`} onToggle={() => toggle(`s:${row.name}`)} onMore={(el) => slotMore(row, el)} disabled={disabled} />
          {open === `s:${row.name}` && <SlotEditor row={row} model={model} edit={edit} disabled={disabled} onRenamed={(n) => (pendingOpen.current = `s:${n}`)} />}
        </div>
      ))}
      <div className="cp-hint">
        <Icon name="info" size={12} />
        <span>Select a frame inside the master and mark it as slot.</span>
      </div>
      {menu && <Menu key={menu.key} x={menu.x} y={menu.y} items={menu.items} onClose={close} />}
    </section>
  );
}

/** Grup "Slot" untuk frame di dalam master (tanpa desain, C6): Mark as slot / Slot · nama + Remove slot. */
export function SlotFrameGroup({ frameId, masterId, masterName, slot, edit, disabled }: { frameId: string; masterId: string; masterName: string; slot: string | undefined; edit: ComponentEdit; disabled: boolean }) {
  return (
    <section className="dp-group cp-group">
      <div className="dp-group-header">
        <h3>Slot</h3>
      </div>
      {slot ? (
        <div className="cp-slot-state">
          <Icon name="squareDashedBottom" size={13} />
          <span>
            Slot · <code>{slot}</code>
          </span>
          <button type="button" className="cp-link-btn" disabled={disabled} onClick={() => edit('Remove slot', (doc) => removeSlotOps(doc, masterId, slot))}>
            Remove slot
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="btn cp-mark-btn" disabled={disabled} onClick={() => edit('Mark frame as slot', (doc) => addSlotOps(doc, masterId, frameId)?.ops)}>
            <Icon name="squareDashedBottom" size={13} />
            Mark as slot
          </button>
          <span className="dp-helper">Instances of {masterName} can fill this frame with their own layers.</span>
        </>
      )}
    </section>
  );
}

function InstancePropControl({ row, instanceId, edit, disabled }: { row: InstancePropRow; instanceId: string; edit: ComponentEdit; disabled: boolean }) {
  const set = (v: string | boolean) => edit(`Change ${row.name}`, (doc, info) => setInstancePropOps(doc, info, instanceId, row.name, v));
  if (row.type === 'text') return <TextInput label={row.name} value={String(row.value)} disabled={disabled} onCommit={set} />;
  if (row.type === 'boolean') {
    const on = row.value === true;
    return (
      <div className="cp-switch-row">
        <Switch on={on} label={row.name} disabled={disabled} onToggle={set} />
        <span className="cp-state">{row.visibility ? (on ? 'Shown' : 'Hidden') : on ? 'On' : 'Off'}</span>
      </div>
    );
  }
  return <Select label={row.name} value={String(row.value)} options={row.options.map((o) => [o, o] as const)} disabled={disabled} onPick={set} />;
}

const INSERT_IN_SLOT: { kind: InsertKind; label: string }[] = [
  { kind: 'text', label: 'Text' },
  { kind: 'frame', label: 'Frame' },
  { kind: 'rect', label: 'Rectangle' },
  { kind: 'ellipse', label: 'Ellipse' },
];
const KIND_ICON: Partial<Record<InsertKind, IconName>> = { text: 'text', frame: 'frame', rect: 'square', ellipse: 'circle' };

/**
 * Properties dan Slots grup Instance (desain xTIr4): satu baris label + kontrol per prop, Slot Box per slot. `+` Slot
 * Box: sisip layer baru/instance lain, atau pindahkan layer board ke slot.
 */
export function InstancePropsSlots({ model, masters, doc, info, edit, disabled, onSelect }: { model: InstanceModel; masters: readonly { id: string; name: string }[]; doc: LakarDocument; info: ComponentInfo; edit: ComponentEdit; disabled: boolean; onSelect: (address: string) => void }) {
  const [menu, setMenu] = useState<MenuState>(undefined);
  const close = () => setMenu(undefined);
  const pick = (refs: Readonly<Record<string, string>>) => refs.slotted;
  const slotMenu = (slot: InstanceSlotRow, el: HTMLElement) => {
    const items: Item[] = INSERT_IN_SLOT.map(({ kind, label }, i) => ({
      key: `k:${kind}`,
      label,
      icon: KIND_ICON[kind] ?? 'square',
      ...(i === 0 ? { heading: 'Insert' } : {}),
      run: () => (close(), edit(`Insert ${label.toLowerCase()} into ${slot.name}`, () => [slotAddOp(slot.address, nodeProps(kind))], pick)),
    }));
    masters
      .filter((m) => m.id !== model.masterId)
      .forEach((m, i) =>
        items.push({
          key: `c:${m.id}`,
          label: m.name,
          icon: 'component',
          ...(i === 0 ? { heading: 'Components', separator: true } : {}),
          run: () => (close(), edit(`Insert ${m.name} into ${slot.name}`, () => [slotAddOp(slot.address, instanceNode(m))], pick)),
        }),
      );
    moveCandidates(doc, info, model.instanceId).forEach((c, i) =>
      items.push({
        key: `m:${c.id}`,
        label: c.name,
        icon: NODE_ICON[c.type] ?? (c.type === 'instance' ? 'diamond' : 'square'),
        ...(i === 0 ? { heading: 'Move into slot', separator: true } : {}),
        run: () => (close(), edit(`Move ${c.name} into ${slot.name}`, () => [slotMoveOp(c.id, slot.address)], () => c.id)),
      }),
    );
    setMenu({ ...menuAt(el), key: slot.name, items });
  };
  return (
    <>
      {model.props.length > 0 && (
        <>
          <SectionHeader title="Properties" disabled={disabled} />
          {model.props.map((row) => (
            <div key={row.name} className="cp-inst-row">
              <span className="cp-inst-label" title={row.name}>
                {row.name}
              </span>
              <div className="cp-inst-control">
                <InstancePropControl row={row} instanceId={model.instanceId} edit={edit} disabled={disabled} />
              </div>
            </div>
          ))}
        </>
      )}
      {model.slots.length > 0 && (
        <>
          <SectionHeader title="Slots" disabled={disabled} />
          {model.slots.map((slot) => (
            <div key={slot.name} className="cp-inst-row">
              <span className="cp-inst-label" title={slot.name}>
                {slot.name}
              </span>
              <div className={`cp-slot-box${menu?.key === slot.name ? ' open' : ''}`}>
                <button type="button" className="cp-slot-main" title={`Select slot ${slot.name}`} onClick={() => onSelect(slot.address)}>
                  <Icon name="layers" size={12} />
                  <span>{slot.text}</span>
                </button>
                <button type="button" className="cp-slot-add" title={`Add to ${slot.name}`} aria-label={`Add to ${slot.name}`} aria-haspopup="menu" disabled={disabled} onClick={(e) => slotMenu(slot, e.currentTarget)}>
                  <Icon name="plus" size={13} />
                </button>
              </div>
            </div>
          ))}
        </>
      )}
      {menu && <Menu key={menu.key} x={menu.x} y={menu.y} items={menu.items} onClose={close} />}
    </>
  );
}

