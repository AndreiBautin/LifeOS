import { RECORD_LABELS, type RecordKind } from '@/domain/logging/records'
import type { Performance } from '@/domain/logging/versus-last'
import { describeHeft, heftOf } from '@/domain/units/heft'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'

import type { ShareCard } from './session-card'

/**
 * The share card from what the report and the session page already
 * hold, so the picture says the numbers those screens say and no others.
 */
export function shareCardFrom(args: {
  readonly title: string
  readonly date: string
  readonly sets: number
  readonly tonnage: number
  readonly minutes: number | undefined
  readonly units: WeightUnit
  readonly records: readonly {
    readonly name: string
    readonly set: Performance
    readonly kind: RecordKind
  }[]
}): ShareCard {
  const heft = heftOf(args.tonnage, args.units)
  return {
    title: args.title,
    date: args.date,
    sets: args.sets,
    // Grouped: "23850 lb" read as a code rather than a weight.
    volume: `${Math.round(args.tonnage).toLocaleString()} ${args.units}`,
    minutes: args.minutes,
    ...(heft === undefined ? {} : { heft: `about ${describeHeft(heft)}` }),
    records: args.records.map((record) => ({
      name: record.name,
      detail: `${
        record.set.load === undefined || record.set.load <= 0
          ? 'BW'
          : formatLoad(record.set.load, args.units)
      } × ${record.set.reps === undefined ? '—' : String(record.set.reps)}`,
      label: RECORD_LABELS[record.kind],
    })),
  }
}
