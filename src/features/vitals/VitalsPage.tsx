import { Plus, Scale, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { useServices, useSettings } from '@/app/context'
import {
  READINESS_SCALE,
  type ReadinessFactors,
  type ReadinessLevel,
} from '@/domain/autoregulation/check-in'
import { NEUTRAL_READINESS } from '@/domain/vitals/condition'
import {
  PHASE_LABELS,
  PHASE_RATES,
  PHASE_VERDICT_LABELS,
  PHASES,
  TREND_DAYS,
} from '@/domain/vitals/weight'
import { readCharges } from '@/domain/vitals/charges'

import {
  useAddVice,
  useRecordCondition,
  useRecordWeighIn,
  useRetireVice,
  useVices,
  useVitalsToday,
  useWeighIns,
} from './hooks'

/**
 * Vitals: the screen where the two bars on Today are set up and read.
 *
 * Today owns the *acting* — spend a charge, see what is left — and this
 * screen owns the *deciding*: which pools exist, what phase you are in,
 * how the day felt. That is the same line Settings and the tech tree sit
 * on relative to You, and it is why this is a link rather than a ninth
 * tab. It is also why it is a link rather than a tab even though there
 * is room on the *screen*: a tab is somewhere you act.
 */

/** The three the request named, offered rather than seeded. */
const SUGGESTIONS: readonly { name: string; capacity: number; regenHours: number }[] = [
  { name: 'Coffee', capacity: 2, regenHours: 12 },
  { name: 'Kush', capacity: 1, regenHours: 24 },
  { name: 'Beer', capacity: 4, regenHours: 42 },
]

const FACTORS: readonly { key: keyof ReadinessFactors; label: string }[] = [
  { key: 'sleep', label: 'Sleep' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'hydration', label: 'Hydration' },
  { key: 'stress', label: 'Stress' },
  { key: 'motivation', label: 'Motivation' },
]

const LEVEL_LABELS: Record<ReadinessLevel, string> = { poor: 'Poor', ok: 'OK', good: 'Good' }

function ConditionEditor() {
  const vitals = useVitalsToday()
  const record = useRecordCondition()

  const current = vitals.data?.condition?.readiness ?? NEUTRAL_READINESS
  const recorded = vitals.data?.condition !== undefined

  return (
    <Card>
      <p className="text-ink-500 mb-3 text-sm">
        {recorded ? 'Recorded for today.' : 'Not recorded today.'} This is self-reported, and it
        scales today&rsquo;s session — never your settings. A bad night is not evidence that a
        muscle&rsquo;s weekly tolerance has changed.
      </p>

      <div className="space-y-2">
        {FACTORS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-ink-300 text-sm">{label}</span>
            <div className="flex gap-1">
              {READINESS_SCALE.map((level) => (
                <Button
                  key={level}
                  size="sm"
                  variant={current[key] === level ? 'primary' : 'outline'}
                  aria-pressed={current[key] === level}
                  aria-label={`${label}: ${LEVEL_LABELS[level]}`}
                  disabled={record.isPending}
                  onClick={() => {
                    record.mutate({ ...current, [key]: level })
                  }}
                >
                  {LEVEL_LABELS[level]}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function PhaseEditor() {
  const { settings, update } = useSettings()
  const vitals = useVitalsToday()
  const weighIns = useWeighIns()
  const record = useRecordWeighIn()
  const [weight, setWeight] = useState('')

  const phase = vitals.data?.phase
  const history = [...(weighIns.data ?? [])].reverse().slice(0, 10)

  return (
    <Card>
      <div className="mb-3 flex gap-1">
        {PHASES.map((option) => (
          <Button
            key={option}
            size="sm"
            full
            variant={settings.phase === option ? 'primary' : 'outline'}
            aria-pressed={settings.phase === option}
            onClick={() => {
              /*
               * Changing the phase moves the band with it. Keeping a cut's
               * band under a bulk would judge the new phase against the
               * old one's target and report failure for a decision the
               * lifter just made deliberately.
               */
              update({ phase: option, phaseRate: PHASE_RATES[option] })
            }}
          >
            {PHASE_LABELS[option]}
          </Button>
        ))}
      </div>

      <p className="text-ink-500 mb-3 text-sm">
        Target {settings.phaseRate.min} to {settings.phaseRate.max}% of bodyweight a week, smoothed
        over {TREND_DAYS} days. Calories are tracked elsewhere; this is the part that app
        can&rsquo;t tell you.
      </p>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const value = Number(weight)
          if (!Number.isFinite(value) || value <= 0) return
          record.mutate(value)
          setWeight('')
        }}
      >
        <input
          className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target min-w-0 flex-1 rounded-lg border px-3 text-sm"
          inputMode="decimal"
          placeholder={`Today's weight (${settings.units})`}
          aria-label="Today's weight"
          value={weight}
          onChange={(event) => {
            setWeight(event.target.value)
          }}
        />
        <Button type="submit" variant="primary" disabled={record.isPending}>
          <Scale size={16} aria-hidden />
          Log
        </Button>
      </form>

      {phase !== undefined && (
        <p className="text-ink-500 numeric mt-3 text-sm">
          {phase.trend === undefined
            ? 'Two weeks of readings gives a rate.'
            : `${phase.trend.current.toFixed(1)} over ${String(phase.trend.readings)} reading${phase.trend.readings === 1 ? '' : 's'} — ${PHASE_VERDICT_LABELS[phase.verdict]}`}
        </p>
      )}

      {history.length > 0 && (
        <div className="border-ink-800 mt-3 border-t pt-3">
          <p className="text-ink-700 mb-1 text-xs tracking-wide uppercase">Recent</p>
          <ul className="divide-ink-800 divide-y">
            {history.map((row) => (
              <li key={row.day} className="text-ink-300 numeric flex justify-between py-1 text-sm">
                <span>{row.day}</span>
                <span>{row.weight.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function AddVice() {
  const add = useAddVice()
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('2')
  const [hours, setHours] = useState('12')

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim() === '') return
        add.mutate({ name, capacity: Number(capacity), regenHours: Number(hours) })
        setName('')
      }}
    >
      <input
        className="bg-ink-900 border-ink-700 text-ink-50 tap-target w-full rounded-lg border px-3 text-sm"
        placeholder="What are you limiting?"
        aria-label="Name"
        value={name}
        onChange={(event) => {
          setName(event.target.value)
        }}
      />
      <div className="flex gap-2">
        <label className="text-ink-500 flex flex-1 items-center gap-2 text-xs">
          Charges
          <input
            className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target w-full min-w-0 rounded-lg border px-2 text-sm"
            inputMode="decimal"
            aria-label="Charges"
            value={capacity}
            onChange={(event) => {
              setCapacity(event.target.value)
            }}
          />
        </label>
        <label className="text-ink-500 flex flex-1 items-center gap-2 text-xs">
          Back in (h)
          <input
            className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target w-full min-w-0 rounded-lg border px-2 text-sm"
            inputMode="decimal"
            aria-label="Hours until a charge returns"
            value={hours}
            onChange={(event) => {
              setHours(event.target.value)
            }}
          />
        </label>
        <Button type="submit" variant="primary" disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Add
        </Button>
      </div>
    </form>
  )
}

export function VitalsPage() {
  const vices = useVices()
  const add = useAddVice()
  const retire = useRetireVice()
  const now = useServices().clock.now()

  const taken = new Set((vices.data ?? []).map((vice) => vice.name.toLowerCase()))
  const unused = SUGGESTIONS.filter((one) => !taken.has(one.name.toLowerCase()))

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Vitals</h1>
        <p className="text-ink-500 text-sm">What the body is doing, and what you have left</p>
      </header>

      <Section
        title="Charges"
        description="Things you mean to have less of, as a pool that comes back"
      >
        <Card>
          {vices.data === undefined ? null : vices.data.length === 0 ? (
            <Empty title="Nothing limited yet">
              A limit as a rule has two states, kept and broken. A limit as a resource has as many
              states as it has charges — the question stops being whether you were good and becomes
              what you have left.
            </Empty>
          ) : (
            <ul className="divide-ink-800 mb-3 divide-y">
              {vices.data.map((vice) => {
                const reading = readCharges(vice, now)

                return (
                  <li key={vice.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-ink-50 truncate text-sm font-medium">{vice.name}</p>
                      <p className="text-ink-700 numeric text-xs">
                        {vice.capacity} charge{vice.capacity === 1 ? '' : 's'} · one back every{' '}
                        {vice.regenHours}h · {vice.spent.length} spent all told
                      </p>
                    </div>
                    <Badge tone={reading.over > 0 ? 'bad' : 'neutral'}>
                      {reading.over > 0
                        ? `${String(reading.over)} over`
                        : `${String(reading.available)} left`}
                    </Badge>
                    {/*
                      Retire, not delete. Months of spends are a true
                      account of a stretch of your life, and deleting the
                      pool takes them with it.
                    */}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Retire ${vice.name}`}
                      disabled={retire.isPending}
                      onClick={() => {
                        retire.mutate(vice.id)
                      }}
                    >
                      <Trash2 size={14} aria-hidden />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

          {/*
            Offered by *name not already used* rather than only on an
            empty list. Gating on emptiness meant adding coffee took the
            other two away, so the second and third pool had to be typed
            out — which is the opposite of what a suggestion is for.
          */}
          {unused.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {unused.map((suggestion) => (
                <Button
                  key={suggestion.name}
                  variant="outline"
                  size="sm"
                  disabled={add.isPending}
                  onClick={() => {
                    add.mutate(suggestion)
                  }}
                >
                  <Plus size={14} aria-hidden />
                  {suggestion.name}
                </Button>
              ))}
            </div>
          )}

          <AddVice />
        </Card>
      </Section>

      <Section title="Phase" description="Where the scale is meant to be going">
        <PhaseEditor />
      </Section>

      <Section title="Condition" description="How the day feels, and what it does to the session">
        <ConditionEditor />
      </Section>
    </div>
  )
}
