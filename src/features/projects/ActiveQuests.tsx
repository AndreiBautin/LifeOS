import { Swords, Sparkle, X } from 'lucide-react'
import { Link } from 'react-router-dom'

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

function Slot({ kind, quest }: { readonly kind: QuestKind; readonly quest: Project | undefined }) {
  const setActive = useSetActiveQuest()
  const Icon = KIND_ICON[kind]

  if (quest === undefined) {
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
  showLink = false,
}: {
  readonly main: Project | undefined
  readonly side: Project | undefined
  readonly showLink?: boolean
}) {
  return (
    <div className="space-y-2">
      <Slot kind="main" quest={main} />
      <Slot kind="side" quest={side} />
      {showLink && (
        <Link to="/quests" className="text-ink-500 hover:text-ink-300 block text-xs">
          All quests →
        </Link>
      )}
    </div>
  )
}
