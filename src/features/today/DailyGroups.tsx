import { Fragment } from 'react'

import type { DailyView } from '@/application/use-cases/dailies/dailies'
import { Card } from '@/components/shared/primitives'
import type { DailyId } from '@/domain/ids/ids'

import {
  occurrencesOf,
  PART_OF_DAY_LABELS,
  type DailyOccurrence,
  type PartOfDay,
} from '@/domain/dailies/daily'
import { BASE, type RecordHome } from '@/domain/base/base'
import {
  byGroup,
  byPartOfDay,
  GROUP_SUGGESTIONS,
  HOME_GROUP_LABELS,
  groupNamesIn,
  homeOrGroup,
  sameGroup,
  type CategoryOf,
  type DailyGroup,
} from '@/domain/dailies/groups'

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

/*
 * `shrink-0` is the load-bearing word here, and `tap-target` is why it
 * has to be said out loud. That class sets `min-width: 2.75rem` for the
 * thumb, which **replaces the `min-width: auto` a flex item would
 * otherwise carry** — and that automatic minimum is the thing that
 * normally stops an item shrinking below its own content.
 *
 * So on a phone narrow enough to hold fewer chips than there are, every
 * chip in the scrolling row below was squeezed to 44px while
 * `whitespace-nowrap` held its label at full width, and the text ran
 * straight out of its own border and across its neighbours. The row is
 * `overflow-x-auto` precisely so that it may be wider than the screen;
 * refusing to shrink is what lets it be.
 */
const CHIP =
  'tap-target shrink-0 rounded-lg border px-2.5 text-xs font-medium whitespace-nowrap transition-colors'

/**
 * Groups with headings, and the rows under them.
 *
 * Shared by the flat list and by each band, because a band *is* a
 * grouped list with a heading over it — and a second copy of the keying
 * below is where the two-rows-one-key bug would come back on one screen
 * and not the other.
 */
function GroupList({
  groups,
  byId,
  render,
  bare = false,
}: {
  readonly groups: readonly DailyGroup[]
  readonly byId: ReadonlyMap<DailyId, DailyView>
  readonly render: (view: DailyView, part?: PartOfDay) => React.ReactNode
  readonly bare?: boolean
}) {
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
   * The key names the *occurrence*, not the record. A habit set to
   * morning and evening draws two rows from one id, so keying on the id
   * alone would have React reuse one element for both — two rows sharing
   * a key is the case it warns about and then renders wrongly.
   */
  const drawn = (list: readonly DailyOccurrence[]) =>
    list.map(({ daily, part }) => {
      const view = byId.get(daily.id)

      return view === undefined ? null : (
        <Fragment key={`${daily.id}#${part ?? ''}`}>{render(view, part)}</Fragment>
      )
    })

  /*
   * One unnamed group is the flat list this replaced, rendered exactly
   * as it was. Nothing about adding the *capability* to group should
   * change a screen where nothing is grouped.
   */
  const only = groups[0]
  if (groups.length === 1 && only !== undefined && only.name === undefined) {
    return rows(drawn(only.occurrences))
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
          {rows(drawn(group.occurrences))}
        </div>
      ))}
    </div>
  )
}

export function GroupedDailies({
  views,
  render,
  bare = false,
  categoryOf,
}: {
  readonly views: readonly DailyView[]
  /**
   * Draws one row.
   *
   * Takes the part as well as the view, because a habit that names
   * morning and evening is drawn **twice** — once in each band — and the
   * row has to know which of the two it is to tick it. A caller with no
   * interest in parts ignores the second argument and behaves as it did.
   *
   * The key is supplied here rather than by the caller, since only this
   * knows that one record can produce more than one row and that an
   * `id` alone would collide between them.
   */
  readonly render: (view: DailyView, part?: PartOfDay) => React.ReactNode
  /**
   * Render bands rather than cards, for the screens whose list already
   * sits inside one.
   *
   * Base and Train each put their habits in a `Card` of their own;
   * nesting a second card per group would draw a panel inside a panel
   * for every category. Today owns its cards, so it does not pass this.
   */
  readonly bare?: boolean
  /**
   * What names a category here — see `byGroup`.
   *
   * Required rather than defaulted, the rule every list that can answer
   * two ways already follows. `groupOnly` is right for the three screens
   * showing a single home, where reading the home would put every row
   * under one heading repeating the name of the screen; Today passes
   * `homeOrGroup`, which is what stops a chore and a habit labelled
   * "House" drawing two sections with one name.
   */
  readonly categoryOf: CategoryOf
}) {
  /*
   * Grouped on the occurrences and mapped back to views by id, so
   * `byGroup` stays a domain function over `Daily` rather than knowing
   * what a view is. The input order survives inside each group, which is
   * what keeps the chronological sort the caller applied.
   *
   * Expands its own occurrences, unlike `DayBands`: the screens using
   * this draw every row a habit has, and only Today filters them one at
   * a time.
   */
  const byId = new Map(views.map((view) => [view.daily.id, view]))
  const groups = byGroup(occurrencesOf(views.map((view) => view.daily)), categoryOf)

  return <GroupList groups={groups} byId={byId} render={render} bare={bare} />
}

/**
 * The words for the band that names no part of the day.
 *
 * "Any time" rather than a fourth clock position, because that is what
 * an absent `partOfDay` means: a habit that belongs to no point in the
 * day rather than to the end of it. Calling it "Later" or "Night" would
 * put a claim on the record that the record does not make.
 */
const ANY_TIME = 'Any time'

/**
 * The day in bands — morning, afternoon, evening — with the categories
 * inside each.
 *
 * *"Group the dailies by morning, afternoon and evening, and then have
 * the subcategories there."* The sequence is outermost because a screen
 * called Today answers "is this now" before it answers "what sort of
 * thing is this"; see `byPartOfDay` for the rest of that argument.
 *
 * **The part heading is the structure and the category heading is the
 * label**, so they are drawn differently on purpose: the band gets the
 * accent rule this app uses to mean "section" and the category keeps the
 * small caps it already had. Two identically-styled headings nested one
 * inside the other read as a list that has lost its place.
 *
 * **A single band draws no heading at all.** Somebody whose habits all
 * run in the morning gets the list they had before, for the reason one
 * unnamed group renders as a flat list: adding the *capability* to band
 * should change nothing on a screen with nothing to band.
 */
export function DayBands({
  occurrences,
  views,
  render,
  now,
}: {
  /**
   * The rows to draw, already filtered.
   *
   * Taken rather than expanded from `views` here, because **which
   * occurrences belong on the screen is the caller's question**: Today
   * hides a part that is still to come and folds one that is finished,
   * and both of those are decisions about a single row of a habit rather
   * than about the habit. Expanding again in here would undo them.
   */
  readonly occurrences: readonly DailyOccurrence[]
  /** Every view the occurrences can refer to, for the lookup back. */
  readonly views: readonly DailyView[]
  readonly render: (view: DailyView, part?: PartOfDay) => React.ReactNode
  /**
   * Which band is happening, lit rather than moved.
   *
   * The rule the rows themselves already follow: the current part is
   * highlighted and nothing is reordered, because a list that sorts
   * itself twice a day moves the row you reach for by position.
   */
  readonly now: PartOfDay
}) {
  const byId = new Map(views.map((view) => [view.daily.id, view]))
  const bands = byPartOfDay(occurrences, homeOrGroup)

  if (bands.length === 0) return null

  const inBand = (band: (typeof bands)[number]) => (
    <GroupList groups={band.groups} byId={byId} render={render} />
  )

  const only = bands[0]
  if (bands.length === 1 && only !== undefined) return inBand(only)

  return (
    <div className="space-y-4">
      {bands.map((band) => (
        <div key={band.part ?? '·anytime'}>
          <div className="mb-1.5 flex items-center gap-2">
            <span
              aria-hidden
              className={[
                'h-3.5 w-0.5 rounded-full',
                band.part === now ? 'bg-accent-500' : 'bg-ink-800',
              ].join(' ')}
            />
            <span
              className={[
                'text-xs font-semibold tracking-wide uppercase',
                band.part === now ? 'text-accent-400' : 'text-ink-600',
              ].join(' ')}
            >
              {band.part === undefined ? ANY_TIME : PART_OF_DAY_LABELS[band.part]}
            </span>
          </div>

          {inBand(band)}
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
  home,
  onHomeChange,
}: {
  readonly value: string
  readonly onChange: (next: string) => void
  /** Where the record is filed. Only read when `onHomeChange` is given. */
  readonly home?: RecordHome | undefined
  /**
   * Given by the screens that show more than one home, which is Today.
   *
   * Absent means this field picks groups only, which is right for Base,
   * Train and Mind: each shows a single home and offering a move to the
   * one it already is would be a control that does nothing.
   */
  readonly onHomeChange?: (next: RecordHome | undefined) => void
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

  /*
   * The homes on offer: House, plus whichever this record is already
   * filed to.
   *
   * **House alone is offered as a destination**, because it is the one
   * home whose records are routinely created in the wrong place — the
   * hoovering added on Today before anybody noticed it was house work,
   * which is the report this answers. Training is not offered: those
   * habits only mean anything on a day you lift, they are created on the
   * screen that knows which days those are, and a chip here would be a
   * way to make one by accident.
   *
   * A record already filed to Training still shows its own chip, or the
   * field would draw nothing pressed while the screen above it drew a
   * Training heading — a control that disagrees with the list it edits.
   */
  const homes: readonly RecordHome[] =
    onHomeChange === undefined ? [] : [BASE, ...(home !== undefined && home !== BASE ? [home] : [])]

  return (
    <div className="space-y-1.5">
      <span className="text-ink-500 block text-xs font-medium tracking-wide uppercase">
        Section · optional
      </span>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {homes.map((one) => {
          const chosen = home === one

          return (
            <button
              key={one}
              type="button"
              aria-pressed={chosen}
              className={[
                CHIP,
                chosen
                  ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                  : 'border-ink-800 text-ink-500',
              ].join(' ')}
              onClick={() => {
                /*
                 * Choosing a home clears the group, because the home
                 * wins in `homeOrGroup` and a label that cannot be seen
                 * is a field nobody can correct. Pressing the chosen one
                 * sends it back to its own area, the way a group chip
                 * clears itself.
                 */
                onHomeChange?.(chosen ? undefined : one)
                if (!chosen) onChange('')
              }}
            >
              {HOME_GROUP_LABELS[one] ?? one}
            </button>
          )
        })}

        {offered.map((name) => {
          const chosen = home === undefined && sameGroup(name, value)

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
                // Pressing the chosen one clears it. Choosing a group
                // takes the record back out of a home, since the two are
                // one axis on the screen and only one can be shown.
                onChange(chosen ? '' : name)
                if (!chosen) onHomeChange?.(undefined)
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
          onHomeChange?.(undefined)
        }}
      />

      {/*
        Said where the choice is made, because it is the one option here
        that is not a label: a group is a word on a heading, and a home
        decides which area is paid for keeping it.
      */}
      {home !== undefined && (
        <p className="text-ink-600 text-xs">
          Filed to {HOME_GROUP_LABELS[home] ?? home}, so it is managed there too and its ticks pay
          that area.
        </p>
      )}
    </div>
  )
}
