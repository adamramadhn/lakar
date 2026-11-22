// Panel Design (editor-canvas story 5, desain bagian 05 Editor: fdf6D/S7hYr, SuJOz/UHOWY, XlDGD/g6Mbir, XZif7/J02Cu;
// komponen Section 00 DESIGN PANEL: Segmented Control, Select Field, Paint Row). Menggantikan tab Inspect: nilai dibaca
// dari node tersimpan (ref token tampil sebagai chip) dan setiap edit yang di-commit (Enter/blur, lepas scrub, pilih
// segmen/select, tutup color picker) menjadi satu permintaan ops berisi op `update` untuk semua node terpilih (AD-7),
// lewat `onCommit` Viewer (History + undo, AD-8). Parsing/patch di designValues.ts dan designModel.ts (murni).
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { gradientLayerCss } from '@lakar/render';
import { Blend, type DocOp } from '@lakar/schema';
import type { FontFamily, InspectNode } from './api';
import { copyText } from './Connections';
import { copyAs, type CopyFormat } from './copyas';
import { ALIGN_ACTIONS, DISTRIBUTE_ACTIONS, type EditAction } from './editActions';
import { ACTION_META, actionTitle } from './EditMenu';
import {
  addFill,
  addShadow,
  addStroke,
  canEditXY,
  convertFill,
  CORNERS,
  describeEdit,
  designGroups,
  editFill,
  editShadow,
  editStop,
  fillRows,
  keepsToken,
  layoutOf,
  moveFill,
  radiusAll,
  readField,
  readSizing,
  removeFill,
  removeShadow,
  removeStroke,
  setAllFills,
  setLayout,
  setProp,
  setRadiusAll,
  setRadiusCorner,
  setSizing,
  setStroke,
  SIDES,
  solidAlpha,
  solidColor,
  strokeColor,
  strokeSides,
  toggleSide,
  type Axis,
  type DesignTarget,
  type FieldState,
  type FillLike,
  type PaintKind,
  type Raw,
  type Side,
  type Sizing,
} from './designModel';
import {
  formatNumber,
  formatPadding,
  formatPercent,
  formatShadow,
  changeColor,
  isTokenRef,
  parseHex,
  parseNumber,
  parsePadding,
  parsePercent,
  parseShadow,
  sameValue,
  splitHex,
  WEIGHT_NAMES,
} from './designValues';
import { Menu } from './FileMenu';
import { Icon, NODE_ICON, type IconName } from './icons';

type Commit = (ops: DocOp[], description: string) => Promise<boolean>;

const TYPE_LABEL: Record<string, string> = { board: 'Board', frame: 'Frame', text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', path: 'Path', icon: 'Icon' };
const COPY_FORMATS: readonly [CopyFormat, string][] = [
  ['css', 'CSS'],
  ['tailwind', 'Tailwind'],
  ['json', 'JSON'],
];
const ALIGN_OPTIONS = [
  ['start', 'Start'],
  ['center', 'Center'],
  ['end', 'End'],
  ['stretch', 'Stretch'],
] as const;
const JUSTIFY_OPTIONS = [
  ['start', 'Start'],
  ['center', 'Center'],
  ['end', 'End'],
  ['space-between', 'Space between'],
] as const;
const BLEND_OPTIONS = Blend.options.map((b) => [b, b.replace(/(^|-)([a-z])/g, (_, s: string, c: string) => (s ? ' ' : '') + c.toUpperCase())] as const);
const ALL_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/** Pembangun op dari target terbaru (dievaluasi saat giliran commit-nya tiba). */
type Build = (targets: DesignTarget[]) => DocOp[];
/** Kontrol non-aktif bila panel baca-saja (pratinjau versi/offline); `run` mengantre satu edit (satu commit). */
type Ctx = { disabled: boolean; run: (build: Build, label: string) => void };
/** Batas tunggu rev commit sebelumnya sebelum antrean edit dilanjutkan (dokumen gagal dimuat ulang). */
const PENDING_MAX_MS = 3000;

// ---------------------------------------------------------------------------
// Komponen dasar (Section 00 DESIGN PANEL)
// ---------------------------------------------------------------------------

function TokenChip({ name, onClick, disabled }: { name: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" className="dp-token" title={`Token ${name}. Edit the value to detach it.`} disabled={disabled} onClick={onClick}>
      {name}
    </button>
  );
}

type FieldProps = {
  label: string;
  state: FieldState;
  /** Nilai tersimpan → teks kolom (bukan token). */
  format: (v: unknown, resolved: unknown) => string;
  /** Teks kolom → nilai skema; undefined = tidak valid (kolom kembali). */
  parse: (text: string) => unknown;
  onCommit: (v: unknown) => void;
  disabled: boolean;
  /** Scrub label: langkah per px, batas, dan nilai numerik awal. */
  scrub?: { step: number; min?: number; max?: number; base?: number | undefined; toValue?: (n: number) => unknown } | undefined;
  /** Teks redup saat kosong (mis. ukuran terukur, "Auto"). */
  placeholder?: string | undefined;
  className?: string | undefined;
  title?: string | undefined;
};

/**
 * Kolom angka/teks (komponen Field): Enter/blur commit, Escape batal, ref token = chip (klik → input berisi nilai
 * resolve; nilai sama = ref tetap). Scrub: drag horizontal pada label, pratinjau hanya di kolom, commit saat lepas.
 */
function Field({ label, state, format, parse, onCommit, disabled, scrub, placeholder, className, title }: FieldProps) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [scrubText, setScrubText] = useState<string | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  const token = !state.mixed && isTokenRef(state.value) ? state.value.$token : undefined;
  const [tokenOpen, setTokenOpen] = useState(false);
  useEffect(() => setTokenOpen(false), [token]);
  const shown = state.mixed ? '' : token ? format(state.resolved, state.resolved) : format(state.value, state.resolved);
  const finish = (text: string) => {
    setDraft(undefined);
    setTokenOpen(false);
    if (text === shown && !state.mixed) return;
    if (state.mixed && text.trim() === '') return;
    const v = parse(text);
    if (v === undefined) return;
    if (keepsToken(state, v)) return;
    if (!state.mixed && sameValue(state.value, v)) return;
    onCommit(v);
  };
  useEffect(() => {
    if (tokenOpen) input.current?.select();
  }, [tokenOpen]);
  const startScrub = (e: React.PointerEvent) => {
    if (!scrub || disabled || state.mixed || e.button !== 0) return;
    // Hanya angka: tuple padding/teks tidak di-scrub (akan runtuh jadi satu angka); kosong → `scrub.base`.
    const raw = token ? state.resolved : state.value;
    const base = typeof raw === 'number' ? raw : raw === undefined ? scrub.base : undefined;
    if (base === undefined) return;
    const x0 = e.clientX;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let last: number | undefined;
    let done = false;
    const clamp = (n: number) => Math.min(scrub.max ?? Infinity, Math.max(scrub.min ?? -Infinity, n));
    const onMove = (ev: PointerEvent) => {
      const n = clamp(Math.round((base + (ev.clientX - x0) * scrub.step * (ev.shiftKey ? 10 : 1)) * 100) / 100);
      last = n;
      setScrubText(format(scrub.toValue ? scrub.toValue(n) : n, undefined));
    };
    const end = (commit: boolean) => {
      if (done) return;
      done = true;
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      setScrubText(undefined);
      if (commit && last !== undefined && last !== base) onCommit(scrub.toValue ? scrub.toValue(last) : last);
    };
    const onUp = () => end(true);
    const onCancel = () => end(false);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      end(false);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
  };
  return (
    // div (bukan label): klik label untuk scrub tidak boleh memfokuskan input (draft lama akan tertahan).
    <div className={`dp-field${disabled ? ' disabled' : ''}${className ? ` ${className}` : ''}`} title={title}>
      <span
        className={`dp-field-label${scrub && !disabled ? ' scrub' : ''}`}
        onPointerDown={(e) => {
          e.preventDefault();
          startScrub(e);
        }}
      >
        {label}
      </span>
      {token && !tokenOpen && draft === undefined && scrubText === undefined ? (
        <TokenChip name={token} disabled={disabled} onClick={() => setTokenOpen(true)} />
      ) : (
        <input
          ref={input}
          className="dp-field-value"
          aria-label={label}
          value={scrubText ?? draft ?? shown}
          placeholder={state.mixed ? 'Mixed' : placeholder}
          disabled={disabled}
          spellCheck={false}
          autoFocus={tokenOpen}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') {
              e.stopPropagation();
              cancelled.current = true;
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            if (cancelled.current) {
              cancelled.current = false;
              setDraft(undefined);
              setTokenOpen(false);
              return;
            }
            // Tanpa ketikan (draft kosong) tidak ada commit: nilai yang berubah dari luar selama fokus tidak ditimpa.
            if (draft === undefined) return setTokenOpen(false);
            finish(e.currentTarget.value);
          }}
        />
      )}
    </div>
  );
}

type SegOption<T> = { value: T; label?: string; icon?: IconName; title?: string; disabled?: boolean };

/** Segmented Control: satu pilihan (`value`) atau beberapa (`active`). */
function Segmented<T extends string>({
  options,
  value,
  active,
  onPick,
  disabled,
  className,
  label,
}: {
  options: readonly SegOption<T>[];
  value?: T | undefined;
  active?: ((v: T) => boolean) | undefined;
  onPick: (v: T) => void;
  disabled: boolean;
  className?: string;
  label: string;
}) {
  return (
    <div className={`dp-seg${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {options.map((o) => {
        const on = active ? active(o.value) : value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            className={`dp-seg-item${on ? ' active' : ''}`}
            aria-pressed={on}
            title={o.title ?? o.label}
            aria-label={o.title ?? o.label}
            disabled={disabled || o.disabled}
            onClick={() => !on || active ? onPick(o.value) : undefined}
          >
            {o.icon && <Icon name={o.icon} size={14} />}
            {o.label && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Select Field: label + nilai + chevron di atas `<select>` native. Mixed/token tampil sebagai opsi non-aktif. */
function SelectField({
  label,
  state,
  options,
  onPick,
  disabled,
  className,
}: {
  label?: string;
  state: FieldState;
  options: readonly (readonly [string, string])[];
  onPick: (v: string) => void;
  disabled: boolean;
  className?: string;
}) {
  const token = !state.mixed && isTokenRef(state.value) ? state.value.$token : undefined;
  const cur = state.mixed ? '__mixed' : token ? '__token' : state.value === undefined ? '__unset' : String(state.value);
  const known = options.some(([v]) => v === cur);
  return (
    <label className={`dp-select${disabled ? ' disabled' : ''}${className ? ` ${className}` : ''}`}>
      {label && <span className="dp-field-label">{label}</span>}
      <select
        value={cur}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (!v.startsWith('__')) onPick(v);
        }}
      >
        {state.mixed && (
          <option value="__mixed" disabled>
            Mixed
          </option>
        )}
        {token && (
          <option value="__token" disabled>
            {`$${token}`}
          </option>
        )}
        {cur === '__unset' && (
          <option value="__unset" disabled>
            Default
          </option>
        )}
        {!known && !cur.startsWith('__') && <option value={cur}>{cur}</option>}
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

/** Swatch: dengan `pick` membuka color picker native (commit sekali saat picker ditutup, event `change`). */
function Swatch({ background, pick, onClick, disabled, title }: { background: string; pick?: ((hex: string) => void) | undefined; onClick?: (() => void) | undefined; disabled: boolean; title: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const solid = /^#[0-9a-f]{6}/i.test(background) ? background.slice(0, 7).toLowerCase() : '#000000';
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChange = () => pickRef.current?.(el.value);
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, [pick !== undefined, solid]);
  if (pick) {
    return (
      <label className={`dp-swatch${disabled ? ' disabled' : ''}`} title={title}>
        <i style={{ background }} />
        <input ref={ref} type="color" defaultValue={solid} key={solid} disabled={disabled} aria-label={title} />
      </label>
    );
  }
  return (
    <button type="button" className="dp-swatch" title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      <i style={{ background }} />
    </button>
  );
}

/** Nilai warna di Paint Row: hex yang bisa diketik; ref token = chip, klik → input berisi hex resolve (detach). */
function ColorValue({ stored, resolved, onHex, disabled, mixed, placeholder, label }: { stored: unknown; resolved: unknown; onHex: (hex: string) => void; disabled: boolean; mixed?: boolean; placeholder?: string; label: string }) {
  const [open, setOpen] = useState(false);
  const token = !mixed && isTokenRef(stored) ? stored.$token : undefined;
  useEffect(() => setOpen(false), [token]);
  if (token && !open) {
    return <TokenChip name={token} disabled={disabled} onClick={() => setOpen(true)} />;
  }
  return (
    <InlineInput
      label={label}
      autoFocus={open}
      value={mixed ? '' : hexText(resolved)}
      placeholder={mixed ? 'Mixed' : (placeholder ?? '')}
      disabled={disabled}
      onDone={() => setOpen(false)}
      onCommit={(t) => parseHex(t) && onHex(t)}
    />
  );
}

/** Paint Row: kotak (swatch + nilai + opacity) + tombol hapus. */
function PaintRow({ swatch, value, opacity, onRemove, disabled, removeTitle, drag }: { swatch: ReactNode; value: ReactNode; opacity?: ReactNode; onRemove?: (() => void) | undefined; disabled: boolean; removeTitle?: string; drag?: DragProps | undefined }) {
  return (
    <div className={`dp-paint${drag?.over ? ' drop-over' : ''}`} {...(drag ? { draggable: !disabled, onDragStart: drag.onDragStart, onDragOver: drag.onDragOver, onDragLeave: drag.onDragLeave, onDrop: drag.onDrop, onDragEnd: drag.onDragEnd } : {})}>
      <div className="dp-paint-box">
        {swatch}
        <div className="dp-paint-value">{value}</div>
        {opacity !== undefined && <div className="dp-paint-opacity">{opacity}</div>}
      </div>
      {onRemove && (
        <button type="button" className="dp-icon-btn" title={removeTitle ?? 'Remove'} aria-label={removeTitle ?? 'Remove'} disabled={disabled} onClick={onRemove}>
          <Icon name="minus" size={14} />
        </button>
      )}
    </div>
  );
}

type DragProps = {
  over: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
};

/** Input teks polos di dalam Paint Row (hex, opacity, shadow): Enter/blur commit, Escape batal. */
function InlineInput({ value, onCommit, disabled, placeholder, label, className, autoFocus, onDone }: { value: string; onCommit: (text: string) => void; disabled: boolean; placeholder?: string | undefined; label: string; className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const cancelled = useRef(false);
  return (
    <input
      className={`dp-inline${className ? ` ${className}` : ''}`}
      value={draft ?? value}
      placeholder={placeholder}
      aria-label={label}
      disabled={disabled}
      spellCheck={false}
      autoFocus={autoFocus}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.currentTarget.value)}
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
        onDone?.();
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        if (typed && text !== value) onCommit(text);
      }}
    />
  );
}

function Group({ title, action, children, empty }: { title: string; action?: ReactNode; children?: ReactNode; empty?: boolean }) {
  return (
    <section className={`dp-group${empty ? ' empty' : ''}`}>
      <div className="dp-group-header">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function HeaderButton({ icon, title, onClick, disabled }: { icon: IconName; title: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" className="dp-header-btn" title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={13} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Format/parse kolom
// ---------------------------------------------------------------------------

const num = (v: unknown) => (typeof v === 'number' ? formatNumber(v) : '');
const parseSize = (t: string) => parseNumber(t, { min: 0 });
const parsePositive = (t: string) => {
  const n = parseNumber(t);
  return n !== undefined && n > 0 ? n : undefined;
};
const hexText = (c: unknown) => splitHex(c)?.hex ?? '';
const alphaText = (c: unknown) => {
  const s = splitHex(c);
  return s ? formatPercent(s.alpha) : '';
};
/** Warna (literal atau resolve) → CSS swatch. */
const swatchCss = (c: unknown) => (typeof c === 'string' && splitHex(c) ? c : 'transparent');
const fillCss = (f: FillLike) => gradientLayerCss(f as never) ?? 'repeating-conic-gradient(#8080804d 0 25%, transparent 0 50%) 0 0 / 8px 8px';
const FILL_LABEL: Record<string, string> = { linear: 'Linear gradient', radial: 'Radial gradient', conic: 'Conic gradient', noise: 'Noise', mesh: 'Mesh gradient', image: 'Image' };

// ---------------------------------------------------------------------------
// Kelompok
// ---------------------------------------------------------------------------

function PositionGroup({ targets, ctx, bounds }: { targets: DesignTarget[]; ctx: Ctx; bounds: [number, number, number, number] | undefined }) {
  const xyEditable = targets.every(canEditXY);
  const board = targets.every((t) => t.type === 'board');
  const icon = targets.every((t) => t.type === 'icon');
  const xy = (axis: 'x' | 'y', i: 0 | 1) => {
    const state: FieldState = xyEditable
      ? readField(targets, (n) => n[axis] ?? 0)
      : { mixed: false, value: targets.length === 1 && bounds ? bounds[i] : undefined, resolved: undefined };
    return (
      <Field
        label={axis.toUpperCase()}
        state={state}
        format={num}
        parse={(t) => parseNumber(t)}
        placeholder="–"
        disabled={ctx.disabled || !xyEditable}
        title={xyEditable ? undefined : 'Position comes from the parent auto layout'}
        scrub={{ step: 1 }}
        onCommit={(v) => ctx.run((ts) => setProp(ts, axis, Math.round(Number(v))), `Change ${axis.toUpperCase()}`)}
      />
    );
  };
  const dim = (axis: Axis) => {
    const label = axis === 'width' ? 'W' : 'H';
    const state = readField(targets, (n) => n[axis]);
    const mode = readSizing(targets, axis);
    const measured = targets.length === 1 ? targets[0]!.measured?.[axis === 'width' ? 'w' : 'h'] : undefined;
    const numeric: FieldState = state.mixed || typeof state.value === 'number' || isTokenRef(state.value) ? state : { mixed: false, value: undefined, resolved: undefined };
    return (
      <div className="dp-row">
        <Field
          className="dp-w96"
          label={label}
          state={numeric}
          format={num}
          parse={parseSize}
          placeholder={measured !== undefined ? formatNumber(measured) : mode === 'fill' ? 'Fill' : 'Hug'}
          disabled={ctx.disabled}
          scrub={{ step: 1, min: 0, base: measured }}
          onCommit={(v) => ctx.run((ts) => setProp(ts, axis, Math.round(Number(v) * 100) / 100), `Change ${axis}`)}
        />
        {!board && (
          <Segmented<Sizing>
            label={`${axis === 'width' ? 'Width' : 'Height'} sizing`}
            className="dp-grow"
            options={[
              { value: 'fixed', label: 'Fixed' },
              { value: 'hug', label: 'Hug' },
              { value: 'fill', label: 'Fill' },
            ]}
            value={mode}
            disabled={ctx.disabled}
            onPick={(m) => ctx.run((ts) => setSizing(ts, axis, m), `Change ${axis} sizing`)}
          />
        )}
      </div>
    );
  };
  return (
    <Group title="Position & size">
      <div className="dp-row">
        {xy('x', 0)}
        {xy('y', 1)}
      </div>
      {!icon && dim('width')}
      {!icon && dim('height')}
    </Group>
  );
}

function AutoLayoutGroup({ targets, ctx }: { targets: DesignTarget[]; ctx: Ctx }) {
  const dir = readField(targets, layoutOf);
  const layout = dir.mixed ? undefined : (dir.value as 'none' | 'row' | 'column');
  const on = layout === 'row' || layout === 'column';
  return (
    <Group
      title="Auto layout"
      action={
        on ? (
          <HeaderButton icon="minus" title="Remove auto layout" disabled={ctx.disabled} onClick={() => ctx.run((ts) => setLayout(ts, null), 'Remove auto layout')} />
        ) : (
          <HeaderButton icon="plus" title="Add auto layout" disabled={ctx.disabled} onClick={() => ctx.run((ts) => setLayout(ts, 'column'), 'Add auto layout')} />
        )
      }
    >
      <div className="dp-row">
        <Segmented<'none' | 'row' | 'column' | 'grid'>
          label="Direction"
          className="dp-grow"
          options={[
            { value: 'none', icon: 'squareDashed', title: 'No auto layout' },
            { value: 'row', icon: 'arrowRight', title: 'Horizontal' },
            { value: 'column', icon: 'arrowDown', title: 'Vertical' },
            { value: 'grid', icon: 'layoutGrid', title: 'Grid layout comes in a later update', disabled: true },
          ]}
          value={layout}
          disabled={ctx.disabled}
          onPick={(v) => v !== 'grid' && ctx.run((ts) => setLayout(ts, v === 'none' ? null : v), 'Change layout direction')}
        />
      </div>
      {(on || dir.mixed) && (
        <>
          <div className="dp-row">
            <Field label="Gap" state={readField(targets, (n) => n.gap ?? 0)} format={num} parse={(t) => parseNumber(t)} scrub={{ step: 1 }} disabled={ctx.disabled} onCommit={(v) => ctx.run((ts) => setProp(ts, 'gap', v), 'Change gap')} />
            <Field
              label="Padding"
              state={readField(targets, (n) => n.padding ?? 0)}
              format={(v) => formatPadding(v)}
              parse={parsePadding}
              scrub={{ step: 1, min: 0 }}
              disabled={ctx.disabled}
              onCommit={(v) => ctx.run((ts) => setProp(ts, 'padding', v), 'Change padding')}
            />
          </div>
          <div className="dp-row">
            <SelectField label="Align" state={readField(targets, (n) => n.align ?? 'start')} options={ALIGN_OPTIONS} disabled={ctx.disabled} onPick={(v) => ctx.run((ts) => setProp(ts, 'align', v), 'Change align')} />
            <SelectField label="Justify" state={readField(targets, (n) => n.justify ?? 'start')} options={JUSTIFY_OPTIONS} disabled={ctx.disabled} onPick={(v) => ctx.run((ts) => setProp(ts, 'justify', v), 'Change justify')} />
          </div>
        </>
      )}
    </Group>
  );
}

/** Paint row warna tunggal (warna teks/ikon/stroke/shadow): swatch picker, hex, alpha. */
function ColorRow({
  state,
  onColor,
  disabled,
  onRemove,
  removeTitle,
  value,
  placeholder,
}: {
  state: FieldState;
  /** Warna baru lengkap `#RRGGBB[AA]` (alpha lama sudah dipertahankan pemanggil bila perlu). */
  onColor: (next: { hex?: string; alpha?: number }) => void;
  disabled: boolean;
  onRemove?: (() => void) | undefined;
  removeTitle?: string;
  value?: ReactNode;
  placeholder?: string;
}) {
  const resolved = state.mixed ? undefined : state.resolved;
  return (
    <PaintRow
      disabled={disabled}
      onRemove={onRemove}
      {...(removeTitle ? { removeTitle } : {})}
      swatch={<Swatch background={swatchCss(resolved)} disabled={disabled} title="Pick color" pick={(hex) => onColor({ hex })} />}
      value={value ?? <ColorValue label="Hex color" stored={state.mixed ? undefined : state.value} resolved={resolved} mixed={state.mixed} placeholder={placeholder} disabled={disabled} onHex={(hex) => onColor({ hex })} />}
      opacity={<InlineInput label="Opacity" className="dp-opacity" value={state.mixed ? '' : alphaText(resolved)} disabled={disabled || state.mixed || !splitHex(resolved)} onCommit={(t) => { const a = parsePercent(t); if (a !== undefined) onColor({ alpha: a }); }} />}
    />
  );
}

function TypographyGroup({ targets, ctx, fonts }: { targets: DesignTarget[]; ctx: Ctx; fonts: FontFamily[] }) {
  const family = readField(targets, (n) => n.family ?? 'Inter');
  const famName = !family.mixed && typeof family.resolved === 'string' ? family.resolved : undefined;
  const famEntry = fonts.find((f) => f.family.toLowerCase() === famName?.toLowerCase());
  const familyOptions = fonts.map((f) => [f.family, f.family] as const);
  const weights = famEntry?.weights.length ? famEntry.weights : ALL_WEIGHTS;
  const weightOptions = weights.map((w) => [String(w), `${WEIGHT_NAMES[w] ?? w}`] as const);
  const weight = readField(targets, (n) => n.weight ?? 400);
  const weightState: FieldState = weight.mixed || isTokenRef(weight.value) ? weight : { mixed: false, value: String(weight.value), resolved: weight.resolved };
  const align = readField(targets, (n) => n.align ?? 'left');
  const color = readField(targets, (n) => n.color);
  return (
    <Group title="Typography">
      <div className="dp-row">
        <SelectField state={family} options={familyOptions} className="dp-grow" disabled={ctx.disabled} onPick={(v) => ctx.run((ts) => setProp(ts, 'family', v), 'Change font family')} />
      </div>
      <div className="dp-row">
        <SelectField state={weightState} options={weightOptions} className="dp-grow" disabled={ctx.disabled} onPick={(v) => ctx.run((ts) => setProp(ts, 'weight', Number(v)), 'Change font weight')} />
        <Field className="dp-w96" label="Size" state={readField(targets, (n) => n.size)} format={num} parse={parsePositive} scrub={{ step: 1, min: 1 }} disabled={ctx.disabled} onCommit={(v) => ctx.run((ts) => setProp(ts, 'size', v), 'Change font size')} />
      </div>
      <div className="dp-row">
        <Field label="Line height" state={readField(targets, (n) => n.lineHeight)} format={num} parse={parsePositive} placeholder="Auto" scrub={{ step: 1, min: 1 }} disabled={ctx.disabled} onCommit={(v) => ctx.run((ts) => setProp(ts, 'lineHeight', v), 'Change line height')} />
        <Field
          label="Letter spacing"
          title="Letter spacing as a fraction of the font size (em)"
          state={readField(targets, (n) => n.letterSpacing ?? 0)}
          format={num}
          parse={(t) => parseNumber(t)}
          scrub={{ step: 0.01 }}
          disabled={ctx.disabled}
          onCommit={(v) => ctx.run((ts) => setProp(ts, 'letterSpacing', v), 'Change letter spacing')}
        />
      </div>
      <div className="dp-row">
        <Segmented<'left' | 'center' | 'right' | 'justify'>
          label="Text align"
          className="dp-grow"
          options={[
            { value: 'left', icon: 'textAlignStart', title: 'Align left' },
            { value: 'center', icon: 'textAlignCenter', title: 'Align center' },
            { value: 'right', icon: 'textAlignEnd', title: 'Align right' },
            { value: 'justify', icon: 'textAlignJustify', title: 'Justify' },
          ]}
          value={align.mixed ? undefined : (align.value as 'left')}
          disabled={ctx.disabled}
          onPick={(v) => ctx.run((ts) => setProp(ts, 'align', v), 'Change text align')}
        />
      </div>
      <ColorRow
        state={color}
        placeholder="Default"
        disabled={ctx.disabled}
        onColor={(c) => {
          const next = changeColor(color.mixed ? undefined : color.resolved, c);
          if (next) ctx.run((ts) => setProp(ts, 'color', next), 'Change text color');
        }}
      />
    </Group>
  );
}

function IconGroup({ targets, ctx }: { targets: DesignTarget[]; ctx: Ctx }) {
  const color = readField(targets, (n) => n.color);
  return (
    <Group title="Icon">
      <div className="dp-row">
        <Field label="Size" state={readField(targets, (n) => n.size)} format={num} parse={parsePositive} scrub={{ step: 1, min: 1 }} disabled={ctx.disabled} onCommit={(v) => ctx.run((ts) => setProp(ts, 'size', v), 'Change icon size')} />
      </div>
      <ColorRow
        state={color}
        placeholder="Default"
        disabled={ctx.disabled}
        onColor={(c) => {
          const next = changeColor(color.mixed ? undefined : color.resolved, c);
          if (next) ctx.run((ts) => setProp(ts, 'color', next), 'Change icon color');
        }}
      />
    </Group>
  );
}

/** Editor sebaris fill (klik swatch): jenis Solid/Linear/Radial, sudut, stop. */
function FillEditor({ index, fill, resolved, ctx }: { index: number; fill: FillLike; resolved: FillLike; ctx: Ctx }) {
  const kind = fill.type === 'solid' || fill.type === 'linear' || fill.type === 'radial' ? (fill.type as PaintKind) : undefined;
  const stops = Array.isArray(fill.stops) ? (fill.stops as Raw[]) : [];
  const rStops = Array.isArray(resolved.stops) ? (resolved.stops as Raw[]) : stops;
  const edit = (fn: (f: FillLike, r: FillLike) => FillLike | undefined, label: string) => ctx.run((ts) => editFill(ts, index, fn), label);
  return (
    <div className="dp-fill-editor">
      <Segmented<PaintKind>
        label="Fill type"
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'linear', label: 'Linear' },
          { value: 'radial', label: 'Radial' },
        ]}
        value={kind}
        disabled={ctx.disabled || !kind}
        onPick={(k) => edit((f, r) => convertFill(f, r, k), 'Change fill type')}
      />
      {fill.type === 'solid' && (
        <PaintRow
          disabled={ctx.disabled}
          swatch={<Swatch background={swatchCss(resolved.color)} title="Pick color" disabled={ctx.disabled} pick={(hex) => edit((f, r) => solidColor(f, r, hex), 'Change fill')} />}
          value={<ColorValue label="Fill color" stored={fill.color} resolved={resolved.color} disabled={ctx.disabled} onHex={(hex) => edit((f, r) => solidColor(f, r, hex), 'Change fill')} />}
        />
      )}
      {fill.type === 'linear' && (
        <div className="dp-row">
          <Field
            label="Angle"
            state={{ mixed: false, value: fill.angle, resolved: fill.angle }}
            format={num}
            parse={(t) => parseNumber(t.replace(/°$/, ''))}
            scrub={{ step: 1 }}
            disabled={ctx.disabled}
            onCommit={(v) => edit((f) => ({ ...f, angle: v }), 'Change gradient angle')}
          />
        </div>
      )}
      {stops.map((s, k) => (
        <PaintRow
          key={k}
          disabled={ctx.disabled}
          swatch={<Swatch background={swatchCss(rStops[k]?.color)} title="Pick stop color" disabled={ctx.disabled} pick={(hex) => edit((f, r) => editStop(f, r, k, { hex }), 'Change gradient stop')} />}
          value={<ColorValue label="Stop color" stored={s.color} resolved={rStops[k]?.color} disabled={ctx.disabled} onHex={(hex) => edit((f, r) => editStop(f, r, k, { hex }), 'Change gradient stop')} />}
          opacity={
            <InlineInput
              label="Stop position"
              className="dp-opacity"
              value={typeof s.offset === 'number' ? formatPercent(s.offset) : ''}
              disabled={ctx.disabled}
              onCommit={(t) => {
                const n = parseNumber(t.replace(/%$/, ''));
                if (n !== undefined) edit((f, r) => editStop(f, r, k, { offset: n / 100 }), 'Change gradient stop');
              }}
            />
          }
        />
      ))}
    </div>
  );
}

function FillGroup({ targets, ctx }: { targets: DesignTarget[]; ctx: Ctx }) {
  const all = readField(targets, (n) => n.fills);
  const [open, setOpen] = useState<number | undefined>(undefined);
  const [drag, setDrag] = useState<{ from: number; over?: number } | undefined>(undefined);
  const add = <HeaderButton icon="plus" title="Add fill" disabled={ctx.disabled} onClick={() => ctx.run((ts) => addFill(ts), 'Add fill')} />;
  if (all.mixed) {
    return (
      <Group title="Fill" action={add}>
        <ColorRow
          state={{ mixed: true }}
          disabled={ctx.disabled}
          onRemove={() => ctx.run((ts) => setAllFills(ts, null), 'Remove fills')}
          removeTitle="Remove fills"
          onColor={(c) => {
            const next = changeColor(undefined, c);
            if (next) ctx.run((ts) => setAllFills(ts, [{ type: 'solid', color: next }]), 'Change fill');
          }}
        />
      </Group>
    );
  }
  const rows = fillRows(targets[0]!);
  return (
    <Group title="Fill" action={add} empty={rows.length === 0}>
      {rows.map(({ index, fill, resolved }) => {
        const dragProps: DragProps = {
          over: drag?.over === index && drag.from !== index,
          onDragStart: (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(index));
            setDrag({ from: index });
          },
          onDragOver: (e) => {
            if (!drag) return;
            e.preventDefault();
            if (drag.over !== index) setDrag({ ...drag, over: index });
          },
          onDragLeave: () => drag && setDrag({ from: drag.from }),
          onDrop: (e) => {
            e.preventDefault();
            if (drag && drag.from !== index) {
              setOpen(undefined);
              ctx.run((ts) => moveFill(ts, drag.from, index), 'Reorder fills');
            }
            setDrag(undefined);
          },
          onDragEnd: () => setDrag(undefined),
        };
        const remove = () => {
          setOpen(undefined);
          ctx.run((ts) => removeFill(ts, index), 'Remove fill');
        };
        const toggle = () => setOpen((o) => (o === index ? undefined : index));
        const isSolid = fill.type === 'solid';
        const editable = isSolid || fill.type === 'linear' || fill.type === 'radial';
        const label =
          fill.type === 'image' ? `Image · ${String(fill.fit ?? '')}` : FILL_LABEL[String(fill.type)] ?? String(fill.type);
        return (
          <div key={index} className="dp-fill">
            <PaintRow
              drag={dragProps}
              disabled={ctx.disabled}
              onRemove={remove}
              removeTitle="Remove fill"
              swatch={<Swatch background={isSolid ? swatchCss(resolved.color) : fillCss(resolved)} title={editable ? 'Edit fill' : label} disabled={!editable} onClick={toggle} />}
              value={
                isSolid ? (
                  <ColorValue label="Hex color" stored={fill.color} resolved={resolved.color} disabled={ctx.disabled} onHex={(hex) => ctx.run((ts) => editFill(ts, index, (f, r) => solidColor(f, r, hex)), 'Change fill')} />
                ) : (
                  <span className="dp-muted">{label}</span>
                )
              }
              opacity={
                isSolid ? (
                  <InlineInput
                    label="Fill opacity"
                    className="dp-opacity"
                    value={alphaText(resolved.color)}
                    disabled={ctx.disabled}
                    onCommit={(t) => {
                      const a = parsePercent(t);
                      if (a !== undefined) ctx.run((ts) => editFill(ts, index, (f, r) => solidAlpha(f, r, a)), 'Change fill opacity');
                    }}
                  />
                ) : (
                  <span className="dp-muted">100%</span>
                )
              }
            />
            {open === index && editable && <FillEditor index={index} fill={fill} resolved={resolved} ctx={ctx} />}
          </div>
        );
      })}
    </Group>
  );
}

function StrokeGroup({ targets, ctx }: { targets: DesignTarget[]; ctx: Ctx }) {
  const has = targets.every((t) => t.stored.stroke !== undefined);
  const any = targets.some((t) => t.stored.stroke !== undefined);
  const color = readField(targets, (n) => (n.stroke as Raw | undefined)?.color);
  const width = readField(targets, (n) => (n.stroke as Raw | undefined)?.width);
  const align = readField(targets, (n) => (n.stroke as Raw | undefined)?.align);
  const sides = readField(targets, (n) => strokeSides(n.stroke));
  return (
    <Group
      title="Stroke"
      empty={!any}
      action={!has && <HeaderButton icon="plus" title="Add stroke" disabled={ctx.disabled} onClick={() => ctx.run((ts) => addStroke(ts), 'Add stroke')} />}
    >
      {any && (
        <>
          <ColorRow
            state={color}
            disabled={ctx.disabled || !has}
            onRemove={() => ctx.run((ts) => removeStroke(ts), 'Remove stroke')}
            removeTitle="Remove stroke"
            onColor={(c) => {
              const hex = c.hex;
              if (hex !== undefined) return ctx.run((ts) => strokeColor(ts, hex), 'Change stroke color');
              const next = changeColor(color.mixed ? undefined : color.resolved, c);
              if (next) ctx.run((ts) => setStroke(ts, { color: next }), 'Change stroke opacity');
            }}
          />
          <div className="dp-row">
            <Field className="dp-w64" label="W" state={width} format={num} parse={parseSize} scrub={{ step: 1, min: 0 }} disabled={ctx.disabled || !has} onCommit={(v) => ctx.run((ts) => setStroke(ts, { width: v }), 'Change stroke width')} />
            <Segmented<'inside' | 'center' | 'outside'>
              label="Stroke align"
              className="dp-grow"
              options={[
                { value: 'inside', label: 'Inside' },
                { value: 'center', label: 'Center' },
                { value: 'outside', label: 'Outside' },
              ]}
              value={align.mixed ? undefined : (align.value as 'inside')}
              disabled={ctx.disabled || !has}
              onPick={(v) => ctx.run((ts) => setStroke(ts, { align: v }), 'Change stroke align')}
            />
          </div>
          <div className="dp-row">
            <span className="dp-row-label">Sides</span>
            <Segmented<Side>
              label="Stroke sides"
              className="dp-sides"
              options={SIDES.map((s) => ({ value: s, icon: (`panel${s[0]!.toUpperCase()}${s.slice(1)}` as IconName), title: `${s[0]!.toUpperCase()}${s.slice(1)}` }))}
              active={(s) => !sides.mixed && (sides.value as Side[]).includes(s)}
              disabled={ctx.disabled || !has}
              onPick={(s) => ctx.run((ts) => toggleSide(ts, s), 'Change stroke sides')}
            />
          </div>
        </>
      )}
    </Group>
  );
}

function RadiusGroup({ targets, ctx }: { targets: DesignTarget[]; ctx: Ctx }) {
  const raw = readField(targets, (n) => n.radius);
  const resolvedAll = raw.mixed ? undefined : radiusAll(raw.resolved);
  const storedAll = raw.mixed ? undefined : radiusAll(raw.value);
  const allState: FieldState =
    raw.mixed || !storedAll || storedAll.mixed ? { mixed: true } : { mixed: false, value: storedAll.value ?? 0, resolved: resolvedAll && !resolvedAll.mixed ? resolvedAll.value : storedAll.value };
  const tuple = !raw.mixed && Array.isArray(raw.value);
  const [corners, setCorners] = useState(tuple);
  useEffect(() => {
    if (tuple) setCorners(true);
  }, [tuple]);
  const corner = (i: number): FieldState => {
    if (raw.mixed) return { mixed: true };
    const s = Array.isArray(raw.value) ? raw.value[i] : (raw.value ?? 0);
    const r = Array.isArray(raw.resolved) ? raw.resolved[i] : (raw.resolved ?? 0);
    return { mixed: false, value: s, resolved: r };
  };
  return (
    <Group title="Radius">
      <div className="dp-row">
        <Field label="All" className="dp-grow" state={allState} format={num} parse={parseSize} scrub={{ step: 1, min: 0 }} disabled={ctx.disabled} onCommit={(v) => ctx.run((ts) => setRadiusAll(ts, v), 'Change radius')} />
        <button
          type="button"
          className={`dp-icon-btn boxed${corners ? ' active' : ''}`}
          title="Independent corners"
          aria-label="Independent corners"
          aria-pressed={corners}
          disabled={ctx.disabled}
          onClick={() => setCorners((c) => !c)}
        >
          <Icon name="scan" size={14} />
        </button>
      </div>
      {corners && (
        <div className="dp-row">
          {CORNERS.map((c, i) => (
            <Field key={c} label={c} state={corner(i)} format={num} parse={parseSize} scrub={{ step: 1, min: 0 }} disabled={ctx.disabled} onCommit={(v) => ctx.run((ts) => setRadiusCorner(ts, i, v), 'Change corner radius')} />
          ))}
        </div>
      )}
    </Group>
  );
}

function EffectsGroup({ targets, ctx }: { targets: DesignTarget[]; ctx: Ctx }) {
  const shadows = readField(targets, (n) => n.shadows);
  const list = !shadows.mixed && Array.isArray(shadows.value) ? (shadows.value as Raw[]) : [];
  const rList = !shadows.mixed && Array.isArray(shadows.resolved) ? (shadows.resolved as Raw[]) : list;
  return (
    <Group title="Effects" action={<HeaderButton icon="plus" title="Add shadow" disabled={ctx.disabled} onClick={() => ctx.run((ts) => addShadow(ts), 'Add shadow')} />}>
      <div className="dp-row">
        <Field
          label="Opacity"
          state={readField(targets, (n) => n.opacity ?? 1)}
          format={(v) => (typeof v === 'number' ? formatPercent(v) : '')}
          parse={parsePercent}
          scrub={{ step: 0.01, min: 0, max: 1 }}
          disabled={ctx.disabled}
          onCommit={(v) => ctx.run((ts) => setProp(ts, 'opacity', v), 'Change opacity')}
        />
        <SelectField label="Blend" state={readField(targets, (n) => n.blend ?? 'normal')} options={BLEND_OPTIONS} disabled={ctx.disabled} onPick={(v) => ctx.run((ts) => setProp(ts, 'blend', v), 'Change blend mode')} />
      </div>
      <div className="dp-row">
        <Field label="Blur" state={readField(targets, (n) => n.blur ?? 0)} format={num} parse={parseSize} scrub={{ step: 1, min: 0 }} disabled={ctx.disabled} onCommit={(v) => ctx.run((ts) => setProp(ts, 'blur', v), 'Change blur')} />
        <Field label="Backdrop" state={readField(targets, (n) => n.backdropBlur ?? 0)} format={num} parse={parseSize} scrub={{ step: 1, min: 0 }} disabled={ctx.disabled} onCommit={(v) => ctx.run((ts) => setProp(ts, 'backdropBlur', v), 'Change backdrop blur')} />
      </div>
      {shadows.mixed ? (
        <PaintRow disabled={ctx.disabled} swatch={<Swatch background="transparent" title="Mixed" disabled />} value={<span className="dp-muted">Mixed shadows</span>} onRemove={() => ctx.run((ts) => setProp(ts, 'shadows', null), 'Remove shadows')} removeTitle="Remove shadows" />
      ) : (
        list.map((s, i) => {
          const r = rList[i] ?? s;
          return (
            <PaintRow
              key={i}
              disabled={ctx.disabled}
              removeTitle="Remove shadow"
              onRemove={() => ctx.run((ts) => removeShadow(ts, i), 'Remove shadow')}
              swatch={
                <Swatch
                  background={swatchCss(r.color)}
                  title="Pick shadow color"
                  disabled={ctx.disabled}
                  pick={(hex) => ctx.run((ts) => editShadow(ts, i, (x, rx) => { const c = changeColor(rx.color, { hex }); return c ? { ...x, color: c } : undefined; }), 'Change shadow color')}
                />
              }
              value={
                <InlineInput
                  label="Shadow"
                  value={formatShadow(s as never)}
                  disabled={ctx.disabled}
                  onCommit={(t) => {
                    const p = parseShadow(t, s.type === 'inner' ? 'inner' : 'drop');
                    if (!p) return;
                    ctx.run(
                      (ts) => editShadow(ts, i, (x) => {
                        const { spread: _s, ...rest } = x;
                        return { ...rest, ...p };
                      }),
                      'Change shadow',
                    );
                  }}
                />
              }
              opacity={
                <InlineInput
                  label="Shadow opacity"
                  className="dp-opacity"
                  value={alphaText(r.color)}
                  disabled={ctx.disabled || !splitHex(r.color)}
                  onCommit={(t) => {
                    const a = parsePercent(t);
                    if (a === undefined) return;
                    ctx.run((ts) => editShadow(ts, i, (x, rx) => { const c = changeColor(rx.color, { alpha: a }); return c ? { ...x, color: c } : undefined; }), 'Change shadow opacity');
                  }}
                />
              }
            />
          );
        })
      )}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export type DesignPanelProps = {
  targets: DesignTarget[];
  /** Jalur nama node primer (board → node). */
  path: string[];
  editable: boolean;
  fonts: FontFamily[];
  /** Node primer dari POST /inspect (Copy as, posisi terukur anak flow). */
  inspectNode: InspectNode | undefined;
  /** Rev dokumen yang tampil: antrean edit lanjut saat rev berubah. */
  rev: number;
  onCommit: Commit;
  /** Multi-seleksi (story 6, desain "Align & distribute" J8r8Gq): ketersediaan dan penjalan aksi align/distribute. */
  align?: { enabled: Record<EditAction, boolean>; run: (a: EditAction) => void } | undefined;
};

/** Grup "Align & distribute": 6 align + 2 distribute, satu permintaan ops per klik (dijalankan Viewer). */
function AlignGroup({ align, disabled }: { align: NonNullable<DesignPanelProps['align']>; disabled: boolean }) {
  return (
    <Group title="Align & distribute">
      <div className="dp-row dp-align-row">
        {[...ALIGN_ACTIONS, ...DISTRIBUTE_ACTIONS].map((a) => (
          <button key={a} type="button" className="dp-icon-btn" title={actionTitle(a)} aria-label={ACTION_META[a].label} disabled={disabled || !align.enabled[a]} onClick={() => align.run(a)}>
            <Icon name={ACTION_META[a].icon} size={15} />
          </button>
        ))}
      </div>
    </Group>
  );
}

export function DesignPanel({ targets, path, editable, fonts, inspectNode, rev, onCommit, align }: DesignPanelProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | undefined>(undefined);
  const [copied, setCopied] = useState<string | undefined>(undefined);
  // Antrean edit: patch fills/shadows/stroke berupa array/objek utuh, jadi edit berikutnya baru dibangun sesudah commit
  // sebelumnya tampil di dokumen (rev berubah) — tanpa itu edit cepat kedua menimpa yang pertama dengan data basi.
  const live = useRef({ targets, editable, rev, onCommit });
  live.current = { targets, editable, rev, onCommit };
  const queue = useRef<{ build: Build; label: string }[]>([]);
  const pending = useRef<{ rev: number; timer: ReturnType<typeof setTimeout> } | undefined>(undefined);
  const flush = useRef(() => {});
  flush.current = () => {
    if (pending.current) return;
    for (let job = queue.current.shift(); job; job = queue.current.shift()) {
      const cur = live.current;
      if (!cur.editable || cur.targets.length === 0) {
        queue.current = [];
        return;
      }
      const ops = job.build(cur.targets);
      if (ops.length === 0) continue;
      const timer = setTimeout(() => {
        if (pending.current?.timer !== timer) return;
        pending.current = undefined;
        flush.current();
      }, PENDING_MAX_MS);
      pending.current = { rev: cur.rev, timer };
      void cur.onCommit(ops, describeEdit(job.label, cur.targets.length)).then((ok) => {
        if (ok || pending.current?.timer !== timer) return;
        // Gagal: toast dari Viewer; edit yang mengantre dibuang (dibangun dari keadaan yang ditolak).
        clearTimeout(timer);
        pending.current = undefined;
        queue.current = [];
      });
      return;
    }
  };
  useEffect(() => {
    const p = pending.current;
    if (!p || p.rev === rev) return;
    clearTimeout(p.timer);
    pending.current = undefined;
    flush.current();
  }, [rev]);
  const primary = targets[targets.length - 1];
  if (!primary) {
    return (
      <div className="panel-empty">
        <Icon name="pointer" size={20} />
        <strong>Nothing selected</strong>
        <span>Select a layer or a board on the canvas to edit its design.</span>
      </div>
    );
  }
  const multi = targets.length > 1;
  const groups = designGroups(targets);
  const ctx: Ctx = {
    disabled: !editable,
    run: (build, label) => {
      if (!editable) return;
      queue.current.push({ build, label });
      flush.current();
    },
  };
  const types = new Set(targets.map((t) => t.type));
  const typeLabel = TYPE_LABEL[primary.type] ?? primary.type;
  const subtitle = multi
    ? `${types.size === 1 ? `${typeLabel}s` : 'Layers'}${path.length > 1 ? ` · ${path.slice(0, -1).join(' / ')}` : ''}`
    : `${typeLabel}${path.length > 1 ? ` · ${path.slice(0, -1).join(' / ')}` : ''}`;
  const node = inspectNode && inspectNode.id === primary.id ? inspectNode : undefined;
  const copy = async (format: CopyFormat) => {
    if (!node) return;
    try {
      await copyText(copyAs(format, node));
      setCopied(format);
      setTimeout(() => setCopied((c) => (c === format ? undefined : c)), 1500);
    } catch {
      // clipboard tidak tersedia
    }
  };
  // Posisi terukur relatif board (anak flow); hanya untuk seleksi tunggal.
  const bounds = node?.bounds;
  return (
    <div className="inspect design-panel">
      <div className="selection-header">
        <span className="type-badge">
          <Icon name={multi && types.size > 1 ? 'layers' : (NODE_ICON[primary.type] ?? 'square')} size={14} />
        </span>
        <div className="selection-info">
          <strong>{multi ? `${targets.length} layers` : primary.name}</strong>
          <span>{subtitle}</span>
        </div>
        {!multi && (
          <button
            type="button"
            className={`dp-icon-btn copy-menu-btn${copied ? ' done' : ''}`}
            title={copied ? 'Copied' : 'Copy as…'}
            aria-label="Copy as"
            aria-haspopup="menu"
            disabled={!node}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ x: r.right - 160, y: r.bottom + 4 });
            }}
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
          </button>
        )}
      </div>
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(undefined)}
          items={COPY_FORMATS.map(([f, label]) => ({
            label: `Copy as ${label}`,
            icon: 'copy',
            run: () => {
              setMenu(undefined);
              void copy(f);
            },
          }))}
        />
      )}
      <Fragment key={targets.map((t) => t.id).join(',')}>
      {multi && align && <AlignGroup align={align} disabled={!editable} />}
      {groups.includes('position') && <PositionGroup targets={targets} ctx={ctx} bounds={bounds} />}
      {groups.includes('autoLayout') && <AutoLayoutGroup targets={targets} ctx={ctx} />}
      {groups.includes('typography') && <TypographyGroup targets={targets} ctx={ctx} fonts={fonts} />}
      {groups.includes('icon') && <IconGroup targets={targets} ctx={ctx} />}
      {groups.includes('fill') && <FillGroup targets={targets} ctx={ctx} />}
      {groups.includes('stroke') && <StrokeGroup targets={targets} ctx={ctx} />}
      {groups.includes('radius') && <RadiusGroup targets={targets} ctx={ctx} />}
      {groups.includes('effects') && <EffectsGroup targets={targets} ctx={ctx} />}
      </Fragment>
      {!editable && (
        <div className="read-only-note">
          <Icon name="lock" size={14} />
          <span>Read only while previewing a version or offline.</span>
        </div>
      )}
    </div>
  );
}

