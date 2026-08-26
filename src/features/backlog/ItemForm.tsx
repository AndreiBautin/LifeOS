import { useState } from 'react'

import { Button, Card } from '@/components/shared/primitives'
import { CATEGORY_REGISTRY, getCategoryDefinition } from '@/domain/backlog/category-registry'
import { MAX_GOAL_AMOUNT } from '@/domain/backlog/daily-goal'
import type { CreateItemInput, Item } from '@/domain/backlog/item'
import { PRIORITIES, PRIORITY_LABELS } from '@/domain/backlog/priority'
import { STATUS_LABELS, STATUSES } from '@/domain/backlog/status'

import { useBacklogSettings } from './hooks'

/**
 * Adding something, and editing it.
 *
 * One form for both, because the fields are the same and two would drift.
 * It submits a `CreateItemInput`, whose fields are all `string` —
 * validation happens in the domain against the registries, not here, so
 * this cannot claim a category is valid on a screen where the rule lives
 * somewhere else.
 */

interface ItemFormProps {
  readonly existing?: Item
  readonly onCancel: () => void
  readonly onSubmit: (input: CreateItemInput) => void
  readonly pending: boolean
  readonly error?: string | undefined
}

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase'

export function ItemForm({ existing, onCancel, onSubmit, pending, error }: ItemFormProps) {
  /*
   * The defaults apply to a new entry only. An edit opens on what the item
   * already is — a preference about where new things start is not a claim
   * about where old ones belong.
   */
  const { settings } = useBacklogSettings()

  const [title, setTitle] = useState(existing?.title ?? '')
  const [category, setCategory] = useState<string>(existing?.category ?? settings.defaultCategory)
  const [status, setStatus] = useState<string>(existing?.status ?? settings.defaultStatus)
  const [priority, setPriority] = useState<string>(existing?.priority ?? 'medium')
  const [platform, setPlatform] = useState(existing?.platform ?? '')
  const [goalAmount, setGoalAmount] = useState(existing?.dailyGoal?.amount.toString() ?? '')
  const [goalUnit, setGoalUnit] = useState(existing?.dailyGoal?.unit ?? '')

  /*
   * Looked up through the registry rather than cast, because `category`
   * is a plain string here on purpose — validating it is the domain's
   * job, and a cast on this line would be the screen claiming a guarantee
   * the rule lives somewhere else.
   */
  const definition = getCategoryDefinition(
    CATEGORY_REGISTRY.find((one) => one.id === category)?.id ?? 'games',
  )

  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()

          const amount = Number.parseInt(goalAmount, 10)
          const unit = goalUnit.trim() === '' ? definition.suggestedGoalUnit : goalUnit.trim()

          onSubmit({
            title,
            category,
            status,
            priority,
            ...(platform.trim() === '' ? {} : { platform: platform.trim() }),
            ...(Number.isFinite(amount) && amount > 0 ? { dailyGoal: { amount, unit } } : {}),
          })
        }}
      >
        <label className="block">
          <span className={LABEL}>Title</span>
          <input
            className={FIELD}
            value={title}
            autoFocus
            onChange={(event) => {
              setTitle(event.target.value)
            }}
            placeholder="What is it?"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={LABEL}>Category</span>
            <select
              className={FIELD}
              value={category}
              onChange={(event) => {
                setCategory(event.target.value)
              }}
            >
              {CATEGORY_REGISTRY.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={LABEL}>Status</span>
            <select
              className={FIELD}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
              }}
            >
              {STATUSES.map((one) => (
                <option key={one} value={one}>
                  {STATUS_LABELS[one]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={LABEL}>Priority</span>
            <select
              className={FIELD}
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value)
              }}
            >
              {PRIORITIES.map((one) => (
                <option key={one} value={one}>
                  {PRIORITY_LABELS[one]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={LABEL}>Platform</span>
            <input
              className={FIELD}
              value={platform}
              onChange={(event) => {
                setPlatform(event.target.value)
              }}
              placeholder={definition.suggestedPlatforms[0] ?? ''}
            />
          </label>
        </div>

        <fieldset className="grid grid-cols-2 gap-3">
          <legend className={LABEL}>Daily goal — optional</legend>
          <input
            className={FIELD}
            inputMode="numeric"
            value={goalAmount}
            max={MAX_GOAL_AMOUNT}
            aria-label="Daily goal amount"
            onChange={(event) => {
              setGoalAmount(event.target.value)
            }}
            placeholder="1"
          />
          <input
            className={FIELD}
            value={goalUnit}
            aria-label="Daily goal unit"
            onChange={(event) => {
              setGoalUnit(event.target.value)
            }}
            placeholder={definition.suggestedGoalUnit}
          />
        </fieldset>

        {error !== undefined && (
          <p role="alert" className="text-bad-500 text-sm">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="submit" variant="primary" full disabled={pending}>
            {existing === undefined ? 'Add' : 'Save'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
