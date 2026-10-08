import { lock } from '../api'
import { ACTIVITIES } from '../activities'
import type { ActivityInfo, LockResponse } from '../types'

export default function ActivityRound({ round, info, onLocked, onError }: { round: number; info: ActivityInfo; onLocked: (r: LockResponse) => void; onError: (e: unknown) => void }) {
  const Module = ACTIVITIES[info.id]
  if (!Module) return <p className="text-blood">Unknown activity {info.id}. Refresh to try again.</p>
  return <Module info={info} lock={(choice) => lock(round, { choice })} onFinish={onLocked} onError={onError} />
}
