/**
 * Deterministic pseudo-randomness.
 *
 * Every lab is created with a seed. Same seed, same world: same user ids, same
 * session tokens, same flag. That is what makes a lab reproducible — a learner
 * can share a seed with a friend and hit exactly the same puzzle, and a bug
 * report can be replayed. Nothing in the engine may call `Math.random()`.
 */

export class Rng {
  #state: number;

  constructor(seed: string) {
    this.#state = hashSeed(seed);
  }

  /** xorshift32 — small, fast, and good enough for scenario generation. */
  next(): number {
    let x = this.#state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    this.#state = x;
    return x / 0x1_0000_0000;
  }

  int(minInclusive: number, maxInclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick called with an empty list');
    return items[this.int(0, items.length - 1)]!;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      const a = out[i]!;
      const b = out[j]!;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }

  /** Hex token of `length` characters. Used for session ids and flags. */
  token(length = 32): string {
    let out = '';
    while (out.length < length) {
      out += Math.floor(this.next() * 0xffffffff)
        .toString(16)
        .padStart(8, '0');
    }
    return out.slice(0, length);
  }
}

export function hashSeed(seed: string): number {
  // FNV-1a, then forced away from zero (xorshift dies at 0).
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash === 0 ? 0x9e3779b9 : hash;
}

/** A seed that is readable in a URL and in a bug report. */
export function randomSeed(entropy: () => number = Math.random): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out += alphabet[Math.floor(entropy() * alphabet.length)] ?? 'a';
  }
  return out;
}
