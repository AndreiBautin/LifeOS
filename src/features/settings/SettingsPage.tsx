import { useQuery } from '@tanstack/react-query'
import { BuildLine } from '@/features/pwa/BuildLine'
import { PageHeader } from '@/components/shared/PageHeader'

import { COUNT_LABELS } from './count-labels'
import { AlertTriangle, Download, HardDrive, RotateCcw, Sparkles, Upload } from 'lucide-react'
import { useId, useRef, useState, useSyncExternalStore } from 'react'

import { useServices, useSettings } from '@/app/context'
import { DEFAULT_INCREMENT } from '@/domain/units/weight'
import { backupAge } from '@/domain/settings/settings'
import { Badge, Button, Card, Section } from '@/components/shared/primitives'
import { useBackup } from '@/features/backup/useBackup'
import { useSampleData } from '@/features/backup/useSampleData'
import { SyncSection } from '@/features/sync/SyncSection'
import { PLATES, platesToHand } from '@/domain/units/plates'
import { syncStore } from '@/features/sync/sync-store'
import { MaxesEditor } from './MaxesEditor'
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

  const storage = useQuery({ queryKey: ['storage-status'], queryFn: storageStatus })
  const exercises = useQuery({ queryKey: ['exercises'], queryFn: () => services.exercises.all() })

  const age = backupAge(settings, services.clock.now())
  /*
   * Whether a second copy exists, read rather than assumed. The sentences
   * below said "nowhere else" unconditionally once, and the same claim
   * went stale the last time sync existed — a warning that cannot check
   * its own premise is worse than none.
   */
  const syncing = useSyncExternalStore(syncStore.subscribe, syncStore.get).config !== undefined
  const sample = useSampleData()
  const [confirmFresh, setConfirmFresh] = useState(false)
  /*
   * Whether there is anything to wipe, and so which of the two actions
   * is on offer. The same record `seedDemoData` asks about before it will
   * fill anything.
   */
  const empty = useQuery({
    queryKey: ['storage-empty'],
    queryFn: async () => {
      return (await services.workouts.count()) === 0
    },
  })

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

          <PlateSetting />

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
      {/*
        **There is no Block section any more.** It held one control —
        days per week — which chose between four splits. Asked for as
        _"we probably don't need any of the customize workout stuff,
        let's gut it."_ There is one split now and nothing to choose;
        see `rp-splits.ts` for why the other three were already worse
        than the one that shipped.
      */}
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

      <Section
        title="Your data"
        description={
          syncing
            ? 'In this browser, and in your GitHub repository after each sync'
            : 'All of it is in this browser and nowhere else'
        }
      >
        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <HardDrive size={18} className="text-ink-500 mt-0.5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-ink-50 text-sm font-medium">Storage</p>
                {/*
                  An installed app on best-effort is not a warning. Safari
                  refuses `persist()` outright, so every iPhone reads
                  best-effort — and an installed one is exempt from the
                  eviction that actually happens there. A permanent amber
                  badge over a state nobody can change is how a person
                  learns to ignore the badge.
                */}
                {storage.data !== undefined && (
                  <Badge
                    tone={
                      storage.data.state === 'persisted'
                        ? 'good'
                        : storage.data.state === 'best-effort' && storage.data.installed
                          ? 'neutral'
                          : 'warn'
                    }
                  >
                    {storage.data.state === 'persisted' ? 'persistent' : storage.data.state}
                  </Badge>
                )}
              </div>
              {storage.data !== undefined && (
                <>
                  <p className="text-ink-300 mt-1 text-sm">
                    {describePersistence(storage.data.state, storage.data.installed)}
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
                Uninstalling the app, switching browser, or moving to a new phone.{' '}
                {syncing
                  ? 'Connecting the new browser to the same repository brings it all back.'
                  : 'None of it transfers; there is no account and no server.'}
              </p>
              <p className="text-ink-100 font-medium">
                {syncing
                  ? 'The repository and an export both survive all of it.'
                  : 'Export is the only thing that survives all of it.'}
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

          <p
            className={
              age.stale && age.days !== undefined ? 'text-warn-500 text-xs' : 'text-ink-500 text-xs'
            }
          >
            {age.days === undefined
              ? 'No backup taken yet.'
              : `Last export ${new Date(settings.lastExportAt ?? '').toLocaleDateString()} — ${
                  age.days === 0 ? 'today' : `${String(age.days)} days ago`
                }.`}
          </p>

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

          {/*
            **Start fresh and load the sample are never on screen together.**
            Which one is offered follows whether there is anything here:
            a database with records can only be wiped, and an empty one
            can only be filled. The wipe asks twice and offers the export
            first, because it is the one control here that cannot be undone.
          */}
          <div className="border-ink-800 space-y-2 border-t pt-4">
            {/*
              **No sample on a synced device.** The next round would upload
              it into the real history, and sync cannot tell it apart
              afterwards — the same reason connecting clears it first.
            */}
            {empty.data === true && syncing ? (
              <p className="text-ink-500 text-xs">
                Sample data is unavailable while this device syncs — it would be uploaded into your
                history. Disconnect sync first to try it.
              </p>
            ) : empty.data === true ? (
              <>
                <Button
                  variant="outline"
                  full
                  disabled={sample.loadSample.isPending}
                  onClick={() => {
                    sample.loadSample.mutate()
                  }}
                >
                  <Sparkles size={16} aria-hidden />
                  Load sample data
                </Button>
                <p className="text-ink-500 text-xs">
                  Fills the app with a made-up person&rsquo;s quests, lifts and places, to see what
                  every screen does. Start fresh again whenever you like.
                </p>
              </>
            ) : confirmFresh ? (
              <div className="border-bad-500/30 bg-bad-500/5 space-y-3 rounded-lg border p-3">
                <p className="text-ink-100 text-sm font-medium">Delete everything in the app?</p>
                <p className="text-ink-300 text-xs">
                  Every session and exercise you added on this browser goes, and it cannot be
                  undone. Export first if you want any of it back. Your settings are kept.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    className="flex-1"
                    disabled={sample.startFresh.isPending}
                    onClick={() => {
                      sample.startFresh.mutate(undefined, {
                        onSuccess: () => {
                          setConfirmFresh(false)
                        },
                      })
                    }}
                  >
                    Delete everything
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => {
                      setConfirmFresh(false)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                full
                onClick={() => {
                  setConfirmFresh(true)
                }}
              >
                <RotateCcw size={16} aria-hidden />
                Start fresh
              </Button>
            )}
          </div>
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
      {/*
        A switch, not the platform's checkbox: the native box rendered as
        a bright system-blue square, the one control on the screen that
        looked borrowed from another app. The input stays a real checkbox
        underneath, so keyboard and screen reader behaviour is unchanged.
      */}
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked)
        }}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="border-ink-700 bg-ink-850 peer-checked:border-accent-500/70 peer-checked:bg-accent-500/25 peer-focus-visible:outline-accent-500 relative h-7 w-12 shrink-0 rounded-full border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-checked:[&>span]:translate-x-5 peer-checked:[&>span]:bg-accent-400"
      >
        <span className="bg-ink-500 absolute top-1 left-1 size-[1.125rem] rounded-full shadow transition-transform" />
      </span>
    </label>
  )
}

/**
 * Which plates the gym has, so the plate loader and the warm-up ramp only
 * ever ask for a bar that can be built. Every plate starts on; turning
 * one off is the home gym with no 35s. The last one cannot be turned off
 * — a gym with no plates loads nothing, and `platesToHand` would read it
 * as the standard set anyway.
 */
function PlateSetting() {
  const { settings, update } = useSettings()
  const toHand = platesToHand(settings.plates, settings.units)

  return (
    <div>
      <p className="text-ink-300 text-sm">Plates you have</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Plates you have">
        {PLATES[settings.units].map((plate) => {
          const has = toHand.includes(plate)
          const last = has && toHand.length === 1
          return (
            <Button
              key={plate}
              size="sm"
              variant={has ? 'primary' : 'outline'}
              aria-pressed={has}
              disabled={last}
              className="numeric min-w-12"
              onClick={() => {
                update({
                  plates: has ? toHand.filter((one) => one !== plate) : [...toHand, plate],
                })
              }}
            >
              {plate}
            </Button>
          )
        })}
      </div>
      <p className="text-ink-500 mt-1.5 text-xs">
        The plate loader and the warm-up ramp only use these.
      </p>
    </div>
  )
}
