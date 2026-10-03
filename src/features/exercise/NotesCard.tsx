import { NotebookPen } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useSettings } from '@/app/context'
import type { ExerciseId } from '@/domain/ids/ids'
import { exerciseNotes, type ExerciseNote } from '@/domain/logging/exercise-notes'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { Card, CardHeading } from '@/components/shared/primitives'
import { useRecentWorkouts } from '@/features/train/hooks'

const SHOWN = 4

/**
 * What has been written about this exercise, as a thread (`exerciseNotes`).
 *
 * A note otherwise lives for one session: written on a set, shown beside
 * "Last" next time, and gone. **Drawn on a rail, newest at the top**, each
 * note hung from its day — a link to that session — with the set it was
 * written on, so "twinged" reads with the 200 × 4 it happened under.
 * Silent until there is a note; four shown and the rest one tap away.
 */
export function NotesCard({ exerciseId }: { readonly exerciseId: ExerciseId }) {
  const { settings } = useSettings()
  const workouts = useRecentWorkouts(1000)
  const [all, setAll] = useState(false)

  if (workouts.data === undefined) return null
  const notes = exerciseNotes(workouts.data, exerciseId)
  if (notes.length === 0) return null
  const shown = all ? notes : notes.slice(0, SHOWN)

  return (
    <Card>
      <CardHeading icon={<NotebookPen size={16} aria-hidden />} title="Notes" />
      <ol className="border-ink-800 relative ml-1.5 space-y-3 border-l pl-4">
        {shown.map((note, at) => (
          <li key={`${note.workoutId}-${String(at)}`} className="relative">
            <span
              className="bg-accent-500 ring-ink-900 absolute top-1.5 -left-[1.3rem] size-2 rounded-full ring-4"
              aria-hidden
            />
            <p className="text-ink-500 flex flex-wrap items-baseline gap-x-2 text-[0.7rem]">
              <Link
                viewTransition
                to={`/session/${note.workoutId}`}
                className="hover:text-accent-400 numeric"
              >
                {dayLabel(note.date)}
              </Link>
              {note.set !== undefined && <span>{setLabel(note.set, settings.units)}</span>}
            </p>
            <p className="text-ink-100 mt-0.5 text-sm leading-snug">{note.text}</p>
          </li>
        ))}
      </ol>
      {!all && notes.length > SHOWN && (
        <button
          type="button"
          onClick={() => {
            setAll(true)
          }}
          className="text-accent-400 tap-target mt-1 text-xs font-semibold"
        >
          {notes.length - SHOWN} older
        </button>
      )}
    </Card>
  )
}

function setLabel(set: NonNullable<ExerciseNote['set']>, units: WeightUnit): string {
  const work =
    set.load !== undefined && set.reps !== undefined
      ? ` · ${formatLoad(set.load, units)} × ${String(set.reps)}`
      : set.reps === undefined
        ? ''
        : ` · ${String(set.reps)} reps`
  return `Set ${String(set.number)}${work}`
}

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
