import type { Hint } from '../types'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** The round's hint: clues pointing at a few valid answers, and the letters answers start with. Names no answer. */
export default function HintPanel({ hint }: { hint: Hint }) {
  const letters = hint.startsWith
  const grid = letters && letters.every((l) => l.length === 1 && ALPHABET.includes(l))
  return (
    <section className="pixel-panel hint-panel rise-in" aria-label="Hint">
      <div>
        <span className="eyebrow">Think of</span>
        <ul className="hint-clues">
          {hint.clues.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
      {letters && (
        <div>
          <span className="eyebrow">Starts with</span>
          {grid ? (
            <div className="hint-letters" aria-label={`Answers start with ${letters.join(', ')}`}>
              {ALPHABET.map((l) => (
                <span key={l} className={letters.includes(l) ? 'is-on' : ''} aria-hidden="true">
                  {l}
                </span>
              ))}
            </div>
          ) : (
            <div className="hint-chips">
              {letters.map((p) => (
                <span key={p}>{p}…</span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
