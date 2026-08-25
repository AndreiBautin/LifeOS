import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Download, HardDrive, RefreshCw, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { useServices, useSettings } from '@/app/context'
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS } from '@/domain/exercises/taxonomy'
import { DEFAULT_INCREMENT } from '@/domain/units/weight'
import { Badge, Button, Card, Section } from '@/components/shared/primitives'
import { buildRpBlock } from '@/application/use-cases/programs/build-rp-block'
import {
  MAX_DAYS_PER_WEEK,
  MAX_WEEKS_BEFORE_DELOAD,
  MIN_DAYS_PER_WEEK,
  MIN_WEEKS_BEFORE_DELOAD,
} from '@/domain/autoregulation/schedule'
import { useBackup } from '@/features/backup/useBackup'
import { MaxesEditor } from './MaxesEditor'
import { TierEditor } from './TierEditor'
import {
  describePersistence,
  formatBytes,
  storageStatus,
} from '@/infrastructure/storage/durability'

/**
 * Settings, and the honest account of where the data lives.
 *
 * The storage section is not boilerplate. With no server, a lifter needs
 * to understand that clearing site data destroys everything and that
 * "clear cookies" in most browsers means exactly that — and they need to
 * be told before it happens, not after.
 */
export function SettingsPage() {
  const { settings, update } = useSettings()
  const services = useServices()
  const backup = useBackup()
  const fileInput = useRef<HTMLInputElement>(null)
  const [confirmReplace, setConfirmReplace] = useState('')

  const client = useQueryClient()

  const rebuild = useMutation({
    mutationFn: () => buildRpBlock(settings, services),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['programs'] })
    },
  })

  const storage = useQuery({ queryKey: ['storage-status'], queryFn: storageStatus })
  const exercises = useQuery({ queryKey: ['exercises'], queryFn: () => services.exercises.all() })

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Settings</h1>
      </header>

      <Section title="Units">
        <Card className="space-y-4">
          <div className="flex gap-2">
            {(['lb', 'kg'] as const).map((unit) => (
              <Button
                key={unit}
                variant={settings.units === unit ? 'primary' : 'outline'}
                className="flex-1"
                onClick={() => {
                  update({ units: unit, roundingIncrement: DEFAULT_INCREMENT[unit] })
                }}
              >
                {unit}
              </Button>
            ))}
          </div>

          <NumberSetting
            label="Round loads to the nearest"
            suffix={settings.units}
            value={settings.roundingIncrement}
            onChange={(roundingIncrement) => {
              update({ roundingIncrement })
            }}
          />

          <NumberSetting
            label="Bodyweight"
            suffix={settings.units}
            value={settings.bodyweight ?? 0}
            onChange={(bodyweight) => {
              update({ bodyweight })
            }}
          />
        </Card>
      </Section>

      <Section
        title="Priorities"
        description="Tier 1 is highest. What you prioritise decides where inside each landmark band a muscle's weekly target lands."
      >
        <TierEditor
          muscleTiers={settings.muscleTiers}
          strengthTiers={settings.strengthTiers}
          landmarks={settings.landmarks}
          onMuscleTiers={(muscleTiers) => {
            update({ muscleTiers })
          }}
          onStrengthTiers={(strengthTiers) => {
            update({ strengthTiers })
          }}
        />

        <Card className="mt-4">
          <p className="text-ink-300 text-sm">
            Changing a tier does not touch a block you are already running — that keeps a frozen
            copy of what it started with, so a cycle in progress stays coherent. Build a new one to
            train off these priorities.
          </p>
          <Button
            variant="primary"
            full
            className="mt-3"
            disabled={rebuild.isPending}
            onClick={() => {
              rebuild.mutate()
            }}
          >
            <RefreshCw size={16} aria-hidden />
            {rebuild.isPending ? 'Building…' : 'Build a block from these priorities'}
          </Button>
          {rebuild.isSuccess && (
            <p className="text-good-500 mt-2 text-xs" role="status">
              Built. Start it from Programs.
            </p>
          )}
          {rebuild.isError && (
            <p className="text-bad-500 mt-2 text-xs" role="alert">
              {rebuild.error.message}
            </p>
          )}
        </Card>
      </Section>

      <Section
        title="Block"
        description="Both of these autoregulate — session length moves the day count, performance moves the block length. Set a starting point."
      >
        <Card className="space-y-3">
          <NumberSetting
            label="Days per week"
            value={settings.daysPerWeek}
            onChange={(daysPerWeek) => {
              if (daysPerWeek >= MIN_DAYS_PER_WEEK && daysPerWeek <= MAX_DAYS_PER_WEEK) {
                update({ daysPerWeek })
              }
            }}
          />
          <NumberSetting
            label="Weeks before a deload"
            value={settings.weeksBeforeDeload}
            onChange={(weeksBeforeDeload) => {
              if (
                weeksBeforeDeload >= MIN_WEEKS_BEFORE_DELOAD &&
                weeksBeforeDeload <= MAX_WEEKS_BEFORE_DELOAD
              ) {
                update({ weeksBeforeDeload })
              }
            }}
          />
          <NumberSetting
            label="Target session length"
            suffix="min"
            value={settings.targetSessionMinutes}
            onChange={(targetSessionMinutes) => {
              update({ targetSessionMinutes })
            }}
          />
          <p className="text-ink-500 text-xs">
            Days per week stays between {MIN_DAYS_PER_WEEK} and {MAX_DAYS_PER_WEEK}, and the block
            between {MIN_WEEKS_BEFORE_DELOAD} and {MAX_WEEKS_BEFORE_DELOAD} weeks. Wanting to go
            outside either range is a sign the volume is wrong rather than the schedule, and the app
            will say so rather than adjusting.
          </p>
        </Card>
      </Section>

      <Section
        title="Volume landmarks"
        description="Weekly hard sets per muscle — the range assistance work is filled to"
      >
        <Card>
          <ul className="space-y-1.5">
            {MUSCLE_GROUPS.map((muscle) => {
              const marks = settings.landmarks[muscle]
              return (
                <li key={muscle} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-300">{MUSCLE_GROUP_LABELS[muscle]}</span>
                  <span className="numeric text-ink-500 text-xs">
                    {marks.mev} → {marks.mav} (max {marks.mrv})
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="text-ink-500 mt-3 text-xs">
            These move on their own as your check-ins accumulate — three consistent sessions of
            evidence before anything changes, and never outside the recoverable band.
          </p>
        </Card>
      </Section>

      <Section title="During a session">
        <Card className="space-y-3">
          <Toggle
            label="Rest timer"
            checked={settings.restTimerEnabled}
            onChange={(restTimerEnabled) => {
              update({ restTimerEnabled })
            }}
          />
          <Toggle
            label="Keep the screen awake"
            checked={settings.keepScreenAwake}
            onChange={(keepScreenAwake) => {
              update({ keepScreenAwake })
            }}
          />
          <Toggle
            label="Ask how recovery feels before and after"
            checked={settings.checkInsEnabled}
            onChange={(checkInsEnabled) => {
              update({ checkInsEnabled })
            }}
          />
        </Card>
      </Section>

      {/* ---------------------------------------------------------------- */}

      <MaxesEditor
        settings={settings}
        onChange={(estimatedMaxes) => {
          update({ estimatedMaxes })
        }}
      />

      <Section title="Your data" description="All of it is on this device and nowhere else">
        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <HardDrive size={18} className="text-ink-500 mt-0.5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-ink-50 text-sm font-medium">Storage</p>
                {storage.data !== undefined && (
                  <Badge tone={storage.data.state === 'persisted' ? 'good' : 'warn'}>
                    {storage.data.state === 'persisted' ? 'persistent' : storage.data.state}
                  </Badge>
                )}
              </div>
              {storage.data !== undefined && (
                <>
                  <p className="text-ink-300 mt-1 text-sm">
                    {describePersistence(storage.data.state)}
                  </p>
                  {storage.data.usageBytes !== undefined &&
                    storage.data.quotaBytes !== undefined && (
                      <p className="text-ink-500 numeric mt-1 text-xs">
                        {formatBytes(storage.data.usageBytes)} used of{' '}
                        {formatBytes(storage.data.quotaBytes)} available
                        {exercises.data !== undefined &&
                          ` · ${String(exercises.data.length)} exercises`}
                      </p>
                    )}
                </>
              )}
            </div>
          </div>

          <div className="border-warn-500/30 bg-warn-500/5 flex gap-3 rounded-lg border p-3">
            <AlertTriangle size={16} className="text-warn-500 mt-0.5 shrink-0" aria-hidden />
            <div className="text-ink-300 space-y-1.5 text-xs">
              <p className="text-ink-100 font-medium">What will delete this data</p>
              <p>
                Clearing site data, and in most browsers clearing cookies — the control is usually
                labelled &ldquo;cookies and other site data&rdquo; and it takes this database with
                it.
              </p>
              <p>
                Uninstalling the app, switching browser, or moving to a new phone. None of it
                transfers; there is no account and no server to sync from.
              </p>
              <p className="text-ink-100 font-medium">
                Export is the only thing that survives all of it.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              disabled={backup.exportBackup.isPending}
              onClick={() => {
                backup.exportBackup.mutate()
              }}
            >
              <Download size={16} aria-hidden />
              Export
            </Button>

            <Button
              variant="outline"
              className="flex-1"
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
            aria-label="Choose a backup file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file === undefined) return
              void file.text().then(backup.inspect)
              event.target.value = ''
            }}
          />

          {settings.lastExportAt !== undefined && (
            <p className="text-ink-500 text-xs">
              Last export {new Date(settings.lastExportAt).toLocaleString()}
            </p>
          )}

          {backup.preview !== undefined && (
            <ImportPanel
              preview={backup.preview}
              canImport={backup.canImport}
              confirmReplace={confirmReplace}
              onConfirmChange={setConfirmReplace}
              onMerge={() => {
                backup.runImport.mutate('merge')
              }}
              onReplace={() => {
                backup.runImport.mutate('replace')
                setConfirmReplace('')
              }}
              onCancel={() => {
                backup.clearPreview()
                setConfirmReplace('')
              }}
              busy={backup.runImport.isPending}
            />
          )}
        </Card>
      </Section>

      <p className="text-ink-500 mt-8 text-center text-xs">
        Lift {import.meta.env.VITE_APP_VERSION ?? 'dev'}
        {import.meta.env.VITE_COMMIT_SHA !== undefined &&
          ` · ${import.meta.env.VITE_COMMIT_SHA.slice(0, 7)}`}
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------- */

interface ImportPanelProps {
  readonly preview: import('@/domain/backup/envelope').ImportPreview
  readonly canImport: boolean
  readonly confirmReplace: string
  readonly onConfirmChange: (value: string) => void
  readonly onMerge: () => void
  readonly onReplace: () => void
  readonly onCancel: () => void
  readonly busy: boolean
}

const REPLACE_PHRASE = 'replace'

function ImportPanel({
  preview,
  canImport,
  confirmReplace,
  onConfirmChange,
  onMerge,
  onReplace,
  onCancel,
  busy,
}: ImportPanelProps) {
  const confirmId = useId()

  return (
    <div className="border-ink-800 bg-ink-850 space-y-3 rounded-lg border p-3">
      {!preview.valid ? (
        <>
          <p className="text-bad-500 text-sm font-medium">This file cannot be imported</p>
          <ul className="text-ink-300 space-y-1 text-xs">
            {preview.problems.map((problem, index) => (
              <li key={index}>{problem.message}</li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="text-ink-50 text-sm font-medium">Ready to import</p>
          <ul className="text-ink-300 numeric space-y-0.5 text-xs">
            <li>{preview.counts?.workouts ?? 0} workouts</li>
            <li>{preview.counts?.programs ?? 0} programs</li>
            <li>{preview.counts?.exercises ?? 0} exercises</li>
            <li>{preview.counts?.checkIns ?? 0} check-ins</li>
            {preview.dateRange !== undefined && (
              <li className="text-ink-500">
                {preview.dateRange.from} to {preview.dateRange.to}
              </li>
            )}
          </ul>

          <Button variant="primary" full disabled={!canImport || busy} onClick={onMerge}>
            Merge into what is here
          </Button>

          <div>
            <label htmlFor={confirmId} className="text-ink-500 block text-xs">
              Or replace everything — type{' '}
              <strong className="text-ink-300">{REPLACE_PHRASE}</strong> to confirm. This deletes
              all current data.
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id={confirmId}
                value={confirmReplace}
                onChange={(event) => {
                  onConfirmChange(event.target.value)
                }}
                className="bg-ink-900 border-ink-800 text-ink-50 tap-target flex-1 rounded-lg border px-3 text-sm"
              />
              <Button
                variant="danger"
                disabled={confirmReplace.trim().toLowerCase() !== REPLACE_PHRASE || busy}
                onClick={onReplace}
              >
                Replace
              </Button>
            </div>
          </div>
        </>
      )}

      <Button variant="ghost" full onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}

function NumberSetting({
  label,
  suffix,
  value,
  onChange,
}: {
  readonly label: string
  readonly suffix?: string
  readonly value: number
  readonly onChange: (value: number) => void
}) {
  const id = `setting-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`

  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-ink-300 text-sm">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value === 0 ? '' : value}
          placeholder="—"
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
          className="numeric bg-ink-850 border-ink-800 text-ink-50 tap-target w-24 rounded-lg border px-2 text-center"
        />
        {suffix !== undefined && <span className="text-ink-500 text-xs">{suffix}</span>}
      </div>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string
  readonly checked: boolean
  readonly onChange: (value: boolean) => void
}) {
  return (
    <label className="tap-target flex cursor-pointer items-center justify-between gap-3">
      <span className="text-ink-300 text-sm">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked)
        }}
        className="size-5 shrink-0"
      />
    </label>
  )
}
