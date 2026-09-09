import { useEffect, useRef, useState } from 'react';
import type { FlowDiagramBlock, SequenceBlock } from '@cyberlab/core';
import { Icon } from '../../icons.js';

/**
 * The width the diagram actually has to draw in.
 *
 * Both diagrams used fixed spacing, so a two-actor sequence drew ~300px wide
 * and sat marooned in the middle of a much wider panel: cramped lanes, labels
 * spilling past their arrows, detail text wrapping early — with half the room
 * unused. Measuring the container lets the layout spread into the space it has
 * (and, unlike scaling the SVG, the type stays at its natural size).
 *
 * Returns 0 before the first measurement and when there is no ResizeObserver
 * (server rendering), so every caller must keep working from its own minimum.
 */
function useAvailableWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

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
  const [scrollRef, availableW] = useAvailableWidth();
  const cols = Math.max(...block.nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...block.nodes.map((n) => n.row)) + 1;

  const CELL_H = 78;
  const GAP_Y = 34;
  const PAD = 16;
  const nodeH = 58;

  // Size each node to its own text, then make every column as wide as its
  // widest node. A fixed 128px box clipped long strings like "azione con
  // autorità root" or "GET /uploads/avatar.php"; now the box grows to fit the
  // label (12.5px bold) and the sublabel (10px mono), whichever is wider.
  const nodeWOf = (n: (typeof block.nodes)[number]) =>
    Math.max(128, Math.ceil(Math.max((n.label?.length ?? 0) * 7.2, (n.sublabel?.length ?? 0) * 6.2)) + 28);

  // Edge labels are centred in the gap between two nodes. If the gap is
  // narrower than the label — as it was for long IP:port strings — the label
  // spills under the node boxes and, since nodes paint after edges, gets
  // clipped. Widen the column gap to fit the widest same-row label.
  const rowOf = new Map(block.nodes.map((n) => [n.id, n.row]));
  const labelW = (s: string) => s.length * 6.3 + 14;
  const sameRowLabels = block.edges
    .filter((e) => e.label && rowOf.get(e.from) === rowOf.get(e.to))
    .map((e) => labelW(e.label!));
  const minGapX = Math.max(44, Math.ceil(Math.max(0, ...sameRowLabels)) + 18);

  const colW: number[] = [];
  for (let c = 0; c < cols; c += 1) {
    const inCol = block.nodes.filter((n) => n.col === c);
    colW[c] = inCol.length ? Math.max(...inCol.map(nodeWOf)) : 128;
  }

  // Spread the columns into whatever width the panel actually has, rather than
  // drawing a narrow diagram with the right-hand half of the panel left empty.
  const gapsX = Math.max(1, cols - 1);
  const nodesW = colW.reduce((sum, w) => sum + w, 0);
  const fillGapX = availableW > 0 ? (availableW - nodesW - PAD * 2) / gapsX : 0;
  const GAP_X = cols > 1 ? Math.max(minGapX, fillGapX) : minGapX;

  const colLeft: number[] = [];
  {
    let x = PAD;
    for (let c = 0; c < cols; c += 1) {
      colLeft[c] = x;
      x += colW[c]! + GAP_X;
    }
  }
  const cx = (col: number) => colLeft[col]! + colW[col]! / 2;
  const cy = (row: number) => PAD + row * (CELL_H + GAP_Y) + nodeH / 2;
  const width = (colLeft[cols - 1] ?? PAD) + (colW[cols - 1] ?? 128) + PAD;
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
      <div ref={scrollRef} className="overflow-x-auto p-2">
        {/* No max-w-full: a genuinely wide diagram keeps its labels full-size
            and the container (overflow-x-auto) scrolls, rather than shrinking
            every label until it is unreadable. */}
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img">
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
            const x1 = cx(from.col) + nodeWOf(from) / 2 - 2;
            const y1 = cy(from.row);
            const x2 = cx(to.col) - nodeWOf(to) / 2 + 2;
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
              </g>
            );
          })}
          {block.nodes.map((node) => {
            const tone = TONE[node.tone ?? 'default']!;
            const w = nodeWOf(node);
            const x = cx(node.col) - w / 2;
            const y = cy(node.row) - nodeH / 2;
            const highlighted = active?.has(node.id);
            const dimmed = active && !highlighted;
            return (
              <g key={node.id} style={{ opacity: dimmed ? 0.3 : 1, transition: 'opacity 0.3s' }}>
                <title>{node.tooltip ?? node.label}</title>
                <rect
                  x={x}
                  y={y}
                  width={w}
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
          {/* Edge labels last, so they sit on top of the nodes on a chip and
              are always legible instead of being painted over. */}
          {block.edges.map((edge, i) => {
            if (!edge.label) return null;
            const from = block.nodes.find((n) => n.id === edge.from)!;
            const to = block.nodes.find((n) => n.id === edge.to)!;
            const x1 = cx(from.col) + nodeWOf(from) / 2 - 2;
            const y1 = cy(from.row);
            const x2 = cx(to.col) - nodeWOf(to) / 2 + 2;
            const y2 = cy(to.row);
            const dimmed = active && !(active.has(edge.from) && active.has(edge.to));
            const lx = (x1 + x2) / 2;
            // A forward and a return edge between the same two nodes share a
            // midpoint, so their labels would land on top of each other (the
            // DNS "dov'è …?" / "93.184.x.x" pair did exactly this). Put the
            // return (right-to-left) label below the midpoint, the rest above —
            // by direction, so it works on diagonal edges too, not just rows.
            const ly = x2 < x1 ? (y1 + y2) / 2 + 18 : (y1 + y2) / 2 - 7;
            const w = labelW(edge.label);
            return (
              <g key={`lbl-${i}`} style={{ opacity: dimmed ? 0.2 : 1, transition: 'opacity 0.3s' }}>
                <rect x={lx - w / 2} y={ly - 11} width={w} height={16} rx={5} fill="var(--color-abyss-800)" stroke="var(--color-line)" strokeWidth={0.75} />
                <text x={lx} y={ly} textAnchor="middle" fontSize={10.5} fill="var(--color-ink-200)" className="mono">
                  {edge.label}
                </text>
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
  // Highlight-based walkthrough, like the flow diagram: the whole exchange is
  // visible at rest (step -1) and stepping just spotlights one message at a
  // time. The old version revealed messages progressively, so it opened in its
  // final state and you had to hit Reset before you could watch it play.
  const [step, setStep] = useState(-1);
  const [scrollRef, availableW] = useAvailableWidth();
  // Actor pills are sized to their label, and the drawing leaves room for the
  // pills that sit at the first and last lanes — otherwise the outermost labels
  // spill outside the viewBox and get clipped (which is exactly what happened).
  const ACTOR_TINT = ['var(--color-signal)', 'var(--color-violet)', 'var(--color-flux)', 'var(--color-amber)'];
  const pillW = (label: string) => Math.max(96, label.length * 7 + 34);
  const maxHalf = Math.max(...block.actors.map((a) => pillW(a.label) / 2));
  const GUTTER = 30; // left margin for the step-number badges
  const leftX = Math.max(GUTTER + 8, maxHalf) + 14;
  const headerH = 52;

  // Lanes must be at least far enough apart for the longest message label to sit
  // on its arrow instead of spilling past both lifelines, and then spread to use
  // whatever width the panel actually has.
  const chipWOf = (label: string) => label.length * 6.1 + 16;
  const widestLabel = Math.max(0, ...block.messages.map((m) => chipWOf(m.label)));
  const lanes = Math.max(1, block.actors.length - 1);
  const minGap = Math.max(176, Math.ceil(widestLabel) + 40);
  const sideRoom = leftX + maxHalf + 16; // everything that is not lane gaps
  const fillGap = availableW > 0 ? (availableW - sideRoom) / lanes : 0;
  const laneGap = Math.max(minGap, fillGap);

  const laneX = (id: string) => leftX + block.actors.findIndex((a) => a.id === id) * laneGap;
  const rightX = leftX + (block.actors.length - 1) * laneGap;
  const width = rightX + maxHalf + 16;
  const bandLeft = GUTTER - 8;

  // A detail line wraps, and an SVG foreignObject does not clip its overflow —
  // so a note longer than the reserved height used to spill onto the next
  // message. Reserve height per row from the number of lines the detail needs,
  // estimated from its length and the width available under the row.
  const DETAIL_LH = 16;
  const detailAvailW = Math.max(120, width - bandLeft - 20);
  const detailCharsPerLine = Math.max(10, Math.floor(detailAvailW / 6.4));
  const detailLines = (m: (typeof block.messages)[number]) =>
    m.detail ? Math.max(1, Math.ceil(m.detail.length / detailCharsPerLine)) : 0;
  const rowH = block.messages.map((m) => (m.detail ? 34 + detailLines(m) * DETAIL_LH + 12 : 44));
  const rowTop: number[] = [];
  let acc = headerH + 8;
  for (const h of rowH) {
    rowTop.push(acc);
    acc += h;
  }
  const height = acc + 12;

  return (
    <figure className="my-4 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-abyss-900)]">
      <figcaption className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2 text-[12px] font-medium text-[var(--color-ink-300)]">
        <span className="min-w-0 truncate">Sequenza client / server</span>
        <span className="flex shrink-0 items-center gap-1">
          <button className="btn btn-ghost !px-1.5 !py-1" onClick={() => setStep((s) => Math.max(-1, s - 1))} disabled={step < 0} title="Passo precedente">
            <Icon.chevronRight size={13} className="rotate-180" />
          </button>
          <span className="mono w-10 text-center text-[11px] text-[var(--color-ink-500)]">
            {step < 0 ? '—' : `${step + 1}/${block.messages.length}`}
          </span>
          <button
            className="btn btn-ghost !px-1.5 !py-1"
            onClick={() => setStep((s) => Math.min(block.messages.length - 1, s + 1))}
            disabled={step >= block.messages.length - 1}
            title="Passo successivo"
          >
            <Icon.chevronRight size={13} />
          </button>
        </span>
      </figcaption>
      <div ref={scrollRef} className="overflow-x-auto p-3">
        {/* Sized to the measured width, so no max-w-full shrinking the type. */}
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block">
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
          {block.messages.map((msg, i) => {
            const dimmed = step >= 0 && i !== step;
            const yLine = rowTop[i]! + 22;
            const x1 = laneX(msg.from);
            const x2 = laneX(msg.to);
            const self = msg.from === msg.to;
            const tone = msg.tone ?? 'default';
            const color = EDGE_TONE[tone];
            const labelColor = tone === 'default' ? 'var(--color-ink-200)' : color;
            const chipW = msg.label.length * 6.1 + 16;

            return (
              <g key={i} style={{ opacity: dimmed ? 0.24 : 1, transition: 'opacity 0.3s' }}>
                {/* step badge */}
                <circle cx={16} cy={yLine} r={9} fill={step === i ? color : 'var(--color-abyss-700)'} stroke={step === i ? color : 'var(--color-line-strong)'} />
                <text x={16} y={yLine + 3.5} textAnchor="middle" fontSize={10} className="mono" fill={step === i ? 'var(--color-abyss-900)' : 'var(--color-ink-400)'}>
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
                  <foreignObject x={bandLeft + 6} y={yLine + 6} width={detailAvailW} height={detailLines(msg) * DETAIL_LH + 4}>
                    <div style={{ font: `10.5px/${DETAIL_LH}px ui-sans-serif, system-ui`, color: 'var(--color-ink-500)' }}>
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
