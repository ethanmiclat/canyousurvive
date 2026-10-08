import gsap from 'gsap'
import { useRef, useState } from 'react'
import { lock } from '../api'
import { flash, wait, motionSeconds } from '../lib/fx'
import type { LockResponse } from '../types'

export default function CoinRound({ round, onLocked, onError }: { round: number; onLocked: (r: LockResponse) => void; onError: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false)
  const [call, setCall] = useState<string | null>(null)
  const coinRef = useRef<HTMLDivElement>(null)

  async function flip(side: 'heads' | 'tails') {
    if (busy) return
    setBusy(true)
    setCall(side)
    try {
      const res = await lock(round, { call: side })
      const result = res.outcome!.flip
      // Spin a whole number of half-turns so the right face ends up showing.
      const turns = 10 + (result === 'tails' ? 1 : 0)
      await gsap
        .timeline()
        .to(coinRef.current, { y: -160, duration: motionSeconds(0.9), ease: 'power2.out' }, 0)
        .to(coinRef.current, { y: 0, duration: motionSeconds(0.9), ease: 'bounce.out' }, 0.9)
        .to(coinRef.current, { rotationX: turns * 180, duration: motionSeconds(1.8), ease: 'power1.out' }, 0)
        .then()
      if (!res.outcome!.survived) flash('#e8402a')
      await wait(700)
      onLocked(res)
    } catch (e) {
      setBusy(false)
      onError(e)
    }
  }

  return (
    <div className="coin-round">
      <p className="headline text-3xl sm:text-4xl">Call the coin</p>
      <p className="mt-2 text-mute">Last round. Call it right and you survive the day.</p>
      <div className="mt-10 flex h-56 items-end justify-center" style={{ perspective: 800 }}>
        <div ref={coinRef} className="relative h-32 w-32" style={{ transformStyle: 'preserve-3d' }}>
          <Face label="H" sub="Heads" />
          <Face label="T" sub="Tails" back />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3">
        {(['heads', 'tails'] as const).map((s) => (
          <button
            key={s}
            disabled={busy}
            onClick={() => flip(s)}
            className={`pixel-tile display py-4 text-2xl ${call === s ? 'is-selected' : ''}`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function Face({ label, sub, back }: { label: string; sub: string; back?: boolean }) {
  return (
    <div
      className="pixel-coin absolute inset-0 flex flex-col items-center justify-center text-ink"
      style={{ backfaceVisibility: 'hidden', transform: back ? 'rotateX(180deg)' : undefined }}
    >
      <span className="display text-5xl">{label}</span>
      <span className="font-mono text-xs font-bold uppercase tracking-widest">{sub}</span>
    </div>
  )
}
