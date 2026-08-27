import { ClipboardList } from 'lucide-react'
import { useState } from 'react'

import { ATLAS_CATEGORIES } from '@/application/use-cases/atlas/atlas'
import type { BulkCaptureParseResult } from '@/application/use-cases/atlas/ParseBulkCapture'
import { Button, Card } from '@/components/shared/primitives'
import type { CategoryId } from '@/domain/atlas/category/CategoryDefinition'

import { useBulkAddPlaces } from './hooks'

/**
 * Twelve places out of a message, in one paste.
 *
 * The whole point is not having to tidy the input first, so list markers,
 * blank lines and repeats are all handled. What it will not do is swallow
 * a line quietly: everything the parse dropped is named underneath, with
 * the reason, because a paste of twelve that saves nine without saying so
 * is worse than one that refuses outright.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase'

function Skipped({ result }: { readonly result: BulkCaptureParseResult }) {
  const lines: string[] = []
  if (result.alreadySaved.length > 0) lines.push(`already saved: ${result.alreadySaved.join(', ')}`)
  if (result.duplicates.length > 0) lines.push(`repeated: ${result.duplicates.join(', ')}`)
  if (result.tooLong.length > 0) lines.push(`too long: ${result.tooLong.length.toString()}`)
  if (result.truncated > 0) lines.push(`over the limit: ${result.truncated.toString()}`)

  if (lines.length === 0) return null

  return <p className="text-ink-500 text-xs">Skipped — {lines.join(' · ')}</p>
}

export function PasteList() {
  const bulk = useBulkAddPlaces()
  const [text, setText] = useState('')
  const [categoryId, setCategoryId] = useState<string>(ATLAS_CATEGORIES[0]?.id ?? '')

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim() === '') return
          bulk.mutate(
            { text, categoryId: categoryId as CategoryId },
            {
              onSuccess: () => {
                setText('')
              },
            },
          )
        }}
      >
        <label className="block">
          <span className={LABEL}>One place per line</span>
          <textarea
            className={`${FIELD} h-28 resize-none py-2`}
            value={text}
            placeholder={'Kiln\nSmoking Goat\n- Brat'}
            onChange={(event) => {
              setText(event.target.value)
            }}
          />
        </label>

        <label className="block">
          <span className={LABEL}>Kind</span>
          <select
            className={`${FIELD} h-11`}
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value)
            }}
          >
            {ATLAS_CATEGORIES.map((one) => (
              <option key={one.id} value={one.id}>
                {one.label}
              </option>
            ))}
          </select>
        </label>

        {bulk.data !== undefined && (
          <div className="space-y-1">
            <p className="text-ink-300 text-sm">
              Saved {bulk.data.added.toString()}
              {bulk.data.added === 1 ? ' place' : ' places'}.
            </p>
            <Skipped result={bulk.data.skipped} />
          </div>
        )}

        <Button type="submit" variant="primary" full disabled={bulk.isPending}>
          <ClipboardList size={16} aria-hidden />
          Save the list
        </Button>
      </form>
    </Card>
  )
}
