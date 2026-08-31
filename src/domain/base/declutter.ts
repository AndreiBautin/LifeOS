import type { RoomId } from '@/domain/ids/ids'

/**
 * How cleared each room is, and the house as a whole.
 *
 * The report: *"another aspect of base maintenance is decluttering —
 * this is ongoing and should be represented by percent of each room and
 * overall clutter level."* Ongoing is the word that decides the shape.
 *
 * **Not a project, and not a chore.** A house job finishes: the boiler
 * is serviced and the record closes. A chore recurs on a cadence and is
 * either done today or not. Decluttering is neither — it is a *level*
 * that moves in both directions over months, which is the shape of a
 * bodyweight reading rather than of a task.
 *
 * So a room carries a series of readings, exactly as the scale does, and
 * everything on the screen is derived from them. Nothing stores a
 * "current" percentage: a stored total is a total that can be wrong, and
 * this app already knows what that costs.
 *
 * **It goes backwards, and that is the point of tracking it.** A room
 * you cleared in March fills up again by August. A model that only
 * counted progress — a checklist, a completion percentage that never
 * fell — would make the one thing worth knowing invisible.
 */

export interface Room {
  readonly id: RoomId
  readonly name: string
  /**
   * Readings, newest last. One per day at most.
   *
   * Keyed by local day like every other date in this app, and **last
   * write wins per day** rather than appending: two readings for one
   * Tuesday are two opinions about one fact, which is the rule weigh-ins
   * already follow. A second look at the same room on the same day is a
   * correction, not a second measurement.
   */
  readonly readings: readonly Reading[]
  readonly createdAt: string
  /** Written by the repository, never here. */
  readonly updatedAt?: string
}

export interface Reading {
  /** A local day key. */
  readonly day: string
  /** How clear the room is, 0–100. */
  readonly clear: number
}

export const CLEAR_MIN = 0
export const CLEAR_MAX = 100

/**
 * The rooms most houses have, offered rather than assumed.
 *
 * Suggestions on the add form, the same stance the Upkeep habits and the
 * pool presets take: taking one does not stop you typing your own, and
 * the list never becomes the set of legal answers. A garage and a loft
 * are on it because they are where clutter actually goes.
 */
export const ROOM_SUGGESTIONS = [
  'Kitchen',
  'Living room',
  'Bedroom',
  'Spare room',
  'Bathroom',
  'Garage',
  'Loft',
  'Basement',
  'Office',
  'Shed',
] as const

/** A percentage, clamped and rounded. Nothing stores a half. */
export function asClear(value: number): number {
  if (!Number.isFinite(value)) return CLEAR_MIN

  return Math.min(CLEAR_MAX, Math.max(CLEAR_MIN, Math.round(value)))
}

/**
 * Records how clear a room is on a day, replacing that day's reading.
 *
 * Last write wins per day rather than appending, for the reason a
 * weigh-in does: two readings for one Tuesday are two opinions about one
 * fact, and the later one is a correction.
 */
export function record(room: Room, day: string, clear: number): Room {
  const others = room.readings.filter((one) => one.day !== day)

  return {
    ...room,
    readings: [...others, { day, clear: asClear(clear) }].sort((a, b) =>
      a.day.localeCompare(b.day),
    ),
  }
}

/** The most recent reading, or nothing when the room has never been read. */
export function latest(room: Room): Reading | undefined {
  return room.readings[room.readings.length - 1]
}

/**
 * The reading nearest to but not after a day, for comparing two moments.
 *
 * **Nothing is carried forward into a gap and nothing is interpolated.**
 * A room unread for a fortnight has no reading for last Tuesday; what it
 * has is the last thing anybody actually said about it. Stating that as
 * "the reading in force on that day" is honest, where inventing a value
 * between two readings would put a number on the screen nobody produced.
 */
export function asOf(room: Room, day: string): Reading | undefined {
  const upTo = room.readings.filter((one) => one.day <= day)

  return upTo[upTo.length - 1]
}

export interface RoomStanding {
  readonly room: Room
  /** Absent when the room has never been read. */
  readonly clear?: number
  /** How much it has moved since the comparison day, when both exist. */
  readonly change?: number
  readonly lastReadOn?: string
}

/**
 * What the room was at the start of the window, as far as anything knows.
 *
 * **Either the reading in force when the window opened, or the first one
 * taken inside it** — and the second half was missing at first, which
 * made the feature useless in exactly the case it exists for. A garage
 * read at 90 on the 5th and 32 on the 31st has obviously got worse over
 * that month, and comparing only against readings *before* the window
 * reported no change at all: the room had no reading on the 1st, so
 * there was nothing to compare with.
 *
 * Still nothing invented. Both candidates are readings somebody actually
 * took; what changed is which of them counts as "where this started".
 */
function startOfWindow(room: Room, since: string): Reading | undefined {
  const inForce = asOf(room, since)
  if (inForce !== undefined) return inForce

  return room.readings.find((one) => one.day > since)
}

export function standingFor(room: Room, since: string): RoomStanding {
  const now = latest(room)
  if (now === undefined) return { room }

  const then = startOfWindow(room, since)

  return {
    room,
    clear: now.clear,
    lastReadOn: now.day,
    /*
     * Absent rather than zero when there is nothing to compare against.
     * A room read once has not "stayed the same" — it has been read
     * once, and a change of 0 would claim a stability nobody observed.
     * The comparison reading also has to be a *different* one, or the
     * only reading would be compared with itself.
     */
    ...(then === undefined || then.day === now.day ? {} : { change: now.clear - then.clear }),
  }
}

export interface HouseStanding {
  readonly rooms: readonly RoomStanding[]
  /**
   * The house overall, absent until something has been read.
   *
   * **A plain mean over the rooms that have a reading.** Weighting by
   * floor area is the obvious refinement and is not available — nothing
   * here knows how big a room is, and asking would be a second number to
   * keep current for a figure that is already a summary. Rooms never
   * read are left out rather than counted as zero: an unmeasured room is
   * not a room full of clutter.
   */
  readonly clear?: number
  readonly change?: number
  /** Rooms nobody has read yet, so a screen can say which. */
  readonly unread: readonly Room[]
}

export function houseStanding(rooms: readonly Room[], since: string): HouseStanding {
  const standings = rooms.map((room) => standingFor(room, since))
  const read = standings.filter((one) => one.clear !== undefined)

  const mean = (values: readonly number[]): number | undefined =>
    values.length === 0
      ? undefined
      : Math.round(values.reduce((sum, one) => sum + one, 0) / values.length)

  const clear = mean(read.map((one) => one.clear ?? 0))
  /*
   * Averaged over the rooms that *have* a comparison, not over all of
   * them. A room read for the first time this week has not held steady,
   * and folding a zero in would dilute a real change with a
   * non-observation.
   */
  const moved = read.filter((one) => one.change !== undefined)
  const change = mean(moved.map((one) => one.change ?? 0))

  return {
    rooms: standings,
    ...(clear === undefined ? {} : { clear }),
    ...(change === undefined ? {} : { change }),
    unread: standings.filter((one) => one.clear === undefined).map((one) => one.room),
  }
}

/**
 * What a level reads as in words.
 *
 * Five bands rather than a number alone, because "62%" is precision
 * nobody has: this is somebody looking round a room and judging. The
 * words are what the judgement actually was, and the number is there to
 * make two months comparable.
 *
 * **Not a ladder.** There is no published standard for how cleared a
 * room should be, so this is a label on a self-reported reading — the
 * same footing as the weight phase, and deliberately not the footing of
 * a strength standard.
 */
export function describeClear(clear: number): string {
  if (clear >= 90) return 'Clear'
  if (clear >= 70) return 'Tidy'
  if (clear >= 45) return 'Lived in'
  if (clear >= 20) return 'Cluttered'

  return 'Overwhelmed'
}
