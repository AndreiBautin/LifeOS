import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import type { Exercise } from '@/domain/exercises/exercise'
import type { ProgramDay } from '@/domain/programs/program'
import { inSections } from '@/domain/programs/program'
import type { SetPrescription } from '@/domain/programs/prescription'
import { describeReps } from '@/domain/programs/prescription'

/**
 * The next-session preview, split out of `TrainPage` when its at-a-glance
 * content moved to `TrainZone` for the Today fold — shared by both the
 * folded card and (were it ever needed again) a standalone screen,
 * rather than living inside a component only one of them still renders.
 */

/**
 * A slot summarised in one line: "4 × 3–6", "1–3 × 5", or "20 min".
 *
 * A single timed set drops the count, because "1 × 20 min" invites the
 * reader to work out what one of a twenty-minute walk is.
 *
 * **A back-off block is written as a range**, because its count is not a
 * prescription. The number of back-offs is discovered in the session —
 * you keep going until a set comes in at the stop RPE — so "4 × 5" was
 * the shape of a fixed prescription making a promise the block does not
 * make. A lifter who grinds out all three because the page said three has
 * had the stopping rule taken away from them, which is the whole of what
 * makes this RTS rather than a percentage program.
 *
 * The three is still real: it is the cap, materialised as slots and
 * counted as volume, so the week is planned against the ceiling rather
 * than against a session that stops early.
 */
function describeSlot(sets: readonly SetPrescription[]): string {
  const first = sets.find((set) => set.isWarmup !== true) ?? sets[0]
  if (first === undefined) return '—'

  const label = describeReps(first.reps)
  if (sets.length === 1 && first.reps.kind === 'time') return label

  const count = countedSets(sets)

  // A deload caps the back-offs at one, and "1–1" is not a range.
  if (first.load.kind === 'rts-backoff' && count > 1) {
    return `1–${String(count)} × ${label}`
  }

  return `${String(count)} × ${label}`
}

/**
 * Sets to show for a slot.
 *
 * Working sets, except where a slot is *entirely* warm-up — a mobility
 * drill or a foam-rolling block — in which case counting only working
 * sets renders it as "0 ×", which reads as an error rather than as a
 * warm-up.
 */
function countedSets(sets: readonly SetPrescription[]): number {
  const working = sets.filter((set) => set.isWarmup !== true).length
  return working > 0 ? working : sets.length
}

/**
 * The next session, cut into the parts it is performed in.
 *
 * A flat list was right at nine rows and stopped being right at sixteen.
 * Splitting the warm-up into a row per movement was the change that did
 * it — correct, because the session screen ticks off slots and seven
 * areas inside one row are seven things you skip together, but it put a
 * third of the preview in front of the part a lifter is actually
 * checking.
 *
 * The headings come from `inSections`, which groups **consecutive** runs
 * and therefore cannot reorder anything. This screen is a preview of a
 * session whose order three separate passes argued about; it has no
 * business holding a fourth opinion.
 */
export function SessionOutline({
  day,
  library,
}: {
  readonly day: ProgramDay
  readonly library: readonly Exercise[]
}) {
  /*
   * The warm-up folds and nothing else does.
   *
   * It is the one part that is the same every session and asks for no
   * decision — you are not scanning it to find out what today is. Every
   * other section is; folding those would hide the answer behind a tap.
   * The count stays visible so a folded section still says how much is
   * in it, and the player walks every slot regardless of what is folded
   * here.
   */
  const [warmupOpen, setWarmupOpen] = useState(false)

  const nameOf = (slot: ProgramDay['slots'][number]): string => {
    if (slot.exercise.kind !== 'specific') return slot.exercise.label
    const id = slot.exercise.exerciseId
    return library.find((exercise) => exercise.id === id)?.name ?? 'Unknown exercise'
  }

  return (
    <div className="space-y-3">
      {inSections(day.slots).map((section, index) => {
        const folds = section.title === 'Warm-up'
        const open = !folds || warmupOpen
        const count = `${String(section.slots.length)} ${section.slots.length === 1 ? 'movement' : 'movements'}`

        const title = (
          <span className="text-ink-700 text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
            {section.title}
          </span>
        )

        return (
          <div key={`${section.title}-${String(index)}`}>
            {folds ? (
              /*
               * The chevron sits on the right, with the count.
               *
               * Leading it would indent this heading past the four that
               * do not fold, and a ragged left edge across five headings
               * is a worse trade than a disclosure arrow in an
               * unconventional corner. The count is what earns the right
               * side here — folded, it is the only thing saying how much
               * is behind the tap.
               */
              <button
                type="button"
                aria-expanded={open}
                className="tap-target border-ink-800 bg-ink-900/50 text-ink-500 hover:text-ink-300 flex w-full items-center justify-between gap-2 rounded-lg border px-3 text-left"
                onClick={() => {
                  setWarmupOpen(!warmupOpen)
                }}
              >
                {title}
                <span className="flex items-center gap-1 text-xs">
                  {count}
                  {open ? (
                    <ChevronDown size={14} aria-hidden />
                  ) : (
                    <ChevronRight size={14} aria-hidden />
                  )}
                </span>
              </button>
            ) : (
              title
            )}

            {open && (
              <ul className="divide-ink-800/70 mt-1 divide-y">
                {section.slots.map((slot) => (
                  <li
                    key={slot.id}
                    className="text-ink-100 flex items-baseline justify-between gap-3 py-1.5 text-sm"
                  >
                    <span className="truncate">{nameOf(slot)}</span>
                    <span className="text-ink-500 numeric shrink-0 text-xs">
                      {describeSlot(slot.sets)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
