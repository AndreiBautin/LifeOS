import { Check, ClipboardCopy } from 'lucide-react'
import { useState } from 'react'

import { useSettings } from '@/app/context'
import { Button, Card, Section } from '@/components/shared/primitives'
import { CONFIG_LABELS, readConfig, writeConfig, type ConfigRead } from '@/domain/config/document'

/**
 * Moving preferences in and out without a file.
 *
 * The report: *"passing files back and forth is a slow workflow, same
 * with me seeding job board stuff and everything else when you already
 * have it."* Both halves are a round trip through the filesystem for
 * something small enough to paste — a list of boards, a list of
 * interests, what you want within walking distance.
 *
 * **Not the backup, and this panel sits beside it rather than replacing
 * it.** A backup is the whole database and carries a checksum because a
 * large file can be truncated on the way to disk; this is three
 * preference blocks, and a truncated paste fails to be JSON at all. The
 * backup still owns restoring history, which is the thing worth being
 * careful with.
 *
 * **Offered, never applied**, the stance `ApplyEstimates` and the file
 * import both take. What a document would set is listed first, in the
 * app's own words, because "3 boards · 5 title terms" is checkable and a
 * blob of JSON is not.
 */

export function ConfigTransfer() {
  const { settings, update } = useSettings()
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const [applied, setApplied] = useState(false)

  const read: ConfigRead | undefined = text.trim() === '' ? undefined : parse(text)

  return (
    <Section
      title="Configuration"
      description="The settings that are tedious to type, as text rather than a file."
    >
      <Card className="space-y-3">
        <Button
          variant="outline"
          full
          onClick={() => {
            void navigator.clipboard
              .writeText(JSON.stringify(writeConfig(settings), null, 2))
              .then(() => {
                setCopied(true)
                setTimeout(() => {
                  setCopied(false)
                }, 2000)
              })
          }}
        >
          {copied ? <Check size={16} aria-hidden /> : <ClipboardCopy size={16} aria-hidden />}
          {copied ? 'Copied' : 'Copy this device’s configuration'}
        </Button>

        <label className="block">
          <span className="text-ink-500 mb-1 block text-xs">Or paste one in</span>
          <textarea
            className="bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 numeric min-h-24 w-full rounded-xl border p-3 text-sm"
            placeholder={'{ "magic": "lifeos.config", … }'}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setApplied(false)
            }}
          />
        </label>

        {read?.kind === 'unreadable' && (
          <p role="alert" className="text-bad-500 text-xs">
            {read.reason}
          </p>
        )}

        {read?.kind === 'read' && (
          <>
            {/*
              What it would set, in the app's own words. A section absent
              from the document is left alone rather than cleared, which
              is the whole reason a document holding only a job search is
              safe to paste — so the list is what changes, and everything
              not on it stays.
            */}
            <ul className="text-ink-300 space-y-1 text-xs">
              {read.sections.map((section) => (
                <li key={section.key} className="flex justify-between gap-3">
                  <span>{CONFIG_LABELS[section.key]}</span>
                  <span className="text-ink-500 numeric text-right">{section.summary}</span>
                </li>
              ))}
            </ul>
            <p className="text-ink-700 text-xs">Anything not listed is left exactly as it is.</p>
            <Button
              variant="primary"
              full
              disabled={applied}
              onClick={() => {
                update(read.change)
                setApplied(true)
              }}
            >
              {applied ? 'Applied' : 'Apply these settings'}
            </Button>
          </>
        )}
      </Card>
    </Section>
  )
}

function parse(text: string): ConfigRead {
  let parsed: unknown

  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return { kind: 'unreadable', reason: 'That is not valid JSON yet.' }
  }

  return readConfig(parsed)
}
