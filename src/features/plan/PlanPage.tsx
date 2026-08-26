import { Link } from 'react-router-dom'

import { useSettings } from '@/app/context'
import { shortfalls, type Shortfall } from '@/domain/priority/capacity'
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from '@/domain/exercises/taxonomy'
import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId } from '@/domain/ids/ids'
import { attributeWeek } from '@/domain/volume/attribution'
import {
  describeBlock,
  explainVolume,
  type Band,
  type MuscleAllocation,
} from '@/domain/priority/explain'
import { Badge, Card, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { cn } from '@/lib/cn'

import { useExercises, useProgram } from '@/features/train/hooks'
import { RtsExplainer } from './RtsExplainer'

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

const BAND_TONE: Record<Band, 'accent' | 'good' | 'neutral'> = {
  specialising: 'accent',
  building: 'good',
  maintaining: 'neutral',
}

export function PlanPage() {
  const { settings } = useSettings()
  const program = useProgram()
  const exercises = useExercises()

  const plan = explainVolume(settings.muscleTiers, settings.strengthTiers, settings.landmarks)

  const byTier = [1, 2, 3].map((rank) => ({
    rank,
    label: plan.muscles.find((entry) => entry.tier === rank)?.tierLabel ?? `Tier ${String(rank)}`,
    muscles: plan.muscles
      .filter((entry) => entry.tier === rank)
      .sort((a, b) => b.weeklySets - a.weeklySets),
  }))

  const running = program.data
  const block = describeBlock(settings.muscleTiers, settings.strengthTiers)

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
        The subtitle says what the page is for, not what the block is
        called.

        It used to be the block's name — a derived string like "Biceps,
        side delts, lats and chest · Bench press strength" — set in small
        grey type under a one-word heading. Two problems. It wrapped to
        three lines on a phone, and it answered a question nobody had:
        arriving on a screen called Plan, you want to know what the screen
        tells you, and the block's identity is a thing to *read*, not a
        caption.

        So the name moved down into a card with room for it, split into
        the two facets it always had, with the description that was being
        computed and thrown away.
      */}
      <header className="mb-6">
        <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Plan</h1>
        <p className="text-ink-500 mt-0.5 text-sm">
          What this block asks of you, and whether the week can deliver it
        </p>
      </header>

      <Section title="This block">
        <Card className="space-y-3">
          <dl className="space-y-2">
            <Facet term="Volume" detail={block.focus.muscles} />
            {block.focus.lifts !== undefined && (
              <Facet term="Strength" detail={block.focus.lifts} />
            )}
          </dl>

          <p className="text-ink-500 border-ink-800 border-t pt-3 text-xs">{block.description}</p>
        </Card>

        <Link to="/program" className={cn(buttonStyles({ variant: 'primary' }), 'mt-3 w-full')}>
          See every week, with the weights it would give you
        </Link>
      </Section>

      <CapacityReport missing={missing} known={running !== undefined && library.length > 0} />

      {/*
        What every session shares is said here, once.

        It was on each lift, which put the same sentence on three
        consecutive rows and taught the eye to skip all three — including
        the session count, which is the only part that differs.
      */}
      <Section
        title="The three lifts"
        description="Every session is the same shape — a top set, then back-offs until the lighter bar feels like it did. Priority buys how many, not how long."
      >
        <Card>
          <ul className="space-y-3">
            {plan.lifts.map((lift) => (
              <li key={lift.lift}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-50 text-sm font-medium">{lift.label}</span>
                  <Badge tone={lift.tier === 1 ? 'accent' : 'neutral'}>Tier {lift.tier}</Badge>
                </div>
                <p className="text-ink-500 mt-0.5 text-xs">{lift.reason}</p>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      {byTier.map((tier) =>
        tier.muscles.length === 0 ? null : (
          <Section
            key={tier.rank}
            title={`Tier ${String(tier.rank)} — ${tier.label}`}
            description={`${String(tier.muscles.reduce((total, entry) => total + entry.weeklySets, 0))} hard sets a week across ${String(tier.muscles.length)} muscles`}
          >
            <Card>
              <ul className="space-y-3">
                {tier.muscles.map((muscle) => (
                  <MuscleRow key={muscle.muscle} allocation={muscle} />
                ))}
              </ul>
            </Card>
          </Section>
        ),
      )}

      <RtsExplainer />

      <Section title="Change any of it">
        <Card className="space-y-3">
          <p className="text-ink-300 text-sm">
            These numbers come from three inputs: which tier each muscle is in, the landmark band
            for that muscle, and nothing else. Both are in Settings.
          </p>
          <Link to="/settings" className={cn(buttonStyles({ variant: 'outline' }), 'w-full')}>
            Edit priorities and landmarks
          </Link>
        </Card>
      </Section>
    </div>
  )
}

function MuscleRow({ allocation }: { readonly allocation: MuscleAllocation }) {
  const { landmarks: marks, weeklySets } = allocation

  // Where the target sits across the full MV→MRV range, for the bar.
  const span = Math.max(1, marks.mrv - marks.mv)
  const fill = Math.max(0, Math.min(1, (weeklySets - marks.mv) / span))
  const mevMark = Math.max(0, Math.min(1, (marks.mev - marks.mv) / span))
  const mavMark = Math.max(0, Math.min(1, (marks.mav - marks.mv) / span))

  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-50 text-sm font-medium">{allocation.label}</span>
        <span className="numeric text-ink-50 text-sm font-semibold">
          {weeklySets}
          <span className="text-ink-500 font-normal"> sets</span>
        </span>
      </div>

      {/* MV at the left, MRV at the right, with MEV and MAV marked. */}
      <div className="bg-ink-850 relative mt-1.5 h-2 overflow-hidden rounded-full">
        <div
          className={cn(
            'h-full rounded-full',
            BAND_TONE[allocation.band] === 'accent'
              ? 'bg-accent-500'
              : BAND_TONE[allocation.band] === 'good'
                ? 'bg-good-500'
                : 'bg-ink-700',
          )}
          style={{ width: `${String(Math.round(fill * 100))}%` }}
        />
        <span
          className="bg-ink-500/70 absolute top-0 h-full w-px"
          style={{ left: `${String(Math.round(mevMark * 100))}%` }}
          aria-hidden
        />
        <span
          className="bg-ink-500/70 absolute top-0 h-full w-px"
          style={{ left: `${String(Math.round(mavMark * 100))}%` }}
          aria-hidden
        />
      </div>

      <div className="text-ink-500 numeric mt-1 flex justify-between text-[11px]">
        <span>MV {marks.mv}</span>
        <span>MEV {marks.mev}</span>
        <span>MAV {marks.mav}</span>
        <span>MRV {marks.mrv}</span>
      </div>

      <p className="text-ink-500 mt-1 text-xs">{allocation.reason}</p>
    </li>
  )
}

/** One half of the block's focus, as a term and its detail. */
function Facet({ term, detail }: { readonly term: string; readonly detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500 shrink-0 text-xs tracking-wide uppercase">{term}</dt>
      <dd className="text-ink-50 text-right text-sm font-medium">{detail}</dd>
    </div>
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
 * Silence when everything fits is deliberate. A section permanently
 * present, reading "0 muscles short", trains the eye to skip it — and
 * this is precisely the thing that must be noticed on the one week it has
 * something to say.
 */
function CapacityReport({
  missing,
  known,
}: {
  readonly missing: readonly Shortfall[]
  readonly known: boolean
}) {
  if (!known) return null

  if (missing.length === 0) {
    return (
      <Section title="Can the week deliver it?">
        <Card>
          <p className="text-ink-300 text-sm">
            Yes — every muscle&rsquo;s weekly target is met by the program as built.
          </p>
        </Card>
      </Section>
    )
  }

  return (
    <Section
      title="Can the week deliver it?"
      description="Measured off the program as built, not predicted from the tiers"
    >
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

        {/*
          Counted per muscle and never summed. Every set pays two or three
          muscles, so a total delivered would exceed a total asked even in
          a week that starves a prioritised muscle — a surplus reported
          over a shortfall.
        */}
        <p className="text-ink-500 border-ink-800 mt-3 border-t pt-3 text-xs">
          Nothing has been scaled down to hide this. The targets above are exactly what your tiers
          ask for; these are the ones the week has no room for. Fewer muscles in tier 1, another
          training day, or accepting the gap are all reasonable answers — the app will not pick one
          for you.
        </p>
      </Card>
    </Section>
  )
}
