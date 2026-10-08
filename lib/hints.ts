import fs from 'node:fs'
import path from 'node:path'
import { loadDataset, type Entity } from './content.js'
import { normalize } from './match.js'
import { SeededRng } from './rng.js'

/**
 * Hint clues: short descriptions of individual valid answers that help a player recall one without naming
 * it ("Home of tequila and mariachi; capital Guadalajara"). Hand-written clues live in content/clues/;
 * datasets with useful props (Pokédex numbers, capitals, years) generate theirs here.
 */

export const CLUES_PER_HINT = 3

const CLUE_DIR = path.join(process.cwd(), 'content', 'clues')
const written = new Map<string, Record<string, string>>()
function writtenClues(dataset: string): Record<string, string> {
  if (!written.has(dataset)) {
    const file = path.join(CLUE_DIR, `${dataset}.json`)
    written.set(dataset, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {})
  }
  return written.get(dataset)!
}

const tagValue = (e: Entity, key: string) => e.tags?.find((t) => t.startsWith(`${key}:`))?.slice(key.length + 1)
const has = (e: Entity, tag: string) => e.tags?.includes(tag) ?? false
const prop = <T>(e: Entity, key: string) => e.props?.[key] as T
const title = (s: string) => s.replace(/(^|[\s-])\w/g, (m) => m.toUpperCase())
const ordinal = (n: number): string => `${n}${['th', 'st', 'nd', 'rd'][n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10 <= 3 ? n % 10 : 0]}`
const roman = (n: number) =>
  n === 0 ? '0' : [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((acc, [v, r]) => { while (n >= (v as number)) { acc += r; n -= v as number } return acc }, '')

/** Lookups between datasets, built once: state codes, capitals by country and by state. */
let lookups: { stateByCode: Map<string, string>; capitalByCountry: Map<string, string>; capitalByState: Map<string, string> } | undefined
function lookup() {
  if (!lookups) {
    const stateByCode = new Map<string, string>()
    for (const s of loadDataset('us_states').entities) for (const a of s.aliases ?? []) if (/^[A-Z]{2}$/.test(a)) stateByCode.set(a.toLowerCase(), s.name)
    const capitalByCountry = new Map(loadDataset('world_capitals').entities.map((c) => [prop<string>(c, 'country'), c.name]))
    const capitalByState = new Map(loadDataset('state_capitals').entities.map((c) => [prop<string>(c, 'state'), c.name]))
    lookups = { stateByCode, capitalByCountry, capitalByState }
  }
  return lookups
}

/** "A prime in the 50s": the kind of number and its decade. Naming other numbers would often name answers. */
function numberClue(e: Entity): string {
  const n = prop<number>(e, 'n')
  const multiple = tagValue(e, 'multiple')
  const kind = has(e, 'fibonacci') ? 'Fibonacci number'
    : has(e, 'cube') ? 'perfect cube'
    : has(e, 'square') ? 'perfect square'
    : has(e, 'prime') ? 'prime'
    : multiple ? '' // the question already names the multiple
    : has(e, 'even') ? 'even number' : 'odd number'
  const where = n < 10 ? 'with a single digit' : `in the ${Math.floor(n / 10) * 10}s`
  if (!kind) return `One ${where}`
  return `${/^[aeiou]/.test(kind) ? 'An' : 'A'} ${kind} ${where}`
}

/** Clues built from a dataset's props and tags. Returns undefined when there's nothing useful to say. */
const generators: Record<string, (e: Entity, index: number) => string | undefined> = {
  pokemon_gen1: pokemon,
  pokemon_gen2: pokemon,
  elements: (e) => {
    const kind = ['noble-gas', 'halogen', 'alkali-metal', 'alkaline-earth-metal'].find((t) => has(e, t))
    return `Atomic number ${prop<number>(e, 'number')}${kind ? `, ${kind.replace(/-/g, ' ')}` : has(e, 'gas-at-room-temp') ? ', a gas at room temperature' : ''}`
  },
  us_presidents: (e) => `Took office in ${prop<number>(e, 'start')}${partyOf(e)}`,
  state_capitals: (e) => `Capital of ${prop<string>(e, 'state')}`,
  world_capitals: (e) => `Capital of ${prop<string>(e, 'country')}`,
  countries: (e) => {
    const capital = lookup().capitalByCountry.get(e.name)
    return capital ? `Its capital is ${capital}` : continentClue(e, 'country')
  },
  us_states: (e) => {
    const capital = lookup().capitalByState.get(e.name)
    return `${capital ? `Capital ${capital}; ` : ''}joined the Union in ${prop<number>(e, 'admitted')}`
  },
  olympics: (e) => `First hosted the ${has(e, 'summer') ? 'Summer' : 'Winter'} Olympics in ${prop<number>(e, 'first')}`,
  tarot: (e) => `Major Arcana card ${roman(prop<number>(e, 'num'))}`,
  alphabet: (e) => `The ${ordinal(prop<number>(e, 'pos'))} letter of the alphabet`,
  greek_alphabet: (e) => `The ${ordinal(prop<number>(e, 'pos'))} letter of the Greek alphabet`,
  nato_alphabet: (e) => `Code word for the letter ${String.fromCharCode(64 + prop<number>(e, 'pos'))}`,
  numbers: numberClue,
  si_units: (e) => (prop<number>(e, 'exp') !== undefined ? `Prefix meaning 10^${prop<number>(e, 'exp')}` : undefined),
  national_parks: (e) => {
    const code = tagValue(e, 'state')
    return code ? `A national park in ${lookup().stateByCode.get(code) ?? code.toUpperCase()}` : undefined
  },
}

function pokemon(e: Entity) {
  const types = (e.tags ?? []).filter((t) => t.startsWith('type:')).map((t) => title(t.slice(5)))
  const extra = has(e, 'legendary') ? ', legendary' : has(e, 'baby') ? ', a baby Pokémon' : has(e, 'starter-line') ? ', from a starter line' : ''
  return `#${prop<number>(e, 'dex')}, ${types.join('/')} type${extra}`
}

const PARTIES: Record<string, string> = { dem: 'Democrat', rep: 'Republican', whig: 'Whig', fed: 'Federalist', dr: 'Democratic-Republican', nu: 'National Union' }
function partyOf(e: Entity) {
  const party = PARTIES[tagValue(e, 'party') ?? '']
  return party ? `, ${party}` : ''
}

/** Sports clues lead with the division ("AL East"), since city names are accepted answers. */
function division(e: Entity, dataset: string) {
  const div = tagValue(e, 'div')
  if (!div) return ''
  const words = div.split('-').map((w) => (['al', 'nl', 'afc', 'nfc'].includes(w) ? w.toUpperCase() : title(w)))
  return `${words.join(' ')}${dataset === 'nba' || dataset === 'nhl' ? ' Division' : ''} · `
}

/** Fallbacks for generated clues that would name their own answer ("Capital of Singapore"). */
const fallbacks: Record<string, (e: Entity) => string | undefined> = {
  countries: (e) => continentClue(e, 'country'),
  world_capitals: (e) => continentClue(e, 'capital'),
  us_states: (e) => `Joined the Union in ${prop<number>(e, 'admitted')}`,
}

const CONTINENT_ADJ: Record<string, string> = { africa: 'African', asia: 'Asian', europe: 'European', oceania: 'Oceanian', 'north-america': 'North American', 'south-america': 'South American' }

/** "A landlocked African country". Adjectives, since "North America" would trip on the alias "America". */
function continentClue(e: Entity, what: string) {
  const adj = CONTINENT_ADJ[tagValue(e, 'continent') ?? '']
  return adj ? `A ${has(e, 'landlocked') ? 'landlocked ' : ''}${adj} ${what}` : undefined
}

export function clueFor(dataset: string, e: Entity, index: number): string | undefined {
  const own = writtenClues(dataset)[e.id]
  if (own) {
    if (['mlb', 'nba', 'nfl', 'nhl'].includes(dataset)) return division(e, dataset) + own
    if (dataset.startsWith('pokemon')) return `${own} (#${prop<number>(e, 'dex')})`
    return own
  }
  const clue = generators[dataset]?.(e, index)
  return clue && namesAnswer(clue, phrasesOf(e)) ? fallbacks[dataset]?.(e) : clue
}

/**
 * Every way an answer can be typed, for spotting give-aways. Short letter codes ("IN", "OR", "LA") are
 * matched case-sensitively as whole tokens so ordinary words like "in" don't count; everything else is
 * matched as a whole normalized phrase.
 */
type Phrase = { code: string } | { words: string }
export function phrasesOf(e: Entity): Phrase[] {
  return [e.name, ...(e.alt ?? []), ...(e.aliases ?? [])].flatMap((s): Phrase[] => {
    const words = normalize(s)
    if (!words) return []
    return words.replace(/ /g, '').length <= 2 && /\p{L}/u.test(words) ? [{ code: s.replace(/[^\p{L}\p{N}]/gu, '') }] : [{ words }]
  })
}

/** Whether a clue would hand over one of the given answers. */
export function namesAnswer(clue: string, phrases: Phrase[]) {
  const text = ` ${normalize(clue)} `
  const tokens = new Set(clue.split(/[^\p{L}\p{N}]+/u))
  return phrases.some((p) => ('code' in p ? tokens.has(p.code) : text.includes(` ${p.words} `)))
}

/**
 * Pick clues for up to CLUES_PER_HINT different valid answers. The choice is seeded by date and question,
 * so everyone gets the same clues, and it never looks at the hidden pick. A clue that contains any valid
 * answer's name or alias as a whole phrase is skipped, so a clue never hands over an answer.
 */
export function cluesFor(date: string, questionId: string, datasetId: string, answerIds: string[]): string[] {
  const entities = loadDataset(datasetId).entities
  const byId = new Map(entities.map((e, i) => [e.id, { e, i }]))
  const banned = answerIds.flatMap((id) => phrasesOf(byId.get(id)!.e))
  const rng = new SeededRng(`hint:${date}:${questionId}`)
  const order = [...answerIds]
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.below(i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const clues: string[] = []
  for (const id of order) {
    const { e, i } = byId.get(id)!
    const clue = clueFor(datasetId, e, i)
    if (!clue || namesAnswer(clue, banned)) continue
    clues.push(clue)
    if (clues.length === CLUES_PER_HINT) break
  }
  return clues
}
