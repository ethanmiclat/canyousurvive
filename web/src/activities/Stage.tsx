import type { ReactNode } from 'react'

export default function Stage({ title, rule, children }: { title: string; rule: string; children: ReactNode }) {
  return (
    <div className="activity-stage">
      <p className="headline text-3xl sm:text-4xl">{title}</p>
      <p className="mt-2 text-mute">{rule}</p>
      <div className="mt-6">{children}</div>
    </div>
  )
}

/** Keyboard and screen-reader fallback for gesture-only activities. */
export function A11yChoices({ n, label, onPick, disabled }: { n: number; label: (i: number) => string; onPick: (i: number) => void; disabled: boolean }) {
  return (
    <div className="sr-only focus-within:not-sr-only focus-within:mt-4 focus-within:flex focus-within:flex-wrap focus-within:gap-2">
      {Array.from({ length: n }, (_, i) => (
        <button key={i} disabled={disabled} onClick={() => onPick(i)} className="pixel-tile px-3 py-2 text-sm">
          {label(i)}
        </button>
      ))}
    </div>
  )
}
