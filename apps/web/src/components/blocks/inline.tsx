import { Fragment, type ReactNode } from 'react';

/**
 * Inline markup for prose blocks.
 *
 * A tiny, safe, controlled dialect — not a markdown engine. It supports exactly
 * what the lessons need: `code`, **bold**, *italic*, [text](url) and the custom
 * {{term:tooltip}} for a hoverable glossary term. Everything is rendered as
 * React nodes, so there is no `dangerouslySetInnerHTML` and no injection surface.
 */
export function renderInline(text: string): ReactNode {
  return <InlineRuns text={text} />;
}

function InlineRuns({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let remaining = text;

  // Each render takes the node's stable array index as its key, so keys are
  // unique and deterministic no matter how many patterns competed for a match.
  const patterns: { re: RegExp; render: (m: RegExpMatchArray, key: number) => ReactNode }[] = [
    { re: /\{\{([^:}]+):([^}]+)\}\}/, render: (m, key) => <Term key={key} term={m[1]!} tip={m[2]!} /> },
    {
      re: /`([^`]+)`/,
      render: (m, key) => (
        <code key={key} className="mono rounded bg-[var(--color-abyss-600)] px-1.5 py-0.5 text-[0.86em] text-[var(--color-ink-100)]">{m[1]}</code>
      ),
    },
    { re: /\*\*([^*]+)\*\*/, render: (m, key) => <strong key={key} className="font-semibold text-[var(--color-ink-100)]">{m[1]}</strong> },
    { re: /\*([^*]+)\*/, render: (m, key) => <em key={key} className="text-[var(--color-ink-100)]">{m[1]}</em> },
    { re: /\[([^\]]+)\]\(([^)]+)\)/, render: (m, key) => <a key={key} href={m[2]} target="_blank" rel="noreferrer">{m[1]}</a> },
  ];

  // Greedily consume the earliest match of any pattern.
  while (remaining.length > 0) {
    let best: { index: number; length: number; match: RegExpMatchArray; render: (m: RegExpMatchArray, key: number) => ReactNode } | null = null;
    for (const { re, render } of patterns) {
      const m = remaining.match(re);
      if (m && m.index !== undefined && (!best || m.index < best.index)) {
        best = { index: m.index, length: m[0].length, match: m, render };
      }
    }
    if (!best) {
      nodes.push(<Fragment key={nodes.length}>{remaining}</Fragment>);
      break;
    }
    if (best.index > 0) nodes.push(<Fragment key={nodes.length}>{remaining.slice(0, best.index)}</Fragment>);
    nodes.push(best.render(best.match, nodes.length));
    remaining = remaining.slice(best.index + best.length);
  }

  return <>{nodes}</>;
}

function Term({ term, tip }: { term: string; tip: string }) {
  return (
    <span className="group/term relative cursor-help border-b border-dashed border-[var(--color-signal-dim)] text-[var(--color-ink-100)]">
      {term}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-64 -translate-x-1/2 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-abyss-900)] px-3 py-2 text-[12px] font-normal leading-snug text-[var(--color-ink-300)] shadow-xl group-hover/term:block">
        {renderInline(tip)}
      </span>
    </span>
  );
}
