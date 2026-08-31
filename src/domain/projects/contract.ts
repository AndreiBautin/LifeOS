import type { Project } from '@/domain/projects/project'

/**
 * A contract is a one-off: a quest whose whole content is one step.
 *
 * The ask: *"what are side quests? Maybe we need contracts or something
 * to track little one-off things that come up."* Right question — the
 * board is for things you chose and are working through, and a parcel to
 * return does not belong on it wearing the same clothes.
 *
 * **It is a view, not a record type.** No new store, no new act, no new
 * XP price. A contract is a `Project` and always was; what this adds is
 * a name for the shape and a place to see them, which is the same
 * relationship Base has to a house job.
 *
 * **One step, and that number is load-bearing rather than tidy.** XP is
 * paid per *closed action* — `projects.side-action-closed`, 20 points —
 * and nothing pays for a project existing or being marked done. So a
 * one-off with **no** steps would earn nothing at all, and a Contracts
 * section full of things that pay nothing is a section that teaches you
 * not to use it. The one-off *is* the step; closing it is the act, and
 * the act is what the model pays for.
 *
 * The alternative was a new act for "closed a project with no steps",
 * which would have been a way to earn points by creating and closing
 * empty records. That is the farming incentive the act/outcome line
 * exists to prevent.
 */

/**
 * Whether a project reads as a one-off.
 *
 * Derived, so nothing has to be kept in step: a quest that grows a
 * second step stops being a contract, which is honest — the moment
 * something needs breaking down it is no longer a one-off. It moves
 * between sections rather than being wrong in one of them.
 */
export function isContract(project: Project): boolean {
  /*
   * Finished ones drop out. A contract is something outstanding — the
   * section answers "what small thing is hanging over me", and a closed
   * parcel return is not hanging over anybody.
   */
  return project.status !== 'completed' && project.actions.length === 1
}

export function contracts(projects: readonly Project[]): readonly Project[] {
  return projects.filter(isContract)
}

/** Everything that is not a one-off, for the board proper. */
export function board(projects: readonly Project[]): readonly Project[] {
  return projects.filter((project) => !isContract(project))
}

/**
 * Whether a contract's one step has been ticked.
 *
 * **Ticking it is not the same as filing it away**, and this app keeps
 * those apart everywhere: `deriveStatus` never completes a project on
 * its own, because a project with every step done may still have steps
 * to add, and closing it is a decision. A one-off is the case where that
 * distinction feels like ceremony — the single step *is* the thing —
 * but forking the shared rule for one shape would be a second answer to
 * "when is a project finished".
 *
 * So a done contract stays in the section and sorts to the bottom until
 * it is closed, which is what any other quest with every step ticked
 * does. If that proves to be one tap too many, the change is here rather
 * than in `deriveStatus`.
 */
export function isDone(project: Project): boolean {
  return project.actions.every((action) => action.status === 'done')
}

/** Outstanding first, ticked last. */
export function byOutstanding(projects: readonly Project[]): readonly Project[] {
  return [...projects].sort((a, b) => Number(isDone(a)) - Number(isDone(b)))
}
