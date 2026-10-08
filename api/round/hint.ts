import { hintTyped, withRun } from '../../lib/game.js'
import { limitIp, route, tokenFrom } from '../../lib/http.js'

/** Typed rounds only: a hint that never names an answer or consults the hidden pick. */
export default route('POST', async (req, _res, date) => {
  await limitIp(req, 'hint', 30)
  return withRun(tokenFrom(req), date, (run) => hintTyped(run))
})
