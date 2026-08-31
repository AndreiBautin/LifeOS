import { Minus, Plus, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/shared/primitives'
import { Meter } from '@/components/shared/Meter'
import type { PoolView } from '@/application/use-cases/vitals/vitals'
import { cycleOf, directionOf, type Vice } from '@/domain/vitals/charges'
import { namedDays } from '@/domain/time/day'
import { cn } from '@/lib/cn'

import { useSpendVice, useUndoVice } from './hooks'

/*
 * What a row actually reads, which is less than a `PoolView`. The view
 * also carries `spentToday` for the month's rating, and asking for it
 * here would make the Vitals page compute a number nothing on it
 * displays before it could draw a row.
 */
type Pool = Pick<PoolView, 'vice' | 'reading'>

/**
 * A pool, as a row you can act on. One copy, used by both screens.
 *
 * It lived on the Today card alone, and the Vitals page — the screen
 * named after these things, where they are created and edited — drew its
 * own row with a badge and no way to log anything. So the section that
 * exists to manage pools was the one place a pool could not be used, and
 * reaching for the plus on a limit found nothing there.
 *
 * The fix is one component rather than a second set of buttons, because
 * two sets is how two screens end up disagreeing about what a spend does.
 *
 * **Four bands, and a counted pool gets the same four as a measured
 * one.** Name and headline figure, the gauge, the detail, the controls.
 * They were two layouts — a measured pool stacked and a counted one
 * crammed onto one line beside its buttons — and the single line is what
 * broke first: three buttons and a row of pips leave about two hundred
 * pixels for the words, so "3 a day, on 2 days a week" wrapped four
 * times in a monospaced face while the buttons sat in open space.
 * Giving the words the full width costs one band and makes the long case
 * readable rather than the short case tidy.
 */

/**
 * What the countdown is counting towards, in the pool's own terms.
 *
 * A rolling pool gets back one charge and a calendar pool gets back all
 * of them, so "+1 in 9h" is true of the first and a lie about the
 * second. Saying "resets" instead is not a wording preference — under a
 * weekly allowance with three spent, "+1" would have somebody expecting
 * one drink on Monday when they have four.
 */
function whenBack(vice: Vice, at: Date, now: Date): string {
  const cycle = cycleOf(vice)

  if (cycle.kind === 'rolling') return `+1 in ${backIn(at, now)}`

  /*
   * A day away or less reads better as a duration; further out, the day
   * itself is what a person is actually asking about — "Monday" answers
   * "when can I have another" and "in 3d 4h" makes them count.
   */
  const hoursAway = (at.getTime() - now.getTime()) / (60 * 60 * 1000)

  return hoursAway <= 24
    ? `resets in ${backIn(at, now)}`
    : `resets ${at.toLocaleDateString(undefined, { weekday: 'long' })}`
}

function backIn(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((at.getTime() - now.getTime()) / 60000))
  if (minutes < 60) return `${String(minutes)}m`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return rest === 0 ? `${String(hours)}h` : `${String(hours)}h ${String(rest)}m`
}

function Pips({ reading }: { readonly reading: Pool['reading'] }) {
  /*
   * Pips rather than a continuous bar, because the quantity is discrete.
   * A half-full bar invites the question of whether that is one and a
   * half coffees; three dots of which one is lit cannot be misread.
   *
   * Past a dozen they stop being countable at a glance and become a
   * texture, so a large allowance falls back to a bar.
   */
  if (reading.capacity + reading.over > 12) {
    return (
      <Meter
        value={reading.onCooldown}
        of={reading.capacity}
        height={6}
        tone={reading.available > 0 ? 'accent' : 'warn'}
        label={`${String(reading.available)} of ${String(reading.capacity)} left`}
      />
    )
  }

  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1.5" aria-hidden>
      {Array.from({ length: reading.capacity }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            index < reading.available ? 'bg-accent-500' : 'bg-ink-700',
          )}
        />
      ))}
      {/* Anything past the allowance gets its own mark rather than being
          clamped away — an overrun is the thing worth seeing. */}
      {Array.from({ length: reading.over }, (_, index) => (
        <span key={`over-${String(index)}`} className="bg-bad-500 h-2.5 w-2.5 rounded-full" />
      ))}
    </span>
  )
}

/**
 * The second limit, said only when it is the one that binds.
 *
 * On a day already started it is not news; on a fresh day with the days
 * gone it is the entire answer to "can I have one".
 */
function DaysLine({ pool }: { readonly pool: Pool }) {
  const { vice, reading } = pool
  if (reading.days === undefined) return null

  return (
    <span
      className={
        /*
         * `openToday` rather than a comparison of used against allowed.
         * That comparison is the *count* rule, and it stayed silent for
         * named days: a weekend-only pool on a Tuesday has none of its
         * days used, so it read as fine while being shut.
         */
        reading.days.openToday ? undefined : 'text-warn-500'
      }
    >
      {vice.daysLimit?.kind === 'days-of-week'
        ? `${namedDays(vice.daysLimit.days)} only`
        : `${String(reading.days.used)} of ${String(reading.days.allowed)} days used`}
      {!reading.days.openToday && ' · not today'}
    </span>
  )
}

/**
 * Undo, which sits beside spend because the mis-tap it fixes is next to it.
 *
 * Outlined rather than ghost. A borderless button beside a bordered one
 * reads as a rendering fault rather than as the quieter of two options,
 * and it was the only thing in the band without an edge.
 */
function UndoButton({ vice, measured }: { readonly vice: Vice; readonly measured?: boolean }) {
  const undo = useUndoVice()

  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={`Undo the last ${vice.name}`}
      disabled={vice.spent.length === 0 || undo.isPending}
      onClick={() => {
        undo.mutate(vice.id)
      }}
    >
      {/*
        A minus beside a plus reads as "one less", and on a measured pool
        that is not what this does — it removes the *last entry*, which
        might have been a 160 mg energy drink. On a counting pool the two
        readings coincide, so the minus is honest there and stays.
      */}
      {measured ? <Undo2 size={14} aria-hidden /> : <Minus size={14} aria-hidden />}
    </Button>
  )
}

/**
 * The quick amounts, and the only way a measured pool is logged.
 *
 * There was a text field beside them for an arbitrary amount, and it is
 * gone. Two reasons, and the second is the one that decided it: a box
 * you type into is the largest, loudest control on a row whose job is to
 * be pressed once, and a *number* is a thing you have to compose rather
 * than choose — on a card meant to be used mid-conversation, holding a
 * drink. Choosing what a pool measures belongs in the editor. Logging
 * belongs here, and logging should be a tap.
 *
 * What that costs is real and worth stating: an amount with no chip for
 * it now needs a chip made first. That is one trip to the editor against
 * a field on every row forever, and the chips are the thing that gets
 * better with use — the list ends up being what you actually drink.
 */
function Presets({ vice }: { readonly vice: Vice }) {
  const spend = useSpendVice()
  const presets = vice.presets ?? []

  /*
   * A pool with no quick amounts still has to be loggable, and a bare
   * plus for one unit is what a pool of hits wants anyway. This is also
   * the case the removed field was covering, so it is not a gap left
   * behind — it is the same capability without the box.
   */
  if (presets.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        aria-label={`Log one ${vice.unit ?? ''} of ${vice.name}`.replace('  ', ' ')}
        disabled={spend.isPending}
        onClick={() => {
          spend.mutate({ id: vice.id, amount: 1 })
        }}
      >
        <Plus size={14} aria-hidden />
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap gap-1">
      {presets.map((preset) => (
        <Button
          key={preset.label}
          variant="outline"
          size="sm"
          disabled={spend.isPending}
          onClick={() => {
            spend.mutate({ id: vice.id, amount: preset.amount })
          }}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  )
}

/**
 * Spending one of something counted rather than measured.
 *
 * The two buttons are one control and are grouped as one. Apart, a minus
 * at one end of a wide band and a plus somewhere after it read as two
 * unrelated things; together they read as the stepper they are, and the
 * pair is what a thumb aims at.
 */
function CountedLog({ vice }: { readonly vice: Vice }) {
  const spend = useSpendVice()

  return (
    <span className="flex items-center gap-1.5">
      <UndoButton vice={vice} />
      <Button
        variant="outline"
        size="sm"
        aria-label={`Spend a ${vice.name}`}
        disabled={spend.isPending}
        onClick={() => {
          spend.mutate({ id: vice.id })
        }}
      >
        <Plus size={14} aria-hidden />
      </Button>
    </span>
  )
}

/**
 * One pool: what is left of it, and the buttons that change that.
 *
 * `rule` is the whole limit written out — "3 a day, on 2 days a week" —
 * and is passed only where it is the point. Today asks where you stand;
 * the Vitals page asks what the rule is *and* where you stand.
 */
export function PoolRow({
  pool,
  now,
  rule,
  action,
}: {
  readonly pool: Pool
  readonly now: Date
  readonly rule?: string | undefined
  readonly action?: ReactNode
}) {
  const { vice, reading } = pool

  // A pool with a unit is a quantity, and a row of pips cannot show one.
  const measured = vice.unit !== undefined
  const isTarget = directionOf(vice) === 'target'

  const detail = [
    rule,
    reading.nextBackAt === undefined ? undefined : whenBack(vice, reading.nextBackAt, now),
  ].filter((one) => one !== undefined)

  /*
   * **The rule is what decides the shape**, rather than a flag naming a
   * screen. Four bands exist because a limit written out — "3 a day, on
   * 2 days a week" — needs the full width, and the screen that states
   * the rule is the screen that is being worked on. Today states no rule
   * and is scanned, so a counted pool there stays the one line it always
   * was: stacking it took three pools from a glance to a whole screen
   * and pushed the dailies below the fold, which is the opposite of what
   * a present-tense card is for.
   *
   * A measured pool is stacked either way. A bar and a row of quick
   * amounts have never fitted on a line.
   */
  if (!measured && rule === undefined) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-ink-50 truncate text-sm font-medium">{vice.name}</p>
          <p className="text-ink-700 text-xs">
            <span className="numeric">
              {reading.over > 0
                ? `${String(reading.over)} over`
                : `${String(reading.available)} of ${String(reading.capacity)}`}
              {detail.length > 0 && ` · ${detail.join(' · ')}`}
            </span>
            {reading.days !== undefined && (
              <>
                {' · '}
                <DaysLine pool={pool} />
              </>
            )}
          </p>
        </div>

        <Pips reading={reading} />
        <CountedLog vice={vice} />
        {action}
      </div>
    )
  }

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-50 min-w-0 truncate text-sm font-medium">{vice.name}</span>

        {/*
          The headline figure, and the only place the monospaced face is
          used. It was set on the whole detail line, which made a
          sentence about days of the week both wider and harder to read
          for the sake of two numerals inside it.
        */}
        <span className="numeric shrink-0 text-xs">
          {measured ? (
            <span className="text-ink-500">
              {reading.onCooldown} / {vice.capacity} {vice.unit}
            </span>
          ) : reading.over > 0 ? (
            <span className="text-bad-500">{reading.over} over</span>
          ) : (
            <span className="text-ink-500">
              {reading.available} of {reading.capacity}
            </span>
          )}
          {measured && reading.over > 0 && (
            <span className="text-bad-500"> · {reading.over} over</span>
          )}
        </span>
      </div>

      <div className="mt-2">
        {measured ? (
          <Meter
            value={reading.onCooldown}
            of={vice.capacity}
            height={6}
            /*
             * Green while a target is being filled and while a limit
             * still has room; amber once a limit is spent. A full water
             * bar is good news and a full caffeine bar is not, and the
             * colour is the fastest way to say which without reading.
             */
            tone={isTarget ? 'good' : reading.available > 0 ? 'accent' : 'warn'}
            label={`${vice.name}: ${String(reading.onCooldown)} of ${String(vice.capacity)} ${vice.unit ?? ''}`}
          />
        ) : (
          <Pips reading={reading} />
        )}
      </div>

      {/*
        The rule, the countdown and the day limit, across the full width
        rather than in whatever column the buttons leave over.
      */}
      {(detail.length > 0 || reading.days !== undefined) && (
        <p className="text-ink-700 mt-1.5 text-xs">
          {detail.join(' · ')}
          {reading.days !== undefined && (
            <>
              {detail.length > 0 && ' · '}
              <DaysLine pool={pool} />
            </>
          )}
        </p>
      )}

      {/*
        Logging on the left, taking it back on the right. Undo and the
        pencil are not more of the same kind of thing as a plus — one
        removes what the other just recorded, and one leaves the row
        entirely — and putting all four in a single wrapping row is what
        made a preset, a text field and two reversals read as one tray of
        interchangeable chips.
      */}
      <div className="mt-2 flex items-center gap-1.5">
        {measured ? <Presets vice={vice} /> : <CountedLog vice={vice} />}

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {measured && <UndoButton vice={vice} measured />}
          {action}
        </span>
      </div>
    </div>
  )
}
