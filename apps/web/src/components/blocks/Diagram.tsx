import { useState } from 'react';
import type { FlowDiagramBlock, SequenceBlock } from '@cyberlab/core';
import { Icon } from '../../icons.js';

/**
 * Flow and sequence diagrams, drawn as inline SVG.
 *
 * Not Mermaid on purpose: these are interactive. Flow nodes have tooltips and
 * an optional step-through animation that highlights the path one edge at a
 * time — the "seguire il percorso request → server → response" the brief asks
 * for. Layout is explicit (each node names its grid cell) so a diagram never
 * reflows unpredictably between renders.
 */

const TONE: Record<string, { fill: string; stroke: string; text: string }> = {
  default: { fill: 'var(--color-abyss-600)', stroke: 'var(--color-line-strong)', text: 'var(--color-ink-200)' },
  accent: { fill: 'color-mix(in oklab, var(--color-signal) 22%, var(--color-abyss-700))', stroke: 'var(--color-signal)', text: 'var(--color-ink-100)' },
  danger: { fill: 'color-mix(in oklab, var(--color-breach) 20%, var(--color-abyss-700))', stroke: 'var(--color-breach)', text: 'var(--color-ink-100)' },
  success: { fill: 'color-mix(in oklab, var(--color-flux) 20%, var(--color-abyss-700))', stroke: 'var(--color-flux)', text: 'var(--color-ink-100)' },
  muted: { fill: 'var(--color-abyss-700)', stroke: 'var(--color-line)', text: 'var(--color-ink-400)' },
};
const EDGE_TONE: Record<string, string> = {
  default: 'var(--color-line-strong)',
  accent: 'var(--color-signal)',
  danger: 'var(--color-breach)',
  success: 'var(--color-flux)',
};

export function FlowDiagram({ block }: { block: FlowDiagramBlock }) {
  const [step, setStep] = useState<number>(-1);
  const cols = Math.max(...block.nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...block.nodes.map((n) => n.row)) + 1;

  const CELL_W = 150;
  const CELL_H = 78;
  const GAP_X = 44;
  const GAP_Y = 34;
  const PAD = 16;
  const nodeW = 128;
  const nodeH = 58;

  const cx = (col: number) => PAD + col * (CELL_W + GAP_X) + nodeW / 2;
  const cy = (row: number) => PAD + row * (CELL_H + GAP_Y) + nodeH / 2;
  const width = PAD * 2 + cols * CELL_W + (cols - 1) * GAP_X;
  const height = PAD * 2 + rows * CELL_H + (rows - 1) * GAP_Y;

  const active = step >= 0 && block.steps ? new Set(block.steps[step]?.highlight ?? []) : null;

  return (
    <figure className="my-4 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-abyss-900)]">
      {block.title && (
        <figcaption className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2 text-[12px] font-medium text-[var(--color-ink-300)]">
          <span>{block.title}</span>
          {block.steps && (
            <span className="flex items-center gap-1">
              <button className="btn btn-ghost !px-1.5 !py-1" onClick={() => setStep((s) => Math.max(-1, s - 1))} disabled={step < 0}>
                <Icon.chevronRight size={13} className="rotate-180" />
              </button>
              <span className="mono w-10 text-center text-[11px] text-[var(--color-ink-500)]">
                {step < 0 ? '—' : `${step + 1}/${block.steps.length}`}
              </span>
              <button
                className="btn btn-ghost !px-1.5 !py-1"
                onClick={() => setStep((s) => Math.min((block.steps?.length ?? 1) - 1, s + 1))}
                disabled={step >= (block.steps?.length ?? 0) - 1}
              >
                <Icon.chevronRight size={13} />
              </button>
            </span>
          )}
        </figcaption>
      )}
      <div className="overflow-x-auto p-2">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="max-w-full" role="img">
          <defs>
            {Object.entries(EDGE_TONE).map(([tone, color]) => (
              <marker key={tone} id={`arrow-${tone}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill={color} />
              </marker>
            ))}
          </defs>
          {block.edges.map((edge, i) => {
            const from = block.nodes.find((n) => n.id === edge.from)!;
            const to = block.nodes.find((n) => n.id === edge.to)!;
            const x1 = cx(from.col) + nodeW / 2 - 2;
            const y1 = cy(from.row);
            const x2 = cx(to.col) - nodeW / 2 + 2;
            const y2 = cy(to.row);
            const tone = edge.tone ?? 'default';
            const dimmed = active && !(active.has(edge.from) && active.has(edge.to));
            const midX = (x1 + x2) / 2;
            return (
              <g key={i} style={{ opacity: dimmed ? 0.2 : 1, transition: 'opacity 0.3s' }}>
                <path
                  d={y1 === y2 ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={EDGE_TONE[tone]}
                  strokeWidth={1.7}
                  strokeDasharray={edge.dashed ? '5 4' : undefined}
                  markerEnd={`url(#arrow-${tone})`}
                />
                {edge.label && (
                  <text x={midX} y={(y1 + y2) / 2 - 6} textAnchor="middle" fontSize={10.5} fill="var(--color-ink-400)" className="mono">
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
          {block.nodes.map((node) => {
            const tone = TONE[node.tone ?? 'default']!;
            const x = cx(node.col) - nodeW / 2;
            const y = cy(node.row) - nodeH / 2;
            const highlighted = active?.has(node.id);
            const dimmed = active && !highlighted;
            return (
              <g key={node.id} style={{ opacity: dimmed ? 0.3 : 1, transition: 'opacity 0.3s' }}>
                <title>{node.tooltip ?? node.label}</title>
                <rect
                  x={x}
                  y={y}
                  width={nodeW}
                  height={nodeH}
                  rx={9}
                  fill={tone.fill}
                  stroke={highlighted ? 'var(--color-ink-100)' : tone.stroke}
                  strokeWidth={highlighted ? 2 : 1.3}
                />
                <text x={cx(node.col)} y={cy(node.row) - (node.sublabel ? 6 : 0)} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={tone.text}>
                  {node.label}
                </text>
                {node.sublabel && (
                  <text x={cx(node.col)} y={cy(node.row) + 12} textAnchor="middle" fontSize={10} fill="var(--color-ink-400)" className="mono">
                    {node.sublabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {active && block.steps && step >= 0 && (
        <div className="animate-fade-in border-t border-[var(--color-line)] bg-[var(--color-abyss-800)] px-4 py-2.5 text-[12.5px] text-[var(--color-ink-200)]">
          <span className="mono mr-2 text-[var(--color-signal)]">{step + 1}.</span>
          {block.steps[step]?.label}
        </div>
      )}
    </figure>
  );
}

export function SequenceDiagram({ block }: { block: SequenceBlock }) {
  const [revealed, setRevealed] = useState(block.messages.length);
  const laneW = 150;
  // Actor pills are sized to their label, and the drawing leaves room for the
  // pills that sit at the first and last lanes — otherwise the outermost labels
  // spill outside the viewBox and get clipped (which is exactly what happened).
  const ACTOR_TINT = ['var(--color-signal)', 'var(--color-violet)', 'var(--color-flux)', 'var(--color-amber)'];
  const pillW = (label: string) => Math.max(96, label.length * 7 + 34);
  const maxHalf = Math.max(...block.actors.map((a) => pillW(a.label) / 2));
  const GUTTER = 30; // left margin for the step-number badges
  const leftX = Math.max(GUTTER + 8, maxHalf) + 14;
  const headerH = 52;
  const laneGap = Math.max(laneW, 176);

  // Rows grow when a message carries a detail line, so the note has room.
  const rowH = block.messages.map((m) => (m.detail ? 66 : 46));
  const rowTop: number[] = [];
  let acc = headerH + 8;
  for (const h of rowH) {
    rowTop.push(acc);
    acc += h;
  }
  const laneX = (id: string) => leftX + block.actors.findIndex((a) => a.id === id) * laneGap;
  const rightX = leftX + (block.actors.length - 1) * laneGap;
  const width = rightX + maxHalf + 16;
  const height = acc + 12;
  const bandLeft = GUTTER - 8;

  return (
    <figure className="my-4 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-abyss-900)]">
      <figcaption className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2 text-[12px] font-medium text-[var(--color-ink-300)]">
        <span>Sequenza client / server</span>
        <span className="flex items-center gap-1">
          <button className="btn btn-ghost !px-1.5 !py-1" onClick={() => setRevealed(1)} title="Ricomincia">
            <Icon.refresh size={13} />
          </button>
          <button
            className="btn btn-ghost !px-2 !py-1 text-[11px]"
            onClick={() => setRevealed((r) => Math.min(block.messages.length, r + 1))}
            disabled={revealed >= block.messages.length}
          >
            Passo →
          </button>
        </span>
      </figcaption>
      <div className="overflow-x-auto p-3">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="mx-auto block max-w-full">
          <defs>
            {Object.entries(EDGE_TONE).map(([tone, color]) => (
              <marker key={tone} id={`seq-arrow-${tone}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill={color} />
              </marker>
            ))}
          </defs>

          {/* lifelines + actor pills */}
          {block.actors.map((actor, ai) => {
            const w = pillW(actor.label);
            const tint = ACTOR_TINT[ai % ACTOR_TINT.length]!;
            return (
              <g key={actor.id}>
                <line x1={laneX(actor.id)} y1={headerH} x2={laneX(actor.id)} y2={height - 10} stroke="var(--color-line)" strokeWidth={1.2} strokeDasharray="2 5" />
                <rect x={laneX(actor.id) - w / 2} y={10} width={w} height={30} rx={8} fill="var(--color-abyss-700)" stroke="var(--color-line-strong)" />
                <circle cx={laneX(actor.id) - w / 2 + 15} cy={25} r={3.5} fill={tint} />
                <text x={laneX(actor.id) + 7} y={29} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--color-ink-100)">
                  {actor.label}
                </text>
              </g>
            );
          })}

          {/* messages */}
          {block.messages.slice(0, revealed).map((msg, i) => {
            const yLine = rowTop[i]! + 22;
            const x1 = laneX(msg.from);
            const x2 = laneX(msg.to);
            const self = msg.from === msg.to;
            const tone = msg.tone ?? 'default';
            const color = EDGE_TONE[tone];
            const labelColor = tone === 'default' ? 'var(--color-ink-200)' : color;
            const chipW = msg.label.length * 6.1 + 16;

            return (
              <g key={i} className="animate-fade-in">
                {/* step badge */}
                <circle cx={16} cy={yLine} r={9} fill="var(--color-abyss-700)" stroke="var(--color-line-strong)" />
                <text x={16} y={yLine + 3.5} textAnchor="middle" fontSize={10} className="mono" fill="var(--color-ink-400)">
                  {i + 1}
                </text>

                {self ? (
                  <>
                    <path d={`M${x1} ${yLine - 7} q 46 0 46 11 q 0 11 -42 11`} fill="none" stroke={color} strokeWidth={1.7} markerEnd={`url(#seq-arrow-${tone})`} />
                    <text x={x1 + 56} y={yLine} fontSize={11} fontWeight={500} fill={labelColor}>{msg.label}</text>
                  </>
                ) : (
                  (() => {
                    const dir = x2 > x1 ? 1 : -1;
                    // Responses (right→left) are dashed, the classic UML cue that
                    // distinguishes a reply from a call.
                    const isReturn = dir < 0;
                    const midX = (x1 + x2) / 2;
                    return (
                      <>
                        <rect x={midX - chipW / 2} y={yLine - 21} width={chipW} height={16} rx={5} fill="var(--color-abyss-900)" />
                        <text x={midX} y={yLine - 9} textAnchor="middle" fontSize={11} fontWeight={500} fill={labelColor}>
                          {msg.label}
                        </text>
                        <line
                          x1={x1}
                          y1={yLine}
                          x2={x2 - dir * 5}
                          y2={yLine}
                          stroke={color}
                          strokeWidth={1.8}
                          strokeDasharray={isReturn ? '5 4' : undefined}
                          markerEnd={`url(#seq-arrow-${tone})`}
                        />
                      </>
                    );
                  })()
                )}

                {/* the authored detail, which the old renderer dropped entirely */}
                {msg.detail && (
                  <foreignObject x={bandLeft + 6} y={yLine + 5} width={width - bandLeft - 20} height={rowH[i]! - 30}>
                    <div style={{ font: '10.5px/1.35 ui-sans-serif, system-ui', color: 'var(--color-ink-500)' }}>
                      {msg.detail}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
