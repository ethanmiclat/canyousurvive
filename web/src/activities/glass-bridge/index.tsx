import gsap from 'gsap'
import { useEffect, useRef, useState } from 'react'
import { flash, wait, motionSeconds } from '../../lib/fx'
import Stage, { A11yChoices } from '../Stage'
import type { ActivityProps } from '../types'

const PERIOD = 1.5 // seconds per sweep across the bridge

export default function GlassBridge({ info, lock, onFinish, onError }: ActivityProps) {
  const n = info.choices
  const [holding, setHolding] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [deadly, setDeadly] = useState<number | null>(null)
  const [aim, setAim] = useState(0)
  const marker = useRef<HTMLDivElement>(null)
  const player = useRef<HTMLDivElement>(null)
  const panes = useRef<(HTMLDivElement | null)[]>([])
  const start = useRef(0)
  const pos = useRef(0)
  const raf = useRef(0)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  function tick(t: number) {
    const phase = ((t - start.current) / 1000 / PERIOD) % 2
    pos.current = phase < 1 ? phase : 2 - phase // ping-pong 0..1..0
    if (marker.current) marker.current.style.left = `${pos.current * 100}%`
    setAim(Math.min(n - 1, Math.floor(pos.current * n)))
    raf.current = requestAnimationFrame(tick)
  }

  function down(e: React.PointerEvent) {
    if (picked !== null) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setHolding(true)
    start.current = performance.now()
    raf.current = requestAnimationFrame(tick)
  }

  function up() {
    if (!holding || picked !== null) return
    cancelAnimationFrame(raf.current)
    setHolding(false)
    jump(Math.min(n - 1, Math.floor(pos.current * n)))
  }

  async function jump(i: number) {
    if (picked !== null) return
    setPicked(i)
    try {
      const target = panes.current[i]!.getBoundingClientRect()
      const me = player.current!.getBoundingClientRect()
      const dx = target.left + target.width / 2 - (me.left + me.width / 2)
      const dy = target.top + target.height / 2 - (me.top + me.height / 2)
      const [res] = await Promise.all([
        lock(i),
        gsap
          .timeline()
          .to(player.current, { x: dx, duration: motionSeconds(0.6), ease: 'none' }, 0)
          .to(player.current, { y: dy - 50, duration: motionSeconds(0.3), ease: 'power2.out' }, 0)
          .to(player.current, { y: dy, duration: motionSeconds(0.3), ease: 'power2.in' }, 0.3)
          .then(),
      ])
      const o = res.outcome!
      setDeadly(o.deadly!)
      if (!o.survived) {
        const shards = panes.current[i]!.querySelectorAll('[data-shard]')
        gsap.to(shards, { y: () => 120 + Math.random() * 80, x: () => (Math.random() - 0.5) * 80, rotation: () => (Math.random() - 0.5) * 180, opacity: 0, duration: motionSeconds(0.9), ease: 'power2.in' })
        gsap.to(player.current, { y: dy + 160, scale: 0.4, opacity: 0, duration: motionSeconds(0.8), ease: 'power2.in', delay: 0.1 })
        flash('#e8402a')
      } else {
        gsap.fromTo(player.current, { scale: 1 }, { scale: 1.15, duration: motionSeconds(0.15), yoyo: true, repeat: 1 })
      }
      await wait(1300)
      onFinish(res)
    } catch (e) {
      setPicked(null)
      onError(e)
    }
  }

  return (
    <Stage title={info.name} rule={info.rule}>
      <div className="mx-auto max-w-sm">
        <div className="relative mb-2 h-4">
          <div ref={marker} className={`absolute -translate-x-1/2 text-amber transition-opacity ${holding ? 'opacity-100' : 'opacity-0'}`} style={{ left: 0 }}>
            ▼
          </div>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {Array.from({ length: n }, (_, i) => (
            <div
              key={i}
              ref={(el) => void (panes.current[i] = el)}
              className={`relative h-36 overflow-visible rounded-md border transition ${holding && aim === i ? 'border-amber' : 'border-bone/30'}`}
            >
              {/* The pane is drawn as shards so it can shatter. */}
              {[0, 1, 2, 3].map((s) => (
                <div
                  key={s}
                  data-shard
                  className="absolute bg-gradient-to-br from-sky-200/25 to-sky-400/10"
                  style={{ left: s % 2 ? '50%' : 0, top: s > 1 ? '50%' : 0, width: '50%', height: '50%' }}
                />
              ))}
              {deadly === i && picked !== i && (
                <svg viewBox="0 0 40 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                  <path d="M20 0 L16 30 L26 45 L12 70 L22 100 M16 30 L4 40 M26 45 L38 52" stroke="#e8402a" strokeWidth="1.5" fill="none" />
                </svg>
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-center">
          <div ref={player} className="pixel-player relative z-10 h-10 w-10 bg-amber" aria-hidden />
        </div>
        <button
          onPointerDown={down}
          onPointerUp={up}
          onPointerCancel={up}
          disabled={picked !== null}
          className={`no-touch-scroll pixel-button pixel-button-light display mt-6 w-full ${holding ? 'is-held' : ''}`}
        >
          {holding ? `Release to jump (pane ${aim + 1})` : 'Hold to aim'}
        </button>
        <A11yChoices n={n} label={(i) => `Jump to pane ${i + 1}`} onPick={jump} disabled={picked !== null} />
      </div>
    </Stage>
  )
}
