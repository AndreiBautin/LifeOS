import { useQuery } from '@tanstack/react-query'
import { BuildLine } from '@/features/pwa/BuildLine'
import { PageHeader } from '@/components/shared/PageHeader'

import type { BackupCounts } from '@/domain/backup/envelope'
import { AlertTriangle, Download, HardDrive, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { useServices, useSettings } from '@/app/context'
import { liftsDivergeFrom, musclesDivergeFrom } from '@/domain/priority/divergence'
import { DEFAULT_LIFT_SESSIONS } from '@/domain/priority/tiers'
import { DEFAULT_MUSCLE_VOLUMES } from '@/domain/volume/levels'
import { DEFAULT_INCREMENT } from '@/domain/units/weight'
import { Badge, Button, Card, Section } from '@/components/shared/primitives'
import {
  MAX_DAYS_PER_WEEK,
  MAX_WEEKS_BEFORE_DELOAD,
  MIN_DAYS_PER_WEEK,
  MIN_WEEKS_BEFORE_DELOAD,
} from '@/domain/autoregulation/schedule'
import { BacklogSettingsSection } from '@/features/backlog/BacklogSettingsSection'
import { useBackup } from '@/features/backup/useBackup'
import { SyncSection } from '@/features/sync/SyncSection'
import { useSyncConfig } from '@/features/sync/useSync'
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

  const diverged = [
    musclesDivergeFrom(settings.muscleVolumes, DEFAULT_MUSCLE_VOLUMES).length > 0
      ? 'muscle'
      : undefined,
    liftsDivergeFrom(settings.liftSessions, DEFAULT_LIFT_SESSIONS) ? 'lift' : undefined,
  ].filter((one): one is string => one !== undefined)
  const services = useServices()
  const backup = useBackup()
  const fileInput = useRef<HTMLInputElement>(null)
  const [confirmReplace, setConfirmReplace] = useState('')

  const storage = useQuery({ queryKey: ['storage-status'], queryFn: storageStatus })
  const exercises = useQuery({ queryKey: ['exercises'], queryFn: () => services.exercises.all() })

  const syncConfig = useSyncConfig()
  const dataLocation =
    syncConfig.kind === 'configured'
      ? 'On this device, and in your project if you have signed in'
      : 'All of it is on this device and nowhere else'

  return (
    <div>
      <PageHeader title="Settings" />

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
        description="How often each thing is trained, and how hard. Weekly sets are those two multiplied — there is nothing else in the calculation."
      >
        <TierEditor
          muscleVolumes={settings.muscleVolumes}
          liftSessions={settings.liftSessions}
          setsPerSession={settings.setsPerSession}
          fatiguePercent={settings.fatiguePercent}
          onMuscleVolumes={(muscleVolumes) => {
            update({ muscleVolumes })
          }}
          onLiftSessions={(liftSessions) => {
            update({ liftSessions })
          }}
          onSetsPerSession={(setsPerSession) => {
            update({ setsPerSession })
          }}
          onFatiguePercent={(fatiguePercent) => {
            update({ fatiguePercent })
          }}
        />

        <Card className="mt-4">
          <p className="text-ink-300 text-sm">
            Nothing to press. The block is built from these settings every time it is read, so a
            number changed here is in tomorrow's session — and a session already open keeps the
            prescription it started with.
          </p>
        </Card>

        {/*
          Shown only when the two disagree, because that is the whole of
          the missing information.

          Priorities are the lifter's own and nothing overwrites them —
          which quietly means settings saved months ago go on being used
          after the shipped defaults have moved underneath them. The screen
          then reports "Squat, twice a week" perfectly truthfully about a
          choice nobody remembers making. Naming the divergence is the fix;
          resolving it stays a decision.
        */}
        {diverged.length > 0 && (
          <Card className="border-warn-500/30 mt-4">
            <p className="text-ink-300 text-sm">
              Your {diverged.join(' and ')}{' '}
              {diverged.length === 1 ? 'tiers differ' : 'tiers differ'} from the ones the app ships
              with. That is not a problem — these are your priorities — but it does mean changes to
              the defaults do not reach you.
            </p>
            <Button
              variant="outline"
              full
              className="mt-3"
              onClick={() => {
                update({
                  muscleVolumes: DEFAULT_MUSCLE_VOLUMES,
                  liftSessions: DEFAULT_LIFT_SESSIONS,
                })
              }}
            >
              Use the shipped priorities instead
            </Button>
          </Card>
        )}
      </Section>

      {/*
        Nothing here autoregulates, whatever this used to say.

        The description claimed "session length moves the day count,
        performance moves the block length". Both were built, both were
        tested, neither was ever called; they have since been deleted.
        The copy described an intention rather than the app, which is the
        one thing a settings screen must not do — every other number here
        is checkable against a session, and a claim about behaviour that
        does not happen cannot be checked at all.
      */}
      <Section title="Block" description="Two numbers you set. Nothing moves them for you.">
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
          <p className="text-ink-500 text-xs">
            Days per week stays between {MIN_DAYS_PER_WEEK} and {MAX_DAYS_PER_WEEK}, and the block
            between {MIN_WEEKS_BEFORE_DELOAD} and {MAX_WEEKS_BEFORE_DELOAD} weeks. Wanting to go
            outside either range is a sign the volume is wrong rather than the schedule.
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

      <Section title="The map" description="How much ground counts as all of it.">
        <Card className="space-y-2">
          <label className="block">
            <span className="text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase">
              Region area (km²)
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={1}
              className="bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm"
              value={settings.exploredRegionKm2?.toString() ?? ''}
              placeholder="e.g. 1572 for Greater London"
              onChange={(event) => {
                const next = Number(event.target.value)
                // Blank clears it rather than storing zero: absent means the
                // ladder says nothing, and zero would be a division nobody
                // asked for.
                update(
                  event.target.value.trim() === '' || !Number.isFinite(next) || next <= 0
                    ? { exploredRegionKm2: undefined }
                    : { exploredRegionKm2: next },
                )
              }}
            />
          </label>
          <p className="text-ink-500 text-xs">
            The exploration ladder measures the ground you have walked against the region you are
            exploring. Nobody publishes what share of a city counts as “Advanced”, so the boundary
            has to come from you — until it does, that ladder reads nothing rather than scoring you
            against a made-up figure.
          </p>
        </Card>
      </Section>

      {/* ---------------------------------------------------------------- */}

      <MaxesEditor
        settings={settings}
        onChange={(estimatedMaxes) => {
          update({ estimatedMaxes })
        }}
      />

      <SyncSection />

      {/*
        The description is computed, because the old one — "on this device
        and nowhere else" — becomes a lie the moment a project is
        configured, and a reassurance that is quietly false is worse than
        none. It reports where the data is, not where it used to be.
      */}
      <BacklogSettingsSection />

      <Section title="Your data" description={dataLocation}>
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

      {/* Not a Section — a footer, not a thing to decide about. */}
      <BuildLine />
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

/** What each collection is called, in the order a person would read it. */
const COUNT_LABELS: readonly (readonly [keyof BackupCounts, string])[] = [
  ['workouts', 'workouts'],
  ['exercises', 'exercises'],
  ['checkIns', 'check-ins'],
  ['items', 'backlog items'],
  ['projects', 'projects'],
  ['upgrades', 'upgrades'],
  ['friends', 'people'],
  ['places', 'places'],
  ['trips', 'trips'],
  ['dailies', 'dailies'],
  ['reviews', 'monthly reviews'],
  ['metrics', 'tracked metrics'],
  ['exploredCells', 'squares of walked ground'],
]

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
            {/*
              Every collection with something in it, rather than the three
              that used to be listed. A file whose backlog and places went
              unmentioned looked like a training-only backup, which is
              exactly what it used to be.
            */}
            {COUNT_LABELS.filter(([key]) => (preview.counts?.[key] ?? 0) > 0).map(
              ([key, label]) => (
                <li key={key}>
                  {preview.counts?.[key] ?? 0} {label}
                </li>
              ),
            )}
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
