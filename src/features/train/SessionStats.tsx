import { describeHeft, heftOf } from '@/domain/units/heft'
import type { WeightUnit } from '@/domain/units/weight'
import { cn } from '@/lib/cn'

import { useCountUp } from './useCountUp'

/**
 * A session's three numbers and the picture of its volume — shared by the
 * report that closes a session and the page that opens a past one, so the
 * two say the same thing the same way.
 */
export function SessionStats({
  sets,
  tonnage,
  minutes,
  units,
}: {
  readonly sets: number
  readonly tonnage: number
  /** Absent when the session has no finish time to measure from. */
  readonly minutes?: number | undefined
  readonly units: WeightUnit
}) {
  return (
    <>
      <dl
        className={cn(
          'border-ink-800/80 mt-5 grid gap-px overflow-hidden rounded-2xl border bg-[color-mix(in_oklab,var(--color-ink-800)_70%,transparent)]',
          minutes === undefined ? 'grid-cols-2' : 'grid-cols-3',
        )}
      >
        <Stat label="Sets" value={sets} />
        <Stat label="Volume" value={Math.round(tonnage)} suffix={` ${units}`} />
        {minutes !== undefined && <Stat label="Duration" value={minutes} suffix=" min" />}
      </dl>
      <HeftLine tonnage={tonnage} units={units} />
    </>
  )
}

/**
 * The volume as something you could picture, under the numbers. Silent
 * for a session lighter than a grand piano, where a comparison would be
 * a fraction of an object.
 */
function HeftLine({ tonnage, units }: { readonly tonnage: number; readonly units: WeightUnit }) {
  const comparison = heftOf(tonnage, units)
  if (comparison === undefined) return null
  return (
    <p className="heft-line text-ink-300 mt-3 text-sm">
      You moved about{' '}
      <span className="text-accent-400 font-semibold">{describeHeft(comparison)}</span>.
    </p>
  )
}

/** Counts up once as the report opens; the figure is the record, the motion is not. */
function Stat({
  label,
  value,
  suffix,
}: {
  readonly label: string
  readonly value: number
  readonly suffix?: string
}) {
  const shown = Math.round(useCountUp(value))
  return (
    <div className="bg-ink-950/60 px-3 py-3">
      <dt className="text-ink-500 text-[0.7rem] font-medium tracking-wide uppercase">{label}</dt>
      <dd className="numeric text-ink-50 mt-1 text-lg font-semibold whitespace-nowrap sm:text-xl">
        <span aria-hidden>{shown.toLocaleString()}</span>
        <span className="sr-only">{value.toLocaleString()}</span>
        {suffix !== undefined && <span className="text-ink-500 text-sm font-normal">{suffix}</span>}
      </dd>
    </div>
  )
}
