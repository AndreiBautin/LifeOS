import { Briefcase } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge, Card } from '@/components/shared/primitives'

import { useDailySweep } from './useDailySweep'

/**
 * What this morning's read of the boards turned up, on Today.
 *
 * **Silent when there is nothing to say**, like every other area card:
 * no boards followed, nothing new, or the sweep has not run means no
 * card at all rather than a row saying zero. A screen whose job is what
 * the day asks for should not carry a permanent line about a search that
 * found nothing.
 *
 * It reports rather than lists. Deciding which lead to apply to is
 * several judgements — the score, the employer, the posting — and that
 * belongs on the screen built for it; what Today answers is whether
 * there is anything worth going to look at.
 */
export function LeadsToday() {
  const sweep = useDailySweep()
  const outcome = sweep.data

  if (outcome?.kind !== 'swept') return null

  const { leads, read, failures } = outcome.sweep

  // Nothing found and nothing broken is not news.
  if (leads.length === 0 && failures.length === 0) return null

  const best = leads[0]

  return (
    <Card>
      <Link to="/jobs" className="flex items-center gap-3">
        <Briefcase size={18} className="text-ink-500 shrink-0" aria-hidden />

        <div className="min-w-0 flex-1">
          <p className="text-ink-50 text-sm font-medium">
            {leads.length === 0
              ? 'The boards could not be read'
              : `${String(leads.length)} lead${leads.length === 1 ? '' : 's'} this morning`}
          </p>
          <p className="text-ink-700 truncate text-xs">
            {best === undefined
              ? failures.map((one) => one.reason).join(' · ')
              : `${best.posting.title} · ${best.posting.boardToken} — and ${String(read)} postings read`}
          </p>
        </div>

        {best !== undefined && (
          <Badge tone={best.scored.score >= 70 ? 'good' : 'neutral'}>{best.scored.score}</Badge>
        )}
      </Link>
    </Card>
  )
}
