import type { ActivityMeta, CatalogQuestion, Config, ScheduleDay } from './content.js'
import { daysBetween } from './dates.js'
import { winRate } from './odds.js'
import { SeededRng } from './rng.js'

/**
 * TypeScript port of the day scheduler in scripts/gen_lib.py, used as the server fallback when a day has
 * no schedule file. Keep the two in lockstep: same RNG, same iteration order, same arithmetic.
 */

export const MAX_ATTEMPTS = 500

export interface GenerateInput {
  date: string
  config: Config
  catalog: CatalogQuestion[]
  activities: ActivityMeta[]
  /** Existing schedule days before `date` (any order). */
  history: ScheduleDay[]
}

export function pickActivity(date: string, activities: ActivityMeta[], history: ScheduleDay[], rng: SeededRng): string {
  const ids = activities.filter((a) => a.enabled).map((a) => a.id).sort()
  const lastUsed = new Map<string, number>()
  for (const h of history) {
    const diff = daysBetween(h.date, date)
    if (diff >= 1 && (!lastUsed.has(h.activity) || diff < lastUsed.get(h.activity)!)) lastUsed.set(h.activity, diff)
  }
  const eligible = ids.filter((id) => lastUsed.get(id) !== 1)
  const age = (id: string) => lastUsed.get(id) ?? Number.MAX_SAFE_INTEGER
  const oldest = Math.max(...eligible.map(age))
  const pool = eligible.filter((id) => age(id) === oldest)
  return pool[rng.below(pool.length)]
}

/** Cooldowns to try in order. Level 0 is the real rule; later levels only kick in so the game never goes down. */
export function relaxLevels(config: Config): [number, number][] {
  const ds = config.datasetCooldownDays
  const q = config.questionCooldownDays
  return [
    [ds, q],
    [ds, Math.floor(q / 2)],
    [Math.max(1, ds - 3), Math.floor(q / 3)],
    [1, 7],
  ]
}

function tryGenerate({ date, config, catalog, activities, history }: GenerateInput, level: number): ScheduleDay | null {
  const [datasetCooldown, questionCooldown] = relaxLevels(config)[level]
  const rng = new SeededRng(`${config.generatorSeed}:${date}` + (level ? `:r${level}` : ''))
  const recentDatasets = new Set<string>()
  const recentQuestions = new Set<string>()
  for (const h of history) {
    const diff = daysBetween(h.date, date)
    if (diff < 1) continue
    for (const r of h.rounds) {
      if (diff < datasetCooldown) recentDatasets.add(r.datasetId)
      if (diff < questionCooldown) recentQuestions.add(r.questionId)
    }
  }

  const activity = pickActivity(date, activities, history, rng)

  const sorted = [...catalog].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const pools = config.typedRounds.map((band) => sorted.filter((q) => q.size >= band.min && q.size <= band.max))
  // Round-1 sets are scarce, so lower rounds usually steer clear of datasets that can supply round 1.
  const reserved = new Set(pools[0].map((q) => q.dataset))

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const chosen: CatalogQuestion[] = []
    const used = new Set<string>()
    for (let i = 0; i < pools.length; i++) {
      const prev = chosen[chosen.length - 1]
      let cands = pools[i].filter(
        (q) => !recentDatasets.has(q.dataset) && !used.has(q.dataset) && !recentQuestions.has(q.id) && (!prev || q.size < prev.size),
      )
      if (!cands.length) break
      if (i > 0 && rng.below(4) !== 0) {
        const preferred = cands.filter((q) => !reserved.has(q.dataset))
        if (preferred.length) cands = preferred
      }
      const datasets = [...new Set(cands.map((q) => q.dataset))].sort()
      const ds = datasets[rng.below(datasets.length)]
      let qs = cands.filter((q) => q.dataset === ds)
      // Hand-written filters read better than letter filters; favor them half the time.
      const curated = qs.filter((q) => q.kind === 'curated')
      if (curated.length && rng.below(2) === 0) qs = curated
      const q = qs[rng.below(qs.length)]
      chosen.push(q)
      used.add(ds)
    }
    if (chosen.length !== pools.length) continue
    const wr = winRate(chosen.map((q) => q.size), config.activitySurvival, config.playerHits)
    if (wr < config.winRateGuard[0] || wr > config.winRateGuard[1]) continue
    return {
      date,
      approved: false,
      activity,
      winRate: Math.round(wr * 10000) / 10000,
      ...(level ? { relaxed: level } : {}),
      rounds: chosen.map((q, i) => ({
        round: config.typedRounds[i].round,
        questionId: q.id,
        datasetId: q.dataset,
        prompt: q.prompt,
        size: q.size,
        answers: q.answers,
      })),
    }
  }
  return null
}

export function generateDay(input: GenerateInput): ScheduleDay {
  for (let level = 0; level < relaxLevels(input.config).length; level++) {
    const day = tryGenerate(input, level)
    if (day) return day
  }
  throw new Error(`Could not schedule ${input.date}`)
}
