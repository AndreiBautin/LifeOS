import { CheckCircle2, Dumbbell, Play, Plus, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useServices, useSettings } from '@/app/context'
import { Badge, Button } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { strengthStandings } from '@/domain/strength/standards'
import { useStartWorkout, useWeekSummary } from '@/features/train/hooks'
import { splitDayLabel, useNextSession } from '@/features/train/useNextSession'

/**
 * The top of the page: what the app is, what is next, and the button that
 * starts it.
 *
 * **It replaced a bare wordmark.** _"I don't like the plain LiftOS header
 * in lieu of a proper hero banner"_ — the page opened on a word and a
 * gear, and the session you came to start sat a card's height below. The
 * hero leads with that session by name and puts Start beside it, so on a
 * phone the primary action is on the first screen without scrolling.
 *
 * **Three numbers and no more**, each a different question: am I on track
 * this week, how consistent have I been, and how strong am I. The weekly
 * sets live in the card that breaks them down by muscle rather than here,
 * so no figure is drawn twice.
 */
export function HeroBanner() {
  const { clock } = useServices()
  const { settings } = useSettings()
  const { day, week, program, when, doneToday, restDay } = useNextSession()
  const summary = useWeekSummary()
  const startWorkout = useStartWorkout()

  const { total } = strengthStandings({
    estimatedMaxes: settings.estimatedMaxes,
    ...(settings.bodyweight !== undefined ? { bodyweight: settings.bodyweight } : {}),
  })

  const planned = program?.blocks[0]?.weeks[0]?.days.length
  const label = day === undefined ? undefined : splitDayLabel(day.label)
  const today = clock.now().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const start = (freestyle?: boolean) => {
    startWorkout.mutate(freestyle === true ? { freestyleTitle: 'Open session' } : undefined, {
      onSuccess: () => {
        window.scrollTo({ top: 0 })
      },
    })
  }

  return (
    <section className="hero-panel p-5 sm:p-6 lg:p-8" aria-labelledby="hero-title">
      <Plate />

      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="from-accent-400 to-accent-600 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br text-[#06141a] shadow-[0_8px_24px_-8px_var(--color-accent-500)]"
            aria-hidden
          >
            <Dumbbell size={20} strokeWidth={2.25} />
          </span>
          <div>
            <h1 className="text-ink-50 text-lg leading-tight font-semibold tracking-tight">
              LiftOS
            </h1>
            <p className="text-ink-500 text-xs">{today}</p>
          </div>
        </div>
        <Link
          viewTransition
          to="/settings"
          aria-label="Settings"
          className={buttonStyles({ variant: 'ghost', size: 'sm' })}
        >
          <Settings size={18} aria-hidden />
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0">
          <p className="text-accent-400 flex flex-wrap items-center gap-x-2 text-xs font-semibold tracking-[0.14em] uppercase">
            {/*
              **The day is the date's.** "Today" while today's session is
              there to do; once it is filed, or on a rest day, the hero
              says so and names when the next one falls, because the
              calendar — not a queue — is what decides it.
            */}
            {doneToday && (
              <span className="text-good-500 flex items-center gap-1 tracking-normal normal-case">
                <CheckCircle2 size={14} aria-hidden />
                Today’s done ·
              </span>
            )}
            {restDay && !doneToday && (
              <span className="text-ink-300 tracking-normal normal-case">Rest day ·</span>
            )}
            <span>
              {when === 'today'
                ? 'Today'
                : when === 'tomorrow'
                  ? 'Tomorrow'
                  : (label?.weekday ?? 'Up next')}
            </span>
            {week?.label !== undefined && (
              <span className="text-ink-500 tracking-normal normal-case">· {week.label}</span>
            )}
            {week?.isDeload === true && <Badge tone="warn">deload</Badge>}
          </p>
          <h2
            id="hero-title"
            className="text-ink-50 mt-2 text-4xl font-semibold tracking-tight sm:text-5xl"
          >
            {label?.name ?? 'Your next session'}
          </h2>
          {day?.focus !== undefined && (
            <p className="text-ink-300 mt-2 max-w-prose text-sm">{day.focus}</p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="lg"
              className="basis-full sm:basis-auto"
              disabled={day === undefined || startWorkout.isPending}
              onClick={() => {
                start()
              }}
            >
              <Play size={20} aria-hidden />
              {when === 'today' || when === undefined ? 'Start session' : 'Start it early'}
            </Button>
            <Button
              variant="ghost"
              className="flex-1 sm:flex-none"
              disabled={startWorkout.isPending}
              onClick={() => {
                start(true)
              }}
            >
              <Plus size={16} aria-hidden />
              Open session
            </Button>
          </div>
        </div>

        <dl className="border-ink-800/80 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border bg-[color-mix(in_oklab,var(--color-ink-800)_70%,transparent)] lg:w-80">
          <Stat
            label="This week"
            value={summary.data?.sessions}
            suffix={planned === undefined ? undefined : `/${String(planned)}`}
          />
          <Stat label="Week streak" value={summary.data?.streakWeeks} />
          <Stat
            label="SBD total"
            value={total.max === undefined ? undefined : Math.round(total.max)}
            suffix=" lb"
          />
        </dl>
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  suffix,
}: {
  readonly label: string
  readonly value: number | undefined
  readonly suffix?: string | undefined
}): ReactNode {
  return (
    <div className="bg-ink-950/60 px-3 py-3">
      <dt className="text-ink-500 text-[0.7rem] font-medium tracking-wide uppercase">{label}</dt>
      <dd className="numeric text-ink-50 mt-1 text-xl font-semibold">
        {value ?? '—'}
        {value !== undefined && suffix !== undefined && (
          <span className="text-ink-500 text-sm font-normal">{suffix}</span>
        )}
      </dd>
    </div>
  )
}

/**
 * A bumper plate, cropped by the panel's edge: the one illustration on
 * the page, and it says what the app is about without a word. Drawn, not
 * fetched, and `aria-hidden` — it carries no information.
 */
function Plate() {
  const slots = Array.from({ length: 6 }, (_, index) => index * 60)
  return (
    <svg
      viewBox="0 0 200 200"
      className="hero-plate pointer-events-none absolute -top-16 -right-20 -z-10 size-72 opacity-[0.16] sm:size-96 lg:-top-24 lg:-right-16"
      aria-hidden
    >
      <g fill="none" stroke="var(--color-accent-400)">
        <circle cx="100" cy="100" r="96" strokeWidth="3" />
        <circle cx="100" cy="100" r="84" strokeWidth="1" />
        <circle cx="100" cy="100" r="44" strokeWidth="2" />
        <circle cx="100" cy="100" r="16" strokeWidth="6" />
        {slots.map((angle) => (
          <path
            key={angle}
            d="M100 26 a74 74 0 0 1 28 5.5"
            strokeWidth="9"
            strokeLinecap="round"
            transform={`rotate(${String(angle)} 100 100)`}
          />
        ))}
      </g>
    </svg>
  )
}
