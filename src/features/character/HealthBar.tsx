import { useServices } from '@/app/context'
import { Meter } from '@/components/shared/Meter'
import { vitality } from '@/domain/vitals/vitality'
import { useVices } from '@/features/vitals/hooks'

/**
 * The health bar, under the level.
 *
 * Asked for as _"can we add like a health bar next to the hp at the
 * top?"_ — so it sits in the portrait's own column, beside the figure
 * and under the XP line, which is where a game puts one.
 *
 * **It is a reading of the last seven days, not a stored level.** See
 * `domain/vitals/vitality.ts` for why that is the only version that can
 * exist here: a bar that decayed on a timer would need somewhere to keep
 * how full it was, and device state with no correct merge is the trap
 * this app keeps refusing.
 *
 * **Absent when there is no daily target set**, rather than empty. A
 * health bar pinned at nought reads as dying; one that is not there
 * reads as not measured, which is the truth before anything has been
 * asked of it.
 */
export function HealthBar() {
  const pools = useVices()
  const services = useServices()

  if (pools.data === undefined) return null

  const reading = vitality(pools.data, services.clock.now())
  if (reading.value === undefined) return null

  const percent = Math.round(reading.value * 100)

  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-700 text-xs">Health</span>
        <span className="numeric text-ink-500 text-xs">{percent}%</span>
      </div>

      {/*
        A real denominator: target-days hit over target-days there were,
        the overruns already subtracted. `Meter` requires both numbers so
        a call site cannot hide what it divides by, and this one divides
        by a week of your own targets.
      */}
      <Meter
        className="mt-1"
        value={Math.max(0, reading.met - reading.over)}
        of={reading.possible}
        height={6}
        /*
          Green when it is mostly full, amber in the middle, red low —
          the one place in this app a colour carries a judgement, because
          a health bar that is always the accent colour is a decoration
          rather than a warning.
        */
        tone={percent >= 67 ? 'good' : percent >= 34 ? 'accent' : 'bad'}
        label={`Health, ${String(percent)} per cent — ${String(reading.met)} target days hit and ${String(reading.over)} over the limit in ${String(reading.days)} days`}
      />
    </div>
  )
}
