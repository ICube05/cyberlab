import type { JSX } from 'react';

/**
 * A small hand-drawn icon set.
 *
 * Inline SVG, stroke-based, one consistent weight. Bundling our own keeps the
 * app dependency-free on the icon front and lets every glyph inherit
 * `currentColor`, so icons tint with their context automatically.
 */
type IconProps = { size?: number; className?: string; strokeWidth?: number };

function make(path: JSX.Element): (props: IconProps) => JSX.Element {
  return ({ size = 16, className, strokeWidth = 1.6 }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const Icon = {
  shield: make(<><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></>),
  book: make(<><path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z" /><path d="M4 20.5A2.5 2.5 0 016.5 18H20" /></>),
  flask: make(<><path d="M9 3h6M10 3v6l-5 8a2 2 0 002 3h10a2 2 0 002-3l-5-8V3" /><path d="M7.5 15h9" /></>),
  terminal: make(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></>),
  compass: make(<><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" /></>),
  search: make(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>),
  flame: make(<path d="M12 3c1 3 4 4 4 8a4 4 0 01-8 0c0-1 .5-2 1-2.5C9 10 9 8 12 3z" />),
  lightbulb: make(<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 00-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0012 3z" /></>),
  message: make(<path d="M4 5h16v11H8l-4 3z" />),
  bug: make(<><path d="M9 8V6a3 3 0 016 0v2" /><rect x="7" y="8" width="10" height="10" rx="5" /><path d="M4 12h3M17 12h3M5 8l2 1M19 8l-2 1M5 17l2-1M19 17l-2-1M12 8v10" /></>),
  chevronRight: make(<path d="M9 6l6 6-6 6" />),
  chevronDown: make(<path d="M6 9l6 6 6-6" />),
  lock: make(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>),
  check: make(<path d="M5 12l5 5L20 7" />),
  checkCircle: make(<><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>),
  circle: make(<circle cx="12" cy="12" r="8" />),
  x: make(<path d="M6 6l12 12M18 6L6 18" />),
  play: make(<path d="M7 5l12 7-12 7z" />),
  send: make(<path d="M4 12l16-8-6 16-3-6-7-2z" />),
  refresh: make(<><path d="M4 4v6h6" /><path d="M20 20v-6h-6" /><path d="M5 14a8 8 0 0013-5M19 10a8 8 0 00-13-5" /></>),
  zap: make(<path d="M13 3L5 13h6l-1 8 8-11h-6l1-7z" />),
  star: make(<path d="M12 3l2.9 5.9 6.5 1-4.7 4.6 1.1 6.5L12 18l-5.8 3 1.1-6.5L2.6 9.9l6.5-1L12 3z" />),
  droplet: make(<path d="M12 3s6 6 6 10a6 6 0 01-12 0c0-4 6-10 6-10z" />),
  shieldCheck: make(<><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></>),
  globe: make(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" /></>),
  target: make(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>),
  chip: make(<><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2" /></>),
  network: make(<><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M12 7.5v4M12 11.5L6.5 16M12 11.5L17.5 16" /></>),
  flag: make(<><path d="M6 21V4M6 4h11l-2 4 2 4H6" /></>),
  foundation: make(<><path d="M4 20h16M6 20V9l6-4 6 4v11M9 20v-5h6v5" /></>),
  windows: make(<><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></>),
  command: make(<path d="M9 6a2 2 0 10-2 2h10a2 2 0 10-2-2v12a2 2 0 102-2H7a2 2 0 10-2 2z" />),
  layers: make(<><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>),
  brain: make(<path d="M9 4a3 3 0 00-3 3 3 3 0 00-1 5 3 3 0 002 4 3 3 0 006 0V4a3 3 0 00-4 0z" />),
  arrowRight: make(<path d="M5 12h14M13 6l6 6-6 6" />),
  sparkles: make(<path d="M12 4l1.5 4L18 9.5 13.5 11 12 15l-1.5-4L6 9.5 10.5 8 12 4z" />),
  dot: make(<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />),
  sidebar: make(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>),
  trophy: make(<><path d="M8 4h8v4a4 4 0 01-8 0V4zM6 5H4v1a3 3 0 003 3M18 5h2v1a3 3 0 01-3 3M10 14h4v3h-4zM8 20h8" /></>),
  clock: make(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  info: make(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
};

export const LEVEL_ICONS: Record<string, keyof typeof Icon> = {
  foundation: 'foundation',
  globe: 'globe',
  search: 'search',
  target: 'target',
  terminal: 'terminal',
  windows: 'windows',
  network: 'network',
  chip: 'chip',
  bug: 'bug',
  flag: 'flag',
  shield: 'shield',
};
