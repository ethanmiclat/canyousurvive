import type { Entity } from './content.js'

/**
 * Typed-answer matching (plan section 4). Everything here is scoped to a question's valid set and never
 * looks at the site's hidden pick, so responses are identical for deadly and safe answers.
 */

const ARTICLES = /^(the|a|an)\s+/

/** Lowercase, strip diacritics and punctuation, collapse spaces, drop a leading article. */
export function normalize(input: string): string {
  let s = input
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[-_/–—]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  const stripped = s.replace(ARTICLES, '')
  if (stripped) s = stripped
  return s
}

/** Space-insensitive comparison key ("Guinea-Bissau" == "guineabissau"). */
export function matchKey(input: string): string {
  return normalize(input).replace(/ /g, '')
}

/** Optimal string alignment distance (Damerau-Levenshtein with adjacent transpositions). */
export function damerauLevenshtein(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev2: number[] = new Array(b.length + 1).fill(0)
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  let cur: number[] = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    let rowMin = cur[0]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j]
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]
}

/** Allowed edits scale with length: 0 for <=3 characters, 1 for 4-7, 2 for 8+. */
export function typoThreshold(key: string): number {
  if (key.length <= 3) return 0
  if (key.length <= 7) return 1
  return 2
}

function entityKeys(e: Entity): string[] {
  const keys = new Set<string>()
  for (const s of [e.name, ...(e.alt ?? []), ...(e.aliases ?? [])]) {
    const k = matchKey(s)
    if (k) keys.add(k)
  }
  return [...keys]
}

const keyCache = new WeakMap<Entity, string[]>()
function keysOf(e: Entity): string[] {
  let k = keyCache.get(e)
  if (!k) keyCache.set(e, (k = entityKeys(e)))
  return k
}

export type MatchResult =
  | { kind: 'exact'; entity: Entity }
  | { kind: 'fuzzy'; entity: Entity }
  | { kind: 'unrecognized' }

/**
 * @param input raw player input
 * @param universe every entity in the question's dataset
 * @param validIds the question's valid-answer set
 */
export function matchAnswer(input: string, universe: Entity[], validIds: ReadonlySet<string>): MatchResult {
  const key = matchKey(input)
  if (!key || key.length > 80) return { kind: 'unrecognized' }

  // Exact (name or alias) against the whole dataset, so an out-of-set real answer is never fuzzed onto
  // a similar in-set one. A key shared by several entities counts only if exactly one of them is in the set.
  const exact = universe.filter((e) => keysOf(e).includes(key))
  if (exact.length) {
    const inSet = exact.filter((e) => validIds.has(e.id))
    return inSet.length === 1 ? { kind: 'exact', entity: inSet[0] } : { kind: 'unrecognized' }
  }

  // Typo tolerance. Accept only when exactly one entity in the dataset is within the threshold and it is in the set.
  const max = typoThreshold(key)
  if (max === 0) return { kind: 'unrecognized' }
  const near = universe.filter((e) => keysOf(e).some((k) => damerauLevenshtein(key, k, max) <= max))
  if (near.length === 1 && validIds.has(near[0].id)) return { kind: 'fuzzy', entity: near[0] }
  return { kind: 'unrecognized' }
}
