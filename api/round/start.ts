import { startTyped, withRun } from '../../lib/game.js'
import { limitIp, route, tokenFrom } from '../../lib/http.js'

/** Typed rounds only: start the clock and reveal the prompt. Safe to call again after a refresh. */
export default route('POST', async (req, _res, date) => {
  await limitIp(req, 'start', 30)
  return withRun(tokenFrom(req), date, (run) => startTyped(run))
})
