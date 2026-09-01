import { Plus } from 'lucide-react'
import { useState } from 'react'

import { Button, Card, Empty, Section } from '@/components/shared/primitives'
import { UPKEEP } from '@/domain/base/base'

import { AddDaily } from './Dailies'
import { useAddDaily, useUpkeep } from './dailies-hooks'

/**
 * The body's chores, on the screen that now owns them.
 *
 * **This moved off Vitals with the rest of that screen, and it moved
 * here because it was already half here.** Today has shown an Upkeep
 * group under `DueElsewhere` all along — reported as *"there's already
 * an upkeep section on the You page"* — but that group only ever
 * rendered what was **due**, on the reasoning that anything else about
 * these belonged on the screen that owned them. There is no such screen
 * now, so a weekly hair wash on a Tuesday would have been invisible and
 * unretirable. The full list lives here instead, and `DueElsewhere`
 * dropped its Upkeep group so no record is drawn twice.
 *
 * **`belongsTo` did not move, and that is the point.** These are still
 * filed to `UPKEEP`, still pay `vitals.upkeep-kept`, and still feed the
 * Vitality trait. A **home decides which area scores a record; a screen
 * is only where you touch it** — folding them into Today's own dailies
 * would have re-attributed every one of them to `dailies.completed` and
 * left Vitality permanently empty, since it has no other area.
 */

/**
 * The body's chores, offered by name.
 *
 * Upkeep was the one list in the app with no suggestions — you typed
 * every row — and it is the list whose contents are the least personal:
 * everybody's is roughly brushing, flossing, hair and water. Water is
 * the reason it exists now, since taking it off the pool suggestions
 * would otherwise have left the only way to it a form.
 *
 * `timesPerDay` is on brushing because two is what brushing is, and it
 * is the field `AddDaily` collects for exactly this.
 */
const UPKEEP_SUGGESTIONS: readonly {
  readonly title: string
  readonly timesPerDay?: number
}[] = [
  /*
   * Named for the thing being ticked rather than for the substance. A
   * row reading just 'Water' would be a checkbox against a question
   * nobody fails, where the whole point is whether the day's target was
   * finished.
   */
  { title: 'Gallon of water' },
  { title: 'Brush teeth', timesPerDay: 2 },
  { title: 'Floss' },
  { title: 'Wash hair' },
]

function UpkeepSuggestions({ taken }: { readonly taken: ReadonlySet<string> }) {
  const add = useAddDaily(UPKEEP)

  /*
   * Offered by *name not already used*, the same rule the pools follow.
   * Gating on an empty list instead means adding the first one takes the
   * other three away, so the second has to be typed — which is the
   * opposite of what a suggestion is for.
   */
  const unused = UPKEEP_SUGGESTIONS.filter((one) => !taken.has(one.title.toLowerCase()))
  if (unused.length === 0) return null

  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {unused.map((suggestion) => (
        <Button
          key={suggestion.title}
          variant="outline"
          size="sm"
          disabled={add.isPending}
          onClick={() => {
            add.mutate({
              title: suggestion.title,
              cadence: { kind: 'every-day' },
              ...(suggestion.timesPerDay === undefined
                ? {}
                : { timesPerDay: suggestion.timesPerDay }),
            })
          }}
        >
          <Plus size={14} aria-hidden />
          {suggestion.title}
        </Button>
      ))}
    </div>
  )
}

export function Upkeep() {
  const upkeep = useUpkeep()
  const [adding, setAdding] = useState(false)

  const views = upkeep.data ?? []

  /*
   * **The rows are not here; they are in the day above.** They were,
   * briefly — the whole list, folds and all — and that put the day's
   * remaining chores three blocks below the line counting them:
   * *"I have two left but have to scroll all the way down to find em."*
   * Upkeep is a group in the day list now, so this is what is left when
   * the rows move out: the way to **add** one.
   *
   * It stays a section rather than folding into that group, because a
   * group is not drawn when it has no rows — and the first upkeep habit
   * has to be addable from a screen showing none.
   */
  return (
    <Section
      title="Upkeep"
      description="Brushing, flossing, washing your hair — kept with the day above"
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
          home={UPKEEP}
          placeholder="Something you keep on top of"
          onDone={() => {
            setAdding(false)
          }}
        />
      )}

      <Card>
        {views.length === 0 && (
          <Empty title="Nothing yet">
            Things you either did today or did not — a gallon of water, brushing, flossing.
          </Empty>
        )}

        <UpkeepSuggestions
          taken={new Set(views.map((view) => view.daily.title.trim().toLowerCase()))}
        />
      </Card>
    </Section>
  )
}
