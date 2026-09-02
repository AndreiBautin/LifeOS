import { describe, expect, it } from 'vitest'

import type { Item } from '@/domain/backlog/item'
import type { Project } from '@/domain/projects/project'
import { asProjectId } from '@/domain/ids/ids'
import type { Clock } from '@/domain/repositories/ports'
import type { Trip } from '@/domain/atlas/trip/Trip'

import { agendaFor, type AgendaDeps } from './agenda'

/**
 * The agenda is a filter and a sort, so the tests are about what it leaves
 * out and what order it puts the rest in.
 *
 * Everything it drops, it drops for the same reason: a list that includes
 * things you cannot act on is a list people stop reading, and then the
 * things they *could* have acted on go unread with them.
 */
const TODAY = new Date(2026, 7, 27, 9, 0)

function harness(seed: { projects?: Project[]; items?: Item[]; trips?: Trip[] }) {
  const clock: Clock = { now: () => TODAY }
  const list = <T>(rows: readonly T[]) => ({
    all: () => Promise.resolve(rows),
    byId: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
    saveMany: () => Promise.resolve(),
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    count: () => Promise.resolve(rows.length),
  })

  return {
    projects: list(seed.projects ?? []),
    trips: list(seed.trips ?? []),
    clock,
  } as unknown as AgendaDeps
}

const aQuest = (over: Partial<Project>): Project =>
  ({ id: 'q1', name: 'Ship it', status: 'active', actions: [], ...over }) as unknown as Project

describe('what reaches the agenda', () => {
  it('lists a quest deadline that is close', async () => {
    const rows = await agendaFor(harness({ projects: [aQuest({ deadline: '2026-08-29' })] }))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.detail).toBe('due in 2 days')
  })

  /*
   * A deadline on something already finished is not news, and it is the
   * kind of row that accumulates until nobody reads the screen.
   */
  it('leaves out a finished quest even with a deadline today', async () => {
    const rows = await agendaFor(
      harness({ projects: [aQuest({ deadline: '2026-08-27', status: 'completed' })] }),
    )

    expect(rows).toHaveLength(0)
  })

  it('leaves out a deadline further off than a week', async () => {
    const rows = await agendaFor(harness({ projects: [aQuest({ deadline: '2026-10-01' })] }))

    expect(rows).toHaveLength(0)
  })

  it('keeps an overdue deadline however old', async () => {
    const rows = await agendaFor(harness({ projects: [aQuest({ deadline: '2026-01-01' })] }))

    expect(rows[0]?.urgency).toBe('overdue')
  })
})

/*
 * **Codex goals left this list, so their tests left with it.** They are
 * drawn in the Dailies section now: a Codex goal carries the habits' own
 * `Cadence`, holds a streak and is answered by logging a bit of it, so
 * it is a daily in every respect except the record type.
 *
 * The rule that brought them here — that a goal is only outstanding on a
 * day its cadence covers — did not go with them. It is
 * `getDailyGoalBoard` → `isDueToday` and is tested in
 * `daily-goals.test.ts`, which is where it always belonged: the agenda
 * had been answering it a second time, and badly.
 */

describe('trips', () => {
  const trip = (over: Partial<Trip>): Trip =>
    ({ id: 't1', name: 'Lisbon', location: 'PT', placeIds: [], ...over }) as unknown as Trip

  it('says a trip is on when today falls inside it', async () => {
    const rows = await agendaFor(
      harness({ trips: [trip({ startDate: '2026-08-25', endDate: '2026-08-30' })] }),
    )

    expect(rows[0]?.detail).toBe('on now')
  })

  it('mentions one starting soon', async () => {
    const rows = await agendaFor(harness({ trips: [trip({ startDate: '2026-08-30' })] }))

    expect(rows[0]?.detail).toBe('starts in 3 days')
  })

  it('says nothing about one already over', async () => {
    const rows = await agendaFor(
      harness({ trips: [trip({ startDate: '2026-01-01', endDate: '2026-01-05' })] }),
    )

    expect(rows).toHaveLength(0)
  })
})

describe('the order', () => {
  /*
   * Overdue, then today, then soon. The sort is the whole value of the
   * screen — an agenda in arbitrary order is four screens' contents in a
   * pile rather than one screen's worth of answer.
   */
  it('puts overdue first and soon last', async () => {
    const rows = await agendaFor(
      harness({
        projects: [
          aQuest({ id: asProjectId('a'), name: 'Late', deadline: '2026-08-20' }),
          aQuest({ id: asProjectId('b'), name: 'Soon', deadline: '2026-08-31' }),
          aQuest({ id: asProjectId('c'), name: 'Now', deadline: '2026-08-27' }),
        ],
      }),
    )

    expect(rows.map((row) => row.title)).toEqual(['Late', 'Now', 'Soon'])
  })

  it('is empty when nothing wants anything', async () => {
    expect(await agendaFor(harness({}))).toEqual([])
  })
})
