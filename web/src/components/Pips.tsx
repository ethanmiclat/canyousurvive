import type { PublicRun } from '../types'

/** One square per round: survived, lost, current, not reached. */
export default function Pips({ run, current, total }: { run: PublicRun | null; current?: number; total: number }) {
  return (
    <div className="progress-pips" role="group" aria-label="Round progress">
      {Array.from({ length: total }, (_, i) => {
        const r = run?.results.find((x) => x.round === i + 1)
        const isCurrent = !r && current === i + 1 && run?.status === 'playing'
        const cls = r ? (r.survived ? 'bg-safe' : 'bg-blood') : isCurrent ? 'bg-transparent ring-2 ring-inset ring-amber' : 'bg-line'
        const label = r ? (r.survived ? 'survived' : 'lost') : isCurrent ? 'current' : 'not reached'
        return <span key={i} role="img" aria-label={`Round ${i + 1}: ${label}`} className={`progress-pip ${isCurrent ? 'is-current' : ''} ${cls}`} title={`Round ${i + 1}: ${label}`} />
      })}
    </div>
  )
}
