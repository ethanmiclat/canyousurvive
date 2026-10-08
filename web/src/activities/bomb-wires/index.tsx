import gsap from 'gsap'
import PixelIcon from '../../components/PixelIcon'
import { useRef, useState } from 'react'
import { flash, shake, wait, motionSeconds } from '../../lib/fx'
import Stage, { A11yChoices } from '../Stage'
import type { ActivityProps } from '../types'

const COLORS = ['#e8402a', '#3d8bff', '#f5a524', '#a3e635', '#ece3d0']
const NAMES = ['red', 'blue', 'yellow', 'green', 'white']
const W = 300
const H = 280
const TOP = 70
const BOTTOM = 250
const MID = 160
const xs = (i: number) => 40 + i * 55

export default function BombWires({ info, lock, onFinish, onError }: ActivityProps) {
  const [cut, setCut] = useState<number | null>(null)
  const [deadly, setDeadly] = useState<number | null>(null)
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([])
  const svg = useRef<SVGSVGElement>(null)
  const lower = useRef<(SVGPathElement | null)[]>([])
  const last = useRef<{ x: number; y: number } | null>(null)

  const toSvg = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }

  async function snip(i: number) {
    if (cut !== null) return
    setCut(i)
    setTrail([])
    last.current = null
    gsap.to(lower.current[i], { y: 24, rotation: 8, transformOrigin: '50% 100%', opacity: 0.5, duration: motionSeconds(0.5), ease: 'power2.in' })
    try {
      const [res] = await Promise.all([lock(i), wait(700)])
      const o = res.outcome!
      setDeadly(o.deadly!)
      if (!o.survived) {
        flash('#ffffff', 0.25)
        setTimeout(() => flash('#e8402a', 0.9), 120)
        shake(svg.current?.parentElement ?? null)
      }
      await wait(1300)
      onFinish(res)
    } catch (e) {
      setCut(null)
      onError(e)
    }
  }

  function move(e: React.PointerEvent) {
    if (cut !== null || !(e.buttons & 1) && e.pointerType === 'mouse') return
    const p = toSvg(e)
    const prev = last.current
    last.current = p
    setTrail((t) => [...t.slice(-12), p])
    if (!prev || p.y < TOP + 10 || p.y > BOTTOM - 10) return
    for (let i = 0; i < info.choices; i++) {
      const wx = xs(i)
      if ((prev.x - wx) * (p.x - wx) < 0) return void snip(i)
    }
  }

  return (
    <Stage title={info.name} rule={info.rule}>
      <div className="mx-auto max-w-sm">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="no-touch-scroll w-full cursor-crosshair"
          onPointerDown={(e) => {
            ;(e.target as Element).setPointerCapture?.(e.pointerId)
            last.current = toSvg(e)
          }}
          onPointerMove={move}
          onPointerUp={() => ((last.current = null), setTrail([]))}
        >
          <rect x="20" y="10" width="260" height="60" rx="10" fill="#211c15" stroke="#342c22" strokeWidth="2" />
          <rect x="95" y="22" width="110" height="36" rx="6" fill="#0d0b09" />
          <text x="150" y="48" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="22" fill={deadly !== null && deadly !== cut ? '#a3e635' : '#e8402a'}>
            {cut === null ? '00:07' : deadly === null ? '00:0?' : deadly === cut ? '00:00' : 'SAFE'}
          </text>
          <rect x="20" y={BOTTOM} width="260" height="18" rx="6" fill="#211c15" stroke="#342c22" strokeWidth="2" />
          {COLORS.slice(0, info.choices).map((c, i) => {
            const x = xs(i)
            const glow = deadly === i
            return (
              <g key={i} style={{ filter: glow ? `drop-shadow(0 0 6px ${c})` : undefined }}>
                <path d={`M${x} ${TOP} V100 H${x - 8} V125 H${x} V${MID}`} stroke={c} strokeWidth="7" fill="none" />
                <path
                  ref={(el) => void (lower.current[i] = el)}
                  d={`M${x} ${MID + (cut === i ? 8 : 0)} V190 H${x + 8} V220 H${x} V${BOTTOM}`}
                  stroke={c}
                  strokeWidth="7"
                  fill="none"
                  strokeLinecap="square"
                />
                {glow && <PixelIcon name="bomb" x={x - 10} y={MID - 10} width={20} height={20} color="#ece3d0" aria-label="The live wire" />}
              </g>
            )
          })}
          {trail.length > 1 && <polyline points={trail.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ece3d0" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />}
        </svg>
        <A11yChoices n={info.choices} label={(i) => `Cut the ${NAMES[i]} wire`} onPick={snip} disabled={cut !== null} />
      </div>
    </Stage>
  )
}
