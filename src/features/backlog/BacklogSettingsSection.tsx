import { Download, Upload } from 'lucide-react'
import { useRef } from 'react'

import { Button, Card, Section } from '@/components/shared/primitives'
import { CATEGORY_REGISTRY } from '@/domain/backlog/category-registry'
import { SORT_KEY_LABELS, SORT_KEYS } from '@/domain/backlog/sort-key'
import { STATUS_LABELS, STATUSES } from '@/domain/backlog/status'

import { useBacklogSettings, useBacklogTransfer } from './hooks'

/**
 * The backlog's preferences, and the door the old app's data comes
 * through.
 *
 * On the hub's settings page rather than on a settings page of its own,
 * which is the whole point of absorbing the app. Its theme setting did not
 * survive the move — there is one app now, and two switches for one light
 * is worse than none.
 */

const FIELD = 'bg-ink-850 border-ink-800 text-ink-50 h-11 w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase'

export function BacklogSettingsSection() {
  const { settings, update } = useBacklogSettings()
  const { exportItems, importItems } = useBacklogTransfer()
  const fileInput = useRef<HTMLInputElement>(null)

  const result = importItems.data

  return (
    <Section title="Backlog" description="What a new entry starts as, and how the list is ordered.">
      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={LABEL}>Default sort</span>
            <select
              className={FIELD}
              value={settings.defaultSort}
              onChange={(event) => {
                update.mutate({ defaultSort: event.target.value })
              }}
            >
              {SORT_KEYS.map((one) => (
                <option key={one} value={one}>
                  {SORT_KEY_LABELS[one]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={LABEL}>New entries start as</span>
            <select
              className={FIELD}
              value={settings.defaultStatus}
              onChange={(event) => {
                update.mutate({ defaultStatus: event.target.value })
              }}
            >
              {STATUSES.map((one) => (
                <option key={one} value={one}>
                  {STATUS_LABELS[one]}
                </option>
              ))}
            </select>
          </label>

          <label className="col-span-2 block">
            <span className={LABEL}>Default category</span>
            <select
              className={FIELD}
              value={settings.defaultCategory}
              onChange={(event) => {
                update.mutate({ defaultCategory: event.target.value })
              }}
            >
              {CATEGORY_REGISTRY.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="border-ink-800 space-y-3 border-t pt-4">
          <p className="text-ink-300 text-xs">
            The backlog travels in its own file, separate from the training backup — it is the same
            format the old Backlogs app exported, which is how that app&rsquo;s data gets here.
            Importing merges by id: anything already here with the same id is overwritten, anything
            only here survives, and anything deleted here stays deleted.
          </p>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={exportItems.isPending}
              onClick={() => {
                exportItems.mutate()
              }}
            >
              <Download size={16} aria-hidden />
              Export
            </Button>

            <Button
              variant="outline"
              className="flex-1"
              disabled={importItems.isPending}
              onClick={() => {
                fileInput.current?.click()
              }}
            >
              <Upload size={16} aria-hidden />
              Import
            </Button>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              // Cleared straight away so choosing the same file twice
              // still fires a change event.
              event.target.value = ''
              if (file === undefined) return

              void file.text().then((raw) => {
                importItems.mutate({ raw, mode: 'merge' })
              })
            }}
          />

          {result !== undefined && (
            <p
              role="status"
              className={result.envelopeValid ? 'text-ink-300 text-sm' : 'text-bad-500 text-sm'}
            >
              {result.envelopeValid
                ? `Imported ${result.imported.toString()}${
                    result.rejected > 0
                      ? `, skipped ${result.rejected.toString()} you had deleted`
                      : ''
                  }.${result.warning === null ? '' : ` ${result.warning}.`}`
                : `Nothing was imported — ${result.warning ?? 'the file was not recognised'}. Your backlog is untouched.`}
            </p>
          )}
        </div>
      </Card>
    </Section>
  )
}
