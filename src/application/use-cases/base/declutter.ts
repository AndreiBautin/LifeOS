import { houseStanding, record, type HouseStanding, type Room } from '@/domain/base/declutter'
import type { IdGenerator, RoomId } from '@/domain/ids/ids'
import type { Clock, RoomRepository } from '@/domain/repositories/ports'
import { shiftDay, toDayKey } from '@/domain/time/day'

/**
 * Decluttering, from the application's side.
 *
 * **It pays no XP, and that is the same call the weigh-in got.** Saying
 * a room is 40% clear is a *measurement* — the app already refuses to
 * pay for standing on a scale, and paying for the number going up would
 * be paying for an outcome rather than for the afternoon spent on it.
 *
 * The afternoon itself already has somewhere to be paid: clearing the
 * garage is a house job on Base, with steps, which pays
 * `base.action-closed`. So the effort scores and the reading reports,
 * which is the split Finance and Vitals both already run on.
 */

export interface DeclutterDeps {
  readonly rooms: RoomRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

/**
 * How far back "since" reaches when comparing.
 *
 * A month, because that is the timescale the thing actually moves on: a
 * room does not measurably fill up in a week, and a year would compare
 * against a house nobody lives in any more.
 */
export const COMPARE_DAYS = 30

export async function houseClutter(deps: DeclutterDeps): Promise<HouseStanding> {
  const since = shiftDay(toDayKey(deps.clock.now()), -COMPARE_DAYS)

  return houseStanding(await deps.rooms.all(), since)
}

export async function addRoom(
  name: string,
  deps: DeclutterDeps,
): Promise<{ readonly error?: string }> {
  const trimmed = name.trim()
  if (trimmed === '') return { error: 'A room needs a name.' }

  const existing = await deps.rooms.all()
  /*
   * One row per room. Two "Kitchen"s would each hold half the history
   * and the average would count the kitchen twice — the same reason a
   * board can only be followed once.
   */
  if (existing.some((one) => one.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    return { error: `There is already a room called ${trimmed}.` }
  }

  await deps.rooms.save({
    id: deps.ids.next() as RoomId,
    name: trimmed,
    readings: [],
    createdAt: deps.clock.now().toISOString(),
  })

  return {}
}

/**
 * Records how clear a room is today.
 *
 * Today rather than an arbitrary day, because this is a judgement made
 * by looking at the room — you cannot look at last Tuesday's kitchen.
 * The day is local, like every other date here.
 */
export async function recordClear(id: RoomId, clear: number, deps: DeclutterDeps): Promise<void> {
  const room = await deps.rooms.byId(id)
  if (room === undefined) return

  const next = record(room, toDayKey(deps.clock.now()), clear)
  // Identity means the same reading on the same day — no write, no sync
  // traffic, and no stamp that would make this device look newer than
  // one that really changed something.
  if (next === room) return

  await deps.rooms.save(next)
}

export async function renameRoom(id: RoomId, name: string, deps: DeclutterDeps): Promise<void> {
  const trimmed = name.trim()
  if (trimmed === '') return

  const room = await deps.rooms.byId(id)
  if (room === undefined) return

  await deps.rooms.save({ ...room, name: trimmed })
}

/**
 * Removes a room and every reading of it.
 *
 * Destructive and named as such. A room moved out of is a real thing —
 * but so is a year of readings, and there is no retirement here because
 * a room that no longer exists should not be averaged into a house that
 * does. The screen says how many readings go with it.
 */
export async function removeRoom(id: RoomId, deps: DeclutterDeps): Promise<void> {
  await deps.rooms.remove(id)
}

/** Rooms, newest reading first, for a list that leads with what moved. */
export async function allRooms(deps: DeclutterDeps): Promise<readonly Room[]> {
  return deps.rooms.all()
}
