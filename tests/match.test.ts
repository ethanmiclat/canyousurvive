import { describe, expect, it } from 'vitest'
import { loadDataset } from '../lib/content'
import { damerauLevenshtein, matchAnswer, normalize, typoThreshold } from '../lib/match'

const countries = loadDataset('countries').entities
const all = new Set(countries.map((e) => e.id))
const europe = new Set(countries.filter((e) => e.tags?.includes('continent:europe')).map((e) => e.id))

describe('normalize', () => {
  it('lowercases, strips diacritics, punctuation and leading articles', () => {
    expect(normalize("  Côte d'Ivoire ")).toBe('cote divoire')
    expect(normalize('The Gambia')).toBe('gambia')
    expect(normalize('U.S.A.')).toBe('usa')
    expect(normalize('Guinea-Bissau')).toBe('guinea bissau')
    expect(normalize('A')).toBe('a')
  })
})

describe('typo threshold', () => {
  it('scales with length', () => {
    expect(typoThreshold('abc')).toBe(0)
    expect(typoThreshold('abcd')).toBe(1)
    expect(typoThreshold('abcdefg')).toBe(1)
    expect(typoThreshold('abcdefgh')).toBe(2)
  })
  it('counts adjacent transpositions as one edit', () => {
    expect(damerauLevenshtein('fracne', 'france')).toBe(1)
    expect(damerauLevenshtein('kitten', 'sitting')).toBe(3)
  })
})

describe('matchAnswer', () => {
  it('matches canonical names and aliases exactly', () => {
    expect(matchAnswer('france', countries, all)).toMatchObject({ kind: 'exact', entity: { id: 'france' } })
    expect(matchAnswer('USA', countries, all)).toMatchObject({ kind: 'exact', entity: { id: 'united-states' } })
    expect(matchAnswer('ivory coast', countries, all)).toMatchObject({ kind: 'exact', entity: { id: 'cote-d-ivoire' } })
  })
  it('accepts a unique fuzzy match for confirmation', () => {
    expect(matchAnswer('Frnace', countries, all)).toMatchObject({ kind: 'fuzzy', entity: { id: 'france' } })
    expect(matchAnswer('Phillipines', countries, all)).toMatchObject({ kind: 'fuzzy', entity: { id: 'philippines' } })
  })
  it('never guesses between two near entities', () => {
    expect(matchAnswer('Irak', countries, all)).toEqual({ kind: 'unrecognized' }) // Iran and Iraq
  })
  it('treats a real answer outside the set as unrecognized, never fuzzing it onto a set member', () => {
    expect(matchAnswer('Australia', countries, europe)).toEqual({ kind: 'unrecognized' })
    expect(matchAnswer('Austria', countries, europe)).toMatchObject({ kind: 'exact' })
  })
  it('rejects gibberish and short typos', () => {
    expect(matchAnswer('zzzz', countries, all)).toEqual({ kind: 'unrecognized' })
    expect(matchAnswer('', countries, all)).toEqual({ kind: 'unrecognized' })
    expect(matchAnswer('Pru', countries, all)).toEqual({ kind: 'unrecognized' })
  })
  it('resolves an alias shared by two entities only when exactly one is in the set', () => {
    const presidents = loadDataset('us_presidents').entities
    const everyone = new Set(presidents.map((e) => e.id))
    expect(matchAnswer('Bush', presidents, everyone)).toEqual({ kind: 'unrecognized' })
    expect(matchAnswer('Bush', presidents, new Set(['george-w-bush', 'barack-obama']))).toMatchObject({ entity: { id: 'george-w-bush' } })
  })
  it('lets a canonical name win over another entity\'s alias when only it is in the set', () => {
    const zodiac = loadDataset('zodiac').entities
    const chinese = new Set(zodiac.filter((e) => e.tags?.includes('chinese')).map((e) => e.id))
    expect(matchAnswer('goat', zodiac, chinese)).toMatchObject({ kind: 'exact', entity: { id: 'chinese-goat' } })
  })
})
