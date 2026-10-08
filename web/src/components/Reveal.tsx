import { useState } from 'react'
import type { PublicRun, RoundResult, Today } from '../types'
import RpsIcon from './RpsIcon'
import { Button } from './ui'

const NAMES: Record<string, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors', heads: 'Heads', tails: 'Tails' }

export function outcomeText(r: RoundResult, today: Today): string {
  const v = today.villain
  switch (r.kind) {
    case 'typed':
      if (r.reason === 'time') return `Time’s up. ${v.name}'s answer was ${r.answer}.`
      return r.survived ? `You said ${r.pick}. ${v.name}'s answer was ${r.answer}.` : `You said ${r.pick}. So did ${v.ref}.`
    case 'activity': {
      const meta = today.rounds.find((x) => x.kind === 'activity')
      const name = meta?.kind === 'activity' ? meta.activity.name : 'The activity'
      return r.survived ? `You made it through ${name}.` : `${name} got you.`
    }
    case 'rps': {
      const last = r.throws?.at(-1)
      const ties = (r.throws?.length ?? 1) - 1
      const tieText = ties ? ` after ${ties} tie${ties > 1 ? 's' : ''}` : ''
      return last ? `${NAMES[last.player]} vs ${NAMES[last.site]}${tieText}.` : ''
    }
    case 'coin':
      return `You called ${NAMES[r.call!]}. It landed ${NAMES[r.flip!]}.`
  }
}

export default function Reveal({ result, run, today, onNext }: { result: RoundResult; run: PublicRun; today: Today; onNext: () => void }) {
  const v = today.villain
  const state = result.survived ? 'alive' : run.status === 'dead' ? 'dead' : 'hit'
  const heartsLeft = today.health.player - run.results.filter((r) => !r.survived).length
  const lines = result.survived ? v.jeers : v.taunts
  const [quote] = useState(() => lines[Math.floor(Math.random() * lines.length)])
  return (
    <div
      role="status"
      className={`reveal-panel rise-in mt-8 pt-6 text-center ${state === 'alive' ? 'text-safe' : state === 'hit' ? 'text-amber' : 'text-blood'}`}
    >
      <div className="display text-4xl">
        {state === 'alive' ? (run.status === 'won' ? `You beat ${v.ref}` : 'Survived') : state === 'hit' ? 'You took a hit' : "You're out"}
      </div>
      {state === 'hit' && <p className="mt-1 text-amber">{heartsLeft === 1 ? 'One heart left. The next loss ends it.' : `${heartsLeft} hearts left.`}</p>}
      {/* Typed rounds already show both answers in the locked-in box above. */}
      {!(result.kind === 'typed' && result.pick) && <p className="mt-2 text-bone/90">{outcomeText(result, today)}</p>}
      {result.kind === 'rps' && result.throws && result.throws.length > 1 && (
        <ol className="mt-3 flex flex-wrap justify-center gap-3 text-mute" aria-label="Throws">
          {result.throws.map((t, i) => (
            <li key={i} className="flex items-center gap-1">
              <RpsIcon throw={t.player} size={18} />
              <span className="text-xs">vs</span>
              <RpsIcon throw={t.site} size={18} className="text-blood" />
            </li>
          ))}
        </ol>
      )}
      <figure className="mt-4">
        <blockquote className="headline text-xl" style={{ color: v.color }}>
          “{quote}”
        </blockquote>
        <figcaption className="mt-1 text-sm text-mute">{v.name}</figcaption>
      </figure>
      <Button className="mt-5 w-full" variant={state === 'dead' ? 'danger' : 'primary'} onClick={onNext}>
        {run.status === 'playing' ? `Round ${run.round}` : 'See your results'}
      </Button>
    </div>
  )
}
