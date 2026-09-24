import { useSettings } from '@/app/context'
import { buildCharacter } from '@/domain/game/character'

import { LiftRadar } from './LiftRadar'

/**
 * The three competition lifts, read against published strength
 * standards — replacing `TraitRadar` in this exact slot, and since
 * replaced again itself.
 *
 * **First became three rows (`AttributeRow`), asked for directly after
 * the trait radar shipped overlapping its own labels:** *"the secondary
 * graph for attributes would make more sense as showing off the 1RMs
 * for the main lifts instead."* Fair — the trait radar was reading XP,
 * which barely moves week to week and gave a shape that rarely changed.
 *
 * **Now a radar again, asked for directly:** *"make the squat bench
 * deadlift thing the chart... where it starts at the center and goes
 * further out in different directions."* Not the same objection this
 * time: unlike XP, these three lifts are each anchored to a published
 * bodyweight-multiple standard and RTS is built to move the load behind
 * them session over session, so the shape `LiftRadar` draws is one of
 * the few in the app that actually changes on a normal week. See that
 * component's own doc for how a spoke is computed.
 *
 * **`buildCharacter` already existed for this** — `StrengthStandards`
 * on the Train page calls it for the same three lifts. Reusing it here
 * rather than reimplementing anything: the ladder placement
 * (`placeOnLadder` against published bodyweight-multiple standards) is
 * the one part of this app that must never be a guessed scale, and
 * that logic already lives in one place.
 *
 * **`sessions`/`workingSets` are passed as zero deliberately.**
 * `buildCharacter` also derives a training-only XP level from them,
 * which neither this card nor `StrengthStandards` draws — see that
 * component's own doc for why two numbers called "level" in one app
 * would disagree and confuse rather than inform. Only `.lifts` is read
 * here.
 */
export function MainLifts() {
  const { settings } = useSettings()

  const character = buildCharacter({
    estimatedMaxes: settings.estimatedMaxes,
    ...(settings.bodyweight !== undefined ? { bodyweight: settings.bodyweight } : {}),
    sessions: 0,
    workingSets: 0,
  })

  return <LiftRadar lifts={character.lifts} />
}
