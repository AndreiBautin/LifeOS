import { Check, Flag, Pencil, Plus, Undo2, X } from 'lucide-react'
import { useState } from 'react'

import type { CampaignId } from '@/domain/ids/ids'
import { Link } from 'react-router-dom'

import { Badge, Button, Card, CardHeading, Empty, Section } from '@/components/shared/primitives'
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
import { useActiveQuests } from '@/features/projects/hooks'

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
    case 'net-worth':
      return standing.unproven
        ? `Net worth of ${formatMinorUnits(requirement.minorUnits)} — nothing recorded yet`
        : `${formatMinorUnits(progress?.value ?? 0)} of ${formatMinorUnits(requirement.minorUnits)}`
    case 'retirement':
      return standing.unproven
        ? `Retirement of ${formatMinorUnits(requirement.minorUnits)} — nothing recorded yet`
        : `${formatMinorUnits(progress?.value ?? 0)} of ${formatMinorUnits(requirement.minorUnits)}`
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

/**
 * The screen a stage's requirement is read from.
 *
 * Reported: *"all the other things that just have manual completions,
 * like house search, should have sections that we could link to like the
 * other sections."* Right — a stage that says *0 of 5 house jobs
 * finished* is quoting a number Base owns, and the screen where that
 * number is moved was two taps away through the nav with nothing on the
 * row to say which screen it was.
 *
 * **The link goes where the evidence is, which is why it is keyed on the
 * requirement rather than on the stage's name.** A name is free text and
 * could say anything; the requirement is the app's own statement about
 * which records it reads, so a link derived from it cannot point
 * somewhere the number does not come from.
 *
 * **A declared stage has none, and that is the definition rather than a
 * gap.** It is declared precisely because nothing in the app records
 * it — there is no screen where "we found a house we liked" is written
 * down, so a link would have to be invented. *Houses seen* is the
 * measured version of house-hunting and does link, so a house-search
 * stage that wants one is a retarget away in the editor.
 *
 * The routes live here rather than in `domain/campaign` for the reason
 * `AREA_LINKS` does: the domain must not know that a browser exists.
 */
const EVIDENCE_SCREENS: Partial<Record<Requirement['kind'], { to: string; label: string }>> = {
  'house-jobs': { to: '/base', label: 'Base' },
  offers: { to: '/jobs', label: 'Job search' },
  'net-worth': { to: '/finance', label: 'Finance' },
  salary: { to: '/finance', label: 'Finance' },
  retirement: { to: '/finance', label: 'Finance' },
  'credit-score': { to: '/finance', label: 'Finance' },
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
  const screen = EVIDENCE_SCREENS[stage.requirement.kind]
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

      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <p className="text-ink-700 text-xs">{describe(stage.requirement, standing)}</p>
        {/*
          Where the number is kept, named. It is the same "all →" the
          day's House and Training groups used to carry, put back where
          it means something: one stage reads one screen, so it appears
          once and cannot repeat.
        */}
        {screen !== undefined && (
          <Link
            to={screen.to}
            className="text-ink-700 hover:text-ink-500 shrink-0 text-xs whitespace-nowrap"
          >
            {screen.label} →
          </Link>
        )}
      </div>

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
 * One arc, under its own heading.
 *
 * **The arc names the section.** That replaced a fixed title reading
 * *"The long way round"*, reported as *"I don't like that title — I'm
 * not sure what it even means or where it came from."* Fair: it was the
 * app's phrase for a thing the person had already named, so the screen
 * led with a heading nobody chose and put *Move out of GVR* a size
 * smaller underneath it, inside the card.
 *
 * The aim becomes the description for the same reason. A campaign
 * already carries both halves of a section header — a name, and a
 * sentence saying where it goes — so drawing them as one is what makes
 * this part of the screen read as being *about* the arc rather than as a
 * list that happens to have one entry.
 *
 * A consequence worth knowing: with two arcs there are two headings and
 * no wrapper over them, which is right. Nothing is "the" arc.
 */
function Arc({
  standing,
  isMain,
}: {
  readonly standing: CampaignStanding
  /**
   * Whether this arc is the one standing in for the main quest.
   *
   * Computed by the caller from the same two facts the slot uses — no
   * main quest activated, and this is the first arc with something
   * outstanding — because two components deciding it separately is how
   * the badge here and the card there start disagreeing.
   */
  readonly isMain: boolean
}) {
  const [editing, setEditing] = useState(false)
  const { campaign } = standing

  return (
    <Section
      title={campaign.name}
      {...(campaign.aim === undefined || campaign.aim.trim() === ''
        ? {}
        : { description: campaign.aim })}
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
    >
      {editing && (
        <ArcEditor
          campaign={campaign}
          onDone={() => {
            setEditing(false)
          }}
        />
      )}

      <Card>
        {/*
          The count in words, since the name and the aim have moved up
          into the heading and this card would otherwise open with a bar
          and no sentence.

          **The badge says what the Active section is already showing.**
          Asked for as *"some sort of designation to say this is the main
          quest"* — the arc fills that slot above, and down here nothing
          connected the two, so the same thing appeared twice on one page
          without either mentioning the other. It is conditional because
          the claim is: an activated quest wins, and the moment one
          exists this arc is the direction underneath rather than the
          main quest itself.
        */}
        <div className="flex items-center gap-2">
          {isMain && <Badge tone="accent">Main quest</Badge>}
          <p className="text-ink-500 text-xs">
            {standing.done} of {standing.total} stages
          </p>
        </div>

        {/*
          The denominator is stages the person named, not a scale this
          app invented — the same reason the season bar measures against
          your own previous season.
        */}
        <Meter
          className="mt-2 mb-1"
          value={standing.done}
          of={standing.total}
          height={6}
          label={`${campaign.name}, ${String(standing.done)} of ${String(standing.total)} stages`}
        />

        <ul>
          {standing.stages.map((stage, index) => (
            <StageRow key={stage.stage.id} standing={stage} campaign={standing} index={index} />
          ))}
        </ul>

        <AddStage campaignId={campaign.id} />
      </Card>
    </Section>
  )
}

export function Campaigns() {
  const campaigns = useCampaigns()
  const active = useActiveQuests()
  const [adding, setAdding] = useState(false)

  const arcs = campaigns.data ?? []

  /*
   * The arc currently filling the main quest slot, or none.
   *
   * The same two facts the slot itself uses: no main quest activated,
   * and the first arc with something still outstanding. An arc that is
   * finished has nothing to say about what you are working on now.
   */
  const standingIn =
    active.data?.main === undefined ? arcs.find((one) => one.next !== undefined) : undefined

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
                The long one — fix the house, improve the income, find somewhere, save the deposit,
                sell, move. Its stages read from Base, Jobs and Finance, so the parts the app
                already records tick themselves.
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
        <Arc
          key={standing.campaign.id}
          standing={standing}
          isMain={standing.campaign.id === standingIn?.campaign.id}
        />
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
            className="mb-8"
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
