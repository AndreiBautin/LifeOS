import { Swords, Sparkle, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { CampaignStanding, Requirement, StageStanding } from '@/domain/campaign/campaign'
import type { HomeFilter } from '@/domain/base/base'
import type { Project } from '@/domain/projects/project'
import { QUEST_KIND_LABELS, type QuestKind } from '@/domain/projects/project'
import { Badge, Button, Card } from '@/components/shared/primitives'

import { useRecommendation, useSetActiveQuest } from './hooks'

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

function nextStep(quest: Project): string | undefined {
  return [...quest.actions]
    .filter((action) => action.status !== 'done')
    .sort((a, b) => a.order - b.order)[0]?.description
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
 * The arc, standing in for a main quest nobody has picked.
 *
 * **Its own component so the recommendation can be fetched here.** The
 * hook has to run unconditionally and only this branch ever wants it, so
 * asking for it in `Slot` would mean querying on every side quest too.
 *
 * Reported: *"I think here it should show what the next house fix-up
 * thing would be, you know."* Right, and the two cards made the gap
 * obvious side by side — the side quest named *Access IRA*, a thing you
 * can go and do, while this one named *Fix up the house*, which is a
 * category. A slot whose whole job is "what am I on" should bottom out
 * in something actionable, and for a stage read from Base it can:
 * `recommendation` over that home already picks the next step, skipping
 * what is blocked, and it is the same engine the Suggested section runs.
 *
 * When there is nothing to name — a declared stage, a money stage, or a
 * house stage with no open jobs — it falls back to the stage, which is
 * what it always said. Absent, never invented.
 */
function ArcSlot({ arc }: { readonly arc: CampaignStanding & { next: StageStanding } }) {
  const stage = arc.next.stage
  const work = STAGE_WORK[stage.requirement.kind]
  const suggestion = useRecommendation(work)

  /*
   * **The job's name leads, because the step alone says nothing.**
   * Reported: *"it just says find the right person, but that literally
   * applies to all the jobs."* It does — `HIRED_JOB_STEPS` opens every
   * house job with the same three, so *Find the right person* is the
   * next step of the porch roof, the boiler and the leaking tap
   * identically, and naming it without the job is naming nothing.
   *
   * The job first and the step after, so that a truncated line keeps the
   * half that distinguishes it: a clipped "Fix the porch roof · Find
   * the…" is still useful, where "Find the right person · Fix the…" is
   * the wrong way round.
   */
  const step =
    suggestion.data?.actionDescription === undefined
      ? undefined
      : suggestion.data.projectName === undefined
        ? suggestion.data.actionDescription
        : `${suggestion.data.projectName} · ${suggestion.data.actionDescription}`

  const Icon = KIND_ICON.main

  return (
    <Card>
      <div className="flex items-start gap-2">
        <Icon size={16} className="text-accent-400 mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-ink-50 truncate font-semibold">{arc.campaign.name}</p>
            {/*
              **Badged _Main_, and this reverses a deliberate call.** It
              read *Arc*, on the reasoning that a campaign is a readout
              rather than a quest — nothing to activate, nothing to
              close, and it pays no XP. All still true, and none of it
              was the question: the card sits in the main quest slot,
              under a heading saying "one main quest, one side quest", so
              refusing to call it the main one left the screen declining
              to name what it was plainly showing.

              What keeps it honest is everything around the badge — the
              line below says *Arc*, there is no stand-down button
              because there is nothing to stand down, and the link goes
              where stages are actually worked.
            */}
            <Badge tone="accent">{QUEST_KIND_LABELS.main}</Badge>
          </div>

          {/*
            The concrete step where there is one, and the stage itself
            where there is not. Either way this line answers the same
            question the side quest's does.
          */}
          <p className="text-ink-500 mt-0.5 truncate text-xs">Next: {step ?? stage.name}</p>

          {/*
            The stage is named here when the line above did not, so the
            card never stops saying which stage it is on — and the
            position is `nextPosition`, the index of the stage named,
            rather than a count of what is finished. `done + 1` said
            "stage 2 of 6" under the words "Fix up the house", which is
            stage one.
          */}
          <p className="text-ink-600 mt-0.5 truncate text-xs">
            Arc{step === undefined ? '' : ` · ${stage.name}`} · stage{' '}
            {arc.nextPosition ?? arc.total} of {arc.total}
          </p>

          <Link to="/quests" className="text-ink-500 hover:text-ink-300 mt-2 block text-xs">
            Open the arc →
          </Link>
        </div>
      </div>
    </Card>
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
      return <ArcSlot arc={{ ...arc, next: arc.next }} />
    }

    return (
      <Card>
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-ink-600 shrink-0" aria-hidden />
          <span className="text-ink-500 text-sm">
            No {QUEST_KIND_LABELS[kind].toLowerCase()} quest active.
          </span>
        </div>
        <p className="text-ink-600 mt-1 text-xs">
          Pick one from the board below to make it your {QUEST_KIND_LABELS[kind].toLowerCase()}{' '}
          quest.
        </p>
      </Card>
    )
  }

  const step = nextStep(quest)

  return (
    <Card>
      <div className="flex items-start gap-2">
        <Icon size={16} className="text-accent-400 mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-ink-50 truncate font-semibold">{quest.name}</p>
            <Badge tone={kind === 'main' ? 'accent' : 'neutral'}>{QUEST_KIND_LABELS[kind]}</Badge>
          </div>
          <p className="text-ink-500 mt-0.5 text-xs">
            {step === undefined ? 'No steps yet — add one below.' : `Next: ${step}`}
          </p>
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
    </Card>
  )
}

export function ActiveQuests({
  main,
  side,
  arc,
  showLink = false,
}: {
  readonly main: Project | undefined
  readonly side: Project | undefined
  /**
   * The arc, used only when no main quest is picked. An activated quest
   * wins: it is the thing you actually chose this week, where the arc is
   * the direction underneath it.
   */
  readonly arc?: CampaignStanding
  readonly showLink?: boolean
}) {
  return (
    <div className="space-y-2">
      <Slot kind="main" quest={main} {...(arc === undefined ? {} : { arc })} />
      <Slot kind="side" quest={side} />
      {showLink && (
        <Link to="/quests" className="text-ink-500 hover:text-ink-300 block text-xs">
          All quests →
        </Link>
      )}
    </div>
  )
}
