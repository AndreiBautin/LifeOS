import { useState } from 'react'

import { useSettings } from '@/app/context'
import { Badge, Card, Section } from '@/components/shared/primitives'
import { parseInterests } from '@/domain/news/digest'
import { NEWS_SOURCES, SOURCE_LABELS, type NewsSource } from '@/domain/news/story'

/**
 * What the morning digest reads, and what floats to the top of it.
 *
 * On Settings for the reason the job search is: this is a standing
 * decision you make once and read against afterwards, where Today is
 * where the reading happens. A tab is somewhere you act, a link on the
 * hub is somewhere you decide.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-300 mb-1 block text-xs font-medium'

/**
 * A comma-separated list, held as text while it is being typed.
 *
 * Storing on every keystroke would re-parse "typescr" into a term and
 * render it back normalised from under the cursor. It commits on blur,
 * the same as the job search's term fields.
 */
function TermField({
  label,
  hint,
  placeholder,
  value,
  onCommit,
}: {
  readonly label: string
  readonly hint: string
  readonly placeholder: string
  readonly value: readonly string[]
  readonly onCommit: (terms: readonly string[]) => void
}) {
  const [text, setText] = useState(value.join(', '))

  return (
    <div>
      <label className={LABEL}>
        {label} <span className="text-ink-700 font-normal">· {hint}</span>
      </label>
      <input
        className={FIELD}
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value)
        }}
        onBlur={() => {
          onCommit(parseInterests(text))
        }}
      />
    </div>
  )
}

export function DigestSection() {
  const { settings, update } = useSettings()
  const digest = settings.digest

  const set = (next: Partial<typeof digest>) => {
    update({ digest: { ...digest, ...next } })
  }

  const toggle = (source: NewsSource) => {
    set({
      sources: digest.sources.includes(source)
        ? digest.sources.filter((one) => one !== source)
        : [...digest.sources, source],
    })
  }

  return (
    <Section title="Morning digest" description="Read once on your first open of the day">
      <Card className="space-y-4">
        <div>
          <span className={LABEL}>Sources</span>
          <div className="flex gap-2">
            {NEWS_SOURCES.map((source) => {
              const on = digest.sources.includes(source)

              return (
                <button
                  key={source}
                  type="button"
                  aria-pressed={on}
                  className={[
                    'tap-target flex-1 rounded-lg border px-3 text-xs font-medium',
                    on
                      ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                      : 'border-ink-800 text-ink-500',
                  ].join(' ')}
                  onClick={() => {
                    toggle(source)
                  }}
                >
                  {SOURCE_LABELS[source]}
                </button>
              )
            })}
          </div>
        </div>

        <TermField
          label="Interests"
          hint="floated to the top, never the only thing shown"
          placeholder="typescript, rust, design patterns"
          value={digest.interests}
          onCommit={(interests) => {
            set({ interests })
          }}
        />

        <TermField
          label="Muted"
          hint="dropped outright"
          placeholder="crypto, nft"
          value={digest.mutes}
          onCommit={(mutes) => {
            set({ mutes })
          }}
        />

        {/*
          Said where it will be met. The job scorer's keywords are a
          *share* of a list, so adding one lowers every score — genuinely
          surprising, and documented as such. These are the opposite, and
          somebody who has met the other one will assume wrongly.
        */}
        <p className="text-ink-700 text-xs">
          Interests only change the order. Adding one never hides anything — that is what muting is
          for.
        </p>

        <div className="border-ink-800 border-t pt-4">
          <label className={LABEL} htmlFor="digest-floor">
            Only stories with at least
          </label>
          <div className="flex items-center gap-3">
            <input
              id="digest-floor"
              type="range"
              min={0}
              max={500}
              step={10}
              className="flex-1"
              value={digest.minimumPoints}
              onChange={(event) => {
                set({ minimumPoints: Number(event.target.value) })
              }}
            />
            <Badge tone="neutral">{digest.minimumPoints} pts</Badge>
          </div>
          {/*
            The source's own number, not a score this app invented —
            everybody who reads Hacker News knows what a hundred-point
            story is.
          */}
          <p className="text-ink-700 mt-1 text-xs">
            Each site&rsquo;s own points, not a rating of ours.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="digest-limit">
            At most
          </label>
          <div className="flex items-center gap-3">
            <input
              id="digest-limit"
              type="range"
              min={1}
              max={30}
              step={1}
              className="flex-1"
              value={digest.limit}
              onChange={(event) => {
                set({ limit: Number(event.target.value) })
              }}
            />
            <Badge tone="neutral">{digest.limit}</Badge>
          </div>
          <p className="text-ink-700 mt-1 text-xs">
            A digest ends. A list that scrolls is a feed, which is the thing this is not.
          </p>
        </div>

        {digest.sources.length === 0 && (
          <p className="text-warn-500 text-xs">
            No sources, so nothing is read and no card appears on Today.
          </p>
        )}

        <p className="text-ink-700 border-ink-800 border-t pt-3 text-xs">
          Reading pays no XP — it is not something you did. Saving a story to the Codex and logging
          progress there is what counts, and that feeds Intellect.
        </p>
      </Card>
    </Section>
  )
}
