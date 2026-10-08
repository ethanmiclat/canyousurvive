import gsap from 'gsap'
import { useLayoutEffect, useRef } from 'react'
import { reducedMotion } from '../lib/fx'
import type { Villain } from '../types'
import PixelIcon from './PixelIcon'
import { Button } from './ui'

/** The day's boss, revealed after Play: the skull drops in, the name slams down and flickers, the screen shakes. */
export default function BossIntro({ villain, onDone }: { villain: Villain; onDone: () => void }) {
  const root = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const el = root.current!
    // A context so cleanup (including React's dev double-run) reverts every tween's inline styles.
    const ctx = gsap.context(() => {
      if (reducedMotion()) {
        gsap.from(el, { opacity: 0, duration: 0.3 })
        return
      }
      gsap
        .timeline()
        .from('.boss-sigil', { y: -60, opacity: 0, duration: 0.45, ease: 'steps(6)' })
        .from('.eyebrow', { opacity: 0, duration: 0.3, ease: 'steps(3)' }, 0.4)
        .fromTo('.boss-title', { opacity: 0, scale: 1.8 }, { opacity: 1, scale: 1, duration: 0.28, ease: 'power4.in' }, 0.75)
        .fromTo('.boss-title', { opacity: 1 }, { opacity: 0.2, duration: 0.06, repeat: 3, yoyo: true, ease: 'steps(1)', immediateRender: false }, 1.03)
        .fromTo('.boss-quake', { x: 0 }, { x: () => gsap.utils.random([-8, -4, 4, 8]), y: () => gsap.utils.random([-4, 4]), duration: 0.05, repeat: 5, yoyo: true, ease: 'steps(1)', clearProps: 'x,y' }, 1.03)
        .from('.boss-greeting', { opacity: 0, y: 8, duration: 0.4, ease: 'steps(4)' }, 1.45)
        .from('.boss-go', { opacity: 0, y: 12, duration: 0.3, ease: 'steps(3)' }, 1.9)
    }, el)
    return () => ctx.revert()
  }, [])

  return <section ref={root} className="boss-intro" aria-labelledby="boss-name">
    <div className="boss-quake flex flex-col items-center">
      <div className="boss-sigil" style={{ color: villain.color }}><PixelIcon size={128} aria-hidden="true" /></div>
      <p className="eyebrow mt-6">Your opponent today</p>
      <h2 id="boss-name" className="display boss-title" style={{ color: villain.color, textShadow: `0 0 28px ${villain.color}44` }}>{villain.name}</h2>
      <p className="boss-greeting">“{villain.greeting}”</p>
    </div>
    <Button variant="danger" className="boss-go hero-button mt-12 w-full" onClick={onDone} autoFocus>Begin <span className="ml-3" aria-hidden="true">→</span></Button>
  </section>
}
