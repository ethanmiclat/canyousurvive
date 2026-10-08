import gsap from 'gsap'
import { useRef, useState } from 'react'
import { flash, wait, motionSeconds } from '../../lib/fx'
import Stage, { A11yChoices } from '../Stage'
import type { ActivityProps } from '../types'

const LONG = 160
const SHORT = 60
const BASE = 20 // straw bottoms sit this far up inside the fist
const FIST = 120

/** Every straw shows the same tip above the fist, so a short one sits higher. */
const bottomOf = (short: boolean) => BASE + (short ? LONG - SHORT : 0)
const PULL = 50 // px of upward drag that commits a straw

export default function DrawStraws({ info, lock, onFinish, onError }: ActivityProps) {
  const [picked, setPicked] = useState<number | null>(null)
  const [deadly, setDeadly] = useState<number | null>(null)
  const straws = useRef<(HTMLDivElement | null)[]>([])
  const drag = useRef<{ i: number; y: number } | null>(null)

  function down(i: number, e: React.PointerEvent) {
    if (picked !== null) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { i, y: e.clientY }
  }

  function move(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const dy = Math.min(0, e.clientY - d.y)
    gsap.set(straws.current[d.i], { y: dy })
    if (dy < -PULL) {
      drag.current = null
      pull(d.i)
    }
  }

  function up() {
    const d = drag.current
    drag.current = null
    if (d) gsap.to(straws.current[d.i], { y: 0, duration: motionSeconds(0.25), ease: 'back.out(2)' })
  }

  async function pull(i: number) {
    if (picked !== null) return
    setPicked(i)
    gsap.to(straws.current[i], { y: -30, duration: motionSeconds(0.4) })
    try {
      const [res] = await Promise.all([lock(i), wait(500)])
      const o = res.outcome!
      setDeadly(o.deadly!)
      // Pull the chosen straw (and the short one, if different) fully out of the fist.
      const out = [i, ...(o.deadly !== i ? [o.deadly!] : [])]
      await Promise.all(
        out.map((k) => gsap.to(straws.current[k], { y: Math.min(-(FIST + 10 - bottomOf(k === o.deadly)), -30), duration: motionSeconds(0.7), ease: 'power2.out' }).then()),
      )
      if (!o.survived) flash('#e8402a')
      await wait(1200)
      onFinish(res)
    } catch (e) {
      setPicked(null)
      onError(e)
    }
  }

  return (
    <Stage title={info.name} rule={info.rule}>
      <div className="no-touch-scroll relative mx-auto h-[330px] max-w-xs overflow-hidden" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="absolute inset-x-6 bottom-0 flex h-full items-end justify-center gap-3">
          {Array.from({ length: info.choices }, (_, i) => (
            <div
              key={i}
              ref={(el) => void (straws.current[i] = el)}
              onPointerDown={(e) => down(i, e)}
              className="relative w-5 cursor-grab rounded-sm active:cursor-grabbing"
              style={{
                height: deadly === i ? SHORT : LONG,
                marginBottom: bottomOf(deadly === i),
                background: 'repeating-linear-gradient(180deg,#ece3d0 0 10px,#e8402a 10px 20px)',
              }}
              aria-label={`Straw ${i + 1}`}
            />
          ))}
        </div>
        <div className="pixel-fist pointer-events-none absolute inset-x-4 bottom-0 z-10 flex h-[120px] items-center justify-center">
          <div className="flex gap-4 opacity-40">
            {[0, 1, 2, 3].map((k) => (
              <span key={k} className="h-10 w-1 rounded bg-[#6b3f25]" />
            ))}
          </div>
        </div>
      </div>
      <A11yChoices n={info.choices} label={(i) => `Pull straw ${i + 1}`} onPick={pull} disabled={picked !== null} />
    </Stage>
  )
}
