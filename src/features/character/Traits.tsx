import { Card } from '@/components/shared/primitives'
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

function TraitRow({ standing }: { readonly standing: TraitStanding }) {
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
    </div>
  )
}

export function Traits({ traits }: { readonly traits: readonly TraitStanding[] }) {
  return (
    <Card className="space-y-4">
      {ordered(traits).map((standing) => (
        <TraitRow key={standing.trait.id} standing={standing} />
      ))}
    </Card>
  )
}
