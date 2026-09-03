import { Library, Plus, Target, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useState } from 'react'

import { Badge, Button, Card, CardHeading, Empty } from '@/components/shared/primitives'
import { EyeIcon } from '@/components/shared/EyeIcon'
import { getCategoryDefinition } from '@/domain/backlog/category-registry'
import type { CreateItemInput, Item } from '@/domain/backlog/item'
import { PRIORITY_LABELS } from '@/domain/backlog/priority'
import { SORT_KEY_LABELS, SORT_KEYS, type SortKey } from '@/domain/backlog/sort-key'
import { STATUS_LABELS, STATUSES, type Status } from '@/domain/backlog/status'
import type { BacklogItemId } from '@/domain/ids/ids'

import { CATEGORY_ICONS } from './category-icons'
import { GoalsToday } from './GoalsToday'
import {
  useAddItem,
  useBacklogItems,
  useBacklogOverview,
  useBacklogSettings,
  useDailyGoals,
  useDeleteItem,
  useUpdateItem,
} from './hooks'
import { ItemForm } from './ItemForm'

/**
 * The backlog, on one screen.
 *
 * Backlogs had four pages — a dashboard, a list, a goals page and its own
 * settings. Three of them are one screen here, because the reason to
 * absorb the app at all was to stop context-switching, and a hub whose
 * backlog is itself four tabs has moved the problem rather than solved it.
 * What is due today sits at the top, because that is the only part of a
 * backlog with anything to say on a Tuesday.
 *
 * Its settings went to the hub's settings page, where the app's settings
 * already live.
 */

const CONTROL = 'bg-ink-850 border-ink-800 text-ink-100 h-11 rounded-xl border px-3 text-sm min-w-0'

function priorityTone(priority: Item['priority']) {
  if (priority === 'high') return 'bad' as const
  if (priority === 'medium') return 'warn' as const
  return 'neutral' as const
}

function ItemRow({
  item,
  onEdit,
  onDelete,
  confirming,
}: {
  readonly item: Item
  readonly onEdit: () => void
  readonly onDelete: () => void
  readonly confirming: boolean
}) {
  const Icon = CATEGORY_ICONS[item.category]

  return (
    <div className="flex items-center gap-3 py-3">
      <Icon size={18} className="text-ink-500 shrink-0" aria-hidden />

      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
        aria-label={`Edit ${item.title}`}
      >
        <p className="text-ink-50 truncate font-medium">{item.title}</p>
        <p className="text-ink-500 mt-0.5 truncate text-sm">
          {getCategoryDefinition(item.category).label} · {STATUS_LABELS[item.status]}
          {item.platform !== undefined && ` · ${item.platform}`}
        </p>
      </button>

      <Badge tone={priorityTone(item.priority)}>{PRIORITY_LABELS[item.priority]}</Badge>

      <Button
        variant={confirming ? 'danger' : 'ghost'}
        size="sm"
        aria-label={confirming ? `Confirm deleting ${item.title}` : `Delete ${item.title}`}
        onClick={onDelete}
      >
        {confirming ? 'Sure?' : <Trash2 size={16} aria-hidden />}
      </Button>
    </div>
  )
}

export function BacklogPage() {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Item | undefined>(undefined)

  /*
   * Which row is asking to be confirmed, if any. Held here rather than per
   * row so opening one confirmation closes any other — two rows both
   * showing a red button at once, in a list where every row looks alike,
   * is how the wrong thing gets deleted.
   */
  const [confirming, setConfirming] = useState<BacklogItemId | undefined>(undefined)

  const [status, setStatus] = useState<Status | 'all'>('all')
  /* What the eye on Entries reveals — see the note beside it. */
  const [showingDone, setShowingDone] = useState(false)
  const { settings } = useBacklogSettings()
  const [sortKey, setSortKey] = useState<SortKey | undefined>(undefined)
  const [search, setSearch] = useState('')

  const overview = useBacklogOverview()
  const goals = useDailyGoals()
  const items = useBacklogItems({
    sortKey: sortKey ?? settings.defaultSort,
    filters: {
      ...(status === 'all' ? {} : { status }),
      ...(search.trim() === '' ? {} : { searchQuery: search }),
    },
  })

  const add = useAddItem()
  const update = useUpdateItem()
  const remove = useDeleteItem()

  const submit = (input: CreateItemInput) => {
    if (editing === undefined) {
      add.mutate(input, {
        onSuccess: () => {
          setAdding(false)
        },
      })
      return
    }

    const target = editing
    update.mutate(
      {
        id: target.id,
        changes: {
          title: input.title,
          category: input.category,
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.priority === undefined ? {} : { priority: input.priority }),
          ...(input.platform === undefined ? {} : { platform: input.platform }),
          // `null` clears the goal. An absent goal in the form means the
          // field was emptied, which is a request to remove it — not a
          // request to leave whatever was there.
          dailyGoal: input.dailyGoal ?? null,
        },
      },
      {
        onSuccess: () => {
          setEditing(undefined)
        },
      },
    )
  }

  /*
   * **Finished and dropped entries fold away, the way done chores and
   * finished quests do.** The list defaulted to every status, so a Codex
   * with two hundred finished games opened on two hundred rows you were
   * not working through — and the thing you came for was somewhere below
   * them.
   *
   * **Only while the status filter says "all".** Picking *Completed* from
   * the dropdown is an explicit request for exactly those, and hiding
   * them behind an eye at that point would be the screen arguing with its
   * own control. The fold is the default view's opinion, not a rule about
   * the data.
   */
  const all = items.data ?? []
  const isDone = (item: Item): boolean => item.status === 'completed' || item.status === 'dropped'
  const filtering = status !== 'all'
  const shown = filtering ? all : all.filter((item) => !isDone(item))
  const restingItems = filtering ? [] : all.filter(isDone)

  const formError = (editing === undefined ? add.error : update.error)?.message

  return (
    <div className="space-y-4">
      <PageHeader title="Codex" subtitle="Games, books, shows and films you are working through." />

      <div>
        <CardHeading icon={<Target size={16} aria-hidden />} title="Today" />
        {goals.data !== undefined && goals.data.totalCount > 0 && (
          <p className="text-ink-500 mb-2 text-sm">
            {goals.data.metCount.toString()} of {goals.data.totalCount.toString()} met
          </p>
        )}
        <GoalsToday statuses={goals.data?.statuses ?? []} />
      </div>

      <div>
        <CardHeading
          icon={<Library size={16} aria-hidden />}
          title="Entries"
          action={
            <>
              {restingItems.length > 0 && (
                <Button
                  size="sm"
                  variant={showingDone ? 'primary' : 'ghost'}
                  aria-pressed={showingDone}
                  aria-label={`${showingDone ? 'Hide' : 'Show'} ${String(restingItems.length)} finished and dropped`}
                  onClick={() => {
                    setShowingDone(!showingDone)
                  }}
                >
                  <EyeIcon open={showingDone} />
                </Button>
              )}
              {adding || editing !== undefined ? undefined : (
                <Button
                  size="sm"
                  onClick={() => {
                    setAdding(true)
                  }}
                >
                  <Plus size={16} aria-hidden /> Add
                </Button>
              )}
            </>
          }
        />

        {overview.data !== undefined && (
          <p className="text-ink-500 mb-2 text-sm">
            {overview.data.stats.totalBacklog.toString()} waiting ·{' '}
            {overview.data.stats.completionPercentage.toString()}% finished
          </p>
        )}
        {(adding || editing !== undefined) && (
          <div className="mb-4">
            <ItemForm
              {...(editing === undefined ? {} : { existing: editing })}
              pending={add.isPending || update.isPending}
              error={formError}
              onCancel={() => {
                setAdding(false)
                setEditing(undefined)
              }}
              onSubmit={submit}
            />
          </div>
        )}

        {/*
          **The search box gets its own row, and this is the second time
          this exact bug has shipped.**

          It shared a flex row with two selects whose intrinsic width
          comes from their longest option — "Currently Using" and
          "Recently Added" — so `flex-1` on the field got whatever was
          left. Measured at 375: **26 pixels.** Not clipped, not cramped;
          a box too narrow to hold one character of what you typed.

          The quest add form failed the same way and is written up in
          `CLAUDE.md` as "three controls do not fit on one row at 375". A
          rule that only reaches the screen it was found on is a rule that
          gets rediscovered by measuring, which is what happened here.
        */}
        <div className="mb-2">
          <input
            className={`${CONTROL} w-full`}
            value={search}
            aria-label="Search the backlog"
            placeholder="Search"
            onChange={(event) => {
              setSearch(event.target.value)
            }}
          />
        </div>

        <div className="mb-3 flex gap-2">
          <select
            className={`${CONTROL} min-w-0 flex-1`}
            value={status}
            aria-label="Filter by status"
            onChange={(event) => {
              setStatus(event.target.value as Status | 'all')
            }}
          >
            <option value="all">All</option>
            {STATUSES.map((one) => (
              <option key={one} value={one}>
                {STATUS_LABELS[one]}
              </option>
            ))}
          </select>
          <select
            className={`${CONTROL} min-w-0 flex-1`}
            value={sortKey ?? settings.defaultSort}
            aria-label="Sort by"
            onChange={(event) => {
              setSortKey(event.target.value as SortKey)
            }}
          >
            {SORT_KEYS.map((one) => (
              <option key={one} value={one}>
                {SORT_KEY_LABELS[one]}
              </option>
            ))}
          </select>
        </div>

        {shown.length === 0 ? (
          <Empty title="Nothing here">
            {search.trim() === '' && status === 'all'
              ? all.length === 0
                ? 'Add the first thing you are meaning to get to.'
                : 'Nothing on the go. What is finished is behind the eye above.'
              : 'Nothing matches that filter.'}
          </Empty>
        ) : (
          <Card className="divide-ink-800 divide-y py-0">
            {shown.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                confirming={confirming === item.id}
                onEdit={() => {
                  setAdding(false)
                  setEditing(item)
                }}
                onDelete={() => {
                  if (confirming === item.id) {
                    remove.mutate(item.id)
                    setConfirming(undefined)
                  } else {
                    setConfirming(item.id)
                  }
                }}
              />
            ))}
          </Card>
        )}

        {showingDone && restingItems.length > 0 && (
          <Card className="divide-ink-800 divide-y mt-2 py-0">
            {restingItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                confirming={confirming === item.id}
                onEdit={() => {
                  setAdding(false)
                  setEditing(item)
                }}
                onDelete={() => {
                  if (confirming === item.id) {
                    remove.mutate(item.id)
                    setConfirming(undefined)
                  } else {
                    setConfirming(item.id)
                  }
                }}
              />
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
