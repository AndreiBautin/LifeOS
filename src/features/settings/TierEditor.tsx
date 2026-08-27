import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type MuscleGroup } from '@/domain/exercises/taxonomy'
import {
  MAX_FATIGUE_PERCENT,
  MIN_FATIGUE_PERCENT,
  PUBLISHED_FATIGUE_CEILING,
} from '@/domain/framework/rts'
import { STRENGTH_LIFT_LABELS, STRENGTH_LIFTS, type LiftSessions } from '@/domain/priority/tiers'
import type { MuscleVolumes, SetsPerSession, VolumeLevel } from '@/domain/volume/levels'
import {
  MAX_SESSIONS_PER_WEEK,
  MAX_SETS_PER_SESSION,
  VOLUME_LEVELS,
  VOLUME_LEVEL_LABELS,
  weeklySetsFor,
} from '@/domain/volume/levels'

import { Card } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

/**
 * Setting how often each thing is trained, and how hard.
 *
 * The controls are the same shape they have always been — a row of small
 * buttons per muscle — and what a button *means* has changed completely.
 * It used to be a tier, which chose a rank, which chose a position in a
 * landmark band, which chose a target. It is now the number of sessions a
 * week, and the number beside it is that times the sets per session for
 * the level. Nothing between the tap and the number.
 *
 * Zero is a first-class choice rather than a bottom tier. Most muscles
 * are on it: the competition lifts pay them, and a lifter saying "I don't
 * do direct ab work" should be able to say exactly that.
 *
 * Whether the total fits in a week is a separate question, answered on
 * the Plan screen against the program the assembler actually builds.
 */

interface Props {
  readonly muscleVolumes: MuscleVolumes
  readonly liftSessions: LiftSessions
  readonly setsPerSession: SetsPerSession
  readonly fatiguePercent: number
  readonly onMuscleVolumes: (volumes: MuscleVolumes) => void
  readonly onLiftSessions: (sessions: LiftSessions) => void
  readonly onSetsPerSession: (sets: SetsPerSession) => void
  readonly onFatiguePercent: (percent: number) => void
}

const SESSION_CHOICES = Array.from({ length: MAX_SESSIONS_PER_WEEK + 1 }, (_u, i) => i)

export function TierEditor({
  muscleVolumes,
  liftSessions,
  setsPerSession,
  fatiguePercent,
  onMuscleVolumes,
  onLiftSessions,
  onSetsPerSession,
  onFatiguePercent,
}: Props) {
  const setSessions = (muscle: MuscleGroup, sessionsPerWeek: number): void => {
    onMuscleVolumes({ ...muscleVolumes, [muscle]: { ...muscleVolumes[muscle], sessionsPerWeek } })
  }

  const setLevel = (muscle: MuscleGroup, level: VolumeLevel): void => {
    onMuscleVolumes({ ...muscleVolumes, [muscle]: { ...muscleVolumes[muscle], level } })
  }

  return (
    <div className="space-y-3">
      <Card>
        <h3 className="text-ink-50 mb-1 text-sm font-semibold">The three lifts</h3>

        <ul className="space-y-2">
          {STRENGTH_LIFTS.map((lift) => (
            <li key={lift} className="flex items-center justify-between gap-3">
              <span className="text-ink-300 text-sm">{STRENGTH_LIFT_LABELS[lift]}</span>
              <ChoiceRow
                choices={SESSION_CHOICES}
                value={liftSessions[lift]}
                label={(n) => `${STRENGTH_LIFT_LABELS[lift]} ${String(n)} times a week`}
                onSelect={(n) => {
                  onLiftSessions({ ...liftSessions, [lift]: n })
                }}
              />
            </li>
          ))}
        </ul>

        <p className="text-ink-500 mt-3 text-xs">
          Sessions a week. The split decides where they land — the bench goes on upper days, the
          squat and deadlift on lower ones — so asking for more sessions than there are eligible
          days gets you the days that exist, and the Plan screen says so.
        </p>
      </Card>

      <Card>
        <h3 className="text-ink-50 mb-1 text-sm font-semibold">How far back-offs go</h3>

        <div className="flex items-center justify-between gap-3">
          <span className="text-ink-300 text-sm">Fatigue drop</span>
          <ChoiceRow
            choices={Array.from(
              { length: MAX_FATIGUE_PERCENT - MIN_FATIGUE_PERCENT + 1 },
              (_u, i) => MIN_FATIGUE_PERCENT + i,
            )}
            value={fatiguePercent}
            label={(n) => `${String(n)} per cent`}
            onSelect={onFatiguePercent}
          />
        </div>

        <p className="text-ink-500 mt-3 text-xs">
          One number doing two jobs, which is what makes the rule sayable: the back-off bar is this
          much lighter, and you stop when your implied max has dropped this much. At matched reps
          and RPE those are the same moment — you stop when the lighter bar feels like the top set
          did.
        </p>

        {fatiguePercent > PUBLISHED_FATIGUE_CEILING && (
          <p className="text-warn-500 mt-2 text-xs">
            Past published guidance. RTS names {PUBLISHED_FATIGUE_CEILING}% as a high amount of
            fatigue work and does not go above it — beyond that you are extrapolating from your own
            recovery.
          </p>
        )}
      </Card>

      <Card>
        <h3 className="text-ink-50 mb-1 text-sm font-semibold">Sets per session</h3>

        <ul className="space-y-2">
          {(['low', 'medium', 'high'] as const).map((level) => (
            <li key={level} className="flex items-center justify-between gap-3">
              <span className="text-ink-300 text-sm">{VOLUME_LEVEL_LABELS[level]}</span>
              <ChoiceRow
                choices={Array.from({ length: MAX_SETS_PER_SESSION }, (_u, i) => i + 1)}
                value={setsPerSession[level]}
                label={(n) => `${VOLUME_LEVEL_LABELS[level]} is ${String(n)} sets`}
                onSelect={(n) => {
                  onSetsPerSession({ ...setsPerSession, [level]: n })
                }}
              />
            </li>
          ))}
          <li className="flex items-center justify-between gap-3">
            <span className="text-ink-300 text-sm">Deload</span>
            <ChoiceRow
              choices={Array.from({ length: MAX_SETS_PER_SESSION }, (_u, i) => i + 1)}
              value={setsPerSession.deload}
              label={(n) => `Deload is ${String(n)} sets`}
              onSelect={(n) => {
                onSetsPerSession({ ...setsPerSession, deload: n })
              }}
            />
          </li>
        </ul>

        <p className="text-ink-500 mt-3 text-xs">
          Shared by every muscle, so raising Low moves everything assigned to it at once. The deload
          replaces the level for one week and applies whatever a muscle is set to.
        </p>
      </Card>

      <Card>
        <h3 className="text-ink-50 mb-1 text-sm font-semibold">Muscles</h3>

        <p className="text-ink-500 mb-3 text-xs">
          Sessions a week, then how hard each one is. Weekly sets are the two multiplied and there
          is nothing else in it. Zero is a real answer — the competition lifts are what holds those
          muscles up.
        </p>

        <ul className="space-y-2.5">
          {MUSCLE_GROUPS.map((muscle) => {
            const volume = muscleVolumes[muscle]
            const weekly = weeklySetsFor(volume, setsPerSession, false)

            return (
              <li key={muscle} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-300 min-w-0 flex-1 truncate text-sm">
                    {MUSCLE_GROUP_LABELS[muscle]}
                  </span>

                  <span className="numeric text-ink-500 w-16 shrink-0 text-right text-xs">
                    {weekly > 0 ? `${String(weekly)} sets` : '—'}
                  </span>

                  <ChoiceRow
                    choices={SESSION_CHOICES}
                    value={volume.sessionsPerWeek}
                    label={(n) => `${MUSCLE_GROUP_LABELS[muscle]} ${String(n)} times a week`}
                    onSelect={(n) => {
                      setSessions(muscle, n)
                    }}
                  />
                </div>

                {volume.sessionsPerWeek > 0 && (
                  <div className="flex justify-end gap-1">
                    {VOLUME_LEVELS.map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => {
                          setLevel(muscle, level)
                        }}
                        aria-label={`${MUSCLE_GROUP_LABELS[muscle]} at ${VOLUME_LEVEL_LABELS[level]} volume`}
                        aria-pressed={volume.level === level}
                        className={cn(
                          'tap-target rounded-lg border px-2.5 text-xs font-medium transition-colors',
                          volume.level === level
                            ? 'border-good-500 bg-good-500/15 text-good-500'
                            : 'border-ink-800 bg-ink-850 text-ink-500 hover:border-ink-700',
                        )}
                      >
                        {VOLUME_LEVEL_LABELS[level]}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}

function ChoiceRow({
  choices,
  value,
  label,
  onSelect,
}: {
  readonly choices: readonly number[]
  readonly value: number
  readonly label: (choice: number) => string
  readonly onSelect: (choice: number) => void
}) {
  return (
    <div className="flex shrink-0 gap-1">
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          onClick={() => {
            onSelect(choice)
          }}
          aria-label={label(choice)}
          aria-pressed={value === choice}
          className={cn(
            'flex size-9 items-center justify-center rounded-lg border text-xs font-semibold transition-colors',
            value === choice
              ? 'border-accent-500 bg-accent-500 text-black'
              : 'border-ink-800 bg-ink-850 text-ink-500 hover:border-ink-700',
          )}
        >
          {choice}
        </button>
      ))}
    </div>
  )
}
