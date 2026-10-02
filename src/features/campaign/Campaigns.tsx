import { Check, Flag, Pencil, Plus, X } from 'lucide-react'
import { useState } from 'react'

import type { CampaignId } from '@/domain/ids/ids'

import { Badge, Button, Card, CardHeading, Empty } from '@/components/shared/primitives'
import { Meter } from '@/components/shared/Meter'
import type { CampaignStanding, Requirement, StageStanding } from '@/domain/campaign/campaign'
import { formatMinorUnits } from '@/domain/upgrades/upgrade'

import {
  useAddCampaign,
  useAppendStage,
  useCampaigns,
  useReachStage,
  useRenameArc,
  useUndoStage,
} from './hooks'
import { StageEditor } from './StageEditor'

/**
 * The long arc — the move, and anything shaped like it.
 *
 * On Today, as a checklist of chapters — what "the long run" means when
 * it is stated at full size: *"improving my job and my
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
 * **The house work, measured, then five declared chapters.** It was two
 * — house work and a new job — and before that the paragraph below.
 * It was three measured ones; the income and deposit stages went with the
 * finance tracking (see below). Before that it was six, of
 * which three were declared — find a house, sell this one, move — and
 * those went on request: _"let's just track three progress bar things."_
 * What is left is the part of a move the app can actually witness, which
 * is also the part that takes the years. Finding a house and selling one
 * are events rather than campaigns; they happen over a fortnight at the
 * end and there is nothing to watch fill up in the meantime.
 *
 * A starting point that can be edited away from, the same stance the
 * house-job steps take — not a claim that everybody moves house this way.
 */
const MOVE_STAGES: readonly { readonly name: string; readonly requirement: Requirement }[] = [
  { name: 'Fix up the house', requirement: { kind: 'declared' } },
  /*
   * **A new job, declared — no salary and no savings tracked.** Asked
   * for as _"no need to track finance… just make it get a new job, don't
   * track the actual income or any savings amount either."_ Both money
   * stages read the monthly finance reading, and the screen that recorded
   * it is gone, so they could only ever sit at whatever was imported. A
   * job is an event you know about the day it happens, which is exactly
   * what a declared stage is for.
   */
  { name: 'Get a new job', requirement: { kind: 'declared' } },
  /*
   * **The rest of the move, as placeholders.** Asked for as _"we should
   * have placeholders for the overall full flow of completing this arc"_
   * while the order of selling and buying is still undecided. Declared,
   * so each is a box until a quest is linked to fill it; the timing
   * between them is quest blockers once the order is settled, not
   * something the arc encodes.
   */
  { name: 'Get mortgage-ready', requirement: { kind: 'declared' } },
  { name: 'Sell this house', requirement: { kind: 'declared' } },
  { name: 'Find and buy the next one', requirement: { kind: 'declared' } },
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
      return standing.stage.reached.length > 0 ? '' : 'Not yet'
    case 'net-worth':
      return standing.unproven
        ? `Net worth of ${formatMinorUnits(requirement.minorUnits)} — nothing recorded yet`
        : `${formatMinorUnits(progress?.value ?? 0)} of ${formatMinorUnits(requirement.minorUnits)}`
    case 'retirement':
      return standing.unproven
        ? `Retirement of ${formatMinorUnits(requirement.minorUnits)} — nothing recorded yet`
        : `${formatMinorUnits(progress?.value ?? 0)} of ${formatMinorUnits(requirement.minorUnits)}`
    case 'savings':
      return standing.unproven
        ? `${formatMinorUnits(requirement.minorUnits)} saved — nothing recorded yet`
        : `${formatMinorUnits(progress?.value ?? 0)} of ${formatMinorUnits(requirement.minorUnits)} saved`
    case 'salary':
      return standing.unproven
        ? `Salary of ${formatMinorUnits(requirement.minorUnits)} — nothing recorded yet`
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

        {declared ? (
          <span className="flex shrink-0 items-center gap-2">
            {!met && isNext && <Badge tone="accent">Now</Badge>}
            {/*
              **A box, the quest steps' own control.** It was a text link
              reading "Mark done", then a bordered "Reached it" button
              before that — both read as instructions rather than as a
              state. Ticked is reached; unticking takes back the latest
              time, the undo this row always had.
            */}
            <button
              type="button"
              aria-label={met ? `Undo reaching ${stage.name}` : `Mark ${stage.name} done`}
              aria-pressed={met}
              disabled={reach.isPending || undo.isPending}
              className={[
                'grid size-7 place-items-center rounded-md border transition-colors',
                met
                  ? 'border-good-500 bg-good-500/15 text-good-500'
                  : 'border-ink-700 hover:border-accent-500',
              ].join(' ')}
              onClick={() => {
                if (met) undo.mutate({ id: campaign.campaign.id, stageId: stage.id })
                else reach.mutate({ id: campaign.campaign.id, stageId: stage.id, note: '' })
              }}
            >
              {met && <Check size={14} aria-hidden />}
            </button>
          </span>
        ) : met ? (
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

      <div className="mt-0.5">
        <p className="text-ink-700 text-xs">{describe(stage.requirement, standing)}</p>
      </div>

      {/*
        **Every stage draws a bar**, asked for as _"it would make sense
        for all of them to be progress bars."_ A declared stage carries a
        progress of one step, so it reads empty or full; a measured one
        reads its own fraction.

        **An unproven stage draws the track and claims nothing**, which is
        how the two rules meet. `Meter` renders `of` of nought as the
        track alone — nothing over nothing is not complete — so the row
        has the same shape as its neighbours without a bar at zero
        against a target nobody has measured yet. That was the reason it
        used to draw nothing at all, and the reason is satisfied rather
        than overruled.
      */}
      <Meter
        className="mt-1.5"
        value={unproven || progress === undefined ? 0 : Math.min(progress.value, progress.of)}
        of={unproven || progress === undefined ? 0 : progress.of}
        height={5}
        label={stage.name}
      />

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

/**
 * Renaming an arc, and saying where it ends up.
 *
 * **Neither could be changed after creation**, which is how a real arc
 * came to carry the aim *"Step 1: don't absolutely despise your current
 * neighbourhood"* — a description typed into the box above a numbered
 * stage list, and then unfixable from any screen. `renameArc` and
 * `useRenameArc` were written, exported and called by **nothing**, which
 * is the pattern this codebase keeps recording.
 *
 * Both fields are labels: the stages, their laps and every date under
 * them are untouched. That is why this needs no warning where a stage's
 * *target* change gets one.
 */
function ArcEditor({
  campaign,
  onDone,
}: {
  readonly campaign: CampaignStanding['campaign']
  readonly onDone: () => void
}) {
  const rename = useRenameArc()
  const [name, setName] = useState(campaign.name)
  const [aim, setAim] = useState(campaign.aim ?? '')

  return (
    <form
      className="mb-3 space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim() === '') return
        rename.mutate({ id: campaign.id, name, aim }, { onSuccess: onDone })
      }}
    >
      <label className="block">
        <span className="text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase">
          What the arc is called
        </span>
        <input
          className={FIELD}
          value={name}
          autoFocus
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
      </label>

      {/*
        Labelled with what it is *not*, because that is the mistake it
        actually invites and has already caused once: the numbered stage
        list sits directly below, so an unlabelled box above one gets
        filled in with the first step.
      */}
      <label className="block">
        <span className="text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase">
          Where it ends up · not the first step
        </span>
        <input
          className={FIELD}
          value={aim}
          placeholder="Somewhere I actually want to live"
          onChange={(event) => {
            setAim(event.target.value)
          }}
        />
      </label>

      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={rename.isPending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/**
 * One arc, as a card on Today.
 *
 * **A checklist now, not the main quest.** Quests went to Notion — asked
 * for as _"drop quests, keep the arc as a checklist"_ — so there is no
 * slot for the arc to stand in for and no badge to say it does. The arc
 * names its own card, the aim sits under the name, and each chapter is a
 * box you tick.
 *
 * The heading is the arc's own name rather than a title the app
 * supplies, for the reason it always was: *"I don't like 'The long way
 * round' — I'm not sure what it even means."*
 */
function Arc({ standing }: { readonly standing: CampaignStanding }) {
  const [editing, setEditing] = useState(false)
  const { campaign } = standing

  return (
    <Card>
      <CardHeading
        icon={<Flag size={14} aria-hidden />}
        title={campaign.name}
        action={
          <Button
            size="sm"
            variant="ghost"
            aria-label={editing ? `Stop editing ${campaign.name}` : `Edit ${campaign.name}`}
            onClick={() => {
              setEditing(!editing)
            }}
          >
            {editing ? <X size={14} aria-hidden /> : <Pencil size={14} aria-hidden />}
          </Button>
        }
      />

      {editing && (
        <ArcEditor
          campaign={campaign}
          onDone={() => {
            setEditing(false)
          }}
        />
      )}

      {campaign.aim !== undefined && campaign.aim.trim() !== '' && (
        <p className="text-ink-300 mb-2 text-sm">{campaign.aim}</p>
      )}

      <p className="text-ink-500 text-xs">
        {standing.done} of {standing.total} chapters
      </p>

      {/*
        The denominator is chapters the person named, not a scale this
        app invented — the same reason the season bar measures against
        your own previous season.
      */}
      <Meter
        className="mt-2 mb-1"
        value={standing.done}
        of={standing.total}
        height={6}
        label={`${campaign.name}, ${String(standing.done)} of ${String(standing.total)} chapters`}
      />

      <ul>
        {standing.stages.map((stage, index) => (
          <StageRow key={stage.stage.id} standing={stage} campaign={standing} index={index} />
        ))}
      </ul>

      {editing && <AddStage campaignId={campaign.id} />}
    </Card>
  )
}

export function Campaigns() {
  const campaigns = useCampaigns()
  const [adding, setAdding] = useState(false)

  const arcs = campaigns.data ?? []

  /*
   * Nothing yet, so the app supplies a heading — the only place it does
   * for this part of the screen. It says what the thing is rather than
   * christening it, since the moment there is one it is named by
   * whoever started it.
   */
  if (campaigns.data !== undefined && arcs.length === 0) {
    return (
      <div>
        {adding ? (
          <AddArc
            onDone={() => {
              setAdding(false)
            }}
          />
        ) : (
          <Card>
            {/*
              The heading moved inside the card and the description went.
              "One long run across several areas" is the same sentence the
              empty state below already makes at length, and printing both
              was a title, a description and an empty state saying one
              thing three times.
            */}
            <CardHeading icon={<Flag size={16} aria-hidden />} title="The arc" />
            <Empty title="No arc yet">
              <span className="block">
                The long one — fix the house, improve the income, save the deposit. All three read
                from Base and Finance, so they fill themselves as you get on with it.
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
      </div>
    )
  }

  return (
    <>
      {arcs.map((standing) => (
        <Arc key={standing.campaign.id} standing={standing} />
      ))}

      {/*
        Low-key and last. A second arc is rare, and its button should not
        compete with the one somebody is actually running.
      */}
      {adding ? (
        <AddArc
          onDone={() => {
            setAdding(false)
          }}
        />
      ) : (
        arcs.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAdding(true)
            }}
          >
            <Plus size={14} aria-hidden />
            Another arc
          </Button>
        )
      )}
    </>
  )
}
