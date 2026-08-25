import { useSettings } from '@/app/context'
import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { RPE_SCALE } from '@/domain/framework/rpe'
import { DEFAULT_RTS, estimatedMaxFromSet, FATIGUE_TARGETS } from '@/domain/framework/rts'
import { asExerciseId } from '@/domain/ids/ids'
import { STRENGTH_LIFT_LABELS, STRENGTH_LIFTS } from '@/domain/priority/tiers'
import { loadForRpe } from '@/domain/strength/one-rep-max'
import { formatLoad, roundLoad } from '@/domain/units/weight'
import { Badge, Card, Section } from '@/components/shared/primitives'

/**
 * Where the strength numbers come from, worked through on real ones.
 *
 * RTS is not complicated but it is unfamiliar, and it asks the lifter to
 * do something a percentage program never does: choose the weight. That
 * only feels safe once you can see what the app does with the answer —
 * that the top set is a *measurement*, that the back-offs stop on a rule
 * rather than a count, and that a missed estimate corrects itself the
 * first time you lift.
 *
 * Worked with the lifter's own maxes rather than a generic example. An
 * explanation in somebody else's numbers is a page you read once; one in
 * yours is a page you check against the bar.
 */
export function RtsExplainer() {
  const { settings } = useSettings()

  const rts = DEFAULT_RTS
  const round = (value: number): number => roundLoad(value, settings.roundingIncrement)

  const worked = STRENGTH_LIFTS.map((lift) => {
    const id = asExerciseId(STRENGTH_LIFT_SLUGS[lift])
    const max = settings.estimatedMaxes[id]
    const tier = settings.strengthTiers.find((entry) => entry.members.includes(lift))?.rank ?? 2

    const suggested = max === undefined ? undefined : loadForRpe(max, rts.topSetReps, rts.topSetRpe)

    const backoff =
      suggested === undefined ? undefined : suggested * (1 - (rts.loadDropPercent ?? 5) / 100)

    // The target that decides when to stop: the harder the lift is being
    // pushed, the further the estimated max is allowed to fall.
    const target =
      tier === 1
        ? FATIGUE_TARGETS.high
        : tier === 2
          ? FATIGUE_TARGETS.moderate
          : FATIGUE_TARGETS.minimal

    return {
      lift,
      label: STRENGTH_LIFT_LABELS[lift],
      tier,
      max,
      suggested: suggested === undefined ? undefined : round(suggested),
      backoff: backoff === undefined ? undefined : round(backoff),
      target,
    }
  })

  // A concrete stopping example, in the lifter's own numbers.
  const example = worked.find((entry) => entry.suggested !== undefined)
  const stopAt =
    example?.max === undefined ? undefined : round(example.max * (1 - example.target / 100))

  const droppedE1rm =
    example?.backoff === undefined
      ? undefined
      : estimatedMaxFromSet({ load: example.backoff, reps: rts.topSetReps, rpe: 9 })

  return (
    <>
      <Section
        title="How the strength work decides its numbers"
        description="RTS: you choose the weight, the app reads what it means"
      >
        <Card className="space-y-4">
          <Step
            number={1}
            title="Work up to one top set"
            body={`Not to a number the app gave you — to ${String(rts.topSetReps)} reps that feel like RPE ${String(rts.topSetRpe)}, which is ${String(10 - rts.topSetRpe)} reps short of failure. The weight shown is a suggestion from your last estimate, and being wrong about it costs a warm-up set.`}
          />
          <Step
            number={2}
            title="That set is a measurement"
            body="Reps and RPE together say what your max is today, via the RPE chart. Five at RPE 8 is about 81% of a max; five at RPE 10 is about 87%. Two sets at the same weight mean different things and the chart is what tells them apart."
          />
          <Step
            number={3}
            title="Back-offs are one weight, and you log how each felt"
            body={`Take ${String(rts.loadDropPercent ?? 5)}% off the top set and keep the bar there. The RPE is not prescribed — it is what you record, and it climbs set over set as you tire. That reading is the measurement, the same as the top set's was.`}
          />
          <Step
            number={4}
            title="Fatigue says when to stop, not a set count"
            body={`Each back-off implies its own max. When that number has fallen by the day's target percentage from the top set, the session's work on that lift is done — which is why the count shown is a cap rather than a plan.`}
          />
          <Step
            number={5}
            title="Tomorrow starts from today"
            body="The top set replaces the estimate, so the next suggestion is built from what you actually lifted. Nothing needs recalculating and no training max needs maintaining by hand."
          />
        </Card>
      </Section>

      <Section
        title="Your numbers today"
        description={`Fatigue target by tier — ${String(FATIGUE_TARGETS.high)}% specialising, ${String(FATIGUE_TARGETS.moderate)}% building, ${String(FATIGUE_TARGETS.minimal)}% maintaining`}
      >
        <Card>
          <ul className="space-y-3">
            {worked.map((entry) => (
              <li key={entry.lift}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-ink-50 text-sm font-medium">{entry.label}</span>
                  <Badge tone={entry.tier === 1 ? 'accent' : 'neutral'}>
                    {entry.target}% fatigue target
                  </Badge>
                </div>

                {entry.suggested === undefined ? (
                  <p className="text-ink-500 mt-1 text-xs">
                    No estimate yet — the first top set you log sets one.
                  </p>
                ) : (
                  <p className="text-ink-500 numeric mt-1 text-xs">
                    {formatLoad(entry.max ?? 0, settings.units)} estimated max → top set about{' '}
                    <span className="text-ink-100">
                      {formatLoad(entry.suggested, settings.units)}
                    </span>{' '}
                    for {rts.topSetReps} @ RPE {rts.topSetRpe}, back-offs from{' '}
                    {formatLoad(entry.backoff ?? 0, settings.units)}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {example?.suggested !== undefined && stopAt !== undefined && (
            <div className="border-ink-800 mt-4 border-t pt-3">
              <p className="text-ink-300 text-sm font-medium">What stopping looks like</p>
              <p className="text-ink-500 mt-1 text-xs">
                {example.label}: the top set at {formatLoad(example.suggested, settings.units)} says
                your max is about {formatLoad(example.max ?? 0, settings.units)}. Keep taking
                back-offs at {formatLoad(example.backoff ?? 0, settings.units)} until a set implies{' '}
                {formatLoad(stopAt, settings.units)} or less — that is the {example.target}% drop.
                {droppedE1rm !== undefined && (
                  <>
                    {' '}
                    A back-off of {rts.topSetReps} at RPE 9 implies{' '}
                    {formatLoad(round(droppedE1rm), settings.units)}, so it is
                    {round(droppedE1rm) <= stopAt ? ' the last one' : ' not there yet'}.
                  </>
                )}
              </p>
            </div>
          )}

          <p className="text-ink-500 mt-3 text-xs">
            {DEFAULT_RTS.method === 'load-drop'
              ? `Back-offs drop ${String(rts.loadDropPercent ?? 5)}% from the top set and repeat at that weight.`
              : 'Back-offs repeat at the top-set weight.'}{' '}
            At most {rts.maxBackoffSets}, so a day where the stopping rule is slow to fire still
            ends.
          </p>
        </Card>
      </Section>

      <Section title="Reading the RPE" description="The one judgement the whole system rests on">
        <Card>
          <p className="text-ink-500 mb-3 text-xs">
            Every load in this program descends from an RPE you typed, so a rating that is
            consistently one point generous is a program running one point heavier than the one on
            screen — and nothing downstream can tell. The question to answer is not how hard it
            felt. It is how many more you could have done.
          </p>

          <ul className="space-y-2">
            {RPE_SCALE.map((entry) => (
              <li key={entry.rpe} className="flex gap-3">
                <span className="text-ink-100 numeric w-8 shrink-0 text-sm font-semibold">
                  {entry.rpe}
                </span>
                <div className="min-w-0">
                  <p className="text-ink-300 text-sm">
                    {entry.feel}
                    <span className="text-ink-500 numeric"> · {entry.rir} in reserve</span>
                  </p>
                  <p className="text-ink-500 mt-0.5 text-xs">{entry.cue}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </Section>
    </>
  )
}

function Step({
  number,
  title,
  body,
}: {
  readonly number: number
  readonly title: string
  readonly body: string
}) {
  return (
    <div className="flex gap-3">
      <span
        className="bg-ink-800 text-ink-300 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        aria-hidden
      >
        {number}
      </span>
      <div>
        <p className="text-ink-50 text-sm font-medium">{title}</p>
        <p className="text-ink-500 mt-0.5 text-xs">{body}</p>
      </div>
    </div>
  )
}
