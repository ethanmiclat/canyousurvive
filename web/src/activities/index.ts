import type { ComponentType } from 'react'
import BombWires from './bomb-wires'
import DrawStraws from './draw-straws'
import Elevator from './elevator'
import FiveKeys from './five-keys'
import GlassBridge from './glass-bridge'
import PoisonCups from './poison-cups'
import SpinTheWheel from './spin-the-wheel'
import StopTheNeedle from './stop-the-needle'
import type { ActivityProps } from './types'

/** Plug-in activity modules, keyed by the ids in content/activities.json. */
export const ACTIVITIES: Record<string, ComponentType<ActivityProps>> = {
  'poison-cups': PoisonCups,
  'bomb-wires': BombWires,
  'glass-bridge': GlassBridge,
  'stop-the-needle': StopTheNeedle,
  'draw-straws': DrawStraws,
  'five-keys': FiveKeys,
  'spin-the-wheel': SpinTheWheel,
  elevator: Elevator,
}
