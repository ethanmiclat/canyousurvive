import gsap from 'gsap'
import { useRef, useState } from 'react'
import { lock } from '../api'
import { flash, wait, motionSeconds } from '../lib/fx'
import RpsIcon from '../components/RpsIcon'
import type { LockResponse, PublicRun, Villain } from '../types'

const THROWS = [
  { id: 'rock', label: 'Rock' },
  { id: 'paper', label: 'Paper' },
  { id: 'scissors', label: 'Scissors' },
] as const

export default function RpsRound({ villain, run, onLocked, onError }: { villain: Villain; run: PublicRun; onLocked: (r: LockResponse) => void; onError: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<{ player: string; site: string } | null>(null)
  const [ties, setTies] = useState(run.pendingThrows.length)
  const [note, setNote] = useState(run.pendingThrows.length ? 'Tie. Throw again.' : '')
  const playerRef = useRef<HTMLDivElement>(null)
  const siteRef = useRef<HTMLDivElement>(null)

  async function play(t: string) {
    if (busy) return
    setBusy(true)
    setNote('')
    setShown(null)
    try {
      const pump = gsap.timeline().to([playerRef.current, siteRef.current], { y: -26, duration: motionSeconds(0.16), yoyo: true, repeat: 5, ease: 'power1.inOut' })
      const [res] = await Promise.all([lock(run.round, { throw: t }), wait(1000)])
      pump.progress(1)
      const thrown = res.throw ?? res.outcome?.throws?.at(-1) ?? null
      setShown(thrown)
      gsap.fromTo([playerRef.current, siteRef.current], { scale: 0.6 }, { scale: 1, duration: motionSeconds(0.35), ease: 'back.out(3)' })
      if (res.result === 'tie') {
        setTies((n) => n + 1)
        setNote('Tie. Throw again.')
        setBusy(false)
        return
      }
      if (!res.outcome?.survived) flash('#e8402a')
      await wait(900)
      onLocked(res)
    } catch (e) {
      setBusy(false)
      onError(e)
    }
  }

  return (
    <div className="rps-round">
      <p className="headline text-3xl sm:text-4xl">Beat {villain.ref} to survive</p>
      <p className="mt-2 text-mute">Lose and you’re out. Ties replay.</p>
      <div className="mt-8 grid grid-cols-2 gap-4 text-center">
        <div>
          <div ref={playerRef} className="flex justify-center text-bone">
            <RpsIcon throw={shown?.player ?? 'rock'} size={88} strokeWidth={1.25} />
          </div>
          <div className="mt-2 text-sm text-mute">You</div>
        </div>
        <div>
          <div ref={siteRef} className="flex justify-center text-blood" style={{ transform: 'scaleX(-1)' }}>
            <RpsIcon throw={shown?.site ?? 'rock'} size={88} strokeWidth={1.25} />
          </div>
          <div className="mt-2 text-sm text-mute">{villain.name}</div>
        </div>
      </div>
      <div className="mt-4 h-6 text-center font-semibold text-amber" aria-live="polite">
        {note}
        {ties > 1 && <span className="ml-2 text-sm text-mute">({ties} ties so far)</span>}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {THROWS.map((t) => (
          <button
            key={t.id}
            disabled={busy}
            onClick={() => play(t.id)}
            className="pixel-tile flex flex-col items-center gap-2 py-4"
          >
            <RpsIcon throw={t.id} size={32} strokeWidth={1.5} />
            <span className="text-sm font-semibold">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
