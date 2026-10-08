import type { CheckResponse, Hint, LockResponse, PublicRun, RunResponse, Stats } from './types'

const TOKEN_KEY = 'cys_token'

function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = storedToken()
  if (token) headers['x-run-token'] = token
  const res = await fetch(path, {
    method: init?.method ?? 'POST',
    headers,
    credentials: 'same-origin',
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`)
  return data as T
}

export async function startRun(): Promise<RunResponse> {
  const r = await call<RunResponse>('/api/run', { body: {} })
  try {
    localStorage.setItem(TOKEN_KEY, r.token)
  } catch {
    /* storage blocked: the cookie still carries the run */
  }
  return r
}

export const checkAnswer = (input: string) => call<CheckResponse>('/api/round/check', { body: { input } })

/** Typed rounds: start the clock and get the prompt. */
export const startRound = () => call<{ run: PublicRun }>('/api/round/start', { body: {} })

/** Typed rounds: a hint that never names an answer. */
export const getHint = () => call<{ hint: Hint }>('/api/round/hint', { body: {} })

/** Typed rounds: the clock hit zero. */
export const timeUp = () => call<LockResponse>('/api/round/timeout', { body: {} })

export const lock = (round: number, body: Record<string, unknown>) => call<LockResponse>('/api/round/lock', { body: { round, ...body } })

export const todayStats = () => call<Stats>('/api/stats/today', { method: 'GET' })

/** Local dev server only. */
export const devReset = () => call<{ ok: boolean }>('/api/dev/reset', { body: {} })
