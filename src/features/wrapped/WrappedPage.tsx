import { RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { useServices, useSettings } from '@/app/context'
import { periodOf, wrappedFor, type Wrapped } from '@/domain/logging/wrapped'
import { toDayKey } from '@/domain/time/day'
import { describeHeft, heftOf } from '@/domain/units/heft'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { useExercises, useRecentWorkouts } from '@/features/train/hooks'
import { useCountUp } from '@/features/train/useCountUp'
import { cn } from '@/lib/cn'

/** How long a card holds before the story moves on by itself. */
const CARD_MS = 5500

interface StoryCard {
  readonly key: string
  /** The card's own wash: a hue, so no two cards in a row look alike. */
  readonly hue: number
  readonly body: ReactNode
}

/**
 * A month or a year told as a story (`wrappedFor`): full screen, one
 * figure a card, a segment per card along the top filling as it plays.
 * Tap the right of the screen to go on, the left to go back; hold to
 * pause. It moves on by itself after a few seconds, as stories do.
 *
 * **A card with nothing to say is not drawn** — a month with no loaded
 * exercise moving up has no "most improved" card rather than one reading
 * nought. The figures are the ones the month and block pages already
 * give; this only paces them.
 */
export function WrappedPage() {
  const { period: key = '' } = useParams()
  const period = periodOf(key)
  const { settings } = useSettings()
  const today = toDayKey(useServices().clock.now())
  const workouts = useRecentWorkouts(2000)
  const exercises = useExercises()
  const navigate = useNavigate()

  const close = useCallback(() => {
    void navigate(key.length === 7 ? `/month/${key}` : '/today')
  }, [navigate, key])

  if (period === undefined) return <Navigate to="/today" replace />
  if (workouts.data === undefined) return <div className="bg-ink-950 fixed inset-0 z-40" />

  const story = wrappedFor(workouts.data, period, today)
  const nameOf = (id: string) => exercises.data?.find((one) => one.id === id)?.name ?? id
  const cards = cardsFor(story, key, settings.units, nameOf)

  return <Story cards={cards} onClose={close} />
}

function Story({
  cards,
  onClose,
}: {
  readonly cards: readonly StoryCard[]
  readonly onClose: () => void
}) {
  const [at, setAt] = useState(0)
  const [held, setHeld] = useState(false)
  /** Restarted on every card change so the segment and the timer agree. */
  const [round, setRound] = useState(0)
  const last = cards.length - 1

  const go = useCallback(
    (to: number) => {
      setAt(Math.max(0, Math.min(last, to)))
      setRound((one) => one + 1)
    },
    [last],
  )

  useEffect(() => {
    if (held || at >= last) return
    const handle = window.setTimeout(() => {
      go(at + 1)
    }, CARD_MS)
    return () => {
      window.clearTimeout(handle)
    }
  }, [at, held, last, go, round])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight' || event.key === ' ') go(at + 1)
      else if (event.key === 'ArrowLeft') go(at - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [at, go, onClose])

  const card = cards[at]
  if (card === undefined) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your training, as a story"
      className="bg-ink-950 fixed inset-0 z-40 overflow-hidden select-none"
      style={{
        backgroundImage: `radial-gradient(120% 70% at 20% 0%, oklch(0.42 0.12 ${String(card.hue)} / 0.55), transparent 65%), radial-gradient(90% 60% at 100% 100%, oklch(0.38 0.1 ${String(card.hue + 60)} / 0.45), transparent 60%)`,
        transition: 'background-image 600ms ease',
      }}
      onPointerDown={() => {
        setHeld(true)
      }}
      onPointerUp={(event) => {
        setHeld(false)
        if ((event.target as Element).closest('button') !== null) return
        if (event.clientX < window.innerWidth / 3) go(at - 1)
        else go(at + 1)
      }}
      onPointerLeave={() => {
        setHeld(false)
      }}
    >
      <div
        className="mx-auto flex h-full max-w-md flex-col px-5"
        style={{
          paddingTop: 'calc(0.75rem + var(--safe-top))',
          paddingBottom: 'calc(1.5rem + var(--safe-bottom))',
        }}
      >
        <div className="flex gap-1" aria-hidden>
          {cards.map((one, index) => (
            <span key={one.key} className="bg-ink-50/20 h-1 flex-1 overflow-hidden rounded-full">
              <span
                key={index === at ? `${one.key}-${String(round)}` : one.key}
                className={cn(
                  'bg-ink-50 block h-full rounded-full',
                  index < at && 'w-full',
                  index > at && 'w-0',
                  index === at && (at === last ? 'w-full' : 'story-fill'),
                )}
                style={
                  index === at && at !== last
                    ? {
                        animationDuration: `${String(CARD_MS)}ms`,
                        animationPlayState: held ? 'paused' : 'running',
                      }
                    : undefined
                }
              />
            </span>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            aria-label="Close the story"
            onClick={onClose}
            className="text-ink-50/80 tap-target flex items-center justify-center rounded-full"
          >
            <X size={22} aria-hidden />
          </button>
        </div>
        <div
          key={card.key}
          className="story-card flex flex-1 flex-col justify-center"
          aria-live="polite"
        >
          {card.body}
        </div>
        {at === last && (
          <button
            type="button"
            onClick={() => {
              go(0)
            }}
            className="text-ink-50 tap-target mx-auto flex items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-semibold"
          >
            <RotateCcw size={16} aria-hidden /> Play again
          </button>
        )}
      </div>
    </div>
  )
}

function cardsFor(
  story: Wrapped,
  key: string,
  units: WeightUnit,
  nameOf: (id: string) => string,
): readonly StoryCard[] {
  const label = periodLabel(key)
  const cards: StoryCard[] = [
    {
      key: 'intro',
      hue: 200,
      body: (
        <>
          <Eyebrow>Your training</Eyebrow>
          <p className="text-ink-50 mt-3 text-6xl leading-none font-semibold tracking-tight">
            {label}
          </p>
          <p className="text-ink-300 mt-4 text-lg">Tap to go on.</p>
        </>
      ),
    },
  ]
  if (story.sessions === 0) {
    cards.push({
      key: 'empty',
      hue: 260,
      body: <Big caption="Nothing finished yet — the story starts with a session." value={0} />,
    })
    return cards
  }
  cards.push({
    key: 'days',
    hue: 165,
    body: (
      <>
        <Eyebrow>You showed up</Eyebrow>
        <Big value={story.days} unit={story.days === 1 ? 'day' : 'days'} />
        <p className="text-ink-300 mt-4 text-lg">
          {story.sessions} sessions, about {Math.round(story.minutes / 60)} hours under the bar.
        </p>
      </>
    ),
  })
  const heft = heftOf(story.tonnage, units)
  cards.push({
    key: 'volume',
    hue: 230,
    body: (
      <>
        <Eyebrow>You moved</Eyebrow>
        <Big value={Math.round(story.tonnage)} unit={units} />
        <p className="text-ink-300 mt-4 text-lg">
          {heft === undefined
            ? `${String(story.sets)} working sets.`
            : `About ${describeHeft(heft)}, over ${String(story.sets)} working sets.`}
        </p>
      </>
    ),
  })
  if (story.heaviest !== undefined) {
    cards.push({
      key: 'heaviest',
      hue: 25,
      body: (
        <>
          <Eyebrow>The heaviest bar</Eyebrow>
          <Big value={story.heaviest.load} unit={units} />
          <p className="text-ink-50 mt-4 text-2xl font-semibold">
            {nameOf(story.heaviest.exerciseId)} × {story.heaviest.reps}
          </p>
          <p className="text-ink-300 mt-1">{dayLabel(story.heaviest.date)}</p>
        </>
      ),
    })
  }
  if (story.mostImproved !== undefined) {
    const lift = story.mostImproved
    cards.push({
      key: 'improved',
      hue: 140,
      body: (
        <>
          <Eyebrow>Moved the most</Eyebrow>
          <p className="text-ink-50 mt-3 text-4xl font-semibold tracking-tight">
            {nameOf(lift.exerciseId)}
            {lift.version === undefined ? '' : ` · ${lift.version}`}
          </p>
          <Big value={Math.round(lift.change * 100)} unit="%" prefix="+" />
          <p className="text-ink-300 mt-4 text-lg">
            {formatLoad(lift.from.load, units)} × {lift.from.reps} →{' '}
            {formatLoad(lift.to.load, units)} × {lift.to.reps}
          </p>
        </>
      ),
    })
  }
  if (story.busiestWeek !== undefined) {
    cards.push({
      key: 'week',
      hue: 290,
      body: (
        <>
          <Eyebrow>Your biggest week</Eyebrow>
          <Big value={story.busiestWeek.sets} unit="sets" />
          <p className="text-ink-300 mt-4 text-lg">
            The week of {dayLabel(story.busiestWeek.monday)}.
          </p>
        </>
      ),
    })
  }
  cards.push({
    key: 'records',
    hue: 85,
    body: (
      <>
        <Eyebrow>Records set</Eyebrow>
        <Big value={story.records} gold />
        <p className="text-ink-300 mt-4 text-lg">
          {story.records === 0
            ? 'A quiet stretch — the bar was building.'
            : 'Each one ahead of every time before it.'}
        </p>
      </>
    ),
  })
  cards.push({
    key: 'outro',
    hue: 200,
    body: (
      <>
        <Eyebrow>That was</Eyebrow>
        <p className="text-ink-50 mt-3 text-6xl leading-none font-semibold tracking-tight">
          {label}
        </p>
        <p className="text-ink-300 mt-4 text-lg">On to the next one.</p>
      </>
    ),
  })
  return cards
}

function Eyebrow({ children }: { readonly children: ReactNode }) {
  return (
    <p className="text-ink-50/70 text-sm font-semibold tracking-[0.18em] uppercase">{children}</p>
  )
}

function Big({
  value,
  unit,
  prefix = '',
  caption,
  gold = false,
}: {
  readonly value: number
  readonly unit?: string
  readonly prefix?: string
  readonly caption?: string
  readonly gold?: boolean
}) {
  const shown = useCountUp(value, 1100)
  return (
    <>
      <p
        className={cn(
          'numeric mt-3 leading-none font-semibold tracking-tight',
          gold ? 'text-[oklch(0.86_0.13_85)]' : 'text-ink-50',
        )}
      >
        <span className="text-[5.5rem]" aria-hidden>
          {prefix}
          {Math.round(shown).toLocaleString()}
        </span>
        <span className="sr-only">
          {prefix}
          {value.toLocaleString()}
        </span>
        {unit !== undefined && <span className="text-ink-50/60 ml-2 text-3xl">{unit}</span>}
      </p>
      {caption !== undefined && <p className="text-ink-300 mt-4 text-lg">{caption}</p>}
    </>
  )
}

function periodLabel(key: string): string {
  if (key.length === 4) return key
  return new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long' })
}

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
