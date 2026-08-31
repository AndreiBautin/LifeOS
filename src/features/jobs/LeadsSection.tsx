import { Search } from 'lucide-react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Link } from 'react-router-dom'

import { useServices, useSettings } from '@/app/context'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { PROVIDER_LABELS } from '@/domain/jobs/boards'
import { canSweep } from '@/domain/jobs/search'
import { PROJECTS } from '../projects/hooks'
import { countByEmployer, sweepBoards, type LeadSweep } from '@/application/use-cases/jobs/leads'
import { appliedLinks, approveLead } from '@/application/use-cases/jobs/approve'
import type { FetchedPosting } from '@/domain/jobs/boards'
import { logger } from '@/shared/logging/logger'

/**
 * Leads: every open posting on the boards you follow, scored.
 *
 * **Read once on the first open of a day, and on demand from the
 * button. Neither is a timer.** The distinction is worth keeping
 * because "daily fetch" sounds like a scheduled job and cannot be one:
 * there is no server, and iOS gives a home-screen web app no background
 * fetch — the same ceiling that stops a daily from ringing. What is
 * available is a sweep that happens when you next open the app, which
 * on something opened every morning is most of the way there. See
 * `sweepIfDue`; the marker is per-device and the boards are read one at
 * a time, which is the restraint the map's geocoder shows Nominatim.
 *
 * **The search itself lives in settings**, not in this component. It was
 * six `useState` calls, wiped by any navigation — and this panel is
 * reached *from* the applications above it, so tapping through and
 * coming back is the ordinary path rather than an edge case.
 */

export function LeadsSection() {
  const services = useServices()
  const client = useQueryClient()

  /*
   * Which links are already spent, so a lead that has been applied to
   * reads as one. A sweep re-reads the whole board, so the same posting
   * comes back every time — without this the list quietly invites the
   * same application twice.
   */
  const applied = useQuery({
    queryKey: ['jobs', 'applied-links'],
    queryFn: () => appliedLinks(services),
  })

  const approve = useMutation({
    mutationFn: (posting: FetchedPosting) => approveLead(posting, services),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['jobs'] })
      void client.invalidateQueries({ queryKey: PROJECTS })
      void client.invalidateQueries({ queryKey: ['character'] })
    },
    onError: (error: unknown) => {
      logger.error('jobs.approve-failed', { message: String(error) })
    },
  })

  /*
   * The search comes from settings rather than from this component.
   *
   * It used to be six `useState` calls, which meant every board slug and
   * filter was wiped by any navigation — and the panel is reached *from*
   * the applications above it, so tapping through and coming back is the
   * ordinary path. It also left three of the six filters unreachable:
   * both exclusion lists and the score floor were literals here.
   */
  const { settings } = useSettings()
  const search = settings.jobSearch

  const [result, setResult] = useState<LeadSweep | undefined>(undefined)

  const sweep = useMutation({
    mutationFn: () => sweepBoards(search.sources, search.profile, search.minimumScore, services),
    onSuccess: setResult,
    onError: (error: unknown) => {
      logger.error('jobs.sweep-failed', { message: String(error) })
    },
  })

  const byEmployer = result === undefined ? undefined : countByEmployer(result.leads)

  return (
    <Section title="Leads" description="Public ATS boards, read on demand and scored">
      <Card className="space-y-3">
        {/*
          What the search is, said in a line, with the way to change it
          beside it. The panel reports rather than asks — the form lives
          on Settings, because this is a screen you act on and that is a
          screen you decide on.
        */}
        {canSweep(search) ? (
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-ink-500 min-w-0 flex-1 text-xs">
              {search.sources.length === 1 ? '1 board' : `${String(search.sources.length)} boards`}
              {search.profile.titleIncludes.length > 0 &&
                ` · ${search.profile.titleIncludes.join(', ')}`}
              {search.profile.remoteOnly && ' · remote only'}
            </p>
            <Link to="/settings" className="text-accent-400 shrink-0 text-xs">
              Change
            </Link>
          </div>
        ) : (
          <Empty title="No boards followed">
            Greenhouse, Lever and Ashby publish every open role as JSON, with no account and no key.{' '}
            <Link to="/settings" className="text-accent-400">
              Add a board in Settings
            </Link>{' '}
            and they are read each morning.
          </Empty>
        )}

        <Button
          variant="primary"
          full
          disabled={sweep.isPending || !canSweep(search)}
          onClick={() => {
            sweep.mutate()
          }}
        >
          <Search size={16} aria-hidden />
          {sweep.isPending ? 'Reading the boards…' : 'Read them now'}
        </Button>

        {/*
          Said rather than swallowed. A mistyped slug is the commonest
          thing that goes wrong, and a sweep that quietly returned fewer
          results would have somebody blaming the filters.
        */}
        {result?.failures.map((failure) => (
          <p
            key={`${failure.source.provider}:${failure.source.token}`}
            className="text-warn-500 text-xs"
          >
            {failure.reason}
          </p>
        ))}
      </Card>

      {result !== undefined && (
        <div className="mt-3">
          <p className="text-ink-700 mb-2 text-xs">
            {result.read === 0
              ? 'Nothing came back from those boards.'
              : `${String(result.leads.length)} of ${String(result.read)} open postings cleared your filters.`}
          </p>

          {result.leads.length === 0 ? (
            <Card>
              <Empty title="Nothing matched">
                Every posting was read and none survived. Widening the titles is usually the one
                that helps — keywords only rank, they never let a posting through.
              </Empty>
            </Card>
          ) : (
            <div className="space-y-3">
              {result.leads.slice(0, 25).map((lead) => (
                <Card
                  key={`${lead.posting.provider}-${lead.posting.externalId}`}
                  className="space-y-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-ink-50 min-w-0 flex-1 text-sm font-medium">
                      {lead.posting.title}
                    </span>
                    <Badge tone={lead.scored.score >= 70 ? 'good' : 'neutral'}>
                      {lead.scored.score}
                    </Badge>
                  </div>

                  <p className="text-ink-700 text-xs">
                    {PROVIDER_LABELS[lead.posting.provider]} · {lead.posting.boardToken}
                    {lead.posting.location !== undefined && ` · ${lead.posting.location}`}
                    {lead.posting.salaryRaw !== undefined && ` · ${lead.posting.salaryRaw}`}
                    {/*
                      How much of the list is this one employer. Boards
                      post in bulk, and thirty applications quietly going
                      to one place is worth seeing before it happens.
                    */}
                    {(byEmployer?.get(lead.posting.boardToken) ?? 0) > 1 &&
                      ` · ${String(byEmployer?.get(lead.posting.boardToken))} open here`}
                  </p>

                  {/*
                    Every point, said. The whole reason this scorer has no
                    model in it is that a lead can explain itself.
                  */}
                  <ul className="space-y-0.5">
                    {lead.scored.reasons.map((reason) => (
                      <li key={reason.text} className="text-ink-500 numeric text-xs">
                        {reason.points >= 0 ? '+' : ''}
                        {reason.points} {reason.text}
                      </li>
                    ))}
                  </ul>

                  {/*
                    **Applying and tracking are one press**, and that is a
                    deliberate divergence from the app this was ported
                    from. There, approving files an application in
                    *Preparing* and applying comes later. Here, creating
                    the record pays thirty XP for having applied — so a
                    record that exists before anything was sent would pay
                    for something nobody did. The button opens the form
                    and files the application together, which is the only
                    arrangement in which both are true.

                    The window is opened from the click itself rather than
                    after the write resolves, because a popup blocker
                    stops anything a promise opens later.
                  */}
                  {applied.data?.has(lead.posting.applyUrl ?? lead.posting.url) === true ? (
                    <p className="text-good-500 text-xs">Applied — it is on your list</p>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={approve.isPending}
                      onClick={() => {
                        window.open(
                          lead.posting.applyUrl ?? lead.posting.url,
                          '_blank',
                          'noopener,noreferrer',
                        )
                        approve.mutate(lead.posting)
                      }}
                    >
                      Apply, and track it
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  )
}
