import crypto from 'node:crypto'

/** Cryptographic randomness for per-player outcomes. */
export function secureInt(n: number): number {
  return crypto.randomInt(n)
}

export function secureFloat(): number {
  return crypto.randomInt(2 ** 48 - 1) / 2 ** 48
}

export function randomToken(bytes = 18): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

/**
 * Deterministic seeded RNG used by the schedule generator. Mirrors `SeededRng` in scripts/gen_lib.py
 * so the server fallback produces the same day as the Python generator.
 */
export class SeededRng {
  private counter = 0
  constructor(private readonly seed: string) {}

  below(n: number): number {
    const hex = crypto.createHash('sha256').update(`${this.seed}:${this.counter++}`).digest('hex')
    return parseInt(hex.slice(0, 13), 16) % n
  }
}

export function hmacHex(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex')
}
