import { Check, Flag, Pencil, Plus, Undo2, X } from 'lucide-react'
import { useState } from 'react'

import type { CampaignId } from '@/domain/ids/ids'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { Meter } from '@/components/shared/Meter'
import type { CampaignStanding, Requirement, StageStanding } from '@/domain/campaign/campaign'
import { formatMinorUnits } from '@/domain/upgrades/upgrade'

import { useAddCampaign, useAppendStage, useCampaigns, useReachStage, useUndoStage } from './hooks'
import { StageEditor } from './StageEditor'

/**
 * The long arc — the move, and anything shaped like it.
 *
 * On the Quests page above the quest board, because this is what "main
 * quest" means when it is stated at full size: *"improving my job and my
 * house until I can retire in my ideal home."* Every input already
 * existed in the hub and nothing represented the arc itself.
 *
 * **It pays no XP**, and could not honestly. Every stage is met by work
 * that already paid in its own area — closing a house job, sending an
 * application — so paying again here would be the same effort counted
 * twice. This is a readout that spans areas, which is the one thing no
 * other screen in the app does.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm'

const LABEL = 'text-ink-500 mb-1 block text-xs tracking-wide uppercase'

/**
 * The default arc, offered rather than assumed.
 *
 * These six are the ones described, in the order they were described in,
 * with the two the app can actually witness wired to real readings. It
 * is a starting point that can be edited away from, the same stance the
 * house-job steps take — not a claim that everybody moves house this
 * way.
 */
const MOVE_STAGES: readonly { readonly name: string; readonly requirement: Requirement }[] = [
  { name: 'Fix up the house', requirement: { kind: 'house-jobs', count: 5 } },
  { name: 'Improve my income', requirement: { kind: 'offers', count: 1 } },
  { name: 'Find a new house', requirement: { kind: 'declared' } },
  { name: 'Save the deposit', requirement: { kind: 'net-worth', minorUnits: 4_000_000 } },
  { name: 'Sell this house', requirement: { kind: 'declared' } },
  { name: 'Move', requirement: { kind: 'declared' } },
]

/**
 * What a stage needs, in words, with the reading beside it.
 *
 * Said rather than left to a bar, because a bar at three fifths tells
 * you where you are and never what the target *is* — and the target here
 * is a number somebody chose, which they will want to check.
 */
function describe(requirement: Requirement, standing: StageStanding): string {
  const { progress } = standing

  switch (requirement.kind) {
    case 'declared':
      return standing.stage.reached.length > 0 ? '' : 'When you say so'
    case 'house-jobs':
      return `${String(progress?.value ?? 0)} of ${String(requirement.count)} house jobs finished`
    case 'offers':
      return `${String(progress?.value ?? 0)} of ${String(requirement.count)} applications through every stage`
    case 'homes-viewed':
      return `${String(progress?.value ?? 0)} of ${String(requirement.count)} houses seen`
    case 'net-worth':
      return standing.unproven
        ? `Net worth of ${formatMinorUnits(requirement.minorUnits)} — nothing recorded yet`
        : `${formatMinorUnits(progress?.value ?? 0)} of ${formatMinorUnits(requirement.minorUnits)}`
    case 'retirement':
      return standing.unproven
        ? `Retirement of ${formatMinorUnits(requirement.minorUnits)} — nothing recorded yet`
        : `${formatMinorUnits(progress?.value ?? 0)} of ${formatMinorUnits(requirement.minorUnits)}`
    case 'credit-score':
      return standing.unproven
        ? `Credit score of ${String(requirement.score)} — nothing recorded yet`
        : `${String(progress?.value ?? 0)} of ${String(requirement.score)}`
  }
}

function StageRow({
  standing,
  campaign,
  index,
}: {
  readonly standing: StageStanding
  readonly campaign: CampaignStanding
  readonly index: number
}) {
  const reach = useReachStage()
  const undo = useUndoStage()
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)

  const { stage, met, progress, unproven } = standing
  const declared = stage.requirement.kind === 'declared'
  const isNext = campaign.next?.stage.id === stage.id

  if (editing) {
    return (
      <li className="py-2">
        <StageEditor
          campaignId={campaign.campaign.id}
          stage={stage}
          isFirst={index === 0}
          isLast={index === campaign.stages.length - 1}
          onDone={() => {
            setEditing(false)
          }}
        />
      </li>
    )
  }

  return (
    <li className="border-ink-800 border-b py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        {/*
          The name is the control, rather than a fourth button on a row
          that already carries a record, an undo and a bar. The same
          decision a habit's title makes, for the same reason: at 375
          there is no room, and the name is the only thing here that is
          not already something you press. The pencil says so, because a
          phone has no hover to reveal it with.
        */}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-label={`Edit ${stage.name}`}
          onClick={() => {
            setEditing(true)
          }}
        >
          <span
            className={[
              'truncate text-sm',
              met ? 'text-ink-500' : isNext ? 'text-ink-50 font-medium' : 'text-ink-300',
            ].join(' ')}
          >
            {stage.name}
          </span>
          <Pencil size={11} className="text-ink-700 shrink-0" aria-hidden />
        </button>

        {met ? (
          <Check size={14} className="text-good-500 shrink-0" aria-label="Reached" />
        ) : (
          /*
            Highlighted rather than moved to the top. The order is the
            order of the arc, and reordering it so "now" leads would make
            the shape of the chain unreadable — the same reason habits
            sort chronologically rather than current-part-first.
          */
          isNext && <Badge tone="accent">Now</Badge>
        )}
      </div>

      <p className="text-ink-700 mt-0.5 text-xs">{describe(stage.requirement, standing)}</p>

      {/*
        A bar only where there is a quantity and a reading. An unproven
        stage draws nothing rather than a bar at zero — absent, never
        zero, and a bar at nought against a target somebody set reads as
        failing when nothing has been measured.
      */}
      {progress !== undefined && !unproven && (
        <Meter
          className="mt-1.5"
          value={Math.min(progress.value, progress.of)}
          of={progress.of}
          height={5}
          label={stage.name}
        />
      )}

      {/*
        Every lap, with what each one was. The observation this exists
        for: you pass through several jobs, and several houses, on the
        way — a tick that stopped meaning anything after the first would
        lose the shape of it.
      */}
      {stage.reached.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {stage.reached.map((lap, index) => (
            <li key={`${lap.at}-${String(index)}`} className="text-ink-500 numeric text-xs">
              {lap.at}
              {lap.note !== undefined && <span className="text-ink-300"> · {lap.note}</span>}
            </li>
          ))}
        </ul>
      )}

      {declared && (
        <div className="mt-1.5 flex items-center gap-2">
          {noting ? (
            <form
              className="flex flex-1 items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                reach.mutate(
                  { id: campaign.campaign.id, stageId: stage.id, note },
                  {
                    onSuccess: () => {
                      setNote('')
                      setNoting(false)
                    },
                  },
                )
              }}
            >
              <input
                className={FIELD}
                aria-label={`What happened for ${stage.name}`}
                placeholder="Which job, which house"
                value={note}
                autoFocus
                onChange={(event) => {
                  setNote(event.target.value)
                }}
              />
              <Button type="submit" size="sm" variant="primary" disabled={reach.isPending}>
                Record
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Cancel"
                onClick={() => {
                  setNoting(false)
                }}
              >
                <X size={14} aria-hidden />
              </Button>
            </form>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setNoting(true)
                }}
              >
                {/*
                  "Again" rather than "Reached" once it has happened
                  before, because on a repeatable stage the second press
                  is a different claim from the first.
                */}
                {stage.reached.length === 0 ? 'Reached it' : 'Again'}
              </Button>
              {stage.reached.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Undo the last time you reached ${stage.name}`}
                  disabled={undo.isPending}
                  onClick={() => {
                    undo.mutate({ id: campaign.campaign.id, stageId: stage.id })
                  }}
                >
                  <Undo2 size={14} aria-hidden />
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}

function AddArc({ onDone }: { readonly onDone: () => void }) {
  const add = useAddCampaign()
  const [name, setName] = useState('Move')
  const [aim, setAim] = useState('')

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim() === '') return

          add.mutate({ name, aim, stages: MOVE_STAGES }, { onSuccess: onDone })
        }}
      >
        {/*
          Labelled where they can be read, not only by a screen reader.

          Both fields were a placeholder and an `aria-label` and nothing
          else, so the moment you typed into either one the screen no
          longer said what it was. Reported from real use: the second
          box was filled in as a *description* — a reasonable guess at an
          unlabelled field — and then read as the first stage, because
          the numbered "Opens with" list sits directly beneath it.

          The second label says what it is *not*, which is the half that
          was actually missing. An aim is the finish line of the whole
          arc; the first step is in the list below.
        */}
        <label className="block">
          <span className={LABEL}>What it is called</span>
          <input
            className={FIELD}
            placeholder="Move"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
        </label>
        <label className="block">
          <span className={LABEL}>Where it ends</span>
          <input
            className={FIELD}
            placeholder="Retire in the house I actually want"
            value={aim}
            onChange={(event) => {
              setAim(event.target.value)
            }}
          />
          <span className="text-ink-700 mt-1 block text-xs">
            The finish line for the whole arc, not the first step. The steps are below, and you can
            change them afterwards.
          </span>
        </label>

        {/*
          Stated rather than offered as checkboxes, unlike a house job's
          steps: an arc's stages are a chain, and turning one off at
          creation would leave the ones after it depending on nothing.
          They can be edited afterwards; this is a starting shape.
        */}
        <div className="border-ink-800 rounded-lg border p-2">
          <p className="text-ink-500 mb-1 text-xs tracking-wide uppercase">Opens with</p>
          <ol className="text-ink-300 space-y-0.5 text-xs">
            {MOVE_STAGES.map((stage, index) => (
              <li key={stage.name}>
                {index + 1}. {stage.name}
              </li>
            ))}
          </ol>
        </div>

        <Button type="submit" variant="primary" full disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Start it
        </Button>
      </form>
    </Card>
  )
}

/**
 * Adding a stage the default arc did not include.
 *
 * Folded away, because the ordinary state of this screen is reading it
 * rather than building it — a form standing open at the foot of every
 * arc is furniture, which is the same call the pool add-form makes.
 *
 * It appends. Somewhere in the middle is a move away, and offering a
 * position picker here would be a second way to do what the arrows
 * already do.
 */
function AddStage({ campaignId }: { readonly campaignId: CampaignId }) {
  const append = useAppendStage()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        full
        className="mt-2"
        onClick={() => {
          setOpen(true)
        }}
      >
        <Plus size={14} aria-hidden />
        Add a stage
      </Button>
    )
  }

  return (
    <form
      className="mt-2 flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim() === '') return

        append.mutate(
          // Declared, because that is the only kind whose meaning is
          // knowable from a name alone. What it should read from is a
          // decision, and it is one tap away in the editor.
          { id: campaignId, name, requirement: { kind: 'declared' } },
          {
            onSuccess: () => {
              setName('')
              setOpen(false)
            },
          },
        )
      }}
    >
      <input
        className={FIELD}
        aria-label="What the stage is called"
        placeholder="Something else that has to happen"
        value={name}
        autoFocus
        onChange={(event) => {
          setName(event.target.value)
        }}
      />
      <Button type="submit" size="sm" variant="primary" disabled={append.isPending}>
        Add
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          setOpen(false)
        }}
      >
        <X size={14} aria-hidden />
      </Button>
    </form>
  )
}

export function Campaigns() {
  const campaigns = useCampaigns()
  const [adding, setAdding] = useState(false)

  const arcs = campaigns.data ?? []

  return (
    <Section
      title="The long way round"
      description="One arc across several areas. It pays nothing — everything under it already did."
      action={
        arcs.length === 0 ? undefined : (
          <Button
            variant={adding ? 'ghost' : 'outline'}
            size="sm"
            onClick={() => {
              setAdding(!adding)
            }}
          >
            {adding ? 'Close' : 'Add'}
          </Button>
        )
      }
    >
      {adding && (
        <AddArc
          onDone={() => {
            setAdding(false)
          }}
        />
      )}

      {campaigns.data !== undefined && arcs.length === 0 && !adding && (
        <Card>
          <Empty title="No arc yet">
            <span className="block">
              The long one — fix the house, improve the income, find somewhere, save the deposit,
              sell, move. Its stages read from Base, Jobs and Finance, so the parts the app already
              records tick themselves.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setAdding(true)
              }}
            >
              <Flag size={14} aria-hidden />
              Start one
            </Button>
          </Empty>
        </Card>
      )}

      <div className="space-y-3">
        {arcs.map((standing) => (
          <Card key={standing.campaign.id}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-ink-50 truncate text-sm font-medium">{standing.campaign.name}</p>
                {standing.campaign.aim !== undefined && (
                  <p className="text-ink-700 truncate text-xs">{standing.campaign.aim}</p>
                )}
              </div>
              <span className="text-ink-500 numeric shrink-0 text-xs">
                {standing.done}/{standing.total}
              </span>
            </div>

            {/*
              The denominator is stages the person named, not a scale
              this app invented — the same reason the season bar measures
              against your own previous season.
            */}
            <Meter
              className="mt-2 mb-1"
              value={standing.done}
              of={standing.total}
              height={6}
              label={`${standing.campaign.name}, ${String(standing.done)} of ${String(standing.total)} stages`}
            />

            <ul>
              {standing.stages.map((stage, index) => (
                <StageRow key={stage.stage.id} standing={stage} campaign={standing} index={index} />
              ))}
            </ul>

            <AddStage campaignId={standing.campaign.id} />
          </Card>
        ))}
      </div>
    </Section>
  )
}
