import { hmacHex } from './rng.js'

/**
 * The site's hidden pick for a typed round. One swappable function (plan section 3.1 / 9):
 * v1 is uniform over the valid set, derived from HMAC(secret, date + question id) so every player
 * gets the same deadly answer for the day. A crowd-weighted v2 replaces only the body of `pickDeadly`.
 */
export interface PickQuestion {
  questionId: string
  answers: string[]
}

export interface PickContext {
  date: string
  secret: string
}

export function pickDeadly(question: PickQuestion, context: PickContext): string {
  return uniformPick(question, context)
}

export function uniformPick(question: PickQuestion, context: PickContext): string {
  const sorted = [...question.answers].sort()
  const hex = hmacHex(context.secret, `${context.date}:${question.questionId}`)
  // 52 bits keeps the modulo bias negligible for sets of a few hundred.
  return sorted[parseInt(hex.slice(0, 13), 16) % sorted.length]
}
