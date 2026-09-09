import { useEffect, useRef } from 'react';
import type { ContentBlock } from '@cyberlab/core';
import { renderInline } from './inline.js';
import { FlowDiagram, SequenceDiagram } from './Diagram.js';
import { HttpExchange, PermissionBits, Quiz, SqlBuilder } from './Interactive.js';
import { Icon } from '../../icons.js';
import { DARCULA, normaliseLanguage } from '../../syntax.js';
import { highlight } from '../lab/CodeEditor.js';
import { useStore } from '../../store.js';

/**
 * The block renderer.
 *
 * Theory is data, so rendering it is a dispatch over the block kind. Each block
 * reports itself "seen" via an IntersectionObserver, which is what drives
 * reading progress and the theory-read XP — the platform knows what you have
 * actually looked at, not just what page you are on.
 */
export function BlockRenderer({ block, lessonId }: { block: ContentBlock; lessonId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const markSeen = useStore((s) => s.markSeen);
  const setFocusBlock = useStore((s) => s.setFocusBlock);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            markSeen(block.id);
            setFocusBlock(block.id);
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [block.id, markSeen, setFocusBlock]);

  return (
    <div ref={ref} data-block={block.id} className="scroll-mt-4">
      <BlockBody block={block} lessonId={lessonId} />
    </div>
  );
}

function BlockBody({ block, lessonId }: { block: ContentBlock; lessonId: string }) {
  switch (block.kind) {
    case 'heading':
      return (
        <div className="mb-2 mt-6 first:mt-0">
          {block.eyebrow && (
            <div className="mb-1.5 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-signal)]">
              <span className="h-px w-5 bg-[var(--color-signal-dim)]" />
              {block.eyebrow}
            </div>
          )}
          {block.level === 2 ? (
            <h2 className="text-[19px] font-semibold text-[var(--color-ink-100)]">{block.text}</h2>
          ) : (
            <h3 className="text-[15.5px] font-semibold text-[var(--color-ink-100)]">{block.text}</h3>
          )}
        </div>
      );

    case 'prose':
      return <p className="my-3 text-[13.5px] leading-[1.7] text-[var(--color-ink-300)]">{renderInline(block.text)}</p>;

    case 'callout':
      return <Callout block={block} />;

    case 'code':
      return <CodeBlockView block={block} />;

    case 'table':
      return (
        <figure className="my-4 overflow-x-auto rounded-xl border border-[var(--color-line)]">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {block.columns.map((c) => (
                  <th key={c} className="border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-3 py-2 text-left font-semibold text-[var(--color-ink-300)]">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="odd:bg-[var(--color-abyss-900)]">
                  {row.map((cell, j) => (
                    <td key={j} className="border-b border-[var(--color-line)] px-3 py-2 text-[var(--color-ink-300)]">
                      {j === 0 ? <span className="mono text-[var(--color-ink-100)]">{cell}</span> : renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {block.caption && <figcaption className="bg-[var(--color-abyss-800)] px-3 py-1.5 text-[11px] text-[var(--color-ink-500)]">{block.caption}</figcaption>}
        </figure>
      );

    case 'comparison':
      return (
        <div className="my-4 grid gap-3 md:grid-cols-2">
          {[block.left, block.right].map((side, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-[var(--color-line)]">
              <div className={`flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-1.5 text-[12px] font-medium ${side.tone === 'bad' ? 'text-[var(--color-breach)]' : side.tone === 'good' ? 'text-[var(--color-flux)]' : 'text-[var(--color-ink-300)]'}`}>
                {side.tone === 'bad' ? <Icon.x size={13} /> : side.tone === 'good' ? <Icon.check size={13} /> : <Icon.dot size={10} />}
                {side.label}
              </div>
              <pre className="mono overflow-x-auto p-3 text-[12px] leading-relaxed" style={{ background: DARCULA.bg, color: DARCULA.fg }}>{highlightCode(side.code, side.language)}</pre>
              {side.note && <div className="border-t border-[var(--color-line)] bg-[var(--color-abyss-800)] px-3 py-2 text-[11.5px] text-[var(--color-ink-400)]">{side.note}</div>}
            </div>
          ))}
        </div>
      );

    case 'flow':
      return <FlowDiagram block={block} />;

    case 'sequence':
      return <SequenceDiagram block={block} />;

    case 'timeline':
      return (
        <div className="my-4 space-y-0">
          {block.entries.map((entry, i) => (
            <div key={i} className="flex gap-3 pb-3 last:pb-0">
              <div className="flex flex-col items-center">
                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${entry.tone === 'danger' ? 'bg-[var(--color-breach)]' : entry.tone === 'success' ? 'bg-[var(--color-flux)]' : 'bg-[var(--color-signal)]'}`} />
                {i < block.entries.length - 1 && <span className="w-px flex-1 bg-[var(--color-line)]" />}
              </div>
              <div className="pb-1">
                <div className="text-[13px] font-medium text-[var(--color-ink-100)]">{entry.title}</div>
                <div className="text-[12.5px] text-[var(--color-ink-400)]">{renderInline(entry.text)}</div>
              </div>
            </div>
          ))}
        </div>
      );

    case 'keypoints':
      return (
        <div className="my-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-abyss-800)] p-4">
          {block.title && <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--color-ink-400)]">{block.title}</div>}
          <ul className="space-y-1.5">
            {block.points.map((p, i) => (
              <li key={i} className="flex gap-2 text-[13px] text-[var(--color-ink-300)]">
                <span className="mt-1 text-[var(--color-signal)]"><Icon.arrowRight size={13} /></span>
                <span>{renderInline(p)}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case 'quiz':
      return <Quiz block={block} lessonId={lessonId} />;
    // lessonId retained on the signature for future per-lesson quiz analytics.

    case 'http-exchange':
      return <HttpExchange block={block} />;

    case 'sql-builder':
      return <SqlBuilder block={block} />;

    case 'permission-bits':
      return <PermissionBits block={block} />;

    case 'cookie-jar':
    case 'jwt':
      // Not used by the ready lessons; render a graceful placeholder rather than
      // pretending. Left as an obvious extension point.
      return (
        <div className="my-4 rounded-xl border border-dashed border-[var(--color-line-strong)] p-4 text-[12.5px] text-[var(--color-ink-500)]">
          Blocco interattivo “{block.kind}” — disponibile nelle lezioni che lo usano.
        </div>
      );
  }
}

function Callout({ block }: { block: Extract<ContentBlock, { kind: 'callout' }> }) {
  const styles: Record<string, { border: string; icon: keyof typeof Icon; color: string }> = {
    info: { border: 'var(--color-signal-dim)', icon: 'info', color: 'var(--color-signal)' },
    tip: { border: 'var(--color-flux-dim)', icon: 'lightbulb', color: 'var(--color-flux)' },
    warning: { border: 'var(--color-amber)', icon: 'flame', color: 'var(--color-amber)' },
    danger: { border: 'var(--color-breach-dim)', icon: 'bug', color: 'var(--color-breach)' },
    legal: { border: 'var(--color-violet)', icon: 'shield', color: 'var(--color-violet)' },
  };
  const s = styles[block.variant]!;
  const IconCmp = Icon[s.icon];
  return (
    <div className="my-4 flex gap-3 rounded-xl border-l-2 p-3.5" style={{ borderLeftColor: s.border, background: `color-mix(in oklab, ${s.color} 6%, var(--color-abyss-800))` }}>
      <span className="mt-0.5 shrink-0" style={{ color: s.color }}>
        <IconCmp size={16} />
      </span>
      <div>
        {block.title && <div className="mb-0.5 text-[12.5px] font-semibold" style={{ color: s.color }}>{block.title}</div>}
        <div className="text-[12.5px] leading-relaxed text-[var(--color-ink-300)]">{renderInline(block.text)}</div>
      </div>
    </div>
  );
}

function CodeBlockView({ block }: { block: Extract<ContentBlock, { kind: 'code' }> }) {
  return (
    <figure className="my-4 overflow-hidden rounded-xl border border-[var(--color-line)]">
      {(block.filename || block.language) && (
        <div className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-abyss-800)] px-3 py-1.5">
          <span className="mono text-[11px] text-[var(--color-ink-400)]">{block.filename ?? block.language}</span>
          <span className="chip !py-0 !text-[10px]">{block.language}</span>
        </div>
      )}
      <pre className="mono overflow-x-auto p-3 text-[12.5px] leading-relaxed" style={{ background: DARCULA.bg, color: DARCULA.fg }}>
        {block.code.split('\n').map((line, i) => {
          const n = i + 1;
          const hi = block.highlight?.includes(n);
          return (
            <div key={i} className={hi ? 'bg-[color-mix(in_oklab,var(--color-signal)_10%,transparent)] -mx-3 px-3' : ''}>
              {highlightCode(line, block.language)}
              {block.annotations?.[n] && <span className="ml-3 text-[11px] italic text-[var(--color-ink-500)]"># {block.annotations[n]}</span>}
            </div>
          );
        })}
      </pre>
      {block.caption && <figcaption className="border-t border-[var(--color-line)] bg-[var(--color-abyss-800)] px-3 py-1.5 text-[11px] text-[var(--color-ink-500)]">{block.caption}</figcaption>}
    </figure>
  );
}

/**
 * Colourise a fragment of code with the shared IntelliJ Darcula lexer.
 *
 * Kept as a named export because several blocks paint code inline (comparisons,
 * code blocks, the request panel); they all go through the same tokeniser as
 * the lab's editor, so a string is green in exactly the same places everywhere.
 */
export function highlightCode(code: string, language: string): React.ReactNode {
  return highlight(code, normaliseLanguage(language));
}
