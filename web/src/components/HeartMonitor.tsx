import { useEffect, useRef } from 'react'
import { reducedMotion } from '../lib/fx'

const W = 400
const BASE = 50

/** One heartbeat starting at x, 100 units wide: P wave, QRS spike, T wave. */
const beat = (x: number) =>
  `L${x + 14},${BASE} C${x + 18},${BASE - 7} ${x + 24},${BASE - 7} ${x + 28},${BASE} ` +
  `L${x + 36},${BASE} C${x + 38},${BASE + 4} ${x + 39},${BASE + 8} ${x + 40},${BASE + 8} ` +
  `C${x + 42},${BASE - 20} ${x + 44},${BASE - 40} ${x + 46},${BASE - 40} ` +
  `C${x + 48},${BASE - 10} ${x + 50},${BASE + 30} ${x + 52},${BASE + 30} ` +
  `C${x + 54},${BASE + 12} ${x + 55},${BASE} ${x + 58},${BASE} ` +
  `L${x + 66},${BASE} C${x + 72},${BASE - 11} ${x + 82},${BASE - 11} ${x + 88},${BASE} L${x + 100},${BASE}`

const ALIVE = `M0,${BASE} ${beat(0)} ${beat(100)} ${beat(200)} ${beat(300)}`
// Hurt but alive: two beats a sweep, far apart.
const WEAK = `M0,${BASE} ${beat(0)} L${W / 2},${BASE} ${beat(W / 2)} L${W},${BASE}`
// One last beat, then nothing.
const FLATLINE = `M0,${BASE} ${beat(0)} L${W},${BASE}`

/** The monitor is drawn on this grid of cells and scaled up without smoothing, so the trace is pixel art. */
const COLS = 120
const ROWS = 30

/**
 * A monitor trace that sweeps left to right, like a hospital monitor: steady beats while alive, slow ones
 * when weak, one beat and then a flat line that keeps moving when dead. Loops until unmounted.
 */
export default function HeartMonitor({ alive, weak = false }: { alive: boolean; weak?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const shape = useRef<SVGPathElement>(null)

  useEffect(() => {
    const cv = canvas.current!
    const ctx = cv.getContext('2d')!
    const color = getComputedStyle(cv).color
    const trace = spansFor(shape.current!)
    const baseRow = rowOf(BASE)
    const flat: Span[] = Array.from({ length: COLS }, () => [baseRow, baseRow])

    const draw = (spans: Span[], head: number) => {
      ctx.clearRect(0, 0, COLS, ROWS)
      ctx.fillStyle = 'rgb(255 255 255 / .12)'
      for (let c = head + 3; c < COLS; c += 3) ctx.fillRect(c, baseRow, 1, 1)
      ctx.fillStyle = color
      for (let c = 0; c <= head; c++) ctx.fillRect(c, spans[c][0], 1, spans[c][1] - spans[c][0] + 1)
      const [top, bottom] = spans[head]
      ctx.fillRect(head, Math.round((top + bottom) / 2) - 1, 2, 2)
    }

    if (reducedMotion()) {
      draw(trace, COLS - 1)
      return
    }
    const sweepMs = weak ? 1900 : alive ? 1500 : 1300
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      // A frame's timestamp can be slightly earlier than start.
      const elapsed = Math.max(0, now - start)
      // After the last beat, every later sweep is just the flat line moving across.
      const spans = !alive && elapsed >= sweepMs ? flat : trace
      draw(spans, Math.min(COLS - 1, Math.floor(((elapsed % sweepMs) / sweepMs) * COLS)))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [alive, weak])

  return (
    <>
      {/* Only used to sample the trace's shape; never shown. */}
      <svg className="absolute size-0" aria-hidden="true">
        <path ref={shape} d={!alive ? FLATLINE : weak ? WEAK : ALIVE} />
      </svg>
      <canvas ref={canvas} className="heart-monitor" width={COLS} height={ROWS} aria-hidden="true" />
    </>
  )
}

/** The lowest and highest row the trace passes through in one column. */
type Span = [number, number]

const rowOf = (y: number) => Math.round((y / 100) * (ROWS - 1))

/** Sample the path densely and record each column's span, so even the narrow spike keeps its full height. */
function spansFor(path: SVGPathElement): Span[] {
  const spans: Span[] = Array.from({ length: COLS }, () => [ROWS, -1])
  const length = path.getTotalLength()
  const steps = COLS * 24
  for (let i = 0; i <= steps; i++) {
    const pt = path.getPointAtLength((i / steps) * length)
    const span = spans[Math.min(COLS - 1, Math.floor((pt.x / W) * COLS))]
    const row = rowOf(pt.y)
    span[0] = Math.min(span[0], row)
    span[1] = Math.max(span[1], row)
  }
  return spans
}
