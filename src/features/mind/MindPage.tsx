import { BookOpen, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { MIND } from '@/domain/base/base'
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  daysPractisedIn,
  solvedIn,
  timesSolved,
  tracksIn,
  type Difficulty,
} from '@/domain/mind/practice'
import { matching, TRACKS, type TrackId } from '@/domain/mind/tracks'
import { toMonthKey } from '@/domain/finance/reading'
import { useServices } from '@/app/context'
import { AddDaily, DailyRow } from '@/features/today/Dailies'
import { groupOnly } from '@/domain/dailies/groups'
import { GroupedDailies } from '@/features/today/DailyGroups'
import { useDailies } from '@/features/today/dailies-hooks'

import { useLogAttempt, usePracticeLog, useTrack, useUnlogAttempt } from './hooks'

/**
 * Mind — the study you do daily, and the problems you work through.
 *
 * The ask was *"a mental training section where I do a daily study of
 * design patterns, and maybe pull LeetCode questions in and have that
 * gain XP."* Those are two things, and only one of them was missing.
 *
 * **The study is a habit and needed nothing new.** A `Daily` filed here,
 * on whatever cadence, with a streak — the same record a chore is. What
 * it needed was a home to be filed under, so it pays `mind.habit-kept`
 * rather than crowding Today.
 *
 * **The log did not exist.** A solved problem has a name, a difficulty
 * and a language, and two in a morning are two things rather than one
 * day ticked — the shape of a workout log, not of a habit.
 *
 * **Both pay XP, and both feed Intellect**, which until now was only
 * what you had read. Practice is the other half of that and it is the
 * half you can do rather than consume.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase'

/**
 * Picking something to work on, from a track's real exercise list.
 *
 * **Exercism, because it is the one that can be read.** Their API is
 * internal and CORS-blocked, but every track is a public GitHub
 * repository and its `config.json` is served to a browser with no key —
 * 111 practice exercises for TypeScript in a single request. LeetCode
 * publishes nothing equivalent and blocks browsers, so a problem from
 * there is typed in by name, which is all the log needs: what pays XP is
 * having solved it, not the app having fetched the text.
 */
function ExercisePicker({
  onPick,
}: {
  readonly onPick: (name: string, track: string, difficulty?: Difficulty) => void
}) {
  const [track, setTrack] = useState<TrackId | undefined>(undefined)
  const [term, setTerm] = useState('')
  const exercises = useTrack(track)

  const found = matching(exercises.data ?? [], term)

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          className={FIELD}
          aria-label="Track"
          value={track ?? ''}
          onChange={(event) => {
            setTrack(event.target.value === '' ? undefined : (event.target.value as TrackId))
          }}
        >
          <option value="">Pick a track</option>
          {TRACKS.map((one) => (
            <option key={one} value={one}>
              {one}
            </option>
          ))}
        </select>
      </div>

      {track !== undefined && (
        <>
          <div className="relative">
            <Search
              size={14}
              className="text-ink-700 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
              aria-hidden
            />
            <input
              className={`${FIELD} pl-8`}
              aria-label="Find an exercise"
              placeholder="Name or topic — parsing, strings"
              value={term}
              onChange={(event) => {
                setTerm(event.target.value)
              }}
            />
          </div>

          {exercises.isPending && <p className="text-ink-700 text-xs">Reading the track…</p>}

          {/*
            Named rather than swallowed. GitHub allows sixty
            unauthenticated requests an hour, and a rate limit that
            returned an empty list would read as a track with no
            exercises in it.
          */}
          {exercises.isError && (
            <p className="text-warn-500 text-xs">
              That track could not be read. GitHub allows a limited number of requests an hour.
            </p>
          )}

          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {found.slice(0, 40).map((exercise) => (
              <li key={exercise.slug}>
                <button
                  type="button"
                  className="border-ink-800 hover:bg-ink-850 flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left"
                  onClick={() => {
                    onPick(exercise.name, track, exercise.difficulty)
                  }}
                >
                  <span className="text-ink-100 min-w-0 flex-1 truncate text-sm">
                    {exercise.name}
                  </span>
                  {exercise.difficulty !== undefined && (
                    <Badge tone="neutral">{DIFFICULTY_LABELS[exercise.difficulty]}</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {found.length > 40 && (
            <p className="text-ink-700 text-xs">
              {found.length - 40} more — narrow it with a name or a topic.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function LogProblem({ onDone }: { readonly onDone: () => void }) {
  const log = useLogAttempt()
  const attempts = usePracticeLog()
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [track, setTrack] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('')
  const [minutes, setMinutes] = useState('')
  const [picking, setPicking] = useState(false)

  const before = timesSolved(attempts.data ?? [], title, track === '' ? undefined : track)
  const used = tracksIn(attempts.data ?? [])

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim() === '') return

          const howLong = Number(minutes)

          log.mutate(
            {
              title,
              ...(source.trim() === '' ? {} : { source }),
              ...(track.trim() === '' ? {} : { track }),
              ...(difficulty === '' ? {} : { difficulty }),
              ...(Number.isFinite(howLong) && howLong > 0 ? { minutes: howLong } : {}),
            },
            { onSuccess: onDone },
          )
        }}
      >
        <div>
          <label className={LABEL} htmlFor="problem-title">
            What you solved
          </label>
          <input
            id="problem-title"
            className={FIELD}
            placeholder="Two Sum, Forth, the visitor pattern"
            value={title}
            autoFocus
            onChange={(event) => {
              setTitle(event.target.value)
            }}
          />
        </div>

        {/*
          Reported, never refused. A kata done a second time from memory
          is the point of a kata — this exists so the screen can say "you
          did this in March", not to stop anybody logging it again.
        */}
        {before > 0 && (
          <p className="text-ink-700 text-xs">
            You have logged this {before === 1 ? 'once' : `${String(before)} times`} before.
          </p>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setPicking(!picking)
          }}
        >
          <Search size={14} aria-hidden />
          {picking ? 'Close' : 'Find one on Exercism'}
        </Button>

        {picking && (
          <ExercisePicker
            onPick={(name, from, level) => {
              setTitle(name)
              setTrack(from)
              setSource('Exercism')
              if (level !== undefined) setDifficulty(level)
              setPicking(false)
            }}
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL} htmlFor="problem-source">
              Where from
            </label>
            <input
              id="problem-source"
              className={FIELD}
              placeholder="LeetCode"
              value={source}
              onChange={(event) => {
                setSource(event.target.value)
              }}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="problem-track">
              Language
            </label>
            <input
              id="problem-track"
              className={FIELD}
              placeholder={used[0] ?? 'typescript'}
              value={track}
              onChange={(event) => {
                setTrack(event.target.value)
              }}
            />
          </div>
        </div>

        <div>
          <span className={LABEL}>How hard</span>
          <div className="flex gap-1">
            {(['', ...DIFFICULTIES] as const).map((one) => (
              <button
                key={one === '' ? 'none' : one}
                type="button"
                aria-pressed={difficulty === one}
                className={[
                  'tap-target flex-1 rounded-lg border px-2 text-xs font-medium',
                  difficulty === one
                    ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                    : 'border-ink-800 text-ink-500',
                ].join(' ')}
                onClick={() => {
                  setDifficulty(one)
                }}
              >
                {one === '' ? 'Not saying' : DIFFICULTY_LABELS[one]}
              </button>
            ))}
          </div>
          {/*
            Recorded, and deliberately not worth more XP. Points are flat
            per occurrence everywhere here, because scaling by how an act
            went reintroduces the outcome — and the honest reason to do a
            hard one is that it is hard.
          */}
          <p className="text-ink-700 mt-1 text-xs">
            Recorded, not scored — every problem is worth the same.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="problem-minutes">
            Minutes — optional
          </label>
          <input
            id="problem-minutes"
            className={FIELD}
            inputMode="decimal"
            value={minutes}
            onChange={(event) => {
              setMinutes(event.target.value)
            }}
          />
        </div>

        <Button type="submit" variant="primary" full disabled={log.isPending}>
          <Plus size={16} aria-hidden />
          Solved it
        </Button>
      </form>
    </Card>
  )
}

export function MindPage() {
  const attempts = usePracticeLog()
  const unlog = useUnlogAttempt()
  const study = useDailies(MIND)
  const services = useServices()
  const [logging, setLogging] = useState(false)
  const [adding, setAdding] = useState(false)

  const log = attempts.data ?? []
  const month = toMonthKey(services.clock.now())
  const solved = solvedIn(log, month)
  const days = daysPractisedIn(log, month)

  return (
    <div>
      <PageHeader title="Mind" subtitle="What you studied, and what you worked out" />

      {/*
        Two numbers rather than one, and the pair is the point: six
        problems in one Sunday and six over six days are very different
        months, and neither figure alone can say which happened. Both are
        counts of records rather than a score, which is why they can be
        shown without a threshold beside them.
      */}
      {log.length > 0 && (
        <Card className="mb-3 flex items-baseline gap-4">
          <span className="text-ink-50 numeric text-sm">
            {solved} <span className="text-ink-700">this month</span>
          </span>
          <span className="text-ink-50 numeric text-sm">
            {days} <span className="text-ink-700">{days === 1 ? 'day' : 'days'} practised</span>
          </span>
        </Card>
      )}

      <Section
        title="Study"
        description="The daily kind — patterns, a chapter, a language."
        action={
          <Button
            variant={adding ? 'ghost' : 'outline'}
            size="sm"
            onClick={() => {
              setAdding(!adding)
            }}
          >
            {adding ? 'Close' : 'Add'}
          </Button>
        }
      >
        {adding && (
          <AddDaily
            home={MIND}
            placeholder="Read one design pattern"
            onDone={() => {
              setAdding(false)
            }}
          />
        )}

        <Card>
          {study.data === undefined ? null : study.data.length === 0 ? (
            <Empty title="Nothing yet">
              <span className="inline-flex items-center gap-2">
                <BookOpen size={16} aria-hidden />A study habit here is a checkbox and a streak, and
                it pays the same fifteen points every kept habit is worth.
              </span>
            </Empty>
          ) : (
            <GroupedDailies
              bare
              categoryOf={groupOnly}
              views={study.data}
              render={(view, part) => <DailyRow view={view} part={part} />}
            />
          )}
        </Card>
      </Section>

      <Section
        title="Problems"
        description="Each one is an act, and each is worth the same."
        action={
          <Button
            variant={logging ? 'ghost' : 'outline'}
            size="sm"
            onClick={() => {
              setLogging(!logging)
            }}
          >
            {logging ? 'Close' : 'Log one'}
          </Button>
        }
      >
        {logging && (
          <LogProblem
            onDone={() => {
              setLogging(false)
            }}
          />
        )}

        <Card>
          {attempts.data === undefined ? null : log.length === 0 ? (
            <Empty title="Nothing logged">
              A problem worked through is a thing you did, so it pays XP — and it feeds Intellect,
              which was only what you had read until now.
            </Empty>
          ) : (
            <ul>
              {log.slice(0, 50).map((attempt) => (
                <li
                  key={attempt.id}
                  className="border-ink-800 flex items-center gap-2 border-b py-2 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-ink-50 truncate text-sm">{attempt.title}</p>
                    <p className="text-ink-700 numeric truncate text-xs">
                      {attempt.solvedOn}
                      {attempt.track !== undefined && ` · ${attempt.track}`}
                      {attempt.source !== undefined && ` · ${attempt.source}`}
                      {attempt.minutes !== undefined && ` · ${String(attempt.minutes)} min`}
                    </p>
                  </div>

                  {attempt.difficulty !== undefined && (
                    <Badge tone="neutral">{DIFFICULTY_LABELS[attempt.difficulty]}</Badge>
                  )}

                  {/*
                    A deletion, not a retirement — unlike a habit, whose
                    kept days are the record. A problem logged by mistake
                    is not a thing that happened, and leaving it would go
                    on paying XP for it.
                  */}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${attempt.title}`}
                    disabled={unlog.isPending}
                    onClick={() => {
                      unlog.mutate(attempt.id)
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </div>
  )
}
