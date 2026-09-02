import type { ReactNode } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Skeleton } from '@/components/shared/Skeleton'
import { SEASON_LABELS } from '@/domain/game/season'

import { useAvatar } from './hooks'

/**
 * The top of the hub, as a character sheet rather than a form.
 *
 * The report: *"simply rendering 'You' followed by a date underneath
 * feels very barebones and non-gamified."* It was accurate — a noun and
 * an ISO date is what a settings pane opens with, on the screen the app
 * opens to.
 *
 * **The heading is the screen's name again, and the claim stays in the
 * card.** It used to be a derived title — Devotee, Steward, Athlete,
 * whichever area had paid the most XP — dropped on the report *"I don't
 * really care too much about the level names."* What is under it is the
 * half that was a measurement rather than a word: the card still reads
 * "83% of your XP is dailies", which is what that heading was standing
 * in for.
 *
 * It says **You** because that is what the tab says. A page title is the
 * largest thing on the screen and every other one in the app names the
 * screen; this was the only heading that named the reader, and getting
 * it wrong therefore looked like the app asserting an identity.
 *
 * **No second ring, and no second XP figure.** The portrait is the
 * largest thing on the screen and the ring on it *is* the XP bar, so a
 * compact copy in `leading` would draw one quantity twice within 200
 * pixels. The progress into the level went the same way: it was in this
 * subtitle for one commit, directly above a card already stating "75 /
 * 900 XP into the level", which is the duplication this component
 * exists to reduce rather than add to. The level is named in words
 * here; with the ring's own badge that is the two copies this screen
 * already accepted when the level lived in a section heading.
 *
 */
export function CharacterHeader({
  today,
  action,
}: {
  readonly today: string
  readonly action?: ReactNode
}) {
  const avatar = useAvatar()

  if (avatar.data === undefined) {
    return (
      <PageHeader
        title="You"
        subtitle={<Skeleton className="h-3 w-40" />}
        {...(action === undefined ? {} : { action })}
      />
    )
  }

  const { level, season } = avatar.data

  return (
    <PageHeader
      title="You"
      subtitle={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span>
            Level <span className="numeric">{level}</span>
          </span>
          <span className="text-ink-700">·</span>
          <span>{SEASON_LABELS[season]}</span>
          <span className="text-ink-700">·</span>
          <span className="numeric text-ink-700">{today}</span>
        </span>
      }
      {...(action === undefined ? {} : { action })}
    />
  )
}
