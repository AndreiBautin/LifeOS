import { ArrowDown, ArrowUp, Check, Minus, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useState } from 'react'

import type { AreaReading, MetricReading } from '@/application/use-cases/review/review'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { RATING_LABELS, type RatingOutcome } from '@/domain/game/rating'
import type { MetricId } from '@/domain/ids/ids'

import { useReadout, useReviewDraft, useSaveReview } from './hooks'

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

export function ReviewPage() {
  const result = useReadout()
  const [entering, setEntering] = useState(false)

  const areas = result.data?.areas ?? []
  const scored = areas.filter((area) => area.score !== undefined).length

  return (
    <>
      {/*
        A header, because this is now something you arrive at deliberately
        from the home screen rather than a panel that appeared under a
        corner link. It has no tab of its own and should not: a screen
        opened ten minutes a month has not earned one.
      */}
      <PageHeader
        title="Monthly review"
        subtitle={
          <>
            Once a month, on purpose — a rating that moved because a page was opened would not be a
            monthly rating. The <strong className="text-ink-300">season</strong> on the character
            sheet is the other half of this: that one is live progress, this one is the record that
            lets a direction be judged at all.
          </>
        }
      />

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
    </>
  )
}
