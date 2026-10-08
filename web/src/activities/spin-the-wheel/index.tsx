import gsap from 'gsap'
import { useRef, useState } from 'react'
import { flash, wait, motionSeconds } from '../../lib/fx'
import Stage from '../Stage'
import type { ActivityProps } from '../types'
import { pixelCircle } from '../../lib/pixel'

const C = 150
const R = 132
const SEGMENTS = 12

function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return [C + r * Math.sin(rad), C - r * Math.cos(rad)]
}

function wedge(r: number, from: number, span: number) {
  const [ax, ay] = polar(r, from)
  const [bx, by] = polar(r, from + span)
  return `M${C} ${C} L${ax} ${ay} A${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${bx} ${by} Z`
}

export default function SpinTheWheel({ info, lock, onFinish, onError }: ActivityProps) {
  const [spun, setSpun] = useState(false)
  const [hint, setHint] = useState('')
  const [zone, setZone] = useState<{ start: number; width: number } | null>(null)
  const wheel = useRef<SVGGElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const rotation = useRef(0)
  const samples = useRef<{ a: number; t: number }[]>([])

  const pointerAngle = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    const x = e.clientX - (r.left + r.width / 2)
    const y = e.clientY - (r.top + r.height / 2)
    return (Math.atan2(x, -y) * 180) / Math.PI
  }

  const setRot = (deg: number) => {
    rotation.current = deg
    wheel.current?.setAttribute('transform', `rotate(${deg} ${C} ${C})`)
  }

  function down(e: React.PointerEvent) {
    if (spun) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    samples.current = [{ a: pointerAngle(e), t: performance.now() }]
    setHint('')
  }

  function move(e: React.PointerEvent) {
    if (spun || !samples.current.length) return
    const a = pointerAngle(e)
    const prev = samples.current[samples.current.length - 1]
    let d = a - prev.a
    if (d > 180) d -= 360
    if (d < -180) d += 360
    setRot(rotation.current + d)
    samples.current = [...samples.current.slice(-5), { a, t: performance.now() }]
  }

  function up() {
    if (spun || samples.current.length < 2) return void (samples.current = [])
    const first = samples.current[0]
    const last = samples.current[samples.current.length - 1]
    let d = 0
    for (let k = 1; k < samples.current.length; k++) {
      let s = samples.current[k].a - samples.current[k - 1].a
      if (s > 180) s -= 360
      if (s < -180) s += 360
      d += s
    }
    const v = d / Math.max(16, last.t - first.t) // degrees per ms
    samples.current = []
    if (Math.abs(v) < 0.25) return setHint('Flick it harder!')
    spin(v)
  }

  async function spin(v: number) {
    if (spun) return
    setSpun(true)
    const dir = Math.sign(v) || 1
    const final = rotation.current + dir * (900 + Math.min(Math.abs(v) * 900, 1440))
    // The pointer sits at the top; the wheel position under it is -rotation.
    const value = (((-final % 360) + 360) % 360) / 360
    try {
      const res = await lock(Math.min(value, 0.999999))
      const o = res.outcome!
      const from = { r: rotation.current }
      await gsap.to(from, { r: final, duration: motionSeconds(3.6), ease: 'power3.out', onUpdate: () => setRot(from.r) }).then()
      setZone({ start: o.zoneStart! * 360, width: o.zoneWidth! * 360 })
      await wait(800)
      if (!o.survived) flash('#e8402a')
      await wait(1100)
      onFinish(res)
    } catch (e) {
      setSpun(false)
      onError(e)
    }
  }

  return (
    <Stage title={info.name} rule={info.rule}>
      <div className="mx-auto max-w-xs">
        <svg
          ref={svg}
          viewBox="0 0 300 300"
          className="no-touch-scroll w-full cursor-grab active:cursor-grabbing"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          role="img"
          aria-label="Wheel"
        >
          <g ref={wheel}>
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <path key={i} d={wedge(R, (i * 360) / SEGMENTS, 360 / SEGMENTS)} fill={i % 2 ? '#211c15' : '#2b241b'} stroke="#0d0b09" strokeWidth="2" />
            ))}
            {zone && <path d={wedge(R, zone.start, zone.width)} fill="#e8402a" opacity="0.9" />}
            {Array.from({ length: SEGMENTS }, (_, i) => {
              const [x, y] = polar(R - 24, (i + 0.5) * (360 / SEGMENTS))
              return (
                <text key={i} x={x} y={y + 5} textAnchor="middle" fontFamily="Anton" fontSize="16" fill="#9a8e7a">
                  {i + 1}
                </text>
              )
            })}
          </g>
          <path d={pixelCircle(C, C, R + 4)} fill="none" stroke="#ece3d0" strokeOpacity="0.3" strokeWidth="3" />
          <path d={pixelCircle(C, C, 18, 4)} fill="#ece3d0" />
          <path d={`M${C - 12} 4 L${C + 12} 4 L${C} 30 Z`} fill="#f5a524" stroke="#0d0b09" strokeWidth="2" />
        </svg>
        <div className="mt-3 h-5 text-center text-sm font-semibold text-amber" aria-live="polite">
          {hint}
        </div>
        <button
          onClick={() => spin(0.6 + Math.random() * 1.2)}
          disabled={spun}
          className="pixel-tile mt-2 w-full py-3 text-sm text-mute"
        >
          Or tap to spin
        </button>
      </div>
    </Stage>
  )
}
