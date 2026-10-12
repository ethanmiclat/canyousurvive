import { useEffect, useRef, useState } from 'react'
import type { PublicRun, Today } from '../types'
import Pips from './Pips'
import PixelIcon from './PixelIcon'
export default function Header({ today, run, current }: { today: Today | null; run: PublicRun | null; current?: number }) {
  const lost = run?.results.filter((r) => !r.survived).length ?? 0
  const survived = (run?.results.length ?? 0) - lost
  return <header className="game-header">
    <div className="brand-row">
      <h1 className="display brand-name">Can you <span className="text-blood">survive</span></h1>
      {today && <span className="board-date">#{String(today.puzzle).padStart(3, '0')} · {new Date(`${today.date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>}
    </div>
    {today && <div className="boss-identity" style={{ color: today.villain.color }}>
      <PixelIcon size={32} aria-hidden="true" /><div><span className="eyebrow">Today’s boss</span><div className="display boss-label">{today.villain.name}</div></div>
    </div>}
    {today && (
      <div className="health-row">
        <HealthBar label="You" max={today.health.player} left={today.health.player - lost} hearts />
        <HealthBar label={today.villain.name} max={today.health.boss} left={run?.status === 'won' ? 0 : Math.max(0, today.health.boss - survived)} color={today.villain.color} />
      </div>
    )}
    {today && <Pips run={run} current={current} total={today.rounds.length} />}
  </header>
}

/** Hearts for the player, a segmented bar for the boss. A segment that just emptied flashes. */
function HealthBar({ label, max, left, color, hearts }: { label: string; max: number; left: number; color?: string; hearts?: boolean }) {
  const prev = useRef(left)
  // Segments emptied by the latest change, [from, to), so they can flash once.
  const [lost, setLost] = useState<[number, number] | null>(null)
  useEffect(() => {
    const before = prev.current
    prev.current = left
    if (left >= before) return
    setLost([left, before])
    const t = window.setTimeout(() => setLost(null), 900)
    return () => clearTimeout(t)
  }, [left])
  return (
    <div className={`health ${hearts ? 'is-player' : 'is-boss'}`} role="meter" aria-label={`${label} health`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={left} style={color ? { color } : undefined}>
      <span className="eyebrow health-label">{label}</span>
      <span className="health-cells" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => {
          const cls = `${i < left ? 'is-full' : 'is-empty'}${lost && i >= lost[0] && i < lost[1] ? ' is-lost' : ''}`
          return hearts ? <PixelIcon key={i} name="heart" size={26} className={cls} /> : <i key={i} className={cls} />
        })}
      </span>
    </div>
  )
}
