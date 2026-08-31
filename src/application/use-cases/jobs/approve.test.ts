import { describe, expect, it } from 'vitest'

import { appliedLinks, approveLead } from './approve'
import type { FetchedPosting } from '@/domain/jobs/boards'
import type { Project } from '@/domain/projects/project'
import type { IdGenerator } from '@/domain/ids/ids'
import type { Clock } from '@/domain/repositories/ports'
import type { ProjectRepository, TombstoneRepository } from '@/domain/repositories/ports'

/**
 * Approving a lead.
 *
 * Two things are worth holding: the posting travels with it, so the
 * resume match works without pasting the text again — and the same
 * posting cannot be approved twice, which is the mistake triage exists
 * to prevent.
 */

function posting(over: Partial<FetchedPosting> = {}): FetchedPosting {
  return {
    externalId: '7532733',
    provider: 'greenhouse',
    boardToken: 'stripe',
    title: 'Staff Engineer, Core Infrastructure',
    description: 'Kubernetes and Go at scale.',
    isRemote: true,
    url: 'https://stripe.com/jobs/search?gh_jid=7532733',
    applyUrl: 'https://job-boards.greenhouse.io/stripe/jobs/7532733',
    ...over,
  }
}

function harness() {
  const store = new Map<string, Project>()
  let sequence = 0

  const clock: Clock = { now: () => new Date('2026-08-31T12:00:00.000Z') }
  const ids: IdGenerator = {
    next: () => {
      sequence += 1
      return `id-${String(sequence)}`
    },
  }

  const projects: ProjectRepository = {
    all: () => Promise.resolve([...store.values()]),
    byId: (id) => Promise.resolve(store.get(id as string)),
    save: (project) => {
      store.set(project.id, project)
      return Promise.resolve()
    },
    saveMany: (many) => {
      for (const project of many) store.set(project.id, project)
      return Promise.resolve()
    },
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    count: () => Promise.resolve(store.size),
  }

  const tombstones: TombstoneRepository = {
    all: () => Promise.resolve([]),
    since: () => Promise.resolve([]),
    record: () => Promise.resolve(),
  }

  return { deps: { projects, tombstones, clock, ids }, store }
}

describe('approving a lead', () => {
  it('files it under the job search rather than the quest log', async () => {
    const { deps } = harness()

    const result = await approveLead(posting(), deps)

    expect(result.application?.belongsTo).toBe('jobs')
  })

  it('names it for the company and the role', async () => {
    const { deps } = harness()

    expect((await approveLead(posting(), deps)).application?.name).toBe(
      'stripe — Staff Engineer, Core Infrastructure',
    )
  })

  it('opens with the stages ahead of it', async () => {
    const { deps } = harness()

    const result = await approveLead(posting(), deps)

    expect(result.application?.actions.map((one) => one.description)).toEqual([
      'Screen',
      'Interview',
      'Offer',
    ])
  })

  /*
   * Most of the value of approving rather than typing the company in by
   * hand: the resume match works the moment the application exists.
   */
  it('carries the posting across, verbatim', async () => {
    const { deps } = harness()

    expect((await approveLead(posting(), deps)).application?.description).toBe(
      'Kubernetes and Go at scale.',
    )
  })

  it('keeps the apply URL rather than the company search page', async () => {
    const { deps } = harness()

    expect((await approveLead(posting(), deps)).application?.link).toBe(
      'https://job-boards.greenhouse.io/stripe/jobs/7532733',
    )
  })

  it('falls back to the posting URL when a board offers no apply link', async () => {
    const { deps } = harness()
    const noApply: FetchedPosting = { ...posting(), url: 'https://example.test/1' }
    delete (noApply as { applyUrl?: string }).applyUrl

    expect((await approveLead(noApply, deps)).application?.link).toBe('https://example.test/1')
  })
})

describe('approving the same posting twice', () => {
  /*
   * A sweep is the only way to see a lead, and a sweep re-reads the whole
   * board — so the same posting comes back every time. Without this,
   * triaging twice quietly produces two applications to one job.
   */
  it('creates nothing and hands back what already exists', async () => {
    const { deps, store } = harness()
    const first = await approveLead(posting(), deps)

    const second = await approveLead(posting(), deps)

    expect(second.application).toBeUndefined()
    expect(second.alreadyApplied?.id).toBe(first.application?.id)
    expect(store.size).toBe(1)
  })

  it('tells two postings apart by their link, not their title', async () => {
    const { deps, store } = harness()
    await approveLead(posting(), deps)

    await approveLead(
      posting({ externalId: '2', applyUrl: 'https://job-boards.greenhouse.io/stripe/jobs/2' }),
      deps,
    )

    expect(store.size).toBe(2)
  })
})

describe('which leads are already spent', () => {
  it('reports the links applied to', async () => {
    const { deps } = harness()
    await approveLead(posting(), deps)

    expect(await appliedLinks(deps)).toEqual(
      new Set(['https://job-boards.greenhouse.io/stripe/jobs/7532733']),
    )
  })

  it('is empty before anything has been approved', async () => {
    expect(await appliedLinks(harness().deps)).toEqual(new Set())
  })
})
