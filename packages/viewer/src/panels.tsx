// Panel kanan Viewer: Inspect (properti dari POST /inspect, Copy as CSS/Tailwind/JSON lewat copyas.ts) dan Checks (temuan layout_check). Activity dan
// History ada di ActivityPanel.tsx dan HistoryPanel.tsx.
// Paritas desain: Inspect punya bagian "Parent layout" (arah/gap/padding induk); judul aturan Checks berbahasa
// Inggris (judul di @lakar/schema berbahasa Indonesia untuk agen).
import { useState, type ReactNode } from 'react';
import { G0_RULES, isGateRule, type Finding } from '@lakar/schema';
import type { InspectResult, LayoutCheck } from './api';
import { copyText } from './Connections';
import { copyAs, type CopyFormat } from './copyas';
import { formatValue, hexColor, relativeTime, type NodeInfo } from './format';
import { Icon, NODE_ICON, type IconName } from './icons';

type Loaded<T> = { state: 'loading' } | { state: 'ok'; value: T } | { state: 'error'; message: string };

const TYPE_LABEL: Record<string, string> = { board: 'Board', frame: 'Frame', text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', path: 'Path', icon: 'Icon' };

/** Arah layout induk seperti di desain ("vertical" / "horizontal"). */
const DIRECTION: Record<string, string> = { column: 'vertical', row: 'horizontal', none: 'none' };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="inspect-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Prop({ label, value, swatch }: { label: string; value: ReactNode; swatch?: string | undefined }) {
  return (
    <div className="prop">
      <span className="prop-label">{label}</span>
      <span className="prop-value">
        {swatch && <i className="swatch" style={{ background: swatch }} />}
        {value}
      </span>
    </div>
  );
}

function Empty({ icon, title, text, children }: { icon: IconName; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="panel-empty">
      <Icon name={icon} size={20} />
      <strong>{title}</strong>
      <span>{text}</span>
      {children}
    </div>
  );
}

type Paint = { type?: string; color?: unknown; stops?: { color?: unknown }[]; fit?: string };

function fillRows(fills: unknown): ReactNode[] {
  if (!Array.isArray(fills)) return [];
  return (fills as Paint[]).map((f, i) => {
    const label = fills.length > 1 ? `Fill ${i + 1}` : 'Fill';
    if (f.type === 'solid') return <Prop key={i} label={label} value={formatValue(f.color)} swatch={hexColor(f.color)} />;
    if (f.type === 'linear' || f.type === 'radial' || f.type === 'conic') {
      const first = f.stops?.[0]?.color;
      return <Prop key={i} label={label} value={`${f.type} · ${(f.stops ?? []).map((s) => formatValue(s.color)).join(' → ')}`} swatch={hexColor(first)} />;
    }
    if (f.type === 'image') return <Prop key={i} label={label} value={`image · ${f.fit ?? ''}`} />;
    return <Prop key={i} label={label} value={f.type ?? formatValue(f)} />;
  });
}

/** Kunci yang sudah ditampilkan di bagian khusus; sisanya masuk "Other". */
const SHOWN = new Set([
  'id', 'name', 'type', 'children', 'childCount', 'bounds', 'width', 'height', 'x', 'y', 'position', 'rotation',
  'family', 'weight', 'size', 'lineHeight', 'letterSpacing', 'align', 'style', 'content', 'color', 'fills', 'stroke',
  'layout', 'gap', 'padding', 'justify', 'clip', 'opacity', 'radius', 'shadows', 'lib', 'icon', 'screen',
]);

const COPY_FORMATS: readonly [CopyFormat, string][] = [
  ['css', 'CSS'],
  ['tailwind', 'Tailwind'],
  ['json', 'JSON'],
];

export function InspectPanel({ info, inspect, parent }: { info: NodeInfo | undefined; inspect: Loaded<InspectResult> | undefined; parent?: Record<string, unknown> | undefined }) {
  const [copied, setCopied] = useState<CopyFormat | undefined>(undefined);
  if (!info) return <Empty icon="pointer" title="Nothing selected" text="Select a layer or a board on the canvas to see its properties." />;
  const node = inspect?.state === 'ok' && inspect.value.node.id === info.id ? inspect.value.node : undefined;
  const n = (node ?? {}) as Record<string, unknown>;
  const b = node?.bounds;
  const type = info.type;
  const dim = (v: unknown, measured: number | undefined) => {
    const m = measured !== undefined ? String(measured) : undefined;
    if (v === undefined) return m ?? '–';
    if (typeof v === 'number') return m && Number(m) !== v ? `${formatValue(v)} · ${m}` : formatValue(v);
    return m ? `${m} · ${formatValue(v)}` : formatValue(v);
  };
  const other = node ? Object.keys(n).filter((k) => !SHOWN.has(k)) : [];
  const stroke = n.stroke as { color?: unknown; width?: unknown; align?: unknown } | undefined;
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

  return (
    <div className="inspect">
      <div className="selection-header">
        <span className="type-badge">
          <Icon name={NODE_ICON[type] ?? 'square'} size={14} />
        </span>
        <div className="selection-info">
          <strong>{info.name}</strong>
          <span>
            {TYPE_LABEL[type] ?? type}
            {info.path.length > 1 ? ` · ${info.path.slice(0, -1).join(' / ')}` : ''}
          </span>
        </div>
      </div>
      {inspect?.state === 'loading' || (!node && inspect?.state !== 'error') ? (
        <div className="panel-loading">
          <div className="spinner small" /> Measuring…
        </div>
      ) : inspect?.state === 'error' ? (
        <div className="panel-error">
          <Icon name="alert" size={14} />
          <span>{inspect.message}</span>
        </div>
      ) : (
        <>
          <Section title="Size & position">
            <Prop label="Width" value={dim(n.width, b?.[2])} />
            <Prop label="Height" value={dim(n.height, b?.[3])} />
            <Prop label="X / Y" value={type === 'board' ? `${formatValue(n.x)}, ${formatValue(n.y)}` : b ? `${b[0]}, ${b[1]}` : '–'} />
            {n.position !== undefined && <Prop label="Position" value={formatValue(n.position)} />}
            {n.rotation !== undefined && <Prop label="Rotation" value={`${formatValue(n.rotation)}°`} />}
            {n.screen !== undefined && <Prop label="Screen" value={formatValue(n.screen)} />}
          </Section>
          {type === 'text' && (
            <Section title="Typography">
              {n.family !== undefined && <Prop label="Font" value={formatValue(n.family)} />}
              {n.weight !== undefined && <Prop label="Weight" value={formatValue(n.weight)} />}
              <Prop label="Size" value={formatValue(n.size)} />
              {n.lineHeight !== undefined && <Prop label="Line height" value={formatValue(n.lineHeight)} />}
              {n.letterSpacing !== undefined && <Prop label="Letter spacing" value={formatValue(n.letterSpacing)} />}
              {n.align !== undefined && <Prop label="Align" value={formatValue(n.align)} />}
              {n.style !== undefined && <Prop label="Style" value={formatValue(n.style)} />}
            </Section>
          )}
          {type === 'icon' && (
            <Section title="Icon">
              <Prop label="Library" value={formatValue(n.lib)} />
              <Prop label="Icon" value={formatValue(n.icon)} />
              <Prop label="Size" value={formatValue(n.size)} />
            </Section>
          )}
          {(n.fills !== undefined || n.color !== undefined || stroke) && (
            <Section title="Fill">
              {fillRows(n.fills)}
              {n.color !== undefined && <Prop label="Color" value={formatValue(n.color)} swatch={hexColor(n.color)} />}
              {stroke && <Prop label="Stroke" value={`${formatValue(stroke.color)} · ${formatValue(stroke.width)} ${formatValue(stroke.align)}`} swatch={hexColor(stroke.color)} />}
            </Section>
          )}
          {type === 'frame' && (n.layout !== undefined || n.gap !== undefined || n.padding !== undefined) && (
            <Section title="Layout">
              {n.layout !== undefined && <Prop label="Direction" value={formatValue(n.layout)} />}
              {n.gap !== undefined && <Prop label="Gap" value={formatValue(n.gap)} />}
              {n.padding !== undefined && <Prop label="Padding" value={formatValue(n.padding)} />}
              {n.align !== undefined && <Prop label="Align" value={formatValue(n.align)} />}
              {n.justify !== undefined && <Prop label="Justify" value={formatValue(n.justify)} />}
              {n.clip !== undefined && <Prop label="Clip" value={formatValue(n.clip)} />}
            </Section>
          )}
          {parent && typeof parent.layout === 'string' && parent.layout !== 'none' && (
            <Section title="Parent layout">
              <Prop label="Direction" value={DIRECTION[parent.layout] ?? parent.layout} />
              <Prop label="Gap" value={formatValue(parent.gap ?? 0)} />
              <Prop label="Padding" value={formatValue(parent.padding ?? 0)} />
            </Section>
          )}
          {(n.opacity !== undefined || n.radius !== undefined || n.shadows !== undefined) && (
            <Section title="Appearance">
              {n.opacity !== undefined && <Prop label="Opacity" value={formatValue(n.opacity)} />}
              {n.radius !== undefined && <Prop label="Radius" value={formatValue(n.radius)} />}
              {Array.isArray(n.shadows) && <Prop label="Shadows" value={`${n.shadows.length}`} />}
            </Section>
          )}
          {(other.length > 0 || node?.childCount !== undefined) && (
            <Section title="Other">
              {node?.childCount !== undefined && <Prop label="Children" value={String(node.childCount)} />}
              {other.map((k) => (
                <Prop key={k} label={k} value={<span className="clamp">{formatValue(n[k])}</span>} />
              ))}
            </Section>
          )}
          <section className="inspect-section">
            <h3>Copy as</h3>
            <div className="copy-as">
              {COPY_FORMATS.map(([format, label]) => (
                <button key={format} type="button" className="btn small" onClick={() => copy(format)}>
                  <Icon name={copied === format ? 'circleCheck' : 'copy'} size={13} />
                  {copied === format ? 'Copied' : label}
                </button>
              ))}
            </div>
          </section>
        </>
      )}
      <div className="read-only-note">
        <Icon name="lock" size={13} />
        Read-only. Ask your agent to change this.
      </div>
    </div>
  );
}

/** Judul aturan untuk UI (desain: "Text smaller than 12px", "Board size off target"). */
const RULE_TITLE: Record<string, string> = {
  'LC-01a': 'Emoji in text',
  'LC-01b': 'Unicode glyph used as an icon',
  'LC-02a': 'Node clipped by its parent',
  'LC-02b': 'Text overflows its parent',
  'LC-04': 'Text contrast too low',
  'LC-05': 'Text smaller than 12px',
  'LC-11': 'Siblings partly overlap',
  'LC-12': 'Board size off target',
  'LC-18': 'Nested cards',
  'LC-20': 'Content covered by the bottom bar',
  'LC-23': 'Gap to badge, button, or icon under 8px',
  'LC-24': 'Badge out of proportion in its row',
  'LC-25': 'Radii not concentric',
  'LC-26': 'Heading rhythm: space above not larger',
  'LC-27': 'Too many font sizes',
  'LC-28': 'Text lines too long',
  'LC-29': 'Thin weight on small text',
  'LC-30': 'Punctuation',
  'LC-31': 'Mockup cut flat at the section edge',
};
const ruleTitle = (rule: string) => RULE_TITLE[rule] ?? (G0_RULES as Record<string, { title: string }>)[rule]?.title ?? rule;
const TOTAL_RULES = Object.keys(G0_RULES).length;

export function ChecksPanel({
  checks,
  index,
  selectedId,
  onSelect,
  onRun,
  hasBoards,
}: {
  checks: Loaded<LayoutCheck> | undefined;
  index: Map<string, NodeInfo>;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onRun: () => void;
  hasBoards: boolean;
}) {
  if (!hasBoards) return <Empty icon="shieldCheck" title="Nothing to check yet" text="layout_check runs once the document has a board." />;
  if (!checks || checks.state === 'loading')
    return (
      <div className="panel-loading">
        <div className="spinner small" /> Running layout_check…
      </div>
    );
  if (checks.state === 'error')
    return (
      <Empty icon="alert" title="layout_check failed" text={checks.message}>
        <button type="button" className="btn small" onClick={onRun}>
          <Icon name="refresh" size={13} /> Run again
        </button>
      </Empty>
    );
  const { summary, findings, ranAt, rev } = checks.value;
  const failedRules = new Set(findings.map((f) => f.rule));
  const passed = Math.max(0, TOTAL_RULES - failedRules.size);
  const sorted = [...findings].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  const boardCount = Array.isArray(checks.value.boards) ? checks.value.boards.length : undefined;

  return (
    <div className="checks">
      <div className="checks-summary">
        <div className="stats">
          <div className="stat">
            <span className="stat-value">
              <i className="dot danger" />
              {summary.error}
            </span>
            <span className="stat-label">Error</span>
          </div>
          <div className="stat">
            <span className="stat-value">
              <i className="dot warning" />
              {summary.warning}
            </span>
            <span className="stat-label">Warning</span>
          </div>
          <div className="stat">
            <span className="stat-value">
              <i className="dot success" />
              {passed}
            </span>
            <span className="stat-label">Passed</span>
          </div>
        </div>
        <div className="checks-meta">
          <span>
            Last run {relativeTime(ranAt)} · rev {rev}
            {boardCount !== undefined ? ` · ${boardCount} board${boardCount === 1 ? '' : 's'}` : ''}
          </span>
          <button type="button" className="link-btn" onClick={onRun}>
            Run again
          </button>
        </div>
      </div>
      <div className="findings">
        {sorted.map((f: Finding, i) => {
          const info = index.get(f.nodeId);
          const selected = f.nodeId === selectedId;
          return (
            <button
              key={`${f.rule}-${f.nodeId}-${i}`}
              type="button"
              className={`finding ${f.level}${selected ? ' selected' : ''}`}
              onClick={() => info && onSelect(f.nodeId)}
              disabled={!info}
              title={info ? 'Show on canvas' : undefined}
            >
              <span className="finding-header">
                <span className={`rule ${f.level}`}>{f.rule}</span>
                <span className="finding-title">{ruleTitle(f.rule)}</span>
                {f.level === 'error' && isGateRule(f.rule) && <span className="gate">gate</span>}
              </span>
              <span className="finding-node">
                <Icon name={NODE_ICON[info?.type ?? ''] ?? 'square'} size={12} />
                <span>{info ? info.path.join(' / ') : f.nodeName}</span>
              </span>
              <span className="finding-detail">
                {f.detail} · {f.expected}
              </span>
            </button>
          );
        })}
        <div className="passed-row">
          <Icon name="circleCheck" size={14} className="ok" />
          <span>
            {passed} rule{passed === 1 ? '' : 's'} passed
          </span>
        </div>
      </div>
    </div>
  );
}
