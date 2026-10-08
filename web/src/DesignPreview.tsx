/** Local-only visual review. Imported only in development; never sends game requests. */
import { useState } from 'react'
import catalog from '../../content/activities.json'
import villains from '../../content/villains.json'
import { ACTIVITIES } from './activities'
import Header from './components/Header'
import Intro from './components/Intro'
import BossIntro from './components/BossIntro'
import World from './components/World'
import RoundTransition from './components/RoundTransition'
import CoinRound from './rounds/CoinRound'
import RpsRound from './rounds/RpsRound'
import TypedRound from './rounds/TypedRound'
import type { ActivityInfo, LockResponse, PublicRun, RoundResult, Today } from './types'

const villain = villains.villains[3]
const run: PublicRun = { date: '2026-10-07', status: 'playing', round: 7, results: [], prompt: null, timeLeftMs: null, pendingThrows: [], answerSets: null }
const today: Today = { date: run.date, puzzle: 1, nextResetAt: '2026-10-08T05:00:00Z', typedRoundSeconds: 30, villain, health: { player: 2, boss: 8 }, rounds: [] }

export default function DesignPreview() {
  const [screen, setScreen] = useState('question')
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<RoundResult | null>(null)
  const [error, setError] = useState('')
  const info = catalog.activities.find((activity) => activity.id === screen)
  const Activity = info ? ACTIVITIES[info.id] : null
  const lock = async (choice: number): Promise<LockResponse> => ({
    result: 'locked', run, stats: null,
    outcome: { round: 7, kind: 'activity', choice, survived: true, deadly: (Math.floor(choice) + 1) % 5, zoneStart: (choice + .3) % .8, zoneWidth: .2 },
  })
  const onError = (e: unknown) => setError(String(e))
  return <>
    <div className="game-shell">
      <World />
      {screen !== 'intro' && screen !== 'boss' && <Header today={today} run={run} current={7} />}
      <main className="game-content" key={`${screen}-${attempt}`}>
        {screen === 'intro' && <Intro onStart={() => setScreen('boss')} />}
        {screen === 'boss' && <BossIntro villain={villain} onDone={() => setScreen('poison-cups')} />}
        <div className="round-stage">
          {screen === 'question' && <div onSubmitCapture={(event) => { event.preventDefault(); event.stopPropagation() }}>
            <TypedRound villain={villain} round={1} run={{ ...run, round: 1, status: 'dead', prompt: 'Name a Pokémon numbered 202 to 251 in the National Pokédex' }} seconds={30} onRun={() => {}} onLocked={() => {}} onError={onError} />
          </div>}
          {Activity && info && <Activity info={{ ...info, choices: 5, zoneWidth: .2 } as ActivityInfo} lock={lock} onFinish={(res) => setResult(res.outcome ?? null)} onError={onError} />}
          {/* Layout previews only: real RPS/coin interactions remain in the game. */}
          {(screen === 'rps' || screen === 'coin') && <div onClickCapture={(event) => { event.preventDefault(); event.stopPropagation() }}>
            {screen === 'rps' ? <RpsRound villain={villain} run={run} onLocked={() => {}} onError={onError} /> : <CoinRound round={9} onLocked={() => {}} onError={onError} />}
          </div>}
        </div>
        {error && <p role="alert">{error}</p>}
      </main>
    </div>
    {result && <RoundTransition villain={villain} result={result} run={run} health={today.health} onDone={() => { setResult(null); setAttempt((n) => n + 1) }} />}
    <aside className="design-preview-toolbar">
      <label htmlFor="preview-screen">Local design preview</label>
      <select id="preview-screen" value={screen} onChange={(e) => { setScreen(e.target.value); setError('') }}>
        <option value="intro">Title screen</option><option value="boss">Boss intro</option><option value="question">Question (layout)</option>
        {catalog.activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.name}</option>)}
        <option value="rps">Rock paper scissors (layout)</option><option value="coin">Coin (layout)</option>
      </select>
      <button onClick={() => setAttempt((n) => n + 1)}>Replay</button><a href="/">Open game →</a>
    </aside>
  </>
}
