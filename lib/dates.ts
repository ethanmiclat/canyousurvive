/** Date helpers. Dates are 'YYYY-MM-DD' strings in the game's timezone. */

export function dateInZone(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** The UTC instant at which `date + 1` starts in `timeZone`. */
export function nextMidnight(date: string, timeZone: string): Date {
  const next = addDays(date, 1)
  const [y, m, d] = next.split('-').map(Number)
  // Try every whole-hour offset from UTC-12 to UTC+14; pick the instant whose local time is 00:00 on `next`.
  for (let h = -14; h <= 12; h++) {
    const t = new Date(Date.UTC(y, m - 1, d) - h * 3_600_000)
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(t)
    const get = (type: string) => parts.find((p) => p.type === type)?.value
    if (`${get('year')}-${get('month')}-${get('day')}` === next && get('hour') === '00' && get('minute') === '00') return t
  }
  throw new Error(`Could not find midnight for ${next} in ${timeZone}`)
}

export function puzzleNumber(date: string, launchDate: string): number {
  return daysBetween(launchDate, date) + 1
}
