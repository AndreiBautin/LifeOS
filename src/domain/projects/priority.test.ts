import { describe, expect, it } from 'vitest'

import { asActionId, asProjectId } from '@/domain/ids/ids'

import {
  computeEffectiveUrgency,
  computeProgress,
  computeScore,
  currentNextAction,
  deriveStatus,
  getRecommendation,
  isEligibleNow,
  rankActiveProjects,
  toDayKey,
} from './priority'
import { indexProjects, type ActionItem, type Project, type ProjectStatus } from './project'

/**
 * The whole reason this port was safe.
 *
 * These came across from `PriorityEngineTests.cs` more or less unedited —
 * they were already pure-function tests over in-memory objects, needing no
 * database, no HTTP and no fixtures. What changed is that today is now a
 * parameter, so every date assertion is written against a chosen day
 * rather than against whenever the suite happens to run.
 */

const TODAY = new Date(2026, 7, 26)

const day = (offset: number): string => {
  const date = new Date(TODAY)
  date.setDate(date.getDate() + offset)
  return toDayKey(date)
}

let sequence = 0

function anAction(overrides: Partial<ActionItem> = {}): ActionItem {
  sequence += 1
  return {
    id: asActionId(`action-${sequence.toString()}`),
    description: 'do the thing',
    status: 'pending',
    order: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function aProject(overrides: Partial<Project> = {}): Project {
  sequence += 1
  return {
    id: asProjectId(`project-${sequence.toString()}`),
    name: 'P',
    impact: 5,
    urgency: 5,
    effort: 5,
    status: 'active',
    isBlocked: false,
    blockedBy: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    actions: [],
    ...overrides,
  }
}

const alone = (project: Project) => indexProjects([project])

describe('computeScore', () => {
  it.each([
    [10, 10, 1, 100],
    [1, 1, 10, 0],
    [5, 5, 5, 5],
    [9, 8, 4, 18],
    [10, 3, 4, 8],
  ])('impact %i × urgency %i / effort %i is %i', (impact, urgency, effort, expected) => {
    expect(computeScore(aProject({ impact, urgency, effort }), TODAY)).toBe(expected)
  })

  /*
   * Effort is floored in the engine rather than validated on the way in,
   * so a record written straight into the database cannot divide by zero.
   */
  it('does not divide by zero when effort is zero', () => {
    expect(computeScore(aProject({ impact: 8, urgency: 6, effort: 0 }), TODAY)).toBe(48)
  })

  /*
   * The one deliberate behaviour change in this port. C#'s Math.Round is
   * banker's rounding and gave 2; JavaScript rounds half away from zero
   * and gives 3. Pinned rather than left implicit, because a scoring rule
   * that changes silently during a port is the failure this suite exists
   * to prevent.
   */
  it('rounds a half away from zero, where the original rounded to even', () => {
    expect(computeScore(aProject({ impact: 5, urgency: 1, effort: 2 }), TODAY)).toBe(3)
  })
})

describe('computeEffectiveUrgency', () => {
  it('is unchanged when there is no deadline', () => {
    expect(computeEffectiveUrgency(aProject({ urgency: 4 }), TODAY)).toBe(4)
  })

  it('is unchanged when the deadline is outside the ramp window', () => {
    expect(computeEffectiveUrgency(aProject({ urgency: 4, deadline: day(30) }), TODAY)).toBe(4)
  })

  it('pins at ten on and after the deadline', () => {
    expect(computeEffectiveUrgency(aProject({ urgency: 1, deadline: day(0) }), TODAY)).toBe(10)
    expect(computeEffectiveUrgency(aProject({ urgency: 1, deadline: day(-5) }), TODAY)).toBe(10)
  })

  it('ramps proportionally inside the window', () => {
    // Seven days out is exactly halfway through the fourteen-day ramp, so
    // an urgency of 4 sits halfway between 4 and 10.
    expect(computeEffectiveUrgency(aProject({ urgency: 4, deadline: day(7) }), TODAY)).toBeCloseTo(
      7,
      6,
    )
  })

  it('only ever increases, never decreases', () => {
    // A hand-set 10 must not be dragged down by the ramp arithmetic.
    for (let days = 0; days <= 20; days += 1) {
      expect(
        computeEffectiveUrgency(aProject({ urgency: 10, deadline: day(days) }), TODAY),
      ).toBeGreaterThanOrEqual(10)
    }
  })

  /*
   * The ramp crosses a month boundary and a daylight-saving shift without
   * noticing, because the arithmetic goes through a local `Date` rather
   * than subtracting two strings.
   */
  it('counts calendar days across a month boundary', () => {
    const lastOfMarch = new Date(2026, 2, 31)
    const project = aProject({ urgency: 4, deadline: '2026-04-07' })

    expect(computeEffectiveUrgency(project, lastOfMarch)).toBeCloseTo(7, 6)
  })
})

describe('computeProgress', () => {
  it('is zero when there are no actions', () => {
    expect(computeProgress(aProject())).toBe(0)
  })

  it('is the share of actions done', () => {
    const project = aProject({
      actions: [
        anAction({ order: 1, status: 'done' }),
        anAction({ order: 2, status: 'done' }),
        anAction({ order: 3 }),
        anAction({ order: 4 }),
      ],
    })

    expect(computeProgress(project)).toBe(50)
  })

  /*
   * A project can be closed with the button before every action is ticked.
   * It should still read 100, not 33.
   */
  it('is always one hundred for a completed project', () => {
    const project = aProject({
      status: 'completed',
      actions: [
        anAction({ order: 1, status: 'done' }),
        anAction({ order: 2 }),
        anAction({ order: 3 }),
      ],
    })

    expect(computeProgress(project)).toBe(100)
  })
})

describe('isEligibleNow', () => {
  it('says no to nothing at all', () => {
    expect(isEligibleNow(undefined, TODAY)).toBe(false)
  })

  it('says yes to an action with no date', () => {
    expect(isEligibleNow(anAction(), TODAY)).toBe(true)
  })

  it('says no to an action dated in the future', () => {
    expect(isEligibleNow(anAction({ availableFrom: day(1) }), TODAY)).toBe(false)
  })

  it('says yes to an action available from today', () => {
    expect(isEligibleNow(anAction({ availableFrom: day(0) }), TODAY)).toBe(true)
  })
})

describe('currentNextAction', () => {
  it('is the lowest-ordered pending action, skipping the done ones', () => {
    const project = aProject({
      actions: [
        anAction({ description: 'third', order: 3 }),
        anAction({ description: 'first', order: 1, status: 'done' }),
        anAction({ description: 'second', order: 2 }),
      ],
    })

    expect(currentNextAction(project)?.description).toBe('second')
  })

  it('is nothing when everything is done', () => {
    const project = aProject({ actions: [anAction({ order: 1, status: 'done' })] })

    expect(currentNextAction(project)).toBeUndefined()
  })
})

describe('rankActiveProjects', () => {
  it('excludes paused and completed projects', () => {
    const ranked = rankActiveProjects(
      [
        aProject({ name: 'active' }),
        aProject({ name: 'paused', status: 'paused' }),
        aProject({ name: 'completed', status: 'completed' }),
        aProject({ name: 'blocked', status: 'blocked' }),
      ],
      TODAY,
    )

    expect(ranked.map((project) => project.name).toSorted()).toEqual(['active', 'blocked'])
  })

  it('orders by score, descending', () => {
    const ranked = rankActiveProjects(
      [
        aProject({ name: 'low', impact: 1, urgency: 1, effort: 10 }),
        aProject({ name: 'high', impact: 10, urgency: 10, effort: 1 }),
        aProject({ name: 'mid', impact: 5, urgency: 5, effort: 5 }),
      ],
      TODAY,
    )

    expect(ranked.map((project) => project.name)).toEqual(['high', 'mid', 'low'])
  })

  it('breaks a tie on urgency, then on age', () => {
    // All three score 10. Higher urgency wins; equal urgency falls back to
    // the older one, so nothing quietly rots at the bottom.
    const older = '2025-01-01T00:00:00.000Z'
    const newer = '2026-01-01T00:00:00.000Z'

    const ranked = rankActiveProjects(
      [
        aProject({ name: 'equal-newer', impact: 5, urgency: 4, effort: 2, createdAt: newer }),
        aProject({ name: 'higher-urgency', impact: 2, urgency: 10, effort: 2, createdAt: newer }),
        aProject({ name: 'equal-older', impact: 5, urgency: 4, effort: 2, createdAt: older }),
      ],
      TODAY,
    )

    expect(ranked.map((project) => project.name)).toEqual([
      'higher-urgency',
      'equal-older',
      'equal-newer',
    ])
  })

  it('does not reorder the array it was handed', () => {
    const projects = [
      aProject({ name: 'low', impact: 1, urgency: 1, effort: 10 }),
      aProject({ name: 'high', impact: 10, urgency: 10, effort: 1 }),
    ]

    rankActiveProjects(projects, TODAY)

    expect(projects.map((project) => project.name)).toEqual(['low', 'high'])
  })
})

describe('getRecommendation', () => {
  it('picks the top-ranked project’s next action', () => {
    const result = getRecommendation(
      [
        aProject({
          name: 'low',
          impact: 1,
          urgency: 1,
          effort: 10,
          actions: [anAction({ description: 'do the small thing' })],
        }),
        aProject({
          name: 'high',
          impact: 10,
          urgency: 10,
          effort: 1,
          actions: [anAction({ description: 'do the big thing' })],
        }),
      ],
      TODAY,
    )

    expect(result.projectName).toBe('high')
    expect(result.actionDescription).toBe('do the big thing')
    expect(result.reason).toBe('Highest priority active project')
  })

  it('skips a project with no next action', () => {
    const result = getRecommendation(
      [
        aProject({ name: 'stuck-but-top', impact: 10, urgency: 10, effort: 1 }),
        aProject({
          name: 'runner-up',
          actions: [anAction({ description: 'the reachable thing' })],
        }),
      ],
      TODAY,
    )

    expect(result.projectName).toBe('runner-up')
  })

  it('skips a project whose next action is not available yet', () => {
    const result = getRecommendation(
      [
        aProject({
          name: 'waiting',
          impact: 10,
          urgency: 10,
          effort: 1,
          actions: [anAction({ description: 'wait for the part', availableFrom: day(3) })],
        }),
        aProject({ name: 'workable', actions: [anAction({ description: 'the doable thing' })] }),
      ],
      TODAY,
    )

    expect(result.projectName).toBe('workable')
  })

  /*
   * Blocked by something outside the app, so its own next action *is* the
   * unblock step and doing it releases a high-value project.
   */
  it('still recommends a manually blocked project', () => {
    const result = getRecommendation(
      [
        aProject({
          name: 'blocked',
          impact: 10,
          urgency: 10,
          effort: 1,
          status: 'blocked',
          isBlocked: true,
          actions: [anAction({ description: 'chase the records office' })],
        }),
      ],
      TODAY,
    )

    expect(result.projectName).toBe('blocked')
    expect(result.reason).toBe('Unblocks a high-priority project')
  })

  /*
   * The most useful rule in the app. This project's own next action does
   * not release it — finishing the other project does — so recommending it
   * would be telling you to do the wrong thing.
   */
  it('skips a project blocked by another open project', () => {
    const blocker = aProject({ name: 'blocker', status: 'active' })
    const blocked = aProject({
      name: 'blocked-by-project',
      impact: 10,
      urgency: 10,
      effort: 1,
      status: 'blocked',
      blockedBy: [blocker.id],
      actions: [anAction({ description: 'its own step' })],
    })
    const fallback = aProject({
      name: 'fallback',
      actions: [anAction({ description: 'do this instead' })],
    })

    const result = getRecommendation([blocker, blocked, fallback], TODAY)

    expect(result.projectName).toBe('fallback')
  })

  it('stops skipping once the blocking project is completed', () => {
    const blocker = aProject({ name: 'blocker', status: 'completed' })
    const blocked = aProject({
      name: 'was-blocked',
      impact: 10,
      urgency: 10,
      effort: 1,
      blockedBy: [blocker.id],
      actions: [anAction({ description: 'now workable' })],
    })

    const result = getRecommendation([blocker, blocked], TODAY)

    expect(result.projectName).toBe('was-blocked')
  })

  /*
   * "Nothing to do" and "something went wrong" must not look the same on a
   * screen opened every morning.
   */
  it('explains itself when nothing is actionable', () => {
    const result = getRecommendation([], TODAY)

    expect(result.projectId).toBeUndefined()
    expect(result.actionId).toBeUndefined()
    expect(result.reason.trim().length).toBeGreaterThan(0)
  })

  /*
   * A blocker that is not in the list at all is not a blocker. Two devices
   * can disagree about which projects exist for a moment, and the answer
   * to a dangling id is "carry on", not "this project is stuck forever".
   */
  it('ignores a blocker id that names nothing', () => {
    const project = aProject({
      name: 'dangling',
      blockedBy: [asProjectId('deleted-on-the-other-device')],
      actions: [anAction({ description: 'still workable' })],
    })

    expect(getRecommendation([project], TODAY).projectName).toBe('dangling')
  })
})

describe('deriveStatus', () => {
  it.each<ProjectStatus>(['completed', 'paused'])('passes through %s untouched', (requested) => {
    const project = aProject({ isBlocked: true })

    expect(deriveStatus(project, requested, alone(project))).toBe(requested)
  })

  it('is blocked when the manual flag is set', () => {
    const project = aProject({ isBlocked: true })

    expect(deriveStatus(project, 'active', alone(project))).toBe('blocked')
  })

  it('is blocked when waiting on an open project', () => {
    const other = aProject({ name: 'other', status: 'active' })
    const project = aProject({ blockedBy: [other.id] })

    expect(deriveStatus(project, 'active', indexProjects([other, project]))).toBe('blocked')
  })

  it('is active once every blocking project is completed', () => {
    const a = aProject({ name: 'a', status: 'completed' })
    const b = aProject({ name: 'b', status: 'completed' })
    const project = aProject({ blockedBy: [a.id, b.id] })

    expect(deriveStatus(project, 'blocked', indexProjects([a, b, project]))).toBe('active')
  })
})
