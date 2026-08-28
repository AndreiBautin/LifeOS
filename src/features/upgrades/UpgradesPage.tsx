import { Check, Lock, Plus, Trash2, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useState } from 'react'

import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import type { Gate } from '@/domain/game/tree'
import type { UpgradeId } from '@/domain/ids/ids'
import type { TreeEntry } from '@/domain/upgrades/recommendation'
import {
  formatMinorUnits,
  toMinorUnits,
  UPGRADE_CATEGORIES,
  UPGRADE_CATEGORY_LABELS,
  UPGRADE_STATUS_LABELS,
  type UpgradeCategory,
} from '@/domain/upgrades/upgrade'

import {
  useAddUpgrade,
  useBudget,
  useDeleteUpgrade,
  useUpdateUpgrade,
  useUpgradeTree,
} from './hooks'

/**
 * The tech tree.
 *
 * Rendered as the tree it always was — the source's own result type
 * carried `UnlocksUpgradeId` and `UnlocksTitle`, which is skill-tree
 * vocabulary sitting in a purchase planner. What is available now, what it
 * leads to, what is locked and by what.
 *
 * What keeps it honest, where an invented tree would not be, is that both
 * gates are externally real: money you actually have, and a prerequisite
 * that physically holds. Nothing here is bought with points, and nothing
 * here pays them out — see docs/GAME_MODEL.md.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase'

function GateNote({ gates }: { readonly gates: readonly Gate[] }) {
  if (gates.length === 0) return null

  return (
    <ul className="text-ink-500 mt-2 space-y-0.5 text-xs">
      {gates.map((gate) => (
        <li key={gate.kind} className="flex items-center gap-1.5">
          {gate.kind === 'prerequisite' ? (
            <>
              <Lock size={12} aria-hidden />
              Needs {gate.title} first
            </>
          ) : (
            <>
              <Wallet size={12} aria-hidden />
              {formatMinorUnits(gate.shortfallMinorUnits)} short
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * What has to come first, changeable after the fact.
 *
 * Here rather than only on the add form, because the cycle guard is
 * otherwise unreachable: a brand-new node has no dependents and cannot
 * close a loop, so the only way to make one is to re-point an existing
 * node — and a rule nothing can reach is a rule nobody can trust.
 */
function PrerequisitePicker({
  entry,
  others,
}: {
  readonly entry: TreeEntry
  readonly others: readonly TreeEntry[]
}) {
  const update = useUpdateUpgrade()

  if (others.length === 0) return null

  return (
    <label className="mt-3 block">
      <span className={LABEL}>Needs first</span>
      <select
        className={FIELD}
        value={entry.upgrade.prerequisiteId ?? ''}
        onChange={(event) => {
          update.mutate({
            id: entry.upgrade.id,
            changes: {
              prerequisiteId: event.target.value === '' ? null : (event.target.value as UpgradeId),
            },
          })
        }}
      >
        <option value="">Nothing</option>
        {others.map((other) => (
          <option key={other.upgrade.id} value={other.upgrade.id}>
            {other.upgrade.title}
          </option>
        ))}
      </select>

      {update.data?.error !== undefined && (
        <p role="alert" className="text-bad-500 mt-2 text-sm">
          {update.data.error}
        </p>
      )}
    </label>
  )
}

function EntryCard({
  entry,
  others,
}: {
  readonly entry: TreeEntry
  readonly others: readonly TreeEntry[]
}) {
  const update = useUpdateUpgrade()
  const remove = useDeleteUpgrade()
  const [confirming, setConfirming] = useState(false)

  const { upgrade, recommendation, gates, affordable } = entry
  const owned = upgrade.status === 'purchased'
  const error = update.data?.error ?? remove.data?.error

  return (
    <Card className={affordable ? 'border-accent-500/30 py-3' : 'py-3'}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={owned ? 'text-ink-500 font-medium line-through' : 'text-ink-50 font-medium'}
          >
            {upgrade.title}
          </p>

          <p className="text-ink-500 numeric mt-0.5 text-xs">
            {UPGRADE_CATEGORY_LABELS[upgrade.category]} · priority{' '}
            {recommendation.effectivePriority.toString()}
            {recommendation.unlocksTitle !== undefined &&
              ` · unlocks ${recommendation.unlocksTitle}`}
            {upgrade.estimatedCostMinorUnits !== undefined &&
              ` · ${formatMinorUnits(upgrade.estimatedCostMinorUnits)}`}
          </p>

          <GateNote gates={gates} />
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {affordable ? (
            <Badge tone="accent">available</Badge>
          ) : (
            <Badge tone={owned ? 'good' : 'neutral'}>
              {UPGRADE_STATUS_LABELS[upgrade.status].toLowerCase()}
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {!owned && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              update.mutate({ id: upgrade.id, changes: { status: 'purchased' } })
            }}
          >
            <Check size={16} aria-hidden />
            Bought
          </Button>
        )}

        {owned && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              update.mutate({ id: upgrade.id, changes: { status: 'ready-to-buy' } })
            }}
          >
            Not yet
          </Button>
        )}

        <Button
          variant={confirming ? 'danger' : 'ghost'}
          size="sm"
          aria-label={confirming ? `Confirm deleting ${upgrade.title}` : `Delete ${upgrade.title}`}
          onClick={() => {
            if (confirming) {
              remove.mutate(upgrade.id)
              setConfirming(false)
            } else {
              setConfirming(true)
            }
          }}
        >
          {confirming ? 'Sure?' : <Trash2 size={16} aria-hidden />}
        </Button>
      </div>

      <PrerequisitePicker entry={entry} others={others} />

      {error !== undefined && (
        <p role="alert" className="text-bad-500 mt-2 text-sm">
          {error}
        </p>
      )}
    </Card>
  )
}

function AddUpgrade({ candidates }: { readonly candidates: readonly TreeEntry[] }) {
  const add = useAddUpgrade()

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<UpgradeCategory>('other')
  const [priority, setPriority] = useState('50')
  const [cost, setCost] = useState('')
  const [prerequisite, setPrerequisite] = useState('')

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim() === '') return

          const estimate = toMinorUnits(cost)

          add.mutate(
            {
              title,
              category,
              priority: Number(priority),
              ...(estimate === undefined ? {} : { estimatedCostMinorUnits: estimate }),
              ...(prerequisite === '' ? {} : { prerequisiteId: prerequisite as UpgradeId }),
            },
            {
              onSuccess: (result) => {
                if (result.error !== undefined) return
                setTitle('')
                setCost('')
                setPrerequisite('')
              },
            },
          )
        }}
      >
        <input
          className={FIELD}
          value={title}
          aria-label="What you want"
          placeholder="Something you are saving up for"
          onChange={(event) => {
            setTitle(event.target.value)
          }}
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={LABEL}>Category</span>
            <select
              className={FIELD}
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as UpgradeCategory)
              }}
            >
              {UPGRADE_CATEGORIES.map((one) => (
                <option key={one} value={one}>
                  {UPGRADE_CATEGORY_LABELS[one]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={LABEL}>Priority 1–100</span>
            <input
              className={FIELD}
              inputMode="numeric"
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value)
              }}
            />
          </label>

          <label className="block">
            <span className={LABEL}>Cost</span>
            <input
              className={FIELD}
              inputMode="decimal"
              value={cost}
              placeholder="0.00"
              onChange={(event) => {
                setCost(event.target.value)
              }}
            />
          </label>

          <label className="block">
            <span className={LABEL}>Needs first</span>
            <select
              className={FIELD}
              value={prerequisite}
              onChange={(event) => {
                setPrerequisite(event.target.value)
              }}
            >
              <option value="">Nothing</option>
              {candidates.map((entry) => (
                <option key={entry.upgrade.id} value={entry.upgrade.id}>
                  {entry.upgrade.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {add.data?.error !== undefined && (
          <p role="alert" className="text-bad-500 text-sm">
            {add.data.error}
          </p>
        )}

        <Button type="submit" variant="primary" full disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Add to the tree
        </Button>
      </form>
    </Card>
  )
}

export function UpgradesPage() {
  const [budget, setBudget] = useBudget()
  const [budgetText, setBudgetText] = useState(() => (budget === 0 ? '' : formatMinorUnits(budget)))

  const tree = useUpgradeTree(budget)
  const entries = tree.data ?? []

  const open = entries.filter((entry) => entry.upgrade.status !== 'purchased')
  const owned = entries.filter((entry) => entry.upgrade.status === 'purchased')
  const availableNow = open.filter((entry) => entry.affordable)

  return (
    <>
      <PageHeader title="Tech tree" subtitle="What you are saving up for, and what unlocks what." />

      <Section
        title="What you can get today"
        description={
          availableNow.length === 0
            ? 'Nothing is within reach at this budget.'
            : `${availableNow.length.toString()} within reach.`
        }
      >
        <Card className="mb-3">
          <label className="block">
            <span className={LABEL}>Budget</span>
            <input
              className={FIELD}
              inputMode="decimal"
              value={budgetText}
              placeholder="0.00"
              aria-label="What you have to spend"
              onChange={(event) => {
                setBudgetText(event.target.value)
                setBudget(toMinorUnits(event.target.value) ?? 0)
              }}
            />
          </label>
        </Card>

        {availableNow.length > 0 && (
          <div className="space-y-2">
            {availableNow.map((entry) => (
              <EntryCard
                key={entry.upgrade.id}
                entry={entry}
                others={entries.filter((one) => one.upgrade.id !== entry.upgrade.id)}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="The tree"
        description="Ordered by the priority each node inherits from the most important thing it unblocks."
      >
        <AddUpgrade candidates={entries} />

        {open.length === 0 ? (
          <Empty title="Nothing planned">Add the first thing you are saving up for.</Empty>
        ) : (
          <div className="space-y-2">
            {open.map((entry) => (
              <EntryCard
                key={entry.upgrade.id}
                entry={entry}
                others={entries.filter((one) => one.upgrade.id !== entry.upgrade.id)}
              />
            ))}
          </div>
        )}
      </Section>

      {owned.length > 0 && (
        <Section title="Owned">
          <div className="space-y-2">
            {owned.map((entry) => (
              <EntryCard
                key={entry.upgrade.id}
                entry={entry}
                others={entries.filter((one) => one.upgrade.id !== entry.upgrade.id)}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  )
}
