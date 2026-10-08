import { useEffect, useState } from 'react'

export default function Countdown({ to, className = 'font-mono' }: { to: string; className?: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const ms = Math.max(0, Date.parse(to) - now)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return <span className={`tabular-nums ${className}`}>{`${pad(h)}:${pad(m)}:${pad(s)}`}</span>
}
