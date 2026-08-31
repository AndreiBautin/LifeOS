/**
 * A job application, which is a `Project` and not a new record type.
 *
 * The app already knows this shape: a thing with a name, a fixed set of
 * steps, and a home that decides which screen it appears on. That is
 * what a house job is, and a second implementation of "a thing with
 * steps" would be a second place for a bug about steps to live.
 *
 * **The stages are why it fits.** An advance is a step *closed*, and
 * `ActionItem.completedAt` already records when — which is the only
 * reason `jobs.stage-advances-in-month` can be counted at all. Storing a
 * current stage instead would say where every application is and never
 * when it got there, and a rating that judges a direction needs the
 * dates.
 */

/**
 * What is ahead of an application once it has been sent.
 *
 * **Sending is not on the list, because sending is the record existing.**
 * The act the registry pays for is `jobs.application-sent`, and it is
 * paid on creation — so an "Applied" step would be a box you tick to say
 * a thing you have already done by typing it in.
 *
 * Everything that *is* here is an outcome rather than an act: nobody
 * decides to be given a screen. They are steps so that the dates they
 * happen on are recorded, not so that closing one is an achievement —
 * which is why no XP hangs off them, and why they feed a rating instead.
 */
export const APPLICATION_STAGES = ['Screen', 'Interview', 'Offer'] as const
