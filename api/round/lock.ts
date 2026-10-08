import { GameError, kindOf, lockActivity, lockCoin, lockRps, lockTyped, statsFor, withRun } from '../../lib/game.js'
import { body, limitIp, route, tokenFrom } from '../../lib/http.js'

/** Final choice for the current round. Resolved server-side; RPS may return "tie". */
export default route('POST', async (req, _res, date) => {
  await limitIp(req, 'lock', 60)
  const b = body(req)
  const out = await withRun(tokenFrom(req), date, async (run) => {
    if (typeof b.round === 'number' && b.round !== run.round) throw new GameError(409, 'Out of sync. Refresh.')
    switch (kindOf(run.round)) {
      case 'typed':
        return lockTyped(run, b.input)
      case 'activity':
        return lockActivity(run, b.choice)
      case 'rps':
        return lockRps(run, b.throw)
      case 'coin':
        return lockCoin(run, b.call)
    }
  })
  const over = out.run.status !== 'playing'
  return { ...out, stats: over ? await statsFor(date) : null }
})
