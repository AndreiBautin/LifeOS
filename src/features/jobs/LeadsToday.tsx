import { Briefcase, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge, Button, Card } from '@/components/shared/primitives'
import { useRetryToday } from '@/features/shared/useRetryToday'

import { DAILY_SWEEP, useMorningLeads } from './useDailySweep'

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
  /*
   * Whichever render fetched it. The gate remembers the morning's
   * answer, so this card is still here at noon -- it used to vanish the
   * moment the day was marked, taking thirty leads with it.
   */
  const sweep = useMorningLeads()

  /*
   * The same missing control the digest had. `once-a-day.ts` promised a
   * failed morning was "surfaced as `failed-earlier` with a manual
   * control beside it" — there was none here either, so a sweep that
   * failed on a resuming phone reported "The boards could not be read"
   * until midnight with nothing able to try again.
   */
  const retry = useRetryToday((all) => all.sweepStore, DAILY_SWEEP)

  if (sweep === undefined) return null

  const { leads, read, failures } = sweep

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

      {/*
        Outside the Link, because a button inside an anchor is a control
        whose press navigates as well as fires.
      */}
      {failures.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1"
          onClick={() => {
            retry()
          }}
        >
          <RefreshCw size={14} aria-hidden />
          Try again
        </Button>
      )}
    </Card>
  )
}
