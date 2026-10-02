import { Star } from 'lucide-react'

import { RECORD_LABELS, type RecordKind } from '@/domain/logging/records'

/**
 * A personal record, in gold.
 *
 * Its own colour on purpose: the accent already means "ahead of last
 * time", and a record is a different and rarer claim — better than every
 * time before. It pops and shines once like the progress chip, with a
 * slower, warmer sweep so the two are not mistaken for each other.
 */
export function RecordChip({ kind }: { readonly kind: RecordKind }) {
  return (
    <span
      className="pr-chip numeric relative inline-flex items-center gap-1 overflow-hidden rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
      aria-label={`Personal record: ${RECORD_LABELS[kind]}`}
    >
      <Star size={11} fill="currentColor" aria-hidden />
      {RECORD_LABELS[kind]}
    </span>
  )
}
