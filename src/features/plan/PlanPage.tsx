import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/shared/PageHeader'

import { useSettings } from '@/app/context'
import { shortfalls, type Shortfall } from '@/domain/priority/capacity'
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from '@/domain/exercises/taxonomy'
import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId } from '@/domain/ids/ids'
import { attributeWeek } from '@/domain/volume/attribution'
import { explainVolume, type MuscleAllocation } from '@/domain/priority/explain'
import type { VolumeLevel } from '@/domain/volume/levels'
import { VOLUME_LEVELS, VOLUME_LEVEL_LABELS } from '@/domain/volume/levels'
import { Badge, Card, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { cn } from '@/lib/cn'

import { useExercises, useProgram } from '@/features/train/hooks'

/**
 * What the block is doing to you, and why.
 *
 * The tier editor answers "what did I choose"; this answers "what did
 * that cost". They are different questions and the second is the one a
 * lifter asks when a session feels wrong — is my chest low because I set
 * it low, or because something else ate the budget?
 *
 * Every number here is shown with its derivation. A weekly set target
 * with no visible cause is unfalsifiable: there is no way to tell a
 * deliberate allocation from a bug, and no way to know which input to
 * change to move it.
 */

export function PlanPage() {
  const { settings } = useSettings()
  const program = useProgram()
  const exercises = useExercises()

  const plan = explainVolume(settings.muscleVolumes, settings.setsPerSession, settings.liftSessions)

  /*
   * Grouped by level, with everything untrained in one group at the end.
   *
   * This grouped by tier, which was the same thing under a different name
   * while a tier decided the volume. It no longer does: two muscles on the
   * same level can be trained a different number of times a week, so the
   * group is a claim about how hard the sessions are and the row says how
   * many there are.
   */
  const groups: readonly {
    readonly key: string
    readonly label: string
    readonly muscles: typeof plan.muscles
  }[] = [
    ...VOLUME_LEVELS.map((level: VolumeLevel) => ({
      key: level,
      label: `${VOLUME_LEVEL_LABELS[level]} volume`,
      muscles: plan.muscles
        .filter((entry) => entry.weeklySets > 0 && entry.level === level)
        .sort((a, b) => b.weeklySets - a.weeklySets),
    })),
    {
      key: 'untrained',
      label: 'No direct work',
      muscles: plan.muscles.filter((entry) => entry.weeklySets <= 0),
    },
  ]

  const running = program.data

  /*
   * Measured off the built week, not predicted from the tiers.
   *
   * The difference matters: a modelled shortfall is a second opinion
   * about what the assembler will do, and the two drift. Reading the
   * assembler's own output means this cannot claim a muscle is short when
   * the session list shows otherwise.
   *
   * Any working week will do, because every working week is identical —
   * that is the property `rp-assemble.test.ts` guards. The deload is
   * skipped, since a week deliberately at maintenance is short of
   * everything and saying so is noise.
   */
  const workingWeek = running?.blocks[0]?.weeks.find((week) => !week.isDeload)

  const library = exercises.data ?? []
  const lookup = (id: ExerciseId): Exercise | undefined =>
    library.find((exercise) => exercise.id === id)

  const askedFor = (muscle: MuscleGroup): number =>
    plan.muscles.find((entry) => entry.muscle === muscle)?.weeklySets ?? 0

  const missing =
    workingWeek === undefined || library.length === 0
      ? []
      : shortfalls(
          attributeWeek(workingWeek, lookup).map((entry) => ({
            muscle: entry.muscle,
            label: MUSCLE_GROUP_LABELS[entry.muscle],
            total: entry.total,
          })),
          askedFor,
        )

  return (
    <div>
      {/*
        No subtitle, after three attempts at one.

        It began as the block's derived name — "Biceps, side delts, lats
        and chest · Bench press strength" — in small grey type under a
        one-word heading, where it wrapped to three lines on a phone. That
        moved into a card with room for it. What replaced it were two
        goes at saying what the page is for, and both were throat-clearing
        above sections that already say it: "This block", "Can the week
        deliver it?", "Tier 1 — Specialising".

        A heading needs a subtitle when the sections under it are not
        self-describing. These are. The other screens carry one because
        theirs earns its place — Program reports which week you are on,
        History how many sessions exist — and neither is a description of
        the page.
      */}
      <PageHeader title="Plan" />

      {/*
        The block's identity is not on this page any more.

        It was a card naming the two focuses and repeating a derived
        sentence — "Chest, side delts and biceps specialised. Front delts,
        rear delts, triceps... building." Every clause of that is restated
        below as an actual tier with actual numbers, and the name itself
        is already in the Train screen's header, which is where someone
        checks what block they are running.

        What survives is the link, because it is the only route to the
        Program page and it answers the question the page ends on: fine,
        so what does the week look like.
      */}
      <Link to="/program" className={cn(buttonStyles({ variant: 'primary' }), 'mb-6 w-full')}>
        See every week, with the weights it would give you
      </Link>

      <CapacityReport missing={missing} known={running !== undefined && library.length > 0} />

      {/*
        What every session shares is said here, once.

        It was on each lift, which put the same sentence on three
        consecutive rows and taught the eye to skip all three — including
        the session count, which is the only part that differs.
      */}
      <Section
        title="The three lifts"
        description="Every session is the same shape — three straight sets in a rep range. Top the range on all three and the weight goes up next time."
      >
        <Card>
          <ul className="space-y-3">
            {plan.lifts.map((lift) => (
              <li key={lift.lift}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-50 text-sm font-medium">{lift.label}</span>
                  <Badge tone={lift.sessionsPerWeek > 0 ? 'accent' : 'neutral'}>
                    {lift.sessionsPerWeek}× a week
                  </Badge>
                </div>
                <p className="text-ink-500 mt-0.5 text-xs">{lift.reason}</p>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      {groups.map((group) =>
        group.muscles.length === 0 ? null : (
          <Section
            key={group.key}
            title={group.label}
            description={`${String(group.muscles.reduce((total, entry) => total + entry.weeklySets, 0))} hard sets a week across ${String(group.muscles.length)} muscle${group.muscles.length === 1 ? '' : 's'}`}
          >
            <LevelCard muscles={group.muscles} />
          </Section>
        ),
      )}

      <Section title="Change any of it">
        <Card className="space-y-3">
          <p className="text-ink-300 text-sm">
            Two inputs and no arithmetic between them: which tier a muscle is in, and the three
            landmarks every muscle shares. Tier 1 gets MRV, tier 2 gets MEV, tier 3 gets nothing,
            and a deload drops all of them to MV. Both inputs are in Settings.
          </p>
          <Link to="/settings" className={cn(buttonStyles({ variant: 'outline' }), 'w-full')}>
            Edit priorities and landmarks
          </Link>
        </Card>
      </Section>
    </div>
  )
}

/**
 * One card per group, not one per muscle.
 *
 * Every muscle used to get a landmark bar, four numbers under it and a
 * sentence of its own derivation. That was worth the space while the
 * derivation was per-muscle. It is not now: a group shares a level, so
 * it shares the sets-per-session number, and the only thing that varies
 * within a group is how many sessions — which is one figure per row.
 */
function LevelCard({ muscles }: { readonly muscles: readonly MuscleAllocation[] }) {
  const first = muscles[0]
  if (first === undefined) return null

  return (
    <Card className="space-y-3">
      <p className="text-ink-500 text-xs">{first.reason}</p>

      <ul className="space-y-1.5">
        {muscles.map((muscle) => (
          <li key={muscle.muscle} className="flex items-baseline justify-between gap-3">
            <span className="text-ink-300 min-w-0 flex-1 truncate text-sm">{muscle.label}</span>

            {muscle.weeklySets > 0 ? (
              <span className="numeric text-ink-500 shrink-0 text-xs">
                {muscle.sessionsPerWeek} × {muscle.setsPerSession}
                <span className="text-ink-50 font-semibold"> = {muscle.weeklySets}</span>
              </span>
            ) : (
              <span className="text-ink-700 shrink-0 text-xs">—</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * "You cannot prioritise everything", as a report rather than a rule.
 *
 * The tiers state the ask and nothing scales it down — that was tried,
 * as a spread factor, and it made every muscle's target depend on every
 * other muscle's placement until nobody could predict their own settings.
 * What replaced it is this: build the program, then say plainly what the
 * week could not fit.
 *
 * Silence when everything fits is deliberate, and stronger than it was:
 * the section used to render "every muscle's weekly target is met" and now
 * renders nothing at all. A section permanently present is furniture, and
 * furniture teaches the eye to skip it — which is precisely wrong for the
 * one week it has something to say.
 */
function CapacityReport({
  missing,
  known,
}: {
  readonly missing: readonly Shortfall[]
  readonly known: boolean
}) {
  if (!known) return null

  // Nothing to report is reported as nothing. See above.
  if (missing.length === 0) return null

  return (
    <Section title="Short of target">
      <Card>
        <ul className="space-y-3">
          {missing.map((entry) => (
            <li key={entry.muscle}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-ink-50 text-sm font-medium">{entry.label}</span>
                <span className="numeric text-sm">
                  <span className="text-warn-500">{entry.delivered}</span>
                  <span className="text-ink-500"> / {entry.asked}</span>
                </span>
              </div>
              <p className="text-ink-500 mt-0.5 text-xs">
                {entry.short} set{entry.short === 1 ? '' : 's'} short each week
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  )
}
