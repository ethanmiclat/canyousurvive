import { useEffect, useRef } from 'react'
import type { PublicRun, RoundResult, Villain } from '../types'
import HeartMonitor from './HeartMonitor'
import PixelIcon from './PixelIcon'

/** Survived (the boss takes a hit), hit (the player loses health but lives) or dead. */
export default function RoundTransition({ villain, result, run, health, onDone }: { villain: Villain; result: RoundResult; run: PublicRun; health: { player: number; boss: number }; onDone: () => void }) {
  const done = useRef(onDone)
  done.current = onDone
  const state = result.survived ? 'alive' : run.status === 'dead' ? 'dead' : 'hit'
  const heartsLeft = health.player - run.results.filter((r) => !r.survived).length
  useEffect(() => {
    // Long enough to watch the monitor: a few beats, or the last beat and the flat line after it.
    const timer = window.setTimeout(() => done.current(), state === 'alive' ? 2000 : state === 'hit' ? 2300 : 2600)
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); done.current() }
    }
    window.addEventListener('keydown', key)
    return () => { clearTimeout(timer); window.removeEventListener('keydown', key) }
  }, [])
  const word = state === 'alive' ? (run.status === 'won' ? `${villain.name} falls` : 'Survived') : state === 'hit' ? 'Hit' : villain.deathStamp
  const readout = state === 'alive' ? (run.status === 'won' ? 'Boss down' : `${villain.name} takes a hit`) : state === 'hit' ? `Pulse weak · ${heartsLeft} ${heartsLeft === 1 ? 'heart' : 'hearts'} left` : 'No pulse'
  return <div className={`round-transition is-${state}`}>
    <div role="status" className="transition-verdict">
      <PixelIcon name={state === 'alive' ? 'check' : state === 'hit' ? 'heart' : 'skull'} size={64} aria-hidden="true" />
      <p className="eyebrow mt-5">Round {String(result.round).padStart(2, '0')}</p>
      <p className="display transition-word">{word}</p>
      <HeartMonitor alive={state !== 'dead'} weak={state === 'hit'} />
      <p className="eyebrow monitor-readout">{readout}</p>
    </div>
    <button className="transition-skip" onClick={onDone}>Continue →</button>
  </div>
}
