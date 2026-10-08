/**
 * Survival math. The typed rounds come first (n valid answers, one deadly), then the activity, RPS and coin.
 * A lost round costs one hit; a run survives while it has lost fewer than `hits` rounds.
 */

export const RPS_SURVIVAL = 0.5 // ties replay, so P(win) = 1/3 / (1/3 + 1/3)
export const COIN_SURVIVAL = 0.5

export function typedSurvival(size: number): number {
  return 1 - 1 / size
}

export function roundSurvivals(typedSizes: number[], activitySurvival: number): number[] {
  return [...typedSizes.map(typedSurvival), activitySurvival, RPS_SURVIVAL, COIN_SURVIVAL]
}

/** Chance of finishing with fewer than `hits` rounds lost, computed in round order (kept identical to scripts/gen_lib.py). */
export function winRate(typedSizes: number[], activitySurvival: number, hits = 1): number {
  // dist[k]: chance of having lost exactly k rounds so far
  const dist = [1, ...Array<number>(hits - 1).fill(0)]
  for (const s of roundSurvivals(typedSizes, activitySurvival)) {
    for (let k = hits - 1; k >= 0; k--) dist[k] = dist[k] * s + (k > 0 ? dist[k - 1] * (1 - s) : 0)
  }
  let total = 0
  for (const v of dist) total += v
  return total
}

/** Chance of getting through each round without losing any. */
export function cumulative(typedSizes: number[], activitySurvival: number): number[] {
  const out: number[] = []
  let p = 1
  for (const s of roundSurvivals(typedSizes, activitySurvival)) out.push((p *= s))
  return out
}

/** Number of equal choices that realizes a survival chance with one deadly choice (0.8 -> 5). */
export function choicesFor(survival: number): number {
  return Math.round(1 / (1 - survival))
}
