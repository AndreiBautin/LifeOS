import { JOBS, keepFor } from '@/domain/base/base'
import { APPLICATION_STAGES } from '@/domain/jobs/application'
import type { FetchedPosting } from '@/domain/jobs/boards'
import type { Project } from '@/domain/projects/project'
import { addProject, type ProjectDeps } from '@/application/use-cases/projects/projects'

/**
 * Turning a lead into a tracked application.
 *
 * **The posting comes with it**, into `description`, so the resume match
 * is available the moment the application exists rather than after
 * somebody pastes the text a second time. That is most of the value of
 * approving from a lead rather than typing the company in by hand.
 *
 * **This diverges from Career Command Center on purpose.** There,
 * approving files an application in *Preparing* and applying is a later
 * stage. Here, creating the application pays `jobs.application-sent` —
 * thirty XP for an act — so a record that exists before anything was
 * sent would pay for something nobody did. Approving therefore *is*
 * applying: the button opens the form and files the application in the
 * same press.
 *
 * A shortlist of postings you are considering is a different thing and
 * would be a different record. It is not this one.
 */
export interface ApproveResult {
  readonly application?: Project
  /** Set when nothing was created, and why. */
  readonly alreadyApplied?: Project
}

export async function approveLead(
  posting: FetchedPosting,
  deps: ProjectDeps,
): Promise<ApproveResult> {
  const link = posting.applyUrl ?? posting.url

  /*
   * The link is the identity. Ids are per-board and a title repeats
   * across companies, so the apply URL is the one thing about a posting
   * that is both unique and stable when the board is read again — and a
   * board *will* be read again, since a sweep is the only way to see
   * anything.
   */
  const existing = keepFor(await deps.projects.all(), JOBS).find((one) => one.link === link)
  if (existing !== undefined) return { alreadyApplied: existing }

  const application = await addProject(
    {
      name: nameFor(posting),
      belongsTo: JOBS,
      steps: [...APPLICATION_STAGES],
      link,
      /*
       * The posting verbatim, with nothing prepended. A "from
       * Greenhouse, scored 80" preamble would put *those* words into the
       * resume match — "greenhouse" and "stripe" would read as
       * requirements — and the description is the one field the match
       * treats as the job.
       */
      ...(posting.description === '' ? {} : { description: posting.description }),
    },
    deps,
  )

  return { application }
}

/**
 * "Stripe — Staff Engineer", which is how a person refers to it.
 *
 * The board token stands in for the company because that is all a board
 * actually tells us: Greenhouse says the slug, not the legal name. It is
 * the same word the lead card showed, so the application reads as the
 * thing that was approved.
 */
function nameFor(posting: FetchedPosting): string {
  const company = posting.boardToken.trim()
  const title = posting.title.trim()

  return company === '' ? title : `${company} — ${title}`
}

/** The links already applied to, so a lead list can say which are spent. */
export async function appliedLinks(deps: ProjectDeps): Promise<ReadonlySet<string>> {
  const applications = keepFor(await deps.projects.all(), JOBS)

  return new Set(
    applications
      .map((one) => one.link)
      .filter((link): link is string => link !== undefined && link !== ''),
  )
}
