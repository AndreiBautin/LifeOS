import { Check } from 'lucide-react'

import type { DailyView } from '@/application/use-cases/dailies/dailies'
import {
  isExpectedOn,
  shiftDay,
  timesDoneOn,
  timesPerDay,
  type Daily,
} from '@/domain/dailies/daily'
import { toDayKey } from '@/domain/time/day'
import { useServices } from '@/app/context'

import { useKeepOn, useUndoOn } from './dailies-hooks'

/**
 * The last fortnight, and the ability to correct it.
 *
 * **The gap this closes was reported from real use:** a habit asked for
 * three times a day sat at 2 of 3 on *yesterday*, and nothing anywhere
 * could fix it. Ticking only ever worked on the day itself, so a third
 * feed forgotten at eleven at night was gone for good.
 *
 * It is also the only repair for a completion misfiled by the timezone
 * bug this app shipped five times. Nothing rewrites stored entries — an
 * evening tick filed under tomorrow stays where it is, because the
 * offset it was written at was never recorded — so the only honest fix
 * is a person saying "that day was done" and the app believing them.
 *
 * **Days it was not expected on are shown flat**, neither kept nor
 * missed, because that is what they are: a weekday habit is not failing
 * on Sunday. They can still be ticked — doing the thing on a day you did
 * not plan to is a thing you did.
 */

/** A fortnight. Long enough to catch a forgotten day, short enough to read. */
const DAYS = 14

function Day({
  daily,
  day,
  onKeep,
  onUndo,
  busy,
}: {
  readonly daily: Daily
  readonly day: string
  readonly onKeep: (day: string) => void
  readonly onUndo: (day: string) => void
  readonly busy: boolean
}) {
  const done = timesDoneOn(daily, day)
  const needed = timesPerDay(daily)
  const expected = isExpectedOn(daily, day)
  const full = done >= needed

  const label = `${day}, ${String(done)} of ${String(needed)}${expected ? '' : ' — not expected'}`

  return (
    <button
      type="button"
      className={[
        'tap-target min-w-9 flex-1 rounded-lg border text-xs font-medium',
        full
          ? 'border-good-500/40 bg-good-500/15 text-good-500'
          : done > 0
            ? 'border-accent-500/40 bg-accent-500/10 text-accent-400'
            : expected
              ? 'border-ink-800 text-ink-700'
              : 'border-ink-850 text-ink-800',
      ].join(' ')}
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={() => {
        /*
         * One press adds one completion; on a full day it takes one
         * back. The same shape the row's own tick has — a mis-tap on the
         * thing you tap most should cost exactly one more tap.
         */
        if (full) onUndo(day)
        else onKeep(day)
      }}
    >
      {full ? (
        <Check size={12} className="mx-auto" aria-hidden />
      ) : needed > 1 ? (
        <span className="numeric">{done}</span>
      ) : (
        <span aria-hidden>·</span>
      )}
    </button>
  )
}

export function DailyHistory({ view }: { readonly view: DailyView }) {
  const services = useServices()
  const keep = useKeepOn(view.daily.belongsTo)
  const undo = useUndoOn()

  const today = toDayKey(services.clock.now())
  // Oldest first, ending today — the order a fortnight reads in.
  const days = Array.from({ length: DAYS }, (_unused, index) => shiftDay(today, index - (DAYS - 1)))

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {days.map((day) => (
          <Day
            key={day}
            daily={view.daily}
            day={day}
            busy={keep.isPending || undo.isPending}
            onKeep={(on) => {
              keep.mutate({ id: view.daily.id, day: on })
            }}
            onUndo={(on) => {
              undo.mutate({ id: view.daily.id, day: on })
            }}
          />
        ))}
      </div>
      <p className="text-ink-700 text-xs">
        The last fortnight, oldest first. Tap a day you forgot to tick — the XP lands in the day it
        belonged to.
      </p>
    </div>
  )
}
