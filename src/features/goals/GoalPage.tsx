import { Check, Link2, Pencil, Plus, Trash2, Undo2, Unlink, X } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { Meter } from '@/components/shared/Meter'
import {
  GOAL_ITEM_KIND_HINTS,
  GOAL_ITEM_KIND_LABELS,
  GOAL_ITEM_KINDS,
  type GoalItem,
  type GoalItemKind,
  type GoalItemStanding,
  type ItemStanding,
  type Workstream,
} from '@/domain/goals/goal'
import type { GoalId } from '@/domain/ids/ids'

import {
  useAddItem,
  useAnswerQuestion,
  useCompleteItem,
  useConfirmHypothesis,
  useDecideItem,
  useGoal,
  useLinkableProjects,
  useLinkItem,
  useRefuteHypothesis,
  useRemoveGoal,
  useRemoveItem,
  useRenameGoal,
  useRenameItem,
  useRenameWorkstream,
  useReopenItem,
  useSetDependencies,
  useUnlinkItem,
} from './hooks'

/**
 * One complex goal — its workstreams, and what each item is waiting on.
 *
 * **Nothing here is gated**, the stance `Campaign` already takes on its
 * stages: a blocked item still carries a control to resolve it, because
 * a screen that refused would be deciding your life for you rather than
 * reporting on it. Blocked only changes what the row *says*, never what
 * it lets you do.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm'

const STANDING_TONE: Record<ItemStanding, 'good' | 'accent' | 'neutral'> = {
  resolved: 'good',
  available: 'accent',
  blocked: 'neutral',
}

const STANDING_LABEL: Record<ItemStanding, string> = {
  resolved: 'Settled',
  available: 'Open',
  blocked: 'Blocked',
}

/** What a resolved item reads as, in one line. Absent means still open. */
function resolution(item: GoalItem): string | undefined {
  if (item.decidedAt !== undefined) return `Decided: ${item.decidedAs ?? ''}`
  if (item.confirmedAt !== undefined) return 'Confirmed'
  if (item.refutedAt !== undefined) return 'Ruled out'
  if (item.answeredAt !== undefined) return `Answered: ${item.answeredAs ?? ''}`
  if (item.completedAt !== undefined) return 'Done'
  return undefined
}

/**
 * Every quest, offered as chips to link an action or milestone to — the
 * same shape `DependencyEditor` already uses for picking among items.
 * Folded away by default: this is a control reached for occasionally,
 * not a form that belongs open on a row pressed daily.
 */
function LinkPicker({ goalId, item }: { readonly goalId: GoalId; readonly item: GoalItem }) {
  const projects = useLinkableProjects()
  const link = useLinkItem()
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setOpen(true)
        }}
      >
        <Link2 size={14} aria-hidden />
        Link to a quest
      </Button>
    )
  }

  const available = projects.data ?? []

  return (
    <div>
      {available.length === 0 ? (
        <p className="text-ink-700 text-xs">No quests yet — add one on the Quests page first.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {available.map((project) => (
            <Button
              key={project.id}
              size="sm"
              variant="ghost"
              disabled={link.isPending}
              onClick={() => {
                link.mutate(
                  { id: goalId, itemId: item.id, projectId: project.id },
                  {
                    onSuccess: () => {
                      setOpen(false)
                    },
                  },
                )
              }}
            >
              {project.name}
              {project.status === 'completed' && (
                <Check size={12} className="text-good-500" aria-hidden />
              )}
            </Button>
          ))}
        </div>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="mt-1.5"
        onClick={() => {
          setOpen(false)
        }}
      >
        <X size={14} aria-hidden />
        Cancel
      </Button>
    </div>
  )
}

function ResolveControl({
  goalId,
  entry,
}: {
  readonly goalId: GoalId
  readonly entry: GoalItemStanding
}) {
  const { item, linkedProject } = entry
  const decide = useDecideItem()
  const confirmHypothesis = useConfirmHypothesis()
  const refuteHypothesis = useRefuteHypothesis()
  const answer = useAnswerQuestion()
  const complete = useCompleteItem()
  const reopen = useReopenItem()
  const unlink = useUnlinkItem()
  const [typing, setTyping] = useState('')

  const settled = resolution(item)

  if (item.kind === 'fact') {
    return <p className="text-ink-700 text-xs">A given — recorded, not resolved.</p>
  }

  /*
   * Linked items are resolved by their quest, not by a second tick here
   * — the whole point of linking. There is deliberately no manual
   * "complete" affordance while linked; unlinking is the way back to one.
   */
  if (linkedProject !== undefined) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-ink-300 text-sm">
          {linkedProject.completed ? 'Done' : 'Open'} on the quest log · {linkedProject.name}
        </p>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Unlink ${item.title} from ${linkedProject.name}`}
          disabled={unlink.isPending}
          onClick={() => {
            unlink.mutate({ id: goalId, itemId: item.id })
          }}
        >
          <Unlink size={14} aria-hidden />
        </Button>
      </div>
    )
  }

  if (settled !== undefined) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-ink-300 text-sm">{settled}</p>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Reopen ${item.title}`}
          disabled={reopen.isPending}
          onClick={() => {
            reopen.mutate({ id: goalId, itemId: item.id })
          }}
        >
          <Undo2 size={14} aria-hidden />
        </Button>
      </div>
    )
  }

  if (item.kind === 'hypothesis') {
    return (
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={confirmHypothesis.isPending}
          onClick={() => {
            confirmHypothesis.mutate({ id: goalId, itemId: item.id })
          }}
        >
          Confirm
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={refuteHypothesis.isPending}
          onClick={() => {
            refuteHypothesis.mutate({ id: goalId, itemId: item.id })
          }}
        >
          Rule out
        </Button>
      </div>
    )
  }

  if (item.kind === 'decision' || item.kind === 'question') {
    const submit = item.kind === 'decision' ? decide : answer
    const placeholder = item.kind === 'decision' ? 'What was decided' : 'What you found out'
    const label = item.kind === 'decision' ? 'Decide' : 'Answer'

    return (
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (typing.trim() === '') return

          if (item.kind === 'decision') {
            decide.mutate(
              { id: goalId, itemId: item.id, decidedAs: typing },
              {
                onSuccess: () => {
                  setTyping('')
                },
              },
            )
          } else {
            answer.mutate(
              { id: goalId, itemId: item.id, answeredAs: typing },
              {
                onSuccess: () => {
                  setTyping('')
                },
              },
            )
          }
        }}
      >
        <input
          className={FIELD}
          aria-label={`${label} for ${item.title}`}
          placeholder={placeholder}
          value={typing}
          onChange={(event) => {
            setTyping(event.target.value)
          }}
        />
        <Button type="submit" size="sm" variant="primary" disabled={submit.isPending}>
          {label}
        </Button>
      </form>
    )
  }

  // action or milestone
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Close ${item.title}`}
        aria-pressed={false}
        className="tap-target grid size-9 shrink-0 place-items-center rounded-lg border border-ink-700 text-ink-700 transition-colors hover:border-ink-500"
        onClick={() => {
          complete.mutate({ id: goalId, itemId: item.id })
        }}
      >
        <Check size={16} aria-hidden />
      </button>
      <LinkPicker goalId={goalId} item={item} />
    </div>
  )
}

function DependencyEditor({
  goalId,
  item,
  others,
}: {
  readonly goalId: GoalId
  readonly item: GoalItem
  readonly others: readonly GoalItemStanding[]
}) {
  const set = useSetDependencies()
  const error = set.data?.error

  if (others.length === 0) return null

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1.5">
        {others.map(({ item: other, standing }) => {
          const on = item.dependsOn.includes(other.id)

          return (
            <Button
              key={other.id}
              variant={on ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={on}
              onClick={() => {
                set.mutate({
                  id: goalId,
                  itemId: item.id,
                  dependsOn: on
                    ? item.dependsOn.filter((id) => id !== other.id)
                    : [...item.dependsOn, other.id],
                })
              }}
            >
              {other.title}
              {standing === 'resolved' && <Check size={12} className="text-good-500" aria-hidden />}
            </Button>
          )
        })}
      </div>
      {error !== undefined && (
        <p role="alert" className="text-bad-500 mt-1.5 text-xs">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * An item's title, workstream and notes — the same three fields as a
 * campaign's stage editor covers, and for the same reason: labels, none
 * of them touching what the item means or what it depends on.
 */
function ItemEditor({
  goalId,
  item,
  onDone,
}: {
  readonly goalId: GoalId
  readonly item: GoalItem
  readonly onDone: () => void
}) {
  const rename = useRenameItem()
  const [title, setTitle] = useState(item.title)
  const [workstream, setWorkstream] = useState(item.workstream)
  const [notes, setNotes] = useState(item.notes ?? '')

  return (
    <form
      className="mt-2 space-y-2 rounded-lg border border-dashed border-ink-700 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (title.trim() === '' || workstream.trim() === '') return
        rename.mutate(
          { id: goalId, itemId: item.id, title, workstream, notes },
          { onSuccess: onDone },
        )
      }}
    >
      <label className="block">
        <span className="text-ink-500 mb-1 block text-xs tracking-wide uppercase">Title</span>
        <input
          className={FIELD}
          value={title}
          autoFocus
          onChange={(event) => {
            setTitle(event.target.value)
          }}
        />
      </label>
      <label className="block">
        <span className="text-ink-500 mb-1 block text-xs tracking-wide uppercase">Workstream</span>
        <input
          className={FIELD}
          value={workstream}
          onChange={(event) => {
            setWorkstream(event.target.value)
          }}
        />
      </label>
      <label className="block">
        <span className="text-ink-500 mb-1 block text-xs tracking-wide uppercase">Notes</span>
        <input
          className={FIELD}
          value={notes}
          placeholder="Optional"
          onChange={(event) => {
            setNotes(event.target.value)
          }}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={rename.isPending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function ItemRow({
  goalId,
  entry,
  others,
}: {
  readonly goalId: GoalId
  readonly entry: GoalItemStanding
  readonly others: readonly GoalItemStanding[]
}) {
  const remove = useRemoveItem()
  const [editing, setEditing] = useState(false)
  const [editingDeps, setEditingDeps] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const { item, standing, waitingOn } = entry

  return (
    <li className="border-ink-800 border-b py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="sub">{GOAL_ITEM_KIND_LABELS[item.kind]}</Badge>
            <Badge tone={STANDING_TONE[standing]}>{STANDING_LABEL[standing]}</Badge>
          </div>
          {editing ? (
            <ItemEditor
              goalId={goalId}
              item={item}
              onDone={() => {
                setEditing(false)
              }}
            />
          ) : (
            <>
              <button
                type="button"
                className="mt-1 flex min-w-0 items-center gap-1.5 text-left"
                aria-label={`Edit ${item.title}`}
                onClick={() => {
                  setEditing(true)
                }}
              >
                <span className="text-ink-50 text-sm font-medium">{item.title}</span>
                <Pencil size={11} className="text-ink-700 shrink-0" aria-hidden />
              </button>
              {item.notes !== undefined && item.notes.trim() !== '' && (
                <p className="text-ink-500 mt-0.5 text-xs">{item.notes}</p>
              )}
            </>
          )}
          {waitingOn.length > 0 && (
            <p className="text-ink-700 mt-1 text-xs">
              Waiting on: {waitingOn.map((one) => one.title).join(', ')}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label={editingDeps ? 'Stop editing dependencies' : `What ${item.title} depends on`}
            aria-pressed={editingDeps}
            onClick={() => {
              setEditingDeps(!editingDeps)
            }}
          >
            <Link2 size={14} aria-hidden />
          </Button>
          <Button
            size="sm"
            variant={confirming ? 'danger' : 'ghost'}
            aria-label={confirming ? `Confirm removing ${item.title}` : `Remove ${item.title}`}
            onClick={() => {
              if (confirming) {
                remove.mutate({ id: goalId, itemId: item.id })
              } else {
                setConfirming(true)
              }
            }}
          >
            {confirming ? 'Sure?' : <Trash2 size={14} aria-hidden />}
          </Button>
        </div>
      </div>

      <div className="mt-2">
        <ResolveControl goalId={goalId} entry={entry} />
      </div>

      {editingDeps && (
        <div className="mt-2">
          <p className="text-ink-500 mb-1 text-xs tracking-wide uppercase">Depends on</p>
          <DependencyEditor goalId={goalId} item={item} others={others} />
        </div>
      )}
    </li>
  )
}

/**
 * A workstream's name, renamed everywhere at once.
 *
 * A workstream is free text on each item rather than a record of its
 * own, so there is nothing to open an editor _on_ except the string
 * itself — this folds open in place of the item list rather than
 * replacing the heading, the same "offered inline, not in place" shape
 * `ItemEditor` already uses for a single item.
 */
function WorkstreamRenamer({
  goalId,
  from,
  onDone,
}: {
  readonly goalId: GoalId
  readonly from: string
  readonly onDone: () => void
}) {
  const rename = useRenameWorkstream()
  const [name, setName] = useState(from)

  return (
    <form
      className="mb-3 flex gap-2 rounded-lg border border-dashed border-ink-700 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim() === '') return
        rename.mutate({ id: goalId, from, to: name }, { onSuccess: onDone })
      }}
    >
      <input
        className={FIELD}
        aria-label={`Rename ${from}`}
        value={name}
        autoFocus
        onChange={(event) => {
          setName(event.target.value)
        }}
      />
      <Button type="submit" size="sm" variant="primary" disabled={rename.isPending}>
        Save
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onDone}
        aria-label={`Cancel renaming ${from}`}
      >
        <X size={14} aria-hidden />
      </Button>
    </form>
  )
}

function WorkstreamSection({
  goalId,
  stream,
  allItems,
}: {
  readonly goalId: GoalId
  readonly stream: Workstream
  readonly allItems: readonly GoalItemStanding[]
}) {
  const [renaming, setRenaming] = useState(false)

  return (
    <Section
      title={stream.name}
      action={
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={renaming}
          aria-label={renaming ? `Stop renaming ${stream.name}` : `Rename ${stream.name}`}
          onClick={() => {
            setRenaming(!renaming)
          }}
        >
          <Pencil size={14} aria-hidden />
        </Button>
      }
    >
      {renaming && (
        <WorkstreamRenamer
          goalId={goalId}
          from={stream.name}
          onDone={() => {
            setRenaming(false)
          }}
        />
      )}
      <Card>
        <ul>
          {stream.items.map((entry) => (
            <ItemRow
              key={entry.item.id}
              goalId={goalId}
              entry={entry}
              others={allItems.filter((one) => one.item.id !== entry.item.id)}
            />
          ))}
        </ul>
      </Card>
    </Section>
  )
}

/**
 * Adding an item. One form for every workstream on the page: the
 * workstream is a text field with the existing names offered as chips,
 * the same "offered, never applied" stance the daily group suggestions
 * take — picking one fills the field rather than submitting on its own.
 */
function AddItem({
  goalId,
  workstreams,
}: {
  readonly goalId: GoalId
  readonly workstreams: readonly string[]
}) {
  const add = useAddItem()
  const [open, setOpen] = useState(false)
  const [workstream, setWorkstream] = useState('')
  const [kind, setKind] = useState<GoalItemKind>('action')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        full
        className="mt-3"
        onClick={() => {
          setOpen(true)
        }}
      >
        <Plus size={14} aria-hidden />
        Add something
      </Button>
    )
  }

  return (
    <form
      className="mt-3 space-y-2 rounded-lg border border-dashed border-ink-700 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (title.trim() === '' || workstream.trim() === '') return

        add.mutate(
          { id: goalId, item: { workstream, kind, title, notes } },
          {
            onSuccess: () => {
              setTitle('')
              setNotes('')
            },
          },
        )
      }}
    >
      <label className="block">
        <span className="text-ink-500 mb-1 block text-xs tracking-wide uppercase">Workstream</span>
        <input
          className={FIELD}
          placeholder="Destination, Finances, Current house…"
          value={workstream}
          onChange={(event) => {
            setWorkstream(event.target.value)
          }}
        />
        {workstreams.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {workstreams.map((name) => (
              <Button
                key={name}
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setWorkstream(name)
                }}
              >
                {name}
              </Button>
            ))}
          </div>
        )}
      </label>

      <label className="block">
        <span className="text-ink-500 mb-1 block text-xs tracking-wide uppercase">Kind</span>
        <div className="grid grid-cols-3 gap-1.5">
          {GOAL_ITEM_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              title={GOAL_ITEM_KIND_HINTS[option]}
              aria-pressed={kind === option}
              className={[
                'tap-target rounded-lg border px-2 text-xs font-medium',
                kind === option
                  ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                  : 'border-ink-800 text-ink-500',
              ].join(' ')}
              onClick={() => {
                setKind(option)
              }}
            >
              {GOAL_ITEM_KIND_LABELS[option]}
            </button>
          ))}
        </div>
        <p className="text-ink-700 mt-1 text-xs">{GOAL_ITEM_KIND_HINTS[kind]}</p>
      </label>

      <label className="block">
        <span className="text-ink-500 mb-1 block text-xs tracking-wide uppercase">
          Notes · optional
        </span>
        <input
          className={FIELD}
          value={notes}
          placeholder="Anything worth remembering about it"
          onChange={(event) => {
            setNotes(event.target.value)
          }}
        />
      </label>

      <div className="flex gap-2">
        <input
          className={FIELD}
          aria-label="Title"
          placeholder="What it is"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
          }}
        />
        <Button type="submit" size="sm" variant="primary" disabled={add.isPending}>
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false)
          }}
        >
          <X size={14} aria-hidden />
        </Button>
      </div>
    </form>
  )
}

function GoalEditor({
  id,
  name,
  aim,
  onDone,
}: {
  readonly id: GoalId
  readonly name: string
  readonly aim: string
  readonly onDone: () => void
}) {
  const rename = useRenameGoal()
  const [nextName, setNextName] = useState(name)
  const [nextAim, setNextAim] = useState(aim)

  return (
    <form
      className="mb-3 space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (nextName.trim() === '') return
        rename.mutate({ id, name: nextName, aim: nextAim }, { onSuccess: onDone })
      }}
    >
      <label className="block">
        <span className="text-ink-500 mb-1 block text-xs tracking-wide uppercase">
          What it is called
        </span>
        <input
          className={FIELD}
          value={nextName}
          autoFocus
          onChange={(event) => {
            setNextName(event.target.value)
          }}
        />
      </label>
      <label className="block">
        <span className="text-ink-500 mb-1 block text-xs tracking-wide uppercase">
          Where it ends
        </span>
        <input
          className={FIELD}
          value={nextAim}
          onChange={(event) => {
            setNextAim(event.target.value)
          }}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={rename.isPending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function GoalPage() {
  const params = useParams<{ id: string }>()
  const id = params.id === undefined ? undefined : (params.id as GoalId)
  const goal = useGoal(id)
  const removeGoal = useRemoveGoal()
  const [editing, setEditing] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  if (goal.data === undefined) return null
  if (goal.data === null) {
    return (
      <Card>
        <Empty title="Goal not found">This one may have been removed.</Empty>
      </Card>
    )
  }

  const { goal: record, items, workstreams, resolved, total } = goal.data
  const linkedCount = items.filter((one) => one.item.linkedProjectId !== undefined).length

  return (
    <div className="space-y-4">
      {editing ? (
        <GoalEditor
          id={record.id}
          name={record.name}
          aim={record.aim ?? ''}
          onDone={() => {
            setEditing(false)
          }}
        />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">{record.name}</h1>
            {record.aim !== undefined && record.aim.trim() !== '' && (
              <p className="text-ink-500 mt-0.5 text-sm">{record.aim}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Edit ${record.name}`}
              onClick={() => {
                setEditing(true)
              }}
            >
              <Pencil size={14} aria-hidden />
            </Button>
            <Button
              size="sm"
              variant={confirmingRemove ? 'danger' : 'ghost'}
              aria-label={
                confirmingRemove ? `Confirm removing ${record.name}` : `Remove ${record.name}`
              }
              onClick={() => {
                if (confirmingRemove) {
                  removeGoal.mutate(record.id)
                } else {
                  setConfirmingRemove(true)
                }
              }}
            >
              {confirmingRemove ? 'Sure?' : <Trash2 size={14} aria-hidden />}
            </Button>
          </div>
        </div>
      )}

      {/*
        Only when there is something to lose -- the rule `Campaigns` stage
        drop already follows. A goal with no linked items has nothing this
        confirm needs to say beyond the button's own "Sure?".
      */}
      {confirmingRemove && linkedCount > 0 && (
        <p className="text-ink-500 -mt-2 text-xs">
          {linkedCount} item{linkedCount === 1 ? '' : 's'} linked to a quest will lose that link.
          The quest itself is untouched.
        </p>
      )}

      {/*
        Silent on an empty goal -- "0 of 0 settled" over an empty-state
        card saying the same thing a second time is the shape this file
        already refuses everywhere else it appears.
      */}
      {total > 0 && (
        <Card>
          <p className="text-ink-500 text-xs">
            {resolved} of {total} settled
          </p>
          <Meter
            className="mt-1.5"
            value={resolved}
            of={total}
            height={6}
            label={`${record.name}, ${String(resolved)} of ${String(total)} settled`}
          />
        </Card>
      )}

      {workstreams.length === 0 ? (
        <Card>
          <Empty title="Nothing here yet">
            Add the facts you already know, the questions still open, and the decisions ahead — they
            can depend on each other once they exist.
          </Empty>
          <AddItem goalId={record.id} workstreams={[]} />
        </Card>
      ) : (
        workstreams.map((stream) => (
          <WorkstreamSection
            key={stream.name}
            goalId={record.id}
            stream={stream}
            allItems={items}
          />
        ))
      )}

      {workstreams.length > 0 && (
        <AddItem goalId={record.id} workstreams={workstreams.map((one) => one.name)} />
      )}
    </div>
  )
}
