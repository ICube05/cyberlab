/**
 * Lesson content blocks.
 *
 * Theory is authored as *data*, never as HTML strings. That buys three things
 * the spec asked for and a markdown blob cannot give:
 *
 *  1. interactive blocks are first-class, not an escape hatch;
 *  2. the AI tutor can be handed the exact block the learner is looking at;
 *  3. the renderer owns typography, so nothing ever looks like a pasted README.
 */

export type ContentBlock =
  | ProseBlock
  | HeadingBlock
  | CalloutBlock
  | CodeBlock
  | TableBlock
  | ComparisonBlock
  | FlowDiagramBlock
  | SequenceBlock
  | TimelineBlock
  | KeyPointsBlock
  | QuizBlock
  | HttpExchangeBlock
  | CookieJarBlock
  | SqlBuilderBlock
  | JwtInspectorBlock
  | PermissionBitsBlock;

interface BlockBase {
  /** Unique within a lesson. Used for anchors, tutor references and progress. */
  id: string;
  /** Optional one-line note shown in the tutor's "you are here" context. */
  tutorNote?: string;
}

/**
 * Inline markup supported inside prose: `code`, **bold**, *italic*, [text](url),
 * and {{term:tooltip}} for a hoverable glossary term. Nothing else — the point
 * is controlled typography, not a second markdown dialect.
 */
export interface ProseBlock extends BlockBase {
  kind: 'prose';
  text: string;
}

export interface HeadingBlock extends BlockBase {
  kind: 'heading';
  text: string;
  level: 2 | 3;
  /** Small uppercase label rendered above the heading, e.g. "SECTION A". */
  eyebrow?: string;
}

export interface CalloutBlock extends BlockBase {
  kind: 'callout';
  variant: 'info' | 'tip' | 'warning' | 'danger' | 'legal';
  title?: string;
  text: string;
}

export interface CodeBlock extends BlockBase {
  kind: 'code';
  language: 'http' | 'sql' | 'bash' | 'javascript' | 'typescript' | 'php' | 'json' | 'text' | 'python';
  code: string;
  filename?: string;
  /** 1-based line numbers to emphasise. */
  highlight?: number[];
  /** Per-line footnotes, keyed by 1-based line number. */
  annotations?: Record<number, string>;
  caption?: string;
}

export interface TableBlock extends BlockBase {
  kind: 'table';
  columns: string[];
  rows: string[][];
  caption?: string;
}

/** Side-by-side "this is broken / this is fixed". Used constantly. */
export interface ComparisonBlock extends BlockBase {
  kind: 'comparison';
  left: ComparisonSide;
  right: ComparisonSide;
}

export interface ComparisonSide {
  label: string;
  tone: 'bad' | 'good' | 'neutral';
  language: CodeBlock['language'];
  code: string;
  note?: string;
}

/** A small directed graph rendered as SVG. Deliberately not Mermaid: we want
 *  hover states, per-node tooltips and step-through animation. */
export interface FlowDiagramBlock extends BlockBase {
  kind: 'flow';
  title?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Optional ordered reveal, one array entry per animation step. */
  steps?: { label: string; highlight: string[] }[];
}

export interface FlowNode {
  id: string;
  label: string;
  sublabel?: string;
  /** Grid column / row, 0-indexed. Layout is explicit so diagrams stay stable. */
  col: number;
  row: number;
  tone?: 'default' | 'accent' | 'danger' | 'success' | 'muted';
  tooltip?: string;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  tone?: 'default' | 'accent' | 'danger' | 'success';
  dashed?: boolean;
}

/** Client/server message sequence the learner can step through. */
export interface SequenceBlock extends BlockBase {
  kind: 'sequence';
  actors: { id: string; label: string }[];
  messages: SequenceMessage[];
}

export interface SequenceMessage {
  from: string;
  to: string;
  label: string;
  detail?: string;
  tone?: 'default' | 'accent' | 'danger' | 'success';
}

export interface TimelineBlock extends BlockBase {
  kind: 'timeline';
  entries: { title: string; text: string; tone?: 'default' | 'danger' | 'success' }[];
}

export interface KeyPointsBlock extends BlockBase {
  kind: 'keypoints';
  title?: string;
  points: string[];
}

/** An inline comprehension check. Feeds the `recognition` mastery dimension. */
export interface QuizBlock extends BlockBase {
  kind: 'quiz';
  question: string;
  options: { id: string; text: string }[];
  correct: string[];
  multi?: boolean;
  /** Shown after answering, whatever the outcome. */
  explanation: string;
  /** Skills credited when answered correctly. */
  skills?: string[];
}

// ── Interactive blocks ──────────────────────────────────────────────────────
// These are not illustrations: each is backed by real logic in the web app,
// and several of them execute against the same lab engine the labs use.

/** A clickable HTTP request/response pair with per-header explanations. */
export interface HttpExchangeBlock extends BlockBase {
  kind: 'http-exchange';
  title?: string;
  request: {
    method: string;
    path: string;
    version?: string;
    headers: { name: string; value: string; explain?: string }[];
    body?: string;
  };
  response?: {
    status: number;
    statusText: string;
    headers: { name: string; value: string; explain?: string }[];
    body?: string;
  };
  /** Rendered under the exchange once the learner has clicked something. */
  takeaway?: string;
}

/** Cookie attribute playground: toggle attributes, see what a browser sends. */
export interface CookieJarBlock extends BlockBase {
  kind: 'cookie-jar';
  cookieName: string;
  cookieValue: string;
  /** Scenarios the learner switches between to test the attribute rules. */
  scenarios: {
    id: string;
    label: string;
    url: string;
    /** Whether the request is cross-site, for SameSite evaluation. */
    crossSite: boolean;
    /** Whether the request originates from script rather than navigation. */
    fromScript?: boolean;
  }[];
}

/** Type into an input, watch the SQL the backend builds, run it for real. */
export interface SqlBuilderBlock extends BlockBase {
  kind: 'sql-builder';
  /** The lab spec whose database backs this widget. Executed for real. */
  labSpecId: string;
  /** Template with `{{input}}` where user data is concatenated in. */
  template: string;
  /** Same query, done properly. Shown for contrast. */
  safeTemplate: string;
  initialInput: string;
  suggestions?: { label: string; value: string }[];
}

export interface JwtInspectorBlock extends BlockBase {
  kind: 'jwt';
  token: string;
  /** Secret used by the demo verifier, so tampering can actually be detected. */
  hmacSecret: string;
  hint?: string;
}

export interface PermissionBitsBlock extends BlockBase {
  kind: 'permission-bits';
  initialMode: number;
  path: string;
  owner: string;
  group: string;
  /** Scenarios evaluated live against the real VFS permission rules. */
  actors: { id: string; label: string; user: string; groups: string[] }[];
}

// ── helpers ────────────────────────────────────────────────────────────────

export function isInteractiveBlock(block: ContentBlock): boolean {
  return (
    block.kind === 'http-exchange' ||
    block.kind === 'cookie-jar' ||
    block.kind === 'sql-builder' ||
    block.kind === 'jwt' ||
    block.kind === 'permission-bits' ||
    block.kind === 'quiz'
  );
}

/** Plain-text projection of a block, used to build AI tutor context. */
export function blockToPlainText(block: ContentBlock): string {
  switch (block.kind) {
    case 'prose':
      return block.text;
    case 'heading':
      return `# ${block.text}`;
    case 'callout':
      return `[${block.variant}] ${block.title ? block.title + ': ' : ''}${block.text}`;
    case 'code':
      return `\`\`\`${block.language}\n${block.code}\n\`\`\``;
    case 'table':
      return [block.columns.join(' | '), ...block.rows.map((r) => r.join(' | '))].join('\n');
    case 'comparison':
      return `${block.left.label}:\n${block.left.code}\n\n${block.right.label}:\n${block.right.code}`;
    case 'flow':
      return `Diagram${block.title ? ' "' + block.title + '"' : ''}: ${block.nodes
        .map((n) => n.label)
        .join(' / ')}`;
    case 'sequence':
      return block.messages.map((m) => `${m.from} -> ${m.to}: ${m.label}`).join('\n');
    case 'timeline':
      return block.entries.map((e) => `${e.title}: ${e.text}`).join('\n');
    case 'keypoints':
      return block.points.map((p) => `- ${p}`).join('\n');
    case 'quiz':
      return `Quiz: ${block.question}`;
    case 'http-exchange':
      return `${block.request.method} ${block.request.path}`;
    case 'cookie-jar':
      return `Cookie playground for ${block.cookieName}`;
    case 'sql-builder':
      return `SQL builder: ${block.template}`;
    case 'jwt':
      return `JWT inspector`;
    case 'permission-bits':
      return `Permission calculator for ${block.path}`;
  }
}
