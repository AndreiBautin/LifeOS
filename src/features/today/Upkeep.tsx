import { Flame, Plus, Undo2 } from 'lucide-react'
import { useState } from 'react'

import { Fold } from '@/components/shared/Fold'
import { counted } from '@/lib/counted'
import { Button, Card, Empty, Section } from '@/components/shared/primitives'
import { UPKEEP } from '@/domain/base/base'
import type { DailyView } from '@/application/use-cases/dailies/dailies'

import { AddDaily, DailyTitle, RenameDaily } from './Dailies'
import { GroupedDailies } from './DailyGroups'
import {
  useAddDaily,
  useKeepToday,
  useMoveDailyHome,
  useUndoToday,
  useUpkeep,
} from './dailies-hooks'

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
 * One thing you keep on top of, and how much of today's is done.
 *
 * A daily in every respect — cadence, streak, and the count that arrived
 * for chores done several times a day, which is exactly what brushing
 * twice needs. What it is not is a *quest*, which is why it keeps its
 * own section rather than joining the list above it.
 */
function UpkeepRow({ view }: { readonly view: DailyView }) {
  const keep = useKeepToday(view.daily.belongsTo)
  const undo = useUndoToday()
  const moveHome = useMoveDailyHome()
  const [renaming, setRenaming] = useState(false)

  const { daily, doneToday, expectedToday, doneCount, needed } = view

  if (renaming) {
    return (
      <li>
        <RenameDaily
          view={view}
          onDone={() => {
            setRenaming(false)
          }}
        />
      </li>
    )
  }

  return (
    <li className="flex items-center gap-3 py-2">
      <Button
        variant={doneToday ? 'primary' : 'outline'}
        aria-label={
          doneToday
            ? `Undo ${daily.title}`
            : needed > 1
              ? `Log ${daily.title}, ${String(doneCount)} of ${String(needed)} done`
              : `Mark ${daily.title} done`
        }
        aria-pressed={doneToday}
        disabled={keep.isPending || undo.isPending}
        onClick={() => {
          if (doneToday) undo.mutate(daily.id)
          else keep.mutate(daily.id)
        }}
      >
        {doneToday ? '✓' : needed > 1 ? `${String(doneCount)}/${String(needed)}` : ''}
      </Button>

      <div className="min-w-0 flex-1">
        <DailyTitle
          daily={daily}
          done={doneToday}
          onRename={() => {
            setRenaming(true)
          }}
        />
        {needed > 1 && expectedToday && (
          <p className="text-ink-700 text-xs">
            {doneCount} of {needed} today
          </p>
        )}
        {!expectedToday && <p className="text-ink-700 text-xs">Not due today</p>}
      </div>

      {view.streak > 0 && (
        <span className="text-ink-500 numeric flex items-center gap-1 text-xs">
          <Flame size={12} aria-hidden />
          {view.streak}
        </span>
      )}

      <Button
        variant="ghost"
        size="sm"
        aria-label={`Move ${daily.title} back to Today`}
        disabled={moveHome.isPending}
        onClick={() => {
          moveHome.mutate({ id: daily.id, home: undefined })
        }}
      >
        <Undo2 size={14} aria-hidden />
      </Button>
    </li>
  )
}

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
   * The same three-way split the dailies above use, and it is needed
   * here for a reason this section created: moving the full list onto
   * Today meant every upkeep habit rendered whatever the day asked for,
   * captioned "Not due today". That was the clutter reported —
   * *"everything that gets checked off and stuff for other days"* — and
   * it arrived with the move rather than being inherited.
   *
   * Folded rather than filtered, for the reason `Fold` gives: a done
   * row is the only route to undo, and a not-due row is the only route
   * to renaming or retiring one.
   */
  const outstanding = views.filter((view) => view.dueToday)
  const done = views.filter((view) => view.doneToday)
  const otherDays = views.filter((view) => !view.dueToday && !view.doneToday)

  return (
    <Section
      title="Upkeep"
      description="Brushing, flossing, washing your hair — the body's chores"
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
        {upkeep.data === undefined ? null : views.length === 0 ? (
          <Empty title="Nothing yet">
            Things you either did today or did not — a gallon of water, brushing, flossing.
          </Empty>
        ) : (
          <>
            {outstanding.length > 0 && (
              <div className="mb-3">
                <GroupedDailies
                  bare
                  views={outstanding}
                  render={(view) => <UpkeepRow key={view.daily.id} view={view} />}
                />
              </div>
            )}

            {/*
              Said in words rather than left as a gap. An empty card
              under a heading reads as something that failed to load,
              where the whole point is that there is nothing left.
            */}
            {outstanding.length === 0 && (
              <p className="text-ink-500 mb-3 text-sm">Nothing left today.</p>
            )}

            {done.length > 0 && (
              <Fold summary={`${counted(done.length, 'done', 'done')} today`}>
                <GroupedDailies
                  bare
                  views={done}
                  render={(view) => <UpkeepRow key={view.daily.id} view={view} />}
                />
              </Fold>
            )}

            {otherDays.length > 0 && (
              <Fold summary={`${counted(otherDays.length, 'chore', 'chores')} on other days`}>
                <GroupedDailies
                  bare
                  views={otherDays}
                  render={(view) => <UpkeepRow key={view.daily.id} view={view} />}
                />
              </Fold>
            )}

            <div className="mt-3" />
          </>
        )}

        <UpkeepSuggestions
          taken={new Set(views.map((view) => view.daily.title.trim().toLowerCase()))}
        />
      </Card>
    </Section>
  )
}
