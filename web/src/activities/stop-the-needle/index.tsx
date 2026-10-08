import gsap from 'gsap'
import { useEffect, useRef, useState } from 'react'
import { flash, wait, motionSeconds } from '../../lib/fx'
import Stage from '../Stage'
import type { ActivityProps } from '../types'
import { pixelCircle } from '../../lib/pixel'

const C = 150
const SPEED = 280 // degrees per second

function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return [C + r * Math.sin(rad), C - r * Math.cos(rad)]
}

/** Donut sector between r1 and r2, clockwise from `from` degrees (0 = top) spanning `span`. */
function sector(r1: number, r2: number, from: number, span: number) {
  const large = span > 180 ? 1 : 0
  const [ax, ay] = polar(r2, from)
  const [bx, by] = polar(r2, from + span)
  const [cx, cy] = polar(r1, from + span)
  const [dx, dy] = polar(r1, from)
  return `M${ax} ${ay} A${r2} ${r2} 0 ${large} 1 ${bx} ${by} L${cx} ${cy} A${r1} ${r1} 0 ${large} 0 ${dx} ${dy} Z`
}

export default function StopTheNeedle({ info, lock, onFinish, onError }: ActivityProps) {
  const [stopped, setStopped] = useState(false)
  const [zone, setZone] = useState<{ start: number; width: number } | null>(null)
  const needle = useRef<SVGGElement>(null)
  const zoneRef = useRef<SVGPathElement>(null)
  const angle = useRef(Math.random() * 360)
  const raf = useRef(0)
  const lastT = useRef(0)

  useEffect(() => {
    const tick = (t: number) => {
      if (lastT.current) angle.current = (angle.current + ((t - lastT.current) / 1000) * SPEED) % 360
      lastT.current = t
      needle.current?.setAttribute('transform', `rotate(${angle.current} ${C} ${C})`)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  useEffect(() => {
    if (zone && zoneRef.current) gsap.fromTo(zoneRef.current, { opacity: 0 }, { opacity: 0.85, duration: motionSeconds(0.5), ease: 'power2.out' })
  }, [zone])

  async function stop() {
    if (stopped) return
    cancelAnimationFrame(raf.current)
    setStopped(true)
    const value = (((angle.current % 360) + 360) % 360) / 360
    try {
      const [res] = await Promise.all([lock(value), wait(500)])
      const o = res.outcome!
      setZone({ start: o.zoneStart! * 360, width: o.zoneWidth! * 360 })
      await wait(700)
      if (!o.survived) flash('#e8402a')
      await wait(1100)
      onFinish(res)
    } catch (e) {
      setStopped(false)
      onError(e)
    }
  }

  return (
    <Stage title={info.name} rule={info.rule}>
      <div className="mx-auto max-w-xs">
        <svg viewBox="0 0 300 300" className="no-touch-scroll w-full cursor-pointer" onPointerDown={stop} role="img" aria-label="Spinning dial">
          <path d={pixelCircle(C, C, 140)} fill="#14171a" stroke="#34383b" strokeWidth="4" />
          {Array.from({ length: 60 }, (_, i) => {
            const [x1, y1] = polar(i % 5 ? 126 : 116, i * 6)
            const [x2, y2] = polar(134, i * 6)
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9a8e7a" strokeWidth={i % 5 ? 1 : 2.5} />
          })}
          {zone && <path ref={zoneRef} d={sector(60, 134, zone.start, zone.width)} fill="#e8402a" opacity="0" />}
          {!zone && <text x={C} y={C + 60} textAnchor="middle" fontFamily="Inter" fontSize="13" fill="#9a8e7a">Zone hidden</text>}
          <g ref={needle}>
            <line x1={C} y1={C + 18} x2={C} y2="28" stroke="#ece3d0" strokeWidth="5" strokeLinecap="round" />
            <circle cx={C} cy="34" r="5" fill="#f5a524" />
          </g>
          <path d={pixelCircle(C, C, 14, 4)} fill="#ece3d0" />
        </svg>
        <button
          onClick={stop}
          disabled={stopped}
          className="pixel-button pixel-button-primary display mt-6 w-full"
        >
          Stop
        </button>
      </div>
    </Stage>
  )
}
