import type { BulletId, CompanyId, RoleId } from '@/domain/ids/ids'

/**
 * The resume, structured — because tailoring means choosing *parts* of it.
 *
 * A PDF is a picture of a resume. What an application needs is the thing
 * underneath: which bullets exist, which ones went out for a given role,
 * and which version of the summary was on top. None of that is
 * answerable about a file.
 *
 * **Nothing here is seeded.** The repository is public, and a name, a
 * phone number and an address in source are published the moment they
 * are committed. Every field arrives from the person using the app.
 */

/**
 * A bullet, with an identity of its own.
 *
 * **This is the load-bearing decision in the file.** Tailoring is
 * choosing which bullets go out and in what order, so a bullet has to be
 * referable — otherwise "which of these did Acme see" can only be
 * answered by storing a second copy of the text on the application, and
 * two copies of a sentence is how the resume and the record of it start
 * disagreeing after one edit.
 *
 * Editing a bullet does **not** change what was already sent, for the
 * same reason a `WorkoutLog` embeds its own prescription: an application
 * records the ids it went out with, and the sentence it went out with is
 * a fact about that day.
 */
export interface Bullet {
  readonly id: BulletId
  readonly text: string
}

/**
 * A position held, which is not the same as an employer.
 *
 * Two roles at one company is a promotion; two companies is a move. A
 * flat list of jobs cannot tell them apart — it prints the employer
 * twice and makes a promotion read as job-hopping, which is the opposite
 * of what it is evidence of.
 */
export interface Role {
  readonly id: RoleId
  readonly title: string
  /** Free text — "September 2024", "June 2019". Not a date. */
  readonly from: string
  /** Absent means current. */
  readonly to?: string
  readonly bullets: readonly Bullet[]
}

export interface Company {
  readonly id: CompanyId
  readonly name: string
  readonly location?: string
  /** Newest first, which is the order a resume prints them in. */
  readonly roles: readonly Role[]
}

/**
 * Skills, grouped as they are written — "Languages", "Cloud & DevOps".
 *
 * A flat list loses the grouping, and the grouping is most of what makes
 * a skills section readable. Free text rather than an enum: the
 * categories are the writer's, and an app that decided them would be
 * arguing with the resume.
 */
export interface SkillGroup {
  readonly label: string
  readonly skills: readonly string[]
}

export interface Education {
  readonly school: string
  readonly award?: string
  readonly detail?: string
}

export interface Resume {
  readonly name: string
  /** Location, email, phone, links — one line as it prints. */
  readonly contact: string
  readonly summary: string
  readonly skills: readonly SkillGroup[]
  readonly companies: readonly Company[]
  readonly education: readonly Education[]
  readonly updatedAt?: string
}

export const EMPTY_RESUME: Resume = {
  name: '',
  contact: '',
  summary: '',
  skills: [],
  companies: [],
  education: [],
}

/** Every bullet across every role, which is what a match reads. */
export function allBullets(resume: Resume): readonly Bullet[] {
  return resume.companies.flatMap((company) => company.roles.flatMap((role) => role.bullets))
}

/**
 * Splits pasted text into bullets, one per line.
 *
 * **Deliberately not a resume parser.** Guessing structure out of
 * arbitrary text is the kind of cleverness that works on the document it
 * was written against and quietly mangles the next one — and a mangled
 * resume is worse than an empty one, because it looks finished.
 * Splitting on newlines is a rule anybody can predict from the label
 * above the box.
 *
 * Leading bullet glyphs are dropped because they come with the paste and
 * are not part of the sentence.
 */
export function bulletsFromText(text: string): readonly string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[•·*\-–—]\s*/, '').trim())
    .filter((line) => line !== '')
}

/**
 * Which of two copies of the resume to keep.
 *
 * Whole-record last-write-wins, and the local object is returned **by
 * identity** when the incoming copy loses — the caller compares against
 * what it passed in to decide whether to write at all. Restamping values
 * that did not change would make this device the newest and bounce the
 * same document back on the next exchange, forever. `mergeSettings` is
 * the same shape for the same reason.
 *
 * An unstamped incoming copy always loses: the stamp is what makes two
 * copies orderable, and a copy that cannot prove it is newer must not
 * overwrite one that can. That is the rule tombstones already follow.
 *
 * There is nothing here to union. A habit's completions and a backlog
 * item's progress log are per-day append-only records where a
 * record-level winner genuinely loses a day; a resume is one document
 * that somebody edits, so the later edit is a correction.
 */
export function mergeResume(local: Resume | undefined, incoming: Resume): Resume | undefined {
  if (incoming.updatedAt === undefined) return local
  if (local?.updatedAt !== undefined && local.updatedAt >= incoming.updatedAt) return local

  return incoming
}
