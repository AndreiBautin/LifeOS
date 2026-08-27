import { ArrowDown, ArrowUp, Check, Minus, Plus, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'

import { useServices } from '@/app/context'
import type { AreaReading, MetricReading } from '@/application/use-cases/review/review'
import type { FriendReading } from '@/application/use-cases/social/social'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { RATING_LABELS, type RatingOutcome } from '@/domain/game/rating'
import type { MetricId } from '@/domain/ids/ids'
import { CIRCLE_RATING_LABELS } from '@/domain/social/circle'

import {
  useAddFriend,
  useLogHangout,
  useReadout,
  useRemoveFriend,
  useReviewDraft,
  useSaveReview,
  useSocialSummary,
} from './hooks'

/**
 * The monthly review, and what came out of the last one.
 *
 * Ten minutes a month, and it stays that way. Dashboard was built with no
 * streaks, no notifications and no guilt mechanics, and absorbing it into
 * something opened daily is exactly the circumstance in which that gets
 * lost by degrees — so this screen shows a judgement made monthly rather
 * than one that moves because the page was opened. There is no streak here
 * and there is not meant to be one.
 *
 * The numbers the hub can count itself are shown and not editable. Typing
 * in a backlog age the app already knows is how two answers to the same
 * question start disagreeing.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase'

function outcomeTone(outcome: RatingOutcome) {
  if (outcome === 'improved') return 'good' as const
  if (outcome === 'regressed') return 'bad' as const
  if (outcome === 'stagnant') return 'neutral' as const
  return 'sub' as const
}

function OutcomeIcon({ outcome }: { readonly outcome: RatingOutcome }) {
  if (outcome === 'improved') return <ArrowUp size={14} aria-hidden />
  if (outcome === 'regressed') return <ArrowDown size={14} aria-hidden />
  if (outcome === 'stagnant') return <Minus size={14} aria-hidden />
  return null
}

function MetricRow({ reading }: { readonly reading: MetricReading }) {
  const { metric, outcome, latest, previous } = reading

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-ink-100 truncate text-sm">{metric.name}</p>
        <p className="text-ink-500 numeric mt-0.5 text-xs">
          {latest === undefined ? 'not recorded yet' : `${latest.toString()} ${metric.unit}`}
          {previous !== undefined && ` · was ${previous.toString()}`}
        </p>
      </div>

      <Badge tone={outcomeTone(outcome)}>
        <OutcomeIcon outcome={outcome} />
        <span className={outcome === 'insufficient-data' ? '' : 'ml-1'}>
          {RATING_LABELS[outcome]}
        </span>
      </Badge>
    </div>
  )
}

function AreaCard({ area }: { readonly area: AreaReading }) {
  return (
    <Card className="py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-ink-50 font-medium capitalize">{area.area}</p>
        <span className="text-ink-500 numeric text-sm">
          {area.score === undefined ? '—' : `${area.score.toString()}/100`}
        </span>
      </div>

      <div className="divide-ink-800 mt-1 divide-y">
        {area.metrics.map((reading) => (
          <MetricRow key={reading.metric.id} reading={reading} />
        ))}
      </div>
    </Card>
  )
}

/**
 * This month's entry.
 *
 * Measured rows are shown greyed with their value; they exist on this
 * screen so the review is a complete picture of the month, not so anybody
 * can change them.
 */
function MonthlyEntry() {
  const draft = useReviewDraft()
  const save = useSaveReview()
  const [entered, setEntered] = useState<Record<string, string>>({})

  if (draft.data === undefined) return null

  const { month, measured, metrics, started } = draft.data
  const valueFor = (id: MetricId) => entered[id] ?? draft.data.entered[id]?.toString() ?? ''

  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()

          const numbers = Object.fromEntries(
            Object.entries({ ...draft.data.entered, ...entered }).flatMap(([id, raw]) => {
              const value = Number(raw)
              return raw === '' || !Number.isFinite(value) ? [] : [[id, value] as const]
            }),
          )

          save.mutate(numbers)
        }}
      >
        {metrics.map((metric) =>
          metric.source === undefined ? (
            <label key={metric.id} className="block">
              <span className={LABEL}>
                {metric.name} — {metric.unit}
              </span>
              <input
                className={FIELD}
                inputMode="decimal"
                value={valueFor(metric.id)}
                onChange={(event) => {
                  setEntered({ ...entered, [metric.id]: event.target.value })
                }}
              />
            </label>
          ) : (
            <div key={metric.id} className="flex items-center justify-between gap-3 py-1">
              <span className="text-ink-500 text-sm">{metric.name}</span>
              <span className="text-ink-300 numeric text-sm">
                {measured[metric.source] === undefined
                  ? 'nothing to count yet'
                  : `${(measured[metric.source] ?? 0).toString()} ${metric.unit}`}
              </span>
            </div>
          ),
        )}

        <Button type="submit" variant="primary" full disabled={save.isPending}>
          <Check size={16} aria-hidden />
          {started ? `Update ${month}` : `File ${month}`}
        </Button>
      </form>
    </Card>
  )
}

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

export function ReviewPage() {
  const result = useReadout()
  const [entering, setEntering] = useState(false)

  const areas = result.data?.areas ?? []
  const scored = areas.filter((area) => area.score !== undefined).length

  return (
    <>
      <Section
        title="How it is going"
        /*
          The count is of areas that actually scored, not of areas that
          exist. "30 across 6 areas" reads as six areas agreeing on a poor
          month when it is one area speaking and five with nothing yet to
          say — the same distinction the blend itself is careful about.
        */
        description={
          result.data?.score === undefined
            ? 'Two months of readings and this fills in.'
            : `${result.data.score.toString()}/100 from ${scored.toString()} of ${areas.length.toString()} areas`
        }
        action={
          <Button
            size="sm"
            onClick={() => {
              setEntering(!entering)
            }}
          >
            <Plus size={16} aria-hidden />
            {entering ? 'Close' : 'This month'}
          </Button>
        }
      >
        {entering && (
          <div className="mb-4">
            <MonthlyEntry />
          </div>
        )}

        {areas.length === 0 ? (
          <Empty title="Nothing tracked yet">
            Areas appear here as the hub starts having something to count.
          </Empty>
        ) : (
          <div className="space-y-2">
            {areas.map((area) => (
              <AreaCard key={area.area} area={area} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Your circle" description="Longest unseen first.">
        <Circle />
      </Section>
    </>
  )
}

function toDayKey(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}
