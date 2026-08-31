import type { AttemptId } from '@/domain/ids/ids'

/**
 * Practice — problems worked through, and the study that surrounds it.
 *
 * The ask: *"a mental training section where I do a daily study of
 * design patterns, and maybe pull LeetCode questions in and have that
 * gain XP."* Those are two different things and only one of them was
 * missing.
 *
 * **The daily study is a habit and already worked.** A `Daily` filed to
 * Mind, on whatever cadence, with a streak — the same record a chore or
 * a piece of upkeep is. Nothing new was needed for it beyond a home to
 * file it under.
 *
 * **What did not exist is the log.** Solving a problem is not a habit
 * tick: it has a name, a difficulty, a language, and doing two in a
 * morning is two things rather than one day ticked. That is the shape of
 * a `WorkoutLog` far more than the shape of a habit, and it is what this
 * module is.
 *
 * **XP is flat per problem, and difficulty deliberately does not scale
 * it.** `points` is a flat number per occurrence everywhere in this app,
 * because scaling by how well an act went reintroduces the outcome
 * through the back door. Difficulty is a property of the *problem*
 * rather than of how it went, so the argument is weaker here — and the
 * rule is kept anyway, because a hard problem paying triple turns a
 * record of practice into a thing to optimise, and the honest reason to
 * do a hard one is that it is hard.
 */

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

export type Difficulty = (typeof DIFFICULTIES)[number]

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

/**
 * Where a problem came from.
 *
 * Free text rather than a union, because the list of places somebody
 * practises is theirs — LeetCode, Exercism, Advent of Code, a book of
 * puzzles, a colleague's whiteboard. A fixed set would be the app having
 * an opinion about where practice is allowed to happen, which is the
 * same line the pool units and the daily groups hold.
 */
export interface Attempt {
  readonly id: AttemptId
  /** What the problem was called. */
  readonly title: string
  /** LeetCode, Exercism, a book. Absent when it does not matter. */
  readonly source?: string
  /** The language or track it was done in. */
  readonly track?: string
  readonly difficulty?: Difficulty
  /**
   * The local day it was solved on.
   *
   * A day key rather than a timestamp, because that is the granularity
   * the question is asked at — "how many this month" — and because a day
   * key is what every other date in this app compares against. The rule
   * the whole codebase follows: `toDayKey` is local, and
   * `toISOString().slice(0, 10)` is UTC and banned.
   */
  readonly solvedOn: string
  /** How long it took, when that is worth remembering. */
  readonly minutes?: number
  readonly notes?: string
  readonly createdAt: string
  /** Written by the repository, never here. */
  readonly updatedAt?: string
}

export interface NewAttempt {
  readonly title: string
  readonly source?: string
  readonly track?: string
  readonly difficulty?: Difficulty
  readonly minutes?: number
  readonly notes?: string
}

/**
 * How many were solved in a month, for the monthly rating.
 *
 * The month is compared as a prefix of the day key, which works because
 * both are local and both are `YYYY-MM-DD` / `YYYY-MM`. Comparing a
 * `Date` here would reintroduce the timezone bug this app has shipped
 * five times.
 */
export function solvedIn(attempts: readonly Attempt[], month: string): number {
  return attempts.filter((attempt) => attempt.solvedOn.startsWith(month)).length
}

/** Distinct days practised in a month — a different question from how many. */
export function daysPractisedIn(attempts: readonly Attempt[], month: string): number {
  return new Set(
    attempts.filter((one) => one.solvedOn.startsWith(month)).map((one) => one.solvedOn),
  ).size
}

/**
 * The most recent first, which is the order a log is read in.
 *
 * Ties broken by `createdAt` rather than left to the sort's stability,
 * because two problems solved on one day are two events with an order
 * and the log should show the later one first.
 */
export function inLogOrder(attempts: readonly Attempt[]): readonly Attempt[] {
  return [...attempts].sort(
    (a, b) => b.solvedOn.localeCompare(a.solvedOn) || b.createdAt.localeCompare(a.createdAt),
  )
}

/**
 * What has been practised lately, so a picker can offer it back.
 *
 * A track typed once should be one tap the second time, which is the
 * argument the pool presets and the daily groups both make.
 */
export function tracksIn(attempts: readonly Attempt[]): readonly string[] {
  const seen: string[] = []

  for (const attempt of attempts) {
    const track = attempt.track?.trim()
    if (track !== undefined && track !== '' && !seen.includes(track)) seen.push(track)
  }

  return seen.sort((a, b) => a.localeCompare(b))
}

/**
 * Whether this problem has been solved before, by title and track.
 *
 * **Reported, never refused.** Re-solving a problem is how practice
 * works — a kata done a second time from memory is the point of a kata —
 * so this exists to let a screen say "you did this in March" rather than
 * to stop anybody logging it. The app records what happened; it does not
 * have opinions about repetition.
 */
export function timesSolved(
  attempts: readonly Attempt[],
  title: string,
  track: string | undefined,
): number {
  const wanted = title.trim().toLowerCase()
  const wantedTrack = track?.trim().toLowerCase() ?? ''

  return attempts.filter(
    (attempt) =>
      attempt.title.trim().toLowerCase() === wanted &&
      (attempt.track?.trim().toLowerCase() ?? '') === wantedTrack,
  ).length
}
