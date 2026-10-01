import { describe, expect, it } from 'vitest'

import { BASE, JOBS } from '@/domain/base/base'
import type { Campaign } from '@/domain/campaign/campaign'
import type { FinanceReading } from '@/domain/finance/reading'
import type { Room } from '@/domain/base/declutter'
import { asProjectId, type CampaignId, type StageId } from '@/domain/ids/ids'
import type { Project } from '@/domain/projects/project'

import {
  addCampaign,
  campaignStandings,
  gatherEvidence,
  reachStage,
  reshapeStageIn,
} from './campaign'
import type { CampaignDeps } from './campaign'

function project(
  name: string,
  home: 'base' | 'jobs' | undefined,
  done: number,
  open: number,
): Project {
  return {
    id: asProjectId(name),
    name,
    status: 'active',
    createdAt: '2026-08-01T09:00:00',
    actions: [
      ...Array.from({ length: done }, (_unused, index) => ({
        id: `${name}-done-${String(index)}`,
        description: 'x',
        status: 'done' as const,
        completedAt: '2026-08-02T09:00:00',
      })),
      ...Array.from({ length: open }, (_unused, index) => ({
        id: `${name}-open-${String(index)}`,
        description: 'x',
        status: 'todo' as const,
      })),
    ],
    ...(home === undefined ? {} : { belongsTo: home }),
  } as unknown as Project
}

function deps(options: {
  projects?: readonly Project[]
  finance?: readonly FinanceReading[]
  rooms?: readonly Room[]
  campaigns?: Campaign[]
}): CampaignDeps & { stored: Campaign[]; savedProjects: Project[] } {
  const stored = options.campaigns ?? []
  const savedProjects: Project[] = []
  let counter = 0

  return {
    stored,
    savedProjects,
    campaigns: {
      all: () => Promise.resolve(stored),
      byId: (id) => Promise.resolve(stored.find((one) => one.id === id)),
      save: (campaign) => {
        const at = stored.findIndex((one) => one.id === campaign.id)
        if (at === -1) stored.push(campaign)
        else stored[at] = campaign
        return Promise.resolve()
      },
      restoreMany: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      purge: () => Promise.resolve(),
    },
    projects: {
      all: () => Promise.resolve(options.projects ?? []),
      saveMany: (saved: readonly Project[]) => {
        savedProjects.push(...saved)
        return Promise.resolve()
      },
    } as unknown as CampaignDeps['projects'],
    finance: {
      all: () => Promise.resolve(options.finance ?? []),
    } as unknown as CampaignDeps['finance'],
    rooms: {
      all: () => Promise.resolve(options.rooms ?? []),
    } as unknown as CampaignDeps['rooms'],
    clock: { now: () => new Date('2026-08-31T10:00:00') },
    ids: {
      next: () => {
        counter += 1
        return `id-${String(counter)}`
      },
    },
  }
}

describe('gathering what the app already knows', () => {
  /*
   * The leak this guards is one the app has had twice: `recommendation`
   * scored across every home and suggested a leaking tap on the Quests
   * page, and `projects.actions-closed-in-month` counted house-job steps
   * as quest throughput. Both were found by driving the app, not by a
   * test. `keepFor` is what stops the third instance.
   */
  it('counts only house jobs as house jobs', async () => {
    const evidence = await gatherEvidence(
      deps({
        projects: [
          project('Boiler', BASE, 3, 0),
          project('Roof', BASE, 2, 0),
          project('A quest of my own', undefined, 4, 0),
          project('An application', JOBS, 3, 0),
        ],
      }),
    )

    expect(evidence.houseJobsDone).toBe(2)
  })

  it('counts only finished ones', async () => {
    const evidence = await gatherEvidence(
      deps({ projects: [project('Boiler', BASE, 3, 0), project('Roof', BASE, 1, 2)] }),
    )

    expect(evidence.houseJobsDone).toBe(1)
  })

  it('does not count a project with no steps as finished', async () => {
    // `every` is vacuously true on an empty list, so a job with nothing
    // in it would otherwise read as done the moment it was created.
    const evidence = await gatherEvidence(deps({ projects: [project('Empty', BASE, 0, 0)] }))

    expect(evidence.houseJobsDone).toBe(0)
  })

  it('counts an application through every stage as an offer', async () => {
    const evidence = await gatherEvidence(
      deps({
        projects: [
          project('Acme — Engineer', JOBS, 3, 0),
          project('Beta — Engineer', JOBS, 1, 2),
          project('Boiler', BASE, 3, 0),
        ],
      }),
    )

    expect(evidence.offers).toBe(1)
  })

  /*
   * Per field, not per row. Somebody who checks their credit score
   * quarterly has months holding a net worth and no score, and taking
   * the newest row would report the score as missing two months in three.
   */
  it('takes the most recent figure for each money field separately', async () => {
    const evidence = await gatherEvidence(
      deps({
        finance: [
          { month: '2026-06', netWorthMinor: 100, creditScore: 700 },
          { month: '2026-08', netWorthMinor: 500 },
        ],
      }),
    )

    expect(evidence.netWorthMinor).toBe(500)
    expect(evidence.creditScore).toBe(700)
  })

  it('leaves a money field absent when nothing has ever recorded it', async () => {
    const evidence = await gatherEvidence(deps({ finance: [{ month: '2026-08' }] }))

    expect('netWorthMinor' in evidence).toBe(false)
  })
})

describe('the arc, end to end', () => {
  it('reads a stored arc against the live evidence', async () => {
    const services = deps({ projects: [project('Boiler', BASE, 3, 0)] })

    await addCampaign(
      {
        name: 'Move',
        stages: [
          { name: 'Fix the house', requirement: { kind: 'house-jobs', count: 1 } },
          { name: 'Find a house', requirement: { kind: 'declared' }, repeatable: true },
        ],
      },
      services,
    )

    const [standing] = await campaignStandings(services)

    expect(standing?.done).toBe(1)
    expect(standing?.next?.stage.name).toBe('Find a house')
  })

  it('records a lap with the day it happened and what it was', async () => {
    const services = deps({})

    await addCampaign(
      { name: 'Move', stages: [{ name: 'Improve income', requirement: { kind: 'declared' } }] },
      services,
    )

    const campaign = services.stored[0]
    if (campaign === undefined) throw new Error('expected a campaign')
    const stage = campaign.stages[0]
    if (stage === undefined) throw new Error('expected a stage')

    await reachStage(campaign.id, stage.id, 'Acme', services)

    expect(services.stored[0]?.stages[0]?.reached).toEqual([{ at: '2026-08-31', note: 'Acme' }])
  })

  it('refuses an arc with no name rather than storing a blank one', async () => {
    const services = deps({})

    const result = await addCampaign({ name: '   ', stages: [] }, services)

    expect(result.error).toBeDefined()
    expect(services.stored).toHaveLength(0)
  })

  it('does nothing when a stage that does not exist is reached', async () => {
    const services = deps({})
    await addCampaign({ name: 'Move', stages: [] }, services)

    await reachStage(
      services.stored[0]?.id ?? ('missing' as CampaignId),
      'no-such-stage' as StageId,
      undefined,
      services,
    )

    expect(services.stored[0]?.stages).toEqual([])
  })
})

describe('linking quests to a chapter', () => {
  const arcWith = (quests: readonly string[]): Campaign => ({
    id: 'move' as CampaignId,
    name: 'Move',
    createdAt: '2026-08-01T09:00:00',
    stages: [
      {
        id: 'job' as StageId,
        name: 'Get a new job',
        requirement: { kind: 'declared' },
        reached: [],
        ...(quests.length === 0 ? {} : { quests: quests.map((one) => asProjectId(one)) }),
      },
    ],
  })

  /*
   * The rule the quest kinds now follow: on the arc is main, off it is
   * side. A quest feeding the move was once filed as side by hand, which
   * is exactly what this stops.
   */
  it('makes a newly linked quest main, and an unlinked one side again', async () => {
    const portfolio = { ...project('Portfolio', undefined, 0, 2), kind: 'side' } as Project
    const linking = deps({ projects: [portfolio], campaigns: [arcWith([])] })
    await reshapeStageIn(
      'move' as CampaignId,
      'job' as StageId,
      'Get a new job',
      { kind: 'declared' },
      linking,
      [asProjectId('Portfolio')],
    )
    expect(linking.savedProjects.map((one) => [one.name, one.kind])).toEqual([
      ['Portfolio', 'main'],
    ])

    const main = { ...portfolio, kind: 'main', activatedAt: '2026-08-20T09:00:00' } as Project
    const unlinking = deps({ projects: [main], campaigns: [arcWith(['Portfolio'])] })
    await reshapeStageIn(
      'move' as CampaignId,
      'job' as StageId,
      'Get a new job',
      { kind: 'declared' },
      unlinking,
      [],
    )
    const [saved] = unlinking.savedProjects
    expect(saved?.kind).toBe('side')
    // Dropped its stamp, so it does not land in the side slot by accident.
    expect(saved?.activatedAt).toBeUndefined()
  })

  it('leaves quests alone when the links did not change', async () => {
    const linked = deps({
      projects: [{ ...project('Portfolio', undefined, 0, 2), kind: 'main' }],
      campaigns: [arcWith(['Portfolio'])],
    })
    await reshapeStageIn(
      'move' as CampaignId,
      'job' as StageId,
      'A better job',
      { kind: 'declared' },
      linked,
    )
    expect(linked.savedProjects).toEqual([])
  })
})
