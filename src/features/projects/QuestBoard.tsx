import {
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Home,
  Lightbulb,
  Plus,
  Receipt,
  Trash2,
  Waypoints,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'

import { useServices } from '@/app/context'
import { kindOf } from '@/domain/projects/active'
import { QUEST_KIND_LABELS, type QuestKind } from '@/domain/projects/project'
import { board, byOutstanding, contracts } from '@/domain/projects/contract'
import { Badge, Button, Card, CardHeading, Empty } from '@/components/shared/primitives'
import { EyeIcon } from '@/components/shared/EyeIcon'

import { computeProgress, computeScore } from '@/domain/projects/priority'
import { PROJECT_STATUS_LABELS, type Project } from '@/domain/projects/project'

import {
  useAddAction,
  useAddProject,
  useDeleteProject,
  useMoveProjectHome,
  useProjects,
  useActiveQuests,
  useRecommendation,
  useSetActiveQuest,
  useSetActionStatus,
  useSetBlockers,
  useAddContract,
  useUpdateProject,
} from './hooks'
import { NextAction, StatusBadge } from './NextAction'

/**
 * Everything the old `/quests` page held below its Active section, now
 * on Today.
 *
 * **Quests merged into Today outright**, asked for after several rounds
 * of decoration failed to close a vertical gap on a wide monitor: "maybe
 * just consider condensing pages, as its not enough content to fill a
 * page in a full monitor screen without looking awkward." Right — the
 * decorative fixes were treating a symptom. `/quests` held Suggested,
 * Contracts and the full board, none of it duplicated on Today, all of
 * it real. The nav bar stays at seven cells — Party's seat had already
 * split into Finance and Tech by the time Quests left — but loses one
 * destination regardless; `router.tsx` redirects
 * `/quests` to `/today` for the same reason `/character`, `/party` and
 * `/vitals` already do — a PWA shortcut installed against the old path
 * has to keep resolving.
 *
 * **The Active section did not come with it.** `ActiveQuests` already
 * renders on Today in its own right; importing it a second time here
 * would put the main/side quest cards on the page twice.
 *
 * **Goals and Job search moved here from the page header Today never
 * had.** Both are reached from nowhere else — a tab is the only
 * unconditional route in this app, and neither has one — so losing their
 * old header would have made them unreachable, the exact "capability
 * nothing can reach" trap this codebase keeps a record of falling into.
 * They sit in the board's own heading action slot instead.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'

function ActionRow({
  project,
  action,
}: {
  readonly project: Project
  readonly action: Project['actions'][number]
}) {
  const set = useSetActionStatus()
  const done = action.status === 'done'

  return (
    <div className="row-hover -mx-2 flex items-center gap-3 px-2 py-2">
      <button
        type="button"
        aria-label={done ? `Re-open ${action.description}` : `Close ${action.description}`}
        aria-pressed={done}
        className={[
          'tap-target grid size-9 shrink-0 place-items-center rounded-lg border transition-colors',
          done
            ? 'border-good-500 bg-good-500/15 text-good-500'
            : 'border-ink-700 text-ink-700 hover:border-ink-500',
        ].join(' ')}
        onClick={() => {
          set.mutate({ id: project.id, actionId: action.id, done: !done })
        }}
      >
        {done && <Check size={16} aria-hidden />}
      </button>

      <span
        className={
          done ? 'text-ink-500 flex-1 text-sm line-through' : 'text-ink-100 flex-1 text-sm'
        }
      >
        {action.description}
      </span>

      {action.availableFrom !== undefined && !done && (
        <Badge tone="sub">from {action.availableFrom}</Badge>
      )}
    </div>
  )
}

function Blockers({
  project,
  others,
}: {
  readonly project: Project
  readonly others: readonly Project[]
}) {
  const set = useSetBlockers()
  const error = set.data?.error

  if (others.length === 0) return null

  return (
    <div className="mt-3">
      <p className="text-ink-500 mb-1 text-xs font-medium tracking-wide uppercase">Waiting on</p>

      <div className="flex flex-wrap gap-1.5">
        {others.map((other) => {
          const waiting = project.blockedBy.includes(other.id)

          return (
            <Button
              key={other.id}
              variant={waiting ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={waiting}
              onClick={() => {
                set.mutate({
                  id: project.id,
                  blockerIds: waiting
                    ? project.blockedBy.filter((one) => one !== other.id)
                    : [...project.blockedBy, other.id],
                })
              }}
            >
              {other.name}
            </Button>
          )
        })}
      </div>

      {error !== undefined && (
        <p role="alert" className="text-bad-500 mt-2 text-sm">
          {error}
        </p>
      )}
    </div>
  )
}

function ProjectCard({
  project,
  others,
  today,
}: {
  readonly project: Project
  readonly others: readonly Project[]
  readonly today: Date
}) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState('')

  const addAction = useAddAction()
  const update = useUpdateProject()
  const remove = useDeleteProject()
  const moveHome = useMoveProjectHome()
  const setActive = useSetActiveQuest()
  const active = useActiveQuests()
  const [confirming, setConfirming] = useState(false)

  const isActive = active.data?.main?.id === project.id || active.data?.side?.id === project.id

  const progress = computeProgress(project)

  return (
    <Card className="py-3">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          aria-label={open ? `Collapse ${project.name}` : `Expand ${project.name}`}
          onClick={() => {
            setOpen(!open)
          }}
        >
          {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-ink-50 truncate font-medium">{project.name}</p>
            <Badge tone={kindOf(project) === 'main' ? 'accent' : 'neutral'}>
              {QUEST_KIND_LABELS[kindOf(project)]}
            </Badge>
          </div>
          <p className="text-ink-500 numeric mt-0.5 text-xs">
            score {computeScore(project, today).toString()} · {progress.toString()}% done
            {project.deadline !== undefined && ` · due ${project.deadline}`}
            {project.blockReason !== undefined && ` · ${project.blockReason}`}
          </p>
        </div>

        <StatusBadge status={PROJECT_STATUS_LABELS[project.status].toLowerCase()} />
      </div>

      {open && (
        <div className="border-ink-800 mt-3 border-t pt-2 pl-11">
          {project.actions.length === 0 ? (
            <p className="text-ink-500 py-2 text-sm">No steps yet.</p>
          ) : (
            [...project.actions]
              .sort((a, b) => a.order - b.order)
              .map((action) => <ActionRow key={action.id} project={project} action={action} />)
          )}

          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (adding.trim() === '') return

              addAction.mutate(
                { id: project.id, description: adding },
                {
                  onSuccess: () => {
                    setAdding('')
                  },
                },
              )
            }}
          >
            <input
              className={FIELD}
              value={adding}
              aria-label={`Add a step to ${project.name}`}
              placeholder="Next step"
              onChange={(event) => {
                setAdding(event.target.value)
              }}
            />
            <Button type="submit" size="sm" disabled={addAction.isPending}>
              <Plus size={16} aria-hidden />
            </Button>
          </form>

          <Button
            full
            variant={isActive ? 'outline' : 'primary'}
            className="mt-2"
            onClick={() => {
              setActive.mutate(
                isActive ? { kind: kindOf(project) } : { id: project.id, kind: kindOf(project) },
              )
            }}
          >
            {isActive
              ? `Stand down as ${QUEST_KIND_LABELS[kindOf(project)].toLowerCase()} quest`
              : `Make this my ${QUEST_KIND_LABELS[kindOf(project)].toLowerCase()} quest`}
          </Button>

          <label className="mt-3 block">
            <span className="text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase">
              Deadline
            </span>
            <input
              type="date"
              className={FIELD}
              value={project.deadline ?? ''}
              aria-label={`Deadline for ${project.name}`}
              onChange={(event) => {
                update.mutate({
                  id: project.id,
                  changes: { deadline: event.target.value === '' ? null : event.target.value },
                })
              }}
            />
          </label>

          <Blockers project={project} others={others} />

          <div className="mt-3 flex gap-2">
            {project.status !== 'completed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  update.mutate({ id: project.id, changes: { status: 'completed' } })
                }}
              >
                Complete
              </Button>
            )}
            {project.status === 'completed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  update.mutate({ id: project.id, changes: { status: 'active' } })
                }}
              >
                Re-open
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${project.name} to Base`}
              disabled={moveHome.isPending}
              onClick={() => {
                moveHome.mutate({ id: project.id, home: 'base' })
              }}
            >
              <Home size={16} aria-hidden />
            </Button>

            <Button
              variant={confirming ? 'danger' : 'ghost'}
              size="sm"
              aria-label={
                confirming ? `Confirm deleting ${project.name}` : `Delete ${project.name}`
              }
              onClick={() => {
                if (confirming) {
                  remove.mutate(project.id)
                } else {
                  setConfirming(true)
                }
              }}
            >
              {confirming ? 'Sure?' : <Trash2 size={16} aria-hidden />}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function Contracts({
  projects,
  all,
  today,
}: {
  readonly projects: readonly Project[]
  readonly all: readonly Project[]
  readonly today: Date
}) {
  const add = useAddContract()
  const [name, setName] = useState('')

  return (
    <div>
      <CardHeading icon={<Receipt size={16} aria-hidden />} title="Contracts" />
      <form
        className="mb-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim() === '') return

          add.mutate(name, {
            onSuccess: () => {
              setName('')
            },
          })
        }}
      >
        <input
          className={FIELD}
          value={name}
          aria-label="New contract"
          placeholder="Something small that came up"
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
        <Button type="submit" variant="primary" disabled={add.isPending}>
          <Plus size={16} aria-hidden />
        </Button>
      </form>

      {projects.length === 0 ? (
        <p className="text-ink-700 text-xs">
          Nothing here. A contract is one thing to do — ticking it pays the same as any side quest
          step, and it leaves the moment it needs breaking down into more.
        </p>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              others={all.filter((one) => one.id !== project.id)}
              today={today}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function QuestBoard() {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<QuestKind>('side')
  const [showingFinished, setShowingFinished] = useState(false)
  const projects = useProjects()

  const recommendation = useRecommendation('own-area')
  const add = useAddProject()
  const setActive = useSetActiveQuest()

  const today = useServices().clock.now()

  const suggested = (projects.data ?? []).find(
    (project) => project.id === recommendation.data?.projectId,
  )

  const outstanding = (projects.data ?? []).filter((project) => project.status !== 'completed')
  const oneOffs = byOutstanding(contracts(outstanding))
  const open = board(outstanding)
  const done = (projects.data ?? []).filter((project) => project.status === 'completed')

  return (
    <>
      {recommendation.data?.actionId !== undefined && (
        <div>
          <CardHeading icon={<Lightbulb size={16} aria-hidden />} title="Suggested" />
          <NextAction recommendation={recommendation.data} />
          {suggested !== undefined && (
            <Button
              className="mt-2"
              full
              onClick={() => {
                setActive.mutate({ id: suggested.id, kind: kindOf(suggested) })
              }}
            >
              Make this my {QUEST_KIND_LABELS[kindOf(suggested)].toLowerCase()} quest
            </Button>
          )}
        </div>
      )}

      <Contracts projects={oneOffs} today={today} all={projects.data ?? []} />

      <div>
        <CardHeading
          icon={<ClipboardList size={16} aria-hidden />}
          title="The board"
          action={
            <div className="flex items-center gap-3">
              {/*
                **Goals and Job search, relocated from the page header
                this screen never had.** Neither is reached from anywhere
                else in the app, so losing their old home on `/quests`
                would have made them unreachable outright.
              */}
              <Link to="/goals" className="text-ink-500 hover:text-ink-300 text-xs">
                <Waypoints size={13} className="mr-1 inline" aria-hidden />
                Goals
              </Link>
              <Link to="/jobs" className="text-ink-500 hover:text-ink-300 text-xs">
                <Briefcase size={13} className="mr-1 inline" aria-hidden />
                Job search
              </Link>
              {done.length > 0 && (
                <Button
                  size="sm"
                  variant={showingFinished ? 'primary' : 'ghost'}
                  aria-pressed={showingFinished}
                  aria-label={`${showingFinished ? 'Hide' : 'Show'} ${String(done.length)} finished`}
                  onClick={() => {
                    setShowingFinished(!showingFinished)
                  }}
                >
                  <EyeIcon open={showingFinished} />
                </Button>
              )}
            </div>
          }
        />
        <form
          className="mb-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim() === '') return

            add.mutate(
              { name, kind },
              {
                onSuccess: () => {
                  setName('')
                },
              },
            )
          }}
        >
          <input
            className={FIELD}
            value={name}
            aria-label="New quest name"
            placeholder="Something you are trying to get done"
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
          <div className="flex gap-2">
            <div className="flex flex-1 gap-1">
              {(['side', 'main'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`${QUEST_KIND_LABELS[option]} quest`}
                  aria-pressed={kind === option}
                  className={[
                    'tap-target flex-1 rounded-lg border px-2 text-xs font-medium',
                    kind === option
                      ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                      : 'border-ink-800 text-ink-500',
                  ].join(' ')}
                  onClick={() => {
                    setKind(option)
                  }}
                >
                  {QUEST_KIND_LABELS[option]}
                </button>
              ))}
            </div>
            <Button type="submit" variant="primary" disabled={add.isPending}>
              <Plus size={16} aria-hidden /> Add
            </Button>
          </div>
        </form>

        {projects.data !== undefined && (
          <p className="text-ink-500 mb-2 text-sm">
            {open.length === 0
              ? 'Nothing on the board.'
              : `${open.length.toString()} open${done.length > 0 ? ` · ${done.length.toString()} finished` : ''}`}
          </p>
        )}

        {open.length === 0 ? (
          <Empty title="Nothing on">Add the thing you keep meaning to get round to.</Empty>
        ) : (
          <div className="space-y-2">
            {open.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                others={(projects.data ?? []).filter((one) => one.id !== project.id)}
                today={today}
              />
            ))}
          </div>
        )}

        {showingFinished && done.length > 0 && (
          <div className="border-ink-800 mt-3 space-y-2 border-t pt-3">
            {done.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                others={(projects.data ?? []).filter((one) => one.id !== project.id)}
                today={today}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
