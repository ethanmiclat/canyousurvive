import fs from 'node:fs'
import path from 'node:path'

const CONTENT_DIR = path.join(process.cwd(), 'content')

export interface TypedRoundBand {
  round: number
  min: number
  max: number
}

export interface Config {
  launchDate: string
  timezone: string
  typedRounds: TypedRoundBand[]
  activitySurvival: number
  /** Rounds a player can lose before the run ends. */
  playerHits: number
  winRateGuard: [number, number]
  datasetCooldownDays: number
  questionCooldownDays: number
  aheadDays: number
  /** Time limit for each typed round, from the moment its question is shown. */
  typedRoundSeconds: number
  generatorSeed: string
}

export interface Entity {
  id: string
  name: string
  /** Alternate full names. Used for matching and for letter filters. */
  alt?: string[]
  /** Short forms and abbreviations. Used for matching only. */
  aliases?: string[]
  tags?: string[]
  props?: Record<string, unknown>
}

export interface Dataset {
  id: string
  title: string
  entities: Entity[]
}

export interface CatalogQuestion {
  id: string
  dataset: string
  kind: 'curated' | 'letters'
  prompt: string
  size: number
  answers: string[]
}

export interface ActivityMeta {
  id: string
  name: string
  interaction: string
  kind: 'choice' | 'continuous'
  rule: string
  enabled: boolean
}

export interface Villain {
  weekday: number
  id: string
  /** Starts a sentence ("The Reaper"). */
  name: string
  /** Mid-sentence ("the Reaper"). */
  ref: string
  color: string
  deathStamp: string
  /** Shown when the boss is revealed after Play. */
  greeting: string
  taunts: string[]
  jeers: string[]
}

export interface ScheduleRound {
  round: number
  questionId: string
  datasetId: string
  prompt: string
  size: number
  answers: string[]
}

export interface ScheduleDay {
  date: string
  approved?: boolean
  activity: string
  winRate: number
  /** Set when the generator had to relax cooldowns to fill the day. */
  relaxed?: number
  rounds: ScheduleRound[]
  source?: 'file' | 'fallback'
}

function readJson<T>(...parts: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, ...parts), 'utf8')) as T
}

let config: Config | undefined
export function loadConfig(): Config {
  return (config ??= readJson<Config>('config.json'))
}

let activities: ActivityMeta[] | undefined
export function loadActivities(): ActivityMeta[] {
  return (activities ??= readJson<{ activities: ActivityMeta[] }>('activities.json').activities)
}

export function getActivity(id: string): ActivityMeta {
  const a = loadActivities().find((x) => x.id === id)
  if (!a) throw new Error(`Unknown activity ${id}`)
  return a
}

let villains: Villain[] | undefined
/** The day's villain, one per weekday. */
export function villainFor(date: string): Villain {
  villains ??= readJson<{ villains: Villain[] }>('villains.json').villains
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const v = villains.find((x) => x.weekday === weekday)
  if (!v) throw new Error(`No villain for weekday ${weekday}`)
  return v
}

const datasets = new Map<string, Dataset>()
export function loadDataset(id: string): Dataset {
  let ds = datasets.get(id)
  if (!ds) {
    if (!/^[a-z0-9_]+$/.test(id)) throw new Error(`Bad dataset id ${id}`)
    ds = readJson<Dataset>('datasets', `${id}.json`)
    datasets.set(id, ds)
  }
  return ds
}

let catalog: CatalogQuestion[] | undefined
export function loadCatalog(): CatalogQuestion[] {
  return (catalog ??= readJson<{ questions: CatalogQuestion[] }>('catalog.json').questions)
}

const scheduleFiles = new Map<string, ScheduleDay | null>()
export function readScheduleFile(date: string): ScheduleDay | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Bad date ${date}`)
  if (!scheduleFiles.has(date)) {
    const file = path.join(CONTENT_DIR, 'schedule', `${date}.json`)
    const day = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as ScheduleDay) : null
    scheduleFiles.set(date, day)
  }
  return scheduleFiles.get(date) ?? null
}
