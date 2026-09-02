import type { ReactNode } from 'react'

import { Meter } from '@/components/shared/Meter'
import type { TraitStanding } from '@/domain/game/traits'

/**
 * The character sheet read as an RPG one: eight traits, each levelled.
 *
 * **Every bar here is XP you already earned, under a different name.**
 * Each life area belongs to exactly one trait, so these sum to the level
 * above them exactly — there is no fourth currency, no second tally, and
 * nothing on this panel that cannot be traced back to an act somebody
 * performed. `domain/game/traits.ts` holds the reasoning and
 * `traits.test.ts` holds the arithmetic.
 *
 * Each row says **what feeds it**, which is the difference between this
 * and the invented scale the model refuses. A bar labelled "Charisma"
 * with nothing under it is a number the app made up; one that says
 * "people you actually saw" is a count of hangouts you logged.
 *
 * **The measured ladders hang off them**, asked for as _"take finance
 * and strength and put those under their corresponding attributes in
 * the section above, and cut the rest out."_ So the three competition
 * lifts sit under Strength and the credit score under Fortune, and the
 * list of area cards that used to carry them is gone. What that costs
 * is named where the list was removed.
 *
 * **A band of the sheet card rather than a section of its own**, asked
 * for as *"merge in the season and attributes stuff into the first
 * card"*. These are the level above them split eight ways, so they are
 * a reading *of* the portrait rather than a separate one — which is
 * what a heading and 2rem of air between them had been claiming.
 */

/**
 * Unproven traits sort last, and keep their bars.
 *
 * Absent, never zero — a trait nothing has fed has not scored badly, it
 * has not been measured. It stays on the screen rather than being hidden
 * because the *set* is the character sheet: eight bars with three empty
 * says what you have and have not been spending time on, where five bars
 * would just look like the app knows about five things.
 */
function ordered(traits: readonly TraitStanding[]): readonly TraitStanding[] {
  return [...traits].sort(
    (a, b) =>
      Number(b.proven) - Number(a.proven) ||
      b.xp - a.xp ||
      a.trait.label.localeCompare(b.trait.label),
  )
}

function TraitRow({
  standing,
  ladders,
}: {
  readonly standing: TraitStanding
  /**
   * The ladders belonging to this trait's areas, drawn beneath it.
   *
   * **A trait and a ladder are different currencies and this is not a
   * merge of them.** The trait's own bar is XP into a level; a ladder is
   * a reading against a published standard the app cannot move. What
   * this says is only that they are about the same part of your life —
   * the lifts sit under Strength, the credit score under Fortune —
   * which is what the areas list used to say with a heading each.
   *
   * Absent for most traits, and that is not a gap: only three areas
   * declare a ladder at all, because a ladder needs an external standard
   * and there is no published figure for how good at seeing your friends
   * you ought to be.
   */
  readonly ladders?: ReactNode
}) {
  const { trait, level, into, needed, xp, proven } = standing

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={['text-sm font-medium', proven ? 'text-ink-50' : 'text-ink-700'].join(' ')}
        >
          {trait.label}
        </span>

        {/*
          The level is the headline and the XP is beside it, because the
          level is the thing that reads as an RPG and the XP is what
          makes it checkable. A level with no number under it would be
          the same unfalsifiable bar as before.
        */}
        <span className="shrink-0 text-xs">
          {proven ? (
            <>
              <span className="text-accent-400 numeric font-medium">{level}</span>
              <span className="text-ink-700 numeric"> · {xp} xp</span>
            </>
          ) : (
            <span className="text-ink-700">Nothing yet</span>
          )}
        </span>
      </div>

      {/*
        A real denominator: XP into this level over what the level costs.
        `Meter` takes `value` and `of` rather than a percentage precisely
        so a call site cannot hide what it divides by.
      */}
      <Meter
        className="mt-1.5"
        value={proven ? into : 0}
        of={needed}
        height={6}
        label={`${trait.label}, level ${String(level)}`}
      />

      <p className="text-ink-700 mt-1 text-xs">{trait.blurb}</p>

      {/*
        Indented and ruled off, so a ladder reads as belonging to the
        trait above rather than as another trait. They are measured on
        different scales and stacking them flush would say otherwise.
      */}
      {ladders !== undefined && (
        <div className="border-ink-800 mt-3 space-y-3 border-l pl-3">{ladders}</div>
      )}
    </div>
  )
}

export function Traits({
  traits,
  ladders,
}: {
  readonly traits: readonly TraitStanding[]
  /** Ladder rows to draw under a trait, keyed by the trait's id. */
  readonly ladders?: Readonly<Record<string, ReactNode>>
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-ink-50 font-medium">Traits</p>
        <p className="text-ink-500 text-xs">Your XP, split by what earned it</p>
      </div>

      {ordered(traits).map((standing) => {
        const under = ladders?.[standing.trait.id]

        return (
          <TraitRow
            key={standing.trait.id}
            standing={standing}
            {...(under === undefined ? {} : { ladders: under })}
          />
        )
      })}
    </div>
  )
}
