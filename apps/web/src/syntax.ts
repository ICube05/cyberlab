/**
 * A small, real lexer — and the IntelliJ Darcula palette it paints with.
 *
 * The previous colouriser split on a keyword regex and hoped for the best,
 * which meant a keyword inside a string was coloured as a keyword and a `#`
 * comment inside SQL was not coloured at all. This one scans left to right with
 * a single alternation per language, so the *first* rule that matches at a
 * position wins and a string is always a string. It is still deliberately
 * small: enough to read code by, not a parser.
 *
 * The colours are Darcula's, the palette IntelliJ ships with: orange keywords,
 * green strings, blue numbers, yellow calls, purple fields, grey comments, on
 * the familiar #2B2B2B ground.
 */

export type TokenType =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'function'
  | 'variable'
  | 'property'
  | 'constant'
  | 'operator'
  | 'punctuation'
  | 'type'
  | 'tag'
  | 'attr';

export interface Token {
  type: TokenType;
  value: string;
}

export type Language =
  | 'http'
  | 'sql'
  | 'bash'
  | 'javascript'
  | 'typescript'
  | 'php'
  | 'json'
  | 'python'
  | 'text';

/** Darcula. These are the actual IntelliJ values, not an approximation. */
export const DARCULA = {
  bg: '#2b2b2b',
  bgGutter: '#313335',
  currentLine: '#323232',
  selection: '#214283',
  caret: '#bbbbbb',
  lineNumber: '#606366',
  lineNumberActive: '#a4a3a3',
  fg: '#a9b7c6',
  keyword: '#cc7832',
  string: '#6a8759',
  number: '#6897bb',
  comment: '#808080',
  function: '#ffc66d',
  variable: '#9876aa',
  property: '#9876aa',
  constant: '#9876aa',
  operator: '#a9b7c6',
  punctuation: '#a9b7c6',
  type: '#a9b7c6',
  tag: '#e8bf6a',
  attr: '#bababa',
  error: '#bc3f3c',
} as const;

export function tokenColor(type: TokenType): string {
  return DARCULA[type as keyof typeof DARCULA] ?? DARCULA.fg;
}

/** Keywords rendered bold, the way Darcula does. */
export const BOLD_TOKENS: ReadonlySet<TokenType> = new Set<TokenType>(['keyword']);
export const ITALIC_TOKENS: ReadonlySet<TokenType> = new Set<TokenType>(['comment']);

// ── rules ───────────────────────────────────────────────────────────────────
// Order matters: the first rule that matches at a position wins, so comments
// and strings must come before anything that could appear inside them.

interface Rule {
  type: TokenType;
  source: string;
}

/** Languages whose keywords are conventionally written in either case. */
const CASE_INSENSITIVE: ReadonlySet<Language> = new Set<Language>(['sql', 'http']);

const STRING_DQ = `"(?:\\\\.|[^"\\\\])*"?`;
const STRING_SQ = `'(?:\\\\.|[^'\\\\])*'?`;
const NUMBER = `\\b0[xX][0-9a-fA-F]+\\b|\\b\\d+(?:\\.\\d+)?\\b`;

function words(list: string[]): string {
  return `\\b(?:${list.join('|')})\\b`;
}

const JS_KEYWORDS = [
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
  'break', 'continue', 'new', 'delete', 'typeof', 'instanceof', 'await', 'async', 'import', 'from',
  'export', 'default', 'class', 'extends', 'super', 'this', 'try', 'catch', 'finally', 'throw',
  'interface', 'type', 'enum', 'implements', 'readonly', 'public', 'private', 'protected', 'static',
  'in', 'of', 'yield', 'void', 'as', 'satisfies',
];
const JS_CONSTANTS = ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'];

const PHP_KEYWORDS = [
  'function', 'return', 'if', 'elseif', 'else', 'foreach', 'for', 'while', 'do', 'switch', 'case',
  'break', 'continue', 'require', 'require_once', 'include', 'include_once', 'echo', 'print', 'new',
  'exit', 'die', 'header', 'class', 'extends', 'implements', 'public', 'private', 'protected',
  'static', 'const', 'try', 'catch', 'finally', 'throw', 'use', 'namespace', 'as', 'global',
  'isset', 'unset', 'empty', 'array',
];
const PHP_CONSTANTS = ['true', 'false', 'null', 'TRUE', 'FALSE', 'NULL'];

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'UNION', 'ALL', 'LIKE', 'INSERT', 'INTO', 'VALUES',
  'UPDATE', 'SET', 'DELETE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'GROUP', 'BY', 'ORDER',
  'HAVING', 'LIMIT', 'OFFSET', 'AS', 'DISTINCT', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'DEFAULT', 'NULL', 'IS', 'IN', 'EXISTS', 'BETWEEN',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'PRAGMA', 'BEGIN', 'COMMIT', 'ROLLBACK',
];
const SQL_FUNCTIONS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'SUBSTR', 'LENGTH', 'UPPER', 'LOWER', 'COALESCE', 'GROUP_CONCAT', 'HEX', 'RANDOMBLOB'];

const PY_KEYWORDS = [
  'def', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'import', 'from',
  'as', 'class', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield', 'global',
  'nonlocal', 'pass', 'assert', 'del', 'in', 'is', 'not', 'and', 'or', 'async', 'await',
];
const PY_CONSTANTS = ['True', 'False', 'None', 'self'];

const BASH_KEYWORDS = [
  'if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'do', 'done', 'while', 'until', 'case', 'esac',
  'function', 'return', 'export', 'local', 'source', 'echo', 'exit', 'set', 'unset', 'read', 'trap',
];

const RULES: Record<Language, Rule[]> = {
  javascript: [
    { type: 'comment', source: `//[^\\n]*|/\\*[\\s\\S]*?\\*/` },
    { type: 'string', source: `\`(?:\\\\.|[^\`\\\\])*\`?|${STRING_DQ}|${STRING_SQ}` },
    { type: 'keyword', source: words(JS_KEYWORDS) },
    { type: 'constant', source: words(JS_CONSTANTS) },
    { type: 'number', source: NUMBER },
    { type: 'function', source: `\\b[A-Za-z_$][\\w$]*(?=\\s*\\()` },
    { type: 'operator', source: `[+\\-*/%=<>!&|^~?:]+` },
    { type: 'punctuation', source: `[{}\\[\\]();,.]` },
  ],
  typescript: [],
  php: [
    { type: 'comment', source: `//[^\\n]*|#[^\\n]*|/\\*[\\s\\S]*?\\*/` },
    { type: 'string', source: `${STRING_DQ}|${STRING_SQ}` },
    { type: 'variable', source: `\\$[A-Za-z_][\\w]*` },
    { type: 'keyword', source: `<\\?php|\\?>|${words(PHP_KEYWORDS)}` },
    { type: 'constant', source: words(PHP_CONSTANTS) },
    { type: 'number', source: NUMBER },
    { type: 'function', source: `\\b[A-Za-z_][\\w]*(?=\\s*\\()` },
    { type: 'operator', source: `->|=>|[+\\-*/%=<>!&|^~?:.]+` },
    { type: 'punctuation', source: `[{}\\[\\]();,]` },
  ],
  sql: [
    { type: 'comment', source: `--[^\\n]*|/\\*[\\s\\S]*?\\*/` },
    { type: 'string', source: `${STRING_SQ}|${STRING_DQ}` },
    { type: 'keyword', source: `(?:${SQL_KEYWORDS.join('|')})(?![\\w])` },
    { type: 'function', source: `(?:${SQL_FUNCTIONS.join('|')})(?=\\s*\\()` },
    { type: 'number', source: NUMBER },
    { type: 'operator', source: `[=<>!|]+` },
    { type: 'punctuation', source: `[(),;.*]` },
  ],
  python: [
    { type: 'comment', source: `#[^\\n]*` },
    { type: 'string', source: `"""[\\s\\S]*?"""|'''[\\s\\S]*?'''|${STRING_DQ}|${STRING_SQ}` },
    { type: 'keyword', source: words(PY_KEYWORDS) },
    { type: 'constant', source: words(PY_CONSTANTS) },
    { type: 'number', source: NUMBER },
    { type: 'attr', source: `@[A-Za-z_][\\w.]*` },
    { type: 'function', source: `\\b[A-Za-z_][\\w]*(?=\\s*\\()` },
    { type: 'operator', source: `[+\\-*/%=<>!&|^~]+` },
    { type: 'punctuation', source: `[{}\\[\\]():,.]` },
  ],
  bash: [
    { type: 'comment', source: `#[^\\n]*` },
    { type: 'string', source: `${STRING_DQ}|${STRING_SQ}` },
    { type: 'variable', source: `\\$\\{[^}]*\\}|\\$[A-Za-z_][\\w]*|\\$[0-9?#@*]` },
    { type: 'keyword', source: words(BASH_KEYWORDS) },
    { type: 'attr', source: `(?:^|\\s)--?[A-Za-z][\\w-]*` },
    { type: 'number', source: NUMBER },
    { type: 'operator', source: `\\|\\||&&|[|><=&;]+` },
    { type: 'punctuation', source: `[{}\\[\\]()]` },
  ],
  json: [
    { type: 'property', source: `"(?:\\\\.|[^"\\\\])*"(?=\\s*:)` },
    { type: 'string', source: STRING_DQ },
    { type: 'keyword', source: `\\b(?:true|false|null)\\b` },
    { type: 'number', source: `-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b` },
    { type: 'punctuation', source: `[{}\\[\\]:,]` },
  ],
  http: [
    { type: 'keyword', source: `^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)(?=\\s)|HTTP/\\d(?:\\.\\d)?` },
    { type: 'comment', source: `^#[^\\n]*` },
    { type: 'property', source: `^[A-Za-z][A-Za-z0-9-]*(?=:)` },
    { type: 'number', source: `\\b[1-5]\\d{2}\\b` },
    { type: 'string', source: `${STRING_DQ}` },
    { type: 'punctuation', source: `[:;,=&?]` },
  ],
  text: [],
};
RULES.typescript = RULES.javascript;

const COMPILED = new Map<Language, RegExp | null>();

function compiled(language: Language): RegExp | null {
  if (COMPILED.has(language)) return COMPILED.get(language) ?? null;
  const rules = RULES[language];
  let regex: RegExp | null = null;
  if (rules.length) {
    const flags = CASE_INSENSITIVE.has(language) ? 'gmi' : 'gm';
    try {
      regex = new RegExp(rules.map((r) => `(${r.source})`).join('|'), flags);
    } catch {
      // A browser without some regex feature must not take the app down with
      // it: fall back to no highlighting for that language.
      regex = null;
    }
  }
  COMPILED.set(language, regex);
  return regex;
}

/** Scan `code` into coloured tokens. Never throws; unknown languages pass through. */
export function tokenize(code: string, language: Language | string): Token[] {
  const lang = normaliseLanguage(language);
  const regex = compiled(lang);
  if (!regex) return code ? [{ type: 'plain', value: code }] : [];

  const rules = RULES[lang];
  const tokens: Token[] = [];
  let last = 0;
  regex.lastIndex = 0;

  for (let match = regex.exec(code); match !== null; match = regex.exec(code)) {
    if (match[0] === '') {
      regex.lastIndex += 1;
      continue;
    }
    if (match.index > last) tokens.push({ type: 'plain', value: code.slice(last, match.index) });
    // Group i+1 corresponds to rule i; find the one that actually matched.
    let type: TokenType = 'plain';
    for (let i = 0; i < rules.length; i += 1) {
      if (match[i + 1] !== undefined) {
        type = rules[i]!.type;
        break;
      }
    }
    tokens.push({ type, value: match[0] });
    last = match.index + match[0].length;
  }
  if (last < code.length) tokens.push({ type: 'plain', value: code.slice(last) });
  return tokens;
}

export function normaliseLanguage(language: string): Language {
  const l = language.toLowerCase();
  if (l === 'js' || l === 'jsx' || l === 'javascript') return 'javascript';
  if (l === 'ts' || l === 'tsx' || l === 'typescript') return 'typescript';
  if (l === 'py' || l === 'python') return 'python';
  if (l === 'sh' || l === 'shell' || l === 'bash' || l === 'zsh') return 'bash';
  if (l === 'php') return 'php';
  if (l === 'sql') return 'sql';
  if (l === 'json') return 'json';
  if (l === 'http') return 'http';
  return 'text';
}

/** Guess a language from a file path, for the lab's editor. */
export function languageForPath(path: string): Language {
  const name = path.toLowerCase();
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.php')) return 'php';
  if (name.endsWith('.sql')) return 'sql';
  if (name.endsWith('.py')) return 'python';
  if (name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.cjs')) return 'javascript';
  if (name.endsWith('.ts')) return 'typescript';
  if (name.endsWith('.sh') || name.endsWith('.bash')) return 'bash';
  if (name.endsWith('.conf') || name.endsWith('.cfg') || name.endsWith('.ini')) return 'bash';
  if (/(^|\/)(crontab|\.bashrc|\.profile)$/.test(name)) return 'bash';
  return 'text';
}
