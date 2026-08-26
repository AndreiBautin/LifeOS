import type { ActionId, ProjectId } from '@/domain/ids/ids'

/**
 * A project, its checklist, and what it is waiting on.
 *
 * Three things changed shape on the way over from a relational schema, and
 * each of them is a decision rather than a translation.
 *
 * **Actions are embedded, not a second table.** They exist only inside a
 * project, are always read with it, and are ordered relative to each other
 * — a foreign key bought nothing here that an array does not. The cost is
 * that two devices closing two different actions on the same project while
 * apart resolve as a whole-record winner, and one of the two closes is
 * lost. That is the same trade `synchronise.ts` already takes for a
 * workout, for the same reason: this is one person with a phone and a
 * desktop, not a team.
 *
 * **Blockers are a list of ids on the project, not a join table.** The
 * join existed because the store was relational. Here the whole graph is
 * in memory whenever anything asks a question about it.
 *
 * **Dates are calendar days where they mean calendar days.** `deadline`
 * and `availableFrom` are `YYYY-MM-DD`, because "the fifteenth" is a day
 * rather than an instant, and comparing days as ISO strings sorts
 * correctly without a timezone in the way. The bookkeeping stamps stay
 * full ISO timestamps.
 */

export const PROJECT_STATUSES = ['active', 'blocked', 'paused', 'completed'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  active: 'Active',
  blocked: 'Blocked',
  paused: 'Paused',
  completed: 'Completed',
}

export const ACTION_STATUSES = ['pending', 'done'] as const
export type ActionStatus = (typeof ACTION_STATUSES)[number]

export interface ActionItem {
  readonly id: ActionId
  readonly description: string
  readonly status: ActionStatus
  readonly order: number
  /**
   * `YYYY-MM-DD`, or absent for "doable any time".
   *
   * Gates whether this action can be *recommended*, never whether it is
   * shown. A scheduled appointment is still part of the plan on the days
   * before it.
   */
  readonly availableFrom?: string
  readonly createdAt: string
  readonly completedAt?: string
}

export interface Project {
  readonly id: ProjectId
  readonly name: string
  readonly description?: string
  readonly category?: string

  /** 1–10 each. Effort is floored at 1 in the engine, never here. */
  readonly impact: number
  readonly urgency: number
  readonly effort: number

  readonly status: ProjectStatus

  /**
   * Blocked by something that is not another tracked project — "waiting on
   * the records office". Deliberately separate from `blockedBy`: one is a
   * fact about the world, the other is a fact about the graph, and the
   * recommendation treats them oppositely.
   */
  readonly isBlocked: boolean
  readonly blockReason?: string

  /** Projects that must complete before this one can move. */
  readonly blockedBy: readonly ProjectId[]

  /** `YYYY-MM-DD`, or absent. See `computeEffectiveUrgency`. */
  readonly deadline?: string

  readonly createdAt: string
  readonly completedAt?: string

  readonly actions: readonly ActionItem[]

  /** Written by the repository on save. See `domain/backlog/item.ts`. */
  readonly updatedAt?: string
}

/** Projects by id, which every graph question here needs. */
export function indexProjects(projects: readonly Project[]): ReadonlyMap<ProjectId, Project> {
  return new Map(projects.map((project) => [project.id, project]))
}
