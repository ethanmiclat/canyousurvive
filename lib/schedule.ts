import { loadActivities, loadCatalog, loadConfig, readScheduleFile, type ScheduleDay } from './content.js'
import { addDays } from './dates.js'
import { generateDay } from './scheduler.js'

const fallbackCache = new Map<string, ScheduleDay>()

/** The day's board: the generated schedule file, or a seeded fallback so the game never goes down. */
export function getSchedule(date: string): ScheduleDay {
  const file = readScheduleFile(date)
  if (file) return { ...file, source: 'file' }

  let day = fallbackCache.get(date)
  if (!day) {
    const config = loadConfig()
    const history: ScheduleDay[] = []
    for (let i = 1; i < config.questionCooldownDays; i++) {
      const h = readScheduleFile(addDays(date, -i))
      if (h) history.push(h)
    }
    day = { ...generateDay({ date, config, catalog: loadCatalog(), activities: loadActivities(), history }), source: 'fallback' }
    fallbackCache.set(date, day)
    console.warn(`[schedule] no schedule file for ${date}; using seeded fallback`)
  }
  return day
}
