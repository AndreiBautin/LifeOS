import { Swords, Sparkle, X } from 'lucide-react'

import type { CampaignStanding, Requirement, StageStanding } from '@/domain/campaign/campaign'
import type { HomeFilter } from '@/domain/base/base'
import type { ActionId, ProjectId } from '@/domain/ids/ids'
import type { Project } from '@/domain/projects/project'
import { QUEST_KIND_LABELS, type QuestKind } from '@/domain/projects/project'
import { Badge, Button, Card } from '@/components/shared/primitives'

import { Meter } from '@/components/shared/Meter'
import { CampaignPath } from './CampaignPath'
import { useProjects, useRecommendation, useSetActionStatus, useSetActiveQuest } from './hooks'

/**
 * The two quests you are on.
 *
 * This is the screen's answer now, in place of the recommendation that
 * used to head it. The difference is who decides: the engine could always
 * tell you which quest scored highest, and what it could never know is
 * which one you actually mean to be working on this week.
 *
 * One of each kind, no more. A second active main quest is two main
 * quests, which is the thing having a main quest was for.
 */

const KIND_ICON = { main: Swords, side: Sparkle } as const

/**
 * The first step not yet closed, in the order the quest lists them —
 * which is why "Pick the first project to polish" is next: it is step one
 * and nothing has been ticked. No ranking, on purpose: a quest's steps
 * are an order somebody wrote, and the card follows it.
 */
function nextStep(quest: Project): Project['actions'][number] | undefined {
  return [...quest.actions]
    .filter((action) => action.status !== 'done')
    .sort((a, b) => a.order - b.order)[0]
}

/**
 * Where a stage's work is actually recorded, when it is recorded as
 * projects with steps.
 *
 * **One level deeper than `EVIDENCE_SCREENS`, and for a different job.**
 * That map answers "which screen is this number kept on" and covers
 * every measured kind. This one answers "whose *next step* is this
 * stage waiting on", which only the two project-backed kinds can: house
 * jobs and applications are `Project`s with actions, so there is a
 * concrete sentence to name. A net-worth stage is waiting on a reading,
 * and there is no next step to show — inventing one would be the app
 * telling somebody to go and have more money.
 */
const STAGE_WORK: Partial<Record<Requirement['kind'], HomeFilter>> = {
  'house-jobs': 'base',
  offers: 'jobs',
}

/**
 * The main quest: the arc, with one row per chapter still open.
 *
 * **The arc is the main quest now, not a stand-in for one.** Reported:
 * _"really the arc and main quest are the same thing — the main quest
 * involves everything for selling and moving somewhere better: new job,
 * fix up house."_ So this slot always shows the arc when there is one,
 * and a quest is main because it is linked to one of the arc's chapters
 * rather than because somebody picked it.
 *
 * **Every open chapter, each with its own next step.** Showing only the
 * earliest unmet stage hid the work going on in parallel — the house
 * chapter would have pushed the portfolio step off the card entirely,
 * while the portfolio was what was actually being worked on. The arc is
 * ordered but not gated, so each chapter names what it is waiting on and
 * the step can be ticked from here.
 */
function ArcSlot({ arc }: { readonly arc: CampaignStanding }) {
  const open = arc.stages.filter((stage) => !stage.met)

  return (
    <Card>
      <div className="flex items-start gap-2">
        <Swords size={16} className="text-accent-400 mt-1 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="text-ink-50 line-clamp-2 font-semibold">{arc.campaign.name}</p>
            <Badge tone="accent" className="mt-0.5 shrink-0">
              {QUEST_KIND_LABELS.main}
            </Badge>
          </div>
          <p className="text-ink-500 numeric mt-0.5 text-xs">
            {arc.done} of {arc.total} chapters done
          </p>
          <CampaignPath stages={arc.stages} nextPosition={arc.nextPosition} />
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {open.map((stage) => (
          <ChapterRow
            key={stage.stage.id}
            standing={stage}
            position={arc.stages.indexOf(stage) + 1}
          />
        ))}
      </ul>
    </Card>
  )
}

/**
 * One open chapter and the step it is waiting on.
 *
 * Linked quests first — the first one with a step still open, in the
 * order the chapter lists them. Failing that, a house or applications
 * chapter asks the recommendation over its own home, as it always did.
 * With nothing to tick the row is not drawn at all — asked for as
 * _"show only chapters with a step to tick"_. The arc's path above still
 * names every chapter, so a silent one is not lost, only not asking for
 * anything today. A blocked quest is passed over for the same reason: its
 * step is not one you can work on yet.
 */
function ChapterRow({
  standing,
  position,
}: {
  readonly standing: StageStanding
  readonly position: number
}) {
  const { stage, progress } = standing
  const projects = useProjects()
  const work = STAGE_WORK[stage.requirement.kind]
  const suggestion = useRecommendation(work)

  const linked = (stage.quests ?? []).flatMap((id) => {
    const quest = (projects.data ?? []).find((one) => one.id === id)
    return quest === undefined ? [] : [quest]
  })
  const fromQuest = linked
    .filter((quest) => quest.status !== 'blocked')
    .map((quest) => ({ quest, step: nextStep(quest) }))
    .find((one) => one.step !== undefined)

  const fromHome =
    fromQuest === undefined && suggestion.data?.actionId !== undefined
      ? {
          projectId: suggestion.data.projectId,
          actionId: suggestion.data.actionId,
          projectName: suggestion.data.projectName,
          description: suggestion.data.actionDescription,
        }
      : undefined

  const tick =
    fromQuest?.step !== undefined
      ? {
          projectId: fromQuest.quest.id,
          actionId: fromQuest.step.id,
          // A quest named for its chapter would say the heading twice.
          lead: fromQuest.quest.name === stage.name ? undefined : fromQuest.quest.name,
          step: fromQuest.step.description,
        }
      : fromHome?.projectId !== undefined && fromHome.description !== undefined
        ? {
            projectId: fromHome.projectId,
            actionId: fromHome.actionId,
            lead: fromHome.projectName,
            step: fromHome.description,
          }
        : undefined

  if (tick === undefined) return null

  return (
    <li
      className="border-ink-800/80 relative overflow-hidden rounded-xl border p-3 pl-4"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--color-accent-500) 6%, transparent), transparent 70%)',
        boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.05)',
      }}
    >
      {/* A lit rail down the left edge: the row is a chapter of one arc. */}
      <span
        aria-hidden
        className="bg-accent-500 absolute inset-y-3 left-0 w-0.5 rounded-full"
        style={{ boxShadow: '0 0 8px var(--color-accent-500)' }}
      />
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="numeric bg-accent-500/10 text-accent-400 ring-accent-500/25 grid size-5 shrink-0 place-items-center rounded-md text-[10px] font-semibold ring-1"
        >
          {position}
        </span>
        <p className="text-ink-300 min-w-0 flex-1 truncate text-xs font-medium tracking-wide uppercase">
          {stage.name}
        </p>
        {progress !== undefined && progress.of > 1 && (
          <span className="numeric text-ink-500 shrink-0 text-xs">
            {Math.min(progress.value, progress.of)}/{progress.of}
          </span>
        )}
      </div>
      {progress !== undefined && progress.of > 1 && (
        <Meter
          value={Math.min(progress.value, progress.of)}
          of={progress.of}
          height={3}
          className="mt-2"
        />
      )}

      <StepTick
        projectId={tick.projectId}
        actionId={tick.actionId}
        label={`${tick.lead ?? stage.name} · ${tick.step}`}
        {...(tick.lead === undefined ? {} : { lead: tick.lead })}
        step={tick.step}
      />
    </li>
  )
}

/** A step's box and its words, the same control the quest card uses. */
function StepTick({
  projectId,
  actionId,
  label,
  lead,
  step,
}: {
  readonly projectId: ProjectId
  readonly actionId: ActionId
  readonly label: string
  readonly lead?: string
  readonly step: string
}) {
  const set = useSetActionStatus()

  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        type="button"
        aria-label={`Close ${label}`}
        aria-pressed={false}
        disabled={set.isPending}
        className="tap-target border-ink-700 bg-ink-950/50 hover:border-accent-400 grid size-9 shrink-0 place-items-center rounded-lg border shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] transition-[border-color,box-shadow] hover:shadow-[0_0_12px_-3px_var(--color-accent-500)]"
        onClick={() => {
          set.mutate({ id: projectId, actionId, done: true })
        }}
      />
      <p className="min-w-0 text-sm leading-snug">
        {lead !== undefined && <span className="text-ink-500 block truncate text-xs">{lead}</span>}
        <span className="text-ink-50 font-medium">{step}</span>
      </p>
    </div>
  )
}

function Slot({
  kind,
  quest,
  arc,
}: {
  readonly kind: QuestKind
  readonly quest: Project | undefined
  readonly arc?: CampaignStanding
}) {
  const setActive = useSetActiveQuest()
  const Icon = KIND_ICON[kind]

  if (quest === undefined) {
    /*
     * An arc standing in for a main quest you have not picked.
     *
     * Reported: *"I'm still seeing no main or side quests assigned
     * despite starting an arc."* Nothing was broken — a campaign is
     * deliberately not a `Project`, because closing a stage would pay
     * XP for work its own area has already paid for — but the slot said
     * "no main quest active" to somebody who had just declared what they
     * were working towards, which is the wrong answer to a fair
     * question.
     *
     * **A readout, not a quest.** There is nothing to activate and
     * nothing to close here; it names what the arc is waiting on and
     * links to where that is done. It pays nothing, like the arc itself.
     */
    if (kind === 'main' && arc?.next !== undefined) {
      return <ArcSlot arc={arc} />
    }

    /*
     * **An empty slot is one line, not a card with a paragraph in it.**
     *
     * It drew a full card carrying the name of the missing quest and a
     * sentence telling you to pick one from the board — twice over,
     * since there are two slots. On an empty board that is the two
     * largest things on the screen, both saying nothing, above the list
     * they are telling you to go and read.
     *
     * The instruction went with the card. "Pick one from the board
     * below" is only ever read by somebody who can already see the
     * board, and the quest cards down there carry the control that does
     * it — so the sentence was describing a button that is visible from
     * where it was printed.
     */
    return (
      <div className="border-ink-800 flex items-center gap-2 rounded-xl border border-dashed px-3 py-2.5">
        <Icon size={14} className="text-ink-700 shrink-0" aria-hidden />
        <span className="text-ink-600 text-sm">
          No {QUEST_KIND_LABELS[kind].toLowerCase()} quest
        </span>
      </div>
    )
  }

  const step = nextStep(quest)
  const ordered = [...quest.actions].sort((a, b) => a.order - b.order)
  const done = ordered.filter((action) => action.status === 'done').length

  return (
    <Card>
      <div className="flex items-start gap-2">
        <Icon size={16} className="text-accent-400 mt-1 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          {/*
            **The name wraps rather than truncating.** "Polish three
            portfolio proj…" was the card's whole headline cut short; a
            quest is named once and read every day, so two lines is the
            cheaper cost.
          */}
          <div className="flex items-start gap-2">
            <p className="text-ink-50 line-clamp-2 font-semibold">{quest.name}</p>
            <Badge tone={kind === 'main' ? 'accent' : 'neutral'} className="mt-0.5 shrink-0">
              {QUEST_KIND_LABELS[kind]}
            </Badge>
          </div>

          {ordered.length > 0 && <StepTrack steps={ordered} done={done} />}
        </div>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Stand down ${quest.name}`}
          onClick={() => {
            setActive.mutate({ kind })
          }}
        >
          <X size={16} aria-hidden />
        </Button>
      </div>

      {step === undefined ? (
        <p className="text-ink-500 mt-3 text-xs">
          {ordered.length === 0 ? 'No steps yet — add one on Quests.' : 'Every step is done.'}
        </p>
      ) : (
        <NextStepRow quest={quest} step={step} />
      )}
    </Card>
  )
}

/**
 * One segment per step, lit for each one closed.
 *
 * A quest's progress is a count of steps, so it is drawn as the steps —
 * not as a ring or a bar, which the cards around this one already use
 * and which would say "40%" where "2 of 5" is what is true.
 */
function StepTrack({
  steps,
  done,
}: {
  readonly steps: readonly Project['actions'][number][]
  readonly done: number
}) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-1" aria-hidden>
        {steps.map((action) => (
          <span
            key={action.id}
            className={
              action.status === 'done'
                ? 'bg-accent-500 h-1.5 flex-1 rounded-full'
                : 'bg-ink-800 h-1.5 flex-1 rounded-full'
            }
          />
        ))}
      </div>
      <span className="numeric text-ink-500 shrink-0 text-xs">
        {done} of {steps.length} steps
      </span>
    </div>
  )
}

/**
 * The next step, closable from here.
 *
 * Reported: _"there's no way to progress this by clicking on it. I have
 * to navigate to the quests page first to do anything, which defeats the
 * purpose."_ It named the step and offered nothing to do with it. The box
 * is `ActionRow`'s own — empty for outstanding, the same mutation, the
 * same XP — so closing a step here and on Quests are one act, and the
 * next step simply takes its place.
 */
function NextStepRow({
  quest,
  step,
}: {
  readonly quest: Project
  readonly step: Project['actions'][number]
}) {
  const set = useSetActionStatus()

  return (
    <div className="border-ink-800 mt-3 flex items-center gap-3 border-t pt-3">
      <button
        type="button"
        aria-label={`Close ${step.description}`}
        aria-pressed={false}
        disabled={set.isPending}
        className="tap-target border-ink-700 hover:border-accent-500 grid size-9 shrink-0 place-items-center rounded-lg border transition-colors"
        onClick={() => {
          set.mutate({ id: quest.id, actionId: step.id, done: true })
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-ink-500 text-xs font-medium tracking-wide uppercase">Next</p>
        <p className="text-ink-100 text-sm">{step.description}</p>
      </div>
    </div>
  )
}

export function ActiveQuests({
  main,
  side,
  arc,
}: {
  readonly main: Project | undefined
  readonly side: Project | undefined
  /**
   * The arc, which **is** the main quest whenever one has something
   * outstanding. It used to stand in only when no main quest was picked,
   * and an activated quest won; with quests now main by being linked to
   * the arc's chapters, a picked main quest beside the arc would be the
   * same aim shown twice. One without an arc still shows as before.
   */
  readonly arc?: CampaignStanding
}) {
  const arcLeads = arc?.next !== undefined

  return (
    <div className="space-y-2">
      <Slot
        kind="main"
        quest={arcLeads ? undefined : main}
        {...(arc === undefined ? {} : { arc })}
      />
      <Slot kind="side" quest={side} />
    </div>
  )
}
