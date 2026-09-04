import { Link } from 'react-router-dom'

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
 * **Unmeasured is drawn, not hidden — and that is a correction.** It
 * returned `null` with no restoratives set, on the reasoning that a bar
 * pinned at nought reads as dying where an absent one reads as not
 * measured. True of the bar, and it made the whole feature invisible:
 * reported as _"not seeing … the vitality/health bar which I would
 * assume to be by the avatar."_ It was by the avatar, and it was
 * nowhere, because nothing had been set up and nothing said so.
 *
 * So the unmeasured state is a **flat track and a way in** rather than
 * either a number or a hole. Absent-never-zero is kept — no percentage
 * is shown and no colour is claimed — while the thing itself is
 * discoverable, which is the half the first version lost.
 */
export function HealthBar() {
  const pools = useVices()
  const services = useServices()

  if (pools.data === undefined) return null

  const reading = vitality(pools.data, services.clock.now())

  if (reading.value === undefined) {
    return (
      <div className="mt-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-ink-700 text-xs">Health</span>
          {/*
            "Set up" rather than "Set restoratives": the column beside a
            120-pixel portrait is about 200 wide and loses more to the
            settings link, so the longer phrase wrapped onto two lines —
            the mid-phrase break this card has now hit three times.
          */}
          <Link to="/limits" className="text-accent-400 shrink-0 text-xs underline">
            Set up
          </Link>
        </div>
        {/*
          `of` of nought draws the track alone — nothing over nothing is
          not empty, which is exactly the state being reported.
        */}
        <Meter className="mt-1" value={0} of={0} height={6} label="Health, not measured yet" />
      </div>
    )
  }

  const percent = Math.round(reading.value * 100)

  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-700 text-xs">Health</span>
        <span className="numeric text-ink-500 text-xs">{percent}%</span>
      </div>

      {/*
        **The fill and the percentage come from one number, and for a
        commit they did not.** The meter drew `met - over` over
        `possible` — the old flat average — while the figure above it came
        from the walk that replaced it, so a bar reading 50% could be
        drawn a fifth full. Two renderings of one quantity, disagreeing.

        `Meter` requires a denominator so a call site cannot hide what it
        divides by. This one divides by a full bar, which is what health
        is a share of.
      */}
      <Meter
        className="mt-1"
        value={percent}
        of={100}
        height={6}
        /*
          Green when it is mostly full, amber in the middle, red low —
          the one place in this app a colour carries a judgement, because
          a health bar that is always the accent colour is a decoration
          rather than a warning.
        */
        tone={percent >= 67 ? 'good' : percent >= 34 ? 'accent' : 'bad'}
        /*
         * **Today's own figures, because the bar is no longer an
         * average.** It read "2 of 10 target days standing" — an honest
         * description of the old arithmetic that told a reader nothing
         * about what to do next. What moves the bar now is today.
         *
         * `todayMet` counts restoratives genuinely hit, not the
         * not-yet-missed ones `met` carries. That distinction is why the
         * label cannot be built from `met`: on an untouched morning it
         * would claim a full day's work had been done, and this is the
         * only version of the bar a screen reader gets.
         */
        label={`Health, ${String(percent)} per cent — ${String(reading.todayMet)} of ${String(reading.todayTargets)} restoratives hit today, over the last ${String(reading.days)} days`}
      />
    </div>
  )
}
