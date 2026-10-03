import { ChevronDown, ChevronUp, Eye, EyeOff, LayoutGrid } from 'lucide-react'
import { useState } from 'react'

import { useSettings } from '@/app/context'
import { arrangeCards, moveCard, toggleCard } from '@/domain/settings/home-cards'
import { Button, Card } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

/**
 * The home page's cards, in the order the person wants and without the
 * ones they never read (`settings.homeCards`, `arrangeCards`).
 *
 * **Folded to one quiet button at the foot of the page**: arranging is a
 * thing done once, and an editor standing open would be the largest card
 * on a screen whose job is the day. Up and down rather than drag — a drag
 * inside a masonry that reflows under the finger is a fight, and two
 * buttons work with one thumb.
 */
export function ArrangeCards({
  defaults,
  labels,
}: {
  readonly defaults: readonly string[]
  readonly labels: Readonly<Record<string, string>>
}) {
  const { settings, update } = useSettings()
  const [open, setOpen] = useState(false)
  const prefs = settings.homeCards
  const order = arrangeCards(defaults, prefs === undefined ? undefined : { ...prefs, hidden: [] })
  const hidden = new Set(prefs?.hidden ?? [])

  if (!open) {
    return (
      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(true)
          }}
        >
          <LayoutGrid size={14} aria-hidden />
          Arrange cards
        </Button>
      </div>
    )
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-ink-50 text-sm font-semibold">Arrange cards</h2>
        <div className="flex gap-1">
          {prefs !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                update({ homeCards: { order: defaults, hidden: [] } })
              }}
            >
              Reset
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen(false)
            }}
          >
            Done
          </Button>
        </div>
      </div>
      <ol className="space-y-1">
        {order.map((key, at) => (
          <li
            key={key}
            className={cn(
              'border-ink-800 flex items-center gap-2 rounded-lg border px-3 py-1',
              hidden.has(key) && 'opacity-50',
            )}
          >
            <span className="text-ink-100 flex-1 truncate text-sm">{labels[key] ?? key}</span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${labels[key] ?? key} up`}
              disabled={at === 0}
              onClick={() => {
                update({ homeCards: moveCard(defaults, prefs, key, -1) })
              }}
            >
              <ChevronUp size={16} aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${labels[key] ?? key} down`}
              disabled={at === order.length - 1}
              onClick={() => {
                update({ homeCards: moveCard(defaults, prefs, key, 1) })
              }}
            >
              <ChevronDown size={16} aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${hidden.has(key) ? 'Show' : 'Hide'} ${labels[key] ?? key}`}
              aria-pressed={!hidden.has(key)}
              onClick={() => {
                update({ homeCards: toggleCard(prefs, defaults, key) })
              }}
            >
              {hidden.has(key) ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            </Button>
          </li>
        ))}
      </ol>
    </Card>
  )
}
