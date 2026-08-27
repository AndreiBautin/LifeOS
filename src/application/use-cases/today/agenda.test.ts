import { describe, expect, it } from 'vitest'

import type { Item } from '@/domain/backlog/item'
import type { Project } from '@/domain/projects/project'
import { asProjectId } from '@/domain/ids/ids'
import type { Clock } from '@/domain/repositories/ports'
import type { Friend } from '@/domain/social/circle'
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

function harness(seed: {
  projects?: Project[]
  items?: Item[]
  trips?: Trip[]
  friends?: Friend[]
}) {
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
    items: list(seed.items ?? []),
    trips: list(seed.trips ?? []),
    friends: list(seed.friends ?? []),
    clock,
  } as unknown as AgendaDeps
}

const aQuest = (over: Partial<Project>): Project =>
  ({ id: 'q1', name: 'Ship it', status: 'active', actions: [], ...over }) as unknown as Project

const anEntry = (over: Partial<Item>): Item =>
  ({
    id: 'i1',
    title: 'Dune',
    status: 'currently-using',
    dailyProgress: [],
    ...over,
  }) as unknown as Item

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

describe('codex entries with a daily goal', () => {
  it('says how much is left when today is unfinished', async () => {
    const rows = await agendaFor(
      harness({
        items: [
          anEntry({
            dailyGoal: { amount: 20, unit: 'pages' },
            dailyProgress: [{ date: '2026-08-27', amount: 8 }],
          }),
        ],
      }),
    )

    expect(rows[0]?.detail).toBe('12 pages left today')
  })

  it('drops it once today is met', async () => {
    const rows = await agendaFor(
      harness({
        items: [
          anEntry({
            dailyGoal: { amount: 20, unit: 'pages' },
            dailyProgress: [{ date: '2026-08-27', amount: 20 }],
          }),
        ],
      }),
    )

    expect(rows).toHaveLength(0)
  })

  /*
   * A goal on something not started is an intention. Listing every book
   * you own as unfinished every morning is the fastest way to make this
   * screen worthless.
   */
  it('ignores a goal on something not started', async () => {
    const rows = await agendaFor(
      harness({
        items: [anEntry({ status: 'backlog', dailyGoal: { amount: 20, unit: 'pages' } })],
      }),
    )

    expect(rows).toHaveLength(0)
  })
})

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
