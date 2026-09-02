import { toDayKey } from '@/domain/time/day'
import type { IdGenerator, ViceId } from '@/domain/ids/ids'
import { asViceId } from '@/domain/ids/ids'
import type { Clock, SettingsRepository, ViceRepository } from '@/domain/repositories/ports'
import type { ChargeCycle, ChargeDirection, ChargePreset, DaysLimit } from '@/domain/vitals/charges'
import { saneDaysLimit } from '@/domain/vitals/charges'
import {
  amountSpentOn,
  isActive,
  readCharges,
  spendCharge,
  undoLastCharge,
  type ChargeReading,
  type Vice,
} from '@/domain/vitals/charges'

/**
 * Vitals: what the body is doing, and what you have left to spend on it.
 *
 * **The self-rated condition is gone from here**, and with it the one
 * readout on this screen that was an opinion rather than a count. Five
 * factors on a poor/ok/good scale were a mood, and the session
 * adjustment they were supposed to feed was never wired to a session —
 * so the whole of it was a number you typed in and then read back.
 *
 * What is left is the pools — a rule you set and then spend against.
 *
 * **Sleep, calories and macros are gone from here too**, and that was
 * asked for rather than tidied: *"what am I really getting from double
 * tracking this info?"* Cal AI already counts them and syncs them to
 * Apple Health, so a row here was a second copy of a figure kept
 * properly somewhere else — and a second copy is a thing that can
 * disagree with the first. See CLAUDE.md for what went and why the
 * store it wrote to is still there.
 *
 * **The scale went the way the day figures did**, and for the reason
 * given for them: *"no need to track weight either, same reason."* A
 * weigh-in is a number a scale and a phone already keep between them, so
 * a row here was a second copy of it. `settings.bodyweight` stays — a
 * single figure somebody states, which `resolve.ts` needs to load a
 * bodyweight-plus set and the strength ladders need to divide by. That
 * is not tracking, and it is why removing the series did not take it.
 */

export interface VitalsDeps {
  readonly vices: ViceRepository
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

export interface VitalsToday {
  readonly pools: readonly PoolView[]
}

export async function vitalsToday(deps: VitalsDeps): Promise<VitalsToday> {
  const now = deps.clock.now()
  const today = toDayKey(now)

  const pools = (await deps.vices.all())
    .filter(isActive)
    .map((vice) => ({
      vice,
      reading: readCharges(vice, now),
      spentToday: amountSpentOn(vice, today),
    }))
    /*
     * Emptiest first, so what is nearly gone is what you see. Sorting by
     * name would put the pool you have not touched at the top of a list
     * whose whole job is to say what is left.
     */
    .sort((a, b) => a.reading.available - b.reading.available)

  return { pools }
}

export async function listVices(deps: VitalsDeps): Promise<readonly Vice[]> {
  return (await deps.vices.all()).filter(isActive)
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
  /** Which silhouette it is drawn with. A label, like the name. */
  readonly icon?: string
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
    ...(input.icon === undefined ? {} : { icon: input.icon }),
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
     * Spread first, then overwrite — and the optional fields are
     * *dropped* from the spread rather than left behind, because
     * clearing one on screen has to clear it in the record. A unit
     * removed in the editor and still stored underneath would keep
     * drawing a bar for a pool the lifter had just turned back into a
     * count.
     */
    const { daysLimit: _days, unit: _unit, presets: _presets, icon: _icon, ...rest } = vice

    return {
      ...rest,
      name: input.name.trim(),
      capacity: Math.max(1, Math.round(input.capacity)),
      cycle: sane(input.cycle),
      /*
       * The unit is editable and the past entries are not rewritten.
       * That is right for a relabel — "drinks" to "shots" is the same
       * one-each history under a better word — and it is the lifter's
       * call for a rescale, which is why the editor says so rather than
       * silently converting numbers it cannot know the meaning of.
       */
      ...(input.unit === undefined || input.unit.trim() === '' ? {} : { unit: input.unit.trim() }),
      ...(input.direction === undefined ? {} : { direction: input.direction }),
      ...(input.icon === undefined ? {} : { icon: input.icon }),
      /*
       * Presets are replaced wholesale rather than merged, because the
       * editor shows the whole list — a merge would make a removed row
       * come back, which is the one thing a list editor must not do.
       */
      ...(input.presets === undefined || input.presets.length === 0
        ? {}
        : { presets: input.presets }),
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
