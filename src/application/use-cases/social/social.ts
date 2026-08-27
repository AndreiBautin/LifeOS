import { toDayKey } from '@/domain/time/day'
import { asFriendId, type FriendId, type IdGenerator } from '@/domain/ids/ids'
import type { Clock, FriendRepository } from '@/domain/repositories/ports'
import {
  byMostOverdue,
  DEFAULT_CIRCLE_BANDS,
  daysSince,
  isActive,
  isOverdue,
  logHangout,
  maintenanceScore,
  rateCircle,
  type CircleBands,
  type CircleRating,
  type Friend,
} from '@/domain/social/circle'

/**
 * The circle, and what it needs.
 *
 * Most of the source's social service was orchestration — repository
 * reads and DTO shaping around three real rules. Those three are in
 * `domain/social/circle.ts`, and this is the thin layer that reads the
 * store and hands them the data.
 */

/**
 * How long since a hangout still counts you as part of the circle, and how
 * long before somebody is overdue.
 *
 * Both configurable in the source, from a settings page. They are constants
 * here until somebody wants to move them: a setting nobody has changed is
 * a settings row, a migration and a screen, in exchange for a number two
 * people have ever looked at.
 */
export const ACTIVE_CIRCLE_MONTHS = 12
export const OVERDUE_MONTHS = 3

export interface SocialDeps {
  readonly friends: FriendRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

export interface FriendReading {
  readonly friend: Friend
  readonly active: boolean
  readonly overdue: boolean
  readonly daysSinceLastHangout: number
}

export interface SocialSummary {
  /** Most overdue first — the ordering is the point of the screen. */
  readonly friends: readonly FriendReading[]
  readonly activeCount: number
  readonly rating: CircleRating
  /** Share of the active circle not overdue, or absent with nobody in it. */
  readonly maintenance?: number
  readonly bands: CircleBands
}

export async function socialSummary(deps: SocialDeps): Promise<SocialSummary> {
  const friends = await deps.friends.all()
  const asOf = toDayKey(deps.clock.now())

  const readings = byMostOverdue(friends).map((friend): FriendReading => ({
    friend,
    active: isActive(friend, ACTIVE_CIRCLE_MONTHS, asOf),
    overdue: isOverdue(friend, OVERDUE_MONTHS, asOf),
    daysSinceLastHangout: daysSince(friend.lastHangout, asOf),
  }))

  const activeCount = readings.filter((reading) => reading.active).length
  const maintenance = maintenanceScore(friends, ACTIVE_CIRCLE_MONTHS, OVERDUE_MONTHS, asOf)

  return {
    friends: readings,
    activeCount,
    rating: rateCircle(activeCount, DEFAULT_CIRCLE_BANDS),
    ...(maintenance === undefined ? {} : { maintenance }),
    bands: DEFAULT_CIRCLE_BANDS,
  }
}

export async function addFriend(
  name: string,
  lastHangout: string,
  deps: SocialDeps,
): Promise<Friend> {
  const friend: Friend = {
    id: asFriendId(deps.ids.next()),
    name: name.trim(),
    lastHangout,
    createdAt: deps.clock.now().toISOString(),
  }

  await deps.friends.save(friend)
  return friend
}

/**
 * Records a hangout — forward only.
 *
 * The ratchet is in the domain, and the save is skipped when nothing
 * moved. Writing an unchanged record would restamp it, and a restamped
 * record travels over sync claiming to be news.
 */
export async function logHangoutFor(
  id: FriendId,
  date: string,
  deps: SocialDeps,
): Promise<Friend | undefined> {
  const existing = await deps.friends.byId(id)
  if (existing === undefined) return undefined

  const updated = logHangout(existing, date)
  if (updated === existing) return existing

  await deps.friends.save(updated)
  return updated
}

/**
 * Removes somebody entered by mistake.
 *
 * Not for going quiet: somebody you have not seen in two years drops out
 * of the active circle on their own, and their record and history stay so
 * they come back the moment you see them again.
 */
export async function removeFriend(id: FriendId, deps: SocialDeps): Promise<void> {
  await deps.friends.remove(id)
}
