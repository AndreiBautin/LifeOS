import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
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

  const formError = (editing === undefined ? add.error : update.error)?.message

  return (
    <>
      <Section
        title="Today"
        description={
          goals.data === undefined
            ? undefined
            : `${goals.data.metCount.toString()} of ${goals.data.totalCount.toString()} met`
        }
      >
        <GoalsToday statuses={goals.data?.statuses ?? []} />
      </Section>

      <Section
        title="Backlog"
        description={
          overview.data === undefined
            ? undefined
            : `${overview.data.stats.totalBacklog.toString()} waiting · ${overview.data.stats.completionPercentage.toString()}% finished`
        }
        action={
          adding || editing !== undefined ? undefined : (
            <Button
              size="sm"
              onClick={() => {
                setAdding(true)
              }}
            >
              <Plus size={16} aria-hidden /> Add
            </Button>
          )
        }
      >
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

        <div className="mb-3 flex gap-2">
          <input
            className={`${CONTROL} flex-1`}
            value={search}
            aria-label="Search the backlog"
            placeholder="Search"
            onChange={(event) => {
              setSearch(event.target.value)
            }}
          />
          <select
            className={CONTROL}
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
            className={CONTROL}
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

        {items.data?.length === 0 ? (
          <Empty title="Nothing here">
            {search.trim() === '' && status === 'all'
              ? 'Add the first thing you are meaning to get to.'
              : 'Nothing matches that filter.'}
          </Empty>
        ) : (
          <Card className="divide-ink-800 divide-y py-0">
            {(items.data ?? []).map((item) => (
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
      </Section>
    </>
  )
}
