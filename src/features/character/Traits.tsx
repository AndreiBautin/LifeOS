import { Meter } from '@/components/shared/Meter'
import type { TraitStanding } from '@/domain/game/traits'

/**
 * The character sheet read as an RPG one: seven traits, each levelled.
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
 * **A bar and a blurb, and deliberately nothing else.** Two things have
 * now been hung under these rows and both came off again, which is worth
 * recording once rather than discovering a third time.
 *
 * First the measured ladders — the lifts under Strength, the credit
 * score under Fortune — moved here when the area cards were deleted.
 * Then every trait gained a section listing the areas feeding it, so
 * that the panel would be symmetric rather than having content under two
 * rows of seven. Reported: *"I'm not really a fan. Let's keep all traits
 * as purely bars to keep it more sleek cause this looks busy."*
 *
 * It was busy, and the symmetric version was busier than the ragged one
 * it fixed — twelve extra rows on a panel of seven, most of them reading
 * "Nothing yet" on any database that has not been lived in for months.
 * **The lesson is that this panel is a glance, not a breakdown.** It
 * answers "where has my time gone" in seven bars, and every attempt to
 * make it also answer "and exactly which records paid for that" has made
 * it worse at the first job without being especially good at the second.
 *
 * **The ladders were not deleted, they went to the screens that own
 * them** — the lifts to Train, the money to Finance, the exploration
 * share to the Map. That is where each one is acted on, and a reading
 * beside the thing it measures needs no explaining.
 *
 * **A band of the sheet card rather than a section of its own**, asked
 * for as *"merge in the season and attributes stuff into the first
 * card"*. These are the level above them split seven ways, so they are
 * a reading *of* the portrait rather than a separate one.
 */

/**
 * Unproven traits sort last, and keep their bars.
 *
 * Absent, never zero — a trait nothing has fed has not scored badly, it
 * has not been measured. It stays on the screen rather than being hidden
 * because the *set* is the character sheet: seven bars with three empty
 * says what you have and have not been spending time on, where four bars
 * would just look like the app knows about four things.
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
    </div>
  )
}

export function Traits({ traits }: { readonly traits: readonly TraitStanding[] }) {
  /*
   * **No heading and no description.** Asked for as _"let's drop the
   * traits header and description"_ — four labelled bars under a
   * portrait do not need to be told they are traits, and the caption
   * ("your XP, split by what earned it") stopped being true the moment
   * traits became a selection rather than a partition: they are *some*
   * of your XP now, and a caption claiming otherwise would be the one
   * thing on this card that is wrong.
   */
  return (
    <div className="space-y-4">
      {ordered(traits).map((standing) => (
        <TraitRow key={standing.trait.id} standing={standing} />
      ))}
    </div>
  )
}
