import type { DailyView } from '@/application/use-cases/dailies/dailies'
import { Card } from '@/components/shared/primitives'

import { byGroup, GROUP_SUGGESTIONS, groupNamesIn, sameGroup } from '@/domain/dailies/groups'

import { useDailies } from './dailies-hooks'

/**
 * Habits under the kind of thing they are.
 *
 * The report was "pretty much all of my dailies fall under a certain
 * category" — the homes were already right, and the list *inside* one of
 * them had got long enough that a supplement, a toothbrush and the dog's
 * dinner read as one undifferentiated column.
 *
 * A heading only where there is a name, and the ungrouped rows run on
 * without one. A heading over the leftovers would be a category called
 * "everything else" that nobody chose — and when nothing is grouped at
 * all, that means this renders exactly what the plain list used to.
 */

const CHIP =
  'tap-target rounded-lg border px-2.5 text-xs font-medium whitespace-nowrap transition-colors'

export function GroupedDailies({
  views,
  render,
  bare = false,
}: {
  readonly views: readonly DailyView[]
  readonly render: (view: DailyView) => React.ReactNode
  /**
   * Render bands rather than cards, for the screens whose list already
   * sits inside one.
   *
   * Base, Upkeep and Train each put their habits in a `Card` of their
   * own; nesting a second card per group would draw a panel inside a
   * panel for every category. Today owns its cards, so it does not pass
   * this.
   */
  readonly bare?: boolean
}) {
  /*
   * Grouped on the dailies and mapped back to views by id, so `byGroup`
   * stays a domain function over `Daily` rather than knowing what a view
   * is. The input order survives inside each group, which is what keeps
   * the chronological sort the caller applied.
   */
  const byId = new Map(views.map((view) => [view.daily.id, view]))
  const groups = byGroup(views.map((view) => view.daily))

  if (groups.length === 0) return null

  /*
   * A function returning an element, not a component declared here.
   * A component defined during render is a *new type* every render, so
   * React unmounts and remounts its whole subtree — which on these rows
   * means a rename field losing focus mid-word. Caught by the lint rule
   * rather than by anybody typing.
   */
  const rows = (children: React.ReactNode) =>
    bare ? (
      <div className="divide-ink-800 divide-y">{children}</div>
    ) : (
      <Card className="divide-ink-800 divide-y py-0">{children}</Card>
    )

  /*
   * One unnamed group is the flat list this replaced, rendered exactly
   * as it was. Nothing about adding the *capability* to group should
   * change a screen where nothing is grouped.
   */
  if (groups.length === 1 && groups[0]?.name === undefined) {
    return rows(views.map(render))
  }

  return (
    <div className={bare ? 'space-y-3' : 'space-y-2'}>
      {groups.map((group) => (
        <div key={group.name ?? '·ungrouped'}>
          {/*
            A heading only where there is a name. The ungrouped rows run
            on without one, because a heading over the leftovers is a
            category called "everything else" that nobody chose.
          */}
          {group.name !== undefined && (
            <span className="text-ink-700 mb-1 block text-xs tracking-wide uppercase">
              {group.name}
            </span>
          )}
          {rows(
            group.dailies.map((daily) => {
              const view = byId.get(daily.id)
              return view === undefined ? null : render(view)
            }),
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Choosing a group: the names already in use first, then the ones most
 * people want, then a box.
 *
 * **Names in use lead the row**, because a group typed once should be
 * one tap the second time — the list somebody actually has is a better
 * set of answers than anything shipped, which is the same argument the
 * pool presets make about ending up with what you really drink.
 *
 * Pressing the chosen chip clears it, so leaving a group needs no
 * separate control and no empty option in a select.
 */
export function GroupField({
  value,
  onChange,
}: {
  readonly value: string
  readonly onChange: (next: string) => void
}) {
  /*
   * Read across *every* home, not just this one. A household with a
   * "Pet care" group on Base should be offered it on Today too —
   * otherwise the same category gets typed twice with different casing
   * and reads as two.
   */
  const all = useDailies('both')
  const used = groupNamesIn((all.data ?? []).map((view) => view.daily))

  const offered = [
    ...used,
    ...GROUP_SUGGESTIONS.filter((one) => !used.some((u) => sameGroup(u, one))),
  ]

  return (
    <div className="space-y-1.5">
      <span className="text-ink-500 block text-xs font-medium tracking-wide uppercase">
        Group · optional
      </span>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {offered.map((name) => {
          const chosen = sameGroup(name, value)

          return (
            <button
              key={name}
              type="button"
              aria-pressed={chosen}
              className={[
                CHIP,
                chosen
                  ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                  : 'border-ink-800 text-ink-500',
              ].join(' ')}
              onClick={() => {
                // Pressing the chosen one clears it.
                onChange(chosen ? '' : name)
              }}
            >
              {name}
            </button>
          )
        })}
      </div>

      <input
        className="bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm"
        aria-label="Group"
        placeholder="Or type one"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
    </div>
  )
}
