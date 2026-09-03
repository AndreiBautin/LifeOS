import { Pencil, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useState } from 'react'

import { Button, Card, Empty, Section } from '@/components/shared/primitives'
import { useServices } from '@/app/context'
import { WEEKDAY_LABELS, WEEKDAY_NAMES } from '@/domain/time/day'
import {
  CHARGE_DIRECTIONS,
  CHARGE_PERIODS,
  CHARGE_PERIOD_LABELS,
  cycleOf,
  describeCycle,
  directionOf,
  readCharges,
  rollingHours,
  type ChargeCycle,
  type ChargeDirection,
  type ChargePeriod,
  type ChargePreset,
  type DaysLimit,
  type Vice,
} from '@/domain/vitals/charges'
import type { NewVice } from '@/application/use-cases/vitals/vitals'

import { PoolIconMark } from './PoolIconMark'
import { DEFAULT_POOL_ICON, POOL_ICONS } from './pool-icons'

import { PoolRow } from '../vitals/PoolRow'
import { useAddVice, useEditVice, useRetireVice, useVices } from '../vitals/hooks'

/**
 * Limits: the pools, and the screen where they are set up.
 *
 * **Not a section of Vitals, which is where they started.** Vitals
 * measures the body — what the scale says, what the phase is, how the
 * day felt, what upkeep is kept — and a pool is none of that. It is a
 * rule you set and then spend against, which is closer to a quest than
 * to a weigh-in: nothing here is a reading taken *of* you.
 *
 * Sharing one screen also made that screen the longest in the app and
 * gave it a heading covering five unrelated things. Today still carries
 * a card for each, because Today is where the spending happens; this is
 * where the deciding does, the same line Settings and the tech tree sit
 * on relative to You.
 *
 * A link rather than a ninth tab, and that was measured rather than
 * argued: every nav cell clears 44px, so nine need 396 and a 375-pixel
 * phone has 375.
 */

/**
 * The three the request named, offered rather than seeded — and each on
 * the cycle people actually hold it on.
 *
 * Coffee is the case that earns the rolling window: two a day resetting
 * at midnight invites a third at eleven at night, and twelve hours does
 * not. Beer is the case that made hours read as nonsense — nobody
 * budgets four a week as "one back every forty-two hours".
 */
const SUGGESTIONS: readonly NewVice[] = [
  /*
   * **Name the substance, not the vessel.**
   *
   * Coffee was here as a count and is gone, because it measured the
   * wrong thing next to caffeine: a cold brew and an espresso are one
   * coffee each and roughly three times apart in the thing anybody
   * actually means to keep down. Two pools for one substance is two
   * numbers to keep in step and one of them not being the answer.
   *
   * Beer went the same way. A pint and a shot are both "one drink" only
   * if what you are counting is drinks, so the pool counts **standard
   * drinks** and is named for the substance. It stays a count rather
   * than gaining a unit: four is small enough to read as pips, and a
   * standard drink already *is* the unit.
   */
  /*
   * **The names stay the substances, and the icons do the gamifying.**
   * A suggestion is offered by *name not already used*, so renaming
   * these would stop matching the pools already on a device and offer a
   * second Caffeine beside the first. Any pool renames in its own
   * editor, which is where a name somebody chose belongs.
   *
   * **Kush was here and was removed on request** — _"a hard coded kush
   * button that needs to be removed"_. What is shipped as a suggestion
   * is the app guessing at somebody's life, and a guess nobody wanted is
   * worse than an empty list: the add form is one tap away and takes any
   * name. The two left are the ones with a *number* worth shipping — a
   * published caffeine ceiling and a standard-drink count — rather than
   * substances the app assumes you use.
   */
  {
    name: 'Alcohol',
    capacity: 3,
    icon: 'beer',
    cycle: { kind: 'calendar', period: 'day' },
    /*
     * Two numbers because it is two decisions. A weekly total alone
     * permits the whole week's worth on one night, which is the shape of
     * drinking the limit was meant to discourage.
     */
    daysLimit: { days: 2, period: 'week' },
  },
  /*
   * **Water is not here, and that is the same call supplements got.**
   * It was a target measured in millilitres with buttons for 250, 500
   * and a litre — an accurate account of a day's drinking and a running
   * total nobody keeps. A gallon is a thing you either finished or did
   * not, which is a *daily* in this app: it lives in Upkeep, it is one
   * tap, and it earns a streak, which is the question actually being
   * asked over a week.
   *
   * The mechanism would have fitted, and that was the trap. A pool with
   * a capacity of one and no unit is a habit wearing a pool's clothes —
   * a plus and a single pip, and no streak at the end of it.
   *
   * 400 mg is the figure health agencies give as a daily caffeine
   * ceiling for most adults, and it is editable because it is a starting
   * point rather than a claim.
   */
  {
    name: 'Caffeine',
    capacity: 400,
    unit: 'mg',
    icon: 'coffee',
    direction: 'limit',
    cycle: { kind: 'calendar', period: 'day' },
    /*
     * The presets are where the vessels belong — this is the one place
     * the difference between them is a number rather than a name.
     */
    presets: [
      { label: 'Soda', amount: 45 },
      { label: 'Coffee', amount: 95 },
      { label: 'Energy drink', amount: 160 },
      { label: 'Pre-workout', amount: 200 },
    ],
  },

  /*
   * **Water is back as a target, which reverses the note above.** That
   * note argued a gallon is a thing you either finished or did not, so
   * it belonged in Upkeep as a habit with a streak rather than as a pool
   * with a running total.
   *
   * What changed is that the pools now feed something. The health bar
   * reads *daily targets met* over the last week — see
   * `domain/vitals/vitality.ts` — so a target here is no longer a
   * running total nobody keeps; it is the thing the bar is made of.
   * Asked for directly, with the jug: _"water 128oz goal with a 128oz
   * gallon jug as a preset."_
   *
   * The habit version is not deleted and nothing migrates. If both exist
   * they are two records of one intention, and the pool is the one that
   * moves the bar.
   */
  {
    name: 'Water',
    capacity: 128,
    unit: 'oz',
    icon: 'droplet',
    direction: 'target',
    cycle: { kind: 'calendar', period: 'day' },
    /*
     * The jug first because it is the whole goal in one tap, which is
     * how somebody carrying one actually logs it. The smaller amounts
     * are for the days you are drinking from a glass.
     */
    presets: [
      { label: 'Gallon jug', amount: 128 },
      { label: 'Bottle', amount: 32 },
      { label: 'Glass', amount: 16 },
    ],
  },
  /*
   * **Two servings each, counted rather than measured.** A serving is
   * already the unit anybody thinks in, and putting grams on it would be
   * the precision the caffeine pool earns and this one does not.
   */
  {
    name: 'Fruit',
    capacity: 2,
    icon: 'apple',
    direction: 'target',
    cycle: { kind: 'calendar', period: 'day' },
  },
  {
    name: 'Vegetables',
    capacity: 2,
    icon: 'carrot',
    direction: 'target',
    cycle: { kind: 'calendar', period: 'day' },
  },
]

/** The four shapes offered, in the order people reach for them. */
const CYCLE_CHOICES: readonly {
  readonly id: string
  readonly label: string
  readonly cycle: ChargeCycle
}[] = [
  { id: 'day', label: 'a day', cycle: { kind: 'calendar', period: 'day' } },
  { id: 'week', label: 'a week', cycle: { kind: 'calendar', period: 'week' } },
  { id: 'month', label: 'a month', cycle: { kind: 'calendar', period: 'month' } },
  { id: 'rolling', label: 'rolling', cycle: { kind: 'rolling', hours: 12 } },
]

/** Which of `CYCLE_CHOICES` a stored cycle corresponds to. */
function choiceFor(vice: Vice): string {
  const cycle = cycleOf(vice)
  return cycle.kind === 'rolling' ? 'rolling' : cycle.period
}

/**
 * One pool, editable in place.
 *
 * Editing existed in the use-case from the day pools did and no screen
 * reached it — the third time in this app that a working capability was
 * invisible because nothing called it. It mattered here the moment
 * cycles arrived: a pool written before them is a rolling one, and
 * without this the only way to put beer on a weekly allowance was to
 * retire it and start again, throwing away every spend it had recorded.
 */
function ViceRow({ vice, now }: { readonly vice: Vice; readonly now: Date }) {
  const edit = useEditVice()
  const retire = useRetireVice()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(vice.name)
  const [capacity, setCapacity] = useState(String(vice.capacity))
  const [choice, setChoice] = useState(choiceFor(vice))
  const [hours, setHours] = useState(String(rollingHours(vice)))
  const dayLimit = useDaysLimit(vice.daysLimit)
  const shape = usePoolShape(vice)

  const reading = readCharges(vice, now)

  if (open) {
    return (
      <li className="py-2">
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            const picked = CYCLE_CHOICES.find((one) => one.id === choice)?.cycle ?? cycleOf(vice)

            edit.mutate(
              {
                id: vice.id,
                input: {
                  name,
                  capacity: Number(capacity),
                  cycle:
                    picked.kind === 'rolling' ? { kind: 'rolling', hours: Number(hours) } : picked,
                  direction: shape.direction,
                  ...(shape.unit.trim() === '' ? {} : { unit: shape.unit.trim() }),
                  ...(shape.value.length === 0 ? {} : { presets: shape.value }),
                  icon: shape.icon,
                  ...(dayLimit.value === undefined ? {} : { daysLimit: dayLimit.value }),
                },
              },
              {
                onSuccess: () => {
                  setOpen(false)
                },
              },
            )
          }}
        >
          <input
            className="bg-ink-900 border-ink-700 text-ink-50 tap-target w-full rounded-lg border px-3 text-sm"
            aria-label={`Name for ${vice.name}`}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
          <div className="flex items-center gap-2">
            <input
              className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target w-16 shrink-0 rounded-lg border px-2 text-sm"
              inputMode="decimal"
              aria-label={`How many ${vice.name}`}
              value={capacity}
              onChange={(event) => {
                setCapacity(event.target.value)
              }}
            />
            <select
              className="bg-ink-900 border-ink-700 text-ink-50 tap-target min-w-0 flex-1 rounded-lg border px-2 text-sm"
              aria-label={`How often ${vice.name} refills`}
              value={choice}
              onChange={(event) => {
                setChoice(event.target.value)
              }}
            >
              {CYCLE_CHOICES.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="primary" size="sm" disabled={edit.isPending}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false)
              }}
            >
              Cancel
            </Button>
            {/*
              Retiring lives here rather than on the row. It is the one
              thing on a pool you do once, and a bin sitting permanently
              beside the plus you press daily is a mis-tap waiting to
              happen — the more so now that the row carries buttons that
              are meant to be pressed.

              Retire, not delete. Months of spends are a true account of
              a stretch of your life, and deleting the pool takes them
              with it.
            */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              aria-label={`Retire ${vice.name}`}
              disabled={retire.isPending}
              onClick={() => {
                retire.mutate(vice.id)
              }}
            >
              <Trash2 size={14} aria-hidden />
            </Button>
          </div>
          <PoolShapeFields state={shape} />

          {/*
            Said plainly, because it is the one edit that changes what
            the record already holds. Relabelling drinks as shots is the
            same one-each history under a better word; changing drinks to
            milligrams is not, and only the lifter knows which of the two
            this is.
          */}
          {shape.unit !== (vice.unit ?? '') && vice.spent.length > 0 && (
            <p className="text-ink-700 text-xs">
              The {vice.spent.length} entr{vice.spent.length === 1 ? 'y' : 'ies'} already recorded
              keep their numbers.
            </p>
          )}

          {shape.direction === 'limit' && <DaysLimitFields state={dayLimit} idPrefix={vice.name} />}

          {choice === 'rolling' && (
            <label className="text-ink-500 flex items-center gap-2 text-xs">
              One back every
              <input
                className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target w-20 rounded-lg border px-2 text-sm"
                inputMode="decimal"
                aria-label={`Hours until a ${vice.name} charge returns`}
                value={hours}
                onChange={(event) => {
                  setHours(event.target.value)
                }}
              />
              hours
            </label>
          )}
          {/*
            Said out loud, because it is the one edit here that changes
            what the pool has already recorded. The spends are untouched;
            what changes is which of them still count.
          */}
          <p className="text-ink-700 text-xs">
            Changing this re-reads the {vice.spent.length} spend
            {vice.spent.length === 1 ? '' : 's'} already recorded. None are lost.
          </p>
        </form>
      </li>
    )
  }

  /*
   * The same row Today draws, because it is the same pool and the same
   * spend. What this screen adds is the rule it is being held to and a
   * way into the editor; what it no longer does is show a reading with
   * no button beside it.
   */
  return (
    <li>
      <PoolRow
        pool={{ vice, reading }}
        now={now}
        rule={describeCycle(vice)}
        action={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${vice.name}`}
            onClick={() => {
              setOpen(true)
            }}
          >
            <Pencil size={14} aria-hidden />
          </Button>
        }
      />
    </li>
  )
}

/**
 * The optional second limit, on how many days the pool may be touched.
 *
 * Off by default and hidden until asked for, because most pools want one
 * number: caffeine has a daily ceiling and no notion of caffeine-free
 * days, and water has neither.
 */
/**
 * A row of silhouettes, one of which is the pool's.
 *
 * **Pressed state is computed from the value rather than remembered from
 * the tap**, the rule the week shortcuts already follow: the control
 * shows what the record says, so it cannot drift from it.
 *
 * game-icons.net art by Lorc and Delapouite, CC BY 3.0 — the same
 * source, artists and licence as the avatar figures, so the credit at
 * the foot of Settings already covers them.
 */
function IconPicker({
  value,
  onChange,
}: {
  readonly value: string
  readonly onChange: (id: string) => void
}) {
  return (
    <div>
      <span className="text-ink-500 mb-1 block text-xs">Icon</span>
      <div className="flex flex-wrap gap-1.5">
        {POOL_ICONS.map((one) => (
          <button
            key={one.id}
            type="button"
            aria-label={one.label}
            aria-pressed={value === one.id}
            className={[
              'tap-target grid place-items-center rounded-lg border',
              value === one.id
                ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                : 'border-ink-800 text-ink-500',
            ].join(' ')}
            onClick={() => {
              onChange(one.id)
            }}
          >
            <PoolIconMark icon={one.id} size={20} />
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * What a pool *is* — which way it runs and what it counts.
 *
 * Shared by the add form and the editor, and it had to be: the editor
 * offered neither, so a pool's unit was fixed at creation and a
 * mislabelled one could only be retired and rebuilt, losing everything
 * it had recorded. Two copies of these controls would have been two
 * places for that to happen again.
 */
function usePoolShape(vice?: Vice, fallback: ChargeDirection = 'limit') {
  const [direction, setDirection] = useState<ChargeDirection>(
    vice === undefined ? fallback : directionOf(vice),
  )
  const [unit, setUnit] = useState(vice?.unit ?? '')
  const [presets, setPresets] = useState<readonly ChargePreset[]>(vice?.presets ?? [])
  const [icon, setIcon] = useState(vice?.icon ?? DEFAULT_POOL_ICON)

  return {
    direction,
    setDirection,
    unit,
    setUnit,
    icon,
    setIcon,
    presets,
    setPresets,
    /*
     * Only the rows worth keeping. A half-typed row — a name with no
     * number, or a number with no name — is somebody mid-thought rather
     * than a preset, and saving it would put a nameless button on the
     * card.
     */
    value: presets.filter((one) => one.label.trim() !== '' && one.amount > 0),
  }
}

/**
 * The quick amounts, editable.
 *
 * Shown only for a measured pool, because that is the only place they
 * are used — a counting pool's row is pips and a plus, with nowhere to
 * put a "Coffee" button.
 *
 * They were set once by whichever suggestion created the pool and could
 * not be touched afterwards, which is the same defect the unit had: a
 * list of drinks somebody's caffeine actually comes from is exactly the
 * kind of thing that changes, and rebuilding the pool to change it would
 * throw away everything it had recorded.
 */
function PresetFields({ state }: { readonly state: ReturnType<typeof usePoolShape> }) {
  if (state.unit.trim() === '') return null

  const change = (at: number, next: Partial<ChargePreset>) => {
    state.setPresets(state.presets.map((one, index) => (index === at ? { ...one, ...next } : one)))
  }

  return (
    <div className="space-y-1.5">
      <span className="text-ink-500 block text-xs">Quick amounts</span>

      {state.presets.map((preset, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            className="bg-ink-900 border-ink-700 text-ink-50 tap-target min-w-0 flex-1 rounded-lg border px-2 text-sm"
            aria-label={`Quick amount ${String(index + 1)} name`}
            placeholder="Coffee"
            value={preset.label}
            onChange={(event) => {
              change(index, { label: event.target.value })
            }}
          />
          <input
            className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target w-20 rounded-lg border px-2 text-sm"
            inputMode="decimal"
            aria-label={`Quick amount ${String(index + 1)} size`}
            placeholder={state.unit}
            value={preset.amount === 0 ? '' : String(preset.amount)}
            onChange={(event) => {
              change(index, { amount: Number(event.target.value) || 0 })
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove quick amount ${String(index + 1)}`}
            onClick={() => {
              state.setPresets(state.presets.filter((_, at) => at !== index))
            }}
          >
            <Trash2 size={14} aria-hidden />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          state.setPresets([...state.presets, { label: '', amount: 0 }])
        }}
      >
        <Plus size={14} aria-hidden />
        Quick amount
      </Button>
    </div>
  )
}

function PoolShapeFields({ state }: { readonly state: ReturnType<typeof usePoolShape> }) {
  return (
    <>
      {/*
        In the shared fields rather than in each form, so the add form
        and the editor cannot offer different icons — the reason the unit
        and direction controls live here too.
      */}
      <IconPicker value={state.icon} onChange={state.setIcon} />

      <div className="flex gap-1">
        {CHARGE_DIRECTIONS.map((one) => (
          <Button
            key={one}
            type="button"
            size="sm"
            full
            variant={state.direction === one ? 'primary' : 'outline'}
            aria-pressed={state.direction === one}
            onClick={() => {
              state.setDirection(one)
            }}
          >
            {one === 'limit' ? 'Potion' : 'Ration'}
          </Button>
        ))}
      </div>

      {/*
        Blank means a count. Naming a unit is what turns "three" into
        "three hundred millilitres" — and what swaps the pips for a bar,
        because pips cannot show three hundred.
      */}
      <label className="text-ink-500 flex items-center gap-2 text-xs">
        <span className="shrink-0">Measured in</span>
        <input
          className="bg-ink-900 border-ink-700 text-ink-50 tap-target min-w-0 flex-1 rounded-lg border px-2 text-sm"
          aria-label="Unit"
          placeholder="counts — or drinks, hits, mg…"
          value={state.unit}
          onChange={(event) => {
            state.setUnit(event.target.value)
          }}
        />
      </label>

      <PresetFields state={state} />
    </>
  )
}

/**
 * The day limit's form state, in one place.
 *
 * A hook rather than five `useState` calls repeated in the add form and
 * the edit form. They had already drifted once — the editor read
 * `daysLimit.period` unconditionally and stopped compiling the moment a
 * second shape existed — and two copies of a union's state is two places
 * to get the union wrong.
 */
function useDaysLimit(initial?: DaysLimit) {
  const [enabled, setEnabled] = useState(initial !== undefined)
  const [mode, setMode] = useState<'count' | 'days-of-week'>(
    initial?.kind === 'days-of-week' ? 'days-of-week' : 'count',
  )
  const [count, setCount] = useState(
    String(initial !== undefined && initial.kind !== 'days-of-week' ? initial.days : 2),
  )
  const [period, setPeriod] = useState<ChargePeriod>(
    initial !== undefined && initial.kind !== 'days-of-week' ? initial.period : 'week',
  )
  const [weekdays, setWeekdays] = useState<readonly number[]>(
    initial?.kind === 'days-of-week' ? initial.days : [5, 6],
  )

  const value: DaysLimit | undefined = !enabled
    ? undefined
    : mode === 'days-of-week'
      ? { kind: 'days-of-week', days: weekdays }
      : { kind: 'count', days: Number(count) || 1, period }

  return {
    enabled,
    setEnabled,
    mode,
    setMode,
    count,
    setCount,
    period,
    setPeriod,
    weekdays,
    setWeekdays,
    /*
     * Named days with nothing picked would shut the pool every day,
     * which is not what an empty picker means — it means "not decided".
     */
    value: mode === 'days-of-week' && weekdays.length === 0 ? undefined : value,
  }
}

function DaysLimitFields({
  state,
  idPrefix,
}: {
  readonly state: ReturnType<typeof useDaysLimit>
  readonly idPrefix: string
}) {
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={state.enabled ? 'primary' : 'outline'}
        size="sm"
        aria-pressed={state.enabled}
        onClick={() => {
          state.setEnabled(!state.enabled)
        }}
      >
        {state.enabled ? 'Only on some days' : 'Only on some days?'}
      </Button>

      {state.enabled && (
        <>
          <div className="flex gap-1">
            {[
              { id: 'count' as const, label: 'Any days' },
              { id: 'days-of-week' as const, label: 'Certain days' },
            ].map((one) => (
              <Button
                key={one.id}
                type="button"
                size="sm"
                full
                variant={state.mode === one.id ? 'primary' : 'outline'}
                aria-pressed={state.mode === one.id}
                onClick={() => {
                  state.setMode(one.id)
                }}
              >
                {one.label}
              </Button>
            ))}
          </div>

          {state.mode === 'count' ? (
            <label className="text-ink-500 flex items-center gap-2 text-xs">
              <span className="shrink-0">on</span>
              <input
                className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target w-14 rounded-lg border px-2 text-sm"
                inputMode="decimal"
                aria-label={`${idPrefix} days`}
                value={state.count}
                onChange={(event) => {
                  state.setCount(event.target.value)
                }}
              />
              <span className="shrink-0">days</span>
              <select
                className="bg-ink-900 border-ink-700 text-ink-50 tap-target min-w-0 flex-1 rounded-lg border px-2 text-sm"
                aria-label={`${idPrefix} days period`}
                value={state.period}
                onChange={(event) => {
                  state.setPeriod(event.target.value as ChargePeriod)
                }}
              >
                {CHARGE_PERIODS.map((one) => (
                  <option key={one} value={one}>
                    {CHARGE_PERIOD_LABELS[one]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="flex gap-1">
              {WEEKDAY_LABELS.map((label, index) => (
                <button
                  key={WEEKDAY_NAMES[index]}
                  type="button"
                  aria-label={`${idPrefix} ${WEEKDAY_NAMES[index] ?? ''}`}
                  aria-pressed={state.weekdays.includes(index)}
                  className={[
                    'tap-target h-10 flex-1 rounded-lg border text-xs font-medium',
                    state.weekdays.includes(index)
                      ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                      : 'border-ink-800 text-ink-500',
                  ].join(' ')}
                  onClick={() => {
                    state.setWeekdays(
                      state.weekdays.includes(index)
                        ? state.weekdays.filter((one) => one !== index)
                        : [...state.weekdays, index],
                    )
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The unused suggestions for one direction.
 *
 * Filtered by name already taken rather than by list emptiness: gating
 * on emptiness meant adding coffee took the other two away, so the
 * second and third pool had to be typed out, which is the opposite of
 * what a suggestion is for.
 */
function Suggestions({ of }: { readonly of: ChargeDirection }) {
  const vices = useVices()
  const add = useAddVice()

  const taken = new Set((vices.data ?? []).map((vice) => vice.name.toLowerCase()))
  const unused = SUGGESTIONS.filter(
    (one) => (one.direction ?? 'limit') === of && !taken.has(one.name.toLowerCase()),
  )

  if (unused.length === 0) return null

  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {unused.map((suggestion) => (
        <Button
          key={suggestion.name}
          variant="outline"
          size="sm"
          disabled={add.isPending}
          onClick={() => {
            add.mutate(suggestion)
          }}
        >
          <Plus size={14} aria-hidden />
          {suggestion.name}
        </Button>
      ))}
    </div>
  )
}

/**
 * Making a pool, folded away until asked for.
 *
 * It used to stand open at the foot of the section: a name box, a
 * direction toggle, a unit field, quick amounts, a size, a period and a
 * day limit, every one of them permanently on a screen whose job the
 * rest of the time is to show four rows and let you press plus. The unit
 * field was the giveaway — a box asking what you measure kush in, under
 * a list of pools that already know.
 *
 * A form you open is also a form you finish. One left open has no
 * moment where it is submitted, so it reads as part of the furniture.
 */
function AddVice({ of }: { readonly of: ChargeDirection }) {
  const add = useAddVice()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('2')
  const [choice, setChoice] = useState('week')
  const [hours, setHours] = useState('12')
  const dayLimit = useDaysLimit()
  const shape = usePoolShape(undefined, of)

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        full
        onClick={() => {
          setOpen(true)
        }}
      >
        <Plus size={14} aria-hidden />
        {of === 'limit' ? 'New potion' : 'New ration'}
      </Button>
    )
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim() === '') return
        const picked = CYCLE_CHOICES.find((one) => one.id === choice)?.cycle ?? {
          kind: 'calendar' as const,
          period: 'week' as const,
        }

        add.mutate({
          name,
          capacity: Number(capacity),
          cycle: picked.kind === 'rolling' ? { kind: 'rolling', hours: Number(hours) } : picked,
          direction: shape.direction,
          ...(shape.unit.trim() === '' ? {} : { unit: shape.unit.trim() }),
          ...(shape.value.length === 0 ? {} : { presets: shape.value }),
          icon: shape.icon,
          ...(dayLimit.value === undefined ? {} : { daysLimit: dayLimit.value }),
        })
        setName('')
        setOpen(false)
      }}
    >
      <input
        className="bg-ink-900 border-ink-700 text-ink-50 tap-target w-full rounded-lg border px-3 text-sm"
        /*
          Asks the question the chosen direction actually asks. One form
          serves both, and it went on saying "what are you limiting?"
          under a Reach button — which is the confusion this whole
          distinction exists to prevent, printed on the control that
          makes it.
        */
        placeholder={
          shape.direction === 'target' ? 'What keeps you going?' : 'What are you drinking?'
        }
        aria-label="Name"
        value={name}
        onChange={(event) => {
          setName(event.target.value)
        }}
      />
      {/*
        Read as a sentence — "4 a week" — because that is how the limit is
        held in the first place. The old pair of boxes asked for a count
        and a number of hours, which is the right question for coffee and
        a translation exercise for anything weekly.
      */}
      <PoolShapeFields state={shape} />

      <div className="flex items-center gap-2">
        <input
          className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target w-16 shrink-0 rounded-lg border px-2 text-sm"
          inputMode="decimal"
          aria-label="How many"
          value={capacity}
          onChange={(event) => {
            setCapacity(event.target.value)
          }}
        />
        <select
          className="bg-ink-900 border-ink-700 text-ink-50 tap-target min-w-0 flex-1 rounded-lg border px-2 text-sm"
          aria-label="How often the pool refills"
          value={choice}
          onChange={(event) => {
            setChoice(event.target.value)
          }}
        >
          {CYCLE_CHOICES.map((one) => (
            <option key={one.id} value={one.id}>
              {one.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary" disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Add
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false)
          }}
        >
          Cancel
        </Button>
      </div>

      {/*
        Only asked for when it is the answer. A rolling window is the one
        shape that needs a number, and putting that box on screen
        permanently was what made every pool look like it was measured in
        hours.
      */}
      {choice === 'rolling' && (
        <label className="text-ink-500 flex items-center gap-2 text-xs">
          One back every
          <input
            className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target w-20 rounded-lg border px-2 text-sm"
            inputMode="decimal"
            aria-label="Hours until a charge returns"
            value={hours}
            onChange={(event) => {
              setHours(event.target.value)
            }}
          />
          hours
        </label>
      )}

      {shape.direction === 'limit' && <DaysLimitFields state={dayLimit} idPrefix="New pool" />}
    </form>
  )
}
export function LimitsPage() {
  const vices = useVices()
  const now = useServices().clock.now()

  const active = vices.data ?? []
  const limits = active.filter((vice) => directionOf(vice) === 'limit')
  const targets = active.filter((vice) => directionOf(vice) === 'target')

  return (
    <div>
      <PageHeader
        title="Buffs"
        subtitle="Charges that come back on their own, and the rations that keep you standing"
      />

      {/*
        Two sections, not one with a heading that says "or the opposite".
        A limit and a target are read for different reasons — one asks
        what is left and the other how far there is to go — and putting
        water among the things being rationed made the section describe
        itself as either of two things, which is what a heading does when
        it is covering two.
      */}
      {/*
        "Staying under" and "Reaching for" rather than "Limits" and
        "Targets" — the page is already called Limits, and a section
        under it with the same word says nothing. These are the words the
        form itself uses on its direction toggle, so the heading and the
        control that produces it agree.
      */}
      {/*
        **"Potions" rather than "Staying under".** Asked for as _"can we
        rename limits to make them buffs, to make it feel more like
        gamified potions that recharge on cooldown instead of something
        I'm limiting myself on."_

        The mechanism is untouched and so is the honesty: going over is
        still the thing worth seeing, and `poolStanding` still says
        **Over** when you are. What changed is the frame around it — a
        flask with charges that come back reads as a resource you are
        spending, which is what a daily allowance actually is.
      */}
      <Section title="Potions">
        <Card>
          {vices.data === undefined ? null : limits.length === 0 ? (
            <Empty title="No potions yet">
              Charges you drink and that come back on their own. Going over is worth seeing; it is
              not a rule you broke.
            </Empty>
          ) : (
            <ul className="divide-ink-800 mb-3 divide-y">
              {limits.map((vice) => (
                <ViceRow key={vice.id} vice={vice} now={now} />
              ))}
            </ul>
          )}

          {/*
            Offered by *name not already used* rather than only on an
            empty list. Gating on emptiness meant adding coffee took the
            other two away, so the second and third pool had to be typed
            out — which is the opposite of what a suggestion is for.
          */}
          <Suggestions of="limit" />

          <AddVice of="limit" />
        </Card>
      </Section>

      {/*
        **"Rations" — the things that put health back.** These feed the
        bar on the portrait, which is what makes them a section rather
        than a curiosity: a target met is a day the bar counts.
      */}
      <Section title="Rations">
        <Card>
          {vices.data === undefined ? null : targets.length === 0 ? (
            <Empty title="No rations yet">
              The other half of the flask: what you top up rather than spend. Hitting these is what
              keeps the health bar on your portrait up.
            </Empty>
          ) : (
            <ul className="divide-ink-800 mb-3 divide-y">
              {targets.map((vice) => (
                <ViceRow key={vice.id} vice={vice} now={now} />
              ))}
            </ul>
          )}

          <Suggestions of="target" />

          <AddVice of="target" />
        </Card>
      </Section>
    </div>
  )
}
