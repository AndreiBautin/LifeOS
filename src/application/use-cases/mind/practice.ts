import type { AttemptId, IdGenerator } from '@/domain/ids/ids'
import { inLogOrder, type Attempt, type NewAttempt } from '@/domain/mind/practice'
import type { AttemptRepository, Clock } from '@/domain/repositories/ports'
import { toDayKey } from '@/domain/time/day'

/**
 * The practice log, from the application's side.
 *
 * **Solving a problem is an act, and this is the one path that records
 * it.** The XP is not awarded here — `tallyActs` counts the rows and
 * `registry.ts` holds what one is worth — which is the rule the whole
 * app follows: a running total cannot survive two devices, so the acts
 * are the synced records and the pool is derived from them.
 */

export interface PracticeDeps {
  readonly attempts: AttemptRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

export async function logAttempt(
  input: NewAttempt,
  deps: PracticeDeps,
): Promise<{ readonly error?: string }> {
  const title = input.title.trim()
  if (title === '') return { error: 'A problem needs a name.' }

  const now = deps.clock.now()
  const source = input.source?.trim() ?? ''
  const track = input.track?.trim() ?? ''
  const notes = input.notes?.trim() ?? ''

  await deps.attempts.save({
    id: deps.ids.next() as AttemptId,
    title,
    /*
     * The local day, not `toISOString().slice(0, 10)`.
     *
     * That mistake has shipped five times in this app and a lint rule
     * bans it now: west of Greenwich the two disagree for the last hours
     * of every evening, so a problem solved at nine at night would land
     * on tomorrow and vanish from tonight's count.
     */
    solvedOn: toDayKey(now),
    ...(source === '' ? {} : { source }),
    ...(track === '' ? {} : { track }),
    ...(input.difficulty === undefined ? {} : { difficulty: input.difficulty }),
    ...(input.minutes === undefined || input.minutes <= 0
      ? {}
      : { minutes: Math.round(input.minutes) }),
    ...(notes === '' ? {} : { notes }),
    createdAt: now.toISOString(),
  })

  return {}
}

/**
 * Removes a logged problem.
 *
 * A deletion rather than a retirement, unlike a habit. A habit's kept
 * days are the record and retiring keeps them; an attempt logged by
 * mistake is not a thing that happened, and leaving it would keep paying
 * XP for it. The tombstone is written by the repository, so the deletion
 * travels rather than being undone by the next sync.
 */
export async function unlogAttempt(id: AttemptId, deps: PracticeDeps): Promise<void> {
  await deps.attempts.remove(id)
}

export async function practiceLog(deps: PracticeDeps): Promise<readonly Attempt[]> {
  return inLogOrder(await deps.attempts.all())
}
