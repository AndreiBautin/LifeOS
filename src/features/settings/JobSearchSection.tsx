import { Plus, X } from 'lucide-react'
import { useState } from 'react'

import { useSettings } from '@/app/context'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { ATS_PROVIDERS, PROVIDER_LABELS, type AtsProvider } from '@/domain/jobs/boards'
import { parseTerms } from '@/domain/jobs/score'
import {
  DEFAULT_MINIMUM_SCORE,
  parseSources,
  withoutSource,
  withSource,
  type BoardSource,
} from '@/domain/jobs/search'

/**
 * The standing job search, on the screen where standing decisions live.
 *
 * **It was component state on the leads panel**, which meant every board
 * slug and every filter was wiped by any navigation — the search had to
 * be retyped before it could be run, every time. Settings is where it
 * belongs for the same reason the tech tree's budget is: it is a thing
 * you decide once and spend against afterwards.
 *
 * Three of the six filters had no control at all. `titleExcludes`,
 * `keywordExcludes` and the score floor were literals at the one call
 * site — `[]`, `[]` and `0` — so the scorer ranked the entire board and
 * hid nothing, and the two exclusions the domain implements and tests
 * could not be reached from anywhere. Same shape as every other
 * capability in this app that nothing could get to.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm'

/**
 * A comma-separated list, edited as text and stored as terms.
 *
 * The text is held locally while it is being typed, because storing on
 * every keystroke would re-parse "senior, staf" into a term list and
 * then render it back with the half-typed word normalised out from under
 * the cursor. It commits on blur.
 */
function TermField({
  label,
  hint,
  value,
  onCommit,
}: {
  readonly label: string
  readonly hint?: string
  readonly value: readonly string[]
  readonly onCommit: (terms: readonly string[]) => void
}) {
  const [text, setText] = useState(value.join(', '))

  return (
    <div>
      <label className="text-ink-300 mb-1 block text-xs font-medium">
        {label}
        {hint !== undefined && <span className="text-ink-700 font-normal"> · {hint}</span>}
      </label>
      <input
        className={FIELD}
        value={text}
        placeholder="senior, staff, principal"
        onChange={(event) => {
          setText(event.target.value)
        }}
        onBlur={() => {
          onCommit(parseTerms(text))
        }}
      />
    </div>
  )
}

/** Adding a board: a kind and a slug, rather than `greenhouse:stripe`. */
function AddBoard({ onAdd }: { readonly onAdd: (source: BoardSource) => void }) {
  const [provider, setProvider] = useState<AtsProvider>('greenhouse')
  const [token, setToken] = useState('')

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (token.trim() === '') return

        onAdd({ provider, token: token.trim() })
        setToken('')
      }}
    >
      <select
        className={`${FIELD} w-auto shrink-0`}
        aria-label="Board kind"
        value={provider}
        onChange={(event) => {
          setProvider(event.target.value as AtsProvider)
        }}
      >
        {ATS_PROVIDERS.map((one) => (
          <option key={one} value={one}>
            {PROVIDER_LABELS[one]}
          </option>
        ))}
      </select>

      {/*
        The slug, which is the part of the board's URL that names the
        company — `boards.greenhouse.io/stripe` is `stripe`. Said on the
        screen because it is the one thing here nobody can guess.
      */}
      <input
        className={FIELD}
        aria-label="Company slug"
        placeholder="stripe"
        value={token}
        onChange={(event) => {
          setToken(event.target.value)
        }}
      />

      <Button type="submit" variant="outline" size="sm" disabled={token.trim() === ''}>
        <Plus size={16} aria-hidden />
      </Button>
    </form>
  )
}

export function JobSearchSection() {
  const { settings, update } = useSettings()
  const search = settings.jobSearch
  const [pasting, setPasting] = useState(false)
  const [paste, setPaste] = useState('')

  const setSearch = (next: Partial<typeof search>) => {
    update({ jobSearch: { ...search, ...next } })
  }
  const setProfile = (next: Partial<typeof search.profile>) => {
    setSearch({ profile: { ...search.profile, ...next } })
  }

  return (
    <Section
      title="Job search"
      description="Which boards to read each morning, and what counts as a lead"
    >
      <Card className="space-y-4">
        <div>
          <p className="text-ink-500 mb-2 text-xs tracking-wide uppercase">Boards</p>

          {search.sources.length === 0 ? (
            <Empty title="No boards yet">
              Greenhouse, Lever and Ashby publish every open role as JSON, with no account and no
              key. Add a company&rsquo;s slug and it is read each morning.
            </Empty>
          ) : (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {search.sources.map((source) => (
                <li key={`${source.provider}:${source.token}`}>
                  <span className="border-ink-800 text-ink-100 inline-flex items-center gap-1.5 rounded-lg border py-1 pr-1 pl-2 text-xs">
                    <span className="text-ink-500">{PROVIDER_LABELS[source.provider]}</span>
                    {source.token}
                    <button
                      type="button"
                      className="text-ink-700 hover:text-bad-500 rounded p-0.5"
                      aria-label={`Stop following ${source.token} on ${PROVIDER_LABELS[source.provider]}`}
                      onClick={() => {
                        setSearch({ sources: withoutSource(search.sources, source) })
                      }}
                    >
                      <X size={13} aria-hidden />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <AddBoard
            onAdd={(source) => {
              setSearch({ sources: withSource(search.sources, source) })
            }}
          />

          {/*
            The paste format is kept as a second way in, folded away. It
            is how somebody with a list already written moves it across,
            and it is what the old textarea accepted — but it is not the
            form to put in front of somebody adding one board.
          */}
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={() => {
              setPasting(!pasting)
            }}
          >
            {pasting ? 'Close' : 'Paste a list'}
          </Button>

          {pasting && (
            <div className="mt-2 space-y-2">
              <textarea
                className="bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 w-full rounded-xl border p-3 text-sm"
                rows={3}
                aria-label="Boards to add, one per line"
                placeholder={'greenhouse:stripe\nlever:netflix'}
                value={paste}
                onChange={(event) => {
                  setPaste(event.target.value)
                }}
              />
              <Button
                variant="outline"
                size="sm"
                full
                disabled={paste.trim() === ''}
                onClick={() => {
                  // Folded in one at a time, so `withSource` drops the
                  // duplicates rather than the list being replaced.
                  const added = parseSources(paste).reduce(withSource, search.sources)
                  setSearch({ sources: added })
                  setPaste('')
                  setPasting(false)
                }}
              >
                Add these
              </Button>
            </div>
          )}
        </div>

        <div className="border-ink-800 space-y-3 border-t pt-4">
          <p className="text-ink-500 text-xs tracking-wide uppercase">What counts as a lead</p>

          <TermField
            label="Title must mention"
            hint="any of these"
            value={search.profile.titleIncludes}
            onCommit={(titleIncludes) => {
              setProfile({ titleIncludes })
            }}
          />
          <TermField
            label="Title must not mention"
            hint="drops the posting outright"
            value={search.profile.titleExcludes}
            onCommit={(titleExcludes) => {
              setProfile({ titleExcludes })
            }}
          />
          <TermField
            label="Skills worth points"
            hint="a share of these, not a threshold"
            value={search.profile.keywordIncludes}
            onCommit={(keywordIncludes) => {
              setProfile({ keywordIncludes })
            }}
          />
          <TermField
            label="Anywhere in the posting, drop it"
            value={search.profile.keywordExcludes}
            onCommit={(keywordExcludes) => {
              setProfile({ keywordExcludes })
            }}
          />
          <TermField
            label="Places"
            hint="applies to remote roles too"
            value={search.profile.locationIncludes}
            onCommit={(locationIncludes) => {
              setProfile({ locationIncludes })
            }}
          />

          {/*
            Stated where it will be met rather than in a help page. Adding
            a keyword you rarely match *lowers* every score, because the
            keyword figure is a share of the list — it reads as a bug the
            first time somebody sees it, and the domain has a test saying
            so.
          */}
          <p className="text-ink-700 text-xs">
            Skills are scored as a share of the list, so adding one you rarely have lowers every
            score. It is for ranking, not for widening the net.
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="tap-target"
              checked={search.profile.remoteOnly}
              onChange={(event) => {
                setProfile({ remoteOnly: event.target.checked })
              }}
            />
            <span className="text-ink-100">Remote only</span>
          </label>
        </div>

        <div className="border-ink-800 border-t pt-4">
          <label className="text-ink-300 mb-1 block text-xs font-medium" htmlFor="minimum-score">
            Only show leads scoring at least
          </label>
          <div className="flex items-center gap-3">
            <input
              id="minimum-score"
              type="range"
              min={0}
              max={100}
              step={5}
              className="flex-1"
              value={search.minimumScore}
              onChange={(event) => {
                setSearch({ minimumScore: Number(event.target.value) })
              }}
            />
            <Badge tone={search.minimumScore === 0 ? 'warn' : 'neutral'}>
              {search.minimumScore}
            </Badge>
          </div>
          <p className="text-ink-700 mt-1 text-xs">
            {search.minimumScore === 0
              ? 'At zero this shows every posting on every board, ranked.'
              : `Default is ${String(DEFAULT_MINIMUM_SCORE)}. A posting still scores for being fresh and in the right place without matching a single term.`}
          </p>
        </div>
      </Card>
    </Section>
  )
}
