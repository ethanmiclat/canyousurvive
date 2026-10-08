import { statsFor, timeoutTyped, withRun } from '../../lib/game.js'
import { limitIp, route, tokenFrom } from '../../lib/http.js'

/** Typed rounds only: the clock hit zero. The server checks the deadline itself. */
export default route('POST', async (req, _res, date) => {
  await limitIp(req, 'timeout', 30)
  const out = await withRun(tokenFrom(req), date, (run) => timeoutTyped(run))
  return { ...out, stats: await statsFor(date) }
})
