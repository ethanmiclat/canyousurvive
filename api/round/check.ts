import { checkTyped, withRun } from '../../lib/game.js'
import { body, limitIp, route, tokenFrom } from '../../lib/http.js'

/** Typed rounds only: ok / confirm / unrecognized. Never consults the hidden answer. */
export default route('POST', async (req, _res, date) => {
  await limitIp(req, 'check', 60)
  const { input } = body(req)
  return withRun(tokenFrom(req), date, (run) => checkTyped(run, input))
})
