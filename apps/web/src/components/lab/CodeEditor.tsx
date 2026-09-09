import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BOLD_TOKENS,
  DARCULA,
  ITALIC_TOKENS,
  tokenColor,
  tokenize,
  type Language,
} from '../../syntax.js';

/**
 * A real code editor, in the IntelliJ Darcula theme.
 *
 * The technique is the classic one: a transparent `<textarea>` sits exactly on
 * top of a highlighted `<pre>`, so the browser keeps every editing behaviour
 * (selection, undo, IME, autoscroll) while we own the painting. What makes it
 * feel like an IDE rather than a coloured box is the rest: a line-number
 * gutter, a current-line band, bracket/quote auto-closing, Tab and Shift-Tab
 * indentation over a selection, comment toggling, and ⌘/Ctrl-S to save.
 *
 * Every metric that affects layout — font, size, line height, padding — is
 * declared once and applied to both layers, because a single pixel of drift
 * between them puts the caret in the wrong place.
 */

const FONT = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const FONT_SIZE = 12.5;
const LINE_HEIGHT = 20;
const PAD_Y = 8;
const PAD_X = 12;
const TAB = '    ';

const CLOSERS: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
const LINE_COMMENT: Partial<Record<Language, string>> = {
  javascript: '//',
  typescript: '//',
  php: '//',
  python: '#',
  bash: '#',
  sql: '--',
};

export interface CodeEditorProps {
  value: string;
  language: Language;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onSave?: () => void;
  /** Rendered under the last line, e.g. a validation error from the target. */
  problem?: string | null;
}

export function CodeEditor({ value, language, readOnly, onChange, onSave, problem }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caretLine, setCaretLine] = useState(0);

  const lines = useMemo(() => value.split('\n'), [value]);
  const gutterWidth = Math.max(2, String(lines.length).length) * 8 + 20;

  const syncCaret = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const upto = el.value.slice(0, el.selectionStart);
    setCaretLine(upto.split('\n').length - 1);
  }, []);

  useEffect(() => {
    syncCaret();
  }, [value, syncCaret]);

  // Keep the textarea exactly as tall as the painted code, so the container —
  // not the textarea — owns scrolling and the two layers can never disagree.
  const height = lines.length * LINE_HEIGHT + PAD_Y * 2;

  const setValue = (next: string, selectionStart: number, selectionEnd = selectionStart) => {
    onChange?.(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.selectionStart = selectionStart;
      el.selectionEnd = selectionEnd;
      syncCaret();
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const mod = event.metaKey || event.ctrlKey;

    if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault();
      onSave?.();
      return;
    }
    if (readOnly) return;

    // ⌘/ — toggle line comments over the selection.
    if (mod && event.key === '/') {
      const marker = LINE_COMMENT[language];
      if (!marker) return;
      event.preventDefault();
      const from = value.lastIndexOf('\n', start - 1) + 1;
      const toRaw = value.indexOf('\n', end);
      const to = toRaw === -1 ? value.length : toRaw;
      const block = value.slice(from, to).split('\n');
      const allCommented = block.every((l) => l.trim() === '' || l.trimStart().startsWith(marker));
      const next = block
        .map((l) => {
          if (l.trim() === '') return l;
          if (allCommented) return l.replace(new RegExp(`^(\\s*)${escapeRegex(marker)} ?`), '$1');
          const indent = l.match(/^\s*/)?.[0] ?? '';
          return `${indent}${marker} ${l.slice(indent.length)}`;
        })
        .join('\n');
      setValue(value.slice(0, from) + next + value.slice(to), from, from + next.length);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      if (start === end && !event.shiftKey) {
        setValue(value.slice(0, start) + TAB + value.slice(end), start + TAB.length);
        return;
      }
      // Indent or outdent every line the selection touches.
      const from = value.lastIndexOf('\n', start - 1) + 1;
      const toRaw = value.indexOf('\n', end);
      const to = toRaw === -1 ? value.length : toRaw;
      const block = value.slice(from, to).split('\n');
      const next = block
        .map((l) => (event.shiftKey ? l.replace(new RegExp(`^ {1,${TAB.length}}`), '') : TAB + l))
        .join('\n');
      setValue(value.slice(0, from) + next + value.slice(to), from, from + next.length);
      return;
    }

    if (event.key === 'Enter') {
      // Keep the current indentation, and open a block when we are between braces.
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const indent = value.slice(lineStart, start).match(/^\s*/)?.[0] ?? '';
      const before = value[start - 1];
      const after = value[start];
      event.preventDefault();
      if (before && after && CLOSERS[before] === after && before !== '"' && before !== "'") {
        const inner = `\n${indent}${TAB}`;
        const outer = `\n${indent}`;
        setValue(value.slice(0, start) + inner + outer + value.slice(end), start + inner.length);
        return;
      }
      const extra = before === '{' || before === '[' || before === '(' ? TAB : '';
      const insert = `\n${indent}${extra}`;
      setValue(value.slice(0, start) + insert + value.slice(end), start + insert.length);
      return;
    }

    // Auto-close brackets and quotes; type over the closer rather than doubling it.
    if (CLOSERS[event.key] && start === end) {
      const closer = CLOSERS[event.key]!;
      event.preventDefault();
      setValue(value.slice(0, start) + event.key + closer + value.slice(end), start + 1);
      return;
    }
    if ((event.key === ')' || event.key === ']' || event.key === '}') && value[start] === event.key && start === end) {
      event.preventDefault();
      setValue(value, start + 1);
      return;
    }
    if (event.key === 'Backspace' && start === end && start > 0) {
      const before = value[start - 1]!;
      if (CLOSERS[before] && value[start] === CLOSERS[before]) {
        event.preventDefault();
        setValue(value.slice(0, start - 1) + value.slice(start + 1), start - 1);
      }
    }
  };

  const shared: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: `${FONT_SIZE}px`,
    lineHeight: `${LINE_HEIGHT}px`,
    tabSize: 4,
    padding: `${PAD_Y}px ${PAD_X}px`,
    margin: 0,
    border: 0,
    whiteSpace: 'pre',
    overflowWrap: 'normal',
    fontVariantLigatures: 'none',
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ background: DARCULA.bg }}>
      <div className="min-h-0 flex-1 overflow-auto" style={{ background: DARCULA.bg }}>
        <div className="flex min-h-full" style={{ width: 'max-content', minWidth: '100%' }}>
          {/* gutter */}
          <div
            className="sticky left-0 z-10 select-none text-right"
            style={{
              ...shared,
              padding: `${PAD_Y}px 10px`,
              width: gutterWidth,
              flexShrink: 0,
              background: DARCULA.bgGutter,
              color: DARCULA.lineNumber,
              borderRight: `1px solid #4b4b4b`,
            }}
          >
            {lines.map((_, i) => (
              <div key={i} style={{ color: i === caretLine ? DARCULA.lineNumberActive : DARCULA.lineNumber }}>
                {i + 1}
              </div>
            ))}
          </div>

          {/* code */}
          <div className="relative flex-1" style={{ minHeight: height }}>
            {/* current-line band */}
            {!readOnly && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: PAD_Y + caretLine * LINE_HEIGHT,
                  height: LINE_HEIGHT,
                  background: DARCULA.currentLine,
                  pointerEvents: 'none',
                }}
              />
            )}
            <pre aria-hidden style={{ ...shared, position: 'relative', color: DARCULA.fg, minHeight: height }}>
              {highlight(value, language)}
            </pre>
            <textarea
              ref={textareaRef}
              value={value}
              readOnly={readOnly}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              onChange={(e) => onChange?.(e.target.value)}
              onKeyDown={onKeyDown}
              onKeyUp={syncCaret}
              onClick={syncCaret}
              onSelect={syncCaret}
              style={{
                ...shared,
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                resize: 'none',
                background: 'transparent',
                color: 'transparent',
                caretColor: DARCULA.caret,
                WebkitTextFillColor: 'transparent',
                outline: 'none',
                overflow: 'hidden',
                boxShadow: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {problem && (
        <div
          className="mono shrink-0 border-t px-3 py-1.5 text-[11.5px]"
          style={{ background: '#3c2b2b', borderColor: '#5c3a3a', color: '#ff8a80' }}
        >
          {problem}
        </div>
      )}
    </div>
  );
}

/** Paint tokens. Kept out of the component so it can be reused by the viewer. */
export function highlight(code: string, language: Language): React.ReactNode {
  const tokens = tokenize(code, language);
  return tokens.map((token, i) => {
    if (token.type === 'plain') return <span key={i}>{token.value}</span>;
    return (
      <span
        key={i}
        style={{
          color: tokenColor(token.type),
          fontWeight: BOLD_TOKENS.has(token.type) ? 600 : undefined,
          fontStyle: ITALIC_TOKENS.has(token.type) ? 'italic' : undefined,
        }}
      >
        {token.value}
      </span>
    );
  });
}

/** Read-only sibling of the editor: same theme, same gutter, no caret. */
export function CodeViewer({ value, language }: { value: string; language: Language }) {
  const lines = value.split('\n');
  const gutterWidth = Math.max(2, String(lines.length).length) * 8 + 20;
  const shared: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: `${FONT_SIZE}px`,
    lineHeight: `${LINE_HEIGHT}px`,
    tabSize: 4,
    padding: `${PAD_Y}px ${PAD_X}px`,
    margin: 0,
    whiteSpace: 'pre',
  };
  return (
    <div className="min-h-0 flex-1 overflow-auto" style={{ background: DARCULA.bg }}>
      <div className="flex min-h-full" style={{ width: 'max-content', minWidth: '100%' }}>
        <div
          className="sticky left-0 z-10 select-none text-right"
          style={{
            ...shared,
            padding: `${PAD_Y}px 10px`,
            width: gutterWidth,
            flexShrink: 0,
            background: DARCULA.bgGutter,
            color: DARCULA.lineNumber,
            borderRight: '1px solid #4b4b4b',
          }}
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre style={{ ...shared, color: DARCULA.fg, flex: 1 }}>{highlight(value, language)}</pre>
      </div>
    </div>
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Exported for the layout maths in tests. */
export const EDITOR_METRICS = { FONT_SIZE, LINE_HEIGHT, PAD_X, PAD_Y };
