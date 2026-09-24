import { useSettings } from '@/app/context'
import { buildCharacter } from '@/domain/game/character'

import { AttributeRow } from './CharacterParts'

/**
 * The three competition lifts, read against published strength
 * standards — replacing `TraitRadar` in this exact slot.
 *
 * **Asked for directly, after the trait radar shipped overlapping its
 * own labels: "the secondary graph for attributes would make more
 * sense as showing off the 1RMs for the main lifts instead."** Fair on
 * both counts — the radar was reading XP, which barely moves week to
 * week and gave a shape that rarely changed, where the estimated maxes
 * behind these three rows are the one thing on this screen RTS is
 * actually built to move session over session.
 *
 * **`buildCharacter` already existed for this** — `StrengthStandards`
 * on the Train page calls it for the same three rows. Reusing it here
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

  return (
    <div className="space-y-3">
      {character.lifts.map((lift) => (
        <AttributeRow key={lift.name} attribute={lift} />
      ))}
    </div>
  )
}
