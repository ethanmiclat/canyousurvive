import { publicToday } from '../lib/game.js'
import { route } from '../lib/http.js'

export default route('GET', async (_req, _res, date) => publicToday(date))
