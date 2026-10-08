import type { PublicRun, Today } from '../types'

export function squares(today: Today, run: PublicRun): string {
  return Array.from({ length: today.rounds.length }, (_, i) => {
    const r = run.results.find((x) => x.round === i + 1)
    if (!r) return '⬛'
    return r.survived ? '🟩' : '🟥'
  }).join('')
}

export function survivedCount(run: PublicRun): number {
  return run.results.filter((r) => r.survived).length
}

/** Title line with the day's villain, one square per round, then the outcome. The activity isn't named. */
export function shareText(today: Today, run: PublicRun): string {
  return [`Can You Survive #${today.puzzle} · vs. ${today.villain.name}`, squares(today, run), outcomeLine(today, run)].join('\n')
}

/** "Beat The Ferryman with 1 heart left" or "Survived 5 of 9". */
export function outcomeLine(today: Today, run: PublicRun): string {
  if (run.status !== 'won') return `Survived ${survivedCount(run)} of ${today.rounds.length}`
  const left = today.health.player - (run.results.length - survivedCount(run))
  return `Beat ${today.villain.name} with ${left} ${left === 1 ? 'heart' : 'hearts'} left`
}

export async function share(text: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = location.origin
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text, url })
      return 'shared'
    } catch {
      /* fall through to copy */
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`)
    return 'copied'
  } catch {
    return 'failed'
  }
}
