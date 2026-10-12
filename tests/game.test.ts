import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDataset } from '../lib/content'
import { ACTIVITY_ROUND, checkTyped, hintTyped, lockActivity, lockCoin, lockRps, lockTyped, startOrResume, startTyped, statsFor, timeoutTyped, withRun, type Run } from '../lib/game'
import { pickDeadly } from '../lib/pick'
import { getSchedule } from '../lib/schedule'
import { memoryStore, setStore } from '../lib/store'

const DATE = '2026-10-07'
const SECRET = 'dev-secret-do-not-use-in-production'

beforeEach(() => setStore(memoryStore()))
afterEach(() => vi.useRealTimers())

function safeAndDeadly(round: number) {
  const r = getSchedule(DATE).rounds[round - 1]
  const ds = loadDataset(r.datasetId)
  const deadly = pickDeadly(r, { date: DATE, secret: SECRET })
  const safe = r.answers.find((a) => a !== deadly)!
  const name = (id: string) => ds.entities.find((e) => e.id === id)!.name
  return { safe: name(safe), deadly: name(deadly) }
}

async function play(token: string, fn: (run: Run) => Promise<unknown>) {
  return withRun(token, DATE, fn) as Promise<any>
}

/** Start the current typed round's clock, then run fn. */
async function typed(token: string, fn: (run: Run) => Promise<unknown>) {
  await play(token, (run) => startTyped(run))
  return play(token, fn)
}

describe('run lifecycle', () => {
  it('starts once per token per day and resumes', async () => {
    const a = await startOrResume(undefined, DATE)
    const b = await startOrResume(a.token, DATE)
    expect(b.created).toBe(false)
    expect(b.run.id).toBe(a.run.id)
    expect((await statsFor(DATE)).started).toBe(1)
  })

  it('survives typed rounds with safe answers, takes two hits, and dies on the third', async () => {
    const { token } = await startOrResume(undefined, DATE)
    for (const round of [1, 2]) {
      const { safe } = safeAndDeadly(round)
      const check = await typed(token, (run) => checkTyped(run, safe))
      expect(check.result).toBe('ok')
      const lock = await play(token, (run) => lockTyped(run, safe))
      expect(lock.outcome.survived).toBe(true)
      expect(lock.run.round).toBe(round + 1)
      expect(lock.run.answerSets).toBeNull()
    }
    // The first two lost rounds cost a hit each, and the run goes on.
    for (const round of [3, 4]) {
      const hit = await typed(token, (run) => lockTyped(run, safeAndDeadly(round).deadly))
      expect(hit.outcome.survived).toBe(false)
      expect(hit.run).toMatchObject({ status: 'playing', round: round + 1, answerSets: null })
    }
    const { deadly } = safeAndDeadly(5)
    const lock = await typed(token, (run) => lockTyped(run, deadly))
    expect(lock.outcome).toMatchObject({ survived: false, pick: deadly, answer: deadly })
    expect(lock.run.status).toBe('dead')
    expect(lock.run.answerSets.map((a: { round: number }) => a.round)).toEqual([1, 2, 3, 4, 5, 6])
    expect(lock.run.answerSets[4].names).toHaveLength(getSchedule(DATE).rounds[4].answers.length)
    expect(lock.run.answerSets[4].names).toContain(deadly)
    expect((await statsFor(DATE)).deaths).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0])
    await expect(play(token, (run) => lockTyped(run, deadly))).rejects.toThrow(/over/)
  })

  it('shows every question and answer list after an early death, without unreached picks', async () => {
    const { token } = await startOrResume(undefined, DATE)
    for (const round of [1, 2]) await typed(token, (run) => lockTyped(run, safeAndDeadly(round).deadly))
    const lock = await typed(token, (run) => lockTyped(run, safeAndDeadly(3).deadly))
    expect(lock.run.status).toBe('dead')
    expect(lock.run.answerSets.map((a: { round: number; reached: boolean }) => [a.round, a.reached])).toEqual([[1, true], [2, true], [3, true], [4, false], [5, false], [6, false]])
    const unreached = JSON.stringify(lock.run.answerSets.slice(3))
    expect(unreached).not.toMatch(/answer|deadly|pick/)
  })

  it('check responses never depend on the hidden answer', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-07T15:00:00Z') })
    const { token } = await startOrResume(undefined, DATE)
    await play(token, (run) => startTyped(run))
    const { safe, deadly } = safeAndDeadly(1)
    const a = await play(token, (run) => checkTyped(run, safe))
    const b = await play(token, (run) => checkTyped(run, deadly))
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
    expect(a.result).toBe(b.result)
    expect(a.run).toEqual(b.run)
  })

  it('hides the prompt until the clock starts, and a refresh keeps the clock', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-07T15:00:00Z') })
    const { token } = await startOrResume(undefined, DATE)
    await expect(play(token, (run) => checkTyped(run, 'x'))).rejects.toThrow(/not started/)
    const a = await play(token, (run) => startTyped(run))
    expect(a.run.prompt).toBe(getSchedule(DATE).rounds[0].prompt)
    expect(a.run.timeLeftMs).toBe(30_000)
    vi.advanceTimersByTime(10_000)
    const b = await play(token, (run) => startTyped(run))
    expect(b.run.timeLeftMs).toBe(20_000)
  })

  it('unrecognized answers are free, running out of time loses the round', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-07T15:00:00Z') })
    const { token } = await startOrResume(undefined, DATE)
    await play(token, (run) => startTyped(run))
    for (let i = 0; i < 5; i++) {
      const r = await play(token, (run) => checkTyped(run, 'qwxzv'))
      expect(r).toMatchObject({ result: 'unrecognized', run: { status: 'playing' } })
    }
    vi.advanceTimersByTime(20_000)
    await expect(play(token, (run) => timeoutTyped(run))).rejects.toThrow(/still time/)
    vi.advanceTimersByTime(10_000)
    const out = await play(token, (run) => timeoutTyped(run))
    expect(out.run).toMatchObject({ status: 'playing', round: 2 })
    expect(out.outcome).toMatchObject({ survived: false, reason: 'time' })
  })

  it('a lock-in after the deadline (plus grace) is out of time', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-07T15:00:00Z') })
    const { token } = await startOrResume(undefined, DATE)
    const { safe } = safeAndDeadly(1)
    await play(token, (run) => startTyped(run))
    vi.advanceTimersByTime(31_000)
    const ok = await play(token, (run) => checkTyped(run, safe))
    expect(ok.result).toBe('ok')
    vi.advanceTimersByTime(2_000)
    const late = await play(token, (run) => lockTyped(run, safe))
    expect(late).toMatchObject({ result: 'timeout', outcome: { reason: 'time' }, run: { status: 'playing', round: 2 } })
  })

  it('hints at the set, count and first letters without naming an answer', async () => {
    const { token } = await startOrResume(undefined, DATE)
    await expect(play(token, (run) => hintTyped(run))).rejects.toThrow(/not started/)
    await play(token, (run) => startTyped(run))
    const { hint } = await play(token, (run) => hintTyped(run))
    const r = getSchedule(DATE).rounds[0]
    const ds = loadDataset(r.datasetId)
    expect(hint.clues).toHaveLength(3)
    // No clue contains any valid answer's name or alias.
    const phrases = r.answers.flatMap((id) => { const e = ds.entities.find((x) => x.id === id)!; return [e.name, ...(e.alt ?? []), ...(e.aliases ?? [])] })
    for (const clue of hint.clues) for (const p of phrases) if (p.length > 2) expect(clue.toLowerCase()).not.toContain(p.toLowerCase())
    const names = r.answers.map((id) => ds.entities.find((e) => e.id === id)!.name.toUpperCase())
    expect(hint.startsWith.length).toBeGreaterThan(0)
    for (const p of hint.startsWith) expect(names).not.toContain(p)
    expect(names.every((n) => hint.startsWith.some((p: string) => n.replace(/[^A-Z0-9]/g, '').startsWith(p)))).toBe(true)
  })

  it('plays activity, rps and coin rounds to an outcome', async () => {
    const { token } = await startOrResume(undefined, DATE)
    // Two hits early, so every later round matters and the coin flip is reached.
    for (const round of [1, 2]) await typed(token, (run) => lockTyped(run, safeAndDeadly(round).deadly))
    for (const round of [3, 4, 5, 6]) {
      const { safe } = safeAndDeadly(round)
      await typed(token, (run) => lockTyped(run, safe))
    }
    const act = await play(token, (run) => lockActivity(run, 0.5))
    expect(act.outcome.round).toBe(ACTIVITY_ROUND)
    if (!act.outcome.survived) return expect(act.run.status).toBe('dead')
    let rps
    do rps = await play(token, (run) => lockRps(run, 'rock'))
    while (rps.result === 'tie')
    expect(rps.outcome.throws.at(-1).player).toBe('rock')
    if (!rps.outcome.survived) return expect(rps.run.status).toBe('dead')
    const coin = await play(token, (run) => lockCoin(run, 'heads'))
    expect(coin.outcome.round).toBe(9)
    expect(coin.run.status).toBe(coin.outcome.survived ? 'won' : 'dead')
  })

  it('a flawless run still plays every round', async () => {
    const { token } = await startOrResume(undefined, DATE)
    for (const round of [1, 2, 3, 4, 5, 6]) await typed(token, (run) => lockTyped(run, safeAndDeadly(round).safe))
    const act = await play(token, (run) => lockActivity(run, 0.5))
    // Win or lose, the activity can't end the run: at most it's the first hit, and RPS comes next.
    expect(act.run).toMatchObject({ status: 'playing', round: 8 })
  })

  for (const [kind, date] of [['continuous', '2026-10-07'], ['choice', '2026-10-08']] as const) {
    it(`realizes the activity survival chance (${kind})`, async () => {
      expect(getSchedule(date).activity).toBe(kind === 'continuous' ? 'stop-the-needle' : 'poison-cups')
      let survived = 0
      const N = 4000
      for (let i = 0; i < N; i++) {
        const run = { status: 'playing', round: ACTIVITY_ROUND, results: [], date, throws: [], roundStartedAt: null, checks: 0 } as unknown as Run
        const r = await lockActivity(run, kind === 'choice' ? i % 5 : Math.random())
        if (r.outcome.survived) survived++
      }
      expect(Math.abs(survived / N - 0.8)).toBeLessThan(0.03)
    })
  }
})
