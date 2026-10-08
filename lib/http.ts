import type { IncomingMessage, ServerResponse } from 'node:http'
import { GameError, today } from './game.js'
import { getStore } from './store.js'

/** Minimal request/response shapes shared by Vercel functions and the local dev server. */
export interface ApiRequest extends IncomingMessage {
  body?: unknown
  query?: Record<string, string | string[] | undefined>
}
export type ApiResponse = ServerResponse

export const COOKIE = 'cys_token'

export function sendJson(res: ApiResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export function readCookie(req: ApiRequest, name: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

/** The run token travels as an httpOnly cookie, with a header copy from localStorage as backup. */
export function tokenFrom(req: ApiRequest): string | undefined {
  const header = req.headers['x-run-token']
  return readCookie(req, COOKIE) ?? (typeof header === 'string' ? header : undefined)
}

export function setTokenCookie(req: ApiRequest, res: ApiResponse, token: string) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.VERCEL ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`)
}

export function clientIp(req: ApiRequest): string {
  const fwd = req.headers['x-forwarded-for']
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
  return first || req.socket?.remoteAddress || 'unknown'
}

export function body(req: ApiRequest): Record<string, unknown> {
  const b = req.body
  if (b && typeof b === 'object') return b as Record<string, unknown>
  if (typeof b === 'string') {
    try {
      return JSON.parse(b)
    } catch {
      return {}
    }
  }
  return {}
}

/** Per-IP fixed-window limit. */
export async function limitIp(req: ApiRequest, bucket: string, limit: number, windowSeconds = 60) {
  const window = Math.floor(Date.now() / 1000 / windowSeconds)
  const ok = await getStore().rateLimit(`rl:${bucket}:${clientIp(req)}:${window}`, limit, windowSeconds)
  if (!ok) throw new GameError(429, 'Slow down.')
}

type Handler = (req: ApiRequest, res: ApiResponse, date: string) => Promise<unknown>

export function route(method: 'GET' | 'POST', handler: Handler) {
  return async (req: ApiRequest, res: ApiResponse) => {
    try {
      if (req.method !== method) return sendJson(res, 405, { error: 'Method not allowed' })
      const out = await handler(req, res, today())
      if (!res.writableEnded) sendJson(res, 200, out)
    } catch (err) {
      if (err instanceof GameError) return sendJson(res, err.status, { error: err.message })
      console.error(err)
      sendJson(res, 500, { error: 'Something went wrong.' })
    }
  }
}
