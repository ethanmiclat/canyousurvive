import { useCallback, useEffect, useState } from 'react'
import { ApiError, devReset, startRun } from './api'
import EndScreen from './components/EndScreen'
import BossIntro from './components/BossIntro'
import Header from './components/Header'
import Intro from './components/Intro'
import Reveal from './components/Reveal'
import RoundTransition from './components/RoundTransition'
import World from './components/World'
import { Button } from './components/ui'
import ActivityRound from './rounds/ActivityRound'
import CoinRound from './rounds/CoinRound'
import RpsRound from './rounds/RpsRound'
import TypedRound from './rounds/TypedRound'
import type { LockResponse, PublicRun, RoundResult, Stats, Today } from './types'

type Phase = 'loading' | 'error' | 'intro' | 'boss' | 'play' | 'reveal' | 'end'

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [today, setToday] = useState<Today | null>(null)
  const [run, setRun] = useState<PublicRun | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [reveal, setReveal] = useState<RoundResult | null>(null)
  const [cinematic, setCinematic] = useState(false) // the survive/death transition is playing
  const [round, setRound] = useState(1) // the round on screen; lags run.round while a reveal shows
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setPhase('loading')
    try {
      const r = await startRun()
      setToday(r.today)
      setRun(r.run)
      setStats(r.stats)
      setRound(r.run.round)
      setReveal(null)
      const fresh = r.run.round === 1 && r.run.results.length === 0 && r.run.timeLeftMs === null
      setPhase(r.run.status !== 'playing' ? 'end' : fresh ? 'intro' : 'play')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && (e.status === 409 || e.status === 404 || e.status === 401)) return void load()
      setError(e instanceof Error ? e.message : String(e))
    },
    [load],
  )

  const onLocked = useCallback((res: LockResponse) => {
    setRun(res.run)
    if (res.stats) setStats(res.stats)
    if (res.outcome) {
      setReveal(res.outcome)
      setCinematic(true)
      setPhase('reveal')
    }
  }, [])

  const onRun = useCallback(
    (next: PublicRun) => {
      setRun(next)
      if (next.status !== 'playing' && next.results.length > (run?.results.length ?? 0)) {
        setReveal(next.results[next.results.length - 1])
        setCinematic(true)
        setPhase('reveal')
      }
    },
    [run],
  )

  function next() {
    setReveal(null)
    setError('')
    if (!run || run.status !== 'playing') return setPhase('end')
    setRound(run.round)
    setPhase('play')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const meta = today?.rounds.find((r) => r.round === round)

  return (
    <div className="game-shell">
      <World />
      <a href="#game-content" className="skip-link">Skip to game</a>
      {phase !== 'intro' && phase !== 'boss' && <Header today={today} run={run} current={round} />}

      <main id="game-content" className="game-content">
        {phase === 'loading' && <div className="py-24 text-center font-mono text-sm text-mute">Loading today's board…</div>}

        {phase === 'error' && (
          <div className="py-16 text-center">
            <p className="text-blood">{error || 'Something went wrong.'}</p>
            <Button className="mt-6" variant="ghost" onClick={load}>
              Try again
            </Button>
          </div>
        )}

        {phase === 'intro' && today && <Intro onStart={() => setPhase('boss')} />}
        {phase === 'boss' && today && <BossIntro villain={today.villain} onDone={() => setPhase('play')} />}

        {(phase === 'play' || phase === 'reveal') && today && run && meta && (
          <section key={round} aria-label={`Round ${round} of ${today.rounds.length}`} className="round-stage rise-in">
            <fieldset disabled={phase === 'reveal'} className="contents">
              {meta.kind === 'typed' && (
                <TypedRound villain={today.villain} round={round} outcome={reveal} run={run} seconds={today.typedRoundSeconds} onRun={onRun} onLocked={onLocked} onError={onError} />
              )}
              {meta.kind === 'activity' && <ActivityRound round={round} info={meta.activity} onLocked={onLocked} onError={onError} />}
              {meta.kind === 'rps' && <RpsRound villain={today.villain} run={run} onLocked={onLocked} onError={onError} />}
              {meta.kind === 'coin' && <CoinRound round={round} onLocked={onLocked} onError={onError} />}
            </fieldset>
            {error && phase === 'play' && <p className="mt-4 text-center text-sm text-blood">{error}</p>}
            {phase === 'reveal' && reveal && !cinematic && <Reveal result={reveal} run={run} today={today} onNext={next} />}
          </section>
        )}

        {phase === 'end' && today && run && <EndScreen today={today} run={run} initialStats={stats} />}
      </main>

      {phase === 'reveal' && reveal && cinematic && today && run && <RoundTransition villain={today.villain} result={reveal} run={run} health={today.health} onDone={() => setCinematic(false)} />}

      {import.meta.env.DEV && (
        <button
          onClick={async () => {
            await devReset()
            load()
          }}
          className="fixed right-3 bottom-3 z-50 rounded-lg border border-line bg-panel/90 px-3 py-1.5 font-mono text-xs text-mute hover:border-bone hover:text-bone"
        >
          ↻ Restart run (dev)
        </button>
      )}
    </div>
  )
}
