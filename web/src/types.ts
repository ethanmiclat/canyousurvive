import type { Villain } from '../../lib/content'
import type { RoundResult } from '../../lib/game'

export type { RoundResult, Villain }

export interface ActivityInfo {
  id: string
  name: string
  rule: string
  interaction: string
  kind: 'choice' | 'continuous'
  choices: number
  zoneWidth: number
}

export type RoundMeta =
  | { round: number; kind: 'typed' }
  | { round: number; kind: 'activity'; prompt: string; activity: ActivityInfo }
  | { round: number; kind: 'rps'; prompt: string }
  | { round: number; kind: 'coin'; prompt: string }

export interface Today {
  date: string
  puzzle: number
  nextResetAt: string
  typedRoundSeconds: number
  villain: Villain
  /** Hits each side can take: losing a round costs the player one, surviving one costs the boss one. */
  health: { player: number; boss: number }
  rounds: RoundMeta[]
}

export interface PublicRun {
  date: string
  status: 'playing' | 'dead' | 'won'
  round: number
  results: RoundResult[]
  /** Current typed round only, once its clock has started. */
  prompt: string | null
  timeLeftMs: number | null
  pendingThrows: { player: string; site: string }[]
  /** Every valid answer for the typed rounds reached. Null until the run is over. */
  answerSets: { round: number; prompt: string; names: string[]; reached: boolean }[] | null
}

/** A typed round's hint: clues describing a few valid answers, plus first letters (null when those would give answers away). */
export interface Hint {
  clues: string[]
  startsWith: string[] | null
}

export interface Stats {
  date: string
  started: number
  won: number
  deaths: number[]
}

export interface RunResponse {
  token: string
  today: Today
  run: PublicRun
  stats: Stats | null
}

export interface CheckResponse {
  result: 'ok' | 'confirm' | 'unrecognized' | 'timeout'
  display?: string
  /** Set when the clock had already run out. */
  outcome?: RoundResult
  run: PublicRun
}

export interface LockResponse {
  result: 'locked' | 'tie' | 'unrecognized' | 'timeout'
  outcome?: RoundResult
  throw?: { player: string; site: string }
  run: PublicRun
  stats: Stats | null
}
