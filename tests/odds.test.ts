import { describe, expect, it } from 'vitest'
import { choicesFor, cumulative, winRate } from '../lib/odds'

describe('odds (plan section 2)', () => {
  it('matches the cumulative survival table', () => {
    const cum = cumulative([100, 20, 7, 6], 0.8)
    const plan = [0.99, 0.9405, 0.806, 0.672, 0.537, 0.269, 0.134]
    cum.forEach((p, i) => expect(p).toBeCloseTo(plan[i], 3))
    expect(winRate([100, 20, 7, 6], 0.8)).toBeCloseTo(0.1344, 4)
  })
  it('realizes 0.8 with five choices', () => {
    expect(choicesFor(0.8)).toBe(5)
  })
})
