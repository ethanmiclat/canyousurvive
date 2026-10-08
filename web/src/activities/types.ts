import type { ActivityInfo, LockResponse } from '../types'

/**
 * Activity module contract (plan section 3.2). The server decides the outcome at lock-in; a module only
 * collects the player's choice (an index for 'choice' activities, a value in [0,1) for 'continuous' ones)
 * and animates the result it gets back.
 */
export interface ActivityProps {
  info: ActivityInfo
  lock: (choice: number) => Promise<LockResponse>
  onFinish: (res: LockResponse) => void
  onError: (err: unknown) => void
}
