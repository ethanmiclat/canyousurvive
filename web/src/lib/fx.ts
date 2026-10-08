import gsap from 'gsap'

/** Full-screen color flash, used for deaths and explosions. */
export function flash(color: string, duration = 0.6) {
  if (reducedMotion()) return
  const el = document.createElement('div')
  Object.assign(el.style, { position: 'fixed', inset: '0', background: color, pointerEvents: 'none', zIndex: '60', opacity: '0' })
  document.body.appendChild(el)
  gsap.timeline({ onComplete: () => el.remove() }).to(el, { opacity: 0.12, duration: 0.12 }).to(el, { opacity: 0, duration })
}

export function shake(el: Element | null) {
  if (!el || reducedMotion()) return
  el.classList.remove('shake')
  void (el as HTMLElement).offsetWidth
  el.classList.add('shake')
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, reducedMotion() ? Math.min(ms, 100) : ms))

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Shorten decorative tweening while preserving interactive hold/timing mechanics. */
export const motionSeconds = (seconds: number) => reducedMotion() ? 0.01 : seconds
