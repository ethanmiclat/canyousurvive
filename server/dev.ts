/** Local API server: serves the same handlers as the Vercel functions in api/. Vite proxies /api here. */
import http from 'node:http'
import { resetRun } from '../lib/game.js'
import { route, tokenFrom, type ApiRequest } from '../lib/http.js'
import today from '../api/today.js'
import run from '../api/run.js'
import check from '../api/round/check.js'
import hint from '../api/round/hint.js'
import lock from '../api/round/lock.js'
import start from '../api/round/start.js'
import timeout from '../api/round/timeout.js'
import stats from '../api/stats/today.js'

const routes: Record<string, (req: ApiRequest, res: http.ServerResponse) => Promise<void>> = {
  '/api/today': today,
  '/api/run': run,
  '/api/round/check': check,
  '/api/round/hint': hint,
  '/api/round/lock': lock,
  '/api/round/start': start,
  '/api/round/timeout': timeout,
  '/api/stats/today': stats,
  // Local-only: lets you replay today's board. Not in api/, so it never ships to Vercel.
  '/api/dev/reset': route('POST', async (req, _res, date) => (await resetRun(tokenFrom(req), date), { ok: true })),
}

const port = Number(process.env.API_PORT ?? 3001)

http
  .createServer(async (req: ApiRequest, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const handler = routes[url.pathname]
    if (!handler) {
      res.statusCode = 404
      return res.end('Not found')
    }
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks).toString('utf8')
    try {
      req.body = raw ? JSON.parse(raw) : undefined
    } catch {
      req.body = raw
    }
    req.query = Object.fromEntries(url.searchParams)
    await handler(req, res)
  })
  .listen(port, () => console.log(`API on http://localhost:${port}${process.env.CYS_DATE ? ` (date ${process.env.CYS_DATE})` : ''}`))
