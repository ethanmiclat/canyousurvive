import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { loadActivities, loadCatalog, loadConfig, readScheduleFile, type ScheduleDay } from '../lib/content'
import { addDays, daysBetween } from '../lib/dates'
import { winRate } from '../lib/odds'
import { pickDeadly } from '../lib/pick'
import { generateDay } from '../lib/scheduler'

function history(date: string): ScheduleDay[] {
  const out: ScheduleDay[] = []
  for (let i = 1; i < loadConfig().questionCooldownDays; i++) {
    const h = readScheduleFile(addDays(date, -i))
    if (h) out.push(h)
  }
  return out
}

function pythonDay(date: string) {
  const out = execFileSync('python3', ['scripts/generate.py', '--date', date, '--dry-run', '--overwrite'], { encoding: 'utf8' })
  return JSON.parse(out)
}

describe('fallback scheduler', () => {
  for (const date of ['2026-10-20', '2026-12-06', '2026-12-20', '2027-02-01']) {
    it(`matches the Python generator on ${date}`, () => {
      const ts = generateDay({ date, config: loadConfig(), catalog: loadCatalog(), activities: loadActivities(), history: history(date) })
      const py = pythonDay(date)
      expect(ts.activity).toBe(py.activity)
      expect(ts.rounds.map((r) => r.questionId)).toEqual(py.rounds.map((r: { questionId: string }) => r.questionId))
      expect(ts.relaxed ?? 0).toBe(py.relaxed ?? 0)
    })
  }

  it('produces a valid day', () => {
    const config = loadConfig()
    const date = '2026-12-06'
    const day = generateDay({ date, config, catalog: loadCatalog(), activities: loadActivities(), history: history(date) })
    const sizes = day.rounds.map((r) => r.size)
    day.rounds.forEach((r, i) => {
      expect(r.size).toBeGreaterThanOrEqual(config.typedRounds[i].min)
      expect(r.size).toBeLessThanOrEqual(config.typedRounds[i].max)
      if (i) expect(r.size).toBeLessThan(sizes[i - 1])
    })
    expect(new Set(day.rounds.map((r) => r.datasetId)).size).toBe(config.typedRounds.length)
    const wr = winRate(sizes, config.activitySurvival, config.playerHits)
    expect(wr).toBeGreaterThanOrEqual(config.winRateGuard[0])
    expect(wr).toBeLessThanOrEqual(config.winRateGuard[1])
    const yesterday = readScheduleFile(addDays(date, -1))
    expect(day.activity).not.toBe(yesterday?.activity)
    expect(daysBetween('2026-12-05', date)).toBe(1)
  })
})

describe('pickDeadly', () => {
  const q = { questionId: 'countries:all', answers: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }
  it('is the same for everyone on a day and lands in the set', () => {
    const one = pickDeadly(q, { date: '2026-10-07', secret: 's' })
    expect(pickDeadly({ ...q, answers: [...q.answers].reverse() }, { date: '2026-10-07', secret: 's' })).toBe(one)
    expect(q.answers).toContain(one)
  })
  it('is roughly uniform across days', () => {
    const counts = new Map<string, number>()
    for (let i = 0; i < 7000; i++) {
      const p = pickDeadly(q, { date: addDays('2026-01-01', i), secret: 's' })
      counts.set(p, (counts.get(p) ?? 0) + 1)
    }
    for (const c of counts.values()) expect(Math.abs(c - 1000)).toBeLessThan(150)
  })
})
