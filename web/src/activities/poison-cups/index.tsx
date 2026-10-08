import gsap from 'gsap'
import PixelIcon from '../../components/PixelIcon'
import { useRef, useState } from 'react'
import { flash, shake, wait, motionSeconds } from '../../lib/fx'
import Stage from '../Stage'
import type { ActivityProps } from '../types'

export default function PoisonCups({ info, lock, onFinish, onError }: ActivityProps) {
  const [picked, setPicked] = useState<number | null>(null)
  const [deadly, setDeadly] = useState<number | null>(null)
  const cups = useRef<(HTMLButtonElement | null)[]>([])
  const stage = useRef<HTMLDivElement>(null)

  async function pick(i: number) {
    if (picked !== null) return
    setPicked(i)
    gsap.to(cups.current[i], { y: -16, duration: motionSeconds(0.25), ease: 'power2.out' })
    try {
      const [res] = await Promise.all([lock(i), wait(500)])
      const o = res.outcome!
      await gsap.to(cups.current[i], { rotation: -40, y: -34, duration: motionSeconds(0.55), ease: 'power2.in' }).then()
      await gsap.to(cups.current[i], { rotation: 0, y: 0, duration: motionSeconds(0.35), ease: 'power2.out' }).then()
      setDeadly(o.deadly!)
      gsap.fromTo(cups.current[o.deadly!], { scale: 1 }, { scale: 1.12, duration: motionSeconds(0.2), yoyo: true, repeat: 3 })
      if (!o.survived) {
        flash('#c6ff4a', 0.9)
        shake(stage.current)
      }
      await wait(1100)
      onFinish(res)
    } catch (e) {
      setPicked(null)
      onError(e)
    }
  }

  return (
    <Stage title={info.name} rule={info.rule}>
      <div ref={stage} className="grid grid-cols-5 items-end gap-2 pt-10">
        {Array.from({ length: info.choices }, (_, i) => {
          const isDeadly = deadly === i
          return (
            <button
              key={i}
              ref={(el) => void (cups.current[i] = el)}
              onClick={() => pick(i)}
              disabled={picked !== null}
              aria-label={`Cup ${i + 1}`}
              className={`group flex flex-col items-center rounded-xl pb-2 transition ${picked === i ? 'ring-2 ring-amber' : ''} disabled:cursor-default`}
            >
              <Cup poison={isDeadly} />
              <span className="mt-1 flex h-4 items-center text-xs text-mute">{isDeadly ? <PixelIcon size={14} className="text-safe" aria-label="Poisoned" /> : i + 1}</span>
            </button>
          )
        })}
      </div>
    </Stage>
  )
}

function Cup({ poison }: { poison: boolean }) {
  const liquid = poison ? '#c6ff4a' : '#7a1d0f'
  return (
    <svg viewBox="0 0 60 90" className="w-full max-w-16 transition-transform group-enabled:group-hover:-translate-y-1">
      <path d="M8 6 H52 V26 H48 V36 H40 V44 H20 V36 H12 V26 H8 Z" fill="rgb(255 255 255 / 0.08)" stroke="#ece3d0" strokeOpacity="0.6" strokeWidth="2" />
      <path d="M12 16 H48 V26 H44 V34 H38 V40 H22 V34 H16 V26 H12 Z" fill={liquid} style={{ transition: 'fill .4s' }} />
      {poison && <circle cx="22" cy="24" r="2.5" fill="#eaffc8" />}
      {poison && <circle cx="36" cy="30" r="1.8" fill="#eaffc8" />}
      <rect x="28" y="46" width="4" height="30" fill="#ece3d0" opacity="0.6" />
      <path d="M20 76 H40 V80 H46 V84 H14 V80 H20 Z" fill="#ece3d0" opacity="0.6" />
    </svg>
  )
}
