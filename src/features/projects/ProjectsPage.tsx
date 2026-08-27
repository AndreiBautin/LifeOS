import { Check, ChevronDown, ChevronRight, Plus, Sparkles, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useServices } from '@/app/context'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'

import { computeProgress, computeScore } from '@/domain/projects/priority'
import { PROJECT_STATUS_LABELS, type Project } from '@/domain/projects/project'

import {
  useAddAction,
  useAddProject,
  useDeleteProject,
  useProjects,
  useRecommendation,
  useSetActionStatus,
  useSetBlockers,
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
  const [confirming, setConfirming] = useState(false)

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
          <p className="text-ink-50 truncate font-medium">{project.name}</p>
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

export function ProjectsPage() {
  const [name, setName] = useState('')
  const projects = useProjects()
  const recommendation = useRecommendation()
  const add = useAddProject()

  /*
   * Through the injected clock, and read once per render rather than per
   * card. A lint rule forbids reading the system clock here at all, which
   * is the right rule: two cards scoring against two different instants is
   * harmless today and is exactly the sort of thing that stops being
   * harmless at midnight.
   */
  const today = useServices().clock.now()

  const open = (projects.data ?? []).filter((project) => project.status !== 'completed')
  const done = (projects.data ?? []).filter((project) => project.status === 'completed')

  return (
    <>
      {/*
        The tech tree is reached from here rather than from the navigation.
        Six tabs is the limit on a phone, and this is the planning screen —
        "what should I do next" and "what am I saving up for" are the same
        question at two horizons.
      */}
      <Section
        title="Next"
        description="One thing, and why it is that one."
        action={
          <Link to="/upgrades" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
            <Sparkles size={16} aria-hidden />
            Upgrades
          </Link>
        }
      >
        {recommendation.data !== undefined && <NextAction recommendation={recommendation.data} />}
      </Section>

      <Section
        title="Projects"
        description={
          projects.data === undefined
            ? undefined
            : `${open.length.toString()} open · ${done.length.toString()} finished`
        }
      >
        <form
          className="mb-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim() === '') return

            add.mutate(
              { name },
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
            aria-label="New project name"
            placeholder="Something you are trying to get done"
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
          <Button type="submit" disabled={add.isPending}>
            <Plus size={16} aria-hidden /> Add
          </Button>
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
