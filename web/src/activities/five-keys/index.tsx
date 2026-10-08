import gsap from 'gsap'
import { useRef, useState } from 'react'
import { flash, shake, wait, motionSeconds } from '../../lib/fx'
import Stage, { A11yChoices } from '../Stage'
import type { ActivityProps } from '../types'
import { pixelCircle } from '../../lib/pixel'

const BOWS = ['#f5a524', '#bdb5a6', '#cd7f32', '#7fd1ff', '#ff8fb1']

export default function FiveKeys({ info, lock, onFinish, onError }: ActivityProps) {
  const [picked, setPicked] = useState<number | null>(null)
  const [deadly, setDeadly] = useState<number | null>(null)
  const [opened, setOpened] = useState(false)
  const keys = useRef<(HTMLDivElement | null)[]>([])
  const padlock = useRef<HTMLDivElement>(null)
  const shackle = useRef<SVGPathElement>(null)
  const drag = useRef<{ i: number; x: number; y: number } | null>(null)

  function down(i: number, e: React.PointerEvent) {
    if (picked !== null) return
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    drag.current = { i, x: e.clientX, y: e.clientY }
    gsap.to(keys.current[i], { scale: 1.15, duration: motionSeconds(0.15) })
  }

  function move(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    gsap.set(keys.current[d.i], { x: e.clientX - d.x, y: e.clientY - d.y })
  }

  function up(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    drag.current = null
    const lockBox = padlock.current!.getBoundingClientRect()
    const inside = e.clientX > lockBox.left - 20 && e.clientX < lockBox.right + 20 && e.clientY > lockBox.top - 20 && e.clientY < lockBox.bottom + 20
    if (inside) insert(d.i)
    else gsap.to(keys.current[d.i], { x: 0, y: 0, scale: 1, duration: motionSeconds(0.35), ease: 'back.out(2)' })
  }

  async function insert(i: number) {
    if (picked !== null) return
    setPicked(i)
    const key = keys.current[i]!
    const kb = key.getBoundingClientRect()
    const lb = padlock.current!.querySelector('svg')!.getBoundingClientRect()
    const cur = { x: Number(gsap.getProperty(key, 'x')), y: Number(gsap.getProperty(key, 'y')) }
    // Flip the key blade-up and slide the blade into the keyhole from below.
    const scale = 0.8
    const hole = { x: lb.left + lb.width / 2, y: lb.top + lb.height * 0.7 }
    const center = { x: kb.left + kb.width / 2 - cur.x, y: kb.top + kb.height / 2 - cur.y }
    const target = { x: hole.x - center.x, y: hole.y + (kb.height * scale) / 2 - 14 - center.y }
    try {
      const [res] = await Promise.all([
        lock(i),
        gsap
          .timeline()
          .to(key, { x: target.x, y: target.y + 30, rotation: 180, scale, duration: motionSeconds(0.35) })
          .to(key, { y: target.y, duration: motionSeconds(0.2), ease: 'power2.in' })
          .to(key, { rotation: 210, duration: motionSeconds(0.3), ease: 'power2.inOut' })
          .then(),
      ])
      const o = res.outcome!
      setDeadly(o.deadly!)
      if (o.survived) {
        setOpened(true)
        gsap.to(shackle.current, { y: -14, duration: motionSeconds(0.4), ease: 'back.out(3)' })
      } else {
        shake(padlock.current)
        for (let k = 0; k < 3; k++) setTimeout(() => flash('#e8402a', 0.3), k * 380)
      }
      await wait(1500)
      onFinish(res)
    } catch (e) {
      setPicked(null)
      onError(e)
    }
  }

  return (
    <Stage title={info.name} rule={info.rule}>
      <div className="no-touch-scroll mx-auto max-w-sm" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="flex justify-center">
          <div ref={padlock} className="relative w-32">
            <div className={`mb-1 text-center text-sm font-semibold ${opened ? 'text-safe' : deadly !== null ? 'text-blood' : 'text-mute'}`}>
              {opened ? 'Unlocked' : deadly !== null ? 'Alarm!' : 'Locked'}
            </div>
            <svg viewBox="0 0 120 140" className="w-full">
              <path ref={shackle} d="M30 64 V28 H42 V16 H78 V28 H90 V64" stroke="#bdb5a6" strokeWidth="12" fill="none" />
              <rect x="10" y="60" width="100" height="76" fill={deadly !== null && deadly === picked ? '#7a1d0f' : '#211c15'} stroke="#342c22" strokeWidth="3" />
              <path d={pixelCircle(60, 92, 9, 3)} fill="#0d0b09" />
              <rect x="56" y="96" width="8" height="20" rx="3" fill="#0d0b09" />
            </svg>
          </div>
        </div>
        <div className="mt-24 grid grid-cols-5 gap-2">
          {Array.from({ length: info.choices }, (_, i) => (
            <div key={i} className="flex justify-center">
              <div
                ref={(el) => void (keys.current[i] = el)}
                onPointerDown={(e) => down(i, e)}
                className="relative z-10 w-10 cursor-grab touch-none active:cursor-grabbing"
                style={{ filter: deadly === i ? 'drop-shadow(0 0 8px #e8402a)' : undefined }}
                aria-label={`Key ${i + 1}`}
              >
                <svg viewBox="0 0 40 110" className="w-full">
                  <path d={pixelCircle(20, 18, 15, 4)} fill={BOWS[i % BOWS.length]} />
                  <rect x="16" y="14" width="8" height="8" fill="#0d0b09" />
                  <rect x="17" y="32" width="6" height="68" fill={BOWS[i % BOWS.length]} />
                  <rect x="23" y={70 + (i % 3) * 6} width="8" height="5" fill={BOWS[i % BOWS.length]} />
                  <rect x="23" y={88 - (i % 2) * 6} width="10" height="5" fill={BOWS[i % BOWS.length]} />
                </svg>
              </div>
            </div>
          ))}
        </div>
        <A11yChoices n={info.choices} label={(i) => `Try key ${i + 1}`} onPick={insert} disabled={picked !== null} />
      </div>
    </Stage>
  )
}
