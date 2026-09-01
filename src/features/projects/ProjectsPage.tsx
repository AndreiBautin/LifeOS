import { Campaigns } from '@/features/campaign/Campaigns'
import { useCampaigns } from '@/features/campaign/hooks'
import { Check, ChevronDown, ChevronRight, Home, Plus, Trash2, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useState } from 'react'

import { useServices } from '@/app/context'
import { kindOf } from '@/domain/projects/active'
import { QUEST_KIND_LABELS, type QuestKind } from '@/domain/projects/project'
import { board, byOutstanding, contracts } from '@/domain/projects/contract'
import { ActiveQuests } from './ActiveQuests'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'

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
 * The quest log.
 *
 * The recommendation is the top of the page and the reason the app opens
 * here: in a hub used daily, "what should I do right now, and what is the
 * exact next step" is the single most valuable thing on the screen.
 * Everything below it is the material that answer is derived from.
 *
 * Projects are quest chains, actions are steps and blockers are gates —
 * which is what the source already was, under different names. Nothing
 * here is a ladder: throughput has no ceiling, so it gets no level. See
 * docs/GAME_MODEL.md.
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
    <div className="flex items-center gap-3 py-2">
      <Button
        variant="ghost"
        size="sm"
        aria-label={done ? `Re-open ${action.description}` : `Close ${action.description}`}
        onClick={() => {
          set.mutate({ id: project.id, actionId: action.id, done: !done })
        }}
      >
        {done ? <Undo2 size={16} aria-hidden /> : <Check size={16} aria-hidden />}
      </Button>

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

/**
 * What a project is waiting on, and the refusal when that would close a
 * loop.
 *
 * The error is rendered rather than thrown. Every way to get this wrong is
 * something a person did on purpose — "that would create a circular
 * dependency" is a sentence they need to read, not an exception.
 */
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

          {/*
            A rule nothing can reach is a rule nobody can trust — the same
            reason the deadline field below exists. Without this, "active"
            would be a domain concept no screen could set.
          */}
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

          {/*
            The deadline was readable and not settable, which made it a
            rule nothing could reach: it drives `computeEffectiveUrgency`
            and now the Today agenda, and no screen could put one on.
            Clearing it sends `null` rather than `undefined` — the use case
            distinguishes "leave it alone" from "remove it", and a spread
            of `undefined` means the first.
          */}
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

            {/*
              Moving to Base rather than retyping it there.
              The common case is a quest log that has quietly filled with
              house work, and the leaking tap on it has a month of steps
              and history that a re-create would throw away.
            */}
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

/**
 * One-off things, kept off the board.
 *
 * The ask: *"maybe we need contracts or something to track little
 * one-off things that come up."* The board is for what you chose and are
 * working through; a parcel to return does not belong there wearing the
 * same clothes. Same crowding argument that moved house work to Base.
 *
 * **A view, not a record type.** A contract is a `Project` with one
 * step, so it reuses the board's own card, the same 20 points for
 * closing the step, and every rule about blockers and homes. Nothing new
 * had to be stored to give the shape a name.
 *
 * **Adding one writes the step with it**, because a contract with no
 * steps would pay nothing — XP comes from closing an action, and nothing
 * pays for a project existing. The section would have filled with things
 * that earn nothing, which teaches you not to use it.
 */
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
    <Section title="Contracts" description="Small one-off things, off the board and out of the way">
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
    </Section>
  )
}

export function ProjectsPage() {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<QuestKind>('side')
  const projects = useProjects()
  const active = useActiveQuests()
  /*
   * The first arc with something outstanding. Several arcs are possible
   * and one that is finished has nothing to say about what you are
   * working on now.
   */
  const arcs = useCampaigns()
  const leadingArc = (arcs.data ?? []).find((one) => one.next !== undefined)

  const recommendation = useRecommendation()
  const add = useAddProject()
  const setActive = useSetActiveQuest()

  /*
   * Through the injected clock, and read once per render rather than per
   * card. A lint rule forbids reading the system clock here at all, which
   * is the right rule: two cards scoring against two different instants is
   * harmless today and is exactly the sort of thing that stops being
   * harmless at midnight.
   */
  const today = useServices().clock.now()

  // The recommendation carries ids rather than the record, so the button
  // below needs the quest itself to know which kind it would activate.
  const suggested = (projects.data ?? []).find(
    (project) => project.id === recommendation.data?.projectId,
  )

  /*
   * One-offs come off the board and into their own section. They are
   * still quests and still pay the same 20 for the step; what changes is
   * that a parcel to return no longer sits among the things you chose to
   * work through, which is the same crowding argument that moved house
   * work to Base.
   */
  const outstanding = (projects.data ?? []).filter((project) => project.status !== 'completed')
  const oneOffs = byOutstanding(contracts(outstanding))
  const open = board(outstanding)
  const done = (projects.data ?? []).filter((project) => project.status === 'completed')

  return (
    <>
      <PageHeader
        title="Quests"
        subtitle="What you are trying to get done, and what is blocking what."
      />

      {/*
        The arc leads, because it is what "main quest" means at full
        size -- the active quests below it are this week's version of the
        same question. It is a readout rather than a board: nothing on it
        is a thing to do, and everything on it is met by work recorded
        somewhere else.
      */}
      <Campaigns />

      <Section title="Active" description="One main quest, one side quest.">
        <ActiveQuests
          main={active.data?.main}
          side={active.data?.side}
          {...(leadingArc === undefined ? {} : { arc: leadingArc })}
        />
      </Section>

      {/*
        The recommendation stopped being the top of this page and became a
        suggestion under it.

        The engine is unchanged — priority, the blocker graph, the deadline
        ramp — but what it is *for* moved. It could always tell you which
        quest scored highest; what it could never know is which one you
        mean to be working on. So it proposes something to activate, and
        you ignore it or you do not.
      */}
      <Section
        title="Suggested"
        description="What the scoring would pick, if you want a second opinion."
      >
        {recommendation.data !== undefined && (
          <>
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
          </>
        )}
      </Section>

      <Contracts projects={oneOffs} today={today} all={projects.data ?? []} />

      <Section
        title="The board"
        description={
          projects.data === undefined
            ? undefined
            : `${open.length.toString()} open · ${done.length.toString()} finished`
        }
      >
        {/*
          **Two rows, because three controls do not fit on one.**
          Reported as *"I don't seem to be able to add new side quests at
          the bottom of the quests page"* — and the form did work, which
          is what makes this worth writing down rather than calling a
          styling nit. On a 375-pixel phone the name field, the Side/Main
          pair and the Add button shared a flex row and the field was
          squeezed to **177px**, clipping its own placeholder mid-word to
          "Something you are tr…". A control that cannot finish saying
          what it is for reads as disabled, and the loud Add button
          beside it reads as the whole form.

          The Contracts section directly above gets this right by
          accident — one field, one plus, full width — which is why that
          one looks like somewhere to type and this one did not.
        */}
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
            {/*
              Side is the default, and this toggle is how something becomes a
              main quest. Deliberately two buttons rather than a select: it is
              a binary, and a two-option dropdown is a tap and a decision
              where a tap would do.
            */}
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
      </Section>

      {done.length > 0 && (
        <Section title="Finished">
          <div className="space-y-2">
            {done.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                others={(projects.data ?? []).filter((one) => one.id !== project.id)}
                today={today}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  )
}
