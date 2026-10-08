/** v1 streaks live in localStorage (plan section 10). Accounts and a winners wall come later. */

export interface Streak {
  lastDate: string | null
  current: number
  best: number
  played: number
  wins: number
}

const KEY = 'cys_streak'
const EMPTY: Streak = { lastDate: null, current: 0, best: 0, played: 0, wins: 0 }

export function readStreak(): Streak {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return EMPTY
  }
}

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** Record a finished run once per date. Returns the updated streak. */
export function recordFinish(date: string, won: boolean): Streak {
  const s = readStreak()
  if (s.lastDate === date) return s
  const current = s.lastDate === dayBefore(date) ? s.current + 1 : 1
  const next: Streak = {
    lastDate: date,
    current,
    best: Math.max(s.best, current),
    played: s.played + 1,
    wins: s.wins + (won ? 1 : 0),
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage blocked */
  }
  return next
}
