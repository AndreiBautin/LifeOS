import { describe, expect, it } from 'vitest'

import type { Campaign } from '@/domain/campaign/campaign'
import type { FinanceReading } from '@/domain/finance/reading'
import type { CampaignId, StageId } from '@/domain/ids/ids'

import { addCampaign, campaignStandings, gatherEvidence, reachStage } from './campaign'
import type { CampaignDeps } from './campaign'

function deps(options: {
  finance?: readonly FinanceReading[]
  campaigns?: Campaign[]
}): CampaignDeps & { stored: Campaign[] } {
  const stored = options.campaigns ?? []
  let counter = 0

  return {
    stored,
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
    finance: {
      all: () => Promise.resolve(options.finance ?? []),
    } as unknown as CampaignDeps['finance'],
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
    const services = deps({ finance: [{ month: '2026-08', savingsMinor: 5_000 }] })

    await addCampaign(
      {
        name: 'Move',
        stages: [
          { name: 'Save', requirement: { kind: 'savings', minorUnits: 1_000 } },
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
