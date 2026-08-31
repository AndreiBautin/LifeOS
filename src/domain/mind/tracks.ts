/**
 * Exercises to practise, read from Exercism's open repositories.
 *
 * **Exercism has no usable API, and this is the way round it that
 * works.** Their `/api/v2` is internal to their own frontend, needs a
 * token, and is CORS-blocked from a browser — tested, not assumed. What
 * *is* open is the content: every track is a public GitHub repository
 * with a `config.json` listing its practice exercises, and
 * `raw.githubusercontent.com` serves those to a browser with no key.
 * One request returns 111 exercises for the TypeScript track.
 *
 * **LeetCode has no equivalent and is not attempted.** It publishes no
 * public API and blocks browser requests; a problem solved there is
 * typed in by name, which is all the log needs — what pays XP is having
 * solved it, not the app having fetched the text.
 *
 * The rate limit is the thing to respect: unauthenticated GitHub allows
 * **60 requests an hour per IP**. That is ample for reading a track once
 * and caching it, and nowhere near enough to browse. Nothing here loops.
 */

export const TRACKS = [
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'csharp',
  'java',
  'kotlin',
  'ruby',
  'elixir',
] as const

export type TrackId = (typeof TRACKS)[number]

export interface TrackExercise {
  readonly slug: string
  readonly name: string
  /**
   * Exercism's own 1–10 difficulty, mapped to the three this app uses.
   *
   * Their scale is finer than anything a person reads off a log, and
   * carrying both would mean two answers to "how hard was it". The
   * mapping is theirs coarsened, not a judgement of ours: 1–3 easy, 4–7
   * medium, 8–10 hard, which is how their own site bands them.
   */
  readonly difficulty?: 'easy' | 'medium' | 'hard'
  /** What it exercises, as the track's own tags say. */
  readonly topics: readonly string[]
}

function band(value: unknown): TrackExercise['difficulty'] {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value <= 3) return 'easy'
  if (value <= 7) return 'medium'
  return 'hard'
}

/**
 * Reads a track's `config.json` into the handful of fields a picker
 * needs.
 *
 * Pure, like the job boards and the news sources: `infrastructure/`
 * fetches and this parses, so every quirk is testable against a fixture
 * rather than against GitHub on the day the suite runs.
 *
 * **Practice exercises only.** A track's config also lists `concept`
 * exercises, which are its teaching material and are worked through in
 * order rather than picked from — a picker offering both would mix a
 * syllabus into a problem list.
 */
export function readTrack(payload: unknown): readonly TrackExercise[] {
  if (typeof payload !== 'object' || payload === null) return []

  const exercises = (payload as { exercises?: unknown }).exercises
  if (typeof exercises !== 'object' || exercises === null) return []

  const practice = (exercises as { practice?: unknown }).practice
  if (!Array.isArray(practice)) return []

  return practice.flatMap((raw): readonly TrackExercise[] => {
    if (typeof raw !== 'object' || raw === null) return []

    const one = raw as Record<string, unknown>
    const slug = typeof one.slug === 'string' ? one.slug : undefined
    const name = typeof one.name === 'string' ? one.name : slug

    if (slug === undefined || name === undefined) return []

    /*
     * Deprecated exercises stay in the config with a `status` of
     * `deprecated`, and offering one is offering a problem the track has
     * withdrawn. Observed on real configs rather than guessed at.
     */
    if (one.status === 'deprecated') return []

    const difficulty = band(one.difficulty)

    return [
      {
        slug,
        name,
        ...(difficulty === undefined ? {} : { difficulty }),
        topics: Array.isArray(one.topics)
          ? one.topics.filter((topic): topic is string => typeof topic === 'string')
          : [],
      },
    ]
  })
}

/** Exercises whose name or topics mention a term. Empty term means all. */
export function matching(
  exercises: readonly TrackExercise[],
  term: string,
): readonly TrackExercise[] {
  const wanted = term.trim().toLowerCase()
  if (wanted === '') return exercises

  return exercises.filter(
    (one) =>
      one.name.toLowerCase().includes(wanted) ||
      one.slug.includes(wanted) ||
      one.topics.some((topic) => topic.toLowerCase().includes(wanted)),
  )
}
