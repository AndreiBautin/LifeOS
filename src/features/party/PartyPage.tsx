import { Check, Trash2, UserPlus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useState } from 'react'

import { useServices } from '@/app/context'
import type { FriendReading } from '@/application/use-cases/social/social'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { CIRCLE_RATING_LABELS } from '@/domain/social/circle'
import { toDayKey } from '@/domain/time/day'

import { useAddFriend, useLogHangout, useRemoveFriend, useSocialSummary } from '../review/hooks'

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'

/**
 * The party: the people you actually see, and how long it has been.
 *
 * It lived inside the monthly review, which was the wrong home for it in a
 * way the rename made obvious. The review is a retrospective you open ten
 * minutes a month; seeing somebody is a thing you *do*, and the list of
 * who you have not seen is only useful if you meet it more often than
 * that.
 *
 * A friend record keeps `lastHangout` — one date, ratcheted forward —
 * rather than a list of occasions. That is why the character sheet pays no
 * XP for seeing somebody: the hub knows when you last did, and has no idea
 * how many times.
 */

function FriendRow({ reading }: { readonly reading: FriendReading }) {
  const log = useLogHangout()
  const remove = useRemoveFriend()
  const services = useServices()
  const [confirming, setConfirming] = useState(false)

  const { friend, active, overdue, daysSinceLastHangout } = reading

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className={active ? 'text-ink-50 truncate text-sm' : 'text-ink-500 truncate text-sm'}>
          {friend.name}
        </p>
        <p className="text-ink-500 numeric mt-0.5 text-xs">
          {daysSinceLastHangout.toString()} days · {friend.lastHangout}
        </p>
      </div>

      {overdue && active && <Badge tone="warn">overdue</Badge>}
      {!active && <Badge tone="sub">lapsed</Badge>}

      <Button
        size="sm"
        aria-label={`Log seeing ${friend.name} today`}
        disabled={log.isPending}
        onClick={() => {
          log.mutate({ id: friend.id, date: toDayKey(services.clock.now()) })
        }}
      >
        <Check size={16} aria-hidden />
      </Button>

      <Button
        variant={confirming ? 'danger' : 'ghost'}
        size="sm"
        aria-label={confirming ? `Confirm removing ${friend.name}` : `Remove ${friend.name}`}
        onClick={() => {
          if (confirming) {
            remove.mutate(friend.id)
            setConfirming(false)
          } else {
            setConfirming(true)
          }
        }}
      >
        {confirming ? 'Sure?' : <Trash2 size={16} aria-hidden />}
      </Button>
    </div>
  )
}

function Circle() {
  const summary = useSocialSummary()
  const add = useAddFriend()
  const services = useServices()

  const [name, setName] = useState('')

  if (summary.data === undefined) return null

  const { friends, activeCount, rating, maintenance } = summary.data

  return (
    <>
      <Card className="mb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-ink-50 font-medium">
              {activeCount.toString()} active · {CIRCLE_RATING_LABELS[rating]}
            </p>
            <p className="text-ink-500 mt-0.5 text-sm">
              {maintenance === undefined
                ? 'Nobody in the circle yet.'
                : `${maintenance.toString()}% kept up`}
            </p>
          </div>
        </div>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim() === '') return

            add.mutate(
              { name, lastHangout: toDayKey(services.clock.now()) },
              {
                onSuccess: () => {
                  setName('')
                },
              },
            )
          }}
        >
          <input
            className={FIELD}
            value={name}
            aria-label="Add somebody to your circle"
            placeholder="Who did you see?"
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
          <Button type="submit" size="sm" disabled={add.isPending}>
            <UserPlus size={16} aria-hidden />
          </Button>
        </form>
      </Card>

      {friends.length === 0 ? (
        <Empty title="Nobody yet">
          Add somebody you have seen recently and they will appear here.
        </Empty>
      ) : (
        <Card className="divide-ink-800 divide-y py-0">
          {friends.map((reading) => (
            <FriendRow key={reading.friend.id} reading={reading} />
          ))}
        </Card>
      )}
    </>
  )
}

export function PartyPage() {
  return (
    <>
      <PageHeader
        title="Party"
        subtitle="The people worth keeping up with, longest unseen first."
      />

      <Section title="Your circle">
        <Circle />
      </Section>
    </>
  )
}
