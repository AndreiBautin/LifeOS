import { Swords, Sparkle, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { CampaignStanding } from '@/domain/campaign/campaign'
import type { Project } from '@/domain/projects/project'
import { QUEST_KIND_LABELS, type QuestKind } from '@/domain/projects/project'
import { Badge, Button, Card } from '@/components/shared/primitives'

import { useSetActiveQuest } from './hooks'

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
      return (
        <Card>
          <div className="flex items-start gap-2">
            <Icon size={16} className="text-accent-400 mt-0.5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              {/*
                **The arc is the headline and the stage is the next
                step**, which is the way round every other slot on this
                screen already reads — and it was inverted here.
                Reported: *"there should be some sort of designation to
                say this is the main quest, and then under it the next
                thing, in our case the specific job."*

                Exactly right, and the old shape said the opposite: it
                led with *Fix up the house* and put *Move out of GVR* a
                size smaller underneath, so the thing you are working
                towards read as a footnote to one of its own stages.
                A quest slot names the quest and says "Next: …"; an arc
                is the quest here, so it does the same.
              */}
              <div className="flex items-center gap-2">
                <p className="text-ink-50 truncate font-semibold">{arc.campaign.name}</p>
                {/*
                  **Badged _Main_, and this reverses a deliberate call.**
                  It read *Arc*, on the reasoning that a campaign is a
                  readout rather than a quest — nothing to activate,
                  nothing to close, and it pays no XP. All of that is
                  still true and none of it was the question being
                  answered: the card sits in the main quest slot, under a
                  heading that says "one main quest, one side quest", so
                  refusing to call it the main one left the screen
                  declining to name what it was plainly showing.

                  What keeps it honest is everything around the badge —
                  the subtitle says *Arc*, there is no stand-down button
                  because there is nothing to stand down, and the link
                  goes to where stages are actually worked.
                */}
                <Badge tone="accent">{QUEST_KIND_LABELS.main}</Badge>
              </div>
              <p className="text-ink-500 mt-0.5 truncate text-xs">Next: {arc.next.stage.name}</p>
              {/*
                The **position of the stage named above**, not a count of
                what is finished. It read `done + 1` and so said "stage 2
                of 6" under the words "Next: Fix up the house", which is
                stage one — the arc is ordered but not gated, so ticking
                anything further down moved the count while the first
                outstanding stage stayed put.
              */}
              <p className="text-ink-600 mt-0.5 truncate text-xs">
                Arc · stage {arc.nextPosition ?? arc.total} of {arc.total}
              </p>
              <Link to="/quests" className="text-ink-500 hover:text-ink-300 mt-2 block text-xs">
                Open the arc →
              </Link>
            </div>
          </div>
        </Card>
      )
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
