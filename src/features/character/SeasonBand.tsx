import type { SeasonProgress } from '@/application/use-cases/character/season-progress'
import { BarSeries, Meter } from '@/components/shared/Meter'

/**
 * The season you are in, as a battle pass rather than a verdict.
 *
 * **The monthly review's link used to sit beside the season's name and
 * the review is gone**, asked for as *"I don't really need a monthly
 * review page or link since we can view trends on the home tab."* The
 * argument for putting it here still stands and no longer has anything
 * to point at: a season and a month were both "how is this stretch
 * going", and this was the only prompt to file one.
 *
 * The bar fills against **last season's XP**, which is the only anchor
 * available that the app did not invent. A hundred tiers at thresholds
 * somebody chose would be exactly the "scale the app can move" the game
 * model refuses everywhere else — and it would be the first place in this
 * app where a number meant nothing.
 *
 * A first season has nothing to beat. It says so and shows what it has
 * earned, rather than filling a bar against zero.
 *
 * **There was a "Where it came from" list at the foot of this and it is
 * gone**, asked for as *"let's drop the where it came from section of
 * the battle pass."* It named each area that had earned anything this
 * season with its XP, biggest first, and the traits band directly below
 * says the same thing over the whole of your history rather than one
 * chapter — which is why removing it costs a comparison rather than a
 * fact. `SeasonProgress.areas` went with it, because a field nothing
 * reads is a tally the use case goes on computing every render.
 *
 * **A band of the sheet card rather than a section of its own.** Asked
 * for as *"merge in the season and attributes stuff into the first
 * card"*, and it belongs there: a season is the chapter you are in,
 * which is the same question the level answers on a longer scale, so a
 * heading and 2rem of air between the two was separating one reading
 * into two.
 */

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function monthLabel(key: string): string {
  const month = Number(key.slice(5, 7))
  return MONTH_NAMES[month - 1] ?? key
}

export function SeasonBand({ progress }: { readonly progress: SeasonProgress }) {
  const { target } = progress
  const beaten = target !== undefined && progress.xp >= target

  // Each month's bar is drawn against the busiest month, so the three are
  // comparable to each other rather than to a total nobody can see.
  const busiest = Math.max(1, ...progress.months.map((one) => one.xp))

  return (
    <div className="space-y-3">
      {/*
        **No heading here any more — the season names itself beside the
        portrait.** Asked for as _"can we move the season progress up
        into the row with the avatar and clean it up a bit."_ What is
        left is the reading: a bar against last season, and the months
        that made it.
      */}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-ink-500 text-xs">Earned this season</span>
          <span className="numeric text-ink-50 text-sm font-semibold">
            {progress.xp}
            {target !== undefined && <span className="text-ink-500 font-normal"> / {target}</span>}
          </span>
        </div>

        {target === undefined ? (
          <p className="text-ink-500 mt-2 text-xs">
            Your first season, so there is nothing to beat yet.
          </p>
        ) : (
          <Meter
            className="mt-2"
            value={progress.xp}
            of={target}
            tone={beaten ? 'good' : 'accent'}
            glow
            label={`${String(progress.xp)} XP against last season's ${String(target)}`}
          />
        )}
      </div>

      {/*
        **The "By month" caption is gone and the bars are not.** Three
        bars labelled Sep, Oct and Nov under a season are already the
        sentence the caption was writing — and the paragraph that used to
        sit above them, explaining that the target is last season's own
        figure rather than a curve the app made up, went with it. That
        rule is worth knowing once and is in `domain/game/season.ts`;
        printing it under the bar every morning is the app narrating
        itself, which is the thing being moved away from.

        Against the busiest month, which is the caller naming its own
        scale rather than the component picking one — visible at the call
        site instead of hidden in a chart.
      */}
      <div>
        <BarSeries
          of={busiest}
          bars={progress.months.map((month) => ({
            key: month.month,
            value: month.xp,
            label: monthLabel(month.month),
          }))}
        />
        <div className="mt-0.5 flex gap-2">
          {progress.months.map((month) => (
            <p key={month.month} className="text-ink-700 numeric flex-1 text-center text-xs">
              {month.xp}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}
