import { Plus, Sofa, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import { Badge, Button, Card, CardHeading, Empty } from '@/components/shared/primitives'
import { Meter } from '@/components/shared/Meter'
import { describeClear, ROOM_SUGGESTIONS, type RoomStanding } from '@/domain/base/declutter'
import {
  addRoom,
  COMPARE_DAYS,
  houseClutter,
  recordClear,
  removeRoom,
} from '@/application/use-cases/base/declutter'
import type { RoomId } from '@/domain/ids/ids'

/**
 * How clear the house is, room by room.
 *
 * **A level, not a task.** A house job finishes and a chore recurs;
 * decluttering does neither. It is a reading that moves both ways over
 * months, which is the shape of a weigh-in — so a room carries a series
 * and everything here is derived from it. Nothing stores a "current"
 * figure, because a stored total is a total that can be wrong.
 *
 * **It pays no XP**, the same call the weigh-in got: saying a room is
 * 40% clear is a measurement, and paying for the number going up would
 * be paying for an outcome. The afternoon spent clearing the garage is a
 * house job with steps, and *that* pays.
 *
 * **Going backwards is shown as readily as forwards**, which is the
 * whole reason to track it: a room cleared in March fills up again by
 * August, and a checklist would make the one thing worth knowing
 * invisible.
 */

const CLUTTER = ['base', 'clutter'] as const

function useHouse() {
  const services = useServices()

  return useQuery({ queryKey: CLUTTER, queryFn: () => houseClutter(services) })
}

function useClutterMutation<T>(
  run: (input: T, services: ReturnType<typeof useServices>) => Promise<unknown>,
) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: T) => run(input, services),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: CLUTTER })
    },
  })
}

/**
 * Setting a level, as five words rather than a slider alone.
 *
 * **The words are the judgement and the number makes months
 * comparable.** "62%" is precision nobody has — this is somebody looking
 * round a room — so the buttons carry the reading and the bar reports
 * where it landed. A slider on its own would invite a decimal nobody
 * means.
 */
const BANDS = [
  { label: 'Overwhelmed', clear: 10 },
  { label: 'Cluttered', clear: 32 },
  { label: 'Lived in', clear: 57 },
  { label: 'Tidy', clear: 80 },
  { label: 'Clear', clear: 95 },
] as const

function RoomRow({ standing }: { readonly standing: RoomStanding }) {
  const set = useClutterMutation<{ id: RoomId; clear: number }>(({ id, clear }, services) =>
    recordClear(id, clear, services),
  )
  const drop = useClutterMutation<RoomId>((id, services) => removeRoom(id, services))
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const { room, clear, change, lastReadOn } = standing
  const readings = room.readings.length

  return (
    <li className="border-ink-800 border-b py-2.5 last:border-b-0">
      <button
        type="button"
        className="flex w-full items-baseline justify-between gap-2 text-left"
        onClick={() => {
          setOpen(!open)
        }}
      >
        <span className="text-ink-50 min-w-0 flex-1 truncate text-sm font-medium">{room.name}</span>

        {/*
          Absent, never zero. A room nobody has looked at has not scored
          badly — a bar at nought would read as a room full of clutter
          when nothing has been judged.
        */}
        {clear === undefined ? (
          <Badge tone="neutral">Not looked at</Badge>
        ) : (
          <span className="flex items-center gap-2">
            {change !== undefined && change !== 0 && (
              <span
                className={['numeric text-xs', change > 0 ? 'text-good-500' : 'text-bad-500'].join(
                  ' ',
                )}
              >
                {change > 0 ? '+' : ''}
                {change}
              </span>
            )}
            <Badge tone={clear >= 70 ? 'good' : clear >= 45 ? 'neutral' : 'warn'}>
              {describeClear(clear)}
            </Badge>
          </span>
        )}
      </button>

      {clear !== undefined && (
        <>
          <Meter className="mt-1.5" value={clear} of={100} height={5} label={room.name} />
          <p className="text-ink-700 numeric mt-1 text-xs">
            {clear}% · read {lastReadOn}
          </p>
        </>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1">
            {BANDS.map((band) => (
              <button
                key={band.label}
                type="button"
                className={[
                  'tap-target rounded-lg border px-2.5 text-xs font-medium',
                  clear !== undefined && describeClear(clear) === band.label
                    ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                    : 'border-ink-800 text-ink-500',
                ].join(' ')}
                disabled={set.isPending}
                onClick={() => {
                  set.mutate({ id: room.id, clear: band.clear })
                }}
              >
                {band.label}
              </button>
            ))}
          </div>

          <p className="text-ink-700 text-xs">
            Today&rsquo;s reading. Looking again on the same day corrects it rather than adding a
            second one.
          </p>

          {confirming ? (
            <div className="space-y-2">
              <p className="text-bad-500 text-xs">
                Removing this room also removes{' '}
                {readings === 1 ? 'its one reading' : `its ${String(readings)} readings`}. Nothing
                else holds them.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-bad-500 flex-1"
                  disabled={drop.isPending}
                  onClick={() => {
                    drop.mutate(room.id)
                  }}
                >
                  Remove it
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConfirming(false)
                  }}
                >
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-ink-500"
              onClick={() => {
                /*
                 * Confirmed only where there is something to lose, the
                 * same rule the campaign stages follow: asking about
                 * everything is how somebody learns to press through the
                 * question without reading it.
                 */
                if (readings > 0) setConfirming(true)
                else drop.mutate(room.id)
              }}
            >
              <Trash2 size={13} aria-hidden />
              Remove this room
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

function AddRoom({ onDone, taken }: { readonly onDone: () => void; readonly taken: Set<string> }) {
  const services = useServices()
  const client = useQueryClient()
  const add = useMutation({
    mutationFn: (name: string) => addRoom(name, services),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: CLUTTER })
    },
  })
  const [name, setName] = useState('')

  const offered = ROOM_SUGGESTIONS.filter((one) => !taken.has(one.toLowerCase()))

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim() === '') return
          add.mutate(name, { onSuccess: onDone })
        }}
      >
        {/*
          Offered by name not already used, the rule the Upkeep habits and
          the pool suggestions both follow — taking one does not take the
          rest away, and typing your own is always available.
        */}
        {offered.length > 0 && (
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {offered.map((one) => (
              <button
                key={one}
                type="button"
                // `shrink-0` for the reason `CHIP` in DailyGroups spells
                // out: `tap-target`'s min-width replaces a flex item's
                // automatic minimum, so without it these squeeze to 44px
                // and the nowrap label runs outside its own border.
                className="border-ink-800 text-ink-500 tap-target shrink-0 rounded-lg border px-2.5 text-xs font-medium whitespace-nowrap"
                disabled={add.isPending}
                onClick={() => {
                  add.mutate(one, { onSuccess: onDone })
                }}
              >
                {one}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            className="bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm"
            aria-label="Room name"
            placeholder="Or type one"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
          <Button type="submit" size="sm" variant="primary" disabled={add.isPending}>
            <Plus size={14} aria-hidden />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            <X size={14} aria-hidden />
          </Button>
        </div>

        {add.data?.error !== undefined && (
          <p role="alert" className="text-bad-500 text-xs">
            {add.data.error}
          </p>
        )}
      </form>
    </Card>
  )
}

export function Declutter() {
  const house = useHouse()
  const [adding, setAdding] = useState(false)

  const standing = house.data
  const rooms = standing?.rooms ?? []
  const taken = new Set(rooms.map((one) => one.room.name.toLowerCase()))

  return (
    /*
      One card that names itself, where this was a `Section` wrapping up
      to two of them. The description went with the heading: "a level
      that moves both ways, not a job that finishes" is the reasoning
      behind the feature rather than something you need in front of you
      every time you open the screen, and the empty state still says it
      where somebody meeting it for the first time will read it.
    */
    <Card>
      <CardHeading
        icon={<Sofa size={16} aria-hidden />}
        title="Clutter"
        action={
          rooms.length === 0 ? undefined : (
            <Button
              size="sm"
              onClick={() => {
                setAdding(!adding)
              }}
            >
              {adding ? 'Close' : 'Add'}
            </Button>
          )
        }
      />

      {adding && (
        <AddRoom
          taken={taken}
          onDone={() => {
            setAdding(false)
          }}
        />
      )}

      {standing !== undefined && rooms.length === 0 && !adding && (
        <Empty title="No rooms yet">
          <span className="block">
            Add the rooms that actually collect things. Each one carries a level you set by looking
            at it, and the house is the average of the ones you have looked at.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setAdding(true)
            }}
          >
            <Plus size={14} aria-hidden />
            Add a room
          </Button>
        </Empty>
      )}

      {rooms.length > 0 && (
        <>
          {/*
            The house first, and absent until something has been read.
            The average covers only the rooms with a reading — an
            unmeasured room is not a room full of clutter, and counting
            it as zero would make adding one read as the house getting
            worse.
          */}
          <div className="border-ink-800 mb-2 border-b pb-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-ink-50 text-sm font-medium">The house</span>
              {standing?.clear === undefined ? (
                <Badge tone="neutral">Nothing read yet</Badge>
              ) : (
                <span className="flex items-center gap-2">
                  {standing.change !== undefined && standing.change !== 0 && (
                    <span
                      className={[
                        'numeric text-xs',
                        standing.change > 0 ? 'text-good-500' : 'text-bad-500',
                      ].join(' ')}
                    >
                      {standing.change > 0 ? '+' : ''}
                      {standing.change} in {COMPARE_DAYS} days
                    </span>
                  )}
                  <Badge tone={standing.clear >= 70 ? 'good' : 'neutral'}>
                    {describeClear(standing.clear)}
                  </Badge>
                </span>
              )}
            </div>

            {standing?.clear !== undefined && (
              <Meter
                className="mt-1.5"
                value={standing.clear}
                of={100}
                height={6}
                label="The house overall"
              />
            )}

            {standing !== undefined && standing.unread.length > 0 && (
              <p className="text-ink-700 mt-1 text-xs">
                {standing.unread.length} room{standing.unread.length === 1 ? '' : 's'} not looked at
                yet, and left out of the average rather than counted as nothing.
              </p>
            )}
          </div>

          <ul>
            {rooms.map((one) => (
              <RoomRow key={one.room.id} standing={one} />
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}
