import { Badge, Card } from '@/components/shared/primitives'
import { SLEEP_HOURS, SLEEP_STANDING_LABELS } from '@/domain/vitals/day-standing'
import { useVitalsToday } from '@/features/vitals/hooks'

/**
 * How the body is doing, as observations rather than as a score.
 *
 * The ask was to feed sleep and intake into *how the avatar is doing
 * health-wise*, and the obvious build is a health bar. **It is the one
 * thing that must not be built.** The portrait's own note already
 * refuses "a power rating, a gear score" as a fourth currency where the
 * model has three on purpose, and a bar needs a denominator — there is
 * no published figure at which a person is 100% healthy, so the app
 * would be inventing the scale it refuses to invent everywhere else.
 *
 * **So: named conditions, each carrying its evidence.** That is the
 * shape the traits row already uses — a row labelled "Charisma" with
 * nothing under it is a number the app made up, and one that says
 * "people you actually saw" is a count of hangouts logged. Here
 * "Short on sleep" says "6.3 h over 5 days" beside it, so a reader who
 * distrusts the label can check what produced it.
 *
 * **Only what has a published standard gets judged.** Sleep does;
 * protein does, against the target derived from bodyweight; calories do
 * not, and are stated without a verdict. See \`day-standing.ts\`.
 *
 * **Absent, never neutral.** Nothing recorded shows nothing — a bar at
 * the midpoint would be a claim that the fortnight was unremarkable,
 * which is a different thing from not having been asked.
 */
export function Condition() {
  const vitals = useVitalsToday()
  const days = vitals.data?.days

  if (days === undefined) return null

  const rows = [
    days.sleep === undefined
      ? undefined
      : {
          key: 'sleep',
          label: SLEEP_STANDING_LABELS[days.sleep.standing],
          tone: days.sleep.standing === 'short' ? ('warn' as const) : ('good' as const),
          evidence: `${String(days.sleep.average)} h a night over ${String(days.sleep.days)} ${
            days.sleep.days === 1 ? 'day' : 'days'
          }`,
        },
    days.protein === undefined
      ? undefined
      : {
          key: 'protein',
          label: days.protein.met ? 'Protein met' : 'Protein short',
          tone: days.protein.met ? ('good' as const) : ('warn' as const),
          evidence: `${String(Math.round(days.protein.average))} g against ${String(
            days.protein.target,
          )} g`,
        },
    days.calories === undefined
      ? undefined
      : {
          key: 'calories',
          /*
           * Stated, never judged. There is no figure at which somebody
           * has eaten correctly — it depends on the person, the phase
           * and the week — so this is net worth's footing, not the
           * credit score's.
           */
          label: `${String(Math.round(days.calories.average))} kcal`,
          tone: 'neutral' as const,
          evidence: `averaged over ${String(days.calories.days)} ${
            days.calories.days === 1 ? 'day' : 'days'
          }`,
        },
  ].filter((one) => one !== undefined)

  if (rows.length === 0) return null

  return (
    <Card>
      <p className="text-ink-500 mb-2 text-sm">Condition</p>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-baseline justify-between gap-3">
            <Badge tone={row.tone}>{row.label}</Badge>
            <span className="text-ink-700 numeric text-right text-xs">{row.evidence}</span>
          </li>
        ))}
      </ul>

      <p className="text-ink-700 mt-3 text-xs">
        From the days you recorded, not from a score. Sleep is read against the {SLEEP_HOURS.enough}
        –{SLEEP_HOURS.ample} hours adults are advised; calories are stated because there is no
        published figure to judge them against.
      </p>
    </Card>
  )
}
