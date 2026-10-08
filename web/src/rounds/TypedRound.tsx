import { useEffect, useRef, useState } from 'react'
import { checkAnswer, getHint, lock, startRound, timeUp } from '../api'
import HintPanel from '../components/HintPanel'
import { Button } from '../components/ui'
import { shake, wait } from '../lib/fx'
import type { Hint, LockResponse, PublicRun, RoundResult, Villain } from '../types'

interface Props {
  villain: Villain
  round: number
  /** Set once the round is resolved, to show the villain's answer in place of the suspense dots. */
  outcome?: RoundResult | null
  run: PublicRun
  seconds: number
  onRun: (run: PublicRun) => void
  onLocked: (res: LockResponse) => void
  onError: (err: unknown) => void
}

export default function TypedRound({ villain, round, outcome, run, seconds, onRun, onLocked, onError }: Props) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const [locking, setLocking] = useState<string | null>(null)
  const [hint, setHint] = useState<Hint | null>(null)
  const [hintBusy, setHintBusy] = useState(false)

  async function showHint() {
    setHintBusy(true)
    try {
      setHint((await getHint()).hint)
    } catch (e) {
      onError(e)
    } finally {
      setHintBusy(false)
      inputRef.current?.focus()
    }
  }
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // The prompt arrives with the clock; keep it after the run moves on so the reveal can show it.
  const [prompt, setPrompt] = useState<string | null>(run.round === round ? run.prompt : null)
  const [msLeft, setMsLeft] = useState<number | null>(null)
  const deadline = useRef<number | null>(null)
  const timedOut = useRef(false)
  const lockingRef = useRef(false)
  lockingRef.current = !!locking

  // Start (or resume) the clock when the round appears. The server is idempotent, so a refresh keeps the time.
  useEffect(() => {
    if (outcome || run.status !== 'playing' || run.round !== round) return
    let live = true
    startRound()
      .then(({ run: next }) => {
        if (!live) return
        setPrompt(next.prompt)
        deadline.current = performance.now() + (next.timeLeftMs ?? 0)
        setMsLeft(next.timeLeftMs)
        onRun(next)
        setTimeout(() => inputRef.current?.focus())
      })
      .catch(onError)
    return () => {
      live = false
    }
  }, [round])

  useEffect(() => {
    if (msLeft === null || outcome) return
    const id = setInterval(() => {
      if (deadline.current === null) return
      const left = Math.max(0, deadline.current - performance.now())
      setMsLeft(left)
      if (left > 0 || timedOut.current || lockingRef.current) return
      timedOut.current = true
      clearInterval(id)
      timeUp().then(onLocked, onError)
    }, 100)
    return () => clearInterval(id)
  }, [msLeft === null, outcome, onLocked, onError])

  async function doLock(display: string) {
    setConfirm(null)
    setLocking(display)
    try {
      // A beat of suspense before the reveal; the server decides instantly.
      const [res] = await Promise.all([lock(round, { input }), wait(1100)])
      if (res.result === 'unrecognized') {
        setLocking(null)
        setMessage('Not recognized')
        onRun(res.run)
        return
      }
      timedOut.current = true
      onLocked(res)
    } catch (e) {
      setLocking(null)
      onError(e)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || busy) return
    setBusy(true)
    setMessage('')
    try {
      const res = await checkAnswer(input)
      if (res.result === 'timeout') {
        timedOut.current = true
        onLocked({ ...res, result: 'timeout', stats: null })
      } else if (res.result === 'unrecognized') {
        setMessage('Not recognized')
        shake(formRef.current)
        onRun(res.run)
        inputRef.current?.select()
      } else if (res.result === 'ok') {
        await doLock(res.display!)
      } else {
        setConfirm(res.display!)
      }
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="typed-round">
      {!outcome && !locking && <Clock msLeft={msLeft} seconds={seconds} />}
      <p id="prompt" className="headline question-heading">
        {prompt ?? <span className="text-mute">Get ready…</span>}
      </p>

      {locking || outcome ? (
        <div className="pixel-panel mt-8 p-6 text-center">
          <div className="text-sm text-mute">Locked in</div>
          <div className="display mt-2 text-3xl">{locking ?? outcome?.pick ?? '—'}</div>
          {outcome ? (
            <div className="mt-3 text-sm text-mute">
              {villain.name}'s answer: <span className={`font-semibold ${outcome.survived ? 'text-bone' : 'text-blood'}`}>{outcome.answer}</span>
            </div>
          ) : (
            <div className="mt-4 flex justify-center gap-2" aria-label="Revealing">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-blood" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <form ref={formRef} onSubmit={submit} className="mt-8">
          <input
            id="answer"
            aria-labelledby="prompt"
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setMessage('')
            }}
            disabled={busy || !!confirm || !prompt}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={80}
            placeholder="Type your answer"
            className="w-full rounded-lg border border-line bg-panel px-4 py-4 text-xl outline-none placeholder:text-mute/60 focus:border-bone"
          />
          <div className="mt-3 h-5 text-sm font-semibold text-blood" aria-live="assertive">
            {message}
          </div>
          {!confirm && (
            <Button type="submit" className="mt-3 w-full" disabled={busy || !input.trim() || !prompt}>
              {busy ? 'Checking…' : 'Lock it in'}
            </Button>
          )}
          {prompt && !hint && (
            <button type="button" className="pixel-tile mt-4 w-full py-2.5 text-mute" disabled={hintBusy} onClick={showHint}>
              {hintBusy ? 'Getting hint…' : 'Hint'}
            </button>
          )}
          {hint && <HintPanel hint={hint} />}
        </form>
      )}

      {confirm && !locking && (
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="pixel-panel mt-5 border-amber/60 p-5">
          <p id="confirm-title" className="text-sm text-mute">
            We read this as
          </p>
          <p className="display mt-1 text-3xl">{confirm}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button variant="ghost" onClick={() => (setConfirm(null), setTimeout(() => inputRef.current?.focus()))}>
              No, edit
            </Button>
            <Button onClick={() => doLock(confirm)}>
              Lock it in
            </Button>
          </div>
        </div>
      )}

    </div>
  )
}

/** Seconds left as a big readout over a draining bar. Turns red for the last ten seconds. */
function Clock({ msLeft, seconds }: { msLeft: number | null; seconds: number }) {
  const left = msLeft ?? seconds * 1000
  const secs = Math.ceil(left / 1000)
  const danger = msLeft !== null && secs <= 10
  return (
    <div className={`round-clock ${danger ? 'clock-danger' : ''}`} role="timer" aria-label={`${secs} seconds left`}>
      <div className="clock-readout">
        <span className="eyebrow">Time left</span>
        <span key={danger ? secs : 'calm'} className={`display clock-seconds ${danger ? 'tick text-blood' : 'text-amber'}`}>
          {String(secs).padStart(2, '0')}
        </span>
      </div>
      <div className="clock-track">
        <div
          className={`h-full origin-left ${danger ? 'bg-blood' : 'bg-amber'}`}
          style={{ transform: `scaleX(${left / (seconds * 1000)})`, transition: 'transform 100ms linear' }}
        />
      </div>
    </div>
  )
}
