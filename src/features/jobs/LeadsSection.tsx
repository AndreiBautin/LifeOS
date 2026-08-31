import { Search } from 'lucide-react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { ATS_PROVIDERS, PROVIDER_LABELS, type AtsProvider } from '@/domain/jobs/boards'
import { PROJECTS } from '../projects/hooks'
import { parseTerms } from '@/domain/jobs/score'
import { countByEmployer, sweepBoards, type LeadSweep } from '@/application/use-cases/jobs/leads'
import { appliedLinks, approveLead } from '@/application/use-cases/jobs/approve'
import type { FetchedPosting } from '@/domain/jobs/boards'
import { logger } from '@/shared/logging/logger'

/**
 * Leads: every open posting on the boards you follow, scored.
 *
 * **Fetched on demand, never on a timer.** These are free services run
 * for employers rather than for us, and a client-only app has no
 * business polling them in the background — the button is the rate
 * limit. The same restraint the map's geocoder shows towards Nominatim.
 *
 * Nothing is stored yet. A sweep reads the boards, scores what came
 * back, and shows it; approving a lead into a tracked application is the
 * next piece, and until it exists persisting a mirror of three job
 * boards would be storing something nobody can act on.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm'

const AREA =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 w-full rounded-xl border p-3 text-sm'

/** `greenhouse:stripe` a line, which is what a board actually is: a kind and a slug. */
function parseSources(raw: string): readonly { provider: AtsProvider; token: string }[] {
  return raw
    .split(/[\n\r,]+/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line !== '')
    .flatMap((line) => {
      const [kind, token] = line.split(':')
      const provider = ATS_PROVIDERS.find((one) => one === kind)

      return provider === undefined || token === undefined || token.trim() === ''
        ? []
        : [{ provider, token: token.trim() }]
    })
}

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

  const [sources, setSources] = useState('')
  const [titles, setTitles] = useState('')
  const [keywords, setKeywords] = useState('')
  const [locations, setLocations] = useState('')
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [result, setResult] = useState<LeadSweep | undefined>(undefined)

  const sweep = useMutation({
    mutationFn: () =>
      sweepBoards(
        parseSources(sources),
        {
          titleIncludes: parseTerms(titles),
          titleExcludes: [],
          keywordIncludes: parseTerms(keywords),
          keywordExcludes: [],
          locationIncludes: parseTerms(locations),
          remoteOnly,
        },
        0,
        services,
      ),
    onSuccess: setResult,
    onError: (error: unknown) => {
      logger.error('jobs.sweep-failed', { message: String(error) })
    },
  })

  const byEmployer = result === undefined ? undefined : countByEmployer(result.leads)

  return (
    <Section title="Leads" description="Public ATS boards, read on demand and scored">
      <Card className="space-y-3">
        <label className="block space-y-1">
          <span className="text-ink-500 text-xs">Boards — one a line, as kind:slug</span>
          <textarea
            className={AREA}
            rows={3}
            aria-label="Boards"
            placeholder={'greenhouse:stripe\nashby:ramp\nlever:acme'}
            value={sources}
            onChange={(event) => {
              setSources(event.target.value)
            }}
          />
        </label>

        <input
          className={FIELD}
          aria-label="Wanted titles"
          placeholder="Wanted titles — engineer, staff"
          value={titles}
          onChange={(event) => {
            setTitles(event.target.value)
          }}
        />
        <input
          className={FIELD}
          aria-label="Wanted keywords"
          placeholder="Wanted keywords — azure, .net"
          value={keywords}
          onChange={(event) => {
            setKeywords(event.target.value)
          }}
        />
        <input
          className={FIELD}
          aria-label="Wanted locations"
          placeholder="Locations — denver, remote"
          value={locations}
          onChange={(event) => {
            setLocations(event.target.value)
          }}
        />

        <label className="tap-target flex items-center justify-between gap-3">
          <span className="text-ink-300 text-sm">Remote only</span>
          <input
            type="checkbox"
            className="size-5 shrink-0"
            checked={remoteOnly}
            onChange={(event) => {
              setRemoteOnly(event.target.checked)
            }}
          />
        </label>

        <Button
          variant="primary"
          full
          disabled={sweep.isPending || parseSources(sources).length === 0}
          onClick={() => {
            sweep.mutate()
          }}
        >
          <Search size={16} aria-hidden />
          {sweep.isPending ? 'Reading the boards…' : 'Find leads'}
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
