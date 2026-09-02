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
    <div className="space-y-4">
      {/*
        The band names itself, because a card holding three readings has
        to say which is which. It is a heading rather than an uppercase
        label: a season has a name — "Autumn 2026" — and labelling that
        SEASON above it would be a caption over a proper noun.
      */}
      <div className="min-w-0">
        <div>
          <p className="text-ink-50 font-medium">{progress.label}</p>
          <p className="text-ink-500 text-xs">
            {progress.daysLeft === 0
              ? 'This season is over.'
              : `${progress.daysLeft.toString()} days left · ${Math.round(progress.elapsed * 100).toString()}% through`}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-ink-300 text-sm">Earned this season</span>
          <span className="numeric text-ink-50 text-sm font-semibold">
            {progress.xp} XP
            {target !== undefined && <span className="text-ink-500 font-normal"> / {target}</span>}
          </span>
        </div>

        {target === undefined ? (
          <p className="text-ink-500 mt-2 text-xs">
            Your first season, so there is nothing to beat yet. Next season this bar fills against
            what you earn now.
          </p>
        ) : (
          <>
            <Meter
              className="mt-2"
              value={progress.xp}
              of={target}
              tone={beaten ? 'good' : 'accent'}
              glow
              label={`${String(progress.xp)} XP against last season's ${String(target)}`}
            />
            <p className="text-ink-500 mt-2 text-xs">
              {beaten
                ? 'Past last season already.'
                : `${(target - progress.xp).toString()} XP to beat last season.`}{' '}
              The target is what you actually earned last season — not a curve this app made up.
            </p>
          </>
        )}
      </div>

      <div>
        <span className="text-ink-500 mb-2 block text-xs font-medium tracking-wide uppercase">
          By month
        </span>
        {/*
            Against the busiest month, which is the caller naming its own
            scale rather than the component picking one. Three months of a
            season are being compared with each other and with nothing
            else, so the tallest of the three is the honest denominator —
            and it is passed in, so it is visible at the call site rather
            than hidden in a chart.
          */}
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
