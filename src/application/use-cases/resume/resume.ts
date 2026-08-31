import { asBulletId, asCompanyId, asRoleId, type IdGenerator } from '@/domain/ids/ids'
import type { Clock, ResumeRepository } from '@/domain/repositories/ports'
import {
  bulletsFromText,
  EMPTY_RESUME,
  type Company,
  type Resume,
  type Role,
} from '@/domain/resume/resume'

export interface ResumeDeps {
  readonly resume: ResumeRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

/**
 * The resume, or an empty one.
 *
 * Empty rather than undefined, so every screen and every match reads the
 * same shape. "No resume yet" is a thing the *editor* can see from its
 * fields being blank; nothing else should have to handle two cases.
 */
export async function getResume(deps: ResumeDeps): Promise<Resume> {
  return (await deps.resume.get()) ?? EMPTY_RESUME
}

export async function saveResume(resume: Resume, deps: ResumeDeps): Promise<void> {
  await deps.resume.save(resume)
}

export interface NewRole {
  readonly company: string
  readonly location?: string
  readonly title: string
  readonly from: string
  readonly to?: string
  /** Pasted, one bullet a line — see `bulletsFromText`. */
  readonly bullets: string
}

/**
 * Adds a role, to an existing employer where there is one.
 *
 * **Matched on the company name, which is the whole point.** Two roles
 * at one employer is a promotion and belongs under one heading; adding
 * the second as a separate company would print the name twice and make
 * a promotion read as a move. Matching is case-insensitive and trimmed,
 * because "Northwind" and "northwind " are the same employer and nobody should
 * have to notice.
 *
 * **A current role goes first; anything else goes last.** A resume
 * prints the job you are in at the top, and the order roles were *typed*
 * has nothing to do with it — adding the older one second would have put
 * it above the newer one, which this did until it was looked at.
 *
 * Sorting by date is what you would reach for and it is not available:
 * `from` is free text on purpose ("September 2024", "2019"), because a
 * date picker for something a resume prints as a word is a worse form.
 * "No end date means current" needs no parsing and is right every time,
 * which covers the case that actually matters. Two past roles at one
 * employer keep the order they were added, and that is worth knowing
 * rather than pretending otherwise.
 */
export async function addRole(input: NewRole, deps: ResumeDeps): Promise<Resume> {
  const resume = await getResume(deps)

  const role: Role = {
    id: asRoleId(deps.ids.next()),
    title: input.title.trim(),
    from: input.from.trim(),
    ...(input.to === undefined || input.to.trim() === '' ? {} : { to: input.to.trim() }),
    bullets: bulletsFromText(input.bullets).map((text) => ({
      id: asBulletId(deps.ids.next()),
      text,
    })),
  }

  const name = input.company.trim()
  const at = resume.companies.findIndex(
    (company) => company.name.trim().toLowerCase() === name.toLowerCase(),
  )

  const companies: readonly Company[] =
    at === -1
      ? [
          ...resume.companies,
          {
            id: asCompanyId(deps.ids.next()),
            name,
            ...(input.location === undefined || input.location.trim() === ''
              ? {}
              : { location: input.location.trim() }),
            roles: [role],
          },
        ]
      : resume.companies.map((company, index) =>
          index === at
            ? {
                ...company,
                roles: role.to === undefined ? [role, ...company.roles] : [...company.roles, role],
              }
            : company,
        )

  const next: Resume = { ...resume, companies }
  await deps.resume.save(next)

  return next
}

/** Removes one role, and the employer with it when it was the last one. */
export async function removeRole(roleId: string, deps: ResumeDeps): Promise<Resume> {
  const resume = await getResume(deps)

  const next: Resume = {
    ...resume,
    companies: resume.companies
      .map((company) => ({
        ...company,
        roles: company.roles.filter((role) => role.id !== roleId),
      }))
      /*
       * An employer with no roles left is not an employer you worked
       * for, it is a heading with nothing under it. Dropping it here
       * rather than leaving an empty card is the same call `saneDaysLimit`
       * makes about a picker with nothing chosen.
       */
      .filter((company) => company.roles.length > 0),
  }

  await deps.resume.save(next)

  return next
}
