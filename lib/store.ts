import fs from 'node:fs'
import path from 'node:path'

/**
 * Storage for runs, submissions, stats and rate limits. Upstash Redis (REST) when configured,
 * otherwise an in-memory store (persisted to .data/store.json outside production for local dev).
 */

export interface Submission {
  runId: string
  date: string
  round: number
  event: 'check' | 'lock'
  rawInput: string
  normalized: string
  entityId: string | null
  ts: number
}

export interface Store {
  getJson<T>(key: string): Promise<T | null>
  setJson(key: string, value: unknown, ttlSeconds: number): Promise<void>
  /** Append to a list (submission log). */
  push(key: string, value: unknown, ttlSeconds: number): Promise<void>
  hincr(key: string, field: string, ttlSeconds: number): Promise<void>
  hgetall(key: string): Promise<Record<string, number>>
  /** Returns true when the call is allowed. Fixed window. */
  rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>
  /** Short exclusive lock (SET NX EX). Returns false if already held. */
  acquire(key: string, ttlSeconds: number): Promise<boolean>
  release(key: string): Promise<void>
}

class MemoryStore implements Store {
  private data: Record<string, { v: unknown; exp: number }> = {}
  private saveTimer: NodeJS.Timeout | undefined

  constructor(private readonly file?: string) {
    if (file && fs.existsSync(file)) {
      try {
        this.data = JSON.parse(fs.readFileSync(file, 'utf8'))
      } catch {
        this.data = {}
      }
    }
  }

  private live(key: string) {
    const e = this.data[key]
    if (e && e.exp < Date.now()) {
      delete this.data[key]
      return undefined
    }
    return e
  }

  private put(key: string, v: unknown, ttl: number) {
    this.data[key] = { v, exp: Date.now() + ttl * 1000 }
    this.scheduleSave()
  }

  private scheduleSave() {
    if (!this.file || this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      fs.mkdirSync(path.dirname(this.file!), { recursive: true })
      fs.writeFileSync(this.file!, JSON.stringify(this.data))
    }, 200)
  }

  async getJson<T>(key: string) {
    return (this.live(key)?.v as T) ?? null
  }
  async setJson(key: string, value: unknown, ttl: number) {
    this.put(key, structuredClone(value), ttl)
  }
  async push(key: string, value: unknown, ttl: number) {
    const list = ((this.live(key)?.v as unknown[]) ?? []).concat([value])
    this.put(key, list, ttl)
  }
  async hincr(key: string, field: string, ttl: number) {
    const h = { ...((this.live(key)?.v as Record<string, number>) ?? {}) }
    h[field] = (h[field] ?? 0) + 1
    this.put(key, h, ttl)
  }
  async hgetall(key: string) {
    return { ...((this.live(key)?.v as Record<string, number>) ?? {}) }
  }
  async rateLimit(key: string, limit: number, windowSeconds: number) {
    const e = this.live(key)
    if (!e) {
      this.data[key] = { v: 1, exp: Date.now() + windowSeconds * 1000 }
      return true
    }
    e.v = (e.v as number) + 1
    return (e.v as number) <= limit
  }
  async acquire(key: string, ttl: number) {
    if (this.live(key)) return false
    this.data[key] = { v: 1, exp: Date.now() + ttl * 1000 }
    return true
  }
  async release(key: string) {
    delete this.data[key]
  }
}

class UpstashStore implements Store {
  constructor(private readonly url: string, private readonly token: string) {}

  private async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const res = await fetch(`${this.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    })
    if (!res.ok) throw new Error(`Upstash ${res.status}: ${await res.text()}`)
    const out = (await res.json()) as { result?: unknown; error?: string }[]
    for (const r of out) if (r.error) throw new Error(`Upstash: ${r.error}`)
    return out.map((r) => r.result)
  }

  async getJson<T>(key: string) {
    const [v] = await this.pipeline([['GET', key]])
    return v == null ? null : (JSON.parse(v as string) as T)
  }
  async setJson(key: string, value: unknown, ttl: number) {
    await this.pipeline([['SET', key, JSON.stringify(value), 'EX', ttl]])
  }
  async push(key: string, value: unknown, ttl: number) {
    await this.pipeline([['RPUSH', key, JSON.stringify(value)], ['EXPIRE', key, ttl]])
  }
  async hincr(key: string, field: string, ttl: number) {
    await this.pipeline([['HINCRBY', key, field, 1], ['EXPIRE', key, ttl]])
  }
  async hgetall(key: string) {
    const [flat] = (await this.pipeline([['HGETALL', key]])) as string[][]
    const out: Record<string, number> = {}
    for (let i = 0; i + 1 < (flat ?? []).length; i += 2) out[flat[i]] = Number(flat[i + 1])
    return out
  }
  async rateLimit(key: string, limit: number, windowSeconds: number) {
    const [count] = (await this.pipeline([['INCR', key], ['EXPIRE', key, windowSeconds, 'NX']])) as number[]
    return count <= limit
  }
  async acquire(key: string, ttl: number) {
    const [ok] = await this.pipeline([['SET', key, '1', 'NX', 'EX', ttl]])
    return ok === 'OK'
  }
  async release(key: string) {
    await this.pipeline([['DEL', key]])
  }
}

let store: Store | undefined
export function getStore(): Store {
  if (store) return store
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (url && token) store = new UpstashStore(url, token)
  else {
    const persist = process.env.NODE_ENV !== 'production' && !process.env.VERCEL
    if (!persist) console.warn('[store] no Redis configured; using in-memory store (runs do not survive cold starts)')
    store = new MemoryStore(persist ? path.join(process.cwd(), '.data', 'store.json') : undefined)
  }
  return store
}

/** For tests. */
export function setStore(s: Store | undefined) {
  store = s
}

export function memoryStore(): Store {
  return new MemoryStore()
}
