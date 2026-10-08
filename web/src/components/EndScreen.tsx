import PixelIcon from './PixelIcon'
import { useEffect, useState } from 'react'
import { todayStats } from '../api'
import { outcomeLine, share, shareText } from '../lib/share'
import { recordFinish, type Streak } from '../lib/streak'
import type { PublicRun, Stats, Today } from '../types'
import Countdown from './Countdown'
import { outcomeText } from './Reveal'
import { Button, SectionTitle } from './ui'

/** Blocks a death bar is drawn in, so it reads as pixels rather than a smooth bar. */
const BAR_BLOCKS = 16

export default function EndScreen({ today, run, initialStats }: { today: Today; run: PublicRun; initialStats: Stats | null }) {
  const won = run.status === 'won'
  const [stats, setStats] = useState<Stats | null>(initialStats)
  const [streak, setStreak] = useState<Streak | null>(null)
  const [shareState, setShareState] = useState('')
  const text = shareText(today, run)
  // The round of the final, fatal loss; earlier losses were hits the run survived.
  const deathRound = won ? undefined : run.results.at(-1)?.round
  const survived = run.results.filter((r) => r.survived).length
  const total = today.rounds.length

  useEffect(() => {
    setStreak(recordFinish(today.date, won))
    if (!initialStats) todayStats().then(setStats).catch(() => {})
  }, [today.date, won, initialStats])

  const maxDeaths = Math.max(1, ...(stats?.deaths ?? [0]))

  return (
    <div className="end-screen rise-in">
      <div className={`end-verdict ${won ? 'text-safe' : 'text-blood'}`}>
        <PixelIcon name={won ? 'check' : 'skull'} size={56} aria-hidden="true" />
        <h2 className="display mt-4">{won ? 'You survived' : 'You didn’t make it'}</h2>
        <p className="mt-2 text-mute">{won ? `You took ${today.villain.ref} down. Come back tomorrow for the next fight.` : `${today.villain.name} got you in round ${deathRound}.`}</p>
      </div>

      {/* The card players share. The copied text keeps emoji squares; on screen they're drawn as pixels. */}
      <section className="share-card" aria-label="Share card">
        <div>
          <div className="display text-xl">Can you survive #{today.puzzle}</div>
          <div className="text-sm text-mute">vs. {today.villain.name}</div>
        </div>
        <div className="share-squares" role="img" aria-label={`Survived ${survived} of ${total}`}>
          {Array.from({ length: total }, (_, i) => {
            const r = run.results.find((x) => x.round === i + 1)
            return <span key={i} className={r ? (r.survived ? 'bg-safe' : 'bg-blood') : 'bg-line'} />
          })}
        </div>
        <div className="text-sm">{outcomeLine(today, run)}</div>
      </section>
      <Button
        className="mt-4 flex w-full items-center justify-center gap-3"
        onClick={async () => {
          const r = await share(text)
          setShareState(r === 'copied' ? 'Copied to clipboard.' : r === 'shared' ? 'Shared.' : 'Couldn’t share. Try again.')
        }}
      >
        <PixelIcon name="share" size={20} aria-hidden /> Share result
      </Button>
      <p className="mt-2 h-5 text-center text-sm text-mute" aria-live="polite">
        {shareState}
      </p>

      <section className="end-section">
        <SectionTitle>Your run</SectionTitle>
        <ol className="run-log">
          {run.results.map((r) => (
            <li key={r.round}>
              <span className={`run-chip ${r.survived ? 'bg-safe' : 'bg-blood'}`} aria-label={r.survived ? 'Survived' : r.round === deathRound ? 'Died' : 'Hit'}>
                {r.round}
              </span>
              <span>{outcomeText(r, today)}</span>
            </li>
          ))}
        </ol>
      </section>

      {run.answerSets && run.answerSets.length > 0 && (
        <section className="end-section">
          <SectionTitle>Today’s questions</SectionTitle>
          <div className="answer-sets">
            {run.answerSets.map((set) => {
              const r = run.results.find((x) => x.round === set.round)
              return (
                <details key={set.round} className="pixel-panel answer-set">
                  {/* The question is on the bar itself so every one is readable without opening it. */}
                  <summary>
                    <span className="answer-head">
                      <span>Round {set.round}</span>
                      <span className="text-mute">
                        {set.reached ? '' : 'Not reached · '}
                        {set.names.length} answers
                      </span>
                    </span>
                    <span className="answer-prompt">{set.prompt}</span>
                  </summary>
                  <ul className="answer-chips">
                    {set.names.map((n) => (
                      <li key={n} className={n === r?.answer ? 'is-deadly' : n === r?.pick ? 'is-yours' : ''}>
                        {n}
                      </li>
                    ))}
                  </ul>
                  {set.reached ? (
                    <p className="answer-legend">
                      <span className="is-yours">Yours</span> <span className="is-deadly">{today.villain.name}’s pick</span>
                    </p>
                  ) : (
                    <p className="answer-legend text-mute">{today.villain.name}’s pick stays secret for rounds you didn’t reach.</p>
                  )}
                </details>
              )
            })}
          </div>
        </section>
      )}

      {stats && stats.started > 0 && (
        <section className="end-section">
          <SectionTitle>
            {stats.won.toLocaleString()} of {stats.started.toLocaleString()} survived today
          </SectionTitle>
          <div className="death-chart" role="list" aria-label="Deaths by round">
            {stats.deaths.map((d, i) => {
              const filled = d ? Math.max(1, Math.round((d / maxDeaths) * BAR_BLOCKS)) : 0
              const mine = deathRound === i + 1
              return (
                <div key={i} role="listitem" aria-label={`Round ${i + 1}: ${d} died`}>
                  <span className="text-mute">Round {i + 1}</span>
                  <span className="death-bar" aria-hidden="true">
                    {Array.from({ length: BAR_BLOCKS }, (_, b) => (
                      <i key={b} className={b < filled ? (mine ? 'is-mine' : 'is-filled') : ''} />
                    ))}
                  </span>
                  <span className={`display text-right tabular-nums ${mine ? 'text-blood' : 'text-mute'}`}>{d}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="end-section end-stats">
        {[
          ['Streak', streak?.current ?? 0],
          ['Played', streak?.played ?? 0],
          ['Survived', streak?.wins ?? 0],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="display text-4xl tabular-nums">{value}</div>
            <div className="eyebrow mt-1">{label}</div>
          </div>
        ))}
      </section>

      <section className="end-section text-center">
        <div className="eyebrow">Next board in</div>
        <Countdown to={today.nextResetAt} className="display mt-2 block text-4xl text-amber" />
      </section>
    </div>
  )
}
