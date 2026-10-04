import { Pencil, SkipForward, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { LoggedSet } from '@/domain/logging/workout-log'
import { describePrescription } from '@/domain/programs/prescription'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { Button } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

import { canLogPlanned } from './planned'

const RING = 2 * Math.PI * 54

/**
 * One set, as large as the screen allows: the exercise, which set of how
 * many, the planned bar in type you can read from the floor, and one
 * button that logs it as planned.
 *
 * **Everything it does, the player already does** — logging, skipping,
 * opening the editor and turning the page are the player's own `logAt`,
 * `skipAt`, `setOpenSet` and `go`, passed in. A focus view with its own
 * logging would be a second place for a set to be filed differently.
 *
 * While resting, the bar gives way to the countdown, read off the same
 * `startedAt` and length the rest timer uses — but not its +30s or its
 * pause, which live in that card. Leaving focus brings the card back with
 * both.
 */
export function FocusView({
  name,
  sets,
  bodyweight,
  units,
  rest,
  nextName,
  onLog,
  onSkip,
  onEdit,
  onNext,
  onClose,
}: {
  readonly name: string
  readonly sets: readonly LoggedSet[]
  readonly bodyweight: boolean
  readonly units: WeightUnit
  readonly rest: { readonly startedAt: number; readonly seconds: number } | undefined
  readonly nextName: string | undefined
  readonly onLog: (setIndex: number) => void
  readonly onSkip: (setIndex: number) => void
  readonly onEdit: (setIndex: number) => void
  readonly onNext: () => void
  readonly onClose: () => void
}) {
  const working = sets.map((set, at) => ({ set, at })).filter(({ set }) => !set.isWarmup)
  const pending = working.find(({ set }) => set.outcome === 'pending')
  const number = pending === undefined ? working.length : working.indexOf(pending) + 1

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Focus: ${name}`}
      className="bg-ink-950 fixed inset-0 z-40 flex flex-col px-5"
      style={{
        paddingTop: 'calc(1rem + var(--safe-top))',
        paddingBottom: 'calc(1.25rem + var(--safe-bottom))',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-accent-400 text-xs font-semibold tracking-[0.14em] uppercase">
            {pending === undefined ? 'Done' : `Set ${String(number)} of ${String(working.length)}`}
          </p>
          <h2 className="text-ink-50 mt-1 truncate text-xl font-semibold">{name}</h2>
        </div>
        <Button variant="ghost" size="sm" aria-label="Leave focus" onClick={onClose}>
          <X size={18} aria-hidden />
        </Button>
      </div>

      <div className="flex gap-1.5 pt-4" aria-hidden>
        {working.map(({ set, at }) => (
          <span
            key={at}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              set.outcome === 'completed'
                ? 'bg-accent-500'
                : set.outcome === 'pending'
                  ? set === pending?.set
                    ? 'bg-ink-300'
                    : 'bg-ink-800'
                  : 'bg-ink-700',
            )}
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        {rest !== undefined ? (
          <>
            <Countdown {...rest} />
            {pending !== undefined && (
              <p className="text-ink-300 mt-5 text-sm">
                Next{' '}
                <span className="numeric text-ink-50 font-semibold">
                  {upNext(pending.set, bodyweight, units)}
                </span>
              </p>
            )}
          </>
        ) : pending === undefined ? (
          <p className="text-ink-300 text-lg">
            {nextName === undefined ? 'Every set is settled.' : `Up next: ${nextName}`}
          </p>
        ) : (
          <Planned key={pending.at} set={pending.set} bodyweight={bodyweight} units={units} />
        )}
      </div>

      <div className="space-y-3">
        {pending !== undefined ? (
          <>
            <Button
              variant="primary"
              full
              className="h-16 text-lg"
              onClick={() => {
                if (canLogPlanned(pending.set)) onLog(pending.at)
                else onEdit(pending.at)
              }}
            >
              {canLogPlanned(pending.set) ? 'Log as planned' : 'Enter the set'}
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  onSkip(pending.at)
                }}
              >
                <SkipForward size={16} aria-hidden /> Skip
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  onEdit(pending.at)
                }}
              >
                <Pencil size={16} aria-hidden /> Edit
              </Button>
            </div>
          </>
        ) : nextName !== undefined ? (
          <Button variant="primary" full className="h-16 text-lg" onClick={onNext}>
            Next exercise
          </Button>
        ) : (
          <Button variant="outline" full className="h-16 text-lg" onClick={onClose}>
            Back to the session
          </Button>
        )}
      </div>
    </div>
  )
}

function Planned({
  set,
  bodyweight,
  units,
}: {
  readonly set: LoggedSet
  readonly bodyweight: boolean
  readonly units: WeightUnit
}) {
  const reps =
    set.plannedReps !== undefined
      ? String(set.plannedReps)
      : set.prescription.reps.kind === 'time'
        ? describePrescription(set.prescription)
        : undefined
  const load =
    set.plannedLoad === undefined || (bodyweight && set.plannedLoad === 0)
      ? undefined
      : formatLoad(set.plannedLoad, units)
  const [amount, unit] = load === undefined ? [undefined, undefined] : splitUnit(load)

  return (
    <div className="focus-enter">
      {amount === undefined ? (
        <p className="text-ink-50 text-5xl font-semibold">{bodyweight ? 'Bodyweight' : 'Open'}</p>
      ) : (
        <p className="numeric text-ink-50 leading-none font-semibold tracking-tight">
          <span className="text-[6.5rem] sm:text-[8rem]">{amount}</span>
          <span className="text-ink-500 ml-2 text-2xl">{unit}</span>
        </p>
      )}
      {reps !== undefined && (
        <p className="numeric text-accent-400 mt-3 text-4xl font-semibold">× {reps}</p>
      )}
      {amount === undefined && !bodyweight && (
        <p className="text-ink-500 mt-3 text-sm">No load planned yet — enter what you lift.</p>
      )}
    </div>
  )
}

function Countdown({
  startedAt,
  seconds,
}: {
  readonly startedAt: number
  readonly seconds: number
}) {
  const [now, setNow] = useState(startedAt)
  useEffect(() => {
    const tick = (): void => {
      setNow(Date.now())
    }
    tick()
    const handle = window.setInterval(tick, 250)
    return () => {
      window.clearInterval(handle)
    }
  }, [])
  const left = Math.max(0, startedAt + seconds * 1000 - now)
  const whole = Math.ceil(left / 1000)
  const done = left <= 0
  return (
    <div className="relative size-64">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r="54" className="stroke-ink-800 fill-none" strokeWidth="6" />
        <circle
          cx="60"
          cy="60"
          r="54"
          className={cn(
            'fill-none transition-[stroke-dashoffset] duration-300',
            done ? 'stroke-good-500' : 'stroke-accent-500',
          )}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - left / (seconds * 1000))}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-ink-500 text-xs tracking-[0.14em] uppercase">{done ? 'Go' : 'Rest'}</p>
        <p className="numeric text-ink-50 text-6xl font-semibold" role="timer" aria-live="off">
          {String(Math.floor(whole / 60))}:{String(whole % 60).padStart(2, '0')}
        </p>
      </div>
    </div>
  )
}

/** "215 lb" → ["215", "lb"]; a load with no unit word keeps it whole. */
function splitUnit(text: string): readonly [string, string | undefined] {
  const at = text.lastIndexOf(' ')
  return at === -1 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)]
}

/** The set the rest leads to, in one line: "215 lb × 3". */
function upNext(set: LoggedSet, bodyweight: boolean, units: WeightUnit): string {
  const load =
    set.plannedLoad === undefined || (bodyweight && set.plannedLoad === 0)
      ? bodyweight
        ? 'Bodyweight'
        : 'Open'
      : formatLoad(set.plannedLoad, units)
  return set.plannedReps === undefined ? load : `${load} × ${String(set.plannedReps)}`
}
