import gsap from 'gsap'
import PixelIcon from '../../components/PixelIcon'
import { useLayoutEffect, useRef, useState } from 'react'
import { flash, wait, motionSeconds } from '../../lib/fx'
import Stage from '../Stage'
import type { ActivityProps } from '../types'

const HOLD = 0.9 // seconds to commit
const RING = 208 // perimeter of the 52px square hold indicator

export default function Elevator({ info, lock, onFinish, onError }: ActivityProps) {
  const n = info.choices
  const [picked, setPicked] = useState<number | null>(null)
  const [deadly, setDeadly] = useState<number | null>(null)
  const [floor, setFloor] = useState<string>('G')
  const [arrived, setArrived] = useState<'safe' | 'fire' | null>(null)
  const rings = useRef<(SVGRectElement | null)[]>([])
  const holds = useRef<(gsap.core.Tween | null)[]>([])
  const left = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)

  // Doors start open.
  useLayoutEffect(() => {
    gsap.set(left.current, { xPercent: -100 })
    gsap.set(right.current, { xPercent: 100 })
  }, [])

  function press(i: number) {
    if (picked !== null) return
    holds.current[i]?.kill()
    holds.current[i] = gsap.to(rings.current[i], { strokeDashoffset: 0, duration: HOLD, ease: 'none', onComplete: () => go(i) })
  }

  function release(i: number) {
    if (picked !== null) return
    holds.current[i]?.kill()
    gsap.to(rings.current[i], { strokeDashoffset: RING, duration: motionSeconds(0.2) })
  }

  async function go(i: number) {
    if (picked !== null) return
    setPicked(i)
    try {
      await gsap.to([left.current, right.current], { xPercent: 0, duration: motionSeconds(0.5), ease: 'power2.inOut' }).then()
      const [res] = await Promise.all([
        lock(i),
        (async () => {
          for (let f = 1; f <= i + 1; f++) {
            await wait(380)
            setFloor(String(f))
          }
        })(),
      ])
      const o = res.outcome!
      setDeadly(o.deadly!)
      setArrived(o.survived ? 'safe' : 'fire')
      await wait(250)
      await gsap.to(left.current, { xPercent: -100, duration: motionSeconds(0.6), ease: 'power2.inOut' }).then()
      gsap.to(right.current, { xPercent: 100, duration: motionSeconds(0.6), ease: 'power2.inOut' })
      if (!o.survived) flash('#ff6a00', 0.9)
      await wait(1400)
      onFinish(res)
    } catch (e) {
      setPicked(null)
      onError(e)
    }
  }

  return (
    <Stage title={info.name} rule={info.rule}>
      <div className="mx-auto grid max-w-sm grid-cols-[1fr_auto] items-start gap-5">
        <div>
          <div className="mx-auto mb-2 w-16 rounded bg-ink py-1 text-center font-mono text-lg font-bold text-amber">{floor}</div>
          <div className="relative h-60 overflow-hidden rounded-lg border-4 border-line bg-panel-2">
            <div
              className={`absolute inset-0 flex items-center justify-center transition-colors duration-500 ${
                arrived === 'fire' ? 'bg-gradient-to-t from-[#ff6a00] to-blood' : arrived === 'safe' ? 'bg-gradient-to-t from-safe/30 to-panel-2' : ''
              }`}
            >
              {arrived && <PixelIcon name={arrived === 'fire' ? 'flame' : 'check'} size={64} className={arrived === 'fire' ? 'text-amber' : 'text-safe'} aria-label={arrived === 'fire' ? 'Fire' : 'Safe floor'} />}
            </div>
            <div ref={left} className="absolute inset-y-0 left-0 w-1/2 border-r-4 border-ink bg-[#343a3e]" />
            <div ref={right} className="absolute inset-y-0 right-0 w-1/2 border-l-4 border-ink bg-[#41484c]" />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-3 rounded-xl border border-line bg-panel p-3 pt-4">
          {Array.from({ length: n }, (_, i) => (
            <button
              key={i}
              onPointerDown={() => press(i)}
              onPointerUp={() => release(i)}
              onPointerLeave={() => release(i)}
              onPointerCancel={() => release(i)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && press(i)}
              onKeyUp={() => release(i)}
              onContextMenu={(e) => e.preventDefault()}
              disabled={picked !== null && picked !== i}
              aria-label={`Floor ${i + 1}, press and hold`}
              className="no-touch-scroll relative h-16 w-16"
            >
              <svg viewBox="0 0 60 60" className="absolute inset-0">
                <rect x="4" y="4" width="52" height="52" fill={deadly === i ? '#7a1d0f' : picked === i ? '#3a3020' : '#1c2023'} stroke="#34383b" strokeWidth="3" />
                <rect
                  ref={(el) => void (rings.current[i] = el)}
                  x="4"
                  y="4"
                  width="52"
                  height="52"
                  fill="none"
                  stroke="#f5a524"
                  strokeWidth="4"
                  strokeDasharray={RING}
                  strokeDashoffset={picked === i ? 0 : RING}
                />
              </svg>
              <span className="display relative text-2xl">{i + 1}</span>
            </button>
          ))}
        </div>
      </div>
    </Stage>
  )
}
