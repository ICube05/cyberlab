import { useCallback, useRef, useState, type ReactNode } from 'react';

/**
 * A draggable two-pane split — the resizable panels an IDE lives on.
 *
 * Deliberately tiny and dependency-free: it tracks a percentage, clamps it, and
 * exposes a grab handle. Persists nothing; the parent owns layout intent.
 */
export function Split({
  a,
  b,
  direction = 'horizontal',
  initial = 50,
  min = 20,
  max = 80,
  storageKey,
}: {
  a: ReactNode;
  b: ReactNode;
  direction?: 'horizontal' | 'vertical';
  initial?: number;
  min?: number;
  max?: number;
  storageKey?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(() => {
    if (storageKey) {
      const stored = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(stored) && stored >= min && stored <= max) return stored;
    }
    return initial;
  });
  const [dragging, setDragging] = useState(false);

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(true);
      const container = containerRef.current!;
      const move = (ev: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        const raw =
          direction === 'horizontal'
            ? ((ev.clientX - rect.left) / rect.width) * 100
            : ((ev.clientY - rect.top) / rect.height) * 100;
        const clamped = Math.min(max, Math.max(min, raw));
        setPct(clamped);
      };
      const up = () => {
        setDragging(false);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (storageKey) setPct((p) => (localStorage.setItem(storageKey, String(p)), p));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [direction, min, max, storageKey],
  );

  const isH = direction === 'horizontal';
  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: isH ? 'row' : 'column', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div style={{ [isH ? 'width' : 'height']: `${pct}%`, overflow: 'hidden', flexShrink: 0 }}>{a}</div>
      <div
        onPointerDown={onDown}
        role="separator"
        aria-orientation={isH ? 'vertical' : 'horizontal'}
        style={{
          [isH ? 'width' : 'height']: 7,
          cursor: isH ? 'col-resize' : 'row-resize',
          flexShrink: 0,
          background: dragging ? 'var(--color-signal-dim)' : 'transparent',
          borderInline: isH ? '1px solid var(--color-line)' : undefined,
          borderBlock: isH ? undefined : '1px solid var(--color-line)',
          transition: dragging ? 'none' : 'background 0.15s',
          position: 'relative',
          zIndex: 5,
        }}
        className="hover:!bg-[var(--color-line-strong)]"
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>{b}</div>
    </div>
  );
}
