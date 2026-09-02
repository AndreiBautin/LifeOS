import type { Level } from '@/domain/game/character'

/**
 * The constants the character sheet reads, apart from the components
 * that render them.
 *
 * Split out because a file that exports both components and values
 * breaks fast refresh — the lint rule says so, and the reason is worth
 * knowing: React cannot hot-swap a module whose exports it cannot prove
 * are all components, so editing a colour would remount the screen.
 */

/**
 * The screens with no tab of their own, listed so they can be found.
 *
 * It exists because the area cards were the only way in and a silent
 * area renders no card: Job search had nothing to say until an
 * application existed, and the only route to the screen that creates one
 * was the card that could not appear until it did. A link makes no claim
 * about standing, so it can be shown where a card cannot.
 */
export const AREA_LINKS = [
  { to: '/limits', label: 'Limits' },
  { to: '/jobs', label: 'Job search' },
  { to: '/mind', label: 'Mind' },
  { to: '/houses', label: 'Houses' },
  { to: '/finance', label: 'Finance' },
  { to: '/resume', label: 'Resume' },
  { to: '/upgrades', label: 'Tech tree' },
] as const

/** The tone each rung of the strength ladder reads in. */
export const LEVEL_TONE: Partial<Record<Level, 'neutral' | 'accent' | 'good' | 'cool'>> = {
  Untrained: 'neutral',
  Novice: 'neutral',
  Intermediate: 'accent',
  Advanced: 'good',
  Elite: 'cool',
}

/*
 * **`AREA_ROUTES` was here and went with the area cards.** It mapped
 * each life area to the screen where that area is actually done, so a
 * card's heading could link to it. With the cards gone nothing asks the
 * question any more, and `AREA_LINKS` above is the surviving answer to
 * the one that still matters: how to reach a screen that has no tab.
 *
 * If area cards ever return, note what that map got right — it was
 * **partial on purpose**, because an area with no screen of its own is a
 * heading rather than a link that goes nowhere, and it lived here rather
 * than in the registry because `domain/game/` must not know a browser
 * exists.
 */
