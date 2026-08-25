import type { ExerciseId } from '@/domain/ids/ids'
import type { LoadSource, RepTarget, SetPrescription } from '@/domain/programs/prescription'
import { describeReps } from '@/domain/programs/prescription'
import { loadForRpe, RPE_CHART_MAX_REPS } from '@/domain/strength/one-rep-max'
import type { RoundingMode, WeightUnit } from '@/domain/units/weight'
import { formatLoad, roundLoad } from '@/domain/units/weight'

/**
 * Turning a prescription into numbers a lifter can act on.
 *
 * This is the seam that neither old app had. LiftTracker generated
 * concrete `Set` rows into the database months in advance and then
 * mutated those same rows when a set was logged — so the program *was*
 * the log, editing a program corrupted history, and a training max could
 * not change without regenerating everything downstream. StrengthFlow
 * skipped prescription entirely and carried forward last week's weight.
 *
 * Here resolution is a pure function evaluated on demand. The template
 * stores intent ("85% of your training max"); the number is computed when
 * the session is opened, against whatever the training max is *then*.
 * Nothing is written until a set is actually performed.
 */

export interface AthleteState {
  /**
   * Maxes estimated from logged history — the only basis for a suggested
   * load now that strength is run by RTS.
   *
   * Explicit training maxes used to sit alongside these, because 5/3/1
   * expressed every set as a percentage of one and an estimate would have
   * silently changed what the program meant. RTS asks for reps at an RPE
   * instead, so the number is a suggestion rather than the prescription,
   * and an estimate is exactly the right basis for it.
   */
  readonly estimatedMaxes: Readonly<Partial<Record<ExerciseId, number>>>
  readonly bodyweight?: number
  readonly units: WeightUnit
}

export interface ResolutionContext {
  readonly athlete: AthleteState
  readonly exerciseId: ExerciseId
  readonly roundingIncrement: number
  readonly roundingMode?: RoundingMode
}

/**
 * Why a set could not be given a number.
 *
 * Surfacing the reason is the difference between an input the lifter
 * knows to fill in and a mysterious blank. A `0 lb` placeholder — which
 * is what LiftTracker rendered when its exercise query matched nothing —
 * is the worst of the three options, because it looks like an answer.
 */
export type UnresolvedReason =
  'no-estimated-max' | 'no-bodyweight' | 'rpe-outside-chart' | 'open-prescription'

export interface ResolvedSet {
  /** The prescribed load, rounded to the gym's increment. Undefined if unresolved. */
  readonly load?: number
  readonly reps: RepTarget
  readonly isWarmup: boolean
  readonly notes?: string
  /** What to show where the load goes: "185 lb", "BW", "RPE 8". */
  readonly loadDisplay: string
  readonly repsDisplay: string
  readonly unresolved?: UnresolvedReason
  /** Carried through so the log can record what was asked for. */
  readonly prescription: SetPrescription
}

export function resolveSet(prescription: SetPrescription, context: ResolutionContext): ResolvedSet {
  const resolved = resolveLoad(prescription.load, prescription.reps, context)

  return {
    ...(resolved.load !== undefined ? { load: resolved.load } : {}),
    reps: prescription.reps,
    isWarmup: prescription.isWarmup ?? false,
    ...(prescription.notes !== undefined ? { notes: prescription.notes } : {}),
    loadDisplay: resolved.display,
    repsDisplay: describeReps(prescription.reps),
    ...(resolved.unresolved !== undefined ? { unresolved: resolved.unresolved } : {}),
    prescription,
  }
}

export function resolveSets(
  prescriptions: readonly SetPrescription[],
  context: ResolutionContext,
): readonly ResolvedSet[] {
  return prescriptions.map((prescription) => resolveSet(prescription, context))
}

interface LoadResolution {
  readonly load?: number
  readonly display: string
  readonly unresolved?: UnresolvedReason
}

function resolveLoad(
  source: LoadSource,
  reps: RepTarget,
  context: ResolutionContext,
): LoadResolution {
  const { athlete, exerciseId, roundingIncrement, roundingMode } = context
  const round = (value: number): number => roundLoad(value, roundingIncrement, roundingMode)

  switch (source.kind) {
    case 'percent-e1rm': {
      const estimate = athlete.estimatedMaxes[exerciseId]
      if (estimate === undefined) {
        return { display: `${String(source.percent)}% e1RM`, unresolved: 'no-estimated-max' }
      }
      const load = round(estimate * (source.percent / 100))
      return { load, display: formatLoad(load, athlete.units) }
    }

    case 'bodyweight': {
      const added = source.addedLoad ?? 0
      if (athlete.bodyweight === undefined) {
        // Bodyweight work is still perfectly performable without knowing
        // the number — only the volume maths suffers — so this displays
        // usefully rather than as an error.
        return {
          display: added === 0 ? 'BW' : `BW +${formatLoad(added, athlete.units)}`,
          unresolved: 'no-bodyweight',
        }
      }
      const load = round(athlete.bodyweight + added)
      return {
        load,
        display: added === 0 ? 'BW' : `BW +${formatLoad(added, athlete.units)}`,
      }
    }

    case 'absolute': {
      const load = round(source.load)
      return { load, display: formatLoad(load, athlete.units) }
    }

    case 'rpe': {
      // An RPE prescription is satisfied by feel, not by a number, so an
      // unresolvable suggestion is not a failure — the set is still fully
      // performable. The suggestion is a convenience on top.
      const basis = athlete.estimatedMaxes[exerciseId]
      const display = `RPE ${String(source.target)}`

      if (basis === undefined) return { display, unresolved: 'no-estimated-max' }

      const nominal = repsForRpeLookup(reps)
      if (nominal === undefined) return { display, unresolved: 'rpe-outside-chart' }

      const suggested = loadForRpe(basis, nominal, source.target)
      if (suggested === undefined) return { display, unresolved: 'rpe-outside-chart' }

      const load = round(suggested)
      return { load, display: `${formatLoad(load, athlete.units)} @ RPE ${String(source.target)}` }
    }

    /*
     * The top set's suggested weight, less the drop.
     *
     * Two chained suggestions rather than one, and both are corrigible:
     * if the estimate is wrong the lifter loads what the top set actually
     * came out at and takes the drop off *that*. What the app must not do
     * is derive this from an RPE — that would quietly turn a fixed drop
     * into "lighten it until it feels easy", and the number would stop
     * matching the "load drop N%" the slot claims.
     */
    case 'rts-backoff': {
      const basis = athlete.estimatedMaxes[exerciseId]
      const display = `${String(source.dropPercent)}% off the top set`

      if (basis === undefined) return { display, unresolved: 'no-estimated-max' }

      const topSet = loadForRpe(basis, source.topSetReps, source.topSetRpe)
      if (topSet === undefined) return { display, unresolved: 'rpe-outside-chart' }

      const load = round(topSet * (1 - source.dropPercent / 100))
      return { load, display: formatLoad(load, athlete.units) }
    }

    case 'open':
      return { display: '—', unresolved: 'open-prescription' }
  }
}

/** The rep count to look up in the RPE chart for a given target. */
function repsForRpeLookup(reps: RepTarget): number | undefined {
  switch (reps.kind) {
    case 'fixed':
      return reps.reps
    case 'range':
      /*
       * The top of the range is the conservative read: a load chosen for
       * the bottom of an 8–12 range would be too heavy to reach twelve.
       *
       * Clamped to the chart, because hypertrophy ranges now run to
       * thirty and the chart stops at twelve. Without the clamp every
       * accessory lost its suggested weight the day the ranges widened —
       * an honest "no answer", and a worse one than the weight for a set
       * of twelve, which is at least a place to start loading from.
       */
      return Math.min(reps.high, RPE_CHART_MAX_REPS)
    case 'amrap':
      return reps.minimum
    case 'time':
      return undefined
  }
}

/**
 * Whether every set in a list could be given a number.
 *
 * The program list uses this to warn "3 lifts need a training max" before
 * the lifter is standing at the rack, rather than at the moment they
 * open the set.
 */
export function missingRequirements(sets: readonly ResolvedSet[]): readonly UnresolvedReason[] {
  const reasons = new Set<UnresolvedReason>()
  for (const set of sets) {
    // An open prescription is a deliberate choice, not a gap, and an RPE
    // set with no suggestion is still performable. Neither is reported.
    if (set.unresolved !== undefined && set.unresolved !== 'open-prescription') {
      reasons.add(set.unresolved)
    }
  }
  return [...reasons]
}
