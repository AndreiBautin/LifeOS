import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useSettings } from '@/app/context'
import type { Exercise } from '@/domain/exercises/exercise'
import { frameAt, replayFrames } from '@/domain/logging/replay'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { platesToHand, type BarKind } from '@/domain/units/plates'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { Button, Card, CardHeading } from '@/components/shared/primitives'
import { PlateLoader } from '@/features/train/PlateLoader'
import { coloursFor } from '@/features/train/timeline-colours'
import { cn } from '@/lib/cn'

/** However long the session ran, the replay plays in about this long. */
const PLAY_MS = 24_000
/** Time after the last set, so the replay does not end on the final tap. */
const TAIL_MS = 30_000

/**
 * The session again, in order (`replayFrames`): press play and its sets
 * come back as they were logged — the bar loading on the plate picture,
 * each set named, the clock running, the rest between sets counting —
 * a whole session in about twenty-five seconds. Drag the track to scrub.
 *
 * **A different question from the timeline under it.** The timeline is
 * the whole session at once, as bands; this is the session as it was
 * lived, one moment at a time, which is what makes a ninety-minute day
 * feel like the day it was. Silent where the timeline is: a session filed
 * in one go has no moments to replay.
 */
export function SessionReplay({
  workout,
  library,
  units,
}: {
  readonly workout: WorkoutLog
  readonly library: readonly Exercise[]
  readonly units: WeightUnit
}) {
  const { settings } = useSettings()
  const frames = replayFrames(workout)
  const length = (frames.at(-1)?.at ?? 0) + TAIL_MS
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const latest = useRef(t)
  latest.current = t

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let handle = requestAnimationFrame(function step(now) {
      const next = Math.min(length, latest.current + ((now - last) * length) / PLAY_MS)
      last = now
      setT(next)
      if (next >= length) {
        setPlaying(false)
        return
      }
      handle = requestAnimationFrame(step)
    })
    return () => {
      cancelAnimationFrame(handle)
    }
  }, [playing, length])

  if (frames.length === 0) return null

  const frame = frameAt(frames, t)
  const exercise =
    frame === undefined ? undefined : library.find((one) => one.id === frame.exerciseId)
  const kind: BarKind | undefined =
    exercise?.equipment === 'barbell'
      ? 'barbell'
      : exercise?.equipment === 'ez-bar'
        ? 'ez-bar'
        : undefined
  const nextFrame = frames.find((one) => one.at > t)
  const resting =
    frame !== undefined && nextFrame?.entryIndex === frame.entryIndex && t - frame.at > 15_000
  const colours = coloursFor(
    [...new Set(frames.map((one) => one.entryIndex))]
      .toSorted((a, b) => a - b)
      .map((index) => ({
        index,
        warmup: workout.entries[index]?.sets.every((set) => set.isWarmup) ?? false,
      })),
  )

  return (
    <Card>
      <CardHeading
        icon={<Play size={16} aria-hidden />}
        title="Replay"
        action={
          <Button
            variant="ghost"
            size="sm"
            aria-label={
              playing ? 'Pause the replay' : t >= length ? 'Replay again' : 'Play the replay'
            }
            onClick={() => {
              if (t >= length) setT(0)
              setPlaying((on) => !on)
            }}
          >
            {playing ? (
              <Pause size={16} aria-hidden />
            ) : t >= length ? (
              <RotateCcw size={16} aria-hidden />
            ) : (
              <Play size={16} aria-hidden />
            )}
          </Button>
        }
      />

      <div className="flex items-baseline justify-between gap-3">
        <p className="numeric text-ink-50 text-3xl font-semibold tabular-nums">{clockOf(t)}</p>
        <p className="text-ink-500 text-xs">of {clockOf(length - TAIL_MS)}</p>
      </div>

      <div className="mt-3 min-h-[5.5rem]" aria-live="polite">
        {frame === undefined ? (
          <p className="text-ink-500 text-sm">The bar is still empty — press play.</p>
        ) : (
          <div key={`${String(frame.entryIndex)}-${String(frame.at)}`} className="replay-frame">
            <p className="text-ink-50 font-semibold">{exercise?.name ?? frame.exerciseId}</p>
            <p className="text-ink-300 text-sm">
              {frame.warmup ? 'Warm-up' : `Set ${String(frame.setNumber ?? 1)}`}
              {frame.load !== undefined && frame.load > 0 && ` · ${formatLoad(frame.load, units)}`}
              {frame.reps !== undefined && ` × ${String(frame.reps)}`}
              {resting && (
                <span className="text-accent-400"> · resting {clockOf(t - frame.at)}</span>
              )}
            </p>
          </div>
        )}
        {kind !== undefined && frame?.load !== undefined && frame.load > 0 && (
          <div className="mt-2 max-w-md">
            <PlateLoader
              load={frame.load}
              unit={units}
              kind={kind}
              available={platesToHand(settings.plates, units)}
            />
          </div>
        )}
      </div>

      <div className="relative mt-4 h-8">
        <span
          className="bg-ink-800 absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2"
          aria-hidden
        />
        {frames.map((one) => (
          <span
            key={`${String(one.entryIndex)}-${String(one.at)}`}
            aria-hidden
            className={cn(
              'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity',
              one.warmup ? 'size-1.5' : 'size-2.5',
              one.at <= t ? 'opacity-100' : 'opacity-30',
            )}
            style={{
              left: `${String((one.at / length) * 100)}%`,
              background: colours.get(one.entryIndex),
            }}
          />
        ))}
        <span
          aria-hidden
          className="bg-ink-50 absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full"
          style={{ left: `${String((t / length) * 100)}%` }}
        />
        <input
          type="range"
          min={0}
          max={Math.round(length)}
          step={1000}
          value={Math.round(t)}
          aria-label="Scrub through the session"
          aria-valuetext={clockOf(t)}
          onChange={(event) => {
            setPlaying(false)
            setT(Number(event.target.value))
          }}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </div>
    </Card>
  )
}

function clockOf(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, '0')
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${rest}`
    : `${String(minutes)}:${rest}`
}
