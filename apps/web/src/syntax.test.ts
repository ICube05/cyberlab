import { describe, expect, it } from 'vitest';
import { languageForPath, normaliseLanguage, tokenize } from './syntax.js';

/**
 * The lexer's job is not to be a parser — it is to never lie about what a
 * fragment is. These tests pin the cases the old keyword-splitting version got
 * wrong, because those are exactly the ones a learner reads closely: payloads
 * inside strings, comments that hide the rest of a query.
 */

const typesOf = (code: string, lang: string) => tokenize(code, lang).map((t) => t.type);
const find = (code: string, lang: string, value: string) =>
  tokenize(code, lang).find((t) => t.value === value);

describe('tokenize', () => {
  it('treats a keyword inside a string as string, not keyword', () => {
    const tokens = tokenize(`$q = 'SELECT * FROM users';`, 'php');
    const select = tokens.find((t) => t.value.includes('SELECT'));
    expect(select?.type).toBe('string');
  });

  it('colours SQL comments, which is how -- payloads read', () => {
    // The realistic shape: the injected quote closes the string, and what
    // follows really is a comment — the reason the password check disappears.
    const injected = "SELECT * FROM accounts WHERE user='admin' -- ' AND pass=''";
    expect(find(injected, 'sql', "-- ' AND pass=''")?.type).toBe('comment');
  });

  it('reads an unterminated string as a string, the way an editor does', () => {
    // Half-typed input is the normal state of an editor; the lexer must not
    // fall over or reclassify the rest of the line.
    const tokens = tokenize("WHERE name = 'admi", 'sql');
    expect(tokens.at(-1)).toEqual({ type: 'string', value: "'admi" });
  });

  it('is case-insensitive for SQL keywords', () => {
    expect(find('select 1', 'sql', 'select')?.type).toBe('keyword');
    expect(find('SELECT 1', 'sql', 'SELECT')?.type).toBe('keyword');
  });

  it('distinguishes a JSON key from a JSON string value', () => {
    const tokens = tokenize('{"role": "admin"}', 'json');
    expect(tokens.find((t) => t.value === '"role"')?.type).toBe('property');
    expect(tokens.find((t) => t.value === '"admin"')?.type).toBe('string');
  });

  it('marks PHP variables, which is where injected input lands', () => {
    expect(find('echo $name;', 'php', '$name')?.type).toBe('variable');
  });

  it('marks shell variables and comments', () => {
    expect(find('echo $USER # who', 'bash', '$USER')?.type).toBe('variable');
    expect(find('echo $USER # who', 'bash', '# who')?.type).toBe('comment');
  });

  it('recognises the request line and header names in HTTP', () => {
    const tokens = tokenize('GET /a HTTP/1.1\nCookie: s=1', 'http');
    expect(tokens[0]?.type).toBe('keyword');
    expect(tokens.find((t) => t.value === 'Cookie')?.type).toBe('property');
  });

  it('round-trips: concatenating token values reproduces the input exactly', () => {
    const samples: [string, string][] = [
      [`SELECT * FROM t WHERE a = 'b' -- x`, 'sql'],
      [`<?php $a = "x"; // y`, 'php'],
      ['{"a": [1, 2, null]}', 'json'],
      ['def f(x):\n    return x  # c', 'python'],
      ['const a = `t${b}`;', 'javascript'],
      ['', 'sql'],
      ['plain words with no syntax', 'text'],
    ];
    for (const [code, lang] of samples) {
      expect(tokenize(code, lang).map((t) => t.value).join('')).toBe(code);
    }
  });

  it('never throws on an unknown language', () => {
    expect(() => typesOf('anything at all', 'brainfuck')).not.toThrow();
  });
});

describe('language detection', () => {
  it('maps aliases', () => {
    expect(normaliseLanguage('JS')).toBe('javascript');
    expect(normaliseLanguage('sh')).toBe('bash');
    expect(normaliseLanguage('nonsense')).toBe('text');
  });

  it('maps lab file paths', () => {
    expect(languageForPath('/srv/vault/policy.json')).toBe('json');
    expect(languageForPath('/srv/vault/profile.php')).toBe('php');
    expect(languageForPath('/usr/local/bin/backup.sh')).toBe('bash');
    expect(languageForPath('/root/flag.txt')).toBe('text');
  });
});
