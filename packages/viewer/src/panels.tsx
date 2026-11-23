// Panel kanan Viewer: Checks (temuan layout_check). Design ada di DesignPanel.tsx (menggantikan Inspect, editor-canvas
// story 5); Activity dan History ada di ActivityPanel.tsx dan HistoryPanel.tsx.
// Judul aturan Checks berbahasa Inggris (judul di @lakar/schema berbahasa Indonesia untuk agen).
import type { ReactNode } from 'react';
import { G0_RULES, isGateRule, type Finding } from '@lakar/schema';
import type { LayoutCheck } from './api';
import { relativeTime, type NodeInfo } from './format';
import { Icon, NODE_ICON, type IconName } from './icons';

type Loaded<T> = { state: 'loading' } | { state: 'ok'; value: T } | { state: 'error'; message: string };

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

/** Judul aturan untuk UI (desain: "Text smaller than 12px", "Board size off target"). */
const RULE_TITLE: Record<string, string> = {
  'LC-01a': 'Emoji in text',
  'LC-01b': 'Unicode glyph used as an icon',
  'LC-02a': 'Node clipped by its parent',
  'LC-02b': 'Text overflows its parent',
  'LC-02c': 'Non-text overflows its container',
  'LC-03': 'Fixed text at risk of overflowing',
  'LC-04': 'Text contrast too low',
  'LC-05': 'Text smaller than 12px',
  'LC-06': 'Paragraph below the minimum size',
  'LC-07': 'Spacing outside the scale',
  'LC-08': 'Font size off the type scale',
  'LC-09': 'More than 2 font families',
  'LC-10': 'Touch target too small',
  'LC-11': 'Siblings partly overlap',
  'LC-12': 'Board size off target',
  'LC-13': 'Default layer name',
  'LC-14': 'Absolute inside flex without Overlay /',
  'LC-15': 'More than 1 UI icon library',
  'LC-16': 'Hand-drawn icon',
  'LC-17': 'Sections look alike',
  'LC-18': 'Nested cards',
  'LC-19': 'Banned phrase',
  'LC-20': 'Content covered by the bottom bar',
  'LC-21': 'Structure issues',
  'LC-22': 'Convention node counts',
  'LC-23': 'Gap to badge, button, or icon under 8px',
  'LC-24': 'Badge out of proportion in its row',
  'LC-25': 'Radii not concentric',
  'LC-26': 'Heading rhythm: space above not larger',
  'LC-27': 'Too many font sizes',
  'LC-28': 'Text lines too long',
  'LC-29': 'Thin weight on small text',
  'LC-30': 'Punctuation',
  'LC-31': 'Content cut flat at the bottom edge',
  'LC-32': 'Instance no longer matches its master',
  'LC-33': 'Skeleton placeholder not filled',
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
