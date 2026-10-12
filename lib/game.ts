import { getActivity, loadConfig, loadDataset, villainFor, type Entity, type ScheduleDay } from './content.js'
import { dateInZone, nextMidnight, puzzleNumber } from './dates.js'
import { matchAnswer, normalize } from './match.js'
import { choicesFor } from './odds.js'
import { pickDeadly } from './pick.js'
import { randomToken, secureFloat, secureInt } from './rng.js'
import { getSchedule } from './schedule.js'
import { cluesFor } from './hints.js'
import { getStore, type Submission } from './store.js'

/** Six typed questions, then the activity, RPS and the coin flip. */
export const TYPED_ROUNDS = 6
export const ACTIVITY_ROUND = 7
export const RPS_ROUND = 8
export const COIN_ROUND = 9
export const TOTAL_ROUNDS = COIN_ROUND
export const MAX_CHECKS_PER_ROUND = 40
/** Slack for network latency before a late lock-in counts as out of time. */
const CLOCK_GRACE_MS = 2000
const RUN_TTL = 3 * 86_400
const STATS_TTL = 60 * 86_400
const LOG_TTL = 400 * 86_400

export type RoundKind = 'typed' | 'activity' | 'rps' | 'coin'
export type Throw = 'rock' | 'paper' | 'scissors'
export type Side = 'heads' | 'tails'

export interface RoundResult {
  round: number
  kind: RoundKind
  /** False when the player lost this round, costing a hit. The run only ends once the hits run out. */
  survived: boolean
  /** typed: the player's answer and the villain's hidden answer */
  pick?: string
  answer?: string
  /** typed: the clock ran out before a recognized lock-in */
  reason?: 'time'
  /** activity */
  choice?: number
  deadly?: number
  zoneStart?: number
  zoneWidth?: number
  /** rps, including replayed ties */
  throws?: { player: Throw; site: Throw }[]
  /** coin */
  call?: Side
  flip?: Side
}

export interface Run {
  id: string
  date: string
  createdAt: number
  status: 'playing' | 'dead' | 'won'
  /** Current round, 1-9. Stays at the round where the run ended. */
  round: number
  results: RoundResult[]
  /** When the current typed round's question was first shown (epoch ms). Null until then. */
  roundStartedAt: number | null
  checks: number
  throws: { player: Throw; site: Throw }[]
}

export class GameError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function kindOf(round: number): RoundKind {
  if (round <= TYPED_ROUNDS) return 'typed'
  if (round === ACTIVITY_ROUND) return 'activity'
  if (round === RPS_ROUND) return 'rps'
  return 'coin'
}

export function today(now = new Date()): string {
  const override = process.env.CYS_DATE
  if (override && process.env.NODE_ENV !== 'production') return override
  return dateInZone(now, loadConfig().timezone)
}

const secret = () => {
  const s = process.env.SERVER_SECRET
  if (s) return s
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    throw new GameError(500, 'SERVER_SECRET is not set')
  }
  return 'dev-secret-do-not-use-in-production'
}

/* ---------- public board metadata ---------- */

/**
 * Both health bars. Losing a round costs the player one hit; surviving one costs the boss one. The boss has one
 * health per round, so every run plays all nine; reaching the end with a hit to spare wins and finishes the boss.
 */
export function health() {
  return { player: loadConfig().playerHits, boss: TOTAL_ROUNDS }
}

export function hitsTaken(run: Pick<Run, 'results'>) {
  return run.results.filter((r) => !r.survived).length
}

export function publicToday(date: string) {
  const config = loadConfig()
  const day = getSchedule(date)
  const activity = getActivity(day.activity)
  return {
    date,
    puzzle: puzzleNumber(date, config.launchDate),
    nextResetAt: nextMidnight(date, config.timezone).toISOString(),
    typedRoundSeconds: config.typedRoundSeconds,
    villain: villainFor(date),
    health: health(),
    rounds: [
      // Typed prompts stay hidden until their clock starts (see publicRun), so nobody can read ahead.
      ...day.rounds.map((r) => ({ round: r.round, kind: 'typed' as const })),
      {
        round: ACTIVITY_ROUND,
        kind: 'activity' as const,
        prompt: activity.rule,
        activity: {
          id: activity.id,
          name: activity.name,
          rule: activity.rule,
          interaction: activity.interaction,
          kind: activity.kind,
          choices: choicesFor(config.activitySurvival),
          zoneWidth: Math.round((1 - config.activitySurvival) * 1000) / 1000,
        },
      },
      { round: RPS_ROUND, kind: 'rps' as const, prompt: 'Rock, paper, scissors. Ties replay.' },
      { round: COIN_ROUND, kind: 'coin' as const, prompt: 'Call the coin flip.' },
    ],
  }
}

function deadlineOf(run: Run) {
  return run.roundStartedAt == null ? null : run.roundStartedAt + loadConfig().typedRoundSeconds * 1000
}

export function publicRun(run: Run) {
  const typed = run.status === 'playing' && kindOf(run.round) === 'typed'
  const deadline = typed ? deadlineOf(run) : null
  return {
    date: run.date,
    status: run.status,
    round: run.round,
    results: run.results,
    /** Current typed round only, once its clock has started. */
    prompt: typed && deadline !== null ? getSchedule(run.date).rounds.find((r) => r.round === run.round)?.prompt ?? null : null,
    timeLeftMs: deadline === null ? null : Math.max(0, deadline - Date.now()),
    pendingThrows: run.throws,
    answerSets: run.status === 'playing' ? null : answerSets(run),
  }
}

/**
 * Every typed question of the day with all its valid answers, including rounds this run never reached.
 * Only sent once the run is over. The hidden pick of an unreached round is never included: it's the same
 * for everyone today, so revealing it would let an early loser tip off other players.
 */
function answerSets(run: Run) {
  return getSchedule(run.date).rounds.map((sr) => {
    const entities = loadDataset(sr.datasetId).entities
    const names = sr.answers.map((id) => nameOf(entities, id)).sort((a, b) => a.localeCompare(b))
    return { round: sr.round, prompt: sr.prompt, names, reached: run.results.some((r) => r.round === sr.round) }
  })
}

/* ---------- runs ---------- */

const runKey = (date: string, token: string) => `run:${date}:${token}`

export function validToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(token)
}

export async function startOrResume(token: string | undefined, date: string) {
  const store = getStore()
  if (!validToken(token)) token = randomToken()
  const existing = await store.getJson<Run>(runKey(date, token))
  if (existing) return { token, run: existing, created: false }
  const run: Run = {
    id: randomToken(12),
    date,
    createdAt: Date.now(),
    status: 'playing',
    round: 1,
    results: [],
    roundStartedAt: null,
    checks: 0,
    throws: [],
  }
  await store.setJson(runKey(date, token), run, RUN_TTL)
  await store.hincr(`stats:${date}`, 'started', STATS_TTL)
  return { token, run, created: true }
}

/** Dev only (served by server/dev.ts, never deployed): forget today's run for this token. */
export async function resetRun(token: string | undefined, date: string) {
  if (validToken(token)) await getStore().setJson(runKey(date, token), null, 1)
}

/** Load the run and hold a short per-run lock so parallel requests cannot race a lock-in. */
export async function withRun<T>(token: string | undefined, date: string, fn: (run: Run) => Promise<T>): Promise<T> {
  if (!validToken(token)) throw new GameError(401, 'No run. Start one first.')
  const store = getStore()
  const key = runKey(date, token)
  if (!(await store.acquire(`lock:${key}`, 10))) throw new GameError(409, 'Busy, try again.')
  try {
    const run = await store.getJson<Run>(key)
    if (!run) throw new GameError(404, 'No run for today. Start one first.')
    const out = await fn(run)
    await store.setJson(key, run, RUN_TTL)
    return out
  } finally {
    await store.release(`lock:${key}`)
  }
}

function assertPlaying(run: Run, kind: RoundKind) {
  if (run.status !== 'playing') throw new GameError(409, 'This run is over. Come back tomorrow.')
  if (kindOf(run.round) !== kind) throw new GameError(409, `Round ${run.round} is not a ${kind} round.`)
}

async function finishRound(run: Run, result: RoundResult) {
  const store = getStore()
  run.results.push(result)
  run.roundStartedAt = null
  run.checks = 0
  run.throws = []
  if (hitsTaken(run) >= health().player) {
    run.status = 'dead'
    await store.hincr(`stats:${run.date}`, `died:${run.round}`, STATS_TTL)
  } else if (run.round === TOTAL_ROUNDS) {
    run.status = 'won'
    await store.hincr(`stats:${run.date}`, 'won', STATS_TTL)
  } else {
    run.round += 1
  }
}

/* ---------- typed rounds ---------- */

function typedContext(run: Run, day: ScheduleDay) {
  const sr = day.rounds.find((r) => r.round === run.round)
  if (!sr) throw new GameError(500, `No question for round ${run.round}`)
  const dataset = loadDataset(sr.datasetId)
  return { sr, dataset, valid: new Set(sr.answers) }
}

function nameOf(entities: Entity[], id: string) {
  return entities.find((e) => e.id === id)?.name ?? id
}

async function logSubmission(run: Run, event: Submission['event'], raw: string, entityId: string | null) {
  const sub: Submission = {
    runId: run.id,
    date: run.date,
    round: run.round,
    event,
    rawInput: raw,
    normalized: normalize(raw),
    entityId,
    ts: Date.now(),
  }
  await getStore().push(`subs:${run.date}`, sub, LOG_TTL)
}

/** Start the current typed round's clock and reveal its prompt. Idempotent, so a refresh never resets it. */
export async function startTyped(run: Run) {
  assertPlaying(run, 'typed')
  run.roundStartedAt ??= Date.now()
  return { run: publicRun(run) }
}

/** Ends the round as lost when the clock (plus grace) has run out. Returns null while time remains. */
async function expireIfLate(run: Run, graceMs: number) {
  const deadline = deadlineOf(run)
  if (deadline === null) throw new GameError(409, 'This round has not started.')
  if (Date.now() <= deadline + graceMs) return null
  const { sr, dataset } = typedContext(run, getSchedule(run.date))
  const deadly = pickDeadly(sr, { date: run.date, secret: secret() })
  const result: RoundResult = { round: run.round, kind: 'typed', survived: false, reason: 'time', answer: nameOf(dataset.entities, deadly) }
  await finishRound(run, result)
  return { result: 'timeout' as const, outcome: result, run: publicRun(run) }
}

/** The client's clock hit zero. Allows a little early so a fast client clock still resolves. */
export async function timeoutTyped(run: Run) {
  assertPlaying(run, 'typed')
  const out = await expireIfLate(run, -CLOCK_GRACE_MS)
  if (!out) throw new GameError(409, 'There is still time on the clock.')
  return out
}

export async function checkTyped(run: Run, input: unknown) {
  assertPlaying(run, 'typed')
  if (typeof input !== 'string' || input.length > 120) throw new GameError(400, 'Bad input')
  const late = await expireIfLate(run, CLOCK_GRACE_MS)
  if (late) return late
  if (run.checks >= MAX_CHECKS_PER_ROUND) throw new GameError(429, 'Too many tries this round.')
  run.checks += 1

  const day = getSchedule(run.date)
  const { dataset, valid } = typedContext(run, day)
  const m = matchAnswer(input, dataset.entities, valid)
  await logSubmission(run, 'check', input, m.kind === 'unrecognized' ? null : m.entity.id)

  // Unrecognized answers cost nothing but time.
  if (m.kind === 'unrecognized') return { result: 'unrecognized' as const, run: publicRun(run) }
  return { result: m.kind === 'exact' ? ('ok' as const) : ('confirm' as const), display: m.entity.name, run: publicRun(run) }
}

export async function lockTyped(run: Run, input: unknown) {
  assertPlaying(run, 'typed')
  if (typeof input !== 'string' || input.length > 120) throw new GameError(400, 'Bad input')
  const late = await expireIfLate(run, CLOCK_GRACE_MS)
  if (late) return late
  const day = getSchedule(run.date)
  const { sr, dataset, valid } = typedContext(run, day)
  const m = matchAnswer(input, dataset.entities, valid)
  await logSubmission(run, 'lock', input, m.kind === 'unrecognized' ? null : m.entity.id)

  if (m.kind === 'unrecognized') return { result: 'unrecognized' as const, run: publicRun(run) }
  // The secret is consulted only here, at lock-in.
  const deadly = pickDeadly(sr, { date: run.date, secret: secret() })
  const survived = m.entity.id !== deadly
  const result: RoundResult = { round: run.round, kind: 'typed', survived, pick: m.entity.name, answer: nameOf(dataset.entities, deadly) }
  await finishRound(run, result)
  return { result: 'locked' as const, outcome: result, run: publicRun(run) }
}

/**
 * A hint that helps without naming any answer: clues describing a few valid answers ("Home of tequila and
 * mariachi; capital Guadalajara"), plus the letters the answers start with. When every answer shares a
 * first letter (a "starts with M" question), it gives the first two letters instead. Free, and never
 * touches the hidden pick.
 */
export async function hintTyped(run: Run) {
  assertPlaying(run, 'typed')
  if (deadlineOf(run) === null) throw new GameError(409, 'This round has not started.')
  const { sr, dataset } = typedContext(run, getSchedule(run.date))
  const keys = sr.answers.map((id) => normalize(nameOf(dataset.entities, id)).replace(/ /g, '').toUpperCase())
  const prefixes = (n: number) => [...new Set(keys.map((k) => k.slice(0, n)))].sort()
  const first = prefixes(1)
  const startsWith = first.length > 1 ? first : prefixes(2)
  // Short answers (letters, small numbers) would be listed outright, so drop the letters for those.
  const givesAway = startsWith.some((p) => keys.includes(p))
  return { hint: { clues: cluesFor(run.date, sr.questionId, sr.datasetId, sr.answers), startsWith: givesAway ? null : startsWith } }
}

/* ---------- activity, rps, coin ---------- */

export async function lockActivity(run: Run, choice: unknown) {
  assertPlaying(run, 'activity')
  const config = loadConfig()
  const activity = getActivity(getSchedule(run.date).activity)
  const p = config.activitySurvival
  let result: RoundResult

  if (activity.kind === 'choice') {
    const n = choicesFor(p)
    if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice >= n) throw new GameError(400, 'Bad choice')
    const deadly = secureInt(n)
    result = { round: ACTIVITY_ROUND, kind: 'activity', survived: choice !== deadly, choice, deadly }
  } else {
    if (typeof choice !== 'number' || !Number.isFinite(choice) || choice < 0 || choice >= 1) throw new GameError(400, 'Bad choice')
    const width = Math.round((1 - p) * 1e9) / 1e9
    const zoneStart = secureFloat()
    const offset = (((choice - zoneStart) % 1) + 1) % 1
    result = { round: ACTIVITY_ROUND, kind: 'activity', survived: offset >= width, choice, zoneStart, zoneWidth: width }
  }
  await finishRound(run, result)
  return { result: 'locked' as const, outcome: result, run: publicRun(run) }
}

const THROWS: Throw[] = ['rock', 'paper', 'scissors']
const BEATS: Record<Throw, Throw> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }

export async function lockRps(run: Run, playerThrow: unknown) {
  assertPlaying(run, 'rps')
  if (!THROWS.includes(playerThrow as Throw)) throw new GameError(400, 'Bad throw')
  const player = playerThrow as Throw
  const site = THROWS[secureInt(3)]
  run.throws.push({ player, site })
  if (player === site) return { result: 'tie' as const, throw: { player, site }, run: publicRun(run) }
  const result: RoundResult = { round: RPS_ROUND, kind: 'rps', survived: BEATS[player] === site, throws: [...run.throws] }
  await finishRound(run, result)
  return { result: 'locked' as const, outcome: result, run: publicRun(run) }
}

export async function lockCoin(run: Run, call: unknown) {
  assertPlaying(run, 'coin')
  if (call !== 'heads' && call !== 'tails') throw new GameError(400, 'Bad call')
  const flip: Side = secureInt(2) === 0 ? 'heads' : 'tails'
  const result: RoundResult = { round: COIN_ROUND, kind: 'coin', survived: call === flip, call, flip }
  await finishRound(run, result)
  return { result: 'locked' as const, outcome: result, run: publicRun(run) }
}

/* ---------- stats ---------- */

export async function statsFor(date: string) {
  const h = await getStore().hgetall(`stats:${date}`)
  return {
    date,
    started: h.started ?? 0,
    won: h.won ?? 0,
    deaths: Array.from({ length: TOTAL_ROUNDS }, (_, i) => h[`died:${i + 1}`] ?? 0),
  }
}
