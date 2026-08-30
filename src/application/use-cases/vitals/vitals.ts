import { toDayKey } from '@/domain/time/day'
import type { IdGenerator, ViceId } from '@/domain/ids/ids'
import { asViceId } from '@/domain/ids/ids'
import type {
  Clock,
  ConditionRepository,
  SettingsRepository,
  ViceRepository,
  WeighInRepository,
} from '@/domain/repositories/ports'
import type { ReadinessFactors } from '@/domain/autoregulation/check-in'
import type { ChargeCycle, ChargeDirection, ChargePreset, DaysLimit } from '@/domain/vitals/charges'
import { saneDaysLimit } from '@/domain/vitals/charges'
import {
  isActive,
  readCharges,
  spendCharge,
  undoLastCharge,
  type ChargeReading,
  type Vice,
} from '@/domain/vitals/charges'
import { conditionFraction, type DayCondition } from '@/domain/vitals/condition'
import { macroTargets, type MacroTargets } from '@/domain/vitals/macros'
import {
  phaseVerdict,
  weightTrend,
  type Phase,
  type PhaseVerdict,
  type WeighIn,
  type WeightTrend,
} from '@/domain/vitals/weight'

/**
 * Vitals: what the body is doing, and what you have left to spend on it.
 *
 * Two readouts that are deliberately **never averaged into one**. The
 * charges are a count of things that happened; the condition is how you
 * said you felt. Blending them would let the half you can simply decide
 * move the half that is a record, and a single "HP" number is exactly
 * the scale `domain/game/` refuses everywhere else.
 *
 * The weight trend sits with them because it answers the third question
 * a body asks — where is this going — and because it is the one number a
 * calorie app cannot tell you about your training.
 */

export interface VitalsDeps {
  readonly vices: ViceRepository
  readonly weighIns: WeighInRepository
  readonly conditions: ConditionRepository
  readonly settings: SettingsRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

export interface PoolView {
  readonly vice: Vice
  readonly reading: ChargeReading
  /** Spends recorded today, which is what the month's rating counts. */
  readonly spentToday: number
}

export interface PhaseView {
  readonly phase: Phase
  readonly range: { readonly min: number; readonly max: number }
  readonly trend?: WeightTrend
  readonly verdict: PhaseVerdict
  /** Today's reading, when there is one. */
  readonly today?: number
}

export interface VitalsToday {
  /**
   * What to eat, or as much of it as the inputs support.
   *
   * Absent when there is no bodyweight to derive from — settings hold
   * one and a weigh-in supplies a better one, and with neither there is
   * nothing here that would not be invented.
   */
  readonly macros?: MacroTargets
  readonly pools: readonly PoolView[]
  /**
   * Absent rather than neutral when nothing has been recorded today.
   *
   * A bar sitting at the midpoint would be a claim that the day is
   * unremarkable, which is a different thing from not having been asked.
   */
  readonly condition?: { readonly fraction: number; readonly readiness: ReadinessFactors }
  readonly phase: PhaseView
}

export async function vitalsToday(deps: VitalsDeps): Promise<VitalsToday> {
  const now = deps.clock.now()
  const today = toDayKey(now)

  const [allVices, weighIns, conditions, settings] = await Promise.all([
    deps.vices.all(),
    deps.weighIns.all(),
    deps.conditions.all(),
    deps.settings.get(),
  ])

  const pools = allVices
    .filter(isActive)
    .map((vice) => ({
      vice,
      reading: readCharges(vice, now),
      spentToday: vice.spent.filter((stamp) => stamp.slice(0, 10) === today).length,
    }))
    /*
     * Emptiest first, so what is nearly gone is what you see. Sorting by
     * name would put the pool you have not touched at the top of a list
     * whose whole job is to say what is left.
     */
    .sort((a, b) => a.reading.available - b.reading.available)

  const trend = weightTrend(weighIns, now)
  const todayWeight = weighIns.find((row) => row.day === today)?.weight
  const condition = conditions.find((row) => row.day === today)
  const verdict = phaseVerdict(trend, settings.phaseRate)

  /*
   * The smoothed weight in preference to the one in settings.
   *
   * Settings hold a single figure a lifter typed once; the trend is an
   * average of what the scale actually said this week. Preferring the
   * stale one would quietly derive a whole cut's protein target from a
   * bodyweight the lifter has since moved away from — which is precisely
   * what weighing in was meant to fix.
   */
  const bodyweight = trend?.current ?? settings.bodyweight
  const macros =
    bodyweight === undefined
      ? undefined
      : macroTargets({
          bodyweight,
          units: settings.units,
          phase: settings.phase,
          range: settings.phaseRate,
          verdict,
          ...(settings.dailyCalories === undefined ? {} : { intake: settings.dailyCalories }),
          ...(trend === undefined ? {} : { trend }),
        })

  return {
    pools,
    ...(macros === undefined ? {} : { macros }),
    ...(condition === undefined
      ? {}
      : {
          condition: {
            fraction: conditionFraction(condition.readiness),
            readiness: condition.readiness,
          },
        }),
    phase: {
      phase: settings.phase,
      range: settings.phaseRate,
      ...(trend === undefined ? {} : { trend }),
      verdict,
      ...(todayWeight === undefined ? {} : { today: todayWeight }),
    },
  }
}

export async function listVices(deps: VitalsDeps): Promise<readonly Vice[]> {
  return (await deps.vices.all()).filter(isActive)
}

export async function listWeighIns(deps: VitalsDeps): Promise<readonly WeighIn[]> {
  return [...(await deps.weighIns.all())].sort((a, b) => a.day.localeCompare(b.day))
}

/** The day limit as a spreadable, so an absent one writes no key at all. */
function daysOrNothing(limit: DaysLimit | undefined): { daysLimit?: DaysLimit } {
  if (limit === undefined) return {}
  const sane = saneDaysLimit(limit)
  return sane === undefined ? {} : { daysLimit: sane }
}

/** A rolling window of zero hours would make a pool that never refills. */
function sane(cycle: ChargeCycle): ChargeCycle {
  return cycle.kind === 'rolling' ? { kind: 'rolling', hours: Math.max(1, cycle.hours) } : cycle
}

export interface NewVice {
  readonly name: string
  readonly capacity: number
  readonly cycle: ChargeCycle
  /** Absent means the pool counts things rather than measuring them. */
  readonly unit?: string
  readonly direction?: ChargeDirection
  readonly presets?: readonly ChargePreset[]
  /** Which days the pool may be touched at all — a count, or named days. */
  readonly daysLimit?: DaysLimit
}

export async function addVice(input: NewVice, deps: VitalsDeps): Promise<Vice> {
  const vice: Vice = {
    id: asViceId(deps.ids.next()),
    name: input.name.trim(),
    capacity: Math.max(1, Math.round(input.capacity)),
    cycle: sane(input.cycle),
    ...(input.unit === undefined ? {} : { unit: input.unit }),
    ...(input.direction === undefined ? {} : { direction: input.direction }),
    ...(input.presets === undefined ? {} : { presets: input.presets }),
    ...daysOrNothing(input.daysLimit),
    spent: [],
    createdAt: deps.clock.now().toISOString(),
  }

  await deps.vices.save(vice)

  return vice
}

async function withVice(
  id: ViceId,
  deps: VitalsDeps,
  change: (vice: Vice) => Vice,
): Promise<Vice | undefined> {
  const existing = await deps.vices.byId(id)
  if (existing === undefined) return undefined

  const changed = change(existing)
  await deps.vices.save(changed)

  return changed
}

/**
 * Spending is always allowed, and that is a design decision rather than
 * an omission.
 *
 * An app that refused would be asking to be lied to — you would have the
 * beer and not log it — and a record you lie to is worth nothing. What
 * it does instead is count, and let `over` on the reading say so.
 */
export async function spendVice(
  id: ViceId,
  deps: VitalsDeps,
  amount = 1,
): Promise<Vice | undefined> {
  return withVice(id, deps, (vice) => spendCharge(vice, deps.clock.now(), Math.max(0, amount)))
}

export async function undoVice(id: ViceId, deps: VitalsDeps): Promise<Vice | undefined> {
  return withVice(id, deps, undoLastCharge)
}

export async function editVice(
  id: ViceId,
  input: NewVice,
  deps: VitalsDeps,
): Promise<Vice | undefined> {
  return withVice(id, deps, (vice) => {
    /*
     * Spread first, then overwrite. `daysLimit` is dropped rather than
     * left behind when the editor clears it — a limit removed on screen
     * and still enforced underneath is the worst of both.
     */
    const { daysLimit: _cleared, ...rest } = vice

    return {
      ...rest,
      name: input.name.trim(),
      capacity: Math.max(1, Math.round(input.capacity)),
      cycle: sane(input.cycle),
      ...daysOrNothing(input.daysLimit),
    }
  })
}

/**
 * Retiring keeps the record; removing does not.
 *
 * Two names rather than one function with a flag, and the distinction is
 * the point: a pool you have finished with has months of spends on it
 * that are a true account of a stretch of your life, and the screen
 * offers retirement first for that reason.
 */
export async function retireVice(id: ViceId, deps: VitalsDeps): Promise<Vice | undefined> {
  return withVice(id, deps, (vice) => ({ ...vice, retiredAt: deps.clock.now().toISOString() }))
}

export async function removeVice(id: ViceId, deps: VitalsDeps): Promise<void> {
  await deps.vices.remove(id)
}

/**
 * One weight per day, so weighing again corrects rather than appends.
 *
 * The day comes from the clock rather than from the caller: a weigh-in
 * is a thing you do now, and letting a screen pass a date would make
 * back-filling possible, which is how a trend stops being a measurement.
 */
export async function recordWeighIn(weight: number, deps: VitalsDeps): Promise<void> {
  if (!Number.isFinite(weight) || weight <= 0) return

  await deps.weighIns.save({ day: toDayKey(deps.clock.now()), weight })
}

export async function clearWeighIn(day: string, deps: VitalsDeps): Promise<void> {
  await deps.weighIns.remove(day)
}

export async function recordCondition(
  readiness: ReadinessFactors,
  deps: VitalsDeps,
): Promise<DayCondition> {
  const condition: DayCondition = { day: toDayKey(deps.clock.now()), readiness }

  await deps.conditions.save(condition)

  return condition
}
