import { Quote } from 'lucide-react'
import { useId, useState } from 'react'

import { useSettings } from '@/app/context'
import { CUE_LIMIT } from '@/domain/settings/settings'
import { Card } from '@/components/shared/primitives'

/**
 * The lifter's own cue for an exercise, written here and read in the
 * player under the exercise's name — "elbows under the bar" where it is
 * needed, rather than in a notes app that is not open at the rack.
 *
 * Saved when the field is left; blank removes it.
 */
export function CueCard({ exerciseId }: { readonly exerciseId: string }) {
  const { settings, update } = useSettings()
  const stored = settings.exerciseCues?.[exerciseId] ?? ''
  const [text, setText] = useState(stored)
  const id = useId()

  const save = () => {
    const cue = text.trim().slice(0, CUE_LIMIT)
    if (cue === stored) return
    const others = Object.fromEntries(
      Object.entries(settings.exerciseCues ?? {}).filter(([one]) => one !== exerciseId),
    )
    update({ exerciseCues: cue === '' ? others : { ...others, [exerciseId]: cue } })
  }

  return (
    <Card>
      <label htmlFor={id} className="text-ink-500 mb-2 flex items-center gap-2 text-sm">
        <Quote size={16} aria-hidden />
        Your cue
        <span className="text-ink-500 ml-auto text-xs">Shown in the session</span>
      </label>
      <input
        id={id}
        type="text"
        maxLength={CUE_LIMIT}
        value={text}
        placeholder="Elbows under the bar, push the floor away…"
        onChange={(event) => {
          setText(event.target.value)
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="bg-ink-900 border-ink-800 text-ink-100 placeholder:text-ink-500 w-full rounded-lg border px-3 py-2 text-sm"
      />
    </Card>
  )
}
